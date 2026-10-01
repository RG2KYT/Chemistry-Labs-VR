import * as THREE from 'three';
import { Entity } from '../core/Entity.js';

const HALF_PI = Math.PI / 2;
const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function distToSegment(p, a, b) {
  const ab = _v1.copy(b).sub(a);
  const t = THREE.MathUtils.clamp(_v2.copy(p).sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return _v3.copy(a).addScaledVector(ab, t).distanceTo(p);
}

/**
 * A floating, levitating screen ("list") with grab handles on its top and bottom edge.
 *
 *  - Grab one handle to carry it, or both to rotate / resize it with two hands.
 *  - It has no physics: when released it simply stays where it is (no throwing).
 *  - Roll it 90° and the content re-lays itself out in portrait like a phone; roll it back
 *    and it becomes a landscape monitor again. Upside down (180°) is corrected
 *    automatically, and on release the panel turns its front towards you.
 *
 * Subclasses implement draw(ctx, w, h, portrait) and register buttons with addButton().
 */
export class Panel extends Entity {
  constructor(app, opts) {
    super(app);
    this.kind = 'panel';
    this.multiHold = true;
    this.distanceGrabMode = 'remote';
    this.title = opts.title || '';
    this.W = Math.max(opts.width, opts.height);
    this.H = Math.min(opts.width, opts.height);
    this.ppm = opts.pxPerMeter ?? 1300;
    this.portrait = !!opts.portrait;
    this.k = 0; // quarter turns of the content while held
    this.buttons = [];
    this.hovers = new Map(); // hand -> button
    this.dirty = true;
    this.anim = null;
    this.bobPhase = Math.random() * 10;
    this.time = 0;
    this.two = null;
    this.flash = null;

    this.float = new THREE.Group();
    this.object.add(this.float);
    this.frameGroup = new THREE.Group();
    this.content = new THREE.Group();
    this.handleGroup = new THREE.Group();
    this.float.add(this.frameGroup, this.content, this.handleGroup);

    this.frameMat = new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.35, metalness: 0.5 });
    this.backMat = new THREE.MeshStandardMaterial({ color: 0x232a38, roughness: 0.6, metalness: 0.3 });
    this.edgeMat = new THREE.MeshBasicMaterial({ color: 0x59d0ff, transparent: true, opacity: 0.75, toneMapped: false });
    this.handleMat = new THREE.MeshStandardMaterial({ color: 0xc9d3de, roughness: 0.3, metalness: 0.8, emissive: 0x000000 });
    this.gripMat = new THREE.MeshStandardMaterial({ color: 0x2b3342, roughness: 0.8, metalness: 0.1, emissive: 0x000000 });

    this.screenMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.screenMat);
    this.screen.position.z = 0;
    this.content.add(this.screen);

    // Hover / press overlays (one per hand)
    this.overlays = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false }),
      );
      m.position.z = 0.0015;
      m.visible = false;
      m.renderOrder = 2;
      m.userData.noPick = true;
      this.content.add(m);
      this.overlays.push(m);
    }

    this.buildFrame();
    this.buildHandles();
    this.buildScreen();
    app.uiSurfaces.push(this);
  }

  get layoutPortrait() {
    return this.portrait !== (this.k % 2 !== 0);
  }

  baseDims() {
    return this.portrait ? [this.H, this.W] : [this.W, this.H];
  }

  layoutDims() {
    return this.layoutPortrait ? [this.H, this.W] : [this.W, this.H];
  }

  // ------------------------------------------------------------------------------------
  // Geometry

  buildFrame() {
    for (const c of this.frameGroup.children.slice()) {
      c.geometry.dispose();
      this.frameGroup.remove(c);
    }
    const [bw, bh] = this.baseDims();
    const pad = 0.018;
    const shape = roundedRectShape(bw + pad * 2, bh + pad * 2, 0.03);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 6 });
    const frame = new THREE.Mesh(geo, [this.frameMat, this.backMat]);
    frame.position.z = -0.0215;
    frame.castShadow = true;
    this.frameGroup.add(frame);

    // Glowing rim around the screen
    const outer = roundedRectShape(bw + 0.008, bh + 0.008, 0.016);
    const inner = roundedRectShape(bw + 0.001, bh + 0.001, 0.012);
    outer.holes.push(inner);
    const rim = new THREE.Mesh(new THREE.ShapeGeometry(outer, 6), this.edgeMat);
    rim.position.z = 0.0006;
    this.frameGroup.add(rim);

    // Small "anti-grav" emitter glows on the back to sell the levitation.
    const glowGeo = new THREE.CircleGeometry(0.035, 24);
    for (const sx of [-1, 1]) {
      const g = new THREE.Mesh(glowGeo, this.edgeMat);
      g.position.set(sx * bw * 0.3, 0, -0.0262);
      g.rotation.y = Math.PI;
      this.frameGroup.add(g);
    }
  }

  buildHandles() {
    for (const c of this.handleGroup.children.slice()) {
      c.geometry.dispose();
      this.handleGroup.remove(c);
    }
    const [bw, bh] = this.baseDims();
    const len = Math.min(0.42, bw * 0.55);
    const r = 0.012;
    const offset = bh / 2 + 0.018 + 0.045;
    this.handleSegments = [];
    this.pickMeshes = [];
    for (const side of [1, -1]) {
      const bar = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), this.handleMat);
      bar.rotation.z = HALF_PI;
      bar.position.set(0, side * offset, 0);
      bar.castShadow = true;
      bar.userData.part = side > 0 ? 'top' : 'bottom';
      this.handleGroup.add(bar);
      this.pickMeshes.push(bar);
      // Rubber grip in the middle
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.18, len * 0.55, 16), this.gripMat);
      grip.rotation.z = HALF_PI;
      grip.position.copy(bar.position);
      this.handleGroup.add(grip);
      this.pickMeshes.push(grip);
      // Stems connecting the bar to the frame
      for (const sx of [-1, 1]) {
        const stemLen = offset - bh / 2 - 0.018;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, stemLen, 8), this.handleMat);
        stem.position.set(sx * len * 0.5, side * (bh / 2 + 0.018 + stemLen / 2), -0.006);
        this.handleGroup.add(stem);
      }
      this.handleSegments.push({
        side: side > 0 ? 'top' : 'bottom',
        a: new THREE.Vector3(-len / 2 - r, side * offset, 0),
        b: new THREE.Vector3(len / 2 + r, side * offset, 0),
      });
    }
    // Grab volume used for desktop picking / bounds
    this.localBounds.set(new THREE.Vector3(-bw / 2, -offset, -0.03), new THREE.Vector3(bw / 2, offset, 0.03));
  }

  buildScreen() {
    const [lw, lh] = this.layoutDims();
    const cw = Math.round(lw * this.ppm);
    const ch = Math.round(lh * this.ppm);
    if (!this.canvas || this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = cw;
      this.canvas.height = ch;
      this.ctx = this.canvas.getContext('2d');
      if (this.texture) this.texture.dispose();
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = this.app.maxAnisotropy || 4;
      this.texture.minFilter = THREE.LinearMipmapLinearFilter;
      this.texture.generateMipmaps = true;
      this.screenMat.map = this.texture;
      this.screenMat.needsUpdate = true;
    }
    this.screen.geometry.dispose();
    this.screen.geometry = new THREE.PlaneGeometry(lw, lh);
    this.content.rotation.z = -this.k * HALF_PI;
    this.dirty = true;
  }

  // ------------------------------------------------------------------------------------
  // Drawing & buttons

  addButton(b) {
    this.buttons.push(b);
    return b;
  }

  redraw() {
    this.dirty = false;
    this.buttons = [];
    const [lw, lh] = this.layoutDims();
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    this.draw(ctx, w, h, this.layoutPortrait, lw, lh);
    ctx.restore();
    this.texture.needsUpdate = true;
    // Refresh overlays after the layout changed
    for (const [hand, btn] of this.hovers) {
      if (btn) this.hovers.set(hand, this.buttons.find((b) => b.id === btn.id) || null);
    }
    this.updateOverlays();
  }

  draw(/* ctx, w, h, portrait */) {}

  buttonAt(px, py) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  }

  pxToLocal(px, py, out) {
    const [lw, lh] = this.layoutDims();
    return out.set((px / this.canvas.width - 0.5) * lw, (0.5 - py / this.canvas.height) * lh, 0);
  }

  updateOverlays() {
    let i = 0;
    const [lw, lh] = this.layoutDims();
    const sx = lw / this.canvas.width;
    const sy = lh / this.canvas.height;
    const shown = new Set();
    for (const btn of this.hovers.values()) {
      if (!btn || btn.disabled || shown.has(btn) || i >= this.overlays.length - 1) continue;
      shown.add(btn);
      const o = this.overlays[i++];
      o.visible = true;
      o.scale.set(btn.w * sx, btn.h * sy, 1);
      this.pxToLocal(btn.x + btn.w / 2, btn.y + btn.h / 2, o.position);
      o.position.z = 0.0015;
      o.material.opacity = 0.13;
    }
    if (this.flash && this.flash.t > 0) {
      const o = this.overlays[this.overlays.length - 1];
      const b = this.flash.btn;
      o.visible = true;
      o.scale.set(b.w * sx, b.h * sy, 1);
      this.pxToLocal(b.x + b.w / 2, b.y + b.h / 2, o.position);
      o.position.z = 0.002;
      o.material.opacity = 0.35 * this.flash.t;
    } else {
      this.overlays[this.overlays.length - 1].visible = false;
    }
    for (; i < this.overlays.length - 1; i++) this.overlays[i].visible = false;
  }

  // ------------------------------------------------------------------------------------
  // UI surface protocol

  isVisible() {
    return this.object.visible && !this.removed && this.object.parent;
  }

  raycast(raycaster) {
    const hits = raycaster.intersectObject(this.screen, false);
    if (!hits.length) return null;
    const h = hits[0];
    const px = h.uv.x * this.canvas.width;
    const py = (1 - h.uv.y) * this.canvas.height;
    const normal = Z_AXIS.clone().applyQuaternion(this.screen.getWorldQuaternion(_q1));
    return { distance: h.distance, point: h.point, normal, px, py };
  }

  poke(tip) {
    this.screen.updateWorldMatrix(true, false);
    const local = _v1.copy(tip);
    this.screen.worldToLocal(local);
    const [lw, lh] = this.layoutDims();
    const inside = Math.abs(local.x) <= lw / 2 && Math.abs(local.y) <= lh / 2;
    const scale = this.object.scale.x;
    const px = (local.x / lw + 0.5) * this.canvas.width;
    const py = (0.5 - local.y / lh) * this.canvas.height;
    return { inside, depth: local.z * scale, hit: { px, py, point: tip.clone(), distance: 0 } };
  }

  hover(hand, hit) {
    const btn = this.buttonAt(hit.px, hit.py);
    if (this.hovers.get(hand) !== btn) {
      this.hovers.set(hand, btn);
      this.updateOverlays();
      if (btn && !btn.disabled) hand.pulse(0.06, 6);
    }
  }

  hoverEnd(hand) {
    if (this.hovers.has(hand)) {
      this.hovers.delete(hand);
      this.updateOverlays();
    }
  }

  down(hand, hit) {
    const btn = this.buttonAt(hit.px, hit.py);
    if (!btn || btn.disabled) return true;
    this.flash = { btn, t: 1 };
    this.app.audio?.play('click', { position: hit.point, volume: 0.5 });
    btn.onPress?.(hand, btn);
    this.dirty = true;
    return true;
  }

  up() {}

  // ------------------------------------------------------------------------------------
  // Grabbing

  grabDistance(point) {
    if (!this.isVisible()) return Infinity;
    this.handleGroup.updateWorldMatrix(true, false);
    const local = this.handleGroup.worldToLocal(_v3.copy(point).clone());
    let best = Infinity;
    let part = null;
    const scale = this.object.scale.x;
    for (const seg of this.handleSegments) {
      const d = distToSegment(local, seg.a, seg.b) * scale - 0.014 * scale;
      if (d < best) { best = d; part = seg.side; }
    }
    return { dist: Math.max(0, best), part };
  }

  partFromObject(obj) {
    return obj.userData.part || null;
  }

  setHighlight(on) {
    this.highlighted = on;
    this.refreshHandleGlow();
  }

  refreshHandleGlow() {
    const glow = this.holds.length ? 0x2b8fd0 : this.highlighted ? 0x1d5d88 : 0x000000;
    this.handleMat.emissive.setHex(glow);
    this.gripMat.emissive.setHex(glow);
  }

  onGrab(rec) {
    this.anim = null;
    this.two = null;
    if (this.holds.length >= 2) this.initTwoHand();
    else this.computeOffset(rec);
    this.refreshHandleGlow();
    this.app.audio?.play('panelGrab', { position: this.object.position, volume: 0.3 });
  }

  initTwoHand() {
    const A = this.holds[0].hand;
    const B = this.holds[1].hand;
    this.two = {
      pA0: A.gripPosition.clone(),
      pB0: B.gripPosition.clone(),
      qA0: A.gripQuaternion.clone(),
      qB0: B.gripQuaternion.clone(),
      P0: this.object.position.clone(),
      Q0: this.object.quaternion.clone(),
      s0: this.object.scale.x,
      d0: Math.max(0.05, A.gripPosition.distanceTo(B.gripPosition)),
    };
    this.two.M0 = this.two.pA0.clone().add(this.two.pB0).multiplyScalar(0.5);
  }

  updateHolds() {
    if (this.holds.length >= 2 && this.two) {
      const A = this.holds[0].hand;
      const B = this.holds[1].hand;
      const t = this.two;
      const v0 = _v1.copy(t.pB0).sub(t.pA0).normalize();
      const vNow = _v2.copy(B.gripPosition).sub(A.gripPosition);
      const dist = vNow.length();
      vNow.normalize();
      const arc = _q1.setFromUnitVectors(v0, vNow);
      // Twist around the hand-to-hand axis from the average wrist rotation.
      const dA = A.gripQuaternion.clone().multiply(t.qA0.clone().invert());
      const dB = B.gripQuaternion.clone().multiply(t.qB0.clone().invert());
      const avg = dA.slerp(dB, 0.5);
      const axisDot = avg.x * vNow.x + avg.y * vNow.y + avg.z * vNow.z;
      const twist = _q2.set(vNow.x * axisDot, vNow.y * axisDot, vNow.z * axisDot, avg.w);
      if (twist.lengthSq() < 1e-8) twist.identity();
      else twist.normalize();
      const R = twist.multiply(arc);
      const s = THREE.MathUtils.clamp((t.s0 * dist) / t.d0, 0.55, 1.8);
      const M = _v3.copy(A.gripPosition).add(B.gripPosition).multiplyScalar(0.5);
      const rel = t.P0.clone().sub(t.M0).multiplyScalar(s / t.s0).applyQuaternion(R);
      this.object.position.copy(M).add(rel);
      this.object.quaternion.copy(R).multiply(t.Q0);
      this.object.scale.setScalar(s);
    } else if (this.holds.length === 1) {
      const rec = this.holds[0];
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      this.heldTarget(rec, pos, quat);
      this.object.position.copy(pos);
      this.object.quaternion.copy(quat);
    }
    this.updateOrientation();
  }

  /** Signed roll of the panel around its normal relative to "upright" (radians). */
  rollAngle() {
    const q = this.object.quaternion;
    const n = _v1.set(0, 0, 1).applyQuaternion(q);
    const u = _v2.set(0, 1, 0).applyQuaternion(q);
    const wp = _v3.copy(UP).addScaledVector(n, -UP.dot(n));
    if (wp.lengthSq() < 0.06) return null; // lying flat: keep current layout
    wp.normalize();
    const cross = new THREE.Vector3().crossVectors(wp, u);
    return Math.atan2(cross.dot(n), wp.dot(u));
  }

  updateOrientation() {
    const r = this.rollAngle();
    if (r === null) return;
    const current = this.k * HALF_PI;
    let diff = r - current;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) > THREE.MathUtils.degToRad(52)) {
      const k = ((Math.round(r / HALF_PI) % 4) + 4) % 4;
      if (k !== this.k) {
        const parityChanged = (k % 2) !== (this.k % 2);
        this.k = k;
        if (parityChanged) this.buildScreen();
        else this.content.rotation.z = -this.k * HALF_PI;
        this.app.audio?.play('rotate', { position: this.object.position, volume: 0.25 });
      }
    }
  }

  onRelease() {
    if (this.holds.length) {
      this.two = null;
      this.computeOffset(this.holds[0]);
      this.refreshHandleGlow();
      return;
    }
    this.two = null;
    this.refreshHandleGlow();
    this.bake();
  }

  /**
   * Make the current content orientation the panel's base orientation, then glide to an
   * upright pose (no roll) facing the user. No velocity is kept — panels never fly away.
   */
  bake() {
    const q = this.object.quaternion.clone().multiply(_q1.setFromAxisAngle(Z_AXIS, -this.k * HALF_PI));
    const newPortrait = this.layoutPortrait;
    this.object.quaternion.copy(q);
    this.portrait = newPortrait;
    this.k = 0;
    this.content.rotation.z = 0;
    this.buildFrame();
    this.buildHandles();
    this.buildScreen();

    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const head = this.app.headPosition();
    const toHead = head.clone().sub(this.object.position);
    if (n.dot(toHead) < 0) n.negate(); // always show the front to the player
    if (Math.abs(n.y) > 0.92) {
      // Lying flat (like a tablet on a desk): just keep it, facing up if it was face-down.
      const target = q.clone();
      if (new THREE.Vector3(0, 0, 1).applyQuaternion(q).dot(toHead) < 0) {
        target.multiply(_q2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      }
      this.anim = { from: q.clone(), to: target, t: 0 };
      return;
    }
    const y = UP.clone().addScaledVector(n, -UP.dot(n)).normalize();
    const x = new THREE.Vector3().crossVectors(y, n).normalize();
    const yy = new THREE.Vector3().crossVectors(n, x);
    _m.makeBasis(x, yy, n);
    const target = new THREE.Quaternion().setFromRotationMatrix(_m);
    this.anim = { from: q.clone(), to: target, t: 0 };
  }

  /** Place the panel at a position, facing a point (both world space). */
  placeFacing(position, lookAt) {
    this.object.position.copy(position);
    const n = lookAt.clone().sub(position);
    n.y = 0;
    n.normalize();
    const x = new THREE.Vector3().crossVectors(UP, n).normalize();
    _m.makeBasis(x, UP, n);
    this.object.quaternion.setFromRotationMatrix(_m);
    this.object.scale.setScalar(1);
    if (this.portrait || this.k) {
      this.portrait = false;
      this.k = 0;
      this.buildFrame();
      this.buildHandles();
      this.buildScreen();
    }
  }

  update(dt) {
    this.time += dt;
    if (this.anim) {
      this.anim.t = Math.min(1, this.anim.t + dt / 0.35);
      const e = 1 - Math.pow(1 - this.anim.t, 3);
      this.object.quaternion.slerpQuaternions(this.anim.from, this.anim.to, e);
      if (this.anim.t >= 1) this.anim = null;
    }
    // Gentle levitation bob when nobody holds it.
    const target = this.holds.length ? 0 : Math.sin(this.time * 1.2 + this.bobPhase) * 0.004;
    this.float.position.y += (target - this.float.position.y) * Math.min(1, dt * 6);
    if (this.flash) {
      this.flash.t -= dt * 4;
      if (this.flash.t <= 0) this.flash = null;
      this.updateOverlays();
    }
    if (this.dirty) this.redraw();
  }
}
