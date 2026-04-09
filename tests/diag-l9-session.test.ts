/**
 * diag-l9-session.test.ts — L9 empirical proof for the Session redesign
 *
 * This is the Phase 2.5 empirical proof (per project CLAUDE.md L10) for the L9
 * Session redesign. The reference reducer below IS the design spec. The
 * eventual `src/session.ts` must match this reducer's behavior EXACTLY.
 *
 * Think of this file as an executable docstring — the reducer encodes the
 * design contract and every test asserts an invariant the design depends on.
 *
 * === Design under test ===
 *
 * The current app has 4 modes (onboarding, quiz, visualizer, drill) with
 * 2 localStorage persistence layers. The L9 redesign DELETES all of that
 * and unifies into a single `Session` state:
 *
 *   type Session = {
 *     bag1: Piece[]                 // random 7-perm, regenerated every loop
 *     bag2: Piece[]                 // random 7-perm for route phase
 *     phase: 'guess1' | 'reveal1' | 'guess2' | 'reveal2'
 *     guess: { opener; mirror } | null
 *     correct: boolean | null
 *     board: Board
 *     step: number
 *     playMode: 'auto' | 'manual'
 *     sessionStats: { total; correct; streak }   // in-memory only
 *   }
 *
 * Flow: guess1 → user picks opener + mirror → submit → reveal1 (board builds)
 *       → SPACE → guess2 → user picks bag2 route → reveal2 → SPACE →
 *       new guess1 with fresh bag. No persistence. Reset = new bag.
 *
 * === What this test proves ===
 *
 *   1. Every bag1 × opener guess combination routes correctly via bestOpener
 *   2. reveal phase respects placement order — buildSteps gravity-valid
 *   3. Bag2 routes for each opener — getBag2Routes correctness
 *   4. playMode 'manual' exposes drill-style target cells
 *   5. playMode 'auto' exposes visualizer-style intermediate boards
 *   6. No persistence — zero localStorage calls from reducer
 *   7. sessionStats in-memory only — zero after re-init
 *   8. New bag on advance past reveal2 — bag regeneration
 *   9. Mirror toggle during guess1 — no board/bag mutation
 *  10. Every opener's Bag 1 final board matches golden data
 *  11. Exhaustive cross-product smoke test (4 openers × 2 mirrors × routes)
 *  12. Reset via newSession mid-phase — no state leakage
 *  13. Bag 1 piece count per opener — 6 vs 7 pieces (Gamushiro form_2: 6)
 *  14. Keyboard action coverage — every reducer action exercised
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import {
  emptyBoard,
  buildSteps,
  cloneBoard,
  findFloatingPieces,
  stampCells,
  type Board,
  type Step,
} from '../src/core/engine.ts';
import type { PieceType } from '../src/core/types.ts';
import { ALL_PIECE_TYPES } from '../src/core/types.ts';
import type { OpenerID } from '../src/openers/types.ts';
import {
  OPENER_PLACEMENT_DATA,
  mirrorPlacementData,
  type OpenerPlacementData,
  type RawPlacement,
} from '../src/openers/placements.ts';
import {
  getBag2Routes,
  type Bag2Route,
} from '../src/openers/bag2-routes.ts';
import { OPENERS, bestOpener, bestBag2Route } from '../src/openers/decision.ts';

// ═══════════════════════════════════════════════════════════════════════════
// REFERENCE REDUCER — the design spec
// ═══════════════════════════════════════════════════════════════════════════

type Phase = 'guess1' | 'reveal1' | 'guess2' | 'reveal2';
type PlayMode = 'auto' | 'manual';

interface Guess {
  opener: OpenerID;
  mirror: boolean;
}

interface SessionStats {
  total: number;
  correct: number;
  streak: number;
}

interface Session {
  bag1: PieceType[];
  bag2: PieceType[];
  phase: Phase;
  guess: Guess | null;
  correct: boolean | null;
  board: Board;
  step: number;
  playMode: PlayMode;
  sessionStats: SessionStats;
  // Derived once on reveal1 entry, cached for stepping. This is the "auto"
  // sequence for the resolved opener. For 'guess2' routes, this stores the
  // Bag 2 steps layered on top of the Bag 1 final board.
  cachedSteps: Step[];
  // Route index selected during guess2 (-1 if not yet selected).
  routeGuess: number;
}

/**
 * Union of every reducer action. The eventual src/session.ts must expose
 * this exact contract (names and payloads may be refined but the semantics
 * are fixed by the tests below).
 */
type Action =
  | { type: 'newSession'; bag1?: PieceType[]; bag2?: PieceType[] }
  | { type: 'setGuess'; opener: OpenerID; mirror: boolean }
  | { type: 'toggleMirror' }
  | { type: 'submitGuess' }
  | { type: 'stepForward' }
  | { type: 'stepBackward' }
  | { type: 'advancePhase' }
  | { type: 'togglePlayMode' }
  | { type: 'pieceDrop'; piece: PieceType; cells: { col: number; row: number }[] }
  | { type: 'selectRoute'; routeIndex: number };

