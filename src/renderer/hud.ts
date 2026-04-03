import type { OpenerID } from '../openers/types';
import { LAYOUT, COLORS, CANVAS_W, roundRect } from './board';

export interface QuizHUDData {
  phase: 'showing' | 'answered' | 'transitioning';
  selectedOpener: OpenerID | null;
  correctOpener: OpenerID;
  alternatives: OpenerID[];
  isCorrect: boolean | null;
  responseTimeMs: number | null;
  explanation: string;
  quizMode: 'learning' | 'speed';
  stats: {
    total: number;
    correct: number;
    streak: number;
    bestStreak: number;
    avgTimeMs: number;
  };
}

// ── Button definitions ──

interface ButtonDef {
  key: string;        // keyboard badge label
  label: string;      // display text
  openerIds: OpenerID[]; // which openerIDs this button represents
  x: number;
  y: number;
  w: number;
  h: number;
}

const BUTTONS: ButtonDef[] = [
  {
    key: '1',
    label: 'Stray (\u8FF7\u8D70\u7832)',
    openerIds: ['stray_cannon'],
    x: 120, y: 410, w: 180, h: 44,
  },
  {
    key: '2',
    label: 'Honey (\u8702\u8702\u7832)',
    openerIds: ['honey_cup'],
    x: 320, y: 410, w: 180, h: 44,
  },
  {
    key: '3',
    label: 'MS2 / Gamushiro (\u5c71\u5cb3\u00b7\u7cd6\u6f3f)',
    openerIds: ['ms2', 'gamushiro'],
    x: 170, y: 464, w: 280, h: 44,
  },
];

const OPENER_DISPLAY: Record<OpenerID, string> = {
  stray_cannon: 'Stray',
  honey_cup: 'Honey',
  gamushiro: 'MS2 / Gamushiro',
  ms2: 'MS2 / Gamushiro',
};

// ── Main HUD draw ──

export function drawQuizHUD(ctx: CanvasRenderingContext2D, data: QuizHUDData): void {
  drawButtons(ctx, data);

  if (data.phase === 'answered' || data.phase === 'transitioning') {
    drawFeedback(ctx, data);
    if (data.quizMode === 'learning' && !data.isCorrect && data.explanation) {
      drawExplanation(ctx, data.explanation);
    }
  }

  drawStatsStrip(ctx, data.stats);
}

// ── Buttons ──

function drawButtons(ctx: CanvasRenderingContext2D, data: QuizHUDData): void {
  const isAnswered = data.phase === 'answered' || data.phase === 'transitioning';

  for (const btn of BUTTONS) {
    const isCorrectButton = btn.openerIds.includes(data.correctOpener);
    const isSelectedButton = data.selectedOpener !== null && btn.openerIds.includes(data.selectedOpener);

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
    const correctName = OPENER_DISPLAY[data.correctOpener] ?? data.correctOpener;
    ctx.fillText(`WRONG \u2192 ${correctName}`, centerX, feedbackY);
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

// ── Stats strip ──

function drawStatsStrip(
  ctx: CanvasRenderingContext2D,
  stats: { total: number; correct: number; streak: number; bestStreak: number; avgTimeMs: number },
): void {
  const stripY = 530;
  const stripH = 36;

  // Three cards
  const cards: { label: string; value: string; w: number; color?: string }[] = [
    {
      label: 'ACCURACY',
      value: stats.total > 0
        ? `${Math.round((stats.correct / stats.total) * 100)}% (${stats.correct}/${stats.total})`
        : '0%',
      w: 160,
    },
    {
      label: 'STREAK',
      value: `${stats.streak} (best: ${stats.bestStreak})`,
      w: 150,
    },
    {
      label: 'AVG TIME',
      value: stats.total > 0 ? `${Math.round(stats.avgTimeMs)}ms` : '--',
      w: 120,
      color: getTimeColor(stats.avgTimeMs),
    },
  ];

  const totalW = cards.reduce((sum, c) => sum + c.w, 0) + (cards.length - 1) * 12;
  let cx = (CANVAS_W - totalW) / 2;

  for (const card of cards) {
    // Card bg
    ctx.fillStyle = COLORS.statCardBg;
    roundRect(ctx, cx, stripY, card.w, stripH, 4);
    ctx.fill();

    ctx.strokeStyle = COLORS.statCardBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, cx, stripY, card.w, stripH, 4);
    ctx.stroke();

    // Label
    ctx.fillStyle = COLORS.statLabel;
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(card.label, cx + card.w / 2, stripY + 4);

    // Value
    ctx.fillStyle = card.color ?? COLORS.statValue;
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(card.value, cx + card.w / 2, stripY + stripH - 3);

    cx += card.w + 12;
  }
}

function getTimeColor(ms: number): string {
  if (ms <= 0) return COLORS.statValue;
  if (ms < 500) return COLORS.correct;
  if (ms < 1000) return '#FFD600';
  return COLORS.incorrect;
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
  quizMode?: 'learning' | 'speed',
): void {
  const { x, y, w, h } = LAYOUT.statusBar;

  ctx.fillStyle = COLORS.statusBarBg;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = COLORS.panelText;
  ctx.font = '13px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);

  // Mode indicator on the right
  if (quizMode) {
    const modeLabel = quizMode === 'learning' ? 'LEARNING' : 'SPEED';
    const modeColor = quizMode === 'learning' ? '#7777AA' : '#AA77FF';

    ctx.fillStyle = modeColor;
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${modeLabel} [S]`, x + w - 16, y + h / 2);
  }
}
