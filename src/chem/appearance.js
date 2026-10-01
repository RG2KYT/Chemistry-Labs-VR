// Turns real-world descriptions of a substance ("Bright blue triclinic crystals",
// "Colorless volatile liquid", "Silvery-white lustrous metal") into render parameters:
// colour, opacity, physical form (crystal habit), metalness and roughness.
// Used both at build time (offline database from PubChem) and at run time (live lookups).

const COLORS = [
  // multi-word / compound colours first (matched before their parts)
  ['yellow-green', '#b6d24a'], ['yellowish-green', '#b6d24a'], ['greenish-yellow', '#d2e04a'],
  ['blue-green', '#2fa38f'], ['bluish-green', '#2fa38f'], ['greenish-blue', '#2f8fae'],
  ['blue-violet', '#5a3fc0'], ['red-brown', '#7a2e12'], ['reddish-brown', '#7a2e12'], ['brownish-red', '#8a2a18'],
  ['yellow-brown', '#a8741e'], ['yellowish-brown', '#a8741e'], ['brownish-yellow', '#b8862a'],
  ['orange-red', '#e04a1e'], ['reddish-orange', '#e05a1e'], ['red-orange', '#e04a1e'], ['orange-yellow', '#f0a82a'],
  ['gray-black', '#2e3034'], ['grey-black', '#2e3034'], ['blue-black', '#1c2234'], ['violet-black', '#2b1b38'],
  ['purple-black', '#2b1b38'], ['bluish-white', '#e8f0fb'], ['grayish-white', '#e2e2de'], ['greyish-white', '#e2e2de'],
  ['silvery-white', '#dfe2e6'], ['silver-white', '#dfe2e6'], ['silvery-gray', '#b9bdc3'], ['bluish-gray', '#9aa6b4'],
  ['steel-gray', '#8a9098'], ['off-white', '#ece8dc'], ['yellowish-white', '#f4efd6'], ['pinkish', '#efb8c6'],
  ['rose', '#e06a8a'], ['rose-red', '#d8405e'], ['wine-red', '#7a1830'], ['blood-red', '#8a0e12'],
  ['sky-blue', '#7fbaf0'], ['light blue', '#a9c8ef'], ['pale blue', '#b6d2f2'], ['deep blue', '#1f4fb0'], ['dark blue', '#1f3f8a'],
  ['light green', '#9ad69a'], ['pale green', '#c2e6b8'], ['dark green', '#245a2c'], ['emerald', '#2f9a5a'], ['olive', '#7a7a2e'],
  ['pale yellow', '#f5eba8'], ['light yellow', '#f5eba8'], ['lemon', '#f2e64a'], ['bright yellow', '#f7d81a'],
  ['dark red', '#7a0f0f'], ['deep red', '#8a0f12'], ['bright red', '#e0221a'], ['dark brown', '#4a2a16'], ['light brown', '#a8794a'],
  ['dark gray', '#4a4d52'], ['dark grey', '#4a4d52'], ['light gray', '#c8cbd0'], ['light grey', '#c8cbd0'],
  ['dark purple', '#3a1450'], ['deep purple', '#3a1450'], ['dark violet', '#3a1450'],
  // single words
  ['colorless', null], ['colourless', null], ['transparent', null], ['clear', null], ['water-white', null],
  ['white', '#f4f4f1'], ['cream', '#f0e6c8'], ['ivory', '#f2ecd8'], ['beige', '#d8c8a4'], ['tan', '#c8a878'],
  ['silvery', '#d6d9de'], ['silver', '#d6d9de'], ['gray', '#9a9ea4'], ['grey', '#9a9ea4'], ['black', '#1d1d1f'],
  ['brown', '#6b4226'], ['bronze', '#a8713a'], ['copper', '#c8733a'], ['golden', '#e8b84a'], ['gold', '#e8b84a'],
  ['amber', '#c8861e'], ['orange', '#ec7a1e'], ['scarlet', '#d81e1e'], ['crimson', '#a8102a'], ['vermilion', '#e0401e'],
  ['red', '#c0281e'], ['maroon', '#6a1420'], ['pink', '#ec9cb8'], ['magenta', '#c02a8a'], ['purple', '#6b2f8f'],
  ['violet', '#6b2f9f'], ['lilac', '#b89ad8'], ['lavender', '#c8b8ec'], ['indigo', '#3a2f8a'], ['blue', '#2f6fd0'],
  ['turquoise', '#2fb8b0'], ['cyan', '#3fc8d8'], ['teal', '#1f8a8a'], ['green', '#3f9a4a'], ['yellow', '#f2d33a'],
  ['buff', '#e0c890'], ['straw', '#e8d890'], ['khaki', '#c8b878'], ['ochre', '#c8862a'], ['rust', '#9a3a12'],
];

