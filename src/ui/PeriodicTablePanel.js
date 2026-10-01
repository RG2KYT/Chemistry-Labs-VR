import * as THREE from 'three';
import { Panel } from './Panel.js';
import { ELEMENTS, CATEGORIES, BY_SYMBOL } from '../chem/elements.js';
import { font, roundRect, drawFormula, fitFont, drawWrapped, hexToRgba } from './canvasUtil.js';
import { drawUndoButton } from './undoButton.js';

const NOBLE_CORES = { He: '1s2', Ne: '[He] 2s2 2p6', Ar: '[Ne] 3s2 3p6', Kr: '[Ar] 3d10 4s2 4p6', Xe: '[Kr] 4d10 5s2 5p6', Rn: '[Xe] 4f14 5d10 6s2 6p6' };

/** Electrons per shell (K, L, M, …) from an electron configuration string. */
export function shellCounts(config) {
  let s = config;
  for (let i = 0; i < 6; i++) s = s.replace(/\[(\w+)\]/g, (_, g) => NOBLE_CORES[g]);
  const shells = [];
  for (const tok of s.trim().split(/\s+/)) {
    const m = tok.match(/^(\d)([spdf])(\d+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    shells[n - 1] = (shells[n - 1] || 0) + Number(m[3]);
  }
  for (let i = 0; i < shells.length; i++) shells[i] = shells[i] || 0;
  return shells;
}

function fmtTemp(k) {
  if (k === null || k === undefined) return '—';
  return `${(k - 273.15).toFixed(k > 1000 ? 0 : 1)} °C`;
}

function superscriptConfig(cfg) {
  return cfg;
}

export class PeriodicTablePanel extends Panel {
  constructor(app) {
    super(app, { width: 1.56, height: 0.9, pxPerMeter: 1300, title: 'Periodic Table' });
    this.selected = BY_SYMBOL.H;
    this.cardRect = null;
    this.message = null;
  }

  select(el) {
    this.selected = el;
    this.dirty = true;
  }

  /** World position in front of the detail card where new atoms appear. */
  spawnPoint() {
    const local = new THREE.Vector3();
    if (this.cardRect) this.pxToLocal(this.cardRect.x + this.cardRect.w * 0.5, this.cardRect.y + this.cardRect.h * 0.45, local);
    this.screen.updateWorldMatrix(true, false);
    const world = this.screen.localToWorld(local.clone());
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(this.screen.getWorldQuaternion(new THREE.Quaternion()));
    return world.addScaledVector(n, 0.2);
  }

  spawn(el, diatomic) {
    const p = this.spawnPoint();
    this.app.molecules.spawnElement(el.symbol, p, { diatomic });
  }

  draw(ctx, w, h, portrait) {
    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0f1622');
    bg.addColorStop(1, '#0a0f18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const u = Math.min(w, h) / 900; // unit scale
    const m = 22 * u;

    // Header
    ctx.fillStyle = '#e8f4ff';
    ctx.font = font(30 * u, 700);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('Periodic Table of the Elements', m, m + 18 * u);
    ctx.fillStyle = '#7f93ad';
    ctx.font = font(17 * u, 500);
    ctx.textAlign = 'right';
    ctx.fillText(portrait ? 'Tap an element' : 'Tap an element · tap again to add an atom', w - m, m + 18 * u);

    const top = m + 48 * u;
    const footerH = 54 * u;
    let gridW, gridH, gridX, gridY;
    if (portrait) {
      gridX = m;
      gridW = w - 2 * m;
      gridY = top;
      gridH = Math.min(h * 0.42, (gridW / 18) * 1.15 * 9.4);
    } else {
      gridX = m;
      gridW = w - 2 * m;
      gridY = top;
      gridH = h - top - footerH - m * 0.6;
    }
    const gap = Math.max(2, 4 * u);
    const tw = (gridW - 17 * gap) / 18;
    const th = Math.min(tw * 1.18, (gridH - 9 * gap) / 9.35);
    const rowY = (row) => gridY + (row - 1) * (th + gap) + (row >= 9 ? th * 0.35 : 0);
    const colX = (col) => gridX + (col - 1) * (tw + gap);

    // Tiles
    for (const el of ELEMENTS) {
      this.drawTile(ctx, el, colX(el.col), rowY(el.row), tw, th, u);
    }
    // f-block placeholders
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [row, label, cat] of [[6, '57–71', 'LN'], [7, '89–103', 'AC']]) {
      const x = colX(3), y = rowY(row);
      roundRect(ctx, x, y, tw, th, 5 * u);
      ctx.fillStyle = hexToRgba(CATEGORIES[cat].color, 0.12);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(CATEGORIES[cat].color, 0.5);
      ctx.setLineDash([4 * u, 3 * u]);
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#b7c4d6';
      ctx.font = font(Math.min(tw * 0.22, 14 * u), 600);
      ctx.fillText(label, x + tw / 2, y + th / 2);
    }

    // Detail card
    let card;
    if (portrait) {
      const cy = gridY + gridH + m * 0.8;
      card = { x: m, y: cy, w: w - 2 * m, h: h - cy - footerH - m * 0.6 };
    } else {
      const x = colX(3) + tw * 0.15;
      const y = rowY(1);
      card = { x, y, w: colX(13) - x - tw * 0.15 - gap, h: rowY(4) - y - gap * 1.5 };
    }
    this.cardRect = card;
    this.drawCard(ctx, card, u, portrait);

    // Footer: legend + clear button
    const fy = h - footerH - m * 0.3;
    this.drawFooter(ctx, m, fy, w - 2 * m, footerH, u, portrait);
  }

  drawTile(ctx, el, x, y, w, h, u) {
    const cat = CATEGORIES[el.category];
    const sel = this.selected === el;
    roundRect(ctx, x, y, w, h, 5 * u);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, hexToRgba(cat.color, sel ? 0.95 : 0.34));
    g.addColorStop(1, hexToRgba(cat.color, sel ? 0.75 : 0.18));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = sel ? 3 * u : 1.2 * u;
    ctx.strokeStyle = sel ? '#ffffff' : hexToRgba(cat.color, 0.7);
    ctx.stroke();

    const dark = sel;
    ctx.fillStyle = dark ? '#0b1220' : '#dfe9f6';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = font(Math.min(w * 0.2, 13 * u), 600);
    ctx.fillText(String(el.z), x + w * 0.08, y + h * 0.06);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dark ? '#05080f' : '#ffffff';
    ctx.font = font(Math.min(w * 0.42, h * 0.4), 700);
    ctx.fillText(el.symbol, x + w / 2, y + h * 0.5);
    if (w > 46 * u) {
      ctx.fillStyle = dark ? '#16243a' : '#b8c7da';
      const s = fitFont(ctx, el.name, w * 0.92, Math.min(w * 0.15, 11 * u), 500, 6);
      ctx.font = font(s, 500);
      ctx.fillText(el.name, x + w / 2, y + h * 0.83);
    }
    if (el.synthetic) {
      ctx.fillStyle = dark ? '#7a2340' : '#ff9ab8';
      ctx.beginPath();
      ctx.arc(x + w * 0.86, y + h * 0.14, Math.max(2, w * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
    this.addButton({
      id: 'el-' + el.symbol, x, y, w, h,
      onPress: () => {
        if (this.selected === el) this.spawn(el, false);
        else this.select(el);
      },
    });
  }

  drawCard(ctx, c, u, portrait) {
    const el = this.selected;
    const cat = CATEGORIES[el.category];
    roundRect(ctx, c.x, c.y, c.w, c.h, 14 * u);
    ctx.fillStyle = 'rgba(20,30,46,0.92)';
    ctx.fill();
    ctx.strokeStyle = hexToRgba(cat.color, 0.6);
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    const pad = 16 * u;
    // Big symbol tile
    const bs = Math.min(c.h * (portrait ? 0.34 : 0.62), c.w * 0.22);
    const bx = c.x + pad, by = c.y + pad;
    roundRect(ctx, bx, by, bs, bs, 10 * u);
    const g = ctx.createLinearGradient(bx, by, bx, by + bs);
    g.addColorStop(0, cat.color);
    g.addColorStop(1, hexToRgba(cat.color, 0.7));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = '#0a1120';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = font(bs * 0.14, 700);
    ctx.fillText(String(el.z), bx + bs * 0.08, by + bs * 0.07);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(bs * 0.46, 800);
    ctx.fillText(el.symbol, bx + bs / 2, by + bs * 0.52);
    ctx.font = font(bs * 0.11, 600);
    ctx.fillText(el.mass.toFixed(el.mass < 100 ? 3 : 2), bx + bs / 2, by + bs * 0.86);

    // Name + category
    const tx = bx + bs + pad;
    const tw = c.x + c.w - pad - tx;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    const ns = fitFont(ctx, el.name, tw, 34 * u, 700);
    ctx.font = font(ns, 700);
    ctx.fillText(el.name, tx, by);
    // category chip
    ctx.font = font(15 * u, 600);
    const chipText = cat.name + (el.synthetic ? ' · synthetic' : '');
    const chipW = ctx.measureText(chipText).width + 18 * u;
    roundRect(ctx, tx, by + ns + 8 * u, chipW, 24 * u, 12 * u);
    ctx.fillStyle = hexToRgba(cat.color, 0.25);
    ctx.fill();
    ctx.fillStyle = cat.color;
    ctx.textBaseline = 'middle';
    ctx.fillText(chipText, tx + 9 * u, by + ns + 20 * u);

    // Facts
    const facts = [
      ['State (20 °C)', el.stateName],
      ['Electron config.', superscriptConfig(el.config)],
      ['Electronegativity', el.electronegativity ?? '—'],
      ['Melting point', fmtTemp(el.meltingPoint)],
      ['Boiling point', fmtTemp(el.boilingPoint)],
      ['Density', el.density !== null ? `${el.density < 0.01 ? el.density.toFixed(5) : el.density} g/cm³` : '—'],
      ['Bonds (valence)', el.valences.join(', ')],
      ['Group · Period', `${el.group ?? 'f-block'} · ${el.period}`],
    ];
    const fy0 = by + ns + 44 * u;
    const cols = portrait ? 2 : 2;
    const colW = tw / cols;
    const lineH = 22 * u;
    ctx.textBaseline = 'top';
    facts.forEach(([k, v], i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = tx + col * colW;
      const y = fy0 + row * lineH * 1.05;
      if (y + lineH > c.y + c.h - 60 * u && !portrait) return;
      ctx.fillStyle = '#7f93ad';
      ctx.font = font(13 * u, 500);
      ctx.fillText(k, x, y);
      ctx.fillStyle = '#e6f0fb';
      ctx.font = font(15 * u, 600);
      const vs = String(v);
      const fs = fitFont(ctx, vs, colW - 120 * u, 15 * u, 600, 8);
      ctx.font = font(fs, 600);
      ctx.fillText(vs, x + 118 * u, y - 1 * u);
    });

    // Buttons
    const btnH = Math.min(52 * u, c.h * 0.2);
    const btnY = portrait ? by + bs + pad * 0.8 : c.y + c.h - btnH - pad;
    const btnX = portrait ? bx : tx;
    const btnAvail = portrait ? c.w - 2 * pad : tw;
    const buttons = [{ id: 'spawn-atom', label: `+ ${el.symbol} atom`, onPress: () => this.spawn(el, false), primary: true }];
    if (el.diatomic) {
      buttons.push({ id: 'spawn-di', label: `+ ${el.symbol}2 molecule`, formula: true, onPress: () => this.spawn(el, true) });
    }
    const bw = Math.min(260 * u, (btnAvail - (buttons.length - 1) * 12 * u) / buttons.length);
    buttons.forEach((b, i) => {
      const x = btnX + i * (bw + 12 * u);
      this.drawButton(ctx, x, btnY, bw, btnH, b.label, u, b.primary, b.formula);
      this.addButton({ id: b.id, x, y: btnY, w: bw, h: btnH, onPress: b.onPress });
    });

    // Portrait extra: Bohr model of the atom
    if (portrait) {
      const top = Math.max(btnY + btnH + pad, fy0 + Math.ceil(facts.length / cols) * lineH * 1.05 + pad);
      const area = { x: c.x + pad, y: top, w: c.w - 2 * pad, h: c.y + c.h - top - pad };
      if (area.h > 80 * u) this.drawBohr(ctx, el, area, u);
    }
  }

  drawButton(ctx, x, y, w, h, label, u, primary, formula) {
    roundRect(ctx, x, y, w, h, h / 2);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    if (primary) {
      g.addColorStop(0, '#3fb6ff');
      g.addColorStop(1, '#1f86d6');
    } else {
      g.addColorStop(0, '#2c3a52');
      g.addColorStop(1, '#222d40');
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = primary ? '#9fdcff' : '#4d6283';
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    if (formula) {
      drawFormula(ctx, label, x + w / 2, y + h / 2 + 1, Math.min(20 * u, h * 0.42), { align: 'center', baseline: 'middle', weight: 700 });
    } else {
      ctx.textAlign = 'center';
      ctx.font = font(Math.min(20 * u, h * 0.42), 700);
      ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    }
  }

  drawBohr(ctx, el, a, u) {
    const shells = shellCounts(el.config);
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const maxR = Math.min(a.w, a.h) / 2 - 8 * u;
    const n = shells.length;
    ctx.fillStyle = '#7f93ad';
    ctx.font = font(13 * u, 500);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Bohr model · electrons per shell: ' + shells.join(', '), a.x, a.y);
    const nucleusR = Math.max(10 * u, maxR * 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, nucleusR, 0, Math.PI * 2);
    ctx.fillStyle = CATEGORIES[el.category].color;
    ctx.fill();
    ctx.fillStyle = '#0a1120';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(nucleusR * 0.8, 800);
    ctx.fillText(el.symbol, cx, cy);
    for (let i = 0; i < n; i++) {
      const r = nucleusR + ((maxR - nucleusR) * (i + 1)) / n;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(140,180,220,0.35)';
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
      const count = shells[i];
      for (let e = 0; e < count; e++) {
        const ang = (e / count) * Math.PI * 2 + i * 0.4;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, Math.max(2.5 * u, 4 * u - n * 0.3 * u), 0, Math.PI * 2);
        ctx.fillStyle = '#9fe7ff';
        ctx.fill();
      }
    }
  }

  drawFooter(ctx, x, y, w, h, u, portrait) {
    // Clear button on the right
    const bw = 190 * u;
    const bh = Math.min(42 * u, h * 0.8);
    const bx = x + w - bw;
    const by = y + (h - bh) / 2;
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(255,90,90,0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,120,0.7)';
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
    ctx.fillStyle = '#ffb3b3';
    ctx.font = font(17 * u, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Clear all atoms', bx + bw / 2, by + bh / 2);
    this.addButton({ id: 'clear', x: bx, y: by, w: bw, h: bh, onPress: () => this.app.molecules.clearAll() });
    const ux = bx - bw * 0.62 - 12 * u;
    drawUndoButton(this, ctx, ux, by, bw * 0.62, bh, u);

    // Legend
    let lx = x;
    let ly = y + (portrait ? 2 * u : h / 2 - 9 * u);
    ctx.textAlign = 'left';
    ctx.font = font(13 * u, 600);
    const maxX = bx - bw * 0.62 - 28 * u;
    for (const [code, cat] of Object.entries(CATEGORIES)) {
      const tw = ctx.measureText(cat.name).width + 26 * u;
      if (lx + tw > maxX) {
        lx = x;
        ly += 20 * u;
        if (ly > y + h - 10 * u) break;
      }
      ctx.fillStyle = cat.color;
      roundRect(ctx, lx, ly + 2 * u, 14 * u, 14 * u, 3 * u);
      ctx.fill();
      ctx.fillStyle = '#b8c7da';
      ctx.textBaseline = 'top';
      ctx.fillText(cat.name, lx + 19 * u, ly + 2 * u);
      lx += tw;
      void code;
    }
  }
}

export { drawWrapped };
