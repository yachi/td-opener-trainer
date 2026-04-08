import type { PieceType } from '../core/types.ts';
import type { OpenerID } from '../openers/types.ts';
import type { Board, ActivePiece } from '../core/srs.ts';
import {
  createBoard,
  spawnPiece,
  tryMove,
  tryRotate,
  hardDrop,
  lockPiece,
} from '../core/srs.ts';
import { stampCells, cloneBoard } from '../core/engine.ts';
import { generateBag } from '../core/bag.ts';
import { OPENERS, bestBag2Route } from '../openers/decision.ts';
import { getOpenerSequence, createVisualizerState, getBag2Routes } from './visualizer.ts';

// ── Types ──

export interface DrillState {
  phase: 'playing' | 'success' | 'failed' | 'selecting' | 'bag1_complete';
  openerId: OpenerID;
  mirror: boolean;
  board: Board;
  activePiece: ActivePiece | null;
  holdPiece: PieceType | null;
  holdUsed: boolean;
  queue: PieceType[];
  piecesPlaced: number;
  bagPieces: PieceType[];
  guided: boolean;
  bagNumber: 1 | 2;
  routeIndex: number;         // Bag 2 route (-1 for Bag 1)
  targetPieceCount: number;   // how many pieces to place in current bag
  bag1Board: Board | null;    // board state after Bag 1 completion
}

export interface TargetPlacement {
  cells: { col: number; row: number }[];
  hint: string;
  supported: boolean; // false = target would float
  piece?: PieceType;  // which piece this target is for (used by getAllTargets)
}

// ── Constants ──

const MAX_BAG_ATTEMPTS = 1000;

// ── Helpers ──

/**
 * Check if a bag can be played using the opener's targets with a single hold.
 * Simulates processing pieces in bag order: each piece is either placed
 * (if its target is supported), held, or swapped with the current hold.
 */
function isBagPlayable(openerId: OpenerID, bag: PieceType[], mirror: boolean): boolean {
  const sequence = getOpenerSequence(openerId, mirror);
  const targetMap = new Map<PieceType, { col: number; row: number }[]>();
  for (const step of sequence.steps) {
    targetMap.set(step.piece, step.newCells);
  }

  let board: Board = createBoard();
  let hold: PieceType | null = null;
  let holdUsed = false;

  for (const pieceType of bag) {
    const target = targetMap.get(pieceType);
    if (target && isTargetSupported(board, target)) {
      board = stampCells(board, pieceType, target);
      holdUsed = false;
      continue;
    }
    if (!holdUsed) {
      if (hold === null) {
        hold = pieceType;
        holdUsed = true;
        continue;
      }
      const holdTarget = targetMap.get(hold);
      if (holdTarget && isTargetSupported(board, holdTarget)) {
        board = stampCells(board, hold, holdTarget);
        hold = pieceType;
        holdUsed = true;
        continue;
      }
    }
    return false;
  }
  return true;
}

/**
 * Check if a Bag 2 can be played using the route's targets with a single hold.
 * The hold piece from Bag 1 (e.g., L for Honey Cup) is already in hold when Bag 2 starts.
 * Routes may have a holdPlacement for it, or it may be placed as a regular placement.
 */
function isBag2Playable(
  openerId: OpenerID,
  mirror: boolean,
  routeIndex: number,
  bag: PieceType[],
  holdPiece: PieceType | null,
  bag1Board: Board,
): boolean {
  const routes = getBag2Routes(openerId, mirror);
  const route = routes[routeIndex];
  if (!route) return false;

  // Build target map from route placements
  const targetMap = new Map<PieceType, { col: number; row: number }[]>();
  for (const p of route.placements) {
    targetMap.set(p.piece, p.cells);
  }
  // Add holdPlacement to target map if it exists (this is where the Bag 1 hold piece goes)
  if (route.holdPlacement) {
    targetMap.set(route.holdPlacement.piece, route.holdPlacement.cells);
  }

  let board: Board = cloneBoard(bag1Board);
  let hold: PieceType | null = holdPiece;
  let holdUsed = false;

  for (const pieceType of bag) {
    const target = targetMap.get(pieceType);
    if (target && isTargetSupported(board, target)) {
      board = stampCells(board, pieceType, target);
      holdUsed = false;
      continue;
    }
    if (!holdUsed) {
      if (hold === null) {
        hold = pieceType;
        holdUsed = true;
        continue;
      }
      const holdTarget = targetMap.get(hold);
      if (holdTarget && isTargetSupported(board, holdTarget)) {
        board = stampCells(board, hold, holdTarget);
        hold = pieceType;
        holdUsed = true;
        continue;
      }
    }
    return false;
  }
  return true;
}

