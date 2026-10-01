// The ionic model behind real-world reactions for the whole library.
//
//  * Every salt (hand-made or from PubChem) is split into its ions (Ca²⁺ + 2 NO₃⁻ …).
//  * Solubility rules decide whether it dissolves in water or precipitates.
//  * Dissolved salts get an aqueous solution with the real colour of their ions
//    (Cu²⁺ blue, Ni²⁺ green, CrO₄²⁻ yellow …) and a realistic pH.
//  * Any cation + anion combination has a real name and formula ("Iron(III) phosphate",
//    FePO4) — made on the fly when it is not in the database, never "unnamed".
//  * Acids in the library are recognised from their structure (–COOH, oxoacids) and get
//    their conjugate-base anion (citric acid → citrate).

import { SUBSTANCES, FLAME_COLORS } from './substances.js';
import { ionicFragments, fragmentText } from './library.js';
import { parseSmiles } from './smiles.js';
import { BY_SYMBOL } from './elements.js';
import { inferredSolidLook, solutionLook } from './ionColors.js';

// --- Ions --------------------------------------------------------------------------------

export const CATIONS = {
  H: { charge: 1, name: 'Hydrogen' }, NH4: { charge: 1, name: 'Ammonium' },
  Li: { charge: 1, name: 'Lithium' }, Na: { charge: 1, name: 'Sodium' }, K: { charge: 1, name: 'Potassium' },
  Rb: { charge: 1, name: 'Rubidium' }, Cs: { charge: 1, name: 'Caesium' }, Ag: { charge: 1, name: 'Silver' },
  Tl: { charge: 1, name: 'Thallium(I)' },
  Be: { charge: 2, name: 'Beryllium' }, Mg: { charge: 2, name: 'Magnesium' }, Ca: { charge: 2, name: 'Calcium' },
  Sr: { charge: 2, name: 'Strontium' }, Ba: { charge: 2, name: 'Barium' }, Ra: { charge: 2, name: 'Radium' },
  Zn: { charge: 2, name: 'Zinc' }, Cd: { charge: 2, name: 'Cadmium' }, Cu: { charge: 2, name: 'Copper(II)' },
  Fe: { charge: 2, name: 'Iron(II)' }, Ni: { charge: 2, name: 'Nickel(II)' }, Co: { charge: 2, name: 'Cobalt(II)' },
  Mn: { charge: 2, name: 'Manganese(II)' }, Pb: { charge: 2, name: 'Lead(II)' }, Sn: { charge: 2, name: 'Tin(II)' },
  Hg: { charge: 2, name: 'Mercury(II)' }, Al: { charge: 3, name: 'Aluminium' }, Cr: { charge: 3, name: 'Chromium(III)' },
  Bi: { charge: 3, name: 'Bismuth' }, Au: { charge: 3, name: 'Gold(III)' }, Ga: { charge: 3, name: 'Gallium' },
  In: { charge: 3, name: 'Indium' }, Sc: { charge: 3, name: 'Scandium' }, Y: { charge: 3, name: 'Yttrium' },
  La: { charge: 3, name: 'Lanthanum' }, Ce: { charge: 3, name: 'Cerium(III)' }, Ti: { charge: 4, name: 'Titanium(IV)' },
  Zr: { charge: 4, name: 'Zirconium' }, U: { charge: 4, name: 'Uranium(IV)' }, Pt: { charge: 2, name: 'Platinum(II)' },
  Pd: { charge: 2, name: 'Palladium(II)' }, Sb: { charge: 3, name: 'Antimony(III)' },
};
const VARIABLE = { Fe: [2, 3], Cu: [1, 2], Sn: [2, 4], Pb: [2, 4], Hg: [1, 2], Co: [2, 3], Mn: [2, 3, 4], Cr: [2, 3, 6], Au: [1, 3], Ti: [3, 4], Ce: [3, 4], U: [4, 6], Pt: [2, 4], Tl: [1, 3], Sb: [3, 5] };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export const ANIONS = {
  F: { charge: 1, name: 'fluoride', f: 'F' }, Cl: { charge: 1, name: 'chloride', f: 'Cl' }, Br: { charge: 1, name: 'bromide', f: 'Br' },
  I: { charge: 1, name: 'iodide', f: 'I' }, OH: { charge: 1, name: 'hydroxide', f: 'OH' }, O: { charge: 2, name: 'oxide', f: 'O' },
  S: { charge: 2, name: 'sulfide', f: 'S' }, H: { charge: 1, name: 'hydride', f: 'H' }, O2: { charge: 2, name: 'peroxide', f: 'O2' },
  NO3: { charge: 1, name: 'nitrate', f: 'NO3' }, NO2: { charge: 1, name: 'nitrite', f: 'NO2' }, SO4: { charge: 2, name: 'sulfate', f: 'SO4' },
  SO3: { charge: 2, name: 'sulfite', f: 'SO3' }, S2O3: { charge: 2, name: 'thiosulfate', f: 'S2O3' }, HSO4: { charge: 1, name: 'hydrogen sulfate', f: 'HSO4' },
  CO3: { charge: 2, name: 'carbonate', f: 'CO3' }, HCO3: { charge: 1, name: 'hydrogen carbonate', f: 'HCO3' }, PO4: { charge: 3, name: 'phosphate', f: 'PO4' },
  HPO4: { charge: 2, name: 'hydrogen phosphate', f: 'HPO4' }, H2PO4: { charge: 1, name: 'dihydrogen phosphate', f: 'H2PO4' },
  ClO: { charge: 1, name: 'hypochlorite', f: 'ClO' }, ClO2: { charge: 1, name: 'chlorite', f: 'ClO2' }, ClO3: { charge: 1, name: 'chlorate', f: 'ClO3' },
  ClO4: { charge: 1, name: 'perchlorate', f: 'ClO4' }, BrO3: { charge: 1, name: 'bromate', f: 'BrO3' }, IO3: { charge: 1, name: 'iodate', f: 'IO3' },
  IO4: { charge: 1, name: 'periodate', f: 'IO4' }, CrO4: { charge: 2, name: 'chromate', f: 'CrO4' }, Cr2O7: { charge: 2, name: 'dichromate', f: 'Cr2O7' },
  MnO4: { charge: 1, name: 'permanganate', f: 'MnO4' }, CN: { charge: 1, name: 'cyanide', f: 'CN' }, SCN: { charge: 1, name: 'thiocyanate', f: 'SCN' },
  CH3COO: { charge: 1, name: 'acetate', f: 'CH3COO' }, HCOO: { charge: 1, name: 'formate', f: 'HCOO' }, C2O4: { charge: 2, name: 'oxalate', f: 'C2O4' },
  SiO3: { charge: 2, name: 'silicate', f: 'SiO3' }, N3: { charge: 1, name: 'azide', f: 'N3' }, C2: { charge: 2, name: 'carbide', f: 'C2' },
  BO3: { charge: 3, name: 'borate', f: 'BO3' }, AsO4: { charge: 3, name: 'arsenate', f: 'AsO4' }, MoO4: { charge: 2, name: 'molybdate', f: 'MoO4' },
  WO4: { charge: 2, name: 'tungstate', f: 'WO4' }, VO3: { charge: 1, name: 'metavanadate', f: 'VO3' }, SeO4: { charge: 2, name: 'selenate', f: 'SeO4' },
  N: { charge: 3, name: 'nitride', f: 'N' }, P: { charge: 3, name: 'phosphide', f: 'P' }, Se: { charge: 2, name: 'selenide', f: 'Se' },
};