/** Deterministic pseudo-random bag — used ONLY when a caller does not
 *  supply an explicit bag. Tests should always supply explicit bags to
 *  keep the proof deterministic. */
let _determinismCounter = 0;
function _nextDeterministicBag(): PieceType[] {
  _determinismCounter++;
  const base = [...ALL_PIECE_TYPES];
  // Deterministic Fisher–Yates seeded by the counter.
  let seed = _determinismCounter * 2654435761;
  for (let i = base.length - 1; i > 0; i--) {
    seed = (seed ^ (seed << 13)) >>> 0;
    seed = (seed ^ (seed >>> 17)) >>> 0;
    seed = (seed ^ (seed << 5)) >>> 0;
    const j = seed % (i + 1);
    [base[i], base[j]] = [base[j]!, base[i]!];
  }
  return base;
}

/** Compute the auto-sequence for a given guess. Uses placement data +
 *  buildSteps. For Bag 1, no route; for Bag 2 a routeIndex must be given. */
function computeSteps(
  opener: OpenerID,
  mirror: boolean,
  phase: 'reveal1' | 'reveal2',
  routeIndex: number,
  priorBoard: Board,
): Step[] {
  const raw = OPENER_PLACEMENT_DATA[opener];
  const data: OpenerPlacementData = mirror ? mirrorPlacementData(raw) : raw;

  if (phase === 'reveal1') {
    // For gamushiro form_2 (routeIndex 1), the drill uses reduced Bag 1.
    // For the reveal1 sequence we use the full placement set — the reduced
    // case only matters once we know the route (phase reveal2).
    return buildSteps(data.placements);
  }

  // reveal2: layer the route on top of the bag1 board. This mirrors
  // the drill's transitionToBag2 behavior.
  const routes = getBag2Routes(opener, mirror);
  const route = routes[routeIndex];
  if (!route) return [];
  const allPlacements: RawPlacement[] = [
    ...(route.holdPlacement ? [route.holdPlacement] : []),
    ...route.placements,
  ];
  return buildSteps(allPlacements, priorBoard);
}

/** Initial session for a given (explicit) bag1/bag2. */
function createSession(bag1?: PieceType[], bag2?: PieceType[]): Session {
  return {
    bag1: bag1 ?? _nextDeterministicBag(),
    bag2: bag2 ?? _nextDeterministicBag(),
    phase: 'guess1',
    guess: null,
    correct: null,
    board: emptyBoard(),
    step: 0,
    playMode: 'auto',
    sessionStats: { total: 0, correct: 0, streak: 0 },
    cachedSteps: [],
    routeGuess: -1,
  };
}

/**
 * Pure reducer. NO side effects, NO localStorage, NO persistence.
 * This is the contract the real implementation must satisfy.
 */
