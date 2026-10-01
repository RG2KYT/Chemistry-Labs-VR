import * as THREE from 'three';

const Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * A fixed touch screen (canvas texture + buttons) usable with rays, fingers and controller
 * tips. Used for the synthesizer console.
 */
export class CanvasScreen {
  constructor(app, width, height, ppm = 1400, draw) {
    this.app = app;
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * ppm);
    this.canvas.height = Math.round(height * ppm);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = app.maxAnisotropy || 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.mesh.userData.noHighlight = true;
    this.drawFn = draw;
    this.buttons = [];
    this.hovers = new Map();
    this.dirty = true;
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false }));
    this.overlay.position.z = 0.001;
    this.overlay.visible = false;
    this.mesh.add(this.overlay);
    app.uiSurfaces.push(this);
  }

  addButton(b) {
    this.buttons.push(b);
  }

  redraw() {
    this.dirty = false;
    this.buttons = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawFn(this.ctx, this.canvas.width, this.canvas.height, this);
    this.texture.needsUpdate = true;
    this.updateOverlay();
  }

  update() {
    if (this.dirty) this.redraw();
  }

  buttonAt(px, py) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  }

  updateOverlay() {
    const btn = [...this.hovers.values()].find((b) => b && !b.disabled);
    this.overlay.visible = !!btn;
    if (btn) {
      const sx = this.width / this.canvas.width, sy = this.height / this.canvas.height;
      this.overlay.scale.set(btn.w * sx, btn.h * sy, 1);
      this.overlay.position.set((btn.x + btn.w / 2) * sx - this.width / 2, this.height / 2 - (btn.y + btn.h / 2) * sy, 0.001);
    }
  }

  isVisible() {
    let o = this.mesh;
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    return true;
  }

  raycast(raycaster) {
    const hits = raycaster.intersectObject(this.mesh, false);
    if (!hits.length) return null;
    const h = hits[0];
    return {
      distance: h.distance, point: h.point,
      normal: Z.clone().applyQuaternion(this.mesh.getWorldQuaternion(_q)),
      px: h.uv.x * this.canvas.width, py: (1 - h.uv.y) * this.canvas.height,
    };
  }

  poke(tip) {
    this.mesh.updateWorldMatrix(true, false);
    const l = this.mesh.worldToLocal(_v.copy(tip));
    return {
      inside: Math.abs(l.x) <= this.width / 2 && Math.abs(l.y) <= this.height / 2,
      depth: l.z,
      hit: { px: (l.x / this.width + 0.5) * this.canvas.width, py: (0.5 - l.y / this.height) * this.canvas.height, point: tip.clone(), distance: 0 },
    };
  }

  hover(hand, hit) {
    const b = this.buttonAt(hit.px, hit.py);
    if (this.hovers.get(hand) !== b) {
      this.hovers.set(hand, b);
      this.updateOverlay();
    }
  }

  hoverEnd(hand) {
    if (this.hovers.delete(hand)) this.updateOverlay();
  }

  down(hand, hit) {
    const b = this.buttonAt(hit.px, hit.py);
    if (b && !b.disabled) {
      this.app.audio?.play('click', { position: hit.point, volume: 0.5 });
      b.onPress?.(hand);
      this.dirty = true;
    }
    return true;
  }

  up() {}
}
