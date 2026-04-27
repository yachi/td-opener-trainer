/**
 * diag-l9-intent.test.ts — L9 empirical proof for `primary` and `pick`
 * semantic actions.
 *
 * Bug that triggered this redesign: in manual reveal mode, SPACE always
 * dispatches hardDrop. After the last piece is placed (activePiece === null),
 * SPACE becomes a no-op and the user is stuck — cannot advance to guess2
 * without toggling back to auto mode first.
 *
 * Root cause: `src/input/keyboard.ts` is a partial interpreter of Session
 * state. It decides what SPACE means based on (phase, playMode) but misses
 * context (activePiece === null?). Every new phase variant will require
 * another branch. That's L3 symptom-patching.
 *
 * L9 reframe: add two semantic actions — `primary` (SPACE/ENTER) and
 * `pick(index)` (digits 1-4) — that the REDUCER interprets based on full
 * Session context. Keyboard.ts becomes a dumb key→intent mapper and stops
 * trying to read phase state. Adding a new phase variant only touches
 * the reducer's `primary` case, never keyboard.ts.
 *
 * Per CLAUDE.md L10: write the proof BEFORE src/ changes. The inline
 * reference reducer in this file IS the design spec — Phase 3 copies it
 * into src/session.ts.
 */

import { describe, test, expect } from 'bun:test';

import {
  createSession,
  sessionReducer,
  type Session,
  type SessionAction as ExistingAction,
} from '../src/session.ts';
import { OPENERS } from '../src/openers/decision.ts';
import type { OpenerID } from '../src/openers/types.ts';
import type { PieceType } from '../src/core/types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Extended action union — the target for Phase 3.
// ═══════════════════════════════════════════════════════════════════════════

type IntentAction =
  | ExistingAction
  | { type: 'primary' }
  | { type: 'pick'; index: number };

// The opener order that pick maps to in guess1.
const OPENER_BY_PICK: OpenerID[] = [
  'stray_cannon',
  'honey_cup',
  'gamushiro',
  'ms2',
];

// ═══════════════════════════════════════════════════════════════════════════
// Reference reducer — Phase 3 must match this byte-for-byte.
//
// We WRAP the production reducer for existing actions and add inline
// handlers for the new `primary` and `pick` actions. The wrapping lets us
// reuse the L10-validated semantics of submitGuess, hardDrop, newSession,
// etc., without re-implementing them.
// ═══════════════════════════════════════════════════════════════════════════

