// Builds src/chem/data/pubchem-data.json from PubChem: real names, appearance
// descriptions, melting/boiling points, densities and short descriptions for
//  (1) every compound already in the lab database and
//  (2) a long list of further common chemicals (so they work offline too).
// Usage: node scripts/build-chem-data.mjs        (takes ~15 min, respects PubChem rate limits)

import fs from 'node:fs';
import { parseSmiles } from '../src/chem/smiles.js';
import { toSmiles } from '../src/chem/smilesWriter.js';
import { SUBSTANCES } from '../src/chem/substances.js';
import { lookupCid, lookupFormula } from '../src/chem/pubchem.js';
import { signature } from '../src/chem/graph.js';

const API = 'https://pubchem.ncbi.nlm.nih.gov/rest';
const OUT = new URL('../src/chem/data/pubchem-data.json', import.meta.url);

const EXTRA = `
ammonium nitrate, ammonium sulfate, ammonium carbonate, ammonium bicarbonate, ammonium phosphate, ammonium dichromate,
sodium sulfite, sodium thiosulfate, trisodium phosphate, sodium silicate, sodium peroxide, sodium hydride, sodium azide,
sodium nitrite, sodium chlorate, sodium perchlorate, sodium bromate, sodium iodate, sodium sulfide, sodium bisulfate,
potassium chlorate, potassium perchlorate, potassium carbonate, potassium bicarbonate, potassium sulfate, potassium chromate,
potassium cyanide, sodium cyanide, potassium fluoride, potassium iodate, potassium bromate, potassium nitrite, potassium sulfide,
lithium fluoride, lithium bromide, lithium iodide, lithium nitrate, lithium sulfate, lithium oxide, lithium hydride,
magnesium carbonate, magnesium nitrate, magnesium sulfide, magnesium fluoride, magnesium bromide,
calcium nitrate, calcium phosphate, calcium sulfide, calcium carbide, calcium hydride, calcium bromide, calcium iodide, calcium hypochlorite,
strontium nitrate, strontium carbonate, strontium oxide, strontium hydroxide, barium nitrate, barium carbonate, barium hydroxide,
barium peroxide, barium oxide, aluminium hydroxide, aluminium sulfate, aluminium nitrate, aluminium fluoride, aluminium bromide,
boric acid, boron trioxide, boron trifluoride, boron trichloride, diborane, silicon tetrachloride, silicon tetrafluoride, silicon carbide,
titanium tetrachloride, vanadium pentoxide, chromium trioxide, chromium(III) chloride, manganese(II) chloride, manganese(II) sulfate,
manganese(II) oxide, iron(II) sulfide, iron disulfide, iron(III) nitrate, iron(III) sulfate, iron(II,III) oxide, iron(II) hydroxide,
cobalt(II) nitrate, cobalt(II) oxide, cobalt(II) sulfate, nickel(II) sulfate, nickel(II) oxide, nickel(II) nitrate,
copper(I) chloride, copper(II) nitrate, copper(II) carbonate, copper(II) sulfide, copper(I) iodide, copper(II) bromide,
zinc nitrate, zinc carbonate, zinc bromide, zinc iodide, silver oxide, silver sulfide, silver fluoride, silver chromate,
cadmium sulfide, cadmium chloride, mercury(II) chloride, mercury(I) chloride, mercury(II) oxide, mercury(II) sulfide,
lead(II) oxide, lead(IV) oxide, lead(II) chloride, lead(II) sulfide, lead(II) sulfate, lead(II) carbonate, lead(II) bromide,
tin(II) chloride, tin(IV) chloride, tin(IV) oxide, antimony trioxide, antimony trichloride, bismuth(III) chloride, bismuth(III) oxide,
arsenic trioxide, selenium dioxide, tellurium dioxide, iodine pentoxide, iodine monochloride, iodine trichloride,
chlorine dioxide, chlorine trifluoride, chlorine monofluoride, oxygen difluoride, dinitrogen tetroxide, dinitrogen pentoxide, dinitrogen trioxide,
nitrosyl chloride, nitrogen trichloride, nitrogen trifluoride, hydroxylamine, phosphorus trichloride, phosphorus pentachloride,
phosphorus pentoxide, phosphoryl chloride, phosphorus tribromide, sulfur dichloride, thionyl chloride, sulfuryl chloride,
disulfur dichloride, carbonyl sulfide, phosgene, hydrogen selenide, hydrogen telluride, arsine, stibine, germane,
xenon difluoride, xenon tetrafluoride, xenon trioxide, uranium hexafluoride, uranium dioxide, thorium dioxide,
tungsten trioxide, tungsten carbide, molybdenum disulfide, molybdenum trioxide, zirconium dioxide, cerium dioxide,
gallium arsenide, gallium nitride, indium phosphide, beryllium oxide, beryllium chloride, scandium oxide, yttrium oxide,
nitrous acid, hypochlorous acid, chloric acid, perchloric acid, sulfurous acid, hydrazoic acid, hydrogen sulfide,
chlorous acid, hypobromous acid, periodic acid, selenic acid, arsenic acid, carbonic acid, cyanic acid, thiocyanic acid,
propylene glycol, 1-butanol, tert-butanol, 2-butanol, 1-pentanol, 1-hexanol, 1-octanol, cyclohexanol, benzyl alcohol, allyl alcohol,
catechol, hydroquinone, resorcinol, p-cresol, acetic anhydride, propionic acid, butyric acid, valeric acid, lactic acid,
citric acid, oxalic acid, malonic acid, succinic acid, tartaric acid, malic acid, maleic acid, fumaric acid, benzoic acid,
salicylic acid, ascorbic acid, stearic acid, palmitic acid, oleic acid, acrylic acid, pyruvic acid, glycolic acid, trichloroacetic acid,
methyl acetate, butyl acetate, isoamyl acetate, methyl salicylate, ethyl formate, methyl formate, ethyl butyrate, vinyl acetate,
butanone, cyclohexanone, acetophenone, benzaldehyde, cinnamaldehyde, vanillin, propanal, butanal, glyoxal, acrolein,
formamide, acetamide, dimethylformamide, acetonitrile, methylamine, dimethylamine, trimethylamine, ethylamine, ethylenediamine,
aniline, pyridine, pyrrole, imidazole, indole, pyrimidine, purine, nicotine, caffeine, theobromine, capsaicin, menthol, camphor,
limonene, isoprene, styrene, anthracene, phenanthrene, biphenyl, o-xylene, p-xylene, ethylbenzene, cumene, nitrobenzene,
chlorobenzene, bromobenzene, iodobenzene, fluorobenzene, benzoyl chloride, trinitrotoluene, picric acid, nitroglycerin,
alanine, serine, cysteine, valine, leucine, isoleucine, phenylalanine, tyrosine, tryptophan, aspartic acid, glutamic acid,
lysine, arginine, proline, histidine, methionine, threonine, asparagine, glutamine, fructose, galactose, sucrose, lactose,
maltose, ribose, deoxyribose, xylitol, sorbitol, mannitol, cholesterol, testosterone, estradiol, adrenaline, dopamine, serotonin,
melatonin, histamine, ibuprofen, paracetamol, quinine, thymol, eugenol, coumarin, saccharin, aspartame, sucralose,
isobutane, isopentane, neopentane, heptane, nonane, decane, dodecane, hexadecane, eicosane, propene, 1-butene, 1,3-butadiene,
propyne, cyclopropane, cyclobutane, cyclopentane, cyclohexene, methylcyclohexane, chloroethane, bromomethane, iodomethane,
1,2-dichloroethane, trichloroethylene, tetrachloroethylene, vinyl chloride, tetrafluoroethylene, dichlorodifluoromethane,
chlorodifluoromethane, fluoromethane, fluoroform, carbon tetrafluoride, bromoform, iodoform, methanethiol, ethanethiol,
dimethyl sulfide, dimethyl sulfoxide, thiophene, furan, tetrahydrofuran, 1,4-dioxane, ethylene oxide, ketene, cyanogen,
cyanuric acid, melamine, oxalyl chloride, methyl isocyanate, hydrogen peroxide, peracetic acid, acetyl chloride, acetic acid,
nitric oxide, nitrogen dioxide, carbon monoxide, ozone, hydrogen fluoride, hydrogen chloride, hydrogen bromide, hydrogen iodide,
sodium amide, potassium hydride, potassium permanganate, potassium dichromate, sodium dichromate, sodium hypochlorite,
calcium oxide, calcium hydroxide, sodium carbonate, sodium bicarbonate, glucose, urea, glycine, ethanol, methanol, water
`.split(',').map((s) => s.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404 || res.status === 400) return null;
      if (res.status === 503 || res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(1500);
    }
  }
  return null;
}

