// Solid / liquid / gas forms of every substance.
//
// Each substance in the database is defined in its natural state at room temperature
// (22 °C). The other states are generated automatically as "variants" (id "water@solid",
// "elem:Fe@liquid" …) with real names (Ice, Dry ice, Liquid nitrogen, Molten iron, Iron
// vapour …) and an appearance derived from the base substance. Temperature then drives
// melting, freezing, boiling, condensing and sublimation (see reactions.js).

import { SUBSTANCES } from './substances.js';

export const ROOM = 22;

const NAMES = {
  'water@solid': 'Ice',
  'water@gas': 'Steam',
  'carbon_dioxide@solid': 'Dry ice',
  'carbon_dioxide@liquid': 'Liquid carbon dioxide',
  'elem:O@liquid': 'Liquid oxygen',
  'elem:O@solid': 'Solid oxygen',
  'elem:N@liquid': 'Liquid nitrogen',
  'elem:N@solid': 'Solid nitrogen',
  'elem:H@liquid': 'Liquid hydrogen',
  'elem:He@liquid': 'Liquid helium',
  'nacl_aq@solid': 'Frozen salt water',
  'elem:Hg@solid': 'Solid mercury',
  'elem:Hg@gas': 'Mercury vapour',
  'elem:I@gas': 'Iodine vapour',
};

const LOOKS = {
  'water@solid': { form: 'ice', color: '#e6f4ff', translucent: true, roughness: 0.08 },
  'carbon_dioxide@solid': { form: 'chunk', color: '#f4f7fa', roughness: 0.75 },
  'elem:O@liquid': { color: '#8fb8ff', opacity: 0.5 },
  'elem:O@solid': { form: 'crystals', color: '#9fc4ff', roughness: 0.2, translucent: true },
  'elem:N@liquid': { color: '#eaf4ff', opacity: 0.14 },
  'elem:Cl@liquid': { color: '#e3d23a', opacity: 0.6 },
  'elem:F@liquid': { color: '#efe86a', opacity: 0.45 },
  'elem:Br@solid': { form: 'crystals', color: '#5a1408', roughness: 0.3 },
  'elem:Br@gas': { color: '#9a3014', opacity: 0.5 },
  'elem:I@liquid': { color: '#3a0f3a', opacity: 0.95, metalness: 0.2 },
  'elem:I@gas': { color: '#7a1fb8', opacity: 0.55 },
  'elem:S@liquid': { color: '#c8661a', opacity: 0.85 },
  'elem:P@liquid': { color: '#d8c88a', opacity: 0.7 },
  'nitrogen_dioxide@liquid': { color: '#d8b84a', opacity: 0.7 },
};

const MOLTEN_SALT = { color: '#fff3d8', opacity: 0.45 };

export const STATES = ['solid', 'liquid', 'gas'];

/** The natural (room-temperature) substance a variant belongs to. */
export function baseOf(s) {
  if (!s) return s;
  return s.base ? SUBSTANCES[s.base] || s : s;
}

/** Phase a substance prefers at temperature T (°C). */
export function phaseAt(base, T) {
  const mp = base.mp, bp = base.bp;
  if (mp === null || mp === undefined) {
    if (bp !== null && bp !== undefined && base.phase !== 'gas' && T >= bp) return 'gas';
    if (bp !== null && bp !== undefined && base.phase === 'gas' && T < bp) return 'liquid';
    return base.phase;
  }
  if (T < mp) return 'solid';
  if (bp !== null && bp !== undefined && T >= bp) return 'gas';
  if (bp !== null && bp !== undefined && bp <= mp) return T < mp ? 'solid' : 'gas'; // sublimes
  return 'liquid';
}

/** A temperature at which the base substance is in the given phase (for the synthesizer). */
export function temperatureFor(base, phase) {
  const mp = base.mp ?? null;
  const bp = base.bp ?? null;
  if (phase === base.phase) return ROOM;
  if (phase === 'solid') return mp !== null ? Math.min(ROOM, mp - 15) : (bp !== null ? bp - 60 : -40);
  if (phase === 'liquid') {
    if (mp !== null && mp > ROOM) return bp !== null ? Math.min(mp + 30, (mp + bp) / 2) : mp + 30;
    if (bp !== null && bp < ROOM) return mp !== null ? Math.max(bp - 3, (mp + bp) / 2) : bp - 3;
    return ROOM;
  }
  if (phase === 'gas') return bp !== null ? Math.max(ROOM, bp + 30) : (mp !== null ? mp + 200 : 300);
  return ROOM;
}

/** Latent heats in lab units (°C·mL per mL); water: fusion 80, vaporisation 540. */
export function latentHeat(base, kind) {
  const w = base.id === 'water' || base.solution;
  if (kind === 'fusion') return w ? 80 : base.element && base.metalness ? 60 : 45;
  return w ? 540 : 220;
}

