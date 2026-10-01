// Writes a SMILES string for a molecular graph (atoms with `el`, bonds { a, b, order }),
// with explicit hydrogen counts — used to look molecules up in PubChem.

const BOND = { 1: '', 2: '=', 3: '#' };

export function toSmiles(atoms, bonds) {
  const isH = (a) => a.el.symbol === 'H';
  const heavy = atoms.filter((a) => !isH(a));
  if (!heavy.length) return atoms.map(() => '[H]').join('');
  const adj = new Map(heavy.map((a) => [a, []]));
  const hCount = new Map(heavy.map((a) => [a, 0]));
  for (const b of bonds) {
    if (isH(b.a) && !isH(b.b)) hCount.set(b.b, hCount.get(b.b) + 1);
    else if (isH(b.b) && !isH(b.a)) hCount.set(b.a, hCount.get(b.a) + 1);
    else if (!isH(b.a) && !isH(b.b)) {
      adj.get(b.a).push({ to: b.b, bond: b });
      adj.get(b.b).push({ to: b.a, bond: b });
    }
  }
  // Pass 1: find ring-closure bonds (DFS back edges).
  const seen = new Set();
  const treeBonds = new Set();
  const ringBonds = new Set();
  const dfs1 = (a, parentBond) => {
    seen.add(a);
    for (const { to, bond } of adj.get(a)) {
      if (bond === parentBond) continue;
      if (seen.has(to)) {
        if (!treeBonds.has(bond)) ringBonds.add(bond);
      } else {
        treeBonds.add(bond);
        dfs1(to, bond);
      }
    }
  };
  const parts = [];
  for (const start of heavy) {
    if (seen.has(start)) continue;
    dfs1(start, null);
    // Pass 2: emit.
    const ringDigit = new Map();
    let nextDigit = 1;
    const emitted = new Set();
    const atomText = (a) => {
      const h = hCount.get(a);
      return '[' + a.el.symbol + (h ? 'H' + (h > 1 ? h : '') : '') + ']';
    };
    const emit = (a, parentBond) => {
      emitted.add(a);
      let s = atomText(a);
      for (const { bond } of adj.get(a)) {
        if (!ringBonds.has(bond)) continue;
        if (!ringDigit.has(bond)) {
          const d = nextDigit++;
          ringDigit.set(bond, d);
          s += BOND[bond.order] + (d > 9 ? '%' + d : d);
        } else {
          const d = ringDigit.get(bond);
          s += BOND[bond.order] + (d > 9 ? '%' + d : d);
        }
      }
      const children = adj.get(a).filter(({ bond, to }) => bond !== parentBond && treeBonds.has(bond) && !emitted.has(to));
      children.forEach(({ to, bond }, i) => {
        const sub = BOND[bond.order] + emit(to, bond);
        s += i < children.length - 1 ? '(' + sub + ')' : sub;
      });
      return s;
    };
    parts.push(emit(start, null));
  }
  return parts.join('.');
}
