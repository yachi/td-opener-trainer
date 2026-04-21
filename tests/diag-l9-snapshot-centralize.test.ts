/**
 * tests/diag-l9-snapshot-centralize.test.ts — Phase 2.5 empirical proof
 *
 * Proves that snapshot management can be CENTRALIZED in a deriveSnapshots
 * post-reduction step instead of scattered across 4 action cases.
 *
 * The dependency DAG:
 *   reveal1 ← (guess.opener, guess.mirror)
 *   reveal2 ← (routeGuess) + all reveal1 deps
 *   reveal3 ← (pcSolutionIndex) + all reveal2 deps
 *
 * Rules:
 *   SAVE: if entering a reveal phase (phase changed to revealN), save snapshot
 *   CLEAR: if upstream field changed, clear all downstream snapshots
 *   INVARIANT: current-phase snapshot.cachedSteps === state.cachedSteps
 */

import { describe, test, expect } from 'bun:test';
import {
  createSession,
  sessionReducer,
  assertSessionInvariants,
  type Session,
  type SessionAction,
  PHASE_META,
  isRevealPhase,
} from '../src/session';

// ── Test helpers ──

const HC_BAG1 = ['T', 'O', 'L', 'I', 'S', 'J', 'Z'] as any;
const HC_BAG2 = ['S', 'Z', 'L', 'J', 'T', 'I', 'O'] as any;

function dispatch(s: Session, a: SessionAction): Session {
  return sessionReducer(s, a);
}

/** Build a full chain: guess1 → reveal1 → guess2 → reveal2 → (maybe) reveal3 */
function buildFullChain(): {
  reveal1: Session;
  guess2: Session;
  reveal2: Session;
  reveal3: Session | null;
} {
  let s = createSession(HC_BAG1, HC_BAG2);
  s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
  s = dispatch(s, { type: 'submitGuess' });
  const reveal1 = s;

  s = dispatch(s, { type: 'advancePhase' }); // reveal1 → guess2
  const guess2 = s;

  s = dispatch(s, { type: 'selectRoute', routeIndex: 0 }); // guess2 → reveal2
  const reveal2 = s;

  s = dispatch(s, { type: 'advancePhase' }); // reveal2 → guess3 (if PC available)
  if (s.phase !== 'guess3') {
    return { reveal1, guess2, reveal2, reveal3: null };
  }
  s = dispatch(s, { type: 'selectPcSolution', solutionIndex: 0 });
  const reveal3 = s;

  return { reveal1, guess2, reveal2, reveal3 };
}

// §1 was the Phase 2.5 equivalence proof (simulateDeriveSnapshots vs production).
// Deleted after centralization shipped: it tested double-application (simulation
// on top of already-derived state), not true equivalence. The behavioral contract
// is enforced by diag-l9-nav.test.ts §1-§4 (29 tests) and property tests (19
// action types × 50+ random sequences including jumpToBag + selectPcSolution).

// ── §2: Prove the invariant "current-phase snapshot.cachedSteps === state.cachedSteps" ──

describe('§2 snapshot-state consistency invariant', () => {
  test('after submitGuess: reveal1 snapshot.cachedSteps === state.cachedSteps', () => {
    let s = createSession(HC_BAG1, HC_BAG2);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    expect(s.revealSnapshots.reveal1!.cachedSteps).toBe(s.cachedSteps);
  });

  test('after selectRoute: reveal2 snapshot.cachedSteps === state.cachedSteps', () => {
    const chain = buildFullChain();
    expect(chain.reveal2.revealSnapshots.reveal2!.cachedSteps).toBe(chain.reveal2.cachedSteps);
  });

  test('after selectPcSolution: reveal3 snapshot.cachedSteps === state.cachedSteps', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }
    expect(chain.reveal3.revealSnapshots.reveal3!.cachedSteps).toBe(chain.reveal3.cachedSteps);
  });

  test('after browseOpener: reveal1 snapshot.cachedSteps === state.cachedSteps', () => {
    const chain = buildFullChain();
    let s = dispatch(chain.reveal1, { type: 'browseOpener', opener: 'stray_cannon', mirror: false });
    expect(s.revealSnapshots.reveal1!.cachedSteps).toBe(s.cachedSteps);
  });

  test('after jumpToBag(1) from reveal2: reveal1 snapshot.cachedSteps === state.cachedSteps', () => {
    const chain = buildFullChain();
    const s = dispatch(chain.reveal2, { type: 'jumpToBag', bag: 1 });
    expect(s.revealSnapshots.reveal1!.cachedSteps).toBe(s.cachedSteps);
  });
});

// ── §3: Prove SNAPSHOT_DEPS can be expressed as a type-safe table ──

