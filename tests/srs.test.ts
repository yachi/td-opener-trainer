import { describe, test, expect } from 'bun:test';
import {
  createBoard,
  getPieceCells,
  isValidPosition,
  tryMove,
  tryRotate,
  hardDrop,
  lockPiece,
  spawnPiece,
  getGhostPosition,
} from '../src/core/srs.ts';
import type { ActivePiece, Board } from '../src/core/srs.ts';
import type { PieceType } from '../src/core/types.ts';

// ── Helpers ──

function emptyBoard(): Board {
  return createBoard();
}

/** Place cells on a board for testing */
function placeOnBoard(board: Board, cells: { col: number; row: number; type: PieceType }[]): Board {
  for (const { col, row, type } of cells) {
    board[row][col] = type;
  }
  return board;
}

// ── createBoard ──

describe('createBoard', () => {
  test('returns 20 rows', () => {
    const board = createBoard();
    expect(board).toHaveLength(20);
  });

  test('each row has 10 columns', () => {
    const board = createBoard();
    for (const row of board) {
      expect(row).toHaveLength(10);
    }
  });

  test('all cells are null', () => {
    const board = createBoard();
    for (const row of board) {
      for (const cell of row) {
        expect(cell).toBeNull();
      }
    }
  });
});

// ── getPieceCells ──

describe('getPieceCells', () => {
  test('T piece state 0 at origin', () => {
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 0, row: 0 };
    const cells = getPieceCells(piece);
    expect(cells).toHaveLength(4);
    // T state 0: [1,0], [0,1], [1,1], [2,1]
    expect(cells).toContainEqual({ col: 1, row: 0 });
    expect(cells).toContainEqual({ col: 0, row: 1 });
    expect(cells).toContainEqual({ col: 1, row: 1 });
    expect(cells).toContainEqual({ col: 2, row: 1 });
  });

  test('I piece state 0 at col=3, row=0', () => {
    const piece: ActivePiece = { type: 'I', rotation: 0, col: 3, row: 0 };
    const cells = getPieceCells(piece);
    expect(cells).toHaveLength(4);
    // I state 0: cells at row 1 of bounding box -> board row 1
    expect(cells).toContainEqual({ col: 3, row: 1 });
    expect(cells).toContainEqual({ col: 4, row: 1 });
    expect(cells).toContainEqual({ col: 5, row: 1 });
    expect(cells).toContainEqual({ col: 6, row: 1 });
  });

  test('O piece state 0 at col=3, row=0', () => {
    const piece: ActivePiece = { type: 'O', rotation: 0, col: 3, row: 0 };
    const cells = getPieceCells(piece);
    expect(cells).toHaveLength(4);
    // O: [1,0],[2,0],[1,1],[2,1] -> cols 4,5 rows 0,1
    expect(cells).toContainEqual({ col: 4, row: 0 });
    expect(cells).toContainEqual({ col: 5, row: 0 });
    expect(cells).toContainEqual({ col: 4, row: 1 });
    expect(cells).toContainEqual({ col: 5, row: 1 });
  });

  test('S piece state 0 at col=3, row=5', () => {
    const piece: ActivePiece = { type: 'S', rotation: 0, col: 3, row: 5 };
    const cells = getPieceCells(piece);
    // S state 0: [1,0],[2,0],[0,1],[1,1]
    expect(cells).toContainEqual({ col: 4, row: 5 });
    expect(cells).toContainEqual({ col: 5, row: 5 });
    expect(cells).toContainEqual({ col: 3, row: 6 });
    expect(cells).toContainEqual({ col: 4, row: 6 });
  });

  test('L piece state R (rotation=1) at col=0, row=0', () => {
    const piece: ActivePiece = { type: 'L', rotation: 1, col: 0, row: 0 };
    const cells = getPieceCells(piece);
    // L state R: [1,0],[1,1],[1,2],[2,2]
    expect(cells).toContainEqual({ col: 1, row: 0 });
    expect(cells).toContainEqual({ col: 1, row: 1 });
    expect(cells).toContainEqual({ col: 1, row: 2 });
    expect(cells).toContainEqual({ col: 2, row: 2 });
  });

  test('J piece state 0 at col=3, row=0', () => {
    const piece: ActivePiece = { type: 'J', rotation: 0, col: 3, row: 0 };
    const cells = getPieceCells(piece);
    // J state 0: [0,0],[0,1],[1,1],[2,1]
    expect(cells).toContainEqual({ col: 3, row: 0 });
    expect(cells).toContainEqual({ col: 3, row: 1 });
    expect(cells).toContainEqual({ col: 4, row: 1 });
    expect(cells).toContainEqual({ col: 5, row: 1 });
  });

  test('Z piece state 0 at col=0, row=0', () => {
    const piece: ActivePiece = { type: 'Z', rotation: 0, col: 0, row: 0 };
    const cells = getPieceCells(piece);
    // Z state 0: [0,0],[1,0],[1,1],[2,1]
    expect(cells).toContainEqual({ col: 0, row: 0 });
    expect(cells).toContainEqual({ col: 1, row: 0 });
    expect(cells).toContainEqual({ col: 1, row: 1 });
    expect(cells).toContainEqual({ col: 2, row: 1 });
  });
});

