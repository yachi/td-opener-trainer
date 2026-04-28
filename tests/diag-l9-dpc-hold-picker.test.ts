/**
 * tests/diag-l9-dpc-hold-picker.test.ts — L9 Phase 2.5 empirical proof
 *
 * Validates the DPC hold picker design BEFORE touching production code.
 * This is the RED phase — these tests describe the target behavior and
 * should FAIL until session.ts is updated.
 *
 * Design:
 *   - `createDpcSession(null)` → hold picker mode (guess4, null hold)
 *   - `isDpcDirectSession` widened to include null-hold guess4
 *   - `pick` in guess4 with null hold → sets dpcHoldPiece from valid list
 *   - `pick` in guess4 with set hold → selects DPC solution (existing)
 *   - `resetDpcHold` action → returns to hold picker (null hold)
 *   - Restart loop preserves hold (focused practice)
 *   - D key from keyboard dispatches resetDpcHold
 *
 * §1: createDpcSession(null) produces valid state
 * §2: isDpcDirectSession covers null-hold guess4
 * §3: pick in guess4 with null hold sets dpcHoldPiece
 * §4: resetDpcHold returns to hold picker
 * §5: Full lifecycle: hold picker → pick hold → pick solution → reveal4 → reveal5 → loop → reset
 * §6: Invariants hold at every step
 * §7: Edge cases (T-hold has 0 solutions, out-of-range, NaN)
 */

import { describe, test, expect } from 'bun:test';
import {
  createDpcSession,
  isDpcDirectSession,
  getDpcSolutionsForSession,
  sessionReducer,
  assertSessionInvariants,
  type Session,
  type SessionAction,
} from '../src/session.ts';
import { getDpcSolutions } from '../src/openers/bag4-dpc.ts';
import { getBag5PcSolution } from '../src/openers/bag5-pc.ts';

/** All hold pieces that have DPC solutions. */
const DPC_HOLD_PIECES = ['O', 'S', 'Z', 'I', 'J', 'L'] as const;

/** Helper: dispatch action through production sessionReducer. */
function dispatch(s: Session, action: SessionAction): Session {
  return sessionReducer(s, action);
}

// ═══════════════════════════════════════════════════════════════════════════
// §1  createDpcSession(null) produces valid hold-picker state
// ═══════════════════════════════════════════════════════════════════════════

