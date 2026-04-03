import type { PieceType } from '../core/types';
import type { OpenerID } from '../openers/types';
import type { OnboardingProgress, WorkedExample } from '../modes/onboarding';
import type { QuizQueueOptions } from './queue';
import { getWorkedExamples } from '../modes/onboarding';
import { OPENERS, DECISION_PIECES } from '../openers/decision';
import { CANVAS_W, CANVAS_H, COLORS, drawPieceInBox, roundRect } from './board';
import { drawQuizQueue } from './queue';
import { drawTabs, drawStatusBar } from './hud';

// ── Shared constants ──

const FONT = '-apple-system, sans-serif';
const CARD_BG = '#0F0F25';
const CARD_BORDER = '#3A3A5C';
const CARD_RADIUS = 12;
const MUTED = '#8888AA';
const HINT_COLOR = '#666688';

const OPENER_DISPLAY: Record<OpenerID, { en: string; cn: string }> = {
  ms2: { en: 'MS2 / Gamushiro', cn: '山岳·糖漿炮' },
  gamushiro: { en: 'MS2 / Gamushiro', cn: '山岳·糖漿炮' },
  honey_cup: { en: 'Honey Cup', cn: '蜜蜂炮' },
  stray_cannon: { en: 'Stray Cannon', cn: '迷走炮' },
};

const STAGE_LABELS: Record<string, { index: number; total: number }> = {
  ms2: { index: 1, total: 3 },
  honey_cup: { index: 2, total: 3 },
  stray_cannon: { index: 3, total: 3 },
};

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

function stageLabel(openerId: OpenerID): string {
  const info = STAGE_LABELS[openerId];
  if (!info) return `Learning ${OPENER_DISPLAY[openerId].en}`;
  return `Stage ${info.index} of ${info.total}`;
}

function drawSeparator(ctx: CanvasRenderingContext2D, y: number, margin = 80): void {
  ctx.strokeStyle = CARD_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, y + 0.5);
  ctx.lineTo(CANVAS_W - margin, y + 0.5);
  ctx.stroke();
}

// ── 1. Rule Card ──

export function drawRuleCard(ctx: CanvasRenderingContext2D, openerId: OpenerID): void {
  const display = OPENER_DISPLAY[openerId];
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

  const display = OPENER_DISPLAY[openerId];
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

// ── 3. Binary Drill ──

export function drawDrill(ctx: CanvasRenderingContext2D, data: DrillRenderData): void {
  const display = OPENER_DISPLAY[data.openerId];
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

  // Question text
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
      ctx.fillText(`WRONG → ${answerText}`, cx, feedbackY);

      // Hint to continue
      ctx.fillStyle = HINT_COLOR;
      ctx.font = `14px ${FONT}`;
      ctx.fillText('[Space] to continue', cx, feedbackY + 30);
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

// ── 4. Celebration ──

export function drawCelebration(ctx: CanvasRenderingContext2D, data: CelebrationData): void {
  const display = OPENER_DISPLAY[data.openerId];
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
  ctx.fillText('[Space] to continue', cx, 420);
}

// ── Onboarding mode renderer ──

export interface OnboardingRenderState {
  progress: OnboardingProgress;
  drill?: DrillRenderData;
  celebration?: CelebrationData;
}

export function renderOnboardingMode(
  ctx: CanvasRenderingContext2D,
  state: OnboardingRenderState,
): void {
  const { progress } = state;
  const stage = progress.currentStage;

  // Only render for opener stages (not full_quiz or complete)
  if (stage === 'full_quiz' || stage === 'complete') return;

  const openerId = stage as OpenerID;

  switch (progress.stagePhase) {
    case 'rule_card':
      drawRuleCard(ctx, openerId);
      break;

    case 'examples':
      drawWorkedExample(ctx, openerId, progress.exampleIndex, progress.exampleStep);
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
  const display = OPENER_DISPLAY[openerId];
  const phaseLabels: Record<string, string> = {
    rule_card: `Learning ${display.en} · ${stageLabel(openerId)}`,
    examples: `Learning ${display.en} · Examples`,
    drill: state.drill
      ? `Learning ${display.en} · Drill (${state.drill.threshold.required}/${state.drill.threshold.window} to advance)`
      : `Learning ${display.en} · Drill`,
    celebration: `${stageLabel(openerId)} complete`,
  };

  drawStatusBar(ctx, phaseLabels[progress.stagePhase] ?? '');
}