const FORMS = [
  ['needle', 'needles'], ['acicular', 'needles'], ['fibrous', 'needles'], ['fibers', 'needles'],
  ['flake', 'flakes'], ['leaflet', 'flakes'], ['plate', 'flakes'], ['scale', 'flakes'], ['lamellar', 'flakes'], ['sheet', 'flakes'], ['foil', 'flakes'],
  ['cubic', 'cubic'], ['cube', 'cubic'],
  ['prism', 'crystals'], ['crystal', 'crystals'], ['rhomb', 'crystals'], ['octahedr', 'crystals'], ['monoclinic', 'crystals'],
  ['triclinic', 'crystals'], ['orthorhombic', 'crystals'], ['hexagonal', 'crystals'], ['tetragonal', 'crystals'], ['tablet', 'crystals'],
  ['pellet', 'pellets'], ['bead', 'pellets'], ['granul', 'pellets'], ['pearl', 'pellets'], ['stick', 'pellets'],
  ['lump', 'chunk'], ['chunk', 'chunk'], ['mass', 'chunk'], ['ingot', 'chunk'], ['block', 'chunk'], ['rod', 'chunk'], ['bar', 'chunk'],
  ['wax', 'waxy'], ['paste', 'waxy'], ['gel', 'waxy'], ['glass', 'glassy'], ['vitreous', 'glassy'],
  ['powder', 'powder'], ['amorphous', 'powder'], ['dust', 'powder'],
];

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function shade(c, f) {
  const [r, g, b] = hex(c);
  return f < 1 ? toHex([r * f, g * f, b * f]) : toHex([r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1)]);
}

/** Find the first colour mentioned in a text. Returns { color, colorless } or null. */
export function parseColor(text) {
  const t = ' ' + text.toLowerCase().replace(/[_/,;()]/g, ' ') + ' ';
  let best = null;
  for (const [word, color] of COLORS) {
    const i = t.search(new RegExp('[^a-z]' + word.replace(/[-]/g, '[- ]?') + '(ish)?[^a-z]'));
    if (i >= 0 && (!best || i < best.i || (i === best.i && word.length > best.word.length))) best = { i, word, color };
  }
  if (!best) return null;
  if (best.color === null) return { color: null, colorless: true };
  let color = best.color;
  const before = t.slice(Math.max(0, best.i - 12), best.i);
  if (/(dark|deep)[- ]?$/.test(before)) color = shade(color, 0.6);
  else if (/(pale|light|faint|slight(ly)?)[- ]?$/.test(before)) color = shade(color, 1.45);
  return { color, colorless: false };
}

export function parseForm(text) {
  const t = text.toLowerCase();
  let best = null;
  for (const [word, form] of FORMS) {
    const i = t.indexOf(word);
    if (i >= 0 && (!best || i < best.i)) best = { i, form };
  }
  return best ? best.form : null;
}

