import * as THREE from 'three';
import { Entity } from '../core/Entity.js';
import { neighbors, vsepr, openSites, formulaString, canAcceptBond } from './graph.js';
import { identify } from './compounds.js';
import { drawFormula, font, roundRect } from '../ui/canvasUtil.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export function atomRadius(el) {
  return 0.014 + (el.covalentRadius / 100) * 0.022;
}

export function bondLength(a, b, order = 1) {
  const ra = atomRadius(a), rb = atomRadius(b);
  const base = Math.min(0.22, Math.max(ra + rb + 0.028, ((a.covalentRadius + b.covalentRadius) / 100) * 0.11));
  return base * (order === 3 ? 0.82 : order === 2 ? 0.9 : 1);
}

function isIonic(a, b) {
  if (a.isMetal === b.isMetal) return false;
  const ea = a.electronegativity ?? 1.5, eb = b.electronegativity ?? 1.5;
  return Math.abs(ea - eb) > 1.6;
}

// Shared resources ---------------------------------------------------------------------
const SPHERE = new THREE.SphereGeometry(1, 32, 20);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
CYL.translate(0, 0.5, 0);
const STUB = new THREE.SphereGeometry(1, 12, 8);
const atomMats = new Map();
const labelTextures = new Map();
let stubMat = null;
let haloMat = null;
let ionicMat = null;

function atomMaterial(el) {
  let m = atomMats.get(el.symbol);
  if (!m) {
    const color = new THREE.Color(el.color);
    m = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.32,
      metalness: 0.0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      sheen: 0.2,
    });
    atomMats.set(el.symbol, m);
  }
  return m;
}

function symbolTexture(el) {
  let t = labelTextures.get(el.symbol);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(el.color);
  const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
  ctx.fillStyle = lum > 0.55 ? 'rgba(10,16,28,0.92)' : 'rgba(255,255,255,0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(el.symbol.length > 1 ? 66 : 80, 800);
  ctx.fillText(el.symbol, 64, 68);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  labelTextures.set(el.symbol, t);
  return t;
}

function fibonacciDirs(n) {
  const out = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    out.push(new THREE.Vector3(Math.cos(g * i) * r, y, Math.sin(g * i) * r));
  }
  return out;
}
const CANDIDATE_DIRS = fibonacciDirs(48);

let nextAtomId = 1;

/**
 * A molecule (or single atom) floating in the lab. It is one rigid body made of one sphere
 * collider per atom. Atoms keep local positions that relax towards VSEPR geometry.
 */
