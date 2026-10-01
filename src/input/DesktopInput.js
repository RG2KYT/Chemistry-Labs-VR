import * as THREE from 'three';
import { HandBase } from './HandBase.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Mouse + keyboard emulation of a hand, used for the flat-screen preview (and automated
 * tests). Left-drag grabs / clicks, the wheel changes the hold distance, Q/E and R/F tilt the
 * held object (to pour), Shift+drag on an atom pulls it out of its molecule, right-drag
 * looks around and WASD walks.
 */
export class DesktopHand extends HandBase {
  constructor(id = 'mouse', handedness = 'right') {
    super(id, handedness);
    this.kind = 'mouse';
    this.reach = 0;
    this.holdDistance = 0.6;
    this.extraRotation = new THREE.Quaternion();
    this.virtual = false;
  }
}

export class DesktopInput {
  constructor(app, camera, rig, dom) {
    this.app = app;
    this.camera = camera;
    this.rig = rig;
    this.dom = dom;
    this.hand = new DesktopHand('mouse', 'right');
    this.anchor = new DesktopHand('anchor', 'left'); // virtual second hand for Shift+drag
    this.anchor.virtual = true;
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = -0.18;
    this.looking = false;
    this.leftDown = false;
    this.shiftGrab = false;
    this.enabled = true;
    this.hasMouse = false;
    this.hand.active = true;

    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointermove', (e) => this.onMove(e));
    dom.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.hand.holdDistance = THREE.MathUtils.clamp(this.hand.holdDistance * (e.deltaY > 0 ? 0.92 : 1.08), 0.15, 4);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setMouseFromEvent(e) {
    const r = this.dom.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.hasMouse = true;
  }

  onMove(e) {
    if (this.looking) {
      this.yaw -= e.movementX * 0.0035;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0035, -1.45, 1.45);
    }
    this.setMouseFromEvent(e);
  }

  onDown(e) {
    this.setMouseFromEvent(e);
    if (e.button === 2 || e.button === 1) {
      this.looking = true;
      return;
    }
    if (e.button === 0) {
      this.leftDown = true;
      this.shiftGrab = e.shiftKey;
      this.app.audio?.unlock();
    }
  }

  onUp(e) {
    if (e.button === 2 || e.button === 1) this.looking = false;
    if (e.button === 0) this.leftDown = false;
  }

  /** Programmatic control for tests: point at normalised device coords. */
  setPointer(x, y) {
    this.mouse.set(x, y);
    this.hasMouse = true;
  }

  update(dt, time) {
    if (!this.enabled) return;
    // Camera look + walk
    const k = this.keys;
    const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
    const tilt = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    this.yaw += turn * dt * 1.6;
    this.pitch = THREE.MathUtils.clamp(this.pitch + tilt * dt * 1.2, -1.45, 1.45);
    _e.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(_e);

    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (fwd || side) {
      const dir = new THREE.Vector3(side, 0, -fwd).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.rig.position.addScaledVector(dir, dt * 1.6);
    }

    // Mouse ray
    const hand = this.hand;
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    hand.rayOrigin.copy(this.raycaster.ray.origin);
    hand.rayDirection.copy(this.raycaster.ray.direction);

    // Rotate the held object with Q/E (roll) and R/F (pitch) — used to pour.
    const roll = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);
    const pitchKey = (k.has('KeyR') ? 1 : 0) - (k.has('KeyF') ? 1 : 0);
    if (roll) hand.extraRotation.premultiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll * dt * 1.8));
    if (pitchKey) hand.extraRotation.premultiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchKey * dt * 1.8));

    // The mouse hand sits on the ray at the hold distance.
    this.camera.getWorldQuaternion(hand.gripQuaternion);
    hand.gripQuaternion.multiply(hand.extraRotation);
    hand.gripPosition.copy(hand.rayOrigin).addScaledVector(hand.rayDirection, hand.holdDistance);
    hand.pokeTip = null;

    const pressed = this.leftDown && this.hasMouse;
    hand.setButtons(pressed, pressed, k.has('Space'));
    if (hand.grabUp) hand.extraRotation.identity();
    hand.recordMotion(time);

    // Virtual anchor hand: stays still (it holds the rest of a molecule during Shift+drag).
    this.anchor.recordMotion(time);
  }
}
