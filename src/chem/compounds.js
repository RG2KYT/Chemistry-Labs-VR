// Molecule identification: maps player-built molecular graphs to known substances.

import { parseSmiles } from './smiles.js';
import { SUBSTANCES } from './substances.js';
import { displayFormula } from './library.js'; // also merges the PubChem library
import { signature, formulaString, molarMass, unsatisfiedAtoms, bondSum } from './graph.js';
import { toSmiles } from './smilesWriter.js';
import { lookupMolecule, lookupFormula } from './pubchem.js';

const INDEX = new Map();

for (const s of Object.values(SUBSTANCES)) {
  if (!s.smiles) continue;
  const { atoms, bonds } = parseSmiles(s.smiles);
  s.molarMass = molarMass(atoms);
  const sig = signature(atoms, bonds);
  if (!INDEX.has(sig)) INDEX.set(sig, s);
}

// Elements that are fine as a lone atom (metals, metalloids, noble gases and a few solids).
const LONE_OK_NONMETALS = new Set(['C', 'S', 'P', 'Se', 'B', 'Si']);

const CUSTOM = new Map();

// Molecules that are not in the offline library are looked up online in PubChem (100+
// million known compounds) to get their real name and look. Only a structure nobody has
// ever recorded is called "Undiscovered compound".
const listeners = new Set();
/** fn(substance) is called whenever a looked-up substance gets its real name / look. */
export function onSubstanceUpdate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = (s) => { for (const fn of listeners) { try { fn(s); } catch (e) { console.error(e); } } };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** A first guess at the look until (or unless) the real data arrives. */
const METAL_COLORS = { Cu: '#3d8fd6', Fe: '#b5562a', Co: '#d96a9a', Ni: '#5fae6a', Cr: '#4e8f3a', Mn: '#e7a6b8', V: '#4a6fc4', Ag: '#d8d4cc', Au: '#d8b13a', Pb: '#f2f0e6' };
function estimatedLook(atoms, phase) {
  const metal = atoms.find((a) => METAL_COLORS[a.el.symbol]);
  if (phase === 'gas') return { form: 'gas', color: '#ffffff', opacity: 0.05 };
  if (phase === 'liquid') return { form: 'liquid', color: '#e2eeff', opacity: 0.2 };
  return { form: metal ? 'crystals' : 'powder', color: metal ? METAL_COLORS[metal.el.symbol] : '#f1f0ea', opacity: 1, roughness: metal ? 0.35 : 0.8 };
}

function customSubstance(atoms, bonds) {
  const sig = signature(atoms, bonds);
  if (CUSTOM.has(sig)) return CUSTOM.get(sig);
  const formula = displayFormula(atoms, bonds);
  const mass = molarMass(atoms);
  const hasMetal = atoms.some((a) => a.el.isMetal);
  let phase = 'liquid';
  if (hasMetal || mass > 160) phase = 'solid';
  else if (mass < 46) phase = 'gas';
  const look = estimatedLook(atoms, phase);
  const s = {
    id: 'custom:' + formulaString(atoms) + ':' + hash(sig),
    name: 'Identifying…',
    formula,
    phase,
    form: look.form,
    color: look.color,
    opacity: look.opacity,
    metalness: 0,
    roughness: look.roughness ?? 0.8,
    emissive: null,
    emissiveIntensity: 0,
    pH: null,
    density: phase === 'gas' ? 0.002 : 1.2,
    mp: null,
    bp: null,
    soluble: false,
    aq: null,
    hazards: [],
    ions: null,
    flame: null,
    flammable: atoms.some((a) => a.el.symbol === 'C') && !hasMetal,
    molarMass: mass,
    custom: true,
    pending: true,
    info: 'Looking it up in PubChem, the world’s largest open chemistry database…',
    // Remember the structure so the synthesizer can turn the substance back into atoms.
    graph: {
      symbols: atoms.map((a) => a.el.symbol),
      bonds: bonds.map((b) => [atoms.indexOf(b.a), atoms.indexOf(b.b), b.order]),
    },
  };
  SUBSTANCES[s.id] = s;
  CUSTOM.set(sig, s);
  let smiles = null;
  try { smiles = toSmiles(atoms, bonds); } catch { /* lookup by formula only */ }
  identifyOnline(s, { smiles, formula: formulaString(atoms), hasMetal });
  return s;
}

const ROOM = 22;
function applyLookup(s, r) {
  s.name = r.name;
  s.cid = r.cid;
  s.pending = false;
  s.offline = false;
  s.info = r.info || r.describe || s.info;
  s.describe = r.describe || '';
  if (r.mp !== null && r.mp !== undefined) s.mp = r.mp;
  if (r.bp !== null && r.bp !== undefined) s.bp = r.bp;
  if (r.density) s.density = r.density;
  let phase = r.look?.phase || s.phase;
  if (s.mp !== null && ROOM < s.mp) phase = 'solid';
  else if (s.bp !== null && ROOM >= s.bp) phase = 'gas';
  else if (s.mp !== null) phase = 'liquid';
  const look = r.look || {};
  s.phase = phase;
  s.form = phase === 'gas' ? 'gas' : phase === 'liquid' ? 'liquid' : look.form && !['liquid', 'gas'].includes(look.form) ? look.form : 'powder';
  if (look.color) s.color = look.color;
  s.opacity = phase === 'solid' ? 1 : phase === 'gas' ? Math.min(0.35, look.opacity ?? 0.06) : look.phase === 'liquid' ? look.opacity ?? 0.2 : 0.3;
  s.metalness = look.metalness ?? 0;
  s.roughness = look.roughness ?? 0.6;
  s.translucent = !!look.translucent;
  if (phase === 'gas') s.density = 0.002;
}

