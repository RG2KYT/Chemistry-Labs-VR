import * as THREE from 'three';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _box = new THREE.Box3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

const HOVER_EMISSIVE = new THREE.Color(0x2a6f9a);

/**
 * Base class for everything that lives in the lab: a Three.js object, an optional Rapier
 * rigid body and the grab protocol used by the GrabSystem.
 */
export class Entity {
  constructor(app) {
    this.app = app;
    this.object = new THREE.Group();
    this.object.userData.entity = this;
    this.body = null;
    this.holds = []; // grab records (one per holding hand)
    this.grabbable = true;
    this.multiHold = false; // allow two hands at once
    this.removed = false;
    this.kind = 'entity';
    this.breakable = false;
    this.highlightMaterials = [];
    this.highlighted = false;
    this.localBounds = new THREE.Box3(new THREE.Vector3(-0.05, -0.05, -0.05), new THREE.Vector3(0.05, 0.05, 0.05));
    this.stasis = false;
    this.disabled = false; // e.g. while dissolved by acid
  }

  get isHeld() {
    return this.holds.length > 0;
  }

  /** Collect (and clone) materials of the object so hover highlighting is per instance. */
  prepareHighlight() {
    const seen = new Map();
    this.object.traverse((o) => {
      if (!o.isMesh || o.userData.noHighlight) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        if (!m || !m.emissive || m.userData.noClone) return m;
        if (!seen.has(m)) {
          const c = m.clone();
          c.userData.baseEmissive = m.emissive.clone();
          c.userData.baseEmissiveIntensity = m.emissiveIntensity;
          seen.set(m, c);
          this.highlightMaterials.push(c);
        }
        return seen.get(m);
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });
  }

  setHighlight(on) {
    if (on === this.highlighted) return;
    this.highlighted = on;
    for (const m of this.highlightMaterials) {
      if (on) {
        m.emissive.copy(HOVER_EMISSIVE);
        m.emissiveIntensity = 1;
      } else {
        m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = m.userData.baseEmissiveIntensity;
      }
    }
  }

  /** Distance from a world point to this entity's grab volume (0 = inside). */
  grabDistance(point) {
    if (!this.grabbable || this.disabled) return Infinity;
    this.object.updateWorldMatrix(true, false);
    _inv.copy(this.object.matrixWorld).invert();
    _v.copy(point).applyMatrix4(_inv);
    _box.copy(this.localBounds);
    const d = _box.distanceToPoint(_v);
    return { dist: d * this.object.scale.x, part: null };
  }

  /** World-space bounding box. */
  worldBounds(target = new THREE.Box3()) {
    this.object.updateWorldMatrix(true, false);
    return target.copy(this.localBounds).applyMatrix4(this.object.matrixWorld);
  }

  // ------------------------------------------------------------------------------------
  // Grab protocol

  computeOffset(rec) {
    const hand = rec.hand;
    _q.copy(hand.gripQuaternion).invert();
    rec.offsetPos = this.object.position.clone().sub(hand.gripPosition).applyQuaternion(_q);
    rec.offsetQuat = _q.clone().multiply(this.object.quaternion);
  }

  heldTarget(rec, outPos, outQuat) {
    const hand = rec.hand;
    outQuat.copy(hand.gripQuaternion).multiply(rec.offsetQuat);
    outPos.copy(rec.offsetPos).applyQuaternion(hand.gripQuaternion).add(hand.gripPosition);
    if (rec.pull) {
      // Distance grab: glide from where the object was into the hand.
      const e = 1 - Math.pow(1 - Math.min(1, rec.pull.t), 3);
      if (!rec.pull.fromQuat) rec.pull.fromQuat = this.object.quaternion.clone();
      outPos.lerpVectors(rec.pull.from, outPos, e);
      outQuat.slerpQuaternions(rec.pull.fromQuat, outQuat.clone(), e);
    }
  }

  onGrab(rec) {
    this.computeOffset(rec);
    if (this.stasis) this.exitStasis();
    if (this.body) {
      this.body.setBodyType(this.app.physics.R.RigidBodyType.KinematicPositionBased, true);
    }
  }

  updateHolds() {
    const rec = this.holds[this.holds.length - 1];
    if (!rec) return;
    const pos = _v;
    const quat = _q;
    this.heldTarget(rec, pos, quat);
    this.applyHeldPose(pos, quat);
  }

  applyHeldPose(pos, quat) {
    if (this.body) {
      this.body.setNextKinematicTranslation(pos);
      this.body.setNextKinematicRotation(quat);
    } else {
      this.object.position.copy(pos);
      this.object.quaternion.copy(quat);
    }
  }

  onRelease(rec, linVel, angVel) {
    if (this.holds.length) {
      // Still held by the other hand: re-anchor it.
      this.computeOffset(this.holds[this.holds.length - 1]);
      return;
    }
    if (this.body) {
      this.body.setBodyType(this.app.physics.R.RigidBodyType.Dynamic, true);
      if (linVel) this.body.setLinvel(linVel, true);
      if (angVel) this.body.setAngvel(angVel, true);
    }
  }

  // ------------------------------------------------------------------------------------
  // Stasis: newly spawned items float in place until first touched (mixed reality).

  enterStasis() {
    this.stasis = true;
    if (this.body) {
      this.body.setGravityScale(0, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0.6, z: 0 }, true);
      this.body.setLinearDamping(4);
      this.body.setAngularDamping(0.2);
    }
  }

  exitStasis() {
    this.stasis = false;
    if (this.body) {
      this.body.setGravityScale(this.gravityScale ?? 1, true);
      this.body.setLinearDamping(this.linearDamping ?? 0.05);
      this.body.setAngularDamping(this.angularDamping ?? 0.1);
    }
  }

  // ------------------------------------------------------------------------------------

  syncFromBody() {
    if (!this.body) return;
    const t = this.body.translation();
    const r = this.body.rotation();
    this.object.position.set(t.x, t.y, t.z);
    this.object.quaternion.set(r.x, r.y, r.z, r.w);
  }

  teleport(pos, quat) {
    this.object.position.copy(pos);
    if (quat) this.object.quaternion.copy(quat);
    if (this.body) {
      this.body.setTranslation(pos, true);
      if (quat) this.body.setRotation(quat, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  update(/* dt */) {}

  /** Remove from the world. */
  destroy() {
    if (this.removed) return;
    this.removed = true;
    for (const rec of this.holds.slice()) this.app.grab.forceRelease(rec.hand);
    if (this.body) this.app.physics.removeBody(this.body);
    this.body = null;
    this.app.physics.impactListeners.delete(this);
    this.object.removeFromParent();
    this.object.traverse((o) => {
      if (o.isMesh && o.userData.disposeGeometry) o.geometry.dispose();
    });
    for (const m of this.highlightMaterials) m.dispose();
    this.app.removeEntity(this);
  }
}

export function worldMatrixOf(obj, target = _m) {
  obj.updateWorldMatrix(true, false);
  return target.copy(obj.matrixWorld);
}
