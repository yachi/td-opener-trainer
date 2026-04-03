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
// Correct TD shape (from fumen v115@9gB8HeC8DeA8BeC8AeJ8AeE8JeAgH):
// Row 16: IS........
// Row 17: ISS....T..
// Row 18: IJS.ZZTTOO
// Row 19: IJJJ.ZZTOO
const MS2_DATA: OpenerPlacementData = {
  placements: [
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
      piece: 'Z',
      cells: [
        { col: 5, row: 19 },
        { col: 6, row: 19 },
        { col: 4, row: 18 },
        { col: 5, row: 18 },
      ],
      hint: 'Z flat, cols 4-6, center',
    },
    {
      piece: 'S',
      cells: [
        { col: 1, row: 16 },
        { col: 1, row: 17 },
        { col: 2, row: 17 },
        { col: 2, row: 18 },
      ],
      hint: 'S vertical, cols 1-2, left-center stack',
    },
    {
      piece: 'T',
      cells: [
        { col: 7, row: 19 },
        { col: 6, row: 18 },
        { col: 7, row: 18 },
        { col: 7, row: 17 },
      ],
      hint: 'T CW rotation, col 7, creates TST overhang',
    },
  ],
  tSpinSlots: {
    tst: { col: 4, row: 18, rotation: 2 },
    tsd: { col: 2, row: 19, rotation: 0 },
  },
};

// Gamushiro — same TD shape as MS2, Hold L
// Row 16: IS........
// Row 17: ISS....T..
// Row 18: IJS.ZZTTOO
// Row 19: IJJJ.ZZTOO
const GAMUSHIRO_DATA: OpenerPlacementData = {
  placements: [
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
      piece: 'Z',
      cells: [
        { col: 5, row: 19 },
        { col: 6, row: 19 },
        { col: 4, row: 18 },
        { col: 5, row: 18 },
      ],
      hint: 'Z flat, cols 4-6, center',
    },
    {
      piece: 'S',
      cells: [
        { col: 1, row: 16 },
        { col: 1, row: 17 },
        { col: 2, row: 17 },
        { col: 2, row: 18 },
      ],
      hint: 'S vertical, cols 1-2, left-center stack',
    },
    {
      piece: 'T',
      cells: [
        { col: 7, row: 19 },
        { col: 6, row: 18 },
        { col: 7, row: 18 },
        { col: 7, row: 17 },
      ],
      hint: 'T CW rotation, col 7, creates TST overhang',
    },
  ],
  tSpinSlots: {
    tst: { col: 4, row: 18, rotation: 2 },
    tsd: { col: 2, row: 19, rotation: 0 },
  },
};

// Honey Cup — Normal side, Hold L (same TD shape as MS2/Gamushiro)
// Row 16: IS........
// Row 17: ISS....T..
// Row 18: IJS.ZZTTOO
// Row 19: IJJJ.ZZTOO
const HONEY_CUP_DATA: OpenerPlacementData = {
  placements: [
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
      piece: 'Z',
      cells: [
        { col: 5, row: 19 },
        { col: 6, row: 19 },
        { col: 4, row: 18 },
        { col: 5, row: 18 },
      ],
      hint: 'Z flat, cols 4-6, center',
    },
    {
      piece: 'S',
      cells: [
        { col: 1, row: 16 },
        { col: 1, row: 17 },
        { col: 2, row: 17 },
        { col: 2, row: 18 },
      ],
      hint: 'S vertical, cols 1-2, left-center stack',
    },
    {
      piece: 'T',
      cells: [
        { col: 7, row: 19 },
        { col: 6, row: 18 },
        { col: 7, row: 18 },
        { col: 7, row: 17 },
      ],
      hint: 'T CW rotation, col 7, creates TST overhang',
    },
  ],
  tSpinSlots: {
    tst: { col: 4, row: 18, rotation: 2 },
    tsd: { col: 2, row: 19, rotation: 0 },
  },
};

// Stray Cannon — Normal side, Hold Z
// Correct TD shape (Hold Z variant):
// Row 16: LS........
// Row 17: LSS....J..
// Row 18: LLS.TTTJOO
// Row 19: IIII.TJJOO
const STRAY_CANNON_DATA: OpenerPlacementData = {
  placements: [
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
      piece: 'L',
      cells: [
        { col: 0, row: 16 },
        { col: 0, row: 17 },
        { col: 0, row: 18 },
        { col: 1, row: 18 },
      ],
      hint: 'L CCW rotation, col 0-1, left wall',
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
      piece: 'T',
      cells: [
        { col: 5, row: 19 },
        { col: 4, row: 18 },
        { col: 5, row: 18 },
        { col: 6, row: 18 },
      ],
      hint: 'T pointing down, cols 4-6, center',
    },
    {
      piece: 'S',
      cells: [
        { col: 1, row: 16 },
        { col: 1, row: 17 },
        { col: 2, row: 17 },
        { col: 2, row: 18 },
      ],
      hint: 'S vertical, cols 1-2, left-center stack',
    },
    {
      piece: 'J',
      cells: [
        { col: 7, row: 17 },
        { col: 7, row: 18 },
        { col: 6, row: 19 },
        { col: 7, row: 19 },
      ],
      hint: 'J CW rotation, cols 6-7, creates TST overhang',
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
