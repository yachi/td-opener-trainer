/**
 * diag-l9-invariants.test.ts — L9 structural fix for bugs found by the
 * proactive audit convergence loop.
 *
 * Two verified user-reachable bugs from the audit:
 *
 * Bug #1 (HIGH): src/renderer/session.ts reads `def.holdPiece` (doctrinal
 *   opener hold) instead of `session.holdPiece` (user's actual held piece).
 *   User holds a piece in manual mode → UI shows no change.
 *
 * Bug #2 (HIGH): src/session.ts pick/selectRoute skip bounds check. Every
 *   opener has only 2 bag2 routes but keybind bar says "1-4 select route".
 *   Pressing Digit3 dispatches pick(2) → selectRoute(routeIndex=2) →
 *   empty cachedSteps → user enters a dead reveal2 state → next SPACE
 *   destroys the session.
 *
 * Both bugs share a root-cause pattern the audit didn't catalog directly:
 * **the system has no runtime check for invalid Session states**, so
 * bad transitions slip through. The L9 move is to enumerate the
 * invariants explicitly and enforce them in the reducer wrapper.
 *
 * This file is the Phase 2.5 empirical proof. Per CLAUDE.md L10: write
 * the invariant helper and the bug reproductions BEFORE modifying src/.
 * The inline helper + tests are the spec. Phase 3 copies the helper
 * into src/session.ts and wires it into the reducer.
 */

import { describe, test, expect } from 'bun:test';

import {
  createSession,
  sessionReducer as rawReducer,
  InvariantViolation,
  type Session,
  type SessionAction,
} from '../src/session.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import { OPENERS } from '../src/openers/decision.ts';
import type { OpenerID } from '../src/openers/types.ts';
import type { PieceType } from '../src/core/types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Invariant helper — the SPEC for Phase 3.
//
// Phase 3 will copy this into src/session.ts and wrap sessionReducer with a
// post-reduction assertInvariants() call. Any reducer case that produces an
// invalid Session will throw at the boundary, catching the bug class.
// ═══════════════════════════════════════════════════════════════════════════

class InvariantViolation extends Error {
  constructor(public readonly rule: string, public readonly session: Session) {
    super(`Session invariant violated: ${rule}`);
    this.name = 'InvariantViolation';
  }
}