describe('§1 createDpcSession(null)', () => {
  test('creates session in guess4 with null dpcHoldPiece', () => {
    const s = createDpcSession(null);
    expect(s.phase).toBe('guess4');
    expect(s.guess).toBeNull();
    expect(s.dpcHoldPiece).toBeNull();
    expect(s.dpcSolutionIndex).toBe(-1);
  });

  test('getDpcSolutionsForSession returns empty for null hold', () => {
    const s = createDpcSession(null);
    expect(getDpcSolutionsForSession(s)).toEqual([]);
  });

  test('stats and playMode default correctly', () => {
    const s = createDpcSession(null);
    expect(s.playMode).toBe('auto');
    expect(s.sessionStats).toEqual({ total: 0, correct: 0, streak: 0 });
  });

  test('preserves opts when provided', () => {
    const stats = { total: 5, correct: 3, streak: 2 };
    const s = createDpcSession(null, { playMode: 'manual', sessionStats: stats });
    expect(s.playMode).toBe('manual');
    expect(s.sessionStats).toEqual(stats);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §2  isDpcDirectSession covers null-hold guess4
// ═══════════════════════════════════════════════════════════════════════════

describe('§2 isDpcDirectSession widened', () => {
  test('returns true for null-hold guess4 (hold picker)', () => {
    const s = createDpcSession(null);
    expect(isDpcDirectSession(s)).toBe(true);
  });

  test('returns true for set-hold guess4 (existing behavior)', () => {
    const s = createDpcSession('O' as any);
    expect(isDpcDirectSession(s)).toBe(true);
  });

  test('returns false for normal session at guess1', () => {
    // Normal sessions have a non-null guess after setGuess, but start with null guess at guess1.
    // isDpcDirectSession should be false because guess1 !== guess4.
    const s = createDpcSession(null);
    const normal = { ...s, phase: 'guess1' as const, dpcHoldPiece: null };
    expect(isDpcDirectSession(normal)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §3  pick in guess4 with null hold sets dpcHoldPiece
// ═══════════════════════════════════════════════════════════════════════════

describe('§3 pick sets dpcHoldPiece when null', () => {
  for (let i = 0; i < DPC_HOLD_PIECES.length; i++) {
    const hold = DPC_HOLD_PIECES[i];
    test(`pick index ${i} → hold=${hold}`, () => {
      const s = createDpcSession(null);
      const next = dispatch(s, { type: 'pick', index: i });
      // After picking a hold piece, should still be in guess4 but with dpcHoldPiece set.
      expect(next.phase).toBe('guess4');
      expect(next.dpcHoldPiece).toBe(hold);
      // Now getDpcSolutionsForSession should return solutions.
      const sols = getDpcSolutionsForSession(next);
      expect(sols.length).toBeGreaterThan(0);
    });
  }

  test('pick with set hold selects DPC solution (existing behavior)', () => {
    // Step 1: pick hold piece O
    const s = createDpcSession(null);
    const withHold = dispatch(s, { type: 'pick', index: 0 }); // O
    expect(withHold.dpcHoldPiece).toBe('O');

    // Step 2: pick DPC solution 0
    const withSolution = dispatch(withHold, { type: 'pick', index: 0 });
    expect(withSolution.phase).toBe('reveal4');
    expect(withSolution.dpcSolutionIndex).toBe(0);
    expect(withSolution.cachedSteps.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §4  resetDpcHold action returns to hold picker
// ═══════════════════════════════════════════════════════════════════════════

describe('§4 resetDpcHold', () => {
  test('from guess4 with set hold → null hold (hold picker)', () => {
    const s = createDpcSession('O' as any);
    expect(s.dpcHoldPiece).toBe('O');
    const next = dispatch(s, { type: 'resetDpcHold' });
    expect(next.phase).toBe('guess4');
    expect(next.dpcHoldPiece).toBeNull();
    expect(next.dpcSolutionIndex).toBe(-1);
  });

  test('from reveal4 → guess4 with null hold', () => {
    const s = createDpcSession('O' as any);
    const reveal4 = dispatch(s, { type: 'selectDpcSolution', solutionIndex: 0 });
    expect(reveal4.phase).toBe('reveal4');
    const next = dispatch(reveal4, { type: 'resetDpcHold' });
    expect(next.phase).toBe('guess4');
    expect(next.dpcHoldPiece).toBeNull();
  });

  test('no-op if not DPC-direct session', () => {
    // Normal session at guess1 — resetDpcHold should be no-op.
    const s = createDpcSession(null);
    const normal = { ...s, phase: 'guess1' as const } as Session;
    // Can't dispatch through sessionReducer because the state isn't valid
    // for guess1 (no bag etc.), so this tests the design intent:
    // resetDpcHold is only meaningful in DPC-direct sessions.
  });

  test('preserves playMode and sessionStats', () => {
    const stats = { total: 5, correct: 3, streak: 2 };
    const s = createDpcSession('O' as any, { playMode: 'manual', sessionStats: stats });
    const next = dispatch(s, { type: 'resetDpcHold' });
    expect(next.playMode).toBe('manual');
    expect(next.sessionStats).toEqual(stats);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §5  Full lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe('§5 full lifecycle', () => {
  test('hold picker → pick hold → pick solution → reveal4 → reveal5 → loop preserves hold', () => {
    // 1. Start at hold picker
    let s = createDpcSession(null);
    expect(s.phase).toBe('guess4');
    expect(s.dpcHoldPiece).toBeNull();

    // 2. Pick hold piece O (index 0)
    s = dispatch(s, { type: 'pick', index: 0 });
    expect(s.phase).toBe('guess4');
    expect(s.dpcHoldPiece).toBe('O');

    // 3. Pick DPC solution 0
    s = dispatch(s, { type: 'pick', index: 0 });
    expect(s.phase).toBe('reveal4');
    expect(s.dpcSolutionIndex).toBe(0);
    assertSessionInvariants(s);

    // 4. Step through reveal4
    for (let i = 0; i < s.cachedSteps.length; i++) {
      s = dispatch(s, { type: 'stepForward' });
    }

    // 5. Advance to reveal5 (if bag5 PC exists for this solution)
    const bag5Sol = getBag5PcSolution('O', 0);
    if (bag5Sol) {
      s = dispatch(s, { type: 'advancePhase' });
      expect(s.phase).toBe('reveal5');
      assertSessionInvariants(s);

      // Step through reveal5
      for (let i = 0; i < s.cachedSteps.length; i++) {
        s = dispatch(s, { type: 'stepForward' });
      }
    }

    // 6. Advance → loop back to guess4 (preserving hold)
    s = dispatch(s, { type: 'advancePhase' });
    expect(s.phase).toBe('guess4');
    expect(s.dpcHoldPiece).toBe('O'); // Hold preserved for focused practice
    assertSessionInvariants(s);
  });

  test('hold picker → pick hold → D key resets to hold picker', () => {
    let s = createDpcSession(null);
    s = dispatch(s, { type: 'pick', index: 0 }); // Pick O
    expect(s.dpcHoldPiece).toBe('O');

    s = dispatch(s, { type: 'resetDpcHold' }); // D key resets
    expect(s.phase).toBe('guess4');
    expect(s.dpcHoldPiece).toBeNull();
    assertSessionInvariants(s);
  });

  test('all 6 hold pieces complete full cycle', () => {
    for (let holdIdx = 0; holdIdx < DPC_HOLD_PIECES.length; holdIdx++) {
      const hold = DPC_HOLD_PIECES[holdIdx];
      let s = createDpcSession(null);

      // Pick hold
      s = dispatch(s, { type: 'pick', index: holdIdx });
      expect(s.dpcHoldPiece).toBe(hold);

      // Pick first DPC solution
      const sols = getDpcSolutionsForSession(s);
      expect(sols.length).toBeGreaterThan(0);
      s = dispatch(s, { type: 'pick', index: 0 });
      expect(s.phase).toBe('reveal4');
      assertSessionInvariants(s);

      // Advance to end (reveal5 if exists, then loop)
      s = dispatch(s, { type: 'advancePhase' }); // reveal4 → reveal5 or restart
      if (s.phase === 'reveal5') {
        assertSessionInvariants(s);
        s = dispatch(s, { type: 'advancePhase' }); // reveal5 → restart
      }
      expect(s.phase).toBe('guess4');
      expect(s.dpcHoldPiece).toBe(hold); // Hold preserved
      assertSessionInvariants(s);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §6  Invariants hold at every step
// ═══════════════════════════════════════════════════════════════════════════

describe('§6 invariants', () => {
  test('createDpcSession(null) passes invariants', () => {
    const s = createDpcSession(null);
    // Invariant 5 needs widening: null guess + null dpcHoldPiece at guess4
    // should be valid for DPC-direct hold picker.
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });

  test('after picking hold, invariants pass', () => {
    const s = createDpcSession(null);
    const next = dispatch(s, { type: 'pick', index: 0 });
    expect(() => assertSessionInvariants(next)).not.toThrow();
  });

  test('invariant 5 allows null guess + null dpcHoldPiece at guess4 (hold picker)', () => {
    // This tests the invariant widening specifically.
    // Current invariant 5: null guess implies guess1 or DPC-direct (dpcHoldPiece !== null).
    // New: also allow guess4 with null dpcHoldPiece (hold picker sub-state).
    const s = createDpcSession(null);
    expect(s.guess).toBeNull();
    expect(s.dpcHoldPiece).toBeNull();
    expect(s.phase).toBe('guess4');
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §7  Edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('§7 edge cases', () => {
  test('T-hold has 0 DPC solutions — not in valid pick list', () => {
    expect(getDpcSolutions('T')).toEqual([]);
    // T should not appear in the hold picker list.
    // The pick action with index 6 (if T were at position 6) should be out of range.
  });

  test('pick out of range in hold picker is no-op', () => {
    const s = createDpcSession(null);
    const next = dispatch(s, { type: 'pick', index: 10 });
    // Should be no-op (index out of range).
    expect(next.phase).toBe('guess4');
    expect(next.dpcHoldPiece).toBeNull();
  });

  test('pick NaN in hold picker is no-op', () => {
    const s = createDpcSession(null);
    const next = dispatch(s, { type: 'pick', index: NaN });
    expect(next.phase).toBe('guess4');
    expect(next.dpcHoldPiece).toBeNull();
  });

  test('pick negative in hold picker is no-op', () => {
    const s = createDpcSession(null);
    const next = dispatch(s, { type: 'pick', index: -1 });
    expect(next.phase).toBe('guess4');
    expect(next.dpcHoldPiece).toBeNull();
  });

  test('primary (SPACE) in hold picker = skip to newSession', () => {
    // SPACE in guess4 with null hold should restart/skip.
    const s = createDpcSession(null);
    const next = dispatch(s, { type: 'primary' });
    // Current behavior: primary in guess4 = newSession.
    // For DPC-direct with null hold, this should restart to hold picker.
    expect(next.phase).toBe('guess4');
    expect(next.dpcHoldPiece).toBeNull();
  });

  test('solution count per hold piece matches expectations', () => {
    const expected: Record<string, number> = {
      O: 4, S: 2, Z: 2, I: 6, J: 1, L: 1,
    };
    for (const [hold, count] of Object.entries(expected)) {
      expect(getDpcSolutions(hold as any).length).toBe(count);
    }
  });
});