function reduce(state: Session, action: Action): Session {
  switch (action.type) {
    case 'newSession': {
      return {
        ...createSession(action.bag1, action.bag2),
        // Preserve playMode across sessions (user toggle persists in-memory)
        playMode: state.playMode,
        sessionStats: state.sessionStats, // stats persist across sessions
      };
    }

    case 'setGuess': {
      if (state.phase !== 'guess1') return state;
      return {
        ...state,
        guess: { opener: action.opener, mirror: action.mirror },
      };
    }

    case 'toggleMirror': {
      if (state.phase !== 'guess1' || state.guess === null) return state;
      return {
        ...state,
        guess: { ...state.guess, mirror: !state.guess.mirror },
        // CRITICAL: bag and board MUST NOT change on toggle.
      };
    }

    case 'submitGuess': {
      if (state.phase !== 'guess1' || state.guess === null) return state;

      // Correctness rule: the guess is correct if the chosen (opener, mirror)
      // can actually be built from state.bag1. This is MORE permissive than
      // bestOpener's priority-based answer — it lets the user pick stray_cannon
      // or the mirror variant when those are ALSO buildable.
      //
      // MS2/Gamushiro interchangeability is implied by this rule because they
      // share canBuild/canBuildMirror predicates, so both are "buildable"
      // simultaneously.
      const guessedDef = OPENERS[state.guess.opener];
      const isCorrect = state.guess.mirror
        ? guessedDef.canBuildMirror(state.bag1)
        : guessedDef.canBuild(state.bag1);

      // Build the auto-sequence for the GUESSED opener (the authoritative one
      // the user chose). The reveal shows what the user asked for, not what
      // bestOpener would pick.
      //
      // When the guess is wrong, we still show the AUTHORITATIVE best opener
      // so the user can learn what was correct.
      const showOpener: OpenerID = isCorrect ? state.guess.opener : bestOpener(state.bag1).opener.id;
      const showMirror: boolean = isCorrect
        ? state.guess.mirror
        : bestOpener(state.bag1).mirror;

      const cachedSteps = computeSteps(
        showOpener,
        showMirror,
        'reveal1',
        -1,
        emptyBoard(),
      );

      const newStats: SessionStats = {
        total: state.sessionStats.total + 1,
        correct: state.sessionStats.correct + (isCorrect ? 1 : 0),
        streak: isCorrect ? state.sessionStats.streak + 1 : 0,
      };

      return {
        ...state,
        phase: 'reveal1',
        correct: isCorrect,
        guess: { opener: showOpener, mirror: showMirror },
        cachedSteps,
        step: 0,
        board: emptyBoard(),
        sessionStats: newStats,
      };
    }

    case 'stepForward': {
      if (state.phase !== 'reveal1' && state.phase !== 'reveal2') return state;
      if (state.step >= state.cachedSteps.length) return state;
      const nextStep = state.step + 1;
      const board = state.cachedSteps[nextStep - 1]!.board;
      return { ...state, step: nextStep, board: cloneBoard(board) };
    }

    case 'stepBackward': {
      if (state.phase !== 'reveal1' && state.phase !== 'reveal2') return state;
      if (state.step <= 0) return state;
      const prevStep = state.step - 1;
      const board =
        prevStep === 0
          ? emptyBoard()
          : cloneBoard(state.cachedSteps[prevStep - 1]!.board);
      return { ...state, step: prevStep, board };
    }

    case 'advancePhase': {
      // reveal1 → guess2 (user now picks bag2 route)
      if (state.phase === 'reveal1') {
        // Jump board to bag1 final (in case user hasn't auto-stepped through)
        const finalBoard =
          state.cachedSteps.length > 0
            ? cloneBoard(state.cachedSteps[state.cachedSteps.length - 1]!.board)
            : emptyBoard();
        return {
          ...state,
          phase: 'guess2',
          board: finalBoard,
          step: state.cachedSteps.length,
        };
      }
      // reveal2 → new guess1 with fresh bags
      if (state.phase === 'reveal2') {
        return {
          ...createSession(),
          playMode: state.playMode,
          sessionStats: state.sessionStats,
        };
      }
      // guess2 → reveal2 requires selectRoute first (handled by selectRoute)
      return state;
    }

    case 'selectRoute': {
      if (state.phase !== 'guess2' || state.guess === null) return state;
      const finalBag1 =
        state.cachedSteps.length > 0
          ? state.cachedSteps[state.cachedSteps.length - 1]!.board
          : emptyBoard();
      const routeSteps = computeSteps(
        state.guess.opener,
        state.guess.mirror,
        'reveal2',
        action.routeIndex,
        finalBag1,
      );
      return {
        ...state,
        phase: 'reveal2',
        routeGuess: action.routeIndex,
        cachedSteps: routeSteps,
        step: 0,
        board: cloneBoard(finalBag1),
      };
    }

    case 'togglePlayMode': {
      return {
        ...state,
        playMode: state.playMode === 'auto' ? 'manual' : 'auto',
      };
    }

    case 'pieceDrop': {
      // Manual-mode placement — only valid during reveal phases.
      if (state.phase !== 'reveal1' && state.phase !== 'reveal2') return state;
      if (state.playMode !== 'manual') return state;
      // The cell must match the target cells for the current step.
      const expectedStep = state.cachedSteps[state.step];
      if (!expectedStep) return state;
      if (expectedStep.piece !== action.piece) return state;
      const expectedSet = new Set(
        expectedStep.newCells.map(c => `${c.col},${c.row}`),
      );
      const givenSet = new Set(action.cells.map(c => `${c.col},${c.row}`));
      if (
        expectedSet.size !== givenSet.size ||
        ![...expectedSet].every(k => givenSet.has(k))
      ) {
        return state;
      }
      // Stamp the cells onto the board (matches stampCells behavior).
      const newBoard = stampCells(state.board, action.piece, action.cells);
      return { ...state, board: newBoard, step: state.step + 1 };
    }

    default:
      return state;
  }
}

// All action types the reducer MUST handle. Kept explicit so test #14 can
// check every one is exercised at least once.
const ACTION_TYPES: Action['type'][] = [
  'newSession',
  'setGuess',
  'toggleMirror',
  'submitGuess',
  'stepForward',
  'stepBackward',
  'advancePhase',
  'togglePlayMode',
  'pieceDrop',
  'selectRoute',
];

// ═══════════════════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════════════════

const OPENER_IDS: OpenerID[] = ['honey_cup', 'ms2', 'gamushiro', 'stray_cannon'];
const MIRRORS = [false, true] as const;

function boardHash(board: Board): string {
  return board.map(r => r.map(c => (c === null ? '.' : c)).join('')).join('|');
}

function getData(id: OpenerID, mirror: boolean): OpenerPlacementData {
  const raw = OPENER_PLACEMENT_DATA[id];
  return mirror ? mirrorPlacementData(raw) : raw;
}

/** Golden board: the authoritative Bag 1 final board for an opener × mirror.
 *  Computed from the PLACEMENT DATA (not from the reducer), so comparing
 *  reducer output against this proves behavior. */
function goldenBag1Board(id: OpenerID, mirror: boolean): Board {
  const data = getData(id, mirror);
  const steps = buildSteps(data.placements);
  return steps[steps.length - 1]!.board;
}

