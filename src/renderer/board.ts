import type { PieceType } from '../core/types';
import { PIECE_DEFINITIONS } from '../core/pieces';

export const CELL_SIZE = 30;
export const MINI_CELL = 16;
export const CANVAS_W = 640;
export const CANVAS_H = 720;

export const LAYOUT = {
  tabBar:    { x: 0,   y: 0,   w: 640, h: 40  },
  hold:      { x: 120, y: 80,  w: 80,  h: 80  },
  current:   { x: 240, y: 80,  w: 100, h: 100 },
  nextQueue: { x: 400, y: 70,  w: 80,  h: 350 },
  buttons:   { x: 120, y: 400, w: 400, h: 120 },
  statsStrip:{ x: 0,   y: 520, w: 640, h: 50  },
  statusBar: { x: 0,   y: 672, w: 640, h: 48  },
  // Legacy — kept for any external consumers
  board:     { x: 120, y: 60,  w: 300, h: 600 },
  queue:     { x: 440, y: 60,  w: 80,  h: 432 },
  hold_legacy: { x: 20, y: 68, w: 80, h: 72 },
  infoPanel: { x: 460, y: 500, w: 160, h: 160 },
} as const;

export const COLORS = {
  pieces: { I: '#00E5FF', T: '#AA00FF', O: '#FFD600', S: '#69F0AE', Z: '#FF1744', L: '#FF9100', J: '#2979FF' } as Record<PieceType, string>,
  ghostOpacity: 0.3,
  boardBg: '#0A0A0A',
  gridLine: '#1A1A2E',
  boardBorder: '#3A3A5C',
  canvasBg: '#0C0C1E',
  tabBg: '#12122A',
  tabActive: '#2A2A5C',
  tabText: '#C0C0E0',
  tabTextActive: '#FFFFFF',
  statusBarBg: '#0D0D20',
  panelText: '#B0B0D0',
  panelHeading: '#E0E0FF',
  correct: '#00E676',
  incorrect: '#FF5252',
  neutral: '#78909C',
  buttonBg: '#1A1A3A',
  buttonBorder: '#4A4A7C',
  buttonHover: '#2E2E5F',
  buttonActive: '#4040AA',
  buttonText: '#D0D0F0',
  badgeBg: '#2A2A5C',
  statCardBg: '#0F0F24',
  statCardBorder: '#1A1A3A',
  statLabel: '#7777AA',
  statValue: '#E0E0FF',
  dimPiece: 0.3,
};

/** Draw board background and grid lines (kept for visualizer/drill modes) */
export function drawBoard(ctx: CanvasRenderingContext2D): void {
  const { x, y, w, h } = LAYOUT.board;

  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;

  for (let col = 0; col <= 10; col++) {
    const lx = x + col * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(lx + 0.5, y);
    ctx.lineTo(lx + 0.5, y + h);
    ctx.stroke();
  }

  for (let row = 0; row <= 20; row++) {
    const ly = y + row * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, ly + 0.5);
    ctx.lineTo(x + w, ly + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

/** Draw a single filled cell with beveled look */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);

  // Top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(px, py, size, 1);
  ctx.fillRect(px, py, 1, size);

  // Bottom shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(px, py + size - 1, size, 1);
  ctx.fillRect(px + size - 1, py, 1, size);
}

/** Draw locked pieces on the board grid */
export function drawFilledCells(
  ctx: CanvasRenderingContext2D,
  grid: (string | null)[][],
): void {
  const { x: boardX, y: boardY } = LAYOUT.board;

  for (let row = 0; row < grid.length; row++) {
    const rowData = grid[row];
    if (!rowData) continue;
    for (let col = 0; col < rowData.length; col++) {
      const color = rowData[col];
      if (color) {
        const px = boardX + col * CELL_SIZE;
        const py = boardY + row * CELL_SIZE;
        drawCell(ctx, px, py, CELL_SIZE, color);
      }
    }
  }
}

/** Draw a row of piece previews (kept for compatibility) */
export function drawPiecePreview(
  ctx: CanvasRenderingContext2D,
  pieces: PieceType[],
  x: number,
  y: number,
  cellSize: number,
): void {
  let offsetX = x;

  for (const pieceType of pieces) {
    const def = PIECE_DEFINITIONS[pieceType];
    const cells = def.cells[0];
    const color = COLORS.pieces[pieceType];

    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const [c, r] of cells) {
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    const pieceW = (maxC - minC + 1) * cellSize;
    const pieceH = (maxR - minR + 1) * cellSize;

    const slotW = (pieceType === 'I' ? 4 : pieceType === 'O' ? 4 : 3) * cellSize;
    const drawX = offsetX + (slotW - pieceW) / 2;
    const drawY = y + (2 * cellSize - pieceH) / 2;

    for (const [c, r] of cells) {
      const px = drawX + (c - minC) * cellSize;
      const py = drawY + (r - minR) * cellSize;
      drawCell(ctx, px, py, cellSize, color);
    }

    offsetX += slotW + cellSize * 0.5;
  }
}

/**
 * Draw a single piece centered in a box area.
 * Supports optional dimming (opacity) and a colored underline bar.
 */
export function drawPieceInBox(
  ctx: CanvasRenderingContext2D,
  piece: PieceType,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  cellSize: number,
  options?: { opacity?: number; underlineColor?: string },
): void {
  const def = PIECE_DEFINITIONS[piece];
  const cells = def.cells[0];
  const color = COLORS.pieces[piece];

  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
  for (const [c, r] of cells) {
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  }
  const pieceW = (maxC - minC + 1) * cellSize;
  const pieceH = (maxR - minR + 1) * cellSize;

  const drawX = x + (boxW - pieceW) / 2;
  const drawY = y + (boxH - pieceH) / 2;

  const alpha = options?.opacity ?? 1.0;
  ctx.globalAlpha = alpha;

  for (const [c, r] of cells) {
    const px = drawX + (c - minC) * cellSize;
    const py = drawY + (r - minR) * cellSize;
    drawCell(ctx, px, py, cellSize, color);
  }

  ctx.globalAlpha = 1.0;

  // Underline bar
  if (options?.underlineColor) {
    ctx.fillStyle = options.underlineColor;
    ctx.fillRect(x + 4, y + boxH - 3, boxW - 8, 3);
  }
}

/** Helper: draw a rounded rectangle path */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