export class Molecule extends Entity {
  constructor(app, atoms = [], bonds = []) {
    super(app);
    this.kind = 'molecule';
    this.multiHold = true;
    this.distanceGrabMode = 'pull';
    this.atoms = atoms; // { id, el, local: Vector3, mesh, label, collider, stubs }
    this.bonds = bonds; // { a, b, order }
    this.bondGroup = new THREE.Group();
    this.object.add(this.bondGroup);
    this.settle = 0;
    this.identity = null;
    this.gravityScale = 0;
    this.linearDamping = 1.6;
    this.angularDamping = 2.0;
    this.pickMeshes = [];
    this.hoverAtom = null;
    this.flashT = 0;
    this.absorbing = null;

    stubMat ??= new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
    haloMat ??= new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.28, side: THREE.BackSide, depthWrite: false, toneMapped: false });
    ionicMat ??= new THREE.MeshPhysicalMaterial({ color: 0xc9b6ff, transparent: true, opacity: 0.55, roughness: 0.2, emissive: 0x4a2a88, emissiveIntensity: 0.4 });

    this.halo = new THREE.Mesh(SPHERE, haloMat);
    this.halo.visible = false;
    this.halo.userData.noPick = true;
    this.object.add(this.halo);

    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    this.label.renderOrder = 5;
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 640;
    this.labelCanvas.height = 150;
    this.label.material.map = new THREE.CanvasTexture(this.labelCanvas);
    this.label.material.map.colorSpace = THREE.SRGBColorSpace;
    this.label.material.map.anisotropy = 4;
    this.label.userData.noPick = true;

    this.previewLine = null;
  }

  // ------------------------------------------------------------------------------------
  // Construction

  static create(app, specs, bondPairs, position, quaternion = null) {
    const atoms = specs.map((s) => ({ id: nextAtomId++, el: s.el, local: s.local.clone() }));
    const bonds = bondPairs.map(([i, j, order]) => ({ a: atoms[i], b: atoms[j], order: order || 1 }));
    const m = new Molecule(app, atoms, bonds);
    m.object.position.copy(position);
    if (quaternion) m.object.quaternion.copy(quaternion);
    m.recenter(false);
    m.buildBody();
    m.rebuildVisuals();
    m.refreshIdentity(false);
    return m;
  }

  buildBody() {
    const P = this.app.physics;
    if (this.body) P.removeBody(this.body);
    this.body = P.dynamicBody(this.object.position, this.object.quaternion, {
      gravityScale: this.gravityScale,
      linearDamping: this.linearDamping,
      angularDamping: this.angularDamping,
      ccd: true,
    });
    for (const a of this.atoms) {
      const desc = P.R.ColliderDesc.ball(atomRadius(a.el))
        .setTranslation(a.local.x, a.local.y, a.local.z)
        .setDensity(400)
        .setRestitution(0.35)
        .setFriction(0.4);
      a.collider = P.addCollider(desc, this.body, this);
    }
  }

  rebuildColliders() {
    const P = this.app.physics;
    if (!this.body) return;
    for (const a of this.atoms) {
      if (a.collider && a.collider.parent() === this.body) continue;
      const desc = P.R.ColliderDesc.ball(atomRadius(a.el))
        .setTranslation(a.local.x, a.local.y, a.local.z)
        .setDensity(400)
        .setRestitution(0.35)
        .setFriction(0.4);
      a.collider = P.addCollider(desc, this.body, this);
    }
  }

  updateColliderPositions() {
    for (const a of this.atoms) {
      if (a.collider && a.collider.isValid && a.collider.isValid()) a.collider.setTranslationWrtParent(a.local);
      else if (a.collider) a.collider.setTranslationWrtParent(a.local);
    }
  }

  rebuildVisuals() {
    this.pickMeshes = [];
    for (const a of this.atoms) {
      if (!a.mesh) {
        const r = atomRadius(a.el);
        a.mesh = new THREE.Mesh(SPHERE, atomMaterial(a.el));
        a.mesh.scale.setScalar(r);
        a.mesh.castShadow = true;
        a.mesh.userData.atom = a;
        a.symbol = new THREE.Sprite(new THREE.SpriteMaterial({ map: symbolTexture(a.el), transparent: true, depthWrite: false, toneMapped: false }));
        a.symbol.scale.setScalar(r * 1.15);
        a.symbol.userData.noPick = true;
        a.stubGroup = new THREE.Group();
      }
      if (a.mesh.parent !== this.object) this.object.add(a.mesh, a.symbol, a.stubGroup);
      a.mesh.position.copy(a.local);
      this.pickMeshes.push(a.mesh);
    }
    this.rebuildBonds();
    this.rebuildStubs();
    this.updateBounds();
  }

  rebuildBonds() {
    for (const c of this.bondGroup.children.slice()) this.bondGroup.remove(c);
    for (const b of this.bonds) {
      b.meshes = [];
      const ionic = isIonic(b.a.el, b.b.el);
      const n = ionic ? 1 : b.order;
      for (let i = 0; i < n; i++) {
        for (const half of [0, 1]) {
          const mat = ionic ? ionicMat : atomMaterial(half === 0 ? b.a.el : b.b.el);
          const m = new THREE.Mesh(CYL, mat);
          m.castShadow = true;
          m.userData.noPick = true;
          this.bondGroup.add(m);
          b.meshes.push({ mesh: m, idx: i, half, n, ionic });
        }
      }
    }
    this.layoutBonds();
  }

  layoutBonds() {
    const up = new THREE.Vector3(0, 1, 0);
    for (const b of this.bonds) {
      const pa = b.a.mesh ? b.a.mesh.position : b.a.local;
      const pb = b.b.mesh ? b.b.mesh.position : b.b.local;
      const dir = _v.copy(pb).sub(pa);
      const len = dir.length();
      if (len < 1e-5) continue;
      dir.divideScalar(len);
      // Perpendicular used to offset double/triple bonds: prefer the plane of a neighbour.
      let perp = null;
      const nbs = neighbors(b.a, this.bonds).filter((x) => x !== b.b);
      if (nbs.length) {
        perp = _v2.copy(nbs[0].local).sub(b.a.local);
        perp.addScaledVector(dir, -perp.dot(dir));
      }
      if (!perp || perp.lengthSq() < 1e-6) {
        perp = _v2.crossVectors(dir, Math.abs(dir.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0));
      }
      perp.normalize();
      const ra = atomRadius(b.a.el), rb = atomRadius(b.b.el);
      const mid = (len - ra - rb) / 2 + ra; // split at the visible gap midpoint
      _q.setFromUnitVectors(up, dir);
      for (const part of b.meshes) {
        const r = part.ionic ? 0.0045 : part.n === 1 ? 0.0075 : 0.0048;
        const spread = part.n === 1 ? 0 : 0.0115;
        const off = (part.idx - (part.n - 1) / 2) * spread;
        const start = part.half === 0 ? 0 : mid;
        const segLen = part.half === 0 ? mid : len - mid;
        part.mesh.position.copy(pa).addScaledVector(dir, start).addScaledVector(perp, off);
        part.mesh.quaternion.copy(_q);
        part.mesh.scale.set(r, segLen, r);
      }
    }
  }

  rebuildStubs() {
    for (const a of this.atoms) {
      if (!a.stubGroup) continue;
      for (const c of a.stubGroup.children.slice()) a.stubGroup.remove(c);
      const open = openSites(a, this.bonds);
      if (!open) continue;
      const r = atomRadius(a.el);
      const used = neighbors(a, this.bonds).map((n) => n.local.clone().sub(a.local).normalize());
      const picked = [];
      for (let i = 0; i < open; i++) {
        let best = null;
        let bestScore = -Infinity;
        for (const d of CANDIDATE_DIRS) {
          let minAng = Math.PI;
          for (const u of used.concat(picked)) minAng = Math.min(minAng, d.angleTo(u));
          // Prefer a direction away from the camera-irrelevant default; deterministic.
          const score = minAng + d.y * 0.01;
          if (score > bestScore) { bestScore = score; best = d; }
        }
        picked.push(best.clone());
      }
      for (const d of picked) {
        const s = new THREE.Mesh(STUB, stubMat);
        s.scale.setScalar(0.0055);
        s.position.copy(d).multiplyScalar(r + 0.006);
        s.userData.noPick = true;
        s.userData.dir = d;
        a.stubGroup.add(s);
      }
    }
  }

  updateBounds() {
    let maxR = 0;
    const box = new THREE.Box3();
    for (const a of this.atoms) {
      const r = atomRadius(a.el);
      box.expandByPoint(_v.copy(a.local).addScalar(r));
      box.expandByPoint(_v.copy(a.local).addScalar(-r));
      maxR = Math.max(maxR, a.local.length() + r);
    }
    this.localBounds.copy(box);
    this.radius = maxR;
  }

  /** Shift local coordinates so the centroid is at the body origin (world positions kept). */
  recenter(adjustBody = true) {
    if (!this.atoms.length) return;
    const c = new THREE.Vector3();
    for (const a of this.atoms) c.add(a.local);
    c.divideScalar(this.atoms.length);
    if (c.lengthSq() < 1e-10) return;
    for (const a of this.atoms) a.local.sub(c);
    const worldShift = c.clone().applyQuaternion(this.object.quaternion);
    this.object.position.add(worldShift);
    if (adjustBody && this.body) {
      this.body.setTranslation(this.object.position, true);
    }
    for (const rec of this.holds) {
      if (rec.offsetPos) rec.offsetPos.add(worldShift.clone().applyQuaternion(rec.hand.gripQuaternion.clone().invert()));
    }
  }

  // ------------------------------------------------------------------------------------
  // Identity + label

  refreshIdentity(celebrate = true) {
    const prev = this.identity;
    this.identity = identify(this.atoms, this.bonds);
    this.drawLabel();
    if (celebrate && this.identity.known && (!prev || prev.substance !== this.identity.substance) && this.atoms.length > 1) {
      this.flashT = 1.2;
      this.app.audio?.play('discover', { position: this.object.position, volume: 0.5 });
      this.app.events.emit('discover', this);
    }
  }

  drawLabel() {
    const c = this.labelCanvas;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const id = this.identity;
    const formula = formulaString(this.atoms);
    const open = this.atoms.reduce((s, a) => s + openSites(a, this.bonds), 0);
    let title = formula;
    let sub = '';
    let subColor = '#a9c6e6';
    if (id.ok && id.substance) {
      sub = id.substance.custom ? 'Valid molecule (not in database)' : id.substance.name;
      subColor = id.substance.custom ? '#c6d4e4' : '#8ff0c2';
    } else if (open > 0) {
      sub = `${open} open bond${open > 1 ? 's' : ''}`;
      subColor = '#ffcf6b';
    } else {
      sub = 'Unstable';
      subColor = '#ff9b8f';
    }
    ctx.font = font(52, 700);
    const fw = Math.max(200, Math.min(600, ctx.measureText(title).width + 40));
    ctx.font = font(36, 600);
    const sw = ctx.measureText(sub).width + 40;
    const w = Math.min(c.width - 8, Math.max(fw, sw));
    const x = (c.width - w) / 2;
    roundRect(ctx, x, 6, w, c.height - 12, 26);
    ctx.fillStyle = 'rgba(8,14,24,0.78)';
    ctx.fill();
    ctx.strokeStyle = subColor;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    drawFormula(ctx, title, c.width / 2, 64, 52, { align: 'center', weight: 700 });
    ctx.fillStyle = subColor;
    ctx.font = font(34, 600);
    ctx.textAlign = 'center';
    ctx.fillText(sub, c.width / 2, 118);
    this.label.material.map.needsUpdate = true;
    this.label.scale.set(0.18, 0.18 * (c.height / c.width), 1);
  }

  // ------------------------------------------------------------------------------------
  // Geometry relaxation (bond lengths + VSEPR angles + overlap repulsion)

  relax(iterations = 6) {
    const atoms = this.atoms;
    if (atoms.length < 2) return 0;
    let maxMove = 0;
    const adj = new Map(atoms.map((a) => [a, neighbors(a, this.bonds)]));
    const geo = new Map(atoms.map((a) => [a, vsepr(a, this.bonds)]));
    const bondLen = (x, y) => {
      const b = this.bonds.find((bb) => (bb.a === x && bb.b === y) || (bb.a === y && bb.b === x));
      return bondLength(x.el, y.el, b ? b.order : 1);
    };
    const move = (a, d, w) => {
      a.local.addScaledVector(d, w);
      maxMove = Math.max(maxMove, Math.abs(w) * d.length());
    };
    const d = new THREE.Vector3();
    for (let it = 0; it < iterations; it++) {
      // Bonds
      for (const b of this.bonds) {
        d.copy(b.b.local).sub(b.a.local);
        const len = d.length() || 1e-6;
        const target = bondLength(b.a.el, b.b.el, b.order);
        const corr = (len - target) / len * 0.5;
        move(b.a, d, corr);
        move(b.b, d, -corr);
      }
      // Angles via 1-3 distances
      for (const c of atoms) {
        const nbs = adj.get(c);
        if (nbs.length < 2) continue;
        const g = geo.get(c);
        if (nbs.length >= 5) {
          // Spread evenly (trigonal bipyramid / octahedron)
          for (let i = 0; i < nbs.length; i++) {
            for (let j = i + 1; j < nbs.length; j++) {
              d.copy(nbs[j].local).sub(nbs[i].local);
              const len = d.length() || 1e-6;
              const L = (bondLen(c, nbs[i]) + bondLen(c, nbs[j])) / 2;
              const want = L * Math.SQRT2;
              if (len < want) {
                const corr = (len - want) / len * 0.25;
                move(nbs[i], d, corr);
                move(nbs[j], d, -corr);
              }
            }
          }
          continue;
        }
        if (nbs.length === 2 && g.angle >= 179) {
          // Linear centre (CO₂, HCN, BeCl₂…): pull the centre onto the line between neighbours.
          const a0 = nbs[0].local, a1 = nbs[1].local;
          const ab = d.copy(a1).sub(a0);
          const t = THREE.MathUtils.clamp(c.local.clone().sub(a0).dot(ab) / Math.max(1e-8, ab.lengthSq()), 0, 1);
          const onLine = a0.clone().addScaledVector(ab, t);
          const off = onLine.sub(c.local).multiplyScalar(0.5);
          c.local.add(off);
          nbs[0].local.addScaledVector(off, -0.5);
          nbs[1].local.addScaledVector(off, -0.5);
          maxMove = Math.max(maxMove, off.length());
        }
        const ang = THREE.MathUtils.degToRad(g.angle);
        for (let i = 0; i < nbs.length; i++) {
          for (let j = i + 1; j < nbs.length; j++) {
            const La = bondLen(c, nbs[i]);
            const Lb = bondLen(c, nbs[j]);
            const target = Math.sqrt(La * La + Lb * Lb - 2 * La * Lb * Math.cos(ang));
            d.copy(nbs[j].local).sub(nbs[i].local);
            const len = d.length() || 1e-6;
            const corr = (len - target) / len * 0.3;
            move(nbs[i], d, corr);
            move(nbs[j], d, -corr);
          }
        }
      }
      // Non-bonded overlap repulsion
      for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
          const a = atoms[i], b = atoms[j];
          if (adj.get(a).includes(b)) continue;
          d.copy(b.local).sub(a.local);
          const len = d.length() || 1e-6;
          const min = (atomRadius(a.el) + atomRadius(b.el)) * 1.25;
          if (len < min) {
            if (len < 1e-4) d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
            const corr = (len - min) / Math.max(len, 1e-4) * 0.3;
            move(a, d, corr);
            move(b, d, -corr);
          }
        }
      }
    }
    return maxMove;
  }

  // ------------------------------------------------------------------------------------
  // Grab protocol

  grabDistance(point) {
    if (this.disabled || this.absorbing) return Infinity;
    this.object.updateWorldMatrix(true, false);
    let best = Infinity;
    let part = null;
    for (const a of this.atoms) {
      a.mesh.getWorldPosition(_v);
      const d = _v.distanceTo(point) - atomRadius(a.el);
      if (d < best) { best = d; part = a; }
    }
    return { dist: Math.max(0, best), part };
  }

  partFromObject(obj) {
    return obj.userData.atom || null;
  }

  onHoverPart(hand, atom) {
    this.hoverAtom = atom;
  }

  setHighlight(on) {
    this.highlighted = on;
    if (!on) this.hoverAtom = null;
  }

  atomWorldPosition(atom, out = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    return out.copy(atom.local).applyMatrix4(this.object.matrixWorld);
  }

  farthestAtomFrom(atom) {
    let best = null, bd = -1;
    for (const a of this.atoms) {
      const d = a.local.distanceTo(atom.local);
      if (d > bd) { bd = d; best = a; }
    }
    return best;
  }

  pullAnchor(rec) {
    // Put the grabbed atom in the palm.
    const atom = rec.part || this.atoms[0];
    const invQ = rec.hand.gripQuaternion.clone().invert();
    const atomOffset = atom.local.clone().applyQuaternion(this.object.quaternion);
    return atomOffset.negate().applyQuaternion(invQ);
  }

  onGrab(rec) {
    if (this.holds.length === 1) {
      super.onGrab(rec);
    } else {
      // Second hand: remember where it grabbed so we can measure the stretch.
      const atom = rec.part;
      const wp = this.atomWorldPosition(atom, new THREE.Vector3());
      rec.atomOffset = wp.sub(rec.hand.gripPosition).applyQuaternion(rec.hand.gripQuaternion.clone().invert());
      rec.stretch0 = null;
    }
    this.app.audio?.play('pickAtom', { position: this.object.position, volume: 0.25 });
  }

  updateHolds(dt) {
    const primary = this.holds[0];
    if (!primary) return;
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    this.heldTarget(primary, pos, quat);
    this.applyHeldPose(pos, quat);
    this.app.molecules.updateTension(this, dt, pos, quat);
  }

  onRelease(rec, lin, ang) {
    for (const a of this.atoms) if (a.mesh) a.mesh.position.copy(a.local);
    this.layoutBonds();
    this.app.molecules.clearTension(this);
    if (this.holds.length) {
      const p = this.holds[0];
      this.computeOffset(p);
      p.atomOffset = null;
      return;
    }
    super.onRelease(rec, lin, ang);
  }

  // ------------------------------------------------------------------------------------

  startSettle(frames = 70) {
    this.settle = Math.max(this.settle, frames);
    // A tiny random nudge breaks perfect symmetry (e.g. three collinear atoms could
    // otherwise never bend into the right VSEPR shape).
    for (const a of this.atoms) {
      a.local.x += (Math.random() - 0.5) * 0.002;
      a.local.y += (Math.random() - 0.5) * 0.002;
      a.local.z += (Math.random() - 0.5) * 0.002;
    }
  }

  update(dt) {
    if (this.absorbing) return;
    if (this.settle > 0) {
      this.settle--;
      const moved = this.relax(4);
      for (const a of this.atoms) a.mesh.position.copy(a.local);
      this.updateColliderPositions();
      this.layoutBonds();
      if (moved < 1e-5) this.settle = Math.min(this.settle, 2);
      if (this.settle === 0) {
        this.rebuildStubs();
        this.updateBounds();
      }
    }
    // Symbols face the viewer, sitting on the sphere surface.
    const cam = this.app.headPosition();
    this.object.updateWorldMatrix(true, false);
    const local = this.object.worldToLocal(_v.copy(cam));
    for (const a of this.atoms) {
      const dir = _v2.copy(local).sub(a.mesh.position).normalize();
      a.symbol.position.copy(a.mesh.position).addScaledVector(dir, atomRadius(a.el) * 1.01);
      a.stubGroup.position.copy(a.mesh.position);
    }
    // Hover halo
    if (this.highlighted && this.hoverAtom && this.atoms.includes(this.hoverAtom)) {
      this.halo.visible = true;
      this.halo.position.copy(this.hoverAtom.mesh.position);
      this.halo.scale.setScalar(atomRadius(this.hoverAtom.el) * 1.3);
    } else if (this.highlighted && this.atoms.length === 1) {
      this.halo.visible = true;
      this.halo.position.copy(this.atoms[0].mesh.position);
      this.halo.scale.setScalar(atomRadius(this.atoms[0].el) * 1.3);
    } else {
      this.halo.visible = false;
    }
    // Floating name tag above the molecule (world-aligned)
    if (!this.label.parent) this.app.scene.add(this.label);
    const r = this.radius || 0.05;
    this.label.position.copy(this.object.position);
    this.label.position.y += r + 0.055;
    if (this.flashT > 0) {
      this.flashT -= dt;
      const s = 1 + Math.max(0, this.flashT) * 0.35;
      this.label.scale.set(0.18 * s, 0.18 * s * (150 / 640), 1);
    }
    const dist = this.label.position.distanceTo(cam);
    this.label.material.opacity = THREE.MathUtils.clamp(2.6 - dist, 0.15, 1);
  }

  destroy() {
    this.label.removeFromParent();
    this.label.material.map.dispose();
    this.label.material.dispose();
    for (const a of this.atoms) a.symbol?.material.dispose();
    this.app.molecules.clearTension(this);
    super.destroy();
  }

  canBond(atom) {
    return canAcceptBond(atom, this.bonds);
  }
}
