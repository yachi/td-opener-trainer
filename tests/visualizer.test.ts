import { describe, test, expect } from 'bun:test';
import type { PieceType } from '../src/core/types.ts';
import type { OpenerID } from '../src/openers/types.ts';

// ── Types for the visualizer module ──

/** A single placement step: one piece placed on the board. */
interface PlacementStep {
  /** Which piece is placed in this step */
  piece: PieceType;
  /** Board grid AFTER this piece is placed (20 rows x 10 cols, null = empty) */
  board: (PieceType | null)[][];
  /** Cells that were just placed (for highlighting the new piece) */
  newCells: { col: number; row: number }[];
  /** Human-readable placement hint, e.g. "I flat, cols 6-9, row 0" */
  hint: string;
}

/** Full placement sequence for one opener (one specific bag order). */
interface OpenerSequence {
  openerId: OpenerID;
  mirror: boolean;
  /** The bag that produces this sequence */
  bag: PieceType[];
  /** Which piece is held (not placed on board in bag 1) */
  holdPiece: PieceType;
  /** Step-by-step placements (6 steps for bag 1: 7 pieces - 1 held) */
  steps: PlacementStep[];
  /** Annotations for T-spin slots after bag 1 is placed */
  tSpinSlots: {
    tst: { col: number; row: number; rotation: number } | null;
    tsd: { col: number; row: number; rotation: number } | null;
  };
}

/** Visualizer state for stepping through an opener. */
interface VisualizerState {
  sequence: OpenerSequence;
  currentStep: number; // 0 = empty board, 1..6 = after piece N placed
  playing: boolean; // auto-advance animation
}

// ── V1: Opener Placement Data ──

describe('V1: Opener placement data exists for all 4 openers', () => {
  // The module should export placement data for each opener.
  // We import lazily so tests define the contract before implementation.

  const OPENER_IDS: OpenerID[] = ['stray_cannon', 'honey_cup', 'gamushiro', 'ms2'];

  test('getOpenerSequence returns a sequence for each opener (normal side)', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    for (const id of OPENER_IDS) {
      const seq = getOpenerSequence(id, false);
      expect(seq).toBeDefined();
      expect(seq.openerId).toBe(id);
      expect(seq.mirror).toBe(false);
    }
  });

  test('getOpenerSequence returns a sequence for each opener (mirror side)', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    for (const id of OPENER_IDS) {
      const seq = getOpenerSequence(id, true);
      expect(seq).toBeDefined();
      expect(seq.openerId).toBe(id);
      expect(seq.mirror).toBe(true);
    }
  });

  test('each sequence has 6 or 7 placement steps', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    for (const id of OPENER_IDS) {
      const seq = getOpenerSequence(id, false);
      expect(seq.steps.length).toBeGreaterThanOrEqual(6);
      expect(seq.steps.length).toBeLessThanOrEqual(7);
    }
  });

  test('each step has a valid board state (20x10 grid)', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('ms2', false);
    for (const step of seq.steps) {
      expect(step.board.length).toBe(20);
      for (const row of step.board) {
        expect(row.length).toBe(10);
      }
    }
  });

  test('step boards are cumulative — step N contains all cells from step N-1', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('ms2', false);

    for (let i = 1; i < seq.steps.length; i++) {
      const prev = seq.steps[i - 1]!;
      const curr = seq.steps[i]!;
      // Every filled cell in prev must still be filled in curr
      for (let r = 0; r < 20; r++) {
        for (let c = 0; c < 10; c++) {
          if (prev.board[r]![c] !== null) {
            expect(curr.board[r]![c]).not.toBeNull();
          }
        }
      }
    }
  });

  test('newCells in each step are non-empty and match exactly 4 cells (or 0 for O/I edge cases)', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('ms2', false);
    for (const step of seq.steps) {
      // Every standard piece has exactly 4 cells
      expect(step.newCells.length).toBe(4);
      // Each newCell should correspond to a filled cell on the board
      for (const cell of step.newCells) {
        expect(step.board[cell.row]![cell.col]).not.toBeNull();
      }
    }
  });

  test('holdPiece matches the opener definition', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const { OPENERS } = await import('../src/openers/decision.ts');
    for (const id of OPENER_IDS) {
      const seq = getOpenerSequence(id, false);
      expect(seq.holdPiece).toBe(OPENERS[id].holdPiece);

      const seqMirror = getOpenerSequence(id, true);
      expect(seqMirror.holdPiece).toBe(OPENERS[id].holdPieceMirror);
    }
  });

  test('each step has a non-empty hint string', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('honey_cup', false);
    for (const step of seq.steps) {
      expect(step.hint.length).toBeGreaterThan(0);
    }
  });
});

