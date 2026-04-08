import type { PieceType } from '../core/types';
import type { DrillState } from '../modes/drill';
import type { OpenerID } from '../openers/types';
import { getPieceCells, getGhostPosition } from '../core/srs';
import { OPENERS } from '../openers/decision';
import { getExpectedBoard, getTargetPlacement, getHoldSuggestion, getAllTargets } from '../modes/drill';
import {
  COLORS,
  CANVAS_W,
  CANVAS_H,
  CELL_SIZE,
  LAYOUT,
  drawCell,
  drawBoard,
  drawPieceInBox,
  roundRect,
} from './board';
import { drawStatusBar } from './hud';

const FONT = '-apple-system, sans-serif';
const BOARD_X = LAYOUT.board.x;
const BOARD_Y = LAYOUT.board.y;

// ── Opener Selector Screen ──

const SELECTOR_OPENERS: { id: OpenerID; label: string }[] = [
  { id: 'ms2', label: '1: MS2 (山岳)' },
  { id: 'honey_cup', label: '2: Honey (蜜蜂)' },
  { id: 'stray_cannon', label: '3: Stray (迷走)' },
  { id: 'gamushiro', label: '4: Gamushiro (糖漿)' },
];

export function renderDrillSelector(ctx: CanvasRenderingContext2D, selectedIndex: number): void {
  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Drill Mode', CANVAS_W / 2, 80);

  ctx.fillStyle = COLORS.panelText;
  ctx.font = `16px ${FONT}`;
  ctx.fillText('Choose an opener to practice', CANVAS_W / 2, 120);

  // Buttons
  const btnW = 280;
  const btnH = 48;
  const gap = 12;
  const startY = 180;

  for (let i = 0; i < SELECTOR_OPENERS.length; i++) {
    const opener = SELECTOR_OPENERS[i]!;
    const bx = (CANVAS_W - btnW) / 2;
    const by = startY + i * (btnH + gap);
    const isSelected = i === selectedIndex;

    // Button bg
    ctx.fillStyle = isSelected ? '#2A2A5C' : COLORS.buttonBg;
    roundRect(ctx, bx, by, btnW, btnH, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = isSelected ? '#6A6AAC' : COLORS.buttonBorder;
    ctx.lineWidth = isSelected ? 2 : 1;
    roundRect(ctx, bx, by, btnW, btnH, 8);
    ctx.stroke();

    // Label
    ctx.fillStyle = isSelected ? '#FFFFFF' : COLORS.buttonText;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opener.label, CANVAS_W / 2, by + btnH / 2);
  }

  // Instructions
  ctx.fillStyle = '#555577';
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Press 1-4 or Enter to select', CANVAS_W / 2, startY + 4 * (btnH + gap) + 20);

  drawStatusBar(ctx, 'Drill · Select opener · 1-4: pick · Enter: confirm');
}

// ── Playing Mode Renderer ──

export function renderDrillMode(ctx: CanvasRenderingContext2D, state: DrillState): void {
  switch (state.phase) {
    case 'playing':
      drawPlayingPhase(ctx, state);
      break;
    case 'success':
      drawSuccessPhase(ctx, state);
      break;
    case 'failed':
      drawFailedPhase(ctx, state);
      break;
    case 'selecting':
      // Should be handled by renderDrillSelector — fallback
      renderDrillSelector(ctx, 0);
      break;
  }
}

// ── Playing Phase ──