/** Parse a temperature like "801 °C", "-114.1 °C", "176 °F", "300 K", "decomposes at 560 °C". */
export function parseTemperature(text) {
  if (!text) return null;
  const m = String(text).replace(/−/g, '-').match(/(-?\d+(?:\.\d+)?)\s*(?:to\s*-?\d+(?:\.\d+)?\s*)?(°|deg)?\s*([CFK])\b/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const unit = m[3].toUpperCase();
  if (unit === 'F') return +((v - 32) * 5 / 9).toFixed(1);
  if (unit === 'K') return +(v - 273.15).toFixed(1);
  return v;
}

export function parseDensity(text) {
  if (!text) return null;
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*(g\/cm|g\/mL|g\/cu cm|g\/cc)/i);
  if (m) return parseFloat(m[1]);
  const m2 = String(text).match(/^(\d+(?:\.\d+)?)\b/);
  if (m2) {
    const v = parseFloat(m2[1]);
    if (v > 0.0001 && v < 25) return v;
  }
  return null;
}

/**
 * Build appearance props from descriptions.
 * input: { colorForm: string[], description: string[], mp, bp, metal: bool, phase? }
 */
export function appearanceFrom({ colorForm = [], description = [], mp = null, bp = null, metal = false, phase = null }) {
  const texts = [...colorForm, ...description].filter(Boolean);
  const all = texts.join('. ');
  const lower = all.toLowerCase();
  // Phase at room temperature (22 °C)
  let ph = phase;
  if (!ph) {
    if (mp !== null && mp > 22) ph = 'solid';
    else if (bp !== null && bp <= 22) ph = 'gas';
    else if (mp !== null || bp !== null) ph = 'liquid';
    else if (/\bgas\b|gaseous|vapou?r/.test(lower)) ph = 'gas';
    else if (/\bliquid\b|\boil\b|oily|syrup/.test(lower)) ph = 'liquid';
    else ph = 'solid';
  }
  let colorInfo = null;
  for (const t of texts) {
    colorInfo = parseColor(t);
    if (colorInfo) break;
  }
  const metallic = metal || /metallic|lustrous|luster|lustre|silvery|shiny/.test(lower);
  let form = null;
  for (const t of texts) {
    form = parseForm(t);
    if (form) break;
  }
  const out = { phase: ph };
  if (ph === 'gas') {
    out.form = 'gas';
    if (colorInfo && colorInfo.color) {
      out.color = colorInfo.color;
      out.opacity = /pale|faint|light/.test(lower) ? 0.15 : 0.32;
    } else {
      out.color = '#ffffff';
      out.opacity = 0.05;
    }
    return out;
  }
  if (ph === 'liquid') {
    out.form = 'liquid';
    if (metallic && colorInfo && !colorInfo.colorless && /silver|metal/.test(lower)) {
      out.color = colorInfo.color || '#d9dbe0';
      out.opacity = 1;
      out.metalness = 1;
      out.roughness = 0.05;
    } else if (!colorInfo || colorInfo.colorless) {
      out.color = '#d6ecff';
      out.opacity = /oily|viscous|syrup/.test(lower) ? 0.3 : 0.16;
    } else {
      out.color = colorInfo.color;
      const dark = hex(out.color).reduce((a, b) => a + b, 0) < 250;
      out.opacity = /pale|light|faint/.test(lower) ? 0.35 : dark ? 0.92 : 0.6;
    }
    return out;
  }
  // Solid
  out.form = form || (metallic ? 'chunk' : 'powder');
  if (metallic && !/white powder|powder/.test(lower)) {
    out.form = form === 'powder' ? 'powder' : form || 'metal';
    out.metalness = 0.9;
    out.roughness = 0.25;
    out.color = colorInfo && colorInfo.color ? colorInfo.color : '#c3c7cd';
  } else if (!colorInfo || colorInfo.colorless) {
    out.color = '#f2f5f8';
    out.roughness = 0.12;
    out.translucent = true;
    if (!form) out.form = 'crystals';
  } else {
    out.color = colorInfo.color;
    out.roughness = out.form === 'powder' ? 0.9 : out.form === 'waxy' ? 0.6 : 0.3;
  }
  if (out.form === 'glassy') out.roughness = 0.08;
  return out;
}
