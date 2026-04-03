import type { PieceType } from '../core/types';
import type { OpenerID } from '../openers/types';
import type { QuizHUDData } from './hud';
import { CANVAS_W, CANVAS_H, COLORS, LAYOUT, CELL_SIZE } from './board';
import { drawBoard, drawFilledCells, drawPiecePreview } from './board';
import { drawHoldPiece, drawQueue } from './queue';
import { drawQuizHUD, drawTabs, drawStatusBar } from './hud';

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
    phase: 'showing' | 'answered';
    currentBag: PieceType[];
    correctOpener: OpenerID;
    alternatives: OpenerID[];
    selectedOpener: OpenerID | null;
    isCorrect: boolean | null;
    questionStartTime: number;
    responseTimeMs: number | null;
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
        ? 'Identify the correct TD opener for the given bag'
        : `${state.mode.charAt(0).toUpperCase() + state.mode.slice(1)} mode`;
      drawStatusBar(ctx, statusText);
    },
  };
}

function renderQuizMode(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { quiz, stats } = state;

  // 3. Board background + grid
  drawBoard(ctx);

  // 4. Draw the 7-bag pieces across the board center area
  const boardCenterY = LAYOUT.board.y + LAYOUT.board.h / 2 - CELL_SIZE;
  const previewCellSize = 18;

  // Calculate total width to center the bag on the board
  const bagPieces = quiz.currentBag;
  // Estimate total width for centering
  let totalW = 0;
  for (const p of bagPieces) {
    const slotW = (p === 'I' ? 4 : p === 'O' ? 4 : 3) * previewCellSize;
    totalW += slotW + previewCellSize * 0.5;
  }
  totalW -= previewCellSize * 0.5; // remove trailing gap

  const startX = LAYOUT.board.x + (LAYOUT.board.w - totalW) / 2;
  drawPiecePreview(ctx, bagPieces, startX, boardCenterY, previewCellSize);

  // 5. Quiz HUD
  const hudData: QuizHUDData = {
    phase: quiz.phase,
    selectedOpener: quiz.selectedOpener,
    correctOpener: quiz.correctOpener,
    alternatives: quiz.alternatives,
    isCorrect: quiz.isCorrect,
    responseTimeMs: quiz.responseTimeMs,
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
