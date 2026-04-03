import type { PieceType } from '../core/types.ts';
import type { OpenerID } from '../openers/types.ts';
import { OPENERS } from '../openers/decision.ts';

// ── Types ──

export interface PlacementStep {
  piece: PieceType;
  board: (PieceType | null)[][];
  newCells: { col: number; row: number }[];
  hint: string;
}

export interface OpenerSequence {
  openerId: OpenerID;
  mirror: boolean;
  bag: PieceType[];
  holdPiece: PieceType;
  steps: PlacementStep[];
  tSpinSlots: {
    tst: { col: number; row: number; rotation: number } | null;
    tsd: { col: number; row: number; rotation: number } | null;
  };
}

export interface VisualizerState {
  sequence: OpenerSequence;
  currentStep: number;
  playing: boolean;
}

// ── Board helpers ──

function emptyBoard(): (PieceType | null)[][] {
  return Array.from({ length: 20 }, () => Array(10).fill(null) as (PieceType | null)[]);
}

function cloneBoard(board: (PieceType | null)[][]): (PieceType | null)[][] {
  return board.map((row) => [...row]);
}

// ── Placement data ──
// Row 19 = bottom, row 0 = top (screen coordinates)

interface RawPlacement {
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
// Layout (bottom rows, row 19 = bottom):
// Row 16: OO...T....
// Row 17: OO..TTT...
// Row 18: J..SSZZ...
// Row 19: JJJ.SZ.IIII
const MS2_DATA: OpenerPlacementData = {
  placements: [
    {
      piece: 'J',
      cells: [
        { col: 0, row: 18 },
        { col: 0, row: 19 },
        { col: 1, row: 19 },
        { col: 2, row: 19 },
      ],
      hint: 'J spawn, cols 0-2, bottom-left',
    },
    {
      piece: 'I',
      cells: [
        { col: 7, row: 19 },
        { col: 8, row: 19 },
        { col: 9, row: 19 },
        { col: 6, row: 19 },
      ],
      hint: 'I flat, cols 6-9, bottom-right',
    },
    {
      piece: 'O',
      cells: [
        { col: 0, row: 16 },
        { col: 1, row: 16 },
        { col: 0, row: 17 },
        { col: 1, row: 17 },
      ],
      hint: 'O stacked on J, cols 0-1',
    },
    {
      piece: 'S',
      cells: [
        { col: 3, row: 18 },
        { col: 4, row: 18 },
        { col: 3, row: 19 },
        { col: 4, row: 19 },
      ],
      hint: 'S spawn, cols 3-4, rows 18-19',
    },
    {
      piece: 'Z',
      cells: [
        { col: 4, row: 17 },
        { col: 5, row: 17 },
        { col: 5, row: 18 },
        { col: 5, row: 19 },
      ],
      hint: 'Z rotated, cols 4-5, rows 17-19',
    },
    {
      piece: 'T',
      cells: [
        { col: 5, row: 16 },
        { col: 4, row: 16 },
        { col: 6, row: 16 },
        { col: 5, row: 15 },
      ],
      hint: 'T spawn (pointing up), cols 4-6, creates TST overhang',
    },
  ],
  tSpinSlots: {
    tst: { col: 5, row: 18, rotation: 2 },
    tsd: { col: 2, row: 17, rotation: 0 },
  },
};

// Gamushiro — similar to MS2, Hold L
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
      hint: 'J spawn, cols 0-2, bottom-left',
    },
    {
      piece: 'I',
      cells: [
        { col: 6, row: 19 },
        { col: 7, row: 19 },
        { col: 8, row: 19 },
        { col: 9, row: 19 },
      ],
      hint: 'I flat, cols 6-9, bottom-right',
    },
    {
      piece: 'O',
      cells: [
        { col: 0, row: 16 },
        { col: 1, row: 16 },
        { col: 0, row: 17 },
        { col: 1, row: 17 },
      ],
      hint: 'O stacked on J, cols 0-1',
    },
    {
      piece: 'S',
      cells: [
        { col: 3, row: 18 },
        { col: 4, row: 18 },
        { col: 3, row: 19 },
        { col: 4, row: 19 },
      ],
      hint: 'S spawn, cols 3-4, rows 18-19',
    },
    {
      piece: 'Z',
      cells: [
        { col: 4, row: 17 },
        { col: 5, row: 17 },
        { col: 5, row: 18 },
        { col: 5, row: 19 },
      ],
      hint: 'Z rotated, cols 4-5, rows 17-19',
    },
    {
      piece: 'T',
      cells: [
        { col: 4, row: 16 },
        { col: 5, row: 16 },
        { col: 6, row: 16 },
        { col: 5, row: 15 },
      ],
      hint: 'T spawn (pointing up), cols 4-6, creates TST overhang',
    },
  ],
  tSpinSlots: {
    tst: { col: 5, row: 18, rotation: 2 },
    tsd: { col: 2, row: 17, rotation: 0 },
  },
};

