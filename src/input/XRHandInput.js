import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { HandBase } from './HandBase.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const GRIP_OFFSET = new THREE.Vector3(0, -0.01, -0.035);
const BASE = import.meta.env.BASE_URL || './';

let controllerFactory = null;
let handFactory = null;

/**
 * One WebXR input source (index 0 / 1) that can be either a Touch controller or a tracked
 * hand — Quest switches between them at runtime when you put the controllers down.
 */
export class XRHandInput extends HandBase {
  constructor(renderer, index, rig) {
    super('xr' + index, index === 0 ? 'left' : 'right');
    this.renderer = renderer;
    this.index = index;
    this.source = null;

    controllerFactory ??= new XRControllerModelFactory().setPath(BASE + 'xr-profiles');
    handFactory ??= new XRHandModelFactory().setPath(BASE + 'xr-profiles/generic-hand/');

    this.controller = renderer.xr.getController(index);
    this.grip = renderer.xr.getControllerGrip(index);
    this.hand = renderer.xr.getHand(index);
    rig.add(this.controller, this.grip, this.hand);

    this.controllerModel = controllerFactory.createControllerModel(this.grip);
    this.grip.add(this.controllerModel);
    this.handModel = handFactory.createHandModel(this.hand, 'mesh');
    this.hand.add(this.handModel);

    this.pinching = false;
    this.fist = false;
    this.grabMode = null; // 'pinch' | 'fist' while grabbing with a hand

    this.controller.addEventListener('connected', (e) => this.onConnected(e.data));
    this.controller.addEventListener('disconnected', () => this.onDisconnected());
  }

  onConnected(source) {
    this.source = source;
    this.handedness = source.handedness || this.handedness;
    this.kind = source.hand ? 'hand' : 'controller';
    this.active = true;
    this.reach = this.kind === 'hand' ? 0.045 : 0.07;
    this.pokeRadius = this.kind === 'hand' ? 0.009 : 0.012;
    this.resetMotion();
    if (this.kind === 'controller') {
      // If the controller's 3D model can't be loaded (unknown profile / offline), show a
      // simple stand-in so the player still sees their hands.
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = setTimeout(() => this.ensureControllerVisual(), 2500);
    }
  }

