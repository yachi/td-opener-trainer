import type { OpenerID } from '../openers/types';
import { LAYOUT, COLORS } from './board';

export interface QuizHUDData {
  phase: 'showing' | 'answered';
  selectedOpener: OpenerID | null;
  correctOpener: OpenerID;
  alternatives: OpenerID[];
  isCorrect: boolean | null;
  responseTimeMs: number | null;
  stats: { total: number; correct: number; streak: number; bestStreak: number; avgTimeMs: number };
}

const OPENER_LABELS: Record<OpenerID, string> = {
  stray_cannon: '1. Stray (迷走炮)',
  honey_cup:    '2. Honey (蜜蜂炮)',
  gamushiro:    '3. Gamushiro (糖漿炮)',
  ms2:          '4. MS2 (山岳炮)',
};

const BUTTON_X = 465;
const BUTTON_W = 150;
const BUTTON_H = 36;
const BUTTON_GAP = 8;
const BUTTON_START_Y = 80;

/** Draw the quiz HUD (info panel area, right side) */
export function drawQuizHUD(ctx: CanvasRenderingContext2D, data: QuizHUDData): void {
  // --- Opener buttons ---
  const buttonOrder: OpenerID[] = ['stray_cannon', 'honey_cup', 'gamushiro', 'ms2'];

  for (let i = 0; i < buttonOrder.length; i++) {
    const id = buttonOrder[i]!;
    const by = BUTTON_START_Y + i * (BUTTON_H + BUTTON_GAP);

    // Determine button color
    let bgColor = COLORS.buttonBg;
    let textColor = COLORS.buttonText;

    if (data.phase === 'answered') {
      if (id === data.correctOpener) {
        bgColor = COLORS.correct;
        textColor = '#000000';
      } else if (id === data.selectedOpener && !data.isCorrect) {
        bgColor = COLORS.incorrect;
        textColor = '#FFFFFF';
      }
    }

    // Draw button
    ctx.fillStyle = bgColor;
    roundRect(ctx, BUTTON_X, by, BUTTON_W, BUTTON_H, 4);
    ctx.fill();

    // Button text
    ctx.fillStyle = textColor;
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(OPENER_LABELS[id] ?? id, BUTTON_X + 10, by + BUTTON_H / 2);
  }

  // --- Feedback text ---
  if (data.phase === 'answered') {
    const feedbackY = 270;
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (data.isCorrect) {
      ctx.fillStyle = COLORS.correct;
      const timeStr = data.responseTimeMs != null ? ` ${data.responseTimeMs}ms` : '';
      ctx.fillText(`CORRECT!${timeStr}`, BUTTON_X, feedbackY);
    } else {
      ctx.fillStyle = COLORS.incorrect;
      const correctLabel = OPENER_LABELS[data.correctOpener].split('.')[1]?.trim() ?? data.correctOpener;
      // Extract just the English name
      const englishName = correctLabel.split('(')[0]?.trim() ?? correctLabel;
      ctx.fillText(`WRONG → ${englishName}`, BUTTON_X, feedbackY);
    }
  }

  // --- Stats ---
  const statsY = 360;
  const { stats } = data;
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  ctx.font = 'bold 14px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.fillStyle = COLORS.panelHeading;
  ctx.fillText('Stats', BUTTON_X, statsY);

  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = COLORS.panelText;
  ctx.fillText(`Accuracy: ${accuracy}% (${stats.correct}/${stats.total})`, BUTTON_X, statsY + 24);
  ctx.fillText(`Streak: ${stats.streak} (best: ${stats.bestStreak})`, BUTTON_X, statsY + 46);
  ctx.fillText(`Avg time: ${Math.round(stats.avgTimeMs)}ms`, BUTTON_X, statsY + 68);

  // --- Next prompt ---
  if (data.phase === 'answered') {
    ctx.fillStyle = COLORS.neutral;
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Press SPACE for next', LAYOUT.board.x + LAYOUT.board.w / 2, 560);
  }
}

/** Draw tab bar with 3 mode tabs */
export function drawTabs(ctx: CanvasRenderingContext2D, activeMode: string): void {
  const { x, y, w, h } = LAYOUT.tabBar;
  const tabs = ['Quiz', 'Visualizer', 'Drill'];
  const tabW = Math.floor(w / tabs.length);

  // Background
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

    // Separator
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

/** Draw the status bar at the bottom */
export function drawStatusBar(ctx: CanvasRenderingContext2D, text: string): void {
  const { x, y, w, h } = LAYOUT.statusBar;

  ctx.fillStyle = COLORS.statusBarBg;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = COLORS.panelText;
  ctx.font = '13px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);
}

/** Helper: draw a rounded rectangle path */
function roundRect(
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
