// A SMILES parser used for the compound database (hand-written entries and PubChem data).
// Supports organic-subset atoms (B C N O P S F Cl Br I), bracket atoms with hydrogen
// counts, charges and isotopes ([Na+], [NH4+], [13CH4], [Cu+2]), bond symbols - = #,
// branches, ring closures (1-9 and %nn), stereo marks (ignored) and '.'-separated ions.
// Ionic salts written as separate ions ("[Na+].[Cl-]") are joined into the bonded form the
// lab uses (Na–Cl), so player-built molecules can be matched against them.

import { BY_SYMBOL } from './elements.js';

const ORGANIC = ['Cl', 'Br', 'B', 'C', 'N', 'O', 'P', 'S', 'F', 'I'];
const AROMATIC = { c: 'C', n: 'N', o: 'O', s: 'S', p: 'P', b: 'B' };
const BOND = { '-': 1, '=': 2, '#': 3, ':': 1 };

export function parseSmiles(smiles) {
  const atoms = [];
  const bonds = [];
  const stack = [];
  const rings = new Map();
  let prev = null;
  let pendingOrder = 1;
  let i = 0;
  let aromaticSeen = false;

  const addAtom = (symbol, explicitH, organic, charge = 0, aromatic = false) => {
    const el = BY_SYMBOL[symbol];
    if (!el) throw new Error(`Unknown element "${symbol}" in SMILES ${smiles}`);
    const atom = { el, explicitH, organic, charge, aromatic };
    atoms.push(atom);
    if (prev) bonds.push({ a: prev, b: atom, order: pendingOrder });
    pendingOrder = 1;
    prev = atom;
  };

  while (i < smiles.length) {
    const ch = smiles[i];
    if (ch === '(') { stack.push(prev); i++; continue; }
    if (ch === ')') { prev = stack.pop(); i++; continue; }
    if (ch === '.') { prev = null; pendingOrder = 1; i++; continue; }
    if (ch === '/' || ch === '\\') { i++; continue; }
    if (BOND[ch]) { pendingOrder = BOND[ch]; i++; continue; }
    if ((ch >= '0' && ch <= '9') || ch === '%') {
      let d = ch;
      if (ch === '%') { d = smiles.slice(i + 1, i + 3); i += 2; }
      if (rings.has(d)) {
        const { atom, order } = rings.get(d);
        bonds.push({ a: atom, b: prev, order: Math.max(order, pendingOrder) });
        rings.delete(d);
      } else {
        rings.set(d, { atom: prev, order: pendingOrder });
      }
      pendingOrder = 1;
      i++;
      continue;
    }
    if (ch === '[') {
      const end = smiles.indexOf(']', i);
      const body = smiles.slice(i + 1, end).replace(/@+/g, '');
      const m = body.match(/^(\d*)([A-Z][a-z]?|[cnospb])(H(\d*))?(([+-])(\d*)|(\+\+|--))?(:\d+)?$/);
      if (!m) throw new Error(`Bad bracket atom [${body}] in ${smiles}`);
      const aromatic = /^[a-z]$/.test(m[2]);
      const symbol = aromatic ? AROMATIC[m[2]] : m[2];
      const h = m[3] ? (m[4] ? Number(m[4]) : 1) : 0;
      let charge = 0;
      if (m[8]) charge = m[8] === '++' ? 2 : -2;
      else if (m[6]) charge = (m[6] === '+' ? 1 : -1) * (m[7] ? Number(m[7]) : 1);
      if (aromatic) aromaticSeen = true;
      addAtom(symbol, h, false, charge, aromatic);
      i = end + 1;
      continue;
    }
    if (AROMATIC[ch]) {
      aromaticSeen = true;
      addAtom(AROMATIC[ch], 0, true, 0, true);
      i++;
      continue;
    }
    const sym = ORGANIC.find((s) => smiles.startsWith(s, i));
    if (sym) { addAtom(sym, 0, true); i += sym.length; continue; }
    throw new Error(`Unexpected "${ch}" in SMILES ${smiles}`);
  }

  // Aromatic rings: alternate double bonds between aromatic atoms (simple Kekulé form).
  if (aromaticSeen) kekulize(atoms, bonds);

  // Join separate ions into bonded salts: each positive charge pairs with a negative one.
  joinIons(atoms, bonds);

  // Hydrogens: implicit for organic-subset atoms, explicit for bracket atoms.
  const H = BY_SYMBOL.H;
  for (const atom of atoms.slice()) {
    let count = atom.explicitH;
    if (atom.organic) {
      let sum = 0;
      for (const b of bonds) if (b.a === atom || b.b === atom) sum += b.order;
      const target = atom.el.valences.filter((v) => v >= sum).sort((a, b) => a - b)[0];
      count = target === undefined ? 0 : target - sum;
    }
    for (let k = 0; k < count; k++) {
      const h = { el: H, explicitH: 0, organic: false };
      atoms.push(h);
      bonds.push({ a: atom, b: h, order: 1 });
    }
  }
  for (const a of atoms) { delete a.explicitH; delete a.organic; delete a.charge; delete a.aromatic; }
  return { atoms, bonds };
}

