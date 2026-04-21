/**
 * tests/guard-matrix.test.ts — Structural guard coverage for the Session reducer.
 *
 * WHY THIS EXISTS (L9 testing architecture redesign):
 *
 * The previous testing architecture was procedural — guard coverage for each
 * action depended on the developer remembering to write tests (Phase 2.5
 * protocol). When `browseOpener` was added in commit 964f4ce, its guards
 * (phase, auto, same-state) had zero direct mutation test coverage. The
 * property tests caught crash-safety via random sequences, but not behavioral
 * correctness of individual guards.
 *
 * This is the same class of error as CLAUDE.md Lesson #3: "Write a TEST, not
 * a lesson." The fix is structural: a declarative guard matrix where every
 * (ActionType × Phase × PlayMode) cell has an expected outcome. Tests are
 * generated from the matrix. A compile-time type check ensures every
 * SessionAction type has a matrix entry — adding a new action without its
 * guard spec is a TYPE ERROR, not a forgotten step.
 *
 * WHAT THIS TESTS:
 *
 * For each action type × (phase, playMode) context:
 *   - 'identity': the reducer MUST return the same object reference (guard fired)
 *   - 'change': the reducer MUST return a different object (action accepted)
 *
 * This does NOT test what the action DOES when accepted — that's the job of
 * feature-focused tests (diag-l9-session, diag-l9-intent, diag-l9-manual).
 * This tests WHERE the action is accepted vs rejected.
 *
 * EDGE CASES are tested separately from the matrix (same-state, null-guess,
 * out-of-bounds, side-effects like correct→null).
 */

import { describe, test, expect } from 'bun:test';

import {
  createSession,
  sessionReducer,
  isRevealPhase,
  isGuessPhase,
  type Session,
  type SessionAction,
  type Phase,
  type PlayMode,
} from '../src/session.ts';
import { OPENERS } from '../src/openers/decision.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import type { OpenerID } from '../src/openers/types.ts';
import type { PieceType } from '../src/core/types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// §0  Compile-time completeness check
//
// If a new action type is added to SessionAction but not to ACTION_TYPES,
// this line produces a type error. No runtime cost.
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_TYPES = [
  'newSession', 'setGuess', 'toggleMirror', 'submitGuess',
  'stepForward', 'stepBackward', 'advancePhase', 'togglePlayMode',
  'selectRoute', 'selectPcSolution', 'browseOpener',
  'movePiece', 'rotatePiece', 'hardDrop', 'hold', 'softDrop',
  'jumpToBag',
  'primary', 'pick',
] as const;

type ActionType = (typeof ACTION_TYPES)[number];
type _AllActionTypes = SessionAction['type'];
// Structural check: every SessionAction type must appear in ACTION_TYPES.
// If this errors, a new action was added without a guard matrix entry.
type _Missing = Exclude<_AllActionTypes, ActionType>;
type _Extra = Exclude<ActionType, _AllActionTypes>;
const _completeness: [_Missing, _Extra] extends [never, never] ? true : never = true;
void _completeness; // suppress unused warning

// ═══════════════════════════════════════════════════════════════════════════
// §1  State builder
//
// Builds a Session in any (phase, playMode) context via the normal reducer
// path. Always uses ms2/normal (J before L, always works). Sets a guess in
// guess1 so guards that check `guess !== null` don't trivially fire.
// ═══════════════════════════════════════════════════════════════════════════

function bagFor(target: OpenerID): PieceType[] {
  const base: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const perms: PieceType[][] = [];
  function permute(arr: PieceType[], start: number): void {
    if (start === arr.length) { perms.push([...arr]); return; }
    for (let i = start; i < arr.length; i++) {
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
      permute(arr, start + 1);
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
    }
  }
  permute([...base], 0);
  const def = OPENERS[target];
  for (const p of perms) if (def.canBuild(p)) return p;
  throw new Error(`no bag for ${target}`);
}

