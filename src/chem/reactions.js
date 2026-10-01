// Mixing chemistry: what happens when substances meet inside a container.
// Simplified kinetics with realistic outcomes (neutralisation, fizzing carbonates,
// alkali metals in water, precipitates, displacement, catalysed peroxide foam, flames…).

import { SUBSTANCES, findSalt, FLAME_COLORS } from './substances.js';
import { AMBIENT } from './Mixture.js';
import { baseOf, phaseAt, variantId, latentHeat } from './phases.js';
import { findOrMakeSalt, solutionFor, isSoluble } from './ions.js';

const ACTIVITY = ['Cs', 'Rb', 'K', 'Na', 'Li', 'Ba', 'Sr', 'Ca', 'Mg', 'Al', 'Zn', 'Fe', 'Ni', 'Sn', 'Pb', 'H', 'Cu', 'Ag', 'Hg', 'Pt', 'Au'];
const WATER_RATE = { Li: 0.35, Na: 1.1, K: 2.4, Rb: 5, Cs: 8, Fr: 8, Ca: 0.25, Sr: 0.4, Ba: 0.6 };
const HYDROXIDE = { Li: 'lioh_aq', Na: 'naoh_aq', K: 'koh_aq', Rb: 'koh_aq', Cs: 'koh_aq', Fr: 'koh_aq', Ca: 'caoh2_aq', Sr: 'caoh2_aq', Ba: 'caoh2_aq' };
const SLAKE = { cao: ['caoh2', 0.8, 40], na2o: ['naoh_aq', 3, 30], k2o: ['koh_aq', 3, 35] };

const S = (id) => SUBSTANCES[id];

function solutionOf(salt) {
  if (!salt) return null;
  if (salt.solution || salt.acid || salt.base) return salt.id;
  if (salt.aq) return salt.aq;
  return null;
}

/** The product salt of a cation and an anion: its solution, or a precipitate if insoluble. */
function productFor(cation, anion, charge = null) {
  const salt = findOrMakeSalt(cation, anion, charge);
  if (!salt) return { id: 'generic_salt_aq', precipitate: false };
  if (!isSoluble(cation, anion, charge ?? salt.ions?.charge)) return { id: salt.id, precipitate: true };
  return { id: solutionFor(salt) || solutionOf(salt) || salt.id, precipitate: false };
}
void findSalt;

/**
 * Advance the chemistry of a mixture.
 * env: { heatRate °C/s, flame: bool, stirring 0..1 }
 * Returns a list of events for visuals / sound.
 */
