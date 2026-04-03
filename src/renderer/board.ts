import type { PieceType } from '../core/types';
import { PIECE_DEFINITIONS } from '../core/pieces';

export const CELL_SIZE = 30;
export const MINI_CELL = 16;
export const CANVAS_W = 640;
export const CANVAS_H = 720;

export const LAYOUT = {
  tabBar:    { x: 0,   y: 0,   w: 640, h: 40  },
  hold:      { x: 20,  y: 68,  w: 80,  h: 72  },
  board:     { x: 120, y: 60,  w: 300, h: 600 },
  queue:     { x: 440, y: 60,  w: 80,  h: 432 },
  infoPanel: { x: 460, y: 500, w: 160, h: 160 },
  statusBar: { x: 0,   y: 672, w: 640, h: 48  },
} as const;

export const COLORS = {
  pieces: { I: '#00E5FF', T: '#AA00FF', O: '#FFD600', S: '#69F0AE', Z: '#FF1744', L: '#FF9100', J: '#2979FF' } as Record<PieceType, string>,
  ghostOpacity: 0.3,
  boardBg: '#0A0A0A',
  gridLine: '#1A1A2E',
  boardBorder: '#3A3A5C',
  canvasBg: '#050510',
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
  buttonBg: '#1E1E3F',
  buttonHover: '#2E2E5F',
  buttonActive: '#4040AA',
  buttonText: '#D0D0F0',
};

/** Draw board background and grid lines */
export function drawBoard(ctx: CanvasRenderingContext2D): void {
  const { x, y, w, h } = LAYOUT.board;

  // Background
  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(x, y, w, h);

  // Grid lines
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;

  // Vertical lines
  for (let col = 0; col <= 10; col++) {
    const lx = x + col * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(lx + 0.5, y);
    ctx.lineTo(lx + 0.5, y + h);
    ctx.stroke();
  }

  // Horizontal lines
  for (let row = 0; row <= 20; row++) {
    const ly = y + row * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, ly + 0.5);
    ctx.lineTo(x + w, ly + 0.5);
    ctx.stroke();
  }

  // Border
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

/** Draw a single filled cell with beveled look */
function drawCell(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string): void {
  // Main fill
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);

  // Top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(px, py, size, 1);
  // Left highlight
  ctx.fillRect(px, py, 1, size);

  // Bottom shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(px, py + size - 1, size, 1);
  // Right shadow
  ctx.fillRect(px + size - 1, py, 1, size);
}

/** Draw locked pieces on the board grid */
export function drawFilledCells(ctx: CanvasRenderingContext2D, grid: (string | null)[][]): void {
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

/** Draw a row of piece previews (e.g. for quiz bag display) */
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
    const cells = def.cells[0]; // rotation state 0
    const color = COLORS.pieces[pieceType];

    // Find bounding box for centering
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const [c, r] of cells) {
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    const pieceW = (maxC - minC + 1) * cellSize;
    const pieceH = (maxR - minR + 1) * cellSize;

    // Each piece gets a 4-cell-wide slot
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

export { drawCell };
