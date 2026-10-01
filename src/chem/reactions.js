// Mixing chemistry: what happens when substances meet inside a container.
// Simplified kinetics with realistic outcomes (neutralisation, fizzing carbonates,
// alkali metals in water, precipitates, displacement, catalysed peroxide foam, flames…).

import { SUBSTANCES, findSalt, FLAME_COLORS } from './substances.js';
import { AMBIENT } from './Mixture.js';

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

/** Find the dissolved form of the salt made of a cation and an anion. */
function productFor(cation, anion) {
  const salt = findSalt(cation, anion);
  if (!salt) return { id: 'generic_salt_aq', precipitate: false };
  if (salt.phase === 'solid' && !salt.soluble) return { id: salt.id, precipitate: true };
  return { id: solutionOf(salt) || salt.id, precipitate: false };
}

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
      if (!as.acid || aml <= 0) continue;
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
        const ppt = findSalt(sa.ions.cation, sb.ions.anion);
        if (!ppt || ppt.soluble || ppt.phase !== 'solid') continue;
        const r = Math.min(mix.amount(A[0]), mix.amount(B[0]), 20 * dt);
        if (r <= 0) continue;
        mix.remove(A[0], r);
        mix.remove(B[0], r);
        mix.addSuspended(ppt.id, r * 0.3);
        const other = productFor(sb.ions.cation, sa.ions.anion);
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
      mix.add(ss.ions.cation === 'Cu' ? 'copper_deposit' : 'elem:' + ss.ions.cation, r * 0.8);
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

  // --- Heating, boiling, sublimation --------------------------------------------------
  const v = vol();
  if (env.heatRate) mix.temperature += env.heatRate * (60 / v) * dt;
  mix.temperature += (AMBIENT - mix.temperature) * 0.02 * dt * (v < 20 ? 3 : 1);
  // Boiling: the most volatile liquid boils first and pins the temperature.
  let minBp = Infinity, boiler = null;
  for (const [id, ml, s] of entries()) {
    if (s.phase !== 'liquid' || ml < 0.05 || s.bp === null || s.bp === undefined) continue;
    if (s.bp < minBp) { minBp = s.bp; boiler = [id, ml, s]; }
  }
  if (boiler && mix.temperature >= minBp) {
    mix.temperature = minBp;
    const r = Math.min(boiler[1], (0.4 + Math.max(0, env.heatRate || 0) * 0.25) * dt);
    mix.remove(boiler[0], r);
    if (boiler[2].solution) {
      // Evaporating a solution leaves the dissolved salt behind as crystals.
      const solute = Object.values(SUBSTANCES).find((x) => x.aq === boiler[0]);
      if (solute) mix.add(solute.id, r * 0.2);
    }
    mix.add('steam', r * 20);
    ev.push({ type: 'boil', intensity: Math.min(1, 0.4 + (env.heatRate || 0) / 4) });
  }
  if (mix.amount('elem:I') > 0 && mix.temperature > 90) {
    const r = Math.min(mix.amount('elem:I'), 0.2 * dt);
    mix.remove('elem:I', r);
    mix.add('iodine_vapor', r * 30);
  }

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
