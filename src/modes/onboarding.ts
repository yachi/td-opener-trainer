import type { PieceType } from '../core/types';
import { generateBag } from '../core/bag';
import type { OpenerID } from '../openers/types';
import { OPENERS, DECISION_PIECES, indexOf } from '../openers/decision';

// ── Types ──

export interface OnboardingProgress {
  version: 2;
  currentStage: OpenerID | 'complete';
  stagePhase: 'shape_preview' | 'rule_card' | 'examples' | 'drill' | 'celebration';
  exampleIndex: number;
  exampleStep: number;
  mastery: Record<OpenerID, MasteryRecord>;
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

// ── Stage Order ──
// This is the ONLY place to add a new opener to onboarding.

export const STAGE_ORDER: OpenerID[] = [
  'ms2',
  'honey_cup',
  'stray_cannon',
  'gamushiro',
];

// ── State Management ──

function createMasteryRecord(): MasteryRecord {
  return { total: 0, correct: 0, completed: false, history: [] };
}

export function createOnboardingProgress(): OnboardingProgress {
  const mastery = {} as Record<OpenerID, MasteryRecord>;
  for (const id of STAGE_ORDER) {
    mastery[id] = createMasteryRecord();
  }
  return {
    version: 2,
    currentStage: STAGE_ORDER[0]!,
    stagePhase: 'shape_preview',
    exampleIndex: 0,
    exampleStep: 0,
    mastery,
    lastActiveAt: Date.now(),
  };
}

export function advancePhase(progress: OnboardingProgress): void {
  progress.lastActiveAt = Date.now();

  if (progress.currentStage === 'complete') {
    return;
  }

  switch (progress.stagePhase) {
    case 'shape_preview':
      progress.stagePhase = 'rule_card';
      break;
    case 'rule_card':
      progress.stagePhase = 'examples';
      break;
    case 'examples':
      progress.stagePhase = 'drill';
      break;
    case 'drill': {
      // Only advance to celebration if mastery is completed for the current stage
      const stage = progress.currentStage as OpenerID;
      if (progress.mastery[stage]?.completed) {
        progress.stagePhase = 'celebration';
      }
      // Otherwise stay in drill
      break;
    }
    case 'celebration': {
      // Move to the next stage or complete
      const idx = STAGE_ORDER.indexOf(progress.currentStage as OpenerID);
      if (idx >= 0 && idx < STAGE_ORDER.length - 1) {
        progress.currentStage = STAGE_ORDER[idx + 1]!;
        progress.stagePhase = 'shape_preview';
        progress.exampleIndex = 0;
        progress.exampleStep = 0;
      } else {
        // Last opener → complete
        progress.currentStage = 'complete';
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

// ── Drill Helpers ──

/**
 * Determine if a bag is "buildable" for drill purposes.
 * For openers that are always buildable with mirror (100% rate),
 * check normal-side only to create meaningful yes/no variation.
 */
export function isBuildableForDrill(openerId: OpenerID, bag: PieceType[]): boolean {
  const def = OPENERS[openerId];
  return def.setupRate.withMirror >= 1.0
    ? def.canBuild(bag)
    : def.canBuild(bag) || def.canBuildMirror(bag);
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
    isCorrect = answer === isBuildableForDrill(openerId, bag);
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

// ── Worked Examples (generated from seed bags) ──

// Seed bags per opener: [positive, negative, edge case]
// These are the ONLY hardcoded data — everything else is derived.
const EXAMPLE_BAGS: Record<OpenerID, PieceType[][]> = {
  ms2: [
    ['J', 'I', 'S', 'O', 'T', 'Z', 'L'],  // J before L → buildable
    ['L', 'I', 'S', 'O', 'T', 'Z', 'J'],  // L before J → normal fails
    ['T', 'J', 'O', 'I', 'S', 'L', 'Z'],  // J(2) before L(6) → buildable
  ],
  honey_cup: [
    ['L', 'I', 'S', 'O', 'T', 'Z', 'J'],  // L not last of L/O/T → buildable
    ['O', 'T', 'S', 'Z', 'I', 'J', 'L'],  // L last, J last → neither side works
    ['T', 'L', 'I', 'O', 'S', 'Z', 'J'],  // L(2) not last → buildable
  ],
  stray_cannon: [
    ['L', 'J', 'I', 'S', 'O', 'T', 'Z'],  // L not last of L/J/S → buildable
    ['J', 'S', 'Z', 'I', 'O', 'T', 'L'],  // L last → normal fails
    ['S', 'L', 'I', 'J', 'O', 'T', 'Z'],  // L(2) not last → buildable
  ],
  gamushiro: [
    ['J', 'I', 'S', 'O', 'T', 'Z', 'L'],  // J before L → buildable
    ['L', 'I', 'S', 'O', 'T', 'Z', 'J'],  // L before J → normal fails
    ['T', 'J', 'O', 'I', 'S', 'L', 'Z'],  // J(2) before L(6) → buildable
  ],
};

function generateWorkedExample(openerId: OpenerID, bag: PieceType[]): WorkedExample {
  const decision = DECISION_PIECES[openerId];
  const pieces = decision.pieces;
  const def = OPENERS[openerId];
  const buildable = isBuildableForDrill(openerId, bag);

  // Position info for each decision piece
  const positions = pieces.map(p => ({ piece: p, pos: indexOf(bag, p) + 1 }));
  const posStr = positions.map(p => `${p.piece}(${p.pos})`).join(', ');

  // Step 2: describe positions
  const step2 = `Check positions: ${posStr}`;

  // Step 3: conclusion based on rule type
  let step3: string;
  const openerName = def.nameEn;
  if (openerId === 'ms2' || openerId === 'gamushiro') {
    // "before" rule
    const [a, b] = positions;
    if (def.canBuild(bag)) {
      step3 = `${a!.piece} comes first → hold ${def.holdPiece} → ${openerName} buildable ✓`;
    } else {
      step3 = `${b!.piece} comes first → normal side NOT buildable ✗ (use mirror instead)`;
    }
  } else {
    // "not last" rule
    const keyPiece = positions[0]!;
    const isLast = !def.canBuild(bag);
    if (!isLast) {
      step3 = `${keyPiece.piece} is NOT last among ${pieces.join('/')} → ${openerName} is buildable ✓`;
    } else {
      step3 = `${keyPiece.piece} IS last among ${pieces.join('/')} → ${openerName} ${buildable ? 'mirror side works' : 'is NOT buildable'} ✗`;
    }
  }

  // Explanation (longer form)
  const explanation = buildable
    ? `${posStr}. ${decision.rule} → ${openerName} is buildable.`
    : `${posStr}. Rule not satisfied → normal side not buildable.`;

  return {
    bag,
    expectedAnswer: buildable,
    explanation,
    decisionPieces: pieces,
    steps: [
      { instruction: `Find ${pieces.join(' and ')} in the bag`, highlight: [...pieces] },
      { instruction: step2 },
      { instruction: step3 },
    ],
  };
}

export function getWorkedExamples(openerId: OpenerID): WorkedExample[] {
  const bags = EXAMPLE_BAGS[openerId];
  if (!bags) return [];
  return bags.map(bag => generateWorkedExample(openerId, bag));
}

// ── Drill Bag Generation ──

export function generateDrillBag(openerId: OpenerID): PieceType[] {
  // Target: ~40% non-buildable bags for good drill variety
  const wantNonBuildable = Math.random() < 0.4;

  for (let attempt = 0; attempt < 200; attempt++) {
    const bag = generateBag();
    const buildable = isBuildableForDrill(openerId, bag);

    if (wantNonBuildable && !buildable) return bag;
    if (!wantNonBuildable && buildable) return bag;
  }

  // Fallback: return any bag if rejection sampling exhausted
  return generateBag();
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