function drawPlayingPhase(ctx: CanvasRenderingContext2D, state: DrillState): void {
  const openerDef = OPENERS[state.openerId];
  const title = `${openerDef.nameEn} ${state.mirror ? '(Mirror)' : ''}`;

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(title, CANVAS_W / 2, BOARD_Y - 4);

  // Board
  drawBoard(ctx);
  drawLockedCells(ctx, state);

  // All target outlines (guided mode) — show entire opener shape
  const allTargets = getAllTargets(state);
  const target = getTargetPlacement(state); // current piece's target for hint text
  for (const t of allTargets) {
    const isActive = state.activePiece && t.piece === state.activePiece.type;
    const color = COLORS.pieces[t.piece ?? 'T'] ?? '#888888';
    const fillAlpha = isActive ? 0.2 : 0.07;
    const strokeAlpha = isActive ? 1.0 : 0.25;

    ctx.globalAlpha = fillAlpha;
    for (const { col, row } of t.cells) {
      if (row < 0) continue;
      const px = BOARD_X + col * CELL_SIZE;
      const py = BOARD_Y + row * CELL_SIZE;
      drawCell(ctx, px, py, CELL_SIZE, color);
    }
    ctx.globalAlpha = strokeAlpha;

    ctx.strokeStyle = color;
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.setLineDash([4, 4]);
    for (const { col, row } of t.cells) {
      if (row < 0) continue;
      const px = BOARD_X + col * CELL_SIZE;
      const py = BOARD_Y + row * CELL_SIZE;
      ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1.0;

  // Ghost piece
  if (state.activePiece) {
    const ghost = getGhostPosition(state.board, state.activePiece);
    const ghostCells = getPieceCells(ghost);
    const color = COLORS.pieces[state.activePiece.type] ?? '#888888';

    ctx.globalAlpha = COLORS.ghostOpacity;
    for (const { col, row } of ghostCells) {
      if (row < 0) continue;
      const px = BOARD_X + col * CELL_SIZE;
      const py = BOARD_Y + row * CELL_SIZE;
      drawCell(ctx, px, py, CELL_SIZE, color);
    }
    ctx.globalAlpha = 1.0;
  }

  // Active piece
  if (state.activePiece) {
    const cells = getPieceCells(state.activePiece);
    const color = COLORS.pieces[state.activePiece.type] ?? '#888888';

    for (const { col, row } of cells) {
      if (row < 0) continue;
      const px = BOARD_X + col * CELL_SIZE;
      const py = BOARD_Y + row * CELL_SIZE;
      drawCell(ctx, px, py, CELL_SIZE, color);
      // White glow border for active piece
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }
  }

  // Hold piece
  const holdSuggestion = getHoldSuggestion(state);
  drawDrillHold(ctx, state.holdPiece, state.holdUsed, holdSuggestion);

  // Next queue
  drawDrillQueue(ctx, state.queue);

  // Hint text in hold area (below hold box)
  if (target) {
    const hintX = 20;
    const hintY = BOARD_Y + 120;
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (target.supported) {
      ctx.fillStyle = '#9999BB';
      ctx.fillText(target.hint, hintX, hintY);
    } else {
      ctx.fillStyle = '#AA7744';
      ctx.fillText(target.hint, hintX, hintY);
      ctx.fillText('(place others first)', hintX, hintY + 16);
    }
  }

  const modeLabel = state.guided ? 'Guided' : 'Free';
  drawStatusBar(ctx, `Drill · ${title} · ${modeLabel} · ${state.piecesPlaced}/6`);
}

// ── Success Phase ──

function drawSuccessPhase(ctx: CanvasRenderingContext2D, state: DrillState): void {
  const openerDef = OPENERS[state.openerId];
  const title = `${openerDef.nameEn} ${state.mirror ? '(Mirror)' : ''}`;

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(title, CANVAS_W / 2, BOARD_Y - 4);

  drawBoard(ctx);
  drawLockedCells(ctx, state);

  // Success overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(BOARD_X, BOARD_Y, LAYOUT.board.w, LAYOUT.board.h);

  ctx.fillStyle = COLORS.correct;
  ctx.font = `bold 36px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SUCCESS!', BOARD_X + LAYOUT.board.w / 2, BOARD_Y + LAYOUT.board.h / 2 - 20);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `18px ${FONT}`;
  ctx.fillText('\u2713', BOARD_X + LAYOUT.board.w / 2 + 80, BOARD_Y + LAYOUT.board.h / 2 - 20);

  // Instructions
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `16px ${FONT}`;
  ctx.fillText('R: retry same bag', BOARD_X + LAYOUT.board.w / 2, BOARD_Y + LAYOUT.board.h / 2 + 30);
  ctx.fillText('Space: new bag', BOARD_X + LAYOUT.board.w / 2, BOARD_Y + LAYOUT.board.h / 2 + 55);

  drawDrillHold(ctx, state.holdPiece, false);

  drawStatusBar(ctx, 'Success! R: retry · Space: new bag · 1-4: switch opener');
}

// ── Failed Phase ──

function drawFailedPhase(ctx: CanvasRenderingContext2D, state: DrillState): void {
  const openerDef = OPENERS[state.openerId];
  const title = `${openerDef.nameEn} ${state.mirror ? '(Mirror)' : ''}`;

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(title, CANVAS_W / 2, BOARD_Y - 4);

  // Side-by-side: player board (left) vs expected (right)
  const sideBySideScale = 0.45;
  const smallCell = Math.floor(CELL_SIZE * sideBySideScale);
  const smallBoardW = 10 * smallCell;
  const smallBoardH = 20 * smallCell;
  const gap = 30;
  const totalW = smallBoardW * 2 + gap;
  const startX = (CANVAS_W - totalW) / 2;
  const startY = BOARD_Y + 20;

  // Labels
  ctx.fillStyle = COLORS.incorrect;
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Your Build', startX + smallBoardW / 2, startY - 4);

  ctx.fillStyle = COLORS.correct;
  ctx.fillText('Expected', startX + smallBoardW + gap + smallBoardW / 2, startY - 4);

  // Player board (left)
  drawMiniBoard(ctx, state.board, startX, startY, smallCell);

  // Expected board (right)
  const expected = getExpectedBoard(state.openerId, state.mirror);
  drawMiniBoard(ctx, expected, startX + smallBoardW + gap, startY, smallCell);

  // Failed text
  const textY = startY + smallBoardH + 20;
  ctx.fillStyle = COLORS.incorrect;
  ctx.font = `bold 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Shape mismatch', CANVAS_W / 2, textY);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `16px ${FONT}`;
  ctx.fillText('R: retry same bag', CANVAS_W / 2, textY + 35);
  ctx.fillText('Space: new bag', CANVAS_W / 2, textY + 60);

  drawStatusBar(ctx, 'Failed · R: retry · Space: new bag · 1-4: switch opener');
}

// ── Shared Drawing Helpers ──

function drawLockedCells(ctx: CanvasRenderingContext2D, state: DrillState): void {
  for (let row = 0; row < 20; row++) {
    const rowData = state.board[row];
    if (!rowData) continue;
    for (let col = 0; col < 10; col++) {
      const cell = rowData[col];
      if (cell) {
        const px = BOARD_X + col * CELL_SIZE;
        const py = BOARD_Y + row * CELL_SIZE;
        const color = COLORS.pieces[cell] ?? '#888888';
        drawCell(ctx, px, py, CELL_SIZE, color);
      }
    }
  }
}

function drawMiniBoard(
  ctx: CanvasRenderingContext2D,
  board: ReadonlyArray<ReadonlyArray<PieceType | null>>,
  x: number,
  y: number,
  cellSz: number,
): void {
  const w = 10 * cellSz;
  const h = 20 * cellSz;

  // Background
  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(x, y, w, h);

  // Grid
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= 10; c++) {
    ctx.beginPath();
    ctx.moveTo(x + c * cellSz, y);
    ctx.lineTo(x + c * cellSz, y + h);
    ctx.stroke();
  }
  for (let r = 0; r <= 20; r++) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * cellSz);
    ctx.lineTo(x + w, y + r * cellSz);
    ctx.stroke();
  }

  // Border
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // Cells
  for (let row = 0; row < 20; row++) {
    const rowData = board[row];
    if (!rowData) continue;
    for (let col = 0; col < 10; col++) {
      const cell = rowData[col];
      if (cell) {
        const px = x + col * cellSz;
        const py = y + row * cellSz;
        const color = COLORS.pieces[cell] ?? '#888888';
        ctx.fillStyle = color;
        ctx.fillRect(px, py, cellSz, cellSz);
      }
    }
  }
}