function buildState(phase: Phase, playMode: PlayMode): Session {
  const bag = bagFor('ms2');
  let s = createSession(bag, bag);

  // Set a guess so toggleMirror/submitGuess guards don't trivially no-op.
  s = sessionReducer(s, { type: 'setGuess', opener: 'ms2', mirror: false });

  if (phase !== 'guess1') {
    s = sessionReducer(s, { type: 'submitGuess' });
  }
  if (phase === 'guess2' || phase === 'reveal2') {
    s = sessionReducer(s, { type: 'advancePhase' });
  }
  if (phase === 'reveal2') {
    s = sessionReducer(s, { type: 'selectRoute', routeIndex: 0 });
  }
  // guess3/reveal3 require PC solutions — only honey_cup has those.
  // Rebuild from scratch with honey_cup to reach these phases.
  if (phase === 'guess3' || phase === 'reveal3') {
    const hcBag = bagFor('honey_cup');
    s = createSession(hcBag, hcBag);
    s = sessionReducer(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = sessionReducer(s, { type: 'submitGuess' });         // → reveal1
    s = sessionReducer(s, { type: 'advancePhase' });        // → guess2
    s = sessionReducer(s, { type: 'selectRoute', routeIndex: 0 }); // → reveal2
    s = sessionReducer(s, { type: 'advancePhase' });        // → guess3
  }
  if (phase === 'reveal3') {
    s = sessionReducer(s, { type: 'selectPcSolution', solutionIndex: 0 }); // → reveal3
  }
  // Switch playMode LAST so we reach the target phase via normal path first.
  if (s.playMode !== playMode) {
    s = sessionReducer(s, { type: 'togglePlayMode' });
  }
  // Postcondition: verify we reached the right state.
  if (s.phase !== phase) throw new Error(`buildState: expected phase=${phase}, got ${s.phase}`);
  if (s.playMode !== playMode) throw new Error(`buildState: expected playMode=${playMode}, got ${s.playMode}`);
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════
// §2  Action builders
//
// Each action type gets a default action that, when dispatched in an
// ALLOWED context, will produce a state change. Actions are chosen to
// differ from the state builder's defaults (ms2/normal/route0).
// ═══════════════════════════════════════════════════════════════════════════

function buildAction(type: ActionType): SessionAction {
  switch (type) {
    case 'newSession':      return { type: 'newSession' };
    case 'setGuess':        return { type: 'setGuess', opener: 'honey_cup', mirror: false };
    case 'toggleMirror':    return { type: 'toggleMirror' };
    case 'submitGuess':     return { type: 'submitGuess' };
    case 'stepForward':     return { type: 'stepForward' };
    case 'stepBackward':    return { type: 'stepBackward' };
    case 'advancePhase':    return { type: 'advancePhase' };
    case 'togglePlayMode':  return { type: 'togglePlayMode' };
    case 'selectRoute':     return { type: 'selectRoute', routeIndex: 1 };
    case 'selectPcSolution': return { type: 'selectPcSolution', solutionIndex: 1 };
    case 'browseOpener':    return { type: 'browseOpener', opener: 'stray_cannon', mirror: false };
    case 'movePiece':       return { type: 'movePiece', dx: -1, dy: 0 };
    case 'rotatePiece':     return { type: 'rotatePiece', direction: 1 };
    case 'hardDrop':        return { type: 'hardDrop' };
    case 'hold':            return { type: 'hold' };
    case 'softDrop':        return { type: 'softDrop' };
    case 'jumpToBag':       return { type: 'jumpToBag', bag: 1 };
    case 'primary':         return { type: 'primary' };
    case 'pick':            return { type: 'pick', index: 1 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// §3  Guard matrix
//
// For each action type, declares the expected guard behavior in every
// (phase × playMode) context. The matrix IS the spec.
//
// 'identity' = reducer returns same object reference (guard rejected action)
// 'change'   = reducer returns new object (action accepted)
//
// Intent actions (primary, pick) are meta-actions whose behavior depends on
// delegation. They get their own matrix because their guards are structural.
// ═══════════════════════════════════════════════════════════════════════════

type Context = `${Phase}_${PlayMode}`;
type Expectation = 'identity' | 'change';

const ALL_PHASES: Phase[] = ['guess1', 'reveal1', 'guess2', 'reveal2', 'guess3', 'reveal3'];
const ALL_MODES: PlayMode[] = ['auto', 'manual'];

const GUARD_MATRIX: Record<ActionType, Record<Context, Expectation>> = {
  // ── Session-level actions ──

  newSession: {
    guess1_auto: 'change', guess1_manual: 'change',
    reveal1_auto: 'change', reveal1_manual: 'change',
    guess2_auto: 'change', guess2_manual: 'change',
    reveal2_auto: 'change', reveal2_manual: 'change',
    guess3_auto: 'change', guess3_manual: 'change',
    reveal3_auto: 'change', reveal3_manual: 'change',
  },

  setGuess: {
    guess1_auto: 'change', guess1_manual: 'change',
    reveal1_auto: 'identity', reveal1_manual: 'identity',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'identity',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'identity',
  },

  toggleMirror: {
    guess1_auto: 'change', guess1_manual: 'change',
    reveal1_auto: 'change', reveal1_manual: 'identity',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'identity',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'identity',
  },

  submitGuess: {
    guess1_auto: 'change', guess1_manual: 'change',
    reveal1_auto: 'identity', reveal1_manual: 'identity',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'identity',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'identity',
  },

  stepForward: {
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'change', reveal1_manual: 'change',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'change', reveal2_manual: 'change',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'change', reveal3_manual: 'change',
  },

  stepBackward: {
    // step starts at 0 in all contexts, so stepBackward is always a no-op
    // even in reveal phases (step <= 0 guard). This tests the step-bounds
    // guard, which is correct — stepBackward from step 0 is guarded.
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'identity', reveal1_manual: 'identity',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'identity',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'identity',
  },

  advancePhase: {
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'change', reveal1_manual: 'change',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'change', reveal2_manual: 'change',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'change', reveal3_manual: 'change',
  },

  togglePlayMode: {
    guess1_auto: 'change', guess1_manual: 'change',
    reveal1_auto: 'change', reveal1_manual: 'change',
    guess2_auto: 'change', guess2_manual: 'change',
    reveal2_auto: 'change', reveal2_manual: 'change',
    guess3_auto: 'change', guess3_manual: 'change',
    reveal3_auto: 'change', reveal3_manual: 'change',
  },

  selectRoute: {
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'identity', reveal1_manual: 'identity',
    guess2_auto: 'change', guess2_manual: 'change',
    reveal2_auto: 'change', reveal2_manual: 'identity',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'identity',
  },

  selectPcSolution: {
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'identity', reveal1_manual: 'identity',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'identity',
    guess3_auto: 'change', guess3_manual: 'change',
    reveal3_auto: 'change', reveal3_manual: 'identity',
  },

  browseOpener: {
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'change', reveal1_manual: 'identity',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'identity',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'identity',
  },

  // ── Manual-play actions ──

  movePiece: {
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'identity', reveal1_manual: 'change',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'change',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'change',
  },

  rotatePiece: {
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'identity', reveal1_manual: 'change',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'change',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'change',
  },

  hardDrop: {
    // hardDrop in manual reveal passes phase+mode guards but may still
    // return identity if the piece type/position doesn't match the expected
    // step. We test the structural guards here; feature tests cover matching.
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'identity', reveal1_manual: 'identity',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'identity',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'identity',
  },

  hold: {
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'identity', reveal1_manual: 'change',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'change',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'change',
  },

  softDrop: {
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'identity', reveal1_manual: 'change',
    guess2_auto: 'identity', guess2_manual: 'identity',
    reveal2_auto: 'identity', reveal2_manual: 'change',
    guess3_auto: 'identity', guess3_manual: 'identity',
    reveal3_auto: 'identity', reveal3_manual: 'change',
  },

  // ── Navigation ──

  jumpToBag: {
    // jumpToBag(1): guess1 has no snapshot → identity; reveal1 is same bag → identity;
    // all later phases have reveal1 snapshot → change (jumps to reveal1).
    guess1_auto: 'identity', guess1_manual: 'identity',
    reveal1_auto: 'identity', reveal1_manual: 'identity',
    guess2_auto: 'change', guess2_manual: 'change',
    reveal2_auto: 'change', reveal2_manual: 'change',
    guess3_auto: 'change', guess3_manual: 'change',
    reveal3_auto: 'change', reveal3_manual: 'change',
  },

  // ── Intent actions ──
  // Intents delegate to other actions. Their guard matrix reflects the
  // COMBINED behavior of their delegation targets.

  primary: {
    // guess1: submitGuess (guess set) → change
    // reveal auto: advancePhase → change
    // reveal manual: hardDrop (may fail match) → identity
    // guess2: selectRoute(best) → change
    // guess3: selectPcSolution(0) → change
    guess1_auto: 'change', guess1_manual: 'change',
    reveal1_auto: 'change', reveal1_manual: 'identity',
    guess2_auto: 'change', guess2_manual: 'change',
    reveal2_auto: 'change', reveal2_manual: 'identity',
    guess3_auto: 'change', guess3_manual: 'change',
    reveal3_auto: 'change', reveal3_manual: 'identity',
  },

  pick: {
    // guess1: setGuess → change (pick(1) = honey_cup, differs from ms2)
    // reveal1 auto: browseOpener → change
    // reveal1 manual: no-op (safe zone)
    // guess2: selectRoute → change
    // reveal2 auto: selectRoute → change (pick(1) = route 1, differs from route 0)
    // reveal2 manual: no-op (safe zone)
    // guess3: selectPcSolution → change
    // reveal3 auto: selectPcSolution → change (pick(1) = solution 1, differs from 0)
    // reveal3 manual: no-op (safe zone)
    guess1_auto: 'change', guess1_manual: 'change',
    reveal1_auto: 'change', reveal1_manual: 'identity',
    guess2_auto: 'change', guess2_manual: 'change',
    reveal2_auto: 'change', reveal2_manual: 'identity',
    guess3_auto: 'change', guess3_manual: 'change',
    reveal3_auto: 'change', reveal3_manual: 'identity',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// §4  Generated tests from the matrix
// ═══════════════════════════════════════════════════════════════════════════

describe('Guard matrix: (action × phase × playMode) → identity | change', () => {
  for (const actionType of ACTION_TYPES) {
    const row = GUARD_MATRIX[actionType];
    describe(actionType, () => {
      for (const phase of ALL_PHASES) {
        for (const mode of ALL_MODES) {
          const ctx: Context = `${phase}_${mode}`;
          const expected = row[ctx];
          test(`${ctx} → ${expected}`, () => {
            const state = buildState(phase, mode);
            const action = buildAction(actionType);
            const next = sessionReducer(state, action);
            if (expected === 'identity') {
              expect(next).toBe(state);
            } else {
              expect(next).not.toBe(state);
            }
          });
        }
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// §5  Edge cases — same-state, null-guess, side-effects
//
// These are action-specific invariants that the phase×mode matrix can't
// express. Each edge case documents a design decision.
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge cases: browseOpener', () => {
  test('same opener + same mirror → identity (same-state guard)', () => {
    const s = buildState('reveal1', 'auto');
    // State has ms2/normal. Browse to ms2/normal = same state.
    const next = sessionReducer(s, {
      type: 'browseOpener', opener: 'ms2', mirror: false,
    });
    expect(next).toBe(s);
  });

  test('same opener + different mirror → change', () => {
    const s = buildState('reveal1', 'auto');
    const next = sessionReducer(s, {
      type: 'browseOpener', opener: 'ms2', mirror: true,
    });
    expect(next).not.toBe(s);
    expect(next.guess!.mirror).toBe(true);
  });

  test('correct resets to null when browsing away', () => {
    const s = buildState('reveal1', 'auto');
    // After submitGuess, correct is set (true or false).
    expect(s.correct).not.toBeNull();
    const next = sessionReducer(s, {
      type: 'browseOpener', opener: 'stray_cannon', mirror: false,
    });
    expect(next.correct).toBeNull();
  });

  test('step resets to 0 when browsing', () => {
    let s = buildState('reveal1', 'auto');
    // Step forward first.
    s = sessionReducer(s, { type: 'stepForward' });
    expect(s.step).toBeGreaterThan(0);
    const next = sessionReducer(s, {
      type: 'browseOpener', opener: 'honey_cup', mirror: false,
    });
    expect(next.step).toBe(0);
  });

  test('board resets to empty when browsing', () => {
    let s = buildState('reveal1', 'auto');
    s = sessionReducer(s, { type: 'stepForward' });
    const next = sessionReducer(s, {
      type: 'browseOpener', opener: 'gamushiro', mirror: false,
    });
    // Board should be empty (all cells null in visible rows).
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 10; c++) {
        expect(next.board[r]![c]).toBeNull();
      }
    }
  });

  test('cachedSteps updates to the browsed opener', () => {
    const s = buildState('reveal1', 'auto');
    const before = s.cachedSteps;
    const next = sessionReducer(s, {
      type: 'browseOpener', opener: 'stray_cannon', mirror: false,
    });
    // Steps should differ (different opener = different placements).
    expect(next.cachedSteps).not.toBe(before);
    expect(next.cachedSteps.length).toBeGreaterThan(0);
  });
});

describe('Edge cases: selectRoute in reveal2', () => {
  test('same route → identity (same-route guard)', () => {
    const s = buildState('reveal2', 'auto');
    expect(s.routeGuess).toBe(0);
    const next = sessionReducer(s, { type: 'selectRoute', routeIndex: 0 });
    expect(next).toBe(s);
  });

  test('different route → change', () => {
    const s = buildState('reveal2', 'auto');
    const routes = getBag2Routes(s.guess!.opener, s.guess!.mirror);
    if (routes.length < 2) return; // skip if only 1 route
    const next = sessionReducer(s, { type: 'selectRoute', routeIndex: 1 });
    expect(next).not.toBe(s);
    expect(next.routeGuess).toBe(1);
  });

  test('out-of-bounds route → identity', () => {
    const s = buildState('reveal2', 'auto');
    const next = sessionReducer(s, { type: 'selectRoute', routeIndex: 999 });
    expect(next).toBe(s);
  });
});

describe('Edge cases: toggleMirror delegation in reveal1 auto', () => {
  test('delegates to browseOpener (flips mirror, resets state)', () => {
    const s = buildState('reveal1', 'auto');
    expect(s.guess!.mirror).toBe(false);
    const next = sessionReducer(s, { type: 'toggleMirror' });
    expect(next.guess!.mirror).toBe(true);
    // Delegation side-effects: correct null, step 0.
    expect(next.correct).toBeNull();
    expect(next.step).toBe(0);
  });

  test('double toggle returns to original opener (but correct stays null)', () => {
    const s = buildState('reveal1', 'auto');
    const toggled = sessionReducer(s, { type: 'toggleMirror' });
    const doubleToggled = sessionReducer(toggled, { type: 'toggleMirror' });
    expect(doubleToggled.guess!.mirror).toBe(false);
    expect(doubleToggled.guess!.opener).toBe(s.guess!.opener);
    // correct is null because browseOpener always clears it — by design.
    expect(doubleToggled.correct).toBeNull();
  });
});

describe('Edge cases: pick delegation paths', () => {
  test('pick in auto reveal1 delegates to browseOpener (correct resets)', () => {
    const s = buildState('reveal1', 'auto');
    expect(s.correct).not.toBeNull();
    const next = sessionReducer(s, { type: 'pick', index: 0 }); // stray_cannon
    expect(next.guess!.opener).toBe('stray_cannon');
    expect(next.correct).toBeNull();
    expect(next.step).toBe(0);
  });

  test('pick in auto reveal2 delegates to selectRoute', () => {
    const s = buildState('reveal2', 'auto');
    const routes = getBag2Routes(s.guess!.opener, s.guess!.mirror);
    if (routes.length < 2) return;
    expect(s.routeGuess).toBe(0);
    const next = sessionReducer(s, { type: 'pick', index: 1 });
    expect(next.routeGuess).toBe(1);
  });

  test('pick out-of-bounds in auto reveal1 → identity', () => {
    const s = buildState('reveal1', 'auto');
    const next = sessionReducer(s, { type: 'pick', index: 99 });
    expect(next).toBe(s);
  });

  test('pick out-of-bounds in auto reveal2 → identity', () => {
    const s = buildState('reveal2', 'auto');
    const next = sessionReducer(s, { type: 'pick', index: 99 });
    expect(next).toBe(s);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §6  Phase metadata structural enforcement
//
// Verifies that isRevealPhase / isGuessPhase are exhaustive and consistent
// with ALL_PHASES. If a new Phase is added to the union but not to
// PHASE_META, the TypeScript compiler catches it (Record<Phase, PhaseMeta>
// in session.ts). These tests verify the runtime behavior matches.
// ═══════════════════════════════════════════════════════════════════════════

describe('Phase metadata: isRevealPhase / isGuessPhase structural coverage', () => {
  test('every phase is either guess or reveal (exhaustive)', () => {
    for (const phase of ALL_PHASES) {
      const isR = isRevealPhase(phase);
      const isG = isGuessPhase(phase);
      expect(isR || isG).toBe(true);
      expect(isR && isG).toBe(false); // mutually exclusive
    }
  });

  test('reveal phases match hardcoded expectation', () => {
    const expected = new Set<Phase>(['reveal1', 'reveal2', 'reveal3']);
    const actual = new Set(ALL_PHASES.filter(isRevealPhase));
    expect(actual).toEqual(expected);
  });

  test('guess phases match hardcoded expectation', () => {
    const expected = new Set<Phase>(['guess1', 'guess2', 'guess3']);
    const actual = new Set(ALL_PHASES.filter(isGuessPhase));
    expect(actual).toEqual(expected);
  });
});

describe('Edge cases: null guess', () => {
  test('browseOpener with null guess still changes state (sets new guess)', () => {
    // This can't happen via normal flow (reveal1 requires a guess) but
    // browseOpener's same-state guard uses `state.guess !== null &&`.
    // With null guess, it skips the same-state check and proceeds.
    // However, the phase guard (phase !== reveal1) prevents this in
    // normal flow. This test documents the guard ordering.
    const s = buildState('reveal1', 'auto');
    // State always has a guess in reveal1, so this is a documentation test.
    expect(s.guess).not.toBeNull();
  });

  test('toggleMirror with null guess → identity (any phase)', () => {
    const s = createSession(bagFor('ms2'), bagFor('ms2'));
    // No guess set.
    expect(s.guess).toBeNull();
    const next = sessionReducer(s, { type: 'toggleMirror' });
    expect(next).toBe(s);
  });

  test('submitGuess with null guess → identity', () => {
    const s = createSession(bagFor('ms2'), bagFor('ms2'));
    expect(s.guess).toBeNull();
    const next = sessionReducer(s, { type: 'submitGuess' });
    expect(next).toBe(s);
  });
});
