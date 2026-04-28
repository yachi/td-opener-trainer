/**
 * tests/diag-l9-dpc-direct.test.ts — Phase 2.5 Empirical Proof
 *
 * Validates the DPC-direct entry design: `createDpcSession(holdPiece)` starts
 * at guess4 with `dpcHoldPiece` set, bypassing the entire opener→route→PC
 * pipeline. All invariants hold. The reducer accepts selectDpcSolution and
 * pick actions with null guess.
 */

import { describe, test, expect } from 'bun:test';
import {
  sessionReducer,
  createSession,
  createDpcSession,
  assertSessionInvariants,
  InvariantViolation,
  type Session,
  type SessionAction,
  PHASE_META,
  isRevealPhase,
  isGuessPhase,
  getDpcSolutionsForSession,
} from '../src/session';
import { getDpcSolutions } from '../src/openers/bag4-dpc';
import { emptyBoard, replayPcSteps } from '../src/core/engine';
import type { PieceType } from '../src/core/types';

// ── Helper ──

function dispatch(state: Session, action: SessionAction): Session {
  return sessionReducer(state, action);
}

function dispatchSeq(state: Session, actions: SessionAction[]): Session {
  return actions.reduce((s, a) => dispatch(s, a), state);
}

// ── §1: DPC-direct session construction ──

describe('§1 DPC-direct session construction', () => {
  test('createDpcSession starts at guess4 with empty board', () => {
    const s = createDpcSession('O');
    expect(s.phase).toBe('guess4');
    expect(s.board).toEqual(emptyBoard());
    expect(s.guess).toBeNull();
    expect(s.dpcHoldPiece).toBe('O');
    expect(s.dpcSolutionIndex).toBe(-1);
  });

  test('invariants hold for DPC-direct session', () => {
    const s = createDpcSession('O');
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });

  test('getDpcSolutionsForSession reads dpcHoldPiece', () => {
    const s = createDpcSession('O');
    const solutions = getDpcSolutionsForSession(s);
    expect(solutions.length).toBe(4); // 2 normals + 2 self-mirrors
  });

  test('holdPiece with no DPC data returns empty solutions', () => {
    const s = createDpcSession('T');
    expect(getDpcSolutionsForSession(s)).toEqual([]);
  });

  test('preserves playMode and sessionStats from opts', () => {
    const s = createDpcSession('O', {
      playMode: 'manual',
      sessionStats: { total: 10, correct: 5, streak: 3 },
    });
    expect(s.playMode).toBe('manual');
    expect(s.sessionStats).toEqual({ total: 10, correct: 5, streak: 3 });
  });
});

// ── §2: selectDpcSolution from DPC-direct ──

describe('§2 selectDpcSolution from DPC-direct', () => {
  test('transitions to reveal4 with correct cachedSteps', () => {
    const s = createDpcSession('O');
    const next = dispatch(s, { type: 'selectDpcSolution', solutionIndex: 0 });

    expect(next.phase).toBe('reveal4');
    expect(next.dpcSolutionIndex).toBe(0);
    expect(next.cachedSteps.length).toBe(8); // 7 setup + 1 TSD
    expect(next.baseBoard).toEqual(emptyBoard());
    expect(next.guess).toBeNull(); // still null — DPC-direct
  });

  test('invariants hold after selectDpcSolution', () => {
    const s = createDpcSession('O');
    const next = dispatch(s, { type: 'selectDpcSolution', solutionIndex: 0 });
    expect(() => assertSessionInvariants(next)).not.toThrow();
  });

  test('all O-hold solutions are selectable', () => {
    const count = getDpcSolutions('O').length; // 4 (2 normals + 2 mirrors)
    for (let i = 0; i < count; i++) {
      const s = createDpcSession('O');
      const next = dispatch(s, { type: 'selectDpcSolution', solutionIndex: i });
      expect(next.phase).toBe('reveal4');
      expect(next.dpcSolutionIndex).toBe(i);
      expect(next.cachedSteps.length).toBe(8);
      expect(() => assertSessionInvariants(next)).not.toThrow();
    }
  });

  test('out-of-range solutionIndex is rejected', () => {
    const s = createDpcSession('O');
    const count = getDpcSolutions('O').length;
    expect(dispatch(s, { type: 'selectDpcSolution', solutionIndex: -1 })).toBe(s);
    expect(dispatch(s, { type: 'selectDpcSolution', solutionIndex: count })).toBe(s);
    expect(dispatch(s, { type: 'selectDpcSolution', solutionIndex: 99 })).toBe(s);
  });
});

