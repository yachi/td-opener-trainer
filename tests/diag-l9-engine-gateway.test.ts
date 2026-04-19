/**
 * diag-l9-engine-gateway.test.ts — Phase 2.5 empirical proof for Engine Gateway design.
 *
 * L9 DESIGN: session.ts must NEVER directly mutate board cells or call raw
 * placement functions (stampCells, lockAndClear). All boards come from:
 *   1. emptyBoard() — factory
 *   2. cloneBoard() — copy
 *   3. Step.board — from engine-validated buildSteps/replayPcSteps/findTstStep
 *
 * This file proves:
 *   A. Architecture boundary: session.ts doesn't import raw placement functions
 *   B. PC manual hardDrop: intermediate line clears produce correct boards
 *   C. Auto-advance doesn't skip user-placed PC steps
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import {
  emptyBoard,
  buildSteps,
  cloneBoard,
  findAllPlacements,
  replayPcSteps,
  type Board,
  type Step,
} from '../src/core/engine.ts';
import {
  spawnPiece,
  hardDrop as coreHardDrop,
  getPieceCells,
  type ActivePiece,
} from '../src/core/srs.ts';
import type { PieceType } from '../src/core/types.ts';
import { BOARD_WIDTH, BOARD_VISIBLE_HEIGHT } from '../src/core/types.ts';
import type { OpenerID } from '../src/openers/types.ts';
import { OPENERS } from '../src/openers/decision.ts';
import { getPcSolutions } from '../src/openers/bag3-pc.ts';
import { getBag2Sequence } from '../src/openers/sequences.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import {
  OPENER_PLACEMENT_DATA,
  mirrorPlacementData,
} from '../src/openers/placements.ts';
import {
  createSession,
  sessionReducer,
  type Session,
  type SessionAction,
} from '../src/session.ts';

// ── Helpers ──

function dispatch(s: Session, a: SessionAction): Session {
  return sessionReducer(s, a);
}

function countCells(board: Board): number {
  let n = 0;
  for (let r = 0; r < BOARD_VISIBLE_HEIGHT; r++)
    for (let c = 0; c < BOARD_WIDTH; c++)
      if (board[r]![c] !== null) n++;
  return n;
}

function boardHash(b: Board): string {
  return b.map(r => r.map(c => (c === null ? '.' : c)).join('')).join('|');
}

function bagForTargetOpener(target: OpenerID, mirror: boolean): PieceType[] {
  const base: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const out: PieceType[][] = [];
  function permute(arr: PieceType[], start: number): void {
    if (start === arr.length) { out.push([...arr]); return; }
    for (let i = start; i < arr.length; i++) {
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
      permute(arr, start + 1);
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
    }
  }
  permute([...base], 0);
  const def = OPENERS[target];
  for (const p of out) {
    if (mirror ? def.canBuildMirror(p) : def.canBuild(p)) return p;
  }
  throw new Error(`no bag for ${target} mirror=${mirror}`);
}

/**
 * Find a BFS-reachable ActivePiece for a given step's target cells.
 */
function findActivePieceForStep(board: Board, step: Step): ActivePiece {
  const placements = findAllPlacements(board, step.piece);
  const targetSet = new Set(step.newCells.map(c => `${c.col},${c.row}`));
  for (const p of placements) {
    const cellSet = new Set(p.cells.map(c => `${c.col},${c.row}`));
    if (cellSet.size === targetSet.size && [...targetSet].every(k => cellSet.has(k))) {
      return p.piece;
    }
  }
  throw new Error(`No placement of ${step.piece} reaches target cells ${JSON.stringify(step.newCells)}`);
}

/** Navigate to reveal3 manual mode for honey_cup, solution 0. */
function toReveal3Manual(): Session {
  const bag = bagForTargetOpener('honey_cup', false);
  let s = createSession(bag, bag);
  s = dispatch(s, { type: 'togglePlayMode' });
  s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
  s = dispatch(s, { type: 'submitGuess' }); // → reveal1

  // Complete reveal1 manually (hardDrop every step)
  while (s.step < s.cachedSteps.length) {
    const step = s.cachedSteps[s.step]!;
    const ap = findActivePieceForStep(s.board, step);
    s = { ...s, activePiece: ap };
    s = dispatch(s, { type: 'hardDrop' });
  }

  s = dispatch(s, { type: 'advancePhase' }); // → guess2
  expect(s.phase).toBe('guess2');

  s = dispatch(s, { type: 'selectRoute', routeIndex: 0 }); // → reveal2
  expect(s.phase).toBe('reveal2');
  expect(s.playMode).toBe('manual');

  // Complete reveal2 manually (hardDrop every step — includes auto-advance past TST)
  while (s.step < s.cachedSteps.length) {
    if (s.activePiece === null) break; // past last user-placed step
    const step = s.cachedSteps[s.step]!;
    const ap = findActivePieceForStep(s.board, step);
    s = { ...s, activePiece: ap };
    s = dispatch(s, { type: 'hardDrop' });
  }

  s = dispatch(s, { type: 'advancePhase' }); // → guess3
  expect(s.phase).toBe('guess3');

  s = dispatch(s, { type: 'selectPcSolution', solutionIndex: 0 }); // → reveal3
  expect(s.phase).toBe('reveal3');
  expect(s.playMode).toBe('manual');

  return s;
}

// ═══════════════════════════════════════════════════════════════════════════
// A. Architecture boundary — session.ts doesn't import raw placement functions
// ═══════════════════════════════════════════════════════════════════════════

