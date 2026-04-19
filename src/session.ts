/**
 * src/session.ts — L9 unified session reducer
 *
 * Single state machine that replaces the four legacy modes (onboarding,
 * quiz, visualizer, drill). The Session encodes a bag, a guess, and a
 * build — every "mode" in the old code is just a different lens on those.
 *
 * Design contract is fixed by `tests/diag-l9-session.test.ts` (Phase 2.5
 * empirical proof). Any change here must keep those 44 tests green.
 *
 * Invariants (L10 surprises documented in
 * docs/superpowers/specs/2026-04-09-l9-session-redesign.md §7):
 *   1. "correct" uses canBuild || canBuildMirror — NEVER bestOpener.
 *   2. MS2/Gamushiro are interchangeable for correctness (shared rule).
 *   3. Wrong-guess reveal shows the authoritative bestOpener answer.
 *   4. newSession keeps sessionStats; createSession() zeros them.
 *   5. toggleMirror: guess1 flips mirror; reveal1 auto delegates to browseOpener.
 *   6. pieceDrop compares cells via stringified {col,row} key sets.
 *   7. selectRoute uses getBag2Sequence as single source of truth
 *      (handles Bag 1 reduction + joint build internally).
 *
 * The reducer is a pure function: NO side effects, NO localStorage, NO
 * persistence. Stats live in memory only — closing the tab IS the reset.
 */

import {
  emptyBoard,
  buildSteps,
  cloneBoard,
  stampCells,
  findAllPlacements,
  lockAndClear,
  replayPcSteps,
  type Board,
  type Step,
} from './core/engine.ts';
import {
  spawnPiece,
  tryMove,
  tryRotate,
  hardDrop as coreHardDrop,
  getPieceCells,
  type ActivePiece,
} from './core/srs.ts';
import type { PieceType } from './core/types.ts';
import { ALL_PIECE_TYPES } from './core/types.ts';
import type { OpenerID } from './openers/types.ts';
import {
  OPENER_PLACEMENT_DATA,
  mirrorPlacementData,
  type OpenerPlacementData,
} from './openers/placements.ts';
import { getBag2Routes } from './openers/bag2-routes.ts';
import { getBag2Sequence } from './openers/sequences.ts';
import { OPENERS, bestOpener, bestBag2Route } from './openers/decision.ts';
import { getPcSolutions } from './openers/bag3-pc.ts';

// ── Public types ──────────────────────────────────────────────────────────

export type Phase = 'guess1' | 'reveal1' | 'guess2' | 'reveal2' | 'guess3' | 'reveal3';
export type PlayMode = 'auto' | 'manual';

// ── Phase metadata table (L9: single source of truth for phase properties) ──

interface PhaseMeta {
  kind: 'guess' | 'reveal';
  bag: 1 | 2 | 3;
}

const PHASE_META = {
  guess1:  { kind: 'guess',  bag: 1 },
  reveal1: { kind: 'reveal', bag: 1 },
  guess2:  { kind: 'guess',  bag: 2 },
  reveal2: { kind: 'reveal', bag: 2 },
  guess3:  { kind: 'guess',  bag: 3 },
  reveal3: { kind: 'reveal', bag: 3 },
} as const satisfies Record<Phase, PhaseMeta>;

export function isRevealPhase(phase: Phase): boolean {
  return PHASE_META[phase].kind === 'reveal';
}

export function isGuessPhase(phase: Phase): boolean {
  return PHASE_META[phase].kind === 'guess';
}

export interface Guess {
  opener: OpenerID;
  mirror: boolean;
}

export interface SessionStats {
  total: number;
  correct: number;
  streak: number;
}

export interface Session {
  bag1: PieceType[];
  bag2: PieceType[];
  phase: Phase;
  guess: Guess | null;
  correct: boolean | null;
  board: Board;
  step: number;
  playMode: PlayMode;
  sessionStats: SessionStats;
  /**
   * Derived once on reveal1 entry, cached for stepping. This is the "auto"
   * sequence for the resolved opener. For 'reveal2' this stores the Bag 2
   * steps layered on top of the Bag 1 final board.
   */
  cachedSteps: Step[];
  /** Board state at step 0 (before any cached step). emptyBoard() for
   *  reveal1/reveal2, postTstBoard for reveal3. stepBackward to 0 restores
   *  this instead of hardcoding emptyBoard(). */
  baseBoard: Board;
  /** Route index selected during guess2 (-1 if not yet selected). */
  routeGuess: number;
  /** PC solution index selected during guess3 (-1 if not yet selected). */
  pcSolutionIndex: number;

