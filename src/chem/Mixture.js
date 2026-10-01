import { SUBSTANCES } from './substances.js';

export const AMBIENT = 22;

function sub(id) {
  return SUBSTANCES[id];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Contents of a container: amounts (mL) per substance id, temperature, precipitate in
 * suspension, foam. Pure data — rendering lives in Container.js.
 */
export class Mixture {
  constructor() {
    this.items = new Map();
    this.suspended = new Map(); // precipitate still floating (makes liquid cloudy)
    this.temperature = AMBIENT;
    this.foam = 0;
    this.burning = 0; // seconds of flame left (0 = not burning)
    this.version = 0;
  }

  amount(id) {
    return (this.items.get(id) || 0) + (this.suspended.get(id) || 0);
  }

  add(id, ml) {
    if (!(ml > 0) || !sub(id)) return;
    this.items.set(id, (this.items.get(id) || 0) + ml);
    this.version++;
  }

  addSuspended(id, ml) {
    if (!(ml > 0)) return;
    this.suspended.set(id, (this.suspended.get(id) || 0) + ml);
    this.version++;
  }

  remove(id, ml) {
    let left = ml;
    const a = this.items.get(id) || 0;
    const take = Math.min(a, left);
    if (take > 0) {
      this.items.set(id, a - take);
      if (a - take < 1e-4) this.items.delete(id);
      left -= take;
    }
    if (left > 0) {
      const s = this.suspended.get(id) || 0;
      const t2 = Math.min(s, left);
      if (t2 > 0) {
        this.suspended.set(id, s - t2);
        if (s - t2 < 1e-4) this.suspended.delete(id);
        left -= t2;
      }
    }
    this.version++;
    return ml - left;
  }

  clear() {
    this.items.clear();
    this.suspended.clear();
    this.foam = 0;
    this.burning = 0;
    this.temperature = AMBIENT;
    this.version++;
  }

  *entries() {
    for (const [id, ml] of this.items) yield [id, ml, sub(id)];
  }

  volumeOf(phase) {
    let v = 0;
    for (const [id, ml] of this.items) if (sub(id).phase === phase) v += ml;
    return v;
  }

  get liquidVolume() {
    let v = this.volumeOf('liquid');
    for (const ml of this.suspended.values()) v += ml;
    return v;
  }

  get solidVolume() {
    return this.volumeOf('solid');
  }

  get gasVolume() {
    return this.volumeOf('gas');
  }

  get total() {
    return this.liquidVolume + this.solidVolume;
  }

  get isEmpty() {
    return this.items.size === 0 && this.suspended.size === 0 && this.foam < 0.1;
  }

  /** Mass in grams. */
  get mass() {
    let m = 0;
    for (const [id, ml] of this.items) m += ml * (sub(id).density || 1);
    for (const [id, ml] of this.suspended) m += ml * (sub(id).density || 1);
    return m;
  }

  /** pH of the liquid phase (null when there is no aqueous liquid). */
  get pH() {
    let total = 0;
    let c = 0;
    let anyAqueous = false;
    for (const [id, ml] of this.items) {
      const s = sub(id);
      if (s.phase !== 'liquid') continue;
      total += ml;
      if (s.pH !== null && s.pH !== undefined) {
        anyAqueous = true;
        c += (Math.pow(10, -s.pH) - Math.pow(10, s.pH - 14)) * ml;
      }
    }
    if (!anyAqueous || total <= 0) return null;
    c /= total;
    if (Math.abs(c) < 1e-7) return 7;
    if (c > 0) return Math.max(-1, -Math.log10(c));
    return Math.min(15, 14 + Math.log10(-c));
  }

  /** Liquid colour & opacity (mixed by volume, tinted by suspended precipitate). */
  liquidLook() {
    let r = 0, g = 0, b = 0, a = 0, w = 0;
    let metal = 0;
    for (const [id, ml] of this.items) {
      const s = sub(id);
      if (s.phase !== 'liquid') continue;
      const [cr, cg, cb] = hexToRgb(s.color);
      // Strongly coloured solutions dominate weakly coloured ones.
      const k = ml * (0.15 + s.opacity);
      r += cr * k; g += cg * k; b += cb * k; a += s.opacity * ml; w += k;
      metal += (s.metalness || 0) * ml;
    }
    const lv = this.volumeOf('liquid');
    let turb = 0;
    let tr = 0, tg = 0, tb = 0;
    for (const [id, ml] of this.suspended) {
      const [cr, cg, cb] = hexToRgb(sub(id).color);
      tr += cr * ml; tg += cg * ml; tb += cb * ml; turb += ml;
    }
    if (w <= 0 && turb <= 0) return null;
    let color = w > 0 ? [r / w, g / w, b / w] : [1, 1, 1];
    let opacity = lv > 0 ? a / lv : 0.2;
    if (turb > 0) {
      const f = Math.min(1, (turb / Math.max(1, lv + turb)) * 6);
      color = color.map((c, i) => c * (1 - f) + [tr, tg, tb][i] / turb * f);
      opacity = opacity * (1 - f) + 0.92 * f;
    }
    return { color, opacity, metalness: lv > 0 ? metal / lv : 0 };
  }

  dominant(phase) {
    let best = null, bv = 0;
    for (const [id, ml] of this.items) {
      const s = sub(id);
      if (s.phase === phase && ml > bv) { bv = ml; best = s; }
    }
    return best;
  }

  gasLook() {
    let r = 0, g = 0, b = 0, a = 0, w = 0;
    for (const [id, ml] of this.items) {
      const s = sub(id);
      if (s.phase !== 'gas') continue;
      const [cr, cg, cb] = hexToRgb(s.color);
      r += cr * ml; g += cg * ml; b += cb * ml; a += s.opacity * ml; w += ml;
    }
    if (w <= 0) return null;
    return { color: [r / w, g / w, b / w], opacity: a / w, volume: w };
  }

  /** Remove a fraction of the liquid phase (incl. suspension) and return it as a Mixture. */
  takeLiquid(ml) {
    const out = new Mixture();
    const lv = this.liquidVolume;
    if (lv <= 0 || ml <= 0) return out;
    const f = Math.min(1, ml / lv);
    for (const [id, v] of [...this.items]) {
      if (sub(id).phase !== 'liquid') continue;
      const t = v * f;
      this.remove(id, t);
      out.add(id, t);
    }
    for (const [id, v] of [...this.suspended]) {
      const t = v * f;
      this.suspended.set(id, v - t);
      out.addSuspended(id, t);
    }
    out.temperature = this.temperature;
    this.version++;
    return out;
  }

  takeSolid(ml) {
    const out = new Mixture();
    const sv = this.solidVolume;
    if (sv <= 0 || ml <= 0) return out;
    const f = Math.min(1, ml / sv);
    for (const [id, v] of [...this.items]) {
      if (sub(id).phase !== 'solid') continue;
      const t = v * f;
      this.remove(id, t);
      out.add(id, t);
    }
    out.temperature = this.temperature;
    return out;
  }

  /** Mix another mixture into this one (temperature is volume-weighted). */
  addMixture(other) {
    const v0 = this.total, v1 = other.total;
    if (v0 + v1 > 0) this.temperature = (this.temperature * v0 + other.temperature * v1) / (v0 + v1);
    for (const [id, ml] of other.items) this.add(id, ml);
    for (const [id, ml] of other.suspended) this.addSuspended(id, ml);
    this.foam += other.foam;
  }

  /** Corrosive to things it is poured on? */
  get isCorrosive() {
    const p = this.pH;
    if (p !== null && p < 3) return true;
    for (const [id] of this.items) if (sub(id).etchesGlass) return true;
    return false;
  }

  get etchesGlass() {
    for (const [id, ml] of this.items) if (sub(id).etchesGlass && ml > 1) return true;
    return false;
  }

  /** Summary lines for displays: [{ name, formula, amount, unit }]. */
  summary() {
    const out = [];
    const all = new Map(this.items);
    for (const [id, ml] of this.suspended) all.set(id, (all.get(id) || 0) + ml);
    for (const [id, ml] of all) {
      if (ml < 0.05) continue;
      const s = sub(id);
      if (s.phase === 'solid') out.push({ s, name: s.name, formula: s.formula, amount: ml * s.density, unit: 'g' });
      else if (s.phase === 'gas') out.push({ s, name: s.name, formula: s.formula, amount: ml, unit: 'mL gas' });
      else out.push({ s, name: s.name, formula: s.formula, amount: ml, unit: 'mL' });
    }
    out.sort((a, b) => b.amount - a.amount);
    return out;
  }

  clone() {
    const m = new Mixture();
    for (const [id, ml] of this.items) m.items.set(id, ml);
    for (const [id, ml] of this.suspended) m.suspended.set(id, ml);
    m.temperature = this.temperature;
    m.foam = this.foam;
    return m;
  }
}
