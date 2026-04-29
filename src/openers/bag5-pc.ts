/**
 * bag5-pc.ts — Bag 5 Perfect Clear solution data (completes the DPC cycle).
 *
 * After DPC TSD fires (8 placements, 2 lines cleared), 12 cells remain.
 * Bag 5 = 7 new pieces (28 cells) fills exactly 4 rows (40 total) for PC.
 * TSM J SPC variants have 22 remaining cells → 5 rows (50 total) for PC.
 * Hold is empty after DPC (all 8 pieces used), so all 7 must be placed.
 *
 * Solutions computed by bitmask tiling solver + BFS reachability ordering
 * + replayPcSteps validation (gen-bag5-solutions.ts).
 * I#0/I#3 Fake Butter: intermediate-line-clear solutions (probe-bag5-pc-v4.ts).
 *
 * All 16 DPC variants have bag 5 PC solutions (30 total).
 * Shared boards: O-Kuruma = S-Kuruma, O-Kuruma Mirror = Z-Kuruma Mirror.
 */

import type { PieceType } from '../core/types.ts';
import type { RawPlacement } from './placements.ts';

// ── Types ──

export interface Bag5PcSolution {
  /** Ordered placements. Use with replayPcSteps(), not buildSteps(). */
  placements: RawPlacement[];
}

// ── Solution data (keyed by holdPiece + dpcSolutionIndex) ──
// Index matches getDpcSolutions(holdPiece)[index].

type SolutionMap = Record<number, Bag5PcSolution[]>;

