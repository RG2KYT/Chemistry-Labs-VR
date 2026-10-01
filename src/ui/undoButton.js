import { font, roundRect } from './canvasUtil.js';

/** Draws the shared "Undo" button on a panel and registers it. */
export function drawUndoButton(panel, ctx, x, y, w, h, u) {
  const history = panel.app.history;
  const enabled = !!history && history.canUndo;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = enabled ? 'rgba(255,210,122,0.18)' : 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = enabled ? 'rgba(255,210,122,0.75)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5 * u;
  ctx.stroke();
  ctx.fillStyle = enabled ? '#ffd27a' : '#55606f';
  ctx.font = font(Math.min(18 * u, h * 0.42), 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('↶ Undo', x + w / 2, y + h / 2 + 1);
  panel.addButton({ id: 'undo', x, y, w, h, disabled: !enabled, onPress: () => history.undo() });
}