export function react(mix, dt, env = {}) {
  const ev = [];
  const water = () => mix.items.get('water') || 0;
  const vol = () => Math.max(5, mix.total);
  const heat = (deg) => { mix.temperature += deg; };
  const entries = () => [...mix.items].map(([id, ml]) => [id, ml, S(id)]);

  // --- Dissolving & slaking ---------------------------------------------------------
  for (const [id, ml, s] of entries()) {
    if (s.phase !== 'solid' || ml <= 0) continue;
    const w = water();
    if (w < 0.05) continue;
    if (SLAKE[id]) {
      const [prod, ratio, hot] = SLAKE[id];
      const r = Math.min(ml, 1.5 * dt, w / 2);
      mix.remove(id, r);
      mix.remove('water', r * 1.5);
      mix.add(prod, r * ratio);
      heat((hot * r) / vol() * 4);
      ev.push({ type: 'steam', intensity: Math.min(1, r * 6) });
      continue;
    }
    if (s.soluble && s.aq) {
      const rate = 2.2 * (1 + 2.5 * (env.stirring || 0)) * (1 + Math.max(0, mix.temperature - AMBIENT) / 35);
      const r = Math.min(ml, rate * dt, w / 3);
      if (r <= 0) continue;
      mix.remove(id, r);
      mix.remove('water', r * 3);
      mix.add(s.aq, r * 4);
      if (s.dissolveHeat) heat((s.dissolveHeat * r) / vol() * 6);
      ev.push({ type: 'dissolve', intensity: Math.min(1, r * 10) });
    }
  }

  // --- Alkali / alkaline-earth metals + water ------------------------------------------
  for (const [id, ml, s] of entries()) {
    if (!s.reactsWithWater || ml <= 0) continue;
    const w = water() + mix.volumeOf('liquid') * 0.5;
    if (w < 0.2) continue;
    const sym = s.reactsWithWater;
    const r = Math.min(ml, (WATER_RATE[sym] || 0.5) * dt);
    mix.remove(id, r);
    mix.remove('water', r * 2);
    mix.add(HYDROXIDE[sym] || 'naoh_aq', r * 3);
    mix.add('elem:H', r * 25);
    heat((60 * r) / vol() * 4);
    const violent = ['Rb', 'Cs', 'Fr'].includes(sym);
    ev.push({ type: 'fizz', intensity: Math.min(1, 0.4 + r * 30) });
    if (sym === 'Na') ev.push({ type: 'sparks', color: FLAME_COLORS.Na, intensity: 0.6 });
    if (sym === 'K') ev.push({ type: 'surfaceFlame', color: FLAME_COLORS.K, intensity: 1 });
    if (sym === 'Li') ev.push({ type: 'sparks', color: '#ffd9d9', intensity: 0.2 });
    if (violent && ml > 0.05) ev.push({ type: 'explode', intensity: 1 });
  }

  // --- Carbonates + acids → CO₂ fizz ----------------------------------------------------
  for (const [cid, cml, cs] of entries()) {
    if (!cs.carbonate || cml <= 0) continue;
    for (const [aid, aml, as] of entries()) {
      if (!as.acid || aml <= 0) continue;
      const rate = (cs.phase === 'solid' ? 2.5 : 8) * (as.weakAcid ? 0.8 : 1.4);
      const r = Math.min(mix.amount(cid), mix.amount(aid), rate * dt);
      if (r <= 0) continue;
      mix.remove(cid, r);
      mix.remove(aid, r);
      const p = productFor(cs.ions.cation, as.ions.anion);
      if (p.precipitate) mix.addSuspended(p.id, r * 0.4);
      else mix.add(p.id, r);
      mix.add('water', r * 0.5);
      mix.add('carbon_dioxide', r * 18);
      mix.foam += r * (as.weakAcid ? 3.2 : 1.6);
      ev.push({ type: 'fizz', intensity: Math.min(1, r * 4) });
    }
  }

  // --- Reactive metals + acids → H₂ ---------------------------------------------------
  for (const [mid, mml, ms] of entries()) {
    if (!ms.reactsWithAcid || mml <= 0) continue;
    for (const [aid, aml, as] of entries()) {
      if (!as.acid || aml <= 0 || as.ions?.anion === 'NO3') continue; // nitric acid gives NO₂ instead (below)
      const r = Math.min(mix.amount(mid), mix.amount(aid) / 4, (as.weakAcid ? 0.08 : 0.35) * dt);
      if (r <= 0) continue;
      mix.remove(mid, r);
      mix.remove(aid, r * 4);
      const p = productFor(ms.element, as.ions.anion);
      if (p.precipitate) mix.addSuspended(p.id, r);
      else mix.add(p.id, r * 4);
      mix.add('elem:H', r * 30);
      heat((25 * r) / vol() * 4);
      ev.push({ type: 'fizz', intensity: Math.min(1, 0.3 + r * 20) });
    }
  }

  // --- Neutralisation (acid + base → salt + water) ---------------------------------
  for (const [aid, , as] of entries()) {
    if (!as.acid) continue;
    for (const [bid, , bs] of entries()) {
      if (!bs.base || bs.carbonate) continue;
      const r = Math.min(mix.amount(aid), mix.amount(bid), 30 * dt);
      if (r <= 0) continue;
      mix.remove(aid, r);
      mix.remove(bid, r);
      const p = productFor(bs.ions.cation, as.ions.anion);
      if (p.precipitate) mix.addSuspended(p.id, r * 0.4);
      else mix.add(p.id, r);
      mix.add('water', r);
      heat((14 * r) / vol() * 3);
      ev.push({ type: 'neutralize', intensity: Math.min(1, r) });
      if (bid === 'ammonia' && as.ions.anion === 'Cl') ev.push({ type: 'smoke', color: '#ffffff', intensity: 0.8 });
    }
  }

  // --- Precipitation (ion exchange) -----------------------------------------------------
  const ionic = entries().filter(([, ml, s]) => s.phase === 'liquid' && s.ions && ml > 0);
  for (let i = 0; i < ionic.length; i++) {
    for (let j = i + 1; j < ionic.length; j++) {
      for (const [A, B] of [[ionic[i], ionic[j]], [ionic[j], ionic[i]]]) {
        const sa = A[2], sb = B[2];
        if (sa.ions.cation === 'H' && sb.ions.anion === 'OH') continue;
        if (sa.ions.cation === sb.ions.cation || sa.ions.anion === sb.ions.anion) continue;
        if (isSoluble(sa.ions.cation, sb.ions.anion, sa.ions.charge)) continue;
        const ppt = findOrMakeSalt(sa.ions.cation, sb.ions.anion, sa.ions.charge);
        if (!ppt || ppt.phase !== 'solid') continue;
        const r = Math.min(mix.amount(A[0]), mix.amount(B[0]), 20 * dt);
        if (r <= 0) continue;
        mix.remove(A[0], r);
        mix.remove(B[0], r);
        mix.addSuspended(ppt.id, r * 0.3);
        const other = productFor(sb.ions.cation, sa.ions.anion, sb.ions.charge);
        if (other.precipitate) mix.addSuspended(other.id, r * 0.3);
        else mix.add(other.id, r * 1.7);
        ev.push({ type: 'precipitate', color: ppt.color, intensity: 1 });
      }
    }
  }

  // --- Metal displacement (e.g. iron nail in copper sulfate) -------------------------
  for (const [mid, mml, ms] of entries()) {
    if (ms.phase !== 'solid' || !ms.element || !SUBSTANCES[mid].metalness) continue;
    const mi = ACTIVITY.indexOf(ms.element);
    if (mi < 0) continue;
    for (const [sid, sml, ss] of entries()) {
      if (!ss.solution || !ss.ions || sml <= 0) continue;
      const ci = ACTIVITY.indexOf(ss.ions.cation);
      if (ci < 0 || ci <= mi || ss.ions.cation === 'H') continue;
      const r = Math.min(mix.amount(mid), mix.amount(sid) / 6, 0.15 * dt);
      if (r <= 0) continue;
      mix.remove(mid, r);
      mix.remove(sid, r * 6);
      const p = productFor(ms.element, ss.ions.anion);
      if (p.precipitate) mix.addSuspended(p.id, r);
      else mix.add(p.id, r * 6);
      mix.add(ss.ions.cation === 'Cu' ? 'copper_deposit' : SUBSTANCES['elem:' + ss.ions.cation] ? 'elem:' + ss.ions.cation : 'copper_deposit', r * 0.8);
      ev.push({ type: 'deposit', intensity: 0.3 });
    }
  }

  // --- Limewater + CO₂ turns milky -------------------------------------------------------
  if (mix.amount('caoh2_aq') > 0 && mix.amount('carbon_dioxide') > 0) {
    const r = Math.min(mix.amount('caoh2_aq'), mix.amount('carbon_dioxide') / 10, 4 * dt);
    mix.remove('caoh2_aq', r);
    mix.remove('carbon_dioxide', r * 10);
    mix.add('water', r * 0.9);
    mix.addSuspended('caco3', r * 0.1);
    ev.push({ type: 'precipitate', color: '#f2f2ef', intensity: 0.5 });
  }

  // --- Hydrogen peroxide + catalyst → "elephant toothpaste" -------------------------
  if (mix.amount('hydrogen_peroxide') > 0) {
    const cat = entries().some(([, ml, s]) => s.catalystH2O2 && ml > 0.01);
    if (cat) {
      const r = Math.min(mix.amount('hydrogen_peroxide'), 7 * dt);
      mix.remove('hydrogen_peroxide', r);
      mix.add('water', r);
      mix.add('elem:O', r * 20);
      mix.foam += r * 7;
      heat((20 * r) / vol() * 3);
      ev.push({ type: 'foam', intensity: Math.min(1, r * 2) });
      ev.push({ type: 'steam', intensity: 0.4 });
    }
  }

  // --- Sulfuric acid + sugar → carbon snake ---------------------------------------------
  if (mix.amount('sulfuric_acid') > 0.5 && mix.amount('glucose') > 0) {
    const r = Math.min(mix.amount('glucose'), 0.8 * dt);
    mix.remove('glucose', r);
    mix.add('elem:C', r * 5);
    mix.add('steam', r * 30);
    heat((90 * r) / vol() * 3);
    ev.push({ type: 'steam', intensity: 1 });
    ev.push({ type: 'smoke', color: '#555555', intensity: 0.5 });
  }

  // --- Potassium permanganate + glycerol → spontaneous fire ---------------------------
  if (mix.amount('kmno4') > 0.1 && mix.amount('glycerol') > 0.1) {
    mix._kmno4Timer = (mix._kmno4Timer || 0) + dt;
    ev.push({ type: 'smoke', color: '#bbbbbb', intensity: Math.min(1, mix._kmno4Timer / 4) });
    if (mix._kmno4Timer > 4) {
      mix.remove('kmno4', mix.amount('kmno4'));
      mix.remove('glycerol', mix.amount('glycerol'));
      mix.add('mno2', 0.5);
      mix.burning = 6;
      mix._kmno4Timer = 0;
      ev.push({ type: 'ignite', color: '#ff7aff' });
    }
  }

  // --- Sodium + chlorine → salt with a bright flash ---------------------------------------
  if (mix.amount('elem:Na') > 0 && mix.amount('elem:Cl') > 2) {
    const r = Math.min(mix.amount('elem:Na'), mix.amount('elem:Cl') / 20, 0.5 * dt);
    mix.remove('elem:Na', r);
    mix.remove('elem:Cl', r * 20);
    mix.add('nacl', r);
    heat(30 * r);
    ev.push({ type: 'flash', color: '#fff2a8', intensity: 1 });
  }

  // --- Fire --------------------------------------------------------------------------
  const flammable = entries().filter(([, ml, s]) => s.flammable && s.phase === 'liquid' && ml > 0);
  const flamVol = flammable.reduce((a, [, ml]) => a + ml, 0);
  const liq = mix.volumeOf('liquid');
  if (env.flame && flamVol > 0.5 && flamVol / Math.max(1, liq) > 0.35 && mix.burning <= 0) {
    mix.burning = 999;
    ev.push({ type: 'ignite', color: '#ffb25a' });
  }
  if (mix.burning > 0) {
    if (mix.burning < 900) mix.burning -= dt;
    const fuel = flammable.length ? flammable[0] : null;
    if (fuel) {
      const r = Math.min(fuel[1], 0.35 * dt);
      mix.remove(fuel[0], r);
      mix.add('carbon_dioxide', r * 8);
      heat(4 * dt);
    }
    if ((!fuel || flamVol / Math.max(1, liq) < 0.3) && mix.burning > 900) mix.burning = 0;
    if (mix.burning > 0) ev.push({ type: 'burning', color: fuel && fuel[0] === 'methanol' ? '#7fb2ff' : '#ffb25a' });
  }
  // Hydrogen "squeaky pop" test
  if (env.flame && mix.amount('elem:H') > 3) {
    const big = mix.amount('elem:O') > 3;
    mix.remove('elem:H', mix.amount('elem:H'));
    if (big) mix.remove('elem:O', mix.amount('elem:O'));
    mix.add('water', 0.2);
    ev.push({ type: big ? 'bang' : 'pop' });
  }
  // Flame-test colours
  if (env.flame) {
    for (const [, ml, s] of entries()) {
      if (s.flame && ml > 0.01 && (s.phase === 'solid' || s.solution)) {
        ev.push({ type: 'flameColor', color: s.flame });
        break;
      }
    }
  }

  realWorldReactions(mix, dt, env, ev, entries, heat, vol);

  // --- Temperature & changes of state -------------------------------------------------
  phaseChanges(mix, dt, env, ev);

  // --- Gas escape, settling, foam decay ----------------------------------------------
  for (const [id, ml, s] of entries()) {
    if (s.phase !== 'gas') continue;
    const k = s.light || id === 'elem:H' || id === 'elem:He' || id === 'steam' ? 0.25 : s.heavy ? 0.025 : 0.06;
    mix.remove(id, ml * Math.min(1, k * dt));
    if (mix.amount(id) < 0.5) mix.remove(id, mix.amount(id));
  }
  if (mix.suspended.size && !(env.stirring > 0.2)) {
    for (const [id, ml] of [...mix.suspended]) {
      const r = Math.max(ml * 0.18 * dt, Math.min(ml, 0.02 * dt));
      mix.suspended.set(id, ml - r);
      mix.add(id, r);
      if (ml - r < 0.01) { mix.suspended.delete(id); mix.add(id, ml - r); }
    }
  }
  if (mix.foam > 0) {
    mix.foam *= Math.max(0, 1 - 0.1 * dt);
    if (mix.foam < 0.2) mix.foam = 0;
  }
  return ev;
}

