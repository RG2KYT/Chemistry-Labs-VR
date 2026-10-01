// Pure molecular-graph logic (no rendering). Atoms are objects with an `el` (element data)
// field; bonds are { a, b, order } where a / b are atom objects.
//
// The bonding model is a simple valence model:
//  * every element has a list of allowed valences (e.g. S: 2, 4, 6);
//  * an atom can accept a new bond while its bond-order sum is below its maximum valence,
//    or when one of its multiple bonds can be "demoted" to make room;
//  * after every change bond orders are re-assigned so atoms reach an allowed valence
//    (O + C + O becomes O=C=O, N + N becomes N≡N, ring carbons become Kekulé benzene…).

export function bondsOf(atom, bonds) {
  return bonds.filter((b) => b.a === atom || b.b === atom);
}

export function other(bond, atom) {
  return bond.a === atom ? bond.b : bond.a;
}

export function neighbors(atom, bonds) {
  const out = [];
  for (const b of bonds) {
    if (b.a === atom) out.push(b.b);
    else if (b.b === atom) out.push(b.a);
  }
  return out;
}

export function bondSum(atom, bonds) {
  let s = 0;
  for (const b of bonds) if (b.a === atom || b.b === atom) s += b.order;
  return s;
}

export function findBond(a, b, bonds) {
  return bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)) || null;
}

/** True when the atom's bond-order sum is one of its allowed valences. */
export function isSatisfied(atom, bonds) {
  return atom.el.valences.includes(bondSum(atom, bonds));
}

function isUnsat(atom, bonds) {
  const s = bondSum(atom, bonds);
  return !atom.el.valences.includes(s) && s < atom.el.maxValence;
}

/** Number of additional single bonds the atom could form right now (ignores demotion). */
export function freeValence(atom, bonds) {
  return Math.max(0, atom.el.maxValence - bondSum(atom, bonds));
}

/**
 * Number of "open" bonding sites shown to the player: how many more bonds the atom needs to
 * reach its nearest allowed valence. 0 for atoms that are happy.
 */
export function openSites(atom, bonds) {
  const s = bondSum(atom, bonds);
  if (atom.el.valences.includes(s)) return 0;
  const next = atom.el.valences.filter((v) => v > s).sort((x, y) => x - y)[0];
  return next === undefined ? 0 : next - s;
}

export function canAcceptBond(atom, bonds) {
  if (atom.el.maxValence === 0) return false;
  if (bondSum(atom, bonds) < atom.el.maxValence) return true;
  return bondsOf(atom, bonds).some((b) => b.order > 1);
}

/** Free one bonding slot on `atom` by demoting its highest-order bond. */
function demote(atom, bonds) {
  let best = null;
  for (const b of bondsOf(atom, bonds)) if (b.order > 1 && (!best || b.order > best.order)) best = b;
  if (best) best.order -= 1;
  return !!best;
}

/**
 * Adds a single bond between atoms a and b (making room by demoting multiple bonds when
 * needed) and re-assigns bond orders. Returns the new bond, or null when impossible.
 */
export function addBond(atoms, bonds, a, b) {
  if (a === b || findBond(a, b, bonds)) return null;
  if (!canAcceptBond(a, bonds) || !canAcceptBond(b, bonds)) return null;
  if (bondSum(a, bonds) >= a.el.maxValence) demote(a, bonds);
  if (bondSum(b, bonds) >= b.el.maxValence) demote(b, bonds);
  const bond = { a, b, order: 1 };
  bonds.push(bond);
  normalizeOrders(atoms, bonds);
  saturate(atoms, bonds);
  return bond;
}

/** Removes a bond and re-assigns bond orders. */
export function removeBond(atoms, bonds, bond) {
  const i = bonds.indexOf(bond);
  if (i < 0) return;
  bonds.splice(i, 1);
  normalizeOrders(atoms, bonds);
  saturate(atoms, bonds);
}

/**
 * Bring every bond back to a single bond, then saturate from scratch. This keeps the bond
 * order assignment deterministic regardless of the order in which atoms were connected.
 */
export function normalizeOrders(atoms, bonds) {
  for (const b of bonds) b.order = 1;
}

/**
 * Upgrades bond orders so that atoms reach an allowed valence (greedy Kekulé-style matching
 * followed by hypervalent expansion for S, P, N, Cl …).
 */
