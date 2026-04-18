/**
 * diag-l9-property.test.ts — Property-based adversarial fuzzing of the L9
 * session reducer.
 *
 * This is the fast-check counterpart to the unit-level invariant proofs in
 * tests/diag-l9-invariants.test.ts. Those tests pin named bug classes; this
 * file generates random action sequences and asserts that
 * `assertSessionInvariants` holds after EVERY reduction.
 *
 * The reducer wrapper (`sessionReducer`) already runs `assertSessionInvariants`
 * on its output and throws `InvariantViolation` on failure. So the property
 * is simply: "no sequence of actions makes the reducer throw." fast-check
 * will shrink any counterexample down to a minimal reproduction, pointing
 * directly at a hole in the invariant fix.
 *
 * Out-of-range values are deliberately included in the arbitraries
 * (routeIndex -5..10, pick index -5..10) to probe the bounds checks that
 * Bug #2 motivated.
 */

import { describe, test, expect } from 'bun:test';
import fc from 'fast-check';

import {
  createSession,
  sessionReducer,
  assertSessionInvariants,
  type Session,
  type SessionAction,
} from '../src/session.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import { OPENERS } from '../src/openers/decision.ts';
import type { OpenerID } from '../src/openers/types.ts';
import type { PieceType } from '../src/core/types.ts';

// ── Arbitraries ──────────────────────────────────────────────────────────

const arbOpener: fc.Arbitrary<OpenerID> = fc.constantFrom(
  'stray_cannon',
  'honey_cup',
  'gamushiro',
  'ms2',
);

const arbPiece: fc.Arbitrary<PieceType> = fc.constantFrom(
  'I',
  'T',
  'O',
  'S',
  'Z',
  'L',
  'J',
);

/** A shuffled 7-piece permutation (standard tetris bag). */
const arbBag: fc.Arbitrary<PieceType[]> = fc
  .shuffledSubarray<PieceType>(['I', 'T', 'O', 'S', 'Z', 'L', 'J'], {
    minLength: 7,
    maxLength: 7,
  })
  .map((a) => [...a]);

/**
 * The full action arbitrary. Out-of-range values for routeIndex and pick
 * index are included on purpose — the reducer must handle them by returning
 * the state unchanged and still satisfy every invariant.
 */
const arbAction: fc.Arbitrary<SessionAction> = fc.oneof(
  // session-level (9)
  fc.record({
    type: fc.constant('newSession' as const),
  }),
  fc.record({
    type: fc.constant('setGuess' as const),
    opener: arbOpener,
    mirror: fc.boolean(),
  }),
  fc.record({ type: fc.constant('toggleMirror' as const) }),
  fc.record({ type: fc.constant('submitGuess' as const) }),
  fc.record({ type: fc.constant('stepForward' as const) }),
  fc.record({ type: fc.constant('stepBackward' as const) }),
  fc.record({ type: fc.constant('advancePhase' as const) }),
  fc.record({ type: fc.constant('togglePlayMode' as const) }),
  fc.record({
    type: fc.constant('selectRoute' as const),
    routeIndex: fc.integer({ min: -5, max: 10 }),
  }),
  // manual-play (5)
  fc.record({
    type: fc.constant('movePiece' as const),
    dx: fc.integer({ min: -2, max: 2 }),
    dy: fc.integer({ min: -2, max: 2 }),
  }),
  fc.record({
    type: fc.constant('rotatePiece' as const),
    direction: fc.oneof(fc.constant(1 as const), fc.constant(-1 as const)),
  }),
  fc.record({ type: fc.constant('hardDrop' as const) }),
  fc.record({ type: fc.constant('hold' as const) }),
  fc.record({ type: fc.constant('softDrop' as const) }),
  // browse (1)
  fc.record({
    type: fc.constant('browseOpener' as const),
    opener: arbOpener,
    mirror: fc.boolean(),
  }),
  // intents (2)
  fc.record({ type: fc.constant('primary' as const) }),
  fc.record({
    type: fc.constant('pick' as const),
    index: fc.integer({ min: -5, max: 10 }),
  }),
);

