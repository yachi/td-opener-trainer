import { createRenderer } from './renderer/canvas.ts';
import type { AppState } from './renderer/canvas.ts';
import { loadQuizStats, saveQuizStats, recordAnswer, getDisplayStats } from './stats/tracker.ts';
import { createQuizState, nextQuestion, submitAnswer, submitBag2Answer } from './modes/quiz.ts';
import { setupKeyboard } from './input/keyboard.ts';
import type { OpenerID } from './openers/types.ts';
import type { PieceType } from './core/types.ts';
import {
  loadOnboardingProgress,
  saveOnboardingProgress,
  createOnboardingProgress,
  advancePhase,
  goToStage,
  checkMastery,
  recordDrillAnswer,
  recordBag2DrillAnswer,
  generateDrillBag,
  generateBag2DrillBag,
  getWorkedExamples,
  getBag2WorkedExamples,
  getMasteryRecord,
  STAGE_ORDER,
} from './modes/onboarding.ts';
import type { OnboardingProgress } from './modes/onboarding.ts';
import { bestBag2Route } from './openers/decision.ts';
import { OPENERS } from './openers/decision.ts';
import {
  createVisualizerState,
  getBag2Routes,
  getOpenerSequence,
} from './modes/visualizer.ts';
import type { VisualizerState } from './modes/visualizer.ts';
import { dispatchVisualizerAction } from './dispatcher/visualizer.ts';
import {
  createDrillState,
  movePiece,
  rotatePiece,
  hardDropPiece,
  holdCurrentPiece,
  softDropPiece,
  resetDrill,
  toggleGuided,
  transitionToBag2,
} from './modes/drill.ts';
import type { DrillState } from './modes/drill.ts';
import { setupDrillInput } from './input/drill-keyboard.ts';
import type { DrillInputHandler } from './input/drill-keyboard.ts';

// ── Extended State ──

interface OnboardingDrill {
  currentBag: PieceType[];
  lastAnswer: boolean | null;
  isCorrect: boolean | null;
  autoAdvanceAt: number | null;
  // Bag 2 drill fields
  selectedRouteIndex: number | null;
  correctRouteIndex: number | null;
}

interface FullAppState extends AppState {
  appMode: 'onboarding' | 'quiz' | 'visualizer' | 'drill';
  onboarding: OnboardingProgress;
  onboardingDrill: OnboardingDrill;
  onboardingShapeStep: number;
  onboardingBag2Route: number;
  onboardingMenuOpen: boolean;
  onboardingMenuIndex: number;
  drill: DrillState | null;
  drillSelector: { selectedIndex: number };
}

function createOnboardingDrill(): OnboardingDrill {
  return {
    currentBag: [],
    lastAnswer: null,
    isCorrect: null,
    autoAdvanceAt: null,
    selectedRouteIndex: null,
    correctRouteIndex: null,
  };
}

// ── State ──

const onboardingProgress = loadOnboardingProgress();
const isOnboardingComplete = onboardingProgress.currentStage === 'complete';

const state: FullAppState = {
  mode: isOnboardingComplete ? 'quiz' : ('onboarding' as any),
  appMode: isOnboardingComplete ? 'quiz' : 'onboarding',
  quiz: createQuizState(),
  stats: getDisplayStats(loadQuizStats()),
  onboarding: onboardingProgress,
  onboardingDrill: createOnboardingDrill(),
  onboardingShapeStep: 0,
  onboardingBag2Route: 0,
  onboardingMenuOpen: true,
  onboardingMenuIndex: 0,
  visualizer: createVisualizerState('ms2', false),
  drill: null,
  drillSelector: { selectedIndex: 0 },
};

// Debug: expose state to window for inspection
(window as any).__appState = state;

let storedStats = loadQuizStats();
let dirty = true;
let drillInput: DrillInputHandler | null = null;
let prevAppMode: 'onboarding' | 'quiz' | 'drill' = isOnboardingComplete ? 'quiz' : 'onboarding';