  // ── Reframing A+ fields (manual-play in-flight state) ──
  /**
   * In-flight piece in manual mode. null in auto mode or outside a reveal
   * phase. The reducer is the single source of truth — there is no closure
   * holding a copy. Spawned on:
   *   - submitGuess → reveal1 (if playMode === 'manual')
   *   - togglePlayMode auto → manual (if currently in a reveal)
   *   - selectRoute → reveal2 (if playMode === 'manual')
   *   - hardDrop accept (spawns next cachedSteps[step].piece)
   * Cleared on: togglePlayMode → auto, advancePhase, newSession.
   */
  activePiece: ActivePiece | null;
  /**
   * User-held piece type (one-shot per step). Survives across steps until
   * swapped. Independent of the doctrinal hold displayed in the right panel.
   */
  holdPiece: PieceType | null;
  /** True after the user held on the current step; resets on step advance. */
  holdUsed: boolean;
}

/**
 * Discriminated union of every reducer action.
 *
 *   - 10 session-level: newSession, setGuess, toggleMirror, submitGuess,
 *     stepForward, stepBackward, advancePhase, togglePlayMode, selectRoute,
 *     selectPcSolution
 *   - 5 manual-play: movePiece, rotatePiece, hardDrop, hold, softDrop
 *   - 2 intent actions: primary, pick
 *
 * Intent actions (`primary`, `pick`) let the keyboard handler stay dumb —
 * it maps physical keys to intents and the reducer interprets them based
 * on the full Session state. This prevents the bug class where
 * src/input/keyboard.ts becomes a partial interpreter of Session state
 * and grows with every new phase variant.
 */
export type SessionAction =
  | { type: 'newSession'; bag1?: PieceType[]; bag2?: PieceType[] }
  | { type: 'setGuess'; opener: OpenerID; mirror: boolean }
  | { type: 'toggleMirror' }
  | { type: 'submitGuess' }
  | { type: 'stepForward' }
  | { type: 'stepBackward' }
  | { type: 'advancePhase' }
  | { type: 'togglePlayMode' }
  | { type: 'selectRoute'; routeIndex: number }
  | { type: 'selectPcSolution'; solutionIndex: number }
  | { type: 'browseOpener'; opener: OpenerID; mirror: boolean }
  // ── Reframing A+ manual-play actions ──
  | { type: 'movePiece'; dx: number; dy: number }
  | { type: 'rotatePiece'; direction: 1 | -1 }
  | { type: 'hardDrop' }
  | { type: 'hold' }
  | { type: 'softDrop' }
  // ── Intent actions (keyboard dispatches these; reducer interprets) ──
  | { type: 'primary' }
  | { type: 'pick'; index: number };

/**
 * The opener order that `pick` maps to in guess1. Position N corresponds
 * to digit key (N+1). Kept in sync with src/input/keyboard.ts and with the
 * rule-card display order in src/renderer/session.ts.
 */
export const OPENER_BY_PICK: OpenerID[] = [
  'stray_cannon',
  'honey_cup',
  'gamushiro',
  'ms2',
];

// ── Runtime invariants ────────────────────────────────────────────────────

/**
 * Thrown when a Session violates a runtime invariant. Catching this in
 * production is a bug — the reducer should never produce an invalid state.
 */
export class InvariantViolation extends Error {
  constructor(public readonly rule: string, public readonly session: Session) {
    super(`Session invariant violated: ${rule}`);
    this.name = 'InvariantViolation';
  }
}

/**
 * Assert that a Session satisfies every invariant the design promises.
 * Called by the reducer wrapper after every transition, so any bug that
 * produces an invalid state throws at the reducer boundary instead of
 * silently corrupting subsequent reductions or the render output.
 *
 * Spec: tests/diag-l9-invariants.test.ts (Phase 2.5 empirical proof).
 */
