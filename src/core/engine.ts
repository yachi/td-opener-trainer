/**
 * engine.ts — Unified game engine combining BFS move finding, board building,
 * and fumen conversion.
 *
 * Merged from: cold-clear.ts, sequence.ts, field-engine.ts
 * No logic changes — function bodies copied verbatim from source files.
 */

import type { PieceType } from './types.ts';
import { BOARD_WIDTH, BOARD_VISIBLE_HEIGHT } from './types.ts';
import type { Board, ActivePiece } from './srs.ts';
import {
  createBoard,
  getPieceCells,
  isValidPosition,
  tryMove,
  tryRotate,
  hardDrop,
  spawnPiece,
} from './srs.ts';
import { Field } from 'tetris-fumen/lib/field';
import type { Operation } from 'tetris-fumen/lib/field';
import type { PieceType as FumenPieceType, RotationType } from 'tetris-fumen/lib/defines';
import { encode } from 'tetris-fumen/lib/encoder';
import { decode } from 'tetris-fumen/lib/decoder';
import { getBlockXYs } from 'tetris-fumen/lib/inner_field';
import { parsePiece, parseRotation } from 'tetris-fumen/lib/defines';

// ── Re-exports ──

export { createBoard } from './srs.ts';
export type { Board, ActivePiece } from './srs.ts';

// ── Board Utilities ──

type MutableBoard = (PieceType | null)[][];

export function emptyBoard(): Board {
  const board: MutableBoard = Array.from({ length: BOARD_VISIBLE_HEIGHT }, () =>
    new Array<PieceType | null>(BOARD_WIDTH).fill(null),
  );
  return board;
}

export function cloneBoard(b: Board): Board {
  const clone: MutableBoard = b.map(r => [...r]);
  return clone;
}

export function stampCells(board: Board, piece: PieceType, cells: { col: number; row: number }[]): Board {
  const newBoard: MutableBoard = board.map(r => [...r]);
  for (const { col, row } of cells) {
    if (row >= 0 && row < BOARD_VISIBLE_HEIGHT && col >= 0 && col < BOARD_WIDTH) {
      newBoard[row]![col] = piece;
    }
  }
  return newBoard;
}

// ── BFS Types ──

export interface BfsPlacement {
  piece: ActivePiece;
  cells: { col: number; row: number }[];
}

// ── BFS Move Finder ──

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

/**
 * BFS from spawn position to discover every position where `pieceType`
 * can be locked.
 *
 * Explores: left, right, soft-drop (1 row), CW rotation, CCW rotation.
 * Each reachable position that rests on the stack produces a BfsPlacement.
 *
 * This is the "ZeroGComplete" mode from Cold Clear — it explores all
 * positions including above-stack movements, which is the safest default
 * for finding all theoretically reachable placements.
 */