/** Find a 7-bag permutation where the target (opener, mirror) is BUILDABLE
 *  (canBuild or canBuildMirror returns true). This is the "a valid answer"
 *  relation, not the priority-ordered bestOpener result.
 *
 *  L10 FINDING: bestOpener is priority-ordered and stray_cannon (priority 4)
 *  is literally dead code because MS2/Gamushiro (priority 2/3) have
 *  setupRate.withMirror = 1.0. Therefore "force stray_cannon to be
 *  bestOpener" is impossible for any bag. The Session design must treat
 *  "correct" as "buildable", not "highest-priority buildable". */
function bagForTargetOpener(target: OpenerID, mirror: boolean): PieceType[] {
  const base: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const permutations: PieceType[][] = [];
  function permute(arr: PieceType[], start: number) {
    if (start === arr.length) {
      permutations.push([...arr]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
      permute(arr, start + 1);
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
    }
  }
  permute([...base], 0);
  const def = OPENERS[target];
  for (const p of permutations) {
    const ok = mirror ? def.canBuildMirror(p) : def.canBuild(p);
    if (ok) return p;
  }
  throw new Error(`No bag permutation found for which ${target} mirror=${mirror} is buildable`);
}

/** Find a 7-bag where ONLY the target opener-mirror is buildable and all
 *  OTHERS are not (used for deterministic "wrong guess" tests). May throw
 *  if no such exclusive bag exists. */
function bagForExclusiveTarget(target: OpenerID, mirror: boolean): PieceType[] | null {
  const base: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const permutations: PieceType[][] = [];
  function permute(arr: PieceType[], start: number) {
    if (start === arr.length) {
      permutations.push([...arr]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
      permute(arr, start + 1);
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
    }
  }
  permute([...base], 0);
  for (const p of permutations) {
    let matches = 0;
    let targetOk = false;
    for (const id of OPENER_IDS) {
      const d = OPENERS[id];
      if (d.canBuild(p)) matches++;
      if (d.canBuildMirror(p)) matches++;
      if (id === target) {
        targetOk = mirror ? d.canBuildMirror(p) : d.canBuild(p);
      }
    }
    if (matches === 1 && targetOk) return p;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

// Track which reducer actions have been exercised for test #14.
const exercisedActions = new Set<Action['type']>();

function dispatch(state: Session, action: Action): Session {
  exercisedActions.add(action.type);
  return reduce(state, action);
}

// ── #1: Every bag1 × opener guess combo routes correctly ──
describe('#1 bag1 × opener guess routing', () => {
  test('submitting the correct guess marks correct=true', () => {
    for (const target of OPENER_IDS) {
      for (const mirror of MIRRORS) {
        const bag = bagForTargetOpener(target, mirror);
        let s = createSession(bag);
        s = dispatch(s, { type: 'setGuess', opener: target, mirror });
        s = dispatch(s, { type: 'submitGuess' });
        expect(s.correct).toBe(true);
        expect(s.phase).toBe('reveal1');
        // After submit, guess is overridden to the authoritative best answer.
        expect(s.guess?.opener).toBe(target);
        expect(s.guess?.mirror).toBe(mirror);
      }
    }
  });

  test('submitting a wrong guess marks correct=false but still reveals', () => {
    // Force honey_cup to FAIL (L is last of {L,O,T}) AND pick a bag where
    // honey_cup mirror also fails (J is last of {J,O,T}). Then guessing
    // honey_cup should be wrong because canBuild and canBuildMirror are
    // both false.
    //
    // Any bag where L is last of {L,O,T} and J is last of {J,O,T} — which
    // means T comes first, then O, then both L and J after. Example:
    // [I, Z, S, T, O, L, J] — T(3) < O(4) < L(5)/J(6), L(5) not last of
    // {L,O,T} ← actually L IS last of L/T/O? order: T@3, O@4, L@5 → L is last. OK.
    // J mirror: J@6 not last of {J,O,T}? J@6, O@4, T@3 → J is last. OK.
    const bag: PieceType[] = ['I', 'Z', 'S', 'T', 'O', 'L', 'J'];
    const honey = OPENERS.honey_cup;
    expect(honey.canBuild(bag)).toBe(false);
    expect(honey.canBuildMirror(bag)).toBe(false);

    let s = createSession(bag);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    expect(s.correct).toBe(false);
    expect(s.phase).toBe('reveal1');
    // Reveal still shows an opener — the fallback is bestOpener's pick.
    const best = bestOpener(bag);
    expect(s.guess?.opener).toBe(best.opener.id);
    expect(s.guess?.mirror).toBe(best.mirror);
  });

  test('mirror variant: a bag where only one side of honey_cup is valid', () => {
    // Find a bag where honey_cup non-mirror succeeds but mirror fails.
    const base: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    let target: PieceType[] | null = null;
    function permute(arr: PieceType[], start: number) {
      if (target) return;
      if (start === arr.length) {
        if (
          OPENERS.honey_cup.canBuild(arr) &&
          !OPENERS.honey_cup.canBuildMirror(arr)
        ) {
          target = [...arr];
        }
        return;
      }
      for (let i = start; i < arr.length; i++) {
        [arr[start], arr[i]] = [arr[i]!, arr[start]!];
        permute(arr, start + 1);
        [arr[start], arr[i]] = [arr[i]!, arr[start]!];
      }
    }
    permute([...base], 0);
    expect(target).not.toBeNull();
    let s = createSession(target!);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    expect(s.correct).toBe(true);
    // And the mirror side is wrong on the same bag.
    let t = createSession(target!);
    t = dispatch(t, { type: 'setGuess', opener: 'honey_cup', mirror: true });
    t = dispatch(t, { type: 'submitGuess' });
    expect(t.correct).toBe(false);
  });
});

// ── #2: Reveal phase respects placement order ──
describe('#2 reveal1 placement order is gravity-valid', () => {
  for (const id of OPENER_IDS) {
    for (const mirror of MIRRORS) {
      test(`${id} mirror=${mirror}: stepping through reveal1 yields valid boards`, () => {
        const bag = bagForTargetOpener(id, mirror);
        let s = createSession(bag);
        s = dispatch(s, { type: 'setGuess', opener: id, mirror });
        s = dispatch(s, { type: 'submitGuess' });
        // Step through every cachedStep.
        const total = s.cachedSteps.length;
        expect(total).toBeGreaterThan(0);
        for (let i = 0; i < total; i++) {
          s = dispatch(s, { type: 'stepForward' });
          // After each step, find no floating pieces.
          const floating = findFloatingPieces(s.board);
          expect(floating.length).toBe(0);
        }
        expect(s.step).toBe(total);
        // Final board matches golden.
        expect(boardHash(s.board)).toBe(boardHash(goldenBag1Board(id, mirror)));
        // Cell count equals sum of placement cells (4 per piece × N pieces).
        const expectedCells = 4 * getData(id, mirror).placements.length;
        let count = 0;
        for (const row of s.board) for (const c of row) if (c !== null) count++;
        expect(count).toBe(expectedCells);
      });
    }
  }
});

// ── #3: Bag2 routes for each opener ──
describe('#3 bag2 route selection', () => {
  for (const id of OPENER_IDS) {
    for (const mirror of MIRRORS) {
      test(`${id} mirror=${mirror}: getBag2Routes returns every route`, () => {
        const routes = getBag2Routes(id, mirror);
        expect(routes.length).toBeGreaterThan(0);
        // Enter guess2 with a forcing bag1 and step through reveal1 → guess2.
        const bag = bagForTargetOpener(id, mirror);
        const bag2 = bagForTargetOpener(id, mirror); // any bag2 works
        let s = createSession(bag, bag2);
        s = dispatch(s, { type: 'setGuess', opener: id, mirror });
        s = dispatch(s, { type: 'submitGuess' });
        s = dispatch(s, { type: 'advancePhase' });
        expect(s.phase).toBe('guess2');

        // Select each route — the reducer must accept every index.
        for (let i = 0; i < routes.length; i++) {
          const next = dispatch(s, { type: 'selectRoute', routeIndex: i });
          expect(next.phase).toBe('reveal2');
          expect(next.routeGuess).toBe(i);
          expect(next.cachedSteps.length).toBeGreaterThan(0);
        }
      });
    }
  }

  test('bestBag2Route agrees with the reducer on a concrete bag2', () => {
    // MS2 non-mirror, bag2 that forces setup_b: L before I and J.
    const bag1 = bagForTargetOpener('ms2', false);
    const bag2: PieceType[] = ['L', 'Z', 'O', 'S', 'I', 'J', 'T'];
    const best = bestBag2Route('ms2', false, bag2);
    expect(best.routeIndex).toBe(1); // setup_b
    let s = createSession(bag1, bag2);
    s = dispatch(s, { type: 'setGuess', opener: 'ms2', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    s = dispatch(s, { type: 'advancePhase' });
    s = dispatch(s, { type: 'selectRoute', routeIndex: best.routeIndex });
    expect(s.phase).toBe('reveal2');
    expect(s.routeGuess).toBe(best.routeIndex);
  });
});

// ── #4: playMode 'manual' exposes drill-style targets ──
describe('#4 manual mode exposes target cells (drill oracle)', () => {
  test('manual mode step advances only when the right cells are dropped', () => {
    const id: OpenerID = 'stray_cannon';
    const mirror = false;
    const bag = bagForTargetOpener(id, mirror);
    let s = createSession(bag);
    s = dispatch(s, { type: 'setGuess', opener: id, mirror });
    s = dispatch(s, { type: 'submitGuess' });
    s = dispatch(s, { type: 'togglePlayMode' });
    expect(s.playMode).toBe('manual');

    // Drop every piece in order per cachedSteps — the same targets drill shows.
    const total = s.cachedSteps.length;
    for (let i = 0; i < total; i++) {
      const step = s.cachedSteps[i]!;
      s = dispatch(s, { type: 'pieceDrop', piece: step.piece, cells: step.newCells });
      expect(s.step).toBe(i + 1);
    }
    expect(boardHash(s.board)).toBe(boardHash(goldenBag1Board(id, mirror)));
  });

  test('manual mode rejects a wrong drop', () => {
    const bag = bagForTargetOpener('ms2', false);
    let s = createSession(bag);
    s = dispatch(s, { type: 'setGuess', opener: 'ms2', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    s = dispatch(s, { type: 'togglePlayMode' });

    // Wrong piece type at correct cells.
    const step0 = s.cachedSteps[0]!;
    const bogusPiece: PieceType = step0.piece === 'I' ? 'T' : 'I';
    const before = s.step;
    s = dispatch(s, { type: 'pieceDrop', piece: bogusPiece, cells: step0.newCells });
    expect(s.step).toBe(before); // no advance

    // Right piece, wrong cells.
    s = dispatch(s, {
      type: 'pieceDrop',
      piece: step0.piece,
      cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }],
    });
    expect(s.step).toBe(before); // still no advance
  });
});

// ── #5: playMode 'auto' behaves like visualizer ──
describe('#5 auto mode matches visualizer intermediate boards', () => {
  test('stepping forward N times yields the Nth visualizer step', () => {
    for (const id of OPENER_IDS) {
      for (const mirror of MIRRORS) {
        const bag = bagForTargetOpener(id, mirror);
        let s = createSession(bag);
        s = dispatch(s, { type: 'setGuess', opener: id, mirror });
        s = dispatch(s, { type: 'submitGuess' });

        // Oracle: the visualizer-style steps from buildSteps on placement data.
        const data = getData(id, mirror);
        const oracleSteps = buildSteps(data.placements);
        expect(s.cachedSteps.length).toBe(oracleSteps.length);

        for (let i = 0; i < oracleSteps.length; i++) {
          s = dispatch(s, { type: 'stepForward' });
          expect(boardHash(s.board)).toBe(boardHash(oracleSteps[i]!.board));
        }
      }
    }
  });

  test('step backward rewinds to previous board', () => {
    const bag = bagForTargetOpener('honey_cup', false);
    let s = createSession(bag);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    s = dispatch(s, { type: 'stepForward' });
    s = dispatch(s, { type: 'stepForward' });
    s = dispatch(s, { type: 'stepForward' });
    expect(s.step).toBe(3);
    s = dispatch(s, { type: 'stepBackward' });
    expect(s.step).toBe(2);
    expect(boardHash(s.board)).toBe(boardHash(s.cachedSteps[1]!.board));
    s = dispatch(s, { type: 'stepBackward' });
    s = dispatch(s, { type: 'stepBackward' });
    expect(s.step).toBe(0);
    expect(boardHash(s.board)).toBe(boardHash(emptyBoard()));
  });
});

// ── #6: No persistence — zero localStorage calls ──
describe('#6 no persistence', () => {
  let getItemSpy: ReturnType<typeof spyOn> | null = null;
  let setItemSpy: ReturnType<typeof spyOn> | null = null;
  let removeItemSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    // localStorage may not exist in bun:test by default — polyfill if missing.
    const g = globalThis as unknown as {
      localStorage?: Storage;
    };
    if (!g.localStorage) {
      const store = new Map<string, string>();
      g.localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
          return store.size;
        },
      } as unknown as Storage;
    }
    getItemSpy = spyOn(globalThis.localStorage, 'getItem');
    setItemSpy = spyOn(globalThis.localStorage, 'setItem');
    removeItemSpy = spyOn(globalThis.localStorage, 'removeItem');
  });

  afterEach(() => {
    getItemSpy?.mockRestore();
    setItemSpy?.mockRestore();
    removeItemSpy?.mockRestore();
  });

  test('a full session cycle does not touch localStorage', () => {
    const bag = bagForTargetOpener('ms2', false);
    const bag2 = bagForTargetOpener('ms2', false);
    let s = createSession(bag, bag2);
    s = dispatch(s, { type: 'setGuess', opener: 'ms2', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    for (let i = 0; i < s.cachedSteps.length; i++) {
      s = dispatch(s, { type: 'stepForward' });
    }
    s = dispatch(s, { type: 'advancePhase' });
    s = dispatch(s, { type: 'selectRoute', routeIndex: 0 });
    for (let i = 0; i < s.cachedSteps.length; i++) {
      s = dispatch(s, { type: 'stepForward' });
    }
    s = dispatch(s, { type: 'advancePhase' });

    expect(getItemSpy!.mock.calls.length).toBe(0);
    expect(setItemSpy!.mock.calls.length).toBe(0);
    expect(removeItemSpy!.mock.calls.length).toBe(0);
  });
});

// ── #7: sessionStats in-memory only ──
describe('#7 sessionStats are in-memory only', () => {
  test('5 correct guesses yield correct=5, then a reload resets to zero', () => {
    const bag = bagForTargetOpener('ms2', false);
    let s = createSession(bag);
    for (let i = 0; i < 5; i++) {
      s = dispatch(s, { type: 'setGuess', opener: 'ms2', mirror: false });
      s = dispatch(s, { type: 'submitGuess' });
      expect(s.correct).toBe(true);
      // End of reveal2 cycles through newSession but in this minimal path
      // we use newSession directly to loop. The reducer preserves stats
      // across sessions while running in-memory.
      s = dispatch(s, { type: 'newSession', bag1: bag, bag2: bag });
    }
    // After 5 loops, correct should be 5, streak 5, total 5.
    expect(s.sessionStats.correct).toBe(5);
    expect(s.sessionStats.total).toBe(5);
    expect(s.sessionStats.streak).toBe(5);

    // "Reload" — simulate the tab closing and reopening. Because stats are
    // in-memory only, a fresh createSession (not via reducer) must show zero.
    const reloaded = createSession(bag);
    expect(reloaded.sessionStats.correct).toBe(0);
    expect(reloaded.sessionStats.total).toBe(0);
    expect(reloaded.sessionStats.streak).toBe(0);
  });

  test('an incorrect guess resets streak but not total/correct', () => {
    let s = createSession(bagForTargetOpener('ms2', false));
    s = dispatch(s, { type: 'setGuess', opener: 'ms2', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    expect(s.sessionStats.streak).toBe(1);

    // Wrong guess: use a bag where honey_cup CANNOT build (both sides fail).
    const bagHoneyFails: PieceType[] = ['I', 'Z', 'S', 'T', 'O', 'L', 'J'];
    s = dispatch(s, { type: 'newSession', bag1: bagHoneyFails });
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    expect(s.correct).toBe(false);
    expect(s.sessionStats.streak).toBe(0);
    expect(s.sessionStats.total).toBe(2);
    expect(s.sessionStats.correct).toBe(1);
  });
});

// ── #8: New bag on advance past reveal2 ──
describe('#8 advance past reveal2 generates new bags', () => {
  test('reveal2 → advancePhase yields fresh bag1 & bag2 and resets phase', () => {
    const bag1A = bagForTargetOpener('ms2', false);
    const bag2A = bagForTargetOpener('honey_cup', false);
    let s = createSession(bag1A, bag2A);
    s = dispatch(s, { type: 'setGuess', opener: 'ms2', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    s = dispatch(s, { type: 'advancePhase' }); // reveal1 → guess2
    s = dispatch(s, { type: 'selectRoute', routeIndex: 0 });
    expect(s.phase).toBe('reveal2');
    s = dispatch(s, { type: 'advancePhase' }); // reveal2 → new guess1

    expect(s.phase).toBe('guess1');
    expect(s.guess).toBeNull();
    expect(s.correct).toBeNull();
    expect(s.step).toBe(0);
    expect(boardHash(s.board)).toBe(boardHash(emptyBoard()));
    expect(s.bag1.length).toBe(7);
    expect(s.bag2.length).toBe(7);
    // Stats still persist from the previous cycle.
    expect(s.sessionStats.total).toBe(1);
  });
});

// ── #9: Mirror toggle during guess1 ──
describe('#9 toggleMirror does not mutate bag or board', () => {
  test('toggling mirror only changes guess.mirror', () => {
    const bag = bagForTargetOpener('ms2', false);
    let s = createSession(bag);
    s = dispatch(s, { type: 'setGuess', opener: 'ms2', mirror: false });
    const bagBefore = [...s.bag1];
    const boardBefore = boardHash(s.board);
    s = dispatch(s, { type: 'toggleMirror' });
    expect(s.guess?.mirror).toBe(true);
    expect(s.bag1).toEqual(bagBefore);
    expect(boardHash(s.board)).toBe(boardBefore);
    s = dispatch(s, { type: 'toggleMirror' });
    expect(s.guess?.mirror).toBe(false);
    expect(s.bag1).toEqual(bagBefore);
  });
});

// ── #10: Golden bag1 board match ──
describe('#10 bag1 final board matches golden data', () => {
  for (const id of OPENER_IDS) {
    for (const mirror of MIRRORS) {
      test(`${id} mirror=${mirror}: reveal1 final board equals golden`, () => {
        const bag = bagForTargetOpener(id, mirror);
        let s = createSession(bag);
        s = dispatch(s, { type: 'setGuess', opener: id, mirror });
        s = dispatch(s, { type: 'submitGuess' });
        for (let i = 0; i < s.cachedSteps.length; i++) {
          s = dispatch(s, { type: 'stepForward' });
        }
        expect(boardHash(s.board)).toBe(boardHash(goldenBag1Board(id, mirror)));
      });
    }
  }
});

// ── #11: Exhaustive cross-product smoke ──
describe('#11 cross-product smoke: opener × mirror × route', () => {
  test('every (opener, mirror, route) full cycle yields a gravity-valid board', () => {
    let cases = 0;
    for (const id of OPENER_IDS) {
      for (const mirror of MIRRORS) {
        const bag1 = bagForTargetOpener(id, mirror);
        const routes = getBag2Routes(id, mirror);
        for (let r = 0; r < routes.length; r++) {
          const bag2 = bagForTargetOpener(id, mirror); // any valid bag
          let s = createSession(bag1, bag2);
          s = dispatch(s, { type: 'setGuess', opener: id, mirror });
          s = dispatch(s, { type: 'submitGuess' });
          expect(s.correct).toBe(true);
          // Auto-step through reveal1.
          for (let i = 0; i < s.cachedSteps.length; i++) {
            s = dispatch(s, { type: 'stepForward' });
          }
          s = dispatch(s, { type: 'advancePhase' });
          s = dispatch(s, { type: 'selectRoute', routeIndex: r });
          // Walk through reveal2 (may be shorter than bag2 if no route found).
          for (let i = 0; i < s.cachedSteps.length; i++) {
            s = dispatch(s, { type: 'stepForward' });
          }
          // Final board: no floating pieces, reasonable cell count.
          const floating = findFloatingPieces(s.board);
          expect(floating.length).toBe(0);
          let cellCount = 0;
          for (const row of s.board) for (const c of row) if (c !== null) cellCount++;
          expect(cellCount).toBeGreaterThanOrEqual(4 * 6); // at least 6 pieces worth
          cases++;
        }
      }
    }
    // Sanity: we should have run a non-trivial number of cases.
    expect(cases).toBeGreaterThanOrEqual(16); // 4 openers × 2 mirrors × >=2 routes
  });
});

// ── #12: Reset via newSession mid-phase ──
describe('#12 newSession mid-phase resets cleanly', () => {
  test('from reveal1, newSession returns to guess1 with fresh bags', () => {
    const bag1 = bagForTargetOpener('ms2', false);
    let s = createSession(bag1);
    s = dispatch(s, { type: 'setGuess', opener: 'ms2', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    s = dispatch(s, { type: 'stepForward' });
    s = dispatch(s, { type: 'stepForward' });
    expect(s.phase).toBe('reveal1');
    expect(s.step).toBe(2);

    const newBag: PieceType[] = ['T', 'I', 'Z', 'S', 'O', 'J', 'L'];
    s = dispatch(s, { type: 'newSession', bag1: newBag, bag2: newBag });
    expect(s.phase).toBe('guess1');
    expect(s.guess).toBeNull();
    expect(s.correct).toBeNull();
    expect(s.step).toBe(0);
    expect(s.board).toEqual(emptyBoard());
    expect(s.bag1).toEqual(newBag);
  });

  test('from guess2, newSession returns to guess1', () => {
    const bag1 = bagForTargetOpener('stray_cannon', false);
    let s = createSession(bag1);
    s = dispatch(s, { type: 'setGuess', opener: 'stray_cannon', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    s = dispatch(s, { type: 'advancePhase' });
    expect(s.phase).toBe('guess2');
    s = dispatch(s, { type: 'newSession' });
    expect(s.phase).toBe('guess1');
    expect(s.routeGuess).toBe(-1);
  });
});

// ── #13: Bag 1 piece count per opener ──
describe('#13 bag 1 piece count per opener', () => {
  test('honey_cup and gamushiro Bag 1 have 7 pieces; ms2 and stray_cannon have 6', () => {
    // This is verified at the PLACEMENT DATA layer — the reveal1 cachedSteps
    // must have the expected length for each opener.
    const expectedCount: Record<OpenerID, number> = {
      honey_cup: 7,
      gamushiro: 7,
      ms2: 6,
      stray_cannon: 6,
    };
    for (const id of OPENER_IDS) {
      for (const mirror of MIRRORS) {
        const bag = bagForTargetOpener(id, mirror);
        let s = createSession(bag);
        s = dispatch(s, { type: 'setGuess', opener: id, mirror });
        s = dispatch(s, { type: 'submitGuess' });
        expect(s.cachedSteps.length).toBe(expectedCount[id]);
      }
    }
  });

  test('gamushiro form_2 route uses reduced bag2 hold pattern', () => {
    // Gamushiro form_2 canSelect requires O to be after J, S, L in bag2.
    const bag2Form2: PieceType[] = ['J', 'S', 'L', 'Z', 'I', 'T', 'O'];
    const best = bestBag2Route('gamushiro', false, bag2Form2);
    expect(best.routeIndex).toBe(1); // form_2
    expect(best.route.holdPlacement).not.toBeNull();
  });
});

// ── #14: Keyboard action coverage ──
describe('#14 reducer action coverage', () => {
  test('every declared action type was exercised in this test file', () => {
    // Ensure at least one test above touched each action. togglePlayMode and
    // pieceDrop are exercised in #4; others throughout. This test is the
    // sentinel that keeps future additions honest.
    const missing: Action['type'][] = [];
    for (const a of ACTION_TYPES) {
      if (!exercisedActions.has(a)) missing.push(a);
    }
    expect(missing).toEqual([]);
  });

  test('the reducer rejects out-of-phase actions gracefully', () => {
    // setGuess during reveal1 is a no-op.
    const bag = bagForTargetOpener('ms2', false);
    let s = createSession(bag);
    s = dispatch(s, { type: 'setGuess', opener: 'ms2', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    const snapshot = { ...s };
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: true });
    expect(s.guess).toEqual(snapshot.guess);
    // toggleMirror during reveal1 is a no-op.
    s = dispatch(s, { type: 'toggleMirror' });
    expect(s.guess).toEqual(snapshot.guess);
    // selectRoute during reveal1 is a no-op.
    s = dispatch(s, { type: 'selectRoute', routeIndex: 0 });
    expect(s.phase).toBe('reveal1');
  });
});
