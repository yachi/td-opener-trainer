import { createRenderer } from './renderer/canvas.ts';
import type { AppState } from './renderer/canvas.ts';
import { loadQuizStats, saveQuizStats, recordAnswer, getDisplayStats } from './stats/tracker.ts';
import { createQuizState, nextQuestion, submitAnswer, tickQuiz } from './modes/quiz.ts';
import { setupKeyboard } from './input/keyboard.ts';
import type { OpenerID } from './openers/types.ts';
import type { PieceType } from './core/types.ts';
import {
  loadOnboardingProgress,
  saveOnboardingProgress,
  createOnboardingProgress,
  advancePhase,
  checkMastery,
  recordDrillAnswer,
  generateDrillBag,
  getWorkedExamples,
} from './modes/onboarding.ts';
import type { OnboardingProgress } from './modes/onboarding.ts';
import { OPENERS } from './openers/decision.ts';
import {
  getOpenerSequence,
  createVisualizerState,
  stepForward,
  stepBackward,
} from './modes/visualizer.ts';
import type { VisualizerState } from './modes/visualizer.ts';

// ── Extended State ──

interface OnboardingDrill {
  currentBag: PieceType[];
  lastAnswer: boolean | null;
  isCorrect: boolean | null;
  autoAdvanceAt: number | null;
}

interface FullAppState extends AppState {
  appMode: 'onboarding' | 'quiz' | 'visualizer';
  onboarding: OnboardingProgress;
  onboardingDrill: OnboardingDrill;
}

function createOnboardingDrill(): OnboardingDrill {
  return {
    currentBag: [],
    lastAnswer: null,
    isCorrect: null,
    autoAdvanceAt: null,
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
  visualizer: createVisualizerState(getOpenerSequence('ms2', false)),
};

// Debug: expose state to window for inspection
(window as any).__appState = state;

let storedStats = loadQuizStats();
let dirty = true;

// ── Onboarding Helpers ──

function enterDrillPhase(): void {
  const stage = state.onboarding.currentStage;
  if (stage === 'full_quiz' || stage === 'complete') return;
  const bag = generateDrillBag(stage as OpenerID);
  state.onboardingDrill = {
    currentBag: bag,
    lastAnswer: null,
    isCorrect: null,
    autoAdvanceAt: null,
  };
}

function advanceDrill(): void {
  const stage = state.onboarding.currentStage;
  if (stage === 'full_quiz' || stage === 'complete') return;
  const bag = generateDrillBag(stage as OpenerID);
  state.onboardingDrill.currentBag = bag;
  state.onboardingDrill.lastAnswer = null;
  state.onboardingDrill.isCorrect = null;
  state.onboardingDrill.autoAdvanceAt = null;
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
      state.appMode = state.onboarding.currentStage === 'complete' ? 'quiz' : 'onboarding';
      state.mode = state.appMode as any;
    } else {
      state.appMode = 'visualizer';
      state.mode = 'visualizer';
    }
    dirty = true;
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
  const viz = state.visualizer!;
  const openerIds: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'];

  switch (action) {
    case 'advance': // → next step
      stepForward(viz);
      dirty = true;
      break;
    case 'step_back': // ← prev step
      stepBackward(viz);
      dirty = true;
      break;
    case 'option_1': // 1 = MS2
    case 'option_2': // 2 = Honey Cup
    case 'option_3': // 3 = Stray
    case 'option_4': { // 4 = Gamushiro
      const idx = action === 'option_1' ? 0 : action === 'option_2' ? 1 : action === 'option_3' ? 2 : 3;
      const id = openerIds[idx]!;
      state.visualizer = createVisualizerState(getOpenerSequence(id, viz.sequence.mirror));
      dirty = true;
      break;
    }
    case 'toggle_mode': { // M = toggle mirror (reuse S key or add M)
      const seq = getOpenerSequence(viz.sequence.openerId, !viz.sequence.mirror);
      state.visualizer = createVisualizerState(seq);
      dirty = true;
      break;
    }
    case 'reset_stats': // R = reset to step 0
      state.visualizer = createVisualizerState(
        getOpenerSequence(viz.sequence.openerId, viz.sequence.mirror)
      );
      dirty = true;
      break;
  }
}

function skipCurrentStage(): void {
  const { onboarding } = state;
  const stage = onboarding.currentStage;
  if (stage === 'full_quiz' || stage === 'complete') return;

  // Mark current stage as completed and jump to celebration
  const mastery = onboarding.mastery[stage as OpenerID];
  if (mastery) {
    mastery.completed = true;
  }
  onboarding.stagePhase = 'celebration';
  saveOnboardingProgress(onboarding);
  dirty = true;
}

