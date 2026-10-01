import * as THREE from 'three';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ray = new THREE.Raycaster();

/**
 * Grabbing (near, distance and two-handed), UI pointing / poking and the laser visuals.
 *
 * Entities implement: grabbable, grabDistance(point) -> {dist, part}, onGrab(rec),
 * updateHolds(dt), onRelease(rec, vel, angVel), setHighlight(on), optional pickMeshes,
 * distanceGrabMode ('pull' | 'remote' | 'none'), multiHold.
 * UI surfaces implement: raycast(raycaster) -> hit, hover(hand, hit), down(hand, hit),
 * up(hand), poke(tip) -> {inside, depth, hit}.
 */
export class Interaction {
  constructor(app) {
    this.app = app;
    this.records = new Set();
    this.lasers = new Map();
    this.pokeStates = new Map(); // hand -> { surface, depth, pressed }
    this.hovered = new Map(); // hand -> entity
    this.enabled = true;
  }

  // ------------------------------------------------------------------------------------
  // Visuals

  laserFor(hand) {
    let l = this.lasers.get(hand);
    if (l) return l;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fe7ff, transparent: true, opacity: 0.75, depthWrite: false }));
    line.frustumCulled = false;
    line.renderOrder = 10;
    const dot = new THREE.Mesh(
      new THREE.RingGeometry(0.004, 0.0075, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }),
    );
    dot.renderOrder = 11;
    const group = new THREE.Group();
    group.add(line, dot);
    group.visible = false;
    this.app.scene.add(group);
    l = { group, line, dot };
    this.lasers.set(hand, l);
    return l;
  }

  showLaser(hand, hit, color = 0x9fe7ff) {
    if (hand.kind === 'mouse') return;
    const l = this.laserFor(hand);
    l.group.visible = true;
    const pos = l.line.geometry.attributes.position;
    pos.setXYZ(0, hand.rayOrigin.x, hand.rayOrigin.y, hand.rayOrigin.z);
    const end = hit ? hit.point : _v.copy(hand.rayOrigin).addScaledVector(hand.rayDirection, 0.6);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    l.line.material.color.setHex(color);
    l.dot.visible = !!hit;
    if (hit) {
      l.dot.position.copy(hit.point);
      if (hit.normal) l.dot.lookAt(_v2.copy(hit.point).add(hit.normal));
      else l.dot.lookAt(hand.rayOrigin);
      const s = Math.max(0.6, hit.distance * 0.9);
      l.dot.scale.setScalar(s);
    }
  }

  hideLaser(hand) {
    const l = this.lasers.get(hand);
    if (l) l.group.visible = false;
  }

  // ------------------------------------------------------------------------------------
  // Queries

  grabbables() {
    return this.app.entities.filter((e) => e.grabbable && !e.removed && !e.disabled);
  }

  nearest(hand) {
    let best = null;
    let bestDist = hand.reach;
    let bestPart = null;
    for (const e of this.grabbables()) {
      const r = e.grabDistance(hand.gripPosition, hand);
      if (r && r.dist < bestDist) {
        bestDist = r.dist;
        best = e;
        bestPart = r.part;
      }
    }
    return best ? { entity: best, part: bestPart, dist: bestDist } : null;
  }

  rayEntity(hand, maxDist = 6) {
    _ray.set(hand.rayOrigin, hand.rayDirection);
    _ray.far = maxDist;
    let best = null;
    for (const e of this.grabbables()) {
      if (e.distanceGrabMode === 'none' && hand.kind !== 'mouse') continue;
      const targets = e.pickMeshes || [e.object];
      const hits = _ray.intersectObjects(targets, true);
      for (const h of hits) {
        if (h.object.userData.noPick) continue;
        if (!best || h.distance < best.distance) {
          best = { entity: e, distance: h.distance, point: h.point.clone(), object: h.object, part: e.partFromObject ? e.partFromObject(h.object) : null };
        }
        break;
      }
    }
    return best;
  }

  rayUI(hand) {
    _ray.set(hand.rayOrigin, hand.rayDirection);
    _ray.far = 8;
    let best = null;
    for (const s of this.app.uiSurfaces) {
      if (!s.isVisible()) continue;
      const hit = s.raycast(_ray);
      if (hit && (!best || hit.distance < best.distance)) best = { ...hit, surface: s };
    }
    return best;
  }

  // ------------------------------------------------------------------------------------
  // Grab / release

  grab(hand, entity, part, mode = 'near', hit = null) {
    if (hand.held) this.release(hand);
    if (entity.holds.length && !entity.multiHold) {
      for (const r of entity.holds.slice()) this.release(r.hand, true);
    }
    if (hand.kind === 'mouse' && hit) {
      hand.holdDistance = hit.distance;
      hand.gripPosition.copy(hand.rayOrigin).addScaledVector(hand.rayDirection, hit.distance);
    }
    const rec = { hand, entity, part, mode, pull: null };
    hand.held = rec;
    entity.holds.push(rec);
    this.records.add(rec);
    if (mode === 'pull') {
      // Fly the object into the hand.
      rec.pull = { t: 0, from: entity.object.position.clone() };
    }
    entity.onGrab(rec);
    if (mode === 'pull' && entity.pullAnchor) {
      // Attach so that the grabbed part ends up in the palm.
      rec.offsetPos = entity.pullAnchor(rec);
    } else if (mode === 'pull') {
      rec.offsetPos = new THREE.Vector3(0, 0, -0.02);
    }
    entity.setHighlight(false);
    hand.pulse(0.35, 25);
    this.app.audio?.play('grab', { position: entity.object.position, volume: 0.25 });
    this.app.events.emit('grab', rec);
    return rec;
  }

  release(hand, silent = false) {
    const rec = hand.held;
    if (!rec) return;
    hand.held = null;
    this.records.delete(rec);
    const e = rec.entity;
    const i = e.holds.indexOf(rec);
    if (i >= 0) e.holds.splice(i, 1);
    // Throw velocity: hand linear velocity plus the tangential part from hand rotation.
    const lin = hand.velocity.clone();
    const ang = hand.angularVelocity.clone();
    const r = _v.copy(e.object.position).sub(hand.gripPosition);
    lin.add(_v2.copy(ang).cross(r));
    if (lin.length() > 12) lin.setLength(12);
    if (hand.kind === 'mouse') { lin.multiplyScalar(0.6); ang.multiplyScalar(0.3); }
    e.onRelease(rec, lin, ang);
    if (!silent) this.app.events.emit('release', rec);
  }

  forceRelease(hand) {
    if (hand && hand.held) this.release(hand, true);
  }

  // ------------------------------------------------------------------------------------

  update(dt) {
    const hands = this.app.input.hands;
    for (const hand of hands) {
      if (!hand.active) {
        if (hand.held) this.release(hand);
        this.hideLaser(hand);
        this.setHover(hand, null);
        continue;
      }
      this.updateHand(hand, dt);
    }
    const desk = this.app.input.desktop;
    if (desk && desk.anchor.held && !desk.hand.held) this.releaseAnchor();
    // Pull-in animation & held poses
    const done = new Set();
    for (const rec of this.records) {
      if (rec.pull) {
        rec.pull.t += dt / 0.22;
        if (rec.pull.t >= 1) rec.pull = null;
      }
      if (done.has(rec.entity)) continue;
      done.add(rec.entity);
      if (!rec.entity.removed) rec.entity.updateHolds(dt);
    }
  }

  setHover(hand, entity) {
    const prev = this.hovered.get(hand);
    if (prev === entity) return;
    this.hovered.set(hand, entity);
    const stillHovered = (e) => [...this.hovered.values()].includes(e);
    if (prev && !stillHovered(prev)) prev.setHighlight(false);
    if (entity) {
      entity.setHighlight(true);
      hand.pulse(0.08, 8);
    }
  }

  updateHand(hand, dt) {
    // --- Holding something
    if (hand.held) {
      this.hideLaser(hand);
      this.setHover(hand, null);
      if (!hand.grabPressed) this.release(hand);
      return;
    }

    // --- Pressing UI with the ray
    if (hand.uiCapture) {
      const hit = this.rayUI(hand);
      if (hit && hit.surface === hand.uiCapture) hand.uiCapture.hover(hand, hit);
      this.showLaser(hand, hit, 0xffffff);
      if (!hand.selectPressed && !hand.grabPressed) {
        hand.uiCapture.up(hand);
        hand.uiCapture = null;
      }
      return;
    }

    // --- Poking UI with the finger / controller tip
    const poked = this.updatePoke(hand);

    const near = hand.kind === 'mouse' ? null : this.nearest(hand);
    const uiHit = hand.rayEnabled && !poked ? this.rayUI(hand) : null;
    let rayEnt = null;
    if (!near && hand.rayEnabled) rayEnt = this.rayEntity(hand, hand.kind === 'mouse' ? 20 : 5);
    const entityFirst = rayEnt && (!uiHit || rayEnt.distance < uiHit.distance);

    // Hover feedback
    let hoverEntity = near ? near.entity : null;
    if (!hoverEntity && entityFirst && (hand.kind === 'mouse' || rayEnt.distance > 0.3)) hoverEntity = rayEnt.entity;
    this.setHover(hand, hoverEntity);
    if (near && near.entity.onHoverPart) near.entity.onHoverPart(hand, near.part);

    // UI hover
    for (const s of this.app.uiSurfaces) if (!uiHit || uiHit.surface !== s) s.hoverEnd?.(hand);
    if (uiHit && !entityFirst && !near) uiHit.surface.hover(hand, uiHit);

    // Laser: show when pointing at UI or (for controllers) at a far grabbable.
    if (!near && !poked && uiHit && !entityFirst) this.showLaser(hand, uiHit);
    else if (!near && !poked && entityFirst && hand.kind !== 'mouse') this.showLaser(hand, rayEnt, 0xffd27a);
    else if (!near && !poked && hand.kind === 'controller') this.showLaser(hand, null, 0x6fb6d6);
    else this.hideLaser(hand);

    if (!hand.grabDown) return;

    // --- Start an interaction
    if (near) {
      this.grab(hand, near.entity, near.part, 'near');
      return;
    }
    if (hand.kind === 'mouse') {
      if (entityFirst) this.mouseGrab(hand, rayEnt);
      else if (uiHit) this.uiDown(hand, uiHit);
      return;
    }
    if (uiHit && !entityFirst && hand.selectDown) {
      this.uiDown(hand, uiHit);
      return;
    }
    if (rayEnt) {
      const mode = rayEnt.entity.distanceGrabMode || 'pull';
      if (mode === 'none') return;
      this.grab(hand, rayEnt.entity, rayEnt.part, mode === 'remote' ? 'remote' : 'pull', rayEnt);
    }
  }

  mouseGrab(hand, hit) {
    const e = hit.entity;
    const input = this.app.input.desktop;
    if (input && input.shiftGrab && e.kind === 'molecule' && e.atoms.length > 1 && hit.part) {
      // Shift+drag: a virtual second hand holds the rest of the molecule still.
      const anchor = input.anchor;
      const other = e.farthestAtomFrom(hit.part);
      anchor.active = true;
      anchor.gripPosition.copy(e.atomWorldPosition(other));
      anchor.gripQuaternion.copy(e.object.quaternion);
      anchor.setButtons(true, false);
      this.grab(anchor, e, other, 'near');
      this.grab(hand, e, hit.part, 'near', hit);
      return;
    }
    this.grab(hand, e, hit.part, 'remote', hit);
  }

  uiDown(hand, hit) {
    const captured = hit.surface.down(hand, hit);
    if (captured !== false) hand.uiCapture = hit.surface;
    hand.pulse(0.25, 15);
  }

  updatePoke(hand) {
    if (!hand.pokeTip || hand.held) return false;
    let state = this.pokeStates.get(hand);
    if (!state) {
      state = { surface: null, depth: 1, pressed: false };
      this.pokeStates.set(hand, state);
    }
    // Nearest surface under the finger
    let best = null;
    for (const s of this.app.uiSurfaces) {
      if (!s.isVisible() || !s.poke) continue;
      const p = s.poke(hand.pokeTip);
      if (!p || !p.inside) continue;
      if (p.depth < 0.06 && p.depth > -0.05 && (!best || Math.abs(p.depth) < Math.abs(best.depth))) best = { ...p, surface: s };
    }
    if (!best) {
      if (state.pressed && state.surface) state.surface.up(hand);
      state.surface = null;
      state.pressed = false;
      state.depth = 1;
      return false;
    }
    if (state.surface !== best.surface) {
      if (state.pressed && state.surface) state.surface.up(hand);
      state.surface = best.surface;
      state.pressed = false;
      state.depth = best.depth;
    }
    const r = hand.pokeRadius;
    best.surface.hover(hand, best.hit);
    if (!state.pressed && best.depth < r && state.depth >= r * 0.7) {
      state.pressed = true;
      best.surface.down(hand, best.hit);
      hand.pulse(0.45, 20);
    } else if (state.pressed && best.depth > r + 0.012) {
      state.pressed = false;
      best.surface.up(hand);
    }
    state.depth = best.depth;
    return best.depth < 0.05;
  }

  /** Called by DesktopInput when the left button is released. */
  releaseAnchor() {
    const anchor = this.app.input.desktop?.anchor;
    if (anchor && anchor.held) this.release(anchor);
    if (anchor) { anchor.active = false; anchor.setButtons(false, false); }
  }
}
