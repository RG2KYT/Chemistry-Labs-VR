import * as THREE from 'three';
import { Entity } from '../core/Entity.js';
import { PokeButton } from './Equipment.js';
import { CanvasScreen } from '../ui/CanvasScreen.js';
import { Mixture } from '../chem/Mixture.js';
import { M, roundedBox } from './materials.js';
import { font, roundRect, drawFormula, drawWrapped, fitFont } from '../ui/canvasUtil.js';
import { Molecule } from '../chem/Molecule.js';
import { BY_SYMBOL } from '../chem/elements.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const PAD = new THREE.Vector3(0, 0.312, 0.04); // dock pad top (local)
const NOZZLE = new THREE.Vector3(0, 0.695, 0.04);
const INTAKE = new THREE.Vector3(0, 1.53, 0);
const AMOUNTS = [25, 50, 100, 250];
const POUR_RATE = 70; // mL/s

const STATE_TEXT = {
  idle: ['READY', '#7fe3ff'],
  analyzing: ['ANALYZING', '#ffd27a'],
  rejected: ['REJECTED', '#ff7a6a'],
  waiting: ['NEEDS CONTAINER', '#ffb35a'],
  synthesizing: ['SYNTHESIZING', '#c69bff'],
  flowing: ['DISPENSING', '#8ff0c2'],
  pouring: ['DISPENSING', '#8ff0c2'],
  done: ['COMPLETE', '#8ff0c2'],
};

/**
 * The Molecular Synthesizer. Drop a molecule into the reactor on top; it is analysed and
 * turned into the real substance, which flows down the glass tube and pours from the
 * nozzle into the container docked in the bay below.
 */
export class Machine extends Entity {
  constructor(app) {
    super(app);
    this.kind = 'machine';
    this.dissolvable = false;
    this.distanceGrabMode = 'remote';
    this.state = 'idle';
    this.stateT = 0;
    this.queue = [];
    this.current = null; // { record, identity, substance }
    this.amountIndex = 2;
    this.remaining = 0;
    this.docked = null;
    this.message = 'Drop a molecule into the reactor on top.';
    this.messageColor = '#a9c6e6';
    this.tubeFill = 0;
    this.tubeDrain = 0;
    this.time = 0;
    this.lastProduct = null;
    this.buildModel();
    this.buildScreen();
  }

  // ------------------------------------------------------------------------------------
  // Model

