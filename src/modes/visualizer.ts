import type { PieceType } from '../core/types.ts';
import type { OpenerID } from '../openers/types.ts';
import { OPENERS } from '../openers/decision.ts';
import { buildSteps, emptyBoard, cloneBoard, stampCells } from '../core/engine.ts';
import type { Board } from '../core/engine.ts';

// ── Types ──

import type { Step } from '../core/engine.ts';
export type { Step };
export type PlacementStep = Step; // compat alias

/** Compat type for getOpenerSequence — used by drill.ts and tests */
export interface OpenerSequence {
  openerId: OpenerID;
  mirror: boolean;
  bag: PieceType[];
  holdPiece: PieceType;
  steps: Step[];
  tSpinSlots: {
    tst: { col: number; row: number; rotation: number } | null;
    tsd: { col: number; row: number; rotation: number } | null;
  };
}

// ── Bag 2 Route Types ──

export interface Bag2Route {
  routeId: string;          // 'setup_a', 'ideal', etc.
  routeLabel: string;       // 'Route C (Olive)'
  condition: string;        // 'S first among {I,O,S}'
  conditionPieces: PieceType[];
  placements: RawPlacement[];
  holdPlacement: RawPlacement | null; // Held piece gap-filler
  tstStepIndex: number;
}

export interface Bag2Data {
  routes: Bag2Route[];
}

export interface VisualizerState {
  openerId: OpenerID;
  mirror: boolean;
  steps: Step[];         // flat: bag1 + hold? + bag2
  bag1End: number;       // index after last Bag 1 step
  currentStep: number;   // 0 = empty board, 1..steps.length
  routeIndex: number;    // -1 = bag1 only, 0+ = bag2 route
}

// ── Placement data ──
// Row 19 = bottom, row 0 = top (screen coordinates)

export interface RawPlacement {
  piece: PieceType;
  cells: { col: number; row: number }[];
  hint: string;
}

interface OpenerPlacementData {
  placements: RawPlacement[];
  tSpinSlots: {
    tst: { col: number; row: number; rotation: number } | null;
    tsd: { col: number; row: number; rotation: number } | null;
  };
}

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

const OPENER_PLACEMENT_DATA: Record<OpenerID, OpenerPlacementData> = {
  ms2: MS2_DATA,
  gamushiro: GAMUSHIRO_DATA,
  honey_cup: HONEY_CUP_DATA,
  stray_cannon: STRAY_CANNON_DATA,
};

// ── Mirror helpers ──

const MIRROR_PIECE_MAP: Partial<Record<PieceType, PieceType>> = {
  L: 'J',
  J: 'L',
  S: 'Z',
  Z: 'S',
};

function mirrorPiece(piece: PieceType): PieceType {
  return MIRROR_PIECE_MAP[piece] ?? piece;
}

