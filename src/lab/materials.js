import * as THREE from 'three';

// Shared physically-based materials for lab equipment.
const cache = {};

function once(key, make) {
  if (!cache[key]) cache[key] = make();
  return cache[key];
}

export const M = {
  glass: () => once('glass', () => new THREE.MeshPhysicalMaterial({
    color: 0xf4fbff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.2,
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.8, depthWrite: false, side: THREE.FrontSide,
    specularIntensity: 1, emissive: 0x000000,
  })),
  // For open, single-surface glass (no wall thickness) that must be visible from inside too.
  glassDouble: () => once('glassDouble', () => {
    const m = M.glass().clone();
    m.side = THREE.DoubleSide;
    m.opacity = 0.14;
    return m;
  }),
  amberGlass: () => once('amberGlass', () => new THREE.MeshPhysicalMaterial({
    color: 0x9a5a1c, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.62,
    clearcoat: 1, envMapIntensity: 1.5, depthWrite: false, side: THREE.FrontSide,
  })),
  porcelain: () => once('porcelain', () => new THREE.MeshPhysicalMaterial({ color: 0xf7f6f1, roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.1 })),
  porcelainMatte: () => once('porcelainMatte', () => new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.75 })),
  steel: () => once('steel', () => new THREE.MeshStandardMaterial({ color: 0xc7ccd2, metalness: 1, roughness: 0.28 })),
  darkSteel: () => once('darkSteel', () => new THREE.MeshStandardMaterial({ color: 0x4b5058, metalness: 0.9, roughness: 0.4 })),
  brass: () => once('brass', () => new THREE.MeshStandardMaterial({ color: 0xc9a046, metalness: 1, roughness: 0.3 })),
  chrome: () => once('chrome', () => new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.08 })),
  rubber: () => once('rubber', () => new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.9 })),
  redRubber: () => once('redRubber', () => new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.7 })),
  blueRubber: () => once('blueRubber', () => new THREE.MeshStandardMaterial({ color: 0x2d6fd6, roughness: 0.6 })),
  wood: () => once('wood', () => new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.7 })),
  plasticWhite: () => once('plasticWhite', () => new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.45 })),
  plasticBlue: () => once('plasticBlue', () => new THREE.MeshStandardMaterial({ color: 0x2f7fd8, roughness: 0.4 })),
  plasticDark: () => once('plasticDark', () => new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5 })),
  plasticTranslucent: () => once('plasticTranslucent', () => new THREE.MeshPhysicalMaterial({
    color: 0xf3f1ea, roughness: 0.35, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.FrontSide,
  })),
  washBottle: () => once('washBottle', () => new THREE.MeshPhysicalMaterial({
    color: 0xeef6ff, roughness: 0.4, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.FrontSide,
  })),
  cork: () => once('cork', () => new THREE.MeshStandardMaterial({ color: 0xa9784a, roughness: 0.95 })),
  screen: () => once('screen', () => new THREE.MeshBasicMaterial({ color: 0x0b1a12 })),
  gauze: () => once('gauze', () => new THREE.MeshStandardMaterial({ color: 0x8e9196, metalness: 0.7, roughness: 0.6, transparent: true, opacity: 0.85 })),
  ceramicPad: () => once('ceramicPad', () => new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.95 })),
};

// ---------------------------------------------------------------------------------------
// Geometry helpers

