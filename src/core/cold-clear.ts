/**
 * Move finder ported from Cold Clear's libtetris.
 *
 * Uses BFS to find all reachable lock positions for a given piece type
 * on a given board, respecting SRS rotation and wall kicks.
 *
 * Coordinate system matches our existing srs.ts:
 *   row 0 = top, row 19 = bottom, col 0 = left, col 9 = right.
 *   Piece anchor = top-left of bounding box.
 *
 * Reference: https://github.com/MinusKelvin/cold-clear/blob/master/libtetris/src/moves.rs
 */

import type { PieceType } from './types';
import { BOARD_WIDTH, BOARD_VISIBLE_HEIGHT } from './types';
import type { Board, ActivePiece } from './srs';
import {
  createBoard,
  getPieceCells,
  isValidPosition,
  tryMove,
  tryRotate,
  hardDrop,
  lockPiece,
  spawnPiece,
} from './srs';

// ── Types ──

export interface Placement {
  /** The piece state at lock position (after hard drop). */
  piece: ActivePiece;
  /** The cells this piece occupies on the board. */
  cells: { col: number; row: number }[];
}

// ── Helpers ──

/** Encode piece state as a string for Set-based visited tracking. */
function pieceKey(p: ActivePiece): string {
  return `${p.type}:${p.rotation}:${p.col}:${p.row}`;
}

/**
 * Canonical key for a lock position.
 *
 * Two placements that cover the same cells are considered identical.
 * For O/S/Z/I pieces, different rotation+position combos can produce
 * identical cell sets (e.g., O in any rotation, S north vs S 180°+shift).
 * We canonicalise by sorting cells.
 */
function lockKey(p: ActivePiece): string {
  const cells = getPieceCells(p);
  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  return cells.map(c => `${c.col},${c.row}`).join('|');
}

/** Check whether a piece is resting on the stack or floor (can lock). */
function isOnStack(board: Board, piece: ActivePiece): boolean {
  return tryMove(board, piece, 0, 1) === null;
}

// ── Core: find all reachable placements ──

/**
 * BFS from spawn position to discover every position where `pieceType`
 * can be locked.
 *
 * Explores: left, right, soft-drop (1 row), CW rotation, CCW rotation.
 * Each reachable position that rests on the stack produces a Placement.
 *
 * This is the "ZeroGComplete" mode from Cold Clear — it explores all
 * positions including above-stack movements, which is the safest default
 * for finding all theoretically reachable placements.
 */
export function findAllPlacements(board: Board, pieceType: PieceType): Placement[] {
  const spawn = spawnPiece(pieceType);

  // If spawn is obstructed, no placements possible
  if (!isValidPosition(board, spawn)) {
    return [];
  }

  const visited = new Set<string>();
  const locks = new Map<string, Placement>();
  const queue: ActivePiece[] = [];

  // Enqueue spawn
  visited.add(pieceKey(spawn));
  queue.push(spawn);

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];

    // Try locking at current position (hard-drop from here)
    const dropped = hardDrop(board, current);
    const lk = lockKey(dropped);
    if (!locks.has(lk)) {
      // Only record if at least one cell is visible (row < 20)
      const cells = getPieceCells(dropped);
      if (cells.some(c => c.row >= 0 && c.row < BOARD_VISIBLE_HEIGHT)) {
        locks.set(lk, { piece: dropped, cells });
      }
    }

    // Explore neighbours: left, right, soft-drop, CW, CCW
    const neighbours: (ActivePiece | null)[] = [
      tryMove(board, current, -1, 0), // left
      tryMove(board, current, 1, 0),  // right
      tryMove(board, current, 0, 1),  // soft drop
      tryRotate(board, current, 1),   // CW
      tryRotate(board, current, -1),  // CCW
    ];

    for (const next of neighbours) {
      if (next === null) continue;
      const key = pieceKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(next);
    }
  }

  return Array.from(locks.values());
}

/**
 * Check whether a specific target placement is reachable from spawn.
 *
 * Finds all placements and checks whether any matches the target.
 */
export function isPlacementReachable(
  board: Board,
  pieceType: PieceType,
  targetCol: number,
  targetRow: number,
  targetRotation: 0 | 1 | 2 | 3,
): boolean {
  const target: ActivePiece = {
    type: pieceType,
    rotation: targetRotation,
    col: targetCol,
    row: targetRow,
  };
  const targetCells = getPieceCells(target);
  targetCells.sort((a, b) => a.row - b.row || a.col - b.col);
  const targetKey = targetCells.map(c => `${c.col},${c.row}`).join('|');

  const placements = findAllPlacements(board, pieceType);
  return placements.some(p => {
    const cells = [...p.cells];
    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    const key = cells.map(c => `${c.col},${c.row}`).join('|');
    return key === targetKey;
  });
}

// ── Board utilities (complement to srs.ts) ──

/**
 * Lock a piece and clear completed lines. Returns the new board and
 * number of lines cleared.
 *
 * Unlike srs.ts lockPiece (which mutates and doesn't clear lines),
 * this creates a fresh board with line clearing applied.
 */
export function lockAndClear(
  board: Board,
  piece: ActivePiece,
): { board: Board; linesCleared: number } {
  // Deep-copy the board
  const newBoard: Board = board.map(row => [...row]);

  // Place piece cells
  const cells = getPieceCells(piece);
  for (const { col, row } of cells) {
    if (row >= 0 && row < BOARD_VISIBLE_HEIGHT && col >= 0 && col < BOARD_WIDTH) {
      newBoard[row][col] = piece.type;
    }
  }

  // Remove full lines
  let linesCleared = 0;
  for (let row = BOARD_VISIBLE_HEIGHT - 1; row >= 0; row--) {
    if (newBoard[row].every(cell => cell !== null)) {
      newBoard.splice(row, 1);
      linesCleared++;
    }
  }

  // Add empty lines at top
  while (newBoard.length < BOARD_VISIBLE_HEIGHT) {
    newBoard.unshift(Array.from({ length: BOARD_WIDTH }, () => null));
  }

  return { board: newBoard, linesCleared };
}

/**
 * Get column heights (0-indexed from bottom).
 * columnHeights[col] = number of filled cells from bottom in that column.
 */
export function getColumnHeights(board: Board): number[] {
  const heights: number[] = new Array(BOARD_WIDTH).fill(0);
  for (let col = 0; col < BOARD_WIDTH; col++) {
    for (let row = 0; row < BOARD_VISIBLE_HEIGHT; row++) {
      if (board[row][col] !== null) {
        heights[col] = BOARD_VISIBLE_HEIGHT - row;
        break;
      }
    }
  }
  return heights;
}

// Re-export board utilities for convenience
export { createBoard, isValidPosition, getPieceCells, hardDrop, spawnPiece };
export type { Board, ActivePiece };