function enterDrillMode(): void {
  state.appMode = 'drill';
  state.mode = 'drill';
  state.drill = null; // start in selecting phase
  state.drillSelector = { selectedIndex: 0 };
  if (!drillInput) {
    drillInput = setupDrillInput();
  }
  dirty = true;
}

function leaveDrillMode(): void {
  if (drillInput) {
    drillInput.destroy();
    drillInput = null;
  }
}

// ── Onboarding Helpers ──

function enterDrillPhase(): void {
  const stage = state.onboarding.currentStage;
  if (stage === 'complete') return;
  const openerId = stage as OpenerID;
  const isBag2 = state.onboarding.currentBag === 2;
  const bag = isBag2 ? generateBag2DrillBag(openerId) : generateDrillBag(openerId);
  state.onboardingDrill = {
    currentBag: bag,
    lastAnswer: null,
    isCorrect: null,
    autoAdvanceAt: null,
    selectedRouteIndex: null,
    correctRouteIndex: null,
  };
}

function advanceDrill(): void {
  const stage = state.onboarding.currentStage;
  if (stage === 'complete') return;
  const openerId = stage as OpenerID;
  const isBag2 = state.onboarding.currentBag === 2;
  const bag = isBag2 ? generateBag2DrillBag(openerId) : generateDrillBag(openerId);
  state.onboardingDrill.currentBag = bag;
  state.onboardingDrill.lastAnswer = null;
  state.onboardingDrill.isCorrect = null;
  state.onboardingDrill.autoAdvanceAt = null;
  state.onboardingDrill.selectedRouteIndex = null;
  state.onboardingDrill.correctRouteIndex = null;
}

function transitionToQuiz(): void {
  state.appMode = 'quiz';
  state.mode = 'quiz';
  state.onboarding.currentStage = 'complete';
  saveOnboardingProgress(state.onboarding);
  nextQuestion(state.quiz);
  dirty = true;
}

// If resuming into drill phase, generate a bag
if (
  state.appMode === 'onboarding' &&
  state.onboarding.stagePhase === 'drill'
) {
  enterDrillPhase();
}

// ── Dispatcher ──

function dispatch(action: string): void {
  // V key: toggle visualizer mode from anywhere
  if (action === 'toggle_visualizer') {
    if (state.appMode === 'visualizer') {
      // Return to previous mode
      if (prevAppMode === 'drill') {
        enterDrillMode();
      } else {
        const returnMode = state.onboarding.currentStage === 'complete' ? 'quiz' : 'onboarding';
        state.appMode = returnMode;
        state.mode = returnMode as any;
      }
    } else {
      prevAppMode = state.appMode === 'drill' ? 'drill' : (state.appMode as any);
      if (state.appMode === 'drill') leaveDrillMode();
      state.appMode = 'visualizer';
      state.mode = 'visualizer';
    }
    dirty = true;
    return;
  }

  // In drill mode, only handle V (above) from main dispatcher — everything else goes through drillInput
  if (state.appMode === 'drill') {
    return;
  }

  if (state.appMode === 'visualizer') {
    dispatchVisualizer(action);
  } else if (state.appMode === 'onboarding') {
    dispatchOnboarding(action);
  } else {
    dispatchQuiz(action);
  }
}

function dispatchVisualizer(action: string): void {
  if (dispatchVisualizerAction(state as any, action)) {
    dirty = true;
  }
}

function skipCurrentStage(): void {
  const { onboarding } = state;
  const stage = onboarding.currentStage;
  if (stage === 'complete') return;

  // Mark current stage as completed and jump to celebration
  const mastery = onboarding.mastery[stage as OpenerID];
  if (mastery) {
    mastery.completed = true;
  }
  onboarding.stagePhase = 'celebration';
  saveOnboardingProgress(onboarding);
  dirty = true;
}