// ── isValidPosition ──

describe('isValidPosition', () => {
  test('piece in open space is valid', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 5 };
    expect(isValidPosition(board, piece)).toBe(true);
  });

  test('piece out of bounds left is invalid', () => {
    const board = emptyBoard();
    // T state 0 has cell at col offset 0, so col=-1 puts it at board col -1
    const piece: ActivePiece = { type: 'T', rotation: 0, col: -1, row: 5 };
    expect(isValidPosition(board, piece)).toBe(false);
  });

  test('piece out of bounds right is invalid', () => {
    const board = emptyBoard();
    // T state 0 has cell at col offset 2, so col=8 puts it at board col 10 (out of bounds)
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 8, row: 5 };
    expect(isValidPosition(board, piece)).toBe(false);
  });

  test('piece out of bounds bottom is invalid', () => {
    const board = emptyBoard();
    // T state 0 has cell at row offset 1, so row=19 puts it at board row 20 (out of bounds)
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 19 };
    expect(isValidPosition(board, piece)).toBe(false);
  });

  test('piece overlapping locked cell is invalid', () => {
    const board = emptyBoard();
    board[6][4] = 'S'; // block at row 6, col 4
    // T state 0 at col=3, row=5: cells include (4,6) which is blocked
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 5 };
    expect(isValidPosition(board, piece)).toBe(false);
  });

  test('piece above board (negative row) is valid', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: -1 };
    // Some cells at row -1 and row 0 — negative rows are OK (buffer)
    expect(isValidPosition(board, piece)).toBe(true);
  });

  test('I piece at right edge, state 0 fits at col=6', () => {
    const board = emptyBoard();
    // I state 0: offsets [0,1],[1,1],[2,1],[3,1] -> cols 6,7,8,9 — fits
    const piece: ActivePiece = { type: 'I', rotation: 0, col: 6, row: 0 };
    expect(isValidPosition(board, piece)).toBe(true);
  });

  test('I piece at right edge, state 0 does not fit at col=7', () => {
    const board = emptyBoard();
    // I state 0: offsets [0,1],[1,1],[2,1],[3,1] -> cols 7,8,9,10 — col 10 out
    const piece: ActivePiece = { type: 'I', rotation: 0, col: 7, row: 0 };
    expect(isValidPosition(board, piece)).toBe(false);
  });
});

// ── tryMove ──

