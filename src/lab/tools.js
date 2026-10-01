import * as THREE from 'three';
import { Equipment, PokeButton } from './Equipment.js';
import { Mixture } from '../chem/Mixture.js';
import { SUBSTANCES } from '../chem/substances.js';
import { M, lathe, roundedBox } from './materials.js';
import { font, roundRect } from '../ui/canvasUtil.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** True when any holding hand presses its "use" button (controller trigger / Space). */
function usePressed(e) {
  return e.holds.some((r) => r.hand.usePressed);
}

function containersNear(app, p, exclude) {
  return app.entities.filter((e) => e.isContainer && e !== exclude && !e.removed && !e.disabled && e.object.position.distanceTo(p) < 0.4);
}

/** Small canvas screen helper. */
export class Screen {
  constructor(w, h, pxW = 256, pxH = 128) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW;
    this.canvas.height = pxH;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.mesh.userData.noHighlight = true;
    this.last = '';
  }

  show(text, sub = '', color = '#8dffb0') {
    const key = text + '|' + sub + '|' + color;
    if (key === this.last) return;
    this.last = key;
    const { ctx, canvas } = this;
    ctx.fillStyle = '#07130c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(canvas.height * 0.46, 700);
    ctx.fillText(text, canvas.width / 2, canvas.height * (sub ? 0.4 : 0.52));
    if (sub) {
      ctx.font = font(canvas.height * 0.2, 600);
      ctx.fillStyle = '#7fb89a';
      ctx.fillText(sub, canvas.width / 2, canvas.height * 0.8);
    }
    this.texture.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------
// Flame shader

const flameVert = /* glsl */ `
  varying vec3 vPos;
  uniform float uTime;
  void main() {
    vPos = position;
    vec3 p = position;
    float h = clamp(p.y / 0.1, 0.0, 1.0);
    p.x += sin(uTime * 23.0 + p.y * 90.0) * 0.0025 * h;
    p.z += cos(uTime * 19.0 + p.y * 70.0) * 0.0025 * h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const flameFrag = /* glsl */ `
  varying vec3 vPos;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uHeight;
  void main() {
    float h = clamp(vPos.y / uHeight, 0.0, 1.0);
    float a = (1.0 - h) * uIntensity;
    gl_FragColor = vec4(uColor * (1.2 - h * 0.6), a);
    #include <colorspace_fragment>
  }
`;

export function flameMesh(radius, height, color, intensity) {
  const geo = new THREE.ConeGeometry(radius, height, 20, 6, true);
  geo.translate(0, height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: flameVert,
    fragmentShader: flameFrag,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uHeight: { value: height } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.userData.noPick = true;
  m.userData.noHighlight = true;
  m.renderOrder = 7;
  return m;
}

// ---------------------------------------------------------------------------------------

export class BunsenBurner extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'metal', mass: 0.45 });
    this.on = false;
    this.flameColor = null;
    this.flameColorT = 0;
    const base = mesh(lathe([[0, 0], [0.045, 0], [0.046, 0.004], [0.04, 0.012], [0.012, 0.016], [0, 0.016]], 36), M.darkSteel());
    const barrel = mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.125, 20, 1, true), M.chrome(), 0, 0.016 + 0.0625, 0);
    barrel.material = M.chrome();
    const collar = mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.018, 20), M.brass(), 0, 0.04, 0);
    const holes = mesh(new THREE.CylinderGeometry(0.0087, 0.0087, 0.006, 4), M.rubber(), 0, 0.04, 0);
    const rim = mesh(new THREE.TorusGeometry(0.0068, 0.0012, 8, 24), M.chrome(), 0, 0.141, 0);
    rim.rotation.x = Math.PI / 2;
    const inlet = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.04, 12), M.brass(), 0.03, 0.022, 0);
    inlet.rotation.z = Math.PI / 2;
    this.model.add(base, barrel, collar, holes, rim, inlet);
    // Gas valve: a red push button on the base
    this.valve = new PokeButton(app, { radius: 0.011, height: 0.008, color: 0xd8402f, parent: this.model, onPress: () => this.toggle() });
    this.valve.group.position.set(-0.026, 0.012, 0.02);
    this.valve.group.rotation.x = -0.35;

    this.flameOuter = flameMesh(0.012, 0.11, '#6e7bff', 0.55);
    this.flameInner = flameMesh(0.0065, 0.045, '#9fd6ff', 0.9);
    this.flameGroup = new THREE.Group();
    this.flameGroup.position.y = 0.142;
    this.flameGroup.add(this.flameOuter, this.flameInner);
    this.flameGroup.visible = false;
    this.model.add(this.flameGroup);

    this.colliderSpecs = [
      { type: 'cylinder', hh: 0.008, r: 0.045, pos: [0, 0.008, 0] },
      { type: 'cylinder', hh: 0.065, r: 0.009, pos: [0, 0.08, 0] },
    ];
    this.finalize();
    app.heatSources.push(this);
  }

  toggle(force) {
    this.on = force ?? !this.on;
    this.flameGroup.visible = this.on;
    this.app.audio?.play(this.on ? 'whoosh' : 'click', { position: this.object.position, volume: 0.5 });
    if (this.on && !this.sound && this.app.audio?.ctx) this.sound = this.app.audio.loop('flame', { position: this.object.position, volume: 0.25 });
    if (!this.on && this.sound) { this.sound.stop(); this.sound = null; }
  }

  /** World position of the hot inner-cone tip. */
  flamePoint(out = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    return out.set(0, 0.142 + 0.05, 0).applyMatrix4(this.object.matrixWorld);
  }

  heatFor(container) {
    if (!this.on || this.disabled) return null;
    const up = this.upVector(_v2);
    if (up.y < 0.7) return null;
    const tip = this.flamePoint(_v);
    container.object.updateWorldMatrix(true, false);
    const bottom = new THREE.Vector3(0, container.bottomY, 0).applyMatrix4(container.object.matrixWorld);
    const dy = bottom.y - (tip.y - 0.05);
    const horiz = Math.hypot(bottom.x - tip.x, bottom.z - tip.z);
    let rate = 0;
    if (dy > -0.03 && dy < 0.2 && horiz < 0.05 + container.rimR) rate = 4.5 * (1 - Math.max(0, dy - 0.05) / 0.2);
    const rim = container.rim();
    const flame = rim.center.distanceTo(tip) < 0.07 || (dy > -0.03 && dy < 0.09 && horiz < 0.04);
    return rate > 0 || flame ? { rate, flame } : null;
  }

  update(dt) {
    super.update(dt);
    if (!this.on) return;
    const t = performance.now() / 1000;
    for (const f of [this.flameOuter, this.flameInner]) f.material.uniforms.uTime.value = t;
    // Flame test: anything with a metal salt held in the flame colours it.
    const tip = this.flamePoint(_v);
    let color = null;
    for (const e of this.app.entities) {
      if (e === this || e.removed || e.disabled) continue;
      if (e.flameTestSample) {
        const s = e.flameTestSample(tip);
        if (s) { color = s; break; }
      }
      if (e.isContainer && e.flameContact && e.burningColor === undefined) continue;
    }
    if (color) {
      this.flameColor = color;
      this.flameColorT = 1.5;
    }
    this.flameColorT = Math.max(0, this.flameColorT - dt);
    const outer = this.flameOuter.material.uniforms;
    if (this.flameColorT > 0 && this.flameColor) {
      outer.uColor.value.set(this.flameColor);
      outer.uIntensity.value = 0.9;
      this.flameOuter.scale.set(1.5, 1.4, 1.5);
    } else {
      outer.uColor.value.set('#6e7bff');
      outer.uIntensity.value = 0.55;
      this.flameOuter.scale.set(1, 1, 1);
    }
    if (this.sound) this.sound.setPosition(this.object.position);
    // Anything burnable touching the flame (paper-like) — just sparks for metals
    if (Math.random() < dt * 2) this.app.effects.glow.emit(tip.clone().add(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3(0, 0.2, 0), 0x8899ff, 0.15, 0.01, 0.3);
  }

  destroy() {
    if (this.sound) this.sound.stop();
    this.valve.dispose();
    const i = this.app.heatSources.indexOf(this);
    if (i >= 0) this.app.heatSources.splice(i, 1);
    super.destroy();
  }
}

// ---------------------------------------------------------------------------------------

export class HotPlate extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'metal', mass: 1.6 });
    this.on = false;
    const body = mesh(roundedBox(0.2, 0.07, 0.24, 0.02), M.plasticWhite(), 0, 0.035, 0);
    this.plateMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.5, metalness: 0.3, emissive: 0x000000 });
    this.plateMat.userData.noClone = true;
    const plate = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 40), this.plateMat, 0, 0.073, -0.015);
    const ring = mesh(new THREE.TorusGeometry(0.086, 0.003, 8, 40), M.steel(), 0, 0.074, -0.015);
    ring.rotation.x = Math.PI / 2;
    const panel = mesh(new THREE.BoxGeometry(0.16, 0.035, 0.002), M.plasticDark(), 0, 0.035, 0.1205);
    this.model.add(body, plate, ring, panel);
    this.led = mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color: 0x331111 }), 0.05, 0.035, 0.122);
    this.model.add(this.led);
    this.knob = new PokeButton(app, { radius: 0.012, height: 0.01, color: 0xe2e5ea, parent: this.model, onPress: () => this.toggle() });
    this.knob.group.position.set(-0.04, 0.035, 0.121);
    this.knob.group.rotation.x = Math.PI / 2;
    this.colliderSpecs = [{ type: 'box', hx: 0.1, hy: 0.0375, hz: 0.12, pos: [0, 0.0375, 0] }];
    this.finalize();
    app.heatSources.push(this);
  }

  toggle() {
    this.on = !this.on;
    this.led.material.color.setHex(this.on ? 0xff3322 : 0x331111);
  }

  heatFor(container) {
    if (!this.on || this.disabled) return null;
    this.object.updateWorldMatrix(true, false);
    const top = new THREE.Vector3(0, 0.076, -0.015).applyMatrix4(this.object.matrixWorld);
    const bottom = new THREE.Vector3(0, 0, 0).applyMatrix4(container.object.matrixWorld);
    const dy = bottom.y - top.y;
    const horiz = Math.hypot(bottom.x - top.x, bottom.z - top.z);
    if (dy > -0.01 && dy < 0.02 && horiz < 0.09) return { rate: 3.2, flame: false };
    return null;
  }

  update(dt) {
    super.update(dt);
    const target = this.on ? 0.9 : 0;
    this.heat = (this.heat || 0) + (target - (this.heat || 0)) * Math.min(1, dt * 0.6);
    this.plateMat.emissive.setRGB(this.heat * 0.9, this.heat * 0.18, 0.02 * this.heat);
    this.plateMat.emissiveIntensity = 1;
  }

  destroy() {
    this.knob.dispose();
    const i = this.app.heatSources.indexOf(this);
    if (i >= 0) this.app.heatSources.splice(i, 1);
    super.destroy();
  }
}

// ---------------------------------------------------------------------------------------

export class Thermometer extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'glass', mass: 0.03 });
    const L = 0.3;
    const tube = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, L, 14), M.glass(), 0, L / 2 + 0.006, 0);
    const bulb = mesh(new THREE.SphereGeometry(0.0055, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd8262a, roughness: 0.3 }), 0, 0.006, 0);
    this.columnMat = new THREE.MeshStandardMaterial({ color: 0xd8262a, roughness: 0.3, emissive: 0x400000 });
    this.columnMat.userData.noClone = true;
    this.column = mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 1, 8), this.columnMat, 0, 0, 0);
    this.column.geometry.translate(0, 0.5, 0);
    this.column.position.y = 0.01;
    const cap = mesh(new THREE.SphereGeometry(0.0036, 10, 8), M.glass(), 0, L + 0.006, 0);
    // Scale plate
    const c = document.createElement('canvas');
    c.width = 64; c.height = 1024;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f5f2e8';
    ctx.fillRect(0, 0, 64, 1024);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 22px Arial';
    for (let t = -10; t <= 110; t += 5) {
      const y = 1024 - ((t + 10) / 120) * 980 - 22;
      ctx.fillRect(0, y, t % 10 === 0 ? 30 : 16, 3);
      if (t % 20 === 0) ctx.fillText(String(t), 32, y + 8);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plate = mesh(new THREE.PlaneGeometry(0.009, L * 0.9), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), 0, L * 0.53, -0.0012);
    this.model.add(tube, bulb, this.column, cap, plate);
    this.screenTag = new Screen(0.05, 0.018, 256, 96);
    this.screenTag.mesh.position.set(0, L + 0.02, 0);
    this.model.add(this.screenTag.mesh);
    this.temp = 22;
    this.colliderSpecs = [{ type: 'capsule', hh: L / 2, r: 0.005, pos: [0, L / 2 + 0.006, 0] }];
    this.finalize();
  }

  probe(out = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    return out.set(0, 0.006, 0).applyMatrix4(this.object.matrixWorld);
  }

  update(dt) {
    super.update(dt);
    const p = this.probe(_v);
    let target = 22;
    for (const b of this.app.heatSources) {
      const t = b.ambientAt ? b.ambientAt(p) : null;
      if (t !== null) target = t;
    }
    for (const c of containersNear(this.app, p, null)) {
      if (c.pointInLiquid(p) || c.pointInSolid(p)) { target = c.contents.temperature; c.stirring = Math.max(c.stirring, 0.1); break; }
    }
    for (const b of this.app.heatSources) {
      if (b.on && b.flamePoint && b.flamePoint(_v2).distanceTo(p) < 0.05) target = 600;
    }
    this.temp += (target - this.temp) * Math.min(1, dt * 1.2);
    const f = THREE.MathUtils.clamp((this.temp + 10) / 120, 0.01, 1.02);
    this.column.scale.set(1, 0.27 * f + 0.002, 1);
    this.screenTag.show(`${this.temp > 120 ? '>120' : this.temp.toFixed(1)} °C`);
    // Face the screen towards the viewer
    const head = this.app.headPosition();
    this.screenTag.mesh.lookAt(head);
  }
}

// ---------------------------------------------------------------------------------------

export class PHMeter extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'plastic', mass: 0.12 });
    const body = mesh(roundedBox(0.05, 0.12, 0.024, 0.01), M.plasticBlue(), 0, 0.2, 0);
    this.screen = new Screen(0.04, 0.026, 256, 160);
    this.screen.mesh.position.set(0, 0.225, 0.0125);
    const probe = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 14), M.plasticDark(), 0, 0.07, 0);
    const glassTip = mesh(new THREE.SphereGeometry(0.0055, 14, 10), M.glass(), 0, 0.004, 0);
    const ring = mesh(new THREE.TorusGeometry(0.0055, 0.0012, 8, 20), M.steel(), 0, 0.012, 0);
    ring.rotation.x = Math.PI / 2;
    this.model.add(body, this.screen.mesh, probe, glassTip, ring);
    const label = new Screen(0.04, 0.008, 256, 52);
    label.show('pH METER', '', '#d9ecff');
    label.mesh.position.set(0, 0.168, 0.0125);
    this.model.add(label.mesh);
    this.colliderSpecs = [
      { type: 'box', hx: 0.025, hy: 0.06, hz: 0.012, pos: [0, 0.2, 0] },
      { type: 'cylinder', hh: 0.07, r: 0.006, pos: [0, 0.07, 0] },
    ];
    this.finalize();
    this.reading = null;
  }

  update(dt) {
    super.update(dt);
    this.object.updateWorldMatrix(true, false);
    const tip = _v.set(0, 0.006, 0).applyMatrix4(this.object.matrixWorld);
    let ph = null;
    for (const c of containersNear(this.app, tip, null)) {
      if (c.pointInLiquid(tip)) { ph = c.contents.pH; break; }
    }
    if (ph === null) {
      this.screen.show('-- . --', 'dip the probe', '#8dffb0');
      return;
    }
    this.reading = this.reading === null ? ph : this.reading + (ph - this.reading) * Math.min(1, dt * 3);
    const v = this.reading;
    const color = v < 3 ? '#ff6b5a' : v < 6.5 ? '#ffb35a' : v <= 7.5 ? '#8dffb0' : v < 11 ? '#5ab4ff' : '#b07bff';
    const kind = v < 6.5 ? 'acidic' : v <= 7.5 ? 'neutral' : 'basic';
    this.screen.show(`pH ${v.toFixed(1)}`, kind, color);
  }
}

// ---------------------------------------------------------------------------------------

export class Balance extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'metal', mass: 2.5 });
    const body = mesh(roundedBox(0.2, 0.06, 0.24, 0.015), M.plasticWhite(), 0, 0.03, 0);
    const pan = mesh(new THREE.BoxGeometry(0.15, 0.006, 0.15), M.steel(), 0, 0.066, -0.02);
    const stem = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.008, 12), M.steel(), 0, 0.062, -0.02);
    this.screen = new Screen(0.09, 0.024, 360, 96);
    this.screen.mesh.position.set(0.0, 0.032, 0.1205);
    this.screen.mesh.rotation.x = -0.25;
    const bezel = mesh(new THREE.BoxGeometry(0.17, 0.035, 0.004), M.plasticDark(), 0, 0.032, 0.119);
    bezel.rotation.x = -0.25;
    this.screen.mesh.position.z = 0.1215;
    this.model.add(body, pan, stem, bezel, this.screen.mesh);
    this.tareOffset = 0;
    this.tareBtn = new PokeButton(app, { radius: 0.009, height: 0.006, color: 0x3a8de0, parent: this.model, onPress: () => { this.tareOffset = this.raw; } });
    this.tareBtn.group.position.set(0.075, 0.032, 0.121);
    this.tareBtn.group.rotation.x = Math.PI / 2 - 0.25;
    this.colliderSpecs = [
      { type: 'box', hx: 0.1, hy: 0.03, hz: 0.12, pos: [0, 0.03, 0] },
      { type: 'box', hx: 0.075, hy: 0.004, hz: 0.075, pos: [0, 0.066, -0.02], friction: 1 },
    ];
    this.finalize();
    this.raw = 0;
    this.display = 0;
  }

  update(dt) {
    super.update(dt);
    this.object.updateWorldMatrix(true, false);
    const top = _v.set(0, 0.069, -0.02).applyMatrix4(this.object.matrixWorld);
    let grams = 0;
    for (const e of this.app.entities) {
      if (e === this || e.removed || e.disabled || e.isHeld || e.kind !== 'equipment') continue;
      const b = e.worldBounds(new THREE.Box3());
      if (Math.abs(b.min.y - top.y) < 0.012 && Math.abs((b.min.x + b.max.x) / 2 - top.x) < 0.09 && Math.abs((b.min.z + b.max.z) / 2 - top.z) < 0.09) {
        grams += e.mass * 1000 + (e.contents ? e.contents.mass : 0);
      }
    }
    this.raw = grams;
    this.display += (grams - this.display) * Math.min(1, dt * 5);
    const shown = this.display - this.tareOffset;
    this.screen.show(`${shown.toFixed(1)} g`, '', '#8dffb0');
  }

  destroy() {
    this.tareBtn.dispose();
    super.destroy();
  }
}

// ---------------------------------------------------------------------------------------

export class Dropper extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'glass', mass: 0.01 });
    const tube = mesh(lathe([[0.0012, 0], [0.0018, 0.004], [0.003, 0.05], [0.0042, 0.06], [0.0042, 0.14]], 16), M.glass());
    this.liquidMat = new THREE.MeshStandardMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.6 });
    this.liquidMat.userData.noClone = true;
    this.liquidMesh = mesh(new THREE.CylinderGeometry(0.0028, 0.0018, 1, 10), this.liquidMat, 0, 0, 0);
    this.liquidMesh.geometry.translate(0, 0.5, 0);
    this.liquidMesh.position.y = 0.006;
    this.liquidMesh.userData.noHighlight = true;
    const bulb = mesh(new THREE.SphereGeometry(0.009, 16, 12), M.redRubber(), 0, 0.152, 0);
    bulb.scale.set(1, 1.6, 1);
    this.model.add(tube, this.liquidMesh, bulb);
    this.load = new Mixture();
    this.capacityMl = 3;
    this.btn = new PokeButton(app, { radius: 0.0095, height: 0.004, color: 0xb8322a, parent: this.model, onPress: () => this.squeeze() });
    this.btn.group.position.set(0, 0.152, 0.008);
    this.btn.group.rotation.x = Math.PI / 2;
    this.btn.cap.visible = false;
    this.colliderSpecs = [{ type: 'capsule', hh: 0.07, r: 0.006, pos: [0, 0.08, 0] }];
    this.finalize();
    this.dripT = 0;
  }

  tip(out = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    return out.set(0, 0.001, 0).applyMatrix4(this.object.matrixWorld);
  }

  squeeze() {
    const tip = this.tip(_v);
    if (this.load.total < 0.05) {
      for (const c of containersNear(this.app, tip, null)) {
        if (c.pointInLiquid(tip)) {
          this.load = c.contents.takeLiquid(this.capacityMl);
          this.app.audio?.play('suck', { position: tip, volume: 0.4 });
          return;
        }
      }
    } else {
      this.dripT = 1.4;
    }
  }

  update(dt) {
    super.update(dt);
    if (usePressed(this) && !this._useLatch) { this._useLatch = true; this.squeeze(); }
    if (!usePressed(this)) this._useLatch = false;
    if (this.dripT > 0 && this.load.total > 0) {
      this.dripT -= dt;
      this._dropAcc = (this._dropAcc || 0) + dt;
      if (this._dropAcc > 0.18) {
        this._dropAcc = 0;
        const drop = this.load.takeLiquid(0.25);
        const tip = this.tip(_v).clone();
        this.app.fluids.pour(this, null, tip, new THREE.Vector3(0, -0.15, 0), drop, 3);
        this.app.audio?.play('drip', { position: tip, volume: 0.3 });
      }
    }
    const look = this.load.liquidLook();
    const lv = this.load.liquidVolume;
    this.liquidMesh.visible = lv > 0.02;
    if (look) {
      this.liquidMat.color.setRGB(look.color[0], look.color[1], look.color[2], THREE.SRGBColorSpace);
      this.liquidMat.opacity = Math.min(0.95, look.opacity + 0.3);
    }
    this.liquidMesh.scale.y = 0.05 * Math.min(1, lv / this.capacityMl) + 0.0001;
  }

  destroy() {
    this.btn.dispose();
    super.destroy();
  }
}

// ---------------------------------------------------------------------------------------

export class WashBottle extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'plastic', mass: 0.12 });
    const body = mesh(lathe([[0, 0], [0.038, 0], [0.04, 0.006], [0.04, 0.14], [0.03, 0.16], [0.013, 0.168], [0, 0.168]], 32), M.washBottle());
    const water = mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.11, 28), new THREE.MeshPhysicalMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false }), 0, 0.058, 0);
    water.userData.noHighlight = true;
    water.renderOrder = 1;
    const cap = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.018, 20), M.plasticBlue(), 0, 0.176, 0);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.185, 0), new THREE.Vector3(0, 0.215, 0), new THREE.Vector3(0.01, 0.235, 0), new THREE.Vector3(0.05, 0.24, 0), new THREE.Vector3(0.07, 0.228, 0)]);
    const nozzle = mesh(new THREE.TubeGeometry(curve, 24, 0.0028, 8), M.plasticBlue());
    const label = mesh(new THREE.CylinderGeometry(0.0405, 0.0405, 0.05, 32, 1, true, -0.6, 1.2), M.plasticBlue(), 0, 0.08, 0);
    this.model.add(body, water, cap, nozzle, label);
    this.btn = new PokeButton(app, { radius: 0.016, height: 0.004, color: 0x2f7fd8, parent: this.model, onPress: () => { this.squirting = true; }, onRelease: () => { this.squirting = false; } });
    this.btn.group.position.set(0, 0.08, 0.04);
    this.btn.group.rotation.x = Math.PI / 2;
    this.btn.cap.visible = false;
    this.colliderSpecs = [{ type: 'cylinder', hh: 0.084, r: 0.04, pos: [0, 0.084, 0] }];
    this.finalize();
  }

  update(dt) {
    super.update(dt);
    const on = this.squirting || usePressed(this);
    if (on) {
      this.object.updateWorldMatrix(true, false);
      const tip = new THREE.Vector3(0.072, 0.226, 0).applyMatrix4(this.object.matrixWorld);
      const dir = new THREE.Vector3(1, -0.45, 0).normalize().transformDirection(this.object.matrixWorld);
      const m = new Mixture();
      m.add('water', 30 * dt);
      this.stream = this.app.fluids.pour(this, this.stream, tip, dir.multiplyScalar(1.3), m, 30);
    } else if (this.stream) {
      this.app.fluids.stop(this.stream);
      this.stream = null;
    }
  }

  destroy() {
    this.btn.dispose();
    if (this.stream) this.app.fluids.stop(this.stream);
    super.destroy();
  }
}

// ---------------------------------------------------------------------------------------

export class StirringRod extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'glass', mass: 0.015 });
    const rod = mesh(new THREE.CapsuleGeometry(0.003, 0.24, 4, 10), M.glass(), 0, 0.123, 0);
    this.model.add(rod);
    this.colliderSpecs = [{ type: 'capsule', hh: 0.12, r: 0.004, pos: [0, 0.123, 0] }];
    this.finalize();
    this.prevTip = new THREE.Vector3();
  }

  update(dt) {
    super.update(dt);
    this.object.updateWorldMatrix(true, false);
    const tip = _v.set(0, 0.01, 0).applyMatrix4(this.object.matrixWorld);
    const speed = tip.distanceTo(this.prevTip) / Math.max(dt, 1e-3);
    this.prevTip.copy(tip);
    if (speed < 0.05) return;
    for (const c of containersNear(this.app, tip, null)) {
      if (c.pointInLiquid(tip) || c.pointInSolid(tip)) {
        c.stirring = Math.min(1, c.stirring + dt * 4);
        if (Math.random() < dt * 10) this.app.audio?.play('tick', { position: tip, volume: 0.15, rate: 0.7 + Math.random() * 0.6 });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------

export class Spatula extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'metal', mass: 0.03 });
    const handle = mesh(new THREE.BoxGeometry(0.008, 0.16, 0.003), M.steel(), 0, 0.12, 0);
    const blade = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.0025, 18), M.steel(), 0, 0.03, 0);
    blade.scale.set(1, 1, 2);
    blade.rotation.x = Math.PI / 2;
    const neck = mesh(new THREE.BoxGeometry(0.005, 0.03, 0.0025), M.steel(), 0, 0.05, 0);
    this.loadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    this.loadMat.userData.noClone = true;
    this.loadMesh = mesh(new THREE.SphereGeometry(0.008, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.loadMat, 0, 0.03, 0.002);
    this.loadMesh.rotation.x = Math.PI / 2;
    this.loadMesh.scale.set(1, 0.4, 1.6);
    this.loadMesh.visible = false;
    this.loadMesh.userData.noHighlight = true;
    this.model.add(handle, blade, neck, this.loadMesh);
    this.load = new Mixture();
    this.colliderSpecs = [{ type: 'box', hx: 0.009, hy: 0.1, hz: 0.004, pos: [0, 0.1, 0] }];
    this.finalize();
  }

  scoop() {
    this.object.updateWorldMatrix(true, false);
    return _v.set(0, 0.03, 0).applyMatrix4(this.object.matrixWorld);
  }

  flameTestSample(tip) {
    if (this.load.total < 0.02) return null;
    if (this.scoop().distanceTo(tip) > 0.05) return null;
    for (const [id] of this.load.items) if (SUBSTANCES[id].flame) return SUBSTANCES[id].flame;
    return null;
  }

  update(dt) {
    super.update(dt);
    const p = this.scoop().clone();
    const n = new THREE.Vector3(0, 0, 1).transformDirection(this.object.matrixWorld);
    if (this.load.total < 0.02) {
      for (const c of containersNear(this.app, p, null)) {
        if (c.pointInSolid(p) && c.contents.solidVolume > 0.05) {
          this.load = c.contents.takeSolid(1.5);
          this.app.audio?.play('tick', { position: p, volume: 0.3 });
          break;
        }
      }
    } else if (n.y < -0.5 || (usePressed(this) && !this._latch)) {
      // Tip it over: the powder falls (into whatever container is below).
      this._latch = true;
      const portion = this.load;
      this.load = new Mixture();
      this.app.fluids.pour(this, null, p, new THREE.Vector3(0, -0.1, 0), portion, 6, true);
    }
    if (!usePressed(this)) this._latch = false;
    const s = this.load.dominant('solid');
    this.loadMesh.visible = !!s && this.load.total > 0.02;
    if (s) {
      this.loadMat.color.set(s.color);
      this.loadMat.metalness = s.metalness || 0;
      this.loadMat.roughness = s.roughness;
    }
  }
}

// ---------------------------------------------------------------------------------------

export class Funnel extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'glass', mass: 0.05 });
    this.isFunnel = true;
    const geo = lathe([[0.0035, 0], [0.0042, 0], [0.0045, 0.05], [0.006, 0.055], [0.045, 0.1], [0.047, 0.102], [0.0455, 0.103], [0.0435, 0.1], [0.0045, 0.056], [0.0028, 0.05], [0.0028, 0.0005]], 36);
    const funnel = mesh(geo, M.glass());
    funnel.renderOrder = 3;
    this.model.add(funnel);
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push(Math.cos(a) * 0.046, 0.102, Math.sin(a) * 0.046, Math.cos(a) * 0.006, 0.05, Math.sin(a) * 0.006);
    }
    this.colliderSpecs = [
      { type: 'hull', points: new Float32Array(pts) },
      { type: 'cylinder', hh: 0.025, r: 0.0045, pos: [0, 0.025, 0] },
    ];
    this.finalize();
    this.stream = null;
    this.idle = 0;
  }

  opening() {
    this.object.updateWorldMatrix(true, false);
    return {
      center: new THREE.Vector3(0, 0.1, 0).applyMatrix4(this.object.matrixWorld),
      normal: new THREE.Vector3(0, 1, 0).applyQuaternion(this.object.quaternion),
      radius: 0.045,
    };
  }

  passThrough(mix) {
    this.object.updateWorldMatrix(true, false);
    const tip = new THREE.Vector3(0, -0.002, 0).applyMatrix4(this.object.matrixWorld);
    const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(this.object.quaternion).multiplyScalar(0.25);
    this.stream = this.app.fluids.pour(this, this.stream, tip, dir, mix, 60, mix.liquidVolume <= 0);
    this.idle = 0;
  }

  update(dt) {
    super.update(dt);
    this.idle += dt;
    if (this.stream && this.idle > 0.12) {
      this.app.fluids.stop(this.stream);
      this.stream = null;
    }
  }
}

// ---------------------------------------------------------------------------------------

export class TestTubeRack extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'wood', mass: 0.3 });
    this.carrier = true; // tubes in the rack travel with it
    const W = 0.24, D = 0.06, H = 0.1;
    const wood = M.wood();
    const base = mesh(new THREE.BoxGeometry(W, 0.012, D), wood, 0, 0.006, 0);
    const sideL = mesh(new THREE.BoxGeometry(0.012, H, D), wood, -W / 2 + 0.006, H / 2, 0);
    const sideR = mesh(new THREE.BoxGeometry(0.012, H, D), wood, W / 2 - 0.006, H / 2, 0);
    this.model.add(base, sideL, sideR);
    this.colliderSpecs = [
      { type: 'box', hx: W / 2, hy: 0.006, hz: D / 2, pos: [0, 0.006, 0] },
      { type: 'box', hx: 0.006, hy: H / 2, hz: D / 2, pos: [-W / 2 + 0.006, H / 2, 0] },
      { type: 'box', hx: 0.006, hy: H / 2, hz: D / 2, pos: [W / 2 - 0.006, H / 2, 0] },
    ];
    // Top plate with 6 holes: built from bars between the holes.
    const holes = 6;
    const inner = W - 0.024;
    const pitch = inner / holes;
    const hole = 0.022;
    const topY = H - 0.006;
    const bars = [];
    for (let i = 0; i <= holes; i++) {
      const x = -inner / 2 + i * pitch;
      const w = i === 0 || i === holes ? (pitch - hole) / 2 : pitch - hole;
      const cx = i === 0 ? x + w / 2 : i === holes ? x - w / 2 : x;
      bars.push([cx, w]);
    }
    for (const [cx, w] of bars) {
      this.model.add(mesh(new THREE.BoxGeometry(w, 0.012, D), wood, cx, topY, 0));
      this.colliderSpecs.push({ type: 'box', hx: w / 2, hy: 0.006, hz: D / 2, pos: [cx, topY, 0] });
    }
    const strip = (D - hole) / 2;
    for (const sz of [-1, 1]) {
      this.model.add(mesh(new THREE.BoxGeometry(inner, 0.012, strip), wood, 0, topY, sz * (hole / 2 + strip / 2)));
      this.colliderSpecs.push({ type: 'box', hx: inner / 2, hy: 0.006, hz: strip / 2, pos: [0, topY, sz * (hole / 2 + strip / 2)] });
    }
    this.finalize();
    this.slots = Array.from({ length: holes }, (_, i) => -inner / 2 + (i + 0.5) * pitch);
  }
}

// ---------------------------------------------------------------------------------------

export class Tripod extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'metal', mass: 0.6 });
    const H = 0.19;
    const ring = mesh(new THREE.TorusGeometry(0.055, 0.004, 8, 40), M.darkSteel(), 0, H, 0);
    ring.rotation.x = Math.PI / 2;
    this.model.add(ring);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const top = new THREE.Vector3(Math.cos(a) * 0.055, H, Math.sin(a) * 0.055);
      const bot = new THREE.Vector3(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
      const len = top.distanceTo(bot);
      const leg = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, len, 8), M.darkSteel());
      leg.position.copy(top).add(bot).multiplyScalar(0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
      this.model.add(leg);
      this.colliderSpecs = this.colliderSpecs || [];
    }
    const gauze = mesh(new THREE.BoxGeometry(0.13, 0.002, 0.13), M.gauze(), 0, H + 0.005, 0);
    const pad = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.0025, 24), M.ceramicPad(), 0, H + 0.006, 0);
    this.model.add(gauze, pad);
    this.colliderSpecs = [
      { type: 'box', hx: 0.065, hy: 0.003, hz: 0.065, pos: [0, H + 0.005, 0], friction: 1 },
      ...[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return { type: 'cylinder', hh: H / 2, r: 0.006, pos: [Math.cos(a) * 0.068, H / 2, Math.sin(a) * 0.068] };
      }),
    ];
    this.finalize();
  }
}

// ---------------------------------------------------------------------------------------

export class Tongs extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'metal', mass: 0.08 });
    for (const s of [-1, 1]) {
      const arm = mesh(new THREE.BoxGeometry(0.006, 0.2, 0.003), M.steel(), s * 0.008, 0.1, 0);
      arm.rotation.z = s * 0.06;
      const grip = mesh(new THREE.BoxGeometry(0.01, 0.03, 0.006), M.steel(), s * 0.012, 0.005, 0);
      this.model.add(arm, grip);
    }
    const pivot = mesh(new THREE.TorusGeometry(0.008, 0.002, 6, 16), M.steel(), 0, 0.2, 0);
    this.model.add(pivot);
    this.colliderSpecs = [{ type: 'box', hx: 0.014, hy: 0.105, hz: 0.004, pos: [0, 0.1, 0] }];
    this.finalize();
  }
}