export function findAllPlacements(board: Board, pieceType: PieceType): BfsPlacement[] {
  const spawn = spawnPiece(pieceType);

  // If spawn is obstructed, no placements possible
  if (!isValidPosition(board, spawn)) {
    return [];
  }

  const visited = new Set<string>();
  const locks = new Map<string, BfsPlacement>();
  const queue: ActivePiece[] = [];

  // Enqueue spawn
  visited.add(pieceKey(spawn));
  queue.push(spawn);

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;

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

export function isPlacementReachable(
  board: Board,
  pieceType: PieceType,
  targetCells: { col: number; row: number }[],
): boolean {
  const targetSet = new Set(targetCells.map(c => `${c.col},${c.row}`));
  const reachable = findAllPlacements(board, pieceType);
  return reachable.some(p => {
    const cellSet = new Set(p.cells.map((c: { col: number; row: number }) => `${c.col},${c.row}`));
    return targetSet.size === cellSet.size && [...targetSet].every(k => cellSet.has(k));
  });
}

// ── Lock + Line Clear ──

/**
 * Lock a piece and clear completed lines. Returns the new board and
 * number of lines cleared.
 *
 * Unlike srs.ts lockPiece (which doesn't clear lines),
 * this creates a fresh board with line clearing applied.
 */
export function lockAndClear(
  board: Board,
  piece: ActivePiece,
): { board: Board; linesCleared: number } {
  // Deep-copy the board
  const newBoard: MutableBoard = board.map(row => [...row]);

  // Place piece cells
  const cells = getPieceCells(piece);
  for (const { col, row } of cells) {
    if (row >= 0 && row < BOARD_VISIBLE_HEIGHT && col >= 0 && col < BOARD_WIDTH) {
      newBoard[row]![col] = piece.type;
    }
  }

  // Remove full lines
  let linesCleared = 0;
  for (let row = BOARD_VISIBLE_HEIGHT - 1; row >= 0; row--) {
    if (newBoard[row]!.every(cell => cell !== null)) {
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

// ── Builder Types ──

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

// ── Board Builder ──

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

      if (allEmpty && isPlacementReachable(board, p.piece, p.cells)) {
        board = stampCells(board, p.piece, p.cells);
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

// ── Fumen Coordinate Conversion ──

const BOARD_ROWS = BOARD_VISIBLE_HEIGHT;
const BOARD_COLS = BOARD_WIDTH;

/** Convert our row (0=top, 19=bottom) to fumen y (0=bottom, 19=top of visible area). */
export function rowToFumenY(row: number): number {
  return (BOARD_ROWS - 1) - row;
}

/** Convert fumen y (0=bottom) to our row (0=top). */
export function fumenYToRow(y: number): number {
  return (BOARD_ROWS - 1) - y;
}

// ── Fumen Type Mapping ──

function ourTypeToFumen(type: PieceType): FumenPieceType {
  return type as FumenPieceType;
}

function fumenTypeToOurs(type: FumenPieceType): PieceType | null {
  if (type === '_') return null;
  if (type === 'X') return null; // gray cells → treat as null
  return type as PieceType;
}

const ROTATION_TO_FUMEN: Record<0 | 1 | 2 | 3, RotationType> = {
  0: 'spawn',
  1: 'right',
  2: 'reverse',
  3: 'left',
};

// ── Board ↔ Field ──

/**
 * Convert our board (row 0=top, 20 rows × 10 cols) to a tetris-fumen Field.
 *
 * Iterates each cell and maps to fumen coordinates.
 */
export function boardToField(board: Board): Field {
  const field = Field.create(); // empty 10×23 field
  for (let row = 0; row < BOARD_ROWS; row++) {
    const fumenY = rowToFumenY(row);
    for (let col = 0; col < BOARD_COLS; col++) {
      const cell = board[row]![col] as PieceType | null;
      if (cell !== null) {
        field.set(col, fumenY, ourTypeToFumen(cell));
      }
    }
  }
  return field;
}

/**
 * Convert a tetris-fumen Field back to our board representation.
 *
 * Only reads the visible 20 rows (fumen y 0..19).
 */
export function fieldToBoard(field: Field): Board {
  const board: MutableBoard = Array.from({ length: BOARD_ROWS }, () =>
    new Array<PieceType | null>(BOARD_COLS).fill(null),
  );
  for (let row = 0; row < BOARD_ROWS; row++) {
    const fumenY = rowToFumenY(row);
    for (let col = 0; col < BOARD_COLS; col++) {
      board[row]![col] = fumenTypeToOurs(field.at(col, fumenY));
    }
  }
  return board;
}

// ── Piece Placement ──

/**
 * Given target cells for a piece, find which fumen rotation state + pivot matches.
 * Returns { rotation, fumenX, fumenY } or throws if no match.
 */
function matchRotationFumen(
  piece: PieceType,
  targetCells: { col: number; row: number }[],
): { rotation: RotationType; fumenX: number; fumenY: number } {
  const fumenPieceNum = parsePiece(piece);
  const rotations: RotationType[] = ['spawn', 'right', 'reverse', 'left'];

  // Convert target cells to fumen coordinate set: { x: col, y: fumenY }
  const targetFumenCells = targetCells.map(c => ({
    x: c.col,
    y: rowToFumenY(c.row),
  }));
  const targetSet = new Set(targetFumenCells.map(c => `${c.x},${c.y}`));

  for (const rot of rotations) {
    const fumenRotNum = parseRotation(rot);
    // Try each target cell as the potential pivot position
    for (const pivot of targetFumenCells) {
      const blocks = getBlockXYs(fumenPieceNum, fumenRotNum, pivot.x, pivot.y);
      const blockSet = new Set(blocks.map((b: { x: number; y: number }) => `${b.x},${b.y}`));

      if (
        blockSet.size === targetSet.size &&
        [...targetSet].every(c => blockSet.has(c))
      ) {
        return { rotation: rot, fumenX: pivot.x, fumenY: pivot.y };
      }
    }
  }

  throw new Error(
    `No SRS rotation matches piece ${piece} at cells ${JSON.stringify(targetCells)}`,
  );
}

/**
 * Place a piece using the physics engine, given target cells.
 * Uses Field.fill() to place at the exact position (wiki data is authoritative),
 * then verifies no cell conflicts exist.
 *
 * @param field - The Field to place on (mutated in place)
 * @param piece - Our PieceType ('I', 'T', etc.)
 * @param targetCells - The 4 cells where this piece should land
 * @throws If no rotation matches, or cells conflict with existing pieces
 */
export function placePieceFromCells(
  field: Field,
  piece: PieceType,
  targetCells: { col: number; row: number }[],
  options?: { allowOverwrite?: boolean },
): void {
  const { rotation, fumenX, fumenY } = matchRotationFumen(piece, targetCells);

  // Check for conflicts before placing (unless overwrite is allowed)
  if (!options?.allowOverwrite) {
    for (const cell of targetCells) {
      const fy = rowToFumenY(cell.row);
      const existing = field.at(cell.col, fy);
      if (existing !== '_') {
        throw new Error(
          `Cell conflict at (${cell.col},${cell.row}): already occupied by ${existing}, cannot place ${piece}`,
        );
      }
    }
  }

  const operation: Operation = {
    type: ourTypeToFumen(piece),
    rotation,
    x: fumenX,
    y: fumenY,
  };

  field.fill(operation, true);

  // Verify the cells are now set correctly
  for (const cell of targetCells) {
    const fy = rowToFumenY(cell.row);
    const actual = field.at(cell.col, fy);
    if (actual !== piece) {
      throw new Error(
        `Placement verification failed: expected ${piece} at (${cell.col},${cell.row}), got ${actual}`,
      );
    }
  }
}

// ── Gravity Validation ──

/**
 * Check that every filled cell in a board is "supported":
 * - It sits on the bottom row (row 19), OR
 * - The cell directly below it (row + 1) is also filled.
 *
 * This validates that no pieces are floating.
 *
 * @returns An array of floating cell positions (empty = all OK).
 */
export function findFloatingCells(board: Board): { col: number; row: number }[] {
  const floating: { col: number; row: number }[] = [];
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      if (board[row]![col] === null) continue;

      // Bottom row is always supported
      if (row === BOARD_ROWS - 1) continue;

      // Check if the cell below is filled
      if (board[row + 1]![col] !== null) continue;

      floating.push({ col, row });
    }
  }
  return floating;
}

/**
 * Find pieces (rigid bodies) that are floating — no cell of the piece rests
 * on the floor or on a cell belonging to a different piece.
 *
 * Unlike findFloatingCells which checks individual cells, this uses flood-fill
 * to identify connected components (same-type adjacent cells), then checks
 * each component for support. A piece is valid if ANY one of its cells has:
 * - row 19 (floor), OR
 * - a filled cell directly below that belongs to a different piece type
 *
 * @returns Array of floating pieces with their type and cell positions.
 */
export function findFloatingPieces(
  board: Board,
): { piece: PieceType; cells: { col: number; row: number }[] }[] {
  const visited: boolean[][] = Array.from({ length: BOARD_ROWS }, () =>
    Array(BOARD_COLS).fill(false),
  );

  const floatingPieces: { piece: PieceType; cells: { col: number; row: number }[] }[] = [];

  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      if (visited[row]![col]) continue;
      const cellType = board[row]![col] as PieceType | null;
      if (cellType === null) continue;

      // Flood-fill to find all connected cells of the same type
      const component: { col: number; row: number }[] = [];
      const stack: { col: number; row: number }[] = [{ col, row }];
      while (stack.length > 0) {
        const { col: c, row: r } = stack.pop()!;
        if (r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS) continue;
        if (visited[r]![c]) continue;
        if (board[r]![c] !== cellType) continue;
        visited[r]![c] = true;
        component.push({ col: c, row: r });
        stack.push({ col: c - 1, row: r });
        stack.push({ col: c + 1, row: r });
        stack.push({ col: c, row: r - 1 });
        stack.push({ col: c, row: r + 1 });
      }

      // Check if ANY cell in this component has support
      const supported = component.some(({ col: c, row: r }) => {
        if (r >= BOARD_ROWS - 1) return true; // on floor
        const below = board[r + 1]![c];
        return below !== null && below !== cellType; // supported by different piece
      });

      if (!supported) {
        floatingPieces.push({ piece: cellType, cells: component });
      }
    }
  }

  return floatingPieces;
}

// ── Fumen Encoding/Decoding ──

/**
 * Encode a board state as a fumen string (single page, no operation).
 */
export function boardToFumen(board: Board): string {
  const field = boardToField(board);
  return 'v115@' + encode([{ field }]);
}

/**
 * Decode a fumen string and return the board from the first page.
 * If the page has an operation (a piece placement), it is applied to the field.
 */
export function fumenToBoard(fumen: string): Board {
  const pages = decode(fumen);
  if (pages.length === 0) {
    throw new Error('Fumen string contains no pages');
  }
  const page = pages[0]!;
  const field = page.field;

  // If the page has an operation, apply it
  if (page.operation) {
    if (page.flags.lock) {
      field.put(page.operation);
    } else {
      field.fill(page.operation, true);
    }
  }

  return fieldToBoard(field);
}

// ── Debug ──

/**
 * Render a board as ASCII art for debugging.
 * Empty cells are '.', pieces are their letter.
 * Row 0 (top) is printed first.
 */
export function boardToAscii(board: Board): string {
  return board
    .map((row, i) => {
      const line = row.map((cell) => (cell === null ? '.' : cell)).join('');
      return `${String(i).padStart(2)}: ${line}`;
    })
    .join('\n');
}
