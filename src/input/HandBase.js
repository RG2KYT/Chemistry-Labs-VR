import * as THREE from 'three';

const HISTORY = 8;

/**
 * Common state for one "hand" — an XR controller, a tracked hand or the desktop mouse.
 * Everything downstream (grabbing, UI, tools) only talks to this interface.
 */
export class HandBase {
  constructor(id, handedness) {
    this.id = id;
    this.handedness = handedness;
    this.kind = 'none'; // 'controller' | 'hand' | 'mouse'
    this.active = false;

    // Grab pose (pinch point / palm for hands, controller grip for controllers).
    this.gripPosition = new THREE.Vector3();
    this.gripQuaternion = new THREE.Quaternion();
    // Pointing ray.
    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3(0, 0, -1);
    this.rayEnabled = true;
    // Finger tip / controller tip used for poking buttons. null when unavailable.
    this.pokeTip = null;
    this.pokeRadius = 0.008;

    this.grabPressed = false;
    this.grabDown = false;
    this.grabUp = false;
    this.selectPressed = false;
    this.selectDown = false;
    this.selectUp = false;
    // Secondary "use" (controller trigger while holding something with the grip button).
    this.usePressed = false;
    this.useDown = false;

    this.reach = 0.06; // near-grab radius (m)
    this.held = null; // grab record
    this.uiCapture = null; // panel/UI currently pressed with this hand

    this.thumbstick = new THREE.Vector2();
    this.buttonA = false;
    this.buttonB = false;

    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this._posHist = [];
    this._quatHist = [];
    this._timeHist = [];
  }

  setButtons(grab, select, use = false) {
    this.grabDown = grab && !this.grabPressed;
    this.grabUp = !grab && this.grabPressed;
    this.grabPressed = grab;
    this.selectDown = select && !this.selectPressed;
    this.selectUp = !select && this.selectPressed;
    this.selectPressed = select;
    this.useDown = use && !this.usePressed;
    this.usePressed = use;
  }

  clearButtons() {
    this.setButtons(false, false, false);
  }

  /** Track motion to estimate throw velocities. */
  recordMotion(time) {
    this._posHist.push(this.gripPosition.clone());
    this._quatHist.push(this.gripQuaternion.clone());
    this._timeHist.push(time);
    if (this._posHist.length > HISTORY) {
      this._posHist.shift();
      this._quatHist.shift();
      this._timeHist.shift();
    }
    const n = this._posHist.length;
    if (n < 3) {
      this.velocity.set(0, 0, 0);
      this.angularVelocity.set(0, 0, 0);
      return;
    }
    // Average over the last ~60–90 ms; ignore the very latest sample to reduce release jitter.
    const i1 = n - 2;
    let i0 = 0;
    for (let i = i1 - 1; i >= 0; i--) {
      i0 = i;
      if (this._timeHist[i1] - this._timeHist[i] > 0.075) break;
    }
    const dt = this._timeHist[i1] - this._timeHist[i0];
    if (dt <= 1e-4) return;
    this.velocity.copy(this._posHist[i1]).sub(this._posHist[i0]).divideScalar(dt);
    const dq = this._quatHist[i1].clone().multiply(this._quatHist[i0].clone().invert());
    if (dq.w < 0) { dq.x = -dq.x; dq.y = -dq.y; dq.z = -dq.z; dq.w = -dq.w; }
    const angle = 2 * Math.acos(Math.min(1, dq.w));
    const s = Math.sqrt(1 - dq.w * dq.w);
    if (s < 1e-4 || angle < 1e-4) this.angularVelocity.set(0, 0, 0);
    else this.angularVelocity.set(dq.x / s, dq.y / s, dq.z / s).multiplyScalar(angle / dt);
  }

  resetMotion() {
    this._posHist.length = 0;
    this._quatHist.length = 0;
    this._timeHist.length = 0;
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }

  /** Haptic feedback (no-op for hands / mouse). */
  pulse(/* intensity, ms */) {}
}
