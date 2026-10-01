import * as THREE from 'three';
import { Entity } from '../core/Entity.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export const BREAK_SPEED = { glass: 4.3, porcelain: 4.6, plastic: 7.5, metal: 8, wood: 8, rubber: 9 };
const IMPACT_SOUND = { glass: 'clink', porcelain: 'clink', plastic: 'thud', metal: 'thud', wood: 'thud', rubber: 'thud' };

/**
 * A physical piece of lab equipment: Three.js model + Rapier rigid body built from simple
 * collider specs. Hitting something too hard breaks it (and it disappears).
 *
 * Collider spec: { type: 'cylinder'|'box'|'ball'|'hull'|'capsule', ...size, pos:[x,y,z], rot?:Quaternion }
 */
export class Equipment extends Entity {
  constructor(app, def) {
    super(app);
    this.kind = 'equipment';
    this.def = def;
    this.name = def.name;
    this.material = def.material || 'glass';
    this.breakable = def.breakable !== false;
    this.dissolvable = true;
    this.distanceGrabMode = 'pull';
    this.mass = def.mass ?? 0.15;
    this.colliderSpecs = [];
    this.lastImpactSound = 0;
    this.gravityScale = 1;
    this.linearDamping = 0.05;
    this.angularDamping = 0.15;
    this.model = new THREE.Group();
    this.object.add(this.model);
  }

  /** Called by subclasses after building the model + colliderSpecs. */
  finalize() {
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = !o.material.transparent;
        o.receiveShadow = true;
      }
    });
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model, true);
    // Bounds are in the entity's local frame (the model sits at the entity origin).
    box.applyMatrix4(this.object.matrixWorld.clone().invert());
    this.localBounds.copy(box);
    this.prepareHighlight();
  }

  createBody(position, quaternion = null) {
    const P = this.app.physics;
    const R = P.R;
    if (this.body) P.removeBody(this.body);
    this.object.position.copy(position);
    if (quaternion) this.object.quaternion.copy(quaternion);
    this.body = P.dynamicBody(position, this.object.quaternion, {
      linearDamping: this.linearDamping,
      angularDamping: this.angularDamping,
      ccd: true,
    });
    const massEach = this.mass / Math.max(1, this.colliderSpecs.length);
    for (const s of this.colliderSpecs) {
      let desc;
      if (s.type === 'cylinder') desc = R.ColliderDesc.cylinder(s.hh, s.r);
      else if (s.type === 'box') desc = R.ColliderDesc.cuboid(s.hx, s.hy, s.hz);
      else if (s.type === 'ball') desc = R.ColliderDesc.ball(s.r);
      else if (s.type === 'capsule') desc = R.ColliderDesc.capsule(s.hh, s.r);
      else if (s.type === 'hull') desc = R.ColliderDesc.convexHull(s.points) || R.ColliderDesc.ball(0.03);
      else continue;
      const p = s.pos || [0, 0, 0];
      desc.setTranslation(p[0], p[1], p[2]);
      if (s.rot) desc.setRotation(s.rot);
      desc.setMass(massEach).setFriction(s.friction ?? 0.7).setRestitution(s.restitution ?? 0.12);
      desc.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
      P.addCollider(desc, this.body, this);
    }
    P.impactListeners.add(this);
    return this.body;
  }

  onImpact(speed, other) {
    if (this.removed || this.isHeld || this.disabled) return;
    const threshold = BREAK_SPEED[this.material] ?? 6;
    // Very soft things (molecules) never break glass.
    if (other && other.kind === 'molecule') return;
    if (this.breakable && speed > threshold) {
      this.shatter();
      return;
    }
    const now = performance.now();
    if (speed > 0.55 && now - this.lastImpactSound > 120) {
      this.lastImpactSound = now;
      this.app.audio?.play(IMPACT_SOUND[this.material] || 'thud', {
        position: this.object.position,
        volume: Math.min(0.6, speed * 0.15),
        rate: this.material === 'glass' ? 0.9 + Math.random() * 0.3 : 1,
      });
    }
  }

  /** Break apart and disappear. */
  shatter() {
    if (this.removed) return;
    const pos = this.worldBounds().getCenter(new THREE.Vector3());
    const size = this.worldBounds().getSize(new THREE.Vector3()).length() * 0.5;
    const vel = this.body ? new THREE.Vector3().copy(this.body.linvel()) : new THREE.Vector3();
    const color = this.material === 'glass' ? 0xeaf6ff : this.material === 'porcelain' ? 0xf4f2ea
      : this.material === 'wood' ? 0xa87b4a : this.material === 'plastic' ? 0xdddddd : 0x9a9ea6;
    this.app.effects.shatter(pos, color, Math.min(0.16, size), vel);
    const sound = this.material === 'glass' || this.material === 'porcelain' ? 'glass' : 'crunch';
    this.app.audio?.play(sound, { position: pos, volume: 0.9 });
    this.onBreak?.(pos, vel);
    this.app.events.emit('break', this);
    this.destroy();
  }

  pullAnchor() {
    // Hold the object by its centre (slightly below for tall glassware).
    const c = this.localBounds.getCenter(_v).clone();
    const invQ = _q.copy(this.holds[this.holds.length - 1].hand.gripQuaternion).invert();
    return c.applyQuaternion(this.object.quaternion).negate().applyQuaternion(invQ);
  }

  /** Local up axis in world space. */
  upVector(out = new THREE.Vector3()) {
    return out.set(0, 1, 0).applyQuaternion(this.object.quaternion);
  }

  update(dt) {
    if (this.stasis) {
      // Floating "stasis" glow until first picked up.
      if (!this.stasisRing) {
        this.stasisRing = new THREE.Mesh(
          new THREE.TorusGeometry(Math.max(0.03, (this.localBounds.max.x - this.localBounds.min.x) * 0.7), 0.0025, 8, 48),
          new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.7, toneMapped: false }),
        );
        this.stasisRing.rotation.x = Math.PI / 2;
        this.stasisRing.userData.noPick = true;
        this.stasisRing.userData.noHighlight = true;
        this.object.add(this.stasisRing);
      }
      this.stasisRing.visible = true;
      this.stasisRing.position.y = this.localBounds.min.y + (Math.sin(performance.now() / 400) * 0.5 + 0.5) * (this.localBounds.max.y - this.localBounds.min.y);
    } else if (this.stasisRing) {
      this.stasisRing.visible = false;
    }
  }
}