// ---------------------------------------------------------------------------------------
// Direct combination: when two physical forms are brought together they react the way the
// elements combine in real chemistry (2 H₂ + O₂ → 2 H₂O, metal + halogen → salt, …).
// Gas volumes are converted to liquid/solid at game scale so the product is visible.

const GAS_TO_CONDENSED = 1 / 40;
const NONMETAL_RULES = [
  { r: [['elem:H', 2], ['elem:O', 1]], p: ['water', 2] },
  { r: [['elem:H', 1], ['elem:Cl', 1]], p: ['hydrochloric_acid', 2] },
  { r: [['elem:H', 1], ['elem:F', 1]], p: ['hydrofluoric_acid', 2] },
  { r: [['elem:H', 1], ['elem:Br', 1]], p: ['hydrobromic_acid', 2] },
  { r: [['elem:H', 1], ['elem:I', 1]], p: ['hydroiodic_acid', 2] },
  { r: [['elem:N', 1], ['elem:H', 3]], p: ['ammonia', 2] },
  { r: [['elem:C', 1], ['elem:O', 1]], p: ['carbon_dioxide', 1] },
  { r: [['elem:S', 1], ['elem:O', 1]], p: ['sulfur_dioxide', 1] },
  { r: [['elem:H', 1], ['elem:S', 1]], p: ['hydrogen_sulfide', 1] },
];
const ANION_OF = { 'elem:O': 'O', 'elem:Cl': 'Cl', 'elem:F': 'F', 'elem:Br': 'Br', 'elem:I': 'I', 'elem:S': 'S' };