const countsKey = (counts) => Object.keys(counts).filter((k) => counts[k]).sort().map((k) => k + counts[k]).join('');
const parseCounts = (f) => {
  const out = {};
  for (const [, e, n] of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) out[e] = (out[e] || 0) + (n ? Number(n) : 1);
  return out;
};
const ANION_BY_COUNTS = Object.fromEntries(Object.entries(ANIONS).map(([k, a]) => [countsKey(parseCounts(a.f === 'CH3COO' ? 'C2H3O2' : a.f === 'HCOO' ? 'CHO2' : a.f)), k]));
const fragCounts = (f) => {
  const c = {};
  for (const a of f) c[a.el.symbol] = (c[a.el.symbol] || 0) + 1;
  return c;
};

const GROUP1 = new Set(['Li', 'Na', 'K', 'Rb', 'Cs', 'NH4']);

/** Solubility rules (as taught in school, with the classic exceptions). */
export function isSoluble(cation, anion, charge = null) {
  if (cation === 'H') return true;
  if (GROUP1.has(cation)) return anion !== 'C2' && anion !== 'H' && anion !== 'O2' && anion !== 'N' && anion !== 'P'; // those react with water instead
  if (['NO3', 'CH3COO', 'ClO3', 'ClO4', 'ClO', 'NO2', 'HCO3', 'HSO4', 'H2PO4', 'BrO3', 'MnO4'].includes(anion)) return !(anion === 'CH3COO' && cation === 'Ag');
  if (['Cl', 'Br', 'I'].includes(anion)) {
    if (['Ag', 'Pb', 'Tl'].includes(cation)) return false; // AgCl, PbI₂ … precipitate
    if (cation === 'Cu' || cation === 'Hg') return (charge ?? 2) >= 2 && !(cation === 'Hg' && anion === 'I'); // CuCl, Hg₂Cl₂, HgI₂ don't dissolve
    return true;
  }
  if (anion === 'SO4') return !['Ba', 'Sr', 'Pb', 'Ca', 'Ra', 'Hg'].includes(cation);
  if (anion === 'F') return !['Ca', 'Mg', 'Ba', 'Sr', 'Pb', 'Li'].includes(cation);
  if (anion === 'OH') return ['Ba', 'Sr', 'Ca'].includes(cation); // Ca(OH)₂ only slightly (limewater)
  if (anion === 'CrO4') return ['Mg', 'Ca'].includes(cation);
  return false; // carbonates, phosphates, sulfides, oxides, silicates … of everything else
}

