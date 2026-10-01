// Colours that come from the chemistry itself, for compounds whose data has no colour
// (PubChem often just says "Dry Powder"). Most colour in inorganic chemistry comes from a
// handful of sources, and they are modelled here:
//   • transition-metal ions (Cu²⁺ blue, Ni²⁺ green, Co²⁺ pink, Fe³⁺ yellow-brown, Cr³⁺ green …),
//   • coloured anions (chromate yellow, dichromate orange, permanganate purple),
//   • charge-transfer in heavy-metal sulfides, oxides and iodides (black CuS, red HgS,
//     yellow CdS and PbI₂ …).
// Everything else (Na⁺, K⁺, Ca²⁺, Zn²⁺, Al³⁺, Mg²⁺ salts …) is white or colourless.

/** Known minerals / classic compounds by formula (element counts sorted). */
const KNOWN = {
  FeS2: { color: '#c9a93a', metalness: 0.85, roughness: 0.25, form: 'cubic', name: 'pyrite ("fool\'s gold")' },
  HgS: { color: '#b3261e' }, // cinnabar / vermilion
  PbS: { color: '#5b5f66', metalness: 0.6, roughness: 0.3, form: 'cubic' }, // galena
  Ag2S: { color: '#1f1e20' },
  FeS: { color: '#3b342c', metalness: 0.3 },
  CuS: { color: '#151517' },
  Cu2S: { color: '#2a2a2c' },
  ZnS: { color: '#f2f0e6' },
  CdS: { color: '#f0b21a' },
  MnS: { color: '#5b8a52' },
  NiS: { color: '#1f1f1f' },
  CoS: { color: '#151515' },
  As2S3: { color: '#f2c21a' }, // orpiment
  Sb2S3: { color: '#e05a12' },
  SnS2: { color: '#d9b23a', metalness: 0.4 }, // "mosaic gold"
  MoS2: { color: '#4f5258', metalness: 0.6, form: 'flakes' },
  Fe2O3: { color: '#7d2a12' },
  Fe3O4: { color: '#1b1a1a', metalness: 0.3 },
  FeO: { color: '#1f1a17' },
  CuO: { color: '#1d1b1a' },
  Cu2O: { color: '#9a2414' },
  CoO: { color: '#5d6650' },
  Co3O4: { color: '#151517' },
  NiO: { color: '#3f7a46' },
  MnO2: { color: '#1b1a1c' },
  MnO: { color: '#3f9a4a' },
  Cr2O3: { color: '#2f6b2a' },
  CrO3: { color: '#7a0f0f' },
  V2O5: { color: '#e08a1a' },
  PbO: { color: '#e8b21a' },
  PbO2: { color: '#3b2416' },
  Pb3O4: { color: '#d8401e' }, // red lead
  HgO: { color: '#e05a1a' },
  Ag2O: { color: '#2b211c' },
  Au2O3: { color: '#5a3a14' },
  UO2: { color: '#1e1c1a' },
  WO3: { color: '#e6d23a' },
  CeO2: { color: '#f2ebc9' },
  WC: { color: '#5d6066', metalness: 0.7, form: 'chunk' },
  SiC: { color: '#2b3b3a', metalness: 0.5, form: 'crystals' },
  PbI2: { color: '#f7c613' },
  HgI2: { color: '#d8261a' },
  AgI: { color: '#f1e07a' },
  AgBr: { color: '#f3ecc8' },
  CuI: { color: '#f2efe6' },
  BiI3: { color: '#1e1e20' },
  SnI4: { color: '#e05a12' },
  Ag2CrO4: { color: '#9b2d1f' },
  PbCrO4: { color: '#f2c21a' }, // chrome yellow
  BaCrO4: { color: '#f5e03a' },
  AgF: { color: '#c9b26a' },
  ICl3: { color: '#e8a020' },
  CuCO3: { color: '#2f9f74' }, // malachite green
  Fe2S3O12: { color: '#efe3b0' }, // iron(III) sulfate
  MnSO4: { color: '#f1dede' },
  FeH2O2: { color: '#d7e3c8' }, // iron(II) hydroxide, quickly turns brown in air
  FeH3O3: { color: '#8a4515' },
  CuH2O2: { color: '#3c8fd8' },
  NiH2O2: { color: '#6ec26a' },
  CoH2O2: { color: '#d4718a' },
  MnH2O2: { color: '#f2e8d8' },
  CrH3O3: { color: '#5b8a6a' },
};

