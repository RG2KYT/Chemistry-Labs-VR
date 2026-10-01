import * as THREE from 'three';
import { Molecule, bondLength, atomRadius } from './Molecule.js';
import { BY_SYMBOL } from './elements.js';
import { addBond, removeBond, bondsToSeparate, components, canAcceptBond, normalizeOrders, saturate } from './graph.js';

const _v = new THREE.Vector3();
const BREAK_STRETCH = 0.07; // metres of pull needed to break a bond
const PREVIEW_RATIO = 1.8;
const BOND_RATIO = 1.18;
const MAX_MOLECULES = 48;

/**
 * Bond formation (bring two atoms with free valence together while holding one) and bond
 * breaking (hold two atoms of the same molecule and pull them apart).
 */
export class MoleculeSystem {
  constructor(app) {
    this.app = app;
    this.previews = new Map(); // molecule -> line
    this.tension = new Map(); // molecule -> line
    this.cooldown = new Map(); // "idA:idB" -> time left
    this.deniedT = 0;
  }

  get molecules() {
    return this.app.entities.filter((e) => e.kind === 'molecule' && !e.removed);
  }

  // ------------------------------------------------------------------------------------
  // Spawning

  spawnElement(symbol, position, { diatomic = false } = {}) {
    const el = BY_SYMBOL[symbol];
    if (!el) return null;
    this.app.history?.record('Add ' + symbol + (diatomic ? '₂' : ' atom'));
    const pos = this.freeSpot(position, el);
    let mol;
    if (diatomic) {
      const L = bondLength(el, el, el.symbol === 'N' ? 3 : el.symbol === 'O' ? 2 : 1);
      mol = Molecule.create(this.app, [
        { el, local: new THREE.Vector3(-L / 2, 0, 0) },
        { el, local: new THREE.Vector3(L / 2, 0, 0) },
      ], [], pos);
      // Use the graph rules to set the right bond order (O=O, N≡N, H–H…).
      addBond(mol.atoms, mol.bonds, mol.atoms[0], mol.atoms[1]);
      mol.rebuildVisuals();
      mol.refreshIdentity(false);
    } else {
      mol = Molecule.create(this.app, [{ el, local: new THREE.Vector3() }], [], pos);
    }
    mol.spawnPop = 0;
    if (this.app.mode !== 'lab') mol.enterStasis();
    this.app.addEntity(mol);
    this.enforceLimit();
    this.app.audio?.play('spawn', { position: pos, volume: 0.45 });
    this.app.effects?.sparkle(pos, 0x9fe7ff, 14, 0.06);
    return mol;
  }