/** Element counts from a Hill formula ("C2H6O" → {C:2,H:6,O:1}); charges ignored. */
function countsOfFormula(f) {
  const out = {};
  for (const [, el, n] of f.replace(/[+-]\d*$/, '').matchAll(/([A-Z][a-z]?)(\d*)/g)) out[el] = (out[el] || 0) + (n ? Number(n) : 1);
  return out;
}
function countsOfGraph(g) {
  const out = {};
  for (const a of g.atoms) out[a.el.symbol] = (out[a.el.symbol] || 0) + 1;
  return out;
}
const sameCounts = (a, b, ignoreH = false) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!(ignoreH && k === 'H') && (a[k] || 0) !== (b[k] || 0)) return false;
  return true;
};
function hill(counts) {
  const els = Object.keys(counts);
  const order = counts.C ? ['C', 'H', ...els.filter((e) => e !== 'C' && e !== 'H').sort()] : els.sort();
  return order.filter((e) => counts[e]).map((e) => e + (counts[e] > 1 ? counts[e] : '')).join('');
}

function ourSmiles(pubchemSmiles) {
  const g = parseSmiles(pubchemSmiles);
  return { smiles: toSmiles(g.atoms, g.bonds), sig: signature(g.atoms, g.bonds), heavy: g.atoms.filter((a) => a.el.symbol !== 'H').length, g };
}