function mirrorPlacementData(data: OpenerPlacementData): OpenerPlacementData {
  return {
    placements: data.placements.map((p) => ({
      piece: mirrorPiece(p.piece),
      cells: p.cells.map((c) => ({ col: 9 - c.col, row: c.row })),
      hint: p.hint + ' (mirrored)',
    })),
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

// ── Bag 2 Route Data (from Hard Drop wiki) ──
// Bag 2 pieces are placed directly on the Bag 1 final board.
// Some pieces may visually "float" — this is correct per SRS (reachable via kicks).


function hintForPlacement(piece: PieceType, cells: { col: number; row: number }[]): string {
  const cols = cells.map((c) => c.col);
  const rows = cells.map((c) => c.row);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const isVertical = maxRow - minRow >= 2;
  const isHorizontal = maxCol - minCol >= 2;
  const orient = isVertical ? 'vertical' : isHorizontal ? 'horizontal' : 'flat';
  const colRange = minCol === maxCol ? `col ${minCol}` : `cols ${minCol}-${maxCol}`;
  return `${piece} ${orient}, ${colRange}`;
}

// Honey Cup Bag 2
const HONEY_CUP_BAG2_ROUTES: Bag2Route[] = [
  {
    routeId: 'ideal',
    routeLabel: 'Standard (J→S→O)',
    condition: 'Default route',
    conditionPieces: ['J', 'S', 'O'],
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'J', cells: [{ col: 0, row: 14 }, { col: 1, row: 14 }, { col: 0, row: 15 }, { col: 0, row: 16 }], hint: 'J vertical, cols 0-1, left wall' },
      { piece: 'L', cells: [{ col: 8, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }, { col: 8, row: 16 }], hint: 'L flat, cols 6-8' },
      { piece: 'S', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 1, row: 15 }, { col: 2, row: 15 }], hint: 'S flat, cols 1-3' },
      { piece: 'O', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 6, row: 15 }, { col: 7, row: 15 }], hint: 'O flat, cols 6-7' },
      { piece: 'I', cells: [{ col: 0, row: 13 }, { col: 1, row: 13 }, { col: 2, row: 13 }, { col: 3, row: 13 }], hint: 'I horizontal, cols 0-3' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'alt_i_left',
    routeLabel: 'I-left variant',
    condition: 'When I comes early',
    conditionPieces: ['I'],
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'I', cells: [{ col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }, { col: 0, row: 16 }], hint: 'I vertical, col 0, left wall' },
      { piece: 'L', cells: [{ col: 6, row: 14 }, { col: 6, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }], hint: 'L vertical, cols 6-7' },
      { piece: 'S', cells: [{ col: 7, row: 14 }, { col: 7, row: 15 }, { col: 8, row: 15 }, { col: 8, row: 16 }], hint: 'S vertical, cols 7-8' },
      { piece: 'O', cells: [{ col: 1, row: 14 }, { col: 2, row: 14 }, { col: 1, row: 15 }, { col: 2, row: 15 }], hint: 'O flat, cols 1-2' },
      { piece: 'J', cells: [{ col: 1, row: 13 }, { col: 2, row: 13 }, { col: 3, row: 13 }, { col: 3, row: 14 }], hint: 'J horizontal, cols 1-3' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
];

// MS2 Bag 2
const MS2_BAG2_ROUTES: Bag2Route[] = [
  {
    routeId: 'setup_a',
    routeLabel: 'Setup A (O early)',
    condition: 'O comes early, not after I',
    conditionPieces: ['O', 'I'],
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O flat, cols 8-9, bottom-right' },
      { piece: 'J', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 2, row: 15 }, { col: 2, row: 16 }], hint: 'J vertical, cols 2-3' },
      { piece: 'S', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }], hint: 'S flat, cols 6-8' },
      { piece: 'I', cells: [{ col: 9, row: 12 }, { col: 9, row: 13 }, { col: 9, row: 14 }, { col: 9, row: 15 }], hint: 'I vertical, col 9, right wall' },
      { piece: 'L', cells: [{ col: 0, row: 12 }, { col: 1, row: 12 }, { col: 1, row: 13 }, { col: 1, row: 14 }], hint: 'L vertical, cols 0-1' },
    ],
    holdPlacement: { piece: 'L', cells: [{ col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }, { col: 1, row: 15 }], hint: 'Hold L, left wall gap-filler' },
    tstStepIndex: -1,
  },
  {
    routeId: 'setup_b',
    routeLabel: 'Setup B (L before I/J)',
    condition: 'L before I or J',
    conditionPieces: ['L', 'I', 'J'],
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O flat, cols 8-9, bottom-right' },
      { piece: 'J', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 2, row: 15 }, { col: 2, row: 16 }], hint: 'J vertical, cols 2-3' },
      { piece: 'S', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }], hint: 'S flat, cols 6-8' },
      { piece: 'L', cells: [{ col: 1, row: 13 }, { col: 2, row: 13 }, { col: 3, row: 13 }, { col: 1, row: 14 }], hint: 'L horizontal, cols 1-3' },
      { piece: 'I', cells: [{ col: 0, row: 12 }, { col: 1, row: 12 }, { col: 2, row: 12 }, { col: 3, row: 12 }], hint: 'I horizontal, cols 0-3' },
    ],
    holdPlacement: { piece: 'L', cells: [{ col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }, { col: 1, row: 15 }], hint: 'Hold L, left wall gap-filler' },
    tstStepIndex: -1,
  },
];

