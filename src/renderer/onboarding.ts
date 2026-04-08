import type { PieceType } from '../core/types';
import type { OpenerID } from '../openers/types';
import type { OnboardingProgress, WorkedExample, Bag2WorkedExample } from '../modes/onboarding';
import type { QuizQueueOptions } from './queue';
import { getWorkedExamples, getBag2WorkedExamples, STAGE_ORDER } from '../modes/onboarding';
import { OPENERS, DECISION_PIECES } from '../openers/decision';
import { getBag2Routes } from '../openers/bag2-routes';
import { CANVAS_W, CANVAS_H, COLORS, drawPieceInBox, roundRect, drawCell } from './board';
import { drawQuizQueue } from './queue';
import { drawTabs, drawStatusBar } from './hud';
import { getOpenerSequence, createVisualizerState } from '../modes/visualizer';

// ── Shared constants ──

const FONT = '-apple-system, sans-serif';
const CARD_BG = '#0F0F25';
const CARD_BORDER = '#3A3A5C';
const CARD_RADIUS = 12;
const MUTED = '#8888AA';
const HINT_COLOR = '#9999BB'; // was #666688 — too faint, user couldn't see "[Space] to continue"

// ── Interfaces ──

export interface DrillRenderData {
  openerId: OpenerID;
  bag: PieceType[];
  phase: 'asking' | 'answered';
  answer: boolean | null;
  isCorrect: boolean | null;
  correctAnswer: boolean;
  total: number;
  correct: number;
  threshold: { window: number; required: number };
  // Bag 2 fields
  isBag2?: boolean;
  route0Label?: string;
  route1Label?: string;
  selectedRouteIndex?: number | null;
  correctRouteIndex?: number | null;
}

export interface CelebrationData {
  openerId: OpenerID;
  total: number;
  correct: number;
  nextStage: string | null;
  nextOpenerName: string | null;
  motivation: string;
}

// ── Helpers ──

function centerX(): number {
  return CANVAS_W / 2;
}

function openerDisplay(openerId: OpenerID): { en: string; cn: string } {
  const def = OPENERS[openerId];
  return { en: def.nameEn, cn: def.nameCn };
}

function stageLabel(openerId: OpenerID, currentBag: 1 | 2 = 1): string {
  const idx = STAGE_ORDER.indexOf(openerId);
  if (idx < 0) return `Learning ${openerDisplay(openerId).en}`;
  const bagLabel = currentBag === 2 ? ' (Bag 2)' : '';
  const stageNum = currentBag === 2
    ? STAGE_ORDER.length + idx + 1
    : idx + 1;
  const totalStages = STAGE_ORDER.length * 2;
  return `Stage ${stageNum} of ${totalStages}${bagLabel}`;
}

function drawSeparator(ctx: CanvasRenderingContext2D, y: number, margin = 80): void {
  ctx.strokeStyle = CARD_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, y + 0.5);
  ctx.lineTo(CANVAS_W - margin, y + 0.5);
  ctx.stroke();
}

// ── Stage Selector ──

const SELECTOR_STAGES: { id: OpenerID; bag: 1 | 2; label: string }[] = [
  { id: 'ms2', bag: 1, label: 'MS2 (山岳)' },
  { id: 'honey_cup', bag: 1, label: 'Honey Cup (蜜蜂)' },
  { id: 'stray_cannon', bag: 1, label: 'Stray Cannon (迷走)' },
  { id: 'gamushiro', bag: 1, label: 'Gamushiro (糖漿)' },
  { id: 'ms2', bag: 2, label: 'MS2 (山岳)' },
  { id: 'honey_cup', bag: 2, label: 'Honey Cup (蜜蜂)' },
  { id: 'stray_cannon', bag: 2, label: 'Stray Cannon (迷走)' },
  { id: 'gamushiro', bag: 2, label: 'Gamushiro (糖漿)' },
];

