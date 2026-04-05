/**
 * field-engine.ts — Thin wrapper around tetris-fumen's Field class
 *
 * This module bridges our board representation with tetris-fumen's Field,
 * providing gravity-aware placement, line clearing, and fumen encoding/decoding.
 *
 * COORDINATE SYSTEMS (critical):
 *   Our board:      row 0 = top,    row 19 = bottom.  board[row][col]
 *   tetris-fumen:   y 0   = bottom, y 22   = top.     field.at(x, y)
 *
 *   Conversion:  fumenY = 19 - ourRow   (for visible rows 0..19)
 *                ourRow = 19 - fumenY   (for fumenY 0..19)
 *
 *   fumenY 20-22 map to "above screen" (buffer zone); we ignore them.
 *   fumenY -1 is the garbage row; we ignore it.
 */

import { Field } from 'tetris-fumen/lib/field';
import type { Mino } from 'tetris-fumen/lib/field';
import type { Operation } from 'tetris-fumen/lib/field';
import type { PieceType as FumenPieceType, RotationType } from 'tetris-fumen/lib/defines';
import { encode } from 'tetris-fumen/lib/encoder';
import { decode } from 'tetris-fumen/lib/decoder';
import type { PieceType } from '../core/types';
import { BOARD_WIDTH, BOARD_VISIBLE_HEIGHT } from '../core/types';
import { createBoard } from '../core/srs';
import { getBlockXYs } from 'tetris-fumen/lib/inner_field';
import { parsePiece, parseRotation } from 'tetris-fumen/lib/defines';
import type { Board } from '../core/srs';

// ── Constants ──

const BOARD_ROWS = BOARD_VISIBLE_HEIGHT;
const BOARD_COLS = BOARD_WIDTH;

// ── Coordinate conversion helpers ──

/** Convert our row (0=top, 19=bottom) to fumen y (0=bottom, 19=top of visible area). */
export function rowToFumenY(row: number): number {
  return (BOARD_ROWS - 1) - row;
}

/** Convert fumen y (0=bottom) to our row (0=top). */
export function fumenYToRow(y: number): number {
  return (BOARD_ROWS - 1) - y;
}

// ── Type mapping ──

/**
 * Our PieceType: 'I' | 'T' | 'O' | 'S' | 'Z' | 'L' | 'J'
 * Fumen PieceType: 'I' | 'L' | 'O' | 'Z' | 'T' | 'J' | 'S' | 'X' (gray) | '_' (empty)
 *
 * For piece types they're the same strings. The difference is fumen has 'X' (gray) and '_' (empty).
 */

function ourTypeToFumen(type: PieceType): FumenPieceType {
  // Our PieceType is a subset of FumenPieceType — direct cast is safe
  return type as FumenPieceType;
}

function fumenTypeToOurs(type: FumenPieceType): PieceType | null {
  if (type === '_') return null;
  if (type === 'X') return null; // gray cells → treat as null (or could map to a sentinel)
  return type as PieceType;
}

// ── Rotation mapping ──

/**
 * Our rotation: 0 = spawn, 1 = right (CW), 2 = reverse, 3 = left (CCW)
 * Fumen rotation: 'spawn' | 'right' | 'reverse' | 'left'
 */
const ROTATION_TO_FUMEN: Record<0 | 1 | 2 | 3, RotationType> = {
  0: 'spawn',
  1: 'right',
  2: 'reverse',
  3: 'left',
};

const ROTATION_FROM_FUMEN: Record<RotationType, 0 | 1 | 2 | 3> = {
  spawn: 0,
  right: 1,
  reverse: 2,
  left: 3,
};

// ── Board ↔ Field conversion ──

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
      const cell = board[row]![col];
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
  const board: Board = createBoard();
  for (let row = 0; row < BOARD_ROWS; row++) {
    const fumenY = rowToFumenY(row);
    for (let col = 0; col < BOARD_COLS; col++) {
      board[row]![col] = fumenTypeToOurs(field.at(col, fumenY));
    }
  }
  return board;
}

// ── Piece placement with gravity ──

