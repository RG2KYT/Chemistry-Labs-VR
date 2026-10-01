// Adds GHS hazard statements (H-codes) from PubChem to src/chem/data/pubchem-data.json for
// every compound in the library, every enriched hand-made entry and every element.
// They drive what happens when someone drinks or touches a substance in the game.
// Usage: node scripts/add-ghs.mjs   (≈5 min, resumable)

import fs from 'node:fs';
import { ELEMENTS } from '../src/chem/elements.js';

const API = 'https://pubchem.ncbi.nlm.nih.gov/rest';
const OUT = new URL('../src/chem/data/pubchem-data.json', import.meta.url);
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

/** H-codes reported by at least 30 % of notifiers (PubChem aggregates the ECHA C&L data). */
async function ghsFor(cid) {
  const d = await getJson(`${API}/pug_view/data/compound/${cid}/JSON?heading=GHS%20Classification`);
  if (!d) return [];
  const best = new Map();
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach(walk);
    if (x.StringWithMarkup) {
      for (const m of x.StringWithMarkup) {
        const mm = /^(H\d{3}[A-Za-z]*)(?:\s*\(([\d.]+)%\))?/.exec(m.String || '');
        if (mm) best.set(mm[1], Math.max(best.get(mm[1]) || 0, mm[2] ? Number(mm[2]) : 100));
      }
    }
    for (const v of Object.values(x)) if (typeof v === 'object') walk(v);
  };
  walk(d);
  return [...best].filter(([, p]) => p >= 30).map(([c]) => c).sort();
}

const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
data.elements = data.elements || {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(data, null, 1));

let n = 0;
for (const c of data.compounds) {
  if (c.ghs) continue;
  try { c.ghs = await ghsFor(c.cid); process.stdout.write(c.ghs.length ? '+' : '.'); } catch { process.stdout.write('E'); continue; }
  if (++n % 10 === 0) save();
  await sleep(220);
}
for (const e of Object.values(data.enrich)) {
  if (e.ghs || !e.cid) continue;
  try { e.ghs = await ghsFor(e.cid); process.stdout.write(e.ghs.length ? '+' : '.'); } catch { process.stdout.write('E'); continue; }
  if (++n % 10 === 0) save();
  await sleep(220);
}
for (const el of ELEMENTS) {
  if (el.z > 103 || data.elements[el.symbol]?.ghs) continue;
  try {
    const p = await getJson(`${API}/pug/compound/name/${encodeURIComponent(el.name)}/cids/JSON`);
    const cid = p?.IdentifierList?.CID?.[0];
    data.elements[el.symbol] = { cid: cid || null, ghs: cid ? await ghsFor(cid) : [] };
    process.stdout.write('e');
  } catch { process.stdout.write('E'); continue; }
  if (++n % 10 === 0) save();
  await sleep(220);
}
save();
console.log('\ndone');