// ── Helpers ──────────────────────────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════
// Property 1 — any action sequence preserves invariants
// ═══════════════════════════════════════════════════════════════════════

describe('Property 1: every action sequence preserves invariants', () => {
  test('10,000 random sequences × up to 100 actions each', () => {
    fc.assert(
      fc.property(
        arbBag,
        arbBag,
        fc.array(arbAction, { minLength: 0, maxLength: 100 }),
        (bag1, bag2, actions) => {
          let s = createSession(bag1, bag2);
          // Creating the session must itself produce a valid state.
          assertSessionInvariants(s);
          for (const action of actions) {
            s = sessionReducer(s, action);
            // sessionReducer already asserts invariants; this is a
            // belt-and-suspenders check in case the wrapper is bypassed.
            assertSessionInvariants(s);
          }
          return true;
        },
      ),
      { numRuns: 10_000 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Property 2 — reducer is deterministic for same-state inputs
//
// IMPORTANT caveat: `nextDeterministicBag()` is a module-level counter. Any
// action path that regenerates bags without explicit inputs (newSession with
// no bags, advancePhase from reveal2, primary that routes to either of the
// above) pulls from that shared counter. Two parallel reducer runs will
// therefore see different fresh bags — deliberate, not a bug. We exclude
// those actions from this property and cover their determinism via the
// dedicated cycle test in Property 5.
// ═══════════════════════════════════════════════════════════════════════

const arbActionNoFreshBags: fc.Arbitrary<SessionAction> = fc.oneof(
  fc.record({
    type: fc.constant('setGuess' as const),
    opener: arbOpener,
    mirror: fc.boolean(),
  }),
  fc.record({ type: fc.constant('toggleMirror' as const) }),
  fc.record({ type: fc.constant('submitGuess' as const) }),
  fc.record({ type: fc.constant('stepForward' as const) }),
  fc.record({ type: fc.constant('stepBackward' as const) }),
  // NOTE: advancePhase from reveal2 regenerates bags — but we can only
  // reach reveal2 via submitGuess + selectRoute, and the bags it pulls
  // come from the global counter. Keeping advancePhase in for guess1/reveal1
  // would be fine but fc can build a reveal2, so we exclude it here too.
  fc.record({ type: fc.constant('togglePlayMode' as const) }),
  fc.record({
    type: fc.constant('selectRoute' as const),
    routeIndex: fc.integer({ min: -5, max: 10 }),
  }),
  fc.record({
    type: fc.constant('movePiece' as const),
    dx: fc.integer({ min: -2, max: 2 }),
    dy: fc.integer({ min: -2, max: 2 }),
  }),
  fc.record({
    type: fc.constant('rotatePiece' as const),
    direction: fc.oneof(fc.constant(1 as const), fc.constant(-1 as const)),
  }),
  fc.record({ type: fc.constant('hardDrop' as const) }),
  fc.record({ type: fc.constant('hold' as const) }),
  fc.record({ type: fc.constant('softDrop' as const) }),
  fc.record({
    type: fc.constant('browseOpener' as const),
    opener: arbOpener,
    mirror: fc.boolean(),
  }),
  fc.record({
    type: fc.constant('pick' as const),
    index: fc.integer({ min: -5, max: 10 }),
  }),
);

describe('Property 2: reducer is deterministic (excluding fresh-bag actions)', () => {
  test('same bags + same action sequence → identical result (1,000 runs)', () => {
    fc.assert(
      fc.property(
        arbBag,
        arbBag,
        fc.array(arbActionNoFreshBags, { minLength: 0, maxLength: 60 }),
        (bag1, bag2, actions) => {
          let a = createSession(bag1, bag2);
          let b = createSession(bag1, bag2);
          for (const action of actions) {
            a = sessionReducer(a, action);
            b = sessionReducer(b, action);
          }
          expect(a).toEqual(b);
          return true;
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Property 3 — newSession preserves playMode + sessionStats
// ═══════════════════════════════════════════════════════════════════════

describe('Property 3: newSession preserves playMode + sessionStats', () => {
  test('dispatching newSession twice in a row keeps playMode + stats stable', () => {
    fc.assert(
      fc.property(
        arbBag,
        arbBag,
        fc.array(arbAction, { minLength: 0, maxLength: 50 }),
        (bag1, bag2, warmup) => {
          let s = createSession(bag1, bag2);
          // Warm up to a random state so we don't just test fresh sessions.
          for (const a of warmup) s = sessionReducer(s, a);

          const beforePlayMode = s.playMode;
          const beforeStats = { ...s.sessionStats };

          const s1 = sessionReducer(s, { type: 'newSession' });
          const s2 = sessionReducer(s1, { type: 'newSession' });

          expect(s1.playMode).toBe(beforePlayMode);
          expect(s1.sessionStats).toEqual(beforeStats);
          expect(s2.playMode).toBe(beforePlayMode);
          expect(s2.sessionStats).toEqual(beforeStats);
          // Phase should be guess1 after newSession.
          expect(s1.phase).toBe('guess1');
          expect(s2.phase).toBe('guess1');
          expect(s1.guess).toBeNull();
          expect(s2.guess).toBeNull();
          return true;
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Property 4 — invalid selectRoute is always rejected in guess2
// ═══════════════════════════════════════════════════════════════════════

describe('Property 4: invalid selectRoute rejected in guess2', () => {
  test('out-of-range routeIndex leaves phase === guess2 with preserved cachedSteps', () => {
    fc.assert(
      fc.property(
        arbOpener,
        fc.boolean(),
        fc.integer({ min: -20, max: 20 }),
        (opener, mirror, routeIndex) => {
          // Build a bag guaranteed to make the guess correct (so submitGuess
          // doesn't fall back to bestOpener and change the opener).
          const def = OPENERS[opener];
          const bag = mirror
            ? def.canBuildMirror(bagFor(opener))
              ? bagFor(opener)
              : bagFor(opener) // any bag is fine as long as canBuildMirror
            : bagFor(opener);
          // Skip cases where the effective guess gets swapped by bestOpener —
          // we want to arrive at guess2 with the original (opener, mirror).
          const reachesGuess2 = mirror
            ? def.canBuildMirror(bag)
            : def.canBuild(bag);
          fc.pre(reachesGuess2);

          const s2 = apply(
            createSession(bag, bag),
            { type: 'setGuess', opener, mirror },
            { type: 'submitGuess' },
            { type: 'advancePhase' },
          );
          expect(s2.phase).toBe('guess2');
          const bag1CachedLen = s2.cachedSteps.length;
          expect(bag1CachedLen).toBeGreaterThan(0);

          const routes = getBag2Routes(opener, mirror);
          const isInvalid = routeIndex < 0 || routeIndex >= routes.length;
          const s3 = sessionReducer(s2, { type: 'selectRoute', routeIndex });

          if (isInvalid) {
            // Reducer must reject — still in guess2 with bag1 cached steps.
            expect(s3.phase).toBe('guess2');
            expect(s3.cachedSteps.length).toBe(bag1CachedLen);
            expect(s3.routeGuess).toBe(-1);
          } else {
            // Valid — should transition to reveal2.
            expect(s3.phase).toBe('reveal2');
            expect(s3.routeGuess).toBe(routeIndex);
            expect(s3.cachedSteps.length).toBeGreaterThan(0);
          }
          return true;
        },
      ),
      { numRuns: 2_000 },
    );
  });

  test('invalid pick in guess2 also rejected', () => {
    fc.assert(
      fc.property(
        arbOpener,
        fc.boolean(),
        fc.integer({ min: -20, max: 20 }),
        (opener, mirror, index) => {
          const def = OPENERS[opener];
          const bag = bagFor(opener);
          const reaches = mirror ? def.canBuildMirror(bag) : def.canBuild(bag);
          fc.pre(reaches);

          const g2 = apply(
            createSession(bag, bag),
            { type: 'setGuess', opener, mirror },
            { type: 'submitGuess' },
            { type: 'advancePhase' },
          );
          expect(g2.phase).toBe('guess2');

          const routes = getBag2Routes(opener, mirror);
          const isInvalid = index < 0 || index >= routes.length;
          const after = sessionReducer(g2, { type: 'pick', index });

          if (isInvalid) {
            expect(after.phase).toBe('guess2');
            expect(after.cachedSteps.length).toBe(g2.cachedSteps.length);
          } else {
            expect(after.phase).toBe('reveal2');
            expect(after.routeGuess).toBe(index);
          }
          return true;
        },
      ),
      { numRuns: 2_000 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Property 5 — full cycle invariants
// ═══════════════════════════════════════════════════════════════════════

describe('Property 5: full guess1 → reveal1 → guess2 → reveal2 → newSession cycle', () => {
  test('every intermediate state satisfies every invariant', () => {
    fc.assert(
      fc.property(
        arbOpener,
        fc.boolean(),
        fc.nat({ max: 1 }), // routeIndex 0 or 1 — every opener has exactly 2 routes
        fc.boolean(), // manual or auto
        (opener, mirror, routeIndex, manual) => {
          const def = OPENERS[opener];
          const bag = bagFor(opener);
          // Only run this property when the guess is correct — it keeps the
          // shown opener stable so routeIndex maps to the same route list.
          const reaches = mirror ? def.canBuildMirror(bag) : def.canBuild(bag);
          fc.pre(reaches);

          let s = createSession(bag, bag);
          assertSessionInvariants(s);

          if (manual) {
            s = sessionReducer(s, { type: 'togglePlayMode' });
            assertSessionInvariants(s);
          }
          s = sessionReducer(s, { type: 'setGuess', opener, mirror });
          assertSessionInvariants(s);
          s = sessionReducer(s, { type: 'submitGuess' });
          assertSessionInvariants(s);
          expect(s.phase).toBe('reveal1');

          s = sessionReducer(s, { type: 'advancePhase' });
          assertSessionInvariants(s);
          expect(s.phase).toBe('guess2');

          // Clamp routeIndex to the opener's actual route count.
          const routes = getBag2Routes(opener, mirror);
          const idx = routeIndex % routes.length;
          s = sessionReducer(s, { type: 'selectRoute', routeIndex: idx });
          assertSessionInvariants(s);
          expect(s.phase).toBe('reveal2');

          s = sessionReducer(s, { type: 'advancePhase' });
          assertSessionInvariants(s);

          // HC has PC data → goes to guess3; others → restart to guess1.
          if (s.phase === 'guess3') {
            // Continue through guess3 → reveal3 → guess1
            s = sessionReducer(s, { type: 'selectPcSolution', solutionIndex: 0 });
            assertSessionInvariants(s);
            expect(s.phase).toBe('reveal3');
            s = sessionReducer(s, { type: 'advancePhase' });
            assertSessionInvariants(s);
          }
          expect(s.phase).toBe('guess1');
          expect(s.guess).toBeNull();
          // Stats carry forward; we made 1 submission.
          expect(s.sessionStats.total).toBe(1);
          return true;
        },
      ),
      { numRuns: 2_000 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Property 6 — togglePlayMode involution w.r.t. playMode field
// ═══════════════════════════════════════════════════════════════════════

describe('Property 6: togglePlayMode twice restores playMode', () => {
  test('double toggle brings playMode back to its original value', () => {
    fc.assert(
      fc.property(
        arbBag,
        arbBag,
        fc.array(arbAction, { minLength: 0, maxLength: 40 }),
        (bag1, bag2, warmup) => {
          let s = createSession(bag1, bag2);
          for (const a of warmup) s = sessionReducer(s, a);
          const originalMode = s.playMode;

          const s1 = sessionReducer(s, { type: 'togglePlayMode' });
          const s2 = sessionReducer(s1, { type: 'togglePlayMode' });

          // playMode field itself is involutive — note that activePiece/hold
          // fields may NOT be, due to spawn/clear hooks, per the user's
          // task spec.
          expect(s1.playMode).not.toBe(originalMode);
          expect(s2.playMode).toBe(originalMode);
          assertSessionInvariants(s1);
          assertSessionInvariants(s2);
          return true;
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Named bug-class assertions (called out in the task brief)
// ═══════════════════════════════════════════════════════════════════════

describe('Known-bug assertions', () => {
  test('selectRoute({routeIndex: 99}) in guess2 stays in guess2', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
    );
    expect(s.phase).toBe('guess2');
    const after = sessionReducer(s, { type: 'selectRoute', routeIndex: 99 });
    expect(after.phase).toBe('guess2');
    expect(after.cachedSteps.length).toBeGreaterThan(0);
  });

  test('pick({index: 99}) in guess2 stays in guess2 (out-of-range for all openers)', () => {
    for (const opener of [
      'stray_cannon',
      'honey_cup',
      'gamushiro',
      'ms2',
    ] as const) {
      const def = OPENERS[opener];
      const bag = bagFor(opener);
      if (!def.canBuild(bag)) continue;
      const s = apply(
        createSession(bag, bag),
        { type: 'setGuess', opener, mirror: false },
        { type: 'submitGuess' },
        { type: 'advancePhase' },
      );
      expect(s.phase).toBe('guess2');
      const after = sessionReducer(s, { type: 'pick', index: 99 });
      expect(after.phase).toBe('guess2');
    }
  });

  test('hold in manual reveal: either holdPiece is set OR active was null at final step', () => {
    const s0 = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'togglePlayMode' },
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    expect(s0.phase).toBe('reveal1');
    expect(s0.playMode).toBe('manual');
    expect(s0.activePiece).not.toBeNull();

    const s1 = sessionReducer(s0, { type: 'hold' });
    // Per the assertion in the task brief: holdPiece !== null OR
    // (activePiece was null at the last step before hold).
    const wasLastStepWithNullActive =
      s0.step === s0.cachedSteps.length - 1 && s0.activePiece === null;
    expect(s1.holdPiece !== null || wasLastStepWithNullActive).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Number.isInteger guards for routeIndex/pick/movePiece
  //
  // The type system says dx/dy/index/routeIndex are numbers, but nothing at
  // runtime prevents floats, NaN, or Infinity. Property tests using fc.integer
  // only probe integers, so they miss this class. These tests fire explicit
  // non-integer values and assert the reducer rejects them safely.
  // ─────────────────────────────────────────────────────────────────────────

  test('selectRoute with float/NaN/Infinity routeIndex is rejected', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
    );
    for (const routeIndex of [0.5, 1.5, -0.1, NaN, Infinity, -Infinity]) {
      const next = sessionReducer(s, { type: 'selectRoute', routeIndex });
      // Rejected → stays in guess2 with the original cachedSteps.
      expect(next.phase).toBe('guess2');
      expect(next).toBe(s);
    }
  });

  test('pick with float/NaN/Infinity index is rejected in guess1 and guess2', () => {
    const s1 = createSession(bagFor('ms2'), bagFor('ms2'));
    expect(s1.phase).toBe('guess1');
    for (const index of [0.5, 1.5, -0.1, NaN, Infinity, -Infinity]) {
      const next = sessionReducer(s1, { type: 'pick', index });
      expect(next.phase).toBe('guess1');
      expect(next).toBe(s1);
    }

    const s2 = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
    );
    expect(s2.phase).toBe('guess2');
    for (const index of [0.5, 1.5, -0.1, NaN, Infinity, -Infinity]) {
      const next = sessionReducer(s2, { type: 'pick', index });
      expect(next.phase).toBe('guess2');
      expect(next).toBe(s2);
    }
  });

  test('movePiece with float/NaN/Infinity dx or dy is rejected', () => {
    const s = apply(
      createSession(bagFor('ms2'), bagFor('ms2')),
      { type: 'togglePlayMode' },
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    expect(s.playMode).toBe('manual');
    expect(s.activePiece).not.toBeNull();

    for (const [dx, dy] of [
      [0.5, 0],
      [0, 0.5],
      [NaN, 0],
      [0, NaN],
      [Infinity, 0],
      [0, -Infinity],
      [0.1, 0.1],
    ]) {
      const next = sessionReducer(s, { type: 'movePiece', dx, dy });
      // Rejected → activePiece unchanged (reference equality).
      expect(next.activePiece).toBe(s.activePiece);
    }
  });
});
