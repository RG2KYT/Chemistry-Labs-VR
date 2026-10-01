import * as THREE from 'three';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uViewportH;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, aSize * projectionMatrix[1][1] * uViewportH * 0.5 / max(0.05, -mv.z));
  }
`;
const FRAG = /* glsl */ `
  varying vec4 vColor;
  uniform float uSoft;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float a = mix(1.0 - smoothstep(0.55, 1.0, d), exp(-d * 3.0), uSoft);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
    #include <colorspace_fragment>
  }
`;

class ParticlePool {
  constructor(scene, max, blending, soft) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.floorY = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uViewportH: { value: 1000 }, uSoft: { value: soft ? 1 : 0 } };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
  }

  emit(p, v, color, alpha, size, life, opts = {}) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    _c.set(color);
    this.col[i * 4] = _c.r; this.col[i * 4 + 1] = _c.g; this.col[i * 4 + 2] = _c.b; this.col[i * 4 + 3] = alpha;
    this.alpha0[i] = alpha;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = opts.gravity ?? 0;
    this.drag[i] = opts.drag ?? 0;
    this.grow[i] = opts.grow ?? 0;
    this.floorY[i] = opts.floorY ?? -1e9;
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < this.floorY[i]) {
        this.pos[i * 3 + 1] = this.floorY[i];
        this.vel[i * 3 + 1] *= -0.25;
        this.vel[i * 3] *= 0.5;
        this.vel[i * 3 + 2] *= 0.5;
      }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.col[i * 4 + 3] = this.alpha0[i] * Math.min(1, t * 2.5);
      i++;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.setDrawRange(0, this.count);
  }

  kill(i) {
    const j = --this.count;
    if (i === j) return;
    for (const [arr, n] of [[this.pos, 3], [this.vel, 3], [this.col, 4]]) {
      for (let k = 0; k < n; k++) arr[i * n + k] = arr[j * n + k];
    }
    for (const arr of [this.size, this.life, this.maxLife, this.grav, this.drag, this.grow, this.alpha0, this.floorY]) arr[i] = arr[j];
  }

  clear() {
    this.count = 0;
  }
}

/** Instanced glass / debris shards with simple ballistic physics. */
class ShardPool {
  constructor(scene, max = 260) {
    const geo = new THREE.TetrahedronGeometry(1, 0);
    geo.scale(1, 0.25, 0.7);
    this.glassMat = new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.55, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, this.glassMat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(this.mesh);
    this.items = [];
    this.max = max;
  }

  emit(p, v, color, size, floorY, life = 2.5) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({
      p: p.clone(), v: v.clone(), size, floorY, life, max: life,
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(18),
      color: new THREE.Color(color),
      rest: false,
    });
  }

  update(dt) {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const s = items[i];
      s.life -= dt;
      if (s.life <= 0) { items.splice(i, 1); continue; }
      if (!s.rest) {
        s.v.y -= 9.81 * dt;
        s.p.addScaledVector(s.v, dt);
        _q.setFromAxisAngle(_v.copy(s.w).normalize(), s.w.length() * dt);
        s.q.premultiply(_q);
        if (s.p.y < s.floorY + s.size * 0.25) {
          s.p.y = s.floorY + s.size * 0.25;
          s.v.y *= -0.3;
          s.v.x *= 0.55;
          s.v.z *= 0.55;
          s.w.multiplyScalar(0.5);
          if (Math.abs(s.v.y) < 0.15) s.rest = true;
        }
      }
    }
    this.mesh.count = items.length;
    for (let i = 0; i < items.length; i++) {
      const s = items[i];
      const shrink = Math.min(1, s.life / 0.6);
      _s.setScalar(s.size * shrink);
      _m.compose(s.p, s.q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, s.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
  }
}

/**
 * Particle effects: sparkles, smoke, steam, bubbles, splashes, glass shards.
 */
export class Effects {
  constructor(app) {
    this.app = app;
    this.glow = new ParticlePool(app.scene, 1500, THREE.AdditiveBlending, true);
    this.soft = new ParticlePool(app.scene, 1500, THREE.NormalBlending, true);
    this.hard = new ParticlePool(app.scene, 1500, THREE.NormalBlending, false);
    this.shards = new ShardPool(app.scene);
  }

  floorBelow(p) {
    const hit = this.app.physics.raycast({ x: p.x, y: p.y + 0.01, z: p.z }, { x: 0, y: -1, z: 0 }, 4, null,
      (c) => { const o = this.app.physics.ownerOf(c); return !o || o === 'static' || o.kind === 'static' || o.kind === 'room'; });
    return hit ? hit.point.y : 0;
  }

  sparkle(p, color = 0xbff3ff, n = 18, spread = 0.05) {
    for (let i = 0; i < n; i++) {
      const v = _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.15 + Math.random() * 0.35);
      const pp = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      this.glow.emit(pp, v, color, 0.9, 0.008 + Math.random() * 0.01, 0.4 + Math.random() * 0.4, { drag: 3 });
    }
  }

  poof(p, color = 0xdde6f0, scale = 1) {
    for (let i = 0; i < 14 * scale; i++) {
      const v = _v.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(0.25 * scale);
      this.soft.emit(p, v, color, 0.35, 0.03 * scale, 0.7 + Math.random() * 0.5, { drag: 2.5, grow: 0.08 * scale });
    }
  }

  smoke(p, color = 0x9aa0a8, alpha = 0.25, size = 0.04, rise = 0.12) {
    const v = _v.set((Math.random() - 0.5) * 0.04, rise * (0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.04);
    this.soft.emit(p, v, color, alpha, size, 1.6 + Math.random(), { drag: 0.6, grow: size * 1.2 });
  }

  steam(p, amount = 1) {
    const v = _v.set((Math.random() - 0.5) * 0.03, 0.12 + Math.random() * 0.1, (Math.random() - 0.5) * 0.03);
    this.soft.emit(p, v, 0xf4f8fc, 0.18 * amount, 0.02, 1.4 + Math.random() * 0.6, { drag: 0.4, grow: 0.06 });
  }

  bubble(p, color = 0xffffff, size = 0.004, rise = 0.08, life = 0.6) {
    const v = _v.set((Math.random() - 0.5) * 0.01, rise, (Math.random() - 0.5) * 0.01);
    this.hard.emit(p, v, color, 0.55, size, life, { drag: 0.5 });
  }

  droplet(p, v, color, size = 0.005, life = 1.2) {
    this.hard.emit(p, v, color, 0.85, size, life, { gravity: 9.81, floorY: this.floorBelow(p) });
  }

  spark(p, color = 0xffb347, n = 6, speed = 0.8) {
    for (let i = 0; i < n; i++) {
      const v = _v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.glow.emit(p, v, color, 1, 0.006, 0.35 + Math.random() * 0.4, { gravity: 4, drag: 1 });
    }
  }

  flash(p, color = 0xffffff, size = 0.25) {
    this.glow.emit(p, _v.set(0, 0, 0), color, 1, size, 0.25, { grow: size * 2 });
  }

  /** Shatter: glass shards + tinkly dust. */
  shatter(p, color = 0xeaf6ff, size = 0.08, vel = new THREE.Vector3()) {
    const floorY = this.floorBelow(p);
    const n = Math.round(16 + size * 220);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize();
      const v = dir.multiplyScalar(0.5 + Math.random() * 1.6).addScaledVector(vel, 0.25);
      const sp = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * size, (Math.random() - 0.2) * size, (Math.random() - 0.5) * size));
      this.shards.emit(sp, v, color, 0.004 + Math.random() * size * 0.12, floorY, 2.2 + Math.random() * 1.5);
    }
    for (let i = 0; i < 20; i++) {
      const v = _v.set(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).multiplyScalar(1.4);
      this.glow.emit(p, v, 0xdff4ff, 0.6, 0.004, 0.5, { gravity: 6, drag: 1.5 });
    }
  }

  update(dt) {
    const r = this.app.renderer;
    let vh = r.getDrawingBufferSize(new THREE.Vector2()).y;
    if (r.xr.isPresenting) {
      const layer = r.xr.getSession()?.renderState.baseLayer;
      if (layer) vh = layer.framebufferHeight;
    }
    for (const p of [this.glow, this.soft, this.hard]) {
      p.uniforms.uViewportH.value = vh;
      p.update(dt);
    }
    this.shards.update(dt);
  }

  clear() {
    for (const p of [this.glow, this.soft, this.hard]) p.clear();
    this.shards.clear();
  }
}
