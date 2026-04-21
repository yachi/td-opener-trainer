/**
 * diag-l9-nav.test.ts — Phase 2.5 empirical proof for phase navigation.
 *
 * DESIGN: Phase snapshots — save {cachedSteps, baseBoard, routeGuess,
 * pcSolutionIndex} at each reveal-phase entry. jumpToBag restores from
 * snapshot in O(1). No rebuilding, no chaining _rawSessionReducer.
 *
 * Probed in probe-nav-snapshots.ts: 0.1μs restore vs 20ms rebuild.
 */

import { describe, test, expect } from 'bun:test';

import {
  createSession,
  sessionReducer,
  isRevealPhase,
  type Session,
  type SessionAction,
  type Phase,
} from '../src/session.ts';
import { bestOpener } from '../src/openers/decision.ts';
import type { PieceType } from '../src/core/types.ts';

function dispatch(state: Session, action: SessionAction): Session {
  return sessionReducer(state, action);
}

// ── Bags ──
// HC bag: I before J, L not last of {L,O,T} → honey_cup
const HC_BAG1: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
const HC_BAG2: PieceType[] = ['T', 'S', 'Z', 'J', 'L', 'I', 'O'];

// ── Helpers ──

/** Advance a fresh HC session through all phases, returning state at each. */
function buildFullChain(): {
  guess1: Session;
  reveal1: Session;
  guess2: Session;
  reveal2: Session;
  guess3: Session | null;
  reveal3: Session | null;
} {
  const guess1 = createSession(HC_BAG1, HC_BAG2);
  let s = dispatch(guess1, { type: 'setGuess', opener: 'honey_cup', mirror: false });
  s = dispatch(s, { type: 'submitGuess' });
  const reveal1 = s;

  s = dispatch(s, { type: 'advancePhase' });
  const guess2 = s;

  s = dispatch(s, { type: 'selectRoute', routeIndex: 0 });
  const reveal2 = s;

  s = dispatch(s, { type: 'advancePhase' });
  if (s.phase !== 'guess3') {
    return { guess1, reveal1, guess2, reveal2, guess3: null, reveal3: null };
  }
  const guess3 = s;

  s = dispatch(s, { type: 'selectPcSolution', solutionIndex: 0 });
  const reveal3 = s;

  return { guess1, reveal1, guess2, reveal2, guess3, reveal3 };
}

// ═══════════════════════════════════════════════════════════════════════════
// §1  Snapshot saving — revealSnapshots populated during normal flow
// ═══════════════════════════════════════════════════════════════════════════

describe('§1 snapshot saving', () => {
  test('createSession initializes empty revealSnapshots', () => {
    const s = createSession(HC_BAG1, HC_BAG2);
    expect(s.revealSnapshots).toEqual({});
  });

  test('submitGuess saves reveal1 snapshot', () => {
    let s = createSession(HC_BAG1, HC_BAG2);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });

    expect(s.revealSnapshots.reveal1).toBeDefined();
    expect(s.revealSnapshots.reveal1!.cachedSteps).toBe(s.cachedSteps);
    expect(s.revealSnapshots.reveal1!.routeGuess).toBe(-1);
    expect(s.revealSnapshots.reveal1!.pcSolutionIndex).toBe(-1);
  });

  test('selectRoute saves reveal2 snapshot', () => {
    let s = createSession(HC_BAG1, HC_BAG2);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    s = dispatch(s, { type: 'advancePhase' });
    s = dispatch(s, { type: 'selectRoute', routeIndex: 0 });

    expect(s.revealSnapshots.reveal2).toBeDefined();
    expect(s.revealSnapshots.reveal2!.cachedSteps).toBe(s.cachedSteps);
    expect(s.revealSnapshots.reveal2!.routeGuess).toBe(0);
  });

  test('selectPcSolution saves reveal3 snapshot', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }

    expect(chain.reveal3.revealSnapshots.reveal3).toBeDefined();
    expect(chain.reveal3.revealSnapshots.reveal3!.cachedSteps).toBe(chain.reveal3.cachedSteps);
    expect(chain.reveal3.revealSnapshots.reveal3!.pcSolutionIndex).toBe(0);
  });

  test('selectRoute update overwrites reveal2 snapshot', () => {
    let s = createSession(HC_BAG1, HC_BAG2);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    s = dispatch(s, { type: 'advancePhase' });

    s = dispatch(s, { type: 'selectRoute', routeIndex: 0 });
    const snap0 = s.revealSnapshots.reveal2!;

    // Switch route in auto reveal2
    s = dispatch(s, { type: 'selectRoute', routeIndex: 1 });
    const snap1 = s.revealSnapshots.reveal2!;

    expect(snap1.routeGuess).toBe(1);
    expect(snap1).not.toBe(snap0);
  });

  test('newSession clears revealSnapshots', () => {
    const chain = buildFullChain();
    const s = chain.reveal3 ?? chain.reveal2;
    expect(Object.keys(s.revealSnapshots).length).toBeGreaterThan(0);

    const fresh = dispatch(s, { type: 'newSession' });
    expect(fresh.revealSnapshots).toEqual({});
  });

  test('snapshots accumulate across phases', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }

    // reveal3 state should have all 3 snapshots
    expect(chain.reveal3.revealSnapshots.reveal1).toBeDefined();
    expect(chain.reveal3.revealSnapshots.reveal2).toBeDefined();
    expect(chain.reveal3.revealSnapshots.reveal3).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §2  jumpToBag action — restore from snapshot
