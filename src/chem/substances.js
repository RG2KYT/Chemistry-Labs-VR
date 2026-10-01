// Substance database: every material that can exist inside lab containers.
// Each compound may carry a SMILES string so molecules built by the player can be
// recognised (see compounds.js). Appearance fields drive the physically-based materials
// used for the products the synthesizer creates.
//
// Fields: name, formula, phase (solid | liquid | gas), form (liquid | powder | crystals |
// pellets | metal | chunk | gas), color, opacity, metalness, roughness, emissive,
// pH, density (g/mL), mp / bp (°C), soluble, aq (id of the aqueous solution),
// hazards, info, ions { cation, anion }, flame (flame-test colour), flammable.

import { ELEMENTS } from './elements.js';

export const SUBSTANCES = {};

function S(id, props) {
  const s = {
    id,
    phase: 'liquid',
    form: 'liquid',
    color: '#ffffff',
    opacity: 1,
    metalness: 0,
    roughness: 0.6,
    emissive: null,
    emissiveIntensity: 0,
    pH: null,
    density: 1,
    mp: null,
    bp: null,
    soluble: false,
    aq: null,
    hazards: [],
    info: '',
    ions: null,
    flame: null,
    flammable: false,
    ...props,
  };
  if (s.form === 'liquid' && props.opacity === undefined) s.opacity = 0.35;
  if (s.form === 'gas' && props.opacity === undefined) s.opacity = 0.08;
  if (s.phase === 'gas' && !props.form) s.form = 'gas';
  SUBSTANCES[id] = s;
  return s;
}

// Flame-test colours for metal ions.
export const FLAME_COLORS = {
  Li: '#ff2a3c', Na: '#ffb000', K: '#c58cff', Rb: '#d15cff', Cs: '#8a7dff',
  Ca: '#ff6a2a', Sr: '#ff1c2c', Ba: '#b8ff6a', Cu: '#2affb4', B: '#4dff6a',
  Mg: '#ffffff', Fe: '#ffcf8a', Zn: '#c8fff0', Pb: '#c8d8ff', Se: '#6fa8ff',
};

// --------------------------------------------------------------------------------------
// Elements in their natural form.

const METAL_LOOK = {
  Cu: ['#d6875a', 0.22], Au: ['#ffcc55', 0.18], Ag: ['#eceef2', 0.1], Pt: ['#dcdde0', 0.15],
  Cs: ['#e8cf86', 0.2], Bi: ['#d4c3d8', 0.25], Os: ['#a6b8cf', 0.2], Pb: ['#8e939c', 0.5],
  Fe: ['#a3a7ad', 0.4], Al: ['#d6d9de', 0.3], Mg: ['#cfd2d6', 0.35], Zn: ['#b9c0c9', 0.35],
  Ti: ['#aab0b7', 0.3], Cr: ['#d6dce4', 0.08], W: ['#8f949b', 0.35], Ni: ['#c9c3b5', 0.25],
  Sn: ['#d0d1d4', 0.3], Co: ['#a7a9ae', 0.3], Mn: ['#b7b4b0', 0.45], U: ['#8d908b', 0.45],
  Pu: ['#77797c', 0.5], Ca: ['#e2ded5', 0.45], Na: ['#dedfe2', 0.25], K: ['#d8d9de', 0.25],
  Li: ['#d0d1d6', 0.3], Ba: ['#d7d6cf', 0.35], Sr: ['#dad6c9', 0.35], Ga: ['#cfd3d9', 0.12],
  In: ['#c5c7cc', 0.2], Ge: ['#9ea3aa', 0.18], Sb: ['#c6c8cc', 0.2], Te: ['#babdc2', 0.22],
  As: ['#7a7d80', 0.35], Be: ['#bfc3c8', 0.35], Rb: ['#d6d4d8', 0.25], Fr: ['#cfcfcf', 0.3],
};

const ELEMENT_INFO = {
  H: 'The lightest element. A colourless, highly flammable gas.',
  He: 'An inert, colourless gas lighter than air. Makes voices squeaky.',
  C: 'Shown as graphite — soft, grey-black and slippery; the stuff in pencils.',
  N: 'Makes up 78 % of the air you breathe. Colourless and unreactive.',
  O: 'Colourless gas that supports combustion; 21 % of air.',
  F: 'The most reactive element: a pale yellow, extremely corrosive gas.',
  Ne: 'Inert gas that glows red-orange in neon signs.',
  Na: 'A soft metal you can cut with a knife. Reacts violently with water!',
  Mg: 'Light metal that burns with a blinding white flame.',
  Al: 'Light, corrosion-resistant metal used for cans and aircraft.',
  Si: 'A shiny blue-grey semiconductor — the heart of every computer chip.',
  P: 'Shown as red phosphorus (used on match boxes). White phosphorus ignites in air.',
  S: 'A bright yellow, brittle solid that smells when burned.',
  Cl: 'A toxic yellow-green gas used to disinfect water.',
  Ar: 'Inert gas used in light bulbs and welding.',
  K: 'Soft metal that bursts into lilac flames on water.',
  Ca: 'Metal found in bones, teeth and chalk.',
  Fe: 'The most common metal on Earth; rusts in moist air.',
  Cu: 'A reddish metal that conducts electricity extremely well.',
  Zn: 'Bluish metal used to galvanise steel.',
  Br: 'One of only two elements that are liquid at room temperature. Dense red-brown, fuming liquid.',
  Ag: 'The best electrical conductor of all metals.',
  Sn: 'Soft metal used in solder and tin plating.',
  I: 'Dark violet-black crystals that sublime into a purple vapour.',
  Xe: 'Heavy noble gas used in camera flashes and ion thrusters.',
  Au: 'Unreactive, beautiful and very dense. Never tarnishes.',
  Hg: 'The only metal that is liquid at room temperature. Toxic vapour!',
  Pb: 'Dense, soft, toxic metal.',
  U: 'Dense radioactive metal used as nuclear fuel.',
  Pu: 'Radioactive metal that is warm to the touch from its own decay.',
  Ra: 'Radioactive metal; radium compounds glow faintly in the dark.',
  Ga: 'A metal that melts in your hand (29.8 °C).',
  Cs: 'Golden, extremely reactive metal. Melts at 28.5 °C.',
};

const NONMETAL_LOOK = {
  C: { form: 'chunk', color: '#2a2b2e', metalness: 0.35, roughness: 0.55 },
  S: { form: 'powder', color: '#f3d43a', roughness: 0.85 },
  P: { form: 'powder', color: '#8e2b2b', roughness: 0.85, name: 'Phosphorus (red)' },
  Se: { form: 'chunk', color: '#5f5f66', metalness: 0.5, roughness: 0.3 },
  B: { form: 'powder', color: '#3b302a', roughness: 0.9 },
  Si: { form: 'chunk', color: '#5a6274', metalness: 0.7, roughness: 0.22 },
  I: { form: 'crystals', color: '#2b1b38', metalness: 0.55, roughness: 0.25 },
  At: { form: 'chunk', color: '#1e1e22', metalness: 0.4, roughness: 0.4 },
};

const GAS_COLORS = { F: ['#eef39a', 0.18], Cl: ['#c6e65a', 0.32] };