// Stray Cannon Bag 2
const STRAY_CANNON_BAG2_ROUTES: Bag2Route[] = [
  {
    routeId: 'j_before_o',
    routeLabel: 'Route 1 (J>O, 98% PC)',
    condition: 'J before O in Bag 2',
    conditionPieces: ['J', 'O'],
    placements: [
      { piece: 'L', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 3, row: 17 }], hint: 'L horizontal, cols 3-5' },
      { piece: 'S', cells: [{ col: 0, row: 14 }, { col: 0, row: 15 }, { col: 1, row: 15 }, { col: 1, row: 16 }], hint: 'S vertical, cols 0-1' },
      { piece: 'Z', cells: [{ col: 3, row: 14 }, { col: 2, row: 15 }, { col: 3, row: 15 }, { col: 2, row: 16 }], hint: 'Z vertical, cols 2-3' },
      { piece: 'I', cells: [{ col: 9, row: 13 }, { col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }], hint: 'I vertical, col 9, right wall' },
      { piece: 'J', cells: [{ col: 8, row: 13 }, { col: 8, row: 14 }, { col: 7, row: 15 }, { col: 8, row: 15 }], hint: 'J vertical, cols 7-8' },
      { piece: 'O', cells: [{ col: 6, row: 13 }, { col: 7, row: 13 }, { col: 6, row: 14 }, { col: 7, row: 14 }], hint: 'O flat, cols 6-7' },
    ],
    holdPlacement: { piece: 'Z', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'Hold Z, right side gap-filler' },
    tstStepIndex: -1,
  },
  {
    routeId: 's_before_j',
    routeLabel: 'Route 2 (S>J, 84% PC)',
    condition: 'S before J in Bag 2',
    conditionPieces: ['S', 'J'],
    placements: [
      { piece: 'L', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 3, row: 17 }], hint: 'L horizontal, cols 3-5' },
      { piece: 'S', cells: [{ col: 7, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }], hint: 'S vertical, cols 7-8' },
      { piece: 'I', cells: [{ col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'I vertical, col 9, right wall' },
      { piece: 'O', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 2, row: 15 }, { col: 3, row: 15 }], hint: 'O flat, cols 2-3' },
      { piece: 'J', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 8, row: 14 }, { col: 8, row: 15 }], hint: 'J horizontal, cols 6-8' },
      { piece: 'Z', cells: [{ col: 2, row: 12 }, { col: 1, row: 13 }, { col: 2, row: 13 }, { col: 1, row: 14 }], hint: 'Z vertical, cols 1-2' },
    ],
    holdPlacement: { piece: 'Z', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 1, row: 16 }, { col: 2, row: 16 }], hint: 'Hold Z, left side gap-filler' },
    tstStepIndex: -1,
  },
];