/**
 * Place a piece on a Field using fumen's `put()`, which drops the piece
 * from the given y coordinate downward until it locks (gravity drop).
 *
 * @param field  - The Field to place on (mutated in place)
 * @param type   - Our PieceType ('I', 'T', etc.)
 * @param rotation - Our rotation (0-3)
 * @param col    - Column (x) for the piece pivot (0-indexed, same in both systems)
 * @param startRow - Optional: our row to start dropping from (0=top). Defaults to 0.
 *                   Set to a specific row if you want the piece placed at a known height.
 * @returns The Mino with its final locked position, or throws if placement is impossible.
 */
export function placePieceWithGravity(
  field: Field,
  type: PieceType,
  rotation: 0 | 1 | 2 | 3,
  col: number,
  startRow: number = 0,
): Mino {
  const fumenY = rowToFumenY(startRow);
  const operation: Operation = {
    type: ourTypeToFumen(type),
    rotation: ROTATION_TO_FUMEN[rotation],
    x: col,
    y: fumenY, // put() drops downward from this y
  };

  // put() throws if placement is impossible — let fumen's error propagate
  return field.put(operation);
}

// ── Line clearing ──

/**
 * Clear all full lines on the field (delegates to fumen's clearLine).
 * Fumen handles gravity (rows above drop down) automatically.
 */
export function clearLines(field: Field): void {
  field.clearLine();
}

// ── Gravity validation ──

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
      const cellType = board[row]![col];
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

/**
 * Assert that no cells are floating. Throws with details if any are found.
 */
export function assertNoFloatingCells(board: Board): void {
  const floating = findFloatingCells(board);
  if (floating.length > 0) {
    const details = floating
      .map(({ col, row }) => `(${col},${row})=${board[row]![col]}`)
      .join(', ');
    throw new Error(`Floating cells detected: ${details}`);
  }
}

// ── Fumen encoding / decoding ──

/**
 * Encode a board state as a fumen string (single page, no operation).
 *
 * This produces a v115@ fumen that represents the static board state.
 * Note: tetris-fumen's encode() does NOT include the 'v115@' prefix,
 * but decode() requires it. We add it here for consistency.
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

// ── High-level: computePostTstBoard replacement ──

/**
 * Compute the board state after a T-Spin Triple fires and lines clear.
 *
 * Instead of hardcoding which rows to clear, this:
 * 1. Takes the final Bag 1 board
 * 2. Places the T piece at the TST slot using fumen's put()
 * 3. Calls clearLine() to remove all full rows
 * 4. Returns the residual board
 *
 * @param bag1FinalBoard - The board after all Bag 1 pieces are placed
 * @param tstSlot - Where to place the T piece for the TST
 */
export function computePostTst(
  bag1FinalBoard: Board,
  tstSlot: { col: number; row: number; rotation: 0 | 1 | 2 | 3 },
): Board {
  const field = boardToField(bag1FinalBoard);

  // Place T piece at the TST slot
  // Use fill() (not put()) because we know the exact position — no gravity drop needed
  const fumenY = rowToFumenY(tstSlot.row);
  const operation: Operation = {
    type: 'T',
    rotation: ROTATION_TO_FUMEN[tstSlot.rotation],
    x: tstSlot.col,
    y: fumenY,
  };
  field.fill(operation, true);

  // Clear full lines — fumen handles the gravity shift
  field.clearLine();

  return fieldToBoard(field);
}

// ── Physics engine: piece placement from target cells ──

/**
 * Given target cells for a piece, find which fumen rotation state + pivot matches.
 * Returns { rotation, fumenX, fumenY } or throws if no match.
 *
 * Uses fumen's own getBlockXYs() to compute block positions, so the pivot
 * coordinates are compatible with field.fill().
 *
 * Fumen coordinate system: x = column, y = 0 at bottom, positive up.
 * Our target cells use: col = column, row = 0 at top.
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

/**
 * Build a board by placing pieces one at a time through the physics engine.
 * Each placement is verified against target cells for conflicts and correctness.
 *
 * @param baseBoard - The starting board state
 * @param placements - Array of { piece, cells } to place in order
 * @returns The final board after all placements
 */
export function buildBoardFromPlacements(
  baseBoard: Board,
  placements: { piece: PieceType; cells: { col: number; row: number }[] }[],
  options?: { allowOverwrite?: boolean },
): Board {
  const field = boardToField(baseBoard);

  for (const placement of placements) {
    placePieceFromCells(field, placement.piece, placement.cells, options);
  }

  return fieldToBoard(field);
}

// ── ASCII board rendering (for debugging / tests) ──

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