function units(mix, id) {
  const s = S(id);
  const ml = mix.amount(id);
  return s.phase === 'gas' ? ml * GAS_TO_CONDENSED : ml;
}

function take(mix, id, u) {
  const s = S(id);
  mix.remove(id, s.phase === 'gas' ? u / GAS_TO_CONDENSED : u);
}

function give(mix, id, u) {
  const s = S(id);
  if (s.phase === 'gas') mix.add(id, u / GAS_TO_CONDENSED);
  else mix.add(id, u);
}

export function combineSynthesis(mix) {
  const ev = [];
  for (const rule of NONMETAL_RULES) {
    let extent = Infinity;
    for (const [id, n] of rule.r) extent = Math.min(extent, units(mix, id) / n);
    if (!(extent > 0.01)) continue;
    for (const [id, n] of rule.r) take(mix, id, extent * n);
    give(mix, rule.p[0], extent * rule.p[1]);
    mix.temperature += Math.min(60, extent * 8);
    ev.push({ type: 'combine', product: rule.p[0], violent: rule.p[0] === 'water' || rule.p[0] === 'hydrochloric_acid' });
  }
  // Metal + non-metal element → its salt / oxide / sulfide.
  for (const [mid, , ms] of [...mix.items].map(([id, ml]) => [id, ml, S(id)])) {
    if (!ms.element || !ms.metalness || ms.phase !== 'solid') continue;
    for (const nid of Object.keys(ANION_OF)) {
      if (mix.amount(nid) <= 0) continue;
      const salt = findSalt(ms.element, ANION_OF[nid]);
      if (!salt || salt.phase !== 'solid') continue;
      const extent = Math.min(units(mix, mid), units(mix, nid));
      if (!(extent > 0.01)) continue;
      take(mix, mid, extent);
      take(mix, nid, extent);
      mix.add(salt.id, extent * 1.5);
      mix.temperature += Math.min(80, extent * 10);
      ev.push({ type: 'combine', product: salt.id, violent: true });
    }
  }
  return ev;
}

// ---------------------------------------------------------------------------------------
// Heat flow and changes of state (melting, freezing, boiling, condensing, sublimation).
// Heat comes from the surroundings (room, freezer) and from heat sources; while something
// is changing state the temperature stays pinned at its melting / boiling point.

const GAS_EXPANSION = 20; // mL of gas per mL of liquid/solid (lab scale)

function transitionsAt(mix, heating) {
  const list = [];
  for (const [id, ml] of mix.items) {
    if (ml < 0.01) continue;
    const s = SUBSTANCES[id];
    const base = baseOf(s);
    if (heating) {
      // Things that fall apart at their "melting point" decompose instead of melting.
      const dec = s.phase === 'solid' ? decompositionOf(s) : null;
      if (dec && base.mp !== null && base.mp !== undefined && dec.t <= base.mp + 20) continue;
      if (s.phase === 'solid' && base.mp !== null && base.mp !== undefined) {
        const sublimes = base.bp !== null && base.bp !== undefined && base.bp <= base.mp;
        list.push({ id, s, base, t: sublimes ? base.bp : base.mp, to: sublimes ? 'gas' : 'liquid' });
      } else if (s.phase === 'liquid' && base.bp !== null && base.bp !== undefined) {
        list.push({ id, s, base, t: base.bp, to: 'gas' });
      } else if (s.phase === 'solid' && base.bp !== null && base.bp !== undefined && (base.mp === null || base.mp === undefined)) {
        list.push({ id, s, base, t: base.bp, to: 'gas' });
      }
    } else {
      if (s.phase === 'liquid' && base.mp !== null && base.mp !== undefined) list.push({ id, s, base, t: base.mp, to: 'solid' });
      else if (s.phase === 'gas' && base.bp !== null && base.bp !== undefined && !(base.mp !== null && base.mp !== undefined && base.bp <= base.mp)) {
        list.push({ id, s, base, t: base.bp, to: 'liquid' });
      }
    }
  }
  return list;
}

