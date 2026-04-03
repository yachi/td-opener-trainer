import { bestOpener } from './openers/decision.ts';
import { OPENERS } from './openers/decision.ts';
import { OPENER_ORDER } from './openers/types.ts';
import { createRenderer } from './renderer/canvas.ts';
import type { AppState } from './renderer/canvas.ts';
import { loadQuizStats, saveQuizStats, recordAnswer, getDisplayStats } from './stats/tracker.ts';
import { createQuizState, nextQuestion, submitAnswer, tickQuiz } from './modes/quiz.ts';
import { setupKeyboard } from './input/keyboard.ts';
import type { OpenerID } from './openers/types.ts';

// ── State ──

const state: AppState = {
  mode: 'quiz',
  quiz: createQuizState(),
  stats: getDisplayStats(loadQuizStats()),
};

let storedStats = loadQuizStats();
let dirty = true;

// ── Dispatcher ──

function dispatch(action: string): void {
  switch (action) {
    case 'pick_stray_cannon':
    case 'pick_honey_cup':
    case 'pick_gamushiro':
    case 'pick_ms2': {
      if (state.quiz.phase !== 'showing') return;
      const openerMap: Record<string, OpenerID> = {
        pick_stray_cannon: 'stray_cannon',
        pick_honey_cup: 'honey_cup',
        pick_gamushiro: 'ms2',  // Gamushiro merged into MS2 button
        pick_ms2: 'ms2',
      };
      let picked = openerMap[action]!;

      // When user picks 'ms2', accept if the correct answer is 'gamushiro'
      // (MS2 and Gamushiro share the same condition, merged for quiz purposes)
      if (picked === 'ms2') {
        if (state.quiz.correctOpener === 'gamushiro') {
          picked = 'gamushiro';
        }
      }

      submitAnswer(state.quiz, picked);
      storedStats = recordAnswer(storedStats, picked, state.quiz.isCorrect!, state.quiz.responseTimeMs!);
      saveQuizStats(storedStats);
      state.stats = getDisplayStats(storedStats);
      dirty = true;
      break;
    }
    case 'next_question': {
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
  if (state.quiz.phase === 'answered') {
    if (tickQuiz(state.quiz)) {
      dirty = true;
    }
  }
  if (dirty) {
    renderer.render(state);
    dirty = false;
  }
  requestAnimationFrame(frame);
}

// ── Extra Key Handling ──
// keyboard.ts cannot be modified, so we add supplemental key handling here
// for keys not in the original keyMap (KeyS for toggle_mode).
// We also intercept Digit3 → pick_ms2 (was pick_gamushiro) and suppress Digit4.

function setupExtraKeys(): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.code === 'KeyS') {
      e.preventDefault();
      dispatch('toggle_mode');
    }
  }
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

// ── Init ──

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
nextQuestion(state.quiz);
dirty = true;
const cleanup = setupKeyboard(dispatch);
const cleanupExtra = setupExtraKeys();
requestAnimationFrame(frame);
