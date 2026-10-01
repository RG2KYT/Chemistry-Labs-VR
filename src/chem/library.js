// The offline chemical library: real data from PubChem (scripts/build-chem-data.mjs) merged
// into the substance database.
//  * Hand-made entries keep their names and tuned looks; missing melting / boiling points,
//    densities and descriptions are filled in where PubChem agrees on the state of matter.
//  * ~350 further real compounds (salts, acids, solvents, sugars, amino acids, drugs …)
//    are added with their real name, look, melting / boiling point and description, so
//    building one of them works offline too.

import data from './data/pubchem-data.json' with { type: 'json' };
import { SUBSTANCES } from './substances.js';
import { parseSmiles } from './smiles.js';
import { molarMass } from './graph.js';
import { inferredSolidLook, mentionsColour, knownLook, countsOf } from './ionColors.js';

const ROOM = 22;

// Order of elements in a conventional (non-organic) formula: metals first (least
// electronegative first), then B Si C Sb As P N H Te Se S I Br Cl O F.
const NONMETAL_ORDER = ['B', 'Si', 'C', 'Sb', 'As', 'P', 'N', 'H', 'Te', 'Se', 'S', 'At', 'I', 'Br', 'Cl', 'O', 'F'];

/** NaClO3, K2Cr2O7, NH4Cl, H2SO4, C6H12O6 … from a molecular graph. */
export function conventionalFormula(atoms) {
  const counts = new Map();
  for (const a of atoms) counts.set(a.el, (counts.get(a.el) || 0) + 1);
  const els = [...counts.keys()];
  const sym = (e) => e.symbol;
  const has = (s) => els.some((e) => e.symbol === s);
  const metals = els.filter((e) => e.isMetal).sort((a, b) => (a.electronegativity || 0) - (b.electronegativity || 0));
  let order;
  if (has('C') && has('H') && !metals.length) {
    order = [...els.filter((e) => e.symbol === 'C'), ...els.filter((e) => e.symbol === 'H'), ...els.filter((e) => !['C', 'H'].includes(e.symbol)).sort((a, b) => sym(a).localeCompare(sym(b)))];
  } else {
    const rest = els.filter((e) => !e.isMetal);
    const rank = (e) => { const i = NONMETAL_ORDER.indexOf(e.symbol); return i < 0 ? -1 : i; };
    rest.sort((a, b) => rank(a) - rank(b));
    // Oxoacids are written hydrogen first (H2SO4, HNO3, H3PO4).
    if (!metals.length && has('H') && has('O') && !has('C') && !has('N')) {
      const h = rest.find((e) => e.symbol === 'H');
      rest.splice(rest.indexOf(h), 1);
      rest.unshift(h);
    }
    order = [...metals, ...rest];
  }
  return order.map((e) => e.symbol + (counts.get(e) > 1 ? counts.get(e) : '')).join('');
}

const OXO_METALS = new Set(['Cr', 'Mn', 'Mo', 'W', 'V', 'Re', 'Tc', 'Ru', 'Os']);

/**
 * Formula as chemists write it, with ionic parts grouped: NH4NO3, Ca(NO3)2, (NH4)2SO4,
 * NaHCO3, Al(OH)3, K2Cr2O7. Bonds between a metal (or an ammonium nitrogen) and the rest are
 * treated as ionic; each piece is written conventionally, cations first.
 */
export function displayFormula(atoms, bonds) {
  const fr = ionicFragments(atoms, bonds);
  if (!fr) return conventionalFormula(atoms);
  const group = (list) => {
    const m = new Map();
    for (const f of list) { const t = fragmentText(f); m.set(t, (m.get(t) || 0) + 1); }
    return [...m].map(([t, n]) => {
      if (n === 1) return t;
      const poly = /[A-Z].*[A-Z]|\d/.test(t) && !/^[A-Z][a-z]?$/.test(t);
      return poly ? `(${t})${n}` : t + n;
    }).join('');
  };
  return group(fr.cations) + group(fr.anions);
}

