// Live lookup of molecules the player builds in PubChem (NIH's open chemistry database,
// 100+ million compounds). Gives every molecule its real name, appearance, melting/boiling
// point and a short description. Results are cached in localStorage.
//
// A molecule is only called "undiscovered" when PubChem has no record of its structure at all.

import { appearanceFrom, parseTemperature, parseDensity } from './appearance.js';

const API = 'https://pubchem.ncbi.nlm.nih.gov/rest';
const CACHE_KEY = 'chemlab-pubchem-v1';
let cache = null;

function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    cache = {};
  }
  return cache;
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage full or unavailable */ }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, timeout = 9000) {
  // PubChem allows ~5 requests/second; it answers 503 when busy, so back off and retry.
  for (let attempt = 0; ; attempt++) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
    try {
      const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (res.status === 404) return null;
      if ((res.status === 503 || res.status === 429) && attempt < 4) {
        await wait(800 * (attempt + 1) + Math.random() * 400);
        continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      if (t) clearTimeout(t);
    }
  }
}

/** Collect the strings / numbers under a PUG-View section. */
function strings(view) {
  const out = [];
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach(walk);
    if (x.StringWithMarkup) for (const s of x.StringWithMarkup) if (s.String) out.push(s.String);
    if (x.Number && x.Unit) out.push(x.Number[0] + ' ' + x.Unit);
    for (const v of Object.values(x)) if (typeof v === 'object') walk(v);
  };
  walk(view);
  return out;
}

async function heading(cid, name) {
  try {
    const d = await getJson(`${API}/pug_view/data/compound/${cid}/JSON?heading=${encodeURIComponent(name)}`);
    return d ? strings(d) : [];
  } catch {
    return [];
  }
}

function firstTemp(list) {
  for (const s of list) {
    const v = parseTemperature(s);
    if (v !== null && v > -275 && v < 5000) return v;
  }
  return null;
}

/** "Sodium azide, BioXtra" → "Sodium azide"; "CID 1234" / "Compound NaCl" → null. */
export function cleanName(title) {
  if (!title || /^CID \d+/.test(title) || /^Compound [A-Z]/.test(title)) return null;
  let n = title.replace(/,\s*(BioXtra|BioUltra|BioReagent|ACS reagent.*|for cell culture.*|anhydrous.*|puriss.*|reagent.*|technical.*|.*grade.*|with .*)$/i, '');
  n = n.replace(/\s*\((reagent|anhydrous|calcite|technical)\)$/i, '');
  if (n.includes(';')) return null; // ionic "Calcium;dihydroxide"-style machine names
  return n.trim() || null;
}

async function details(cid, title, formula, metal) {
  const [colorForm, physical, melt, boil, dens, descJson] = await Promise.all([
    heading(cid, 'Color/Form'),
    heading(cid, 'Physical Description'),
    heading(cid, 'Melting Point'),
    heading(cid, 'Boiling Point'),
    heading(cid, 'Density'),
    getJson(`${API}/pug/compound/cid/${cid}/description/JSON`).catch(() => null),
  ]);
  const descs = (descJson?.InformationList?.Information || []).map((i) => i.Description).filter(Boolean);
  const mp = firstTemp(melt);
  const bp = firstTemp(boil);
  let density = null;
  for (const d of dens) { density = parseDensity(d); if (density) break; }
  const look = appearanceFrom({ colorForm, description: physical, mp, bp, metal });
  const name = cleanName(title) || 'Compound ' + formula;
  const experimental = colorForm.length || physical.length || mp !== null || bp !== null || descs.length;
  let info = descs.length ? shorten(descs[0]) : '';
  if (!experimental) info = 'Listed in PubChem, but nobody has reported measuring it — it may never have been made in a real lab. Its look is estimated.';
  return {
    status: 'found', cid, name: titleCase(name), info, mp, bp, density, look,
    describe: colorForm[0] || physical[0] || '', experimental: !!experimental,
  };
}

/** Full record for a known PubChem compound id. */
export async function lookupCid(cid, { metal = false } = {}) {
  const c = loadCache();
  const key = 'cid:' + cid;
  if (c[key]) return c[key];
  try {
    const p = await getJson(`${API}/pug/compound/cid/${cid}/property/Title,MolecularFormula/JSON`);
    const prop = p?.PropertyTable?.Properties?.[0];
    if (!prop) return { status: 'none' };
    const r = await details(cid, prop.Title, prop.MolecularFormula, metal);
    c[key] = r;
    saveCache();
    return r;
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/**
 * Look up an exact structure. Returns
 *   { status: 'found', cid, name, info, mp, bp, density, look }   or
 *   { status: 'none' }  (PubChem has never recorded this molecule)   or
 *   { status: 'error' } (offline / timeout — try again later)
 */
export async function lookupMolecule(smiles, { metal = false } = {}) {
  const c = loadCache();
  if (c[smiles]) return c[smiles];
  try {
    const p = await getJson(`${API}/pug/compound/smiles/${encodeURIComponent(smiles)}/property/Title,MolecularFormula/JSON`);
    const prop = p && p.PropertyTable && p.PropertyTable.Properties[0];
    if (!prop || !prop.CID) {
      const r = { status: 'none' };
      c[smiles] = r;
      saveCache();
      return r;
    }
    const r = await details(prop.CID, prop.Title, prop.MolecularFormula, metal);
    c[smiles] = r;
    saveCache();
    return r;
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/**
 * Look up by molecular formula (used for metal compounds, whose bonding the lab models
 * covalently while real salts are ionic). The lowest-numbered properly named record is
 * almost always the classic compound (Na2CO3 → sodium carbonate, CID 10340).
 */
export async function lookupFormula(formula, { metal = false } = {}) {
  const c = loadCache();
  const key = 'formula:' + formula;
  if (c[key]) return c[key];
  try {
    const j = await getJson(`${API}/pug/compound/fastformula/${encodeURIComponent(formula)}/cids/JSON?MaxRecords=60`);
    const cids = (j?.IdentifierList?.CID || []).sort((a, b) => a - b).slice(0, 8);
    if (!cids.length) {
      const r = { status: 'none' };
      c[key] = r;
      saveCache();
      return r;
    }
    const t = await getJson(`${API}/pug/compound/cid/${cids.join(',')}/property/Title,MolecularFormula,Charge/JSON`);
    const props = (t?.PropertyTable?.Properties || []).filter((x) => !x.Charge && cleanName(x.Title) && !/\d{2,}[A-Z][a-z]?\b|-\d+[A-Z]|atom %/.test(x.Title));
    if (!props.length) {
      const r = { status: 'none' };
      c[key] = r;
      saveCache();
      return r;
    }
    const best = props.sort((a, b) => a.CID - b.CID)[0];
    const r = await details(best.CID, best.Title, best.MolecularFormula, metal);
    c[key] = r;
    saveCache();
    return r;
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function shorten(text) {
  const sentences = text.split(/(?<=\.)\s+/);
  let out = '';
  for (const s of sentences) {
    if ((out + ' ' + s).length > 220) break;
    out = out ? out + ' ' + s : s;
  }
  return out || text.slice(0, 220);
}

function titleCase(name) {
  // PubChem titles are usually fine ("Sodium Chloride", "ethanol"): capitalise the first letter.
  return name.charAt(0).toUpperCase() + name.slice(1);
}
