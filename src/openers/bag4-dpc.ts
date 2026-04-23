/**
 * bag4-dpc.ts — DPC (T-Spin Double + Perfect Clear) solution data for bags 4-5.
 *
 * DPC is a continuation after the 8-line PC: board is empty, hold piece is
 * left over from bag 3. Place 7 setup pieces + T (TSD, clears 2 lines).
 * Bag 5 then clears the remaining 4 lines for a second PC.
 *
 * DPC solutions are keyed by holdPiece — the piece held going into DPC
 * (i.e., the holdPiece from the Bag 3 PC solution that was just completed).
 *
 * Data sources: johnbeak.cz/dpc/builds.php "Extra O" builds, cross-referenced
 * with tetristemplate.info/dpc-o/. Placement orders computed by buildSteps
 * (DFS backtracking with BFS reachability). All 6 setups BFS-validated via
 * replayPcSteps. Each TSD clears exactly 2 lines, leaving 12 cells.
 *
 * Parallel to bag3-pc.ts in structure.
 */

import type { PieceType } from '../core/types.ts';
import type { RawPlacement } from './placements.ts';

// ── Types ──

export interface DpcSolution {
  /** Human-readable name for this DPC variant. */
  name: string;
  /** The piece held going into DPC (the key for lookup). */
  holdPiece: PieceType;
  /** Ordered placements (7 setup + 1 TSD). Use with replayPcSteps(). */
  placements: RawPlacement[];
}

// ── O-hold DPC setups (3 shapes × 2 mirrors = 6 solutions) ──