const RETRY_S = [8, 20, 45, 90, 180];
function identifyOnline(s, query, attempt = 0) {
  if (typeof fetch === 'undefined' || globalThis.CHEMLAB_NO_LOOKUP) return;
  const p = query.hasMetal || !query.smiles ? lookupFormula(query.formula) : lookupMolecule(query.smiles);
  p.then((r) => {
    if (r.status === 'found') {
      applyLookup(s, r);
    } else if (r.status === 'none' && query.hasMetal && query.smiles) {
      // Not found by formula — try the exact structure before giving up.
      identifyOnline(s, { ...query, hasMetal: false }, attempt);
      return;
    } else if (r.status === 'none') {
      s.name = 'Undiscovered compound';
      s.pending = false;
      s.undiscovered = true;
      s.info = 'Nobody has ever recorded this exact molecule — it is not among PubChem’s 100+ million known compounds. Its look is a guess. Maybe you just invented it!';
    } else {
      // Offline or PubChem busy: keep a clear name and try again later.
      s.name = 'Unidentified compound';
      s.offline = true;
      s.info = 'Could not reach PubChem to identify it (offline?). Trying again…';
      const wait = RETRY_S[Math.min(attempt, RETRY_S.length - 1)];
      const t = setTimeout(() => identifyOnline(s, query, attempt + 1), wait * 1000);
      t?.unref?.();
    }
    notify(s);
  }).catch((e) => console.error(e));
}

/**
 * Identify a molecule.
 * @returns {{ ok: boolean, substance: object|null, known: boolean, formula: string, reason?: string }}
 */
export function identify(atoms, bonds) {
  const formula = formulaString(atoms);
  if (!atoms.length) return { ok: false, substance: null, known: false, formula, reason: 'Empty' };
  const first = atoms[0].el;
  const allSame = atoms.every((a) => a.el === first);

  if (atoms.length === 1) {
    if (first.diatomic) {
      return {
        ok: false, substance: null, known: false, formula,
        reason: `A lone ${first.name.toLowerCase()} atom is a radical. Elemental ${first.name.toLowerCase()} is ${first.symbol}₂ — bond two together.`,
      };
    }
    if (first.isMetal || first.category === 'MD' || first.category === 'NG' || LONE_OK_NONMETALS.has(first.symbol) || first.category === 'UK') {
      return { ok: true, substance: SUBSTANCES['elem:' + first.symbol], known: true, formula, element: true };
    }
  }
  if (allSame && atoms.length === 2 && first.diatomic && bonds.length === 1) {
    return { ok: true, substance: SUBSTANCES['elem:' + first.symbol], known: true, formula, element: true };
  }

  const sig = signature(atoms, bonds);
  const known = INDEX.get(sig);
  if (known) return { ok: true, substance: known, known: true, formula };

  const unsat = unsatisfiedAtoms(atoms, bonds);
  if (unsat.length) {
    const a = unsat[0];
    const need = a.el.valences.find((v) => v > bondSum(a, bonds));
    const missing = need !== undefined ? need - bondSum(a, bonds) : 0;
    return {
      ok: false, substance: null, known: false, formula,
      reason: missing > 0
        ? `Unstable: ${a.el.name} still has ${missing} free bond${missing > 1 ? 's' : ''}. Fill every free bond first.`
        : `Unstable: ${a.el.name} has too many bonds.`,
    };
  }
  if (allSame && atoms.length > 2) {
    // e.g. chains of carbon or sulfur rings — treat as the element itself.
    return { ok: true, substance: SUBSTANCES['elem:' + first.symbol], known: true, formula, element: true };
  }
  return { ok: true, substance: customSubstance(atoms, bonds), known: false, formula };
}

export function knownCompoundCount() {
  return INDEX.size;
}

// ---------------------------------------------------------------------------------------
// Physical form -> atoms (used by the synthesizer in reverse).

const SPECIAL = {
  steam: 'O',
  copper_deposit: '[Cu]',
  iodine_vapor: 'II',
};

/**
 * Molecular structure of a substance as { symbols, bonds: [[i, j, order]] }, or null when
 * it has no single molecule (foam, smoke…). Solutions return their dissolved substance.
 */
export function moleculeSpecFor(substance) {
  if (!substance) return null;
  if (substance.base && SUBSTANCES[substance.base] && SUBSTANCES[substance.base] !== substance) return moleculeSpecFor(SUBSTANCES[substance.base]);
  if (substance.graph) return substance.graph;
  let smiles = substance.smiles || SPECIAL[substance.id];
  if (!smiles && substance.element) {
    const el = substance.element;
    return substance.formula === el + '2'
      ? { symbols: [el, el], bonds: [[0, 1, 1]] }
      : { symbols: [el], bonds: [] };
  }
  if (!smiles && substance.solution) {
    const solute = Object.values(SUBSTANCES).find((x) => x.aq === substance.id);
    return solute ? moleculeSpecFor(solute) : moleculeSpecFor(SUBSTANCES.water);
  }
  if (!smiles) return null;
  const { atoms, bonds } = parseSmiles(smiles);
  return {
    symbols: atoms.map((a) => a.el.symbol),
    bonds: bonds.map((b) => [atoms.indexOf(b.a), atoms.indexOf(b.b), b.order]),
  };
}