export function renderOnboardingSelector(
  ctx: CanvasRenderingContext2D,
  progress: OnboardingProgress,
  selectedIndex: number,
): void {
  const cx = centerX();

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Choose a Stage', cx, 60);

  const btnW = 280;
  const btnH = 40;
  const gap = 6;
  const sectionGap = 16;
  const headerH = 24;

  // Compute current stage index for "current" indicator
  let currentIdx = -1;
  if (progress.currentStage !== 'complete') {
    const openerIdx = STAGE_ORDER.indexOf(progress.currentStage as OpenerID);
    if (openerIdx >= 0) {
      currentIdx = progress.currentBag === 2 ? openerIdx + 4 : openerIdx;
    }
  }

  let y = 100;

  // Bag 1 header
  ctx.fillStyle = MUTED;
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('\u2500\u2500 Bag 1 \u2500\u2500', cx, y);
  y += headerH;

  for (let i = 0; i < 8; i++) {
    // Bag 2 header before index 4
    if (i === 4) {
      y += sectionGap;
      ctx.fillStyle = MUTED;
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('\u2500\u2500 Bag 2 \u2500\u2500', cx, y);
      y += headerH;
    }

    const stage = SELECTOR_STAGES[i]!;
    const bx = (CANVAS_W - btnW) / 2;
    const by = y;
    const isSelected = i === selectedIndex;
    const isCurrent = i === currentIdx;

    // Completion status
    const mastery = stage.bag === 2 ? progress.masteryBag2[stage.id] : progress.mastery[stage.id];
    const completed = mastery?.completed ?? false;

    // Button bg
    ctx.fillStyle = isSelected ? '#2A2A5C' : '#141430';
    roundRect(ctx, bx, by, btnW, btnH, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = isSelected ? '#6A6AAC' : isCurrent ? '#AAAA6C' : '#2A2A4A';
    ctx.lineWidth = isSelected ? 2 : 1;
    roundRect(ctx, bx, by, btnW, btnH, 8);
    ctx.stroke();

    // Key number badge
    const badge = String(i + 1);
    const badgeSize = 18;
    const badgeX = bx + 10;
    const badgeY = by + (btnH - badgeSize) / 2;

    ctx.fillStyle = '#1A1A3A';
    roundRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 4);
    ctx.fill();
    ctx.fillStyle = '#7777AA';
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, badgeX + badgeSize / 2, badgeY + badgeSize / 2);

    // Label
    ctx.fillStyle = isSelected ? '#FFFFFF' : '#BBBBDD';
    ctx.font = `bold 14px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(stage.label, bx + 38, by + btnH / 2);

    // Status indicator (right side)
    ctx.textAlign = 'right';
    if (completed) {
      ctx.fillStyle = '#4ADE80';
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText('\u2713', bx + btnW - 14, by + btnH / 2);
    } else if (isCurrent) {
      ctx.fillStyle = '#CCAA44';
      ctx.font = `12px ${FONT}`;
      ctx.fillText('\u25B6', bx + btnW - 14, by + btnH / 2);
    } else {
      ctx.fillStyle = '#444466';
      ctx.font = `14px ${FONT}`;
      ctx.fillText('\u25CB', bx + btnW - 14, by + btnH / 2);
    }

    y += btnH + gap;
  }

  // Instructions at bottom
  y += 10;
  ctx.fillStyle = HINT_COLOR;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Press 1-8 or Enter to select \u00b7 [Esc] to return here', cx, y);
}

// ── 0. Shape Preview ──

export function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  openerId: OpenerID,
  stepIndex: number,
  totalSteps: number,
): void {
  const display = openerDisplay(openerId);
  const def = OPENERS[openerId];
  const cx = centerX();

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`LEARN: ${display.en}`, cx, 80);

  // Subtitle
  ctx.fillStyle = MUTED;
  ctx.font = `16px ${FONT}`;
  ctx.fillText(`(${display.cn})`, cx, 110);

  // Mini board — 7 visible rows (rows 13-19), cellSize 24
  const cellSz = 24;
  const visibleRows = 7;
  const boardW = 10 * cellSz;
  const boardH = visibleRows * cellSz;
  const boardX = (CANVAS_W - boardW) / 2;
  const boardTopY = 145;

  // Board background
  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(boardX, boardTopY, boardW, boardH);

  // Grid lines
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  for (let r = 0; r <= visibleRows; r++) {
    const y = boardTopY + r * cellSz;
    ctx.beginPath();
    ctx.moveTo(boardX, y);
    ctx.lineTo(boardX + boardW, y);
    ctx.stroke();
  }
  for (let c = 0; c <= 10; c++) {
    const x = boardX + c * cellSz;
    ctx.beginPath();
    ctx.moveTo(x, boardTopY);
    ctx.lineTo(x, boardTopY + boardH);
    ctx.stroke();
  }

  // Board border
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(boardX, boardTopY, boardW, boardH);

  // Get board state from opener sequence
  const seq = getOpenerSequence(openerId, false);
  const board = stepIndex > 0 ? seq.steps[stepIndex - 1]!.board : null;
  const newCells = stepIndex > 0 ? seq.steps[stepIndex - 1]!.newCells : [];

  // Draw cells (bottom visibleRows rows)
  if (board) {
    for (let r = 0; r < visibleRows; r++) {
      const boardRow = 20 - visibleRows + r;
      for (let c = 0; c < 10; c++) {
        const cell = board[boardRow]?.[c];
        if (cell) {
          const px = boardX + c * cellSz;
          const py = boardTopY + r * cellSz;
          const color = COLORS.pieces[cell] ?? '#888888';
          const isNew = newCells.some(nc => nc.row === boardRow && nc.col === c);

          if (isNew) {
            drawCell(ctx, px, py, cellSz, color);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, cellSz - 2, cellSz - 2);
          } else {
            ctx.globalAlpha = 0.6;
            drawCell(ctx, px, py, cellSz, color);
            ctx.globalAlpha = 1.0;
          }
        }
      }
    }
  }

  // Hold piece (left of board)
  const holdX = boardX - 80;
  const holdY = boardTopY + 30;
  ctx.fillStyle = COLORS.panelText;
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('HOLD', holdX + 30, holdY - 4);
  drawPieceInBox(ctx, def.holdPiece, holdX, holdY, 60, 44, 12);

  // Piece label + hint
  const labelY = boardTopY + boardH + 25;
  if (stepIndex > 0 && stepIndex <= seq.steps.length) {
    const step = seq.steps[stepIndex - 1]!;
    ctx.fillStyle = '#FFD600';
    ctx.font = `bold 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Piece ${stepIndex}: ${step.piece}`, cx, labelY);

    ctx.fillStyle = MUTED;
    ctx.font = `14px ${FONT}`;
    ctx.fillText(step.hint, cx, labelY + 28);
  } else {
    ctx.fillStyle = MUTED;
    ctx.font = `16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Empty board \u2014 press \u2192 to place first piece', cx, labelY + 10);
  }

  // Navigation hint
  ctx.fillStyle = HINT_COLOR;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hintY = labelY + 70;
  if (stepIndex < totalSteps) {
    ctx.fillText(`Step ${stepIndex} / ${totalSteps} \u00b7 \u2190\u2192 to step \u00b7 [Space] when done`, cx, hintY);
  } else {
    ctx.fillText(`All ${totalSteps} pieces placed \u00b7 [Space] to continue`, cx, hintY);
  }
}