/**
 * Generate bags until one is buildable AND playable for the given opener.
 */
function generateBuildableBag(openerId: OpenerID): { bag: PieceType[]; mirror: boolean } {
  const def = OPENERS[openerId];
  for (let i = 0; i < MAX_BAG_ATTEMPTS; i++) {
    const bag = generateBag();
    if (def.canBuild(bag) && isBagPlayable(openerId, bag, false)) {
      return { bag, mirror: false };
    }
    if (def.canBuildMirror(bag) && isBagPlayable(openerId, bag, true)) {
      return { bag, mirror: true };
    }
  }
  throw new Error(`Could not generate playable bag for ${openerId} in ${MAX_BAG_ATTEMPTS} attempts`);
}

function spawnNextFromQueue(queue: PieceType[]): { piece: ActivePiece; remaining: PieceType[] } | null {
  if (queue.length === 0) return null;
  const [nextType, ...remaining] = queue;
  return { piece: spawnPiece(nextType!), remaining };
}

// ── Public API ──

export function createDrillState(openerId: OpenerID): DrillState {
  const { bag, mirror } = generateBuildableBag(openerId);
  const queue = [...bag];
  const spawn = spawnNextFromQueue(queue);
  // From a 7-bag with 1 hold, max 6 pieces end up on the board
  const targetPieceCount = bag.length - 1;

  return {
    phase: 'playing',
    openerId,
    mirror,
    board: createBoard(),
    activePiece: spawn ? spawn.piece : null,
    holdPiece: null,
    holdUsed: false,
    queue: spawn ? spawn.remaining : [],
    piecesPlaced: 0,
    bagPieces: [...bag],
    guided: true,
    bagNumber: 1,
    routeIndex: -1,
    targetPieceCount,
    bag1Board: null,
  };
}

export function createDrillStateWithBag(openerId: OpenerID, bag: PieceType[], mirror: boolean): DrillState {
  const queue = [...bag];
  const spawn = spawnNextFromQueue(queue);
  // From a 7-bag with 1 hold, max 6 pieces end up on the board
  const targetPieceCount = bag.length - 1;

  return {
    phase: 'playing',
    openerId,
    mirror,
    board: createBoard(),
    activePiece: spawn ? spawn.piece : null,
    holdPiece: null,
    holdUsed: false,
    queue: spawn ? spawn.remaining : [],
    piecesPlaced: 0,
    bagPieces: [...bag],
    guided: true,
    bagNumber: 1,
    routeIndex: -1,
    targetPieceCount,
    bag1Board: null,
  };
}

export function movePiece(state: DrillState, dx: number, dy: number): DrillState {
  if (state.phase !== 'playing' || !state.activePiece) return state;
  const moved = tryMove(state.board, state.activePiece, dx, dy);
  if (!moved) return state;
  return { ...state, activePiece: moved };
}

export function rotatePiece(state: DrillState, direction: 1 | -1): DrillState {
  if (state.phase !== 'playing' || !state.activePiece) return state;
  const rotated = tryRotate(state.board, state.activePiece, direction);
  if (!rotated) return state;
  return { ...state, activePiece: rotated };
}

