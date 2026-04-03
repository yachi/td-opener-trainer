import { bestOpener } from './openers/decision.ts';
import { OPENERS } from './openers/decision.ts';
import { OPENER_ORDER } from './openers/types.ts';
import { createRenderer } from './renderer/canvas.ts';
import type { AppState } from './renderer/canvas.ts';
import { loadQuizStats, saveQuizStats, recordAnswer, getDisplayStats } from './stats/tracker.ts';
import { createQuizState, nextQuestion, submitAnswer } from './modes/quiz.ts';
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
        pick_gamushiro: 'gamushiro',
        pick_ms2: 'ms2',
      };
      const picked = openerMap[action]!;
      submitAnswer(state.quiz, picked);
      storedStats = recordAnswer(storedStats, picked, state.quiz.isCorrect!, state.quiz.responseTimeMs!);
      saveQuizStats(storedStats);
      state.stats = getDisplayStats(storedStats);
      dirty = true;
      break;
    }
    case 'next_question': {
      if (state.quiz.phase !== 'answered') return;
      nextQuestion(state.quiz);
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
  if (dirty) {
    renderer.render(state);
    dirty = false;
  }
  requestAnimationFrame(frame);
}

// ── Init ──

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
nextQuestion(state.quiz);
dirty = true;
const cleanup = setupKeyboard(dispatch);
requestAnimationFrame(frame);