// ── 0b. Bag 2 Shape Preview ──

export function drawBag2ShapePreview(
  ctx: CanvasRenderingContext2D,
  openerId: OpenerID,
  stepIndex: number,
  routeIndex: number,
): void {
  const display = openerDisplay(openerId);
  const routes = getBag2Routes(openerId, false);
  const route = routes[routeIndex];
  const cx = centerX();

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`BAG 2: ${display.en}`, cx, 80);

  // Route label
  ctx.fillStyle = '#FFD600';
  ctx.font = `16px ${FONT}`;
  ctx.fillText(route?.routeLabel ?? `Route ${routeIndex + 1}`, cx, 110);

  // Mini board
  const vizState = createVisualizerState(openerId, false, routeIndex);
  const cellSz = 24;
  const visibleRows = 7;
  const boardW = 10 * cellSz;
  const boardH = visibleRows * cellSz;
  const boardX = (CANVAS_W - boardW) / 2;
  const boardTopY = 135;

  // Board background
  ctx.fillStyle = COLORS.boardBg;
  ctx.fillRect(boardX, boardTopY, boardW, boardH);

  // Grid lines
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  for (let r = 0; r <= visibleRows; r++) {
    const y = boardTopY + r * cellSz;
    ctx.beginPath();
    ctx.moveTo(boardX, y);
    ctx.lineTo(boardX + boardW, y);
    ctx.stroke();
  }
  for (let c = 0; c <= 10; c++) {
    const x = boardX + c * cellSz;
    ctx.beginPath();
    ctx.moveTo(x, boardTopY);
    ctx.lineTo(x, boardTopY + boardH);
    ctx.stroke();
  }

  // Board border
  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(boardX, boardTopY, boardW, boardH);

  // Draw: Bag 1 dimmed + Bag 2 steps up to stepIndex
  const bag2StepAbs = vizState.bag1End + stepIndex; // absolute step index in combined array
  const board = bag2StepAbs > 0 ? vizState.steps[bag2StepAbs - 1]?.board : null;
  const newCells = bag2StepAbs > 0 && bag2StepAbs > vizState.bag1End
    ? vizState.steps[bag2StepAbs - 1]?.newCells ?? []
    : [];

  if (board) {
    for (let r = 0; r < visibleRows; r++) {
      const boardRow = 20 - visibleRows + r;
      for (let c = 0; c < 10; c++) {
        const cell = board[boardRow]?.[c];
        if (cell) {
          const px = boardX + c * cellSz;
          const py = boardTopY + r * cellSz;
          const color = COLORS.pieces[cell] ?? '#888888';
          const isNew = newCells.some(nc => nc.row === boardRow && nc.col === c);

          // Bag 1 pieces are dimmed, Bag 2 new piece is highlighted
          if (isNew) {
            drawCell(ctx, px, py, cellSz, color);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, cellSz - 2, cellSz - 2);
          } else {
            // Check if this cell is a Bag 1 cell (before bag1End)
            const isBag1Cell = bag2StepAbs <= vizState.bag1End;
            ctx.globalAlpha = isBag1Cell ? 0.3 : 0.6;
            drawCell(ctx, px, py, cellSz, color);
            ctx.globalAlpha = 1.0;
          }
        }
      }
    }
  }

  // Piece label + hint
  const bag2Steps = vizState.steps.slice(vizState.bag1End);
  const totalBag2Steps = bag2Steps.length;
  const labelY = boardTopY + boardH + 25;

  if (stepIndex > 0 && stepIndex <= totalBag2Steps) {
    const step = bag2Steps[stepIndex - 1]!;
    ctx.fillStyle = '#FFD600';
    ctx.font = `bold 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Piece ${stepIndex}: ${step.piece}`, cx, labelY);

    ctx.fillStyle = MUTED;
    ctx.font = `14px ${FONT}`;
    ctx.fillText(step.hint, cx, labelY + 28);
  } else {
    ctx.fillStyle = MUTED;
    ctx.font = `16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Bag 1 complete \u2014 press \u2192 to place Bag 2 pieces', cx, labelY + 10);
  }

  // Navigation + route toggle hint
  ctx.fillStyle = HINT_COLOR;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hintY = labelY + 70;
  const routeHint = routes.length > 1 ? ' \u00b7 [1][2] switch route' : '';
  if (stepIndex < totalBag2Steps) {
    ctx.fillText(`Step ${stepIndex} / ${totalBag2Steps} \u00b7 \u2190\u2192 to step${routeHint} \u00b7 [Space] when done`, cx, hintY);
  } else {
    ctx.fillText(`All ${totalBag2Steps} pieces placed \u00b7 [Space] to continue${routeHint}`, cx, hintY);
  }
}

// ── 1. Rule Card ──

export function drawRuleCard(ctx: CanvasRenderingContext2D, openerId: OpenerID): void {
  const display = openerDisplay(openerId);
  const def = OPENERS[openerId];
  const decision = DECISION_PIECES[openerId];
  const cx = centerX();

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`LEARN: ${display.en}`, cx, 100);

  // Subtitle (Chinese name)
  ctx.fillStyle = MUTED;
  ctx.font = `16px ${FONT}`;
  ctx.fillText(`(${display.cn})`, cx, 130);

  // Card
  const cardW = 420;
  const cardH = 220;
  const cardX = (CANVAS_W - cardW) / 2;
  const cardY = 165;

  ctx.fillStyle = CARD_BG;
  roundRect(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS);
  ctx.fill();
  ctx.strokeStyle = CARD_BORDER;
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS);
  ctx.stroke();

  // Hold piece label + visual
  const holdY = cardY + 24;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Hold piece: ${def.holdPiece}`, cardX + 30, holdY);

  // Draw hold piece visually
  drawPieceInBox(ctx, def.holdPiece, cardX + cardW - 110, holdY - 8, 70, 50, 14);

  // Rule text
  const ruleY = holdY + 55;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `18px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Rule: ${decision.rule}`, cardX + 30, ruleY);

  // Draw decision pieces inline
  const piecesY = ruleY + 35;
  ctx.fillStyle = COLORS.panelText;
  ctx.font = `14px ${FONT}`;
  ctx.fillText('Decision pieces:', cardX + 30, piecesY);

  let pieceDrawX = cardX + 160;
  for (const p of decision.pieces) {
    drawPieceInBox(ctx, p, pieceDrawX, piecesY - 6, 50, 36, 10);
    pieceDrawX += 56;
  }

  // Setup rate
  const rateY = piecesY + 45;
  const rate = Math.round(def.setupRate.withMirror * 100);
  ctx.fillStyle = MUTED;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Works in ~${rate}% of bags (with mirror)`, cardX + 30, rateY);

  // Continue hint
  ctx.fillStyle = HINT_COLOR;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('[Space] to continue', cx, 440);
}

// ── 1b. Bag 2 Rule Card ──

export function drawBag2RuleCard(ctx: CanvasRenderingContext2D, openerId: OpenerID): void {
  const display = openerDisplay(openerId);
  const routes = getBag2Routes(openerId, false);
  const cx = centerX();

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`BAG 2 RULE: ${display.en}`, cx, 100);

  // Card
  const cardW = 440;
  const cardH = 260;
  const cardX = (CANVAS_W - cardW) / 2;
  const cardY = 140;

  ctx.fillStyle = CARD_BG;
  roundRect(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS);
  ctx.fill();
  ctx.strokeStyle = CARD_BORDER;
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS);
  ctx.stroke();

  // Route 0 (default)
  const route0 = routes[0];
  const route1 = routes[1];
  let y = cardY + 30;

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Default route:', cardX + 24, y);
  ctx.fillStyle = '#FFD600';
  ctx.font = `16px ${FONT}`;
  ctx.fillText(route0?.routeLabel ?? 'Route 0', cardX + 160, y);

  y += 40;

  if (route1) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText('Alternate route:', cardX + 24, y);
    ctx.fillStyle = '#FFD600';
    ctx.font = `16px ${FONT}`;
    ctx.fillText(route1.routeLabel, cardX + 174, y);

    y += 40;
    drawSeparator(ctx, y, cardX + 20);

    y += 20;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`If "${route1.conditionLabel}":`, cx, y);

    y += 30;
    ctx.fillStyle = '#4ADE80';
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(`\u2192 Use ${route1.routeLabel}`, cx, y);

    y += 30;
    ctx.fillStyle = MUTED;
    ctx.font = `16px ${FONT}`;
    ctx.fillText(`Otherwise: ${route0?.routeLabel ?? 'default'}`, cx, y);
  }

  // Continue hint
  ctx.fillStyle = HINT_COLOR;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('[Space] to continue', cx, cardY + cardH + 30);
}

// ── 2. Worked Example ──

export function drawWorkedExample(
  ctx: CanvasRenderingContext2D,
  openerId: OpenerID,
  exampleIndex: number,
  stepIndex: number,
): void {
  const examples = getWorkedExamples(openerId);
  const example = examples[exampleIndex];
  if (!example) return;

  const display = openerDisplay(openerId);
  const cx = centerX();

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `Example ${exampleIndex + 1} of ${examples.length} · ${display.en}`,
    cx,
    65,
  );

  // Draw queue using existing drawQuizQueue
  const queueOptions: QuizQueueOptions = {
    decisionPieces: example.decisionPieces,
    showHighlights: stepIndex >= 1,
    holdPiece: null,
    mirror: false,
  };
  drawQuizQueue(ctx, example.bag, queueOptions);

  // Separator
  drawSeparator(ctx, 430);

  // Step instruction
  const step = example.steps[stepIndex];
  if (step) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(step.instruction, cx, 465);
  }

  // If on final step, show explanation
  if (stepIndex === example.steps.length - 1) {
    const resultColor = example.expectedAnswer ? COLORS.correct : COLORS.incorrect;
    ctx.fillStyle = resultColor;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // The step instruction already contains the conclusion, so just add the explanation below
    ctx.fillStyle = MUTED;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(example.explanation, cx, 495);
  }

  // Step progress + hint
  const totalSteps = example.steps.length;
  ctx.fillStyle = HINT_COLOR;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hintText = stepIndex < totalSteps - 1
    ? `Step ${stepIndex + 1} of ${totalSteps} · [Space]`
    : `[Space] to continue`;
  ctx.fillText(hintText, cx, 535);
}

// ── 2b. Bag 2 Worked Example ──

export function drawBag2WorkedExample(
  ctx: CanvasRenderingContext2D,
  openerId: OpenerID,
  exampleIndex: number,
  stepIndex: number,
): void {
  const examples = getBag2WorkedExamples(openerId);
  const example = examples[exampleIndex];
  if (!example) return;

  const display = openerDisplay(openerId);
  const cx = centerX();

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `Bag 2 Example ${exampleIndex + 1} of ${examples.length} \u00b7 ${display.en}`,
    cx,
    65,
  );

  // Draw the Bag 2 queue
  const queueOptions: QuizQueueOptions = {
    decisionPieces: [],
    showHighlights: false,
    holdPiece: null,
    mirror: false,
  };
  drawQuizQueue(ctx, example.bag2, queueOptions);

  // Separator
  drawSeparator(ctx, 430);

  // Step instruction
  const step = example.steps[stepIndex];
  if (step) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(step.instruction, cx, 465);
  }

  // On final step, show route result
  if (stepIndex === example.steps.length - 1) {
    ctx.fillStyle = '#4ADE80';
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`\u2192 ${example.correctRouteLabel}`, cx, 495);

    ctx.fillStyle = MUTED;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(example.explanation, cx, 520);
  }

  // Step progress + hint
  const totalSteps = example.steps.length;
  ctx.fillStyle = HINT_COLOR;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hintText = stepIndex < totalSteps - 1
    ? `Step ${stepIndex + 1} of ${totalSteps} \u00b7 [Space]`
    : `[Space] to continue`;
  ctx.fillText(hintText, cx, 555);
}

// ── 3. Binary Drill ──

export function drawDrill(ctx: CanvasRenderingContext2D, data: DrillRenderData): void {
  const display = openerDisplay(data.openerId);
  const cx = centerX();

  // Title with progress
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `Drill: ${display.en} · ${data.correct}/${data.total} correct`,
    cx,
    65,
  );

  // Draw queue (no highlights when asking, show on wrong answer)
  const showHighlights = data.phase === 'answered' && !data.isCorrect;
  const decision = DECISION_PIECES[data.openerId];
  const queueOptions: QuizQueueOptions = {
    decisionPieces: decision.pieces,
    showHighlights,
    holdPiece: null,
    mirror: false,
  };
  drawQuizQueue(ctx, data.bag, queueOptions);

  if (data.isBag2) {
    // Bag 2 drill: route selection
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Which route for ${display.en}?`, cx, 440);

    // Route buttons
    const btnW = 200;
    const btnH = 44;
    const btnY = 470;
    const gap = 20;
    const btn0X = cx - gap / 2 - btnW;
    const btn1X = cx + gap / 2;

    drawBag2DrillButton(ctx, `[1] ${data.route0Label ?? 'Route 0'}`, btn0X, btnY, btnW, btnH, data, 0);
    drawBag2DrillButton(ctx, `[2] ${data.route1Label ?? 'Route 1'}`, btn1X, btnY, btnW, btnH, data, 1);

    // Feedback
    if (data.phase === 'answered') {
      const feedbackY = 540;
      if (data.isCorrect) {
        ctx.fillStyle = COLORS.correct;
        ctx.font = `bold 20px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CORRECT!', cx, feedbackY);
      } else {
        ctx.fillStyle = COLORS.incorrect;
        ctx.font = `bold 20px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const correctLabel = data.correctRouteIndex === 0
          ? (data.route0Label ?? 'Route 0')
          : (data.route1Label ?? 'Route 1');
        ctx.fillText(`WRONG \u2192 ${correctLabel}`, cx, feedbackY);

        ctx.fillStyle = HINT_COLOR;
        ctx.font = `14px ${FONT}`;
        ctx.fillText('[Space] to continue', cx, feedbackY + 30);
      }
    }
  } else {
    // Bag 1 drill: Yes/No
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Can you build ${display.en} from this bag?`, cx, 440);

    // Yes/No buttons
    const btnW = 140;
    const btnH = 44;
    const btnY = 470;
    const gap = 30;
    const yesX = cx - gap / 2 - btnW;
    const noX = cx + gap / 2;

    drawDrillButton(ctx, '[1] Yes', yesX, btnY, btnW, btnH, data, true);
    drawDrillButton(ctx, '[2] No', noX, btnY, btnW, btnH, data, false);

    // Feedback
    if (data.phase === 'answered') {
      const feedbackY = 540;
      if (data.isCorrect) {
        ctx.fillStyle = COLORS.correct;
        ctx.font = `bold 20px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CORRECT!', cx, feedbackY);
      } else {
        ctx.fillStyle = COLORS.incorrect;
        ctx.font = `bold 20px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const answerText = data.correctAnswer ? 'Yes, it was buildable' : 'No, it was NOT buildable';
        ctx.fillText(`WRONG \u2192 ${answerText}`, cx, feedbackY);

        ctx.fillStyle = HINT_COLOR;
        ctx.font = `14px ${FONT}`;
        ctx.fillText('[Space] to continue', cx, feedbackY + 30);
      }
    }
  }
}

function drawDrillButton(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  data: DrillRenderData,
  isYes: boolean,
): void {
  const isAnswered = data.phase === 'answered';
  const isThisAnswer = data.answer === isYes;
  const isCorrectChoice = data.correctAnswer === isYes;

  let bgColor = COLORS.buttonBg;
  let borderColor = COLORS.buttonBorder;
  let textColor = COLORS.buttonText;

  if (isAnswered) {
    if (isCorrectChoice) {
      bgColor = '#0A2E1A';
      borderColor = COLORS.correct;
      textColor = COLORS.correct;
    } else if (isThisAnswer && !data.isCorrect) {
      bgColor = '#2E0A0A';
      borderColor = COLORS.incorrect;
      textColor = COLORS.incorrect;
    }
  }

  // Fill
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();

  // Border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();

  // Badge
  const badge = isYes ? '1' : '2';
  const badgeSize = 20;
  const badgeX = x + 10;
  const badgeY = y + (h - badgeSize) / 2;

  ctx.fillStyle = COLORS.badgeBg;
  roundRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 4);
  ctx.fill();

  ctx.fillStyle = '#9999BB';
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, badgeX + badgeSize / 2, badgeY + badgeSize / 2);

  // Label text (just "Yes" or "No")
  const textLabel = isYes ? 'Yes' : 'No';
  ctx.fillStyle = textColor;
  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(textLabel, x + w / 2 + 10, y + h / 2);
}

function drawBag2DrillButton(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  data: DrillRenderData,
  routeIndex: number,
): void {
  const isAnswered = data.phase === 'answered';
  const isThisAnswer = data.selectedRouteIndex === routeIndex;
  const isCorrectChoice = data.correctRouteIndex === routeIndex;

  let bgColor = COLORS.buttonBg;
  let borderColor = COLORS.buttonBorder;
  let textColor = COLORS.buttonText;

  if (isAnswered) {
    if (isCorrectChoice) {
      bgColor = '#0A2E1A';
      borderColor = COLORS.correct;
      textColor = COLORS.correct;
    } else if (isThisAnswer && !data.isCorrect) {
      bgColor = '#2E0A0A';
      borderColor = COLORS.incorrect;
      textColor = COLORS.incorrect;
    }
  }

  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();

  // Badge
  const badge = String(routeIndex + 1);
  const badgeSize = 20;
  const badgeX = x + 10;
  const badgeY = y + (h - badgeSize) / 2;

  ctx.fillStyle = COLORS.badgeBg;
  roundRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 4);
  ctx.fill();

  ctx.fillStyle = '#9999BB';
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, badgeX + badgeSize / 2, badgeY + badgeSize / 2);

  // Label (truncate if needed)
  const routeLabel = routeIndex === 0 ? (data.route0Label ?? 'Default') : (data.route1Label ?? 'Alt');
  ctx.fillStyle = textColor;
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(routeLabel, x + w / 2 + 10, y + h / 2);
}

// ── 4. Celebration ──

export function drawCelebration(ctx: CanvasRenderingContext2D, data: CelebrationData): void {
  const display = openerDisplay(data.openerId);
  const cx = centerX();

  // Checkmark + title
  ctx.fillStyle = COLORS.correct;
  ctx.font = `bold 28px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`✓ ${display.en} Mastered!`, cx, 180);

  // Stats
  ctx.fillStyle = COLORS.panelText;
  ctx.font = `16px ${FONT}`;
  ctx.fillText(`${data.correct}/${data.total} correct`, cx, 220);

  // Separator
  drawSeparator(ctx, 260);

  // Next stage info
  if (data.nextOpenerName) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Next: ${data.nextOpenerName}`, cx, 310);

    if (data.motivation) {
      ctx.fillStyle = MUTED;
      ctx.font = `14px ${FONT}`;
      ctx.fillText(data.motivation, cx, 340);
    }
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('All openers learned!', cx, 310);

    ctx.fillStyle = MUTED;
    ctx.font = `14px ${FONT}`;
    ctx.fillText('Ready for the full quiz mode', cx, 340);
  }

  // Continue hint
  ctx.fillStyle = HINT_COLOR;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('[Space] to continue \u00b7 [Esc] stage menu', cx, 420);
}

// ── Onboarding mode renderer ──

export interface OnboardingRenderState {
  progress: OnboardingProgress;
  drill?: DrillRenderData;
  celebration?: CelebrationData;
  shapeStep?: number;
  bag2Route?: number;
}

export function renderOnboardingMode(
  ctx: CanvasRenderingContext2D,
  state: OnboardingRenderState,
): void {
  const { progress } = state;
  const stage = progress.currentStage;

  // Only render for opener stages (not complete)
  if (stage === 'complete') return;

  const openerId = stage as OpenerID;
  const isBag2 = progress.currentBag === 2;

  switch (progress.stagePhase) {
    case 'shape_preview': {
      if (isBag2) {
        drawBag2ShapePreview(ctx, openerId, state.shapeStep ?? 0, state.bag2Route ?? 0);
      } else {
        const seq = getOpenerSequence(openerId, false);
        drawShapePreview(ctx, openerId, state.shapeStep ?? 0, seq.steps.length);
      }
      break;
    }

    case 'rule_card':
      if (isBag2) {
        drawBag2RuleCard(ctx, openerId);
      } else {
        drawRuleCard(ctx, openerId);
      }
      break;

    case 'examples':
      if (isBag2) {
        drawBag2WorkedExample(ctx, openerId, progress.exampleIndex, progress.exampleStep);
      } else {
        drawWorkedExample(ctx, openerId, progress.exampleIndex, progress.exampleStep);
      }
      break;

    case 'drill':
      if (state.drill) {
        drawDrill(ctx, state.drill);
      }
      break;

    case 'celebration':
      if (state.celebration) {
        drawCelebration(ctx, state.celebration);
      }
      break;
  }

  // Status bar text
  const display = openerDisplay(openerId);
  const bagPrefix = isBag2 ? 'Bag 2: ' : '';
  const phaseLabels: Record<string, string> = {
    shape_preview: `${bagPrefix}Learning ${display.en} \u00b7 Shape Preview`,
    rule_card: `${bagPrefix}Learning ${display.en} \u00b7 ${stageLabel(openerId, progress.currentBag)}`,
    examples: `${bagPrefix}Learning ${display.en} \u00b7 Examples`,
    drill: state.drill
      ? `${bagPrefix}Learning ${display.en} \u00b7 Drill (${state.drill.threshold.required}/${state.drill.threshold.window} to advance)`
      : `${bagPrefix}Learning ${display.en} \u00b7 Drill`,
    celebration: `${stageLabel(openerId, progress.currentBag)} complete`,
  };

  const statusText = (phaseLabels[progress.stagePhase] ?? '') + ' \u00b7 N: skip \u00b7 Esc: menu';
  drawStatusBar(ctx, statusText);
}
