import type { PieceType } from '../core/types';
import { PIECE_DEFINITIONS } from '../core/pieces';
import { LAYOUT, MINI_CELL, COLORS, drawCell } from './board';

/** Draw the hold piece in its designated area */
export function drawHoldPiece(ctx: CanvasRenderingContext2D, piece: PieceType | null): void {
  const { x, y, w, h } = LAYOUT.hold;

  // Background
  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(x, y, w, h);

  // Border
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // Label
  ctx.fillStyle = COLORS.panelText;
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HOLD', x + w / 2, y - 6);

  if (!piece) return;

  const def = PIECE_DEFINITIONS[piece];
  const cells = def.cells[0];
  const color = COLORS.pieces[piece];

  // Compute bounding box
  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
  for (const [c, r] of cells) {
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  }
  const pieceW = (maxC - minC + 1) * MINI_CELL;
  const pieceH = (maxR - minR + 1) * MINI_CELL;

  // Center in hold box
  const drawX = x + (w - pieceW) / 2;
  const drawY = y + (h - pieceH) / 2;

  for (const [c, r] of cells) {
    const px = drawX + (c - minC) * MINI_CELL;
    const py = drawY + (r - minR) * MINI_CELL;
    drawCell(ctx, px, py, MINI_CELL, color);
  }
}

/** Draw up to 6 next pieces vertically in the queue area */
export function drawQueue(ctx: CanvasRenderingContext2D, queue: PieceType[]): void {
  const { x, y, w } = LAYOUT.queue;
  const slotH = 72;

  // Background
  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(x, y, w, slotH * 6);

  // Border
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, slotH * 6);

  // Label
  ctx.fillStyle = COLORS.panelText;
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEXT', x + w / 2, y - 6);

  const count = Math.min(queue.length, 6);
  for (let i = 0; i < count; i++) {
    const pieceType = queue[i]!;
    const def = PIECE_DEFINITIONS[pieceType];
    const cells = def.cells[0]!;
    const color = COLORS.pieces[pieceType];

    // Compute bounding box
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const [c, r] of cells) {
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    const pieceW = (maxC - minC + 1) * MINI_CELL;
    const pieceH = (maxR - minR + 1) * MINI_CELL;

    // Center piece in its slot
    const slotY = y + i * slotH;
    const drawX = x + (w - pieceW) / 2;
    const drawY = slotY + (slotH - pieceH) / 2;

    for (const [c, r] of cells) {
      const px = drawX + (c - minC) * MINI_CELL;
      const py = drawY + (r - minR) * MINI_CELL;
      drawCell(ctx, px, py, MINI_CELL, color);
    }

    // Separator line (except after last)
    if (i < count - 1) {
      ctx.strokeStyle = COLORS.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, slotY + slotH + 0.5);
      ctx.lineTo(x + w - 4, slotY + slotH + 0.5);
      ctx.stroke();
    }
  }
}
