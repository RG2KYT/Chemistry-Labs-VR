import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Thin wrapper around a Rapier world: body / collider creation, entity lookup by collider,
 * fixed-ish stepping and impact detection (used for breaking glassware).
 */
export class Physics {
  constructor() {
    this.R = null;
    this.world = null;
    this.colliderOwners = new Map(); // collider handle -> owner (entity or static tag)
    this.impactListeners = new Set(); // entities interested in impact events
    this.prevVel = new Map(); // body handle -> {x,y,z} velocity before step
    this.accumulator = 0;
  }

  async init() {
    // The compat build embeds the wasm as base64; init() may log a deprecation warning
    // about its argument signature, which is harmless.
    await RAPIER.init();
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 90;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  // ------------------------------------------------------------------------------------
  // Creation helpers

  fixedBody(position = { x: 0, y: 0, z: 0 }, rotation = null) {
    const desc = this.R.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z);
    if (rotation) desc.setRotation(rotation);
    return this.world.createRigidBody(desc);
  }

  dynamicBody(position, rotation, opts = {}) {
    const desc = this.R.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setCanSleep(true);
    if (rotation) desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    if (opts.gravityScale !== undefined) desc.setGravityScale(opts.gravityScale);
    if (opts.linearDamping !== undefined) desc.setLinearDamping(opts.linearDamping);
    if (opts.angularDamping !== undefined) desc.setAngularDamping(opts.angularDamping);
    if (opts.ccd) desc.setCcdEnabled(true);
    return this.world.createRigidBody(desc);
  }

  addCollider(desc, body, owner = null) {
    const c = this.world.createCollider(desc, body);
    if (owner) this.colliderOwners.set(c.handle, owner);
    return c;
  }

  /** Static box collider (center + half extents, optional quaternion). */
  staticBox(center, half, quat = null, owner = 'static', opts = {}) {
    const body = this.fixedBody(center, quat);
    const desc = this.R.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setFriction(opts.friction ?? 0.8)
      .setRestitution(opts.restitution ?? 0.1);
    const c = this.addCollider(desc, body, owner);
    return { body, collider: c };
  }

  staticCylinder(center, halfHeight, radius, owner = 'static') {
    const body = this.fixedBody(center);
    const c = this.addCollider(this.R.ColliderDesc.cylinder(halfHeight, radius).setFriction(0.8), body, owner);
    return { body, collider: c };
  }

  removeBody(body) {
    if (!body) return;
    const n = body.numColliders();
    for (let i = 0; i < n; i++) {
      const c = body.collider(i);
      this.colliderOwners.delete(c.handle);
    }
    this.prevVel.delete(body.handle);
    this.world.removeRigidBody(body);
  }

  removeCollider(collider) {
    if (!collider) return;
    this.colliderOwners.delete(collider.handle);
    this.world.removeCollider(collider, true);
  }

  ownerOf(collider) {
    return collider ? this.colliderOwners.get(collider.handle) ?? null : null;
  }

  // ------------------------------------------------------------------------------------
  // Stepping

  step(dt, onImpact) {
    // Remember velocities of impact-sensitive bodies (collision events report the
    // post-solve state, so we need the speed just before the hit).
    this.prevVel.clear();
    for (const ent of this.impactListeners) {
      const b = ent.body;
      if (b && b.isDynamic && b.isDynamic() && !b.isSleeping()) {
        const v = b.linvel();
        this.prevVel.set(b.handle, { x: v.x, y: v.y, z: v.z });
      }
    }
    // Use one or two fixed sub-steps per frame (72–120 Hz displays).
    this.accumulator = Math.min(this.accumulator + dt, 1 / 30);
    const h = 1 / 90;
    let steps = 0;
    while (this.accumulator >= h * 0.5 && steps < 3) {
      this.world.timestep = Math.min(h, Math.max(this.accumulator, 1 / 144));
      this.world.step(this.eventQueue);
      this.accumulator -= this.world.timestep;
      steps++;
      this.eventQueue.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        const c1 = this.world.getCollider(h1);
        const c2 = this.world.getCollider(h2);
        if (!c1 || !c2) return;
        const o1 = this.colliderOwners.get(h1);
        const o2 = this.colliderOwners.get(h2);
        if (onImpact) {
          if (o1 && this.impactListeners.has(o1)) onImpact(o1, o2, this.impactSpeed(c1, c2));
          if (o2 && this.impactListeners.has(o2)) onImpact(o2, o1, this.impactSpeed(c2, c1));
        }
      });
    }
  }

  impactSpeed(cSelf, cOther) {
    const b = cSelf.parent();
    if (!b) return 0;
    const v = this.prevVel.get(b.handle) || b.linvel();
    let vx = v.x, vy = v.y, vz = v.z;
    const ob = cOther.parent();
    if (ob && ob.isDynamic()) {
      const ov = this.prevVel.get(ob.handle) || ob.linvel();
      vx -= ov.x; vy -= ov.y; vz -= ov.z;
    }
    return Math.sqrt(vx * vx + vy * vy + vz * vz);
  }

  // ------------------------------------------------------------------------------------
  // Queries

  /** Ray cast; returns { collider, owner, toi, point } or null. */
  raycast(origin, dir, maxDist, excludeBody = null, predicate = null) {
    const ray = new this.R.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, undefined,
      excludeBody || undefined, predicate || undefined);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      collider: hit.collider,
      owner: this.ownerOf(hit.collider),
      toi: t,
      normal: hit.normal,
      point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
    };
  }
}