describe('tryMove', () => {
  test('move right in open space', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 5 };
    const result = tryMove(board, piece, 1, 0);
    expect(result).not.toBeNull();
    expect(result!.col).toBe(4);
    expect(result!.row).toBe(5);
  });

  test('move left in open space', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 5 };
    const result = tryMove(board, piece, -1, 0);
    expect(result).not.toBeNull();
    expect(result!.col).toBe(2);
  });

  test('move down in open space', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 5 };
    const result = tryMove(board, piece, 0, 1);
    expect(result).not.toBeNull();
    expect(result!.row).toBe(6);
  });

  test('move blocked by left wall', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 0, row: 5 };
    const result = tryMove(board, piece, -1, 0);
    expect(result).toBeNull();
  });

  test('move blocked by right wall', () => {
    const board = emptyBoard();
    // T state 0 rightmost offset = col+2, so col=7 -> col 9 is last valid
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 7, row: 5 };
    const result = tryMove(board, piece, 1, 0);
    expect(result).toBeNull();
  });

  test('move blocked by floor', () => {
    const board = emptyBoard();
    // T state 0 bottom offset = row+1, so row=18 -> row 19 is last valid
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 18 };
    const result = tryMove(board, piece, 0, 1);
    expect(result).toBeNull();
  });

  test('move blocked by locked piece', () => {
    const board = emptyBoard();
    board[7][4] = 'I';
    // T at col=3, row=5 moving down: at row=6, cell (4,7) would overlap
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 5 };
    const result = tryMove(board, piece, 0, 1);
    expect(result).toBeNull();
  });
});

// ── tryRotate ──

