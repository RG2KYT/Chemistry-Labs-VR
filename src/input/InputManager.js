import { XRHandInput } from './XRHandInput.js';
import { DesktopInput } from './DesktopInput.js';

export class InputManager {
  constructor(app) {
    this.app = app;
    this.xrHands = [
      new XRHandInput(app.renderer, 0, app.rig),
      new XRHandInput(app.renderer, 1, app.rig),
    ];
    this.desktop = new DesktopInput(app, app.camera, app.rig, app.renderer.domElement);
  }

  get hands() {
    return this.app.inXR ? this.xrHands : [this.desktop.hand, this.desktop.anchor];
  }

  update(dt, time) {
    if (this.app.inXR) {
      for (const h of this.xrHands) h.update(time);
    } else {
      this.desktop.update(dt, time);
    }
  }

  /** The XR hand with the given handedness, if connected. */
  byHandedness(side) {
    return this.xrHands.find((h) => h.active && h.handedness === side) || null;
  }
}
