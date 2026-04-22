/**
 * diag-l9-pc.test.ts — Phase 2.5 empirical proof for replayPcSteps.
 *
 * DESIGN: buildSteps (DFS backtracking, fixed coordinates) is for Bag 1/2
 * where no lines clear between placements. PC needs a LINEAR replayer
 * because intermediate line clears shift the board — coordinates are
 * order-dependent, not permutable.
 *
 * replayPcSteps replays a KNOWN ordered sequence with line clears.
 * No DFS, no backtracking, no snapshots.
 */

import { describe, test, expect } from 'bun:test';

import {
  emptyBoard,
  buildSteps,
  stampCells,
  clearFullRows,
  replayPcSteps,
  findAllPlacements,
  lockAndClear,
  type Board,
  type Placement,
} from '../src/core/engine.ts';
import { getBag2Sequence } from '../src/openers/sequences.ts';
import type { PieceType } from '../src/core/types.ts';
import { BOARD_WIDTH, BOARD_VISIBLE_HEIGHT } from '../src/core/types.ts';

// ── Helpers ──

function countCells(board: Board): number {
  let count = 0;
  for (let r = 0; r < BOARD_VISIBLE_HEIGHT; r++)
    for (let c = 0; c < BOARD_WIDTH; c++)
      if (board[r]![c] !== null) count++;
  return count;
}

function makeBoard(rows: Record<number, string>): Board {
  const board = emptyBoard();
  const charToPiece: Record<string, PieceType> = {
    I: 'I', O: 'O', T: 'T', S: 'S', Z: 'Z', L: 'L', J: 'J', X: 'T',
  };
  for (const [rowStr, pattern] of Object.entries(rows)) {
    const row = Number(rowStr);
    for (let c = 0; c < Math.min(pattern.length, BOARD_WIDTH); c++) {
      const ch = pattern[c]!;
      if (ch !== '.') {
        (board[row] as (PieceType | null)[])[c] = charToPiece[ch] ?? 'T';
      }
    }
  }
  return board;
}

function getPostTstBoard(openerId: string, mirror: boolean, routeIndex: number): Board | null {
  const seq = getBag2Sequence(openerId as any, mirror, routeIndex);
  if (!seq || seq.fullSteps.length === 0) return null;
  const bag2FinalBoard = seq.fullSteps[seq.fullSteps.length - 1]!.board;
  const tPlacements = findAllPlacements(bag2FinalBoard, 'T');
  for (const tp of tPlacements) {
    const result = lockAndClear(bag2FinalBoard, tp.piece);
    if (result.linesCleared === 3) return result.board;
  }
  return null;
}

// ── clearFullRows primitive tests ──

describe('clearFullRows (extracted primitive)', () => {
  test('clears single full row', () => {
    const board = makeBoard({ 19: 'IIIIIIIIII' });
    const result = clearFullRows(board);
    expect(result.linesCleared).toBe(1);
    expect(countCells(result.board)).toBe(0);
  });

  test('clears multiple full rows', () => {
    const board = makeBoard({
      18: 'IIIIIIIIII',
      19: 'OOOOOOOOOO',
    });
    const result = clearFullRows(board);
    expect(result.linesCleared).toBe(2);
    expect(countCells(result.board)).toBe(0);
  });

  test('preserves non-full rows and shifts them down', () => {
    const board = makeBoard({
      17: 'III.......',
      18: 'IIIIIIIIII',
      19: 'OOOOOOOOOO',
    });
    const result = clearFullRows(board);
    expect(result.linesCleared).toBe(2);
    expect(countCells(result.board)).toBe(3);
    expect(result.board[19]![0]).not.toBeNull();
    expect(result.board[19]![3]).toBeNull();
  });

  test('returns 0 for board with no full rows', () => {
    const board = makeBoard({ 19: 'IIIII.....' });
    const result = clearFullRows(board);
    expect(result.linesCleared).toBe(0);
    expect(countCells(result.board)).toBe(5);
  });

  test('empty board returns 0', () => {
    const result = clearFullRows(emptyBoard());
    expect(result.linesCleared).toBe(0);
  });

  test('clears 5 full rows (PC scenario)', () => {
    const board = makeBoard({
      15: 'IIIIIIIIII',
      16: 'OOOOOOOOOO',
      17: 'SSSSSSSSSS',
      18: 'ZZZZZZZZZZ',
      19: 'LLLLLLLLLL',
    });
    const result = clearFullRows(board);
    expect(result.linesCleared).toBe(5);
    expect(countCells(result.board)).toBe(0);
  });
});