  ensureControllerVisual() {
    if (this.kind !== 'controller' || this.controllerModel.children.length || this.fallback) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5 });
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.07, 4, 12), mat);
    handle.rotation.x = -0.5;
    handle.position.set(0, -0.02, 0.03);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 8, 24), new THREE.MeshStandardMaterial({ color: 0x7fe3ff, emissive: 0x1d5d88 }));
    ring.position.set(0, 0.015, -0.02);
    ring.rotation.x = 0.4;
    g.add(handle, ring);
    this.fallback = g;
    this.grip.add(g);
  }

  onDisconnected() {
    this.source = null;
    this.active = false;
    this.kind = 'none';
    this.clearButtons();
  }

  update(time) {
    const src = this.source;
    if (!src) {
      this.active = false;
      return;
    }
    this.active = true;
    this.controller.updateWorldMatrix(true, false);
    this.controller.getWorldPosition(this.rayOrigin);
    this.controller.getWorldQuaternion(_q);
    this.rayDirection.set(0, 0, -1).applyQuaternion(_q);

    if (src.hand) this.updateHand();
    else this.updateController(src);
    this.recordMotion(time);
  }

  updateController(src) {
    this.kind = 'controller';
    this.controllerModel.visible = true;
    this.grip.getWorldQuaternion(this.gripQuaternion);
    this.grip.getWorldPosition(this.gripPosition);
    this.gripPosition.add(_v1.copy(GRIP_OFFSET).applyQuaternion(this.gripQuaternion));

    // Controller tip for poking: just in front of the ray origin.
    this.pokeTip = this.pokeTip || new THREE.Vector3();
    this.pokeTip.copy(this.rayOrigin).addScaledVector(this.rayDirection, 0.015);

    const gp = src.gamepad;
    if (!gp) return this.clearButtons();
    const b = gp.buttons;
    const trig = b[0] ? b[0].value > (this.selectPressed ? 0.35 : 0.6) || b[0].pressed : false;
    const squeeze = b[1] ? b[1].value > (this.grabPressed && !this._grabByTrigger ? 0.35 : 0.6) || b[1].pressed : false;
    // Grab with grip *or* trigger. If something is held with the grip button, the trigger
    // becomes the "use" button (e.g. squirt the wash bottle).
    const holdingWithGrip = this.held && this._grabBySqueeze;
    let grab;
    if (holdingWithGrip) grab = squeeze;
    else if (this.held && this._grabByTrigger) grab = trig;
    else grab = squeeze || trig;
    if (!this.grabPressed && grab) {
      this._grabBySqueeze = squeeze;
      this._grabByTrigger = !squeeze && trig;
    }
    this.setButtons(grab, trig, holdingWithGrip && trig);

    this.thumbstick.set(gp.axes[2] || 0, gp.axes[3] || 0);
    this.buttonA = !!(b[4] && b[4].pressed);
    this.buttonB = !!(b[5] && b[5].pressed);
  }

  updateHand() {
    this.kind = 'hand';
    const j = this.hand.joints;
    const thumb = j && j['thumb-tip'];
    const index = j && j['index-finger-tip'];
    const wrist = j && j['wrist'];
    if (!thumb || !index || !wrist || !index.visible) {
      this.pokeTip = null;
      this.clearButtons();
      return;
    }
    thumb.getWorldPosition(_v1);
    index.getWorldPosition(_v2);
    const pinchDist = _v1.distanceTo(_v2);
    this.pinching = this.pinching ? pinchDist < 0.032 : pinchDist < 0.018;

    // Fist detection: middle and ring finger tips curled towards the palm.
    const mTip = j['middle-finger-tip'], mProx = j['middle-finger-phalanx-proximal'];
    const rTip = j['ring-finger-tip'], rProx = j['ring-finger-phalanx-proximal'];
    let fist = false;
    if (mTip && mProx && rTip && rProx) {
      const d1 = mTip.getWorldPosition(new THREE.Vector3()).distanceTo(mProx.getWorldPosition(new THREE.Vector3()));
      const d2 = rTip.getWorldPosition(new THREE.Vector3()).distanceTo(rProx.getWorldPosition(new THREE.Vector3()));
      const thr = this.fist ? 0.062 : 0.048;
      fist = d1 < thr && d2 < thr;
    }
    this.fist = fist;

    wrist.getWorldQuaternion(this.gripQuaternion);
    const grabbing = this.pinching || this.fist;
    if (!this.grabPressed && grabbing) this.grabMode = this.pinching ? 'pinch' : 'fist';
    const mode = this.grabPressed ? this.grabMode : this.pinching ? 'pinch' : 'fist';
    if (mode === 'fist' && mProx) {
      // Palm centre: between wrist and the middle-finger knuckle, slightly off the palm.
      mProx.getWorldPosition(this.gripPosition);
      wrist.getWorldPosition(_v1);
      this.gripPosition.lerp(_v1, 0.45);
      this.gripPosition.add(_v2.set(0, -0.03, 0).applyQuaternion(this.gripQuaternion));
    } else {
      thumb.getWorldPosition(_v1);
      index.getWorldPosition(_v2);
      this.gripPosition.copy(_v1).add(_v2).multiplyScalar(0.5);
    }
    this.reach = mode === 'fist' ? 0.075 : 0.055;

    this.pokeTip = this.pokeTip || new THREE.Vector3();
    index.getWorldPosition(this.pokeTip);
    // Keep pinch "grab" sticky while the grab is active even if the fingers open slightly.
    const grab = this.grabPressed ? (this.grabMode === 'pinch' ? this.pinching : this.fist || this.pinching) : grabbing;
    this.setButtons(grab, this.pinching, false);
    this.thumbstick.set(0, 0);
  }

  pulse(intensity = 0.4, ms = 30) {
    const act = this.source && this.source.gamepad && this.source.gamepad.hapticActuators;
    if (act && act[0] && act[0].pulse) {
      try { act[0].pulse(intensity, ms); } catch { /* ignore */ }
    }
  }
}