// Gamushiro Bag 2
const GAMUSHIRO_BAG2_ROUTES: Bag2Route[] = [
  {
    routeId: 'form_1',
    routeLabel: 'Form 1 (L→O, 99% PC)',
    condition: 'Default route',
    conditionPieces: ['L', 'O'],
    placements: [
      { piece: 'Z', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'Z flat, cols 3-5' },
      { piece: 'J', cells: [{ col: 1, row: 14 }, { col: 2, row: 14 }, { col: 1, row: 15 }, { col: 1, row: 16 }], hint: 'J vertical, cols 1-2' },
      { piece: 'S', cells: [{ col: 6, row: 15 }, { col: 7, row: 15 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'S flat, cols 5-7' },
      { piece: 'L', cells: [{ col: 8, row: 14 }, { col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }], hint: 'L vertical, cols 8-9' },
      { piece: 'I', cells: [{ col: 0, row: 12 }, { col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }], hint: 'I vertical, col 0, left wall' },
      { piece: 'O', cells: [{ col: 8, row: 12 }, { col: 9, row: 12 }, { col: 8, row: 13 }, { col: 9, row: 13 }], hint: 'O flat, cols 8-9' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'form_2',
    routeLabel: 'Form 2 (OO at bottom)',
    condition: 'When O comes late',
    conditionPieces: ['O'],
    placements: [
      { piece: 'Z', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'Z flat, cols 3-5' },
      { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O flat, cols 8-9, bottom-right' },
      { piece: 'J', cells: [{ col: 1, row: 14 }, { col: 2, row: 14 }, { col: 1, row: 15 }, { col: 1, row: 16 }], hint: 'J vertical, cols 1-2' },
      { piece: 'S', cells: [{ col: 6, row: 15 }, { col: 7, row: 15 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'S flat, cols 5-7' },
      { piece: 'I', cells: [{ col: 0, row: 12 }, { col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }], hint: 'I vertical, col 0, left wall' },
      { piece: 'L', cells: [{ col: 8, row: 12 }, { col: 9, row: 12 }, { col: 9, row: 13 }, { col: 9, row: 14 }], hint: 'L vertical, cols 8-9' },
    ],
    holdPlacement: { piece: 'L', cells: [{ col: 8, row: 13 }, { col: 8, row: 14 }, { col: 8, row: 15 }, { col: 9, row: 15 }], hint: 'Hold L, right side gap-filler' },
    tstStepIndex: -1,
  },
];

const BAG2_ROUTE_DATA: Record<OpenerID, Bag2Data> = {
  ms2: { routes: MS2_BAG2_ROUTES },
  gamushiro: { routes: GAMUSHIRO_BAG2_ROUTES },
  honey_cup: { routes: HONEY_CUP_BAG2_ROUTES },
  stray_cannon: { routes: STRAY_CANNON_BAG2_ROUTES },
};

function mirrorBag2Route(route: Bag2Route): Bag2Route {
  return {
    ...route,
    routeLabel: route.routeLabel + ' (Mirror)',
    conditionPieces: route.conditionPieces.map(mirrorPiece),
    placements: route.placements.map((p) => ({
      piece: mirrorPiece(p.piece),
      cells: p.cells.map((c) => ({ col: 9 - c.col, row: c.row })),
      hint: p.hint + ' (mirrored)',
    })),
    holdPlacement: route.holdPlacement ? {
      piece: mirrorPiece(route.holdPlacement.piece),
      cells: route.holdPlacement.cells.map((c) => ({ col: 9 - c.col, row: c.row })),
      hint: route.holdPlacement.hint + ' (mirrored)',
    } : null,
  };
}

// ── Public API ──

export function getOpenerSequence(openerId: OpenerID, mirror: boolean): OpenerSequence {
  const def = OPENERS[openerId];
  const holdPiece = mirror ? def.holdPieceMirror : def.holdPiece;
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const steps = buildSteps(data.placements);
  const bag = [...steps.map(s => s.piece), holdPiece];
  return { openerId, mirror, bag, holdPiece, steps, tSpinSlots: data.tSpinSlots };
}

export function createVisualizerState(
  openerId: OpenerID,
  mirror: boolean,
  routeIndex: number = 0,
): VisualizerState {
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const bag1Placements: RawPlacement[] = data.placements;

  const routes = getBag2Routes(openerId, mirror);
  const route = routes[routeIndex] ?? null;

  // Engine-driven: try full Bag 1 first. If any Bag 2 piece gets stuck
  // (conflict), reduce Bag 1 by 1 piece (the held piece stays out).
  // The engine's support-ordered placement handles the rest.
  const bag2All: RawPlacement[] = route
    ? [...(route.holdPlacement ? [route.holdPlacement] : []), ...route.placements]
    : [];

  let bag1Used = bag1Placements;
  if (route && bag2All.length > 0) {
    // Try full Bag 1
    const fullSteps = buildSteps([...bag1Placements, ...bag2All]);
    if (fullSteps.length < bag1Placements.length + bag2All.length) {
      // Some pieces stuck — try with one fewer Bag 1 piece
      const reducedBag1 = bag1Placements.slice(0, bag1Placements.length - 1);
      const reducedSteps = buildSteps([...reducedBag1, ...bag2All]);
      if (reducedSteps.length >= reducedBag1.length + bag2All.length) {
        bag1Used = reducedBag1;
      }
    }
  }

  const allPlacements: RawPlacement[] = route
    ? [...bag1Used, ...bag2All]
    : [...bag1Placements];

  return {
    openerId,
    mirror,
    steps: buildSteps(allPlacements),
    bag1End: bag1Used.length,
    currentStep: 0,
    routeIndex: route ? routeIndex : -1,
  };
}

export function stepForward(state: VisualizerState): void {
  if (state.currentStep < state.steps.length) state.currentStep++;
}

export function stepBackward(state: VisualizerState): void {
  if (state.currentStep > 0) state.currentStep--;
}

export function jumpToStep(state: VisualizerState, step: number): void {
  state.currentStep = Math.max(0, Math.min(step, state.steps.length));
}

export function getCurrentBoard(state: VisualizerState): Board {
  return state.currentStep === 0
    ? emptyBoard()
    : state.steps[state.currentStep - 1]!.board;
}

export function switchRoute(state: VisualizerState, routeIndex: number): VisualizerState {
  const newState = createVisualizerState(state.openerId, state.mirror, routeIndex);
  newState.currentStep = newState.bag1End; // jump to Bag 2 start
  return newState;
}

export function switchOpener(openerId: OpenerID, mirror: boolean): VisualizerState {
  return createVisualizerState(openerId, mirror);
}

export function toggleMirror(state: VisualizerState): VisualizerState {
  return createVisualizerState(state.openerId, !state.mirror, Math.max(0, state.routeIndex));
}

// ── Bag 2 Public API ──

export function getBag2Routes(openerId: OpenerID, mirror: boolean): Bag2Route[] {
  const data = BAG2_ROUTE_DATA[openerId];
  if (!data || data.routes.length === 0) return [];
  return mirror ? data.routes.map(mirrorBag2Route) : [...data.routes];
}


/** Compat: build Bag 2 steps for tests that need them. Returns steps + baseBoard. */
export function getBag2Sequence(openerId: OpenerID, mirror: boolean, routeIndex: number) {
  const routes = getBag2Routes(openerId, mirror);
  if (routeIndex < 0 || routeIndex >= routes.length) return null;
  const route = routes[routeIndex]!;
  const state = createVisualizerState(openerId, mirror, routeIndex);
  // Bag 2 steps = everything after bag1End, excluding hold piece
  // The hold is inserted into bag2 at holdInsertIndex, find and skip it
  const allBag2 = state.steps.slice(state.bag1End);
  const holdHint = route.holdPlacement?.hint;
  const bag2Steps = holdHint ? allBag2.filter(s => s.hint !== holdHint) : allBag2;
  // Base board = Bag 1 final + hold piece (computed directly)
  const bag1FinalBoard = state.bag1End > 0 ? state.steps[state.bag1End - 1]!.board : emptyBoard();
  let baseBoard = cloneBoard(bag1FinalBoard);
  if (route.holdPlacement) {
    const emptyCells = route.holdPlacement.cells.filter(c => bag1FinalBoard[c.row]?.[c.col] === null);
    if (emptyCells.length > 0) {
      baseBoard = stampCells(baseBoard, route.holdPlacement.piece, emptyCells);
    }
  }
  const bag1Seq = getOpenerSequence(openerId, mirror);
  return {
    openerId, mirror,
    bag: routes[routeIndex]!.placements.map(p => p.piece),
    holdPiece: mirror ? OPENERS[openerId].holdPieceMirror : OPENERS[openerId].holdPiece,
    steps: bag2Steps,
    tSpinSlots: bag1Seq.tSpinSlots,
    baseBoard,
  };
}

export function getAvailableOpeners(): { id: OpenerID; nameEn: string; nameCn: string }[] {
  return [
    { id: 'stray_cannon', nameEn: 'Stray Cannon', nameCn: '迷走炮' },
    { id: 'honey_cup', nameEn: 'Honey Cup', nameCn: '蜜蜂炮' },
    { id: 'gamushiro', nameEn: 'Gamushiro', nameCn: '糖漿炮' },
    { id: 'ms2', nameEn: 'MS2', nameCn: '山岳炮' },
  ];
}