export function hardDropPiece(state: DrillState): DrillState {
  if (state.phase !== 'playing' || !state.activePiece) return state;

  // Drop to bottom and lock
  const dropped = hardDrop(state.board, state.activePiece);
  const newBoard = lockPiece(state.board, dropped);
  const newPiecesPlaced = state.piecesPlaced + 1;

  // Check completion
  if (newPiecesPlaced >= state.targetPieceCount) {
    const completionState: DrillState = {
      ...state,
      board: newBoard,
      activePiece: null,
      piecesPlaced: newPiecesPlaced,
      holdUsed: false,
    };
    const matched = checkOpenerMatch(completionState);

    if (state.bagNumber === 1 && matched) {
      // Bag 1 success → transition to bag1_complete interstitial
      return {
        ...completionState,
        phase: 'bag1_complete',
        bag1Board: cloneBoard(newBoard),
      };
    }

    // Bag 2 completion or Bag 1 failure
    return {
      ...completionState,
      phase: matched ? 'success' : 'failed',
    };
  }

  // Spawn next piece
  const spawn = spawnNextFromQueue(state.queue);
  if (!spawn) {
    return {
      ...state,
      board: newBoard,
      activePiece: null,
      piecesPlaced: newPiecesPlaced,
      phase: 'failed',
    };
  }

  return {
    ...state,
    board: newBoard,
    activePiece: spawn.piece,
    queue: spawn.remaining,
    piecesPlaced: newPiecesPlaced,
    holdUsed: false,
  };
}

export function holdCurrentPiece(state: DrillState): DrillState {
  if (state.phase !== 'playing' || !state.activePiece) return state;
  if (state.holdUsed) return state; // Can only hold once per piece

  const currentType = state.activePiece.type;

  if (state.holdPiece === null) {
    // First hold: active goes to hold, spawn next from queue
    const spawn = spawnNextFromQueue(state.queue);
    if (!spawn) return state; // No pieces to spawn — can't hold
    return {
      ...state,
      holdPiece: currentType,
      activePiece: spawn.piece,
      queue: spawn.remaining,
      holdUsed: true,
    };
  }

  // Swap: active <-> hold
  const newActive = spawnPiece(state.holdPiece);
  return {
    ...state,
    holdPiece: currentType,
    activePiece: newActive,
    holdUsed: true,
  };
}

export function softDropPiece(state: DrillState): DrillState {
  if (state.phase !== 'playing' || !state.activePiece) return state;
  const moved = tryMove(state.board, state.activePiece, 0, 1);
  if (!moved) return state; // Already at bottom
  return { ...state, activePiece: moved };
}

export function checkOpenerMatch(state: DrillState): boolean {
  const expected = state.bagNumber === 2
    ? getExpectedBoardBag2(state.openerId, state.mirror, state.routeIndex)
    : getExpectedBoard(state.openerId, state.mirror, state.targetPieceCount);

  // Compare full board (not just rows 14-19)
  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < 10; col++) {
      const expectedFilled = expected[row]![col] !== null;
      const actualFilled = state.board[row]![col] !== null;
      if (expectedFilled !== actualFilled) return false;
    }
  }
  return true;
}

export function resetDrill(state: DrillState): DrillState {
  if (state.bagNumber === 2 && state.bag1Board) {
    // Reset Bag 2 only — restart from Bag 1 completion
    const queue = [...state.bagPieces];
    const spawn = spawnNextFromQueue(queue);
    return {
      phase: 'playing',
      openerId: state.openerId,
      mirror: state.mirror,
      board: cloneBoard(state.bag1Board),
      activePiece: spawn ? spawn.piece : null,
      holdPiece: state.holdPiece, // keep the hold piece from Bag 1
      holdUsed: false,
      queue: spawn ? spawn.remaining : [],
      piecesPlaced: 0,
      bagPieces: [...state.bagPieces],
      guided: state.guided,
      bagNumber: 2,
      routeIndex: state.routeIndex,
      targetPieceCount: state.targetPieceCount,
      bag1Board: state.bag1Board,
    };
  }

  // Reset Bag 1 — fresh start
  const queue = [...state.bagPieces];
  const spawn = spawnNextFromQueue(queue);

  return {
    phase: 'playing',
    openerId: state.openerId,
    mirror: state.mirror,
    board: createBoard(),
    activePiece: spawn ? spawn.piece : null,
    holdPiece: null,
    holdUsed: false,
    queue: spawn ? spawn.remaining : [],
    piecesPlaced: 0,
    bagPieces: [...state.bagPieces],
    guided: state.guided,
    bagNumber: 1,
    routeIndex: -1,
    targetPieceCount: state.targetPieceCount,
    bag1Board: null,
  };
}

