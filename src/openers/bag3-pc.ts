/**
 * bag3-pc.ts — Bag 3 Perfect Clear (PC) solution data.
 *
 * Each solution is an ORDERED Placement[] — order matters because intermediate
 * line clears shift the board. Use replayPcSteps() to replay, NOT buildSteps().
 *
 * Data sources:
 *   Routes 0-2 (standard post-TST shape): johnbeak.cz fumens via row-mapped solver.
 *   Routes 3-7 (fallback post-TST shapes): computed by bitmask tiling solver +
 *     BFS reachability verification + replayPcSteps confirmation (probe-hc-pc-solve3.ts).
 *
 * PC solutions are ROUTE-SPECIFIC — different Bag 2 routes produce different
 * post-TST board shapes. Routes 0-2 share the same shape and thus the same
 * solutions; routes 3-7 each have a unique shape with its own solution set.
 *
 * Mirror solutions derived by horizontal flip + piece swap (L↔J, S↔Z).
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

// ── Honey Cup PC solutions ──

// Routes 0-2: standard post-TST shape (row 15 empty, 4-piece cap at row 16).
// 4 solutions from johnbeak.cz fumen.
const HC_STANDARD: PcSolution[] = [
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

// Route 3 (fb_l_top_left): L extends into row 15. Hold=I.
const HC_ROUTE3: PcSolution[] = [
  {
    holdPiece: 'I',
    placements: [
      { piece: 'Z', cells: [{ col: 5, row: 16 }, { col: 6, row: 15 }, { col: 6, row: 16 }, { col: 5, row: 17 }], hint: 'Z vertical, cols 5-6' },
      { piece: 'O', cells: [{ col: 2, row: 15 }, { col: 3, row: 15 }, { col: 2, row: 16 }, { col: 3, row: 16 }], hint: 'O, cols 2-3' },
      { piece: 'J', cells: [{ col: 4, row: 15 }, { col: 5, row: 15 }, { col: 4, row: 16 }, { col: 4, row: 17 }], hint: 'J vertical, cols 4-5' },
      { piece: 'S', cells: [{ col: 7, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }], hint: 'S vertical, cols 7-8' },
      { piece: 'L', cells: [{ col: 8, row: 15 }, { col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'L vertical, cols 8-9' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'T fills gap' },
    ],
  },
];

// Route 4 (fb_j_top_right): J extends into row 15. Hold=S or Hold=Z.
const HC_ROUTE4: PcSolution[] = [
  {
    holdPiece: 'S',
    placements: [
      { piece: 'Z', cells: [{ col: 5, row: 16 }, { col: 6, row: 15 }, { col: 6, row: 16 }, { col: 5, row: 17 }], hint: 'Z vertical, cols 5-6' },
      { piece: 'I', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 2, row: 15 }, { col: 3, row: 15 }], hint: 'I horizontal, row 15' },
      { piece: 'J', cells: [{ col: 4, row: 15 }, { col: 5, row: 15 }, { col: 4, row: 16 }, { col: 4, row: 17 }], hint: 'J vertical, cols 4-5' },
      { piece: 'O', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }], hint: 'O, cols 7-8' },
      { piece: 'L', cells: [{ col: 1, row: 16 }, { col: 2, row: 16 }, { col: 3, row: 16 }, { col: 1, row: 17 }], hint: 'L flat, cols 1-3' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'T fills gap' },
    ],
  },
  {
    holdPiece: 'Z',
    placements: [
      { piece: 'L', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 1, row: 16 }, { col: 1, row: 17 }], hint: 'L vertical, cols 0-1' },
      { piece: 'J', cells: [{ col: 2, row: 15 }, { col: 2, row: 16 }, { col: 3, row: 16 }, { col: 4, row: 16 }], hint: 'J flat, cols 2-4' },
      { piece: 'I', cells: [{ col: 3, row: 15 }, { col: 4, row: 15 }, { col: 5, row: 15 }, { col: 6, row: 15 }], hint: 'I horizontal, row 15' },
      { piece: 'O', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }], hint: 'O, cols 7-8' },
      { piece: 'S', cells: [{ col: 5, row: 16 }, { col: 6, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'S flat, cols 4-6' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'T fills gap' },
    ],
  },
];

// Route 5 (fb_s_early): S extends into rows 15-16. Hold=S.
const HC_ROUTE5: PcSolution[] = [
  {
    holdPiece: 'S',
    placements: [
      { piece: 'J', cells: [{ col: 0, row: 15 }, { col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }], hint: 'J flat, cols 0-2' },
      { piece: 'I', cells: [{ col: 1, row: 15 }, { col: 2, row: 15 }, { col: 3, row: 15 }, { col: 4, row: 15 }], hint: 'I horizontal, row 15' },
      { piece: 'O', cells: [{ col: 5, row: 15 }, { col: 6, row: 15 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'O, cols 5-6' },
      { piece: 'L', cells: [{ col: 8, row: 15 }, { col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'L vertical, cols 8-9' },
      { piece: 'Z', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'Z flat, cols 3-5' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'T fills gap' },
    ],
  },
];

// Route 6 (fb_o_top_left): O in rows 15-16, I vertical. Hold=S.
const HC_ROUTE6: PcSolution[] = [
  {
    holdPiece: 'S',
    placements: [
      { piece: 'Z', cells: [{ col: 5, row: 16 }, { col: 6, row: 15 }, { col: 6, row: 16 }, { col: 5, row: 17 }], hint: 'Z vertical, cols 5-6' },
      { piece: 'O', cells: [{ col: 2, row: 15 }, { col: 3, row: 15 }, { col: 2, row: 16 }, { col: 3, row: 16 }], hint: 'O, cols 2-3' },
      { piece: 'J', cells: [{ col: 4, row: 15 }, { col: 5, row: 15 }, { col: 4, row: 16 }, { col: 4, row: 17 }], hint: 'J vertical, cols 4-5' },
      { piece: 'I', cells: [{ col: 7, row: 15 }, { col: 7, row: 16 }, { col: 7, row: 17 }, { col: 7, row: 18 }], hint: 'I vertical, col 7' },
      { piece: 'L', cells: [{ col: 8, row: 15 }, { col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'L vertical, cols 8-9' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'T fills gap' },
    ],
  },
];

// Route 7 (fb_i_center): I+L vertical on right. Hold=O.
const HC_ROUTE7: PcSolution[] = [
  {
    holdPiece: 'O',
    placements: [
      { piece: 'J', cells: [{ col: 0, row: 15 }, { col: 0, row: 16 }, { col: 1, row: 16 }, { col: 2, row: 16 }], hint: 'J flat, cols 0-2' },
      { piece: 'I', cells: [{ col: 1, row: 15 }, { col: 2, row: 15 }, { col: 3, row: 15 }, { col: 4, row: 15 }], hint: 'I horizontal, row 15' },
      { piece: 'L', cells: [{ col: 5, row: 15 }, { col: 6, row: 15 }, { col: 7, row: 15 }, { col: 5, row: 16 }], hint: 'L flat, cols 5-7' },
      { piece: 'S', cells: [{ col: 8, row: 15 }, { col: 9, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }], hint: 'S flat, cols 7-9' },
      { piece: 'Z', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'Z flat, cols 3-5' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'T fills gap' },
    ],
  },
];

// ── Route-keyed lookup ──

type RoutePcMap = Record<number, PcSolution[]>;

const HC_PC_BY_ROUTE: RoutePcMap = {
  0: HC_STANDARD,
  1: HC_STANDARD,
  2: HC_STANDARD,
  3: HC_ROUTE3,
  4: HC_ROUTE4,
  5: HC_ROUTE5,
  6: HC_ROUTE6,
  7: HC_ROUTE7,
};

const PC_DATA: Partial<Record<OpenerID, RoutePcMap>> = {
  honey_cup: HC_PC_BY_ROUTE,
};

// ── Getter ──

export function getPcSolutions(opener: OpenerID, mirror: boolean, routeIndex: number): PcSolution[] {
  const routeMap = PC_DATA[opener];
  if (!routeMap) return [];
  const solutions = routeMap[routeIndex];
  if (!solutions) return [];
  if (!mirror) return solutions;
  return solutions.map(mirrorSolution);
}