function selectOnboardingStage(index: number): void {
  const bag = index < 4 ? 1 : 2;
  const openerIndex = index % 4;
  const openerId = STAGE_ORDER[openerIndex]!;
  goToStage(state.onboarding, openerId, bag as 1 | 2);
  state.onboardingMenuOpen = false;
  state.onboardingShapeStep = 0;
  state.onboardingBag2Route = 0;
  if (state.onboarding.stagePhase === 'drill') {
    enterDrillPhase();
  }
  saveOnboardingProgress(state.onboarding);
  dirty = true;
}

function dispatchOnboarding(action: string): void {
  const { onboarding } = state;

  // Menu action: open the stage selector
  if (action === 'menu') {
    state.onboardingMenuOpen = true;
    dirty = true;
    return;
  }

  // When menu is open, handle stage selection
  if (state.onboardingMenuOpen) {
    const totalItems = STAGE_ORDER.length * 2; // 8 items
    switch (action) {
      case 'option_1': selectOnboardingStage(0); return;
      case 'option_2': selectOnboardingStage(1); return;
      case 'option_3': selectOnboardingStage(2); return;
      case 'option_4': selectOnboardingStage(3); return;
      case 'option_5': selectOnboardingStage(4); return;
      case 'option_6': selectOnboardingStage(5); return;
      case 'option_7': selectOnboardingStage(6); return;
      case 'option_8': selectOnboardingStage(7); return;
      case 'step_back': // Arrow left = up in list
        state.onboardingMenuIndex = Math.max(0, state.onboardingMenuIndex - 1);
        dirty = true;
        return;
      case 'advance': { // Arrow right / Space = down or confirm
        // If Space, confirm selection
        selectOnboardingStage(state.onboardingMenuIndex);
        return;
      }
    }
    // For keys 7-8 we need option_7/option_8 which don't exist yet
    // Use arrow navigation for those slots
    return;
  }

  // Skip stage works from any phase (press N)
  if (action === 'skip_stage') {
    skipCurrentStage();
    return;
  }

  const phase = onboarding.stagePhase;

  switch (phase) {
    case 'shape_preview': {
      const stage = onboarding.currentStage;
      if (stage === 'complete') break;
      const openerId = stage as OpenerID;
      if (action === 'advance') {
        if (onboarding.currentBag === 2) {
          // Bag 2: use visualizer state for step count
          const vizState = createVisualizerState(openerId, false, state.onboardingBag2Route ?? 0);
          const totalSteps = vizState.steps.length - vizState.bag1End;
          if (state.onboardingShapeStep < totalSteps) {
            state.onboardingShapeStep++;
          } else {
            advancePhase(onboarding);
            state.onboardingShapeStep = 0;
            state.onboardingBag2Route = 0;
            saveOnboardingProgress(onboarding);
          }
        } else {
          const seq = getOpenerSequence(openerId, false);
          if (state.onboardingShapeStep < seq.steps.length) {
            state.onboardingShapeStep++;
          } else {
            advancePhase(onboarding);
            state.onboardingShapeStep = 0;
            saveOnboardingProgress(onboarding);
          }
        }
        dirty = true;
      } else if (action === 'step_back') {
        if (state.onboardingShapeStep > 0) {
          state.onboardingShapeStep--;
          dirty = true;
        }
      } else if (action === 'option_1' && onboarding.currentBag === 2) {
        // Toggle to route 0
        state.onboardingBag2Route = 0;
        state.onboardingShapeStep = 0;
        dirty = true;
      } else if (action === 'option_2' && onboarding.currentBag === 2) {
        // Toggle to route 1
        state.onboardingBag2Route = 1;
        state.onboardingShapeStep = 0;
        dirty = true;
      }
      break;
    }

    case 'rule_card': {
      if (action === 'advance') {
        advancePhase(onboarding);
        saveOnboardingProgress(onboarding);
        dirty = true;
      }
      break;
    }

    case 'examples': {
      if (action === 'advance') {
        const stage = onboarding.currentStage;
        if (stage === 'complete') break;
        const openerId = stage as OpenerID;

        const examples = onboarding.currentBag === 2
          ? getBag2WorkedExamples(openerId)
          : getWorkedExamples(openerId);
        const totalExamples = examples.length;
        const currentExample = examples[onboarding.exampleIndex];
        if (!currentExample) break;

        const totalSteps = currentExample.steps.length;

        if (onboarding.exampleStep < totalSteps - 1) {
          onboarding.exampleStep++;
        } else if (onboarding.exampleIndex < totalExamples - 1) {
          onboarding.exampleIndex++;
          onboarding.exampleStep = 0;
        } else {
          advancePhase(onboarding);
          enterDrillPhase();
        }

        saveOnboardingProgress(onboarding);
        dirty = true;
      }
      break;
    }

    case 'drill': {
      if (action !== 'option_1' && action !== 'option_2') break;
      // Don't accept answers during auto-advance cooldown
      if (state.onboardingDrill.autoAdvanceAt !== null) break;

      const stage = onboarding.currentStage;
      if (stage === 'complete') break;
      const openerId = stage as OpenerID;

      let isCorrect: boolean;

      if (onboarding.currentBag === 2) {
        // Bag 2 drill: option_1 = route 0, option_2 = route 1
        const selectedRouteIndex = action === 'option_1' ? 0 : 1;
        isCorrect = recordBag2DrillAnswer(
          onboarding,
          openerId,
          selectedRouteIndex,
          state.onboardingDrill.currentBag,
        );
        const { routeIndex: correctIdx } = bestBag2Route(openerId, false, state.onboardingDrill.currentBag);
        state.onboardingDrill.selectedRouteIndex = selectedRouteIndex;
        state.onboardingDrill.correctRouteIndex = correctIdx;
        state.onboardingDrill.lastAnswer = null; // not used for Bag 2
      } else {
        // Bag 1 drill: option_1 = Yes, option_2 = No
        const userAnswer = action === 'option_1';
        isCorrect = recordDrillAnswer(
          onboarding,
          openerId,
          userAnswer,
          state.onboardingDrill.currentBag,
        );
        state.onboardingDrill.lastAnswer = userAnswer;
      }

      state.onboardingDrill.isCorrect = isCorrect;

      // Check mastery after recording
      const mastered = checkMastery(onboarding, openerId);
      if (mastered) {
        const record = getMasteryRecord(onboarding, openerId);
        if (record) record.completed = true;
        advancePhase(onboarding); // → celebration
        saveOnboardingProgress(onboarding);
        dirty = true;
        break;
      }

      // Auto-advance timing: 450ms correct, 1200ms wrong
      const now = performance.now();
      state.onboardingDrill.autoAdvanceAt = now + (isCorrect ? 450 : 1200);

      saveOnboardingProgress(onboarding);
      dirty = true;
      break;
    }

    case 'celebration': {
      if (action === 'advance') {
        advancePhase(onboarding);
        state.onboardingShapeStep = 0;
        state.onboardingBag2Route = 0;

        if (onboarding.currentStage === 'complete') {
          transitionToQuiz();
        } else {
          saveOnboardingProgress(onboarding);
          dirty = true;
        }
      }
      break;
    }
    // Note: 'menu' action (Escape) is handled above before the phase switch
  }
}

