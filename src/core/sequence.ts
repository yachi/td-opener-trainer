/**
 * sequence.ts — Board state builder using the SRS engine.
 *
 * Every placement is verified reachable from spawn via Cold Clear's BFS.
 * Pieces that can't reach their target yet are deferred until support exists.
 * No heuristics. No manual ordering. The engine decides.
 */

import type { PieceType } from './types.ts';
import { BOARD_WIDTH, BOARD_VISIBLE_HEIGHT } from './types.ts';
import { findAllPlacements } from './cold-clear.ts';
import type { Board } from './srs.ts';

// ── Types ──

export type { Board };

export interface Placement {
  piece: PieceType;
  cells: { col: number; row: number }[];
  hint: string;
}

export interface Step {
  piece: PieceType;
  board: Board;
  newCells: { col: number; row: number }[];
  hint: string;
}

// ── Board primitives ──

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_VISIBLE_HEIGHT }, () =>
    new Array<PieceType | null>(BOARD_WIDTH).fill(null),
  );
}

export function cloneBoard(b: Board): Board {
  return b.map(r => [...r]);
}

// ── SRS reachability check ──

function canReach(board: Board, piece: PieceType, targetCells: { col: number; row: number }[]): boolean {
  const targetSet = new Set(targetCells.map(c => `${c.col},${c.row}`));
  const reachable = findAllPlacements(board, piece);
  return reachable.some(p => {
    const cellSet = new Set(p.cells.map((c: { col: number; row: number }) => `${c.col},${c.row}`));
    return targetSet.size === cellSet.size && [...targetSet].every(k => cellSet.has(k));
  });
}

// ── The builder: SRS-reachability-sorted placement ──

/**
 * Build board states from placements, ordered by SRS reachability.
 *
 * For each round: try to place every remaining piece. A piece is placed
 * if (1) all its cells are empty and (2) it's reachable from spawn via
 * Cold Clear's BFS (which accounts for SRS kicks, gravity, and support).
 * Pieces that can't be placed yet are deferred to the next round.
 *
 * This eliminates ALL manual ordering fields (holdInsertIndex, bag1PieceCount).
 * The engine determines the correct order automatically.
 */
export function buildSteps(placements: Placement[]): Step[] {
  const steps: Step[] = [];
  let board = emptyBoard();
  let remaining = [...placements];

  while (remaining.length > 0) {
    let progress = false;
    const deferred: Placement[] = [];

    for (const p of remaining) {
      const allEmpty = p.cells.every(c => board[c.row]?.[c.col] === null);

      if (allEmpty && canReach(board, p.piece, p.cells)) {
        board = cloneBoard(board);
        for (const c of p.cells) board[c.row]![c.col] = p.piece;
        steps.push({
          piece: p.piece,
          board: cloneBoard(board),
          newCells: [...p.cells],
          hint: p.hint,
        });
        progress = true;
      } else {
        deferred.push(p);
      }
    }

    remaining = deferred;
    if (!progress) break;
  }

  return steps;
}
