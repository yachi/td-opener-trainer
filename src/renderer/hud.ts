import type { OpenerID } from '../openers/types';
import { LAYOUT, COLORS, CANVAS_W, roundRect } from './board';

export interface QuizHUDData {
  phase: 'showing' | 'answered';
  selectedOpener: OpenerID | null;
  correctOpener: OpenerID;
  alternatives: OpenerID[];
  isCorrect: boolean | null;
  responseTimeMs: number | null;
  explanation: string;
  quizType: 'bag1' | 'bag2';
  // Bag 2 context
  bag1OpenerName: string;
  bag1MirrorLabel: string;
  selectedRouteIndex: number | null;
  correctRouteIndex: number;
  routeLabels: string[];
  // Rule panel data (shown during 'showing' phase)
  ruleLines: string[];
  // Reviewing previous question
  reviewingPrevious: boolean;
  // Inline accuracy
  accuracyLabel: string;
}

// ── Button definitions ──

interface ButtonDef {
  key: string;        // keyboard badge label
  label: string;      // display text
  id: string;         // unique identifier for hit-testing
  x: number;
  y: number;
  w: number;
  h: number;
}

const BAG1_BUTTONS: ButtonDef[] = [
  { key: '1', label: 'Stray (迷走炮)', id: 'stray_cannon', x: 120, y: 410, w: 180, h: 44 },
  { key: '2', label: 'Honey (蜜蜂炮)', id: 'honey_cup', x: 320, y: 410, w: 180, h: 44 },
  { key: '3', label: 'MS2 / Gamushiro (山岳·糖漿)', id: 'ms2', x: 170, y: 464, w: 280, h: 44 },
];

/** Maps opener button IDs to all matching opener IDs (for correctness highlighting). */
const BAG1_BUTTON_OPENER_IDS: Record<string, OpenerID[]> = {
  stray_cannon: ['stray_cannon'],
  honey_cup: ['honey_cup'],
  ms2: ['ms2', 'gamushiro'],
};

function getBag2Buttons(routeLabels: string[]): ButtonDef[] {
  const btnW = 240;
  const gap = 16;
  const totalW = routeLabels.length * btnW + (routeLabels.length - 1) * gap;
  const startX = (CANVAS_W - totalW) / 2;
  return routeLabels.map((label, i) => ({
    key: `${i + 1}`,
    label,
    id: `route_${i}`,
    x: startX + i * (btnW + gap),
    y: 430,
    w: btnW,
    h: 44,
  }));
}

const OPENER_DISPLAY: Record<OpenerID, string> = {
  stray_cannon: 'Stray',
  honey_cup: 'Honey',
  gamushiro: 'MS2 / Gamushiro',
  ms2: 'MS2 / Gamushiro',
};

// ── Main HUD draw ──

export function drawQuizHUD(ctx: CanvasRenderingContext2D, data: QuizHUDData): void {
  // Bag 2 context line
  if (data.quizType === 'bag2' && data.bag1OpenerName) {
    ctx.fillStyle = '#CCAA44';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `Opener: ${data.bag1OpenerName} ${data.bag1MirrorLabel}`,
      CANVAS_W / 2,
      390,
    );
  }

  // Rule panel during showing phase (or reviewing previous)
  if (data.phase === 'showing' || data.reviewingPrevious) {
    drawRulePanel(ctx, data.ruleLines);
  }

  // Reviewing previous indicator
  if (data.reviewingPrevious) {
    drawReviewIndicator(ctx);
  }

  drawButtons(ctx, data);

  if (data.phase === 'answered' || data.reviewingPrevious) {
    drawFeedback(ctx, data);
    // Always show explanation (bag1 + bag2, correct + wrong)
    if (data.explanation) {
      drawExplanation(ctx, data.explanation);
    }
  }
}

// ── Buttons ──

function drawButtons(ctx: CanvasRenderingContext2D, data: QuizHUDData): void {
  const isAnswered = data.phase === 'answered';
  const buttons = data.quizType === 'bag2'
    ? getBag2Buttons(data.routeLabels)
    : BAG1_BUTTONS;

  for (let btnIdx = 0; btnIdx < buttons.length; btnIdx++) {
    const btn = buttons[btnIdx]!;

    let isCorrectButton: boolean;
    let isSelectedButton: boolean;

    if (data.quizType === 'bag2') {
      isCorrectButton = btnIdx === data.correctRouteIndex;
      isSelectedButton = data.selectedRouteIndex === btnIdx;
    } else {
      const openerIds = BAG1_BUTTON_OPENER_IDS[btn.id] ?? [];
      isCorrectButton = openerIds.includes(data.correctOpener);
      isSelectedButton = data.selectedOpener !== null && openerIds.includes(data.selectedOpener);
    }

    // Determine colors
    let bgColor = COLORS.buttonBg;
    let borderColor = COLORS.buttonBorder;
    let textColor = COLORS.buttonText;

    if (isAnswered) {
      if (isCorrectButton) {
        bgColor = '#0A2E1A';
        borderColor = COLORS.correct;
        textColor = COLORS.correct;
      } else if (isSelectedButton && !data.isCorrect) {
        bgColor = '#2E0A0A';
        borderColor = COLORS.incorrect;
        textColor = COLORS.incorrect;
      }
    }

    // Button fill
    ctx.fillStyle = bgColor;
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8);
    ctx.stroke();

    // Keyboard badge
    const badgeSize = 20;
    const badgeX = btn.x + 8;
    const badgeY = btn.y + (btn.h - badgeSize) / 2;

    ctx.fillStyle = COLORS.badgeBg;
    roundRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 4);
    ctx.fill();

    ctx.fillStyle = '#9999BB';
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.key, badgeX + badgeSize / 2, badgeY + badgeSize / 2);

    // Label text
    ctx.fillStyle = textColor;
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + 36, btn.y + btn.h / 2);
  }
}