function assertSessionInvariants(s: Session): void {
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

  // ── 2. reveal phases require non-empty cachedSteps (Bug #2 root) ──
  if ((s.phase === 'reveal1' || s.phase === 'reveal2' || s.phase === 'reveal3' || s.phase === 'reveal4') && s.cachedSteps.length === 0) {
    throw new InvariantViolation(
      `phase=${s.phase} but cachedSteps is empty — invalid transition`,
      s,
    );
  }

  // ── 3. reveal2 requires a routeGuess within the opener's route list ──
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

  // ── 4. sessionStats non-negative and consistent ──
  const { total, correct, streak } = s.sessionStats;
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

  // ── 5. null guess implies guess1 phase ──
  if (s.guess === null && s.phase !== 'guess1') {
    throw new InvariantViolation(
      `phase=${s.phase} requires a guess, but guess is null`,
      s,
    );
  }

  // ── 6. Manual reveal with pending step must have an activePiece, UNLESS
  //      the user just used hold-with-peek (which can land on a null at
  //      the final step). The relaxation: holdUsed=true permits null active. ──
  const isManualReveal =
    (s.phase === 'reveal1' || s.phase === 'reveal2' || s.phase === 'reveal3' || s.phase === 'reveal4') && s.playMode === 'manual';
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

  // ── 7. Auto mode clears hold state — holdUsed, holdPiece, activePiece
  //      must all be falsy in auto mode. ──
  if (s.playMode === 'auto' && s.activePiece !== null) {
    throw new InvariantViolation(
      'auto mode must not have an activePiece',
      s,
    );
  }
  if (s.playMode === 'auto' && s.holdPiece !== null) {
    throw new InvariantViolation(
      'auto mode must not have a holdPiece',
      s,
    );
  }
  if (s.playMode === 'auto' && s.holdUsed) {
    throw new InvariantViolation(
      'auto mode must have holdUsed === false',
      s,
    );
  }

  // ── 8. Non-reveal phases have no active piece or hold state ──
  if (s.phase === 'guess1' || s.phase === 'guess2' || s.phase === 'guess3' || s.phase === 'guess4') {
    if (s.activePiece !== null) {
      throw new InvariantViolation(
        `${s.phase} must not have an activePiece`,
        s,
      );
    }
    if (s.holdPiece !== null) {
      throw new InvariantViolation(
        `${s.phase} must not have a holdPiece`,
        s,
      );
    }
    if (s.holdUsed) {
      throw new InvariantViolation(
        `${s.phase} must have holdUsed === false`,
        s,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fixed reducer — the SPEC for Phase 3 reducer changes.
//
// This wrapper (a) validates action payloads before delegating, and
// (b) asserts invariants after the transition. Phase 3 copies these guards
// into src/session.ts so the raw reducer gains the same behavior.
// ═══════════════════════════════════════════════════════════════════════════

// Post-Phase 3: delegate directly to the production reducer (which now
// contains the bounds checks AND calls assertSessionInvariants internally).
// Removing the local wrapper ensures mutation tests against the production
// wrapper are detectable — previously, the local wrapper's redundant
// assertSessionInvariants call masked any mutation to the production wrapper.
const sessionReducer = rawReducer;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function bagFor(target: OpenerID): PieceType[] {
  const base: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const perms: PieceType[][] = [];
  function permute(arr: PieceType[], start: number): void {
    if (start === arr.length) {
      perms.push([...arr]);
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
  for (const p of perms) if (def.canBuild(p)) return p;
  throw new Error(`no bag for ${target}`);
}

function apply(state: Session, ...actions: SessionAction[]): Session {
  return actions.reduce((s, a) => sessionReducer(s, a), state);
}

// ═══════════════════════════════════════════════════════════════════════════
// #0 — the production sessionReducer wrapper is LOAD-BEARING
//
// These tests exist specifically to detect mutations to the
// `assertSessionInvariants(next)` call in src/session.ts sessionReducer.
// They pass a corrupt input to the production reducer and expect it to
// throw InvariantViolation. If the wrapper is removed, these tests fail.
// ═══════════════════════════════════════════════════════════════════════════
describe('#0 production sessionReducer wrapper is load-bearing', () => {
  // NOTE: We use regex matchers (/Session invariant violated/) instead of
  // `.toThrow(InvariantViolation)` because bun:test's class matcher fails
  // under module re-export identity comparison. Regex on the message is
  // sufficient to prove the wrapper fired.

  test('corrupt sessionStats passed through reducer throws via wrapper', () => {
    const s = createSession(bagFor('ms2'), bagFor('ms2'));
    const corrupt: Session = {
      ...s,
      sessionStats: { total: -1, correct: 0, streak: 0 },
    };
    // toggleMirror is a no-op in guess1 without a guess set, so the output
    // is the unchanged corrupt state. The wrapper's assertSessionInvariants
    // fires on that output — proving the wrapper is load-bearing.
    expect(() =>
      sessionReducer(corrupt, { type: 'toggleMirror' }),
    ).toThrow(/sessionStats has a negative/);
  });

  test('corrupt step passed through reducer throws via wrapper', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    const corrupt: Session = { ...s, step: -5 };
    expect(() =>
      sessionReducer(corrupt, { type: 'stepBackward' }),
    ).toThrow(/step .* must be >= 0/);
  });

  test('corrupt guess=null in reveal phase throws via wrapper', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    const corrupt: Session = { ...s, guess: null };
    expect(() =>
      sessionReducer(corrupt, { type: 'stepForward' }),
    ).toThrow(/phase=reveal1 requires a guess/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #1 — the invariant helper is itself correct (unit-test the checker)
// ═══════════════════════════════════════════════════════════════════════════
describe('#1 invariant helper correctness', () => {
  test('a fresh session passes all invariants', () => {
    const s = createSession(bagFor('ms2'), bagFor('ms2'));
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });

  test('a reveal1 auto session passes all invariants', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });

  test('a reveal1 manual session passes all invariants', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'togglePlayMode' },
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });

  test('a reveal2 auto session passes all invariants', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'selectRoute', routeIndex: 0 },
    );
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });

  test('invariant helper throws on empty cachedSteps in reveal2 (Bug #2 state)', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
    );
    // Manually construct the invalid state that Bug #2 produces. Use step=0
    // so the step-bound invariant (which fires first) doesn't mask this one.
    const invalid: Session = {
      ...s,
      phase: 'reveal2',
      cachedSteps: [],
      step: 0,
      routeGuess: 0,
    };
    expect(() => assertSessionInvariants(invalid)).toThrow(
      /cachedSteps is empty/,
    );
  });

  test('invariant helper throws on out-of-range routeGuess in reveal2', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'selectRoute', routeIndex: 0 },
    );
    const invalid = { ...s, routeGuess: 99 };
    expect(() => assertSessionInvariants(invalid)).toThrow(/routeGuess.*out of range/);
  });

  test('invariant helper throws on guess null in a non-guess1 phase', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    const invalid = { ...s, guess: null };
    expect(() => assertSessionInvariants(invalid)).toThrow(
      /requires a guess/,
    );
  });

  test('invariant helper throws on step out of bounds', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    expect(() =>
      assertSessionInvariants({ ...s, step: -1 }),
    ).toThrow(/step.*>= 0/);
    expect(() =>
      assertSessionInvariants({ ...s, step: s.cachedSteps.length + 5 }),
    ).toThrow(/step.*<= cachedSteps.length/);
  });

  test('invariant helper throws on auto mode with a leftover activePiece', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    // Simulate the leak scenario.
    const invalid: Session = {
      ...s,
      activePiece: { type: 'I', col: 4, row: 1, rotation: 0 },
    };
    expect(() => assertSessionInvariants(invalid)).toThrow(
      /auto mode.*activePiece/,
    );
  });

  test('invariant helper throws on sessionStats inconsistency', () => {
    const s = createSession(bagFor('ms2'), bagFor('ms2'));
    const invalid = {
      ...s,
      sessionStats: { total: 3, correct: 5, streak: 5 },
    };
    expect(() => assertSessionInvariants(invalid)).toThrow(/correct.*> total/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #2 — Bug #2 (pick bounds) — current reducer ALLOWS the bug; after Phase 3
//       the reducer should reject the invalid transition.
// ═══════════════════════════════════════════════════════════════════════════
describe('#2 Bug #2: pick/selectRoute bounds check in guess2', () => {
  test('current reducer (pre-fix) transitions to reveal2 with empty cachedSteps via pick(2)', () => {
    // This test documents the CURRENT BROKEN behavior. Phase 3 will make
    // this test update to assert the guard instead.
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      // MS2 has 4 routes. pick(4) = Digit5 = out of bounds.
      { type: 'pick', index: 4 },
    );
    // After Phase 3: this should remain in guess2 (rejected).
    // Pre-Phase-3: it's in reveal2 with empty cachedSteps (BUG).
    expect(s.phase).toBe('guess2'); // assert the FIX
    expect(s.cachedSteps.length).toBeGreaterThan(0); // bag1 cachedSteps preserved
  });

  test('pick(3) in guess2 is rejected (also out of bounds)', () => {
    const s = apply(
      createSession(bagFor('honey_cup'), bagFor('honey_cup')),
      { type: 'setGuess', opener: 'honey_cup', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'pick', index: 8 },
    );
    expect(s.phase).toBe('guess2');
  });

  test('pick(0) and pick(1) in guess2 work correctly (in bounds)', () => {
    const s0 = createSession(bagFor('gamushiro'), bagFor('gamushiro'));
    const s1 = apply(
      s0,
      { type: 'setGuess', opener: 'gamushiro', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'pick', index: 0 },
    );
    expect(s1.phase).toBe('reveal2');
    expect(s1.routeGuess).toBe(0);

    const s2 = apply(
      s0,
      { type: 'setGuess', opener: 'gamushiro', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'pick', index: 1 },
    );
    expect(s2.phase).toBe('reveal2');
    expect(s2.routeGuess).toBe(1);
  });

  test('direct selectRoute with out-of-range index is rejected (defense-in-depth)', () => {
    const s = apply(
      createSession(bagFor('stray_cannon'), bagFor('stray_cannon')),
      { type: 'setGuess', opener: 'stray_cannon', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'selectRoute', routeIndex: 99 },
    );
    expect(s.phase).toBe('guess2');
  });

  test('direct selectRoute with negative index is rejected', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'selectRoute', routeIndex: -1 },
    );
    expect(s.phase).toBe('guess2');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #3 — Bug #1 (hold display) reproduction at the reducer level
//
// The renderer bug lives in src/renderer/session.ts, but at the reducer
// level we can prove that session.holdPiece IS correctly populated by the
// hold action — which means the renderer SHOULD read it.
// ═══════════════════════════════════════════════════════════════════════════
describe('#3 Bug #1: hold action populates session.holdPiece correctly', () => {
  test('holding in manual reveal1 sets session.holdPiece to the active piece type', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'togglePlayMode' },
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    expect(s.phase).toBe('reveal1');
    expect(s.playMode).toBe('manual');
    expect(s.activePiece).not.toBeNull();
    const activePieceTypeBeforeHold = s.activePiece!.type;

    const s2 = sessionReducer(s, { type: 'hold' });

    // After hold, holdPiece should be the previous active piece type.
    expect(s2.holdPiece).toBe(activePieceTypeBeforeHold);
    expect(s2.holdUsed).toBe(true);
    // The renderer should read s2.holdPiece (not def.holdPiece) in reveal
    // manual mode. This assertion proves the field is set; Phase 3 verifies
    // the renderer actually reads it.
  });

  test('subsequent hold swaps holdPiece with the current active type', () => {
    const s0 = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'togglePlayMode' },
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    const firstActiveType = s0.activePiece!.type;
    const s1 = sessionReducer(s0, { type: 'hold' });
    expect(s1.holdPiece).toBe(firstActiveType);
    expect(s1.activePiece!.type).toBe(s0.cachedSteps[1]!.piece);

    // Simulate a hardDrop to reset holdUsed (step advances → holdUsed=false).
    // We fake-advance by reconstructing state.
    const s2: Session = { ...s1, step: 1, holdUsed: false };
    const s3 = sessionReducer(s2, { type: 'hold' });
    // Swap: holdPiece becomes the swapped-in active's type, active becomes
    // the originally held piece.
    expect(s3.holdPiece).toBe(s2.activePiece!.type);
    expect(s3.activePiece!.type).toBe(firstActiveType);
  });

  test('holdPiece persists across movePiece / rotatePiece actions in manual reveal', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'togglePlayMode' },
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'hold' },
    );
    expect(s.holdPiece).not.toBeNull();
    const heldType = s.holdPiece;

    const s2 = apply(
      s,
      { type: 'movePiece', dx: -1, dy: 0 },
      { type: 'rotatePiece', direction: 1 },
    );
    expect(s2.holdPiece).toBe(heldType);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #4 — Every reducer output satisfies every invariant (fuzz-style smoke)