const O_SOLUTIONS: SolutionMap = {
  // O-hold index 0: Kuruma DPC (2 solutions)
  0: [
    {
      placements: [
        { piece: 'L', cells: [{ col: 1, row: 16 }, { col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }], hint: 'L' },
        { piece: 'S', cells: [{ col: 2, row: 16 }, { col: 2, row: 17 }, { col: 3, row: 17 }, { col: 3, row: 18 }], hint: 'S' },
        { piece: 'J', cells: [{ col: 6, row: 16 }, { col: 7, row: 16 }, { col: 6, row: 17 }, { col: 6, row: 18 }], hint: 'J' },
        { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O' },
        { piece: 'Z', cells: [{ col: 5, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'Z' },
        { piece: 'T', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'I' },
      ],
    },
    {
      placements: [
        { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'I' },
        { piece: 'S', cells: [{ col: 6, row: 16 }, { col: 7, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 17 }], hint: 'T' },
        { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O' },
        { piece: 'J', cells: [{ col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }, { col: 3, row: 18 }], hint: 'J' },
        { piece: 'Z', cells: [{ col: 1, row: 16 }, { col: 2, row: 16 }, { col: 2, row: 17 }, { col: 3, row: 17 }], hint: 'Z' },
        { piece: 'L', cells: [{ col: 4, row: 18 }, { col: 5, row: 18 }, { col: 6, row: 18 }, { col: 4, row: 19 }], hint: 'L' },
      ],
    },
  ],
  // O-hold index 1: TSD DPC (3 solutions)
  1: [
    {
      placements: [
        { piece: 'S', cells: [{ col: 6, row: 16 }, { col: 6, row: 17 }, { col: 7, row: 17 }, { col: 7, row: 18 }], hint: 'S' },
        { piece: 'J', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'J' },
        { piece: 'Z', cells: [{ col: 0, row: 17 }, { col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }], hint: 'Z' },
        { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }, { col: 3, row: 16 }], hint: 'I' },
        { piece: 'T', cells: [{ col: 4, row: 18 }, { col: 5, row: 18 }, { col: 6, row: 18 }, { col: 5, row: 19 }], hint: 'T' },
        { piece: 'O', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'O' },
        { piece: 'L', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 3, row: 18 }, { col: 3, row: 19 }], hint: 'L' },
      ],
    },
    {
      placements: [
        { piece: 'J', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'J' },
        { piece: 'Z', cells: [{ col: 0, row: 17 }, { col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }], hint: 'Z' },
        { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }, { col: 3, row: 16 }], hint: 'I' },
        { piece: 'S', cells: [{ col: 4, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 5, row: 19 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }, { col: 5, row: 17 }], hint: 'T' },
        { piece: 'O', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }, { col: 7, row: 18 }], hint: 'O' },
        { piece: 'L', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 3, row: 18 }, { col: 3, row: 19 }], hint: 'L' },
      ],
    },
    {
      placements: [
        { piece: 'S', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 1, row: 17 }, { col: 1, row: 18 }], hint: 'S' },
        { piece: 'Z', cells: [{ col: 1, row: 16 }, { col: 2, row: 16 }, { col: 2, row: 17 }, { col: 3, row: 17 }], hint: 'Z' },
        { piece: 'I', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'I' },
        { piece: 'J', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'J' },
        { piece: 'L', cells: [{ col: 4, row: 17 }, { col: 5, row: 17 }, { col: 5, row: 18 }, { col: 5, row: 19 }], hint: 'L' },
        { piece: 'O', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }, { col: 7, row: 18 }], hint: 'O' },
        { piece: 'T', cells: [{ col: 2, row: 18 }, { col: 3, row: 18 }, { col: 4, row: 18 }, { col: 3, row: 19 }], hint: 'T' },
      ],
    },
  ],
  // O-hold index 2: Kuruma DPC Mirror (2 solutions)
  2: [
    {
      placements: [
        { piece: 'O', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 0, row: 17 }, { col: 1, row: 17 }], hint: 'O' },
        { piece: 'L', cells: [{ col: 2, row: 16 }, { col: 3, row: 16 }, { col: 3, row: 17 }, { col: 3, row: 18 }], hint: 'L' },
        { piece: 'Z', cells: [{ col: 7, row: 16 }, { col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }], hint: 'Z' },
        { piece: 'J', cells: [{ col: 8, row: 16 }, { col: 8, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }], hint: 'J' },
        { piece: 'S', cells: [{ col: 4, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 5, row: 19 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }, { col: 5, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'I' },
      ],
    },
    {
      placements: [
        { piece: 'O', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 0, row: 17 }, { col: 1, row: 17 }], hint: 'O' },
        { piece: 'Z', cells: [{ col: 2, row: 16 }, { col: 3, row: 16 }, { col: 3, row: 17 }, { col: 4, row: 17 }], hint: 'Z' },
        { piece: 'T', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }, { col: 5, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'I' },
        { piece: 'L', cells: [{ col: 8, row: 17 }, { col: 6, row: 18 }, { col: 7, row: 18 }, { col: 8, row: 18 }], hint: 'L' },
        { piece: 'S', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 6, row: 17 }, { col: 7, row: 17 }], hint: 'S' },
        { piece: 'J', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 5, row: 19 }], hint: 'J' },
      ],
    },
  ],
  // O-hold index 3: TSD DPC Mirror (3 solutions)
  3: [
    {
      placements: [
        { piece: 'L', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }, { col: 0, row: 17 }], hint: 'L' },
        { piece: 'Z', cells: [{ col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }, { col: 8, row: 18 }], hint: 'Z' },
        { piece: 'S', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 6, row: 17 }, { col: 7, row: 17 }], hint: 'S' },
        { piece: 'I', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'I' },
        { piece: 'O', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 2, row: 18 }, { col: 3, row: 18 }], hint: 'O' },
        { piece: 'J', cells: [{ col: 4, row: 17 }, { col: 5, row: 17 }, { col: 4, row: 18 }, { col: 4, row: 19 }], hint: 'J' },
        { piece: 'T', cells: [{ col: 5, row: 18 }, { col: 6, row: 18 }, { col: 7, row: 18 }, { col: 6, row: 19 }], hint: 'T' },
      ],
    },
    {
      placements: [
        { piece: 'L', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }, { col: 0, row: 17 }], hint: 'L' },
        { piece: 'O', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 2, row: 18 }, { col: 3, row: 18 }], hint: 'O' },
        { piece: 'Z', cells: [{ col: 5, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'Z' },
        { piece: 'T', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 17 }], hint: 'T' },
        { piece: 'S', cells: [{ col: 8, row: 17 }, { col: 9, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }], hint: 'S' },
        { piece: 'I', cells: [{ col: 6, row: 16 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }], hint: 'I' },
        { piece: 'J', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }, { col: 6, row: 19 }], hint: 'J' },
      ],
    },
    {
      placements: [
        { piece: 'L', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }, { col: 0, row: 17 }], hint: 'L' },
        { piece: 'Z', cells: [{ col: 3, row: 16 }, { col: 2, row: 17 }, { col: 3, row: 17 }, { col: 2, row: 18 }], hint: 'Z' },
        { piece: 'S', cells: [{ col: 8, row: 17 }, { col: 9, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }], hint: 'S' },
        { piece: 'I', cells: [{ col: 6, row: 16 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }], hint: 'I' },
        { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'T' },
        { piece: 'O', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'O' },
        { piece: 'J', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }, { col: 6, row: 19 }], hint: 'J' },
      ],
    },
  ],
};

