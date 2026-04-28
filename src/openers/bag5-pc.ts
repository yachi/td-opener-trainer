/**
 * bag5-pc.ts — Bag 5 Perfect Clear solution data (completes the DPC cycle).
 *
 * After DPC TSD fires (8 placements, 2 lines cleared), 12 cells remain.
 * Bag 5 = 7 new pieces (28 cells) fills exactly 4 rows (40 total) for PC.
 * Hold is empty after DPC (all 8 pieces used), so all 7 must be placed.
 *
 * Solutions computed by target-row-filtered DFS with intermediate line clears
 * + BFS reachability verification via replayPcSteps (probe-bag5-pc-v4.ts).
 *
 * 8/16 DPC variants have exactly 1 bag 5 PC solution.
 * 8/16 have no PC: Lime DPC (S/Z), Bad TKI (I), mirrored Fake Butter/Pelican/
 *   Bad TKI (I), TSM J SPC (J/L).
 *
 * Shared boards: O-Kuruma = S-Kuruma, O-Kuruma Mirror = Z-Kuruma Mirror.
 * Mirror derivation: O/I self-mirrors stored explicitly (different source boards).
 * S→Z and J→L mirrors not needed (J/L have no PC; S-Kuruma shares O-Kuruma's board
 * so we store S explicitly for simplicity).
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

type SolutionMap = Record<number, Bag5PcSolution>;

const O_SOLUTIONS: SolutionMap = {
  // O-hold index 0: Kuruma DPC
  0: {
    placements: [
      { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O' },
      { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'I' },
      { piece: 'Z', cells: [{ col: 5, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'Z' },
      { piece: 'S', cells: [{ col: 4, row: 17 }, { col: 5, row: 17 }, { col: 3, row: 18 }, { col: 4, row: 18 }], hint: 'S' },
      { piece: 'T', cells: [{ col: 2, row: 18 }, { col: 1, row: 19 }, { col: 2, row: 19 }, { col: 3, row: 19 }], hint: 'T' },
      { piece: 'L', cells: [{ col: 1, row: 17 }, { col: 2, row: 17 }, { col: 3, row: 17 }, { col: 1, row: 18 }], hint: 'L' },
      { piece: 'J', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }, { col: 6, row: 19 }], hint: 'J' },
    ],
  },
  // O-hold index 1: TSD DPC
  1: {
    placements: [
      { piece: 'O', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }, { col: 7, row: 18 }], hint: 'O' },
      { piece: 'Z', cells: [{ col: 0, row: 17 }, { col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }], hint: 'Z' },
      { piece: 'S', cells: [{ col: 4, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 5, row: 19 }], hint: 'S' },
      { piece: 'T', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }, { col: 5, row: 17 }], hint: 'T' },
      { piece: 'L', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 3, row: 18 }, { col: 3, row: 19 }], hint: 'L' },
      { piece: 'I', cells: [{ col: 0, row: 18 }, { col: 1, row: 18 }, { col: 2, row: 18 }, { col: 3, row: 18 }], hint: 'I' },
      { piece: 'J', cells: [{ col: 7, row: 18 }, { col: 8, row: 18 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'J' },
    ],
  },
  // O-hold index 2: Kuruma DPC (Mirror)
  2: {
    placements: [
      { piece: 'O', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 0, row: 17 }, { col: 1, row: 17 }], hint: 'O' },
      { piece: 'I', cells: [{ col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'I' },
      { piece: 'S', cells: [{ col: 4, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 5, row: 19 }], hint: 'S' },
      { piece: 'Z', cells: [{ col: 4, row: 17 }, { col: 5, row: 17 }, { col: 5, row: 18 }, { col: 6, row: 18 }], hint: 'Z' },
      { piece: 'T', cells: [{ col: 7, row: 18 }, { col: 6, row: 19 }, { col: 7, row: 19 }, { col: 8, row: 19 }], hint: 'T' },
      { piece: 'L', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 3, row: 18 }, { col: 3, row: 19 }], hint: 'L' },
      { piece: 'J', cells: [{ col: 6, row: 18 }, { col: 7, row: 18 }, { col: 8, row: 18 }, { col: 8, row: 19 }], hint: 'J' },
    ],
  },
  // O-hold index 3: TSD DPC (Mirror)
  3: {
    placements: [
      { piece: 'O', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 2, row: 18 }, { col: 3, row: 18 }], hint: 'O' },
      { piece: 'S', cells: [{ col: 8, row: 17 }, { col: 9, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }], hint: 'S' },
      { piece: 'Z', cells: [{ col: 5, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'Z' },
      { piece: 'T', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 17 }], hint: 'T' },
      { piece: 'J', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }, { col: 6, row: 19 }], hint: 'J' },
      { piece: 'I', cells: [{ col: 6, row: 18 }, { col: 7, row: 18 }, { col: 8, row: 18 }, { col: 9, row: 18 }], hint: 'I' },
      { piece: 'L', cells: [{ col: 0, row: 18 }, { col: 1, row: 18 }, { col: 2, row: 18 }, { col: 0, row: 19 }], hint: 'L' },
    ],
  },
};

const S_SOLUTIONS: SolutionMap = {
  // S-hold index 0: Kuruma DPC (same post-TSD board as O-hold Kuruma)
  0: O_SOLUTIONS[0]!,
  // S-hold index 1: Lime DPC — no PC
};

const Z_SOLUTIONS: SolutionMap = {
  // Z-hold index 0: Kuruma DPC Mirror (same post-TSD board as O-hold Kuruma Mirror)
  0: O_SOLUTIONS[2]!,
  // Z-hold index 1: Lime DPC Mirror — no PC
};

const I_SOLUTIONS: SolutionMap = {
  // I-hold index 0: Fake Butter DPC
  0: {
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
  // I-hold index 1: Pelican DPC
  1: {
    placements: [
      { piece: 'O', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 3, row: 19 }, { col: 4, row: 19 }], hint: 'O' },
      { piece: 'S', cells: [{ col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }, { col: 2, row: 19 }], hint: 'S' },
      { piece: 'Z', cells: [{ col: 1, row: 16 }, { col: 2, row: 16 }, { col: 2, row: 17 }, { col: 3, row: 17 }], hint: 'Z' },
      { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'I' },
      { piece: 'T', cells: [{ col: 3, row: 17 }, { col: 4, row: 17 }, { col: 5, row: 17 }, { col: 4, row: 18 }], hint: 'T' },
      { piece: 'L', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 7, row: 18 }, { col: 7, row: 19 }], hint: 'L' },
      { piece: 'J', cells: [{ col: 8, row: 17 }, { col: 9, row: 17 }, { col: 8, row: 18 }, { col: 8, row: 19 }], hint: 'J' },
    ],
  },
  // I-hold index 2: Bad TKI DPC — no PC
  // I-hold index 3: Fake Butter DPC (Mirror) — no PC
  // I-hold index 4: Pelican DPC (Mirror) — no PC
  // I-hold index 5: Bad TKI DPC (Mirror) — no PC
};

// J-hold (TSM J SPC): 22 remaining cells, no PC possible
// L-hold (TSM J SPC Mirror): 22 remaining cells, no PC possible

const SOLUTIONS_BY_HOLD: Partial<Record<PieceType, SolutionMap>> = {
  O: O_SOLUTIONS,
  S: S_SOLUTIONS,
  Z: Z_SOLUTIONS,
  I: I_SOLUTIONS,
};

// ── Getter ──

/**
 * Get the bag 5 PC solution for a specific DPC variant.
 * Returns null if no PC exists for this variant.
 */
export function getBag5PcSolution(
  holdPiece: PieceType,
  dpcSolutionIndex: number,
): Bag5PcSolution | null {
  const map = SOLUTIONS_BY_HOLD[holdPiece];
  if (!map) return null;
  return map[dpcSolutionIndex] ?? null;
}