function dispatchQuiz(action: string): void {
  switch (action) {
    case 'option_1':
    case 'option_2':
    case 'option_3': {
      if (state.quiz.phase !== 'showing') return;

      if (state.quiz.quizType === 'bag2') {
        // Bag 2: option_1 = route 0, option_2 = route 1, option_3 = ignored
        if (action === 'option_3') return;
        const routeIndex = action === 'option_1' ? 0 : 1;
        submitBag2Answer(state.quiz, routeIndex);
      } else {
        // Bag 1: same as before
        const openerMap: Record<string, OpenerID> = {
          option_1: 'stray_cannon',
          option_2: 'honey_cup',
          option_3: 'ms2',
        };
        let picked = openerMap[action]!;

        // When user picks 'ms2', accept if the correct answer is 'gamushiro'
        if (picked === 'ms2' && state.quiz.correctOpener === 'gamushiro') {
          picked = 'gamushiro';
        }

        submitAnswer(state.quiz, picked);
      }

      // Record stats (shared across both quiz types)
      const opener = state.quiz.correctOpener;
      storedStats = recordAnswer(storedStats, opener, state.quiz.isCorrect!, state.quiz.responseTimeMs!);
      // Update best streak from current streak
      if (state.quiz.currentStreak > storedStats.bestStreak) {
        storedStats.bestStreak = state.quiz.currentStreak;
      }
      saveQuizStats(storedStats);
      state.stats = getDisplayStats(storedStats);
      dirty = true;
      break;
    }
    case 'advance': {
      if (state.quiz.reviewingPrevious) {
        // Return from reviewing previous question
        state.quiz.reviewingPrevious = false;
        dirty = true;
      } else if (state.quiz.phase === 'answered') {
        nextQuestion(state.quiz);
        dirty = true;
      }
      break;
    }
    case 'step_back': {
      // Review previous question (1-deep history)
      if (state.quiz.previousQuestion && !state.quiz.reviewingPrevious) {
        state.quiz.reviewingPrevious = true;
        dirty = true;
      }
      break;
    }
    case 'toggle_quiz_type': {
      state.quiz.quizType = state.quiz.quizType === 'bag1' ? 'bag2' : 'bag1';
      state.quiz.currentStreak = 0;
      nextQuestion(state.quiz);
      dirty = true;
      break;
    }
    case 'reset_stats': {
      storedStats = { version: 1, total: 0, correct: 0, byOpener: {} as any, responseTimes: [], bestStreak: 0 };
      saveQuizStats(storedStats);
      state.stats = getDisplayStats(storedStats);
      state.quiz.currentStreak = 0;
      dirty = true;
      break;
    }
  }
}

