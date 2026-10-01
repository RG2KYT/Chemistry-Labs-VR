import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Physics } from '../core/Physics.js';
import { InputManager } from '../input/InputManager.js';
import { Interaction } from '../interaction/Interaction.js';
import { MoleculeSystem } from '../chem/MoleculeSystem.js';
import { Effects } from '../lab/Effects.js';
import { Fluids } from '../lab/Fluids.js';
import { Dissolver } from '../lab/Dissolver.js';
import { AudioEngine } from '../audio/Sound.js';
import { LabRoom, TABLE } from '../lab/LabRoom.js';
import { Machine } from '../lab/Machine.js';
import { PeriodicTablePanel } from '../ui/PeriodicTablePanel.js';
import { EquipmentPanel } from '../ui/EquipmentPanel.js';
import { CATALOG, createEquipment } from '../lab/catalog.js';
import { RoomScan } from '../ar/RoomScan.js';
import { Toasts } from '../ui/Toasts.js';

class Events {
  constructor() {
    this.map = new Map();
  }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.map.get(name).delete(fn);
  }
  emit(name, data) {
    const set = this.map.get(name);
    if (set) for (const fn of [...set]) fn(data);
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Chemistry Labs VR. Owns the renderer, scene, physics and all subsystems, the three play
 * modes ("lab" = virtual lab, "room" = passthrough mixed reality, "digital" = scanned room)
 * and the XR session lifecycle.
 */
export class App {
  constructor(container) {
    this.container = container;
    this.entities = [];
    this.uiSurfaces = [];
    this.heatSources = [];
    this.events = new Events();
    this.mode = 'lab';
    this.inXR = false;
    this.session = null;
    this.clock = { last: performance.now(), getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; return d; } };
    this.elapsed = 0;
    this.layoutPending = false;
    this.snapCooldown = 0;
    this.stats = { fps: 0, frames: 0, acc: 0 };
  }

  async init(onProgress = () => {}) {
    onProgress('Starting renderer…');
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    renderer.xr.setFoveation(0.6);
    this.maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.container.appendChild(renderer.domElement);

    const scene = this.scene = new THREE.Scene();
    this.labBackground = new THREE.Color(0xdfe6ee);
    scene.background = this.labBackground;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.85;

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 60);
    this.camera.position.set(0, 1.6, 0);
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    scene.add(this.rig);

    // Lights
    this.hemi = new THREE.HemisphereLight(0xeef4ff, 0x80776c, 0.9);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff4e2, 2.2);
    sun.position.set(-3.5, 4.5, 1.5);
    sun.target.position.set(0, 0.9, -0.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -3;
    sun.shadow.camera.right = 3;
    sun.shadow.camera.top = 3;
    sun.shadow.camera.bottom = -3;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 12;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    onProgress('Loading physics…');
    this.physics = new Physics();
    await this.physics.init();
    this.floorBody = null;

    this.audio = new AudioEngine();
    this.effects = new Effects(this);
    this.fluids = new Fluids(this);
    this.dissolver = new Dissolver(this);
    this.molecules = new MoleculeSystem(this);
    this.input = new InputManager(this);
    this.grab = new Interaction(this);
    this.toasts = new Toasts(this);

    onProgress('Building the lab…');
    this.labRoom = new LabRoom(this);
    scene.add(this.labRoom.group);
    this.labRoom.addPhysics(this.physics);
    this.roomScan = new RoomScan(this);

    this.machine = new Machine(this);
    this.addEntity(this.machine);
    this.machine.createBody();
    this.periodicPanel = new PeriodicTablePanel(this);
    this.equipmentPanel = new EquipmentPanel(this);
    this.addEntity(this.periodicPanel);
    this.addEntity(this.equipmentPanel);

    onProgress('Rendering equipment previews…');
    this.thumbnails = this.renderThumbnails();
    this.equipmentPanel.dirty = true;

    this.layout();
    this.spawnStarterSet();

    window.addEventListener('resize', () => this.onResize());
    renderer.setAnimationLoop((t, frame) => this.loop(t, frame));
    this.events.on('discover', (m) => this.toasts.show(`You made ${m.identity.substance.name}!`, '#8ff0c2', 2.5));
    onProgress('Ready');
  }

  // ------------------------------------------------------------------------------------
  // Entities

  addEntity(e) {
    if (!this.entities.includes(e)) this.entities.push(e);
    if (!e.object.parent) this.scene.add(e.object);
    return e;
  }

  removeEntity(e) {
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
  }

  headPosition(out = new THREE.Vector3()) {
    return this.camera.getWorldPosition(out);
  }

  headYaw() {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    return Math.atan2(-f.x, -f.z);
  }

  // ------------------------------------------------------------------------------------
  // Equipment

  spawnEquipment(id, position, quaternion = null, { stasis = false } = {}) {
    const e = createEquipment(this, id);
    this.addEntity(e);
    e.createBody(position, quaternion);
    if (stasis) e.enterStasis();
    return e;
  }

  /** Called by the equipment list. */
  spawnEquipmentFromPanel(id, panel) {
    let pos, stasis = false;
    if (this.mode === 'lab') {
      pos = this.freeTableSpot();
    } else {
      pos = panel.frontPoint(0.3);
      stasis = true;
    }
    const yaw = this.mode === 'lab' ? 0 : this.headYaw();
    const e = this.spawnEquipment(id, pos, new THREE.Quaternion().setFromAxisAngle(UP, yaw), { stasis });
    this.effects.sparkle(pos.clone().add(new THREE.Vector3(0, 0.06, 0)), 0x9fe7ff, 24, 0.1);
    this.audio.play('spawn', { position: pos, volume: 0.5 });
    this.enforceEquipmentLimit();
    return e;
  }

  freeTableSpot() {
    const T = TABLE;
    const occupied = this.entities.filter((e) => e.kind === 'equipment' && !e.removed);
    const candidates = [];
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 7; i++) {
        const x = T.x - T.w / 2 + 0.15 + (i * (T.w - 0.3)) / 6;
        const z = T.z - T.d / 2 + 0.14 + row * 0.24;
        candidates.push(new THREE.Vector3(x, T.h + 0.01, z));
      }
    }
    // Prefer the middle of the far row, then spiral outwards.
    candidates.sort((a, b) => (Math.abs(a.x) + (a.z - (T.z - T.d / 2)) * 1.5) - (Math.abs(b.x) + (b.z - (T.z - T.d / 2)) * 1.5));
    for (const c of candidates) {
      const blocked = occupied.some((e) => {
        const b = e.worldBounds();
        return Math.hypot((b.min.x + b.max.x) / 2 - c.x, (b.min.z + b.max.z) / 2 - c.z) < 0.13;
      });
      if (!blocked) return c;
    }
    return new THREE.Vector3(T.x, T.h + 0.25, T.z);
  }

  enforceEquipmentLimit(max = 36) {
    const eq = this.entities.filter((e) => e.kind === 'equipment' && !e.removed);
    if (eq.length <= max) return;
    const free = eq.filter((e) => !e.isHeld && this.machine.docked !== e);
    for (let i = 0; i < eq.length - max && i < free.length; i++) {
      this.effects.poof(free[i].object.position, 0xcfe6ff);
      free[i].destroy();
    }
  }

  spawnStarterSet() {
    if (this.mode === 'lab') {
      const T = TABLE;
      const y = T.h + 0.005;
      const q = new THREE.Quaternion();
      this.spawnEquipment('beaker250', new THREE.Vector3(-0.32, y, T.z - 0.08), q);
      this.spawnEquipment('beaker100', new THREE.Vector3(-0.16, y, T.z - 0.16), q);
      this.spawnEquipment('erlenmeyer250', new THREE.Vector3(0.0, y, T.z - 0.12), q);
      const rack = this.spawnEquipment('rack', new THREE.Vector3(0.36, y, T.z - 0.24), q);
      for (const i of [1, 3]) this.spawnEquipment('testtube', new THREE.Vector3(0.36 + rack.slots[i], y + 0.015, T.z - 0.24), q);
      this.spawnEquipment('burner', new THREE.Vector3(0.6, y, T.z + 0.05), q);
      this.spawnEquipment('tripod', new THREE.Vector3(0.6, y, T.z + 0.05), q);
      this.spawnEquipment('washbottle', new THREE.Vector3(-0.66, y, T.z - 0.15), q);
      this.spawnEquipment('thermometer', new THREE.Vector3(-0.55, y + 0.006, T.z + 0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3, Math.PI / 2)));
      this.spawnEquipment('spatula', new THREE.Vector3(0.2, y + 0.006, T.z + 0.24), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.2, Math.PI / 2)));
    } else {
      const p = this.equipmentPanel.frontPoint(0.3);
      this.spawnEquipment('beaker250', p, new THREE.Quaternion().setFromAxisAngle(UP, this.headYaw()), { stasis: true });
    }
  }

  // ------------------------------------------------------------------------------------
  // Layout of the three stations

  layout() {
    if (this.mode === 'lab') {
      const look = new THREE.Vector3(0, 1.45, 0.1);
      this.equipmentPanel.placeFacing(new THREE.Vector3(0, 1.43, TABLE.z - TABLE.d / 2 - 0.28), look);
      this.periodicPanel.placeFacing(new THREE.Vector3(1.42, 1.48, -0.5), look);
      const mp = new THREE.Vector3(-1.38, 0, -0.62);
      this.machine.placeAt(mp, Math.atan2(-mp.x, -mp.z));
      return;
    }
    // Mixed reality: arrange around where the player is standing and looking.
    const head = this.headPosition();
    const yaw = this.headYaw();
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const eye = Math.max(1.2, Math.min(1.75, head.y));
    const base = new THREE.Vector3(head.x, 0, head.z);
    const look = new THREE.Vector3(head.x, eye, head.z);
    this.equipmentPanel.placeFacing(base.clone().addScaledVector(fwd, 0.95).setY(eye - 0.12), look);
    this.periodicPanel.placeFacing(base.clone().addScaledVector(fwd, 0.75).addScaledVector(right, 1.0).setY(eye - 0.05), look);
    const mp = base.clone().addScaledVector(fwd, 0.85).addScaledVector(right, -1.05);
    mp.y = 0;
    this.machine.placeAt(mp, Math.atan2(head.x - mp.x, head.z - mp.z));
  }

  // ------------------------------------------------------------------------------------
  // Modes & XR sessions

  setMode(mode) {
    this.mode = mode;
    const lab = mode === 'lab';
    this.labRoom.group.visible = lab;
    if (lab) {
      if (!this.labRoom.bodies?.length) this.labRoom.addPhysics(this.physics);
      if (this.floorBody) { this.physics.removeBody(this.floorBody); this.floorBody = null; }
      this.scene.background = this.labBackground;
      this.renderer.setClearAlpha(1);
    } else {
      this.labRoom.removePhysics(this.physics);
      if (!this.floorBody) {
        this.floorBody = this.physics.staticBox({ x: 0, y: -0.1, z: 0 }, { x: 50, y: 0.1, z: 50 }, null, { kind: 'room' }).body;
      }
      this.scene.background = mode === 'digital' ? new THREE.Color(0x1a2433) : null;
      this.renderer.setClearColor(0x000000, mode === 'digital' ? 1 : 0);
    }
    this.roomScan.setMode(!lab, mode === 'digital');
    this.sun.position.set(lab ? -3.5 : 1.5, 4.5, lab ? 1.5 : 2);
  }

  async startXR(mode) {
    if (!navigator.xr) throw new Error('WebXR is not available in this browser.');
    this.audio.unlock();
    const ar = mode !== 'lab';
    const sessionType = ar ? 'immersive-ar' : 'immersive-vr';
    const init = {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ar
        ? ['hand-tracking', 'plane-detection', 'mesh-detection', 'anchors', 'hit-test', 'bounded-floor']
        : ['hand-tracking', 'bounded-floor', 'layers'],
    };
    const session = await navigator.xr.requestSession(sessionType, init);
    this.session = session;
    this.inXR = true;
    this.setMode(mode);
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.renderer.shadowMap.enabled = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    await this.renderer.xr.setSession(session);
    try {
      if (session.supportedFrameRates && session.updateTargetFrameRate) {
        const rates = [...session.supportedFrameRates];
        if (rates.includes(90)) await session.updateTargetFrameRate(90);
      }
    } catch { /* keep default */ }
    session.addEventListener('end', () => this.onSessionEnd());
    // Lay out the stations once we know where the player stands (AR) or immediately (VR).
    this.layoutPending = true;
    this.layoutDelay = ar ? 0.6 : 0;
    this.toasts.clear();
    this.events.emit('sessionstart', mode);
    return session;
  }

  onSessionEnd() {
    this.inXR = false;
    this.session = null;
    for (const h of this.input.xrHands) {
      if (h.held) this.grab.release(h, true);
      h.uiCapture = null;
    }
    this.setMode('lab');
    this.camera.position.set(0, 1.6, 0);
    this.sun.shadow.mapSize.set(2048, 2048);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.resetLab(true);
    this.onResize();
    this.events.emit('sessionend');
  }

  /** Remove everything the player made and put the lab back as it was. */
  resetLab(silent = false) {
    for (const e of this.entities.slice()) {
      if (e.kind === 'molecule' || e.kind === 'equipment') e.destroy();
    }
    for (const h of this.input.hands) if (h.held) this.grab.release(h, true);
    this.machine.reset();
    this.dissolver.clear();
    this.fluids.clear();
    this.effects.clear();
    this.periodicPanel.select(this.periodicPanel.selected);
    this.layout();
    this.spawnStarterSet();
    if (!silent) {
      this.audio.play('reset', { volume: 0.6 });
      this.toasts.show('Lab reset', '#7fe3ff', 2);
    }
    this.events.emit('reset');
  }

  // ------------------------------------------------------------------------------------
  // Thumbnails for the equipment list

  renderThumbnails() {
    const size = 192;
    const map = new Map();
    const scene = new THREE.Scene();
    scene.environment = this.envMap;
    scene.environmentIntensity = 1.0;
    // An opaque backdrop matching the cards, so clear glass shows its reflections.
    const bgc = document.createElement('canvas');
    bgc.width = bgc.height = 64;
    const bctx = bgc.getContext('2d');
    const grad = bctx.createRadialGradient(32, 26, 4, 32, 32, 46);
    grad.addColorStop(0, '#5d7698');
    grad.addColorStop(1, '#22304a');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, 64, 64);
    const bgTex = new THREE.CanvasTexture(bgc);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = bgTex;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.3));
    const dl = new THREE.DirectionalLight(0xffffff, 1.8);
    dl.position.set(1, 2, 2);
    scene.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const pixels = new Uint8Array(size * size * 4);
    const r = this.renderer;
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevTone = r.toneMapping;
    r.setClearColor(0x000000, 0);
    for (const def of CATALOG) {
      let e;
      try {
        e = createEquipment(this, def.id);
      } catch (err) {
        console.warn('thumbnail failed', def.id, err);
        continue;
      }
      if (e.surface) e.surface.visible = false;
      // Clear glass is hard to see in a small picture: make it a bit more visible.
      for (const m of e.highlightMaterials) if (m.transparent && m.opacity < 0.5) m.opacity = 0.3;
      const obj = e.object;
      obj.rotation.set(0.35, -0.6, 0);
      if (['thermometer', 'stirrod', 'spatula', 'tongs', 'dropper'].includes(def.id)) obj.rotation.set(0.2, 0.3, 0.55);
      scene.add(obj);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(e.model || obj, true);
      const c = box.getCenter(new THREE.Vector3());
      const rad = box.getSize(new THREE.Vector3()).length() * 0.5;
      const dist = rad / Math.sin(THREE.MathUtils.degToRad(15)) * 0.95;
      cam.position.copy(c).add(new THREE.Vector3(0, 0.05, 1).normalize().multiplyScalar(dist));
      cam.lookAt(c);
      cam.near = dist / 20;
      cam.far = dist * 4;
      cam.updateProjectionMatrix();
      r.setRenderTarget(rt);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      }
      ctx.putImageData(img, 0, 0);
      // Round the corners
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, 22);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      map.set(def.id, canvas);
      scene.remove(obj);
      e.destroy();
    }
    r.setRenderTarget(null);
    r.setClearColor(prevClear, prevAlpha);
    r.toneMapping = prevTone;
    rt.dispose();
    bgTex.dispose();
    return map;
  }

  // ------------------------------------------------------------------------------------
  // Main loop

  onResize() {
    if (this.inXR) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  locomotion(dt) {
    if (!this.inXR || this.mode !== 'lab') return;
    const left = this.input.byHandedness('left');
    const right = this.input.byHandedness('right');
    if (left && left.kind === 'controller' && left.thumbstick.lengthSq() > 0.04) {
      const yaw = this.headYaw();
      const dir = new THREE.Vector3(left.thumbstick.x, 0, left.thumbstick.y).applyAxisAngle(UP, yaw);
      this.rig.position.addScaledVector(dir, dt * 1.4);
    }
    this.snapCooldown -= dt;
    if (right && right.kind === 'controller' && Math.abs(right.thumbstick.x) > 0.7 && this.snapCooldown <= 0) {
      this.snapCooldown = 0.35;
      // Rotate the rig around the head position.
      const head = this.headPosition();
      const angle = -Math.sign(right.thumbstick.x) * (Math.PI / 6);
      this.rig.position.sub(head).applyAxisAngle(UP, angle).add(head);
      this.rig.rotation.y += angle;
    }
  }

  loop(time, frame) {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    this.stats.frames++;
    this.stats.acc += dt;
    if (this.stats.acc > 1) {
      this.stats.fps = Math.round(this.stats.frames / this.stats.acc);
      this.stats.frames = 0;
      this.stats.acc = 0;
    }

    if (this.layoutPending) {
      this.layoutDelay -= dt;
      if (this.layoutDelay <= 0) {
        this.layoutPending = false;
        this.resetLab(true);
        this.welcome();
      }
    }

    this.input.update(dt, this.elapsed);
    if (frame && this.inXR && this.mode !== 'lab') {
      this.roomScan.update(frame, this.renderer.xr.getReferenceSpace());
    }
    this.locomotion(dt);
    this.grab.update(dt);
    this.molecules.update(dt);
    this.physics.step(dt, (ent, other, speed) => ent.onImpact?.(speed, other));
    for (const e of this.entities) {
      if (e.body && !e.removed && !e.disabled && !e.absorbing && e.kind !== 'machine') e.syncFromBody();
    }
    for (const e of this.entities.slice()) if (!e.removed) e.update(dt);
    this.fluids.update(dt);
    this.dissolver.update(dt);
    this.effects.update(dt);
    this.labRoom.update(dt);
    this.toasts.update(dt);
    this.audio.updateListener(this.camera);
    if (this.renderEnabled !== false) this.renderer.render(this.scene, this.camera);
  }

  welcome() {
    const lines = this.mode === 'lab'
      ? ['Welcome to the lab!', 'Grab: squeeze the grip (or pinch). Point & pull the trigger to tap screens.', 'Periodic table → right · Synthesizer → left · Equipment → ahead']
      : ['Your room is now a lab!', 'Screens float — grab their handle bars to move them anywhere.', 'New equipment floats until you grab it.'];
    lines.forEach((l, i) => setTimeout(() => this.toasts.show(l, i === 0 ? '#8ff0c2' : '#d8ecff', 4), i * 4200));
    if (this.mode !== 'lab') {
      setTimeout(() => {
        if (!this.roomScan.sawData) {
          this.toasts.show('No room scan found — set up your space in Quest Settings › Physical Space › Space Setup. Using your floor for now.', '#ffd27a', 7);
          try { this.session?.initiateRoomCapture?.(); } catch { /* not supported */ }
        }
      }, 5000);
    }
  }
}
