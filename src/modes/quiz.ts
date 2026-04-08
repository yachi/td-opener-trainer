import type { PieceType } from '../core/types.ts';
import type { OpenerID } from '../openers/types.ts';
import { generateBag } from '../core/bag.ts';
import { bestOpener, bestBag2Route, OPENERS, indexOf } from '../openers/decision.ts';
import { getBag2Routes } from '../openers/bag2-routes.ts';

/** Snapshot of a completed question for back-navigation. */
export interface PreviousQuestion {
  currentBag: PieceType[];
  correctOpener: OpenerID;
  alternatives: OpenerID[];
  selectedOpener: OpenerID | null;
  isCorrect: boolean;
  mirror: boolean;
  decisionPieces: PieceType[];
  explanation: string;
  quizType: 'bag1' | 'bag2';
  bag1Opener: OpenerID | null;
  bag1Mirror: boolean;
  bag2Bag: PieceType[] | null;
  correctRouteIndex: number;
  selectedRouteIndex: number;
  routeLabels: string[];
}

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
  // Back navigation (1-deep history)
  previousQuestion: PreviousQuestion | null;
  reviewingPrevious: boolean;
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
    currentStreak: 0,
    quizType: 'bag1',
    bag1Opener: null,
    bag1Mirror: false,
    bag2Bag: null,
    correctRouteIndex: 0,
    selectedRouteIndex: null,
    routeLabels: [],
    previousQuestion: null,
    reviewingPrevious: false,
  };
}

export function nextQuestion(state: QuizState): void {
  // Save current answered question as previous (for back navigation)
  if (state.phase === 'answered' && state.isCorrect !== null) {
    state.previousQuestion = {
      currentBag: state.currentBag,
      correctOpener: state.correctOpener,
      alternatives: state.alternatives,
      selectedOpener: state.selectedOpener,
      isCorrect: state.isCorrect,
      mirror: state.mirror,
      decisionPieces: state.decisionPieces,
      explanation: state.explanation,
      quizType: state.quizType,
      bag1Opener: state.bag1Opener,
      bag1Mirror: state.bag1Mirror,
      bag2Bag: state.bag2Bag,
      correctRouteIndex: state.correctRouteIndex,
      selectedRouteIndex: state.selectedRouteIndex ?? 0,
      routeLabels: state.routeLabels,
    };
  }
  state.reviewingPrevious = false;

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
  // Bag 2 explanation is generated after answering (needs selected route)
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

  // Generate Bag 2 explanation after answering
  if (state.quizType === 'bag2' && state.bag2Bag) {
    state.explanation = generateBag2Explanation(state);
  }
}

/** Generate explanation for Bag 2 route selection. */
function generateBag2Explanation(state: QuizState): string {
  const routes = getBag2Routes(state.correctOpener, state.mirror);
  const correctRoute = routes[state.correctRouteIndex];
  if (!correctRoute) return '';

  // Default route — no condition pieces to explain
  if (correctRoute.conditionLabel === 'Default') {
    return `No special condition met → ${correctRoute.routeLabel}`;
  }

  // Parse condition to find relevant pieces and show their positions
  const bag = state.bag2Bag!;
  const condLabel = correctRoute.conditionLabel;
  // Extract piece letters from condition (e.g., "S before J" → S, J)
  const pieceLetters = condLabel.match(/[IJLOSTZ]/g) ?? [];
  const posInfo = pieceLetters
    .map(p => {
      const idx = indexOf(bag, p as PieceType);
      const pos = idx === Infinity ? '?' : `${idx + 1}`;
      return `${p}@${pos}`;
    })
    .join(', ');

  return `${posInfo} → ${condLabel} → ${correctRoute.routeLabel}`;
}