/** Hydrated metal ions: the colour of their salts' crystals and solutions. */
export const ION_COLORS = {
  Cu: { solid: '#3a86d8', solution: '#1f7fe8', opacity: 0.6 },
  Ni: { solid: '#4caf5c', solution: '#3fae5a', opacity: 0.5 },
  Co: { solid: '#c8406e', solution: '#e0457a', opacity: 0.5 },
  Fe3: { solid: '#d8a030', solution: '#c26a12', opacity: 0.65 },
  Fe2: { solid: '#a8d9b0', solution: '#b8e3b0', opacity: 0.35 },
  Cr: { solid: '#3f7a3a', solution: '#3a8a52', opacity: 0.6 },
  Mn: { solid: '#f2c8d2', solution: '#f6e2e6', opacity: 0.2 },
  V: { solid: '#3a5fb8', solution: '#2f62c8', opacity: 0.55 },
  Ti: { solid: '#a77fd8', solution: '#9a6ad0', opacity: 0.4 },
  Au: { solid: '#d8b13a', solution: '#e8c440', opacity: 0.5 },
  Pt: { solid: '#c8a040', solution: '#d8a840', opacity: 0.45 },
  Pd: { solid: '#9a5a2a', solution: '#b0652a', opacity: 0.5 },
  U: { solid: '#d8d83a', solution: '#d8e04a', opacity: 0.45 }, // uranyl yellow-green
  Ce: { solid: '#f0e2a0', solution: '#f2e6a0', opacity: 0.3 },
};
const ANION_COLORS = {
  CrO4: { solid: '#f2c21a', solution: '#f2d000', opacity: 0.6 },
  Cr2O7: { solid: '#ff5a0a', solution: '#ff7a12', opacity: 0.75 },
  MnO4: { solid: '#2e0c2e', solution: '#7a0d6e', opacity: 0.9 },
  MnO4_2: { solid: '#1f4a2a', solution: '#2a7a3a', opacity: 0.8 }, // manganate green
  'Fe(CN)6': { solid: '#d8a020', solution: '#e8c03a', opacity: 0.5 },
};

export function countsOf(atoms) {
  const c = {};
  for (const a of atoms) c[a.el.symbol] = (c[a.el.symbol] || 0) + 1;
  return c;
}

function keyOf(c) {
  return Object.keys(c).sort().map((k) => k + (c[k] > 1 ? c[k] : '')).join('');
}

const parse = (f) => {
  const out = {};
  for (const [, e, n] of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) out[e] = (out[e] || 0) + (n ? Number(n) : 1);
  return out;
};
const KNOWN_BY_KEY = Object.fromEntries(Object.entries(KNOWN).map(([f, look]) => [keyOf(parse(f)), look]));

export function knownLook(c) {
  return KNOWN_BY_KEY[keyOf(c)] || null;
}

/** Oxygen not already part of a sulfate / phosphate / nitrate / carbonate / perchlorate. */
function freeO(c) {
  const nitrateN = Math.max(0, (c.N || 0) - Math.floor((c.H || 0) / 4)); // ammonium N carries no oxygen
  return (c.O || 0) - 4 * ((c.S || 0) + (c.P || 0) + (c.Cl && c.O ? c.Cl : 0)) - 3 * (nitrateN + (c.C || 0));
}
const chromate = (c) => c.Cr && freeO(c) >= 3.5 * c.Cr;
const permanganate = (c) => c.Mn && freeO(c) >= 4 * c.Mn;

/** Oxidation-state guess for a metal from simple charge balance. */
function stateOf(c, metal) {
  const anionCharge = (c.O || 0) * 2 + (c.S && !c.O ? c.S * 2 : 0) + (c.Cl || 0) + (c.Br || 0) + (c.I || 0) + (c.F || 0)
    - (c.H || 0) - (c.N && c.O ? c.N * 5 : 0) - (c.S && c.O ? c.S * 6 : 0) - (c.C && c.O ? c.C * 4 : 0) - (c.P && c.O ? c.P * 5 : 0);
  const others = ['Na', 'K', 'Li', 'Rb', 'Cs'].reduce((q, e) => q + (c[e] || 0), 0) + 2 * ['Mg', 'Ca', 'Sr', 'Ba', 'Zn'].reduce((q, e) => q + (c[e] || 0), 0);
  return (anionCharge - others) / (c[metal] || 1);
}
function ironState(c) {
  const anionCharge = (c.O || 0) * 2 + (c.S && !c.O ? c.S * 2 : 0) + (c.Cl || 0) + (c.Br || 0) + (c.I || 0) + (c.F || 0)
    - (c.H || 0) - (c.N && c.O ? c.N * 5 : 0) - (c.S && c.O ? c.S * 6 : 0) - (c.C && c.O ? c.C * 4 : 0) - (c.P && c.O ? c.P * 5 : 0);
  const others = Object.entries(c).filter(([e]) => ['Na', 'K', 'Li', 'NH4'].includes(e)).reduce((q, [, n]) => q + n, 0);
  return (anionCharge - others) / (c.Fe || 1);
}