function convert(mix, tr, amountCondensed, ev) {
  // amountCondensed is measured in condensed (liquid/solid) mL.
  const { id, s, base, to } = tr;
  const have = s.phase === 'gas' ? mix.amount(id) / GAS_EXPANSION : mix.amount(id);
  const n = Math.min(have, amountCondensed);
  if (n <= 0) return 0;
  mix.remove(id, s.phase === 'gas' ? n * GAS_EXPANSION : n);
  if (to === 'gas' && s.solution) {
    // Boiling a solution: the water leaves as steam, the dissolved salt stays as crystals.
    const solute = Object.values(SUBSTANCES).find((x) => x.aq === base.id);
    if (solute) mix.add(solute.id, n * 0.2);
    mix.add('steam', n * GAS_EXPANSION);
  } else {
    const target = variantId(base.id, to);
    mix.add(target, to === 'gas' ? n * GAS_EXPANSION : n);
  }
  ev.push({ type: to === 'gas' ? 'boil' : s.phase === 'gas' ? 'condense' : to === 'liquid' ? 'melt' : 'freeze', intensity: Math.min(1, 0.3 + n * 4), id });
  return n;
}

export function phaseChanges(mix, dt, env, ev) {
  const V = Math.max(4, mix.total);
  const envT = env.envTemp ?? AMBIENT;
  const tau = 35 * Math.sqrt(V / 60) / (env.envCoupling || 1); // fan-forced freezers couple faster
  let q = (envT - mix.temperature) / tau + (env.heatRate || 0) * (60 / V); // °C per second
  let T = mix.temperature;
  let T1 = T + q * dt;
  if (!Number.isFinite(T1)) T1 = AMBIENT;
  // Anything in the wrong state for the temperature changes state (ice in warm water melts,
  // a liquid colder than its freezing point freezes …). The heat for it comes from the rest
  // of the mixture, but only as fast as heat can flow — so an ice cube floats for a while.
  const up = transitionsAt(mix, true).filter((tr) => tr.t < T1 - 0.01).sort((a, b) => a.t - b.t);
  const down = transitionsAt(mix, false).filter((tr) => tr.t > T1 + 0.01).sort((a, b) => b.t - a.t);
  const tr = up[0] || down[0];
  if (tr) {
    const heating = tr === up[0];
    const crossing = heating ? T <= tr.t + 0.5 : T >= tr.t - 0.5; // just reached the transition
    const gap = Math.abs(T1 - tr.t);
    const flow = crossing ? gap : Math.min(gap, (0.6 + Math.abs(q)) * dt + gap * Math.min(1, dt * 0.04));
    const L = latentHeat(tr.base, (tr.s.phase === 'gas' || tr.to === 'gas') ? 'vaporisation' : 'fusion');
    const done = convert(mix, tr, (flow * V) / L + (gap < 1 ? 0.002 * dt : 0), ev);
    const used = (done * L) / V; // °C of the whole mixture spent on the change of state
    T = heating ? Math.max(tr.t, T1 - used) : Math.min(tr.t, T1 + used);
  } else {
    T = T1;
  }
  mix.temperature = T;
  // Natural evaporation of very volatile liquids below their boiling point (e.g. ether).
  for (const [id, ml] of [...mix.items]) {
    const s = SUBSTANCES[id];
    const base = baseOf(s);
    if (s.phase !== 'liquid' || base.bp === null || base.bp === undefined || base.solution || base.acid || base.base || base.pH !== null || id === 'water') continue;
    if (base.bp < 60 && T < base.bp) {
      const r = Math.min(ml, (0.004 + (60 - base.bp) * 0.0004) * dt * ml);
      mix.remove(id, r);
      if (r > 0.001) mix.add(variantId(base.id, 'gas'), r * GAS_EXPANSION);
    }
  }
}

/** Is a substance in the state it naturally has at this temperature? */
export function stableAt(s, T) {
  return phaseAt(baseOf(s), T) === s.phase;
}

// ---------------------------------------------------------------------------------------
// Real-world chemistry for the whole library (driven by the ion model in ions.js).

const GROUP12 = new Set(['Li', 'Na', 'K', 'Rb', 'Cs', 'Ca', 'Sr', 'Ba']);
const NOBLE_ISH = new Set(['Cu', 'Ag', 'Hg', 'Bi', 'Pb', 'Sn', 'Zn', 'Ni', 'Co', 'Fe', 'Mg', 'Cd', 'Mn', 'Al']);

/** A substance created when first needed (bromine water, deep-blue copper ammine …). */
function ensure(id, props) {
  if (!SUBSTANCES[id]) {
    SUBSTANCES[id] = {
      id, phase: 'liquid', form: 'liquid', opacity: 0.3, metalness: 0, roughness: 0.05, emissive: null, emissiveIntensity: 0,
      pH: 7, density: 1.02, mp: -2, bp: 101, soluble: false, aq: null, hazards: [], ions: null, flame: null, solution: true, ...props,
    };
  }
  return id;
}

const oxideOf = (cation, charge) => {
  if (cation === 'Ag' || cation === 'Hg' || cation === 'Au' || cation === 'Pt') return 'elem:' + cation;
  const s = findOrMakeSalt(cation, 'O', charge);
  return s ? s.id : null;
};