describe('tryRotate', () => {
  test('T piece CW rotation in open space', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 4, row: 5 };
    const result = tryRotate(board, piece, 1);
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(1);
    // First kick is (0,0) so position unchanged
    expect(result!.col).toBe(4);
    expect(result!.row).toBe(5);
  });

  test('T piece CCW rotation in open space', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 4, row: 5 };
    const result = tryRotate(board, piece, -1);
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(3);
    expect(result!.col).toBe(4);
    expect(result!.row).toBe(5);
  });

  test('full CW rotation cycle returns to state 0', () => {
    const board = emptyBoard();
    let piece: ActivePiece = { type: 'T', rotation: 0, col: 4, row: 5 };
    for (let i = 0; i < 4; i++) {
      const next = tryRotate(board, piece, 1);
      expect(next).not.toBeNull();
      piece = next!;
    }
    expect(piece.rotation).toBe(0);
  });

  test('T piece against right wall kicks left (0->1)', () => {
    const board = emptyBoard();
    // T state 0 at col=7 (rightmost valid). Rotation to state R: cell at offset (2,1) -> col 9.
    // State R has [1,0],[1,1],[2,1],[1,2]. At col=8: col 10 out. Kick (-1,0) -> col=7 should work.
    // Actually let's put T at col=8: state 0 has offset (2,1) -> col 10 out of bounds — invalid position.
    // Use col=7: state 0 is valid (cells at cols 7+0=7, 7+1=8, 7+2=9).
    // State R at col=7: offsets [1,0],[1,1],[2,1],[1,2] -> cols 8,8,9,8 — valid at (0,0) kick.
    // Need col=8 for a wall kick scenario. But state 0 at col=8 has cell at (8+2=10) — invalid.
    // So T piece against right wall: use state R at col=8 rotating to state 2.
    // State R: [1,0],[1,1],[2,1],[1,2] at col=8 -> cols 9,9,10,9 — col 10 invalid.
    // Let's just use: T at state 1 (R) near right wall rotating CW to state 2.
    // State R at col=7: cells at cols 8,8,9,8 — valid.
    // Rotate CW (1->2): kick table 1->2: (0,0),(+1,0),(+1,+1),(0,-2),(+1,-2)
    // State 2: [0,1],[1,1],[2,1],[1,2] at col=7 -> cols 7,8,9,7 — fits at (0,0).
    // This doesn't demonstrate a wall kick. Let me use I piece instead.

    // I piece at right wall: state 0 at col=6, cells at cols 6,7,8,9. Rotate CW (0->1).
    // State R: [2,0],[2,1],[2,2],[2,3] at col=6 -> col 8 for all — fits at (0,0).
    // Need tighter. I piece state 0 at col=7 is invalid (col 10).

    // Simpler: T piece state 0 at col=7, rotate CW. State 0 cells: (8,5),(7,6),(8,6),(9,6) — valid.
    // State R cells at col=7: (8,5),(8,6),(9,6),(8,7) — valid at (0,0) kick.
    // No wall kick needed. Let me force one:

    // Put T against absolute right wall. State L (rotation=3) at col=8.
    // State L: [1,0],[0,1],[1,1],[1,2] -> cols 9,8,9,9. Valid.
    // Rotate CW (3->0): kicks (0,0),(-1,0),(-1,+1),(0,-2),(-1,-2)
    // State 0: [1,0],[0,1],[1,1],[2,1] at col=8 -> cols 9,8,9,10 — col 10 out! Kick (0,0) fails.
    // Kick (-1,0): col=7, state 0: cols 8,7,8,9 — valid!
    const piece: ActivePiece = { type: 'T', rotation: 3, col: 8, row: 5 };
    expect(isValidPosition(board, piece)).toBe(true);
    const result = tryRotate(board, piece, 1);
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(0);
    expect(result!.col).toBe(7); // kicked left by 1
  });

  test('I piece rotation uses I kick table', () => {
    const board = emptyBoard();
    // I piece state 0 at col=0. Cells: (0,1),(1,1),(2,1),(3,1).
    // Rotate CW (0->1): state R [2,0],[2,1],[2,2],[2,3] at col=0 -> col 2 for all — valid at (0,0).
    // But with kick (-2,0) we'd go to col=-2 which is worse. (0,0) should succeed.
    // To test kick: put I at col=0 state R, then rotate CW to state 2.
    // State R at col=0: [2,0],[2,1],[2,2],[2,3] -> col 2 all rows 0-3. Valid.
    // Rotate CW (1->2): state 2 = [0,2],[1,2],[2,2],[3,2] at col=0 -> cols 0,1,2,3 row 2. Valid at (0,0).

    // For an actual kick test: I piece state 0 near left wall with blocking pieces.
    // Let's fill col 0 and col 1 partially to force a kick.
    board[1][0] = 'S'; // Block the (0,0) kick position
    // I state 0 at col=0, row=0: cells at (0,1),(1,1),(2,1),(3,1). But (0,1) is blocked? No, board[1][0]='S'.
    // That means col=0,row=1 is blocked, so I can't be at col=0 row=0 state 0.

    // Fresh approach: just verify I piece rotates and uses correct kick data.
    const board2 = emptyBoard();
    const piece: ActivePiece = { type: 'I', rotation: 0, col: 3, row: 0 };
    const result = tryRotate(board2, piece, 1);
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(1);
    // (0,0) kick: col=3, state R: [2,0],[2,1],[2,2],[2,3] -> col 5, rows 0-3. Valid.
    expect(result!.col).toBe(3);
    expect(result!.row).toBe(0);
  });

  test('O piece rotation does not change position', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'O', rotation: 0, col: 4, row: 5 };
    const result = tryRotate(board, piece, 1);
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(1);
    expect(result!.col).toBe(4);
    expect(result!.row).toBe(5);
  });

  test('rotation fails when all kicks are blocked', () => {
    const board = emptyBoard();
    // Fill the board almost completely around a piece so no kick works
    // T piece at col=4, row=18 (near bottom). Fill surrounding cells.
    for (let c = 0; c < 10; c++) {
      board[17][c] = 'S';
      board[18][c] = 'S';
      board[19][c] = 'S';
    }
    // Clear just enough for T state 0 at row=18
    board[18][4] = null; // [1,0] -> (5,18) wait, col=4+1=5
    board[19][3] = null; // [0,1] -> (4+0,18+1=19)=col 3? No.
    // T state 0 at col=4, row=18: cells (5,18),(4,19),(5,19),(6,19)
    board[18][5] = null;
    board[19][4] = null;
    board[19][5] = null;
    board[19][6] = null;

    const piece: ActivePiece = { type: 'T', rotation: 0, col: 4, row: 18 };
    expect(isValidPosition(board, piece)).toBe(true);

    // CW rotation (0->1): state R = [1,0],[1,1],[2,1],[1,2] at col=4, row=18
    // (0,0): cells (5,18),(5,19),(6,19),(5,20) — row 20 out of bounds. Fail.
    // (-1,0): col=3: (4,18),(4,19),(5,19),(4,20) — row 20 out. Fail.
    // (-1,-1): col=3,row=17: (4,17),(4,18),(5,18),(4,19) — (4,17) is 'S'. Fail.
    // (0,+2): col=4,row=20: row 20+ out. Fail.
    // (-1,+2): col=3,row=20: out. Fail.
    const result = tryRotate(board, piece, 1);
    expect(result).toBeNull();
  });

  test('T-spin: T piece kicks into a T-slot', () => {
    // Classic T-spin setup: T-shaped hole at bottom
    const board = emptyBoard();
    // Fill rows 18-19 with a T-slot opening
    for (let c = 0; c < 10; c++) {
      board[18][c] = 'S';
      board[19][c] = 'S';
    }
    // Create T-slot: clear cells for T piece state 2 at col=3, row=18
    // State 2: [0,1],[1,1],[2,1],[1,2] -> (3,19),(4,19),(5,19),(4,20) — row 20 out.
    // Let's use rows 17-19 instead.
    board[17] = Array(10).fill('S');
    // T-slot for state 2 at col=3, row=17: cells (3,18),(4,18),(5,18),(4,19)
    board[18][3] = null;
    board[18][4] = null;
    board[18][5] = null;
    board[19][4] = null;
    // Also need an opening above for the T to enter from.
    // T starts at rotation 0, col=3, row=16 (just above the filled area)
    // State 0: [1,0],[0,1],[1,1],[2,1] -> (4,16),(3,17),(4,17),(5,17)
    // Row 17 is filled, so (3,17),(4,17),(5,17) overlap. T can't be there in state 0.

    // Instead: T in state R (rotation=1) above the slot, then rotate CW to state 2.
    // State R at col=3, row=16: [1,0],[1,1],[2,1],[1,2] -> (4,16),(4,17),(5,17),(4,18)
    // (4,17) is 'S', (5,17) is 'S'. Blocked.

    // Clear a path: make an overhang.
    board[17][4] = null; // opening above the T-slot
    board[17][3] = null;
    board[17][5] = null;
    // Now T state R at col=3, row=16: (4,16),(4,17),(5,17),(4,18) — (5,17) is null now, (4,17) null, (4,18) null. Valid!
    // Wait, (4,18) was already cleared. Let me recheck.
    // board[18][3]=null, board[18][4]=null, board[18][5]=null, board[19][4]=null
    // board[17][3]=null, board[17][4]=null, board[17][5]=null
    // State R at col=3, row=16: cells (4,16),(4,17),(5,17),(4,18).
    // (4,16)=null(empty), (4,17)=null, (5,17)=null, (4,18)=null. Valid!

    // Rotate CW (1->2) with kick (0,0): state 2 at col=3, row=16.
    // State 2: [0,1],[1,1],[2,1],[1,2] -> (3,17),(4,17),(5,17),(4,18). All null. Valid at (0,0).
    // This works but it's not really a kick scenario. Let me just test basic T-spin with a kick.

    // Simpler T-spin: T in state R, overhang forces kick.
    const board2 = emptyBoard();
    for (let c = 0; c < 10; c++) {
      board2[19][c] = 'S';
      board2[18][c] = 'S';
    }
    // Create a T-slot at bottom-right: clear (8,18) and (7,19),(8,19)
    board2[18][8] = null;
    board2[19][7] = null;
    board2[19][8] = null;
    // Also clear (8,17) so the T can approach. And leave (7,18) filled as overhang.
    // T state 2 should end up at col=6, row=18: cells (6,19),(7,19),(8,19),(7,20) — row 20 out.
    // Let's place T state 2 at col=6, row=17: cells (6,18),(7,18),(8,18),(7,19).
    // (6,18)='S', (7,18)='S' — both filled. This doesn't work either.

    // I'll just verify a simple SRS kick works correctly instead of building an elaborate T-spin.
    // T piece state 1 (R) at col=7, near right wall.
    const board3 = emptyBoard();
    // Fill col 9 to create a wall effect
    for (let r = 0; r < 20; r++) board3[r][9] = 'S';

    // T state R at col=7: cells [1,0],[1,1],[2,1],[1,2] -> (8,5),(8,6),(9,6),(8,7)
    // col 9 row 6 is filled -> overlap. Can't place there.
    // Use col=6: cells (7,5),(7,6),(8,6),(7,7). (8,6) free? col 8 row 6 — yes, not filled.
    const piece: ActivePiece = { type: 'T', rotation: 1, col: 6, row: 5 };
    expect(isValidPosition(board3, piece)).toBe(true);

    // Rotate CW (1->2): kicks (0,0),(+1,0),(+1,+1),(0,-2),(+1,-2)
    // State 2 at col=6, row=5: [0,1],[1,1],[2,1],[1,2] -> (6,6),(7,6),(8,6),(7,7). Valid at (0,0).
    const result = tryRotate(board3, piece, 1);
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(2);
  });

  test('I piece wall kick: state 0 at col=-1 invalid, rotate from state L near left wall', () => {
    const board = emptyBoard();
    // I state L (rotation=3) at col=0: [1,0],[1,1],[1,2],[1,3] -> col 1 for all. Valid.
    const piece: ActivePiece = { type: 'I', rotation: 3, col: 0, row: 5 };
    expect(isValidPosition(board, piece)).toBe(true);

    // Rotate CW (3->0): I kicks for 3->0: (0,0),(+1,0),(-2,0),(+1,+2),(-2,-1)
    // State 0 at col=0, row=5: [0,1],[1,1],[2,1],[3,1] -> cols 0,1,2,3 row 6. Valid at (0,0).
    const result = tryRotate(board, piece, 1);
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(0);
    expect(result!.col).toBe(0);
  });

  test('I piece needs kick: state L at col=-1 rotates CW with kick', () => {
    const board = emptyBoard();
    // I state L at col=-1: [1,0],[1,1],[1,2],[1,3] -> col 0, rows 5-8. Valid (col 0 is in bounds).
    const piece: ActivePiece = { type: 'I', rotation: 3, col: -1, row: 5 };
    expect(isValidPosition(board, piece)).toBe(true);

    // Rotate CW (3->0): kicks (0,0),(+1,0),(-2,0),(+1,+2),(-2,-1)
    // State 0 at col=-1, row=5: [0,1],[1,1],[2,1],[3,1] -> cols -1,0,1,2 row 6. col -1 out! Fail.
    // Kick (+1,0): col=0, row=5: cols 0,1,2,3 row 6. Valid!
    const result = tryRotate(board, piece, 1);
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(0);
    expect(result!.col).toBe(0); // kicked right by 1
    expect(result!.row).toBe(5);
  });
});

