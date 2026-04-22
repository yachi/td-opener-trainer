/**
 * src/renderer/session.ts — Unified single-screen renderer for the L9 Session redesign.
 *
 * One entry point: renderSession(ctx, session). The function inspects
 * session.phase and draws the appropriate phase-specific right panel,
 * the live board, the title bar, and the bottom keybind bar.
 *
 * Layout (from docs/superpowers/specs/2026-04-09-l9-session-redesign.md §4.4):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  [Session: 12 / 15 · streak 5]          tetris-td practice   │  title bar
 *   ├─────────────────────┬────────────────────────────────────────┤
 *   │                     │  Phase: guess bag 1                    │
 *   │   BOARD (live)      │  Bag: Z S J L T I O                    │
 *   │                     │  ...phase-specific content...          │
 *   ├─────────────────────┴────────────────────────────────────────┤
 *   │  1/2/3/4 opener  M mirror  ENTER submit  P auto/manual  R new│  keybind bar
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Phase-specific right panels:
 *   - guess1: bag1 pieces, 4 opener rules, mirror toggle indicator, submit hint
 *   - reveal1: opener name, step counter, navigation hint
 *   - guess2: bag2 pieces, available routes, route selection hint
 *   - reveal2: route name, step counter, navigation hint
 *
 * Reuses CANVAS_W, CANVAS_H, COLORS, drawCell, drawPieceInBox, roundRect from board.ts.
 * Reuses drawStatusBar from hud.ts (kept thin: we draw our own title bar instead).
 *
 * Imports the Session type from src/session.ts (created by Agent A).
 */

import type { PieceType } from '../core/types';
import type { OpenerID } from '../openers/types';
import type { ActivePiece } from '../core/srs';
import { getPieceCells, getGhostPosition } from '../core/srs';
import {
  CANVAS_W,
  CANVAS_H,
  COLORS,
  drawCell,
  drawPieceInBox,
  roundRect,
} from './board';
import { OPENERS, DECISION_PIECES, DECISION_PIECES_MIRROR } from '../openers/decision';
import { getBag2Routes } from '../openers/bag2-routes';
import { getBag2Sequence } from '../openers/sequences';
import { getBag3Hint } from '../openers/bag3-hints';
import { getPcSolutions } from '../openers/bag3-pc';
import type { Board } from '../core/srs';
import { isRevealPhase, PHASE_META, type Session } from '../session';

const FONT = '-apple-system, sans-serif';

// ── Layout constants ──

const TITLE_BAR_H = 36;
const NAV_BAR_H = 28;
const KEYBIND_BAR_H = 36;

// Board area (left half).
// Show the full 20-row playfield so spawn-row pieces are visible in manual
// mode. At 28px cells this is 280×560 — fits the 640×720 canvas with room
// for title bar (36), nav bar (28), top pad (16), and keybind bar (36).
const BOARD_CELL = 28;
const BOARD_VISIBLE_ROWS = 20;
const BOARD_X = 24;
const BOARD_Y = TITLE_BAR_H + NAV_BAR_H + 16;
const BOARD_W = 10 * BOARD_CELL; // 280
const BOARD_H = BOARD_VISIBLE_ROWS * BOARD_CELL; // 560

// Right panel.
const PANEL_X = BOARD_X + BOARD_W + 24;
const PANEL_Y = TITLE_BAR_H + NAV_BAR_H + 16;
const PANEL_W = CANVAS_W - PANEL_X - 16;
const PANEL_LINE_H = 18;

// ── Thumbnail layout ──
const THUMB_CELL = 6;
const THUMB_START_ROW = 12;
const THUMB_END_ROW = 20;
const THUMB_W = 10 * THUMB_CELL;                            // 60
const THUMB_H = (THUMB_END_ROW - THUMB_START_ROW) * THUMB_CELL; // 48
const THUMB_LABEL_H = 14;
const THUMB_CARD_W = THUMB_W + 4;                            // 64
const THUMB_CARD_H = THUMB_H + THUMB_LABEL_H + 6;           // 68
const THUMB_GAP = 6;
const THUMB_COLS = 4;

// Opener display order shown in the rule card (matches spec §4.4 numbering).
const OPENER_DISPLAY_ORDER: OpenerID[] = [
  'stray_cannon',
  'honey_cup',
  'gamushiro',
  'ms2',
];

const OPENER_SHORT: Record<OpenerID, string> = {
  stray_cannon: 'Stray',
  honey_cup: 'Honey',
  gamushiro: 'Gamushi',
  ms2: 'MS2',
};

// ═══════════════════════════════════════════════════════════════════════════
// Route thumbnail helpers
// ═══════════════════════════════════════════════════════════════════════════

const routeBoardCache = new Map<string, Board[]>();

