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

// ── Bag 2 Route Types ──

export interface Bag2Route {
  routeId: string;          // 'route_c', 'main', etc.
  routeLabel: string;       // 'Route C (Olive)'
  condition: string;        // 'S first among {I,O,S}'
  conditionPieces: PieceType[];
  placements: RawPlacement[];
  tstStepIndex: number;     // which step fires the TST
}

export interface Bag2Data {
  routes: Bag2Route[];
}

export interface VisualizerState {
  sequence: OpenerSequence;
  currentStep: number;
  playing: boolean;
  // Bag 2 navigation
  bag: 1 | 2;
  bag2RouteIndex: number;
  bag2Sequence: OpenerSequence | null;
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

// ── Bag 2 Route Data ──
// TODO: replace with real Bag 2 data (placeholder routes below)

const MS2_BAG2_ROUTE_C: Bag2Route = {
  routeId: 'route_c',
  routeLabel: 'Route C (Olive)',
  condition: 'S first among {I,O,S}',
  conditionPieces: ['S', 'I', 'O'],
  placements: [
    // TODO: replace with real Bag 2 data
    {
      piece: 'T',
      cells: [
        { col: 4, row: 17 },
        { col: 3, row: 18 },
        { col: 4, row: 18 },
        { col: 5, row: 18 },
      ],
      hint: 'T-spin Triple into the TST slot (placeholder)',
    },
    {
      piece: 'S',
      cells: [
        { col: 1, row: 15 },
        { col: 2, row: 15 },
        { col: 0, row: 16 },
        { col: 1, row: 16 },
      ],
      hint: 'S flat, top-left (placeholder)',
    },
  ],
  tstStepIndex: 0,
};

const BAG2_ROUTE_DATA: Record<OpenerID, Bag2Data> = {
  ms2: {
    routes: [MS2_BAG2_ROUTE_C],
  },
  gamushiro: {
    routes: [], // TODO: replace with real Bag 2 data
  },
  honey_cup: {
    routes: [], // TODO: replace with real Bag 2 data
  },
  stray_cannon: {
    routes: [], // TODO: replace with real Bag 2 data
  },
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
    bag: 1,
    bag2RouteIndex: 0,
    bag2Sequence: null,
  };
}

export function stepForward(state: VisualizerState): void {
  if (state.bag === 1) {
    const maxStep = state.sequence.steps.length;
    if (state.currentStep < maxStep) {
      state.currentStep++;
    } else {
      // At the end of Bag 1 — try to transition to Bag 2
      const routes = getBag2Routes(state.sequence.openerId, state.sequence.mirror);
      if (routes.length > 0) {
        const bag2Seq = getBag2Sequence(
          state.sequence.openerId,
          state.sequence.mirror,
          state.bag2RouteIndex,
        );
        if (bag2Seq) {
          state.bag = 2;
          state.bag2Sequence = bag2Seq;
          state.currentStep = 0;
        }
      }
    }
  } else if (state.bag === 2 && state.bag2Sequence) {
    const maxStep = state.bag2Sequence.steps.length;
    if (state.currentStep < maxStep) {
      state.currentStep++;
    }
  }
}

export function stepBackward(state: VisualizerState): void {
  if (state.bag === 2) {
    if (state.currentStep > 0) {
      state.currentStep--;
    } else {
      // At step 0 of Bag 2 — go back to last Bag 1 step
      state.bag = 1;
      state.bag2Sequence = null;
      state.currentStep = state.sequence.steps.length;
    }
  } else {
    if (state.currentStep > 0) {
      state.currentStep--;
    }
  }
}

export function jumpToStep(state: VisualizerState, step: number): void {
  const maxStep = state.sequence.steps.length;
  state.currentStep = Math.max(0, Math.min(step, maxStep));
}

export function getCurrentBoard(state: VisualizerState): (PieceType | null)[][] {
  if (state.bag === 2 && state.bag2Sequence) {
    if (state.currentStep === 0) {
      // Show the final Bag 1 board as the base
      const bag1Steps = state.sequence.steps;
      return bag1Steps.length > 0 ? bag1Steps[bag1Steps.length - 1]!.board : emptyBoard();
    }
    return state.bag2Sequence.steps[state.currentStep - 1]!.board;
  }
  if (state.currentStep === 0) {
    return emptyBoard();
  }
  return state.sequence.steps[state.currentStep - 1]!.board;
}

// ── Bag 2 Public API ──

export function getBag2Routes(openerId: OpenerID, mirror: boolean): Bag2Route[] {
  const data = BAG2_ROUTE_DATA[openerId];
  if (!data || data.routes.length === 0) return [];
  return mirror ? data.routes.map(mirrorBag2Route) : [...data.routes];
}

export function getBag2Sequence(
  openerId: OpenerID,
  mirror: boolean,
  routeIndex: number,
): OpenerSequence | null {
  const routes = getBag2Routes(openerId, mirror);
  if (routeIndex < 0 || routeIndex >= routes.length) return null;
  const route = routes[routeIndex]!;

  // Start from the Bag 1 final board
  const bag1Seq = getOpenerSequence(openerId, mirror);
  const bag1FinalBoard =
    bag1Seq.steps.length > 0
      ? bag1Seq.steps[bag1Seq.steps.length - 1]!.board
      : emptyBoard();

  // Build Bag 2 steps on top of the Bag 1 board
  const steps: PlacementStep[] = [];
  let currentBoard = cloneBoard(bag1FinalBoard);

  for (const placement of route.placements) {
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

  return {
    openerId,
    mirror,
    bag,
    holdPiece: bag1Seq.holdPiece, // Bag 2 hold TBD — use Bag 1 hold as placeholder
    steps,
    tSpinSlots: bag1Seq.tSpinSlots,
  };
}

export function switchBag2Route(state: VisualizerState, routeIndex: number): void {
  const routes = getBag2Routes(state.sequence.openerId, state.sequence.mirror);
  if (routeIndex < 0 || routeIndex >= routes.length) return;
  state.bag2RouteIndex = routeIndex;
  if (state.bag === 2) {
    const bag2Seq = getBag2Sequence(
      state.sequence.openerId,
      state.sequence.mirror,
      routeIndex,
    );
    state.bag2Sequence = bag2Seq;
    state.currentStep = 0;
  }
}

export function getAvailableOpeners(): { id: OpenerID; nameEn: string; nameCn: string }[] {
  return [
    { id: 'stray_cannon', nameEn: 'Stray Cannon', nameCn: '迷走炮' },
    { id: 'honey_cup', nameEn: 'Honey Cup', nameCn: '蜜蜂炮' },
    { id: 'gamushiro', nameEn: 'Gamushiro', nameCn: '糖漿炮' },
    { id: 'ms2', nameEn: 'MS2', nameCn: '山岳炮' },
  ];
}
