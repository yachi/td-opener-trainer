import type { PieceType } from '../core/types.ts';
import type { OpenerID } from '../openers/types.ts';
import { generateBag } from '../core/bag.ts';
import { bestOpener } from '../openers/decision.ts';

export interface QuizState {
  phase: 'showing' | 'answered';
  currentBag: PieceType[];
  correctOpener: OpenerID;
  alternatives: OpenerID[];
  selectedOpener: OpenerID | null;
  isCorrect: boolean | null;
  questionStartTime: number;
  responseTimeMs: number | null;
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
  };
}

export function nextQuestion(state: QuizState): void {
  const bag = generateBag();
  const result = bestOpener(bag);

  state.currentBag = bag;
  state.correctOpener = result.opener.id;
  state.alternatives = result.alternatives;
  state.phase = 'showing';
  state.selectedOpener = null;
  state.isCorrect = null;
  state.questionStartTime = performance.now();
  state.responseTimeMs = null;
}

export function submitAnswer(state: QuizState, opener: OpenerID): void {
  if (state.phase !== 'showing') return;

  state.selectedOpener = opener;
  state.isCorrect =
    opener === state.correctOpener || state.alternatives.includes(opener);
  state.responseTimeMs = performance.now() - state.questionStartTime;
  state.phase = 'answered';
}