/** Conventional text of one ion: OH, NO3, HCO3, Cr2O7, NH4 … */
export function fragmentText(f) {
  const syms = f.map((a) => a.el.symbol).sort().join('');
  if (syms === 'HO') return 'OH';
  let t = conventionalFormula(f);
  // Acid anions are written hydrogen first: HCO3, HSO4, H2PO4
  if (f.length > 2 && f.some((a) => a.el.symbol === 'H') && f.some((a) => a.el.symbol === 'O') && !f.some((a) => a.el.isMetal)) {
    const h = f.filter((a) => a.el.symbol === 'H').length;
    t = 'H' + (h > 1 ? h : '') + conventionalFormula(f.filter((a) => a.el.symbol !== 'H'));
  }
  return t;
}

/**
 * Split a salt into its ions. Bonds between a metal (or an ammonium nitrogen) and the rest
 * are ionic; metals at the centre of an oxo-anion (CrO4, MnO4 …) stay with it.
 * Returns { cations: [atoms[]], anions: [atoms[]] } or null for a covalent molecule.
 */
export function ionicFragments(atoms, bonds) {
  const isMetal = (a) => a.el.isMetal;
  const nH = (a) => bonds.filter((b) => (b.a === a && b.b.el.symbol === 'H') || (b.b === a && b.a.el.symbol === 'H')).length;
  const ammonium = (a) => a.el.symbol === 'N' && nH(a) === 4;
  const oxoCentre = (a) => OXO_METALS.has(a.el.symbol) && bonds.filter((b) => (b.a === a && b.b.el.symbol === 'O') || (b.b === a && b.a.el.symbol === 'O')).length >= 3;
  const ionic = (b) => {
    const [x, y] = [b.a, b.b];
    if ((oxoCentre(x) && y.el.symbol === 'O') || (oxoCentre(y) && x.el.symbol === 'O')) return false;
    if (isMetal(x) !== isMetal(y)) return true;
    if ((ammonium(x) && y.el.symbol !== 'H') || (ammonium(y) && x.el.symbol !== 'H')) return true;
    return false;
  };
  const covalent = bonds.filter((b) => !ionic(b));
  if (covalent.length === bonds.length) return null;
  const comp = new Map();
  const frags = [];
  for (const a of atoms) {
    if (comp.has(a)) continue;
    const f = [];
    const q = [a];
    comp.set(a, f);
    while (q.length) {
      const x = q.pop();
      f.push(x);
      for (const b of covalent) {
        const y = b.a === x ? b.b : b.b === x ? b.a : null;
        if (y && !comp.has(y)) { comp.set(y, f); q.push(y); }
      }
    }
    frags.push(f);
  }
  const cationic = (f) => f.some(ammonium) || (f.some(isMetal) && !f.some(oxoCentre));
  // Cations: ammonium and the s-block metals first (NH4, Na, Ca …), then the others.
  const rank = (f) => (f.some(ammonium) ? 0.85 : f[0].el.electronegativity || 0);
  return {
    cations: frags.filter(cationic).sort((a, b) => rank(a) - rank(b)),
    anions: frags.filter((f) => !cationic(f)),
  };
}

function phaseAtRoom(mp, bp, fallback) {
  if (mp !== null && mp !== undefined && ROOM < mp) return 'solid';
  if (bp !== null && bp !== undefined && ROOM >= bp) return 'gas';
  if (mp !== null && mp !== undefined) return 'liquid';
  return fallback;
}

const known = (v) => v !== null && v !== undefined && Number.isFinite(v);

