/**
 * tests/diag-l9-pc-routes.test.ts — Phase 2.5 empirical proof for route-specific PC.
 *
 * Proves that all routes × normal/mirror for all 4 openers have correctly
 * computed PC solutions that replay without error and achieve Perfect Clear.
 *
 * This test imports the route-keyed PC data and validates each solution against
 * the actual post-TST board for its specific route.
 */

import { describe, test, expect } from 'bun:test';
import {
  cloneBoard,
  replayPcSteps,
  findAllPlacements,
  lockAndClear,
  isPlacementReachable,
  clearFullRows,
} from '../src/core/engine.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import { getBag2Sequence } from '../src/openers/sequences.ts';
import { getPcSolutions } from '../src/openers/bag3-pc.ts';
import type { PieceType } from '../src/core/types.ts';
import type { Board } from '../src/core/srs.ts';
import type { OpenerID } from '../src/openers/types.ts';

// ── Helpers ──

const ALL_PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];

function getPostTstBoard(opener: OpenerID, mirror: boolean, routeIndex: number): Board | null {
  const seq = getBag2Sequence(opener, mirror, routeIndex);
  if (!seq || seq.fullSteps.length === 0) return null;
  const bag2FinalBoard = seq.fullSteps[seq.fullSteps.length - 1]!.board;
  const tPlacements = findAllPlacements(bag2FinalBoard, 'T');
  for (const tp of tPlacements) {
    const result = lockAndClear(bag2FinalBoard, tp.piece);
    if (result.linesCleared === 3) return result.board;
  }
  return null;
}

function countCells(board: Board): number {
  let count = 0;
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 10; c++) {
      if (board[r]![c] !== null) count++;
    }
  }
  return count;
}

// Expected solution counts per (opener, routeIndex) — normal only, mirror auto-derived.
const EXPECTED_SOLUTIONS: Record<OpenerID, Record<number, number>> = {
  honey_cup: { 0: 4, 1: 4, 2: 4, 3: 1, 4: 2, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1 },
  gamushiro: { 0: 2, 1: 2, 2: 2, 3: 1, 4: 0 },
  ms2: { 0: 2, 1: 2, 2: 3, 3: 1, 4: 3 },
  stray_cannon: { 0: 2, 1: 0, 2: 0, 3: 1, 4: 0 },
};

const ALL_OPENERS: OpenerID[] = ['honey_cup', 'gamushiro', 'ms2', 'stray_cannon'];

// ═══════════════════════════════════════════════════════════════════════════
// §1: Every opener route has the expected number of PC solutions
// ═══════════════════════════════════════════════════════════════════════════