const S_SOLUTIONS: SolutionMap = {
  // S-hold index 0: Kuruma DPC (same post-TSD board as O-hold Kuruma)
  0: O_SOLUTIONS[0]!,
  // S-hold index 1: Lime DPC (2 solutions)
  1: [
    {
      placements: [
        { piece: 'I', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'I' },
        { piece: 'Z', cells: [{ col: 0, row: 17 }, { col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }], hint: 'Z' },
        { piece: 'J', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }, { col: 2, row: 17 }], hint: 'J' },
        { piece: 'S', cells: [{ col: 5, row: 17 }, { col: 5, row: 18 }, { col: 6, row: 18 }, { col: 6, row: 19 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 7, row: 16 }, { col: 6, row: 17 }, { col: 7, row: 17 }, { col: 8, row: 17 }], hint: 'T' },
        { piece: 'L', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }], hint: 'L' },
        { piece: 'O', cells: [{ col: 7, row: 18 }, { col: 8, row: 18 }, { col: 7, row: 19 }, { col: 8, row: 19 }], hint: 'O' },
      ],
    },
    {
      placements: [
        { piece: 'J', cells: [{ col: 2, row: 16 }, { col: 2, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }], hint: 'J' },
        { piece: 'O', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 0, row: 17 }, { col: 1, row: 17 }], hint: 'O' },
        { piece: 'I', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'I' },
        { piece: 'S', cells: [{ col: 5, row: 17 }, { col: 5, row: 18 }, { col: 6, row: 18 }, { col: 6, row: 19 }], hint: 'S' },
        { piece: 'Z', cells: [{ col: 9, row: 17 }, { col: 8, row: 18 }, { col: 9, row: 18 }, { col: 8, row: 19 }], hint: 'Z' },
        { piece: 'T', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }], hint: 'T' },
        { piece: 'L', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 7, row: 18 }, { col: 7, row: 19 }], hint: 'L' },
      ],
    },
  ],
};

const Z_SOLUTIONS: SolutionMap = {
  // Z-hold index 0: Kuruma DPC Mirror (same post-TSD board as O-hold Kuruma Mirror)
  0: O_SOLUTIONS[2]!,
  // Z-hold index 1: Lime DPC Mirror (2 solutions)
  1: [
    {
      placements: [
        { piece: 'J', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }], hint: 'J' },
        { piece: 'Z', cells: [{ col: 4, row: 17 }, { col: 3, row: 18 }, { col: 4, row: 18 }, { col: 3, row: 19 }], hint: 'Z' },
        { piece: 'T', cells: [{ col: 2, row: 16 }, { col: 1, row: 17 }, { col: 2, row: 17 }, { col: 3, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'I' },
        { piece: 'S', cells: [{ col: 8, row: 17 }, { col: 9, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }], hint: 'S' },
        { piece: 'L', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }, { col: 7, row: 17 }], hint: 'L' },
        { piece: 'O', cells: [{ col: 1, row: 18 }, { col: 2, row: 18 }, { col: 1, row: 19 }, { col: 2, row: 19 }], hint: 'O' },
      ],
    },
    {
      placements: [
        { piece: 'I', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'I' },
        { piece: 'L', cells: [{ col: 7, row: 16 }, { col: 7, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }], hint: 'L' },
        { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O' },
        { piece: 'S', cells: [{ col: 0, row: 17 }, { col: 0, row: 18 }, { col: 1, row: 18 }, { col: 1, row: 19 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }, { col: 1, row: 17 }], hint: 'T' },
        { piece: 'Z', cells: [{ col: 4, row: 17 }, { col: 3, row: 18 }, { col: 4, row: 18 }, { col: 3, row: 19 }], hint: 'Z' },
        { piece: 'J', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 2, row: 18 }, { col: 2, row: 19 }], hint: 'J' },
      ],
    },
  ],
};

