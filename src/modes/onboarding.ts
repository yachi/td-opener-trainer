import type { PieceType } from '../core/types';
import { generateBag } from '../core/bag';
import type { OpenerID } from '../openers/types';
import { OPENERS, DECISION_PIECES } from '../openers/decision';

// ── Types ──

export interface OnboardingProgress {
  version: 2;
  currentStage: 'ms2' | 'honey_cup' | 'stray_cannon' | 'full_quiz' | 'complete';
  stagePhase: 'rule_card' | 'examples' | 'drill' | 'celebration';
  exampleIndex: number;
  exampleStep: number;
  mastery: Record<OpenerID, MasteryRecord>;
  placementTestTaken: boolean;
  lastActiveAt: number;
}

interface MasteryRecord {
  total: number;
  correct: number;
  completed: boolean;
  history: boolean[];
}

export interface WorkedExampleStep {
  instruction: string;
  highlight?: PieceType[];
}

export interface WorkedExample {
  bag: PieceType[];
  expectedAnswer: boolean;
  explanation: string;
  decisionPieces: PieceType[];
  steps: WorkedExampleStep[];
}

export interface PlacementQuestion {
  bag: PieceType[];
  openerId: OpenerID;
  correctAnswer: boolean;
}

export interface PlacementResult {
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  questions: PlacementQuestion[];
}

// ── Stage Order ──

const STAGE_ORDER: Array<OnboardingProgress['currentStage']> = [
  'ms2',
  'honey_cup',
  'stray_cannon',
  'full_quiz',
  'complete',
];

// ── State Management ──

function createMasteryRecord(): MasteryRecord {
  return { total: 0, correct: 0, completed: false, history: [] };
}

export function createOnboardingProgress(): OnboardingProgress {
  return {
    version: 2,
    currentStage: 'ms2',
    stagePhase: 'rule_card',
    exampleIndex: 0,
    exampleStep: 0,
    mastery: {
      ms2: createMasteryRecord(),
      honey_cup: createMasteryRecord(),
      stray_cannon: createMasteryRecord(),
      gamushiro: createMasteryRecord(),
    },
    placementTestTaken: false,
    lastActiveAt: Date.now(),
  };
}

export function advancePhase(progress: OnboardingProgress): void {
  progress.lastActiveAt = Date.now();

  // Special handling for full_quiz and complete stages
  if (progress.currentStage === 'full_quiz') {
    progress.currentStage = 'complete';
    return;
  }
  if (progress.currentStage === 'complete') {
    return;
  }

  switch (progress.stagePhase) {
    case 'rule_card':
      progress.stagePhase = 'examples';
      break;
    case 'examples':
      progress.stagePhase = 'drill';
      break;
    case 'drill': {
      // Only advance to celebration if mastery is completed for the current stage
      const stage = progress.currentStage;
      if (progress.mastery[stage]?.completed) {
        progress.stagePhase = 'celebration';
      }
      // Otherwise stay in drill
      break;
    }
    case 'celebration': {
      // Move to the next stage
      const idx = STAGE_ORDER.indexOf(progress.currentStage);
      if (idx >= 0 && idx < STAGE_ORDER.length - 1) {
        progress.currentStage = STAGE_ORDER[idx + 1]!;
        progress.stagePhase = 'rule_card';
        progress.exampleIndex = 0;
        progress.exampleStep = 0;
      }
      break;
    }
  }
}

// ── Mastery Detection ──

export function checkMastery(
  progress: OnboardingProgress,
  openerId: OpenerID,
  opts?: { windowSize?: number; threshold?: number },
): boolean {
  const windowSize = opts?.windowSize ?? 6;
  const threshold = opts?.threshold ?? 5;
  const record = progress.mastery[openerId];
  if (!record) return false;

  const { history } = record;
  if (history.length < windowSize) return false;

  const window = history.slice(-windowSize);
  const correctCount = window.filter(Boolean).length;
  return correctCount >= threshold;
}

// ── Drill Answer Recording ──

export function recordDrillAnswer(
  progress: OnboardingProgress,
  openerId: OpenerID,
  answer: boolean,
  bag?: PieceType[],
): boolean {
  let isCorrect: boolean;

  if (bag) {
    const def = OPENERS[openerId];
    const actuallyBuildable = def.canBuild(bag) || def.canBuildMirror(bag);
    isCorrect = answer === actuallyBuildable;
  } else {
    // No bag provided — treat the answer as pre-computed correctness
    isCorrect = answer;
  }

  const record = progress.mastery[openerId];
  if (record) {
    record.total++;
    if (isCorrect) record.correct++;
    record.history.push(isCorrect);
  }

  return isCorrect;
}

