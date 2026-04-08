import type { PieceType } from '../core/types.ts';
import type { OpenerID } from '../openers/types.ts';
import { generateBag } from '../core/bag.ts';
import { bestOpener, bestBag2Route, OPENERS } from '../openers/decision.ts';
import { getBag2Routes } from '../openers/bag2-routes.ts';

export interface QuizState {
  phase: 'showing' | 'answered';
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
  currentStreak: number;
  // Quiz type: bag1 (which opener?) or bag2 (which route?)
  quizType: 'bag1' | 'bag2';
  // Bag 2 specific fields
  bag1Opener: OpenerID | null;
  bag1Mirror: boolean;
  bag2Bag: PieceType[] | null;
  correctRouteIndex: number;
  selectedRouteIndex: number | null;
  routeLabels: string[];
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
    currentStreak: 0,
    quizType: 'bag1',
    bag1Opener: null,
    bag1Mirror: false,
    bag2Bag: null,
    correctRouteIndex: 0,
    selectedRouteIndex: null,
    routeLabels: [],
  };
}

export function nextQuestion(state: QuizState): void {
  if (state.quizType === 'bag2') {
    nextBag2Question(state);
  } else {
    nextBag1Question(state);
  }
}

function nextBag1Question(state: QuizState): void {
  const bag = generateBag();
  const result = bestOpener(bag);

  state.currentBag = bag;
  state.correctOpener = result.opener.id;
  state.alternatives = result.alternatives;
  state.mirror = result.mirror;
  state.decisionPieces = result.decisionPieces;
  state.explanation = result.explanation;
  resetQuestionState(state);
}

function nextBag2Question(state: QuizState): void {
  // Generate Bag 1 to determine opener
  const bag1 = generateBag();
  const result = bestOpener(bag1);
  const openerId = result.opener.id;
  const mirror = result.mirror;

  // Generate Bag 2
  const bag2 = generateBag();
  const { routeIndex } = bestBag2Route(openerId, mirror, bag2);
  const routes = getBag2Routes(openerId, mirror);

  state.bag1Opener = openerId;
  state.bag1Mirror = mirror;
  state.bag2Bag = bag2;
  state.currentBag = bag2; // Show Bag 2 pieces to the user
  state.correctRouteIndex = routeIndex;
  state.routeLabels = routes.map(r => r.routeLabel);
  state.correctOpener = openerId; // For display purposes
  state.mirror = mirror;
  state.alternatives = [];
  state.decisionPieces = [];
  state.explanation = '';
  resetQuestionState(state);
}

function resetQuestionState(state: QuizState): void {
  state.phase = 'showing';
  state.selectedOpener = null;
  state.selectedRouteIndex = null;
  state.isCorrect = null;
  state.questionStartTime = performance.now();
  state.responseTimeMs = null;
  state.autoAdvanceAt = null;
}

export function submitAnswer(state: QuizState, opener: OpenerID): void {
  if (state.phase !== 'showing') return;
  if (state.quizType === 'bag2') return; // Bag 2 uses submitBag2Answer

  state.selectedOpener = opener;
  // Only the primary (highest-priority) opener counts as correct.
  // MS2 and Gamushiro are interchangeable (same build condition).
  const isMs2Match =
    (opener === 'ms2' && state.correctOpener === 'gamushiro') ||
    (opener === 'gamushiro' && state.correctOpener === 'ms2');
  state.isCorrect = opener === state.correctOpener || isMs2Match;
  finishAnswer(state);
}

export function submitBag2Answer(state: QuizState, routeIndex: number): void {
  if (state.phase !== 'showing') return;
  if (state.quizType !== 'bag2') return;

  state.selectedRouteIndex = routeIndex;
  state.isCorrect = routeIndex === state.correctRouteIndex;
  finishAnswer(state);
}

function finishAnswer(state: QuizState): void {
  state.responseTimeMs = performance.now() - state.questionStartTime;
  state.phase = 'answered';

  // Update streak
  if (state.isCorrect) {
    state.currentStreak++;
  } else {
    state.currentStreak = 0;
  }

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