  buildModel() {
    const body = new THREE.MeshStandardMaterial({ color: 0xe8ecf1, roughness: 0.32, metalness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x232833, roughness: 0.45, metalness: 0.4 });
    this.accentMat = new THREE.MeshStandardMaterial({ color: 0x0c3a52, emissive: 0x2fbfff, emissiveIntensity: 1.2, roughness: 0.3 });
    const m = this.model = new THREE.Group();
    this.object.add(m);
    const add = (geo, mat, x, y, z) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      m.add(o);
      return o;
    };
    // Base cabinet + dock bay
    add(roundedBox(0.64, 0.3, 0.52, 0.04), body, 0, 0.15, 0);
    add(new THREE.BoxGeometry(0.5, 0.012, 0.004), this.accentMat, 0, 0.27, 0.262);
    add(roundedBox(0.1, 0.54, 0.52, 0.03), body, -0.27, 0.56, 0);
    add(roundedBox(0.1, 0.54, 0.52, 0.03), body, 0.27, 0.56, 0);
    add(new THREE.BoxGeometry(0.44, 0.52, 0.03), dark, 0, 0.56, -0.235);
    add(new THREE.BoxGeometry(0.44, 0.02, 0.5), dark, 0, 0.303, 0);
    // Dock pad
    add(new THREE.CylinderGeometry(0.1, 0.104, 0.012, 48), dark, PAD.x, PAD.y - 0.006, PAD.z);
    this.padRingMat = new THREE.MeshBasicMaterial({ color: 0x2fbfff, toneMapped: false });
    const padRing = add(new THREE.TorusGeometry(0.1, 0.004, 8, 48), this.padRingMat, PAD.x, PAD.y, PAD.z);
    padRing.rotation.x = Math.PI / 2;
    // Bay light
    add(new THREE.BoxGeometry(0.3, 0.006, 0.02), this.accentMat, 0, 0.815, 0.15);
    // Top slab + console
    add(roundedBox(0.64, 0.46, 0.52, 0.04), body, 0, 1.05, 0);
    add(new THREE.BoxGeometry(0.6, 0.01, 0.004), this.accentMat, 0, 0.84, 0.262);
    // Nozzle
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 20), M.chrome(), NOZZLE.x, 0.81, NOZZLE.z);
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.08, 20), M.chrome(), NOZZLE.x, 0.755, NOZZLE.z);
    add(new THREE.CylinderGeometry(0.011, 0.005, 0.02, 20), M.chrome(), NOZZLE.x, NOZZLE.y + 0.01, NOZZLE.z);
    // Reactor
    add(new THREE.CylinderGeometry(0.2, 0.21, 0.04, 48), M.chrome(), 0, 1.3, 0);
    const glass = add(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 48, 1, true), M.glassDouble(), 0, 1.43, 0);
    glass.renderOrder = 3;
    this.intakeMat = new THREE.MeshBasicMaterial({ color: 0x2fbfff, toneMapped: false });
    const intake = add(new THREE.TorusGeometry(0.16, 0.012, 12, 64), this.intakeMat, 0, 1.54, 0);
    intake.rotation.x = Math.PI / 2;
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.85, toneMapped: false });
    this.core = add(new THREE.TorusGeometry(0.075, 0.006, 8, 48), this.coreMat, 0, 1.38, 0);
    this.core2 = add(new THREE.TorusGeometry(0.05, 0.004, 8, 48), this.coreMat, 0, 1.38, 0);
    this.orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    this.orb = add(new THREE.SphereGeometry(0.06, 24, 16), this.orbMat, 0, 1.4, 0);
    // Hologram hint above the intake
    const hc = document.createElement('canvas');
    hc.width = 512; hc.height = 128;
    const hctx = hc.getContext('2d');
    hctx.fillStyle = '#7fe3ff';
    hctx.font = font(44, 700);
    hctx.textAlign = 'center';
    hctx.textBaseline = 'middle';
    hctx.fillText('▼ DROP MOLECULE HERE ▼', 256, 64);
    const ht = new THREE.CanvasTexture(hc);
    ht.colorSpace = THREE.SRGBColorSpace;
    this.hint = new THREE.Sprite(new THREE.SpriteMaterial({ map: ht, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.hint.scale.set(0.34, 0.085, 1);
    this.hint.position.set(0, 1.7, 0);
    this.hint.userData.noPick = true;
    m.add(this.hint);
    // Glass tube from reactor down the side and into the nozzle
    const pts = [new THREE.Vector3(0.14, 1.31, 0.06), new THREE.Vector3(0.27, 1.3, 0.12), new THREE.Vector3(0.345, 1.28, 0.1)];
    const turns = 3.2, y0 = 1.25, y1 = 0.93;
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const a = t * turns * Math.PI * 2 + Math.PI / 2;
      pts.push(new THREE.Vector3(0.36 + Math.cos(a) * 0.045, y0 + (y1 - y0) * t, 0.05 + Math.sin(a) * 0.045));
    }
    pts.push(new THREE.Vector3(0.33, 0.9, 0.2), new THREE.Vector3(0.2, 0.875, 0.285), new THREE.Vector3(0.05, 0.86, 0.29),
      new THREE.Vector3(0.0, 0.83, 0.27), new THREE.Vector3(0.0, 0.81, 0.17), new THREE.Vector3(0.0, 0.83, 0.07));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGlass = add(new THREE.TubeGeometry(curve, 260, 0.011, 12), M.glass(), 0, 0, 0);
    tubeGlass.renderOrder = 3;
    tubeGlass.castShadow = false;
    this.flowUniforms = { uFill: { value: 0 }, uDrain: { value: 0 }, uTime: { value: 0 } };
    this.flowMat = new THREE.MeshPhysicalMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.8, roughness: 0.05, depthWrite: false });
    this.flowMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.flowUniforms);
      shader.vertexShader = 'varying vec2 vFlowUv;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFlowUv = uv;');
      shader.fragmentShader = 'uniform float uFill; uniform float uDrain; uniform float uTime; varying vec2 vFlowUv;\n' + shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         if (vFlowUv.x > uFill || vFlowUv.x < uDrain) discard;`,
      ).replace('#include <dithering_fragment>', `#include <dithering_fragment>
         gl_FragColor.rgb *= 0.85 + 0.15 * sin(vFlowUv.x * 160.0 - uTime * 18.0);`);
    };
    this.flowMat.customProgramCacheKey = () => 'machine-flow';
    this.flow = add(new THREE.TubeGeometry(curve, 260, 0.0078, 10), this.flowMat, 0, 0, 0);
    this.flow.renderOrder = 2;
    this.flow.castShadow = false;
    this.flow.userData.noHighlight = true;
    // Side handles for moving the machine
    this.handleMat = new THREE.MeshStandardMaterial({ color: 0xc9d3de, metalness: 0.85, roughness: 0.25, emissive: 0x000000 });
    this.handleSegments = [];
    this.pickMeshes = [];
    for (const sx of [-1, 1]) {
      const x = sx * 0.37;
      const bar = add(new THREE.CapsuleGeometry(0.014, 0.2, 6, 12), this.handleMat, x, 1.08, -0.12);
      this.pickMeshes.push(bar);
      for (const y of [0.97, 1.19]) {
        const stem = add(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 8), this.handleMat, x - sx * 0.025, y, -0.12);
        stem.rotation.z = Math.PI / 2;
      }
      this.handleSegments.push({ a: new THREE.Vector3(x, 0.97, -0.12), b: new THREE.Vector3(x, 1.19, -0.12) });
    }
    // Status light strip
    this.statusMat = new THREE.MeshBasicMaterial({ color: 0x2fbfff, toneMapped: false });
    add(new THREE.BoxGeometry(0.5, 0.014, 0.006), this.statusMat, 0, 1.265, 0.262);
    this.localBounds.set(new THREE.Vector3(-0.4, 0, -0.27), new THREE.Vector3(0.4, 1.6, 0.27));
  }

  buildScreen() {
    this.screen = new CanvasScreen(this.app, 0.4, 0.25, 1500, (ctx, w, h, s) => this.drawScreen(ctx, w, h, s));
    this.screen.mesh.position.set(-0.07, 1.07, 0.263);
    this.model.add(this.screen.mesh);
    const bezel = new THREE.Mesh(roundedBox(0.42, 0.27, 0.01, 0.01), new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.4 }));
    bezel.position.set(-0.07, 1.07, 0.258);
    this.model.add(bezel);

    // Reset: big red button, hold to confirm
    this.resetBtn = new PokeButton(this.app, { radius: 0.03, height: 0.018, color: 0xd8262a, holdTime: 1.6, parent: this.model, onPress: () => this.app.resetLab() });
    this.resetBtn.group.position.set(0.215, 1.03, 0.262);
    this.resetBtn.group.rotation.x = Math.PI / 2;
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.5 }));
    guard.position.set(0.215, 1.03, 0.266);
    this.model.add(guard);
    this.resetRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
    this.resetRing = new THREE.Mesh(new THREE.RingGeometry(0.042, 0.05, 48, 1, 0, 0.001), this.resetRingMat);
    this.resetRing.position.set(0.215, 1.03, 0.267);
    this.model.add(this.resetRing);
    const lc = document.createElement('canvas');
    lc.width = 256; lc.height = 96;
    const lctx = lc.getContext('2d');
    lctx.fillStyle = '#1b1f27';
    lctx.fillRect(0, 0, 256, 96);
    lctx.fillStyle = '#ffd24a';
    lctx.font = font(30, 800);
    lctx.textAlign = 'center';
    lctx.fillText('RESET LAB', 128, 40);
    lctx.fillStyle = '#c8cdd6';
    lctx.font = font(22, 600);
    lctx.fillText('hold 2 seconds', 128, 76);
    const lt = new THREE.CanvasTexture(lc);
    lt.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.0375), new THREE.MeshBasicMaterial({ map: lt, toneMapped: false }));
    label.position.set(0.215, 1.135, 0.263);
    this.model.add(label);
  }

  createBody() {
    const P = this.app.physics;
    const R = P.R;
    if (this.body) P.removeBody(this.body);
    this.body = this.app.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this.object.position.x, this.object.position.y, this.object.position.z)
      .setRotation(this.object.quaternion));
    const box = (hx, hy, hz, x, y, z) => P.addCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.9), this.body, this);
    box(0.32, 0.155, 0.26, 0, 0.155, 0);
    box(0.05, 0.27, 0.26, -0.27, 0.56, 0);
    box(0.05, 0.27, 0.26, 0.27, 0.56, 0);
    box(0.22, 0.26, 0.02, 0, 0.56, -0.235);
    box(0.32, 0.23, 0.26, 0, 1.05, 0);
    P.addCollider(R.ColliderDesc.cylinder(0.13, 0.17).setTranslation(0, 1.42, 0), this.body, this);
  }

  // ------------------------------------------------------------------------------------
  // Grabbing (move the machine by its side handles; it stays upright on the floor)

  grabDistance(point) {
    this.object.updateWorldMatrix(true, false);
    const local = this.object.worldToLocal(_v.copy(point));
    let best = Infinity;
    for (const s of this.handleSegments) {
      const ab = _v2.copy(s.b).sub(s.a);
      const t = THREE.MathUtils.clamp(local.clone().sub(s.a).dot(ab) / ab.lengthSq(), 0, 1);
      const d = s.a.clone().addScaledVector(ab, t).distanceTo(local) - 0.016;
      best = Math.min(best, d);
    }
    return { dist: Math.max(0, best), part: 'handle' };
  }

  setHighlight(on) {
    this.highlighted = on;
    this.handleMat.emissive.setHex(this.holds.length ? 0x2b8fd0 : on ? 0x1d5d88 : 0);
  }

  onGrab(rec) {
    this.computeOffset(rec);
    rec.startYaw = this.yawOf(rec.hand.gripQuaternion);
    rec.machineYaw = this.yawOf(this.object.quaternion);
    rec.localGrip = this.object.worldToLocal(rec.hand.gripPosition.clone());
    this.setHighlight(true);
  }

  yawOf(q) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    return Math.atan2(-f.x, -f.z);
  }

  updateHolds() {
    const rec = this.holds[0];
    if (!rec) return;
    const yaw = rec.machineYaw + (this.yawOf(rec.hand.gripQuaternion) - rec.startYaw);
    const q = _q.setFromAxisAngle(UP, yaw);
    // Keep the grabbed point of the handle under the hand.
    const gripWorldOffset = rec.localGrip.clone().applyQuaternion(q);
    const pos = rec.hand.gripPosition.clone().sub(gripWorldOffset);
    pos.y = this.floorY ?? 0;
    this.object.position.copy(pos);
    this.object.quaternion.copy(q);
    if (this.body) {
      this.body.setNextKinematicTranslation(pos);
      this.body.setNextKinematicRotation(q);
    }
  }

  onRelease() {
    this.setHighlight(false);
  }

  placeAt(pos, yaw) {
    this.object.position.copy(pos);
    this.floorY = pos.y;
    this.object.quaternion.setFromAxisAngle(UP, yaw);
    if (this.body) {
      this.body.setTranslation(pos, true);
      this.body.setRotation(this.object.quaternion, true);
    }
  }

  // ------------------------------------------------------------------------------------
  // World helpers

  toWorld(local, out = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    return out.copy(local).applyMatrix4(this.object.matrixWorld);
  }

  get amount() {
    return AMOUNTS[this.amountIndex];
  }

  // ------------------------------------------------------------------------------------
  // Intake

  checkIntake(dt) {
    const intake = this.toWorld(INTAKE, new THREE.Vector3());
    for (const m of this.app.molecules.molecules) {
      if (m.isHeld || m.absorbing || m.disabled) continue;
      const d = m.object.position.distanceTo(intake);
      if (d < 0.2) {
        this.absorb(m, intake);
      } else if (d < 0.5 && m.body) {
        // Gentle pull towards the intake
        const dir = intake.clone().sub(m.object.position).normalize().multiplyScalar(0.6 * dt * 10);
        const v = m.body.linvel();
        m.body.setLinvel({ x: v.x * 0.9 + dir.x * 0.1, y: v.y * 0.9 + dir.y * 0.1, z: v.z * 0.9 + dir.z * 0.1 }, true);
      }
    }
  }

  absorb(m, intake) {
    m.absorbing = { t: 0, from: m.object.position.clone(), to: this.toWorld(new THREE.Vector3(0, 1.4, 0)) };
    if (m.body) m.body.setEnabled(false);
    m.grabbable = false;
    m.label.visible = false;
    this.app.audio?.play('suck', { position: intake, volume: 0.6 });
    const record = {
      atoms: m.atoms.map((a) => ({ symbol: a.el.symbol, local: a.local.clone() })),
      bonds: m.bonds.map((b) => [m.atoms.indexOf(b.a), m.atoms.indexOf(b.b), b.order]),
      identity: m.identity,
      quaternion: m.object.quaternion.clone(),
    };
    this.absorbing = this.absorbing || [];
    this.absorbing.push({ m, record });
  }

  updateAbsorbing(dt) {
    if (!this.absorbing) return;
    for (let i = this.absorbing.length - 1; i >= 0; i--) {
      const { m, record } = this.absorbing[i];
      const a = m.absorbing;
      a.t += dt / 0.7;
      const e = a.t * a.t;
      m.object.position.lerpVectors(a.from, a.to, e);
      m.object.scale.setScalar(Math.max(0.05, 1 - e * 0.95));
      m.object.rotation.y += dt * 8;
      if (Math.random() < dt * 40) this.app.effects.sparkle(m.object.position, 0x7fe3ff, 2, 0.03);
      if (a.t >= 1) {
        this.absorbing.splice(i, 1);
        m.destroy();
        this.queue.push(record);
      }
    }
  }

  /** Programmatic feed (tests / tutorial). */
  feed(molecule) {
    this.absorb(molecule, this.toWorld(INTAKE, new THREE.Vector3()));
  }

  // ------------------------------------------------------------------------------------
  // Dock

  updateDock(dt) {
    const d = this.docked;
    if (d && (d.removed || d.isHeld || d.disabled)) {
      if (!d.removed && !d.disabled && d.body && !d.isHeld) d.body.setBodyType(this.app.physics.R.RigidBodyType.Dynamic, true);
      this.docked = null;
      this.screen.dirty = true;
    }
    if (!this.docked) {
      this.object.updateWorldMatrix(true, false);
      const inv = this.object.matrixWorld.clone().invert();
      for (const e of this.app.entities) {
        if (!e.isContainer || e.isHeld || e.removed || e.disabled || e.stasis) continue;
        const local = e.object.position.clone().applyMatrix4(inv);
        if (Math.abs(local.x - PAD.x) < 0.11 && Math.abs(local.z - PAD.z) < 0.11 && local.y > PAD.y - 0.04 && local.y < PAD.y + 0.06) {
          const up = e.upVector(new THREE.Vector3());
          if (up.dot(UP.clone().applyQuaternion(this.object.quaternion)) < 0.9) continue;
          this.docked = e;
          this.dockT = 0;
          e.body?.setBodyType(this.app.physics.R.RigidBodyType.KinematicPositionBased, true);
          this.app.audio?.play('clink', { position: e.object.position, volume: 0.4 });
          this.screen.dirty = true;
          break;
        }
      }
    }
    if (this.docked) {
      const e = this.docked;
      this.dockT = Math.min(1, (this.dockT || 0) + dt * 4);
      const target = this.toWorld(PAD, new THREE.Vector3());
      const yaw = this.yawOf(e.object.quaternion);
      const tq = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
      const pos = e.object.position.clone().lerp(target, this.dockT < 1 ? 0.25 : 1);
      const q = e.object.quaternion.clone().slerp(tq, this.dockT < 1 ? 0.25 : 1);
      if (e.body) {
        e.body.setNextKinematicTranslation(pos);
        e.body.setNextKinematicRotation(q);
      } else {
        e.object.position.copy(pos);
        e.object.quaternion.copy(q);
      }
    }
  }

  // ------------------------------------------------------------------------------------
  // State machine

  setState(s, message, color) {
    this.state = s;
    this.stateT = 0;
    if (message !== undefined) {
      this.message = message;
      this.messageColor = color || '#a9c6e6';
    }
    this.screen.dirty = true;
  }

  update(dt) {
    this.time += dt;
    this.updateAbsorbing(dt);
    if (!this.isHeld) this.checkIntake(dt);
    this.updateDock(dt);
    this.stateT += dt;
    const s = this.state;

    if (s === 'idle' || s === 'done' || s === 'rejected') {
      if (this.queue.length && (s !== 'rejected' || this.stateT > 1.5)) {
        const record = this.queue.shift();
        this.current = { record, identity: record.identity, substance: record.identity.substance };
        this.setState('analyzing', 'Scanning molecular structure…', '#ffd27a');
        this.app.audio?.play('machineStart', { position: this.object.position, volume: 0.6 });
      }
    } else if (s === 'analyzing') {
      if (this.stateT > 1.3) {
        const id = this.current.identity;
        if (!id.ok) {
          this.setState('rejected', id.reason, '#ff9b8f');
          this.app.audio?.play('error', { position: this.object.position, volume: 0.6 });
          this.eject(this.current.record);
          this.current = null;
        } else {
          this.lastProduct = this.current.substance;
          this.startProduct(this.current.substance);
        }
      }
    } else if (s === 'waiting') {
      if (this.docked) this.setState('synthesizing', 'Synthesizing ' + this.current.substance.name + '…', '#c69bff');
    } else if (s === 'synthesizing') {
      if (this.stateT > 1.1) {
        this.setState('flowing');
        this.tubeFill = 0;
        this.tubeDrain = 0;
      }
    } else if (s === 'flowing') {
      this.tubeFill = Math.min(1, this.tubeFill + dt / 1.3);
      if (this.tubeFill >= 1) this.setState('pouring', `Dispensing ${this.current.substance.name}…`, '#8ff0c2');
    } else if (s === 'pouring') {
      this.pour(dt);
    } else if (s === 'drain') {
      this.tubeDrain = Math.min(1, this.tubeDrain + dt / 0.9);
      if (this.tubeDrain >= 1) {
        this.tubeFill = 0;
        this.tubeDrain = 0;
        this.setState('done');
      }
    }
    if (s !== 'pouring' && this.stream) {
      this.app.fluids.stop(this.stream);
      this.stream = null;
    }
    this.updateVisuals(dt);
    this.screen.update();
    if (this.screen.dirty === false && (this.state === 'pouring' || this.state === 'analyzing') && Math.floor(this.time * 6) !== this._lastTick) {
      this._lastTick = Math.floor(this.time * 6);
      this.screen.dirty = true;
    }
  }

  startProduct(substance) {
    this.current = this.current || { substance };
    this.current.substance = substance;
    const s = substance;
    if (s.phase === 'gas') this.remaining = Infinity; // fill the container
    else if (s.phase === 'solid') this.remaining = this.amount / (s.density || 1);
    else this.remaining = this.amount;
    this.app.events.emit('synthesize', s);
    if (!this.docked) this.setState('waiting', `Identified: ${s.name}. Place a beaker or flask in the dock below.`, '#ffb35a');
    else this.setState('synthesizing', 'Synthesizing ' + s.name + '…', '#c69bff');
  }

  repeat() {
    if (!this.lastProduct || !['idle', 'done', 'rejected'].includes(this.state)) return;
    this.current = { substance: this.lastProduct };
    this.startProduct(this.lastProduct);
  }

  cancel() {
    if (this.stream) { this.app.fluids.stop(this.stream); this.stream = null; }
    this.queue.length = 0;
    this.current = null;
    this.tubeFill = 0;
    this.setState('idle', 'Cancelled. Drop a molecule into the reactor on top.', '#a9c6e6');
  }

  pour(dt) {
    const sub = this.current.substance;
    const c = this.docked;
    if (!c) {
      // Valve closes until a container is back in the dock.
      this.message = 'Paused — put a container back in the dock.';
      this.messageColor = '#ffb35a';
      if (this.stream) { this.app.fluids.stop(this.stream); this.stream = null; }
      return;
    }
    const nozzle = this.toWorld(NOZZLE, new THREE.Vector3());
    if (sub.phase === 'gas') {
      const add = Math.min(c.capacity * 0.9 * dt, c.capacity * 1.1 - c.contents.gasVolume);
      if (add > 0) c.addSubstance(sub.id, add + c.capacity * 0.1 * dt);
      const col = new THREE.Color(sub.opacity > 0.1 ? sub.color : '#e8f2ff');
      for (let i = 0; i < 3; i++) {
        const p = nozzle.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.01, -0.01, (Math.random() - 0.5) * 0.01));
        this.app.effects.soft.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.04, -0.25, (Math.random() - 0.5) * 0.04), col, Math.max(0.08, sub.opacity * 0.6), 0.012, 0.8, { drag: 1.5, grow: 0.03 });
      }
      if (this.stateT > 2.2) this.finish(`Filled ${c.name} with ${sub.name} gas.`);
      return;
    }
    const free = c.capacity - c.contents.total;
    if (free <= 0.5) {
      this.finish(`${c.name} is full! ${Math.round(this.remaining)} mL left — dock another container and press Make again.`, '#ffb35a');
      return;
    }
    const step = Math.min(this.remaining, POUR_RATE * dt, free);
    const mix = new Mixture();
    mix.add(sub.id, step);
    this.remaining -= step;
    this.stream = this.app.fluids.pour(this, this.stream, nozzle, new THREE.Vector3(0, -0.12, 0), mix, POUR_RATE, sub.phase === 'solid');
    if (this.remaining <= 0.01) {
      const unit = sub.phase === 'solid' ? 'g' : 'mL';
      this.finish(`Done: ${this.amount} ${unit} of ${sub.name} (${sub.formula}).`);
    }
  }

  finish(message, color = '#8ff0c2') {
    if (this.stream) { this.app.fluids.stop(this.stream); this.stream = null; }
    this.setState('drain', message, color);
    this.app.audio?.play('ding', { position: this.object.position, volume: 0.55 });
    this.app.events.emit('synthesized', this.current?.substance);
  }

  /** Spit a rejected molecule back out of the reactor. */
  eject(record) {
    const pos = this.toWorld(new THREE.Vector3(0, 1.75, 0.18));
    const specs = record.atoms.map((a) => ({ el: BY_SYMBOL[a.symbol], local: a.local }));
    const mol = Molecule.create(this.app, specs, record.bonds, pos, record.quaternion);
    this.app.addEntity(mol);
    const fwd = new THREE.Vector3(0, 0.6, 1.0).applyQuaternion(this.object.quaternion).multiplyScalar(0.5);
    mol.body.setLinvel(fwd, true);
    this.app.effects.sparkle(pos, 0xff7a6a, 20, 0.08);
  }

  // ------------------------------------------------------------------------------------
  // Visuals

  updateVisuals(dt) {
    const t = this.time;
    const busy = ['analyzing', 'synthesizing', 'flowing', 'pouring', 'drain'].includes(this.state);
    this.core.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.3;
    this.core.rotation.z += dt * (busy ? 6 : 0.8);
    this.core2.rotation.y += dt * (busy ? 9 : 1.2);
    this.core2.rotation.x = Math.PI / 2 + Math.cos(t) * 0.5;
    const sub = this.current?.substance;
    const prodColor = sub ? new THREE.Color(sub.phase === 'gas' && sub.opacity < 0.1 ? '#e8f4ff' : sub.color) : null;
    let ring = new THREE.Color(0x2fbfff);
    if (this.state === 'rejected') ring.set(0xff4a3a);
    else if (this.state === 'waiting') ring.set(0xffb35a);
    else if (busy && prodColor) ring = prodColor.clone().lerp(new THREE.Color(0xffffff), 0.3);
    const pulse = 0.65 + 0.35 * Math.sin(t * (busy ? 9 : 2.5));
    this.intakeMat.color.copy(ring).multiplyScalar(pulse + 0.2);
    this.statusMat.color.copy(ring);
    this.coreMat.color.copy(ring);
    this.orbMat.opacity = this.state === 'synthesizing' ? Math.min(1, this.stateT) * (0.6 + 0.4 * Math.sin(t * 20)) : this.state === 'analyzing' ? 0.25 + 0.2 * Math.sin(t * 14) : 0;
    if (prodColor) this.orbMat.color.copy(prodColor);
    this.orb.scale.setScalar(0.6 + this.orbMat.opacity * 0.6);
    this.hint.visible = this.state === 'idle' || this.state === 'done';
    this.hint.material.opacity = 0.6 + 0.3 * Math.sin(t * 3);
    // Dock pad ring
    const padCol = this.docked ? 0x5aff9c : this.state === 'waiting' ? (Math.sin(t * 8) > 0 ? 0xffb35a : 0x553311) : 0x2fbfff;
    this.padRingMat.color.setHex(padCol);
    // Tube flow
    this.flow.visible = this.tubeFill > 0;
    this.flowUniforms.uFill.value = this.tubeFill;
    this.flowUniforms.uDrain.value = this.tubeDrain;
    this.flowUniforms.uTime.value = t;
    if (sub) {
      this.flowMat.color.set(sub.phase === 'gas' && sub.opacity < 0.1 ? '#eef6ff' : sub.color);
      this.flowMat.opacity = sub.phase === 'liquid' ? Math.min(0.95, sub.opacity + 0.35) : sub.phase === 'gas' ? 0.3 + sub.opacity : 1;
      this.flowMat.metalness = sub.metalness || 0;
    }
    if (busy && Math.random() < dt * 25) {
      const p = this.toWorld(new THREE.Vector3((Math.random() - 0.5) * 0.2, 1.36 + Math.random() * 0.12, (Math.random() - 0.5) * 0.2));
      this.app.effects.glow.emit(p, new THREE.Vector3(0, 0.05, 0), prodColor || 0x7fe3ff, 0.8, 0.006, 0.4);
    }
    // Hum
    if (busy && !this.hum && this.app.audio?.ctx) this.hum = this.app.audio.loop('hum', { position: this.object.position, volume: 0.25 });
    if (!busy && this.hum) { this.hum.stop(); this.hum = null; }
    // Reset ring progress
    const prog = this.resetBtn.update(dt);
    this.resetRing.visible = prog > 0;
    if (prog > 0) {
      this.resetRing.geometry.dispose();
      this.resetRing.geometry = new THREE.RingGeometry(0.042, 0.05, 48, 1, Math.PI / 2, -prog * Math.PI * 2);
    }
  }

  drawScreen(ctx, w, h, screen) {
    const u = w / 600;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0d1520');
    bg.addColorStop(1, '#08101a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const m = 16 * u;
    // Header
    ctx.fillStyle = '#d8ecff';
    ctx.font = font(20 * u, 800);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('MOLECULAR SYNTHESIZER', m, m + 10 * u);
    const [label, col] = STATE_TEXT[this.state === 'drain' ? 'done' : this.state] || STATE_TEXT.idle;
    ctx.font = font(15 * u, 800);
    const lw = ctx.measureText(label).width + 22 * u;
    roundRect(ctx, w - m - lw, m - 2 * u, lw, 24 * u, 12 * u);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.fillText(label, w - m - lw / 2, m + 10 * u);

    // Product card
    const sub = this.current?.substance || this.lastProduct;
    const cy = m + 34 * u;
    roundRect(ctx, m, cy, w - 2 * m, 150 * u, 12 * u);
    ctx.fillStyle = 'rgba(30,44,64,0.7)';
    ctx.fill();
    if (sub) {
      // Colour swatch
      const sw = 70 * u;
      roundRect(ctx, m + 12 * u, cy + 12 * u, sw, sw, 10 * u);
      ctx.fillStyle = sub.phase === 'gas' && sub.opacity < 0.1 ? '#dfe9f5' : sub.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2 * u;
      ctx.stroke();
      ctx.font = font(13 * u, 800);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9fb6cf';
      ctx.fillText(sub.phase.toUpperCase(), m + 12 * u + sw / 2, cy + 12 * u + sw + 14 * u);
      const tx = m + 12 * u + sw + 16 * u;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      const ns = fitFont(ctx, sub.name, w - tx - m - 10 * u, 26 * u, 800);
      ctx.font = font(ns, 800);
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(sub.name, tx, cy + 36 * u);
      ctx.fillStyle = '#7fe3ff';
      drawFormula(ctx, sub.formula || '', tx, cy + 64 * u, 22 * u, { weight: 700 });
      ctx.fillStyle = '#b8c7da';
      ctx.font = font(14 * u, 500);
      drawWrapped(ctx, sub.info || '', tx, cy + 88 * u, w - tx - m - 10 * u, 18 * u, 3);
      if (sub.hazards && sub.hazards.length) {
        let hx = tx;
        ctx.font = font(12 * u, 800);
        for (const hz of sub.hazards) {
          const tw = ctx.measureText(hz.toUpperCase()).width + 14 * u;
          roundRect(ctx, hx, cy + 128 * u, tw, 18 * u, 9 * u);
          ctx.fillStyle = 'rgba(255,140,90,0.22)';
          ctx.fill();
          ctx.fillStyle = '#ffb38a';
          ctx.textBaseline = 'middle';
          ctx.fillText(hz.toUpperCase(), hx + 7 * u, cy + 137 * u);
          hx += tw + 6 * u;
        }
      }
    } else {
      ctx.fillStyle = '#7f93ad';
      ctx.font = font(18 * u, 600);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Build a molecule from the periodic table,', w / 2, cy + 58 * u);
      ctx.fillText('then drop it into the reactor on top ▲', w / 2, cy + 84 * u);
    }

    // Message line
    const my = cy + 162 * u;
    ctx.fillStyle = this.messageColor;
    ctx.font = font(15 * u, 600);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawWrapped(ctx, this.message, m, my, w - 2 * m, 18 * u, 2);
    if (this.state === 'pouring' && this.current && this.remaining !== Infinity) {
      const total = this.current.substance.phase === 'solid' ? this.amount / (this.current.substance.density || 1) : this.amount;
      const f = 1 - this.remaining / total;
      roundRect(ctx, m, my + 40 * u, w - 2 * m, 8 * u, 4 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      roundRect(ctx, m, my + 40 * u, (w - 2 * m) * Math.max(0.02, f), 8 * u, 4 * u);
      ctx.fillStyle = '#8ff0c2';
      ctx.fill();
    }

    // Controls
    const by = h - m - 44 * u;
    ctx.fillStyle = '#7f93ad';
    ctx.font = font(13 * u, 700);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const solid = sub && sub.phase === 'solid';
    ctx.fillText(solid ? 'AMOUNT (g)' : 'AMOUNT (mL)', m, by - 12 * u);
    let x = m;
    AMOUNTS.forEach((a, i) => {
      const bw = 56 * u;
      const sel = i === this.amountIndex;
      roundRect(ctx, x, by, bw, 40 * u, 10 * u);
      ctx.fillStyle = sel ? '#2fa8ef' : 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.fillStyle = sel ? '#ffffff' : '#c8d6e6';
      ctx.font = font(18 * u, 800);
      ctx.textAlign = 'center';
      ctx.fillText(String(a), x + bw / 2, by + 20 * u);
      screen.addButton({ x, y: by, w: bw, h: 40 * u, onPress: () => { this.amountIndex = i; screen.dirty = true; } });
      x += bw + 8 * u;
    });
    const canRepeat = !!this.lastProduct && ['idle', 'done', 'rejected'].includes(this.state);
    const rbw = 120 * u;
    const rx = w - m - rbw * 2 - 10 * u;
    roundRect(ctx, rx, by, rbw, 40 * u, 10 * u);
    ctx.fillStyle = canRepeat ? '#2f9f6f' : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.fillStyle = canRepeat ? '#ffffff' : '#5d6b7d';
    ctx.font = font(16 * u, 800);
    ctx.fillText('Make again', rx + rbw / 2, by + 20 * u);
    screen.addButton({ x: rx, y: by, w: rbw, h: 40 * u, disabled: !canRepeat, onPress: () => this.repeat() });
    const cx = w - m - rbw;
    roundRect(ctx, cx, by, rbw, 40 * u, 10 * u);
    ctx.fillStyle = 'rgba(255,110,90,0.18)';
    ctx.fill();
    ctx.fillStyle = '#ffb3a6';
    ctx.fillText('Stop', cx + rbw / 2, by + 20 * u);
    screen.addButton({ x: cx, y: by, w: rbw, h: 40 * u, onPress: () => this.cancel() });
  }

  reset() {
    this.cancel();
    this.lastProduct = null;
    this.message = 'Drop a molecule into the reactor on top.';
    this.messageColor = '#a9c6e6';
    if (this.absorbing) {
      for (const { m } of this.absorbing) if (!m.removed) m.destroy();
      this.absorbing.length = 0;
    }
    this.docked = null;
    this.screen.dirty = true;
  }
}