describe('§1 solution counts match expected', () => {
  for (const opener of ALL_OPENERS) {
    const expected = EXPECTED_SOLUTIONS[opener];

    for (const [ri, count] of Object.entries(expected)) {
      test(`${opener} route ${ri} normal: ${count} solutions`, () => {
        const solutions = getPcSolutions(opener, false, Number(ri));
        expect(solutions.length).toBe(count);
      });

      test(`${opener} route ${ri} mirror: ${count} solutions`, () => {
        const solutions = getPcSolutions(opener, true, Number(ri));
        expect(solutions.length).toBe(count);
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// §2: Every PC solution achieves Perfect Clear via replayPcSteps
// ═══════════════════════════════════════════════════════════════════════════

describe('§2 every PC solution achieves Perfect Clear', () => {
  for (const opener of ALL_OPENERS) {
    const routes = getBag2Routes(opener, false);

    for (const mirror of [false, true]) {
      const label = mirror ? 'mirror' : 'normal';

      for (let ri = 0; ri < routes.length; ri++) {
        const solutions = getPcSolutions(opener, mirror, ri);
        if (solutions.length === 0) continue;

        for (let si = 0; si < solutions.length; si++) {
          const sol = solutions[si]!;

          test(`${opener} route ${ri} ${label} sol ${si} (hold=${sol.holdPiece}): achieves PC`, () => {
            const board = getPostTstBoard(opener, mirror, ri);
            expect(board).not.toBeNull();
            const steps = replayPcSteps(board!, sol.placements);
            expect(steps.length).toBe(sol.placements.length);
            const finalBoard = steps[steps.length - 1]!.board;
            expect(countCells(finalBoard)).toBe(0);
          });
        }
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// §3: Every PC placement is BFS-reachable
// ═══════════════════════════════════════════════════════════════════════════

describe('§3 every PC placement is BFS-reachable', () => {
  for (const opener of ALL_OPENERS) {
    const routes = getBag2Routes(opener, false);

    for (const mirror of [false, true]) {
      const label = mirror ? 'mirror' : 'normal';

      for (let ri = 0; ri < routes.length; ri++) {
        const solutions = getPcSolutions(opener, mirror, ri);
        if (solutions.length === 0) continue;

        for (let si = 0; si < solutions.length; si++) {
          const sol = solutions[si]!;

          test(`${opener} route ${ri} ${label} sol ${si}: all 6 placements BFS-reachable`, () => {
            let board = cloneBoard(getPostTstBoard(opener, mirror, ri)!);
            for (const p of sol.placements) {
              expect(isPlacementReachable(board, p.piece, p.cells)).toBe(true);
              for (const c of p.cells) {
                (board[c.row] as (PieceType | null)[])[c.col] = p.piece;
              }
              const { board: cleared } = clearFullRows(board);
              board = cleared;
            }
          });
        }
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// §4: Structural invariants on PC solution data
// ═══════════════════════════════════════════════════════════════════════════

describe('§4 PC solution structural invariants', () => {
  for (const opener of ALL_OPENERS) {
    const expected = EXPECTED_SOLUTIONS[opener];

    for (const [ri, count] of Object.entries(expected)) {
      if (count === 0) continue;
      const solutions = getPcSolutions(opener, false, Number(ri));

      for (let si = 0; si < solutions.length; si++) {
        const sol = solutions[si]!;

        test(`${opener} route ${ri} sol ${si}: placements cover all 7 piece types`, () => {
          // Standard: 6 placements, 6 unique types, hold is 7th
          // MS2 Bonus (7-piece): 7 placements with duplicate I, hold type also placed
          const n = sol.placements.length;
          expect(n === 6 || n === 7).toBe(true);
          const types = new Set(sol.placements.map(p => p.piece));
          if (n === 6) {
            expect(types.size).toBe(6);
            expect(types.has(sol.holdPiece)).toBe(false);
          } else {
            // 7-piece: all 7 types placed, hold piece type appears in placed set
            expect(types.size).toBe(n - 1); // one duplicate
          }
          const allTypes = new Set([...types, sol.holdPiece]);
          expect([...allTypes].sort()).toEqual([...ALL_PIECES].sort());
        });

        test(`${opener} route ${ri} sol ${si}: each placement has 4 cells`, () => {
          for (const p of sol.placements) {
            expect(p.cells.length).toBe(4);
          }
        });
      }
    }
  }

  // Shared-solution reference equality
  test('HC routes 0, 1, 2 share the same solutions (reference equality)', () => {
    const s0 = getPcSolutions('honey_cup', false, 0);
    const s1 = getPcSolutions('honey_cup', false, 1);
    const s2 = getPcSolutions('honey_cup', false, 2);
    expect(s0).toBe(s1);
    expect(s1).toBe(s2);
  });

  test('GM routes 0, 1 share the same solutions (reference equality)', () => {
    const s0 = getPcSolutions('gamushiro', false, 0);
    const s1 = getPcSolutions('gamushiro', false, 1);
    expect(s0).toBe(s1);
  });

  // Routes without PC return empty
  test('routes without PC solutions return empty arrays', () => {
    expect(getPcSolutions('stray_cannon', false, 1)).toEqual([]);
    expect(getPcSolutions('stray_cannon', false, 2)).toEqual([]);
    expect(getPcSolutions('stray_cannon', false, 4)).toEqual([]);
    expect(getPcSolutions('gamushiro', false, 4)).toEqual([]);
  });

  // Out-of-range route returns empty
  test('out-of-range routeIndex returns empty', () => {
    expect(getPcSolutions('honey_cup', false, 99)).toEqual([]);
    expect(getPcSolutions('ms2', false, 99)).toEqual([]);
  });
});
