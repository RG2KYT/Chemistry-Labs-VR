// A piece of solid matter lying around on its own: an ingot of iron, an ice cube, a salt
// crystal, a lump of sulfur, a heap of powder. Solids do not need a container.
//
// A piece is a real physics object with the shape of its substance's crystal habit. It
// warms up or cools down like everything else, melts (the liquid drips off into a puddle),
// sublimes (dry ice fogs away), reacts with liquids poured on it, and drops into a
// container you put it in (it then becomes part of the contents).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Equipment } from './Equipment.js';
import { Mixture } from '../chem/Mixture.js';
import { react } from '../chem/reactions.js';
import { SUBSTANCES } from '../chem/substances.js';
import { glowFor } from '../chem/phases.js';
import { grainMap, grainBump } from './grain.js';
import { font, roundRect } from '../ui/canvasUtil.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const MAX_PIECES = 40;

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Smooth-ish 3D value noise, deterministic per position (keeps shared vertices together). */
function noise3(x, y, z) {
  const h = (a, b, c) => {
    let n = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    r += h(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}

function displace(geo, amount, freq, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const n = noise3(_v.x * freq + seed, _v.y * freq + seed * 1.7, _v.z * freq - seed) - 0.5;
    _v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const clean = (g) => {
  // mergeGeometries needs identical attribute sets
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  return out;
};

const place = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
  _q.setFromEuler(new THREE.Euler(rx, ry, rz));
  return g.applyMatrix4(_m.compose(new THREE.Vector3(x, y, z), _q, _s.set(sx, sy, sz)));
};

/** Shape for a substance's crystal habit, sized to `volume` mL, resting on y = 0. */
export function pieceGeometry(form, volume, seed = 1, metal = false) {
  const V = Math.max(0.02, volume) * 1e-6; // m³
  const a = Math.cbrt(V);
  const r = rng(seed);
  let g;
  switch (form) {
    case 'metal': {
      // A cast ingot: wider at the bottom, slightly domed top.
      const L = a * 1.9, W = a * 0.95, H = a * 0.62;
      g = new RoundedBoxGeometry(L, H, W, 2, Math.min(H, W) * 0.12);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const k = 1 - 0.14 * ((y + H / 2) / H);
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
      }
      g.translate(0, H / 2, 0);
      g.computeVertexNormals();
      break;
    }
    case 'ice': {
      const e = a * 1.0;
      g = new RoundedBoxGeometry(e, e * 0.92, e, 3, e * 0.12);
      displace(g, 0.04, 40, seed);
      g.translate(0, e * 0.46, 0);
      break;
    }
    case 'waxy': {
      const e = a * 1.05;
      g = new RoundedBoxGeometry(e * 1.3, e * 0.65, e, 3, e * 0.18);
      displace(g, 0.05, 25, seed);
      g.translate(0, e * 0.33, 0);
      break;
    }
    case 'cubic': {
      // Intergrown cubes (halite, fluorite, pyrite …)
      const e = a * 0.78;
      const parts = [clean(place(new THREE.BoxGeometry(e, e, e), 0, e / 2, 0, 0, r() * 0.6, 0))];
      for (let i = 0; i < 3; i++) {
        const f = 0.35 + r() * 0.3;
        const ang = r() * Math.PI * 2;
        parts.push(clean(place(new THREE.BoxGeometry(e * f, e * f, e * f), Math.cos(ang) * e * 0.5, e * f * 0.5 + r() * e * 0.25, Math.sin(ang) * e * 0.5, 0, r(), 0)));
      }
      g = mergeGeometries(parts);
      break;
    }
    case 'crystals': {
      // A druse of prismatic crystals with pointed tips growing from a common base.
      const n = 5 + Math.floor(r() * 3);
      const rad = a * 0.2, len = a * 1.15;
      const parts = [];
      for (let i = 0; i < n; i++) {
        const f = 0.55 + r() * 0.6;
        const prism = new THREE.CylinderGeometry(rad * f, rad * f, len * f, 6, 1);
        prism.translate(0, len * f / 2, 0);
        const tip = new THREE.ConeGeometry(rad * f, rad * f * 1.6, 6, 1);
        tip.translate(0, len * f + rad * f * 0.8, 0);
        const one = mergeGeometries([clean(prism), clean(tip)]);
        const tilt = i === 0 ? 0 : 0.35 + r() * 0.55;
        const dir = r() * Math.PI * 2;
        place(one, Math.cos(dir) * rad * 0.8, 0, Math.sin(dir) * rad * 0.8, Math.sin(dir) * tilt, r() * 3, -Math.cos(dir) * tilt);
        parts.push(one);
      }
      parts.push(clean(place(displace(new THREE.IcosahedronGeometry(1, 1), 0.3, 3, seed), 0, rad * 0.6, 0, 0, 0, 0, rad * 2.4, rad * 1.1, rad * 2.4)));
      g = mergeGeometries(parts);
      break;
    }
    case 'needles': {
      const n = 14;
      const len = a * 1.5, rad = a * 0.045;
      const parts = [];
      for (let i = 0; i < n; i++) {
        const nd = new THREE.CylinderGeometry(rad * 0.4, rad, len * (0.6 + r() * 0.5), 5, 1);
        nd.translate(0, len * 0.5, 0);
        const tilt = r() * 1.1;
        const dir = r() * Math.PI * 2;
        parts.push(clean(place(nd, 0, 0, 0, Math.sin(dir) * tilt, 0, -Math.cos(dir) * tilt)));
      }
      g = mergeGeometries(parts);
      g.translate(0, a * 0.05, 0);
      break;
    }
    case 'flakes': {
      const n = 6;
      const w = a * 1.35, t = a * 0.09;
      const parts = [];
      for (let i = 0; i < n; i++) {
        const f = 1 - i * 0.08;
        parts.push(clean(place(new THREE.BoxGeometry(w * f, t, w * 0.8 * f), (r() - 0.5) * a * 0.15, t * (i + 0.5) * 1.05, (r() - 0.5) * a * 0.15, (r() - 0.5) * 0.12, r() * 0.5, (r() - 0.5) * 0.12)));
      }
      g = mergeGeometries(parts);
      break;
    }
    case 'pellets': {
      // A little heap of round pellets / granules.
      const R = Math.cbrt(V / 0.6);
      const n = 26;
      const pr = R * 0.22;
      const parts = [];
      for (let i = 0; i < n; i++) {
        const ring = Math.sqrt(r()) * R * 0.8;
        const ang = r() * Math.PI * 2;
        const y = (1 - ring / R) * R * 0.55 + pr * 0.4;
        parts.push(clean(place(new THREE.SphereGeometry(pr, 8, 6), Math.cos(ang) * ring, y, Math.sin(ang) * ring, r(), r(), 0, 1, 0.6, 1)));
      }
      g = mergeGeometries(parts);
      break;
    }
    case 'glassy': {
      g = displace(new THREE.IcosahedronGeometry(a * 0.62, 3), 0.25, 1.8 / a, seed);
      g.scale(1.15, 0.75, 1);
      g.computeBoundingBox();
      g.translate(0, -g.boundingBox.min.y, 0);
      break;
    }
    case 'chunk': {
      g = displace(new THREE.IcosahedronGeometry(a * 0.64, 2), 0.45, 2.5 / a, seed);
      g.scale(1.2, 0.8, 1);
      g.computeBoundingBox();
      g.translate(0, -g.boundingBox.min.y, 0);
      break;
    }
    default: {
      // Powder: a heap at its angle of repose (~35°) with a grainy, uneven surface.
      const R = Math.cbrt(V / 0.733);
      const H = R * 0.7;
      const rings = 9, segs = 30;
      const pos = [];
      const idx = [];
      const uv = [];
      pos.push(0, H * (1 + (r() - 0.5) * 0.1), 0);
      uv.push(0.5, 0.5);
      for (let i = 1; i <= rings; i++) {
        const t = i / rings;
        for (let j = 0; j < segs; j++) {
          const th = (j / segs) * Math.PI * 2;
          const wob = 1 + (noise3(Math.cos(th) * 2 + seed, Math.sin(th) * 2, t * 3) - 0.5) * 0.25;
          const rr = R * t * wob;
          const y = i === rings ? 0 : H * Math.pow(1 - t, 1.15) * (1 + (noise3(Math.cos(th) * 5, Math.sin(th) * 5 + seed, t * 6) - 0.5) * 0.35);
          pos.push(Math.cos(th) * rr, y, Math.sin(th) * rr);
          uv.push(0.5 + Math.cos(th) * t * 0.5, 0.5 + Math.sin(th) * t * 0.5);
        }
      }
      for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
      for (let i = 1; i < rings; i++) {
        for (let j = 0; j < segs; j++) {
          const a0 = 1 + (i - 1) * segs + j, a1 = 1 + (i - 1) * segs + ((j + 1) % segs);
          const b0 = 1 + i * segs + j, b1 = 1 + i * segs + ((j + 1) % segs);
          idx.push(a0, a1, b0, a1, b1, b0);
        }
      }
      // Flat bottom
      const c = pos.length / 3;
      pos.push(0, 0, 0);
      uv.push(0.5, 0.5);
      const last = 1 + (rings - 1) * segs;
      for (let j = 0; j < segs; j++) idx.push(c, last + j, last + ((j + 1) % segs));
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      break;
    }
  }
  void metal;
  return g;
}

/** Which shape a substance takes when it is a free-standing piece. */
export function pieceForm(s) {
  if (!s) return 'powder';
  if (s.cubic) return 'cubic';
  if (s.form === 'metal') return 'metal';
  return ['ice', 'cubic', 'crystals', 'needles', 'flakes', 'pellets', 'glassy', 'chunk', 'waxy'].includes(s.form) ? s.form : 'powder';
}

// ---------------------------------------------------------------------------------------

export class SolidPiece extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'wood', mass: 0.05, breakable: false });
    this.isSolidPiece = true;
    this.breakable = false;
    this.dissolvable = false; // acids react with it chemically instead
    this.kind = 'equipment';
    this.contents = new Mixture();
    this.seed = 1 + Math.floor(Math.random() * 1e6);
    this.builtVolume = 0;
    this.mesh = null;
    this.labelT = 0;
    this.absorbT = 0;
    this.heatRate = 0;
    this.flameContact = false;
    this.buildTag();
    this.contents.add('nacl', 1); // placeholder until setSubstance()
    this.rebuild(false);
  }

  get substance() {
    return this.contents.dominant('solid') || SUBSTANCES.nacl;
  }

  /** Make this piece `volume` mL of substance `id` at temperature `T`. */
  setSubstance(id, volume, T = 22) {
    this.contents.clear();
    this.contents.add(id, volume);
    this.contents.temperature = T;
    this.rebuild();
    this.labelT = 3;
  }

  /** Grow a heap (more powder landing on it). */
  addSolid(mix) {
    const T0 = this.contents.temperature;
    this.contents.addMixture(mix);
    if (!Number.isFinite(this.contents.temperature)) this.contents.temperature = T0;
    if (this.contents.solidVolume > this.builtVolume * 1.25 && !this.isHeld) this.rebuild();
    this.labelT = 2;
  }

  // Container-like API so burners, hot plates, the freezer and matches can heat it.
  get rimR() { return Math.max(0.01, (this.localBounds.max.x - this.localBounds.min.x) / 2); }
  get bottomY() { return this.localBounds.min.y; }
  get rimY() { return this.localBounds.max.y; }
  rim(out = {}) {
    this.object.updateWorldMatrix(true, false);
    out.center = (out.center || new THREE.Vector3()).set(0, this.rimY, 0).applyMatrix4(this.object.matrixWorld);
    out.normal = (out.normal || new THREE.Vector3()).set(0, 1, 0);
    out.radius = this.rimR;
    return out;
  }

  rebuild(recreateBody = true) {
    const s = this.substance;
    const V = Math.max(0.05, this.contents.solidVolume);
    const form = pieceForm(s);
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose();
    }
    for (const m of this.highlightMaterials) m.dispose();
    this.highlightMaterials = [];
    const geo = pieceGeometry(form, V, this.seed, (s.metalness || 0) > 0.5);
    const grainy = ['powder', 'pellets', 'chunk', 'flakes'].includes(form);
    const mat = new THREE.MeshPhysicalMaterial({
      color: s.color,
      metalness: s.metalness || 0,
      roughness: form === 'metal' ? Math.min(0.45, s.roughness ?? 0.3) : form === 'ice' ? 0.05 : grainy ? Math.max(0.7, s.roughness ?? 0.8) : Math.min(0.35, s.roughness ?? 0.3),
      clearcoat: ['crystals', 'cubic', 'ice', 'glassy', 'needles'].includes(form) ? 0.7 : 0,
      transparent: !!s.translucent || form === 'ice',
      opacity: form === 'ice' ? 0.78 : s.translucent ? 0.85 : 1,
      map: grainy ? grainMap() : null,
      bumpMap: grainy ? grainBump() : null,
      bumpScale: grainy ? 1.2 : 0,
      emissive: 0x000000,
    });
    if (mat.map) {
      // world-sized grains: about 2 mm
      const size = Math.cbrt(V * 1e-6);
      mat.map = mat.map.clone();
      mat.map.repeat.set(size * 60, size * 60);
      mat.map.needsUpdate = true;
    }
    this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.model.add(this.mesh);
    this.model.scale.setScalar(1);
    this.builtVolume = V;
    this.builtId = s.id;
    this.mass = Math.max(0.004, (V * (s.density || 1)) / 1000);
    const pts = geo.attributes.position.array;
    this.colliderSpecs = [{ type: 'hull', points: new Float32Array(pts), friction: form === 'ice' ? 0.15 : 0.8, restitution: 0.05 }];
    this.finalize();
    this.mat = this.mesh.material; // the per-instance copy made for hover highlighting
    if (V < 3) this.localBounds.expandByScalar(0.01); // small things are easier to grab
    this.name = s.name;
    if (recreateBody && this.body) {
      const t = this.body.translation(), q = this.body.rotation(), lv = this.body.linvel(), av = this.body.angvel();
      this.createBody(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion(q.x, q.y, q.z, q.w));
      this.body.setLinvel(lv, true);
      this.body.setAngvel(av, true);
      if (this.isHeld) this.body.setBodyType(this.app.physics.R.RigidBodyType.KinematicPositionBased, true);
    }
  }

  /** Liquid poured onto the piece wets it and can react with it (acid on a metal …). */
  receiveLiquid(mix) {
    const T = this.contents.temperature;
    const m = this.contents.solidVolume;
    this.contents.addMixture(mix);
    // the solid stays at its own temperature until heat flows
    this.contents.temperature = (T * m + mix.temperature * mix.total * 0.3) / Math.max(1e-6, m + mix.total * 0.3);
    this.labelT = 2;
  }

  updateHeat() {
    let rate = 0, flame = false, env = null, coupling = 1;
    for (const src of this.app.heatSources) {
      if (src.removed || src === this) continue;
      const h = src.heatFor(this);
      if (!h) continue;
      rate += h.rate || 0;
      flame = flame || !!h.flame;
      if (h.env !== undefined) { env = env === null ? h.env : Math.min(env, h.env); coupling = Math.max(coupling, h.coupling || 1); }
    }
    this.heatRate = rate;
    this.flameContact = flame;
    this.envTemp = env;
    this.envCoupling = coupling;
  }

  update(dt) {
    super.update(dt);
    if (this.disabled) return;
    this.updateHeat();
    const c = this.contents;
    const events = react(c, dt, {
      heatRate: this.heatRate * 0.6,
      flame: this.flameContact,
      stirring: 0,
      envTemp: this.envTemp ?? undefined,
      // a solid lying in air exchanges heat more slowly than a liquid in glass
      envCoupling: (this.envCoupling || 1) * 0.6,
    });
    this.object.updateWorldMatrix(true, false);
    const center = this.worldBounds(new THREE.Box3()).getCenter(new THREE.Vector3());
    this.handleEvents(events, center, dt);

    // Melted liquid (or poured-on liquid) runs off into a puddle; vapour drifts away.
    const lv = c.liquidVolume;
    if (lv > 0.01) {
      const run = c.takeLiquid(Math.min(lv, 0.05 + lv * 0.7 * dt));
      if (Math.random() < dt * 12) {
        const look = run.liquidLook();
        if (look) this.app.effects.droplet(center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02)), new THREE.Vector3(0, -0.1, 0), new THREE.Color().setRGB(look.color[0], look.color[1], look.color[2], THREE.SRGBColorSpace), 0.003, 0.6);
      }
      this.dripBuffer = this.dripBuffer || new Mixture();
      this.dripBuffer.addMixture(run);
      if (this.dripBuffer.liquidVolume > 0.4 || c.solidVolume < 0.05) {
        const hit = this.app.physics.raycast(center, DOWN, 2, this.body, (col) => this.app.physics.ownerOf(col) !== this);
        const p = hit ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z) : center.clone().setY(this.app.effects.floorBelow(center));
        if (hit?.owner?.isContainer) hit.owner.receive(this.dripBuffer);
        else this.app.fluids.addPuddle(p, new THREE.Vector3(0, 1, 0), this.dripBuffer);
        this.dripBuffer = new Mixture();
      }
    }
    const gv = c.gasVolume;
    if (gv > 0.01) {
      const g = c.dominant('gas');
      const heavy = g && g.heavy;
      for (let i = 0; i < Math.min(4, gv * 0.3); i++) {
        const col = g && g.opacity > 0.1 ? new THREE.Color(g.color) : new THREE.Color(0xeef4fa);
        const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.03));
        this.app.effects.soft.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.04, heavy ? -0.04 : 0.06, (Math.random() - 0.5) * 0.04), col, Math.min(0.5, 0.12 + (g?.opacity || 0)), 0.015, 1.4, { drag: 1.2, grow: 0.03 });
      }
      for (const [id, ml, s] of [...c.entries()]) if (s.phase === 'gas') c.remove(id, ml);
    }

    // All gone?
    const sv = c.solidVolume;
    if (sv < 0.03) {
      if (this.dripBuffer && this.dripBuffer.liquidVolume > 0) this.app.fluids.addPuddle(center.clone().setY(this.app.effects.floorBelow(center)), new THREE.Vector3(0, 1, 0), this.dripBuffer);
      this.destroy();
      return;
    }
    // Shrink as it melts / dissolves; rebuild when the shape changed a lot.
    const s = this.substance;
    if (s.id !== this.builtId && !this.isHeld) this.rebuild();
    else {
      const k = Math.cbrt(sv / this.builtVolume);
      this.model.scale.setScalar(k);
      if ((k < 0.8 || k > 1.2) && !this.isHeld) this.rebuild();
    }
    this.updateLook();
    this.checkAbsorb(dt, center);
    this.updateTag(dt);
  }

  handleEvents(events, p, dt) {
    const fx = this.app.effects;
    for (const e of events) {
      if ((e.type === 'fizz' || e.type === 'dissolve') && Math.random() < dt * 30 * (e.intensity || 0.5)) fx.bubble(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.03, 0.01, (Math.random() - 0.5) * 0.03)), 0xffffff, 0.003, 0.05, 0.4);
      else if (e.type === 'smoke' && Math.random() < dt * 15) fx.smoke(p.clone(), e.color, 0.3, 0.02, 0.12);
      else if (e.type === 'sparks' && Math.random() < dt * 20) fx.spark(p.clone(), e.color, 3, 0.6);
      else if ((e.type === 'burning' || e.type === 'surfaceFlame') && Math.random() < dt * 40) fx.glow.emit(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.01, (Math.random() - 0.5) * 0.02)), new THREE.Vector3(0, 0.3, 0), e.color, 0.8, 0.02, 0.35, { grow: 0.02 });
      else if (e.type === 'flash') fx.flash(p.clone(), e.color, 0.25);
      else if (e.type === 'steam' && Math.random() < dt * 20) fx.steam(p.clone(), 1);
      else if (e.type === 'boil' && Math.random() < dt * 10) fx.steam(p.clone(), 0.6);
      else if (e.type === 'explode') {
        fx.flash(p, 0xffe0a0, 0.4);
        fx.spark(p, 0xffc070, 30, 2.5);
        this.app.audio?.play('bang', { position: p, volume: 1 });
        this.contents.clear();
      }
    }
  }

  updateLook() {
    const glow = glowFor(this.contents.temperature);
    if (glow) {
      this.mat.emissive.setRGB(glow.r, glow.g, glow.b);
      this.mat.emissiveIntensity = glow.intensity;
    } else if (this.substance.emissive) {
      this.mat.emissive.set(this.substance.emissive);
      this.mat.emissiveIntensity = this.substance.emissiveIntensity || 0.3;
    } else {
      this.mat.emissive.setHex(0);
    }
    // frost forms on very cold things
    const T = this.contents.temperature;
    if (this.substance.form !== 'ice' && T < -20 && !glow) this.mat.sheen = Math.min(1, (-20 - T) / 60);
  }

  /** Dropped into a container: it becomes part of the contents. */
  checkAbsorb(dt, center) {
    if (this.isHeld) { this.absorbT = 0; return; }
    let inside = null;
    for (const e of this.app.entities) {
      if (!e.isContainer || e.removed || e.disabled) continue;
      if (e.object.position.distanceToSquared(center) > 0.16) continue;
      if (e.pointInside(center)) { inside = e; break; }
    }
    if (!inside) { this.absorbT = 0; return; }
    this.absorbT += dt;
    if (this.absorbT < 0.25) return;
    const mix = this.contents.clone();
    this.app.audio?.play(this.substance.form === 'metal' ? 'clink' : 'drip', { position: center, volume: 0.5 });
    inside.receive(mix);
    inside.labelT = 3;
    this.destroy();
  }

  // ---- tag -----------------------------------------------------------------------------

  buildTag() {
    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 512;
    this.tagCanvas.height = 160;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(this.tagCanvas), transparent: true, depthWrite: false, toneMapped: false }));
    this.tag.material.map.colorSpace = THREE.SRGBColorSpace;
    this.tag.renderOrder = 6;
    this.tag.userData.noPick = true;
    this.tag.visible = false;
    this.app.scene.add(this.tag);
  }

  updateTag(dt) {
    this.labelT = Math.max(0, this.labelT - dt);
    const show = this.isHeld || this.highlighted || this.labelT > 0;
    this.tag.visible = show;
    if (!show) return;
    const s = this.substance;
    const g = this.contents.solidVolume * (s.density || 1);
    const key = `${s.name}|${g.toFixed(g < 10 ? 1 : 0)}|${Math.round(this.contents.temperature)}`;
    if (key !== this._tagKey) {
      this._tagKey = key;
      const ctx = this.tagCanvas.getContext('2d');
      const W = 512, H = 160;
      ctx.clearRect(0, 0, W, H);
      ctx.font = font(46, 800);
      const name = s.name;
      const detail = `${g >= 10 ? Math.round(g) : g.toFixed(1)} g  ·  ${Math.round(this.contents.temperature)} °C  ·  ${s.formula || ''}`;
      const w = Math.min(W - 8, Math.max(ctx.measureText(name).width, 300) + 60);
      roundRect(ctx, (W - w) / 2, 6, w, H - 12, 26);
      ctx.fillStyle = 'rgba(8,14,24,0.82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,122,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let size = 46;
      while (size > 24 && ctx.measureText(name).width > w - 30) { size -= 2; ctx.font = font(size, 800); }
      ctx.fillText(name, W / 2, 56);
      ctx.fillStyle = '#ffd27a';
      ctx.font = font(26, 600);
      ctx.fillText(detail, W / 2, 112);
      this.tag.material.map.needsUpdate = true;
      this.tag.scale.set(0.18, 0.18 * (H / W), 1);
    }
    const b = this.worldBounds(new THREE.Box3());
    this.tag.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.04, (b.min.z + b.max.z) / 2);
  }

  // ---- history -------------------------------------------------------------------------

  saveState() {
    return { seed: this.seed };
  }

  loadState(st) {
    this.seed = st.seed || this.seed;
    this.rebuild();
  }

  destroy() {
    this.tag.removeFromParent();
    this.tag.material.map.dispose();
    if (this.mesh) this.mesh.geometry.dispose();
    super.destroy();
  }
}