const O_HOLD: DpcSolution[] = [
  {
    name: 'Type A',
    holdPiece: 'O',
    placements: [
      { piece: 'L', cells: [{ col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }, { col: 1, row: 19 }], hint: 'L left wall' },
      { piece: 'Z', cells: [{ col: 1, row: 18 }, { col: 2, row: 18 }, { col: 2, row: 19 }, { col: 3, row: 19 }], hint: 'Z bottom-left' },
      { piece: 'I', cells: [{ col: 5, row: 19 }, { col: 6, row: 19 }, { col: 7, row: 19 }, { col: 8, row: 19 }], hint: 'I bottom' },
      { piece: 'J', cells: [{ col: 7, row: 18 }, { col: 8, row: 18 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'J right' },
      { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O tower mid' },
      { piece: 'O', cells: [{ col: 8, row: 14 }, { col: 9, row: 14 }, { col: 8, row: 15 }, { col: 9, row: 15 }], hint: 'O tower top' },
      { piece: 'S', cells: [{ col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }, { col: 6, row: 18 }], hint: 'S center' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'T-Spin Double' },
    ],
  },
  {
    name: 'Type A Mirror',
    holdPiece: 'O',
    placements: [
      { piece: 'L', cells: [{ col: 0, row: 18 }, { col: 1, row: 18 }, { col: 2, row: 18 }, { col: 0, row: 19 }], hint: 'L bottom-left' },
      { piece: 'O', cells: [{ col: 0, row: 16 }, { col: 1, row: 16 }, { col: 0, row: 17 }, { col: 1, row: 17 }], hint: 'O tower mid' },
      { piece: 'O', cells: [{ col: 0, row: 14 }, { col: 1, row: 14 }, { col: 0, row: 15 }, { col: 1, row: 15 }], hint: 'O tower top' },
      { piece: 'I', cells: [{ col: 1, row: 19 }, { col: 2, row: 19 }, { col: 3, row: 19 }, { col: 4, row: 19 }], hint: 'I bottom' },
      { piece: 'J', cells: [{ col: 9, row: 17 }, { col: 9, row: 18 }, { col: 8, row: 19 }, { col: 9, row: 19 }], hint: 'J right wall' },
      { piece: 'S', cells: [{ col: 7, row: 18 }, { col: 8, row: 18 }, { col: 6, row: 19 }, { col: 7, row: 19 }], hint: 'S right' },
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 3, row: 17 }, { col: 4, row: 17 }, { col: 3, row: 18 }], hint: 'Z center' },
      { piece: 'T', cells: [{ col: 4, row: 18 }, { col: 5, row: 18 }, { col: 6, row: 18 }, { col: 5, row: 19 }], hint: 'T-Spin Double' },
    ],
  },
  {
    name: 'Type B',
    holdPiece: 'O',
    placements: [
      { piece: 'O', cells: [{ col: 6, row: 18 }, { col: 7, row: 18 }, { col: 6, row: 19 }, { col: 7, row: 19 }], hint: 'O right pair' },
      { piece: 'O', cells: [{ col: 8, row: 18 }, { col: 9, row: 18 }, { col: 8, row: 19 }, { col: 9, row: 19 }], hint: 'O far right' },
      { piece: 'I', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'I top-right' },
      { piece: 'L', cells: [{ col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }, { col: 1, row: 19 }], hint: 'L left wall' },
      { piece: 'S', cells: [{ col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }, { col: 2, row: 19 }], hint: 'S left' },
      { piece: 'Z', cells: [{ col: 5, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'Z center' },
      { piece: 'J', cells: [{ col: 0, row: 15 }, { col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }], hint: 'J top-left cap' },
      { piece: 'T', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 4, row: 17 }, { col: 3, row: 18 }], hint: 'T-Spin Double' },
    ],
  },
  {
    name: 'Type B variant',
    holdPiece: 'O',
    placements: [
      { piece: 'L', cells: [{ col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }, { col: 1, row: 19 }], hint: 'L left wall' },
      { piece: 'S', cells: [{ col: 1, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }, { col: 2, row: 19 }], hint: 'S left' },
      { piece: 'Z', cells: [{ col: 5, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'Z center' },
      { piece: 'I', cells: [{ col: 6, row: 19 }, { col: 7, row: 19 }, { col: 8, row: 19 }, { col: 9, row: 19 }], hint: 'I bottom' },
      { piece: 'O', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }, { col: 7, row: 18 }], hint: 'O right pair' },
      { piece: 'O', cells: [{ col: 8, row: 17 }, { col: 9, row: 17 }, { col: 8, row: 18 }, { col: 9, row: 18 }], hint: 'O far right' },
      { piece: 'J', cells: [{ col: 0, row: 15 }, { col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }], hint: 'J top-left cap' },
      { piece: 'T', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 4, row: 17 }, { col: 3, row: 18 }], hint: 'T-Spin Double' },
    ],
  },
  {
    name: 'Type C',
    holdPiece: 'O',
    placements: [
      { piece: 'O', cells: [{ col: 0, row: 18 }, { col: 1, row: 18 }, { col: 0, row: 19 }, { col: 1, row: 19 }], hint: 'O left pair' },
      { piece: 'O', cells: [{ col: 2, row: 18 }, { col: 3, row: 18 }, { col: 2, row: 19 }, { col: 3, row: 19 }], hint: 'O center-left' },
      { piece: 'I', cells: [{ col: 0, row: 17 }, { col: 1, row: 17 }, { col: 2, row: 17 }, { col: 3, row: 17 }], hint: 'I top-left' },
      { piece: 'S', cells: [{ col: 4, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 5, row: 19 }], hint: 'S center' },
      { piece: 'J', cells: [{ col: 9, row: 17 }, { col: 9, row: 18 }, { col: 8, row: 19 }, { col: 9, row: 19 }], hint: 'J right wall' },
      { piece: 'Z', cells: [{ col: 8, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }, { col: 7, row: 19 }], hint: 'Z right' },
      { piece: 'L', cells: [{ col: 9, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }], hint: 'L top-right cap' },
      { piece: 'T', cells: [{ col: 5, row: 17 }, { col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }], hint: 'T-Spin Double' },
    ],
  },
  {
    name: 'Type C variant',
    holdPiece: 'O',
    placements: [
      { piece: 'I', cells: [{ col: 0, row: 19 }, { col: 1, row: 19 }, { col: 2, row: 19 }, { col: 3, row: 19 }], hint: 'I bottom' },
      { piece: 'S', cells: [{ col: 4, row: 17 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 5, row: 19 }], hint: 'S center' },
      { piece: 'J', cells: [{ col: 9, row: 17 }, { col: 9, row: 18 }, { col: 8, row: 19 }, { col: 9, row: 19 }], hint: 'J right wall' },
      { piece: 'Z', cells: [{ col: 8, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }, { col: 7, row: 19 }], hint: 'Z right' },
      { piece: 'O', cells: [{ col: 0, row: 17 }, { col: 1, row: 17 }, { col: 0, row: 18 }, { col: 1, row: 18 }], hint: 'O left pair' },
      { piece: 'O', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 2, row: 18 }, { col: 3, row: 18 }], hint: 'O center-left' },
      { piece: 'L', cells: [{ col: 9, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }], hint: 'L top-right cap' },
      { piece: 'T', cells: [{ col: 5, row: 17 }, { col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }], hint: 'T-Spin Double' },
    ],
  },
];

// ── Data lookup ──

const DPC_DATA: Partial<Record<PieceType, DpcSolution[]>> = {
  O: O_HOLD,
};

// ── Getter ──

/**
 * Get DPC solutions for a given holdPiece after PC.
 * Returns an empty array if no DPC solutions exist for that hold piece.
 */
export function getDpcSolutions(holdPiece: PieceType): DpcSolution[] {
  return DPC_DATA[holdPiece] ?? [];
}