const RADIOACTIVE = new Set(['Tc', 'Pm', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U']);

for (const el of ELEMENTS) {
  const id = 'elem:' + el.symbol;
  const radioactive = RADIOACTIVE.has(el.symbol) || el.z >= 93;
  const hazards = radioactive ? ['radioactive'] : [];
  const mp = el.meltingPoint !== null ? +(el.meltingPoint - 273.15).toFixed(1) : null;
  const bp = el.boilingPoint !== null ? +(el.boilingPoint - 273.15).toFixed(1) : null;
  const formula = el.diatomic ? el.symbol + '2' : el.symbol;
  const base = {
    name: el.name,
    formula,
    element: el.symbol,
    mp,
    bp,
    density: el.density ?? 10,
    hazards,
    info: ELEMENT_INFO[el.symbol] || `${el.name} (${el.categoryName.toLowerCase()}).`,
    flame: FLAME_COLORS[el.symbol] || null,
  };
  if (el.z >= 100) {
    base.info = `Only a handful of ${el.name} atoms have ever been made — they decay within ` +
      `seconds or less. What you see is the predicted metallic appearance.`;
  }
  if (el.category === 'NG' || (el.state === 'g' && !el.diatomic)) {
    S(id, { ...base, phase: 'gas', form: 'gas', color: '#ffffff', opacity: 0.05 });
  } else if (el.state === 'g') {
    const [color, opacity] = GAS_COLORS[el.symbol] || ['#ffffff', 0.05];
    S(id, { ...base, phase: 'gas', form: 'gas', color, opacity });
  } else if (el.symbol === 'Br') {
    S(id, { ...base, phase: 'liquid', form: 'liquid', color: '#7a1606', opacity: 0.94, hazards: ['toxic', 'corrosive'] });
  } else if (el.symbol === 'Hg') {
    S(id, { ...base, phase: 'liquid', form: 'liquid', color: '#d9dbe0', opacity: 1, metalness: 1, roughness: 0.05, hazards: ['toxic'] });
  } else if (NONMETAL_LOOK[el.symbol]) {
    S(id, { ...base, phase: 'solid', ...NONMETAL_LOOK[el.symbol] });
  } else {
    const [color, roughness] = METAL_LOOK[el.symbol] || ['#b9bcc2', 0.3];
    const s = S(id, { ...base, phase: 'solid', form: 'metal', color, metalness: 1, roughness });
    if (['Ra', 'Ac'].includes(el.symbol)) { s.emissive = '#7fd8ff'; s.emissiveIntensity = 0.35; }
    if (['Li', 'Na', 'K', 'Rb', 'Cs', 'Fr'].includes(el.symbol)) s.reactsWithWater = el.symbol;
    if (['Ca', 'Sr', 'Ba'].includes(el.symbol)) s.reactsWithWater = el.symbol;
    if (['Mg', 'Zn', 'Fe', 'Al', 'Sn', 'Ni', 'Ca', 'Mn', 'Cr', 'Co', 'Cd', 'Pb', 'Be', 'Sr', 'Ba', 'Ga', 'In', 'Ti'].includes(el.symbol)) s.reactsWithAcid = el.symbol;
  }
}

// --------------------------------------------------------------------------------------
// Water and simple liquids.

const WATER = { color: '#d6ecff', opacity: 0.16 };

S('water', { name: 'Water', formula: 'H2O', smiles: 'O', ...WATER, pH: 7, mp: 0, bp: 100, density: 1,
  info: 'Pure water. Covers 71 % of Earth and makes up about 60 % of your body.' });
S('hydrogen_peroxide', { name: 'Hydrogen peroxide', formula: 'H2O2', smiles: 'OO', color: '#dce9ff', opacity: 0.2,
  pH: 6.2, mp: -0.4, bp: 150, density: 1.45, hazards: ['oxidizer', 'corrosive'],
  info: 'A pale-blue liquid and strong oxidiser. Decomposes into water and oxygen.' });

// Acids (the machine dissolves gaseous acids in water, as they are sold in the lab).
S('hydrochloric_acid', { name: 'Hydrochloric acid', formula: 'HCl', smiles: 'Cl', ...WATER, pH: 0, bp: 48, mp: -26,
  density: 1.18, hazards: ['corrosive'], ions: { cation: 'H', anion: 'Cl' }, acid: true,
  info: 'Hydrogen chloride gas dissolved in water (37 %). Strong, fuming acid found in your stomach.' });
S('hydrofluoric_acid', { name: 'Hydrofluoric acid', formula: 'HF', smiles: 'F', ...WATER, pH: 2, bp: 20, density: 1.15,
  hazards: ['corrosive', 'toxic'], ions: { cation: 'H', anion: 'F' }, acid: true, etchesGlass: true,
  info: 'A weak acid that dissolves glass! Store it in plastic. Extremely dangerous to skin.' });
S('hydrobromic_acid', { name: 'Hydrobromic acid', formula: 'HBr', smiles: 'Br', ...WATER, pH: 0, density: 1.49,
  hazards: ['corrosive'], ions: { cation: 'H', anion: 'Br' }, acid: true, info: 'Hydrogen bromide in water — a very strong acid.' });
S('hydroiodic_acid', { name: 'Hydroiodic acid', formula: 'HI', smiles: 'I', color: '#f7efc8', opacity: 0.3, pH: 0, density: 1.7,
  hazards: ['corrosive'], ions: { cation: 'H', anion: 'I' }, acid: true, info: 'The strongest of the hydrohalic acids.' });
S('sulfuric_acid', { name: 'Sulfuric acid', formula: 'H2SO4', smiles: 'OS(=O)(=O)O', color: '#f6f3e6', opacity: 0.3, pH: 0,
  mp: 10, bp: 337, density: 1.83, hazards: ['corrosive'], ions: { cation: 'H', anion: 'SO4' }, acid: true,
  info: 'Concentrated sulfuric acid: an oily, dense liquid that chars sugar and paper.' });
S('nitric_acid', { name: 'Nitric acid', formula: 'HNO3', smiles: 'ON(=O)=O', color: '#fff4c4', opacity: 0.3, pH: 0,
  mp: -42, bp: 83, density: 1.51, hazards: ['corrosive', 'oxidizer'], ions: { cation: 'H', anion: 'NO3' }, acid: true,
  info: 'A fuming, strongly oxidising acid that turns yellow with age.' });
S('phosphoric_acid', { name: 'Phosphoric acid', formula: 'H3PO4', smiles: 'OP(=O)(O)O', color: '#fbfaf2', opacity: 0.35, pH: 1,
  density: 1.69, hazards: ['corrosive'], ions: { cation: 'H', anion: 'PO4' }, acid: true, info: 'A syrupy acid used in cola drinks and rust removers.' });
S('carbonic_acid', { name: 'Carbonic acid', formula: 'H2CO3', smiles: 'OC(=O)O', ...WATER, pH: 4,
  info: 'CO₂ dissolved in water — what makes soda fizzy and slightly sour.' });
S('acetic_acid', { name: 'Acetic acid', formula: 'CH3COOH', smiles: 'CC(=O)O', ...WATER, pH: 2.4, mp: 16.6, bp: 118,
  density: 1.05, hazards: ['corrosive', 'flammable'], ions: { cation: 'H', anion: 'CH3COO' }, acid: true, weakAcid: true,
  info: 'Glacial acetic acid. Diluted to 5 % it is vinegar.' });
S('formic_acid', { name: 'Formic acid', formula: 'HCOOH', smiles: 'OC=O', ...WATER, pH: 2.2, bp: 101, density: 1.22,
  hazards: ['corrosive'], ions: { cation: 'H', anion: 'HCOO' }, acid: true, weakAcid: true,
  info: 'The acid in ant stings and nettles.' });
S('hydrogen_cyanide', { name: 'Hydrogen cyanide', formula: 'HCN', smiles: 'C#N', ...WATER, pH: 5, bp: 26, density: 0.69,
  hazards: ['toxic', 'flammable'], info: 'Extremely poisonous; smells faintly of bitter almonds.' });

// Bases
S('ammonia', { name: 'Ammonia solution', formula: 'NH3', smiles: 'N', ...WATER, pH: 11.6, bp: 38, density: 0.9,
  hazards: ['corrosive'], ions: { cation: 'NH4', anion: 'OH' }, base: true,
  info: 'Ammonia gas dissolved in water. Pungent; used in cleaning products.' });
S('hydrazine', { name: 'Hydrazine', formula: 'N2H4', smiles: 'NN', ...WATER, pH: 10, bp: 114, density: 1.02,
  hazards: ['toxic', 'flammable'], info: 'A rocket fuel. Fuming, toxic liquid.' });

// Organic liquids
S('methanol', { name: 'Methanol', formula: 'CH3OH', smiles: 'CO', ...WATER, mp: -98, bp: 64.7, density: 0.79, flammable: true,
  hazards: ['flammable', 'toxic'], info: 'Wood alcohol. Burns with an almost invisible blue flame. Poisonous.' });
S('ethanol', { name: 'Ethanol', formula: 'C2H5OH', smiles: 'CCO', ...WATER, mp: -114, bp: 78.4, density: 0.79, flammable: true,
  hazards: ['flammable'], info: 'The alcohol in drinks; also a fuel and a disinfectant.' });
S('propanol', { name: '1-Propanol', formula: 'C3H7OH', smiles: 'CCCO', ...WATER, bp: 97, density: 0.8, flammable: true, hazards: ['flammable'],
  info: 'A solvent alcohol.' });
S('isopropanol', { name: 'Isopropyl alcohol', formula: 'C3H7OH', smiles: 'CC(C)O', ...WATER, bp: 82.5, density: 0.79, flammable: true,
  hazards: ['flammable'], info: 'Rubbing alcohol.' });
S('acetone', { name: 'Acetone', formula: 'C3H6O', smiles: 'CC(=O)C', ...WATER, mp: -95, bp: 56, density: 0.78, flammable: true,
  hazards: ['flammable'], info: 'Nail-polish remover; evaporates very quickly.' });
S('acetaldehyde', { name: 'Acetaldehyde', formula: 'C2H4O', smiles: 'CC=O', ...WATER, bp: 20.2, density: 0.79, flammable: true,
  hazards: ['flammable', 'toxic'], info: 'Fruity-smelling liquid that boils at 20 °C.' });
S('formaldehyde', { name: 'Formalin', formula: 'CH2O', smiles: 'C=O', ...WATER, pH: 4, density: 1.09, hazards: ['toxic'],
  info: 'Formaldehyde gas dissolved in water — used to preserve specimens.' });
S('benzene', { name: 'Benzene', formula: 'C6H6', smiles: 'C1=CC=CC=C1', ...WATER, mp: 5.5, bp: 80, density: 0.88, flammable: true,
  hazards: ['flammable', 'toxic'], info: 'The classic aromatic ring with six delocalised π-electrons.' });
S('toluene', { name: 'Toluene', formula: 'C7H8', smiles: 'CC1=CC=CC=C1', ...WATER, bp: 111, density: 0.87, flammable: true,
  hazards: ['flammable'], info: 'Solvent used in paint thinners.' });
S('phenol', { name: 'Phenol', formula: 'C6H5OH', smiles: 'OC1=CC=CC=C1', phase: 'solid', form: 'crystals', color: '#f4efe6',
  roughness: 0.4, mp: 41, bp: 182, density: 1.07, pH: 5.5, soluble: true, hazards: ['toxic', 'corrosive'],
  info: 'Colourless crystals; the first antiseptic used in surgery.' });
S('cyclohexane', { name: 'Cyclohexane', formula: 'C6H12', smiles: 'C1CCCCC1', ...WATER, bp: 80.7, density: 0.78, flammable: true,
  hazards: ['flammable'], info: 'A ring of six carbons in the "chair" shape.' });
S('pentane', { name: 'Pentane', formula: 'C5H12', smiles: 'CCCCC', ...WATER, bp: 36, density: 0.63, flammable: true, hazards: ['flammable'],
  info: 'A very volatile hydrocarbon.' });
S('hexane', { name: 'Hexane', formula: 'C6H14', smiles: 'CCCCCC', ...WATER, bp: 69, density: 0.66, flammable: true, hazards: ['flammable'],
  info: 'Non-polar solvent; does not mix with water.' });
S('octane', { name: 'Octane', formula: 'C8H18', smiles: 'CCCCCCCC', ...WATER, bp: 125, density: 0.7, flammable: true, hazards: ['flammable'],
  info: 'A main component of petrol.' });
S('diethyl_ether', { name: 'Diethyl ether', formula: 'C4H10O', smiles: 'CCOCC', ...WATER, bp: 34.6, density: 0.71, flammable: true,
  hazards: ['flammable'], info: 'Historic anaesthetic; extremely flammable vapour.' });
S('dimethyl_ether', { name: 'Dimethyl ether', formula: 'C2H6O', smiles: 'COC', phase: 'gas', form: 'gas', color: '#ffffff', opacity: 0.05, heavy: true, flammable: true,
  hazards: ['flammable'], info: 'An isomer of ethanol (same formula C₂H₆O) — but a gas used as aerosol propellant.' });
S('ethyl_acetate', { name: 'Ethyl acetate', formula: 'C4H8O2', smiles: 'CCOC(=O)C', ...WATER, bp: 77, density: 0.9, flammable: true,
  hazards: ['flammable'], info: 'Sweet, fruity-smelling solvent.' });
S('chloroform', { name: 'Chloroform', formula: 'CHCl3', smiles: 'ClC(Cl)Cl', ...WATER, bp: 61, density: 1.49, hazards: ['toxic'],
  info: 'Dense, sweet-smelling solvent; once used as an anaesthetic.' });
S('dichloromethane', { name: 'Dichloromethane', formula: 'CH2Cl2', smiles: 'ClCCl', ...WATER, bp: 39.6, density: 1.33, hazards: ['toxic'],
  info: 'A common lab solvent.' });
S('carbon_tetrachloride', { name: 'Carbon tetrachloride', formula: 'CCl4', smiles: 'ClC(Cl)(Cl)Cl', ...WATER, bp: 76.7, density: 1.59,
  hazards: ['toxic'], info: 'A tetrahedral molecule; former fire-extinguisher fluid.' });
S('carbon_disulfide', { name: 'Carbon disulfide', formula: 'CS2', smiles: 'S=C=S', color: '#fbf7dc', opacity: 0.3, bp: 46, density: 1.26,
  flammable: true, hazards: ['flammable', 'toxic'], info: 'Linear like CO₂, but a liquid.' });
S('ethylene_glycol', { name: 'Ethylene glycol', formula: 'C2H6O2', smiles: 'OCCO', ...WATER, bp: 197, density: 1.11, hazards: ['toxic'],
  info: 'Antifreeze. Sweet-tasting but poisonous.' });
S('glycerol', { name: 'Glycerol', formula: 'C3H8O3', smiles: 'OCC(O)CO', color: '#fbfbf4', opacity: 0.3, bp: 290, density: 1.26,
  info: 'Thick, sweet, syrupy liquid used in soaps.' });
S('nitromethane', { name: 'Nitromethane', formula: 'CH3NO2', smiles: 'CN(=O)=O', ...WATER, bp: 101, density: 1.14, flammable: true,
  hazards: ['flammable'], info: 'Drag-racing fuel.' });
S('sulfur_trioxide', { name: 'Sulfur trioxide', formula: 'SO3', smiles: 'O=S(=O)=O', color: '#fbfaf3', opacity: 0.45, mp: 16.9, bp: 45,
  density: 1.92, hazards: ['corrosive'], info: 'Fuming liquid; reacts violently with water to give sulfuric acid.' });
S('bleach', { name: 'Sodium hypochlorite', formula: 'NaClO', smiles: '[Na]OCl', color: '#f2f7cf', opacity: 0.3, pH: 11.5, density: 1.1,
  hazards: ['corrosive', 'oxidizer'], ions: { cation: 'Na', anion: 'ClO' }, info: 'Household bleach (in water).' });

// --------------------------------------------------------------------------------------
// Gases

const GAS = { phase: 'gas', form: 'gas', color: '#ffffff', opacity: 0.05 };
S('carbon_dioxide', { name: 'Carbon dioxide', formula: 'CO2', smiles: 'O=C=O', ...GAS, heavy: true, bp: -78.5,
  info: 'Heavier than air — it pours like water and puts out flames.' });
S('carbon_monoxide', { name: 'Carbon monoxide', formula: 'CO', smiles: '[C]=O', ...GAS, hazards: ['toxic', 'flammable'],
  info: 'Colourless, odourless and deadly. Has a triple bond C≡O.' });
S('methane', { name: 'Methane', formula: 'CH4', smiles: 'C', ...GAS, light: true, flammable: true, hazards: ['flammable'],
  info: 'Natural gas. A perfect tetrahedron.' });
S('ethane', { name: 'Ethane', formula: 'C2H6', smiles: 'CC', ...GAS, flammable: true, hazards: ['flammable'], info: 'Two carbons joined by a single bond.' });
S('propane', { name: 'Propane', formula: 'C3H8', smiles: 'CCC', ...GAS, heavy: true, flammable: true, hazards: ['flammable'], info: 'Barbecue gas.' });
S('butane', { name: 'Butane', formula: 'C4H10', smiles: 'CCCC', ...GAS, heavy: true, flammable: true, hazards: ['flammable'], info: 'Lighter fuel.' });
S('ethene', { name: 'Ethene', formula: 'C2H4', smiles: 'C=C', ...GAS, flammable: true, hazards: ['flammable'],
  info: 'Ethylene: a flat molecule with a C=C double bond. Ripens fruit.' });
S('ethyne', { name: 'Ethyne', formula: 'C2H2', smiles: 'C#C', ...GAS, flammable: true, hazards: ['flammable'],
  info: 'Acetylene: a linear molecule with a C≡C triple bond. Welding gas.' });
S('hydrogen_sulfide', { name: 'Hydrogen sulfide', formula: 'H2S', smiles: 'S', ...GAS, heavy: true, hazards: ['toxic', 'flammable'],
  info: 'Smells of rotten eggs. Bent like water.' });
S('sulfur_dioxide', { name: 'Sulfur dioxide', formula: 'SO2', smiles: 'O=S=O', ...GAS, heavy: true, hazards: ['toxic'],
  info: 'The sharp smell of a struck match.' });
S('nitric_oxide', { name: 'Nitric oxide', formula: 'NO', smiles: '[N]=O', ...GAS, hazards: ['toxic'],
  info: 'A radical with an unpaired electron; turns brown in air.' });
S('nitrogen_dioxide', { name: 'Nitrogen dioxide', formula: 'NO2', smiles: 'O=[N]=O', phase: 'gas', form: 'gas', color: '#9a3c12',
  opacity: 0.45, heavy: true, hazards: ['toxic', 'oxidizer'], info: 'A toxic reddish-brown gas — the colour of smog.' });
S('nitrous_oxide', { name: 'Nitrous oxide', formula: 'N2O', smiles: 'N#N=O', ...GAS, heavy: true, info: 'Laughing gas.' });
S('chloromethane', { name: 'Chloromethane', formula: 'CH3Cl', smiles: 'CCl', ...GAS, heavy: true, hazards: ['toxic'], info: 'A refrigerant gas.' });
S('silane', { name: 'Silane', formula: 'SiH4', smiles: '[SiH4]', ...GAS, hazards: ['flammable'], flammable: true,
  info: 'Ignites spontaneously in air.' });
S('phosphine', { name: 'Phosphine', formula: 'PH3', smiles: 'P', ...GAS, hazards: ['toxic'], info: 'A very toxic gas with a garlic smell.' });
S('sulfur_hexafluoride', { name: 'Sulfur hexafluoride', formula: 'SF6', smiles: 'FS(F)(F)(F)(F)F', ...GAS, heavy: true,
  info: 'Five times denser than air — breathe it and your voice gets deep. An octahedral molecule.' });
S('nh4cl_smoke', { name: 'Ammonium chloride smoke', formula: 'NH4Cl', ...GAS, color: '#ffffff', opacity: 0.4 });

// --------------------------------------------------------------------------------------
// Solids — salts, oxides, hydroxides.

const WHITE_CRYSTALS = { phase: 'solid', form: 'crystals', color: '#f4f6f8', roughness: 0.25 };
const WHITE_POWDER = { phase: 'solid', form: 'powder', color: '#f2f2ef', roughness: 0.9 };

function salt(id, name, formula, smiles, cation, anion, look, extra = {}) {
  return S(id, { name, formula, smiles, ...look, ions: { cation, anion }, flame: FLAME_COLORS[cation] || null, ...extra });
}

// Soluble salts and their solutions.
salt('nacl', 'Sodium chloride', 'NaCl', '[Na]Cl', 'Na', 'Cl', WHITE_CRYSTALS, { mp: 801, density: 2.16, soluble: true, aq: 'nacl_aq',
  cubic: true, info: 'Table salt. Forms perfect cubic crystals.' });
salt('kcl', 'Potassium chloride', 'KCl', '[K]Cl', 'K', 'Cl', WHITE_CRYSTALS, { mp: 770, density: 1.98, soluble: true, aq: 'kcl_aq', cubic: true,
  info: 'Salt substitute.' });
salt('licl', 'Lithium chloride', 'LiCl', '[Li]Cl', 'Li', 'Cl', WHITE_CRYSTALS, { soluble: true, aq: 'licl_aq', density: 2.07, info: 'Very hygroscopic salt.' });
salt('naf', 'Sodium fluoride', 'NaF', '[Na]F', 'Na', 'F', WHITE_POWDER, { soluble: true, aq: 'naf_aq', density: 2.56, hazards: ['toxic'], info: 'Used in toothpaste.' });
salt('nabr', 'Sodium bromide', 'NaBr', '[Na]Br', 'Na', 'Br', WHITE_CRYSTALS, { soluble: true, aq: 'nabr_aq', density: 3.21, info: 'A white salt.' });
salt('nai', 'Sodium iodide', 'NaI', '[Na]I', 'Na', 'I', WHITE_CRYSTALS, { soluble: true, aq: 'nai_aq', density: 3.67, info: 'Used in radiation detectors.' });
salt('kbr', 'Potassium bromide', 'KBr', '[K]Br', 'K', 'Br', WHITE_CRYSTALS, { soluble: true, aq: 'kbr_aq', density: 2.74, info: 'Old sedative.' });
salt('ki', 'Potassium iodide', 'KI', '[K]I', 'K', 'I', WHITE_CRYSTALS, { soluble: true, aq: 'ki_aq', density: 3.12, catalystH2O2: true,
  info: 'Protects the thyroid from radioactive iodine. Catalyses H₂O₂ decomposition.' });
salt('naoh', 'Sodium hydroxide', 'NaOH', '[Na]O', 'Na', 'OH', { phase: 'solid', form: 'pellets', color: '#f7f7f4', roughness: 0.35 },
  { soluble: true, aq: 'naoh_aq', mp: 318, density: 2.13, hazards: ['corrosive'], dissolveHeat: 25, info: 'Caustic soda: white pellets that get hot when dissolved.' });
salt('koh', 'Potassium hydroxide', 'KOH', '[K]O', 'K', 'OH', { phase: 'solid', form: 'pellets', color: '#f5f5f1', roughness: 0.35 },
  { soluble: true, aq: 'koh_aq', density: 2.12, hazards: ['corrosive'], dissolveHeat: 25, info: 'Caustic potash.' });
salt('lioh', 'Lithium hydroxide', 'LiOH', '[Li]O', 'Li', 'OH', WHITE_POWDER, { soluble: true, aq: 'lioh_aq', density: 1.46, hazards: ['corrosive'],
  info: 'Used to scrub CO₂ in spacecraft.' });
salt('nahco3', 'Sodium bicarbonate', 'NaHCO3', '[Na]OC(=O)O', 'Na', 'HCO3', WHITE_POWDER, { soluble: true, aq: 'nahco3_aq', density: 2.2,
  carbonate: true, info: 'Baking soda. Fizzes with acids.' });
salt('na2co3', 'Sodium carbonate', 'Na2CO3', '[Na]OC(=O)O[Na]', 'Na', 'CO3', WHITE_POWDER, { soluble: true, aq: 'na2co3_aq', density: 2.54,
  carbonate: true, info: 'Washing soda.' });
salt('caco3', 'Calcium carbonate', 'CaCO3', '[Ca]1OC(=O)O1', 'Ca', 'CO3', WHITE_POWDER, { density: 2.71, carbonate: true,
  info: 'Chalk, limestone, marble and seashells.' });
salt('cao', 'Calcium oxide', 'CaO', '[Ca]=O', 'Ca', 'O', WHITE_POWDER, { density: 3.34, slakes: true, info: 'Quicklime. Gets very hot with water.' });
salt('caoh2', 'Calcium hydroxide', 'Ca(OH)2', 'O[Ca]O', 'Ca', 'OH', WHITE_POWDER, { soluble: true, aq: 'caoh2_aq', density: 2.21,
  info: 'Slaked lime. Its solution (limewater) turns milky with CO₂.' });
salt('cacl2', 'Calcium chloride', 'CaCl2', 'Cl[Ca]Cl', 'Ca', 'Cl', { phase: 'solid', form: 'pellets', color: '#f6f6f2', roughness: 0.6 },
  { soluble: true, aq: 'cacl2_aq', density: 2.15, dissolveHeat: 15, info: 'Road de-icing salt.' });
salt('caf2', 'Calcium fluoride', 'CaF2', 'F[Ca]F', 'Ca', 'F', { phase: 'solid', form: 'crystals', color: '#c7b2f0', roughness: 0.2 },
  { density: 3.18, info: 'The mineral fluorite — glows under UV light.' });
salt('caso4', 'Calcium sulfate', 'CaSO4', '[Ca]1OS(=O)(=O)O1', 'Ca', 'SO4', WHITE_POWDER, { density: 2.96, info: 'Gypsum / plaster of Paris.' });
salt('mgo', 'Magnesium oxide', 'MgO', '[Mg]=O', 'Mg', 'O', WHITE_POWDER, { density: 3.58, info: 'The white ash left when magnesium burns.' });
salt('mgoh2', 'Magnesium hydroxide', 'Mg(OH)2', 'O[Mg]O', 'Mg', 'OH', WHITE_POWDER, { density: 2.34, info: 'Milk of magnesia (an antacid).' });
salt('mgcl2', 'Magnesium chloride', 'MgCl2', 'Cl[Mg]Cl', 'Mg', 'Cl', WHITE_CRYSTALS, { soluble: true, aq: 'mgcl2_aq', density: 2.32, info: 'Found in sea water.' });
salt('mgso4', 'Magnesium sulfate', 'MgSO4', '[Mg]1OS(=O)(=O)O1', 'Mg', 'SO4', WHITE_CRYSTALS, { soluble: true, aq: 'mgso4_aq', density: 2.66,
  info: 'Epsom salt.' });
salt('na2so4', 'Sodium sulfate', 'Na2SO4', '[Na]OS(=O)(=O)O[Na]', 'Na', 'SO4', WHITE_POWDER, { soluble: true, aq: 'na2so4_aq', density: 2.66,
  info: 'Used in detergents.' });
salt('na2o', 'Sodium oxide', 'Na2O', '[Na]O[Na]', 'Na', 'O', WHITE_POWDER, { density: 2.27, slakes: true, hazards: ['corrosive'],
  info: 'Reacts with water to form sodium hydroxide.' });
salt('k2o', 'Potassium oxide', 'K2O', '[K]O[K]', 'K', 'O', { ...WHITE_POWDER, color: '#f3efd9' }, { density: 2.35, slakes: true,
  hazards: ['corrosive'], info: 'Reacts violently with water.' });
salt('kno3', 'Potassium nitrate', 'KNO3', '[K]ON(=O)=O', 'K', 'NO3', WHITE_CRYSTALS, { soluble: true, aq: 'kno3_aq', density: 2.11,
  hazards: ['oxidizer'], info: 'Saltpetre — an ingredient of gunpowder.' });
salt('nano3', 'Sodium nitrate', 'NaNO3', '[Na]ON(=O)=O', 'Na', 'NO3', WHITE_CRYSTALS, { soluble: true, aq: 'nano3_aq', density: 2.26,
  hazards: ['oxidizer'], info: 'Chile saltpetre, a fertiliser.' });
salt('nh4cl', 'Ammonium chloride', 'NH4Cl', '[NH4]Cl', 'NH4', 'Cl', WHITE_CRYSTALS, { soluble: true, aq: 'nh4cl_aq', density: 1.53, pH: 5,
  dissolveHeat: -8, info: 'Sal ammoniac. Dissolving it makes water colder.' });
salt('agcl', 'Silver chloride', 'AgCl', '[Ag]Cl', 'Ag', 'Cl', WHITE_POWDER, { density: 5.56, info: 'White precipitate that darkens in light.' });
salt('agbr', 'Silver bromide', 'AgBr', '[Ag]Br', 'Ag', 'Br', { ...WHITE_POWDER, color: '#f3ecc8' }, { density: 6.47, info: 'Light-sensitive salt of photographic film.' });
salt('agi', 'Silver iodide', 'AgI', '[Ag]I', 'Ag', 'I', { ...WHITE_POWDER, color: '#f1e07a' }, { density: 5.68, info: 'Used for cloud seeding.' });
salt('agno3', 'Silver nitrate', 'AgNO3', '[Ag]ON(=O)=O', 'Ag', 'NO3', WHITE_CRYSTALS, { soluble: true, aq: 'agno3_aq', density: 4.35,
  hazards: ['corrosive', 'oxidizer'], info: 'Stains skin black. Detects halide ions.' });
salt('kmno4', 'Potassium permanganate', 'KMnO4', '[K]O[Mn](=O)(=O)=O', 'K', 'MnO4', { phase: 'solid', form: 'crystals', color: '#2e0c2e',
  metalness: 0.5, roughness: 0.2 }, { soluble: true, aq: 'kmno4_aq', density: 2.7, hazards: ['oxidizer'],
  info: 'Near-black crystals with a metallic sheen that give an intense purple solution.' });
salt('k2cr2o7', 'Potassium dichromate', 'K2Cr2O7', '[K]O[Cr](=O)(=O)O[Cr](=O)(=O)O[K]', 'K', 'Cr2O7',
  { phase: 'solid', form: 'crystals', color: '#ff5a0a', roughness: 0.25 }, { soluble: true, aq: 'k2cr2o7_aq', density: 2.68,
  hazards: ['toxic', 'oxidizer'], info: 'Bright orange crystals.' });
salt('cuso4', 'Copper(II) sulfate', 'CuSO4', '[Cu]1OS(=O)(=O)O1', 'Cu', 'SO4', { ...WHITE_POWDER, color: '#e3e6e2' },
  { soluble: true, aq: 'cuso4_aq', density: 3.6, info: 'Anhydrous copper sulfate is off-white — add water and it turns brilliant blue!' });
salt('cuo', 'Copper(II) oxide', 'CuO', '[Cu]=O', 'Cu', 'O', { ...WHITE_POWDER, color: '#1d1b1a' }, { density: 6.31, info: 'Black powder.' });
salt('cu2o', 'Copper(I) oxide', 'Cu2O', '[Cu]O[Cu]', 'Cu', 'O', { ...WHITE_POWDER, color: '#9a2414' }, { density: 6.0, info: 'Red powder.' });
salt('cucl2', 'Copper(II) chloride', 'CuCl2', 'Cl[Cu]Cl', 'Cu', 'Cl', { ...WHITE_POWDER, color: '#9c7a2d' }, { soluble: true, aq: 'cucl2_aq',
  density: 3.39, info: 'Yellow-brown powder; its solution is green-blue.' });
salt('cuoh2', 'Copper(II) hydroxide', 'Cu(OH)2', 'O[Cu]O', 'Cu', 'OH', { ...WHITE_POWDER, color: '#3c8fd8' }, { density: 3.37,
  info: 'A pale blue precipitate.' });
salt('fe2o3', 'Iron(III) oxide', 'Fe2O3', 'O=[Fe]O[Fe]=O', 'Fe', 'O', { ...WHITE_POWDER, color: '#7d2a12' }, { density: 5.24, info: 'Rust!' });
salt('feo', 'Iron(II) oxide', 'FeO', '[Fe]=O', 'Fe', 'O', { ...WHITE_POWDER, color: '#1f1a17' }, { density: 5.74, info: 'Black powder.' });
salt('fecl3', 'Iron(III) chloride', 'FeCl3', 'Cl[Fe](Cl)Cl', 'Fe', 'Cl', { phase: 'solid', form: 'crystals', color: '#3a2412', metalness: 0.3,
  roughness: 0.3 }, { soluble: true, aq: 'fecl3_aq', density: 2.9, hazards: ['corrosive'], info: 'Etches copper circuit boards.' });
salt('fecl2', 'Iron(II) chloride', 'FeCl2', 'Cl[Fe]Cl', 'Fe', 'Cl', { ...WHITE_POWDER, color: '#d8dcb8' }, { soluble: true, aq: 'fecl2_aq', density: 3.16,
  info: 'Pale green-white solid.' });
salt('feso4', 'Iron(II) sulfate', 'FeSO4', '[Fe]1OS(=O)(=O)O1', 'Fe', 'SO4', { phase: 'solid', form: 'crystals', color: '#a8d9b0',
  roughness: 0.3 }, { soluble: true, aq: 'feso4_aq', density: 2.84, info: 'Green vitriol.' });
salt('feoh3', 'Iron(III) hydroxide', 'Fe(OH)3', 'O[Fe](O)O', 'Fe', 'OH', { ...WHITE_POWDER, color: '#8a4515' }, { density: 3.4,
  info: 'Rust-brown gelatinous precipitate.' });
salt('zno', 'Zinc oxide', 'ZnO', '[Zn]=O', 'Zn', 'O', WHITE_POWDER, { density: 5.61, info: 'White pigment and sunscreen.' });
salt('zncl2', 'Zinc chloride', 'ZnCl2', 'Cl[Zn]Cl', 'Zn', 'Cl', WHITE_CRYSTALS, { soluble: true, aq: 'zncl2_aq', density: 2.91, info: 'Used in batteries.' });
salt('zns', 'Zinc sulfide', 'ZnS', '[Zn]=S', 'Zn', 'S', WHITE_POWDER, { density: 4.09, info: 'Glow-in-the-dark pigment.' });
salt('znso4', 'Zinc sulfate', 'ZnSO4', '[Zn]1OS(=O)(=O)O1', 'Zn', 'SO4', WHITE_CRYSTALS, { soluble: true, aq: 'znso4_aq', density: 3.54,
  info: 'White vitriol.' });
salt('al2o3', 'Aluminium oxide', 'Al2O3', 'O=[Al]O[Al]=O', 'Al', 'O', WHITE_POWDER, { density: 3.95, info: 'Corundum — sapphire and ruby are coloured forms.' });
salt('alcl3', 'Aluminium chloride', 'AlCl3', 'Cl[Al](Cl)Cl', 'Al', 'Cl', { ...WHITE_POWDER, color: '#f4f2e2' }, { soluble: true, aq: 'alcl3_aq',
  density: 2.48, hazards: ['corrosive'], info: 'Fumes in moist air.' });
salt('pbno32', 'Lead(II) nitrate', 'Pb(NO3)2', 'O=N(=O)O[Pb]ON(=O)=O', 'Pb', 'NO3', WHITE_CRYSTALS, { soluble: true, aq: 'pbno32_aq',
  density: 4.53, hazards: ['toxic', 'oxidizer'], info: 'Mix its solution with potassium iodide for "golden rain".' });
salt('pbi2', 'Lead(II) iodide', 'PbI2', 'I[Pb]I', 'Pb', 'I', { ...WHITE_POWDER, color: '#f7c613', roughness: 0.5 }, { density: 6.16,
  hazards: ['toxic'], info: 'A brilliant yellow precipitate.' });
salt('baso4', 'Barium sulfate', 'BaSO4', '[Ba]1OS(=O)(=O)O1', 'Ba', 'SO4', WHITE_POWDER, { density: 4.5, info: 'Swallowed for X-ray imaging.' });
salt('bacl2', 'Barium chloride', 'BaCl2', 'Cl[Ba]Cl', 'Ba', 'Cl', WHITE_CRYSTALS, { soluble: true, aq: 'bacl2_aq', density: 3.86,
  hazards: ['toxic'], info: 'Tests for sulfate ions.' });
salt('srcl2', 'Strontium chloride', 'SrCl2', 'Cl[Sr]Cl', 'Sr', 'Cl', WHITE_CRYSTALS, { soluble: true, aq: 'srcl2_aq', density: 3.05,
  info: 'Gives fireworks their red colour.' });
salt('cocl2', 'Cobalt(II) chloride', 'CoCl2', 'Cl[Co]Cl', 'Co', 'Cl', { ...WHITE_POWDER, color: '#2f5fd0' }, { soluble: true, aq: 'cocl2_aq',
  density: 3.36, hazards: ['toxic'], info: 'Blue when dry, pink when wet — a humidity indicator.' });
salt('nicl2', 'Nickel(II) chloride', 'NiCl2', 'Cl[Ni]Cl', 'Ni', 'Cl', { ...WHITE_POWDER, color: '#c8b85a' }, { soluble: true, aq: 'nicl2_aq',
  density: 3.55, hazards: ['toxic'], info: 'Yellow solid with a green solution.' });
salt('cr2o3', 'Chromium(III) oxide', 'Cr2O3', 'O=[Cr]O[Cr]=O', 'Cr', 'O', { ...WHITE_POWDER, color: '#2f6b2a' }, { density: 5.22,
  info: 'Green pigment.' });
salt('mno2', 'Manganese dioxide', 'MnO2', 'O=[Mn]=O', 'Mn', 'O', { ...WHITE_POWDER, color: '#1b1a1c' }, { density: 5.03, catalystH2O2: true,
  info: 'Black powder that makes hydrogen peroxide decompose violently.' });
salt('tio2', 'Titanium dioxide', 'TiO2', 'O=[Ti]=O', 'Ti', 'O', WHITE_POWDER, { density: 4.23, info: 'The whitest white pigment.' });
salt('sio2', 'Silicon dioxide', 'SiO2', 'O=[Si]=O', 'Si', 'O', { phase: 'solid', form: 'crystals', color: '#f3f1ea', roughness: 0.15 },
  { density: 2.65, info: 'Quartz / sand — what glass is made from.' });
salt('naac', 'Sodium acetate', 'CH3COONa', 'CC(=O)O[Na]', 'Na', 'CH3COO', WHITE_CRYSTALS, { soluble: true, aq: 'naac_aq', density: 1.53,
  info: 'The "hot ice" in reusable hand warmers.' });
salt('li2co3', 'Lithium carbonate', 'Li2CO3', '[Li]OC(=O)O[Li]', 'Li', 'CO3', WHITE_POWDER, { density: 2.11, carbonate: true,
  info: 'Used in lithium-ion batteries.' });

// Organic solids
S('glucose', { name: 'Glucose', formula: 'C6H12O6', smiles: 'OCC(O)C(O)C(O)C(O)C=O', ...WHITE_POWDER, soluble: true, aq: 'glucose_aq',
  density: 1.54, mp: 146, info: 'Blood sugar — the fuel of your cells.' });
S('urea', { name: 'Urea', formula: 'CH4N2O', smiles: 'NC(=O)N', ...WHITE_CRYSTALS, soluble: true, aq: 'urea_aq', density: 1.32, mp: 133,
  dissolveHeat: -6, info: 'The first organic compound made from inorganic chemicals (Wöhler, 1828).' });
S('glycine', { name: 'Glycine', formula: 'C2H5NO2', smiles: 'NCC(=O)O', ...WHITE_POWDER, soluble: true, aq: 'glycine_aq', density: 1.6,
  info: 'The simplest amino acid.' });
S('aspirin', { name: 'Aspirin', formula: 'C9H8O4', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O', ...WHITE_CRYSTALS, density: 1.4, mp: 136,
  info: 'Acetylsalicylic acid — a painkiller.' });
S('naphthalene', { name: 'Naphthalene', formula: 'C10H8', smiles: 'C1=CC=C2C=CC=CC2=C1', ...WHITE_CRYSTALS, density: 1.14, mp: 80,
  flammable: true, info: 'Mothballs — two fused benzene rings.' });

// --------------------------------------------------------------------------------------
// Aqueous solutions (produced by dissolving / reactions).

function aq(id, name, formula, color, opacity, props = {}) {
  return S(id, { name, formula, color, opacity, solution: true, density: 1.05, bp: 101, mp: -2, ...props });
}
aq('nacl_aq', 'Salt water', 'NaCl(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Na', anion: 'Cl' }, flame: FLAME_COLORS.Na,
  info: 'Sodium chloride dissolved in water.' });