function dispatchOnboarding(action: string): void {
  const { onboarding } = state;

  // Skip stage works from any phase (press N)
  if (action === 'skip_stage') {
    skipCurrentStage();
    return;
  }

  const phase = onboarding.stagePhase;

  switch (phase) {
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
        if (stage === 'full_quiz' || stage === 'complete') break;
        const examples = getWorkedExamples(stage as OpenerID);
        const totalExamples = examples.length;
        const currentExample = examples[onboarding.exampleIndex];
        if (!currentExample) break;

        const totalSteps = currentExample.steps.length;

        if (onboarding.exampleStep < totalSteps - 1) {
          // Advance within current example
          onboarding.exampleStep++;
        } else if (onboarding.exampleIndex < totalExamples - 1) {
          // Move to next example
          onboarding.exampleIndex++;
          onboarding.exampleStep = 0;
        } else {
          // All examples done → advance to drill phase
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
      if (stage === 'full_quiz' || stage === 'complete') break;

      const userAnswer = action === 'option_1'; // option_1 = Yes, option_2 = No
      const isCorrect = recordDrillAnswer(
        onboarding,
        stage as OpenerID,
        userAnswer,
        state.onboardingDrill.currentBag,
      );

      state.onboardingDrill.lastAnswer = userAnswer;
      state.onboardingDrill.isCorrect = isCorrect;

      // Check mastery after recording
      const mastered = checkMastery(onboarding, stage as OpenerID);
      if (mastered) {
        onboarding.mastery[stage as OpenerID]!.completed = true;
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

        // Check if we've moved to full_quiz or complete
        if (
          onboarding.currentStage === 'full_quiz' ||
          onboarding.currentStage === 'complete'
        ) {
          transitionToQuiz();
        } else {
          saveOnboardingProgress(onboarding);
          dirty = true;
        }
      }
      break;
    }
  }
}

function dispatchQuiz(action: string): void {
  switch (action) {
    case 'option_1':
    case 'option_2':
    case 'option_3': {
      if (state.quiz.phase !== 'showing') return;
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
      storedStats = recordAnswer(storedStats, picked, state.quiz.isCorrect!, state.quiz.responseTimeMs!);
      saveQuizStats(storedStats);
      state.stats = getDisplayStats(storedStats);
      dirty = true;
      break;
    }
    case 'advance': {
      if (state.quiz.phase === 'answered') {
        nextQuestion(state.quiz);
        dirty = true;
      }
      break;
    }
    case 'toggle_mode': {
      state.quiz.mode = state.quiz.mode === 'learning' ? 'speed' : 'learning';
      dirty = true;
      break;
    }
    case 'reset_stats': {
      storedStats = { version: 1, total: 0, correct: 0, byOpener: {} as any, responseTimes: [], bestStreak: 0 };
      saveQuizStats(storedStats);
      state.stats = getDisplayStats(storedStats);
      dirty = true;
      break;
    }
  }
}

// ── Render Loop ──

function frame(): void {
  // Auto-advance for quiz answers
  if (state.appMode === 'quiz' && state.quiz.phase === 'answered') {
    if (tickQuiz(state.quiz)) {
      dirty = true;
    }
  }

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
const cleanup = setupKeyboard(dispatch);

// Click handling — tabs, buttons, opener selectors
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Tab bar: y 0-40, three equal tabs across 640px
  if (y <= 40) {
    const tabIndex = Math.floor(x / (640 / 3));
    if (tabIndex === 0) {
      // Quiz tab — goes to quiz (if complete) or onboarding
      if (state.onboarding.currentStage === 'complete') {
        state.appMode = 'quiz';
        state.mode = 'quiz' as any;
        if (state.quiz.currentBag.length === 0) nextQuestion(state.quiz);
      } else {
        state.appMode = 'onboarding';
        state.mode = 'onboarding' as any;
      }
      dirty = true;
    } else if (tabIndex === 1) {
      // Visualizer tab — always accessible
      state.appMode = 'visualizer' as any;
      state.mode = 'visualizer';
      dirty = true;
    }
    // tabIndex === 2 → Drill (not implemented yet)
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
          state.visualizer = createVisualizerState(
            getOpenerSequence(openerIds[i]!, viz.sequence.mirror)
          );
          dirty = true;
          return;
        }
      }
    }
  }

  // Quiz mode: answer buttons
  if (state.appMode === 'quiz' && state.quiz.phase === 'showing') {
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
