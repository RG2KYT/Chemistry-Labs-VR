// Canvas 2D helpers for the in-world UI.

export const FONT = '"Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif';

export function font(size, weight = 500) {
  return `${weight} ${Math.round(size)}px ${FONT}`;
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Split a chemical formula into tokens: normal text and subscript numbers.
 * "Ca(OH)2" -> Ca ( O H ) ₂ ; "(aq)" stays normal but smaller.
 */
function formulaTokens(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('(aq)', i)) { out.push({ t: '(aq)', small: true }); i += 4; continue; }
    const ch = text[i];
    if (/[0-9]/.test(ch)) {
      const prev = text[i - 1];
      let j = i;
      while (j < text.length && /[0-9]/.test(text[j])) j++;
      const sub = prev && /[A-Za-z)\]]/.test(prev);
      out.push({ t: text.slice(i, j), sub });
      i = j;
      continue;
    }
    let j = i;
    while (j < text.length && !/[0-9]/.test(text[j]) && !text.startsWith('(aq)', j)) j++;
    out.push({ t: text.slice(i, j) });
    i = j;
  }
  return out;
}

export function measureFormula(ctx, text, size, weight = 600) {
  let w = 0;
  for (const tok of formulaTokens(text)) {
    ctx.font = font(tok.sub || tok.small ? size * 0.68 : size, weight);
    w += ctx.measureText(tok.t).width;
  }
  return w;
}

/** Draw a formula with proper subscripts. Returns the drawn width. */
export function drawFormula(ctx, text, x, y, size, opts = {}) {
  const weight = opts.weight ?? 600;
  const align = opts.align ?? 'left';
  const w = measureFormula(ctx, text, size, weight);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.textAlign = 'left';
  ctx.textBaseline = opts.baseline ?? 'alphabetic';
  for (const tok of formulaTokens(text)) {
    const s = tok.sub || tok.small ? size * 0.68 : size;
    ctx.font = font(s, weight);
    ctx.fillText(tok.t, cx, y + (tok.sub ? size * 0.22 : 0));
    cx += ctx.measureText(tok.t).width;
  }
  return w;
}

/** Wrap text into lines that fit maxWidth. Returns the array of lines. */
export function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines = 99) {
  const lines = wrapLines(ctx, text, maxWidth);
  const n = Math.min(lines.length, maxLines);
  for (let i = 0; i < n; i++) {
    let l = lines[i];
    if (i === n - 1 && lines.length > n) l = l.replace(/\s*\S*$/, '') + '…';
    ctx.fillText(l, x, y + i * lineHeight);
  }
  return n * lineHeight;
}

/** Fit text into a width by shrinking the font size. Returns the size used. */
export function fitFont(ctx, text, maxWidth, size, weight = 600, min = 8) {
  let s = size;
  ctx.font = font(s, weight);
  while (s > min && ctx.measureText(text).width > maxWidth) {
    s -= 1;
    ctx.font = font(s, weight);
  }
  return s;
}

export function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Relative luminance of a #rrggbb colour (0..1). */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