/** Lathe from [r, y] points (y up). */
export function lathe(points, segments = 40) {
  const pts = points.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

/**
 * A thin-walled vessel. `cavity` lists [r, y] of the inner surface from the bottom (r = 0)
 * up to the rim; the outer surface is offset by `t`. Returns a single closed shell.
 */
export function vesselGeometry(cavity, t = 0.0018, segments = 40, lip = true) {
  const inner = cavity;
  const outer = inner.map(([r, y], i) => {
    if (i === 0) return [0, y - t];
    return [r + t, y - (i === 1 ? t : 0)];
  });
  const rim = inner[inner.length - 1];
  const pts = [];
  for (const p of outer) pts.push(p);
  if (lip) {
    pts.push([rim[0] + t * 1.8, rim[1] - t * 0.5]);
    pts.push([rim[0] + t * 1.9, rim[1] + t * 0.4]);
    pts.push([rim[0] + t * 0.5, rim[1] + t * 0.6]);
  } else {
    pts.push([rim[0] + t * 0.5, rim[1] + t * 0.5]);
  }
  for (let i = inner.length - 1; i >= 0; i--) pts.push(inner[i]);
  return lathe(pts, segments);
}

/** Inner radius at height y for a cavity profile. */
export function radiusAt(cavity, y) {
  if (y <= cavity[0][1]) return cavity[0][0];
  for (let i = 1; i < cavity.length; i++) {
    const [r1, y1] = cavity[i];
    const [r0, y0] = cavity[i - 1];
    if (y <= y1) return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return cavity[cavity.length - 1][0];
}

/** Precomputed height <-> volume table of a cavity (mL). */
export function volumeTable(cavity, steps = 96) {
  const y0 = cavity[0][1];
  const y1 = cavity[cavity.length - 1][1];
  const heights = [y0];
  const volumes = [0];
  let v = 0;
  for (let i = 1; i <= steps; i++) {
    const ya = y0 + ((y1 - y0) * (i - 1)) / steps;
    const yb = y0 + ((y1 - y0) * i) / steps;
    const r = (radiusAt(cavity, ya) + radiusAt(cavity, yb)) / 2;
    v += Math.PI * r * r * (yb - ya) * 1e6;
    heights.push(yb);
    volumes.push(v);
  }
  return {
    capacity: v,
    heightFor(ml) {
      if (ml <= 0) return y0;
      if (ml >= v) return y1;
      let lo = 0, hi = volumes.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (volumes[mid] < ml) lo = mid; else hi = mid;
      }
      const f = (ml - volumes[lo]) / (volumes[hi] - volumes[lo] || 1);
      return heights[lo] + (heights[hi] - heights[lo]) * f;
    },
  };
}

/** Solid of revolution filling the cavity (for liquid / powder / gas volumes). */
export function cavityFillGeometry(cavity, shrink = 0.0006, segments = 32, top = null) {
  const pts = [[0, cavity[0][1] + shrink]];
  for (const [r, y] of cavity) {
    if (top !== null && y > top) break;
    pts.push([Math.max(0, r - shrink), y + (y === cavity[0][1] ? shrink : 0)]);
  }
  const lastY = top !== null ? top : cavity[cavity.length - 1][1];
  pts.push([Math.max(0, radiusAt(cavity, lastY) - shrink), lastY]);
  pts.push([0, lastY]);
  return lathe(pts, segments);
}

/** Canvas texture with graduation marks for cylinders / beakers. */
export function graduationTexture(label, marks, opts = {}) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = opts.color || 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = ctx.fillStyle;
  // Marks occupy the front quarter of the circumference (u 0.36 – 0.64)
  const x0 = c.width * 0.42;
  ctx.lineWidth = 3;
  for (const m of marks) {
    const y = c.height * (1 - m.v);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + (m.major ? 34 : 18), y);
    ctx.stroke();
    if (m.text) {
      ctx.font = '600 20px Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.text, x0 + 40, y);
    }
  }
  if (label) {
    ctx.font = '700 26px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, c.width * 0.62, c.height * 0.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Rounded box centred on the origin (outer size w × h × d). */
export function roundedBox(w, h, d, r = 0.01, seg = 3) {
  const b = r * 0.5;
  const sw = w - 2 * b, sd = d - 2 * b;
  const rr = Math.min(r * 0.5, sw / 2 - 1e-4, sd / 2 - 1e-4);
  const shape = new THREE.Shape();
  shape.moveTo(-sw / 2 + rr, -sd / 2);
  shape.lineTo(sw / 2 - rr, -sd / 2);
  shape.quadraticCurveTo(sw / 2, -sd / 2, sw / 2, -sd / 2 + rr);
  shape.lineTo(sw / 2, sd / 2 - rr);
  shape.quadraticCurveTo(sw / 2, sd / 2, sw / 2 - rr, sd / 2);
  shape.lineTo(-sw / 2 + rr, sd / 2);
  shape.quadraticCurveTo(-sw / 2, sd / 2, -sw / 2, sd / 2 - rr);
  shape.lineTo(-sw / 2, -sd / 2 + rr);
  shape.quadraticCurveTo(-sw / 2, -sd / 2, -sw / 2 + rr, -sd / 2);
  const depth = Math.max(1e-4, h - 2 * b);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: seg, curveSegments: seg * 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -depth / 2, 0);
  g.computeVertexNormals();
  return g;
}
