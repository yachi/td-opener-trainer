import type { PieceType } from '../core/types.ts';
import type { OpenerID } from './types.ts';

// ── Types ──

export interface RawPlacement {
  piece: PieceType;
  cells: { col: number; row: number }[];
  hint: string;
}

export interface OpenerPlacementData {
  placements: RawPlacement[];
  tSpinSlots: {
    tst: { col: number; row: number; rotation: number } | null;
    tsd: { col: number; row: number; rotation: number } | null;
  };
}

// ── Mirror helpers ──

export const MIRROR_PIECE_MAP: Partial<Record<PieceType, PieceType>> = {
  L: 'J',
  J: 'L',
  S: 'Z',
  Z: 'S',
};

export function mirrorPiece(piece: PieceType): PieceType {
  return MIRROR_PIECE_MAP[piece] ?? piece;
}

function mirrorPlacement(p: RawPlacement): RawPlacement {
  return {
    piece: mirrorPiece(p.piece),
    cells: p.cells.map((c) => ({ col: 9 - c.col, row: c.row })),
    hint: p.hint + ' (mirrored)',
  };
}

export function mirrorPlacementData(data: OpenerPlacementData): OpenerPlacementData {
  return {
    placements: data.placements.map(mirrorPlacement),
    tSpinSlots: {
      tst: data.tSpinSlots.tst
        ? { col: 9 - data.tSpinSlots.tst.col, row: data.tSpinSlots.tst.row, rotation: data.tSpinSlots.tst.rotation }
        : null,
      tsd: data.tSpinSlots.tsd
        ? { col: 9 - data.tSpinSlots.tsd.col, row: data.tSpinSlots.tsd.row, rotation: data.tSpinSlots.tsd.rotation }
        : null,
    },
  };
}

// ── Bag 1 Placement Data ──
// Row 19 = bottom, row 0 = top (screen coordinates)

// MS2 — Normal side, Hold L
// Row 16: IS........
// Row 17: ISS....T..
// Row 18: IJS.ZZTTOO
// Row 19: IJJJ.ZZTOO
const MS2_DATA: OpenerPlacementData = {
  placements: [
    {
      piece: 'I',
      cells: [
        { col: 0, row: 16 },
        { col: 0, row: 17 },
        { col: 0, row: 18 },
        { col: 0, row: 19 },
      ],
      hint: 'I vertical, col 0, left wall',
    },
    {
      piece: 'T',
      cells: [
        { col: 7, row: 17 },
        { col: 6, row: 18 },
        { col: 7, row: 18 },
        { col: 7, row: 19 },
      ],
      hint: 'T CW rotation, col 7, creates TST overhang',
    },
    {
      piece: 'J',
      cells: [
        { col: 1, row: 18 },
        { col: 1, row: 19 },
        { col: 2, row: 19 },
        { col: 3, row: 19 },
      ],
      hint: 'J spawn, cols 1-3, bottom-left foundation',
    },
    {
      piece: 'S',
      cells: [
        { col: 1, row: 16 },
        { col: 1, row: 17 },
        { col: 2, row: 17 },
        { col: 2, row: 18 },
      ],
      hint: 'S vertical, cols 1-2, stacks on I and J',
    },
    {
      piece: 'Z',
      cells: [
        { col: 4, row: 18 },
        { col: 5, row: 18 },
        { col: 5, row: 19 },
        { col: 6, row: 19 },
      ],
      hint: 'Z flat, cols 4-6, center',
    },
    {
      piece: 'O',
      cells: [
        { col: 8, row: 18 },
        { col: 9, row: 18 },
        { col: 8, row: 19 },
        { col: 9, row: 19 },
      ],
      hint: 'O bottom-right, cols 8-9',
    },
  ],
  tSpinSlots: {
    tst: { col: 4, row: 18, rotation: 2 },
    tsd: { col: 2, row: 19, rotation: 0 },
  },
};

// Gamushiro — Normal side, all 7 pieces placed (Hold L per decision.ts)
// Row 15: ........L.
// Row 16: S......IL.
// Row 17: SS....TILL
// Row 18: JS.ZZTTIOO
// Row 19: JJJ.ZZTIOO
const GAMUSHIRO_DATA: OpenerPlacementData = {
  placements: [
    {
      piece: 'J',
      cells: [
        { col: 0, row: 18 },
        { col: 0, row: 19 },
        { col: 1, row: 19 },
        { col: 2, row: 19 },
      ],
      hint: 'J spawn, cols 0-2, bottom-left foundation',
    },
    {
      piece: 'S',
      cells: [
        { col: 0, row: 16 },
        { col: 0, row: 17 },
        { col: 1, row: 17 },
        { col: 1, row: 18 },
      ],
      hint: 'S vertical, cols 0-1, left wall stack',
    },
    {
      piece: 'I',
      cells: [
        { col: 7, row: 16 },
        { col: 7, row: 17 },
        { col: 7, row: 18 },
        { col: 7, row: 19 },
      ],
      hint: 'I vertical, col 7, right-center',
    },
    {
      piece: 'T',
      cells: [
        { col: 6, row: 17 },
        { col: 5, row: 18 },
        { col: 6, row: 18 },
        { col: 6, row: 19 },
      ],
      hint: 'T CCW rotation, cols 5-6, creates TST overhang',
    },
    {
      piece: 'Z',
      cells: [
        { col: 3, row: 18 },
        { col: 4, row: 18 },
        { col: 4, row: 19 },
        { col: 5, row: 19 },
      ],
      hint: 'Z flat, cols 3-5, center',
    },
    {
      piece: 'O',
      cells: [
        { col: 8, row: 18 },
        { col: 9, row: 18 },
        { col: 8, row: 19 },
        { col: 9, row: 19 },
      ],
      hint: 'O bottom-right, cols 8-9',
    },
    {
      piece: 'L',
      cells: [
        { col: 8, row: 15 },
        { col: 8, row: 16 },
        { col: 8, row: 17 },
        { col: 9, row: 17 },
      ],
      hint: 'L CCW rotation, cols 8-9, right wall overhang',
    },
  ],
  tSpinSlots: {
    tst: { col: 4, row: 18, rotation: 2 },
    tsd: { col: 2, row: 19, rotation: 0 },
  },
};

