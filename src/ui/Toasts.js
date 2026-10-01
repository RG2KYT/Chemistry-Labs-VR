import * as THREE from 'three';
import { font, roundRect, wrapLines } from './canvasUtil.js';

/**
 * Short messages that float in front of the player (lazily following the view so they are
 * never glued to the face).
 */
export class Toasts {
  constructor(app) {
    this.app = app;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 200;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.sprite.renderOrder = 100;
    this.sprite.visible = false;
    this.sprite.userData.noPick = true;
    app.scene.add(this.sprite);
    this.queue = [];
    this.current = null;
    this.anchor = new THREE.Vector3();
    this.anchorYaw = 0;
    this.history = [];
  }

  show(text, color = '#d8ecff', duration = 3) {
    this.history.push(text);
    if (this.history.length > 50) this.history.shift();
    this.queue.push({ text, color, duration });
    if (this.queue.length > 4) this.queue.shift();
  }

  clear() {
    this.queue.length = 0;
    this.current = null;
    this.sprite.visible = false;
  }

  draw(t) {
    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = font(40, 600);
    const lines = wrapLines(ctx, t.text, W - 120).slice(0, 3);
    const lh = 50;
    const bh = lines.length * lh + 50;
    const bw = Math.min(W - 8, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 90);
    const x = (W - bw) / 2, y = (H - bh) / 2;
    roundRect(ctx, x, y, bw, bh, 30);
    ctx.fillStyle = 'rgba(8,14,24,0.86)';
    ctx.fill();
    ctx.strokeStyle = t.color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = t.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 25 + lh / 2 + i * lh));
    this.texture.needsUpdate = true;
  }

  update(dt) {
    if (!this.current && this.queue.length) {
      this.current = { ...this.queue.shift(), t: 0 };
      this.draw(this.current);
      this.sprite.visible = true;
    }
    if (!this.current) return;
    const c = this.current;
    c.t += dt;
    const head = this.app.headPosition();
    const yaw = this.app.headYaw();
    // Lazy follow: only re-centre when the player turned away.
    let dy = yaw - this.anchorYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (c.t < dt * 1.5 || Math.abs(dy) > 0.6) this.anchorYaw = yaw;
    else this.anchorYaw += dy * Math.min(1, dt * 1.5);
    const fwd = new THREE.Vector3(-Math.sin(this.anchorYaw), 0, -Math.cos(this.anchorYaw));
    const target = head.clone().addScaledVector(fwd, 0.9);
    target.y = head.y - 0.28;
    if (c.t < dt * 1.5) this.anchor.copy(target);
    else this.anchor.lerp(target, Math.min(1, dt * 4));
    this.sprite.position.copy(this.anchor);
    this.sprite.scale.set(0.62, 0.62 * (200 / 1024), 1);
    const fade = Math.min(1, c.t * 5, (c.duration - c.t) * 3);
    this.sprite.material.opacity = Math.max(0, fade);
    if (c.t >= c.duration) {
      this.current = null;
      this.sprite.visible = false;
    }
  }
}
