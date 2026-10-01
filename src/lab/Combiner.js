import * as THREE from 'three';
import { combineSynthesis } from '../chem/reactions.js';
import { SUBSTANCES } from '../chem/substances.js';

const DWELL = 0.45;

/**
 * Physical forms combine like atoms do: hold a container with something in it and touch its
 * rim against another container — after a moment its contents flow into the other one and
 * they react.
 */
export class Combiner {
  constructor(app) {
    this.app = app;
    this.dwell = 0;
    this.pair = null;
    this.cooldown = 0;
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.06, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x8ff0c2, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }),
    );
    this.ring.visible = false;
    this.ring.renderOrder = 9;
    this.ring.userData.noPick = true;
    app.scene.add(this.ring);
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const containers = this.app.entities.filter((e) => e.isContainer && !e.removed && !e.disabled);
    let best = null;
    for (const a of containers) {
      if (!a.isHeld || a.contents.isEmpty) continue;
      const ra = a.rim();
      const ca = ra.center.clone();
      for (const b of containers) {
        if (b === a) continue;
        const rb = b.rim();
        const d = ca.distanceTo(rb.center);
        const reach = (ra.radius + rb.radius) * 0.85 + 0.025;
        if (d < reach && (!best || d < best.d)) best = { a, b, d, ca, cb: rb.center.clone(), r: Math.max(ra.radius, rb.radius) };
      }
    }
    if (!best || this.cooldown > 0) {
      this.dwell = 0;
      this.pair = null;
      this.ring.visible = false;
      return;
    }
    if (!this.pair || this.pair.a !== best.a || this.pair.b !== best.b) {
      this.pair = best;
      this.dwell = 0;
      for (const r of best.a.holds) r.hand.pulse(0.2, 15);
    }
    this.dwell += dt;
    const t = Math.min(1, this.dwell / DWELL);
    this.ring.visible = true;
    this.ring.position.lerpVectors(best.ca, best.cb, 0.5);
    this.ring.lookAt(this.app.headPosition());
    this.ring.scale.setScalar(best.r * (1.6 - t * 0.6));
    this.ring.material.opacity = 0.3 + 0.6 * t;
    if (this.dwell >= DWELL) {
      this.combine(best.a, best.b);
      this.cooldown = 1.5;
      this.ring.visible = false;
      this.pair = null;
    }
  }

  combine(a, b) {
    const app = this.app;
    app.history?.record('Combine');
    const from = a.contents;
    const moved = from.takeLiquid(from.liquidVolume);
    moved.addMixture(from.takeSolid(from.solidVolume));
    for (const [id, ml] of [...from.items]) {
      if (SUBSTANCES[id].phase === 'gas') {
        from.remove(id, ml);
        moved.add(id, ml);
      }
    }
    moved.foam = from.foam;
    from.foam = 0;
    b.receive(moved);
    const events = combineSynthesis(b.contents);
    const p = b.liquidSurfacePoint(new THREE.Vector3());
    app.effects.sparkle(p, 0x8ff0c2, 30, 0.06);
    app.audio?.play('bond', { position: p, volume: 0.6, rate: 0.8 });
    for (const r of a.holds.concat(b.holds)) r.hand.pulse(0.7, 50);
    for (const e of events) {
      if (e.violent) {
        app.effects.flash(p, 0xffe6a0, 0.15);
        app.audio?.play('pop', { position: p, volume: 0.7 });
      }
    }
    b.labelT = 4;
    const top = b.contents.summary()[0];
    if (top) app.toasts.show(events.length ? `They reacted: ${top.name}!` : `Combined: ${top.name}`, '#8ff0c2', 2.2);
    app.events.emit('combine', { from: a, to: b, events });
  }
}
