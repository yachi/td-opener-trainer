import type { PieceType } from './types';
import { BOARD_WIDTH, BOARD_VISIBLE_HEIGHT } from './types';
import { PIECE_DEFINITIONS } from './pieces';

// ── Types ──

export type Board = ReadonlyArray<ReadonlyArray<PieceType | null>>;

type MutableBoard = (PieceType | null)[][];

export interface ActivePiece {
  type: PieceType;
  rotation: 0 | 1 | 2 | 3;
  col: number;
  row: number;
}

// ── SRS Kick Tables ──
// Convention: [dx, dy] where +dx = right, +dy = DOWN (row 0 = top)

type KickKey = `${0 | 1 | 2 | 3}->${0 | 1 | 2 | 3}`;
type KickTable = Record<KickKey, readonly [number, number][]>;

const JLSZT_KICKS: KickTable = {
  '0->1': [[0, 0], [-1, 0], [-1, -1], [0, +2], [-1, +2]],
  '1->0': [[0, 0], [+1, 0], [+1, +1], [0, -2], [+1, -2]],
  '1->2': [[0, 0], [+1, 0], [+1, +1], [0, -2], [+1, -2]],
  '2->1': [[0, 0], [-1, 0], [-1, -1], [0, +2], [-1, +2]],
  '2->3': [[0, 0], [+1, 0], [+1, -1], [0, +2], [+1, +2]],
  '3->2': [[0, 0], [-1, 0], [-1, +1], [0, -2], [-1, -2]],
  '3->0': [[0, 0], [-1, 0], [-1, +1], [0, -2], [-1, -2]],
  '0->3': [[0, 0], [+1, 0], [+1, -1], [0, +2], [+1, +2]],
};

const I_KICKS: KickTable = {
  '0->1': [[0, 0], [-2, 0], [+1, 0], [-2, +1], [+1, -2]],
  '1->0': [[0, 0], [+2, 0], [-1, 0], [+2, -1], [-1, +2]],
  '1->2': [[0, 0], [-1, 0], [+2, 0], [-1, -2], [+2, +1]],
  '2->1': [[0, 0], [+1, 0], [-2, 0], [+1, +2], [-2, -1]],
  '2->3': [[0, 0], [+2, 0], [-1, 0], [+2, -1], [-1, +2]],
  '3->2': [[0, 0], [-2, 0], [+1, 0], [-2, +1], [+1, -2]],
  '3->0': [[0, 0], [+1, 0], [-2, 0], [+1, +2], [-2, -1]],
  '0->3': [[0, 0], [-1, 0], [+2, 0], [-1, -2], [+2, +1]],
};

const O_KICKS: KickTable = {
  '0->1': [[0, 0]],
  '1->0': [[0, 0]],
  '1->2': [[0, 0]],
  '2->1': [[0, 0]],
  '2->3': [[0, 0]],
  '3->2': [[0, 0]],
  '3->0': [[0, 0]],
  '0->3': [[0, 0]],
};

function getKickTable(type: PieceType): KickTable {
  if (type === 'I') return I_KICKS;
  if (type === 'O') return O_KICKS;
  return JLSZT_KICKS;
}

// ── Board ──

export function createBoard(): Board {
  const board: MutableBoard = Array.from({ length: BOARD_VISIBLE_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null)
  );
  return board;
}

// ── Piece Cells ──

export function getPieceCells(piece: ActivePiece): { col: number; row: number }[] {
  const def = PIECE_DEFINITIONS[piece.type];
  const offsets = def.cells[piece.rotation];
  return offsets.map(([dc, dr]) => ({
    col: piece.col + dc,
    row: piece.row + dr,
  }));
}

// ── Collision Detection ──

export function isValidPosition(board: Board, piece: ActivePiece): boolean {
  const cells = getPieceCells(piece);
  for (const { col, row } of cells) {
    // Out of bounds horizontally
    if (col < 0 || col >= BOARD_WIDTH) return false;
    // Below bottom
    if (row >= BOARD_VISIBLE_HEIGHT) return false;
    // Above top is OK (buffer zone), skip board check
    if (row < 0) continue;
    // Overlapping locked cell
    if (board[row][col] !== null) return false;
  }
  return true;
}

// ── Movement ──

export function tryMove(board: Board, piece: ActivePiece, dx: number, dy: number): ActivePiece | null {
  const moved: ActivePiece = {
    ...piece,
    col: piece.col + dx,
    row: piece.row + dy,
  };
  return isValidPosition(board, moved) ? moved : null;
}

// ── Rotation with SRS Kicks ──

export function tryRotate(board: Board, piece: ActivePiece, direction: 1 | -1): ActivePiece | null {
  const newRotation = ((piece.rotation + direction + 4) % 4) as 0 | 1 | 2 | 3;
  const kickKey = `${piece.rotation}->${newRotation}` as KickKey;
  const kicks = getKickTable(piece.type)[kickKey];

  for (const [dx, dy] of kicks) {
    const candidate: ActivePiece = {
      ...piece,
      rotation: newRotation,
      col: piece.col + dx,
      row: piece.row + dy,
    };
    if (isValidPosition(board, candidate)) {
      return candidate;
    }
  }
  return null;
}

// ── Hard Drop ──

export function hardDrop(board: Board, piece: ActivePiece): ActivePiece {
  let current = piece;
  while (true) {
    const next = tryMove(board, current, 0, 1);
    if (!next) return current;
    current = next;
  }
}

// ── Lock Piece ──

export function lockPiece(board: Board, piece: ActivePiece): Board {
  const newBoard: MutableBoard = board.map(row => [...row]);
  const cells = getPieceCells(piece);
  for (const { col, row } of cells) {
    if (row >= 0 && row < BOARD_VISIBLE_HEIGHT && col >= 0 && col < BOARD_WIDTH) {
      newBoard[row]![col] = piece.type;
    }
  }
  return newBoard;
}

// ── Spawn ──

export function spawnPiece(type: PieceType): ActivePiece {
  return {
    type,
    rotation: 0,
    col: 3,
    row: 0,
  };
}

// ── Ghost Piece ──

export function getGhostPosition(board: Board, piece: ActivePiece): ActivePiece {
  return hardDrop(board, piece);
}