export function toggleGuided(state: DrillState): DrillState {
  return { ...state, guided: !state.guided };
}

/**
 * Check if target cells are physically supported by the current board.
 * A tetromino is a rigid body — it needs at least ONE cell resting on
 * the floor (row 19) or an existing piece. Not every cell needs support.
 */
function isTargetSupported(board: Board, cells: { col: number; row: number }[]): boolean {
  const cellSet = new Set(cells.map((c) => `${c.col},${c.row}`));
  for (const { col, row } of cells) {
    const onFloor = row >= 19;
    const onPiece = row < 19 && board[row + 1]?.[col] !== null;
    // Cell below is NOT a sibling = this cell rests on floor or existing piece
    const belowIsSibling = row < 19 && cellSet.has(`${col},${row + 1}`);
    if (onFloor || (onPiece && !belowIsSibling)) return true;
  }
  return false;
}

export function getTargetPlacement(state: DrillState): TargetPlacement | null {
  if (!state.guided || state.phase !== 'playing' || !state.activePiece) return null;

  if (state.bagNumber === 2) {
    return getBag2TargetPlacement(state);
  }

  const sequence = getOpenerSequence(state.openerId, state.mirror);
  if (state.activePiece.type === sequence.holdPiece && state.holdPiece === null) return null;
  const placeableSteps = sequence.steps.slice(0, state.targetPieceCount);
  const step = placeableSteps.find((s) => s.piece === state.activePiece!.type);
  if (!step) return null;
  const supported = isTargetSupported(state.board, step.newCells);
  return { cells: step.newCells, hint: step.hint, supported };
}

/**
 * Get ALL remaining piece targets for the opener (the full shape).
 * Excludes pieces already locked on the board.
 */
export function getAllTargets(state: DrillState): TargetPlacement[] {
  if (!state.guided || state.phase !== 'playing') return [];

  if (state.bagNumber === 2) {
    return getBag2AllTargets(state);
  }

  const sequence = getOpenerSequence(state.openerId, state.mirror);
  const placeableSteps = sequence.steps.slice(0, state.targetPieceCount);
  const targets: TargetPlacement[] = [];

  for (const step of placeableSteps) {
    const alreadyPlaced = step.newCells.every(
      ({ col, row }) => state.board[row]?.[col] !== null,
    );
    if (alreadyPlaced) continue;

    const supported = isTargetSupported(state.board, step.newCells);
    targets.push({ cells: step.newCells, hint: step.hint, supported, piece: step.piece });
  }
  return targets;
}

export function getHoldSuggestion(state: DrillState): PieceType | null {
  if (!state.guided || state.phase !== 'playing' || !state.activePiece) return null;

  // No hold suggestion during Bag 2 (hold carries from Bag 1, no suggestion needed)
  if (state.bagNumber === 2) return null;

  const sequence = getOpenerSequence(state.openerId, state.mirror);
  if (state.activePiece.type === sequence.holdPiece && state.holdPiece === null) {
    return sequence.holdPiece;
  }
  return null;
}

/**
 * Get the expected board for comparison after a 7-bag drill.
 * With 7 bag pieces and 1 hold, only 6 end up on the board.
 * For openers with 7 placement steps (hold piece also placed via swap),
 * use the board after step 6 (not 7).
 */
export function getExpectedBoard(openerId: OpenerID, mirror: boolean, pieceCount: number = 6): Board {
  const seq = getOpenerSequence(openerId, mirror);
  // Use pieceCount to determine which step's board to return
  const stepIndex = Math.min(seq.steps.length, pieceCount) - 1;
  const step = seq.steps[stepIndex];
  if (!step) return createBoard();
  return step.board.map((row) => [...row]);
}

/**
 * Get the expected board after Bag 2 completion.
 * Uses the visualizer's final step board for the given route.
 */
