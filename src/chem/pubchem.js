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

async function getJson(url, timeout = 9000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
  try {
    const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    if (t) clearTimeout(t);
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

/**
 * Look up a structure. Returns
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
    const cid = prop.CID;
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
    for (const s of dens) { density = parseDensity(s); if (density) break; }
    const look = appearanceFrom({ colorForm, description: physical, mp, bp, metal });
    let name = prop.Title && !/^CID \d+/.test(prop.Title) ? prop.Title : null;
    if (!name) name = 'Compound ' + prop.MolecularFormula;
    const experimental = colorForm.length || physical.length || mp !== null || bp !== null || descs.length;
    let info = descs.length ? shorten(descs[0]) : '';
    if (!experimental) info = 'Listed in PubChem, but nobody has reported measuring it — it may never have been made in a real lab. Its look is estimated.';
    const r = {
      status: 'found', cid, name: titleCase(name), info, mp, bp, density, look,
      describe: colorForm[0] || physical[0] || '', experimental: !!experimental,
    };
    c[smiles] = r;
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
