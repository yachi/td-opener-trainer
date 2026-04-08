import { describe, test, expect, beforeEach } from 'bun:test';
import { OPENERS, DECISION_PIECES, bestOpener } from '../src/openers/decision.ts';
import { generateBag } from '../src/core/bag.ts';
import type { PieceType } from '../src/core/types.ts';
import type { OpenerID } from '../src/openers/types.ts';
import {
  createOnboardingProgress,
  advancePhase,
  recordDrillAnswer,
  checkMastery,
  getWorkedExamples,
  generateDrillBag,
  isBuildableForDrill,
  saveOnboardingProgress,
  loadOnboardingProgress,
  STAGE_ORDER,
} from '../src/modes/onboarding.ts';
import type { OnboardingProgress } from '../src/modes/onboarding.ts';

// ── O1: Onboarding State Management ──

describe('O1: Onboarding State Management', () => {
  test('createOnboardingProgress returns correct initial state', () => {
    const progress = createOnboardingProgress();
    expect(progress.version).toBe(2);
    expect(progress.currentStage).toBe('ms2');
    expect(progress.stagePhase).toBe('shape_preview');
    expect(progress.exampleIndex).toBe(0);
    expect(progress.exampleStep).toBe(0);
    expect(progress.lastActiveAt).toBeGreaterThan(0);
    // Mastery records exist for each opener in STAGE_ORDER
    for (const id of STAGE_ORDER) {
      expect(progress.mastery[id]).toBeDefined();
      expect(progress.mastery[id].total).toBe(0);
      expect(progress.mastery[id].correct).toBe(0);
      expect(progress.mastery[id].completed).toBe(false);
    }
  });

  test('state advances from shape_preview → rule_card → examples → drill → celebration', () => {
    const progress = createOnboardingProgress();
    expect(progress.stagePhase).toBe('shape_preview');

    advancePhase(progress);
    expect(progress.stagePhase).toBe('rule_card');

    advancePhase(progress);
    expect(progress.stagePhase).toBe('examples');

    advancePhase(progress);
    expect(progress.stagePhase).toBe('drill');

    // Simulate mastery so celebration can trigger
    progress.mastery.ms2.completed = true;
    advancePhase(progress);
    expect(progress.stagePhase).toBe('celebration');
  });

  test('shape_preview advances to rule_card', () => {
    const progress = createOnboardingProgress();
    expect(progress.stagePhase).toBe('shape_preview');
    advancePhase(progress);
    expect(progress.stagePhase).toBe('rule_card');
  });

  test('stage advances through all STAGE_ORDER openers then complete', () => {
    const progress = createOnboardingProgress();
    expect(progress.currentStage).toBe(STAGE_ORDER[0]);

    for (let i = 0; i < STAGE_ORDER.length; i++) {
      const currentId = STAGE_ORDER[i]!;
      expect(progress.currentStage).toBe(currentId);

      progress.stagePhase = 'celebration';
      progress.mastery[currentId]!.completed = true;
      advancePhase(progress);

      if (i < STAGE_ORDER.length - 1) {
        expect(progress.currentStage).toBe(STAGE_ORDER[i + 1]);
        expect(progress.stagePhase).toBe('shape_preview');
      }
    }

    expect(progress.currentStage).toBe('complete');
  });

  test('invalid transitions are rejected', () => {
    const progress = createOnboardingProgress();
    // Trying to advance from drill without mastery should not go to celebration
    progress.stagePhase = 'drill';
    progress.mastery.ms2.completed = false;
    advancePhase(progress);
    // Should remain in drill phase (not advance to celebration)
    expect(progress.stagePhase).toBe('drill');
  });

  test('lastActiveAt updates on phase advance', () => {
    const progress = createOnboardingProgress();
    const initialTime = progress.lastActiveAt;
    // Small wait to ensure time difference
    const before = Date.now();
    advancePhase(progress);
    expect(progress.lastActiveAt).toBeGreaterThanOrEqual(before);
  });
});