function drawDrillHold(
  ctx: CanvasRenderingContext2D,
  holdPiece: PieceType | null,
  holdUsed: boolean,
  holdSuggestion?: PieceType | null,
): void {
  const holdX = 20;
  const holdY = BOARD_Y + 20;
  const boxW = 80;
  const boxH = 72;

  // Label
  ctx.fillStyle = COLORS.panelText;
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('HOLD', holdX + boxW / 2, holdY - 4);

  if (holdPiece) {
    ctx.strokeStyle = holdUsed ? '#553333' : COLORS.boardBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(holdX, holdY, boxW, boxH);

    const opacity = holdUsed ? 0.4 : 1.0;
    drawPieceInBox(ctx, holdPiece, holdX, holdY, boxW, boxH, 14, { opacity });
  } else {
    ctx.strokeStyle = COLORS.boardBorder;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(holdX, holdY, boxW, boxH);
    ctx.setLineDash([]);
  }

  // Hold suggestion indicator (guided mode)
  if (holdSuggestion != null) {
    ctx.strokeStyle = '#00E676';
    ctx.lineWidth = 2;
    ctx.strokeRect(holdX - 1, holdY - 1, boxW + 2, boxH + 2);

    ctx.fillStyle = '#00E676';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('\u2190 Hold', holdX + boxW / 2, holdY + boxH + 4);
  }
}

function drawDrillQueue(ctx: CanvasRenderingContext2D, queue: PieceType[]): void {
  const queueX = BOARD_X + LAYOUT.board.w + 20;
  const queueY = BOARD_Y + 20;
  const boxW = 72;
  const slotH = 56;
  const count = Math.min(queue.length, 5);

  if (count === 0) return;

  // Label
  ctx.fillStyle = COLORS.panelText;
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('NEXT', queueX + boxW / 2, queueY - 4);

  // Container
  const totalH = count * slotH;
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(queueX, queueY, boxW, totalH);

  for (let i = 0; i < count; i++) {
    const piece = queue[i]!;
    const slotY = queueY + i * slotH;
    drawPieceInBox(ctx, piece, queueX + 4, slotY + 4, boxW - 8, slotH - 8, 12);

    if (i < count - 1) {
      ctx.strokeStyle = COLORS.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(queueX + 4, slotY + slotH + 0.5);
      ctx.lineTo(queueX + boxW - 4, slotY + slotH + 0.5);
      ctx.stroke();
    }
  }
}

function drawControlsHelp(ctx: CanvasRenderingContext2D): void {
  const y = BOARD_Y + LAYOUT.board.h + 28;
  const controls = [
    '\u2190\u2192: move',
    '\u2191/X: CW',
    'Z: CCW',
    '\u2193: soft drop',
    'Space: hard drop',
    'C: hold',
    'H: hints',
  ];

  ctx.fillStyle = '#555577';
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(controls.join('  \u00b7  '), CANVAS_W / 2, y);
}