function getRouteFinalBoards(opener: OpenerID, mirror: boolean): Board[] {
  const key = `${opener}:${mirror}`;
  const cached = routeBoardCache.get(key);
  if (cached) return cached;
  const routes = getBag2Routes(opener, mirror);
  const boards: Board[] = [];
  for (let i = 0; i < routes.length; i++) {
    const seq = getBag2Sequence(opener, mirror, i);
    if (seq && seq.fullSteps.length > 0) {
      boards.push(seq.fullSteps[seq.fullSteps.length - 1]!.board);
    }
  }
  routeBoardCache.set(key, boards);
  return boards;
}

function drawMiniBoard(
  ctx: CanvasRenderingContext2D,
  board: Board,
  x: number,
  y: number,
  cellSz: number,
  startRow: number,
  endRow: number,
): void {
  const cols = 10;
  const rows = endRow - startRow;
  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(x, y, cols * cellSz, rows * cellSz);
  for (let r = startRow; r < endRow; r++) {
    const row = board[r];
    if (!row) continue;
    for (let c = 0; c < cols; c++) {
      const cell = row[c];
      if (cell) {
        drawCell(ctx, x + c * cellSz, y + (r - startRow) * cellSz, cellSz, COLORS.pieces[cell] ?? '#888888');
      }
    }
  }
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, cols * cellSz - 1, rows * cellSz - 1);
}

function drawRouteThumbnails(
  ctx: CanvasRenderingContext2D,
  session: Session,
  y: number,
): void {
  if (!session.guess) return;
  const { opener, mirror } = session.guess;
  const boards = getRouteFinalBoards(opener, mirror);
  const routes = getBag2Routes(opener, mirror);
  if (boards.length === 0) return;
  const count = Math.min(boards.length, routes.length);
  const cols = Math.min(count, THUMB_COLS);
  const gridW = cols * THUMB_CARD_W + (cols - 1) * THUMB_GAP;
  const originX = PANEL_X + Math.max(0, (PANEL_W - gridW) / 2);

  for (let i = 0; i < count; i++) {
    const col = i % THUMB_COLS;
    const row = Math.floor(i / THUMB_COLS);
    const cx = originX + col * (THUMB_CARD_W + THUMB_GAP);
    const cy = y + row * (THUMB_CARD_H + THUMB_GAP);
    const isSelected = session.phase === 'reveal2' && i === session.routeGuess;

    // Card background.
    ctx.fillStyle = isSelected ? '#1A1A4A' : COLORS.statCardBg;
    roundRect(ctx, cx, cy, THUMB_CARD_W, THUMB_CARD_H, 3);
    ctx.fill();
    // Border.
    ctx.strokeStyle = isSelected ? '#FFFFFF' : COLORS.statCardBorder;
    ctx.lineWidth = isSelected ? 2 : 1;
    roundRect(ctx, cx, cy, THUMB_CARD_W, THUMB_CARD_H, 3);
    ctx.stroke();
    // Mini board.
    const board = boards[i];
    if (board) {
      drawMiniBoard(ctx, board, cx + 2, cy + 2, THUMB_CELL, THUMB_START_ROW, THUMB_END_ROW);
    }
    // Label.
    ctx.fillStyle = isSelected ? '#FFFFFF' : '#9999BB';
    ctx.font = `${isSelected ? 'bold ' : ''}10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${i + 1}`, cx + THUMB_CARD_W / 2, cy + THUMB_H + 5);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Public entry point
// ═══════════════════════════════════════════════════════════════════════════

export function renderSession(
  ctx: CanvasRenderingContext2D,
  session: Session,
): void {
  // 1. Clear canvas.
  ctx.fillStyle = COLORS.canvasBg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 2. Title bar (top): in-session stats + app name.
  drawTitleBar(ctx, session);

  // 2b. Navigation bar (below title bar).
  drawNavBar(ctx, session);

  // 3. Live board (left) — reads session.activePiece directly.
  drawLiveBoard(ctx, session);

  // 4. Phase-specific right panel.
  switch (session.phase) {
    case 'guess1':
      drawGuess1Panel(ctx, session);
      break;
    case 'reveal1':
      drawReveal1Panel(ctx, session);
      break;
    case 'guess2':
      drawGuess2Panel(ctx, session);
      break;
    case 'reveal2':
      drawReveal2Panel(ctx, session);
      break;
    case 'guess3':
      drawGuess3Panel(ctx, session);
      break;
    case 'reveal3':
      drawReveal3Panel(ctx, session);
      break;
  }

  // 5. Keybind bar (bottom).
  drawKeybindBar(ctx, session);
}

// ═══════════════════════════════════════════════════════════════════════════
// Title bar
// ═══════════════════════════════════════════════════════════════════════════

function drawTitleBar(ctx: CanvasRenderingContext2D, session: Session): void {
  ctx.fillStyle = COLORS.tabBg;
  ctx.fillRect(0, 0, CANVAS_W, TITLE_BAR_H);

  // Bottom border.
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, TITLE_BAR_H + 0.5);
  ctx.lineTo(CANVAS_W, TITLE_BAR_H + 0.5);
  ctx.stroke();

  // Left: in-session stats.
  const { total, correct, streak } = session.sessionStats;
  const statsLabel = `Session: ${correct} / ${total} \u00b7 streak ${streak}`;
  ctx.fillStyle = COLORS.tabTextActive;
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(statsLabel, 16, TITLE_BAR_H / 2);

  // Right: app name.
  ctx.fillStyle = COLORS.tabText;
  ctx.font = `13px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('tetris-td practice', CANVAS_W - 16, TITLE_BAR_H / 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// Navigation bar (below title bar)
// ═══════════════════════════════════════════════════════════════════════════

const NAV_SHORT: Record<OpenerID, string> = {
  honey_cup: 'HC',
  ms2: 'MS2',
  gamushiro: 'Gamu',
  stray_cannon: 'SC',
};

function navLabels(session: Session): [string, string, string] {
  const g = session.guess;
  // Bag 1: opener short name (+ ✓ if visited)
  let bag1 = 'Bag 1';
  if (g) {
    const short = NAV_SHORT[g.opener];
    const visited = !!session.revealSnapshots.reveal1;
    bag1 = visited ? `${short} ✓` : short;
  }
  // Bag 2: route position
  let bag2 = 'Bag 2';
  if (g && session.routeGuess >= 0) {
    const total = getBag2Routes(g.opener, g.mirror).length;
    bag2 = `Rt ${session.routeGuess + 1}/${total}`;
  }
  // Bag 3: PC solution position
  let bag3 = 'Bag 3';
  if (g && session.pcSolutionIndex >= 0) {
    const total = getPcSolutions(g.opener, g.mirror, session.routeGuess).length;
    bag3 = total > 0 ? `PC ${session.pcSolutionIndex + 1}/${total}` : 'PC —';
  }
  return [bag1, bag2, bag3];
}

function drawNavBar(ctx: CanvasRenderingContext2D, session: Session): void {
  const y = TITLE_BAR_H;

  // Background.
  ctx.fillStyle = '#0E0E22';
  ctx.fillRect(0, y, CANVAS_W, NAV_BAR_H);

  // Bottom border.
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + NAV_BAR_H + 0.5);
  ctx.lineTo(CANVAS_W, y + NAV_BAR_H + 0.5);
  ctx.stroke();

  const currentBag = PHASE_META[session.phase].bag;
  const labels = navLabels(session);
  const tabW = 80;
  const tabH = NAV_BAR_H - 4;
  const gap = 8;
  const totalW = 3 * tabW + 2 * gap;
  const startX = (CANVAS_W - totalW) / 2;

  for (let i = 0; i < 3; i++) {
    const bag = (i + 1) as 1 | 2 | 3;
    const phase = `reveal${bag}` as 'reveal1' | 'reveal2' | 'reveal3';
    const hasSnapshot = !!session.revealSnapshots[phase];
    const isActive = currentBag === bag;

    const tx = startX + i * (tabW + gap);
    const ty = y + 2;

    // Tab background.
    if (isActive) {
      ctx.fillStyle = '#2A2A5A';
    } else if (hasSnapshot) {
      ctx.fillStyle = '#1A1A3A';
    } else {
      ctx.fillStyle = '#0E0E22';
    }
    roundRect(ctx, tx, ty, tabW, tabH, 4);
    ctx.fill();

    // Tab border for active.
    if (isActive) {
      ctx.strokeStyle = '#6060C0';
      ctx.lineWidth = 1.5;
      roundRect(ctx, tx, ty, tabW, tabH, 4);
      ctx.stroke();
    }

    // Tab label.
    ctx.font = `${isActive ? 'bold ' : ''}12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isActive) {
      ctx.fillStyle = COLORS.tabTextActive;
    } else if (hasSnapshot) {
      ctx.fillStyle = COLORS.tabText;
    } else {
      ctx.fillStyle = '#505070';
    }
    ctx.fillText(labels[i], tx + tabW / 2, ty + tabH / 2);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Live board (left)