const I_SOLUTIONS: SolutionMap = {
  // I-hold index 0: Fake Butter DPC (1 solution, intermediate line clears)
  0: [
    {
      placements: [
        { piece: 'O', cells: [{ col: 7, row: 17 }, { col: 8, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }], hint: 'O' },
        { piece: 'S', cells: [{ col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }, { col: 2, row: 19 }], hint: 'S' },
        { piece: 'Z', cells: [{ col: 1, row: 16 }, { col: 2, row: 16 }, { col: 2, row: 17 }, { col: 3, row: 17 }], hint: 'Z' },
        { piece: 'T', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'I' },
        { piece: 'L', cells: [{ col: 8, row: 17 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'L' },
        { piece: 'J', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }, { col: 6, row: 19 }], hint: 'J' },
      ],
    },
  ],
  // I-hold index 1: Pelican DPC (2 solutions)
  1: [
    {
      placements: [
        { piece: 'L', cells: [{ col: 6, row: 16 }, { col: 7, row: 16 }, { col: 7, row: 17 }, { col: 7, row: 18 }], hint: 'L' },
        { piece: 'J', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 8, row: 18 }], hint: 'J' },
        { piece: 'Z', cells: [{ col: 1, row: 18 }, { col: 2, row: 18 }, { col: 2, row: 19 }, { col: 3, row: 19 }], hint: 'Z' },
        { piece: 'O', cells: [{ col: 1, row: 16 }, { col: 2, row: 16 }, { col: 1, row: 17 }, { col: 2, row: 17 }], hint: 'O' },
        { piece: 'S', cells: [{ col: 3, row: 17 }, { col: 3, row: 18 }, { col: 4, row: 18 }, { col: 4, row: 19 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'I' },
      ],
    },
    {
      placements: [
        { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'I' },
        { piece: 'T', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 17 }], hint: 'T' },
        { piece: 'L', cells: [{ col: 6, row: 16 }, { col: 7, row: 16 }, { col: 7, row: 17 }, { col: 7, row: 18 }], hint: 'L' },
        { piece: 'J', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 8, row: 18 }], hint: 'J' },
        { piece: 'S', cells: [{ col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }, { col: 2, row: 19 }], hint: 'S' },
        { piece: 'Z', cells: [{ col: 1, row: 16 }, { col: 2, row: 16 }, { col: 2, row: 17 }, { col: 3, row: 17 }], hint: 'Z' },
        { piece: 'O', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 3, row: 19 }, { col: 4, row: 19 }], hint: 'O' },
      ],
    },
  ],
  // I-hold index 2: Bad TKI DPC (2 solutions)
  2: [
    {
      placements: [
        { piece: 'T', cells: [{ col: 4, row: 16 }, { col: 3, row: 17 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }, { col: 3, row: 16 }], hint: 'I' },
        { piece: 'Z', cells: [{ col: 5, row: 16 }, { col: 6, row: 16 }, { col: 6, row: 17 }, { col: 7, row: 17 }], hint: 'Z' },
        { piece: 'S', cells: [{ col: 8, row: 17 }, { col: 8, row: 18 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'S' },
        { piece: 'J', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'J' },
        { piece: 'L', cells: [{ col: 0, row: 17 }, { col: 1, row: 17 }, { col: 2, row: 17 }, { col: 0, row: 18 }], hint: 'L' },
        { piece: 'O', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 3, row: 19 }, { col: 4, row: 19 }], hint: 'O' },
      ],
    },
    {
      placements: [
        { piece: 'J', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }], hint: 'J' },
        { piece: 'S', cells: [{ col: 2, row: 16 }, { col: 3, row: 16 }, { col: 1, row: 17 }, { col: 2, row: 17 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 4, row: 16 }, { col: 3, row: 17 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'T' },
        { piece: 'Z', cells: [{ col: 5, row: 16 }, { col: 6, row: 16 }, { col: 6, row: 17 }, { col: 7, row: 17 }], hint: 'Z' },
        { piece: 'L', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }, { col: 8, row: 18 }], hint: 'L' },
        { piece: 'I', cells: [{ col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'I' },
        { piece: 'O', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 3, row: 19 }, { col: 4, row: 19 }], hint: 'O' },
      ],
    },
  ],
  // I-hold index 3: Fake Butter DPC Mirror (1 solution, mirrored from I#0)
  3: [
    {
      placements: [
        { piece: 'O', cells: [{ col: 2, row: 17 }, { col: 1, row: 17 }, { col: 2, row: 18 }, { col: 1, row: 18 }], hint: 'O' },
        { piece: 'Z', cells: [{ col: 8, row: 17 }, { col: 8, row: 18 }, { col: 7, row: 18 }, { col: 7, row: 19 }], hint: 'Z' },
        { piece: 'S', cells: [{ col: 8, row: 16 }, { col: 7, row: 16 }, { col: 7, row: 17 }, { col: 6, row: 17 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 6, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'I' },
        { piece: 'J', cells: [{ col: 1, row: 17 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'J' },
        { piece: 'L', cells: [{ col: 3, row: 17 }, { col: 2, row: 17 }, { col: 3, row: 18 }, { col: 3, row: 19 }], hint: 'L' },
      ],
    },
  ],
  // I-hold index 4: Pelican DPC Mirror (2 solutions)
  4: [
    {
      placements: [
        { piece: 'L', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 1, row: 17 }, { col: 1, row: 18 }], hint: 'L' },
        { piece: 'J', cells: [{ col: 2, row: 16 }, { col: 3, row: 16 }, { col: 2, row: 17 }, { col: 2, row: 18 }], hint: 'J' },
        { piece: 'S', cells: [{ col: 7, row: 18 }, { col: 8, row: 18 }, { col: 6, row: 19 }, { col: 7, row: 19 }], hint: 'S' },
        { piece: 'O', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 7, row: 17 }, { col: 8, row: 17 }], hint: 'O' },
        { piece: 'Z', cells: [{ col: 6, row: 17 }, { col: 5, row: 18 }, { col: 6, row: 18 }, { col: 5, row: 19 }], hint: 'Z' },
        { piece: 'T', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }, { col: 5, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'I' },
      ],
    },
    {
      placements: [
        { piece: 'L', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 1, row: 17 }, { col: 1, row: 18 }], hint: 'L' },
        { piece: 'J', cells: [{ col: 2, row: 16 }, { col: 3, row: 16 }, { col: 2, row: 17 }, { col: 2, row: 18 }], hint: 'J' },
        { piece: 'T', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }, { col: 5, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'I' },
        { piece: 'Z', cells: [{ col: 8, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }, { col: 7, row: 19 }], hint: 'Z' },
        { piece: 'S', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 6, row: 17 }, { col: 7, row: 17 }], hint: 'S' },
        { piece: 'O', cells: [{ col: 5, row: 18 }, { col: 6, row: 18 }, { col: 5, row: 19 }, { col: 6, row: 19 }], hint: 'O' },
      ],
    },
  ],
  // I-hold index 5: Bad TKI DPC Mirror (2 solutions)
  5: [
    {
      placements: [
        { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'I' },
        { piece: 'J', cells: [{ col: 1, row: 16 }, { col: 2, row: 16 }, { col: 1, row: 17 }, { col: 1, row: 18 }], hint: 'J' },
        { piece: 'S', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 2, row: 17 }, { col: 3, row: 17 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 5, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'T' },
        { piece: 'Z', cells: [{ col: 6, row: 16 }, { col: 7, row: 16 }, { col: 7, row: 17 }, { col: 8, row: 17 }], hint: 'Z' },
        { piece: 'L', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }], hint: 'L' },
        { piece: 'O', cells: [{ col: 5, row: 18 }, { col: 6, row: 18 }, { col: 5, row: 19 }, { col: 6, row: 19 }], hint: 'O' },
      ],
    },
    {
      placements: [
        { piece: 'S', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 2, row: 17 }, { col: 3, row: 17 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 5, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'T' },
        { piece: 'I', cells: [{ col: 6, row: 16 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }], hint: 'I' },
        { piece: 'Z', cells: [{ col: 1, row: 17 }, { col: 0, row: 18 }, { col: 1, row: 18 }, { col: 0, row: 19 }], hint: 'Z' },
        { piece: 'L', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }, { col: 0, row: 17 }], hint: 'L' },
        { piece: 'J', cells: [{ col: 7, row: 17 }, { col: 8, row: 17 }, { col: 9, row: 17 }, { col: 9, row: 18 }], hint: 'J' },
        { piece: 'O', cells: [{ col: 5, row: 18 }, { col: 6, row: 18 }, { col: 5, row: 19 }, { col: 6, row: 19 }], hint: 'O' },
      ],
    },
  ],
};