export function getExpectedBoardBag2(openerId: OpenerID, mirror: boolean, routeIndex: number): Board {
  const vizState = createVisualizerState(openerId, mirror, routeIndex);
  const lastStep = vizState.steps[vizState.steps.length - 1];
  if (!lastStep) return createBoard();
  return lastStep.board.map((row) => [...row]);
}

// ── Bag 2 Helpers ──

function getBag2Steps(openerId: OpenerID, mirror: boolean, routeIndex: number) {
  const vizState = createVisualizerState(openerId, mirror, routeIndex);
  // Bag 2 steps = everything after bag1End
  return vizState.steps.slice(vizState.bag1End);
}

function getBag2TargetPlacement(state: DrillState): TargetPlacement | null {
  if (!state.activePiece) return null;
  const steps = getBag2Steps(state.openerId, state.mirror, state.routeIndex);
  const step = steps.find((s) => s.piece === state.activePiece!.type);
  if (!step) return null;
  // For Bag 2, cells may overlap with Bag 1 board — only show cells that are new (empty on board)
  const newCells = step.newCells.filter(({ col, row }) => state.board[row]?.[col] === null);
  if (newCells.length === 0) return null;
  const supported = isTargetSupported(state.board, newCells);
  return { cells: newCells, hint: step.hint, supported, piece: step.piece };
}

function getBag2AllTargets(state: DrillState): TargetPlacement[] {
  const steps = getBag2Steps(state.openerId, state.mirror, state.routeIndex);
  const targets: TargetPlacement[] = [];

  for (const step of steps) {
    // Only show cells that aren't yet placed
    const newCells = step.newCells.filter(({ col, row }) => state.board[row]?.[col] === null);
    if (newCells.length === 0) continue;

    const supported = isTargetSupported(state.board, newCells);
    targets.push({ cells: newCells, hint: step.hint, supported, piece: step.piece });
  }
  return targets;
}

/**
 * Transition from Bag 1 complete to Bag 2 playing.
 * Generates a new 7-bag, selects the best route, and sets up the Bag 2 drill.
 */
export function transitionToBag2(state: DrillState): DrillState {
  if (state.phase !== 'bag1_complete') return state;

  const bag1Board = state.bag1Board ?? state.board;

  // Generate a playable Bag 2 with retry loop
  let bag2: PieceType[] | null = null;
  let chosenRouteIndex = 0;

  for (let i = 0; i < MAX_BAG_ATTEMPTS; i++) {
    const candidate = generateBag();
    const { routeIndex: ri } = bestBag2Route(state.openerId, state.mirror, candidate);
    if (isBag2Playable(state.openerId, state.mirror, ri, candidate, state.holdPiece, bag1Board)) {
      bag2 = candidate;
      chosenRouteIndex = ri;
      break;
    }
  }

  // Fallback: use last generated bag even if not verified playable
  if (!bag2) {
    bag2 = generateBag();
    const { routeIndex: ri } = bestBag2Route(state.openerId, state.mirror, bag2);
    chosenRouteIndex = ri;
  }

  // Count how many pieces to place: route placements + holdPlacement if exists
  const bag2Steps = getBag2Steps(state.openerId, state.mirror, chosenRouteIndex);
  const targetPieceCount = bag2Steps.length;

  const queue = [...bag2];
  const spawn = spawnNextFromQueue(queue);

  return {
    phase: 'playing',
    openerId: state.openerId,
    mirror: state.mirror,
    board: cloneBoard(state.board), // continue on same board
    activePiece: spawn ? spawn.piece : null,
    holdPiece: state.holdPiece, // carry hold piece from Bag 1
    holdUsed: false,
    queue: spawn ? spawn.remaining : [],
    piecesPlaced: 0,
    bagPieces: [...bag2],
    guided: state.guided,
    bagNumber: 2,
    routeIndex: chosenRouteIndex,
    targetPieceCount,
    bag1Board: state.bag1Board,
  };
}

/**
 * Get the route label for display during Bag 2.
 */
export function getBag2RouteLabel(state: DrillState): string | null {
  if (state.bagNumber !== 2 || state.routeIndex < 0) return null;
  const routes = getBag2Routes(state.openerId, state.mirror);
  const route = routes[state.routeIndex];
  return route?.routeLabel ?? null;
}
