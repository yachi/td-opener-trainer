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
 *   5. toggleMirror is guarded to phase==='guess1' && guess !== null.
 *   6. pieceDrop compares cells via stringified {col,row} key sets.
 *   7. selectRoute layers bag2 steps onto the bag1 final board from
 *      cachedSteps.at(-1).board.
 *
 * The reducer is a pure function: NO side effects, NO localStorage, NO
 * persistence. Stats live in memory only — closing the tab IS the reset.
 */

import {
  emptyBoard,
  buildSteps,
  cloneBoard,
  stampCells,
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
  type RawPlacement,
} from './openers/placements.ts';
import { getBag2Routes } from './openers/bag2-routes.ts';
import { OPENERS, bestOpener } from './openers/decision.ts';

// ── Public types ──────────────────────────────────────────────────────────

export type Phase = 'guess1' | 'reveal1' | 'guess2' | 'reveal2';
export type PlayMode = 'auto' | 'manual';

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
  /** Route index selected during guess2 (-1 if not yet selected). */
  routeGuess: number;

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
 *   - 9 session-level: newSession, setGuess, toggleMirror, submitGuess,
 *     stepForward, stepBackward, advancePhase, togglePlayMode, selectRoute
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
 * Compute the auto-sequence for a given (opener, mirror, phase). For
 * Bag 1 there is no route; for Bag 2 a routeIndex must be supplied and
 * the steps are layered onto `priorBoard` (the bag1 final board).
 */
export function computeSteps(
  opener: OpenerID,
  mirror: boolean,
  phase: 'reveal1' | 'reveal2',
  routeIndex: number,
  priorBoard: Board,
): Step[] {
  const raw = OPENER_PLACEMENT_DATA[opener];
  const data: OpenerPlacementData = mirror ? mirrorPlacementData(raw) : raw;

  if (phase === 'reveal1') {
    // For gamushiro form_2 the drill uses a reduced Bag 1, but that only
    // matters once the route is known (phase reveal2). reveal1 always
    // shows the full placement set.
    return buildSteps(data.placements);
  }

  // reveal2: layer the route on top of the bag1 board, mirroring the old
  // drill `transitionToBag2` behavior.
  const routes = getBag2Routes(opener, mirror);
  const route = routes[routeIndex];
  if (!route) return [];
  const allPlacements: RawPlacement[] = [
    ...(route.holdPlacement ? [route.holdPlacement] : []),
    ...route.placements,
  ];
  return buildSteps(allPlacements, priorBoard);
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
    step: 0,
    playMode: 'auto',
    sessionStats: { total: 0, correct: 0, streak: 0 },
    cachedSteps: [],
    routeGuess: -1,
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

// ── Reducer ───────────────────────────────────────────────────────────────

/**
 * Pure reducer. NO side effects, NO localStorage, NO persistence. The
 * design contract is the diag-l9-session test file — any change here
 * must keep those 44 tests green.
 */
export function sessionReducer(state: Session, action: SessionAction): Session {
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
      // L10 finding #5: guarded to guess1 with a guess set so it can
      // never mutate reveal state.
      if (state.phase !== 'guess1' || state.guess === null) return state;
      return {
        ...state,
        guess: { ...state.guess, mirror: !state.guess.mirror },
        // CRITICAL: bag and board MUST NOT change on toggle.
      };
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
        sessionStats: newStats,
        activePiece,
        holdPiece: null,
        holdUsed: false,
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
      // reveal2 → new guess1 with fresh bags (stats carry forward).
      if (state.phase === 'reveal2') {
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
      if (state.phase !== 'guess2' || state.guess === null) return state;
      // L10 finding #7: capture the bag1 final board from cachedSteps
      // BEFORE computing bag2 steps, matching the existing drill
      // transitionToBag2 pattern.
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
      // SPAWN HOOK (Reframing A+): entering reveal2 in manual mode
      // spawns the first active piece for the bag2 sequence.
      const activePiece =
        state.playMode === 'manual'
          ? spawnForCurrentStep(routeSteps, 0)
          : null;
      return {
        ...state,
        phase: 'reveal2',
        routeGuess: action.routeIndex,
        cachedSteps: routeSteps,
        step: 0,
        board: cloneBoard(finalBag1),
        activePiece,
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
      const isReveal = state.phase === 'reveal1' || state.phase === 'reveal2';
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
      if (state.phase !== 'reveal1' && state.phase !== 'reveal2') return state;
      if (state.playMode !== 'manual') return state;
      if (state.activePiece === null) return state;
      const moved = tryMove(state.board, state.activePiece, action.dx, action.dy);
      if (!moved) return state;
      return { ...state, activePiece: moved };
    }

    case 'softDrop': {
      // Alias for movePiece({dx:0, dy:1}).
      return sessionReducer(state, { type: 'movePiece', dx: 0, dy: 1 });
    }

    case 'rotatePiece': {
      if (state.phase !== 'reveal1' && state.phase !== 'reveal2') return state;
      if (state.playMode !== 'manual') return state;
      if (state.activePiece === null) return state;
      const rotated = tryRotate(state.board, state.activePiece, action.direction);
      if (!rotated) return state;
      return { ...state, activePiece: rotated };
    }

    case 'hardDrop': {
      if (state.phase !== 'reveal1' && state.phase !== 'reveal2') return state;
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
      const nextStepIdx = state.step + 1;
      const nextActivePiece = spawnForCurrentStep(state.cachedSteps, nextStepIdx);
      return {
        ...state,
        board: newBoard,
        step: nextStepIdx,
        activePiece: nextActivePiece,
        holdUsed: false,
      };
    }

    case 'hold': {
      if (state.phase !== 'reveal1' && state.phase !== 'reveal2') return state;
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
            ? sessionReducer(state, { type: 'submitGuess' })
            : sessionReducer(state, { type: 'newSession' });
        case 'reveal1':
        case 'reveal2':
          // Manual with an active piece: drop it.
          // Manual at end (activePiece === null) OR auto mode: advance phase.
          // This branch is THE BUG FIX for "stuck after placing last piece
          // in manual reveal" — hardDrop would have been a no-op, so we
          // fall through to advancePhase instead.
          if (state.playMode === 'manual' && state.activePiece !== null) {
            return sessionReducer(state, { type: 'hardDrop' });
          }
          return sessionReducer(state, { type: 'advancePhase' });
        case 'guess2':
          return sessionReducer(state, { type: 'newSession' });
      }
    }

    case 'pick': {
      // Digit keys 1-4 — context-dependent.
      switch (state.phase) {
        case 'guess1': {
          const opener = OPENER_BY_PICK[action.index];
          if (!opener) return state;
          const mirror = state.guess?.mirror ?? false;
          return sessionReducer(state, {
            type: 'setGuess',
            opener,
            mirror,
          });
        }
        case 'guess2':
          return sessionReducer(state, {
            type: 'selectRoute',
            routeIndex: action.index,
          });
        // pick is a no-op in reveal phases.
        case 'reveal1':
        case 'reveal2':
          return state;
      }
    }

    default:
      return state;
  }
}