function kekulize(atoms, bonds) {
  const arom = atoms.filter((a) => a.aromatic);
  const used = new Set();
  // Greedy matching along aromatic bonds; good enough for benzene-like rings.
  for (const a of arom) {
    if (used.has(a)) continue;
    // Pyrrole-type N/O/S with H (or [nH]) don't take a double bond.
    if ((a.el.symbol === 'O' || a.el.symbol === 'S') || (a.el.symbol === 'N' && a.explicitH)) continue;
    for (const b of bonds) {
      if (b.order !== 1) continue;
      const o = b.a === a ? b.b : b.b === a ? b.a : null;
      if (!o || !o.aromatic || used.has(o)) continue;
      if (o.el.symbol === 'O' || o.el.symbol === 'S' || (o.el.symbol === 'N' && o.explicitH)) continue;
      b.order = 2;
      used.add(a);
      used.add(o);
      break;
    }
  }
}

function joinIons(atoms, bonds) {
  if (!atoms.some((a) => a.charge)) return;
  // Fragments ('.'-separated pieces)
  const comp = new Map();
  const frags = [];
  for (const a of atoms) {
    if (comp.has(a)) continue;
    const f = [];
    const q = [a];
    comp.set(a, frags.length);
    while (q.length) {
      const x = q.pop();
      f.push(x);
      for (const b of bonds) {
        const y = b.a === x ? b.b : b.b === x ? b.a : null;
        if (y && !comp.has(y)) { comp.set(y, frags.length); q.push(y); }
      }
    }
    frags.push(f);
  }
  // Only a fragment's net charge takes part in ionic bonding: nitrate [N+](=O)([O-])[O-]
  // offers one O⁻, not three charged atoms.
  const cations = [];
  const anions = [];
  for (const f of frags) {
    const net = f.reduce((q, a) => q + (a.charge || 0), 0);
    if (!net) continue;
    const pool = f.filter((a) => Math.sign(a.charge || 0) === Math.sign(net));
    const list = net > 0 ? cations : anions;
    let left = Math.abs(net);
    for (const a of pool) {
      for (let k = 0; k < Math.abs(a.charge) && left > 0; k++, left--) list.push(a);
    }
  }
  const used = new Set();
  for (const c of cations) {
    let idx = anions.findIndex((an, i) => !used.has(i) && comp.get(an) !== comp.get(c) && !bonds.some((b) => (b.a === c && b.b === an) || (b.a === an && b.b === c)));
    if (idx < 0) idx = anions.findIndex((an, i) => !used.has(i) && comp.get(an) !== comp.get(c));
    if (idx < 0) continue;
    used.add(idx);
    bonds.push({ a: c, b: anions[idx], order: 1 });
  }
}
