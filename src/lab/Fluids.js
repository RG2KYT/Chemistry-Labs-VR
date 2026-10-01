import * as THREE from 'three';
import { Mixture } from '../chem/Mixture.js';
import { depositSolid } from './SolidPiece.js';

const RINGS = 44;
const SIDES = 8;
const STEP_T = 0.022;
const G = new THREE.Vector3(0, -9.81, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();

function streamGeometry() {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(RINGS * SIDES * 3);
  const uv = new Float32Array(RINGS * SIDES * 2);
  const idx = [];
  for (let i = 0; i < RINGS - 1; i++) {
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j;
      const b = i * SIDES + ((j + 1) % SIDES);
      const c = (i + 1) * SIDES + j;
      const d = (i + 1) * SIDES + ((j + 1) % SIDES);
      idx.push(a, c, b, b, c, d);
    }
  }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SIDES; j++) {
    uv[(i * SIDES + j) * 2] = j / SIDES;
    uv[(i * SIDES + j) * 2 + 1] = i / RINGS;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Pour streams (ballistic arcs that land in containers or splash on surfaces), puddles,
 * and corrosive contact (acid dissolving whatever it lands on).
 */
export class Fluids {
  constructor(app) {
    this.app = app;
    this.streams = new Set();
    this.puddles = [];
    this.puddleGeo = new THREE.CircleGeometry(1, 40);
  }

  /** Feed a stream (created on first call). Returns the stream handle. */
  pour(source, stream, origin, vel, mixture, rate, granular = false) {
    if (!stream || stream.dead) {
      stream = {
        source, origin: new THREE.Vector3(), vel: new THREE.Vector3(), rate: 0, buffer: new Mixture(), granular,
        active: true, tail: 0, mesh: null, sound: null, hit: null, lastColor: null, dissolveT: 0, dead: false,
      };
      if (!granular) {
        const mat = new THREE.MeshPhysicalMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.55, roughness: 0.05, clearcoat: 0.5, depthWrite: false, envMapIntensity: 1.3 });
        stream.mesh = new THREE.Mesh(streamGeometry(), mat);
        stream.mesh.frustumCulled = false;
        stream.mesh.renderOrder = 3;
        stream.mesh.userData.noPick = true;
        this.app.scene.add(stream.mesh);
      }
      if (this.app.audio?.ctx) stream.sound = this.app.audio.loop('pour', { position: origin, volume: 0 });
      this.streams.add(stream);
    }
    stream.active = true;
    stream.tail = 0;
    stream.origin.copy(origin);
    stream.vel.copy(vel);
    stream.rate = rate;
    stream.buffer.addMixture(mixture);
    return stream;
  }

  stop(stream) {
    if (stream) stream.active = false;
  }

  /** Trace the arc. Returns { points, hit } where hit = { kind, target, point, normal }. */
  trace(stream) {
    const pts = [stream.origin.clone()];
    const containers = this.app.entities.filter((e) => e.isContainer && e !== stream.source && !e.removed && !e.disabled);
    const funnels = this.app.entities.filter((e) => e.isFunnel && e !== stream.source && !e.removed && !e.disabled);
    const excludeBody = stream.source && stream.source.body ? stream.source.body : null;
    const P = this.app.physics;
    let hit = null;
    for (let i = 1; i < RINGS; i++) {
      const t = i * STEP_T;
      const p = stream.origin.clone().addScaledVector(stream.vel, t).addScaledVector(G, 0.5 * t * t);
      const prev = pts[pts.length - 1];
      // Container / funnel openings
      let best = null;
      for (const c of containers.concat(funnels)) {
        const rim = c.isFunnel ? c.opening() : c.rim();
        if (rim.normal.y < 0.3) continue;
        const s0 = _a.copy(prev).sub(rim.center).dot(rim.normal);
        const s1 = _b.copy(p).sub(rim.center).dot(rim.normal);
        if (s0 > 0 && s1 <= 0) {
          const f = s0 / (s0 - s1);
          const x = prev.clone().lerp(p, f);
          if (x.distanceTo(rim.center) < rim.radius * 0.97 && (!best || f < best.f)) {
            best = { f, kind: c.isFunnel ? 'funnel' : 'container', target: c, point: x, normal: rim.normal.clone() };
          }
        }
      }
      // Physics surfaces
      _d.copy(p).sub(prev);
      const len = _d.length();
      if (len > 1e-6) {
        const r = P.raycast(prev, _d.clone().divideScalar(len), len, excludeBody, (col) => {
          const o = P.ownerOf(col);
          return !(o && o.kind === 'molecule');
        });
        if (r && (!best || r.toi / len < best.f - 1e-4)) {
          const owner = r.owner && r.owner !== 'static' ? r.owner : null;
          const point = new THREE.Vector3(r.point.x, r.point.y, r.point.z);
          best = { f: r.toi / len, kind: owner && owner.kind !== 'static' && owner.kind !== 'room' ? 'entity' : 'surface', target: owner, point, normal: new THREE.Vector3(r.normal.x, r.normal.y, r.normal.z) };
          // Landing on the (solid) collider cap of an open vessel = landing in its opening.
          if (owner && owner.isContainer && owner !== stream.source) {
            const rim = owner.rim();
            const along = point.clone().sub(rim.center);
            const h = along.dot(rim.normal);
            const radial = along.addScaledVector(rim.normal, -h).length();
            if (rim.normal.y > 0.3 && Math.abs(h) < 0.015 && radial < rim.radius) best.kind = 'container';
          }
        }
      }
      if (best) {
        pts.push(best.point);
        hit = best;
        break;
      }
      pts.push(p);
      if (p.y < -0.5) break;
    }
    return { points: pts, hit };
  }

  update(dt) {
    for (const s of [...this.streams]) {
      if (!s.active) {
        s.tail += dt;
        if (s.tail > 0.25 || s.buffer.total < 0.01) {
          this.disposeStream(s);
          continue;
        }
      }
      const { points, hit } = this.trace(s);
      s.hit = hit;
      // Deliver what is in flight to the target.
      const portion = s.buffer;
      s.buffer = new Mixture();
      if (hit) this.deliver(s, hit, portion, dt);
      else this.splash(points[points.length - 1], portion, null, s.granular);
      // Visuals
      const look = s.granular ? null : portion.liquidLook() || s.lastColor;
      if (look) s.lastColor = look;
      if (s.mesh) this.updateTube(s, points, look, dt);
      else this.emitGrains(s, points, portion, dt);
      if (s.sound) {
        s.sound.setVolume(s.active ? Math.min(0.5, 0.05 + Math.sqrt(s.rate) / 40) : 0);
        s.sound.setPosition(points[points.length - 1]);
      }
      // Splash droplets at the impact point
      if (hit && hit.kind !== 'container' && Math.random() < dt * 30 && look) {
        const c = new THREE.Color().setRGB(look.color[0], look.color[1], look.color[2], THREE.SRGBColorSpace);
        const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6);
        this.app.effects.droplet(hit.point.clone().add(new THREE.Vector3(0, 0.005, 0)), v, c, 0.003, 0.6);
      } else if (hit && hit.kind === 'container' && Math.random() < dt * 20 && look) {
        this.app.effects.bubble(hit.point.clone(), 0xffffff, 0.003, 0.05, 0.3);
      }
    }
    // Puddles evaporate
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      // Puddles dry slowly (a spill of water lasts minutes, as in a real lab)
      p.volume -= dt * (p.corrosive ? 0.25 : 0.04) * Math.max(1, p.volume * 0.02);
      if (p.corrosive && Math.random() < dt * 6) this.app.effects.smoke(p.mesh.position.clone(), 0xd8f0c0, 0.18, 0.02, 0.08);
      if (p.volume <= 0) {
        p.mesh.removeFromParent();
        p.mesh.material.dispose();
        if (p.etch) { p.etch.removeFromParent(); p.etch.material.dispose(); }
        if (p.sound) p.sound.stop();
        this.puddles.splice(i, 1);
        continue;
      }
      const r = Math.min(0.35, 0.015 + Math.sqrt(p.volume) * 0.011);
      p.mesh.scale.setScalar(r);
      p.mesh.material.opacity = Math.min(p.baseOpacity, 0.15 + p.volume / 40);
      if (p.etch) p.etch.material.opacity = Math.min(0.6, p.volume / 30);
      if (p.sound) p.sound.setVolume(Math.min(0.3, p.volume / 60));
    }
  }

  deliver(s, hit, portion, dt) {
    if (portion.total <= 0 && portion.gasVolume <= 0) return;
    if (hit.kind === 'container') {
      hit.target.receive(portion);
      return;
    }
    if (hit.kind === 'funnel') {
      hit.target.passThrough(portion);
      return;
    }
    // Grains pile up where they land; liquid poured on a solid piece wets it (and may react).
    if (portion.solidVolume > 0) depositSolid(this.app, hit.point, portion.takeSolid(portion.solidVolume));
    if (hit.target && hit.target.isSolidPiece && portion.liquidVolume > 0) {
      hit.target.receiveLiquid(portion.takeLiquid(portion.liquidVolume * 0.6));
    }
    // Acid eats whatever it lands on (and the thing reforms a few seconds later).
    if (portion.isCorrosive && hit.target && hit.target.dissolvable && hit.target !== s.source) {
      this.app.dissolver.dissolve(hit.target, hit.point);
    }
    if (hit.kind === 'surface' || (hit.normal && hit.normal.y > 0.6)) {
      this.addPuddle(hit.point, hit.normal, portion);
    }
  }

  /** Spill a mixture at a point (broken glass, stream landing on nothing in particular). */
  splash(point, mixture, normal, granular = false) {
    if (!mixture || mixture.total <= 0) return;
    const look = granular ? null : mixture.liquidLook();
    const floorY = this.app.effects.floorBelow(point);
    const color = look ? new THREE.Color().setRGB(look.color[0], look.color[1], look.color[2], THREE.SRGBColorSpace) : new THREE.Color(mixture.dominant('solid')?.color || '#ffffff');
    for (let i = 0; i < Math.min(30, 6 + mixture.total * 0.3); i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2);
      this.app.effects.droplet(point.clone(), v, color, 0.003 + Math.random() * 0.004, 1);
    }
    const p = point.clone();
    p.y = floorY;
    if (mixture.solidVolume > 0) depositSolid(this.app, p, mixture.takeSolid(mixture.solidVolume));
    if (!granular) this.addPuddle(p, new THREE.Vector3(0, 1, 0), mixture);
  }

  addPuddle(point, normal, mixture) {
    const lv = mixture.liquidVolume;
    if (lv <= 0.01) return;
    let p = this.puddles.find((x) => x.mesh.position.distanceTo(point) < Math.max(0.06, x.mesh.scale.x * 0.8));
    const look = mixture.liquidLook();
    const corrosive = mixture.isCorrosive;
    if (!p) {
      if (this.puddles.length > 24) {
        const old = this.puddles.shift();
        old.mesh.removeFromParent();
        if (old.etch) old.etch.removeFromParent();
        if (old.sound) old.sound.stop();
      }
      const mat = new THREE.MeshPhysicalMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.4, roughness: 0.02, clearcoat: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(this.puddleGeo, mat);
      mesh.position.copy(point).addScaledVector(normal || new THREE.Vector3(0, 1, 0), 0.0015);
      mesh.lookAt(mesh.position.clone().add(normal || new THREE.Vector3(0, 1, 0)));
      mesh.renderOrder = 2;
      mesh.userData.noPick = true;
      this.app.scene.add(mesh);
      p = { mesh, volume: 0, corrosive: false, baseOpacity: 0.6, etch: null, sound: null };
      this.puddles.push(p);
    }
    p.volume += lv;
    if (look) {
      p.mesh.material.color.setRGB(look.color[0], look.color[1], look.color[2], THREE.SRGBColorSpace);
      p.baseOpacity = Math.min(0.9, look.opacity + 0.25);
    }
    if (corrosive && !p.corrosive) {
      p.corrosive = true;
      // Scorch / etch mark under the acid
      const etch = new THREE.Mesh(this.puddleGeo, new THREE.MeshBasicMaterial({ color: 0x2a2416, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
      etch.position.copy(p.mesh.position).addScaledVector(normal || new THREE.Vector3(0, 1, 0), -0.0005);
      etch.quaternion.copy(p.mesh.quaternion);
      etch.scale.setScalar(0.05);
      etch.userData.noPick = true;
      this.app.scene.add(etch);
      p.etch = etch;
      if (this.app.audio?.ctx) p.sound = this.app.audio.loop('sizzle', { position: p.mesh.position, volume: 0.2 });
    }
    if (p.etch) p.etch.scale.setScalar(Math.min(0.3, 0.02 + Math.sqrt(p.volume) * 0.012));
  }

  updateTube(s, points, look, dt) {
    const g = s.mesh.geometry;
    const pos = g.attributes.position;
    const n = points.length;
    const r0 = THREE.MathUtils.clamp(Math.sqrt(Math.max(1, s.rate) / 900) * 0.011, 0.0012, 0.008) * (s.active ? 1 : Math.max(0.1, 1 - s.tail * 4));
    const v0 = Math.max(0.2, s.vel.length());
    const tangent = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const binormal = new THREE.Vector3();
    const ref = new THREE.Vector3(1, 0, 0);
    s.phase = (s.phase || 0) + dt * 25;
    for (let i = 0; i < RINGS; i++) {
      const k = Math.min(i, n - 1);
      const p = points[k];
      if (k < n - 1) tangent.copy(points[k + 1]).sub(p).normalize();
      else if (k > 0) tangent.copy(p).sub(points[k - 1]).normalize();
      if (Math.abs(tangent.dot(ref)) > 0.9) ref.set(0, 0, 1);
      normal.crossVectors(tangent, ref).normalize();
      binormal.crossVectors(tangent, normal).normalize();
      const speed = v0 + 9.81 * STEP_T * k;
      let r = r0 * Math.sqrt(v0 / speed);
      if (i >= n) r = 0;
      const wobble = 1 + Math.sin(s.phase + i * 1.7) * 0.12;
      for (let j = 0; j < SIDES; j++) {
        const a = (j / SIDES) * Math.PI * 2;
        const cx = Math.cos(a) * r * wobble, cy = Math.sin(a) * r * wobble;
        pos.setXYZ(i * SIDES + j, p.x + normal.x * cx + binormal.x * cy, p.y + normal.y * cx + binormal.y * cy, p.z + normal.z * cx + binormal.z * cy);
      }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    if (look) {
      s.mesh.material.color.setRGB(look.color[0], look.color[1], look.color[2], THREE.SRGBColorSpace);
      s.mesh.material.opacity = Math.min(0.95, look.opacity + 0.3);
      s.mesh.material.metalness = look.metalness || 0;
    }
  }

  emitGrains(s, points, portion, dt) {
    if (!s.active) return;
    const solid = portion.dominant('solid');
    const color = solid ? solid.color : '#ffffff';
    const n = Math.min(8, Math.ceil(s.rate * dt * 2));
    for (let i = 0; i < n; i++) {
      const v = s.vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08));
      this.app.effects.hard.emit(s.origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.01, 0, (Math.random() - 0.5) * 0.01)), v, color, 1, 0.003 + Math.random() * 0.002, 0.45, { gravity: 9.81, floorY: s.hit ? s.hit.point.y : -10 });
    }
  }

  disposeStream(s) {
    s.dead = true;
    if (s.mesh) {
      s.mesh.removeFromParent();
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    }
    if (s.sound) s.sound.stop();
    this.streams.delete(s);
  }

  clear() {
    for (const s of [...this.streams]) this.disposeStream(s);
    for (const p of this.puddles) {
      p.mesh.removeFromParent();
      if (p.etch) p.etch.removeFromParent();
      if (p.sound) p.sound.stop();
    }
    this.puddles.length = 0;
  }
}