/** When (and into what) a solid falls apart on heating. Cached on the substance. */
function decompositionOf(s) {
  if (s._decomp !== undefined) return s._decomp;
  let r = null;
  const ions = s.ions;
  if (ions && s.phase === 'solid') {
    const { cation, anion, charge } = ions;
    const T = (tab, def) => tab[cation] ?? def;
    if (anion === 'CO3' && !['Na', 'K', 'Rb', 'Cs', 'NH4'].includes(cation)) {
      r = { t: T({ Mg: 350, Ca: 825, Sr: 1100, Ba: 1360, Zn: 300, Cu: 290, Pb: 315, Fe: 400, Mn: 350, Ni: 350, Co: 350, Cd: 350, Ag: 220, Li: 1300 }, 400),
        solid: [[oxideOf(cation, charge), 0.6]], gas: [['carbon_dioxide', 15]], note: 'carbonate' };
    } else if (anion === 'HCO3') {
      r = { t: 80, solid: [[findOrMakeSalt(cation, 'CO3')?.id, 0.6]], gas: [['carbon_dioxide', 10], ['steam', 5]] };
    } else if (anion === 'NO3') {
      if (['Na', 'K', 'Rb', 'Cs'].includes(cation)) r = { t: 500, solid: [[findOrMakeSalt(cation, 'NO2')?.id, 0.8]], gas: [['elem:O', 8]] };
      else if (cation !== 'NH4') {
        r = { t: T({ Cu: 170, Pb: 470, Zn: 300, Mg: 330, Ca: 500, Ag: 440, Fe: 150, Al: 150, Ba: 590, Sr: 570, Ni: 200, Co: 200, Mn: 200, Hg: 400, Li: 600 }, 300),
          solid: [[oxideOf(cation, charge), 0.4]], gas: [['nitrogen_dioxide', 15], ['elem:O', 4]] };
      }
    } else if (anion === 'OH' && !['Na', 'K', 'Rb', 'Cs', 'Li'].includes(cation)) {
      r = { t: T({ Cu: 80, Zn: 125, Fe: 200, Mg: 350, Ca: 580, Al: 300, Ni: 230, Co: 168, Pb: 145, Cd: 130, Mn: 200, Ba: 800, Sr: 710, Cr: 250 }, 250),
        solid: [[oxideOf(cation, charge), 0.6]], gas: [['steam', 10]] };
    } else if (anion === 'ClO3' || anion === 'ClO4') {
      r = { t: anion === 'ClO3' ? 400 : 550, solid: [[findOrMakeSalt(cation, 'Cl')?.id, 0.6]], gas: [['elem:O', 20]], catalysed: anion === 'ClO3' ? 250 : null };
    } else if (anion === 'O' && ['Hg', 'Ag', 'Au'].includes(cation)) {
      r = { t: T({ Hg: 500, Ag: 300, Au: 160 }, 400), solid: [['elem:' + cation, 0.5]], gas: [['elem:O', 15]], note: 'Priestley discovered oxygen this way (1774)' };
    } else if (cation === 'NH4') {
      if (anion === 'Cl') r = { t: 338, solid: [], gas: [['nh4cl_smoke', 20]] };
      else if (anion === 'Cr2O7') r = { t: 180, solid: [['cr2o3', 1.6]], gas: [['elem:N', 10], ['steam', 10]], sparks: '#ff9a3a', note: 'the "ammonium dichromate volcano"' };
      else if (anion === 'NO3') r = { t: 210, solid: [], gas: [['nitrous_oxide', 15], ['steam', 10]] };
      else if (anion === 'CO3' || anion === 'HCO3') r = { t: 58, solid: [], gas: [['carbon_dioxide', 10], ['steam', 6]] };
    } else if (cation === 'K' && anion === 'MnO4') {
      r = { t: 240, solid: [['mno2', 0.4]], gas: [['elem:O', 10]] };
    }
  }
  // Sugars and other carbohydrates caramelise and char instead of boiling.
  if (!r && s.phase === 'solid' && s.carbohydrate) r = { t: Math.max(190, (s.mp ?? 150) + 30), solid: [['elem:C', 0.4]], gas: [['steam', 12]], smoke: '#6a5a4a' };
  s._decomp = r;
  return r;
}

const COMBUSTION = {
  Mg: { color: '#ffffff', flash: true, t: 470 }, Na: { color: FLAME_COLORS.Na, t: 300 }, K: { color: FLAME_COLORS.K, t: 300 },
  Li: { color: FLAME_COLORS.Li, t: 350 }, Ca: { color: FLAME_COLORS.Ca, t: 500 }, Sr: { color: FLAME_COLORS.Sr, t: 500 },
  Ba: { color: FLAME_COLORS.Ba, t: 500 }, S: { color: '#3a5fff', gas: 'sulfur_dioxide', t: 232 }, P: { color: '#fff8e8', smoke: '#ffffff', t: 260 },
  C: { color: '#ff6a1a', gas: 'carbon_dioxide', t: 700, glow: true }, Fe: { color: '#ffb347', sparks: true, t: 900, needsFlame: true },
  Al: { color: '#ffffff', sparks: true, t: 900, needsFlame: true }, Zn: { color: '#b8ffd8', t: 900, needsFlame: true },
  Ti: { color: '#ffffff', sparks: true, t: 1200, needsFlame: true },
};