// ── Worked Examples ──

const WORKED_EXAMPLES: Record<string, WorkedExample[]> = {
  ms2: [
    {
      // Positive: J before S → buildable
      bag: ['J', 'I', 'S', 'O', 'T', 'Z', 'L'] as PieceType[],
      expectedAnswer: true,
      explanation:
        'J appears at position 1 and S at position 3. Since J comes before S, MS2 is buildable.',
      decisionPieces: ['J', 'S'] as PieceType[],
      steps: [
        { instruction: 'Find J and S in the bag', highlight: ['J', 'S'] as PieceType[] },
        { instruction: 'Check their order: J is at position 1, S is at position 3' },
        { instruction: 'J comes before S → MS2 is buildable ✓' },
      ],
    },
    {
      // Negative: S before J → not buildable, and Z before L → mirror not buildable
      bag: ['S', 'Z', 'I', 'J', 'L', 'O', 'T'] as PieceType[],
      expectedAnswer: false,
      explanation:
        'S appears at position 1 and J at position 4. Since S comes before J, MS2 is NOT buildable. Mirror: Z(2) before L(5), also not buildable.',
      decisionPieces: ['J', 'S'] as PieceType[],
      steps: [
        { instruction: 'Find J and S in the bag', highlight: ['J', 'S'] as PieceType[] },
        { instruction: 'Check their order: S is at position 1, J is at position 4' },
        { instruction: 'S comes before J → MS2 is NOT buildable ✗' },
      ],
    },
    {
      // Guided: another positive case
      bag: ['T', 'J', 'O', 'I', 'S', 'L', 'Z'] as PieceType[],
      expectedAnswer: true,
      explanation:
        'J appears at position 2 and S at position 5. J comes before S, so MS2 is buildable.',
      decisionPieces: ['J', 'S'] as PieceType[],
      steps: [
        { instruction: 'Find J and S in the bag', highlight: ['J', 'S'] as PieceType[] },
        { instruction: 'Check their order: J is at position 2, S is at position 5' },
        { instruction: 'J comes before S → MS2 is buildable ✓' },
      ],
    },
  ],
  honey_cup: [
    {
      // Positive: L not last of L/O/T → buildable
      bag: ['L', 'I', 'S', 'O', 'T', 'Z', 'J'] as PieceType[],
      expectedAnswer: true,
      explanation:
        'L is at position 1, O at 4, T at 5. L is NOT the last among L/O/T, so Honey Cup is buildable.',
      decisionPieces: ['L', 'O', 'T'] as PieceType[],
      steps: [
        { instruction: 'Find L, O, and T in the bag', highlight: ['L', 'O', 'T'] as PieceType[] },
        { instruction: 'Check positions: L(1), O(4), T(5)' },
        { instruction: 'L is NOT last among L/O/T → Honey Cup is buildable ✓' },
      ],
    },
    {
      // Negative: L last of L/O/T, J last of J/O/T → neither buildable
      bag: ['O', 'T', 'S', 'Z', 'I', 'J', 'L'] as PieceType[],
      expectedAnswer: false,
      explanation:
        'L is at position 7 (last among L/O/T). Mirror: J is at position 6 (last among J/O/T). Neither side is buildable.',
      decisionPieces: ['L', 'O', 'T'] as PieceType[],
      steps: [
        { instruction: 'Find L, O, and T in the bag', highlight: ['L', 'O', 'T'] as PieceType[] },
        { instruction: 'Check positions: O(1), T(2), L(7)' },
        { instruction: 'L IS the last among L/O/T → Honey Cup is NOT buildable ✗' },
      ],
    },
    {
      // Guided: positive via normal
      bag: ['T', 'L', 'I', 'O', 'S', 'Z', 'J'] as PieceType[],
      expectedAnswer: true,
      explanation:
        'L is at position 2, O at 4, T at 1. L is NOT the last among L/O/T, so Honey Cup is buildable.',
      decisionPieces: ['L', 'O', 'T'] as PieceType[],
      steps: [
        { instruction: 'Find L, O, and T in the bag', highlight: ['L', 'O', 'T'] as PieceType[] },
        { instruction: 'Check positions: T(1), L(2), O(4)' },
        { instruction: 'L is NOT last among L/O/T → Honey Cup is buildable ✓' },
      ],
    },
  ],
  stray_cannon: [
    {
      // Positive: L not last of L/J/S → buildable
      bag: ['L', 'J', 'I', 'S', 'O', 'T', 'Z'] as PieceType[],
      expectedAnswer: true,
      explanation:
        'L is at position 1, J at 2, S at 4. L is NOT the last among L/J/S, so Stray Cannon is buildable.',
      decisionPieces: ['L', 'J', 'S'] as PieceType[],
      steps: [
        { instruction: 'Find L, J, and S in the bag', highlight: ['L', 'J', 'S'] as PieceType[] },
        { instruction: 'Check positions: L(1), J(2), S(4)' },
        { instruction: 'L is NOT last among L/J/S → Stray Cannon is buildable ✓' },
      ],
    },
    {
      // Negative (normal side): L last of L/J/S → normal side fails
      // Note: mirror side (J not last of J/L/Z) will still work, but this
      // example teaches the normal-side rule check
      bag: ['J', 'S', 'Z', 'I', 'O', 'T', 'L'] as PieceType[],
      expectedAnswer: false,
      explanation:
        'L is at position 7 (last among L/J/S). Normal side is NOT buildable. (Mirror side would work, but we check normal first.)',
      decisionPieces: ['L', 'J', 'S'] as PieceType[],
      steps: [
        { instruction: 'Find L, J, and S in the bag', highlight: ['L', 'J', 'S'] as PieceType[] },
        { instruction: 'Check positions: J(1), S(2), L(7)' },
        { instruction: 'L IS last among L/J/S → Stray Cannon normal side NOT buildable ✗' },
      ],
    },
    {
      // Guided: positive
      bag: ['S', 'L', 'I', 'J', 'O', 'T', 'Z'] as PieceType[],
      expectedAnswer: true,
      explanation:
        'L is at position 2, J at 4, S at 1. L is NOT the last among L/J/S, so Stray Cannon is buildable.',
      decisionPieces: ['L', 'J', 'S'] as PieceType[],
      steps: [
        { instruction: 'Find L, J, and S in the bag', highlight: ['L', 'J', 'S'] as PieceType[] },
        { instruction: 'Check positions: S(1), L(2), J(4)' },
        { instruction: 'L is NOT last among L/J/S → Stray Cannon is buildable ✓' },
      ],
    },
  ],
};

