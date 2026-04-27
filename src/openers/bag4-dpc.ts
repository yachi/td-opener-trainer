/**
 * bag4-dpc.ts — DPC (T-Spin Double + Perfect Clear) solution data for bags 4-5.
 *
 * DPC is a continuation after the 8-line PC: board is empty, hold piece is
 * left over from bag 3. Place 7 setup pieces + T (TSD, clears 2 lines).
 * Bag 5 then clears the remaining 4 lines for a second PC.
 *
 * DPC solutions are keyed by holdPiece — the piece held going into DPC.
 * Normal setups stored for O, S, I, J. Mirrors derived at runtime:
 *   Z-hold = mirror(S-hold), L-hold = mirror(J-hold)
 *   O-hold and I-hold include both normal + self-mirror variants.
 *
 * Data source: Hard Drop wiki — https://harddrop.com/wiki/DPC_Setups
 * Placement orders computed by buildSteps (DFS backtracking + BFS pruning).
 * All setups BFS-validated via replayPcSteps. TSD setups clear 2 lines,
 * leaving 12 cells for bag 5 to complete PC.
 *
 * Parallel to bag3-pc.ts in structure.
 */

import type { PieceType } from '../core/types.ts';
import { BOARD_WIDTH } from '../core/types.ts';
import type { RawPlacement } from './placements.ts';
import { mirrorPiece, MIRROR_PIECE_MAP } from './placements.ts';

// ── Types ──

export interface DpcSolution {
  /** Human-readable name for this DPC variant. */
  name: string;
  /** The piece held going into DPC (the key for lookup). */
  holdPiece: PieceType;
  /** Ordered placements (7 setup + 1 TSD). Use with replayPcSteps(). */
  placements: RawPlacement[];
}

// ── Mirror helper ──

function mirrorDpcSolution(sol: DpcSolution): DpcSolution {
  return {
    name: `${sol.name} (Mirror)`,
    holdPiece: mirrorPiece(sol.holdPiece),
    placements: sol.placements.map(p => ({
      piece: mirrorPiece(p.piece),
      cells: p.cells.map(c => ({ col: BOARD_WIDTH - 1 - c.col, row: c.row })),
      hint: p.hint,
    })),
  };
}

// ── O-hold DPC setups (2 normals, source: Hard Drop wiki) ──