aq('kcl_aq', 'Potassium chloride solution', 'KCl(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'K', anion: 'Cl' }, flame: FLAME_COLORS.K });
aq('licl_aq', 'Lithium chloride solution', 'LiCl(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Li', anion: 'Cl' }, flame: FLAME_COLORS.Li });
aq('naf_aq', 'Sodium fluoride solution', 'NaF(aq)', '#d9edff', 0.17, { pH: 8, ions: { cation: 'Na', anion: 'F' }, flame: FLAME_COLORS.Na });
aq('nabr_aq', 'Sodium bromide solution', 'NaBr(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Na', anion: 'Br' }, flame: FLAME_COLORS.Na });
aq('nai_aq', 'Sodium iodide solution', 'NaI(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Na', anion: 'I' }, flame: FLAME_COLORS.Na });
aq('kbr_aq', 'Potassium bromide solution', 'KBr(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'K', anion: 'Br' }, flame: FLAME_COLORS.K });
aq('ki_aq', 'Potassium iodide solution', 'KI(aq)', '#dcecff', 0.17, { pH: 7, ions: { cation: 'K', anion: 'I' }, flame: FLAME_COLORS.K, catalystH2O2: true });
aq('naoh_aq', 'Sodium hydroxide solution', 'NaOH(aq)', '#d9edff', 0.18, { pH: 14, ions: { cation: 'Na', anion: 'OH' }, base: true,
  hazards: ['corrosive'], flame: FLAME_COLORS.Na, info: 'Lye — a strong, slippery base.' });
aq('koh_aq', 'Potassium hydroxide solution', 'KOH(aq)', '#d9edff', 0.18, { pH: 14, ions: { cation: 'K', anion: 'OH' }, base: true,
  hazards: ['corrosive'], flame: FLAME_COLORS.K });
aq('lioh_aq', 'Lithium hydroxide solution', 'LiOH(aq)', '#d9edff', 0.18, { pH: 13.5, ions: { cation: 'Li', anion: 'OH' }, base: true,
  hazards: ['corrosive'], flame: FLAME_COLORS.Li });
aq('caoh2_aq', 'Limewater', 'Ca(OH)2(aq)', '#e2f0ff', 0.2, { pH: 12.4, ions: { cation: 'Ca', anion: 'OH' }, base: true,
  flame: FLAME_COLORS.Ca, info: 'Turns milky when CO₂ bubbles through it.' });
aq('nahco3_aq', 'Sodium bicarbonate solution', 'NaHCO3(aq)', '#d9edff', 0.17, { pH: 8.3, ions: { cation: 'Na', anion: 'HCO3' },
  carbonate: true, flame: FLAME_COLORS.Na });
aq('na2co3_aq', 'Sodium carbonate solution', 'Na2CO3(aq)', '#d9edff', 0.17, { pH: 11.6, ions: { cation: 'Na', anion: 'CO3' },
  carbonate: true, base: true, flame: FLAME_COLORS.Na });
aq('cacl2_aq', 'Calcium chloride solution', 'CaCl2(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Ca', anion: 'Cl' }, flame: FLAME_COLORS.Ca });
aq('mgcl2_aq', 'Magnesium chloride solution', 'MgCl2(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Mg', anion: 'Cl' } });
aq('mgso4_aq', 'Magnesium sulfate solution', 'MgSO4(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Mg', anion: 'SO4' } });
aq('na2so4_aq', 'Sodium sulfate solution', 'Na2SO4(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Na', anion: 'SO4' }, flame: FLAME_COLORS.Na });
aq('kno3_aq', 'Potassium nitrate solution', 'KNO3(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'K', anion: 'NO3' }, flame: FLAME_COLORS.K });
aq('nano3_aq', 'Sodium nitrate solution', 'NaNO3(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Na', anion: 'NO3' }, flame: FLAME_COLORS.Na });
aq('nh4cl_aq', 'Ammonium chloride solution', 'NH4Cl(aq)', '#d9edff', 0.17, { pH: 5, ions: { cation: 'NH4', anion: 'Cl' } });
aq('agno3_aq', 'Silver nitrate solution', 'AgNO3(aq)', '#dcedff', 0.17, { pH: 6, ions: { cation: 'Ag', anion: 'NO3' }, hazards: ['corrosive'] });
aq('kmno4_aq', 'Potassium permanganate solution', 'KMnO4(aq)', '#7a0d6e', 0.9, { pH: 7, ions: { cation: 'K', anion: 'MnO4' },
  hazards: ['oxidizer'], flame: FLAME_COLORS.K, info: 'Intense purple.' });
