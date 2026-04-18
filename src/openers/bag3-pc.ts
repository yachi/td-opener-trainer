/**
 * bag3-pc.ts — Bag 3 Perfect Clear (PC) solution data.
 *
 * Each solution is an ORDERED Placement[] — order matters because intermediate
 * line clears shift the board. Use replayPcSteps() to replay, NOT buildSteps().
 *
 * Data generated offline from johnbeak.cz fumens via row-mapped solver.
 * Mirror solutions derived by horizontal flip + piece swap (L↔J, S↔Z).
 *
 * Scoped to Honey Cup for now; other openers will follow the same pattern.
 */

import type { PieceType } from '../core/types.ts';
import { BOARD_WIDTH } from '../core/types.ts';
import type { RawPlacement } from './placements.ts';
import { mirrorPiece } from './placements.ts';
import type { OpenerID } from './types.ts';

// ── Types ──

export interface PcSolution {
  /** The piece held during PC (not placed — 7th type). */
  holdPiece: PieceType;
  /** Ordered placements. Use with replayPcSteps(), not buildSteps(). */
  placements: RawPlacement[];
}

// ── Mirror helper ──

function mirrorSolution(sol: PcSolution): PcSolution {
  return {
    holdPiece: mirrorPiece(sol.holdPiece),
    placements: sol.placements.map(p => ({
      piece: mirrorPiece(p.piece),
      cells: p.cells.map(c => ({ col: BOARD_WIDTH - 1 - c.col, row: c.row })),
      hint: p.hint,
    })),
  };
}

// ── Honey Cup PC solutions (4 standard, from johnbeak.cz fumen) ──
// Post-TST board: 26 cells in rows 15-19, shared by all HC routes.
// Each uses 6 of 7 bag pieces; holdPiece is the unused 7th.

const HONEY_CUP_PC: PcSolution[] = [
  {
    holdPiece: 'S',
    placements: [
      { piece: 'I', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 2, row: 15 }, { col: 3, row: 15 }], hint: 'I horizontal, row 15' },
      { piece: 'Z', cells: [{ col: 6, row: 15 }, { col: 6, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }], hint: 'Z vertical, cols 5-6' },
      { piece: 'J', cells: [{ col: 4, row: 15 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 15 }], hint: 'J vertical, cols 4-5' },
      { piece: 'L', cells: [{ col: 7, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 15 }, { col: 9, row: 15 }], hint: 'L flat, cols 7-9' },
      { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }, { col: 9, row: 16 }], hint: 'O, cols 8-9' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 4, row: 19 }, { col: 5, row: 18 }], hint: 'T fills gap (clears 2)' },
    ],
  },
  {
    holdPiece: 'O',
    placements: [
      { piece: 'I', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 2, row: 15 }, { col: 3, row: 15 }], hint: 'I horizontal, row 15' },
      { piece: 'S', cells: [{ col: 5, row: 16 }, { col: 5, row: 17 }, { col: 4, row: 17 }, { col: 6, row: 16 }], hint: 'S vertical, cols 4-6' },
      { piece: 'L', cells: [{ col: 4, row: 15 }, { col: 4, row: 16 }, { col: 5, row: 15 }, { col: 6, row: 15 }], hint: 'L flat, cols 4-6' },
      { piece: 'Z', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'Z flat, cols 7-9' },
      { piece: 'J', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'J flat, cols 7-9 (post-clear)' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 4, row: 19 }, { col: 5, row: 18 }], hint: 'T fills gap (clears 2)' },
    ],
  },
  {
    holdPiece: 'O',
    placements: [
      { piece: 'I', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 2, row: 15 }, { col: 3, row: 15 }], hint: 'I horizontal, row 15' },
      { piece: 'Z', cells: [{ col: 6, row: 15 }, { col: 6, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }], hint: 'Z vertical, cols 5-6' },
      { piece: 'J', cells: [{ col: 4, row: 15 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 15 }], hint: 'J vertical, cols 4-5' },
      { piece: 'S', cells: [{ col: 7, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }], hint: 'S vertical, cols 7-8' },
      { piece: 'L', cells: [{ col: 8, row: 15 }, { col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'L vertical, cols 8-9' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 4, row: 19 }, { col: 5, row: 18 }], hint: 'T fills gap (clears 2)' },
    ],
  },
  {
    holdPiece: 'Z',
    placements: [
      { piece: 'I', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 2, row: 15 }, { col: 3, row: 15 }], hint: 'I horizontal, row 15' },
      { piece: 'J', cells: [{ col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }, { col: 8, row: 17 }], hint: 'J vertical, cols 8-9' },
      { piece: 'O', cells: [{ col: 7, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 15 }], hint: 'O, cols 7-8' },
      { piece: 'S', cells: [{ col: 5, row: 16 }, { col: 5, row: 17 }, { col: 4, row: 17 }, { col: 6, row: 16 }], hint: 'S vertical, cols 4-6' },
      { piece: 'L', cells: [{ col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'L flat, cols 4-6 (post-clear)' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 4, row: 19 }, { col: 5, row: 18 }], hint: 'T fills gap (clears 2)' },
    ],
  },
];

// ── Getter ──

const PC_DATA: Partial<Record<OpenerID, PcSolution[]>> = {
  honey_cup: HONEY_CUP_PC,
};

export function getPcSolutions(opener: OpenerID, mirror: boolean): PcSolution[] {
  const solutions = PC_DATA[opener];
  if (!solutions) return [];
  if (!mirror) return solutions;
  return solutions.map(mirrorSolution);
}