export function assertSessionInvariants(s: Session): void {
  // ── 1. step is in [0, cachedSteps.length] ──
  if (s.step < 0) {
    throw new InvariantViolation(`step (${s.step}) must be >= 0`, s);
  }
  if (s.step > s.cachedSteps.length) {
    throw new InvariantViolation(
      `step (${s.step}) must be <= cachedSteps.length (${s.cachedSteps.length})`,
      s,
    );
  }

  // ── 2. reveal phases require non-empty cachedSteps ──
  // Catches Bug #2's root effect: selectRoute with an out-of-range routeIndex
  // produced empty cachedSteps but still transitioned to reveal2.
  if (isRevealPhase(s.phase) && s.cachedSteps.length === 0) {
    throw new InvariantViolation(
      `phase=${s.phase} but cachedSteps is empty — invalid transition`,
      s,
    );
  }

  // ── 3. reveal2 routeGuess within the opener's route list ──
  if (s.phase === 'reveal2') {
    if (s.guess === null) {
      throw new InvariantViolation('reveal2 requires a non-null guess', s);
    }
    const routes = getBag2Routes(s.guess.opener, s.guess.mirror);
    if (s.routeGuess < 0 || s.routeGuess >= routes.length) {
      throw new InvariantViolation(
        `reveal2 routeGuess (${s.routeGuess}) out of range [0, ${routes.length})`,
        s,
      );
    }
  }

  // ── 3b. reveal3 pcSolutionIndex within PC solutions list ──
  if (s.phase === 'reveal3') {
    if (s.guess === null) {
      throw new InvariantViolation('reveal3 requires a non-null guess', s);
    }
    const pcSolutions = getPcSolutions(s.guess.opener, s.guess.mirror);
    if (s.pcSolutionIndex < 0 || s.pcSolutionIndex >= pcSolutions.length) {
      throw new InvariantViolation(
        `reveal3 pcSolutionIndex (${s.pcSolutionIndex}) out of range [0, ${pcSolutions.length})`,
        s,
      );
    }
  }

  // ── 4. sessionStats non-negative, finite, and consistent ──
  const { total, correct, streak } = s.sessionStats;
  // Finite check first — NaN/Infinity bypass < > comparisons because
  // IEEE754 comparisons with NaN always return false.
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(correct) ||
    !Number.isFinite(streak)
  ) {
    throw new InvariantViolation(
      'sessionStats must be finite numbers (no NaN/Infinity)',
      s,
    );
  }
  if (total < 0 || correct < 0 || streak < 0) {
    throw new InvariantViolation('sessionStats has a negative value', s);
  }
  if (correct > total) {
    throw new InvariantViolation(
      `sessionStats.correct (${correct}) > total (${total})`,
      s,
    );
  }
  if (streak > correct) {
    throw new InvariantViolation(
      `sessionStats.streak (${streak}) > correct (${correct})`,
      s,
    );
  }

  // ── 5. null guess implies guess1 phase (all other phases require a guess) ──
  if (s.guess === null && s.phase !== 'guess1') {
    throw new InvariantViolation(
      `phase=${s.phase} requires a guess, but guess is null`,
      s,
    );
  }

  // ── 6. Manual reveal with a pending step must have activePiece (unless
  //      the user just used hold-with-peek at the final step). ──
  const isManualReveal = isRevealPhase(s.phase) && s.playMode === 'manual';
  if (
    isManualReveal &&
    s.step < s.cachedSteps.length &&
    s.activePiece === null &&
    !s.holdUsed
  ) {
    throw new InvariantViolation(
      'manual reveal with a pending step has null activePiece (and hold not used)',
      s,
    );
  }

  // ── 7. Auto mode must have null activePiece + null holdPiece + !holdUsed ──
  if (s.playMode === 'auto' && s.activePiece !== null) {
    throw new InvariantViolation('auto mode must not have an activePiece', s);
  }
  if (s.playMode === 'auto' && s.holdPiece !== null) {
    throw new InvariantViolation('auto mode must not have a holdPiece', s);
  }
  if (s.playMode === 'auto' && s.holdUsed) {
    throw new InvariantViolation('auto mode must have holdUsed === false', s);
  }

  // ── 8. Non-reveal phases have no in-flight play state ──
  if (isGuessPhase(s.phase)) {
    if (s.activePiece !== null) {
      throw new InvariantViolation(`${s.phase} must not have an activePiece`, s);
    }
    if (s.holdPiece !== null) {
      throw new InvariantViolation(`${s.phase} must not have a holdPiece`, s);
    }
    if (s.holdUsed) {
      throw new InvariantViolation(`${s.phase} must have holdUsed === false`, s);
    }
  }

  // ── 9. bag1 and bag2 are valid 7-piece permutations ──
  // TypeScript guarantees the piece TYPE but nothing prevents wrong length,
  // duplicates, or externally mutated values. Validate shape explicitly.
  for (const name of ['bag1', 'bag2'] as const) {
    const bag = s[name];
    if (bag.length !== 7) {
      throw new InvariantViolation(
        `${name} must have exactly 7 pieces, got ${bag.length}`,
        s,
      );
    }
    const seen = new Set<PieceType>();
    for (const p of bag) {
      if (!ALL_PIECE_TYPES.includes(p)) {
        throw new InvariantViolation(
          `${name} contains invalid piece type: ${String(p)}`,
          s,
        );
      }
      if (seen.has(p)) {
        throw new InvariantViolation(
          `${name} has duplicate piece: ${p}`,
          s,
        );
      }
      seen.add(p);
    }
  }
}