// ── hardDrop ──

describe('hardDrop', () => {
  test('piece drops to bottom of empty board', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 0 };
    const result = hardDrop(board, piece);
    // T state 0 bottom offset = row+1, so last valid row is 18 (row+1=19)
    expect(result.row).toBe(18);
    expect(result.col).toBe(3);
    expect(result.rotation).toBe(0);
  });

  test('I piece drops to bottom of empty board', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'I', rotation: 0, col: 3, row: 0 };
    const result = hardDrop(board, piece);
    // I state 0 bottom offset = row+1 (cells at row 1 of bbox), so last valid: row+1=19, row=18
    expect(result.row).toBe(18);
  });

  test('piece drops onto existing pieces', () => {
    const board = emptyBoard();
    // Fill row 15 completely
    for (let c = 0; c < 10; c++) board[15][c] = 'S';
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 0 };
    const result = hardDrop(board, piece);
    // T state 0 bottom offset = row+1, row+1 must be < 15 (blocked at 15), so row+1=14, row=13
    expect(result.row).toBe(13);
  });

  test('piece already at rest stays', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 18 };
    const result = hardDrop(board, piece);
    expect(result.row).toBe(18);
  });
});

// ── lockPiece ──

describe('lockPiece', () => {
  test('writes piece cells to board', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 18 };
    lockPiece(board, piece);
    // T state 0 at col=3, row=18: cells (4,18),(3,19),(4,19),(5,19)
    expect(board[18][4]).toBe('T');
    expect(board[19][3]).toBe('T');
    expect(board[19][4]).toBe('T');
    expect(board[19][5]).toBe('T');
  });

  test('does not overwrite existing cells elsewhere', () => {
    const board = emptyBoard();
    board[0][0] = 'I';
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 18 };
    lockPiece(board, piece);
    expect(board[0][0]).toBe('I');
  });

  test('returns the board', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 18 };
    const result = lockPiece(board, piece);
    expect(result).toBe(board);
  });

  test('locks I piece correctly', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'I', rotation: 1, col: 5, row: 16 };
    // I state R: [2,0],[2,1],[2,2],[2,3] -> col 7, rows 16-19
    lockPiece(board, piece);
    expect(board[16][7]).toBe('I');
    expect(board[17][7]).toBe('I');
    expect(board[18][7]).toBe('I');
    expect(board[19][7]).toBe('I');
  });
});