// ── Drill Dispatcher ──

const DRILL_OPENER_IDS: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'];

function dispatchDrill(action: string): void {
  // Selecting phase
  if (state.drill === null) {
    switch (action) {
      case 'select_1':
      case 'select_2':
      case 'select_3':
      case 'select_4': {
        const idx = parseInt(action.slice(-1)) - 1;
        state.drillSelector.selectedIndex = idx;
        state.drill = createDrillState(DRILL_OPENER_IDS[idx]!);
        dirty = true;
        break;
      }
      case 'confirm': {
        const id = DRILL_OPENER_IDS[state.drillSelector.selectedIndex]!;
        state.drill = createDrillState(id);
        dirty = true;
        break;
      }
      case 'move_left': // repurpose as selector nav
        state.drillSelector.selectedIndex = Math.max(0, state.drillSelector.selectedIndex - 1);
        dirty = true;
        break;
      case 'move_right':
        state.drillSelector.selectedIndex = Math.min(3, state.drillSelector.selectedIndex + 1);
        dirty = true;
        break;
      case 'soft_drop':
        state.drillSelector.selectedIndex = Math.min(3, state.drillSelector.selectedIndex + 1);
        dirty = true;
        break;
    }
    return;
  }

  const drill = state.drill;

  // Playing phase
  if (drill.phase === 'playing') {
    switch (action) {
      case 'move_left':
        state.drill = movePiece(drill, -1, 0);
        dirty = true;
        break;
      case 'move_right':
        state.drill = movePiece(drill, 1, 0);
        dirty = true;
        break;
      case 'soft_drop':
        state.drill = softDropPiece(drill);
        dirty = true;
        break;
      case 'rotate_cw':
        state.drill = rotatePiece(drill, 1);
        dirty = true;
        break;
      case 'rotate_ccw':
        state.drill = rotatePiece(drill, -1);
        dirty = true;
        break;
      case 'hard_drop':
        state.drill = hardDropPiece(drill);
        dirty = true;
        break;
      case 'hold':
        state.drill = holdCurrentPiece(drill);
        dirty = true;
        break;
      case 'toggle_guided':
        state.drill = toggleGuided(drill);
        dirty = true;
        break;
    }
    return;
  }

  // Bag 1 Complete interstitial
  if (drill.phase === 'bag1_complete') {
    switch (action) {
      case 'hard_drop': // Space = start Bag 2
        state.drill = transitionToBag2(drill);
        dirty = true;
        break;
      case 'retry':
        state.drill = resetDrill(drill);
        dirty = true;
        break;
      case 'select_1':
      case 'select_2':
      case 'select_3':
      case 'select_4': {
        const idx = parseInt(action.slice(-1)) - 1;
        state.drill = createDrillState(DRILL_OPENER_IDS[idx]!);
        dirty = true;
        break;
      }
    }
    return;
  }

  // Success or Failed phase
  if (drill.phase === 'success' || drill.phase === 'failed') {
    switch (action) {
      case 'retry':
        state.drill = resetDrill(drill);
        dirty = true;
        break;
      case 'hard_drop': // Space = new bag
        state.drill = createDrillState(drill.openerId);
        dirty = true;
        break;
      case 'select_1':
      case 'select_2':
      case 'select_3':
      case 'select_4': {
        const idx = parseInt(action.slice(-1)) - 1;
        state.drill = createDrillState(DRILL_OPENER_IDS[idx]!);
        dirty = true;
        break;
      }
    }
  }
}