// ═══════════════════════════════════════════════════════════════════════════

function drawLiveBoard(
  ctx: CanvasRenderingContext2D,
  session: Session,
): void {
  const activePiece = session.activePiece;
  // Background.
  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);

  // Grid lines.
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  for (let r = 0; r <= BOARD_VISIBLE_ROWS; r++) {
    const y = BOARD_Y + r * BOARD_CELL;
    ctx.beginPath();
    ctx.moveTo(BOARD_X, y + 0.5);
    ctx.lineTo(BOARD_X + BOARD_W, y + 0.5);
    ctx.stroke();
  }
  for (let c = 0; c <= 10; c++) {
    const x = BOARD_X + c * BOARD_CELL;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, BOARD_Y);
    ctx.lineTo(x + 0.5, BOARD_Y + BOARD_H);
    ctx.stroke();
  }

  // Border.
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);

  // Locked cells from session.board (display bottom BOARD_VISIBLE_ROWS rows).
  const board = session.board;
  const startBoardRow = 20 - BOARD_VISIBLE_ROWS;
  for (let visR = 0; visR < BOARD_VISIBLE_ROWS; visR++) {
    const boardRow = startBoardRow + visR;
    const row = board[boardRow];
    if (!row) continue;
    for (let c = 0; c < 10; c++) {
      const cell = row[c];
      if (cell) {
        const px = BOARD_X + c * BOARD_CELL;
        const py = BOARD_Y + visR * BOARD_CELL;
        const color = COLORS.pieces[cell] ?? '#888888';
        drawCell(ctx, px, py, BOARD_CELL, color);
      }
    }
  }

  // Manual-mode hint overlay: outline the next target cells when in a reveal
  // phase with playMode='manual'. Resolved default: always show the hint in
  // manual mode (no separate H toggle in Session shape).
  const isReveal = isRevealPhase(session.phase);
  if (isReveal && session.playMode === 'manual') {
    drawNextTargetGhost(ctx, session, startBoardRow);
  }

  // Active piece + hard-drop ghost — only in manual reveal mode.
  if (isReveal && session.playMode === 'manual' && activePiece) {
    drawActivePiece(ctx, session.board, activePiece, startBoardRow);
  }
}