  /**
   * Spawn a whole molecule from a structure { symbols, bonds: [[i, j, order]] } (used when
   * the synthesizer turns a physical substance back into atoms). Atoms are laid out as a
   * tree and then relax into their real VSEPR shape.
   */
  spawnMolecule(spec, position, { stasis = this.app.mode !== 'lab', velocity = null } = {}) {
    const n = spec.symbols.length;
    const adj = Array.from({ length: n }, () => []);
    for (const [i, j] of spec.bonds) { adj[i].push(j); adj[j].push(i); }
    const els = spec.symbols.map((sym) => BY_SYMBOL[sym]);
    const local = new Array(n).fill(null);
    const dirs = [];
    for (let k = 0; k < 40; k++) {
      const y = 1 - (k / 39) * 2, r = Math.sqrt(1 - y * y), a = k * 2.39996;
      dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    for (let root = 0; root < n; root++) {
      if (local[root]) continue;
      local[root] = new THREE.Vector3(root * 0.05, 0, 0);
      const queue = [root];
      while (queue.length) {
        const a = queue.shift();
        const used = adj[a].filter((b) => local[b]).map((b) => local[b].clone().sub(local[a]).normalize());
        for (const b of adj[a]) {
          if (local[b]) continue;
          let best = dirs[0], bestScore = -1;
          for (const d of dirs) {
            const score = used.length ? Math.min(...used.map((u) => d.angleTo(u))) : d.x + 1;
            if (score > bestScore) { bestScore = score; best = d; }
          }
          used.push(best.clone());
          local[b] = local[a].clone().addScaledVector(best, bondLength(els[a], els[b], 1));
          queue.push(b);
        }
      }
    }
    const mol = Molecule.create(this.app, els.map((el, i) => ({ el, local: local[i] })), spec.bonds.map(([i, j]) => [i, j, 1]), position);
    normalizeOrders(mol.atoms, mol.bonds);
    saturate(mol.atoms, mol.bonds);
    mol.rebuildVisuals();
    mol.refreshIdentity(false);
    mol.startSettle(n > 8 ? 200 : 120);
    if (stasis) mol.enterStasis();
    this.app.addEntity(mol);
    if (velocity) mol.body.setLinvel(velocity, true);
    this.enforceLimit();
    return mol;
  }

  /** Avoid spawning inside an existing molecule. */
  freeSpot(position, el) {
    const p = position.clone();
    const r = atomRadius(el) + 0.05;
    for (let i = 0; i < 12; i++) {
      const blocked = this.molecules.some((m) => m.object.position.distanceTo(p) < (m.radius || 0.05) + r);
      if (!blocked) break;
      const a = i * 2.4;
      p.copy(position).add(new THREE.Vector3(Math.cos(a) * 0.07 * (1 + i * 0.25), Math.sin(a) * 0.06 * (1 + i * 0.2), 0.03 * i));
    }
    return p;
  }

  enforceLimit() {
    const mols = this.molecules;
    if (mols.length <= MAX_MOLECULES) return;
    const free = mols.filter((m) => !m.isHeld && !m.absorbing);
    for (let i = 0; i < mols.length - MAX_MOLECULES && i < free.length; i++) {
      this.app.effects?.poof(free[i].object.position, 0xaaccff);
      free[i].destroy();
    }
  }

  clearAll() {
    this.app.history?.record('Clear atoms');
    for (const m of this.molecules) {
      if (m.absorbing) continue;
      this.app.effects?.poof(m.object.position, 0x9fd8ff, 0.5);
      m.destroy();
    }
    this.app.audio?.play('clear', { volume: 0.4 });
  }

  // ------------------------------------------------------------------------------------
  // Per-frame bonding detection

  update(dt) {
    for (const [k, t] of this.cooldown) {
      if (t - dt <= 0) this.cooldown.delete(k);
      else this.cooldown.set(k, t - dt);
    }
    this.deniedT = Math.max(0, this.deniedT - dt);
    const mols = this.molecules;
    const held = mols.filter((m) => m.isHeld && !m.absorbing);
    const seenPreview = new Set();

    // World positions cache
    const worldPos = new Map();
    const wp = (m) => {
      let arr = worldPos.get(m);
      if (!arr) {
        m.object.updateWorldMatrix(true, false);
        arr = m.atoms.map((a) => a.local.clone().applyMatrix4(m.object.matrixWorld));
        worldPos.set(m, arr);
      }
      return arr;
    };

    for (const M of held) {
      let best = null;
      let nearestAny = null;
      const pm = wp(M);
      for (const N of mols) {
        if (N === M || N.absorbing || N.disabled) continue;
        if (M.object.position.distanceTo(N.object.position) > (M.radius || 0.05) + (N.radius || 0.05) + 0.3) continue;
        const pn = wp(N);
        for (let i = 0; i < M.atoms.length; i++) {
          const a = M.atoms[i];
          const aOk = canAcceptBond(a, M.bonds);
          for (let j = 0; j < N.atoms.length; j++) {
            const b = N.atoms[j];
            const d = pm[i].distanceTo(pn[j]);
            const ratio = d / bondLength(a.el, b.el, 1);
            const ok = aOk && canAcceptBond(b, N.bonds) && !this.cooldown.has(this.key(a, b));
            if (ok && ratio < PREVIEW_RATIO && (!best || ratio < best.ratio)) {
              best = { a, b, N, ratio, pa: pm[i], pb: pn[j] };
            }
            if (ratio < 1.3 && (!nearestAny || ratio < nearestAny.ratio)) {
              nearestAny = { a, b, N, ratio, pa: pm[i], pb: pn[j], ok };
            }
          }
        }
      }
      if (best && best.ratio < BOND_RATIO) {
        this.hidePreview(M);
        this.merge(M, best.a, best.N, best.b);
        return; // structures changed; continue next frame
      }
      if (best) {
        this.showPreview(M, best.pa, best.pb, 1 - (best.ratio - BOND_RATIO) / (PREVIEW_RATIO - BOND_RATIO), true);
        seenPreview.add(M);
      } else if (nearestAny && !nearestAny.ok) {
        this.showPreview(M, nearestAny.pa, nearestAny.pb, 1, false);
        seenPreview.add(M);
        if (this.deniedT <= 0) {
          this.deniedT = 1.2;
          this.app.audio?.play('denied', { position: nearestAny.pa, volume: 0.25 });
          for (const r of M.holds) r.hand.pulse(0.15, 20);
        }
      }
    }
    for (const m of [...this.previews.keys()]) if (!seenPreview.has(m)) this.hidePreview(m);
  }

  key(a, b) {
    return a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
  }

  showPreview(M, pa, pb, strength, ok) {
    let line = this.previews.get(M);
    if (!line) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
      const mat = new THREE.LineDashedMaterial({ color: 0x7fe3ff, dashSize: 0.008, gapSize: 0.006, transparent: true, depthWrite: false, toneMapped: false });
      line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.renderOrder = 6;
      this.app.scene.add(line);
      this.previews.set(M, line);
    }
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, pa.x, pa.y, pa.z);
    pos.setXYZ(1, pb.x, pb.y, pb.z);
    pos.needsUpdate = true;
    line.computeLineDistances();
    line.material.color.setHex(ok ? 0x7fe3ff : 0xff6a5a);
    line.material.opacity = 0.35 + 0.6 * THREE.MathUtils.clamp(strength, 0, 1);
    line.visible = true;
  }

  hidePreview(M) {
    const line = this.previews.get(M);
    if (line) {
      line.removeFromParent();
      line.geometry.dispose();
      line.material.dispose();
      this.previews.delete(M);
    }
  }

  // ------------------------------------------------------------------------------------
  // Merging

  merge(M, a, N, b) {
    this.app.history?.record(`Bond ${a.el.symbol}–${b.el.symbol}`);
    M.object.updateWorldMatrix(true, false);
    N.object.updateWorldMatrix(true, false);
    const inv = M.object.matrixWorld.clone().invert();
    for (const atom of N.atoms) {
      atom.local.applyMatrix4(N.object.matrixWorld).applyMatrix4(inv);
      atom.collider = null;
      if (atom.mesh) M.object.add(atom.mesh, atom.symbol, atom.stubGroup);
    }
    const nAtoms = N.atoms.slice();
    const nBonds = N.bonds.slice();
    const nHolds = N.holds.slice();
    N.atoms = [];
    N.bonds = [];
    N.holds = [];
    this.hidePreview(N);
    N.destroy();

    M.atoms.push(...nAtoms);
    M.bonds.push(...nBonds);
    addBond(M.atoms, M.bonds, a, b);
    M.rebuildColliders();
    M.recenter(true);
    M.updateColliderPositions();
    M.rebuildVisuals();
    M.startSettle();
    M.refreshIdentity(true);
    // Hands that were holding N now hold M (as a secondary grip).
    for (const rec of nHolds) {
      rec.entity = M;
      M.holds.push(rec);
      M.onGrab(rec);
    }
    const mid = new THREE.Vector3().lerpVectors(M.atomWorldPosition(a), M.atomWorldPosition(b), 0.5);
    this.app.effects?.sparkle(mid, 0xbff3ff, 22, 0.05);
    this.app.audio?.play('bond', { position: mid, volume: 0.6 });
    for (const r of M.holds) r.hand.pulse(0.7, 45);
    this.app.events.emit('bond', { molecule: M, a, b });
  }

  // ------------------------------------------------------------------------------------
  // Pulling apart

  updateTension(M, dt, pos, quat) {
    const sec = M.holds[1];
    const prim = M.holds[0];
    if (!sec || !sec.part || !prim || sec.part === prim.part || !sec.atomOffset) {
      this.clearTension(M);
      return;
    }
    const atom = sec.part;
    const rigid = atom.local.clone().applyQuaternion(quat).add(pos);
    const target = sec.atomOffset.clone().applyQuaternion(sec.hand.gripQuaternion).add(sec.hand.gripPosition);
    const stretch = target.clone().sub(rigid);
    if (!sec.stretch0) sec.stretch0 = stretch.clone();
    const eff = stretch.clone().sub(sec.stretch0);
    const amount = eff.length();

    // Visual: the pulled atom follows the hand a little and a tension line appears.
    const invQ = quat.clone().invert();
    const disp = eff.clone().multiplyScalar(0.45).clampLength(0, 0.035).applyQuaternion(invQ);
    for (const a of M.atoms) a.mesh.position.copy(a.local);
    atom.mesh.position.copy(atom.local).add(disp);
    M.layoutBonds();

    let line = this.tension.get(M);
    if (!line) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffb35a, transparent: true, depthWrite: false, toneMapped: false }));
      line.frustumCulled = false;
      this.app.scene.add(line);
      this.tension.set(M, line);
    }
    const p = line.geometry.attributes.position;
    const shown = rigid.clone().add(disp.clone().applyQuaternion(quat));
    p.setXYZ(0, shown.x, shown.y, shown.z);
    p.setXYZ(1, target.x, target.y, target.z);
    p.needsUpdate = true;
    const t = THREE.MathUtils.clamp(amount / BREAK_STRETCH, 0, 1);
    line.material.color.setRGB(1, 0.75 - 0.5 * t, 0.35 - 0.3 * t);
    line.material.opacity = 0.2 + 0.8 * t;
    if (t > 0.5) sec.hand.pulse(0.05 + 0.2 * t, 10);

    if (amount > BREAK_STRETCH) this.split(M, prim.part, atom, sec);
  }

  clearTension(M) {
    const line = this.tension.get(M);
    if (line) {
      line.removeFromParent();
      line.geometry.dispose();
      line.material.dispose();
      this.tension.delete(M);
    }
  }

  split(M, keepAtom, pullAtom, rec) {
    this.app.history?.record('Break bond');
    this.clearTension(M);
    for (const a of M.atoms) a.mesh.position.copy(a.local);
    const cut = bondsToSeparate(keepAtom, pullAtom, M.bonds);
    if (!cut.length) return;
    for (const b of cut) {
      removeBond(M.atoms, M.bonds, b);
      this.cooldown.set(this.key(b.a, b.b), 0.6);
    }
    M.object.updateWorldMatrix(true, false);
    const comps = components(M.atoms, M.bonds);
    let pulledMol = null;
    for (const comp of comps) {
      if (comp.includes(keepAtom)) continue;
      const atomSet = new Set(comp);
      const world = comp.map((a) => a.local.clone().applyMatrix4(M.object.matrixWorld));
      const centroid = world.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(world.length);
      const invQ = M.object.quaternion.clone().invert();
      for (let i = 0; i < comp.length; i++) {
        const a = comp[i];
        this.app.physics.removeCollider(a.collider);
        a.collider = null;
        a.local.copy(world[i]).sub(centroid).applyQuaternion(invQ);
      }
      const bonds = M.bonds.filter((b) => atomSet.has(b.a));
      M.atoms = M.atoms.filter((a) => !atomSet.has(a));
      M.bonds = M.bonds.filter((b) => !atomSet.has(b.a));
      const mol = new Molecule(this.app, comp, bonds);
      mol.object.position.copy(centroid);
      mol.object.quaternion.copy(M.object.quaternion);
      mol.buildBody();
      mol.rebuildVisuals();
      mol.startSettle(40);
      mol.refreshIdentity(true);
      this.app.addEntity(mol);
      if (comp.includes(pullAtom)) pulledMol = mol;
      else {
        // A fragment that nobody holds drifts gently away.
        mol.body.setLinvel({ x: (Math.random() - 0.5) * 0.05, y: 0.02, z: (Math.random() - 0.5) * 0.05 }, true);
      }
    }
    M.recenter(true);
    M.updateColliderPositions();
    M.rebuildVisuals();
    M.startSettle(40);
    M.refreshIdentity(true);
    // Hand over the pulling grip to the separated fragment.
    if (pulledMol && !rec.fake) {
      const i = M.holds.indexOf(rec);
      if (i >= 0) M.holds.splice(i, 1);
      rec.entity = pulledMol;
      rec.atomOffset = null;
      pulledMol.holds.push(rec);
      pulledMol.onGrab(rec);
    }
    const p = M.atomWorldPosition(keepAtom);
    this.app.effects?.sparkle(p.lerp(pulledMol ? pulledMol.object.position : p, 0.5), 0xffc27a, 16, 0.05);
    this.app.audio?.play('unbond', { position: p, volume: 0.6 });
    rec.hand.pulse(0.8, 60);
    for (const r of M.holds) r.hand.pulse(0.5, 40);
    this.app.events.emit('split', { molecule: M, fragment: pulledMol });
  }

  // ------------------------------------------------------------------------------------
  // Debug / test helpers

  /** Bond two atoms programmatically (used by tests and the tutorial). */
  bondAtoms(M, a, N, b) {
    if (M === N) return false;
    if (!canAcceptBond(a, M.bonds) || !canAcceptBond(b, N.bonds)) return false;
    this.merge(M, a, N, b);
    return true;
  }

  /** Split a molecule between two atoms programmatically. */
  breakBetween(M, a, b) {
    const fake = { hand: { pulse() {} }, entity: M, part: b, fake: true };
    this.split(M, a, b, fake);
    const frag = this.molecules.find((m) => m.atoms.includes(b));
    return frag;
  }
}