export function saturate(atoms, bonds) {
  for (let guard = 0; guard < 200; guard++) {
    // Pass 1: match unsaturated neighbours, starting with the most constrained atom.
    const unsat = atoms.filter((a) => isUnsat(a, bonds));
    let done = false;
    if (unsat.length) {
      const unsatSet = new Set(unsat);
      const candidates = (atom) =>
        bondsOf(atom, bonds).filter((b) => b.order < 3 && unsatSet.has(other(b, atom)));
      let bestAtom = null;
      let bestCount = Infinity;
      for (const a of unsat) {
        const c = candidates(a).length;
        if (c > 0 && c < bestCount) { bestCount = c; bestAtom = a; }
      }
      if (bestAtom) {
        let bestBond = null;
        let bestN = Infinity;
        for (const b of candidates(bestAtom)) {
          const n = candidates(other(b, bestAtom)).length;
          if (n < bestN) { bestN = n; bestBond = b; }
        }
        bestBond.order += 1;
        done = true;
      }
    }
    if (done) continue;

    // Pass 2: hypervalent expansion (an unsaturated atom borrows from a neighbour that can
    // step up to its next allowed valence, e.g. O–S–O → O=S=O).
    for (const a of unsat) {
      for (const b of bondsOf(a, bonds)) {
        if (b.order >= 3) continue;
        const n = other(b, a);
        const s = bondSum(n, bonds);
        if (s + 1 > n.el.maxValence) continue;
        const nextOk = n.el.valences.includes(s + 1);
        const helper = neighbors(n, bonds).some((m) => m !== a && isUnsat(m, bonds));
        if (nextOk || helper) {
          b.order += 1;
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (!done) break;
  }
}

/** Connected components as arrays of atoms. */
export function components(atoms, bonds) {
  const seen = new Set();
  const comps = [];
  for (const start of atoms) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const a = stack.pop();
      comp.push(a);
      for (const n of neighbors(a, bonds)) {
        if (!seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    comps.push(comp);
  }
  return comps;
}

/** Shortest path of bonds from atom a to atom b (BFS). */
export function bondPath(a, b, bonds) {
  const prev = new Map([[a, null]]);
  const queue = [a];
  while (queue.length) {
    const x = queue.shift();
    if (x === b) break;
    for (const bond of bondsOf(x, bonds)) {
      const y = other(bond, x);
      if (!prev.has(y)) { prev.set(y, bond); queue.push(y); }
    }
  }
  if (!prev.has(b)) return null;
  const path = [];
  let cur = b;
  while (cur !== a) {
    const bond = prev.get(cur);
    path.unshift(bond);
    cur = other(bond, cur);
  }
  return path;
}

/**
 * Bonds to cut so that atoms a and b end up in different fragments. Cuts the bond closest
 * to b on the shortest path, repeating for rings.
 */
export function bondsToSeparate(a, b, bonds) {
  const remaining = bonds.slice();
  const cut = [];
  for (let i = 0; i < 64; i++) {
    const path = bondPath(a, b, remaining);
    if (!path) break;
    const bond = path[path.length - 1];
    cut.push(bond);
    remaining.splice(remaining.indexOf(bond), 1);
  }
  return cut;
}

// ---------------------------------------------------------------------------------------
// Formula, mass and identification helpers.

/** Hill-system formula as an array of [symbol, count]. */
export function formulaParts(atoms) {
  const counts = new Map();
  for (const a of atoms) counts.set(a.el.symbol, (counts.get(a.el.symbol) || 0) + 1);
  const keys = [...counts.keys()];
  let order;
  if (counts.has('C')) {
    order = ['C', ...(counts.has('H') ? ['H'] : []), ...keys.filter((k) => k !== 'C' && k !== 'H').sort()];
  } else {
    order = keys.sort();
  }
  return order.map((k) => [k, counts.get(k)]);
}

export function formulaString(atoms) {
  return formulaParts(atoms).map(([s, n]) => (n > 1 ? s + n : s)).join('');
}

export function molarMass(atoms) {
  return atoms.reduce((m, a) => m + a.el.mass, 0);
}

/**
 * Structural signature: two rounds of neighbour refinement (like a tiny Morgan algorithm).
 * Isomers such as ethanol / dimethyl ether get different signatures; bond orders are
 * intentionally ignored so player-built molecules match regardless of Kekulé form.
 */
export function signature(atoms, bonds) {
  const nb = new Map(atoms.map((a) => [a, neighbors(a, bonds)]));
  let labels = new Map(atoms.map((a) => [a, a.el.symbol]));
  for (let round = 0; round < 2; round++) {
    const next = new Map();
    for (const a of atoms) {
      const ns = nb.get(a).map((n) => labels.get(n)).sort();
      next.set(a, labels.get(a) + '(' + ns.join(',') + ')');
    }
    labels = next;
  }
  return formulaString(atoms) + '|' + atoms.map((a) => labels.get(a)).sort().join(';');
}

/** Atoms that still have open bonding sites (radicals / incomplete valence). */
export function unsatisfiedAtoms(atoms, bonds) {
  return atoms.filter((a) => !a.el.valences.includes(bondSum(a, bonds)));
}

/**
 * VSEPR description for an atom: number of bonded neighbours, lone pairs and the ideal
 * bond angle (degrees) between neighbours.
 */
export function vsepr(atom, bonds) {
  const k = neighbors(atom, bonds).length;
  const ve = atom.el.valenceElectrons;
  let lone = 0;
  if (ve !== null && ve !== undefined) {
    lone = Math.max(0, Math.floor((ve - bondSum(atom, bonds)) / 2));
    if (atom.el.symbol === 'H') lone = 0;
  }
  const steric = k + lone;
  let angle = 180;
  if (steric === 3) angle = lone === 1 ? 119 : 120;
  else if (steric === 4) angle = lone === 0 ? 109.47 : lone === 1 ? 107 : 104.5;
  else if (steric >= 5) angle = 90;
  return { neighbors: k, lone, steric, angle };
}