function drawActivePiece(
  ctx: CanvasRenderingContext2D,
  board: import('../core/srs').Board,
  piece: ActivePiece,
  startBoardRow: number,
): void {
  const color = COLORS.pieces[piece.type] ?? '#FFFFFF';

  // Hard-drop ghost — translucent silhouette at the landing row.
  const ghost = getGhostPosition(board, piece);
  ctx.save();
  ctx.globalAlpha = 0.25;
  for (const { col, row } of getPieceCells(ghost)) {
    if (row < startBoardRow || row >= 20) continue;
    const visR = row - startBoardRow;
    const px = BOARD_X + col * BOARD_CELL;
    const py = BOARD_Y + visR * BOARD_CELL;
    drawCell(ctx, px, py, BOARD_CELL, color);
  }
  ctx.restore();

  // Active piece itself at full opacity.
  for (const { col, row } of getPieceCells(piece)) {
    if (row < startBoardRow || row >= 20) continue;
    const visR = row - startBoardRow;
    const px = BOARD_X + col * BOARD_CELL;
    const py = BOARD_Y + visR * BOARD_CELL;
    drawCell(ctx, px, py, BOARD_CELL, color);
  }
}

function drawNextTargetGhost(
  ctx: CanvasRenderingContext2D,
  session: Session,
  startBoardRow: number,
): void {
  const step = session.cachedSteps[session.step];
  if (!step) return;
  const color = COLORS.pieces[step.piece] ?? '#FFFFFF';

  ctx.save();
  ctx.globalAlpha = 0.35;
  for (const { col, row } of step.newCells) {
    if (row < startBoardRow || row >= 20) continue;
    const visR = row - startBoardRow;
    const px = BOARD_X + col * BOARD_CELL;
    const py = BOARD_Y + visR * BOARD_CELL;
    drawCell(ctx, px, py, BOARD_CELL, color);
  }
  ctx.restore();

  // White outline on top so the target is universally visible.
  ctx.save();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.5;
  for (const { col, row } of step.newCells) {
    if (row < startBoardRow || row >= 20) continue;
    const visR = row - startBoardRow;
    const px = BOARD_X + col * BOARD_CELL;
    const py = BOARD_Y + visR * BOARD_CELL;
    ctx.strokeRect(px + 1, py + 1, BOARD_CELL - 2, BOARD_CELL - 2);
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// Right-panel helpers
// ═══════════════════════════════════════════════════════════════════════════

function drawPanelHeading(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
): void {
  ctx.fillStyle = COLORS.panelHeading;
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, PANEL_X, y);
}

function drawPanelLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  color: string = COLORS.panelText,
  bold: boolean = false,
): void {
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, PANEL_X, y);
}

/**
 * Word-wrap text to fit within maxWidth using measureText.
 * Falls back to character-level splitting for words exceeding maxWidth.
 */
export function computeWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (text === '') return [];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? current + ' ' + word : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      if (ctx.measureText(word).width > maxWidth) {
        // Character-level split for oversized words
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width <= maxWidth) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Draw the bag pieces inline as small piece previews. Returns the y-coordinate
 * just below the bag row.
 */
function drawBagRow(
  ctx: CanvasRenderingContext2D,
  bag: PieceType[],
  y: number,
): number {
  const slotW = 28;
  const slotH = 28;
  const cellSz = 6;
  for (let i = 0; i < bag.length; i++) {
    const piece = bag[i]!;
    const x = PANEL_X + i * (slotW + 2);
    // Slot background.
    ctx.fillStyle = COLORS.statCardBg;
    ctx.fillRect(x, y, slotW, slotH);
    ctx.strokeStyle = COLORS.statCardBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, slotW - 1, slotH - 1);
    drawPieceInBox(ctx, piece, x, y, slotW, slotH, cellSz);
  }
  return y + slotH + 8;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase: guess1
// ═══════════════════════════════════════════════════════════════════════════