/**
 * The look of a solid compound worked out from its composition, or null when it would be
 * white / colourless anyway.
 */
export function inferredSolidLook(atoms) {
  const c = countsOf(atoms);
  const known = knownLook(c);
  if (known) return known;
  const has = (e) => !!c[e];
  const nonO = Object.keys(c).filter((e) => !['O', 'H'].includes(e));
  // Coloured oxo-anions dominate
  if (chromate(c)) return { color: freeO(c) / c.Cr < 3.8 ? ANION_COLORS.Cr2O7.solid : ANION_COLORS.CrO4.solid };
  if (permanganate(c)) return { color: ANION_COLORS.MnO4.solid, metalness: 0.4 };
  // Sulfides / selenides / tellurides of heavy & transition metals are dark
  const chalc = (has('S') || has('Se') || has('Te')) && !has('O');
  const tm = ['Fe', 'Co', 'Ni', 'Cu', 'Ag', 'Pb', 'Bi', 'Mo', 'W', 'Mn', 'Cr', 'Sn', 'Pt', 'Pd', 'Au', 'Hg', 'Tl'];
  if (chalc && tm.some(has)) return { color: '#1e1e20', metalness: 0.25 };
  // Simple oxides / hydroxides of coloured metals
  if (nonO.length === 1) {
    const m = nonO[0];
    if (m === 'Fe') return { color: ironState(c) >= 2.5 ? '#7d2a12' : '#1f1a17' };
    if (m === 'Cu') return { color: c.O >= c.Cu ? '#1d1b1a' : '#9a2414' };
    if (['Co', 'Mn', 'Pd', 'Ag', 'Pt', 'Os', 'Ir', 'Ru', 'Rh'].includes(m)) return { color: '#1d1b1c' };
    if (m === 'Ni') return { color: '#3f7a46' };
    if (m === 'Cr') return { color: '#2f6b2a' };
    if (m === 'V') return { color: '#e08a1a' };
    if (m === 'Pb') return { color: '#e8b21a' };
    if (m === 'Hg') return { color: '#e05a1a' };
    if (m === 'Bi') return { color: '#f2e07a' };
  }
  // Heavy-metal iodides are coloured
  if (has('I') && !has('O')) {
    if (has('Pb') || has('Tl')) return { color: '#f7c613' };
    if (has('Hg')) return { color: '#d8261a' };
    if (has('Ag')) return { color: '#f1e07a' };
    if (has('Bi') || has('Cu') && c.I >= 2) return { color: '#1e1e20' };
  }
  // Salts of coloured metal ions (hydrated crystals as they come from the bottle)
  if (has('Fe')) return { color: ironState(c) >= 2.5 ? ION_COLORS.Fe3.solid : ION_COLORS.Fe2.solid };
  if (has('Cu') && stateOf(c, 'Cu') < 1.5) return null; // copper(I) salts (CuCl, CuI) are white
  for (const m of Object.keys(ION_COLORS)) if (has(m)) return { color: ION_COLORS[m].solid };
  return null;
}

/** Colour of an aqueous solution of a compound, from its ions (null = colourless). */
export function solutionLook(atoms) {
  const c = countsOf(atoms);
  const has = (e) => !!c[e];
  if (chromate(c)) {
    const a = freeO(c) / c.Cr < 3.8 ? ANION_COLORS.Cr2O7 : ANION_COLORS.CrO4;
    return { color: a.solution, opacity: a.opacity };
  }
  if (permanganate(c)) return { color: ANION_COLORS.MnO4.solution, opacity: ANION_COLORS.MnO4.opacity };
  if (has('Fe')) {
    const ion = ironState(c) >= 2.5 ? ION_COLORS.Fe3 : ION_COLORS.Fe2;
    return { color: ion.solution, opacity: ion.opacity };
  }
  if (has('Cu') && stateOf(c, 'Cu') < 1.5) return null;
  for (const m of Object.keys(ION_COLORS)) if (has(m)) return { color: ION_COLORS[m].solution, opacity: ION_COLORS[m].opacity };
  if (has('I') && has('K') && c.I > 1) return { color: '#c9821a', opacity: 0.5 }; // triiodide
  return null;
}

const COLOUR_WORDS = /colou?rless|white|black|red|yellow|green|blue|violet|purple|brown|orange|pink|gr[ae]y|silver|gold|brass|\btan\b|buff|cream|lavender|scarlet|crimson|vermilion|bronze/i;

/** Does a PubChem description actually tell us the colour? */
export function mentionsColour(text) {
  return COLOUR_WORDS.test(text || '');
}
