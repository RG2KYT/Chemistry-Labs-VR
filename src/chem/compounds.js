// Molecule identification: maps player-built molecular graphs to known substances.

import { parseSmiles } from './smiles.js';
import { SUBSTANCES } from './substances.js';
import { signature, formulaString, molarMass, unsatisfiedAtoms, bondSum } from './graph.js';

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

function customSubstance(atoms, bonds) {
  const formula = formulaString(atoms);
  if (CUSTOM.has(formula)) return CUSTOM.get(formula);
  const mass = molarMass(atoms);
  const hasMetal = atoms.some((a) => a.el.isMetal);
  let phase = 'liquid';
  if (hasMetal || mass > 160) phase = 'solid';
  else if (mass < 46) phase = 'gas';
  const s = {
    id: 'custom:' + formula,
    name: 'Unnamed compound',
    formula,
    phase,
    form: phase === 'solid' ? 'powder' : phase === 'gas' ? 'gas' : 'liquid',
    color: phase === 'solid' ? '#eeeeea' : '#e2eeff',
    opacity: phase === 'gas' ? 0.05 : phase === 'liquid' ? 0.2 : 1,
    metalness: 0,
    roughness: 0.8,
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
    info: 'A valid molecule that is not in the lab database. Its appearance is estimated.',
    // Remember the structure so the synthesizer can turn the substance back into atoms.
    graph: {
      symbols: atoms.map((a) => a.el.symbol),
      bonds: bonds.map((b) => [atoms.indexOf(b.a), atoms.indexOf(b.b), b.order]),
    },
  };
  SUBSTANCES[s.id] = s;
  CUSTOM.set(formula, s);
  return s;
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