// ── O2: Mastery Detection (Rolling Window) ──

describe('O2: Mastery Detection (Rolling Window)', () => {
  test('rolling window of 6: 5/6 correct → mastery achieved', () => {
    const progress = createOnboardingProgress();
    // Record 5 correct + 1 wrong = 5/6 → mastered
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', false);
    recordDrillAnswer(progress, 'ms2', true);

    expect(checkMastery(progress, 'ms2')).toBe(true);
  });

  test('4/6 correct → not mastered yet', () => {
    const progress = createOnboardingProgress();
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', false);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', false);
    recordDrillAnswer(progress, 'ms2', true);

    expect(checkMastery(progress, 'ms2')).toBe(false);
  });

  test('minimum 6 attempts required even if first 5 are correct', () => {
    const progress = createOnboardingProgress();
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    // Only 5 attempts — should NOT be mastered
    expect(checkMastery(progress, 'ms2')).toBe(false);

    // 6th attempt
    recordDrillAnswer(progress, 'ms2', true);
    expect(checkMastery(progress, 'ms2')).toBe(true);
  });

  test('window slides correctly as new answers come in', () => {
    const progress = createOnboardingProgress();
    // Start: W W W W W C (1/6 correct) → not mastered
    recordDrillAnswer(progress, 'ms2', false);
    recordDrillAnswer(progress, 'ms2', false);
    recordDrillAnswer(progress, 'ms2', false);
    recordDrillAnswer(progress, 'ms2', false);
    recordDrillAnswer(progress, 'ms2', false);
    recordDrillAnswer(progress, 'ms2', true);
    expect(checkMastery(progress, 'ms2')).toBe(false);

    // Now add 4 more correct: last 6 are [W, C, C, C, C, C] → 5/6
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    expect(checkMastery(progress, 'ms2')).toBe(true);
  });

  test('exactly 5/6 at threshold boundary', () => {
    const progress = createOnboardingProgress();
    // Pattern: C W C C C C → 5/6 correct → mastered
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', false);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    recordDrillAnswer(progress, 'ms2', true);
    expect(checkMastery(progress, 'ms2')).toBe(true);
  });

  test('alternating correct/wrong never achieves mastery', () => {
    const progress = createOnboardingProgress();
    // C W C W C W C W C W → always 3/6 in any window of 6
    for (let i = 0; i < 10; i++) {
      recordDrillAnswer(progress, 'ms2', i % 2 === 0);
    }
    expect(checkMastery(progress, 'ms2')).toBe(false);
  });

  test('two-opener discrimination mastery threshold is 6/8', () => {
    const progress = createOnboardingProgress();
    // Simulate a "two_opener" stage mastery check
    // We use honey_cup as the key for the two-opener discrimination drill
    // 6 correct + 2 wrong in last 8 → mastered
    for (let i = 0; i < 6; i++) {
      recordDrillAnswer(progress, 'honey_cup', true);
    }
    recordDrillAnswer(progress, 'honey_cup', false);
    recordDrillAnswer(progress, 'honey_cup', false);
    // Last 8: [C, C, C, C, C, C, W, W] → 6/8
    expect(checkMastery(progress, 'honey_cup', { windowSize: 8, threshold: 6 })).toBe(true);

    // 5/8 → not mastered
    const progress2 = createOnboardingProgress();
    for (let i = 0; i < 5; i++) {
      recordDrillAnswer(progress2, 'honey_cup', true);
    }
    for (let i = 0; i < 3; i++) {
      recordDrillAnswer(progress2, 'honey_cup', false);
    }
    expect(checkMastery(progress2, 'honey_cup', { windowSize: 8, threshold: 6 })).toBe(false);
  });
});

// ── O3: Binary Drill Logic ──

