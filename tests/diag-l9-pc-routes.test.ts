/**
 * tests/diag-l9-pc-routes.test.ts — Phase 2.5 empirical proof for route-specific PC.
 *
 * Proves that all 8 HC routes × normal/mirror have at least one BFS-reachable
 * PC solution that replays without error and achieves Perfect Clear.
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

// ── Helpers ──

const ALL_PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];

function getPostTstBoard(mirror: boolean, routeIndex: number): Board | null {
  const seq = getBag2Sequence('honey_cup', mirror, routeIndex);
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

// ═══════════════════════════════════════════════════════════════════════════
// §1: Every HC route has at least one PC solution
// ═══════════════════════════════════════════════════════════════════════════

describe('§1 every HC route has PC solutions', () => {
  const routes = getBag2Routes('honey_cup', false);

  for (let ri = 0; ri < routes.length; ri++) {
    test(`route ${ri} (${routes[ri]!.routeId}) normal: has ≥1 PC solution`, () => {
      const solutions = getPcSolutions('honey_cup', false, ri);
      expect(solutions.length).toBeGreaterThanOrEqual(1);
    });

    test(`route ${ri} (${routes[ri]!.routeId}) mirror: has ≥1 PC solution`, () => {
      const solutions = getPcSolutions('honey_cup', true, ri);
      expect(solutions.length).toBeGreaterThanOrEqual(1);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// §2: Every PC solution achieves Perfect Clear via replayPcSteps
// ═══════════════════════════════════════════════════════════════════════════

describe('§2 every PC solution achieves Perfect Clear', () => {
  const routes = getBag2Routes('honey_cup', false);

  for (const mirror of [false, true]) {
    const label = mirror ? 'mirror' : 'normal';

    for (let ri = 0; ri < routes.length; ri++) {
      const solutions = getPcSolutions('honey_cup', mirror, ri);

      for (let si = 0; si < solutions.length; si++) {
        const sol = solutions[si]!;

        test(`route ${ri} ${label} sol ${si} (hold=${sol.holdPiece}): achieves PC`, () => {
          const board = getPostTstBoard(mirror, ri);
          expect(board).not.toBeNull();
          const steps = replayPcSteps(board!, sol.placements);
          expect(steps.length).toBe(6);
          const finalBoard = steps[steps.length - 1]!.board;
          expect(countCells(finalBoard)).toBe(0);
        });
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// §3: Every PC placement is BFS-reachable
// ═══════════════════════════════════════════════════════════════════════════

describe('§3 every PC placement is BFS-reachable', () => {
  const routes = getBag2Routes('honey_cup', false);

  for (const mirror of [false, true]) {
    const label = mirror ? 'mirror' : 'normal';

    for (let ri = 0; ri < routes.length; ri++) {
      const solutions = getPcSolutions('honey_cup', mirror, ri);

      for (let si = 0; si < solutions.length; si++) {
        const sol = solutions[si]!;

        test(`route ${ri} ${label} sol ${si}: all 6 placements BFS-reachable`, () => {
          let board = cloneBoard(getPostTstBoard(mirror, ri)!);
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
});

// ═══════════════════════════════════════════════════════════════════════════
// §4: Structural invariants on PC solution data
// ═══════════════════════════════════════════════════════════════════════════

describe('§4 PC solution structural invariants', () => {
  const routes = getBag2Routes('honey_cup', false);

  for (let ri = 0; ri < routes.length; ri++) {
    const solutions = getPcSolutions('honey_cup', false, ri);

    for (let si = 0; si < solutions.length; si++) {
      const sol = solutions[si]!;

      test(`route ${ri} sol ${si}: 6 placements, 6 unique pieces, hold is 7th`, () => {
        expect(sol.placements.length).toBe(6);
        const types = new Set(sol.placements.map(p => p.piece));
        expect(types.size).toBe(6);
        expect(types.has(sol.holdPiece)).toBe(false);
        const allUsed = [...types, sol.holdPiece].sort();
        expect(allUsed).toEqual([...ALL_PIECES].sort());
      });

      test(`route ${ri} sol ${si}: each placement has 4 cells`, () => {
        for (const p of sol.placements) {
          expect(p.cells.length).toBe(4);
        }
      });
    }
  }

  test('routes 0, 1, 2 share the same solutions (reference equality)', () => {
    const s0 = getPcSolutions('honey_cup', false, 0);
    const s1 = getPcSolutions('honey_cup', false, 1);
    const s2 = getPcSolutions('honey_cup', false, 2);
    expect(s0).toBe(s1);
    expect(s1).toBe(s2);
  });

  test('openers without PC data return empty for any route', () => {
    expect(getPcSolutions('stray_cannon', false, 0)).toEqual([]);
    expect(getPcSolutions('ms2', false, 0)).toEqual([]);
    expect(getPcSolutions('gamushiro', false, 0)).toEqual([]);
  });
});
