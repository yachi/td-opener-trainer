import type { PieceType } from '../core/types';
import type { OpenerID } from '../openers/types';
import type { OnboardingProgress } from '../modes/onboarding';
import type { QuizHUDData } from './hud';
import type { QuizQueueOptions } from './queue';
import type { OnboardingRenderState } from './onboarding';
import { CANVAS_W, CANVAS_H, COLORS, LAYOUT, CELL_SIZE } from './board';
import { drawBoard, drawFilledCells, drawPiecePreview } from './board';
import { drawHoldPiece, drawQueue, drawQuizQueue } from './queue';
import { drawQuizHUD, drawTabs, drawStatusBar } from './hud';
import { renderOnboardingMode } from './onboarding';
import { OPENERS } from '../openers/decision';

export interface QuizStatsData {
  total: number;
  correct: number;
  streak: number;
  bestStreak: number;
  avgTimeMs: number;
}

export interface AppState {
  mode: 'onboarding' | 'quiz' | 'visualizer' | 'drill';
  onboarding?: OnboardingProgress;
  onboardingDrill?: {
    currentBag: PieceType[];
    lastAnswer: boolean | null;
    isCorrect: boolean | null;
    autoAdvanceAt: number | null;
  };
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

      if (state.mode === 'onboarding' && state.onboarding) {
        // Build render state from progress + drill data
        const renderState = buildOnboardingRenderState(state);
        renderOnboardingMode(ctx, renderState);
      } else if (state.mode === 'quiz') {
        renderQuizMode(ctx, state);
        drawStatusBar(ctx, 'Press 1-3 \u00b7 Space: skip \u00b7 S: mode \u00b7 R: reset', state.quiz.mode);
      } else {
        // Future: visualizer and drill modes
        const statusText = `${state.mode.charAt(0).toUpperCase() + state.mode.slice(1)} mode`;
        drawStatusBar(ctx, statusText);
      }
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

function buildOnboardingRenderState(state: AppState): OnboardingRenderState {
  const progress = state.onboarding!;
  const result: OnboardingRenderState = { progress };

  if (progress.stagePhase === 'drill' && state.onboardingDrill) {
    const drill = state.onboardingDrill;
    const stage = progress.currentStage as OpenerID;
    const mastery = progress.mastery[stage];
    const def = OPENERS[stage];
    const bag = drill.currentBag;
    const actuallyBuildable = bag.length > 0
      ? (def.canBuild(bag) || def.canBuildMirror(bag))
      : false;

    result.drill = {
      openerId: stage,
      bag: drill.currentBag,
      phase: drill.lastAnswer !== null ? 'answered' : 'asking',
      answer: drill.lastAnswer,
      isCorrect: drill.isCorrect,
      correctAnswer: actuallyBuildable,
      total: mastery?.total ?? 0,
      correct: mastery?.correct ?? 0,
      threshold: { window: 6, required: 5 },
    };
  }

  if (progress.stagePhase === 'celebration') {
    const stage = progress.currentStage as OpenerID;
    const mastery = progress.mastery[stage];

    // Determine next stage
    const stageOrder: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon'];
    const idx = stageOrder.indexOf(stage);
    const nextId = idx >= 0 && idx < stageOrder.length - 1 ? stageOrder[idx + 1]! : null;
    const nextDef = nextId ? OPENERS[nextId] : null;

    const motivations: Record<OpenerID, string> = {
      ms2: 'Honey Cup sends a stronger attack (TST vs TSD)',
      honey_cup: 'Stray Cannon is the final fallback opener',
      stray_cannon: 'Ready for the full quiz!',
      gamushiro: '',
    };

    result.celebration = {
      openerId: stage,
      total: mastery?.total ?? 0,
      correct: mastery?.correct ?? 0,
      nextStage: nextId,
      nextOpenerName: nextDef ? `${nextDef.nameEn} (${nextDef.nameCn})` : null,
      motivation: motivations[stage] ?? '',
    };
  }

  return result;
}