export function getWorkedExamples(openerId: OpenerID): WorkedExample[] {
  return WORKED_EXAMPLES[openerId] ?? [];
}

// ── Drill Bag Generation ──

export function generateDrillBag(openerId: OpenerID): PieceType[] {
  const def = OPENERS[openerId];

  // Target: ~40% non-buildable bags for good drill variety
  // Use rejection sampling to ensure distribution
  const wantNonBuildable = Math.random() < 0.4;

  for (let attempt = 0; attempt < 200; attempt++) {
    const bag = generateBag();
    const buildable = def.canBuild(bag) || def.canBuildMirror(bag);

    if (wantNonBuildable && !buildable) return bag;
    if (!wantNonBuildable && buildable) return bag;
  }

  // Fallback: return any bag if rejection sampling exhausted
  return generateBag();
}

// ── Placement Test ──

export function runPlacementTest(
  openerId: OpenerID,
  answers: boolean[],
): PlacementResult {
  const def = OPENERS[openerId];
  const questions: PlacementQuestion[] = [];
  let correctCount = 0;

  for (let i = 0; i < 5; i++) {
    const bag = generateBag();
    const actuallyBuildable = def.canBuild(bag) || def.canBuildMirror(bag);
    // answers[i] represents whether the user answered correctly (true = correct)
    const isCorrect = answers[i] ?? false;
    if (isCorrect) correctCount++;

    questions.push({
      bag,
      openerId,
      correctAnswer: actuallyBuildable,
    });
  }

  return {
    passed: correctCount >= 4,
    correctCount,
    totalQuestions: 5,
    questions,
  };
}

// ── Persistence ──

const STORAGE_KEY = 'onboarding_progress';

export function saveOnboardingProgress(progress: OnboardingProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Silently fail if localStorage unavailable
  }
}

export function loadOnboardingProgress(): OnboardingProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createOnboardingProgress();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2) return createOnboardingProgress();
    return parsed as OnboardingProgress;
  } catch {
    return createOnboardingProgress();
  }
}