// ── §3: pick intent from DPC-direct ──

describe('§3 pick intent in DPC-direct', () => {
  test('pick in guess4 selects DPC solution', () => {
    const s = createDpcSession('O');
    const next = dispatch(s, { type: 'pick', index: 0 });
    expect(next.phase).toBe('reveal4');
    expect(next.dpcSolutionIndex).toBe(0);
  });

  test('pick in reveal4 (auto) switches DPC solution', () => {
    const s = createDpcSession('O');
    const inReveal4 = dispatch(s, { type: 'pick', index: 0 });
    expect(inReveal4.phase).toBe('reveal4');

    const switched = dispatch(inReveal4, { type: 'pick', index: 2 });
    expect(switched.phase).toBe('reveal4');
    expect(switched.dpcSolutionIndex).toBe(2);
  });

  test('pick out of range is rejected', () => {
    const s = createDpcSession('O');
    expect(dispatch(s, { type: 'pick', index: 6 })).toBe(s);
    expect(dispatch(s, { type: 'pick', index: -1 })).toBe(s);
  });
});

// ── §4: DPC-direct lifecycle ──

describe('§4 DPC-direct lifecycle', () => {
  test('full cycle: guess4 → reveal4 → advancePhase → guess4', () => {
    let s = createDpcSession('O');
    expect(s.phase).toBe('guess4');

    // Select solution
    s = dispatch(s, { type: 'selectDpcSolution', solutionIndex: 0 });
    expect(s.phase).toBe('reveal4');

    // Step through all 8 steps
    for (let i = 0; i < 8; i++) {
      s = dispatch(s, { type: 'stepForward' });
    }
    expect(s.step).toBe(8);

    // Advance phase → reveal5 (bag 5 PC exists for O-hold Kuruma DPC)
    s = dispatch(s, { type: 'advancePhase' });
    expect(s.phase).toBe('reveal5');
    expect(s.cachedSteps.length).toBe(7);
    expect(() => assertSessionInvariants(s)).not.toThrow();

    // Step through all 7 PC steps
    for (let i = 0; i < 7; i++) {
      s = dispatch(s, { type: 'stepForward' });
    }
    expect(s.step).toBe(7);

    // Advance phase → loops back to guess4 (DPC-direct)
    s = dispatch(s, { type: 'advancePhase' });
    expect(s.phase).toBe('guess4');
    expect(s.guess).toBeNull();
    expect(s.dpcHoldPiece).toBe('O');
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });

  test('newSession (R key) loops back to DPC-direct', () => {
    const s = createDpcSession('O');
    const next = dispatch(s, { type: 'newSession' });
    expect(next.phase).toBe('guess4');
    expect(next.guess).toBeNull();
    expect(next.dpcHoldPiece).toBe('O');
    expect(() => assertSessionInvariants(next)).not.toThrow();
  });

  test('primary (SPACE) in guess4 = newSession → loops DPC-direct', () => {
    const s = createDpcSession('O');
    const next = dispatch(s, { type: 'primary' });
    expect(next.phase).toBe('guess4');
    expect(next.guess).toBeNull();
    expect(next.dpcHoldPiece).toBe('O');
  });

  test('playMode and stats persist across DPC restart', () => {
    let s = createDpcSession('O', {
      playMode: 'manual',
      sessionStats: { total: 5, correct: 3, streak: 2 },
    });
    s = dispatch(s, { type: 'newSession' });
    expect(s.playMode).toBe('manual');
    expect(s.sessionStats).toEqual({ total: 5, correct: 3, streak: 2 });
  });
});

