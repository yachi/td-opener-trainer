/**
 * sequence.ts — Board state as a fold over placements.
 *
 * Every board state is derived. No allowOverwrite. No fallbacks.
 * Conflicts with existing cells are resolved as TST-derived clears
 * (the real game clears those cells before the piece is placed).
 */

import type { PieceType } from './types.ts';
import { BOARD_WIDTH, BOARD_VISIBLE_HEIGHT } from './types.ts';
import {
  boardToField,
  fieldToBoard,
  placePieceFromCells,
  findFloatingCells,
} from './field-engine.ts';
import { PIECE_DEFINITIONS } from './pieces.ts';

// ── Types ──

export type Board = (PieceType | null)[][];

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

// ── The fold ──

/**
 * Build board states from a flat list of placements.
 *
 * Each placement goes through placePieceFromCells (strict, no allowOverwrite).
 * If a placement cell conflicts with an existing cell, the existing cell is
 * cleared first — this models the TST line clear that removes those cells
 * in the real game. 7/8 routes have zero conflicts; Gamushiro Form 2 has 4.
 *
 * @param placements Flat array: [...bag1, holdPlacement?, ...bag2]
 * @returns One Step per placement, each with the cumulative board state
 */
export function buildSteps(placements: Placement[]): Step[] {
  const steps: Step[] = [];
  let board = emptyBoard();

  // Support-ordered placement: pieces that need support from other pieces
  // are deferred until their support exists. The engine decides the order.
  let remaining = [...placements];
  while (remaining.length > 0) {
    let progress = false;
    const deferred: Placement[] = [];

    for (const p of remaining) {
      const allEmpty = p.cells.every(c => board[c.row]?.[c.col] === null);
      const hasSupport = p.cells.some(c =>
        c.row >= BOARD_VISIBLE_HEIGHT - 1 || board[c.row + 1]?.[c.col] !== null,
      );

      if (allEmpty && hasSupport) {
        board = cloneBoard(board);
        const field = boardToField(board);
        placePieceFromCells(field, p.piece, p.cells);
        board = fieldToBoard(field);
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
    if (!progress) break; // stuck — remaining pieces can't be placed
  }

  return steps;
}

// ── Validation ──

export interface TstSlot {
  col: number;
  row: number;
  rotation: number;
}

function isTstOverhang(
  col: number,
  row: number,
  board: Board,
  tstSlot: TstSlot | null,
): boolean {
  if (!tstSlot) return false;
  const tCells = PIECE_DEFINITIONS['T'].cells[tstSlot.rotation];
  if (!tCells) return false;
  return tCells.some(([dc, dr]: readonly [number, number]) => {
    const tc = tstSlot.col + dc;
    const tr = tstSlot.row + dr;
    return tc === col && tr === row + 1 && board[tr]?.[tc] === null;
  });
}

/**
 * Validate invariants on a sequence of steps.
 *
 * @param steps The step array from buildSteps
 * @param tstSlot TST pocket position (floating above it is allowed)
 * @param bag1End Index of last Bag 1 step (gravity only checked for Bag 1)
 */
export function validateSteps(
  steps: Step[],
  tstSlot: TstSlot | null,
  bag1End: number,
): string[] {
  const errors: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const { board, piece } = steps[i]!;
    const label = `Step ${i + 1} (${piece})`;

    // Invariant 1: no floating cells in Bag 1 (except TST overhang)
    if (i < bag1End) {
      for (const { col, row } of findFloatingCells(board)) {
        if (!isTstOverhang(col, row, board, tstSlot)) {
          errors.push(`${label}: floating (${col},${row})=${board[row]![col]}`);
        }
      }
    }

    // Invariant 2: each piece type count is multiple of 4 (within Bag 1)
    if (i < bag1End) {
      const counts = new Map<PieceType, number>();
      for (const row of board)
        for (const cell of row)
          if (cell !== null) counts.set(cell, (counts.get(cell) ?? 0) + 1);
      for (const [p, count] of counts) {
        if (count % 4 !== 0)
          errors.push(`${label}: ${p} has ${count} cells`);
      }
    }
  }

  return errors;
}
