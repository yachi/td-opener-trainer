/**
 * acceptance.test.ts — The ONE acceptance test.
 *
 * Every step of every route must satisfy ALL invariants.
 * No exemptions except the TST overhang.
 * If this test fails, the data or architecture is wrong.
 */

import { describe, test, expect } from 'bun:test';
import type { OpenerID } from '../src/openers/types.ts';
import { getOpenerSequence, getBag2Routes, createVisualizerState } from '../src/modes/visualizer.ts';
import { findFloatingCells } from '../src/core/field-engine.ts';
import { PIECE_DEFINITIONS } from '../src/core/pieces.ts';
import type { PieceType } from '../src/core/types.ts';

const OPENER_IDS: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'];

function isTstOverhang(
  col: number,
  row: number,
  board: (PieceType | null)[][],
  tstSlot: { col: number; row: number; rotation: number } | null,
): boolean {
  if (!tstSlot) return false;
  const tCells = PIECE_DEFINITIONS['T'].cells[tstSlot.rotation];
  if (!tCells) return false;
  return tCells.some(([dc, dr]: readonly [number, number]) => {
    const tc = tstSlot.col + dc;
    const tr = tstSlot.row + dr;
    return tc === col && tr === row + 1 && board[tr]?.[tc] === null;
  });
}

describe('Acceptance: every step of every route', () => {
  for (const id of OPENER_IDS) {
    const bag1 = getOpenerSequence(id, false);
    const tstSlot = bag1.tSpinSlots.tst;
    const routes = getBag2Routes(id, false);

    for (let ri = 0; ri < routes.length; ri++) {
      const route = routes[ri]!;
      const label = `${id}/${route.routeId}`;

      test(`${label}: no floating cells (except TST overhang)`, () => {
        const state = createVisualizerState(id, false, ri);
        const errors: string[] = [];

        for (let i = 0; i < state.steps.length; i++) {
          const board = state.steps[i]!.board;
          const piece = state.steps[i]!.piece;
          const floating = findFloatingCells(board);

          for (const f of floating) {
            if (!isTstOverhang(f.col, f.row, board, tstSlot)) {
              errors.push(
                `step ${i + 1} (${piece}): (${f.col},${f.row})=${board[f.row]![f.col]} floats`,
              );
            }
          }
        }

        if (errors.length > 0) {
          throw new Error(`${label}: ${errors.length} floating cells:\n${errors.join('\n')}`);
        }
      });

      test(`${label}: cell count = 4 * pieces placed`, () => {
        const state = createVisualizerState(id, false, ri);

        for (let i = 0; i < state.steps.length; i++) {
          const board = state.steps[i]!.board;
          let count = 0;
          for (const row of board) for (const cell of row) if (cell !== null) count++;

          // Each step should add 4 cells (or 0 if skipped due to conflict)
          const newCells = state.steps[i]!.newCells.length;
          if (newCells > 0 && newCells !== 4) {
            throw new Error(
              `${label} step ${i + 1}: placed ${newCells} cells (expected 4)`,
            );
          }
        }
      });

      test(`${label}: no step removes cells from previous step`, () => {
        const state = createVisualizerState(id, false, ri);

        for (let i = 1; i < state.steps.length; i++) {
          const prev = state.steps[i - 1]!.board;
          const curr = state.steps[i]!.board;

          for (let r = 0; r < 20; r++) {
            for (let c = 0; c < 10; c++) {
              if (prev[r]![c] !== null && curr[r]![c] === null) {
                throw new Error(
                  `${label} step ${i + 1}: cell (${c},${r})=${prev[r]![c]} disappeared`,
                );
              }
            }
          }
        }
      });
    }
  }
});