/**
 * A small physical push button that can be poked with a finger / controller tip or clicked
 * with a ray. Registered as a UI surface.
 */
export class PokeButton {
  constructor(app, { radius = 0.015, height = 0.008, color = 0xd63b3b, onPress, onRelease, holdTime = 0, parent }) {
    this.app = app;
    this.radius = radius;
    this.onPress = onPress;
    this.onRelease = onRelease;
    this.holdTime = holdTime;
    this.pressed = false;
    this.holdT = 0;
    this.group = new THREE.Group();
    this.capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.15 });
    this.capMat.userData.noClone = true;
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, height, 24), this.capMat);
    this.cap.position.y = height / 2;
    this.group.add(this.cap);
    this.enabled = true;
    if (parent) parent.add(this.group);
    app.uiSurfaces.push(this);
    this.hovering = new Set();
  }

  isVisible() {
    let o = this.group;
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    return this.enabled && !!this.group.parent;
  }

  raycast(raycaster) {
    const hits = raycaster.intersectObject(this.cap, false);
    if (!hits.length) return null;
    return { distance: hits[0].distance, point: hits[0].point, normal: new THREE.Vector3(0, 1, 0).applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion())) };
  }

  poke(tip) {
    this.group.updateWorldMatrix(true, false);
    const local = this.group.worldToLocal(tip.clone());
    const r = Math.hypot(local.x, local.z);
    const top = this.cap.position.y * 2;
    return { inside: r < this.radius * 1.4, depth: local.y - top, hit: { point: tip.clone(), distance: 0 } };
  }

  hover(hand) {
    this.hovering.add(hand);
    this.capMat.emissiveIntensity = this.pressed ? 0.6 : 0.35;
  }

  hoverEnd(hand) {
    this.hovering.delete(hand);
    if (!this.hovering.size) this.capMat.emissiveIntensity = this.pressed ? 0.6 : 0.15;
  }

  down() {
    this.pressed = true;
    this.holdT = 0;
    this.fired = false;
    this.cap.position.y = this.cap.geometry.parameters.height / 2 - 0.003;
    this.capMat.emissiveIntensity = 0.6;
    this.app.audio?.play('click', { position: this.group.getWorldPosition(new THREE.Vector3()), volume: 0.4 });
    if (!this.holdTime) { this.fired = true; this.onPress?.(); }
    return true;
  }

  up() {
    if (!this.pressed) return;
    this.pressed = false;
    this.cap.position.y = this.cap.geometry.parameters.height / 2;
    this.capMat.emissiveIntensity = this.hovering.size ? 0.35 : 0.15;
    this.onRelease?.(this.fired);
  }

  /** For hold-to-activate buttons. Returns progress 0..1. */
  update(dt) {
    if (this.pressed && this.holdTime && !this.fired) {
      this.holdT += dt;
      if (this.holdT >= this.holdTime) {
        this.fired = true;
        this.onPress?.();
      }
    }
    return this.holdTime ? Math.min(1, this.holdT / this.holdTime) * (this.pressed ? 1 : 0) : 0;
  }

  dispose() {
    const i = this.app.uiSurfaces.indexOf(this);
    if (i >= 0) this.app.uiSurfaces.splice(i, 1);
    this.group.removeFromParent();
  }
}