// --- Naming & making salts -------------------------------------------------------------

function cationName(cation, charge) {
  const c = CATIONS[cation];
  if (!c) return BY_SYMBOL[cation]?.name || cation;
  if (VARIABLE[cation]) return (BY_SYMBOL[cation]?.name || cation) + '(' + ROMAN[charge] + ')';
  return c.name;
}

function formulaOf(cation, nCat, anion, nAn) {
  const poly = (t) => /[A-Z].*[A-Z]|\d/.test(t);
  const cat = cation === 'NH4' && nCat > 1 ? `(NH4)${nCat}` : cation + (nCat > 1 ? nCat : '');
  const af = ANIONS[anion]?.f || anion;
  const an = nAn > 1 ? (poly(af) ? `(${af})${nAn}` : af + nAn) : af;
  return cat + an;
}

function atomsOf(cation, nCat, anion, nAn) {
  const out = [];
  const add = (sym, n) => { for (let i = 0; i < n; i++) out.push({ el: BY_SYMBOL[sym] }); };
  const cc = cation === 'NH4' ? { N: 1, H: 4 } : { [cation]: 1 };
  const ac = parseCounts(anion === 'CH3COO' ? 'C2H3O2' : anion === 'HCOO' ? 'CHO2' : ANIONS[anion]?.f || anion);
  for (const [e, n] of Object.entries(cc)) if (BY_SYMBOL[e]) add(e, n * nCat);
  for (const [e, n] of Object.entries(ac)) if (BY_SYMBOL[e]) add(e, n * nAn);
  return out;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * The salt made of `cation` and `anion` — from the database, or created on the fly with its
 * real name, formula, colour and solubility.
 */
export function findOrMakeSalt(cation, anion, charge = null) {
  if (!cation || !anion) return null;
  for (const s of Object.values(SUBSTANCES)) {
    if (s.ions && s.ions.cation === cation && s.ions.anion === anion && !s.solution && !s.acid && !s.base && s.phase !== 'gas'
      && (!charge || !VARIABLE[cation] || !s.ions.charge || s.ions.charge === charge)) return s;
  }
  const a = ANIONS[anion];
  const zc = charge || CATIONS[cation]?.charge || 2;
  const za = a ? a.charge : 1;
  const g = gcd(zc, za);
  const nCat = za / g, nAn = zc / g;
  const id = 'salt:' + cation + (VARIABLE[cation] ? zc : '') + ':' + anion;
  if (SUBSTANCES[id]) return SUBSTANCES[id];
  const atoms = atomsOf(cation, nCat, anion, nAn);
  const look = inferredSolidLook(atoms) || {};
  const name = `${cationName(cation, zc)} ${a ? a.name : anion}`;
  const s = {
    id, name: name.charAt(0).toUpperCase() + name.slice(1), formula: formulaOf(cation, nCat, anion, nAn),
    phase: 'solid', form: 'powder', color: look.color || '#f2f2ee', opacity: 1, metalness: look.metalness || 0, roughness: 0.85,
    emissive: null, emissiveIntensity: 0, pH: null, density: 2.5, mp: null, bp: null,
    soluble: isSoluble(cation, anion, zc), aq: null, hazards: [], ions: { cation, anion, charge: zc }, flame: FLAME_COLORS[cation] || null,
    info: `${name.charAt(0).toUpperCase() + name.slice(1)}: ${cationName(cation, zc).toLowerCase()} ions and ${a ? a.name : anion} ions.` + (isSoluble(cation, anion, zc) ? ' Dissolves in water.' : ' Insoluble in water — it forms as a precipitate.'),
    generated: true, atomsCounts: atoms.length,
  };
  SUBSTANCES[id] = s;
  return s;
}

// --- Solutions ---------------------------------------------------------------------------

function solutionPH(salt) {
  const { cation, anion } = salt.ions;
  if (cation === 'H') return ['Cl', 'Br', 'I', 'NO3', 'SO4', 'ClO4', 'ClO3', 'HSO4'].includes(anion) ? 0.5 : 2.4;
  if (anion === 'OH') return GROUP1.has(cation) ? 13.8 : 12.4;
  if (anion === 'CO3') return 11.6;
  if (anion === 'HCO3') return 8.3;
  if (['CH3COO', 'HCOO', 'CN', 'S', 'PO4', 'SiO3', 'ClO', 'NO2', 'BO3'].includes(anion)) return 9.5;
  if (cation === 'NH4') return 5.1;
  if (['Fe', 'Al', 'Cr', 'Sn', 'Hg', 'Bi', 'Au', 'Ti'].includes(cation)) return 2.5;
  if (['Cu', 'Zn', 'Pb', 'Ni', 'Co', 'Mn', 'Cd', 'Ag'].includes(cation)) return 4.5;
  if (anion === 'HSO4' || anion === 'H2PO4') return 2;
  return 7;
}

/** The aqueous solution of a soluble salt (created on first use). */
export function solutionFor(salt) {
  if (!salt) return null;
  if (salt.solution || salt.acid || salt.base) return salt.id;
  if (salt.aq && SUBSTANCES[salt.aq]) return salt.aq;
  if (!salt.ions || !isSoluble(salt.ions.cation, salt.ions.anion, salt.ions.charge)) return null;
  const id = 'aq:' + salt.id;
  if (!SUBSTANCES[id]) {
    let atoms = null;
    try { atoms = salt.smiles ? parseSmiles(salt.smiles).atoms : atomsOf(salt.ions.cation, 1, salt.ions.anion, 1); } catch { atoms = []; }
    const look = solutionLook(atoms) || { color: '#d9edff', opacity: 0.17 };
    const pH = solutionPH(salt);
    SUBSTANCES[id] = {
      id, name: `${salt.name} solution`, formula: `${salt.formula}(aq)`, phase: 'liquid', form: 'liquid',
      color: look.color, opacity: look.opacity, metalness: 0, roughness: 0.05, emissive: null, emissiveIntensity: 0,
      pH, density: 1.06, mp: -3, bp: 101, soluble: false, aq: null, solution: true, ions: { ...salt.ions },
      base: salt.ions.anion === 'OH' || salt.ions.anion === 'CO3', carbonate: ['CO3', 'HCO3'].includes(salt.ions.anion),
      acid: salt.ions.cation === 'H', weakAcid: salt.ions.cation === 'H' && pH > 1,
      hazards: salt.hazards || [], ghs: salt.ghs || [], flame: salt.flame || FLAME_COLORS[salt.ions.cation] || null,
      info: `${salt.name} dissolved in water — ${look.opacity > 0.3 ? 'the colour comes from its ions' : 'clear and colourless, like most salt solutions'}.`,
      solute: salt.id,
    };
  }
  salt.aq = id;
  salt.soluble = true;
  return id;
}

// --- Give every library compound its chemistry ------------------------------------------

function acidicHydrogens(atoms, bonds) {
  // H on an O that is bonded to a non-metal centre carrying another O (oxoacid / –COOH).
  const nb = (a) => bonds.filter((b) => b.a === a || b.b === a).map((b) => (b.a === a ? b.b : b.a));
  let n = 0;
  let carboxylic = false;
  for (const h of atoms) {
    if (h.el.symbol !== 'H') continue;
    const [o] = nb(h);
    if (!o || o.el.symbol !== 'O') continue;
    const centre = nb(o).find((x) => x !== h);
    if (!centre || centre.el.isMetal) continue;
    const otherO = nb(centre).filter((x) => x.el.symbol === 'O' && x !== o);
    if (!otherO.length) continue;
    if (centre.el.symbol === 'C') {
      const dbl = bonds.some((b) => b.order === 2 && ((b.a === centre && b.b.el.symbol === 'O') || (b.b === centre && b.a.el.symbol === 'O')));
      if (!dbl) continue;
      carboxylic = true;
    } else if (!['N', 'S', 'P', 'Cl', 'Br', 'I', 'Se', 'As', 'B', 'Cr', 'Mn'].includes(centre.el.symbol)) continue;
    n++;
  }
  return { n, carboxylic };
}

const STRONG = new Set(['NO3', 'SO4', 'ClO4', 'ClO3', 'HSO4', 'IO4', 'SeO4', 'MnO4', 'Cr2O7']);

function processCompound(s) {
  if (!s.smiles || s.ions || s.element) return;
  let g;
  try { g = parseSmiles(s.smiles); } catch { return; }
  const fr = ionicFragments(g.atoms, g.bonds);
  if (fr && fr.cations.length && fr.anions.length) {
    const catTexts = new Set(fr.cations.map(fragmentText));
    const anTexts = new Set(fr.anions.map((f) => ANION_BY_COUNTS[countsKey(fragCounts(f))] || fragmentText(f)));
    if (catTexts.size !== 1 || anTexts.size !== 1) return; // mixed salts: leave as they are
    const cation = [...catTexts][0];
    const anion = [...anTexts][0];
    if (!ANIONS[anion] || !(CATIONS[cation] || BY_SYMBOL[cation])) return;
    const charge = Math.round((fr.anions.length * ANIONS[anion].charge) / fr.cations.length);
    s.ions = { cation, anion, charge };
    if (!s.flame && FLAME_COLORS[cation]) s.flame = FLAME_COLORS[cation];
    if (anion === 'CO3' || anion === 'HCO3') s.carbonate = true;
    if (['O', 'OH'].includes(anion) && !isSoluble(cation, anion, charge)) s.basicSolid = true; // dissolves in acids
    if (s.phase === 'solid' && isSoluble(cation, anion, charge)) solutionFor(s);
    return;
  }
  // Acids from their structure
  const { n, carboxylic } = acidicHydrogens(g.atoms, g.bonds);
  if (n > 0) {
    const counts = fragCounts(g.atoms);
    counts.H -= n;
    const anionKey = ANION_BY_COUNTS[countsKey(counts)];
    if (!anionKey && !/acid$/i.test(s.name)) return; // e.g. aspirin: has –COOH but is not sold as "an acid"
    const anion = anionKey || s.name.replace(/ic acid$/i, 'ate').replace(/ous acid$/i, 'ite').replace(/ acid$/i, 'ate').toLowerCase();
    if (!ANIONS[anion]) {
      const order = ['C', 'H', ...Object.keys(counts).filter((e) => e !== 'C' && e !== 'H').sort()];
      ANIONS[anion] = { charge: n, name: anion, f: order.filter((e) => counts[e] > 0).map((e) => e + (counts[e] > 1 ? counts[e] : '')).join(''), organic: true };
    }
    const strong = STRONG.has(anion);
    if (s.phase === 'liquid') {
      Object.assign(s, { acid: true, weakAcid: !strong, pH: strong ? 0 : carboxylic ? 2.4 : 1.5, ions: { cation: 'H', anion } });
    } else if (s.phase === 'solid') {
      // A solid acid only acts as an acid once dissolved (dry citric acid + baking soda: nothing).
      const id = 'aq:' + s.id;
      const small = !carboxylic || (counts.C || 0) <= 7;
      if (small && !SUBSTANCES[id]) {
        SUBSTANCES[id] = {
          id, name: `${s.name} solution`, formula: `${s.formula}(aq)`, phase: 'liquid', form: 'liquid', color: '#dbeeff', opacity: 0.18,
          metalness: 0, roughness: 0.05, emissive: null, emissiveIntensity: 0, pH: strong ? 0.5 : 2.3, density: 1.05, mp: -3, bp: 101,
          solution: true, acid: true, weakAcid: !strong, ions: { cation: 'H', anion }, hazards: s.hazards || [], ghs: s.ghs || [],
          info: `${s.name} dissolved in water — an acidic solution (pH ≈ ${strong ? '0.5' : '2.3'}).`, solute: s.id,
        };
        s.soluble = true;
        s.aq = id;
      }
      s.ions = { cation: 'H', anion };
      s.solidAcid = true;
    }
  }
}

/** Structural flags used by the reaction rules: burns? sugar? fuming chloride? */
function flagsFor(s) {
  if (!s.smiles || s.element) return;
  let g;
  try { g = parseSmiles(s.smiles); } catch { return; }
  const c = fragCounts(g.atoms);
  const metal = g.atoms.some((a) => a.el.isMetal);
  const halogens = (c.F || 0) + (c.Cl || 0) + (c.Br || 0) + (c.I || 0);
  if (c.C && c.H && !metal && halogens < 2 && !(c.N && c.O && c.O >= 2 * c.N && c.N >= 3)) s.combustible = true; // (not TNT-like nitro compounds)
  if (c.C && c.H && c.O && !c.N && !metal && !halogens && c.O / c.C >= 0.8 && c.C >= 4 && !(s.acid || /acid/i.test(s.name))) s.carbohydrate = true;
  // Chlorides of non-metals / Ti / Si / Sn and acyl chlorides fume in water
  if (c.Cl && !metal) {
    const nb = (a) => g.bonds.filter((b) => b.a === a || b.b === a).map((b) => (b.a === a ? b.b : b.a));
    for (const a of g.atoms) {
      if (a.el.symbol !== 'Cl') continue;
      const [x] = nb(a);
      if (!x) continue;
      const centre = x.el.symbol;
      const acyl = centre === 'C' && g.bonds.some((b) => b.order === 2 && ((b.a === x && b.b.el.symbol === 'O') || (b.b === x && b.a.el.symbol === 'O')));
      if (['Ti', 'Si', 'Sn', 'P', 'S', 'B', 'Ge', 'Sb'].includes(centre) || acyl) {
        s.hydrolyses = { Ti: 'tio2', Si: 'sio2', P: 'phosphoric_acid', S: 'sulfur_dioxide', C: c.C === 2 ? 'acetic_acid' : null }[centre] ?? null;
        if (s.hydrolyses === undefined) s.hydrolyses = null;
        s.fuming = true;
        break;
      }
    }
  }
  if (metal && (c.Ti || c.Sn || c.Al) && c.Cl && !c.O && !c.H && s.phase !== 'solid') { s.fuming = true; s.hydrolyses = c.Ti ? 'tio2' : null; }
}

for (const s of Object.values(SUBSTANCES)) { flagsFor(s); processCompound(s); }
// Hand-made oxides / hydroxides / carbonates that dissolve in acid
for (const s of Object.values(SUBSTANCES)) {
  if (s.ions && s.phase === 'solid' && ['O', 'OH', 'CO3'].includes(s.ions.anion) && !isSoluble(s.ions.cation, s.ions.anion, s.ions.charge)
    && !['Si', 'Ti', 'Cr', 'Al'].includes(s.ions.cation) && s.basicSolid === undefined && !s.carbonate) s.basicSolid = true;
}

/** Ion bookkeeping for a hand-made salt that has ions but no solution yet. */
for (const s of Object.values(SUBSTANCES)) {
  if (s.ions && s.phase === 'solid' && !s.aq && s.ions.cation !== 'H' && isSoluble(s.ions.cation, s.ions.anion, s.ions.charge) && !s.slakes) solutionFor(s);
}

// Every solution knows its solute (for hazards, the synthesizer's reverse mode …).
for (const s of Object.values(SUBSTANCES)) {
  if (s.aq && SUBSTANCES[s.aq] && !SUBSTANCES[s.aq].solute && SUBSTANCES[s.aq] !== s) SUBSTANCES[s.aq].solute = s.id;
}

export const ION_STATS = {
  salts: Object.values(SUBSTANCES).filter((s) => s.ions && !s.solution).length,
  solutions: Object.values(SUBSTANCES).filter((s) => s.solution).length,
};