function intentReducer(state: Session, action: IntentAction): Session {
  switch (action.type) {
    case 'primary': {
      // SPACE/ENTER — "do the main thing for the current state."
      switch (state.phase) {
        case 'guess1':
          // With a guess set: submit it. Without: skip to a new bag.
          return state.guess !== null
            ? intentReducer(state, { type: 'submitGuess' })
            : intentReducer(state, { type: 'newSession' });

        case 'reveal1':
        case 'reveal2':
        case 'reveal3':
        case 'reveal4':
          // Manual with an active piece: drop it.
          // Manual at end-of-cachedSteps (activePiece === null) OR auto mode:
          // advance to the next phase (THE BUG FIX).
          if (
            state.playMode === 'manual' &&
            state.activePiece !== null
          ) {
            return intentReducer(state, { type: 'hardDrop' });
          }
          return intentReducer(state, { type: 'advancePhase' });

        case 'guess2':
          // Skip route selection → new bag.
          return intentReducer(state, { type: 'newSession' });

        case 'guess3':
          // Skip PC selection → select first.
          return intentReducer(state, { type: 'selectPcSolution', solutionIndex: 0 });

        case 'guess4':
          // Skip DPC → new session.
          return intentReducer(state, { type: 'newSession' });

        default: {
          const _exhaustive: never = state.phase;
          return _exhaustive;
        }
      }
    }

    case 'pick': {
      // Digit keys — context-dependent based on phase.
      switch (state.phase) {
        case 'guess1': {
          const opener = OPENER_BY_PICK[action.index];
          if (!opener) return state;
          const mirror = state.guess?.mirror ?? false;
          return intentReducer(state, {
            type: 'setGuess',
            opener,
            mirror,
          });
        }
        case 'guess2':
          return intentReducer(state, {
            type: 'selectRoute',
            routeIndex: action.index,
          });
        case 'guess3':
          return intentReducer(state, {
            type: 'selectPcSolution',
            solutionIndex: action.index,
          });
        case 'guess4':
          return intentReducer(state, {
            type: 'selectDpcSolution',
            solutionIndex: action.index,
          });
        // pick is a no-op in reveal phases (manual) or delegates in auto.
        case 'reveal1':
        case 'reveal2':
        case 'reveal3':
        case 'reveal4':
          return state;
        default: {
          const _exhaustive: never = state.phase;
          return _exhaustive;
        }
      }
    }

    default:
      // Existing actions — delegate to production reducer.
      return sessionReducer(state, action);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test helpers
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

function apply(state: Session, ...actions: IntentAction[]): Session {
  return actions.reduce((s, a) => intentReducer(s, a), state);
}

// ═══════════════════════════════════════════════════════════════════════════
// #1 primary in guess1 — submit or skip depending on guess
// ═══════════════════════════════════════════════════════════════════════════
describe('#1 primary in guess1', () => {
  test('with a guess set → submits (advances to reveal1)', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s1 = apply(
      s0,
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'primary' },
    );
    expect(s1.phase).toBe('reveal1');
    expect(s1.correct).toBe(true);
  });

  test('without a guess set → skips to a new bag', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    expect(s0.guess).toBeNull();
    const s1 = apply(s0, { type: 'primary' });
    // newSession preserves playMode + sessionStats but resets everything
    // else including the bags (they get regenerated).
    expect(s1.phase).toBe('guess1');
    expect(s1.guess).toBeNull();
    expect(s1.sessionStats).toEqual(s0.sessionStats);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #2 primary in reveal (auto) — always advances phase
// ═══════════════════════════════════════════════════════════════════════════
describe('#2 primary in reveal auto mode', () => {
  test('reveal1 auto → advances to guess2', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s1 = apply(
      s0,
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'primary' },
    );
    expect(s1.phase).toBe('guess2');
  });

  test('reveal2 auto → advances to a new session (guess1 with fresh bag)', () => {
    // Use Stray Cannon route 1 which has no PC solutions, so
    // primary from reveal2 skips guess3 and goes to new guess1.
    const s0 = createSession(bagFor('stray_cannon'), bagFor('stray_cannon'));
    const s1 = apply(
      s0,
      { type: 'setGuess', opener: 'stray_cannon', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' }, // reveal1 → guess2
      { type: 'selectRoute', routeIndex: 1 }, // guess2 → reveal2 (SC route 1, no PC)
      { type: 'primary' }, // reveal2 → newSession
    );
    expect(s1.phase).toBe('guess1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #3 primary in reveal MANUAL — this is the bug fix
// ═══════════════════════════════════════════════════════════════════════════
describe('#3 primary in reveal manual mode (THE BUG FIX)', () => {
  test('with activePiece present → dispatches hardDrop', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s1 = apply(
      s0,
      { type: 'togglePlayMode' }, // auto → manual
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' }, // → reveal1 with activePiece spawned
    );
    expect(s1.phase).toBe('reveal1');
    expect(s1.playMode).toBe('manual');
    expect(s1.activePiece).not.toBeNull();

    const before = s1.step;
    const s2 = intentReducer(s1, { type: 'primary' });
    // Since the activePiece is at spawn position (not at target), hardDrop
    // will be REJECTED by the reducer — state unchanged. That's fine; the
    // important thing is that primary routed to hardDrop, NOT advancePhase.
    // We prove this by showing phase is still reveal1 (not guess2).
    expect(s2.phase).toBe('reveal1');
    expect(s2.step).toBe(before);
  });

  test('with activePiece null (all pieces placed) → advances to guess2', () => {
    // Set up reveal1 manual, then simulate reaching the end.
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    let s = apply(
      s0,
      { type: 'togglePlayMode' },
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    // Force activePiece to null and step to the end — simulates "user
    // manually placed every piece successfully."
    s = {
      ...s,
      activePiece: null,
      step: s.cachedSteps.length,
    };
    expect(s.phase).toBe('reveal1');
    expect(s.playMode).toBe('manual');
    expect(s.activePiece).toBeNull();

    // The bug: before this fix, primary → hardDrop which is a no-op.
    // After the fix: primary → advancePhase.
    const s2 = intentReducer(s, { type: 'primary' });
    expect(s2.phase).toBe('guess2');
  });

  test('reveal2 manual with activePiece null → new session', () => {
    // Use Stray Cannon route 1 which has no PC solutions, so
    // primary from reveal2 skips guess3 and goes to new guess1.
    const s0 = createSession(bagFor('stray_cannon'), bagFor('stray_cannon'));
    let s = apply(
      s0,
      { type: 'togglePlayMode' },
      { type: 'setGuess', opener: 'stray_cannon', mirror: false },
      { type: 'submitGuess' },
      { type: 'togglePlayMode' }, // back to auto so we can advance
      { type: 'advancePhase' },
      { type: 'selectRoute', routeIndex: 1 }, // SC route 1, no PC
      { type: 'togglePlayMode' }, // auto → manual in reveal2
    );
    expect(s.phase).toBe('reveal2');
    expect(s.playMode).toBe('manual');
    // Force end state.
    s = { ...s, activePiece: null, step: s.cachedSteps.length };
    const s2 = intentReducer(s, { type: 'primary' });
    // reveal2 advance = new session (no PC for SC route 1).
    expect(s2.phase).toBe('guess1');
  });

  test('reveal2 manual with activePiece → dispatches hardDrop (no phase change)', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s = apply(
      s0,
      { type: 'togglePlayMode' },
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'togglePlayMode' }, // back to auto
      { type: 'advancePhase' },
      { type: 'selectRoute', routeIndex: 0 },
      { type: 'togglePlayMode' }, // auto → manual
    );
    expect(s.activePiece).not.toBeNull();
    const s2 = intentReducer(s, { type: 'primary' });
    // Reject (spawn position, not target) → phase unchanged.
    expect(s2.phase).toBe('reveal2');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #4 primary in guess2 — skip to new session
// ═══════════════════════════════════════════════════════════════════════════
describe('#4 primary in guess2', () => {
  test('skips to a new session (fresh guess1)', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s1 = apply(
      s0,
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' }, // reveal1 → guess2
      { type: 'primary' },
    );
    expect(s1.phase).toBe('guess1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #5 pick in guess1 — maps digit to opener, preserves mirror
// ═══════════════════════════════════════════════════════════════════════════
describe('#5 pick in guess1', () => {
  test('pick(0) → setGuess stray_cannon', () => {
    const s0 = createSession(bagFor('stray_cannon'), bagFor('stray_cannon'));
    const s1 = intentReducer(s0, { type: 'pick', index: 0 });
    expect(s1.guess).toEqual({ opener: 'stray_cannon', mirror: false });
  });

  test('pick(1) → setGuess honey_cup', () => {
    const s0 = createSession(bagFor('honey_cup'), bagFor('honey_cup'));
    const s1 = intentReducer(s0, { type: 'pick', index: 1 });
    expect(s1.guess).toEqual({ opener: 'honey_cup', mirror: false });
  });

  test('pick(2) → setGuess gamushiro', () => {
    const s0 = createSession(bagFor('gamushiro'), bagFor('gamushiro'));
    const s1 = intentReducer(s0, { type: 'pick', index: 2 });
    expect(s1.guess).toEqual({ opener: 'gamushiro', mirror: false });
  });

  test('pick(3) → setGuess ms2', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s1 = intentReducer(s0, { type: 'pick', index: 3 });
    expect(s1.guess).toEqual({ opener: 'ms2', mirror: false });
  });

  test('pick preserves existing mirror state', () => {
    const s0 = createSession(bagFor('honey_cup'), bagFor('honey_cup'));
    const s1 = apply(
      s0,
      { type: 'setGuess', opener: 'honey_cup', mirror: true },
      { type: 'pick', index: 0 },
    );
    expect(s1.guess).toEqual({ opener: 'stray_cannon', mirror: true });
  });

  test('pick with out-of-range index → no-op', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s1 = intentReducer(s0, { type: 'pick', index: 4 });
    expect(s1).toBe(s0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #6 pick in guess2 — maps digit to route index
// ═══════════════════════════════════════════════════════════════════════════
describe('#6 pick in guess2', () => {
  test('pick(0) → selectRoute 0, advances to reveal2', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s1 = apply(
      s0,
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'pick', index: 0 },
    );
    expect(s1.phase).toBe('reveal2');
    expect(s1.routeGuess).toBe(0);
  });

  test('pick(1) → selectRoute 1', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s1 = apply(
      s0,
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'pick', index: 1 },
    );
    expect(s1.phase).toBe('reveal2');
    expect(s1.routeGuess).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #7 pick in reveal phases: browse (auto) vs no-op (manual)
// ═══════════════════════════════════════════════════════════════════════════
describe('#7 pick in reveal phases: browse (auto) vs no-op (manual)', () => {
  test('pick in auto reveal1 browses opener (state changes)', () => {
    // Setup: reach reveal1 auto with ms2
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s = apply(s0,
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
    );
    expect(s.phase).toBe('reveal1');
    expect(s.playMode).toBe('auto');
    // pick(0) should browse to stray_cannon
    const s2 = sessionReducer(s, { type: 'pick', index: 0 });
    expect(s2).not.toBe(s);
    expect(s2.guess!.opener).toBe('stray_cannon');
    expect(s2.phase).toBe('reveal1');
    expect(s2.step).toBe(0);
  });

  test('pick in manual reveal1 is a no-op (safe zone)', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s = apply(s0,
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'togglePlayMode' }, // switch to manual
    );
    expect(s.phase).toBe('reveal1');
    expect(s.playMode).toBe('manual');
    const s2 = sessionReducer(s, { type: 'pick', index: 0 });
    expect(s2).toBe(s); // identity — unchanged
  });

  test('pick in auto reveal2 switches route (state changes)', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s = apply(s0,
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'selectRoute', routeIndex: 0 },
    );
    expect(s.phase).toBe('reveal2');
    expect(s.playMode).toBe('auto');
    expect(s.routeGuess).toBe(0);
    // pick(1) should switch to route 1
    const s2 = sessionReducer(s, { type: 'pick', index: 1 });
    expect(s2).not.toBe(s);
    expect(s2.routeGuess).toBe(1);
    expect(s2.step).toBe(0);
  });

  test('pick in manual reveal2 is a no-op (safe zone)', () => {
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    const s = apply(s0,
      { type: 'setGuess', opener: 'ms2', mirror: false },
      { type: 'submitGuess' },
      { type: 'advancePhase' },
      { type: 'selectRoute', routeIndex: 0 },
      { type: 'togglePlayMode' }, // manual
    );
    expect(s.phase).toBe('reveal2');
    expect(s.playMode).toBe('manual');
    const s2 = sessionReducer(s, { type: 'pick', index: 1 });
    expect(s2).toBe(s);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #8 End-to-end smoke: intent-only gameplay works
// ═══════════════════════════════════════════════════════════════════════════
describe('#8 smoke: intent-only play reaches every phase', () => {
  test('full cycle using only primary + pick advances through every phase', () => {
    // Use production sessionReducer (not the local intentReducer proof-of-
    // concept which only knows 4 phases). The production reducer handles
    // primary/pick natively since commit 2cf1565.
    const s0 = createSession(bagFor('ms2'), bagFor('ms2'));
    // guess1: pick MS2 and submit
    const s1 = apply(s0, { type: 'pick', index: 3 }, { type: 'primary' });
    expect(s1.phase).toBe('reveal1');
    expect(s1.correct).toBe(true);
    // reveal1: primary → guess2
    const s2 = sessionReducer(s1, { type: 'primary' });
    expect(s2.phase).toBe('guess2');
    // guess2: pick route 0
    const s3 = sessionReducer(s2, { type: 'pick', index: 0 });
    expect(s3.phase).toBe('reveal2');
    // reveal2: primary → guess3 (MS2 route 0 has PC solutions)
    const s4 = sessionReducer(s3, { type: 'primary' });
    expect(s4.phase).toBe('guess3');
    // guess3: primary → reveal3 (auto-selects first PC solution)
    const s5 = sessionReducer(s4, { type: 'primary' });
    expect(s5.phase).toBe('reveal3');
    // reveal3: primary → guess4 (DPC) if hold piece has DPC data, else guess1
    // MS2 holds L, and L-hold has DPC data (mirror of J), so we get guess4
    const s6 = sessionReducer(s5, { type: 'primary' });
    expect(s6.phase).toBe('guess4');
    // guess4: primary → new session (guess1)
    const s7 = sessionReducer(s6, { type: 'primary' });
    expect(s7.phase).toBe('guess1');
  });
});