// ── buildSteps backward compat (no clearLines option) ──

describe('buildSteps backward compatibility', () => {
  const OPENERS = ['honey_cup', 'ms2', 'gamushiro', 'stray_cannon'] as const;

  for (const openerId of OPENERS) {
    test(`${openerId}: buildSteps produces complete steps without linesCleared`, () => {
      const seq = getBag2Sequence(openerId, false, 0);
      if (!seq) return;
      const fullSteps = seq.fullSteps;
      expect(fullSteps.length).toBeGreaterThan(0);
      for (const step of fullSteps) {
        expect(step.linesCleared).toBeUndefined();
      }
    });
  }
});

// ── replayPcSteps tests ──

describe('replayPcSteps', () => {
  test('single piece PC: O fills 2x2 gap, clears 2 lines', () => {
    const board = makeBoard({
      18: '..XXXXXXXX',
      19: '..XXXXXXXX',
    });
    const placements: Placement[] = [{
      piece: 'O',
      cells: [
        { col: 0, row: 18 }, { col: 1, row: 18 },
        { col: 0, row: 19 }, { col: 1, row: 19 },
      ],
      hint: 'O fills gap',
    }];

    const steps = replayPcSteps(board, placements);
    expect(steps.length).toBe(1);
    expect(steps[0]!.linesCleared).toBe(2);
    expect(countCells(steps[0]!.board)).toBe(0); // PC!
  });

  test('two-piece PC with intermediate clear', () => {
    const board = makeBoard({
      17: 'XXXXXX....',
      18: 'XXXXXXXX..',
      19: 'XXXXXXXX..',
    });
    // Step 1: O at cols 8-9, rows 18-19 → clears rows 18-19
    // Step 2: after clear, row 17 shifts to row 19. I fills cols 6-9.
    const placements: Placement[] = [
      {
        piece: 'O',
        cells: [
          { col: 8, row: 18 }, { col: 9, row: 18 },
          { col: 8, row: 19 }, { col: 9, row: 19 },
        ],
        hint: 'O fills cols 8-9',
      },
      {
        piece: 'I',
        cells: [
          { col: 6, row: 19 }, { col: 7, row: 19 },
          { col: 8, row: 19 }, { col: 9, row: 19 },
        ],
        hint: 'I fills remaining (post-clear coords)',
      },
    ];

    const steps = replayPcSteps(board, placements);
    expect(steps.length).toBe(2);
    expect(steps[0]!.linesCleared).toBe(2);
    expect(steps[1]!.linesCleared).toBe(1);
    expect(countCells(steps[1]!.board)).toBe(0); // PC!
  });

  test('no line clears when rows are not full', () => {
    const board = emptyBoard();
    const placements: Placement[] = [{
      piece: 'O',
      cells: [
        { col: 0, row: 18 }, { col: 1, row: 18 },
        { col: 0, row: 19 }, { col: 1, row: 19 },
      ],
      hint: 'O in corner',
    }];

    const steps = replayPcSteps(board, placements);
    expect(steps.length).toBe(1);
    expect(steps[0]!.linesCleared).toBeUndefined();
    expect(countCells(steps[0]!.board)).toBe(4);
  });

  test('BFS reachability catches occupied-cell placement before cell-conflict check', () => {
    const board = makeBoard({ 19: 'X.........' });
    const placements: Placement[] = [{
      piece: 'I',
      cells: [
        { col: 0, row: 19 }, { col: 1, row: 19 },
        { col: 2, row: 19 }, { col: 3, row: 19 },
      ],
      hint: 'I overlaps existing cell',
    }];

    // BFS reachability subsumes cell-conflict: occupied cells make the position unreachable
    expect(() => replayPcSteps(board, placements)).toThrow(/not reachable/i);
  });

  test('empty placements returns empty steps', () => {
    const steps = replayPcSteps(emptyBoard(), []);
    expect(steps.length).toBe(0);
  });

  test('board after each step reflects cumulative state', () => {
    const board = makeBoard({
      18: 'XXXXXXXX..',
      19: 'XXXXXXXX..',
    });
    const placements: Placement[] = [
      {
        piece: 'O',
        cells: [
          { col: 8, row: 18 }, { col: 9, row: 18 },
          { col: 8, row: 19 }, { col: 9, row: 19 },
        ],
        hint: 'O completes rows',
      },
    ];

    const steps = replayPcSteps(board, placements);
    // After O: both rows cleared → empty board
    expect(countCells(steps[0]!.board)).toBe(0);
  });

  test('replayPcSteps rejects unreachable placement', () => {
    // Enclosed pocket: full ceiling at row 16, full floor at row 19,
    // walls on left (col 0) and right (cols 5-9) on rows 17-18.
    // The pocket at rows 17-18, cols 1-4 is completely sealed — no BFS path from spawn.
    const board = makeBoard({
      16: 'XXXXXXXXXX',
      17: 'X....XXXXX',
      18: 'X....XXXXX',
      19: 'XXXXXXXXXX',
    });
    const unreachable: Placement[] = [{
      piece: 'I',
      cells: [
        { col: 1, row: 17 },
        { col: 2, row: 17 },
        { col: 3, row: 17 },
        { col: 4, row: 17 },
      ],
      hint: 'unreachable',
    }];
    expect(() => replayPcSteps(board, unreachable)).toThrow(/not reachable/i);
  });
});