// ── Feedback overlay ──

function drawFeedback(ctx: CanvasRenderingContext2D, data: QuizHUDData): void {
  const centerX = CANVAS_W / 2;
  const feedbackY = 375;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  if (data.isCorrect) {
    ctx.fillStyle = COLORS.correct;
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.fillText('CORRECT', centerX, feedbackY);

    if (data.responseTimeMs != null) {
      ctx.fillStyle = '#7AE6A0';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.fillText(`${Math.round(data.responseTimeMs)}ms`, centerX, feedbackY + 24);
    }
  } else {
    ctx.fillStyle = COLORS.incorrect;
    ctx.font = 'bold 18px -apple-system, sans-serif';
    if (data.quizType === 'bag2') {
      const correctLabel = data.routeLabels[data.correctRouteIndex] ?? '?';
      ctx.fillText(`WRONG \u2192 ${correctLabel}`, centerX, feedbackY);
    } else {
      const correctName = OPENER_DISPLAY[data.correctOpener] ?? data.correctOpener;
      ctx.fillText(`WRONG \u2192 ${correctName}`, centerX, feedbackY);
    }
  }
}

// ── Explanation line ──

function drawExplanation(ctx: CanvasRenderingContext2D, explanation: string): void {
  ctx.fillStyle = '#B0B0D0';
  ctx.font = '13px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(explanation, CANVAS_W / 2, 395);
}

// ── Rule panel (shown during 'showing' phase) ──

function drawRulePanel(ctx: CanvasRenderingContext2D, ruleLines: string[]): void {
  if (ruleLines.length === 0) return;

  const panelX = 430;
  const panelY = 60;
  const lineH = 18;
  const padX = 10;
  const padY = 8;
  const panelW = 200;
  const panelH = padY * 2 + ruleLines.length * lineH;

  // Panel background
  ctx.fillStyle = 'rgba(20, 20, 40, 0.85)';
  roundRect(ctx, panelX, panelY, panelW, panelH, 6);
  ctx.fill();

  ctx.strokeStyle = '#444466';
  ctx.lineWidth = 1;
  roundRect(ctx, panelX, panelY, panelW, panelH, 6);
  ctx.stroke();

  // Title
  ctx.fillStyle = '#8888BB';
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Rules:', panelX + padX, panelY + padY);

  // Rule lines
  ctx.fillStyle = '#B0B0D0';
  ctx.font = '11px -apple-system, sans-serif';
  for (let i = 0; i < ruleLines.length; i++) {
    ctx.fillText(ruleLines[i]!, panelX + padX, panelY + padY + (i + 1) * lineH);
  }
}

// ── Review indicator ──

function drawReviewIndicator(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#AAAA44';
  ctx.font = 'bold 13px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('\u2190 Previous question (press \u2192 to return)', CANVAS_W / 2, 520);
}

// ── Tab bar ──

export function drawTabs(ctx: CanvasRenderingContext2D, activeMode: string): void {
  const { x, y, w, h } = LAYOUT.tabBar;
  const tabs = ['Quiz', 'Visualizer', 'Drill'];
  const tabW = Math.floor(w / tabs.length);

  ctx.fillStyle = COLORS.tabBg;
  ctx.fillRect(x, y, w, h);

  for (let i = 0; i < tabs.length; i++) {
    const tx = x + i * tabW;
    const isActive = tabs[i]!.toLowerCase() === activeMode.toLowerCase();

    if (isActive) {
      ctx.fillStyle = COLORS.tabActive;
      ctx.fillRect(tx, y, tabW, h);
    }

    ctx.fillStyle = isActive ? COLORS.tabTextActive : COLORS.tabText;
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tabs[i]!, tx + tabW / 2, y + h / 2);

    if (i > 0) {
      ctx.strokeStyle = COLORS.boardBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx + 0.5, y + 6);
      ctx.lineTo(tx + 0.5, y + h - 6);
      ctx.stroke();
    }
  }
}

// ── Status bar ──

export function drawStatusBar(
  ctx: CanvasRenderingContext2D,
  text: string,
  quizType?: 'bag1' | 'bag2',
): void {
  const { x, y, w, h } = LAYOUT.statusBar;

  ctx.fillStyle = COLORS.statusBarBg;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = COLORS.panelText;
  ctx.font = '13px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);

  // Quiz type indicator on the left
  if (quizType) {
    const typeLabel = quizType === 'bag1' ? 'BAG 1' : 'BAG 2';
    const typeColor = quizType === 'bag1' ? '#7799AA' : '#CCAA44';

    ctx.fillStyle = typeColor;
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${typeLabel} [B]`, x + 16, y + h / 2);
  }
}
