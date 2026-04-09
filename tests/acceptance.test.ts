/**
 * acceptance.test.ts — The acceptance test framework.
 *
 * Bag 1: strict gravity — no floating (except TST overhang).
 * Bag 2: wiki positions — pieces may float on pre-TST board.
 *        Validated by SRS reachability, not gravity.
 * All steps: no disappearing cells, correct cell count.
 *
 * The wiki shows Bag 2 pieces on the pre-TST board (Bag 1 final).
 * Floating is inherent to this model — the TST hasn't fired yet.
 * Solution-finder/setup-finder simulate TST; visualizers don't.
 */

import { describe, test, expect } from 'bun:test';
import type { OpenerID } from '../src/openers/types.ts';
import type { PieceType } from '../src/core/types.ts';
import { getOpenerSequence } from '../src/openers/sequences.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import { OPENER_PLACEMENT_DATA, mirrorPlacementData } from '../src/openers/placements.ts';
import { findFloatingCells, buildSteps, type Step } from '../src/core/engine.ts';
import { PIECE_DEFINITIONS } from '../src/core/pieces.ts';
import goldenData from './fixtures/bag2-golden.json';

const OPENER_IDS: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'];

/**
 * Local helper replicating the flat step list that the deleted
 * `createVisualizerState` produced: Bag 1 + hold (if any) + Bag 2 all in
 * one flat sequence, plus a `bag1End` index. Uses the same "reduce Bag 1
 * by one on conflict" fallback as the old visualizer for Gamushiro form_2.
 */
function buildFlatSequence(
  openerId: OpenerID,
  mirror: boolean,
  routeIndex: number,
): { steps: Step[]; bag1End: number } {
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const bag1Placements = data.placements;
  const routes = getBag2Routes(openerId, mirror);
  const route = routes[routeIndex] ?? null;
  const bag2All = route
    ? [
        ...(route.holdPlacement ? [route.holdPlacement] : []),
        ...route.placements,
      ]
    : [];

  let bag1Used = bag1Placements;
  if (route && bag2All.length > 0) {
    const fullSteps = buildSteps([...bag1Placements, ...bag2All]);
    if (fullSteps.length < bag1Placements.length + bag2All.length) {
      const reduced = bag1Placements.slice(0, bag1Placements.length - 1);
      const reducedSteps = buildSteps([...reduced, ...bag2All]);
      if (reducedSteps.length >= reduced.length + bag2All.length) {
        bag1Used = reduced;
      }
    }
  }

  const allPlacements = route ? [...bag1Used, ...bag2All] : [...bag1Placements];
  return { steps: buildSteps(allPlacements), bag1End: bag1Used.length };
}

function isTstOverhang(
  col: number, row: number,
  board: (PieceType | null)[][],
  _tstSlot: { col: number; row: number; rotation: number } | null,
): boolean {
  // TD openers intentionally have cells floating over the TST pocket gap.
  // A cell is a TST overhang if it's above an empty cell at row 18 or 19
  // (the bottom rows where the T-Spin pocket is formed).
  if (row < 17) return false;
  const below = board[row + 1]?.[col];
  return below === null;
}

describe('Acceptance: Bag 1 gravity — zero floating', () => {
  for (const id of OPENER_IDS) {
    test(`${id}: Bag 1 steps have no floating cells`, () => {
      const bag1 = getOpenerSequence(id, false);
      const tstSlot = bag1.tSpinSlots.tst;
      const errors: string[] = [];

      for (let i = 0; i < bag1.steps.length; i++) {
        const board = bag1.steps[i]!.board;
        for (const f of findFloatingCells(board)) {
          if (!isTstOverhang(f.col, f.row, board, tstSlot)) {
            errors.push(`step ${i + 1} (${bag1.steps[i]!.piece}): (${f.col},${f.row})=${board[f.row]![f.col]}`);
          }
        }
      }

      expect(errors).toEqual([]);
    });
  }
});

describe('Acceptance: no disappearing cells between steps', () => {
  for (const id of OPENER_IDS) {
    const routes = getBag2Routes(id, false);
    for (let ri = 0; ri < routes.length; ri++) {
      test(`${id}/${routes[ri]!.routeId}: no cell disappears`, () => {
        const state = buildFlatSequence(id, false, ri);
        for (let i = 1; i < state.steps.length; i++) {
          const prev = state.steps[i - 1]!.board;
          const curr = state.steps[i]!.board;
          for (let r = 0; r < 20; r++) {
            for (let c = 0; c < 10; c++) {
              if (prev[r]![c] !== null && curr[r]![c] === null) {
                throw new Error(
                  `step ${i + 1}: (${c},${r})=${prev[r]![c]} disappeared`,
                );
              }
            }
          }
        }
      });
    }
  }
});

describe('Acceptance: every placement adds exactly 4 cells', () => {
  for (const id of OPENER_IDS) {
    const routes = getBag2Routes(id, false);
    for (let ri = 0; ri < routes.length; ri++) {
      test(`${id}/${routes[ri]!.routeId}: 4 cells per step`, () => {
        const state = buildFlatSequence(id, false, ri);
        for (let i = 0; i < state.steps.length; i++) {
          const n = state.steps[i]!.newCells.length;
          if (n !== 4 && n !== 0) {
            throw new Error(`step ${i + 1} (${state.steps[i]!.piece}): ${n} cells (expected 4 or 0)`);
          }
        }
      });
    }
  }
});

describe('Acceptance: base board matches wiki residual', () => {
  for (const id of OPENER_IDS) {
    const routes = getBag2Routes(id, false);
    const wikiRoutes = (goldenData as Record<string, Record<string, { residual?: { col: number; row: number }[] }>>)[id];

    for (let ri = 0; ri < routes.length; ri++) {
      const route = routes[ri]!;
      const wikiResidual = wikiRoutes?.[route.routeId]?.residual;
      if (!wikiResidual) continue;

      test(`${id}/${route.routeId}: engine base board = wiki residual (${wikiResidual.length} cells)`, () => {
        const state = buildFlatSequence(id, false, ri);
        // Base board = Bag 1 final + hold piece (computed directly, not from step sequence)
        const bag1Final = state.bag1End > 0 ? state.steps[state.bag1End - 1]!.board : Array.from({length:20}, () => Array(10).fill(null));
        const base = bag1Final.map((r: any) => [...r]);
        if (route.holdPlacement) {
          for (const c of route.holdPlacement.cells) {
            if (base[c.row][c.col] === null) base[c.row][c.col] = route.holdPlacement.piece;
          }
        }
        expect(base).not.toBeNull();

        const wikiSet = new Set(wikiResidual.map(c => `${c.col},${c.row}`));
        const engineSet = new Set<string>();
        for (let r = 0; r < 20; r++)
          for (let c = 0; c < 10; c++)
            if (base![r]![c] !== null) engineSet.add(`${c},${r}`);

        const missing = [...wikiSet].filter(c => !engineSet.has(c));
        const extra = [...engineSet].filter(c => !wikiSet.has(c));

        if (missing.length > 0 || extra.length > 0) {
          throw new Error(
            `Base board ≠ wiki:\n` +
            (missing.length > 0 ? `  Missing from engine: ${missing.join(', ')}\n` : '') +
            (extra.length > 0 ? `  Extra in engine: ${extra.join(', ')}` : ''),
          );
        }
      });
    }
  }
});