const titleCaseQuery = (q) => q.charAt(0).toUpperCase() + q.slice(1);

// Resumable: progress is saved after every compound, so an interrupted run continues.
let result = { generated: new Date().toISOString(), enrich: {}, compounds: [], done: [] };
try {
  const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  if (old.version === 2) result = { ...result, ...old, done: old.done || [] };
} catch { /* fresh run */ }
result.version = 2;
const done = new Set(result.done);
const knownSigs = new Map();
fs.mkdirSync(new URL('../src/chem/data/', import.meta.url), { recursive: true });
const save = () => fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
for (const c of result.compounds) {
  try { knownSigs.set(ourSmiles(c.smiles).sig, c.query); } catch { /* ignore */ }
}

// (1) existing database entries: found by their name, checked against their formula.
const existing = Object.values(SUBSTANCES).filter((s) => s.smiles);
console.log('enriching', existing.length, 'existing compounds');
for (const s of existing) {
  const g = parseSmiles(s.smiles);
  knownSigs.set(signature(g.atoms, g.bonds), s.id);
  if (done.has('id:' + s.id)) continue;
  let ok = true;
  try {
    const counts = countsOfGraph(g);
    const name = s.name.replace(/ solution$/i, '');
    let cid = null;
    const p = await getJson(`${API}/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula/JSON`);
    for (const prop of p?.PropertyTable?.Properties || []) {
      if (sameCounts(countsOfFormula(prop.MolecularFormula), counts, true)) { cid = prop.CID; break; }
    }
    let r = null;
    if (cid) r = await lookupCid(cid);
    else r = await lookupFormula(hill(counts));
    if (r && r.status === 'found') {
      result.enrich[s.id] = { cid: r.cid, pubchemName: r.name, mp: r.mp, bp: r.bp, density: r.density, info: r.info, describe: r.describe, look: r.look, byName: !!cid };
      process.stdout.write(cid ? '.' : 'f');
    } else {
      if (r && r.status === 'error') ok = false;
      process.stdout.write(r && r.status === 'error' ? 'E' : 'x');
    }
  } catch {
    ok = false;
    process.stdout.write('E');
  }
  if (ok) { result.done.push('id:' + s.id); save(); }
  await sleep(200);
}

// (2) extra compounds by name
console.log('\nadding', EXTRA.length, 'named compounds');
for (const name of EXTRA) {
  if (done.has('name:' + name)) continue;
  let ok = true;
  try {
    const p = await getJson(`${API}/pug/compound/name/${encodeURIComponent(name)}/property/Title,MolecularFormula,ConnectivitySMILES/JSON`);
    const prop = p?.PropertyTable?.Properties?.[0];
    if (!prop || !prop.ConnectivitySMILES) { process.stdout.write('?'); continue; }
    let parsed;
    try {
      parsed = ourSmiles(prop.ConnectivitySMILES);
    } catch {
      process.stdout.write('p');
      continue;
    }
    if (knownSigs.has(parsed.sig) || parsed.heavy > 40) { process.stdout.write('='); continue; }
    const r = await lookupCid(prop.CID);
    if (r.status !== 'found') { if (r.status === 'error') ok = false; process.stdout.write(r.status === 'error' ? 'E' : 'x'); continue; }
    knownSigs.set(parsed.sig, name);
    result.compounds.push({
      name: titleCaseQuery(name), query: name, smiles: parsed.smiles, pubchemSmiles: prop.ConnectivitySMILES, formula: prop.MolecularFormula, cid: r.cid,
      mp: r.mp, bp: r.bp, density: r.density, info: r.info, describe: r.describe, look: r.look, experimental: r.experimental,
    });
    process.stdout.write('+');
  } catch (e) {
    ok = false;
    process.stdout.write('E');
  } finally {
    if (ok) { result.done.push('name:' + name); save(); }
  }
  await sleep(200);
}

delete result.done;
save();
console.log(`\nwrote ${Object.keys(result.enrich).length} enrichments and ${result.compounds.length} new compounds`);