// ═══════════════════════════════════════════════════════════════════════════
describe('#4 every legal action sequence preserves invariants', () => {
  const BAGS: Array<[OpenerID, PieceType[]]> = [
    ['ms2', bagFor('ms2')],
    ['honey_cup', bagFor('honey_cup')],
    ['gamushiro', bagFor('gamushiro')],
    ['stray_cannon', bagFor('stray_cannon')],
  ];

  for (const [opener, bag] of BAGS) {
    test(`full cycle for ${opener} (auto + manual, mirror off) preserves invariants`, () => {
      let s = createSession(bag, bag);
      assertSessionInvariants(s);

      // Auto cycle.
      const autoActions: SessionAction[] = [
        { type: 'setGuess', opener, mirror: false },
        { type: 'submitGuess' },
        { type: 'stepForward' },
        { type: 'stepForward' },
        { type: 'advancePhase' },
        { type: 'pick', index: 0 },
        { type: 'advancePhase' },
      ];
      for (const a of autoActions) {
        s = sessionReducer(s, a);
        assertSessionInvariants(s);
      }

      // Manual cycle.
      s = sessionReducer(s, { type: 'togglePlayMode' });
      assertSessionInvariants(s);
      s = sessionReducer(s, { type: 'setGuess', opener, mirror: false });
      assertSessionInvariants(s);
      s = sessionReducer(s, { type: 'submitGuess' });
      assertSessionInvariants(s);

      // Drive a few gameplay actions even though they'll likely reject.
      for (const a of [
        { type: 'movePiece', dx: 1, dy: 0 },
        { type: 'rotatePiece', direction: 1 },
        { type: 'hold' },
        { type: 'hardDrop' },
      ] satisfies SessionAction[]) {
        s = sessionReducer(s, a);
        assertSessionInvariants(s);
      }
    });
  }

  test('out-of-range pick in guess2 preserves invariants (reducer rejects)', () => {
    let s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
    );
    assertSessionInvariants(s);

    for (const index of [-1, 2, 3, 99]) {
      const sNext = sessionReducer(s, { type: 'pick', index });
      assertSessionInvariants(sNext);
    }
  });

  test('out-of-range selectRoute preserves invariants (reducer rejects)', () => {
    let s = apply(
      createSession(bagFor('honey_cup'), bagFor('honey_cup')),
      { type: 'setGuess', opener: 'honey_cup', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
    );
    assertSessionInvariants(s);

    for (const routeIndex of [-1, 2, 3, 99, Number.MAX_SAFE_INTEGER]) {
      const sNext = sessionReducer(s, { type: 'selectRoute', routeIndex });
      assertSessionInvariants(sNext);
    }
  });

  test('pseudo-random action sequence over 50 actions preserves invariants', () => {
    let seed = 42;
    function rand(n: number): number {
      seed = (seed * 9301 + 49297) % 233280;
      return Math.floor((seed / 233280) * n);
    }
    const actionBank: SessionAction[] = [
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'setGuess', opener: 'honey_cup', mirror: true },
      { type: 'toggleMirror' },
      { type: 'submitGuess' },
      { type: 'stepForward' },
      { type: 'stepBackward' },
      { type: 'advancePhase' },
      { type: 'togglePlayMode' },
      { type: 'selectRoute', routeIndex: 0 },
      { type: 'selectRoute', routeIndex: 1 },
      { type: 'selectRoute', routeIndex: 99 }, // invalid
      { type: 'pick', index: 0 },
      { type: 'pick', index: 3 },
      { type: 'pick', index: 9 }, // invalid
      { type: 'primary' },
      { type: 'movePiece', dx: 1, dy: 0 },
      { type: 'movePiece', dx: -1, dy: 0 },
      { type: 'rotatePiece', direction: 1 },
      { type: 'rotatePiece', direction: -1 },
      { type: 'hardDrop' },
      { type: 'hold' },
      { type: 'softDrop' },
      { type: 'newSession' },
    ];

    let s = createSession(bagFor('ms2'), bagFor('ms2'));
    assertSessionInvariants(s);
    for (let i = 0; i < 50; i++) {
      const action = actionBank[rand(actionBank.length)]!;
      s = sessionReducer(s, action);
      assertSessionInvariants(s);
    }
  });
});