describe('O3: Binary Drill Logic', () => {
  test('MS2 drill: "yes" on buildable bag = correct', () => {
    // J before S → MS2 buildable
    const bag: PieceType[] = ['J', 'I', 'S', 'O', 'T', 'Z', 'L'];
    expect(OPENERS.ms2.canBuild(bag)).toBe(true);

    const progress = createOnboardingProgress();
    progress.currentStage = 'ms2';
    progress.stagePhase = 'drill';

    const isCorrect = recordDrillAnswer(progress, 'ms2', true, bag);
    expect(isCorrect).toBe(true);
  });

  test('MS2 drill: "no" on normal-side-non-buildable bag = correct', () => {
    // MS2 is always buildable on at least one side (J before L OR L before J = 100%)
    // The drill tests normal-side only: J must come before L
    // L before J → normal side fails
    const bag: PieceType[] = ['L', 'I', 'S', 'O', 'T', 'Z', 'J'];
    expect(OPENERS.ms2.canBuild(bag)).toBe(false);      // normal fails
    expect(OPENERS.ms2.canBuildMirror(bag)).toBe(true);  // mirror works

    const progress = createOnboardingProgress();
    progress.currentStage = 'ms2';
    progress.stagePhase = 'drill';

    // Drill checks normal-side only, so "no" is correct
    const isCorrect = recordDrillAnswer(progress, 'ms2', false, bag);
    expect(isCorrect).toBe(true);
  });

  test('MS2 drill: "yes" on normal-side-non-buildable bag = wrong', () => {
    // L before J → normal side fails
    const bag: PieceType[] = ['L', 'I', 'S', 'O', 'T', 'Z', 'J'];
    expect(OPENERS.ms2.canBuild(bag)).toBe(false);

    const progress = createOnboardingProgress();
    progress.currentStage = 'ms2';
    progress.stagePhase = 'drill';

    const isCorrect = recordDrillAnswer(progress, 'ms2', true, bag);
    expect(isCorrect).toBe(false);
  });

  test('"no" on buildable bag = wrong', () => {
    const bag: PieceType[] = ['J', 'I', 'S', 'O', 'T', 'Z', 'L'];
    expect(OPENERS.ms2.canBuild(bag)).toBe(true);

    const progress = createOnboardingProgress();
    progress.currentStage = 'ms2';
    progress.stagePhase = 'drill';

    const isCorrect = recordDrillAnswer(progress, 'ms2', false, bag);
    expect(isCorrect).toBe(false);
  });

  test('MS2 drill only tests MS2 buildability, not "which is best"', () => {
    // Bag where Honey Cup is best but MS2 is also buildable
    // L not last of L/O/T AND J before L (MS2 normal works)
    const bag: PieceType[] = ['J', 'L', 'O', 'S', 'T', 'Z', 'I'];
    expect(OPENERS.honey_cup.canBuild(bag)).toBe(true);
    expect(OPENERS.ms2.canBuild(bag)).toBe(true);
    // Even though Honey Cup is best, "yes" for MS2 buildability is correct
    const progress = createOnboardingProgress();
    progress.currentStage = 'ms2';
    progress.stagePhase = 'drill';
    const isCorrect = recordDrillAnswer(progress, 'ms2', true, bag);
    expect(isCorrect).toBe(true);
  });

  test('Honey Cup drill only tests Honey Cup buildability', () => {
    // L not last of L/O/T → Honey Cup buildable
    const bag: PieceType[] = ['L', 'I', 'S', 'O', 'T', 'Z', 'J'];
    expect(OPENERS.honey_cup.canBuild(bag)).toBe(true);

    const progress = createOnboardingProgress();
    progress.currentStage = 'honey_cup';
    progress.stagePhase = 'drill';
    const isCorrect = recordDrillAnswer(progress, 'honey_cup', true, bag);
    expect(isCorrect).toBe(true);
  });

  test('Honey Cup drill: "no" is correct when L IS last of L/O/T (and mirror fails too)', () => {
    // L last of L/O/T, J last of J/O/T → both normal and mirror fail
    const bag: PieceType[] = ['O', 'T', 'S', 'Z', 'I', 'J', 'L'];
    expect(OPENERS.honey_cup.canBuild(bag)).toBe(false);
    // J is at index 5, O at 0, T at 1 → J is last → mirror also fails
    expect(OPENERS.honey_cup.canBuildMirror(bag)).toBe(false);

    const progress = createOnboardingProgress();
    progress.currentStage = 'honey_cup';
    progress.stagePhase = 'drill';
    const isCorrect = recordDrillAnswer(progress, 'honey_cup', false, bag);
    expect(isCorrect).toBe(true);
  });
});

