// A small SMILES parser used to describe the known-compound database.
// Supports: organic-subset atoms (B C N O P S F Cl Br I), bracket atoms with explicit
// hydrogen counts ([Na], [NH4], [Cu]; charges are ignored), bond symbols - = #,
// branches ( ) and ring closures 1-9. Implicit hydrogens are added for organic-subset atoms.

import { BY_SYMBOL } from './elements.js';

const ORGANIC = ['Cl', 'Br', 'B', 'C', 'N', 'O', 'P', 'S', 'F', 'I'];
const BOND = { '-': 1, '=': 2, '#': 3 };

export function parseSmiles(smiles) {
  const atoms = [];
  const bonds = [];
  const stack = [];
  const rings = new Map();
  let prev = null;
  let pendingOrder = 1;
  let i = 0;

  const addAtom = (symbol, explicitH, organic) => {
    const el = BY_SYMBOL[symbol];
    if (!el) throw new Error(`Unknown element "${symbol}" in SMILES ${smiles}`);
    const atom = { el, explicitH, organic };
    atoms.push(atom);
    if (prev) bonds.push({ a: prev, b: atom, order: pendingOrder });
    pendingOrder = 1;
    prev = atom;
  };

  while (i < smiles.length) {
    const ch = smiles[i];
    if (ch === '(') { stack.push(prev); i++; continue; }
    if (ch === ')') { prev = stack.pop(); i++; continue; }
    if (BOND[ch]) { pendingOrder = BOND[ch]; i++; continue; }
    if (ch >= '0' && ch <= '9') {
      const d = ch;
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
      const body = smiles.slice(i + 1, end);
      const m = body.match(/^([A-Z][a-z]?)(H(\d*))?([+-]\d*)*$/);
      if (!m) throw new Error(`Bad bracket atom [${body}] in ${smiles}`);
      const h = m[2] ? (m[3] ? Number(m[3]) : 1) : 0;
      addAtom(m[1], h, false);
      i = end + 1;
      continue;
    }
    const sym = ORGANIC.find((s) => smiles.startsWith(s, i));
    if (sym) { addAtom(sym, 0, true); i += sym.length; continue; }
    throw new Error(`Unexpected "${ch}" in SMILES ${smiles}`);
  }

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
  for (const a of atoms) { delete a.explicitH; delete a.organic; }
  return { atoms, bonds };
}
