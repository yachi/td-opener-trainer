import type { PieceType } from '../core/types.ts';
import type { OpenerID } from '../openers/types.ts';
import { generateBag } from '../core/bag.ts';
import { bestOpener } from '../openers/decision.ts';

export interface QuizState {
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
}

export function createQuizState(): QuizState {
  return {
    phase: 'showing',
    currentBag: [],
    correctOpener: 'stray_cannon',
    alternatives: [],
    selectedOpener: null,
    isCorrect: null,
    questionStartTime: 0,
    responseTimeMs: null,
    mirror: false,
    decisionPieces: [],
    explanation: '',
    autoAdvanceAt: null,
    mode: 'learning',
  };
}

export function nextQuestion(state: QuizState): void {
  const bag = generateBag();
  const result = bestOpener(bag);

  state.currentBag = bag;
  state.correctOpener = result.opener.id;
  state.alternatives = result.alternatives;
  state.mirror = result.mirror;
  state.decisionPieces = result.decisionPieces;
  state.explanation = result.explanation;
  state.phase = 'showing';
  state.selectedOpener = null;
  state.isCorrect = null;
  state.questionStartTime = performance.now();
  state.responseTimeMs = null;
  state.autoAdvanceAt = null;
}

export function submitAnswer(state: QuizState, opener: OpenerID): void {
  if (state.phase !== 'showing') return;

  state.selectedOpener = opener;
  // Only the primary (highest-priority) opener counts as correct.
  // MS2 and Gamushiro are interchangeable (same build condition).
  const isMs2Match =
    (opener === 'ms2' && state.correctOpener === 'gamushiro') ||
    (opener === 'gamushiro' && state.correctOpener === 'ms2');
  state.isCorrect = opener === state.correctOpener || isMs2Match;
  state.responseTimeMs = performance.now() - state.questionStartTime;
  state.phase = 'answered';

  // Set auto-advance timer based on mode and correctness
  const now = performance.now();
  if (state.mode === 'learning') {
    state.autoAdvanceAt = now + (state.isCorrect ? 450 : 1200);
  } else {
    state.autoAdvanceAt = now + (state.isCorrect ? 300 : 800);
  }
}

/** Returns true if auto-advance triggered (state was mutated to next question). */
export function tickQuiz(state: QuizState): boolean {
  if (state.autoAdvanceAt && performance.now() >= state.autoAdvanceAt) {
    nextQuestion(state);
    return true;
  }
  return false;
}