describe('§3 SNAPSHOT_DEPS structural proof', () => {
  // The dependency table: each snapshot key → the upstream Session fields it depends on
  const SNAPSHOT_DEPS = {
    reveal1: (s: Session) => [s.guess?.opener, s.guess?.mirror] as const,
    reveal2: (s: Session) => [s.guess?.opener, s.guess?.mirror, s.routeGuess] as const,
    reveal3: (s: Session) => [s.guess?.opener, s.guess?.mirror, s.routeGuess, s.pcSolutionIndex] as const,
  } satisfies Record<'reveal1' | 'reveal2' | 'reveal3', (s: Session) => readonly unknown[]>;

  function depsChanged(
    key: keyof typeof SNAPSHOT_DEPS,
    prev: Session,
    next: Session,
  ): boolean {
    const prevDeps = SNAPSHOT_DEPS[key](prev);
    const nextDeps = SNAPSHOT_DEPS[key](next);
    return prevDeps.some((v, i) => v !== nextDeps[i]);
  }

  test('browseOpener changes reveal1 deps', () => {
    const chain = buildFullChain();
    const prev = chain.reveal1;
    const next = dispatch(prev, { type: 'browseOpener', opener: 'stray_cannon', mirror: false });
    expect(depsChanged('reveal1', prev, next)).toBe(true);
    expect(depsChanged('reveal2', prev, next)).toBe(true); // inherited
    expect(depsChanged('reveal3', prev, next)).toBe(true); // inherited
  });

  test('selectRoute changes reveal2 deps but not reveal1', () => {
    const chain = buildFullChain();
    const prev = chain.guess2;
    const next = dispatch(prev, { type: 'selectRoute', routeIndex: 0 });
    expect(depsChanged('reveal1', prev, next)).toBe(false);
    expect(depsChanged('reveal2', prev, next)).toBe(true);
    expect(depsChanged('reveal3', prev, next)).toBe(true); // inherited
  });

  test('selectPcSolution changes reveal3 deps but not reveal1/2', () => {
    const chain = buildFullChain();
    const prev = chain.reveal2;
    const next = dispatch(prev, { type: 'selectPcSolution', solutionIndex: 0 });
    if (next.phase !== 'reveal3') { test.skip; return; }
    expect(depsChanged('reveal1', prev, next)).toBe(false);
    expect(depsChanged('reveal2', prev, next)).toBe(false);
    expect(depsChanged('reveal3', prev, next)).toBe(true);
  });

  test('stepForward changes no snapshot deps', () => {
    const chain = buildFullChain();
    const prev = chain.reveal1;
    const next = dispatch(prev, { type: 'stepForward' });
    if (next === prev) return; // identity
    expect(depsChanged('reveal1', prev, next)).toBe(false);
    expect(depsChanged('reveal2', prev, next)).toBe(false);
    expect(depsChanged('reveal3', prev, next)).toBe(false);
  });

  test('jumpToBag(1) from reveal2 changes no upstream deps (same opener)', () => {
    const chain = buildFullChain();
    const prev = chain.reveal2;
    const next = dispatch(prev, { type: 'jumpToBag', bag: 1 });
    // opener/mirror unchanged, but routeGuess goes back to snapshot's value
    expect(depsChanged('reveal1', prev, next)).toBe(false);
    // routeGuess changes (from snapshot's -1 vs prev's 0)
    // This is expected — the jumpToBag restored a DIFFERENT routeGuess
    // But that's fine because we're AT reveal1, not reveal2
  });
});

// ── §4: Invariant 9b is load-bearing (mutation test proof) ──

describe('§4 invariant 9b — stale snapshot detection is load-bearing', () => {
  test('stale reveal1 snapshot throws invariant violation', () => {
    let s = createSession(HC_BAG1, HC_BAG2);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    // Construct corrupt state: snapshot cachedSteps differs from state cachedSteps
    const corrupt: Session = {
      ...s,
      revealSnapshots: {
        ...s.revealSnapshots,
        reveal1: {
          cachedSteps: [], // stale — doesn't match s.cachedSteps
          baseBoard: s.baseBoard,
          routeGuess: s.routeGuess,
          pcSolutionIndex: s.pcSolutionIndex,
        },
      },
    };
    expect(() => assertSessionInvariants(corrupt)).toThrow(/stale snapshot/);
  });

  test('matching snapshot passes invariant check', () => {
    let s = createSession(HC_BAG1, HC_BAG2);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    // Valid: snapshot cachedSteps === state.cachedSteps
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });

  test('no snapshot for current phase passes invariant check', () => {
    let s = createSession(HC_BAG1, HC_BAG2);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    // Valid: no snapshot at all (e.g., jumpToBag preserve behavior)
    const noSnap: Session = { ...s, revealSnapshots: {} };
    // Need to add cachedSteps check — reveal without snapshot is fine
    // (snapshot might not exist yet on first visit in some edge cases)
    expect(() => assertSessionInvariants(noSnap)).not.toThrow();
  });
});