export interface CreateSessionOptions {
  bag1?: PieceType[];
  bag2?: PieceType[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Deterministic pseudo-random bag generator. Used ONLY when a caller does
 * not supply an explicit bag. The reducer is otherwise free of randomness
 * so tests stay deterministic by always passing explicit bags.
 *
 * Marked exported so renderers/tests that need a fresh bag without an
 * explicit list can share the same generator instead of inventing one.
 */
let _determinismCounter = 0;
export function nextDeterministicBag(): PieceType[] {
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

/**
 * Compute the Bag 1 auto-sequence for a given (opener, mirror).
 * Pure data helper — no routing, no phase awareness.
 */
export function computeSteps(
  opener: OpenerID,
  mirror: boolean,
): Step[] {
  const raw = OPENER_PLACEMENT_DATA[opener];
  const data: OpenerPlacementData = mirror ? mirrorPlacementData(raw) : raw;
  return buildSteps(data.placements);
}

// ── Constructor ───────────────────────────────────────────────────────────

/**
 * Cold-start constructor. Returns a fresh session with **zeroed**
 * sessionStats — used on page load. The `newSession` action takes the
 * same shape but preserves stats and playMode from the previous state.
 *
 * Backwards compatible with the diag test's positional `(bag1, bag2)`
 * call style as well as the spec's `({ bag1, bag2 })` options style.
 */
export function createSession(
  opts?: CreateSessionOptions | PieceType[],
  bag2Arg?: PieceType[],
): Session {
  let bag1: PieceType[] | undefined;
  let bag2: PieceType[] | undefined;
  if (Array.isArray(opts)) {
    bag1 = opts;
    bag2 = bag2Arg;
  } else if (opts) {
    bag1 = opts.bag1;
    bag2 = opts.bag2;
  }
  return {
    bag1: bag1 ?? nextDeterministicBag(),
    bag2: bag2 ?? nextDeterministicBag(),
    phase: 'guess1',
    guess: null,
    correct: null,
    board: emptyBoard(),
    baseBoard: emptyBoard(),
    step: 0,
    playMode: 'auto',
    sessionStats: { total: 0, correct: 0, streak: 0 },
    cachedSteps: [],
    routeGuess: -1,
    pcSolutionIndex: -1,
    activePiece: null,
    holdPiece: null,
    holdUsed: false,
  };
}

/** Spawn the active piece for the current cachedStep, or null. */
function spawnForCurrentStep(
  cachedSteps: Step[],
  step: number,
): ActivePiece | null {
  const next = cachedSteps[step];
  if (!next) return null;
  return spawnPiece(next.piece);
}

/** Compute the post-TST board for a given (opener, mirror, route). */
function computePostTstBoard(opener: OpenerID, mirror: boolean, routeIndex: number): Board | null {
  const seq = getBag2Sequence(opener, mirror, routeIndex);
  if (!seq || seq.fullSteps.length === 0) return null;
  const bag2FinalBoard = seq.fullSteps[seq.fullSteps.length - 1]!.board;
  const tPlacements = findAllPlacements(bag2FinalBoard, 'T');
  for (const tp of tPlacements) {
    const result = lockAndClear(bag2FinalBoard, tp.piece);
    if (result.linesCleared === 3) return result.board;
  }
  return null;
}

// ── Reducer ───────────────────────────────────────────────────────────────

/**
 * Pure reducer. NO side effects, NO localStorage, NO persistence. The
 * design contract is the diag-l9-session test file — any change here
 * must keep those 44 tests green.
 *
 * This is the RAW reducer — it doesn't run invariant assertions. The
 * exported `sessionReducer` wraps this with a post-reduction
 * `assertSessionInvariants` call. Internal recursive dispatches (e.g.,
 * `primary` → `advancePhase`, `pick` → `selectRoute`) use `_rawSessionReducer`
 * directly to avoid double-checking invariants that are already asserted
 * when the top-level action returns.
 */
function _rawSessionReducer(state: Session, action: SessionAction): Session {
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
      if (state.guess === null) return state;
      if (state.phase === 'guess1') {
        return {
          ...state,
          guess: { ...state.guess, mirror: !state.guess.mirror },
        };
      }
      if (state.phase === 'reveal1' && state.playMode === 'auto') {
        return _rawSessionReducer(state, {
          type: 'browseOpener',
          opener: state.guess.opener,
          mirror: !state.guess.mirror,
        });
      }
      return state;
    }

    case 'submitGuess': {
      if (state.phase !== 'guess1' || state.guess === null) return state;

      // L10 finding #1: correctness is the buildable relation, NOT
      // bestOpener. The guess is correct iff the chosen (opener, mirror)
      // can actually be built from state.bag1.
      //
      // L10 finding #2: MS2/Gamushiro interchangeability is implied
      // here because they share canBuild/canBuildMirror predicates,
      // so guessing either is correct whenever either is correct.
      const guessedDef = OPENERS[state.guess.opener];
      const isCorrect = state.guess.mirror
        ? guessedDef.canBuildMirror(state.bag1)
        : guessedDef.canBuild(state.bag1);

      // L10 finding #3: on a wrong guess, the reveal still shows a
      // build — but of the AUTHORITATIVE bestOpener answer, so the user
      // sees what was actually correct rather than a misleading demo.
      const showOpener: OpenerID = isCorrect
        ? state.guess.opener
        : bestOpener(state.bag1).opener.id;
      const showMirror: boolean = isCorrect
        ? state.guess.mirror
        : bestOpener(state.bag1).mirror;

      const cachedSteps = computeSteps(showOpener, showMirror);

      const newStats: SessionStats = {
        total: state.sessionStats.total + 1,
        correct: state.sessionStats.correct + (isCorrect ? 1 : 0),
        streak: isCorrect ? state.sessionStats.streak + 1 : 0,
      };

      // SPAWN HOOK (Reframing A+): entering reveal1 in manual mode
      // spawns the first active piece so the user can start placing.
      const activePiece =
        state.playMode === 'manual'
          ? spawnForCurrentStep(cachedSteps, 0)
          : null;

      return {
        ...state,
        phase: 'reveal1',
        correct: isCorrect,
        guess: { opener: showOpener, mirror: showMirror },
        cachedSteps,
        step: 0,
        board: emptyBoard(),
        baseBoard: emptyBoard(),
        sessionStats: newStats,
        activePiece,
        holdPiece: null,
        holdUsed: false,
      };
    }

    case 'stepForward': {
      if (!isRevealPhase(state.phase)) return state;
      if (state.step >= state.cachedSteps.length) return state;
      const nextStep = state.step + 1;
      const board = state.cachedSteps[nextStep - 1]!.board;
      return { ...state, step: nextStep, board: cloneBoard(board) };
    }

    case 'stepBackward': {
      if (!isRevealPhase(state.phase)) return state;
      if (state.step <= 0) return state;
      const prevStep = state.step - 1;
      const board =
        prevStep === 0
          ? cloneBoard(state.baseBoard)
          : cloneBoard(state.cachedSteps[prevStep - 1]!.board);
      return { ...state, step: prevStep, board };
    }

    case 'advancePhase': {
      // reveal1 → guess2 (user now picks bag2 route)
      if (state.phase === 'reveal1') {
        // Jump board to bag1 final (in case user hasn't auto-stepped through).
        const finalBoard =
          state.cachedSteps.length > 0
            ? cloneBoard(state.cachedSteps[state.cachedSteps.length - 1]!.board)
            : emptyBoard();
        // CLEAR HOOK (Reframing A+): leaving a reveal phase drops the
        // in-flight piece and hold state. guess2 is not a manual-play phase.
        return {
          ...state,
          phase: 'guess2',
          board: finalBoard,
          step: state.cachedSteps.length,
          activePiece: null,
          holdPiece: null,
          holdUsed: false,
        };
      }
      // reveal2 → guess3 (if PC solutions exist AND board is compatible).
      // PC solutions are designed for a specific post-TST board shape.
      // Not all routes produce the same shape (routes 3-7 differ from 0-2
      // for HC), so we must verify compatibility before entering guess3.
      if (state.phase === 'reveal2') {
        const pcSolutions = state.guess
          ? getPcSolutions(state.guess.opener, state.guess.mirror)
          : [];
        const restartState = {
          ...createSession(),
          playMode: state.playMode,
          sessionStats: state.sessionStats,
        };
        if (pcSolutions.length === 0) return restartState;
        // Check board compatibility: post-TST board must exist and
        // at least one PC solution must replay without conflict.
        const postTstBoard = computePostTstBoard(
          state.guess!.opener, state.guess!.mirror, state.routeGuess,
        );
        if (!postTstBoard) return restartState;
        let anyCompatible = false;
        for (const sol of pcSolutions) {
          try {
            replayPcSteps(postTstBoard, sol.placements);
            anyCompatible = true;
            break;
          } catch { /* board mismatch — try next */ }
        }
        if (!anyCompatible) return restartState;
        const finalBoard =
          state.cachedSteps.length > 0
            ? cloneBoard(state.cachedSteps[state.cachedSteps.length - 1]!.board)
            : state.board;
        return {
          ...state,
          phase: 'guess3',
          board: finalBoard,
          step: 0,
          cachedSteps: [],
          pcSolutionIndex: -1,
          activePiece: null,
          holdPiece: null,
          holdUsed: false,
        };
      }
      // reveal3 → new guess1 with fresh bags (stats carry forward).
      if (state.phase === 'reveal3') {
        return {
          ...createSession(),
          playMode: state.playMode,
          sessionStats: state.sessionStats,
        };
      }
      // guess2 → reveal2 requires selectRoute (handled by selectRoute).
      return state;
    }

    case 'selectRoute': {
      if (state.guess === null) return state;
      if (state.phase !== 'guess2' && !(state.phase === 'reveal2' && state.playMode === 'auto')) return state;
      if (state.phase === 'reveal2' && state.routeGuess === action.routeIndex) return state;
      // Bounds check (Bug #2 fix): selectRoute used to accept any routeIndex
      // and silently produce empty cachedSteps. Now: reject invalid indices.
      // Number.isInteger catches NaN, Infinity, and float values like 0.5
      // that would otherwise pass the < 0 and >= length checks.
      const routes = getBag2Routes(state.guess.opener, state.guess.mirror);
      if (
        !Number.isInteger(action.routeIndex) ||
        action.routeIndex < 0 ||
        action.routeIndex >= routes.length
      ) {
        return state;
      }
      // Use getBag2Sequence as single source of truth — it handles
      // Bag 1 reduction (gamushiro form_2) and joint build internally.
      const seq = getBag2Sequence(
        state.guess.opener,
        state.guess.mirror,
        action.routeIndex,
      );
      if (!seq) return state;

      // Build route steps with TST appended. Use fullSteps (includes hold
      // placement) so the board ancestry matches bag1FinalBoard.
      const routeSteps = [...seq.fullSteps];
      if (routeSteps.length > 0) {
        const bag2FinalBoard = routeSteps[routeSteps.length - 1]!.board;
        const tPlacements = findAllPlacements(bag2FinalBoard, 'T');
        for (const tp of tPlacements) {
          const result = lockAndClear(bag2FinalBoard, tp.piece);
          if (result.linesCleared === 3) {
            routeSteps.push({
              piece: 'T',
              board: result.board,
              newCells: getPieceCells(tp.piece),
              hint: 'T-Spin Triple!',
              linesCleared: 3,
            });
            break;
          }
        }
      }

      // SPAWN HOOK (Reframing A+): entering reveal2 in manual mode
      // spawns the first active piece for the bag2 sequence.
      const activePiece =
        state.playMode === 'manual'
          ? spawnForCurrentStep(routeSteps, 0)
          : null;
      const bag1Board = cloneBoard(seq.bag1FinalBoard);
      return {
        ...state,
        phase: 'reveal2',
        routeGuess: action.routeIndex,
        cachedSteps: routeSteps,
        step: 0,
        board: bag1Board,
        baseBoard: cloneBoard(seq.bag1FinalBoard),
        activePiece,
        holdPiece: null,
        holdUsed: false,
      };
    }

    case 'selectPcSolution': {
      if (state.guess === null) return state;
      if (state.phase !== 'guess3' && !(state.phase === 'reveal3' && state.playMode === 'auto')) return state;
      if (state.phase === 'reveal3' && state.pcSolutionIndex === action.solutionIndex) return state;

      const pcSolutions = getPcSolutions(state.guess.opener, state.guess.mirror);
      if (
        !Number.isInteger(action.solutionIndex) ||
        action.solutionIndex < 0 ||
        action.solutionIndex >= pcSolutions.length
      ) {
        return state;
      }

      // Recompute post-TST board (deterministic from opener/mirror/route).
      const postTstBoard = computePostTstBoard(
        state.guess.opener, state.guess.mirror, state.routeGuess,
      );
      if (!postTstBoard) return state;

      const solution = pcSolutions[action.solutionIndex]!;
      const pcSteps = replayPcSteps(postTstBoard, solution.placements);

      const activePiece =
        state.playMode === 'manual'
          ? spawnForCurrentStep(pcSteps, 0)
          : null;

      return {
        ...state,
        phase: 'reveal3',
        pcSolutionIndex: action.solutionIndex,
        cachedSteps: pcSteps,
        step: 0,
        board: cloneBoard(postTstBoard),
        baseBoard: cloneBoard(postTstBoard),
        activePiece,
        holdPiece: null,
        holdUsed: false,
      };
    }

    case 'browseOpener': {
      if (state.phase !== 'reveal1') return state;
      if (state.playMode !== 'auto') return state;
      if (
        state.guess !== null &&
        state.guess.opener === action.opener &&
        state.guess.mirror === action.mirror
      ) {
        return state;
      }
      const cachedSteps = computeSteps(action.opener, action.mirror);
      return {
        ...state,
        guess: { opener: action.opener, mirror: action.mirror },
        cachedSteps,
        step: 0,
        board: emptyBoard(),
        baseBoard: emptyBoard(),
        correct: null,
        activePiece: null,
        holdPiece: null,
        holdUsed: false,
      };
    }

    case 'togglePlayMode': {
      const nextMode = state.playMode === 'auto' ? 'manual' : 'auto';
      // SPAWN/CLEAR HOOK (Reframing A+):
      //   - auto→manual in a reveal phase spawns the current step's piece
      //   - manual→auto clears activePiece + hold state
      //   - toggle outside reveal (e.g., during guess1) does NOT spawn
      const isReveal = isRevealPhase(state.phase);
      const activePiece =
        nextMode === 'manual' && isReveal
          ? spawnForCurrentStep(state.cachedSteps, state.step)
          : null;
      return {
        ...state,
        playMode: nextMode,
        activePiece,
        holdPiece: nextMode === 'manual' ? state.holdPiece : null,
        holdUsed: false,
      };
    }

    // ── Reframing A+ manual-play actions ──

    case 'movePiece': {
      if (!isRevealPhase(state.phase)) return state;
      if (state.playMode !== 'manual') return state;
      if (state.activePiece === null) return state;
      // Defense-in-depth: ensure dx/dy are integers before passing to
      // tryMove, which would otherwise silently reject via floating-point
      // board indexing failures. Explicit guard is clearer + consistent
      // with selectRoute / pick bounds checks.
      if (!Number.isInteger(action.dx) || !Number.isInteger(action.dy)) {
        return state;
      }
      const moved = tryMove(state.board, state.activePiece, action.dx, action.dy);
      if (!moved) return state;
      return { ...state, activePiece: moved };
    }

    case 'softDrop': {
      // Alias for movePiece({dx:0, dy:1}).
      return _rawSessionReducer(state, { type: 'movePiece', dx: 0, dy: 1 });
    }

    case 'rotatePiece': {
      if (!isRevealPhase(state.phase)) return state;
      if (state.playMode !== 'manual') return state;
      if (state.activePiece === null) return state;
      const rotated = tryRotate(state.board, state.activePiece, action.direction);
      if (!rotated) return state;
      return { ...state, activePiece: rotated };
    }

    case 'hardDrop': {
      if (!isRevealPhase(state.phase)) return state;
      if (state.playMode !== 'manual') return state;
      if (state.activePiece === null) return state;
      const expectedStep = state.cachedSteps[state.step];
      if (!expectedStep) return state;
      const dropped = coreHardDrop(state.board, state.activePiece);
      // Piece type mismatch — reject (piece stays, user retries).
      if (dropped.type !== expectedStep.piece) return state;
      const cells = getPieceCells(dropped);
      // L10 finding #6: BFS cell order isn't stable, compare via
      // stringified {col,row} key sets.
      const expectedSet = new Set(
        expectedStep.newCells.map((c) => `${c.col},${c.row}`),
      );
      const givenSet = new Set(cells.map((c) => `${c.col},${c.row}`));
      if (
        expectedSet.size !== givenSet.size ||
        ![...expectedSet].every((k) => givenSet.has(k))
      ) {
        return state;
      }
      // Accepted — lock piece, advance step, spawn next, reset holdUsed.
      const newBoard = stampCells(state.board, dropped.type, cells);
      let nextStepIdx = state.step + 1;
      let finalBoard = newBoard;

      // Auto-advance past line-clear steps (TST/TSD) — not manually placed.
      const nextStep = state.cachedSteps[nextStepIdx];
      if (nextStep?.linesCleared) {
        finalBoard = nextStep.board;
        nextStepIdx++;
      }

      const nextActivePiece = spawnForCurrentStep(state.cachedSteps, nextStepIdx);
      return {
        ...state,
        board: finalBoard,
        step: nextStepIdx,
        activePiece: nextActivePiece,
        holdUsed: false,
      };
    }

    case 'hold': {
      if (!isRevealPhase(state.phase)) return state;
      if (state.playMode !== 'manual') return state;
      if (state.activePiece === null) return state;
      if (state.holdUsed) return state;
      const currentType = state.activePiece.type;
      if (state.holdPiece === null) {
        // First hold: store active, refill from next step (with-peek variant).
        // TODO(simple-hold): swap to pure-swap if the UX proves confusing.
        const nextStep = state.cachedSteps[state.step + 1];
        const nextActive = nextStep ? spawnPiece(nextStep.piece) : null;
        return {
          ...state,
          holdPiece: currentType,
          activePiece: nextActive,
          holdUsed: true,
        };
      }
      // Subsequent hold: swap active type with held type.
      const swappedType = state.holdPiece;
      return {
        ...state,
        holdPiece: currentType,
        activePiece: spawnPiece(swappedType),
        holdUsed: true,
      };
    }

    // ── Intent actions — interpreted by the reducer, not the keyboard ──
    //
    // Design rationale: keyboard.ts used to be a partial interpreter of
    // Session state (deciding what SPACE means based on phase + playMode).
    // That created a bug class where new phase variants kept breaking
    // keyboard.ts. These intent cases move ALL the decision-making into
    // the reducer where the full Session context is available.
    //
    // Spec: tests/diag-l9-intent.test.ts (Phase 2.5 empirical proof).

    case 'primary': {
      // SPACE / ENTER — "do the main thing for the current state."
      switch (state.phase) {
        case 'guess1':
          return state.guess !== null
            ? _rawSessionReducer(state, { type: 'submitGuess' })
            : _rawSessionReducer(state, { type: 'newSession' });
        case 'reveal1':
        case 'reveal2':
        case 'reveal3':
          // Manual with an active piece: drop it.
          // Manual at end (activePiece === null) OR auto mode: advance phase.
          if (state.playMode === 'manual' && state.activePiece !== null) {
            return _rawSessionReducer(state, { type: 'hardDrop' });
          }
          return _rawSessionReducer(state, { type: 'advancePhase' });
        case 'guess2': {
          if (state.guess === null) {
            return _rawSessionReducer(state, { type: 'newSession' });
          }
          const best = bestBag2Route(state.guess.opener, state.guess.mirror, state.bag2);
          return _rawSessionReducer(state, { type: 'selectRoute', routeIndex: best.routeIndex });
        }
        case 'guess3': {
          // Auto-select first PC solution.
          return _rawSessionReducer(state, { type: 'selectPcSolution', solutionIndex: 0 });
        }
      }
    }

    case 'pick': {
      // Digit keys 1-4 — context-dependent. Phase-indexed with explicit
      // bounds checks so no out-of-range index reaches the downstream
      // actions (defense-in-depth alongside selectRoute's own guard).
      switch (state.phase) {
        case 'guess1': {
          if (
            !Number.isInteger(action.index) ||
            action.index < 0 ||
            action.index >= OPENER_BY_PICK.length
          ) {
            return state;
          }
          const opener = OPENER_BY_PICK[action.index];
          if (!opener) return state;
          const mirror = state.guess?.mirror ?? false;
          return _rawSessionReducer(state, {
            type: 'setGuess',
            opener,
            mirror,
          });
        }
        case 'guess2': {
          if (state.guess === null) return state;
          const routes = getBag2Routes(state.guess.opener, state.guess.mirror);
          if (
            !Number.isInteger(action.index) ||
            action.index < 0 ||
            action.index >= routes.length
          ) {
            return state;
          }
          return _rawSessionReducer(state, {
            type: 'selectRoute',
            routeIndex: action.index,
          });
        }
        case 'reveal1': {
          if (state.playMode !== 'auto') return state;
          if (
            !Number.isInteger(action.index) ||
            action.index < 0 ||
            action.index >= OPENER_BY_PICK.length
          ) {
            return state;
          }
          const opener = OPENER_BY_PICK[action.index];
          if (!opener) return state;
          return _rawSessionReducer(state, {
            type: 'browseOpener',
            opener,
            mirror: state.guess?.mirror ?? false,
          });
        }
        case 'reveal2': {
          if (state.playMode !== 'auto' || state.guess === null) return state;
          const routes = getBag2Routes(state.guess.opener, state.guess.mirror);
          if (
            !Number.isInteger(action.index) ||
            action.index < 0 ||
            action.index >= routes.length
          ) {
            return state;
          }
          return _rawSessionReducer(state, {
            type: 'selectRoute',
            routeIndex: action.index,
          });
        }
        case 'guess3': {
          if (state.guess === null) return state;
          const pcSols = getPcSolutions(state.guess.opener, state.guess.mirror);
          if (
            !Number.isInteger(action.index) ||
            action.index < 0 ||
            action.index >= pcSols.length
          ) {
            return state;
          }
          return _rawSessionReducer(state, {
            type: 'selectPcSolution',
            solutionIndex: action.index,
          });
        }
        case 'reveal3': {
          if (state.playMode !== 'auto' || state.guess === null) return state;
          const pcSols2 = getPcSolutions(state.guess.opener, state.guess.mirror);
          if (
            !Number.isInteger(action.index) ||
            action.index < 0 ||
            action.index >= pcSols2.length
          ) {
            return state;
          }
          return _rawSessionReducer(state, {
            type: 'selectPcSolution',
            solutionIndex: action.index,
          });
        }
      }
    }

    default:
      return state;
  }
}

/**
 * Public reducer — wraps `_rawSessionReducer` with a post-reduction
 * invariant assertion. Any reducer case that produces an invalid Session
 * throws `InvariantViolation` at this boundary, making state corruption
 * impossible to silently propagate.
 *
 * Design contract: tests/diag-l9-session.test.ts + tests/diag-l9-manual.test.ts
 *                  + tests/diag-l9-intent.test.ts + tests/diag-l9-invariants.test.ts
 *
 * Spec for the invariants is in tests/diag-l9-invariants.test.ts (Phase 2.5).
 */
export function sessionReducer(state: Session, action: SessionAction): Session {
  const next = _rawSessionReducer(state, action);
  assertSessionInvariants(next);
  return next;
}
