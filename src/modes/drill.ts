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
import { stampCells, cloneBoard, buildSteps, isPlacementReachable } from '../core/engine.ts';
import type { Step } from '../core/engine.ts';
import { generateBag } from '../core/bag.ts';
import { OPENERS, bestBag2Route } from '../openers/decision.ts';
import { OPENER_PLACEMENT_DATA, mirrorPlacementData } from '../openers/placements.ts';
import { getBag2Routes } from '../openers/bag2-routes.ts';

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
  cachedSteps: Step[] | null; // lazy-computed steps (invalidated on new state)
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
 * Build opener steps for Bag 1 using placement data directly (no getOpenerSequence).
 */
function buildBag1Steps(openerId: OpenerID, mirror: boolean): Step[] {
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  return buildSteps(data.placements);
}

/**
 * Check if a bag can be played using the opener's targets with a single hold.
 * Simulates processing pieces in bag order: each piece is either placed
 * (if its target is supported), held, or swapped with the current hold.
 */
function isBagPlayable(openerId: OpenerID, bag: PieceType[], mirror: boolean): boolean {
  const steps = buildBag1Steps(openerId, mirror);
  const targetMap = new Map<PieceType, { col: number; row: number }[]>();
  for (const step of steps) {
    targetMap.set(step.piece, step.newCells);
  }

  let board: Board = createBoard();
  let hold: PieceType | null = null;
  let holdUsed = false;

  for (const pieceType of bag) {
    const target = targetMap.get(pieceType);
    if (target && isPlacementReachable(board, pieceType, target)) {
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
      if (holdTarget && isPlacementReachable(board, hold!, holdTarget)) {
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
    if (target && isPlacementReachable(board, pieceType, target)) {
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
      if (holdTarget && isPlacementReachable(board, hold!, holdTarget)) {
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
  // Derive from placement data: 7 for Honey Cup/Gamushiro, 6 for MS2/Stray Cannon
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const targetPieceCount = data.placements.length;

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
    cachedSteps: null,
  };
}

export function createDrillStateWithBag(openerId: OpenerID, bag: PieceType[], mirror: boolean): DrillState {
  const queue = [...bag];
  const spawn = spawnNextFromQueue(queue);
  // Derive from placement data: 7 for Honey Cup/Gamushiro, 6 for MS2/Stray Cannon
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const targetPieceCount = data.placements.length;

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
    cachedSteps: null,
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
      cachedSteps: null,
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
      cachedSteps: null,
    };
  }

  return {
    ...state,
    board: newBoard,
    activePiece: spawn.piece,
    queue: spawn.remaining,
    piecesPlaced: newPiecesPlaced,
    holdUsed: false,
    cachedSteps: null,
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
  const expected = getExpectedBoard(state);

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
      cachedSteps: null,
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
    cachedSteps: null,
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

// ── Unified Step Source ──

/**
 * Compute drill steps for both Bag 1 and Bag 2.
 * Bag 1: buildSteps from opener placement data, sliced to targetPieceCount.
 * Bag 2: buildSteps from route placements on the player's actual bag1Board.
 */
function getDrillSteps(state: DrillState): Step[] {
  if (state.bagNumber === 2) {
    if (!state.bag1Board) return [];
    const routes = getBag2Routes(state.openerId, state.mirror);
    const route = routes[state.routeIndex];
    if (!route) return [];
    const allPlacements = [
      ...(route.holdPlacement ? [route.holdPlacement] : []),
      ...route.placements,
    ];
    return buildSteps(allPlacements, state.bag1Board);
  }
  // Bag 1
  const steps = buildBag1Steps(state.openerId, state.mirror);
  return steps.slice(0, state.targetPieceCount);
}

/**
 * Lazy-cached steps. The cache auto-invalidates because DrillState is
 * immutable — every state-changing function returns a new object without
 * cachedSteps, so the next call recomputes.
 */
function getCachedSteps(state: DrillState): Step[] {
  if (!state.cachedSteps) {
    // Mutate the cache slot on first access (safe: same object, no structural change)
    (state as { cachedSteps: Step[] | null }).cachedSteps = getDrillSteps(state);
  }
  return state.cachedSteps!;
}

export function getTargetPlacement(state: DrillState): TargetPlacement | null {
  if (!state.guided || state.phase !== 'playing' || !state.activePiece) return null;

  const pieceType = state.activePiece.type;

  // Bag 1 hold-piece check: don't show target for the piece being held
  if (state.bagNumber === 1) {
    const def = OPENERS[state.openerId];
    const holdPiece = state.mirror ? def.holdPieceMirror : def.holdPiece;
    if (pieceType === holdPiece && state.holdPiece === null) return null;
  }

  const steps = getCachedSteps(state);
  const step = steps.find((s) => s.piece === pieceType);
  if (!step) return null;

  // Filter out cells already placed on the board
  const cells = step.newCells.filter(({ col, row }) => state.board[row]?.[col] === null);
  if (cells.length === 0) return null;

  const supported = isTargetSupported(state.board, cells);
  return { piece: pieceType, cells, hint: step.hint, supported };
}

/**
 * Get ALL remaining piece targets for the opener (the full shape).
 * Excludes pieces already locked on the board.
 */
export function getAllTargets(state: DrillState): TargetPlacement[] {
  if (!state.guided || state.phase !== 'playing') return [];

  const steps = getCachedSteps(state);
  const targets: TargetPlacement[] = [];

  for (const step of steps) {
    const cells = step.newCells.filter(({ col, row }) => state.board[row]?.[col] === null);
    if (cells.length === 0) continue;

    const supported = isTargetSupported(state.board, cells);
    targets.push({ cells, hint: step.hint, supported, piece: step.piece });
  }
  return targets;
}

export function getHoldSuggestion(state: DrillState): PieceType | null {
  if (!state.guided || state.phase !== 'playing' || !state.activePiece) return null;

  // No hold suggestion during Bag 2 (hold carries from Bag 1, no suggestion needed)
  if (state.bagNumber === 2) return null;

  const def = OPENERS[state.openerId];
  const holdPiece = state.mirror ? def.holdPieceMirror : def.holdPiece;
  if (state.activePiece.type === holdPiece && state.holdPiece === null) {
    return holdPiece;
  }
  return null;
}

/**
 * Get the expected board after completing the current bag.
 * Uses cached steps — no redundant BFS.
 */
export function getExpectedBoard(state: DrillState): Board {
  const steps = getCachedSteps(state);
  const lastStep = steps[steps.length - 1];
  if (!lastStep) {
    return state.bagNumber === 2 && state.bag1Board
      ? cloneBoard(state.bag1Board)
      : createBoard();
  }
  return lastStep.board.map((row) => [...row]);
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
  const routes = getBag2Routes(state.openerId, state.mirror);
  const route = routes[chosenRouteIndex];
  const targetPieceCount = route
    ? (route.holdPlacement ? 1 : 0) + route.placements.length
    : 0;

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
    cachedSteps: null,
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