// Honey Cup — Normal side, Hold L
// Different shape from MS2/Gamushiro: I is horizontal, J is on the right
// Row 15: .........J
// Row 16: .SS......J
// Row 17: SS.....TJJ
// Row 18: ....ZZTTOO
// Row 19: IIII.ZZTOO
const HONEY_CUP_DATA: OpenerPlacementData = {
  placements: [
    {
      piece: 'O',
      cells: [
        { col: 8, row: 18 },
        { col: 9, row: 18 },
        { col: 8, row: 19 },
        { col: 9, row: 19 },
      ],
      hint: 'O bottom-right, cols 8-9',
    },
    {
      piece: 'I',
      cells: [
        { col: 0, row: 19 },
        { col: 1, row: 19 },
        { col: 2, row: 19 },
        { col: 3, row: 19 },
      ],
      hint: 'I flat, cols 0-3, bottom-left',
    },
    {
      piece: 'Z',
      cells: [
        { col: 4, row: 18 },
        { col: 5, row: 18 },
        { col: 5, row: 19 },
        { col: 6, row: 19 },
      ],
      hint: 'Z flat, cols 4-6, bridges the gap',
    },
    {
      piece: 'T',
      cells: [
        { col: 7, row: 17 },
        { col: 6, row: 18 },
        { col: 7, row: 18 },
        { col: 7, row: 19 },
      ],
      hint: 'T CW rotation, col 7, creates TST overhang',
    },
    {
      piece: 'L',
      cells: [
        { col: 0, row: 18 },
        { col: 1, row: 18 },
        { col: 2, row: 18 },
        { col: 2, row: 17 },
      ],
      hint: 'L spawn, cols 0-2, on top of I piece',
    },
    {
      piece: 'S',
      cells: [
        { col: 1, row: 16 },
        { col: 2, row: 16 },
        { col: 0, row: 17 },
        { col: 1, row: 17 },
      ],
      hint: 'S spawn, tucks on top of L piece',
    },
    {
      piece: 'J',
      cells: [
        { col: 9, row: 15 },
        { col: 9, row: 16 },
        { col: 8, row: 17 },
        { col: 9, row: 17 },
      ],
      hint: 'J CCW rotation, right wall overhang',
    },
  ],
  tSpinSlots: {
    tst: { col: 4, row: 18, rotation: 2 },
    tsd: { col: 2, row: 19, rotation: 0 },
  },
};

// Stray Cannon — Normal side, Hold Z
// Row 16: I.........
// Row 17: ILS.T..J..
// Row 18: ILSSTT.JOO
// Row 19: ILLST.JJOO
const STRAY_CANNON_DATA: OpenerPlacementData = {
  placements: [
    {
      piece: 'I',
      cells: [
        { col: 0, row: 16 },
        { col: 0, row: 17 },
        { col: 0, row: 18 },
        { col: 0, row: 19 },
      ],
      hint: 'I vertical, col 0, left wall',
    },
    {
      piece: 'L',
      cells: [
        { col: 1, row: 17 },
        { col: 1, row: 18 },
        { col: 1, row: 19 },
        { col: 2, row: 19 },
      ],
      hint: 'L spawn, cols 1-2, left-center foundation',
    },
    {
      piece: 'S',
      cells: [
        { col: 2, row: 17 },
        { col: 2, row: 18 },
        { col: 3, row: 18 },
        { col: 3, row: 19 },
      ],
      hint: 'S vertical CW, cols 2-3, left-center stack',
    },
    {
      piece: 'T',
      cells: [
        { col: 4, row: 17 },
        { col: 4, row: 18 },
        { col: 5, row: 18 },
        { col: 4, row: 19 },
      ],
      hint: 'T CW rotation, cols 4-5, creates TST overhang',
    },
    {
      piece: 'J',
      cells: [
        { col: 7, row: 17 },
        { col: 7, row: 18 },
        { col: 6, row: 19 },
        { col: 7, row: 19 },
      ],
      hint: 'J CW rotation, cols 6-7, right-center',
    },
    {
      piece: 'O',
      cells: [
        { col: 8, row: 18 },
        { col: 9, row: 18 },
        { col: 8, row: 19 },
        { col: 9, row: 19 },
      ],
      hint: 'O bottom-right, cols 8-9',
    },
  ],
  tSpinSlots: {
    tst: { col: 4, row: 18, rotation: 2 },
    tsd: { col: 2, row: 19, rotation: 0 },
  },
};

export const OPENER_PLACEMENT_DATA: Record<OpenerID, OpenerPlacementData> = {
  ms2: MS2_DATA,
  gamushiro: GAMUSHIRO_DATA,
  honey_cup: HONEY_CUP_DATA,
  stray_cannon: STRAY_CANNON_DATA,
};
