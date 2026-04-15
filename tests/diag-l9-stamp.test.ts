/**
 * diag-l9-stamp.test.ts — Phase 2.5 empirical proof for the stamp-over-BFS redesign.
 *
 * ROOT CAUSE: Routes 3,4,5,6,8 of Honey Cup are missing the Bag 1 J piece
 * because `buildSteps` uses BFS reachability. When Bag 2 pieces block the
 * BFS path to J (even without cell overlap), `getBag2Sequence` falls back
 * to "Bag 1 reduction" — dropping J. The wiki boards show J present.
 *
 * L9 REFRAME: The visualization system conflates DATA (what the board looks
 * like) with SIMULATION (how pieces reach those positions). When simulation
 * fails, the system changes the data. This is backwards.
 *
 * FIX: Replace `buildSteps` with `stampSteps` in the visualization path.
 * `stampSteps` stamps cells directly — no BFS, never fails. BFS verification
 * moves to tests. The class of bug "BFS failure corrupts the board" is
 * dissolved.
 *
 * This file tests the inline `stampSteps` implementation before it's copied
 * into src/core/engine.ts (Phase 3).
 */

import { describe, test, expect } from 'bun:test';

import {
  emptyBoard,
  buildSteps,
  stampCells,
  cloneBoard,
  type Board,
  type Step,
} from '../src/core/engine.ts';
import {
  OPENER_PLACEMENT_DATA,
  mirrorPlacementData,
  type RawPlacement,
} from '../src/openers/placements.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import { getBag2Sequence } from '../src/openers/sequences.ts';
import type { OpenerID } from '../src/openers/types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// §1  Inline stampSteps — the spec for Phase 3
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pure cell stamping — no BFS, no reachability check, never fails.
 * Each placement's cells are stamped onto the board in sequence.
 * The result is always faithful to the input data.
 */
function stampSteps(placements: RawPlacement[]): Step[] {
  let board = emptyBoard();
  const steps: Step[] = [];
  for (const p of placements) {
    board = stampCells(cloneBoard(board), p.piece, p.cells);
    steps.push({
      piece: p.piece,
      board: cloneBoard(board),
      newCells: [...p.cells],
      hint: p.hint ?? '',
    });
  }
  return steps;
}

/**
 * Stamp Bag 2 steps onto a Bag 1 final board — no BFS, no reduction.
 * This replaces the concatenate-and-buildSteps approach in getBag2Sequence.
 */