const O_NORMALS: DpcSolution[] = [
  {
    name: 'Kuruma DPC',
    holdPiece: 'O',
    placements: [
      { piece: 'I', cells: [{ col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'I' },
      { piece: 'J', cells: [{ col: 3, row: 17 }, { col: 4, row: 17 }, { col: 3, row: 18 }, { col: 3, row: 19 }], hint: 'J' },
      { piece: 'O', cells: [{ col: 1, row: 18 }, { col: 2, row: 18 }, { col: 1, row: 19 }, { col: 2, row: 19 }], hint: 'O (bag)' },
      { piece: 'L', cells: [{ col: 0, row: 17 }, { col: 1, row: 17 }, { col: 2, row: 17 }, { col: 0, row: 18 }], hint: 'L' },
      { piece: 'O', cells: [{ col: 7, row: 18 }, { col: 8, row: 18 }, { col: 7, row: 19 }, { col: 8, row: 19 }], hint: 'O (hold)' },
      { piece: 'S', cells: [{ col: 7, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }], hint: 'S' },
      { piece: 'Z', cells: [{ col: 4, row: 18 }, { col: 5, row: 18 }, { col: 5, row: 19 }, { col: 6, row: 19 }], hint: 'Z' },
      { piece: 'T', cells: [{ col: 5, row: 17 }, { col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }], hint: 'T-Spin Double' },
    ],
  },
  {
    name: 'TSD DPC',
    holdPiece: 'O',
    placements: [
      { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'I' },
      { piece: 'L', cells: [{ col: 1, row: 17 }, { col: 1, row: 18 }, { col: 1, row: 19 }, { col: 2, row: 19 }], hint: 'L' },
      { piece: 'O', cells: [{ col: 2, row: 17 }, { col: 3, row: 17 }, { col: 2, row: 18 }, { col: 3, row: 18 }], hint: 'O (bag)' },
      { piece: 'O', cells: [{ col: 8, row: 18 }, { col: 9, row: 18 }, { col: 8, row: 19 }, { col: 9, row: 19 }], hint: 'O (hold)' },
      { piece: 'S', cells: [{ col: 8, row: 15 }, { col: 8, row: 16 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'S' },
      { piece: 'J', cells: [{ col: 4, row: 17 }, { col: 5, row: 17 }, { col: 4, row: 18 }, { col: 4, row: 19 }], hint: 'J' },
      { piece: 'Z', cells: [{ col: 5, row: 18 }, { col: 6, row: 18 }, { col: 6, row: 19 }, { col: 7, row: 19 }], hint: 'Z' },
      { piece: 'T', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 8, row: 17 }, { col: 7, row: 18 }], hint: 'T-Spin Double' },
    ],
  },
];

// ── S-hold DPC setups (2 normals; Z-hold = mirror of these) ──

const S_NORMALS: DpcSolution[] = [
  {
    name: 'Kuruma DPC',
    holdPiece: 'S',
    placements: [
      { piece: 'S', cells: [{ col: 0, row: 17 }, { col: 0, row: 18 }, { col: 1, row: 18 }, { col: 1, row: 19 }], hint: 'S (hold)' },
      { piece: 'I', cells: [{ col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'I' },
      { piece: 'L', cells: [{ col: 1, row: 17 }, { col: 2, row: 17 }, { col: 2, row: 18 }, { col: 2, row: 19 }], hint: 'L' },
      { piece: 'J', cells: [{ col: 3, row: 17 }, { col: 4, row: 17 }, { col: 3, row: 18 }, { col: 3, row: 19 }], hint: 'J' },
      { piece: 'Z', cells: [{ col: 4, row: 18 }, { col: 5, row: 18 }, { col: 5, row: 19 }, { col: 6, row: 19 }], hint: 'Z' },
      { piece: 'O', cells: [{ col: 7, row: 18 }, { col: 8, row: 18 }, { col: 7, row: 19 }, { col: 8, row: 19 }], hint: 'O' },
      { piece: 'S', cells: [{ col: 7, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }], hint: 'S (bag)' },
      { piece: 'T', cells: [{ col: 5, row: 17 }, { col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }], hint: 'T-Spin Double' },
    ],
  },
  {
    name: 'Lime DPC',
    holdPiece: 'S',
    placements: [
      { piece: 'I', cells: [{ col: 0, row: 16 }, { col: 0, row: 17 }, { col: 0, row: 18 }, { col: 0, row: 19 }], hint: 'I' },
      { piece: 'S', cells: [{ col: 5, row: 18 }, { col: 6, row: 18 }, { col: 4, row: 19 }, { col: 5, row: 19 }], hint: 'S (hold)' },
      { piece: 'S', cells: [{ col: 4, row: 17 }, { col: 5, row: 17 }, { col: 3, row: 18 }, { col: 4, row: 18 }], hint: 'S (bag)' },
      { piece: 'O', cells: [{ col: 3, row: 15 }, { col: 4, row: 15 }, { col: 3, row: 16 }, { col: 4, row: 16 }], hint: 'O' },
      { piece: 'Z', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 7, row: 18 }, { col: 8, row: 18 }], hint: 'Z' },
      { piece: 'L', cells: [{ col: 8, row: 17 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'L' },
      { piece: 'J', cells: [{ col: 1, row: 18 }, { col: 1, row: 19 }, { col: 2, row: 19 }, { col: 3, row: 19 }], hint: 'J' },
      { piece: 'T', cells: [{ col: 1, row: 17 }, { col: 2, row: 17 }, { col: 3, row: 17 }, { col: 2, row: 18 }], hint: 'T-Spin Double' },
    ],
  },
];

// ── I-hold DPC setups (3 normals, source: Hard Drop wiki) ──

const I_NORMALS: DpcSolution[] = [
  {
    name: 'Fake Butter DPC',
    holdPiece: 'I',
    placements: [
      { piece: 'S', cells: [{ col: 0, row: 17 }, { col: 0, row: 18 }, { col: 1, row: 18 }, { col: 1, row: 19 }], hint: 'S' },
      { piece: 'Z', cells: [{ col: 4, row: 17 }, { col: 3, row: 18 }, { col: 4, row: 18 }, { col: 3, row: 19 }], hint: 'Z' },
      { piece: 'L', cells: [{ col: 5, row: 15 }, { col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }], hint: 'L' },
      { piece: 'I', cells: [{ col: 4, row: 19 }, { col: 5, row: 19 }, { col: 6, row: 19 }, { col: 7, row: 19 }], hint: 'I (hold)' },
      { piece: 'J', cells: [{ col: 5, row: 17 }, { col: 5, row: 18 }, { col: 6, row: 18 }, { col: 7, row: 18 }], hint: 'J' },
      { piece: 'O', cells: [{ col: 8, row: 18 }, { col: 9, row: 18 }, { col: 8, row: 19 }, { col: 9, row: 19 }], hint: 'O' },
      { piece: 'I', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'I (bag)' },
      { piece: 'T', cells: [{ col: 1, row: 17 }, { col: 2, row: 17 }, { col: 3, row: 17 }, { col: 2, row: 18 }], hint: 'T-Spin Double' },
    ],
  },
  {
    name: 'Pelican DPC',
    holdPiece: 'I',
    placements: [
      { piece: 'I', cells: [{ col: 6, row: 19 }, { col: 7, row: 19 }, { col: 8, row: 19 }, { col: 9, row: 19 }], hint: 'I (hold)' },
      { piece: 'I', cells: [{ col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }], hint: 'I (bag)' },
      { piece: 'S', cells: [{ col: 0, row: 17 }, { col: 0, row: 18 }, { col: 1, row: 18 }, { col: 1, row: 19 }], hint: 'S' },
      { piece: 'Z', cells: [{ col: 1, row: 17 }, { col: 2, row: 17 }, { col: 2, row: 18 }, { col: 3, row: 18 }], hint: 'Z' },
      { piece: 'J', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 8, row: 17 }, { col: 8, row: 18 }], hint: 'J' },
      { piece: 'O', cells: [{ col: 5, row: 15 }, { col: 6, row: 15 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'O' },
      { piece: 'L', cells: [{ col: 5, row: 18 }, { col: 6, row: 18 }, { col: 7, row: 18 }, { col: 5, row: 19 }], hint: 'L' },
      { piece: 'T', cells: [{ col: 3, row: 17 }, { col: 4, row: 17 }, { col: 5, row: 17 }, { col: 4, row: 18 }], hint: 'T-Spin Double' },
    ],
  },
  {
    name: 'Bad TKI DPC',
    holdPiece: 'I',
    placements: [
      { piece: 'S', cells: [{ col: 8, row: 17 }, { col: 8, row: 18 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'S' },
      { piece: 'I', cells: [{ col: 5, row: 19 }, { col: 6, row: 19 }, { col: 7, row: 19 }, { col: 8, row: 19 }], hint: 'I (bag)' },
      { piece: 'O', cells: [{ col: 6, row: 17 }, { col: 7, row: 17 }, { col: 6, row: 18 }, { col: 7, row: 18 }], hint: 'O' },
      { piece: 'L', cells: [{ col: 5, row: 16 }, { col: 6, row: 16 }, { col: 7, row: 16 }, { col: 5, row: 17 }], hint: 'L' },
      { piece: 'I', cells: [{ col: 0, row: 19 }, { col: 1, row: 19 }, { col: 2, row: 19 }, { col: 3, row: 19 }], hint: 'I (hold)' },
      { piece: 'Z', cells: [{ col: 1, row: 16 }, { col: 0, row: 17 }, { col: 1, row: 17 }, { col: 0, row: 18 }], hint: 'Z' },
      { piece: 'J', cells: [{ col: 2, row: 16 }, { col: 2, row: 17 }, { col: 1, row: 18 }, { col: 2, row: 18 }], hint: 'J' },
      { piece: 'T', cells: [{ col: 3, row: 18 }, { col: 4, row: 18 }, { col: 5, row: 18 }, { col: 4, row: 19 }], hint: 'T-Spin Double' },
    ],
  },
];

// ── J-hold DPC setups (1 normal; L-hold = mirror of this) ──

const J_NORMALS: DpcSolution[] = [
  {
    name: 'TSM J SPC',
    holdPiece: 'J',
    placements: [
      { piece: 'J', cells: [{ col: 4, row: 17 }, { col: 4, row: 18 }, { col: 3, row: 19 }, { col: 4, row: 19 }], hint: 'J (hold)' },
      { piece: 'J', cells: [{ col: 4, row: 15 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'J (bag)' },
      { piece: 'I', cells: [{ col: 9, row: 16 }, { col: 9, row: 17 }, { col: 9, row: 18 }, { col: 9, row: 19 }], hint: 'I' },
      { piece: 'Z', cells: [{ col: 3, row: 17 }, { col: 2, row: 18 }, { col: 3, row: 18 }, { col: 2, row: 19 }], hint: 'Z' },
      { piece: 'O', cells: [{ col: 0, row: 18 }, { col: 1, row: 18 }, { col: 0, row: 19 }, { col: 1, row: 19 }], hint: 'O' },
      { piece: 'S', cells: [{ col: 2, row: 16 }, { col: 3, row: 16 }, { col: 1, row: 17 }, { col: 2, row: 17 }], hint: 'S' },
      { piece: 'T', cells: [{ col: 5, row: 17 }, { col: 5, row: 18 }, { col: 6, row: 18 }, { col: 5, row: 19 }], hint: 'T-Spin' },
      { piece: 'L', cells: [{ col: 8, row: 18 }, { col: 6, row: 19 }, { col: 7, row: 19 }, { col: 8, row: 19 }], hint: 'L' },
    ],
  },
];

// ── Data lookup (normals only — mirrors generated at runtime) ──

const NORMAL_DATA: Partial<Record<PieceType, DpcSolution[]>> = {
  O: O_NORMALS,
  S: S_NORMALS,
  I: I_NORMALS,
  J: J_NORMALS,
};

// ── Getter ──

/**
 * Get DPC solutions for a given holdPiece after PC.
 * Returns an empty array if no DPC solutions exist for that hold piece.
 *
 * For O/I-hold: returns normals + self-mirrors (O mirrors to O, I to I).
 * For S-hold: returns normals. For Z-hold: returns mirror(S normals).
 * For J-hold: returns normals. For L-hold: returns mirror(J normals).
 */
export function getDpcSolutions(holdPiece: PieceType): DpcSolution[] {
  // Direct normals
  const normals = NORMAL_DATA[holdPiece];
  if (normals) {
    // O and I are self-mirroring: include both normal and mirror variants
    if (holdPiece === 'O' || holdPiece === 'I') {
      return [...normals, ...normals.map(mirrorDpcSolution)];
    }
    return normals;
  }

  // Mirror pair: Z from S, L from J
  const pair = MIRROR_PIECE_MAP[holdPiece];
  if (pair) {
    const pairNormals = NORMAL_DATA[pair];
    if (pairNormals) return pairNormals.map(mirrorDpcSolution);
  }

  return [];
}