// ── V1b: Gravity validation — no floating pieces ──

describe('V1b: Placement order respects gravity (no floating pieces)', () => {
  const OPENER_IDS: OpenerID[] = ['stray_cannon', 'honey_cup', 'gamushiro', 'ms2'];

  /**
   * A piece is supported if at least one of its cells has:
   * - row 19 (floor), OR
   * - a non-null cell directly below it that is NOT part of the same piece
   */
  function isPieceSupported(
    board: (PieceType | null)[][],
    newCells: { col: number; row: number }[],
  ): boolean {
    const cellSet = new Set(newCells.map((c) => `${c.col},${c.row}`));
    for (const { col, row } of newCells) {
      if (row >= 19) return true; // on floor
      const below = board[row + 1]?.[col];
      if (below !== null && !cellSet.has(`${col},${row + 1}`)) return true; // on existing piece
    }
    return false;
  }

  for (const id of OPENER_IDS) {
    for (const mirror of [false, true]) {
      const label = `${id} ${mirror ? '(mirror)' : '(normal)'}`;

      test(`${label}: every piece rests on floor or prior pieces`, async () => {
        const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
        const seq = getOpenerSequence(id, mirror);

        // Build the board step by step, checking gravity at each step
        const board: (PieceType | null)[][] = Array.from({ length: 20 }, () =>
          Array(10).fill(null),
        );

        for (let i = 0; i < seq.steps.length; i++) {
          const step = seq.steps[i]!;
          const supported = isPieceSupported(board, step.newCells);
          expect(supported).toBe(true);
          // "Lock" the piece onto the board
          for (const { col, row } of step.newCells) {
            board[row]![col] = step.piece;
          }
        }
      });
    }
  }
});

// ── V2: Visualizer State Machine ──

describe('V2: Visualizer state machine', () => {
  test('createVisualizerState starts at step 0 (empty board)', async () => {
    const { createVisualizerState, getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq);
    expect(state.currentStep).toBe(0);
    expect(state.playing).toBe(false);
  });

  test('stepForward advances from 0 to 6, then stops', async () => {
    const { createVisualizerState, stepForward, getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq);

    for (let i = 1; i <= 6; i++) {
      stepForward(state);
      expect(state.currentStep).toBe(i);
    }
    // Cannot go past the last step
    stepForward(state);
    expect(state.currentStep).toBe(6);
  });

  test('stepBackward goes from 6 to 0, then stops', async () => {
    const { createVisualizerState, stepForward, stepBackward, getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq);

    // Go to the end
    for (let i = 0; i < 6; i++) stepForward(state);
    expect(state.currentStep).toBe(6);

    // Step back to beginning
    for (let i = 5; i >= 0; i--) {
      stepBackward(state);
      expect(state.currentStep).toBe(i);
    }
    // Cannot go below 0
    stepBackward(state);
    expect(state.currentStep).toBe(0);
  });

  test('jumpToStep clamps to valid range', async () => {
    const { createVisualizerState, jumpToStep, getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq);

    jumpToStep(state, 3);
    expect(state.currentStep).toBe(3);

    jumpToStep(state, -1);
    expect(state.currentStep).toBe(0);

    jumpToStep(state, 99);
    expect(state.currentStep).toBe(6);
  });

  test('getCurrentBoard returns empty grid at step 0, filled grid at step N', async () => {
    const { createVisualizerState, stepForward, getCurrentBoard, getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq);

    // Step 0: empty board
    const emptyBoard = getCurrentBoard(state);
    const filledCells = emptyBoard.flat().filter((c) => c !== null).length;
    expect(filledCells).toBe(0);

    // Step 3: should have 12 cells (3 pieces x 4 cells)
    for (let i = 0; i < 3; i++) stepForward(state);
    const partialBoard = getCurrentBoard(state);
    const partialFilled = partialBoard.flat().filter((c) => c !== null).length;
    expect(partialFilled).toBe(12);
  });
});