export function realWorldReactions(mix, dt, env, ev, entries, heat, vol) {
  const water = mix.amount('water') + mix.volumeOf('liquid') * 0.3;
  const T = mix.temperature;

  for (const [id, ml, s] of entries()) {
    if (ml <= 0.001) continue;

    // --- Compounds that react with water --------------------------------------------
    if (s.phase === 'solid' && s.ions && mix.amount('water') > 0.2) {
      const { cation, anion } = s.ions;
      let done = false;
      const r = Math.min(ml, 0.8 * dt, mix.amount('water') / 3);
      const hydroxide = () => productFor(cation, 'OH');
      if (anion === 'H') { // hydrides → hydroxide + hydrogen
        mix.remove(id, r); mix.remove('water', r);
        const p = hydroxide(); p.precipitate ? mix.addSuspended(p.id, r) : mix.add(p.id, r * 2);
        mix.add('elem:H', r * 30); heat((40 * r) / vol() * 4);
        ev.push({ type: 'fizz', intensity: Math.min(1, 0.4 + r * 20) });
        done = true;
      } else if (anion === 'C2') { // calcium carbide → acetylene
        mix.remove(id, r); mix.remove('water', r * 2);
        const p = hydroxide(); p.precipitate ? mix.addSuspended(p.id, r) : mix.add(p.id, r);
        mix.add('ethyne', r * 30); heat((20 * r) / vol() * 4);
        ev.push({ type: 'fizz', intensity: Math.min(1, 0.5 + r * 20) });
        done = true;
      } else if (anion === 'O2') { // peroxides → hydroxide + oxygen
        mix.remove(id, r); mix.remove('water', r);
        const p = hydroxide(); p.precipitate ? mix.addSuspended(p.id, r) : mix.add(p.id, r * 2);
        mix.add('elem:O', r * 15); heat((30 * r) / vol() * 4);
        ev.push({ type: 'fizz', intensity: 0.7 });
        done = true;
      } else if (anion === 'N' || anion === 'P') { // nitrides → ammonia, phosphides → phosphine
        mix.remove(id, r); mix.remove('water', r * 2);
        const p = hydroxide(); p.precipitate ? mix.addSuspended(p.id, r) : mix.add(p.id, r);
        mix.add(anion === 'N' ? 'ammonia' : 'phosphine', anion === 'N' ? r : r * 20);
        ev.push({ type: 'fizz', intensity: 0.5 });
        done = true;
      } else if (anion === 'O' && GROUP12.has(cation) && !SLAKE[id]) { // basic oxides slake
        mix.remove(id, r); mix.remove('water', r);
        const p = hydroxide(); p.precipitate ? mix.addSuspended(p.id, r * 1.2) : mix.add(p.id, r * 2.5);
        heat((35 * r) / vol() * 4);
        ev.push({ type: 'steam', intensity: Math.min(1, r * 6) });
        done = true;
      }
      if (done) continue;
    }
    // Covalent chlorides fume and hydrolyse in water (TiCl₄, SiCl₄, PCl₃, SOCl₂, acetyl chloride …)
    if (s.fuming && water > 0.2) {
      const r = Math.min(ml, 1.5 * dt, water / 2);
      mix.remove(id, r); mix.remove('water', Math.min(mix.amount('water'), r));
      mix.add('hydrochloric_acid', r * 2);
      const other = s.hydrolyses;
      if (other) {
        const sub = SUBSTANCES[other];
        if (sub && sub.phase === 'solid') mix.addSuspended(other, r * 0.5);
        else if (sub) mix.add(other, sub.phase === 'gas' ? r * 15 : r);
      }
      heat((25 * r) / vol() * 4);
      ev.push({ type: 'smoke', color: '#f4f4f4', intensity: 1 });
      ev.push({ type: 'fizz', intensity: 0.6 });
      continue;
    }

    // --- Metal oxides, hydroxides and carbonates dissolve in acids --------------------
    if (s.basicSolid && s.ions) {
      for (const [aid, aml, as] of entries()) {
        if (!as.acid || aml <= 0 || as.phase !== 'liquid' || as.ions?.cation !== 'H') continue;
        const rate = 0.35 * (1 + Math.max(0, T - AMBIENT) / 25) * (1 + 2 * (env.stirring || 0));
        const r = Math.min(mix.amount(id), mix.amount(aid) / 3, rate * dt);
        if (r <= 0) continue;
        mix.remove(id, r); mix.remove(aid, r * 3);
        const p = productFor(s.ions.cation, as.ions.anion, s.ions.charge);
        if (p.precipitate) mix.addSuspended(p.id, r); else mix.add(p.id, r * 3);
        mix.add('water', r);
        if (s.ions.anion === 'CO3') { mix.add('carbon_dioxide', r * 18); ev.push({ type: 'fizz', intensity: Math.min(1, r * 6) }); }
        heat((10 * r) / vol() * 3);
        ev.push({ type: 'dissolve', intensity: Math.min(1, r * 10) });
      }
    }

    // --- Nitric acid attacks even copper and silver: brown NO₂ ------------------------
    if (s.element && s.phase === 'solid' && (s.metalness || 0) > 0.5 && NOBLE_ISH.has(s.element) && mix.amount('nitric_acid') > 0.1) {
      const r = Math.min(ml, mix.amount('nitric_acid') / 4, 0.25 * dt * (1 + Math.max(0, T - AMBIENT) / 30));
      mix.remove(id, r); mix.remove('nitric_acid', r * 4);
      const p = productFor(s.element, 'NO3', ['Fe', 'Al'].includes(s.element) ? 3 : null);
      if (p.precipitate) mix.addSuspended(p.id, r); else mix.add(p.id, r * 4);
      mix.add('nitrogen_dioxide', r * 40);
      heat((30 * r) / vol() * 4);
      ev.push({ type: 'fizz', intensity: Math.min(1, 0.4 + r * 15) });
    }
    // Hot concentrated sulfuric acid dissolves copper with SO₂
    if (s.element === 'Cu' && s.phase === 'solid' && mix.amount('sulfuric_acid') > 0.1 && T > 100) {
      const r = Math.min(ml, mix.amount('sulfuric_acid') / 2, 0.15 * dt);
      mix.remove(id, r); mix.remove('sulfuric_acid', r * 2);
      mix.add(solutionFor(findOrMakeSalt('Cu', 'SO4')) || 'cuso4_aq', r * 2);
      mix.add('sulfur_dioxide', r * 25);
      ev.push({ type: 'fizz', intensity: 0.5 });
    }

    // --- Thermal decomposition ---------------------------------------------------------
    const d = s.phase === 'solid' ? decompositionOf(s) : null;
    if (d) {
      const catalysed = d.catalysed && entries().some(([, m2, s2]) => s2.catalystH2O2 && m2 > 0.01);
      const tDec = catalysed ? d.catalysed : d.t;
      if (T >= tDec) {
        const r = Math.min(ml, (0.25 + (T - tDec) / 200) * dt);
        mix.remove(id, r);
        for (const [pid, k] of d.solid) if (pid && SUBSTANCES[pid]) mix.add(pid, r * k);
        for (const [gid, k] of d.gas) if (SUBSTANCES[gid]) mix.add(gid, r * k);
        heat(-(5 * r) / vol()); // decomposition takes heat
        ev.push({ type: 'smoke', color: d.smoke || (d.gas.some(([g]) => g === 'nitrogen_dioxide') ? '#9a3c12' : '#e8e8e8'), intensity: Math.min(1, 0.3 + r * 8) });
        if (d.sparks) ev.push({ type: 'sparks', color: d.sparks, intensity: 1 });
      }
    }

    // --- Burning solids (magnesium, sulfur, sugar, wax …) -------------------------------
    const comb = s.phase === 'solid' && (s.element ? COMBUSTION[s.element] : s.combustible ? { color: '#ffb25a', gas: 'carbon_dioxide', smoke: '#555555', t: 350, organic: true } : null);
    if (comb && (env.flame || T > comb.t) && (s.element ? (s.metalness || 0) > 0.3 || !s.metalness : true)) {
      const lit = env.flame || !comb.needsFlame;
      if (lit) {
        const r = Math.min(ml, (comb.flash ? 0.6 : 0.3) * dt);
        mix.remove(id, r);
        if (comb.gas) mix.add(comb.gas, r * 20);
        if (comb.organic) mix.add('steam', r * 15);
        else if (!comb.gas && !comb.smoke) { const ox = oxideOf(s.element); if (ox) mix.add(ox, r * 1.4); }
        heat((comb.flash ? 60 : 30) * r / vol() * 4);
        ev.push({ type: 'burning', color: comb.color });
        if (comb.flash) ev.push({ type: 'flash', color: '#ffffff', intensity: 1 });
        if (comb.sparks) ev.push({ type: 'sparks', color: comb.color, intensity: 1 });
        if (comb.smoke) ev.push({ type: 'smoke', color: comb.smoke, intensity: 0.6 });
      }
    }
  }

  // --- Copper(II) + ammonia → deep royal-blue tetraamminecopper(II) ---------------------
  const nh3 = mix.amount('ammonia');
  if (nh3 > 0.5) {
    for (const [id, ml, s] of entries()) {
      if (!(s.ions && s.ions.cation === 'Cu' && (s.solution || s.id === 'cuoh2' || s.ions.anion === 'OH')) || ml <= 0) continue;
      const r = Math.min(ml, mix.amount('ammonia') / 2, 3 * dt);
      mix.remove(id, r); mix.remove('ammonia', r * 2);
      mix.add(ensure('cu_ammine_aq', { name: 'Tetraamminecopper(II) solution', formula: '[Cu(NH3)4]2+(aq)', color: '#1d2fc8', opacity: 0.85, pH: 10.5,
        info: 'The deep royal blue that appears when ammonia is added to copper(II) ions — a classic test for Cu²⁺.' }), r * 3);
      ev.push({ type: 'precipitate', color: '#1d2fc8', intensity: 0.5 });
    }
  }

  // --- Halogen displacement: Cl₂ frees bromine and iodine; Br₂ frees iodine -------------
  const HAL = [['elem:Cl', 'Cl', ['Br', 'I']], ['elem:Br', 'Br', ['I']]];
  for (const [hid, hx, weaker] of HAL) {
    const have = mix.amount(hid) / (SUBSTANCES[hid].phase === 'gas' ? 20 : 1) + (hx === 'Br' ? mix.amount('bromine_water') * 0.2 : 0);
    if (have <= 0.01) continue;
    for (const [id, ml, s] of entries()) {
      if (!s.solution || !s.ions || !weaker.includes(s.ions.anion) || ml <= 0) continue;
      const r = Math.min(ml, have * 4, 4 * dt);
      mix.remove(id, r);
      const used = r / 4;
      if (mix.amount(hid) > 0) mix.remove(hid, SUBSTANCES[hid].phase === 'gas' ? used * 20 : used); else mix.remove('bromine_water', used * 5);
      const p = productFor(s.ions.cation, hx, s.ions.charge);
      if (p.precipitate) mix.addSuspended(p.id, r * 0.3); else mix.add(p.id, r);
      const freed = s.ions.anion === 'Br'
        ? ensure('bromine_water', { name: 'Bromine water', formula: 'Br2(aq)', color: '#e0861a', opacity: 0.55, pH: 4, hazards: ['toxic'],
          info: 'Bromine dissolved in water — orange-brown. Decolourises when shaken with an alkene.' })
        : ensure('iodine_solution', { name: 'Iodine solution', formula: 'I2(aq)', color: '#8a3c0e', opacity: 0.75, pH: 6,
          info: 'Iodine freed from iodide ions — brown in water (it turns blue-black with starch).' });
      mix.add(freed, r * 0.6);
      ev.push({ type: 'precipitate', color: SUBSTANCES[freed].color, intensity: 0.6 });
    }
  }
}