function drawGuess1Panel(
  ctx: CanvasRenderingContext2D,
  session: Session,
): void {
  let y = PANEL_Y;
  drawPanelHeading(ctx, 'Phase: guess bag 1', y);
  y += PANEL_LINE_H + 4;

  // Bag pieces.
  drawPanelLine(ctx, 'Bag:', y);
  y += PANEL_LINE_H;
  y = drawBagRow(ctx, session.bag1, y);

  // Mirror state for rule display.
  const mirror = session.guess?.mirror ?? false;
  const dp = mirror ? DECISION_PIECES_MIRROR : DECISION_PIECES;

  // 4 opener rows. Highlight the currently selected guess (if any).
  const selectedOpener = session.guess?.opener ?? null;
  for (let i = 0; i < OPENER_DISPLAY_ORDER.length; i++) {
    const id = OPENER_DISPLAY_ORDER[i]!;
    const num = i + 1;
    const isSelected = id === selectedOpener;

    // Selected highlight bar.
    if (isSelected) {
      ctx.fillStyle = COLORS.buttonActive;
      roundRect(ctx, PANEL_X - 4, y - 2, PANEL_W, PANEL_LINE_H + 2, 4);
      ctx.fill();
    }

    const label = `(${num}) ${OPENER_SHORT[id].padEnd(8)} ${dp[id].rule}`;
    drawPanelLine(
      ctx,
      label,
      y,
      isSelected ? '#FFFFFF' : COLORS.panelText,
      isSelected,
    );
    y += PANEL_LINE_H;
  }

  y += 6;

  // Mirror toggle indicator.
  drawPanelLine(
    ctx,
    `[M] mirror: ${mirror ? 'ON' : 'off'}`,
    y,
    mirror ? '#FFCC66' : COLORS.panelText,
    mirror,
  );
  y += PANEL_LINE_H + 6;

  // Submit / feedback hint.
  if (session.correct === null) {
    drawPanelLine(
      ctx,
      'ENTER submit \u00b7 SPACE new bag',
      y,
      '#9999BB',
    );
  } else {
    // Feedback after submit (correct gets reset on phase change, but defensive).
    if (session.correct) {
      drawPanelLine(ctx, '\u2713 CORRECT', y, COLORS.correct, true);
    } else {
      drawPanelLine(ctx, '\u2717 WRONG', y, COLORS.incorrect, true);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase: reveal1
// ═══════════════════════════════════════════════════════════════════════════

function drawReveal1Panel(
  ctx: CanvasRenderingContext2D,
  session: Session,
): void {
  let y = PANEL_Y;
  drawPanelHeading(
    ctx,
    `Reveal (${session.playMode})`,
    y,
  );
  y += PANEL_LINE_H + 4;

  // Correctness badge.
  if (session.correct === true) {
    drawPanelLine(ctx, '\u2713 CORRECT', y, COLORS.correct, true);
  } else if (session.correct === false) {
    drawPanelLine(ctx, '\u2717 WRONG \u2014 showing answer', y, COLORS.incorrect, true);
  }
  y += PANEL_LINE_H + 4;

  // Opener name.
  if (session.guess) {
    const def = OPENERS[session.guess.opener];
    const mirrorLabel = session.guess.mirror ? ' (Mirror)' : '';
    drawPanelLine(
      ctx,
      `${def.nameEn}${mirrorLabel}`,
      y,
      COLORS.panelHeading,
      true,
    );
    y += PANEL_LINE_H;
    drawPanelLine(ctx, `(${def.nameCn})`, y, COLORS.panelText);
    y += PANEL_LINE_H + 4;
  }

  // Step counter.
  const total = session.cachedSteps.length;
  drawPanelLine(ctx, `step ${session.step} / ${total}`, y, COLORS.panelText);
  y += PANEL_LINE_H + 4;

  // Hold piece panel:
  //   - Auto mode: show the doctrinal hold (strategy hint — what you
  //     SHOULD hold for this opener).
  //   - Manual mode: show session.holdPiece (what the user actually has
  //     in hold), falling back to the doctrinal hint before the first hold.
  //
  // Bug #1 fix: previously this always showed def.holdPiece, so the
  // render never reflected the user's hold action. session.holdPiece is
  // the single source of truth once the user has held.
  if (session.guess) {
    const def = OPENERS[session.guess.opener];
    const doctrinalHold = session.guess.mirror ? def.holdPieceMirror : def.holdPiece;
    const displayHold =
      session.playMode === 'manual' && session.holdPiece !== null
        ? session.holdPiece
        : doctrinalHold;
    const label =
      session.playMode === 'manual' && session.holdPiece !== null
        ? 'Hold (held):'
        : 'Hold:';
    drawPanelLine(ctx, label, y);
    y += PANEL_LINE_H;
    const slotX = PANEL_X;
    const slotY = y;
    const slotW = 50;
    const slotH = 50;
    ctx.fillStyle = COLORS.statCardBg;
    ctx.fillRect(slotX, slotY, slotW, slotH);
    ctx.strokeStyle = COLORS.boardBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(slotX + 0.5, slotY + 0.5, slotW - 1, slotH - 1);
    drawPieceInBox(ctx, displayHold, slotX, slotY, slotW, slotH, 10);
    y += slotH + 8;
  }

  // Navigation hint — manual only (auto hints live in keybind bar).
  if (session.playMode === 'manual') {
    drawPanelLine(ctx, '\u2190\u2192 move  \u2193 soft drop', y, '#9999BB');
    y += PANEL_LINE_H;
    drawPanelLine(ctx, 'Z/X rotate  SPACE hard drop  C hold', y, '#9999BB');
    y += PANEL_LINE_H;
    drawPanelLine(ctx, 'P auto \u00b7 R new bag', y, '#9999BB');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase: guess2
// ═══════════════════════════════════════════════════════════════════════════

function drawGuess2Panel(
  ctx: CanvasRenderingContext2D,
  session: Session,
): void {
  let y = PANEL_Y;
  drawPanelHeading(ctx, 'Phase: guess bag 2 route', y);
  y += PANEL_LINE_H + 4;

  // Show the opener context (we're past bag1).
  if (session.guess) {
    const def = OPENERS[session.guess.opener];
    const mirrorLabel = session.guess.mirror ? ' (Mirror)' : '';
    drawPanelLine(
      ctx,
      `Opener: ${def.nameEn}${mirrorLabel}`,
      y,
      '#CCAA44',
      true,
    );
    y += PANEL_LINE_H + 4;
  }

  // Bag pieces.
  drawPanelLine(ctx, 'Bag 2:', y);
  y += PANEL_LINE_H;
  y = drawBagRow(ctx, session.bag2, y);

  // Routes for the current opener.
  if (session.guess) {
    const routes = getBag2Routes(session.guess.opener, session.guess.mirror);
    drawPanelLine(ctx, 'Routes:', y);
    y += PANEL_LINE_H;
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i]!;
      const num = i + 1;
      drawPanelLine(
        ctx,
        `(${num}) ${route.routeLabel}`,
        y,
        COLORS.panelText,
      );
      y += PANEL_LINE_H;
      drawPanelLine(
        ctx,
        `    ${route.conditionLabel}`,
        y,
        '#7777AA',
      );
      y += PANEL_LINE_H;
    }
  }

  y += 4;
  // Route thumbnails.
  if (session.guess) {
    drawRouteThumbnails(ctx, session, y);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase: reveal2
// ═══════════════════════════════════════════════════════════════════════════

function drawReveal2Panel(
  ctx: CanvasRenderingContext2D,
  session: Session,
): void {
  let y = PANEL_Y;
  drawPanelHeading(
    ctx,
    `Reveal Bag 2 (${session.playMode})`,
    y,
  );
  y += PANEL_LINE_H + 4;

  // Opener + route name.
  if (session.guess) {
    const def = OPENERS[session.guess.opener];
    const mirrorLabel = session.guess.mirror ? ' (Mirror)' : '';
    drawPanelLine(
      ctx,
      `${def.nameEn}${mirrorLabel}`,
      y,
      COLORS.panelHeading,
      true,
    );
    y += PANEL_LINE_H;

    const routes = getBag2Routes(session.guess.opener, session.guess.mirror);
    const route = routes[session.routeGuess];
    if (route) {
      drawPanelLine(ctx, `Route ${session.routeGuess + 1}/${routes.length}: ${route.routeLabel}`, y, '#CCAA44');
      y += PANEL_LINE_H;
      drawPanelLine(ctx, route.conditionLabel, y, '#7777AA');
      y += PANEL_LINE_H + 4;
    }

    // Bag 3 PC hint card (wiki-sourced)
    const hint = getBag3Hint(session.guess.opener, session.guess.mirror);
    if (hint) {
      const cardPad = 6;
      const lineH = 14;
      ctx.font = `11px ${FONT}`;
      const lines = computeWrappedLines(ctx, hint, PANEL_W - cardPad * 2);
      const cardH = lines.length * lineH + cardPad * 2;
      ctx.fillStyle = COLORS.statCardBg;
      roundRect(ctx, PANEL_X, y, PANEL_W, cardH, 4);
      ctx.fill();
      ctx.strokeStyle = COLORS.statCardBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, PANEL_X + 0.5, y + 0.5, PANEL_W - 1, cardH - 1, 4);
      ctx.stroke();
      ctx.fillStyle = '#9999BB';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i]!, PANEL_X + cardPad, y + cardPad + i * lineH);
      }
      y += cardH + 6;
    }
  }

  // Step counter.
  const total = session.cachedSteps.length;
  drawPanelLine(ctx, `step ${session.step} / ${total}`, y, COLORS.panelText);
  y += PANEL_LINE_H + 4;

  // Route thumbnails (auto mode — manual mode uses this space for hold piece).
  if (session.playMode === 'auto' && session.guess) {
    drawRouteThumbnails(ctx, session, y);
    const routes = getBag2Routes(session.guess.opener, session.guess.mirror);
    const thumbRows = Math.ceil(routes.length / THUMB_COLS);
    y += thumbRows * (THUMB_CARD_H + THUMB_GAP) + 4;
  }

  // Hold piece (Bug #1 fix — partial symmetry with drawReveal1Panel).
  //
  // INTENTIONAL ASYMMETRY vs reveal1: in reveal2 auto mode we do NOT show
  // the opener's doctrinal hold. The doctrinal hold is a hint for BAG 1
  // ("hold this before you start"), and by the time we're in reveal2 the
  // user has already placed bag 1. Showing "Hold: J" during reveal2 auto
  // would suggest the user should be holding J NOW, which is wrong —
  // J was already used during bag 1 setup.
  //
  // We DO show `session.holdPiece` when the user is manually playing AND
  // has actively held a piece mid-route. That reflects their real-time
  // play state and is always accurate.
  //
  // If a route ever needs a different doctrinal hold (some bag2 routes
  // have `holdPlacement` in their data), that would require a separate
  // display path — out of scope for the current Bug #1 fix.
  if (session.guess && session.playMode === 'manual' && session.holdPiece !== null) {
    drawPanelLine(ctx, 'Hold (held):', y);
    y += PANEL_LINE_H;
    const slotX = PANEL_X;
    const slotY = y;
    const slotW = 50;
    const slotH = 50;
    ctx.fillStyle = COLORS.statCardBg;
    ctx.fillRect(slotX, slotY, slotW, slotH);
    ctx.strokeStyle = COLORS.boardBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(slotX + 0.5, slotY + 0.5, slotW - 1, slotH - 1);
    drawPieceInBox(ctx, session.holdPiece, slotX, slotY, slotW, slotH, 10);
    y += slotH + 8;
  } else {
    y += 4;
  }

  // Navigation hint — manual only (auto hints live in keybind bar).
  if (session.playMode === 'manual') {
    drawPanelLine(ctx, '\u2190\u2192 move  \u2193 soft drop', y, '#9999BB');
    y += PANEL_LINE_H;
    drawPanelLine(ctx, 'Z/X rotate  SPACE hard drop  C hold', y, '#9999BB');
    y += PANEL_LINE_H;
    drawPanelLine(ctx, 'P auto \u00b7 R new bag', y, '#9999BB');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase: guess3
// ═══════════════════════════════════════════════════════════════════════════

function drawGuess3Panel(
  ctx: CanvasRenderingContext2D,
  session: Session,
): void {
  let y = PANEL_Y;
  drawPanelHeading(ctx, 'Phase: pick PC solution', y);
  y += PANEL_LINE_H + 4;

  // Opener context.
  if (session.guess) {
    const def = OPENERS[session.guess.opener];
    const mirrorLabel = session.guess.mirror ? ' (Mirror)' : '';
    drawPanelLine(
      ctx,
      `${def.nameEn}${mirrorLabel} (post-TST board)`,
      y,
      '#CCAA44',
      true,
    );
    y += PANEL_LINE_H + 4;
  }

  // List PC solutions.
  if (session.guess) {
    const solutions = getPcSolutions(session.guess.opener, session.guess.mirror, session.routeGuess);
    if (solutions.length === 0) {
      drawPanelLine(ctx, 'No PC solutions available', y, '#9999BB');
      y += PANEL_LINE_H;
    } else {
      drawPanelLine(ctx, 'PC solutions:', y);
      y += PANEL_LINE_H;
      for (let i = 0; i < solutions.length; i++) {
        const sol = solutions[i]!;
        const isSelected = session.pcSolutionIndex === i;

        // Selected highlight bar.
        if (isSelected) {
          ctx.fillStyle = COLORS.buttonActive;
          roundRect(ctx, PANEL_X - 4, y - 2, PANEL_W, PANEL_LINE_H + 2, 4);
          ctx.fill();
        }

        const label = `(${i + 1}) hold ${sol.holdPiece}`;
        drawPanelLine(
          ctx,
          label,
          y,
          isSelected ? '#FFFFFF' : COLORS.panelText,
          isSelected,
        );

        // Draw the hold piece preview inline.
        const textW = ctx.measureText(label).width;
        const previewX = PANEL_X + textW + 8;
        const previewSz = 16;
        const cellSz = 3;
        drawPieceInBox(ctx, sol.holdPiece, previewX, y - 1, previewSz, previewSz, cellSz);

        y += PANEL_LINE_H;
      }
    }
  }

  y += 6;
  drawPanelLine(ctx, '1-4 pick \u00b7 SPACE first', y, '#9999BB');
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase: reveal3
// ═══════════════════════════════════════════════════════════════════════════

function drawReveal3Panel(
  ctx: CanvasRenderingContext2D,
  session: Session,
): void {
  let y = PANEL_Y;
  drawPanelHeading(
    ctx,
    `PC Reveal (${session.playMode})`,
    y,
  );
  y += PANEL_LINE_H + 4;

  // Solution info.
  if (session.guess) {
    const solutions = getPcSolutions(session.guess.opener, session.guess.mirror, session.routeGuess);
    const sol = solutions[session.pcSolutionIndex];
    if (sol) {
      drawPanelLine(
        ctx,
        `Solution ${session.pcSolutionIndex + 1}/${solutions.length} (hold ${sol.holdPiece})`,
        y,
        COLORS.panelHeading,
        true,
      );
      y += PANEL_LINE_H + 4;

      // Hold piece box.
      drawPanelLine(ctx, 'Hold:', y);
      y += PANEL_LINE_H;
      const slotX = PANEL_X;
      const slotY = y;
      const slotW = 50;
      const slotH = 50;
      ctx.fillStyle = COLORS.statCardBg;
      ctx.fillRect(slotX, slotY, slotW, slotH);
      ctx.strokeStyle = COLORS.boardBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(slotX + 0.5, slotY + 0.5, slotW - 1, slotH - 1);
      drawPieceInBox(ctx, sol.holdPiece, slotX, slotY, slotW, slotH, 10);
      y += slotH + 8;
    }
  }

  // Step counter.
  const total = session.cachedSteps.length;
  const atEnd = session.step >= total;
  drawPanelLine(ctx, `step ${session.step} / ${total}`, y, COLORS.panelText);
  y += PANEL_LINE_H + 4;

  // "Perfect Clear!" banner when all steps are placed.
  if (atEnd && total > 0) {
    ctx.fillStyle = COLORS.correct;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Perfect Clear!', PANEL_X, y);
    y += 24;
  }

  // Navigation hint — manual only (auto hints live in keybind bar).
  if (session.playMode === 'manual') {
    drawPanelLine(ctx, '\u2190\u2192 move  \u2193 soft drop', y, '#9999BB');
    y += PANEL_LINE_H;
    drawPanelLine(ctx, 'Z/X rotate  SPACE hard drop  C hold', y, '#9999BB');
    y += PANEL_LINE_H;
    drawPanelLine(ctx, 'P auto \u00b7 R new bag', y, '#9999BB');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Keybind bar (bottom)
// ═══════════════════════════════════════════════════════════════════════════

function drawKeybindBar(
  ctx: CanvasRenderingContext2D,
  session: Session,
): void {
  const y = CANVAS_H - KEYBIND_BAR_H;
  ctx.fillStyle = COLORS.statusBarBg;
  ctx.fillRect(0, y, CANVAS_W, KEYBIND_BAR_H);

  // Top border.
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + 0.5);
  ctx.lineTo(CANVAS_W, y + 0.5);
  ctx.stroke();

  const hint = keybindHintForSession(session);

  ctx.fillStyle = COLORS.panelText;
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hint, CANVAS_W / 2, y + KEYBIND_BAR_H / 2);
}

function keybindHintForSession(session: Session): string {
  // Show [/] nav only when an adjacent bag's snapshot exists (jumping is possible).
  const bag = PHASE_META[session.phase].bag;
  const snaps = session.revealSnapshots;
  const canJumpPrev = bag > 1 && !!(snaps as Record<string, unknown>)[`reveal${bag - 1}`];
  const canJumpNext = bag < 3 && !!(snaps as Record<string, unknown>)[`reveal${bag + 1}`];
  const nav = canJumpPrev || canJumpNext ? '  [/] nav' : '';

  switch (session.phase) {
    case 'guess1':
      return '1/2/3/4 opener  M mirror  ENTER submit  R new bag';
    case 'reveal1':
      return session.playMode === 'manual'
        ? '\u2190\u2192 move  Z/X rotate  SPACE drop  C hold  P auto  R new'
        : `1-4 opener  M mirror  \u2190\u2192 step  SPACE next  P manual  R new${nav}`;
    case 'guess2': {
      const n = session.guess
        ? getBag2Routes(session.guess.opener, session.guess.mirror).length
        : 4;
      return `1-${n} select route  SPACE best  R new bag${nav}`;
    }
    case 'reveal2': {
      if (session.playMode === 'manual') {
        return '\u2190\u2192 move  Z/X rotate  SPACE drop  C hold  P auto  R new';
      }
      const n = session.guess
        ? getBag2Routes(session.guess.opener, session.guess.mirror).length
        : 4;
      return `1-${n} route  \u2190\u2192 step  SPACE next  P manual  R new${nav}`;
    }
    case 'guess3': {
      const n = session.guess
        ? getPcSolutions(session.guess.opener, session.guess.mirror, session.routeGuess).length
        : 4;
      return `1-${n} pick  SPACE first  R new bag${nav}`;
    }
    case 'reveal3': {
      if (session.playMode === 'manual') {
        return '\u2190\u2192 move  Z/X rotate  SPACE drop  C hold  P auto  R new';
      }
      const n = session.guess
        ? getPcSolutions(session.guess.opener, session.guess.mirror, session.routeGuess).length
        : 4;
      return `1-${n} solution  \u2190\u2192 step  SPACE next  P manual  R new${nav}`;
    }
  }
}