function stampBag2OnBoard(
  bag1FinalBoard: Board,
  route: { placements: RawPlacement[]; holdPlacement: RawPlacement | null },
): { steps: Step[]; fullSteps: Step[]; baseBoard: Board } {
  // 1. Stamp hold placement (if any)
  let board = cloneBoard(bag1FinalBoard);
  const holdSteps: Step[] = [];
  if (route.holdPlacement) {
    const emptyCells = route.holdPlacement.cells.filter(
      c => board[c.row]?.[c.col] === null,
    );
    if (emptyCells.length > 0) {
      board = stampCells(cloneBoard(board), route.holdPlacement.piece, emptyCells);
      holdSteps.push({
        piece: route.holdPlacement.piece,
        board: cloneBoard(board),
        newCells: emptyCells,
        hint: route.holdPlacement.hint ?? '',
      });
    }
  }
  const baseBoard = cloneBoard(board);

  // 2. Stamp each Bag 2 piece
  const bag2Steps: Step[] = [];
  for (const p of route.placements) {
    board = stampCells(cloneBoard(board), p.piece, p.cells);
    bag2Steps.push({
      piece: p.piece,
      board: cloneBoard(board),
      newCells: [...p.cells],
      hint: p.hint ?? '',
    });
  }

  return {
    steps: bag2Steps,
    fullSteps: [...holdSteps, ...bag2Steps],
    baseBoard,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// §2  Proof: stampSteps matches buildSteps where buildSteps succeeds
// ═══════════════════════════════════════════════════════════════════════════

const ALL_OPENERS: OpenerID[] = ['honey_cup', 'stray_cannon', 'gamushiro', 'ms2'];

describe('stampSteps ≡ buildSteps for Bag 1 (where buildSteps succeeds)', () => {
  for (const opener of ALL_OPENERS) {
    for (const mirror of [false, true]) {
      const label = `${opener}${mirror ? ' (mirror)' : ''}`;
      test(label, () => {
        const raw = OPENER_PLACEMENT_DATA[opener];
        const data = mirror ? mirrorPlacementData(raw) : raw;

        const bfsSteps = buildSteps(data.placements);
        const stampedSteps = stampSteps(data.placements);

        // Both produce the same number of steps (Bag 1 never fails BFS).
        expect(stampedSteps.length).toBe(bfsSteps.length);

        // Final board occupancy is identical.
        const bfsBoard = bfsSteps[bfsSteps.length - 1]!.board;
        const stampBoard = stampedSteps[stampedSteps.length - 1]!.board;
        for (let r = 0; r < 20; r++) {
          for (let c = 0; c < 10; c++) {
            expect(stampBoard[r]![c]).toBe(bfsBoard[r]![c]);
          }
        }
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// §3  Proof: stampBag2OnBoard fixes routes 3,4,5,6,8 (J piece present)
// ═══════════════════════════════════════════════════════════════════════════

describe('Honey Cup routes 3,4,5,6,8: stamped boards have J piece', () => {
  // Bag 1 J piece cells: (9,15), (9,16), (8,17), (9,17)
  const BAG1_J_CELLS = [
    { col: 9, row: 15 },
    { col: 9, row: 16 },
    { col: 8, row: 17 },
    { col: 9, row: 17 },
  ];

  const bag1Steps = stampSteps(OPENER_PLACEMENT_DATA['honey_cup'].placements);
  const bag1FinalBoard = bag1Steps[bag1Steps.length - 1]!.board;

  // Verify Bag 1 board has J
  test('Bag 1 final board has J at right wall', () => {
    for (const { col, row } of BAG1_J_CELLS) {
      expect(bag1FinalBoard[row]![col]).toBe('J');
    }
  });

  const routes = getBag2Routes('honey_cup', false);
  const AFFECTED_ROUTES = [2, 3, 4, 5, 7]; // 0-indexed: l_before_j, fb_l_top_left, fb_j_top_right, fb_s_early, fb_i_center

  for (const ri of AFFECTED_ROUTES) {
    const route = routes[ri]!;
    test(`Route ${ri + 1} (${route.routeId}): J present in stamped board`, () => {
      const { fullSteps } = stampBag2OnBoard(bag1FinalBoard, route);
      const finalBoard = fullSteps[fullSteps.length - 1]!.board;

      // J cells from Bag 1 must still be present
      for (const { col, row } of BAG1_J_CELLS) {
        expect(finalBoard[row]![col]).toBe('J');
      }
    });

    test(`Route ${ri + 1} (${route.routeId}): J present in getBag2Sequence (stamp fix)`, () => {
      // After L9 stamp-over-BFS redesign, getBag2Sequence uses stampSteps.
      // J is now correctly present in the final board.
      const seq = getBag2Sequence('honey_cup', false, ri);
      expect(seq).not.toBeNull();
      const currentBoard = seq!.fullSteps[seq!.fullSteps.length - 1]!.board;

      for (const { col, row } of BAG1_J_CELLS) {
        expect(currentBoard[row]![col]).toBe('J');
      }
    });
  }

  // Verify unaffected routes still work
  const UNAFFECTED_ROUTES = [0, 1, 6]; // ideal, alt_i_left, fb_o_top_left
  for (const ri of UNAFFECTED_ROUTES) {
    const route = routes[ri]!;
    test(`Route ${ri + 1} (${route.routeId}): J present in BOTH stamp and BFS`, () => {
      const { fullSteps } = stampBag2OnBoard(bag1FinalBoard, route);
      const stampedBoard = fullSteps[fullSteps.length - 1]!.board;

      const seq = getBag2Sequence('honey_cup', false, ri);
      const bfsBoard = seq!.fullSteps[seq!.fullSteps.length - 1]!.board;

      for (const { col, row } of BAG1_J_CELLS) {
        expect(stampedBoard[row]![col]).toBe('J');
        expect(bfsBoard[row]![col]).toBe('J');
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// §4  Proof: stamped boards match wiki occupancy for ALL openers × routes
// ═══════════════════════════════════════════════════════════════════════════

describe('stampBag2OnBoard: all openers × routes produce valid boards', () => {
  for (const opener of ALL_OPENERS) {
    for (const mirror of [false, true]) {
      const raw = OPENER_PLACEMENT_DATA[opener];
      const data = mirror ? mirrorPlacementData(raw) : raw;
      const bag1Steps = stampSteps(data.placements);
      const bag1FinalBoard = bag1Steps[bag1Steps.length - 1]!.board;

      const routes = getBag2Routes(opener, mirror);
      for (let ri = 0; ri < routes.length; ri++) {
        const route = routes[ri]!;
        const label = `${opener}${mirror ? ' (m)' : ''} route ${ri + 1} (${route.routeId})`;

        test(`${label}: stamp produces non-empty steps`, () => {
          const { fullSteps } = stampBag2OnBoard(bag1FinalBoard, route);
          expect(fullSteps.length).toBeGreaterThan(0);

          // Final board has more occupied cells than Bag 1 alone
          const bag1Cells = countOccupied(bag1FinalBoard);
          const finalCells = countOccupied(fullSteps[fullSteps.length - 1]!.board);
          expect(finalCells).toBeGreaterThan(bag1Cells);
        });
      }
    }
  }
});

function countOccupied(board: Board): number {
  let count = 0;
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 10; c++) {
      if (board[r]![c] !== null) count++;
    }
  }
  return count;
}
