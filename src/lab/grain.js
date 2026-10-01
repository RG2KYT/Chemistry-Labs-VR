// Procedural "grain" textures shared by everything solid: powders, heaps, crystals in a
// beaker. A texture with visible grains is what makes a powder read as a powder and not as
// a smooth liquid.

import * as THREE from 'three';

let grainTex = null;
let bumpTex = null;

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function draw(size, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const r = rand(seed);
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, size, size);
  // Many small grains of slightly different brightness, with a highlight and a shadow side.
  for (let i = 0; i < size * size / 7; i++) {
    const x = r() * size, y = r() * size, g = 1 + r() * 2.6;
    const v = 150 + r() * 105;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(x, y, g, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - g * 0.3, y - g * 0.3, g * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(x + g * 0.35, y + g * 0.35, g * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/** Colour map: multiplies the substance colour with grain-to-grain brightness variation. */
export function grainMap() {
  if (!grainTex) {
    if (typeof document === 'undefined') return null;
    grainTex = new THREE.CanvasTexture(draw(256, 7));
    grainTex.colorSpace = THREE.SRGBColorSpace;
    grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
    grainTex.anisotropy = 4;
  }
  return grainTex;
}

/** Bump map giving every grain a little relief. */
export function grainBump() {
  if (!bumpTex) {
    if (typeof document === 'undefined') return null;
    bumpTex = new THREE.CanvasTexture(draw(256, 11));
    bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
  }
  return bumpTex;
}

/** Forms that are made of small grains (as opposed to big crystals or lumps). */
export const GRAINY = new Set(['powder', 'pellets', 'chunk', 'flakes', 'crystals', 'needles', 'cubic']);
