import type { PieceType } from '../core/types';
import { LAYOUT, COLORS, drawCell, drawPieceInBox } from './board';

export interface QuizQueueOptions {
  decisionPieces: PieceType[];
  showHighlights: boolean;
  holdPiece: PieceType | null;
  mirror: boolean;
}

/** Ordinal suffix for a 0-indexed position */
function ordinal(idx: number): string {
  const n = idx + 1;
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

/**
 * Draw the quiz-mode vertical queue layout:
 * - HOLD box on the left
 * - CURRENT piece (bag[0]) large in the center
 * - NEXT queue (bag[1]-bag[6]) vertically on the right
 */
export function drawQuizQueue(
  ctx: CanvasRenderingContext2D,
  bag: PieceType[],
  options: QuizQueueOptions,
): void {
  drawHoldBox(ctx, options.holdPiece, options.mirror);
  drawCurrentPiece(ctx, bag, options);
  drawNextQueue(ctx, bag, options);
}

// ── HOLD box ──

function drawHoldBox(
  ctx: CanvasRenderingContext2D,
  holdPiece: PieceType | null,
  mirror: boolean,
): void {
  const x = LAYOUT.hold.x;
  const y = LAYOUT.hold.y;
  const w = LAYOUT.hold.w;
  const h = LAYOUT.hold.h;

  // Label
  ctx.fillStyle = COLORS.panelText;
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('HOLD', x + w / 2, y - 4);

  if (holdPiece) {
    // Solid border when occupied
    ctx.strokeStyle = COLORS.boardBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    drawPieceInBox(ctx, holdPiece, x, y, w, h, 14);

    // Mirror/Normal indicator below hold box
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (mirror) {
      ctx.fillStyle = '#8888AA';
      ctx.fillText('\u2190 Mirror', x + w / 2, y + h + 6);
    } else {
      ctx.fillStyle = '#555577';
      ctx.fillText('\u2192 Normal', x + w / 2, y + h + 6);
    }
  } else {
    // Dashed border when empty
    ctx.strokeStyle = COLORS.boardBorder;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}

// ── Current piece (1st in bag) ──

function drawCurrentPiece(
  ctx: CanvasRenderingContext2D,
  bag: PieceType[],
  options: QuizQueueOptions,
): void {
  if (bag.length === 0) return;

  const x = LAYOUT.current.x;
  const y = LAYOUT.current.y;
  const w = LAYOUT.current.w;
  const h = LAYOUT.current.h;
  const cellSize = 20;
  const piece = bag[0]!;

  // Label
  ctx.fillStyle = COLORS.panelText;
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('1st', x + w / 2, y - 4);

  // Border
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  const isDecision = options.decisionPieces.includes(piece);
  const opacity = options.showHighlights && !isDecision ? COLORS.dimPiece : 1.0;
  const underlineColor = options.showHighlights && isDecision ? COLORS.correct : undefined;

  drawPieceInBox(ctx, piece, x, y, w, h, cellSize, { opacity, underlineColor });

  // Position label for decision piece
  if (options.showHighlights && isDecision) {
    ctx.fillStyle = COLORS.panelText;
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`(${ordinal(0)})`, x + w / 2, y + h + 3);
  }
}

// ── Next queue (bag[1]..bag[6]) ──

function drawNextQueue(
  ctx: CanvasRenderingContext2D,
  bag: PieceType[],
  options: QuizQueueOptions,
): void {
  const x = LAYOUT.nextQueue.x;
  const baseY = LAYOUT.nextQueue.y;
  const queueW = LAYOUT.nextQueue.w;
  const cellSize = 14;
  const slotH = 50;
  const count = Math.min(bag.length - 1, 6);

  if (count <= 0) return;

  // Label
  ctx.fillStyle = COLORS.panelText;
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('NEXT', x + queueW / 2, baseY - 4);

  // Container border
  const totalH = count * slotH;
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, baseY, queueW, totalH);

  for (let i = 0; i < count; i++) {
    const piece = bag[i + 1]!;
    const slotY = baseY + i * slotH;

    const isDecision = options.decisionPieces.includes(piece);
    const opacity = options.showHighlights && !isDecision ? COLORS.dimPiece : 1.0;
    const underlineColor = options.showHighlights && isDecision ? COLORS.correct : undefined;

    drawPieceInBox(ctx, piece, x + 4, slotY + 2, queueW - 8, slotH - 4, cellSize, {
      opacity,
      underlineColor,
    });

    // Position label for decision pieces
    if (options.showHighlights && isDecision) {
      const bagIdx = i + 1;
      ctx.fillStyle = COLORS.panelText;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`(${ordinal(bagIdx)})`, x - 4, slotY + slotH / 2);
    }

    // Separator line
    if (i < count - 1) {
      ctx.strokeStyle = COLORS.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 6, slotY + slotH + 0.5);
      ctx.lineTo(x + queueW - 6, slotY + slotH + 0.5);
      ctx.stroke();
    }
  }
}

// ── Legacy exports (kept for compatibility) ──

/** Draw the hold piece in its designated area (legacy) */
export function drawHoldPiece(ctx: CanvasRenderingContext2D, piece: PieceType | null): void {
  const { x, y, w, h } = LAYOUT.hold_legacy;

  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = COLORS.panelText;
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HOLD', x + w / 2, y - 6);

  if (!piece) return;

  drawPieceInBox(ctx, piece, x, y, w, h, 16);
}

/** Draw up to 6 next pieces vertically in the queue area (legacy) */
export function drawQueue(ctx: CanvasRenderingContext2D, queue: PieceType[]): void {
  const { x, y, w } = LAYOUT.queue;
  const slotH = 72;

  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(x, y, w, slotH * 6);

  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, slotH * 6);

  ctx.fillStyle = COLORS.panelText;
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEXT', x + w / 2, y - 6);

  const count = Math.min(queue.length, 6);
  for (let i = 0; i < count; i++) {
    const piece = queue[i]!;
    const slotY = y + i * slotH;
    drawPieceInBox(ctx, piece, x + 4, slotY + 4, w - 8, slotH - 8, 16);

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