const J_SOLUTIONS: SolutionMap = {
  // J-hold index 0: TSM J SPC (1 solution, 5-row PC)
  0: [
    {
      placements: [
        { piece: 'I', cells: [{ col: 0, row: 15 }, { col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }], hint: 'I' },
        { piece: 'J', cells: [{ col: 1, row: 15 }, { col: 2, row: 15 }, { col: 1, row: 16 }, { col: 1, row: 17 }], hint: 'J' },
        { piece: 'S', cells: [{ col: 3, row: 15 }, { col: 4, row: 15 }, { col: 2, row: 16 }, { col: 3, row: 16 }], hint: 'S' },
        { piece: 'L', cells: [{ col: 5, row: 15 }, { col: 6, row: 15 }, { col: 7, row: 15 }, { col: 5, row: 16 }], hint: 'L' },
        { piece: 'O', cells: [{ col: 8, row: 15 }, { col: 9, row: 15 }, { col: 8, row: 16 }, { col: 9, row: 16 }], hint: 'O' },
        { piece: 'Z', cells: [{ col: 6, row: 16 }, { col: 7, row: 16 }, { col: 7, row: 17 }, { col: 8, row: 17 }], hint: 'Z' },
        { piece: 'T', cells: [{ col: 6, row: 18 }, { col: 7, row: 18 }, { col: 8, row: 18 }, { col: 7, row: 19 }], hint: 'T' },
      ],
    },
  ],
};