aq('k2cr2o7_aq', 'Potassium dichromate solution', 'K2Cr2O7(aq)', '#ff7a12', 0.78, { pH: 4, ions: { cation: 'K', anion: 'Cr2O7' },
  hazards: ['toxic'], flame: FLAME_COLORS.K });
aq('cuso4_aq', 'Copper(II) sulfate solution', 'CuSO4(aq)', '#1f7fe8', 0.68, { pH: 4, ions: { cation: 'Cu', anion: 'SO4' },
  flame: FLAME_COLORS.Cu, info: 'The brilliant blue of hydrated copper ions.' });
aq('cucl2_aq', 'Copper(II) chloride solution', 'CuCl2(aq)', '#22a9a0', 0.65, { pH: 4, ions: { cation: 'Cu', anion: 'Cl' }, flame: FLAME_COLORS.Cu });
aq('cuno32_aq', 'Copper(II) nitrate solution', 'Cu(NO3)2(aq)', '#2a86e0', 0.62, { pH: 4, ions: { cation: 'Cu', anion: 'NO3' }, flame: FLAME_COLORS.Cu });
aq('fecl3_aq', 'Iron(III) chloride solution', 'FeCl3(aq)', '#c26a12', 0.78, { pH: 2, ions: { cation: 'Fe', anion: 'Cl' }, acid: true });
aq('fecl2_aq', 'Iron(II) chloride solution', 'FeCl2(aq)', '#bfe0a8', 0.4, { pH: 4, ions: { cation: 'Fe', anion: 'Cl' } });
aq('feso4_aq', 'Iron(II) sulfate solution', 'FeSO4(aq)', '#b8e3b0', 0.4, { pH: 4, ions: { cation: 'Fe', anion: 'SO4' } });
aq('zncl2_aq', 'Zinc chloride solution', 'ZnCl2(aq)', '#d9edff', 0.17, { pH: 5, ions: { cation: 'Zn', anion: 'Cl' } });
aq('znso4_aq', 'Zinc sulfate solution', 'ZnSO4(aq)', '#d9edff', 0.17, { pH: 5, ions: { cation: 'Zn', anion: 'SO4' } });
aq('alcl3_aq', 'Aluminium chloride solution', 'AlCl3(aq)', '#d9edff', 0.17, { pH: 3, ions: { cation: 'Al', anion: 'Cl' } });
aq('pbno32_aq', 'Lead(II) nitrate solution', 'Pb(NO3)2(aq)', '#d9edff', 0.17, { pH: 4, ions: { cation: 'Pb', anion: 'NO3' }, hazards: ['toxic'] });
aq('bacl2_aq', 'Barium chloride solution', 'BaCl2(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Ba', anion: 'Cl' }, flame: FLAME_COLORS.Ba, hazards: ['toxic'] });
aq('srcl2_aq', 'Strontium chloride solution', 'SrCl2(aq)', '#d9edff', 0.17, { pH: 7, ions: { cation: 'Sr', anion: 'Cl' }, flame: FLAME_COLORS.Sr });
aq('cocl2_aq', 'Cobalt(II) chloride solution', 'CoCl2(aq)', '#e0457a', 0.55, { pH: 5, ions: { cation: 'Co', anion: 'Cl' }, info: 'Pink hydrated cobalt ions.' });
aq('nicl2_aq', 'Nickel(II) chloride solution', 'NiCl2(aq)', '#3fae5a', 0.55, { pH: 5, ions: { cation: 'Ni', anion: 'Cl' } });
aq('naac_aq', 'Sodium acetate solution', 'CH3COONa(aq)', '#d9edff', 0.17, { pH: 8.9, ions: { cation: 'Na', anion: 'CH3COO' }, flame: FLAME_COLORS.Na });
aq('glucose_aq', 'Sugar solution', 'C6H12O6(aq)', '#e6f0ff', 0.2, { pH: 7, info: 'Glucose dissolved in water.' });
aq('urea_aq', 'Urea solution', 'CH4N2O(aq)', '#d9edff', 0.17, { pH: 7 });
aq('glycine_aq', 'Glycine solution', 'C2H5NO2(aq)', '#d9edff', 0.17, { pH: 6 });
aq('phenol_aq', 'Phenol solution', 'C6H5OH(aq)', '#e8eeff', 0.18, { pH: 5.5, hazards: ['toxic'] });
aq('generic_salt_aq', 'Salt solution', 'salt(aq)', '#d9edff', 0.17, { pH: 7 });
SUBSTANCES.phenol.aq = 'phenol_aq';