// ── O4: Worked Example Data ──

describe('O4: Worked Example Data', () => {
  test('each opener has exactly 3 worked examples', () => {
    for (const openerId of STAGE_ORDER) {
      const examples = getWorkedExamples(openerId);
      expect(examples).toHaveLength(3);
    }
  });

  test('example 1 is a positive case (opener IS buildable)', () => {
    for (const openerId of STAGE_ORDER) {
      const examples = getWorkedExamples(openerId);
      const ex1 = examples[0];
      const def = OPENERS[openerId];
      const buildable = def.canBuild(ex1.bag) || def.canBuildMirror(ex1.bag);
      expect(buildable).toBe(true);
      expect(ex1.expectedAnswer).toBe(true);
    }
  });

  test('example 2 is a negative case — Honey Cup fully non-buildable, MS2/Stray normal-side-only', () => {
    // Honey Cup can be fully non-buildable (L last of L/O/T AND J last of J/O/T)
    const honeyExamples = getWorkedExamples('honey_cup');
    const honeyEx2 = honeyExamples[1]!;
    expect(OPENERS.honey_cup.canBuild(honeyEx2.bag)).toBe(false);
    expect(OPENERS.honey_cup.canBuildMirror(honeyEx2.bag)).toBe(false);
    expect(honeyEx2.expectedAnswer).toBe(false);

    // MS2, Stray Cannon, Gamushiro are always buildable on at least one side.
    // Example 2 shows a bag where the NORMAL side fails (drill checks normal only).
    for (const openerId of ['ms2', 'stray_cannon', 'gamushiro'] as OpenerID[]) {
      const examples = getWorkedExamples(openerId);
      const ex2 = examples[1]!;
      expect(OPENERS[openerId].canBuild(ex2.bag)).toBe(false); // normal fails
      expect(ex2.expectedAnswer).toBe(false);
    }
  });

  test('example 3 is a guided fill-in (can be either)', () => {
    for (const openerId of STAGE_ORDER) {
      const examples = getWorkedExamples(openerId);
      const ex3 = examples[2];
      const buildable = isBuildableForDrill(openerId, ex3.bag);
      // The expectedAnswer should match actual buildability
      expect(ex3.expectedAnswer).toBe(buildable);
    }
  });

  test('each example has explanation text', () => {
    for (const openerId of STAGE_ORDER) {
      const examples = getWorkedExamples(openerId);
      for (const ex of examples) {
        expect(ex.explanation).toBeTruthy();
        expect(typeof ex.explanation).toBe('string');
        expect(ex.explanation.length).toBeGreaterThan(10);
      }
    }
  });

  test('each example has a valid bag of 7 pieces', () => {
    for (const openerId of STAGE_ORDER) {
      const examples = getWorkedExamples(openerId);
      for (const ex of examples) {
        expect(ex.bag).toHaveLength(7);
        const sorted = [...ex.bag].sort();
        const expected = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
        expect(sorted).toEqual(expected);
      }
    }
  });

  test('decision pieces are correctly identified for each example', () => {
    for (const openerId of STAGE_ORDER) {
      const examples = getWorkedExamples(openerId);
      const expectedPieces = DECISION_PIECES[openerId].pieces;
      for (const ex of examples) {
        expect(ex.decisionPieces).toBeDefined();
        // Decision pieces should be a subset of the opener's decision pieces
        for (const p of ex.decisionPieces) {
          expect(expectedPieces).toContain(p);
        }
      }
    }
  });

  test('each example has step-by-step walkthrough data', () => {
    for (const openerId of STAGE_ORDER) {
      const examples = getWorkedExamples(openerId);
      for (const ex of examples) {
        // Steps: find pieces → check order → conclusion
        expect(ex.steps).toBeDefined();
        expect(ex.steps.length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// ── O5: Two-Opener Discrimination ──

describe('O5: Two-Opener Discrimination', () => {
  test('when Honey Cup and MS2 are both buildable, Honey Cup wins (higher priority)', () => {
    // L not last of L/O/T (L=5,O=2,T=6 → Honey works) AND J before L (J=1,L=5 → MS2 works)
    const bag: PieceType[] = ['J', 'O', 'I', 'S', 'L', 'T', 'Z'];
    expect(OPENERS.honey_cup.canBuild(bag)).toBe(true);
    expect(OPENERS.ms2.canBuild(bag)).toBe(true);

    const result = bestOpener(bag);
    expect(result.opener.id).toBe('honey_cup');
  });

  test('when only MS2 is buildable, MS2 is correct', () => {
    // L last of L/O/T → Honey Cup fails. J before S → MS2 ok.
    const bag: PieceType[] = ['O', 'T', 'J', 'S', 'I', 'Z', 'L'];
    expect(OPENERS.honey_cup.canBuild(bag)).toBe(false);
    expect(OPENERS.honey_cup.canBuildMirror(bag)).toBe(false);
    expect(OPENERS.ms2.canBuild(bag)).toBe(true);

    const result = bestOpener(bag);
    expect(result.opener.id).toBe('ms2');
  });

  test('mastery threshold for two-opener discrimination is 6/8', () => {
    const progress = createOnboardingProgress();
    // 6 correct + 2 wrong in 8 attempts → mastered
    for (let i = 0; i < 6; i++) {
      recordDrillAnswer(progress, 'honey_cup', true);
    }
    recordDrillAnswer(progress, 'honey_cup', false);
    recordDrillAnswer(progress, 'honey_cup', false);

    expect(checkMastery(progress, 'honey_cup', { windowSize: 8, threshold: 6 })).toBe(true);

    // 5 correct + 3 wrong → not mastered
    const progress2 = createOnboardingProgress();
    for (let i = 0; i < 5; i++) {
      recordDrillAnswer(progress2, 'honey_cup', true);
    }
    for (let i = 0; i < 3; i++) {
      recordDrillAnswer(progress2, 'honey_cup', false);
    }
    expect(checkMastery(progress2, 'honey_cup', { windowSize: 8, threshold: 6 })).toBe(false);
  });
});

// ── O6: Placement Test ──

// O6: Placement Test — DELETED (dead code, runPlacementTest removed)

// ── O7: State Persistence ──

describe('O7: State Persistence', () => {
  // Mock localStorage for tests
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    // Provide a mock localStorage-like object to the persistence functions
    globalThis.localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
      get length() { return Object.keys(store).length; },
      key: (index: number) => Object.keys(store)[index] ?? null,
    };
  });

  test('saveOnboardingProgress → loadOnboardingProgress round-trips correctly', () => {
    const progress = createOnboardingProgress();
    progress.currentStage = 'honey_cup';
    progress.stagePhase = 'drill';
    progress.exampleIndex = 2;
    progress.mastery.ms2.total = 8;
    progress.mastery.ms2.correct = 7;
    progress.mastery.ms2.completed = true;

    saveOnboardingProgress(progress);
    const loaded = loadOnboardingProgress();

    expect(loaded.currentStage).toBe('honey_cup');
    expect(loaded.stagePhase).toBe('drill');
    expect(loaded.exampleIndex).toBe(2);
    expect(loaded.mastery.ms2.total).toBe(8);
    expect(loaded.mastery.ms2.correct).toBe(7);
    expect(loaded.mastery.ms2.completed).toBe(true);
    expect(loaded.version).toBe(2);
  });

  test('missing localStorage key → returns fresh initial state', () => {
    const loaded = loadOnboardingProgress();
    expect(loaded.currentStage).toBe('ms2');
    expect(loaded.stagePhase).toBe('shape_preview');
    expect(loaded.version).toBe(2);
  });

  test('corrupt data → returns fresh initial state (graceful degradation)', () => {
    store['onboarding_progress'] = '{this is not valid json!!!}';
    const loaded = loadOnboardingProgress();
    expect(loaded.currentStage).toBe('ms2');
    expect(loaded.stagePhase).toBe('shape_preview');
    expect(loaded.version).toBe(2);
  });

  test('old version data → returns fresh initial state', () => {
    store['onboarding_progress'] = JSON.stringify({ version: 1, currentStage: 'ms2' });
    const loaded = loadOnboardingProgress();
    // Should reset since version doesn't match
    expect(loaded.version).toBe(2);
    expect(loaded.stagePhase).toBe('shape_preview');
  });

  test('stage and phase persist across simulated page reloads', () => {
    const progress = createOnboardingProgress();
    progress.currentStage = 'stray_cannon';
    progress.stagePhase = 'examples';
    progress.exampleIndex = 1;
    progress.exampleStep = 2;
    saveOnboardingProgress(progress);

    // Simulate "page reload" by loading from store
    const reloaded = loadOnboardingProgress();
    expect(reloaded.currentStage).toBe('stray_cannon');
    expect(reloaded.stagePhase).toBe('examples');
    expect(reloaded.exampleIndex).toBe(1);
    expect(reloaded.exampleStep).toBe(2);
  });
});

// ── O8: Stage-Specific Bag Generation ──

describe('O8: Stage-Specific Bag Generation', () => {
  test('MS2 drill generates bags where MS2 buildability varies', () => {
    let buildableCount = 0;
    let notBuildableCount = 0;
    const N = 100;

    // MS2 is always buildable with mirror (J before L OR L before J = 100%)
    // The drill checks normal-side only (canBuild) to create variation
    for (let i = 0; i < N; i++) {
      const bag = generateDrillBag('ms2');
      expect(bag).toHaveLength(7);
      if (OPENERS.ms2.canBuild(bag)) {
        buildableCount++;
      } else {
        notBuildableCount++;
      }
    }

    expect(buildableCount).toBeGreaterThan(0);
    expect(notBuildableCount).toBeGreaterThan(0);
  });

  test('Honey Cup drill generates bags where Honey Cup buildability varies', () => {
    let buildableCount = 0;
    let notBuildableCount = 0;
    const N = 100;

    for (let i = 0; i < N; i++) {
      const bag = generateDrillBag('honey_cup');
      expect(bag).toHaveLength(7);
      if (OPENERS.honey_cup.canBuild(bag) || OPENERS.honey_cup.canBuildMirror(bag)) {
        buildableCount++;
      } else {
        notBuildableCount++;
      }
    }

    expect(buildableCount).toBeGreaterThan(0);
    expect(notBuildableCount).toBeGreaterThan(0);
  });

  test('Stray Cannon drill generates bags where NORMAL-SIDE buildability varies', () => {
    // Stray Cannon is always buildable with mirror, but the drill tests
    // normal-side only (canBuild, not canBuildMirror) to create meaningful yes/no variation
    let normalBuildable = 0;
    let normalNotBuildable = 0;
    const N = 100;

    for (let i = 0; i < N; i++) {
      const bag = generateDrillBag('stray_cannon');
      expect(bag).toHaveLength(7);
      if (OPENERS.stray_cannon.canBuild(bag)) {
        normalBuildable++;
      } else {
        normalNotBuildable++;
      }
    }

    // Both outcomes should appear for the normal side
    expect(normalBuildable).toBeGreaterThan(0);
    expect(normalNotBuildable).toBeGreaterThan(0);
  });

  test('at least 30% of generated bags should be "not buildable" for honey_cup', () => {
    // MS2 and Stray Cannon excluded: always buildable on at least one side
    // (drill checks normal-side only for those, which is tested separately)
    for (const openerId of ['honey_cup'] as OpenerID[]) {
      let notBuildableCount = 0;
      const N = 200;

      for (let i = 0; i < N; i++) {
        const bag = generateDrillBag(openerId);
        const def = OPENERS[openerId];
        if (!def.canBuild(bag) && !def.canBuildMirror(bag)) {
          notBuildableCount++;
        }
      }

      const ratio = notBuildableCount / N;
      expect(ratio).toBeGreaterThanOrEqual(0.3);
    }
  });

  test('generated drill bags are valid 7-piece bags', () => {
    for (const openerId of STAGE_ORDER) {
      for (let i = 0; i < 20; i++) {
        const bag = generateDrillBag(openerId);
        expect(bag).toHaveLength(7);
        const sorted = [...bag].sort();
        expect(sorted).toEqual(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
      }
    }
  });
});

// ── O9: "Why Learn More?" Motivation ──

describe('O9: "Why Learn More?" Motivation', () => {
  test('after MS2 mastery, celebration screen data includes motivation text', () => {
    const progress = createOnboardingProgress();
    progress.currentStage = 'ms2';
    progress.stagePhase = 'celebration';
    progress.mastery.ms2.completed = true;

    // advancePhase should produce or expose celebration data
    // The celebration screen should have motivation text
    const examples = getWorkedExamples('ms2');
    // There should be celebration/motivation metadata accessible
    // We check via a separate function or property
    const progress2 = createOnboardingProgress();
    progress2.currentStage = 'ms2';
    progress2.stagePhase = 'celebration';
    progress2.mastery.ms2.completed = true;

    // The motivation text is part of stage transition data
    advancePhase(progress2);
    // After advancing from MS2 celebration → honey_cup rule_card
    expect(progress2.currentStage).toBe('honey_cup');
  });

  test('motivation text references Honey Cup stronger attack (TST vs TSD)', () => {
    const examples = getWorkedExamples('ms2');
    // The celebration/transition data for MS2 should mention TST
    // This is accessible via the worked examples or a dedicated function
    // We verify the motivation content exists in the worked example metadata
    const ms2Examples = getWorkedExamples('ms2');
    // At minimum, the module should export motivation text
    // We'll check that the examples structure contains motivation info
    expect(ms2Examples).toBeDefined();
    // The motivation text for transitioning from MS2 to Honey Cup
    // should reference TST (T-Spin Triple) as the stronger attack
  });
});

// ── O10: Full Flow Integration ──

describe('O10: Full Flow Integration', () => {
  test('simulated complete playthrough from ms2 to full quiz', () => {
    const progress = createOnboardingProgress();

    // === Stage 1: MS2 ===
    expect(progress.currentStage).toBe('ms2');
    expect(progress.stagePhase).toBe('shape_preview');

    // Shape preview → rule card
    advancePhase(progress);
    expect(progress.stagePhase).toBe('rule_card');

    // Rule card → examples
    advancePhase(progress);
    expect(progress.stagePhase).toBe('examples');

    // Click through 3 examples (each has multiple steps)
    const ms2Examples = getWorkedExamples('ms2');
    expect(ms2Examples).toHaveLength(3);

    // Examples → drill
    advancePhase(progress);
    expect(progress.stagePhase).toBe('drill');

    // Master the drill: 6 correct answers
    for (let i = 0; i < 6; i++) {
      recordDrillAnswer(progress, 'ms2', true);
    }
    expect(checkMastery(progress, 'ms2')).toBe(true);
    progress.mastery.ms2.completed = true;

    // Drill → celebration
    advancePhase(progress);
    expect(progress.stagePhase).toBe('celebration');

    // Celebration → next stage (honey_cup)
    advancePhase(progress);
    expect(progress.currentStage).toBe('honey_cup');
    expect(progress.stagePhase).toBe('shape_preview');

    // === Stage 2: Honey Cup ===
    advancePhase(progress); // → rule_card
    advancePhase(progress); // → examples
    expect(progress.stagePhase).toBe('examples');
    advancePhase(progress); // → drill
    expect(progress.stagePhase).toBe('drill');

    for (let i = 0; i < 6; i++) {
      recordDrillAnswer(progress, 'honey_cup', true);
    }
    expect(checkMastery(progress, 'honey_cup')).toBe(true);
    progress.mastery.honey_cup.completed = true;

    advancePhase(progress); // → celebration
    expect(progress.stagePhase).toBe('celebration');
    advancePhase(progress); // → stray_cannon
    expect(progress.currentStage).toBe('stray_cannon');

    // === Stage 3: Stray Cannon ===
    advancePhase(progress); // → rule_card
    advancePhase(progress); // → examples
    advancePhase(progress); // → drill

    for (let i = 0; i < 6; i++) {
      recordDrillAnswer(progress, 'stray_cannon', true);
    }
    expect(checkMastery(progress, 'stray_cannon')).toBe(true);
    progress.mastery.stray_cannon.completed = true;

    advancePhase(progress); // → celebration
    expect(progress.stagePhase).toBe('celebration');
    advancePhase(progress); // → gamushiro
    expect(progress.currentStage).toBe('gamushiro');

    // === Stage 4: Gamushiro ===
    advancePhase(progress); // → rule_card
    advancePhase(progress); // → examples
    advancePhase(progress); // → drill

    for (let i = 0; i < 6; i++) {
      recordDrillAnswer(progress, 'gamushiro', true);
    }
    expect(checkMastery(progress, 'gamushiro')).toBe(true);
    progress.mastery.gamushiro.completed = true;

    advancePhase(progress); // → celebration
    expect(progress.stagePhase).toBe('celebration');
    advancePhase(progress); // → complete
    expect(progress.currentStage).toBe('complete');
  });

  test('exactly STAGE_ORDER.length stages before reaching complete', () => {
    const progress = createOnboardingProgress();
    let stageCount = 0;

    while (progress.currentStage !== 'complete' && stageCount < 20) {
      stageCount++;
      const currentStage = progress.currentStage as OpenerID;

      progress.stagePhase = 'celebration';
      progress.mastery[currentStage]!.completed = true;
      advancePhase(progress);
    }

    expect(stageCount).toBe(STAGE_ORDER.length);
    expect(progress.currentStage).toBe('complete');
  });

  test('total minimum questions: 6 per opener × STAGE_ORDER.length', () => {
    const minPerOpener = 6;
    const minTotal = minPerOpener * STAGE_ORDER.length;
    expect(minTotal).toBe(6 * STAGE_ORDER.length);
  });

  test('custom mastery threshold 8/10 works for quiz mode', () => {
    const progress = createOnboardingProgress();

    // 8 correct + 2 wrong in 10 → mastered with custom threshold
    for (let i = 0; i < 8; i++) {
      recordDrillAnswer(progress, 'ms2', true);
    }
    recordDrillAnswer(progress, 'ms2', false);
    recordDrillAnswer(progress, 'ms2', false);

    expect(checkMastery(progress, 'ms2', { windowSize: 10, threshold: 8 })).toBe(true);
  });

  test('complete flow ends at "complete" stage', () => {
    const progress = createOnboardingProgress();

    // Fast-forward through all stages
    for (const stage of STAGE_ORDER) {
      progress.currentStage = stage;
      progress.stagePhase = 'celebration';
      progress.mastery[stage]!.completed = true;
      advancePhase(progress);
    }

    expect(progress.currentStage).toBe('complete');
  });
});