function lookFields(look, phase) {
  const out = {
    phase,
    form: phase === 'gas' ? 'gas' : phase === 'liquid' ? 'liquid' : look.form && !['liquid', 'gas'].includes(look.form) ? look.form : 'powder',
    color: look.color || '#f2f2ee',
    opacity: look.opacity ?? 1,
    metalness: look.metalness ?? 0,
    roughness: look.roughness ?? 0.6,
    translucent: !!look.translucent,
  };
  if (phase === 'liquid' && (look.phase !== 'liquid' || out.opacity >= 0.95)) {
    out.opacity = look.phase === 'liquid' ? out.opacity : 0.3;
    if (look.phase !== 'liquid' && /^#f[0-9a-f]f[0-9a-f]f/i.test(out.color)) out.color = '#e8f1fb';
  }
  if (phase === 'gas') out.opacity = Math.min(out.opacity, 0.35);
  return out;
}

// 1) Fill gaps in the hand-made entries.
let enriched = 0;
for (const [id, e] of Object.entries(data.enrich || {})) {
  const s = SUBSTANCES[id];
  if (!s) continue;
  s.cid = e.cid;
  if (e.ghs) s.ghs = e.ghs; // GHS hazard statements (H300 fatal if swallowed, H314 corrosive …)
  // Only trust values that describe the same state of matter as our entry (our "hydrochloric
  // acid" is the solution; PubChem's is hydrogen chloride gas).
  const theirPhase = phaseAtRoom(e.mp, e.bp, e.look?.phase || s.phase);
  if (theirPhase !== s.phase || s.solution || /solution|_aq$/.test(s.name + ' ' + id)) continue;
  if (!known(s.mp) && known(e.mp)) s.mp = e.mp;
  if (!known(s.bp) && known(e.bp) && (!known(s.mp) || e.bp > s.mp)) s.bp = e.bp;
  if ((!s.density || s.density === 1) && known(e.density) && s.id !== 'water') s.density = e.density;
  if (!s.info && e.info) s.info = e.info;
  if (e.describe) s.describe = e.describe;
  enriched++;
}

// 2) Add the extra compounds.
let added = 0;
for (const c of data.compounds || []) {
  const id = 'pc:' + c.cid;
  if (SUBSTANCES[id]) continue;
  let g;
  try {
    g = parseSmiles(c.smiles);
  } catch {
    continue;
  }
  const hasMetal = g.atoms.some((a) => a.el.isMetal);
  const hasC = g.atoms.some((a) => a.el.symbol === 'C');
  // Sanity checks on scraped values: a boiling point below the melting point is parse noise.
  if (known(c.mp) && known(c.bp) && c.bp <= c.mp) c.bp = null;
  let phase = phaseAtRoom(c.mp, c.bp, c.look?.phase || 'solid');
  if (hasMetal && phase === 'gas') phase = 'solid'; // salts are never gases at room temperature
  if (hasMetal && !known(c.mp) && phase === 'liquid') phase = 'solid';
  const look = lookFields(c.look || {}, phase);
  if (phase === 'solid' && look.color === '#d6ecff') look.color = '#f4f4f1'; // "colourless liquid" tint on a solid
  // No colour in PubChem's text ("Dry Powder")? Work it out from the chemistry instead.
  const mineral = phase === 'solid' ? knownLook(countsOf(g.atoms)) : null;
  if (phase === 'solid' && (mineral || !mentionsColour(c.describe))) {
    const inf = mineral || inferredSolidLook(g.atoms);
    if (inf) Object.assign(look, { color: inf.color, metalness: inf.metalness ?? look.metalness, roughness: inf.roughness ?? look.roughness, translucent: false, form: inf.form || look.form });
  }
  const halogens = g.atoms.filter((a) => ['F', 'Cl', 'Br', 'I'].includes(a.el.symbol)).length;
  SUBSTANCES[id] = {
    id,
    name: c.name,
    formula: displayFormula(g.atoms, g.bonds),
    smiles: c.smiles,
    ...look,
    emissive: null,
    emissiveIntensity: 0,
    pH: null,
    density: known(c.density) ? c.density : phase === 'gas' ? 0.002 : 1.2,
    mp: known(c.mp) ? c.mp : null,
    bp: known(c.bp) ? c.bp : null,
    soluble: false,
    aq: null,
    hazards: [],
    info: c.info || c.describe || '',
    describe: c.describe || '',
    ions: null,
    flame: null,
    flammable: hasC && !hasMetal && halogens < 2 && phase !== 'solid',
    molarMass: molarMass(g.atoms),
    cid: c.cid,
    ghs: c.ghs || [],
    pubchem: true,
    heavy: phase === 'gas' ? molarMass(g.atoms) > 29 : false,
    light: phase === 'gas' ? molarMass(g.atoms) < 20 : false,
  };
  added++;
}

// 3) Hazard statements for the elements
for (const [sym, e] of Object.entries(data.elements || {})) {
  const s = SUBSTANCES['elem:' + sym];
  if (s && e.ghs) { s.ghs = e.ghs; if (e.cid) s.cid = e.cid; }
}

export const LIBRARY_STATS = { enriched, added, generated: data.generated };