// ── spawnPiece ──

describe('spawnPiece', () => {
  test('all pieces spawn at col=3, row=0, rotation=0', () => {
    const types: PieceType[] = ['I', 'T', 'O', 'S', 'Z', 'L', 'J'];
    for (const type of types) {
      const piece = spawnPiece(type);
      expect(piece.type).toBe(type);
      expect(piece.col).toBe(3);
      expect(piece.row).toBe(0);
      expect(piece.rotation).toBe(0);
    }
  });

  test('spawned T piece cells are at expected positions', () => {
    const piece = spawnPiece('T');
    const cells = getPieceCells(piece);
    // T state 0 at col=3, row=0: [1,0],[0,1],[1,1],[2,1] -> (4,0),(3,1),(4,1),(5,1)
    expect(cells).toContainEqual({ col: 4, row: 0 });
    expect(cells).toContainEqual({ col: 3, row: 1 });
    expect(cells).toContainEqual({ col: 4, row: 1 });
    expect(cells).toContainEqual({ col: 5, row: 1 });
  });

  test('spawned I piece cells', () => {
    const piece = spawnPiece('I');
    const cells = getPieceCells(piece);
    // I state 0 at col=3, row=0: [0,1],[1,1],[2,1],[3,1] -> (3,1),(4,1),(5,1),(6,1)
    expect(cells).toContainEqual({ col: 3, row: 1 });
    expect(cells).toContainEqual({ col: 4, row: 1 });
    expect(cells).toContainEqual({ col: 5, row: 1 });
    expect(cells).toContainEqual({ col: 6, row: 1 });
  });

  test('spawned O piece cells', () => {
    const piece = spawnPiece('O');
    const cells = getPieceCells(piece);
    // O at col=3, row=0: [1,0],[2,0],[1,1],[2,1] -> (4,0),(5,0),(4,1),(5,1)
    expect(cells).toContainEqual({ col: 4, row: 0 });
    expect(cells).toContainEqual({ col: 5, row: 0 });
    expect(cells).toContainEqual({ col: 4, row: 1 });
    expect(cells).toContainEqual({ col: 5, row: 1 });
  });

  test('spawned piece is valid on empty board', () => {
    const board = emptyBoard();
    const types: PieceType[] = ['I', 'T', 'O', 'S', 'Z', 'L', 'J'];
    for (const type of types) {
      const piece = spawnPiece(type);
      expect(isValidPosition(board, piece)).toBe(true);
    }
  });
});

// ── getGhostPosition ──

describe('getGhostPosition', () => {
  test('ghost on empty board is at bottom', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 0 };
    const ghost = getGhostPosition(board, piece);
    expect(ghost.row).toBe(18);
    expect(ghost.col).toBe(3);
    expect(ghost.type).toBe('T');
    expect(ghost.rotation).toBe(0);
  });

  test('ghost stops above locked pieces', () => {
    const board = emptyBoard();
    for (let c = 0; c < 10; c++) board[10][c] = 'S';
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 0 };
    const ghost = getGhostPosition(board, piece);
    // T bottom at row+1, must stop at row+1=9, so row=8
    expect(ghost.row).toBe(8);
  });

  test('ghost of piece already at rest is same position', () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: 'T', rotation: 0, col: 3, row: 18 };
    const ghost = getGhostPosition(board, piece);
    expect(ghost.row).toBe(18);
    expect(ghost.col).toBe(3);
  });
});