function lowerFirst(name) {
  if (/^[A-Z]{2}/.test(name) || /\d/.test(name.slice(0, 3))) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function variantName(base, phase) {
  const key = base.id + '@' + phase;
  if (NAMES[key]) return NAMES[key];
  const n = lowerFirst(base.name);
  if (phase === 'solid') return base.solution ? 'Frozen ' + n : 'Solid ' + n;
  if (phase === 'liquid') return base.phase === 'gas' ? 'Liquid ' + n : 'Molten ' + n;
  return base.name + ' vapour';
}

function isWhitish(hex) {
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return r > 215 && g > 215 && b > 205;
}

function variantLook(base, phase) {
  const key = base.id + '@' + phase;
  const metal = (base.metalness || 0) > 0.5;
  let look;
  if (phase === 'solid') {
    if (base.phase === 'liquid' && !metal && base.opacity < 0.5) {
      look = { form: 'ice', color: '#eef6ff', roughness: 0.1, translucent: true, metalness: 0 };
    } else if (base.phase === 'gas') {
      look = base.opacity > 0.1
        ? { form: 'crystals', color: base.color, roughness: 0.3, metalness: 0 }
        : { form: 'crystals', color: '#f1f6fb', roughness: 0.2, translucent: true, metalness: 0 };
    } else {
      look = { form: metal ? 'metal' : 'crystals', color: base.color, roughness: metal ? 0.3 : 0.3, metalness: metal ? 1 : 0 };
    }
  } else if (phase === 'liquid') {
    if (metal) look = { color: base.color, opacity: 1, metalness: 1, roughness: 0.04 };
    else if (base.phase === 'gas') look = base.opacity > 0.1 ? { color: base.color, opacity: 0.6 } : { color: '#e6f0fb', opacity: 0.16 };
    else if (isWhitish(base.color)) look = { ...MOLTEN_SALT };
    else look = { color: base.color, opacity: 0.85, metalness: 0 };
    look.form = 'liquid';
  } else {
    const colored = base.phase === 'gas' ? base.opacity > 0.1 : !isWhitish(base.color) && (base.opacity ?? 1) > 0.5;
    look = { form: 'gas', color: colored ? base.color : '#ffffff', opacity: colored ? 0.3 : 0.06, metalness: 0 };
  }
  return { ...look, ...(LOOKS[key] || {}) };
}

/**
 * The substance id of `baseId` in the given phase (creating the variant on first use).
 */
export function variantId(baseId, phase) {
  const base = baseOf(SUBSTANCES[baseId]);
  if (!base) return baseId;
  if (phase === base.phase) return base.id;
  if (base.id === 'water' && phase === 'gas') return 'steam';
  const id = base.id + '@' + phase;
  if (SUBSTANCES[id]) return id;
  const look = variantLook(base, phase);
  const v = {
    ...base,
    id,
    base: base.id,
    phase,
    name: variantName(base, phase),
    smiles: undefined,
    aq: phase === 'solid' && base.solution ? null : base.aq,
    soluble: phase === 'solid' ? base.soluble : false,
    pH: phase === 'liquid' ? base.pH : null,
    opacity: 1,
    metalness: 0,
    roughness: 0.6,
    translucent: false,
    ...look,
    density: phase === 'gas' ? 0.002 : phase === 'liquid' && base.phase === 'solid' ? (base.density || 1) * 0.92 : base.phase === 'gas' ? 1.1 : (base.density || 1) * 1.05,
    heavy: phase === 'gas' ? (base.molarMass || 30) > 29 : base.heavy,
    light: phase === 'gas' ? (base.molarMass || 30) < 20 : false,
    info: phaseInfo(base, phase),
  };
  SUBSTANCES[id] = v;
  return id;
}

function phaseInfo(base, phase) {
  const t = (v) => (v === null || v === undefined ? null : `${Math.round(v)} °C`);
  if (phase === 'solid') return `${base.name} frozen solid${t(base.mp) ? ` — it melts at ${t(base.mp)}` : ''}.`;
  if (phase === 'liquid') {
    if (base.phase === 'gas') return `${base.name} cooled until it condensed${t(base.bp) ? ` (boils at ${t(base.bp)})` : ''}. It boils away at room temperature!`;
    return `${base.name} heated until it melted${t(base.mp) ? ` (melts at ${t(base.mp)})` : ''}. It solidifies as it cools.`;
  }
  return `${base.name} heated until it boiled${t(base.bp) ? ` (boils at ${t(base.bp)})` : ''}. It condenses again as it cools.`;
}

/** Mark the existing hand-made state variants so they behave like generated ones. */
export function linkExistingVariants() {
  if (SUBSTANCES.steam) Object.assign(SUBSTANCES.steam, { base: 'water', bp: 100, mp: 0 });
  if (SUBSTANCES.iodine_vapor) {
    SUBSTANCES.iodine_vapor.base = 'elem:I';
    SUBSTANCES['elem:I@gas'] = SUBSTANCES.iodine_vapor;
  }
}
linkExistingVariants();

/** Blackbody-ish glow colour for hot things (null below ~450 °C). */
export function glowFor(T) {
  if (T < 450) return null;
  const k = Math.min(1, (T - 450) / 1300);
  const r = 1;
  const g = Math.min(1, 0.12 + k * 0.85);
  const b = Math.min(1, Math.max(0, (k - 0.55) * 1.6));
  return { r, g, b, intensity: 0.4 + k * 2.2 };
}

const known = (v) => v !== null && v !== undefined && Number.isFinite(v);

/**
 * Which states the synthesizer can deliver a substance in. A state is only offered when
 * the substance really reaches it (a known melting / boiling point); things that
 * decompose before melting or boiling (sugar, baking soda …) stay in their natural form.
 */
export function availableForms(sub) {
  const base = baseOf(sub);
  if (!base) return [];
  const out = new Set([base.phase]);
  if (/smoke|foam/.test(base.id) || base.mixture) return [...out];
  if (base.phase === 'gas') {
    if (known(base.bp)) out.add('liquid');
    if (known(base.mp) || known(base.bp)) out.add('solid');
  } else if (base.phase === 'liquid') {
    if (known(base.mp) || base.solution || base.id === 'water') out.add('solid');
    if ((known(base.bp) || base.solution) && !base.decomposes) out.add('gas');
  } else {
    if (known(base.mp) && !base.decomposes) out.add('liquid');
    if (known(base.bp) && !base.decomposes) out.add('gas');
  }
  return STATES.filter((s) => out.has(s));
}
