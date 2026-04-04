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
}

// ── Constants ──

const MAX_BAG_ATTEMPTS = 1000;

// ── Helpers ──

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

/**
 * Generate bags until one is buildable for the given opener.
 * Returns { bag, mirror } or throws if no buildable bag found.
 */
function generateBuildableBag(openerId: OpenerID): { bag: PieceType[]; mirror: boolean } {
  const def = OPENERS[openerId];
  for (let i = 0; i < MAX_BAG_ATTEMPTS; i++) {
    const bag = generateBag();
    if (def.canBuild(bag)) return { bag, mirror: false };
    if (def.canBuildMirror(bag)) return { bag, mirror: true };
  }
  // Fallback — should be statistically impossible for 100% openers
  throw new Error(`Could not generate buildable bag for ${openerId} in ${MAX_BAG_ATTEMPTS} attempts`);
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
  };
}

export function getExpectedBoard(openerId: OpenerID, mirror: boolean): Board {
  const seq = getOpenerSequence(openerId, mirror);
  const lastStep = seq.steps[seq.steps.length - 1];
  if (!lastStep) return createBoard();
  // Convert (PieceType | null)[][] to Board (same type)
  return lastStep.board.map((row) => [...row]);
}
