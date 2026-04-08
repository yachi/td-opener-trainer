import type { PieceType } from '../core/types';
import type { OpenerID } from '../openers/types';
import type { OnboardingProgress } from '../modes/onboarding';
import type { QuizHUDData } from './hud';
import type { QuizQueueOptions } from './queue';
import type { OnboardingRenderState } from './onboarding';
import type { VisualizerState, Bag2Route } from '../modes/visualizer';
import { getBag2Routes } from '../modes/visualizer';
import { CANVAS_W, CANVAS_H, COLORS, LAYOUT, CELL_SIZE, drawCell, drawPieceInBox, roundRect } from './board';
import { drawBoard, drawFilledCells, drawPiecePreview } from './board';
import { drawHoldPiece, drawQueue, drawQuizQueue } from './queue';
import { drawQuizHUD, drawTabs, drawStatusBar } from './hud';
import { renderOnboardingMode } from './onboarding';
import { OPENERS } from '../openers/decision';
import { PIECE_DEFINITIONS } from '../core/pieces';
import { renderDrillMode, renderDrillSelector } from './drill';
import type { DrillState } from '../modes/drill';

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
    selectedRouteIndex?: number | null;
    correctRouteIndex?: number | null;
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
  visualizer?: VisualizerState;
  drill?: DrillState | null;
  drillSelector?: { selectedIndex: number };
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
      } else if (state.mode === 'visualizer' && state.visualizer) {
        renderVisualizerMode(ctx, state.visualizer);
      } else if (state.mode === 'drill') {
        if (state.drill) {
          renderDrillMode(ctx, state.drill);
        } else {
          renderDrillSelector(ctx, state.drillSelector?.selectedIndex ?? 0);
        }
      } else {
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
  const isBag2 = progress.currentBag === 2;
  const result: OnboardingRenderState = { progress };

  if (progress.stagePhase === 'shape_preview') {
    result.shapeStep = (state as any).onboardingShapeStep ?? 0;
    result.bag2Route = (state as any).onboardingBag2Route ?? 0;
  }

  if (progress.stagePhase === 'drill' && state.onboardingDrill) {
    const drill = state.onboardingDrill;
    const stage = progress.currentStage as OpenerID;
    const mastery = isBag2 ? progress.masteryBag2?.[stage] : progress.mastery[stage];
    const def = OPENERS[stage];
    const bag = drill.currentBag;

    if (isBag2) {
      const routes = getBag2Routes(stage, false);
      const hasAnswer = drill.selectedRouteIndex !== null;
      result.drill = {
        openerId: stage,
        bag: drill.currentBag,
        phase: hasAnswer ? 'answered' : 'asking',
        answer: null,
        isCorrect: drill.isCorrect,
        correctAnswer: false, // not used for bag 2
        total: mastery?.total ?? 0,
        correct: mastery?.correct ?? 0,
        threshold: { window: 6, required: 5 },
        isBag2: true,
        route0Label: routes[0]?.routeLabel ?? 'Route 0',
        route1Label: routes[1]?.routeLabel ?? 'Route 1',
        selectedRouteIndex: drill.selectedRouteIndex,
        correctRouteIndex: drill.correctRouteIndex,
      };
    } else {
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
  }

  if (progress.stagePhase === 'celebration') {
    const stage = progress.currentStage as OpenerID;
    const mastery = isBag2 ? progress.masteryBag2?.[stage] : progress.mastery[stage];

    // Determine next stage
    const idx = (['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'] as OpenerID[]).indexOf(stage);
    let nextId: OpenerID | null = null;
    let motivation = '';

    if (idx >= 0 && idx < 3) {
      // Not last opener in current bag pass
      nextId = (['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'] as OpenerID[])[idx + 1]!;
    } else if (!isBag2) {
      // Last Bag 1 opener → next is first Bag 2 opener
      nextId = 'ms2';
      motivation = 'Now learn Bag 2 routes!';
    }

    const nextDef = nextId ? OPENERS[nextId] : null;

    const bag1Motivations: Record<OpenerID, string> = {
      ms2: 'Honey Cup sends a stronger attack (TST vs TSD)',
      honey_cup: 'Stray Cannon is the final fallback opener',
      stray_cannon: 'Gamushiro completes your opener repertoire',
      gamushiro: isBag2 ? '' : 'Now learn Bag 2 routes!',
    };

    const bag2Motivations: Record<OpenerID, string> = {
      ms2: 'Next: Honey Cup Bag 2 routes',
      honey_cup: 'Next: Stray Cannon Bag 2 routes',
      stray_cannon: 'Next: Gamushiro Bag 2 routes',
      gamushiro: 'All done! Ready for the full quiz.',
    };

    result.celebration = {
      openerId: stage,
      total: mastery?.total ?? 0,
      correct: mastery?.correct ?? 0,
      nextStage: nextId,
      nextOpenerName: nextDef
        ? `${isBag2 ? 'Bag 2: ' : ''}${nextDef.nameEn} (${nextDef.nameCn})`
        : null,
      motivation: motivation || ((isBag2 ? bag2Motivations : bag1Motivations)[stage] ?? ''),
    };
  }

  return result;
}

// ── Visualizer Mode Renderer ──

function renderVisualizerMode(ctx: CanvasRenderingContext2D, vizState: VisualizerState): void {
  const { steps, currentStep, openerId, mirror, bag1End } = vizState;
  const inBag2 = currentStep > bag1End;
  const hasRoute = vizState.routeIndex >= 0;
  const FONT = '-apple-system, sans-serif';
  const boardX = 120;
  const boardY = 60;
  const cellSz = 28;
  const boardW = 10 * cellSz;  // 280
  const boardH = 8 * cellSz;   // only show bottom 8 rows (where pieces are)
  const visibleRows = 8;

  // Title
  const openerDef = OPENERS[openerId];
  const title = `${openerDef.nameEn} ${mirror ? '(Mirror)' : ''}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 20px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(title, CANVAS_W / 2, 50);

  ctx.fillStyle = '#8888AA';
  ctx.font = `14px ${FONT}`;
  ctx.fillText(`(${openerDef.nameCn})`, CANVAS_W / 2, 75);

  // Bag 2 route label and condition
  const bag2Routes = getBag2Routes(openerId, mirror);
  if (inBag2 && hasRoute && bag2Routes.length > 0) {
    const route = bag2Routes[vizState.routeIndex];
    if (route) {
      ctx.fillStyle = '#CCAA44';
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText(`Bag 2 · ${route.routeLabel}`, CANVAS_W / 2, 92);
      ctx.fillStyle = '#9999BB';
      ctx.font = `12px ${FONT}`;
      ctx.fillText(`Condition: ${route.conditionLabel}`, CANVAS_W / 2, 108);
    }
  }

  // Step indicator — derive local step within bag
  const bag2Start = inBag2 ? bag1End + (vizState.routeIndex >= 0 && bag2Routes.length > 0 && bag2Routes[vizState.routeIndex]?.routeLabel ? 1 : 0) : 0;
  const displayStep = inBag2 ? currentStep - bag1End : currentStep;
  const displayTotal = inBag2 ? steps.length - bag1End : bag1End;
  const bagLabel = inBag2 ? 'Bag 2' : 'Bag 1';
  ctx.fillStyle = '#B0B0D0';
  ctx.font = `14px ${FONT}`;
  const stepY = inBag2 ? 122 : 95;
  ctx.fillText(`${bagLabel} · Step ${displayStep} / ${displayTotal}`, CANVAS_W / 2, stepY);

  // Board background
  const boardTopY = 120;
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

  // Get the current board state — one line, no special cases
  const board = currentStep === 0
    ? Array.from({ length: 20 }, () => new Array<PieceType | null>(10).fill(null))
    : steps[currentStep - 1]!.board;

  // Get new cells for highlighting
  const newCells = currentStep > 0 ? steps[currentStep - 1]!.newCells : [];

  // Bag 1 cells for dimming — derived from the board state at bag1End
  const bag1CellSet = new Set<string>();
  if (inBag2 && bag1End > 0) {
    const bag1Final = steps[bag1End - 1]!.board;
    for (let r = 0; r < 20; r++)
      for (let c = 0; c < 10; c++)
        if (bag1Final[r]?.[c] !== null) bag1CellSet.add(`${r},${c}`);
  }

  // Draw filled cells (bottom 8 rows = rows 12-19)
  for (let r = 0; r < visibleRows; r++) {
    const boardRow = 20 - visibleRows + r; // map to board coordinates
    for (let c = 0; c < 10; c++) {
      const cell = board[boardRow]?.[c];
      if (cell) {
        const px = boardX + c * cellSz;
        const py = boardTopY + r * cellSz;
        const color = COLORS.pieces[cell] ?? '#888888';

        // Check if this is a newly placed cell
        const isNew = newCells.some(nc => nc.row === boardRow && nc.col === c);
        // Check if this is a Bag 1 cell (dimmed when viewing Bag 2)
        const isBag1Cell = inBag2 && bag1CellSet.has(`${boardRow},${c}`);

        if (isNew) {
          // Bright highlight for new piece
          drawCell(ctx, px, py, cellSz, color);
          // Add glow border
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, cellSz - 2, cellSz - 2);
        } else if (isBag1Cell) {
          // Bag 1 pieces dimmed when viewing Bag 2
          ctx.globalAlpha = 0.3;
          drawCell(ctx, px, py, cellSz, color);
          ctx.globalAlpha = 1.0;
        } else {
          // Previously placed pieces (same bag)
          ctx.globalAlpha = 0.5;
          drawCell(ctx, px, py, cellSz, color);
          ctx.globalAlpha = 1.0;
        }
      }
    }
  }

  // Hold piece display
  const holdX = 20;
  const holdY = 140;
  ctx.fillStyle = '#B0B0D0';
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('HOLD', holdX + 40, holdY - 4);

  ctx.strokeStyle = COLORS.boardBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(holdX, holdY, 80, 72);
  const holdPiece = mirror ? openerDef.holdPieceMirror : openerDef.holdPiece;
  drawPieceInBox(ctx, holdPiece, holdX, holdY, 80, 72, 14);

  // Current step hint
  if (currentStep > 0) {
    const step = steps[currentStep - 1]!;
    const hintY = boardTopY + boardH + 20;

    if (step.newCells.length > 0) {
      // Piece being placed — show piece label
      ctx.fillStyle = COLORS.pieces[step.piece] ?? '#FFFFFF';
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`Piece ${currentStep}: ${step.piece}`, CANVAS_W / 2, hintY);

      // Hint text
      ctx.fillStyle = '#B0B0D0';
      ctx.font = `14px ${FONT}`;
      ctx.fillText(step.hint, CANVAS_W / 2, hintY + 24);
    } else {
      // Bridge step (no piece) — just show hint
      ctx.fillStyle = '#B0B0D0';
      ctx.font = `14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(step.hint, CANVAS_W / 2, hintY);
    }
  } else {
    ctx.fillStyle = '#666688';
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (inBag2) {
      ctx.fillText('Bag 1 complete — press → to place Bag 2 pieces', CANVAS_W / 2, boardTopY + boardH + 30);
    } else {
      ctx.fillText('Empty board — press → to place first piece', CANVAS_W / 2, boardTopY + boardH + 30);
    }
  }

  // Navigation controls
  const navY = boardTopY + boardH + 80;
  ctx.fillStyle = '#555577';
  ctx.font = `13px ${FONT}`;
  ctx.textAlign = 'center';
  const navHint = bag2Routes.length > 0
    ? '← prev · → next · 1-4: opener · 5-6: route · M: mirror'
    : '← prev · → next · 1-4: switch opener · M: mirror';
  ctx.fillText(navHint, CANVAS_W / 2, navY);

  // Opener selector buttons (bottom)
  const btnY = navY + 30;
  const openerIds: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'];
  const btnLabels = ['1:MS2', '2:Honey', '3:Stray', '4:Gamushiro'];
  const btnW = 130;
  const totalBtnW = openerIds.length * btnW + (openerIds.length - 1) * 8;
  let btnX = (CANVAS_W - totalBtnW) / 2;

  for (let i = 0; i < openerIds.length; i++) {
    const isActive = openerIds[i] === openerId;
    ctx.fillStyle = isActive ? '#2A2A5C' : '#1A1A3A';
    roundRect(ctx, btnX, btnY, btnW, 32, 6);
    ctx.fill();
    ctx.strokeStyle = isActive ? '#6A6AAC' : '#3A3A5C';
    ctx.lineWidth = 1;
    roundRect(ctx, btnX, btnY, btnW, 32, 6);
    ctx.stroke();

    ctx.fillStyle = isActive ? '#FFFFFF' : '#9999BB';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btnLabels[i]!, btnX + btnW / 2, btnY + 16);

    btnX += btnW + 8;
  }

  // Bag 2 route selector buttons (below opener buttons, only when routes exist)
  if (bag2Routes.length > 0) {
    const routeBtnY = btnY + 42;
    const routeBtnW = 160;
    const routeTotalW = bag2Routes.length * routeBtnW + (bag2Routes.length - 1) * 8;
    let routeBtnX = (CANVAS_W - routeTotalW) / 2;

    for (let i = 0; i < bag2Routes.length; i++) {
      const route = bag2Routes[i]!;
      const isActive = inBag2 && vizState.routeIndex === i;
      ctx.fillStyle = isActive ? '#3A3A2C' : '#1A1A3A';
      roundRect(ctx, routeBtnX, routeBtnY, routeBtnW, 28, 6);
      ctx.fill();
      ctx.strokeStyle = isActive ? '#AAAA6C' : '#3A3A5C';
      ctx.lineWidth = 1;
      roundRect(ctx, routeBtnX, routeBtnY, routeBtnW, 28, 6);
      ctx.stroke();

      ctx.fillStyle = isActive ? '#FFDD66' : '#9999BB';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 5}: ${route.routeLabel}`, routeBtnX + routeBtnW / 2, routeBtnY + 14);

      routeBtnX += routeBtnW + 8;
    }
  }

  // Status bar
  const statusStepTotal = inBag2 ? steps.length - bag1End : bag1End;
  const statusBag = inBag2 ? 'Bag 2' : 'Bag 1';
  drawStatusBar(ctx, `${title} · ${statusBag} · Step ${currentStep}/${statusStepTotal} · ←→: step · M: mirror`);
}
