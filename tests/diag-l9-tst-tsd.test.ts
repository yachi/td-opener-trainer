/**
 * Phase 2.5 Empirical Proof: TST/TSD line-clear simulation
 *
 * Validates that `lockAndClear` with a T piece produces exactly 3-line clears (TST)
 * on all 8 existing Bag 2 boards (4 openers × 2 routes × normal + mirror).
 *
 * This test MUST pass before any src/ modifications for the TD flow extension.
 */

import { describe, test, expect } from 'bun:test';
import { findAllPlacements, lockAndClear } from '../src/core/engine.ts';
import { getBag2Sequence } from '../src/openers/sequences.ts';
import type { OpenerID } from '../src/openers/types.ts';
import { OPENER_ORDER } from '../src/openers/types.ts';

// ── Helpers ──

function countCells(board: readonly (readonly (string | null)[])[]) {
  let n = 0;
  for (const row of board) for (const c of row) if (c !== null) n++;
  return n;
}

function boardSlice(board: readonly (readonly (string | null)[])[], fromRow: number, toRow: number) {
  const lines: string[] = [];
  for (let r = fromRow; r < toRow; r++) {
    const rowStr = board[r]!.map(c => (c ? c[0] : '.')).join('');
    lines.push(`  Row ${r}: ${rowStr}`);
  }
  return lines.join('\n');
}

// ── Tests ──

describe('TST line-clear simulation on all existing Bag 2 routes', () => {
  const openers: OpenerID[] = [...OPENER_ORDER];

  for (const openerId of openers) {
    for (const routeIndex of [0, 1]) {
      for (const mirror of [false, true]) {
        const side = mirror ? 'mirror' : 'normal';
        const label = `${openerId} route=${routeIndex} ${side}`;

        test(`${label}: T placement found that clears exactly 3 lines (TST)`, () => {
          const seq = getBag2Sequence(openerId, mirror, routeIndex);
          expect(seq).not.toBeNull();
          if (!seq) return;

          // Bag 2 final board = last step's board (includes Bag1 + holdPlacement + route placements)
          const bag2Board =
            seq.steps.length > 0
              ? seq.steps[seq.steps.length - 1]!.board
              : seq.baseBoard;

          // Find all T placements via BFS
          const tPlacements = findAllPlacements(bag2Board, 'T');
          expect(tPlacements.length).toBeGreaterThan(0);

          // Find the TST: the T placement that clears exactly 3 lines
          let found = false;
          for (const tp of tPlacements) {
            const result = lockAndClear(bag2Board, tp.piece);
            if (result.linesCleared === 3) {
              found = true;
              const remaining = countCells(result.board);
              console.log(
                `${label}: TST ✓ — T at (col=${tp.piece.col}, row=${tp.piece.row}, rot=${tp.piece.rotation}), ` +
                  `${remaining} cells remain`,
              );
              console.log(boardSlice(result.board, 14, 20));
              break;
            }
          }

          expect(found).toBe(true);
        });
      }
    }
  }
});

describe('Post-TST board properties', () => {
  const openers: OpenerID[] = [...OPENER_ORDER];

  for (const openerId of openers) {
    for (const routeIndex of [0, 1]) {
      // Normal side only (mirror is symmetric)
      const label = `${openerId} route=${routeIndex}`;

      test(`${label}: post-TST cell count and height`, () => {
        const seq = getBag2Sequence(openerId, false, routeIndex);
        if (!seq) return;

        const bag2Board =
          seq.steps.length > 0
            ? seq.steps[seq.steps.length - 1]!.board
            : seq.baseBoard;

        const tPlacements = findAllPlacements(bag2Board, 'T');

        for (const tp of tPlacements) {
          const result = lockAndClear(bag2Board, tp.piece);
          if (result.linesCleared === 3) {
            const remaining = countCells(result.board);

            // Post-TST board should have significantly fewer cells
            // Bag 1 = 24-28 cells, Bag 2 = 24 cells, T = 4 cells, minus 30 cleared (3 full rows)
            // Expected: (24-28) + 24 + 4 - 30 = 22-26 cells
            expect(remaining).toBeGreaterThan(10);
            expect(remaining).toBeLessThan(40);

            // Height should be reasonable (≤6 rows from bottom)
            let topRow = 20;
            for (let r = 0; r < 20; r++) {
              if (result.board[r]!.some(c => c !== null)) {
                topRow = r;
                break;
              }
            }
            expect(topRow).toBeGreaterThanOrEqual(14); // at most 6 rows of content

            console.log(`${label}: ${remaining} cells, top at row ${topRow} (${20 - topRow} rows high)`);
            break;
          }
        }
      });
    }
  }
});

describe('Post-TST: T placements available for TSD', () => {
  // After TST fires, the TSD slot should exist on the post-TST board.
  // We can't fire TSD yet (need Bag 3 pieces first), but verify
  // that T placements exist on the post-TST board.
  const openers: OpenerID[] = [...OPENER_ORDER];

  for (const openerId of openers) {
    const label = `${openerId} route=0 normal`;

    test(`${label}: T can be placed on post-TST board`, () => {
      const seq = getBag2Sequence(openerId, false, 0);
      if (!seq) return;

      const bag2Board =
        seq.steps.length > 0
          ? seq.steps[seq.steps.length - 1]!.board
          : seq.baseBoard;

      const tPlacements = findAllPlacements(bag2Board, 'T');
      let postTstBoard = null;

      for (const tp of tPlacements) {
        const result = lockAndClear(bag2Board, tp.piece);
        if (result.linesCleared === 3) {
          postTstBoard = result.board;
          break;
        }
      }

      if (!postTstBoard) return;

      // On the post-TST board, T placements should still exist
      // (the TSD slot is part of the residual structure)
      const tsdPlacements = findAllPlacements(postTstBoard, 'T');
      console.log(`${label}: ${tsdPlacements.length} T placements on post-TST board`);
      expect(tsdPlacements.length).toBeGreaterThan(0);
    });
  }
});
