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
import { generateBag } from '../core/bag.ts';
import { OPENERS } from '../openers/decision.ts';
import { getOpenerSequence } from './visualizer.ts';

// ── Types ──

export interface DrillState {
  phase: 'playing' | 'success' | 'failed' | 'selecting';
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

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

/**
 * Simulate whether a bag can be placed using the opener's placement order
 * with a single hold. Returns true if every piece can either:
 * - Be placed at its target (target is supported by current board), or
 * - Be held (hold is empty), or
 * - Be swapped with hold (and the swapped piece can be placed)
 */
function isBagPlayable(openerId: OpenerID, bag: PieceType[], mirror: boolean): boolean {
  const sequence = getOpenerSequence(openerId, mirror);
  const holdPieceType = sequence.holdPiece;

  // Build a map: piece type → target cells
  const targetMap = new Map<PieceType, { col: number; row: number }[]>();
  for (const step of sequence.steps) {
    targetMap.set(step.piece, step.newCells);
  }

  const board: (PieceType | null)[][] = Array.from({ length: 20 }, () =>
    Array.from({ length: 10 }, () => null),
  );
  let hold: PieceType | null = null;
  let holdUsed = false;

  for (const pieceType of bag) {
    const target = targetMap.get(pieceType);

    // Can this piece be placed now?
    if (target && isTargetSupported(board, target)) {
      // Place it
      for (const { col, row } of target) {
        board[row]![col] = pieceType;
      }
      holdUsed = false;
      continue;
    }

    // Can't place — try hold
    if (!holdUsed) {
      if (hold === null) {
        // First hold: stash this piece
        hold = pieceType;
        holdUsed = true;
        continue;
      }
      // Swap with hold
      const holdTarget = targetMap.get(hold);
      if (holdTarget && isTargetSupported(board, holdTarget)) {
        // Place the held piece, hold the current one
        for (const { col, row } of holdTarget) {
          board[row]![col] = hold;
        }
        hold = pieceType;
        holdUsed = true;
        continue;
      }
    }

    // Can't place and can't hold — bag is unplayable
    return false;
  }
  return true;
}

/**
 * Generate bags until one is buildable AND playable for the given opener.
 * Playable = pieces can be placed in bag order using one hold.
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
  };
}

export function createDrillStateWithBag(openerId: OpenerID, bag: PieceType[], mirror: boolean): DrillState {
  const queue = [...bag];
  const spawn = spawnNextFromQueue(queue);

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
  const newBoard = lockPiece(cloneBoard(state.board), dropped);
  const newPiecesPlaced = state.piecesPlaced + 1;

  // Check completion: 6 pieces placed (+ 1 held = 7 bag pieces)
  if (newPiecesPlaced >= 6) {
    const completionState: DrillState = {
      ...state,
      board: newBoard,
      activePiece: null,
      piecesPlaced: newPiecesPlaced,
      holdUsed: false,
    };
    const matched = checkOpenerMatch(completionState);
    return {
      ...completionState,
      phase: matched ? 'success' : 'failed',
    };
  }

  // Spawn next piece
  const spawn = spawnNextFromQueue(state.queue);
  if (!spawn) {
    // No pieces left but haven't placed 6 — shouldn't happen with a 7-bag
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
  const expected = getExpectedBoard(state.openerId, state.mirror);

  // Compare shapes: check bottom 6 rows (rows 14-19) where opener pieces live
  for (let row = 14; row < 20; row++) {
    for (let col = 0; col < 10; col++) {
      const expectedFilled = expected[row]![col] !== null;
      const actualFilled = state.board[row]![col] !== null;
      if (expectedFilled !== actualFilled) return false;
    }
  }
  return true;
}

export function resetDrill(state: DrillState): DrillState {
  // Same opener + same bag, fresh start
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
  const sequence = getOpenerSequence(state.openerId, state.mirror);
  if (state.activePiece.type === sequence.holdPiece && state.holdPiece === null) return null;
  // Cap at 6 steps — with 7-bag + hold, only 6 can be placed
  const placeableSteps = sequence.steps.slice(0, 6);
  const step = placeableSteps.find((s) => s.piece === state.activePiece!.type);
  if (!step) return null;
  const supported = isTargetSupported(state.board, step.newCells);
  return { cells: step.newCells, hint: step.hint, supported };
}

/**
 * Get ALL remaining piece targets for the opener (the full shape).
 * Excludes pieces already locked on the board.
 * Capped at 6 steps (max placeable with 7-bag + hold).
 */
export function getAllTargets(state: DrillState): TargetPlacement[] {
  if (!state.guided || state.phase !== 'playing') return [];
  const sequence = getOpenerSequence(state.openerId, state.mirror);
  const placeableSteps = sequence.steps.slice(0, 6);
  const targets: TargetPlacement[] = [];

  for (const step of placeableSteps) {
    // Skip pieces already placed (check if the target cells are already filled)
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
export function getExpectedBoard(openerId: OpenerID, mirror: boolean): Board {
  const seq = getOpenerSequence(openerId, mirror);
  // Max 6 pieces can be placed from a 7-bag with hold
  const stepIndex = Math.min(seq.steps.length, 6) - 1;
  const step = seq.steps[stepIndex];
  if (!step) return createBoard();
  return step.board.map((row) => [...row]);
}