const L_SOLUTIONS: SolutionMap = {
  // L-hold index 0: TSM J SPC Mirror (1 solution, 5-row PC)
  0: [
    {
      placements: [
        { piece: 'O', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 0, row: 16 }, { col: 1, row: 16 }], hint: 'O' },
        { piece: 'J', cells: [{ col: 2, row: 15 }, { col: 3, row: 15 }, { col: 4, row: 15 }, { col: 4, row: 16 }], hint: 'J' },
        { piece: 'Z', cells: [{ col: 5, row: 15 }, { col: 6, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }], hint: 'Z' },
        { piece: 'L', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 8, row: 16 }, { col: 8, row: 17 }], hint: 'L' },
        { piece: 'I', cells: [{ col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }], hint: 'I' },
        { piece: 'S', cells: [{ col: 2, row: 16 }, { col: 3, row: 16 }, { col: 1, row: 17 }, { col: 2, row: 17 }], hint: 'S' },
        { piece: 'T', cells: [{ col: 1, row: 18 }, { col: 2, row: 18 }, { col: 3, row: 18 }, { col: 2, row: 19 }], hint: 'T' },
      ],
    },
  ],
};

const SOLUTIONS_BY_HOLD: Partial<Record<PieceType, SolutionMap>> = {
  O: O_SOLUTIONS,
  S: S_SOLUTIONS,
  Z: Z_SOLUTIONS,
  I: I_SOLUTIONS,
  J: J_SOLUTIONS,
  L: L_SOLUTIONS,
};

// ── Getters ──

/**
 * Get the first bag 5 PC solution for a specific DPC variant.
 * Returns null if no PC exists for this variant.
 */
export function getBag5PcSolution(
  holdPiece: PieceType,
  dpcSolutionIndex: number,
): Bag5PcSolution | null {
  const solutions = SOLUTIONS_BY_HOLD[holdPiece]?.[dpcSolutionIndex];
  if (!solutions || solutions.length === 0) return null;
  return solutions[0]!;
}

/**
 * Get all bag 5 PC solutions for a specific DPC variant.
 * Returns empty array if no PC exists for this variant.
 */
export function getBag5PcSolutions(
  holdPiece: PieceType,
  dpcSolutionIndex: number,
): Bag5PcSolution[] {
  return SOLUTIONS_BY_HOLD[holdPiece]?.[dpcSolutionIndex] ?? [];
}