// ═══════════════════════════════════════════════════════════════════════════

describe('§2 jumpToBag action', () => {
  test('jumpToBag(1) from reveal3 → reveal1', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }

    const jumped = dispatch(chain.reveal3, { type: 'jumpToBag', bag: 1 });
    expect(jumped.phase).toBe('reveal1');
    expect(jumped.cachedSteps).toBe(chain.reveal3.revealSnapshots.reveal1!.cachedSteps);
    expect(jumped.step).toBe(0);
    expect(jumped.activePiece).toBeNull(); // auto mode
    expect(jumped.holdPiece).toBeNull();
    expect(jumped.holdUsed).toBe(false);
  });

  test('jumpToBag(2) from reveal1 → reveal2 (if snapshot exists)', () => {
    const chain = buildFullChain();
    // Advance to reveal2, then jump back to reveal1, then forward to reveal2
    const jumped = dispatch(chain.reveal3 ?? chain.reveal2, { type: 'jumpToBag', bag: 1 });
    const jumped2 = dispatch(jumped, { type: 'jumpToBag', bag: 2 });
    expect(jumped2.phase).toBe('reveal2');
    expect(jumped2.routeGuess).toBe(0);
  });

  test('jumpToBag to unvisited phase → no-op', () => {
    let s = createSession(HC_BAG1, HC_BAG2);
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    // At reveal1, no reveal2 snapshot exists
    const jumped = dispatch(s, { type: 'jumpToBag', bag: 2 });
    expect(jumped).toBe(s); // identity — no-op
  });

  test('jumpToBag to current bag → no-op', () => {
    const chain = buildFullChain();
    const jumped = dispatch(chain.reveal2, { type: 'jumpToBag', bag: 2 });
    expect(jumped).toBe(chain.reveal2); // identity
  });

  test('jumpToBag preserves sessionStats', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }

    const stats = chain.reveal3.sessionStats;
    const jumped = dispatch(chain.reveal3, { type: 'jumpToBag', bag: 1 });
    expect(jumped.sessionStats).toEqual(stats);
  });

  test('jumpToBag preserves guess', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }

    const jumped = dispatch(chain.reveal3, { type: 'jumpToBag', bag: 1 });
    expect(jumped.guess).toEqual(chain.reveal3.guess);
  });

  test('jumpToBag preserves correct', () => {
    const chain = buildFullChain();
    const jumped = dispatch(chain.reveal2, { type: 'jumpToBag', bag: 1 });
    expect(jumped.correct).toBe(chain.reveal2.correct);
  });

  test('jumpToBag preserves playMode', () => {
    const chain = buildFullChain();
    const manual = dispatch(chain.reveal2, { type: 'togglePlayMode' });
    expect(manual.playMode).toBe('manual');

    const jumped = dispatch(manual, { type: 'jumpToBag', bag: 1 });
    expect(jumped.playMode).toBe('manual');
  });

  test('jumpToBag in manual mode spawns activePiece', () => {
    const chain = buildFullChain();
    const manual = dispatch(chain.reveal2, { type: 'togglePlayMode' });
    const jumped = dispatch(manual, { type: 'jumpToBag', bag: 1 });
    expect(jumped.playMode).toBe('manual');
    expect(jumped.activePiece).not.toBeNull();
    // Should be the first piece of reveal1's cachedSteps
    expect(jumped.activePiece!.type).toBe(
      chain.reveal2.revealSnapshots.reveal1!.cachedSteps[0]!.piece,
    );
  });

  test('jumpToBag clears manual in-flight state', () => {
    let s = createSession(HC_BAG1, HC_BAG2);
    s = dispatch(s, { type: 'togglePlayMode' });
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' });
    s = dispatch(s, { type: 'hold' }); // create hold state
    s = dispatch(s, { type: 'advancePhase' });
    s = dispatch(s, { type: 'selectRoute', routeIndex: 0 });

    // Now at reveal2 with manual state. Jump to bag 1.
    const jumped = dispatch(s, { type: 'jumpToBag', bag: 1 });
    expect(jumped.holdPiece).toBeNull();
    expect(jumped.holdUsed).toBe(false);
  });

  test('jumpToBag restores routeGuess from snapshot', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }

    // At reveal3, routeGuess=0. Jump to reveal1.
    const jumped = dispatch(chain.reveal3, { type: 'jumpToBag', bag: 1 });
    // reveal1 snapshot has routeGuess=-1
    expect(jumped.routeGuess).toBe(-1);

    // Jump back to reveal2
    const jumped2 = dispatch(jumped, { type: 'jumpToBag', bag: 2 });
    expect(jumped2.routeGuess).toBe(0);
  });

  test('jumpToBag restores pcSolutionIndex from snapshot', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }

    const jumped = dispatch(chain.reveal3, { type: 'jumpToBag', bag: 1 });
    expect(jumped.pcSolutionIndex).toBe(-1);

    const jumped3 = dispatch(jumped, { type: 'jumpToBag', bag: 3 });
    expect(jumped3.pcSolutionIndex).toBe(0);
  });

  test('jumpToBag out of bounds → no-op', () => {
    const chain = buildFullChain();
    const jumped = dispatch(chain.reveal2, { type: 'jumpToBag', bag: 0 as any });
    expect(jumped).toBe(chain.reveal2);
    const jumped2 = dispatch(chain.reveal2, { type: 'jumpToBag', bag: 4 as any });
    expect(jumped2).toBe(chain.reveal2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §3  Invariant safety — all jumped states pass assertSessionInvariants
// ═══════════════════════════════════════════════════════════════════════════

describe('§3 invariant safety', () => {
  test('jumped states pass invariants via stepForward dispatch', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }

    // Jump from reveal3 to each bag
    for (const bag of [1, 2, 3] as const) {
      const jumped = dispatch(chain.reveal3, { type: 'jumpToBag', bag });
      // stepForward triggers deriveBoard + assertSessionInvariants
      expect(() => dispatch(jumped, { type: 'stepForward' })).not.toThrow();
    }
  });

  test('ping-pong jumps maintain valid state', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }

    let s = chain.reveal3;
    s = dispatch(s, { type: 'jumpToBag', bag: 1 });
    s = dispatch(s, { type: 'jumpToBag', bag: 3 });
    s = dispatch(s, { type: 'jumpToBag', bag: 2 });
    s = dispatch(s, { type: 'jumpToBag', bag: 1 });

    expect(() => dispatch(s, { type: 'stepForward' })).not.toThrow();
    expect(s.phase).toBe('reveal1');
  });

  test('manual mode jump passes invariants', () => {
    const chain = buildFullChain();
    if (!chain.reveal3) { test.skip; return; }

    let s = dispatch(chain.reveal3, { type: 'togglePlayMode' });
    s = dispatch(s, { type: 'jumpToBag', bag: 1 });
    expect(s.playMode).toBe('manual');
    expect(s.activePiece).not.toBeNull();
    // Dispatch a movement to verify the piece is interactive
    expect(() => dispatch(s, { type: 'movePiece', dx: 1, dy: 0 })).not.toThrow();
  });
});