// ── §5: existing flow compatibility ──

describe('§5 existing opener→DPC flow unchanged', () => {
  test('normal session starts without dpcHoldPiece', () => {
    const s = createSession(['I', 'S', 'Z', 'L', 'O', 'T', 'J']);
    expect(s.phase).toBe('guess1');
    expect(s.dpcHoldPiece).toBeNull();
    expect(getDpcSolutionsForSession(s)).toEqual([]);
  });

  test('getDpcSolutions is independent of opener/route/PC', () => {
    // DPC only needs holdPiece — no opener context
    // Hard Drop wiki data: O=4(2+2), S=2, Z=2(mirror S), I=6(3+3), J=1, L=1(mirror J), T=0
    expect(getDpcSolutions('O').length).toBe(4);
    expect(getDpcSolutions('S').length).toBe(2);
    expect(getDpcSolutions('Z').length).toBe(2);
    expect(getDpcSolutions('I').length).toBe(6);
    expect(getDpcSolutions('J').length).toBe(1);
    expect(getDpcSolutions('L').length).toBe(1);
    expect(getDpcSolutions('T').length).toBe(0);
  });
});

// ── §6: invariant edge cases ──

describe('§6 invariant edge cases', () => {
  test('invariant 5 rejects null guess at guess2 (not DPC-direct)', () => {
    // Construct a state that would violate invariant 5 without DPC-direct
    const bad = { ...createSession(), phase: 'guess2' as const, guess: null };
    expect(() => assertSessionInvariants(bad)).toThrow(InvariantViolation);
  });

  test('invariant 5 allows null guess at guess4 with dpcHoldPiece', () => {
    const s = createDpcSession('O');
    expect(s.guess).toBeNull();
    expect(s.phase).toBe('guess4');
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });

  test('invariant 3c allows null guess at reveal4 with dpcHoldPiece', () => {
    const s = dispatch(createDpcSession('O'), {
      type: 'selectDpcSolution',
      solutionIndex: 0,
    });
    expect(s.guess).toBeNull();
    expect(s.phase).toBe('reveal4');
    expect(() => assertSessionInvariants(s)).not.toThrow();
  });

  test('invariant 3c rejects reveal4 with neither guess nor dpcHoldPiece', () => {
    // Construct a corrupt state: reveal4 with nothing
    const base = dispatch(createDpcSession('O'), {
      type: 'selectDpcSolution',
      solutionIndex: 0,
    });
    const bad = { ...base, dpcHoldPiece: null };
    expect(() => assertSessionInvariants(bad)).toThrow(InvariantViolation);
  });

  test('all 9 phases have metadata', () => {
    expect(Object.keys(PHASE_META).length).toBe(9);
    expect(PHASE_META.guess4).toEqual({ kind: 'guess', bag: 4 });
    expect(PHASE_META.reveal4).toEqual({ kind: 'reveal', bag: 4 });
    expect(PHASE_META.reveal5).toEqual({ kind: 'reveal', bag: 5 });
  });
});

// ── §7: DPC-direct manual mode ──

describe('§7 DPC-direct manual mode', () => {
  test('manual DPC-direct spawns activePiece on selectDpcSolution', () => {
    const s = createDpcSession('O', { playMode: 'manual' });
    const next = dispatch(s, { type: 'selectDpcSolution', solutionIndex: 0 });
    expect(next.phase).toBe('reveal4');
    expect(next.activePiece).not.toBeNull();
    expect(() => assertSessionInvariants(next)).not.toThrow();
  });

  test('hardDrop works in manual DPC-direct reveal4', () => {
    let s = createDpcSession('O', { playMode: 'manual' });
    s = dispatch(s, { type: 'selectDpcSolution', solutionIndex: 0 });
    expect(s.activePiece).not.toBeNull();

    // hardDrop should accept the piece and advance step
    const afterDrop = dispatch(s, { type: 'hardDrop' });
    // It either advances (step++) or rejects (wrong position)
    // The key test: no invariant violation
    expect(() => assertSessionInvariants(afterDrop)).not.toThrow();
  });
});