// ── Render Loop ──

function frame(now: number): void {
  // Auto-advance for onboarding drill answers
  if (
    state.appMode === 'onboarding' &&
    state.onboarding.stagePhase === 'drill' &&
    state.onboardingDrill.autoAdvanceAt !== null
  ) {
    if (performance.now() >= state.onboardingDrill.autoAdvanceAt) {
      advanceDrill();
      dirty = true;
    }
  }

  // Process drill input (DAS/ARR)
  if (state.appMode === 'drill' && drillInput) {
    const actions = drillInput.update(now);
    for (const action of actions) {
      dispatchDrill(action);
    }
  }

  if (dirty) {
    renderer.render(state as AppState);
    dirty = false;
  }
  requestAnimationFrame(frame);
}

// ── Init ──

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = createRenderer(canvas);

if (state.appMode === 'quiz') {
  nextQuestion(state.quiz);
}

dirty = true;

// In drill mode, only let V (toggle_visualizer) through the main keyboard handler.
// All other keys are handled by the drill input handler.
const cleanup = setupKeyboard(dispatch, {
  shouldHandle(code: string): boolean {
    if (state.appMode !== 'drill') return true;
    // Only V passes through to main dispatch in drill mode
    return code === 'KeyV';
  },
});

// Click handling — tabs, buttons, opener selectors
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Tab bar: y 0-40, three equal tabs across 640px
  if (y <= 40) {
    const tabIndex = Math.floor(x / (640 / 3));
    if (tabIndex === 0) {
      // Learn/Quiz tab — always enters onboarding with stage selector
      if (state.appMode === 'drill') leaveDrillMode();
      state.appMode = 'onboarding';
      state.mode = 'onboarding' as any;
      state.onboardingMenuOpen = true;
      dirty = true;
    } else if (tabIndex === 1) {
      // Visualizer tab — always accessible
      if (state.appMode === 'drill') leaveDrillMode();
      state.appMode = 'visualizer' as any;
      state.mode = 'visualizer';
      dirty = true;
    } else if (tabIndex === 2) {
      // Drill tab
      if (state.appMode !== 'drill') {
        enterDrillMode();
      }
    }
    return;
  }

  // Drill mode: selector buttons + success/failed buttons
  if (state.appMode === 'drill') {
    if (state.drill === null) {
      // Selector screen: 4 buttons centered, btnW=280, btnH=48, gap=12, startY=180
      const btnW = 280;
      const btnH = 48;
      const gap = 12;
      const startY = 180;
      const bx = (640 - btnW) / 2;

      for (let i = 0; i < 4; i++) {
        const by = startY + i * (btnH + gap);
        if (x >= bx && x <= bx + btnW && y >= by && y <= by + btnH) {
          dispatchDrill(`select_${i + 1}`);
          return;
        }
      }
    }
    return;
  }

  // Visualizer mode: opener selector buttons
  if (state.appMode === 'visualizer') {
    // Buttons at y=454, h=32, 4 buttons each 130px wide, 8px gap, centered
    const btnY = 454;
    const btnH = 32;
    const btnW = 130;
    const totalW = 4 * btnW + 3 * 8;
    const startX = (640 - totalW) / 2;

    if (y >= btnY && y <= btnY + btnH) {
      const openerIds: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'];
      for (let i = 0; i < 4; i++) {
        const bx = startX + i * (btnW + 8);
        if (x >= bx && x <= bx + btnW) {
          const viz = state.visualizer!;
          state.visualizer = createVisualizerState(openerIds[i]!, viz.mirror);
          dirty = true;
          return;
        }
      }
    }
  }

  // Quiz mode: answer buttons
  if (state.appMode === 'quiz' && state.quiz.phase === 'showing') {
    if (state.quiz.quizType === 'bag2') {
      // Bag 2: 2 buttons centered, y=430, h=44
      // Each 240px wide, 16px gap, centered in 640px canvas
      const btnW = 240;
      const gap = 16;
      const totalW = state.quiz.routeLabels.length * btnW + (state.quiz.routeLabels.length - 1) * gap;
      const startX = (640 - totalW) / 2;
      if (y >= 430 && y <= 474) {
        for (let i = 0; i < state.quiz.routeLabels.length; i++) {
          const bx = startX + i * (btnW + gap);
          if (x >= bx && x <= bx + btnW) {
            dispatch(`option_${i + 1}`); return;
          }
        }
      }
    } else {
      // Bag 1: 3 buttons
      // Button 1 (Stray): x=120, y=410, 180×44
      // Button 2 (Honey): x=320, y=410, 180×44
      // Button 3 (MS2):   x=170, y=464, 280×44
      if (y >= 410 && y <= 454 && x >= 120 && x <= 300) {
        dispatch('option_1'); return;
      }
      if (y >= 410 && y <= 454 && x >= 320 && x <= 500) {
        dispatch('option_2'); return;
      }
      if (y >= 464 && y <= 508 && x >= 170 && x <= 450) {
        dispatch('option_3'); return;
      }
    }
  }

  // Onboarding selector: 8 stage buttons
  if (state.appMode === 'onboarding' && state.onboardingMenuOpen) {
    const btnW = 280;
    const btnH = 40;
    const gap = 6;
    const sectionGap = 16;
    const headerH = 24;
    const bx = (640 - btnW) / 2;
    let by = 100 + headerH; // after Bag 1 header

    for (let i = 0; i < 8; i++) {
      if (i === 4) {
        by += sectionGap + headerH; // Bag 2 header
      }
      if (x >= bx && x <= bx + btnW && y >= by && y <= by + btnH) {
        selectOnboardingStage(i);
        return;
      }
      by += btnH + gap;
    }
    return;
  }

  // Onboarding drill: Yes/No buttons (same positions as quiz roughly)
  if (state.appMode === 'onboarding' && state.onboarding.stagePhase === 'drill') {
    // Yes button: roughly left half of button area
    // No button: roughly right half
    // From hud: Yes at ~x=120-300, No at ~x=320-500, y=470-514
    if (y >= 470 && y <= 514) {
      if (x >= 120 && x <= 300) { dispatch('option_1'); return; }
      if (x >= 320 && x <= 500) { dispatch('option_2'); return; }
    }
  }
});

requestAnimationFrame(frame);
