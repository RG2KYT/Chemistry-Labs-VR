// Portable freezer and matches.
//
// The freezer is an insulated, fan-forced cool box (−30 °C) with a hinged lid: anything
// placed inside cools quickly and freezes (water → ice, ethanol stays liquid down to
// −114 °C …). Picking it up carries everything inside with it.
//
// Matches are strike-anywhere matches: rub the head quickly along the table, the box or
// any other surface (or press the trigger while holding one) and it bursts into flame.
// The flame ignites flammable liquids and gases, pops hydrogen, heats a little, lights
// other matches and goes out after ~25 s, when dunked in a liquid or when shaken hard.

import * as THREE from 'three';
import { Equipment, PokeButton } from './Equipment.js';
import { Screen, flameMesh } from './tools.js';
import { M, roundedBox } from './materials.js';
import { SUBSTANCES } from '../chem/substances.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function label(text, w, h, color = '#33404f') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * h) / w);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = color;
  ctx.font = `800 ${Math.round(c.height * 0.62)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.userData.noHighlight = true;
  m.userData.noPick = true;
  return m;
}

// ---------------------------------------------------------------------------------------

const FW = 0.3, FD = 0.22, FH = 0.2, WALL = 0.022, FLOOR = 0.026;
const SETPOINT = -30;

export class PortableFreezer extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'plastic', mass: 5, breakable: false });
    this.breakable = false;
    this.carrier = true;
    this.powered = true;
    this.innerT = SETPOINT; // comes pre-chilled
    this.lidOpen = true;
    this.lidAngle = -1.95;
    this.lidCollider = null;

    const shell = new THREE.MeshStandardMaterial({ color: 0xeef3f7, roughness: 0.42 });
    const band = new THREE.MeshStandardMaterial({ color: 0x1f6fcf, roughness: 0.45 });
    this.frostMat = new THREE.MeshStandardMaterial({ color: 0xdff0ff, roughness: 0.85, emissive: 0x0a1a2a, emissiveIntensity: 0.3 });
    this.frostMat.userData.noClone = true;
    // Outer walls (hollow box built from slabs)
    const slab = (w, h, d, x, y, z, mat = shell) => this.model.add(mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z));
    slab(FW, FLOOR, FD, 0, FLOOR / 2, 0);
    slab(WALL, FH, FD, -FW / 2 + WALL / 2, FH / 2, 0);
    slab(WALL, FH, FD, FW / 2 - WALL / 2, FH / 2, 0);
    slab(FW - 2 * WALL, FH, WALL, 0, FH / 2, -FD / 2 + WALL / 2);
    slab(FW - 2 * WALL, FH, WALL, 0, FH / 2, FD / 2 - WALL / 2);
    // Blue base band and corner bumpers
    this.model.add(mesh(roundedBox(FW + 0.008, 0.05, FD + 0.008, 0.012), band, 0, 0.025, 0));
    // Frosty liner inside
    const iw = FW - 2 * WALL, id = FD - 2 * WALL;
    slab(iw - 0.002, 0.002, id - 0.002, 0, FLOOR + 0.001, 0, this.frostMat);
    for (const sx of [-1, 1]) slab(0.002, FH - FLOOR - 0.004, id - 0.002, sx * (iw / 2 - 0.001), FLOOR + (FH - FLOOR) / 2, 0, this.frostMat);
    for (const sz of [-1, 1]) slab(iw - 0.002, FH - FLOOR - 0.004, 0.002, 0, FLOOR + (FH - FLOOR) / 2, sz * (id / 2 - 0.001), this.frostMat);
    // Rubber gasket on the rim
    const gasket = M.rubber();
    slab(FW, 0.004, WALL, 0, FH + 0.002, FD / 2 - WALL / 2, gasket);
    slab(FW, 0.004, WALL, 0, FH + 0.002, -FD / 2 + WALL / 2, gasket);
    slab(WALL, 0.004, FD - 2 * WALL, -FW / 2 + WALL / 2, FH + 0.002, 0, gasket);
    slab(WALL, 0.004, FD - 2 * WALL, FW / 2 - WALL / 2, FH + 0.002, 0, gasket);
    // Side carry handles
    for (const sx of [-1, 1]) {
      const h = mesh(new THREE.TorusGeometry(0.035, 0.007, 10, 24, Math.PI), M.plasticDark(), sx * (FW / 2 + 0.004), FH - 0.04, 0);
      h.rotation.y = Math.PI / 2;
      h.rotation.z = sx * -Math.PI / 2;
      h.rotation.order = 'YZX';
      this.model.add(h);
    }

    // Hinged lid (pivot along the back top edge)
    this.lid = new THREE.Group();
    this.lid.position.set(0, FH + 0.004, -FD / 2);
    const lidBody = mesh(roundedBox(FW + 0.006, 0.034, FD + 0.006, 0.012), shell, 0, 0.017, FD / 2);
    const lidTop = mesh(roundedBox(FW - 0.04, 0.006, FD - 0.05, 0.01), band, 0, 0.036, FD / 2);
    const grip = mesh(roundedBox(0.12, 0.016, 0.02, 0.006), M.plasticDark(), 0, 0.014, FD + 0.012);
    this.lid.add(lidBody, lidTop, grip);
    this.lid.rotation.x = this.lidAngle;
    this.model.add(this.lid);

    // Front control panel: temperature display, power and lid buttons
    const panel = mesh(roundedBox(0.22, 0.075, 0.006, 0.008), M.plasticDark(), 0, 0.115, FD / 2 + 0.002);
    this.model.add(panel);
    this.display = new Screen(0.09, 0.04, 360, 160);
    this.display.mesh.position.set(-0.045, 0.118, FD / 2 + 0.0055);
    this.model.add(this.display.mesh);
    this.powerBtn = new PokeButton(app, { radius: 0.011, height: 0.008, color: 0x32c26a, parent: this.model, onPress: () => this.setPower(!this.powered) });
    this.powerBtn.group.position.set(0.035, 0.122, FD / 2 + 0.005);
    this.powerBtn.group.rotation.x = Math.PI / 2;
    this.lidBtn = new PokeButton(app, { radius: 0.011, height: 0.008, color: 0x2f8fff, parent: this.model, onPress: () => this.toggleLid() });
    this.lidBtn.group.position.set(0.075, 0.122, FD / 2 + 0.005);
    this.lidBtn.group.rotation.x = Math.PI / 2;
    const l1 = label('POWER', 0.034, 0.009, '#cfd8e2');
    l1.position.set(0.035, 0.095, FD / 2 + 0.0056);
    const l2 = label('LID', 0.034, 0.009, '#cfd8e2');
    l2.position.set(0.075, 0.095, FD / 2 + 0.0056);
    const brand = label('PORTABLE FREEZER  −30 °C', 0.2, 0.016, '#1f6fcf');
    brand.position.set(0, 0.17, FD / 2 + 0.0002);
    this.model.add(l1, l2, brand);

    this.colliderSpecs = [
      { type: 'box', hx: FW / 2, hy: FLOOR / 2, hz: FD / 2, pos: [0, FLOOR / 2, 0], friction: 0.9 },
      { type: 'box', hx: WALL / 2, hy: FH / 2, hz: FD / 2, pos: [-FW / 2 + WALL / 2, FH / 2, 0] },
      { type: 'box', hx: WALL / 2, hy: FH / 2, hz: FD / 2, pos: [FW / 2 - WALL / 2, FH / 2, 0] },
      { type: 'box', hx: FW / 2 - WALL, hy: FH / 2, hz: WALL / 2, pos: [0, FH / 2, -FD / 2 + WALL / 2] },
      { type: 'box', hx: FW / 2 - WALL, hy: FH / 2, hz: WALL / 2, pos: [0, FH / 2, FD / 2 - WALL / 2] },
    ];
    this.finalize();
    app.heatSources.push(this);
    this.updateDisplay();
  }

  setPower(on) {
    this.powered = on;
    this.powerBtn.capMat.color.setHex(on ? 0x32c26a : 0x55606c);
    this.powerBtn.capMat.emissive.setHex(on ? 0x32c26a : 0x000000);
    this.updateHum();
  }

  updateHum() {
    const want = this.powered && !this.removed;
    if (want && !this.hum && this.app.audio?.ctx) this.hum = this.app.audio.loop('hum', { position: this.object.position, volume: 0.06 });
    if (!want && this.hum) { this.hum.stop(); this.hum = null; }
  }

  /** Is the world point inside the freezing compartment? */
  inside(p) {
    this.object.updateWorldMatrix(true, false);
    _inv.copy(this.object.matrixWorld).invert();
    const l = _v2.copy(p).applyMatrix4(_inv);
    return Math.abs(l.x) < FW / 2 - WALL + 0.005 && Math.abs(l.z) < FD / 2 - WALL + 0.005 && l.y > FLOOR - 0.01 && l.y < FH + 0.03;
  }

  toggleLid(open = !this.lidOpen) {
    if (!open && this.somethingInTheWay()) {
      this.app.toasts?.show('Something is sticking out — the lid can’t close.', '#ffb35a', 2.5);
      this.app.audio?.play('denied', { position: this.object.position, volume: 0.4 });
      return;
    }
    this.lidOpen = open;
    if (open) this.setLidCollider(false);
  }

  somethingInTheWay() {
    this.object.updateWorldMatrix(true, false);
    _inv.copy(this.object.matrixWorld).invert();
    const lidBox = new THREE.Box3(new THREE.Vector3(-FW / 2, FH - 0.004, -FD / 2), new THREE.Vector3(FW / 2, FH + 0.04, FD / 2));
    const b = new THREE.Box3();
    for (const e of this.app.entities) {
      if (e === this || e.removed || e.disabled || e.kind === 'panel' || e.kind === 'machine' || !e.body) continue;
      b.copy(e.localBounds).applyMatrix4(_inv.clone().multiply(e.object.matrixWorld));
      if (b.intersectsBox(lidBox)) return true;
    }
    return false;
  }

  setLidCollider(on) {
    const P = this.app.physics;
    if (on && !this.lidCollider && this.body) {
      const desc = P.R.ColliderDesc.cuboid(FW / 2, 0.017, FD / 2).setTranslation(0, FH + 0.021, 0).setFriction(0.8).setMass(0.4);
      this.lidCollider = P.addCollider(desc, this.body, this);
    } else if (!on && this.lidCollider) {
      P.removeCollider(this.lidCollider);
      this.lidCollider = null;
    }
  }

  createBody(position, quaternion) {
    this.lidCollider = null;
    const b = super.createBody(position, quaternion);
    if (!this.lidOpen) this.setLidCollider(true);
    return b;
  }

  ambientAt(p) {
    return this.inside(p) ? this.innerT : null;
  }

  heatFor(container) {
    if (this.disabled) return null;
    const p = container.worldBounds(new THREE.Box3()).getCenter(_v);
    if (!this.inside(p)) return null;
    // Fan-forced cold air: much faster than standing in still air.
    return { rate: 0, env: this.innerT, coupling: this.lidOpen ? 2.5 : 5 };
  }

  update(dt) {
    super.update(dt);
    this.updateHum();
    if (this.hum) this.hum.setPosition(this.object.position);
    // Lid animation
    const target = this.lidOpen ? -1.95 : 0;
    const prev = this.lidAngle;
    this.lidAngle += Math.sign(target - this.lidAngle) * Math.min(Math.abs(target - this.lidAngle), dt * 4.5);
    this.lid.rotation.x = this.lidAngle;
    if (!this.lidOpen && prev !== 0 && this.lidAngle === 0) {
      this.setLidCollider(true);
      this.app.audio?.play('lid', { position: this.object.position, volume: 0.5 });
    }
    // Compartment temperature
    const goal = !this.powered ? 22 : this.lidOpen ? SETPOINT + 12 : SETPOINT;
    const k = this.powered ? (this.lidOpen ? 0.05 : 0.12) : 0.01;
    this.innerT += (goal - this.innerT) * Math.min(1, dt * k);
    // Cold mist pouring out of the open lid
    if (this.lidOpen && this.innerT < -5 && Math.random() < dt * 9) {
      this.object.updateWorldMatrix(true, false);
      const p = _v.set((Math.random() - 0.5) * (FW - 0.06), FH + 0.01, (Math.random() - 0.5) * (FD - 0.06)).applyMatrix4(this.object.matrixWorld);
      this.app.effects.soft.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.03, -0.02, (Math.random() - 0.5) * 0.03), new THREE.Color(0xeaf6ff), 0.12, 0.02, 1.4, { drag: 1.5, grow: 0.03 });
    }
    const frost = THREE.MathUtils.clamp((5 - this.innerT) / 30, 0, 1);
    this.frostMat.color.setRGB(0.82 + frost * 0.14, 0.9 + frost * 0.08, 0.97 + frost * 0.03);
    this.frostMat.roughness = 0.5 + frost * 0.45;
    this.displayT = (this.displayT || 0) - dt;
    if (this.displayT <= 0) {
      this.displayT = 0.25;
      this.updateDisplay();
    }
  }

  updateDisplay() {
    const t = Math.round(this.innerT);
    const status = !this.powered ? 'OFF' : this.lidOpen ? 'LID OPEN' : t > SETPOINT + 2 ? 'COOLING…' : 'READY';
    this.display.show(`${t < 0 ? '−' : ''}${Math.abs(t)} °C`, status, this.powered ? '#8fd8ff' : '#55606c');
  }

  saveState() {
    return { powered: this.powered, lidOpen: this.lidOpen, innerT: this.innerT };
  }

  loadState(s) {
    this.setPower(s.powered);
    this.innerT = s.innerT;
    this.lidOpen = s.lidOpen;
    this.lidAngle = s.lidOpen ? -1.95 : 0;
    this.setLidCollider(!s.lidOpen);
    this.updateDisplay();
  }

  destroy() {
    if (this.hum) { this.hum.stop(); this.hum = null; }
    this.powerBtn.dispose();
    this.lidBtn.dispose();
    const i = this.app.heatSources.indexOf(this);
    if (i >= 0) this.app.heatSources.splice(i, 1);
    super.destroy();
  }
}

// ---------------------------------------------------------------------------------------

const ML = 0.07; // match length (a little bigger than life so it is easy to hold in VR)
const BURN_TIME = 25;

export class Matchstick extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'wood', mass: 0.004, breakable: false });
    this.breakable = false;
    this.state = 'fresh'; // fresh | burning | spent
    this.burnT = 0;
    this.woodMat = new THREE.MeshStandardMaterial({ color: 0xe6c690, roughness: 0.8 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xb3241c, roughness: 0.75, emissive: 0x000000 });
    this.charMat = new THREE.MeshStandardMaterial({ color: 0x1d1714, roughness: 1 });
    for (const m of [this.woodMat, this.headMat, this.charMat]) m.userData.noClone = true;
    this.stick = mesh(new THREE.BoxGeometry(0.0034, ML, 0.0034), this.woodMat, 0, ML / 2, 0);
    this.head = mesh(new THREE.SphereGeometry(0.0042, 14, 10), this.headMat, 0, ML + 0.002, 0);
    this.head.scale.set(1, 1.5, 1);
    this.char = mesh(new THREE.BoxGeometry(0.0036, 1, 0.0036), this.charMat, 0, ML, 0);
    this.char.geometry.translate(0, -0.5, 0);
    this.char.scale.y = 0.0001;
    this.char.visible = false;
    this.model.add(this.stick, this.head, this.char);

    this.flame = new THREE.Group();
    this.flameOuter = flameMesh(0.0065, 0.036, '#ff8a22', 0.85);
    this.flameInner = flameMesh(0.003, 0.013, '#fff0b0', 1);
    this.flameBase = flameMesh(0.004, 0.008, '#4a6bff', 0.6);
    this.flameOuter.position.y = -0.004;
    this.flame.add(this.flameOuter, this.flameInner, this.flameBase);
    this.flame.visible = false;
    this.object.add(this.flame);

    this.colliderSpecs = [
      { type: 'box', hx: 0.0017, hy: ML / 2, hz: 0.0017, pos: [0, ML / 2, 0], friction: 0.8 },
      { type: 'ball', r: 0.0042, pos: [0, ML + 0.002, 0] },
    ];
    this.finalize();
    // Easier to grab than its tiny size suggests.
    this.localBounds.expandByScalar(0.008);
    this.prevHead = null;
    app.heatSources.push(this);
  }

  get on() {
    return this.state === 'burning';
  }

  headPoint(out = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    return out.set(0, ML + 0.003, 0).applyMatrix4(this.object.matrixWorld);
  }

  /** Thermometers / flame tests read the flame here. */
  flamePoint(out = new THREE.Vector3()) {
    return this.headPoint(out).add(_v2.set(0, 0.012, 0));
  }

  ignite(silent = false) {
    if (this.state !== 'fresh') return;
    this.state = 'burning';
    this.burnT = 0;
    this.flame.visible = true;
    this.headMat.color.setHex(0x3a2a22);
    const p = this.headPoint(new THREE.Vector3());
    if (!silent) {
      this.app.audio?.play('strike', { position: p, volume: 0.6 });
      this.app.effects.spark(p, 0xffc070, 8, 0.5);
      this.app.effects.smoke(p, 0xd8d8d8, 0.3, 0.02, 0.1);
    }
    if (this.app.audio?.ctx && !this.sound) this.sound = this.app.audio.loop('flame', { position: p, volume: 0.06 });
    this.app.events.emit('matchLit', this);
  }

  extinguish(reason = 'out') {
    if (this.state !== 'burning') return;
    this.state = 'spent';
    this.flame.visible = false;
    this.headMat.color.setHex(0x161210);
    this.headMat.emissive.setHex(0x000000);
    if (this.sound) { this.sound.stop(); this.sound = null; }
    const p = this.headPoint(new THREE.Vector3());
    if (reason === 'water') {
      this.app.audio?.play('hiss', { position: p, volume: 0.5 });
      this.app.effects.steam(p, 1);
    }
    this.smokeT = 2.5;
  }

  heatFor(container) {
    if (this.state !== 'burning' || this.disabled) return null;
    const head = this.flamePoint(_v);
    const rim = container.rim();
    // Flame at (or inside) the mouth of the container, or held under its base.
    const nearMouth = head.distanceTo(rim.center) < Math.max(0.03, rim.radius + 0.01);
    container.object.updateWorldMatrix(true, false);
    _inv.copy(container.object.matrixWorld).invert();
    const l = _v2.copy(head).applyMatrix4(_inv);
    const inside = l.y > container.bottomY && l.y < container.rimY && Math.hypot(l.x, l.z) < container.rimR;
    const under = l.y < container.bottomY && l.y > container.bottomY - 0.05 && Math.hypot(l.x, l.z) < container.rimR + 0.01;
    if (!nearMouth && !inside && !under) return null;
    return { rate: under ? 0.35 : 0, flame: nearMouth || inside };
  }

  update(dt) {
    super.update(dt);
    const head = this.headPoint(_v);
    const prev = this.prevHead;
    const speed = prev ? head.distanceTo(prev) / Math.max(dt, 1e-3) : 0;
    this.prevHead = (this.prevHead || new THREE.Vector3()).copy(head);

    if (this.state === 'fresh') {
      if (this.isHeld) {
        if (this.holds.some((r) => r.hand.useDown)) this.ignite();
        else if (speed > 0.55 && this.touchingSurface(head) && Math.random() < 0.55) this.ignite();
      }
      return;
    }

    if (this.state === 'burning') {
      this.burnT += dt;
      // Flames always point up, whatever the match's orientation.
      this.flame.position.set(0, ML + 0.003, 0);
      this.object.getWorldQuaternion(_q).invert();
      this.flame.quaternion.copy(_q);
      const t = performance.now() / 1000;
      for (const f of [this.flameOuter, this.flameInner, this.flameBase]) f.material.uniforms.uTime.value = t;
      const flare = Math.max(0, 1 - this.burnT / 0.6); // first big flare of the head
      const dying = Math.min(1, (BURN_TIME - this.burnT) / 4);
      const s = (0.75 + flare * 0.9) * Math.max(0.25, dying);
      this.flame.scale.set(s, s * (1 + flare * 0.5), s);
      this.headMat.emissive.setRGB(0.9 * dying, 0.3 * dying, 0.05);
      // Charring creeps down the stick
      const charFrac = Math.min(0.85, this.burnT / BURN_TIME);
      this.char.visible = true;
      this.char.scale.y = Math.max(0.0001, charFrac * ML);
      if (this.sound) this.sound.setPosition(head);
      if (Math.random() < dt * 3) this.app.effects.glow.emit(head.clone().add(_v2.set(0, 0.03, 0)), new THREE.Vector3(0, 0.12, 0), 0xffa040, 0.25, 0.004, 0.4);
      if (Math.random() < dt * 1.5) this.app.effects.smoke(head.clone().add(_v2.set(0, 0.04, 0)), 0x777777, 0.08, 0.012, 0.08);
      // Light other matches
      for (const e of this.app.entities) {
        if (e !== this && e instanceof Matchstick && e.state === 'fresh' && !e.removed && e.headPoint(_v2).distanceTo(head) < 0.018) e.ignite();
      }
      // Dunked in a liquid?
      for (const c of this.app.entities) {
        if (!c.isContainer || c.removed || c.disabled) continue;
        if (c.object.position.distanceTo(head) > 0.4) continue;
        if (c.pointInLiquid(head)) {
          // A flammable liquid catches fire instead of putting the match out.
          const flammable = [...c.contents.items].some(([id, ml]) => ml > 0.5 && SUBSTANCES[id]?.flammable);
          if (!flammable) { this.extinguish('water'); return; }
        }
      }
      // Shaken out
      // (a sustained flick, so a single tracking glitch can't blow it out)
      this.shakeT = this.isHeld && speed > 3.2 ? (this.shakeT || 0) + dt : 0;
      if (this.shakeT > 0.06) { this.extinguish(); return; }
      if (this.burnT > BURN_TIME) this.extinguish();
      return;
    }

    // Spent: a little smoke drifts off the head for a moment.
    if (this.smokeT > 0) {
      this.smokeT -= dt;
      if (Math.random() < dt * 8) this.app.effects.smoke(head.clone(), 0x9a9a9a, 0.12 * Math.min(1, this.smokeT), 0.012, 0.1);
    }
  }

  /** Is the match head rubbing along something solid (the table, the box, a wall …)? */
  touchingSurface(head) {
    const P = this.app.physics;
    if (!P.world || !this.body) return false;
    let proj;
    try {
      proj = P.world.projectPoint(head, true, undefined, undefined, undefined, this.body, (c) => {
        const o = P.ownerOf(c);
        return !(o && (o.kind === 'molecule' || o === this));
      });
    } catch {
      return false;
    }
    if (!proj) return false;
    const d = Math.hypot(proj.point.x - head.x, proj.point.y - head.y, proj.point.z - head.z);
    return proj.isInside || d < 0.009;
  }

  saveState() {
    return { state: this.state, burnT: this.burnT };
  }

  loadState(s) {
    if (s.state === 'burning') {
      this.ignite(true);
      this.burnT = s.burnT;
    } else if (s.state === 'spent') {
      this.state = 'burning';
      this.extinguish();
      this.smokeT = 0;
      this.char.visible = true;
      this.char.scale.y = 0.85 * ML;
    }
  }

  destroy() {
    if (this.sound) { this.sound.stop(); this.sound = null; }
    const i = this.app.heatSources.indexOf(this);
    if (i >= 0) this.app.heatSources.splice(i, 1);
    super.destroy();
  }
}

// ---------------------------------------------------------------------------------------

export class Matchbox extends Equipment {
  constructor(app, def) {
    super(app, { ...def, material: 'wood', mass: 0.03, breakable: false });
    this.breakable = false;
    const W = 0.075, H = 0.022, D = 0.05;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 340;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c8322a';
    ctx.fillRect(0, 0, 512, 340);
    ctx.fillStyle = '#f6e7c8';
    ctx.fillRect(18, 18, 476, 304);
    ctx.fillStyle = '#c8322a';
    ctx.font = '900 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MATCHES', 256, 150);
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillStyle = '#4a2a1a';
    ctx.fillText('strike anywhere', 256, 220);
    ctx.fillText('press ● for a match', 256, 275);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const side = new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.8 });
    const striker = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 1 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [striker, striker, top, side, side, side]);
    box.position.y = H / 2;
    this.model.add(box);
    this.btn = new PokeButton(app, { radius: 0.0075, height: 0.006, color: 0xd8262a, parent: this.model, onPress: () => this.dispense() });
    this.btn.group.position.set(W / 2 - 0.012, H, D / 2 - 0.01);
    this.colliderSpecs = [{ type: 'box', hx: W / 2, hy: H / 2, hz: D / 2, pos: [0, H / 2, 0], friction: 1 }];
    this.finalize();
  }

  dispense() {
    this.app.history?.record('Take a match');
    this.object.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(0, 0.05, 0).applyMatrix4(this.object.matrixWorld);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2).premultiply(this.object.quaternion);
    const m = this.app.spawnEquipment('match', pos, q, { stasis: true });
    this.app.audio?.play('pickAtom', { position: pos, volume: 0.3 });
    // Keep the bench tidy: only a dozen matches at a time (spent ones go first).
    const all = this.app.entities.filter((e) => e instanceof Matchstick && !e.removed && !e.isHeld);
    if (all.length > 12) {
      all.sort((a, b) => (b.state === 'spent') - (a.state === 'spent'));
      for (const e of all.slice(0, all.length - 12)) if (e !== m) e.destroy();
    }
    return m;
  }

  destroy() {
    this.btn.dispose();
    super.destroy();
  }
}