// ---------------------------------------------------------------------------------------

/** Pieces a substance comes as: ice as cubes of ~20 mL, everything else as one piece. */
export function spawnSolid(app, id, volume, T, position, { scatter = 0.02, velocity = null } = {}) {
  const s = SUBSTANCES[id];
  if (!s) return [];
  const form = pieceForm(s);
  const n = form === 'ice' ? Math.max(1, Math.min(10, Math.round(volume / 20))) : form === 'metal' ? Math.max(1, Math.min(4, Math.round(volume / 40))) : 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = position.clone().add(new THREE.Vector3((Math.random() - 0.5) * scatter, i * 0.03, (Math.random() - 0.5) * scatter));
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    const piece = app.spawnEquipment('piece', p, q);
    piece.setSubstance(id, volume / n, T);
    if (velocity) piece.body?.setLinvel(velocity, true);
    out.push(piece);
  }
  limitPieces(app);
  return out;
}

/** Powder landing on a surface piles up into a heap (or grows a heap already there). */
export function depositSolid(app, point, mix) {
  const s = mix.dominant('solid');
  if (!s || mix.solidVolume < 0.01) return null;
  for (const e of app.entities) {
    if (!e.isSolidPiece || e.removed || e.isHeld) continue;
    if (e.substance.id !== s.id) continue;
    if (e.object.position.distanceTo(point) < Math.max(0.05, e.rimR * 1.4)) {
      e.addSolid(mix);
      return e;
    }
  }
  if (mix.solidVolume < 0.15) return null; // a few stray grains
  const piece = app.spawnEquipment('piece', point.clone().add(new THREE.Vector3(0, 0.004, 0)));
  piece.contents.clear();
  piece.contents.addMixture(mix);
  for (const [id, ml, sub] of [...piece.contents.entries()]) if (sub.phase !== 'solid') piece.contents.remove(id, ml);
  piece.contents.temperature = mix.temperature;
  piece.rebuild();
  limitPieces(app);
  return piece;
}

function limitPieces(app) {
  const all = app.entities.filter((e) => e.isSolidPiece && !e.removed && !e.isHeld);
  for (let i = 0; i < all.length - MAX_PIECES; i++) {
    app.effects.poof(all[i].object.position, 0xdde6f0, 0.5);
    all[i].destroy();
  }
}