// Special visual-only substances.
S('copper_deposit', { name: 'Copper (deposited)', formula: 'Cu', phase: 'solid', form: 'powder', color: '#b0532c', metalness: 0.6,
  roughness: 0.55, density: 8.96, info: 'Copper metal displaced from its salt.' });
S('iodine_vapor', { name: 'Iodine vapour', formula: 'I2', phase: 'gas', form: 'gas', color: '#7a1fb8', opacity: 0.55, heavy: true,
  info: 'Iodine sublimes straight from solid to a violet vapour.' });
S('steam', { name: 'Steam', formula: 'H2O', phase: 'gas', form: 'gas', color: '#ffffff', opacity: 0.08 });
S('foam', { name: 'Foam', formula: '', phase: 'solid', form: 'powder', color: '#fbfbf8', roughness: 1, density: 0.1 });

export function getSubstance(id) {
  return SUBSTANCES[id] || null;
}

/** Salt lookup by cation + anion (used by neutralisation and precipitation). */
export function findSalt(cation, anion) {
  for (const s of Object.values(SUBSTANCES)) {
    if (s.ions && s.ions.cation === cation && s.ions.anion === anion && !s.solution && !s.acid && !s.base) return s;
  }
  for (const s of Object.values(SUBSTANCES)) {
    if (s.ions && s.ions.cation === cation && s.ions.anion === anion) return s;
  }
  return null;
}