// ── V3: T-Spin Slot Annotations ──

describe('V3: T-spin slot annotations', () => {
  test('final board state has TST slot defined for each opener', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const OPENER_IDS: OpenerID[] = ['stray_cannon', 'honey_cup', 'gamushiro', 'ms2'];

    for (const id of OPENER_IDS) {
      const seq = getOpenerSequence(id, false);
      expect(seq.tSpinSlots.tst).not.toBeNull();
      // TST slot position should be within board bounds
      const tst = seq.tSpinSlots.tst!;
      expect(tst.col).toBeGreaterThanOrEqual(0);
      expect(tst.col).toBeLessThan(10);
      expect(tst.row).toBeGreaterThanOrEqual(0);
      expect(tst.row).toBeLessThan(20);
    }
  });

  test('final board state has TSD slot defined for each opener', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const OPENER_IDS: OpenerID[] = ['stray_cannon', 'honey_cup', 'gamushiro', 'ms2'];

    for (const id of OPENER_IDS) {
      const seq = getOpenerSequence(id, false);
      expect(seq.tSpinSlots.tsd).not.toBeNull();
      const tsd = seq.tSpinSlots.tsd!;
      expect(tsd.col).toBeGreaterThanOrEqual(0);
      expect(tsd.col).toBeLessThan(10);
    }
  });
});

// ── V4: Board Rendering Integration ──

describe('V4: Board data is compatible with existing renderer', () => {
  test('board grid uses PieceType values (compatible with COLORS.pieces lookup)', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const validTypes = new Set<string>(['I', 'T', 'O', 'S', 'Z', 'L', 'J']);

    const seq = getOpenerSequence('honey_cup', false);
    const finalBoard = seq.steps[seq.steps.length - 1]!.board;

    for (const row of finalBoard) {
      for (const cell of row) {
        if (cell !== null) {
          expect(validTypes.has(cell)).toBe(true);
        }
      }
    }
  });

  test('board grid can be converted to color grid for drawFilledCells', async () => {
    const { getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const { PIECE_DEFINITIONS } = await import('../src/core/pieces.ts');

    const seq = getOpenerSequence('ms2', false);
    const finalBoard = seq.steps[seq.steps.length - 1]!.board;

    // Convert PieceType grid → color grid (what drawFilledCells expects)
    const colorGrid: (string | null)[][] = finalBoard.map((row) =>
      row.map((cell) => (cell ? PIECE_DEFINITIONS[cell].color : null)),
    );

    // Should have 24 filled cells (6 pieces x 4 cells)
    const filled = colorGrid.flat().filter((c) => c !== null).length;
    expect(filled).toBe(24);
  });
});

// ── V5: Opener Switching ──

describe('V5: User can switch between openers', () => {
  test('getAvailableOpeners returns all 4 openers with display names', async () => {
    const { getAvailableOpeners } = await import('../src/modes/visualizer.ts');
    const openers = getAvailableOpeners();
    expect(openers.length).toBe(4);
    for (const o of openers) {
      expect(o.id).toBeDefined();
      expect(o.nameEn).toBeDefined();
      expect(o.nameCn).toBeDefined();
    }
  });

  test('switching opener resets visualizer state to step 0', async () => {
    const { createVisualizerState, stepForward, getOpenerSequence } = await import('../src/modes/visualizer.ts');

    const seq1 = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq1);
    stepForward(state);
    stepForward(state);
    expect(state.currentStep).toBe(2);

    // Switch to a different opener
    const seq2 = getOpenerSequence('honey_cup', false);
    const newState = createVisualizerState(seq2);
    expect(newState.currentStep).toBe(0);
    expect(newState.sequence.openerId).toBe('honey_cup');
  });
});
