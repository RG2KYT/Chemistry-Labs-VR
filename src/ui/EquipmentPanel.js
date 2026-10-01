import * as THREE from 'three';
import { Panel } from './Panel.js';
import { CATALOG, CATEGORIES } from '../lab/catalog.js';
import { font, roundRect, drawWrapped, fitFont } from './canvasUtil.js';

/** The equipment list: tap an item to put it on the table (or float it in front of you). */
export class EquipmentPanel extends Panel {
  constructor(app) {
    super(app, { width: 1.3, height: 0.66, pxPerMeter: 1300, title: 'Lab Equipment' });
    this.category = 'All';
    this.page = 0;
    this.lastSpawned = null;
  }

  items() {
    return this.category === 'All' ? CATALOG : CATALOG.filter((d) => d.category === this.category);
  }

  draw(ctx, w, h, portrait) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0f1622');
    bg.addColorStop(1, '#0a0f18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const u = Math.min(w, h) / 860;
    const m = 22 * u;

    ctx.fillStyle = '#e8f4ff';
    ctx.font = font(32 * u, 700);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Lab Equipment', m, m + 20 * u);
    ctx.fillStyle = '#7f93ad';
    ctx.font = font(18 * u, 500);
    ctx.textAlign = 'right';
    if (!portrait) ctx.fillText(this.app.mode === 'lab' ? 'Tap an item to place it on the table' : 'Tap an item — it floats here until you grab it', w - m, m + 20 * u);

    // Category tabs
    let tx = m;
    const ty = m + 50 * u;
    const th = 46 * u;
    ctx.font = font(19 * u, 700);
    for (const cat of CATEGORIES) {
      const tw = ctx.measureText(cat).width + 34 * u;
      const sel = cat === this.category;
      roundRect(ctx, tx, ty, tw, th, th / 2);
      ctx.fillStyle = sel ? '#2fa8ef' : 'rgba(255,255,255,0.07)';
      ctx.fill();
      ctx.fillStyle = sel ? '#ffffff' : '#b8c7da';
      ctx.textAlign = 'center';
      ctx.fillText(cat, tx + tw / 2, ty + th / 2 + 1);
      this.addButton({ id: 'cat-' + cat, x: tx, y: ty, w: tw, h: th, onPress: () => { this.category = cat; this.page = 0; this.dirty = true; } });
      tx += tw + 10 * u;
      if (tx > w - 120 * u && portrait) break;
    }

    // Grid
    const cols = portrait ? 3 : 5;
    const rows = portrait ? 5 : 3;
    const gy = ty + th + 18 * u;
    const footer = 64 * u;
    const gh = h - gy - footer - m * 0.5;
    const gap = 12 * u;
    const cw = (w - 2 * m - (cols - 1) * gap) / cols;
    const ch = (gh - (rows - 1) * gap) / rows;
    const items = this.items();
    const per = cols * rows;
    const pages = Math.max(1, Math.ceil(items.length / per));
    this.page = Math.min(this.page, pages - 1);
    const pageItems = items.slice(this.page * per, this.page * per + per);
    pageItems.forEach((def, i) => {
      const x = m + (i % cols) * (cw + gap);
      const y = gy + Math.floor(i / cols) * (ch + gap);
      this.drawCard(ctx, def, x, y, cw, ch, u);
    });

    // Footer: pager + description of the last spawned item
    const fy = h - footer - m * 0.2;
    const pbw = 54 * u;
    const pby = fy + (footer - pbw) / 2;
    const arrows = [['‹', -1, w - m - pbw * 2 - 10 * u], ['›', 1, w - m - pbw]];
    for (const [sym, dir, x] of arrows) {
      const enabled = dir < 0 ? this.page > 0 : this.page < pages - 1;
      roundRect(ctx, x, pby, pbw, pbw, pbw / 2);
      ctx.fillStyle = enabled ? 'rgba(47,168,239,0.25)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.fillStyle = enabled ? '#ffffff' : '#4d5b6e';
      ctx.font = font(40 * u, 700);
      ctx.textAlign = 'center';
      ctx.fillText(sym, x + pbw / 2, pby + pbw / 2 - 2 * u);
      this.addButton({ id: 'page' + dir, x, y: pby, w: pbw, h: pbw, disabled: !enabled, onPress: () => { this.page += dir; this.dirty = true; } });
    }
    ctx.fillStyle = '#7f93ad';
    ctx.font = font(16 * u, 600);
    ctx.textAlign = 'right';
    ctx.fillText(`${this.page + 1} / ${pages}`, w - m - pbw * 2 - 22 * u, pby + pbw / 2);
    ctx.textAlign = 'left';
    const info = this.lastSpawned ? `${this.lastSpawned.name}: ${this.lastSpawned.desc}` : 'Grab the bars above and below this screen to move it. Rotate it 90° for portrait mode.';
    ctx.fillStyle = this.lastSpawned ? '#cfe6ff' : '#7f93ad';
    ctx.font = font(17 * u, 500);
    drawWrapped(ctx, info, m, fy + 18 * u, w - 2 * m - pbw * 2 - 110 * u, 21 * u, 2);
  }

  drawCard(ctx, def, x, y, w, h, u) {
    roundRect(ctx, x, y, w, h, 14 * u);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(46,62,88,0.9)');
    g.addColorStop(1, 'rgba(26,36,52,0.9)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,227,255,0.25)';
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
    const thumb = this.app.thumbnails?.get(def.id);
    const labelH = 34 * u;
    const ih = h - labelH - 10 * u;
    if (thumb) {
      const s = Math.min(w - 12 * u, ih);
      ctx.drawImage(thumb, x + (w - s) / 2, y + 6 * u, s, s);
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = fitFont(ctx, def.name, w - 12 * u, 17 * u, 700, 9);
    ctx.font = font(fs, 700);
    ctx.fillText(def.name, x + w / 2, y + h - labelH / 2 - 4 * u);
    this.addButton({ id: 'item-' + def.id, x, y, w, h, onPress: () => this.spawn(def) });
  }

  spawn(def) {
    this.lastSpawned = def;
    this.dirty = true;
    this.app.spawnEquipmentFromPanel(def.id, this);
  }

  /** Point in front of the panel (world) used in mixed reality. */
  frontPoint(dist = 0.28) {
    this.screen.updateWorldMatrix(true, false);
    const p = this.screen.getWorldPosition(new THREE.Vector3());
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(this.screen.getWorldQuaternion(new THREE.Quaternion()));
    return p.addScaledVector(n, dist).add(new THREE.Vector3(0, -0.12, 0));
  }
}