// Honey Cup — Normal side, Hold L
const HONEY_CUP_DATA: OpenerPlacementData = {
  placements: [
    {
      piece: 'J',
      cells: [
        { col: 0, row: 18 },
        { col: 0, row: 19 },
        { col: 1, row: 19 },
        { col: 2, row: 19 },
      ],
      hint: 'J spawn, cols 0-2, bottom-left',
    },
    {
      piece: 'I',
      cells: [
        { col: 6, row: 19 },
        { col: 7, row: 19 },
        { col: 8, row: 19 },
        { col: 9, row: 19 },
      ],
      hint: 'I flat, cols 6-9, bottom-right',
    },
    {
      piece: 'O',
      cells: [
        { col: 0, row: 16 },
        { col: 1, row: 16 },
        { col: 0, row: 17 },
        { col: 1, row: 17 },
      ],
      hint: 'O stacked on J, cols 0-1',
    },
    {
      piece: 'S',
      cells: [
        { col: 3, row: 18 },
        { col: 4, row: 18 },
        { col: 3, row: 19 },
        { col: 4, row: 19 },
      ],
      hint: 'S spawn, cols 3-4, rows 18-19',
    },
    {
      piece: 'Z',
      cells: [
        { col: 4, row: 17 },
        { col: 5, row: 17 },
        { col: 5, row: 18 },
        { col: 5, row: 19 },
      ],
      hint: 'Z rotated, cols 4-5, center',
    },
    {
      piece: 'T',
      cells: [
        { col: 4, row: 16 },
        { col: 5, row: 16 },
        { col: 6, row: 16 },
        { col: 5, row: 15 },
      ],
      hint: 'T upside-down, cols 4-6, creates overhang',
    },
  ],
  tSpinSlots: {
    tst: { col: 5, row: 18, rotation: 1 },
    tsd: { col: 3, row: 17, rotation: 0 },
  },
};

// Stray Cannon — Normal side, Hold Z
const STRAY_CANNON_DATA: OpenerPlacementData = {
  placements: [
    {
      piece: 'L',
      cells: [
        { col: 2, row: 18 },
        { col: 0, row: 19 },
        { col: 1, row: 19 },
        { col: 2, row: 19 },
      ],
      hint: 'L spawn, cols 0-2, bottom-left',
    },
    {
      piece: 'I',
      cells: [
        { col: 6, row: 19 },
        { col: 7, row: 19 },
        { col: 8, row: 19 },
        { col: 9, row: 19 },
      ],
      hint: 'I flat, cols 6-9, bottom-right',
    },
    {
      piece: 'O',
      cells: [
        { col: 0, row: 16 },
        { col: 1, row: 16 },
        { col: 0, row: 17 },
        { col: 1, row: 17 },
      ],
      hint: 'O stacked on L, cols 0-1',
    },
    {
      piece: 'J',
      cells: [
        { col: 2, row: 17 },
        { col: 3, row: 17 },
        { col: 3, row: 18 },
        { col: 3, row: 19 },
      ],
      hint: 'J CW rotation, cols 2-3, vertical',
    },
    {
      piece: 'S',
      cells: [
        { col: 4, row: 18 },
        { col: 5, row: 18 },
        { col: 4, row: 19 },
        { col: 5, row: 19 },
      ],
      hint: 'S spawn, cols 4-5, rows 18-19',
    },
    {
      piece: 'T',
      cells: [
        { col: 4, row: 16 },
        { col: 5, row: 16 },
        { col: 6, row: 16 },
        { col: 5, row: 15 },
      ],
      hint: 'T spawn (pointing up), cols 4-6, creates overhang',
    },
  ],
  tSpinSlots: {
    tst: { col: 5, row: 18, rotation: 2 },
    tsd: { col: 4, row: 17, rotation: 0 },
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

// ── Build sequence from placement data ──

function buildSequence(
  openerId: OpenerID,
  mirror: boolean,
  holdPiece: PieceType,
  data: OpenerPlacementData,
): OpenerSequence {
  const steps: PlacementStep[] = [];
  let currentBoard = emptyBoard();

  for (const placement of data.placements) {
    currentBoard = cloneBoard(currentBoard);
    for (const cell of placement.cells) {
      currentBoard[cell.row]![cell.col] = placement.piece;
    }
    steps.push({
      piece: placement.piece,
      board: cloneBoard(currentBoard),
      newCells: [...placement.cells],
      hint: placement.hint,
    });
  }

  const bag = steps.map((s) => s.piece);
  // Insert hold piece at a reasonable position (it was held, so not placed)
  bag.push(holdPiece);

  return {
    openerId,
    mirror,
    bag,
    holdPiece,
    steps,
    tSpinSlots: data.tSpinSlots,
  };
}

// ── Public API ──

export function getOpenerSequence(openerId: OpenerID, mirror: boolean): OpenerSequence {
  const def = OPENERS[openerId];
  const holdPiece = mirror ? def.holdPieceMirror : def.holdPiece;
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  return buildSequence(openerId, mirror, holdPiece, data);
}

export function createVisualizerState(sequence: OpenerSequence): VisualizerState {
  return {
    sequence,
    currentStep: 0,
    playing: false,
  };
}

export function stepForward(state: VisualizerState): void {
  const maxStep = state.sequence.steps.length;
  if (state.currentStep < maxStep) {
    state.currentStep++;
  }
}

export function stepBackward(state: VisualizerState): void {
  if (state.currentStep > 0) {
    state.currentStep--;
  }
}

export function jumpToStep(state: VisualizerState, step: number): void {
  const maxStep = state.sequence.steps.length;
  state.currentStep = Math.max(0, Math.min(step, maxStep));
}

export function getCurrentBoard(state: VisualizerState): (PieceType | null)[][] {
  if (state.currentStep === 0) {
    return emptyBoard();
  }
  return state.sequence.steps[state.currentStep - 1]!.board;
}

export function getAvailableOpeners(): { id: OpenerID; nameEn: string; nameCn: string }[] {
  return [
    { id: 'stray_cannon', nameEn: 'Stray Cannon', nameCn: '迷走炮' },
    { id: 'honey_cup', nameEn: 'Honey Cup', nameCn: '蜜蜂炮' },
    { id: 'gamushiro', nameEn: 'Gamushiro', nameCn: '糖漿炮' },
    { id: 'ms2', nameEn: 'MS2', nameCn: '山岳炮' },
  ];
}