// ── clearFullRows matches lockAndClear ──

describe('clearFullRows matches lockAndClear line-clear logic', () => {
  test('clearFullRows produces same result as lockAndClear for full rows', () => {
    const board = makeBoard({
      18: 'XXXXXXXX..',
      19: 'XXXXXXXX..',
    });
    const stamped = stampCells(board, 'O', [
      { col: 8, row: 18 }, { col: 9, row: 18 },
      { col: 8, row: 19 }, { col: 9, row: 19 },
    ]);

    const fromClearFullRows = clearFullRows(stamped);
    expect(fromClearFullRows.linesCleared).toBe(2);
    expect(countCells(fromClearFullRows.board)).toBe(0);
  });
});

// ── Real post-TST boards ──

describe('real post-TST boards', () => {
  const OPENERS = ['honey_cup', 'ms2', 'gamushiro', 'stray_cannon'] as const;

  for (const openerId of OPENERS) {
    test(`${openerId}: post-TST board has 26 cells in 4-5 rows`, () => {
      const board = getPostTstBoard(openerId, false, 0);
      expect(board).not.toBeNull();
      expect(countCells(board!)).toBe(26);

      for (let r = 0; r < 15; r++) {
        for (let c = 0; c < BOARD_WIDTH; c++) {
          expect(board![r]![c]).toBeNull();
        }
      }
    });

    test(`${openerId}: 24 empty cells = exactly 6 pieces needed for PC`, () => {
      const board = getPostTstBoard(openerId, false, 0);
      if (!board) return;
      let emptyCells = 0;
      for (let r = 15; r < 20; r++)
        for (let c = 0; c < BOARD_WIDTH; c++)
          if (board[r]![c] === null) emptyCells++;
      expect(emptyCells).toBe(24);
      expect(emptyCells % 4).toBe(0);
    });
  }
});

