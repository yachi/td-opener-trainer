import type { PieceType } from '../core/types';
import type { OpenerID } from '../openers/types';
import type { QuizHUDData } from './hud';
import type { QuizQueueOptions } from './queue';
import { CANVAS_W, CANVAS_H, COLORS, LAYOUT, CELL_SIZE } from './board';
import { drawBoard, drawFilledCells, drawPiecePreview } from './board';
import { drawHoldPiece, drawQueue, drawQuizQueue } from './queue';
import { drawQuizHUD, drawTabs, drawStatusBar } from './hud';
import { OPENERS } from '../openers/decision';

export interface QuizStatsData {
  total: number;
  correct: number;
  streak: number;
  bestStreak: number;
  avgTimeMs: number;
}

export interface AppState {
  mode: 'quiz' | 'visualizer' | 'drill';
  quiz: {
    phase: 'showing' | 'answered' | 'transitioning';
    currentBag: PieceType[];
    correctOpener: OpenerID;
    alternatives: OpenerID[];
    selectedOpener: OpenerID | null;
    isCorrect: boolean | null;
    questionStartTime: number;
    responseTimeMs: number | null;
    mirror: boolean;
    decisionPieces: PieceType[];
    explanation: string;
    autoAdvanceAt: number | null;
    mode: 'learning' | 'speed';
  };
  stats: QuizStatsData;
}

export interface Renderer {
  render(state: AppState): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D rendering context');
  }

  return {
    render(state: AppState): void {
      // 1. Clear canvas
      ctx.fillStyle = COLORS.canvasBg;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 2. Tabs
      drawTabs(ctx, state.mode);

      if (state.mode === 'quiz') {
        renderQuizMode(ctx, state);
      }
      // Future: visualizer and drill modes

      // Status bar
      const statusText = state.mode === 'quiz'
        ? 'Press 1-3 \u00b7 Space: skip \u00b7 S: mode \u00b7 R: reset'
        : `${state.mode.charAt(0).toUpperCase() + state.mode.slice(1)} mode`;

      drawStatusBar(ctx, statusText, state.mode === 'quiz' ? state.quiz.mode : undefined);
    },
  };
}

function renderQuizMode(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { quiz, stats } = state;

  // Determine hold piece: show after answering
  const isAnswered = quiz.phase === 'answered' || quiz.phase === 'transitioning';
  const openerDef = OPENERS[quiz.correctOpener];
  const holdPiece = isAnswered
    ? (quiz.mirror ? openerDef.holdPieceMirror : openerDef.holdPiece)
    : null;

  // 3. Draw quiz queue (vertical layout)
  const queueOptions: QuizQueueOptions = {
    decisionPieces: quiz.decisionPieces,
    showHighlights: isAnswered,
    holdPiece,
    mirror: quiz.mirror,
  };
  drawQuizQueue(ctx, quiz.currentBag, queueOptions);

  // 4. Draw HUD (buttons, feedback, stats)
  const hudData: QuizHUDData = {
    phase: quiz.phase,
    selectedOpener: quiz.selectedOpener,
    correctOpener: quiz.correctOpener,
    alternatives: quiz.alternatives,
    isCorrect: quiz.isCorrect,
    responseTimeMs: quiz.responseTimeMs,
    explanation: quiz.explanation,
    quizMode: quiz.mode,
    stats: {
      total: stats.total,
      correct: stats.correct,
      streak: stats.streak,
      bestStreak: stats.bestStreak,
      avgTimeMs: stats.avgTimeMs,
    },
  };
  drawQuizHUD(ctx, hudData);
}