describe('Architecture: session.ts import boundaries', () => {
  const sessionSrc = readFileSync('src/session.ts', 'utf-8');

  test('does not import stampCells (raw placement)', () => {
    expect(sessionSrc).not.toMatch(/\bstampCells\b/);
  });

  test('does not import lockAndClear (raw lock+clear)', () => {
    expect(sessionSrc).not.toMatch(/\blockAndClear\b/);
  });

  test('does not import lockPiece (raw lock)', () => {
    expect(sessionSrc).not.toMatch(/\blockPiece\b/);
  });

  test('does not contain direct board cell mutations', () => {
    // All board[row][col] = ... must be in engine.ts, not session.ts
    const lines = sessionSrc.split('\n');
    const mutations = lines.filter(l =>
      /as \(PieceType/.test(l) || /board\[.*\]\[.*\]\s*=/.test(l),
    );
    expect(mutations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. PC manual hardDrop: board reflects line clears after each step
// ═══════════════════════════════════════════════════════════════════════════

describe('PC manual hardDrop with intermediate line clears', () => {
  test('HC sol 0: every hardDrop produces the correct post-clear board', () => {
    let s = toReveal3Manual();
    const totalSteps = s.cachedSteps.length;
    expect(totalSteps).toBe(6); // HC PC has 6 placements

    // Play through ALL 6 PC steps manually
    for (let i = 0; i < totalSteps; i++) {
      const step = s.cachedSteps[s.step]!;
      expect(s.step).toBe(i);

      // Find and set the active piece for this step
      const ap = findActivePieceForStep(s.board, step);
      s = { ...s, activePiece: ap };
      s = dispatch(s, { type: 'hardDrop' });

      // After hardDrop, the board MUST match cachedSteps[i].board
      // (which includes any line clears from replayPcSteps)
      expect(boardHash(s.board)).toBe(boardHash(step.board));
    }

    // After all 6 steps: board should be empty (Perfect Clear)
    expect(countCells(s.board)).toBe(0);
  });

  test('hardDrop at line-clearing step does NOT auto-advance past next step', () => {
    let s = toReveal3Manual();

    // Find the first step with linesCleared (step 3 for HC sol 0)
    let clearStepIdx = -1;
    for (let i = 0; i < s.cachedSteps.length; i++) {
      if (s.cachedSteps[i]!.linesCleared && s.cachedSteps[i]!.linesCleared! > 0) {
        clearStepIdx = i;
        break;
      }
    }
    expect(clearStepIdx).toBeGreaterThanOrEqual(0);

    // Play up to the clear step
    for (let i = 0; i < clearStepIdx; i++) {
      const step = s.cachedSteps[s.step]!;
      const ap = findActivePieceForStep(s.board, step);
      s = { ...s, activePiece: ap };
      s = dispatch(s, { type: 'hardDrop' });
    }

    expect(s.step).toBe(clearStepIdx);
    const step = s.cachedSteps[s.step]!;
    expect(step.linesCleared).toBeGreaterThan(0);

    // hardDrop the line-clearing step
    const ap = findActivePieceForStep(s.board, step);
    s = { ...s, activePiece: ap };
    s = dispatch(s, { type: 'hardDrop' });

    // MUST advance by exactly 1 (not 2 — no auto-advance in PC)
    expect(s.step).toBe(clearStepIdx + 1);
    // activePiece must be spawned for the next step (not null/skipped)
    expect(s.activePiece).not.toBeNull();
    expect(s.activePiece!.type).toBe(s.cachedSteps[clearStepIdx + 1]!.piece);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. Reveal2 TST auto-advance still works (regression guard)
// ═══════════════════════════════════════════════════════════════════════════

describe('Reveal2 TST auto-advance', () => {
  test('hardDrop of last bag2 piece auto-advances past TST step (step +2)', () => {
    const bag = bagForTargetOpener('honey_cup', false);
    let s = createSession(bag, bag);
    s = dispatch(s, { type: 'togglePlayMode' });
    s = dispatch(s, { type: 'setGuess', opener: 'honey_cup', mirror: false });
    s = dispatch(s, { type: 'submitGuess' }); // → reveal1

    // Complete reveal1
    while (s.step < s.cachedSteps.length) {
      const step = s.cachedSteps[s.step]!;
      s = { ...s, activePiece: findActivePieceForStep(s.board, step) };
      s = dispatch(s, { type: 'hardDrop' });
    }
    s = dispatch(s, { type: 'advancePhase' }); // → guess2
    s = dispatch(s, { type: 'selectRoute', routeIndex: 0 }); // → reveal2
    expect(s.phase).toBe('reveal2');
    expect(s.playMode).toBe('manual');

    // The last cachedStep should be the TST (linesCleared: 3)
    const tstStepIdx = s.cachedSteps.length - 1;
    const tstStep = s.cachedSteps[tstStepIdx]!;
    expect(tstStep.linesCleared).toBe(3);
    expect(tstStep.hint).toBe('T-Spin Triple!');

    // Play through all bag2 steps before TST
    const lastUserStep = tstStepIdx - 1;
    while (s.step <= lastUserStep) {
      const step = s.cachedSteps[s.step]!;
      s = { ...s, activePiece: findActivePieceForStep(s.board, step) };
      s = dispatch(s, { type: 'hardDrop' });
    }

    // After hardDrop of last user piece: auto-advance past TST
    // step should be at cachedSteps.length (past everything)
    expect(s.step).toBe(s.cachedSteps.length);
    // Board should be the TST board (post line-clear)
    expect(boardHash(s.board)).toBe(boardHash(tstStep.board));
    // No more pieces to place
    expect(s.activePiece).toBeNull();
  });
});
