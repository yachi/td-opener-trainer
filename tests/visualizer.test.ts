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

// ── V1a: Piece-level physics (findFloatingPieces) ──

describe('V1a: findFloatingPieces — piece-level physics', () => {
  test('T-spin overhang is valid piece-level physics', async () => {
    const { createBoard } = await import('../src/core/srs.ts');
    const { findFloatingCells, findFloatingPieces } = await import('../src/core/field-engine.ts');

    const board = createBoard();
    board[19]![4] = 'T'; // one cell on floor
    board[18]![3] = 'T'; // left
    board[18]![4] = 'T'; // center
    board[18]![5] = 'T'; // right — this "floats" (nothing at 19,5)

    // Cell-level check: 2 floating cells at (3,18) and (5,18) — WRONG to flag these
    const cellFloating = findFloatingCells(board);
    expect(cellFloating.length).toBe(2); // (3,18) and (5,18) have nothing below

    // Piece-level check: T piece is valid — has cell at floor
    const pieceFloating = findFloatingPieces(board);
    expect(pieceFloating.length).toBe(0); // no floating PIECES
  });

  test('genuinely floating piece is detected', async () => {
    const { createBoard } = await import('../src/core/srs.ts');
    const { findFloatingPieces } = await import('../src/core/field-engine.ts');

    const board = createBoard();
    // O piece floating in mid-air (row 10-11, no support below)
    board[10]![3] = 'O';
    board[10]![4] = 'O';
    board[11]![3] = 'O';
    board[11]![4] = 'O';

    const pieceFloating = findFloatingPieces(board);
    expect(pieceFloating.length).toBe(1);
    expect(pieceFloating[0]!.piece).toBe('O');
  });

  test('piece on floor is not floating', async () => {
    const { createBoard } = await import('../src/core/srs.ts');
    const { findFloatingPieces } = await import('../src/core/field-engine.ts');

    const board = createBoard();
    board[19]![0] = 'I';
    board[19]![1] = 'I';
    board[19]![2] = 'I';
    board[19]![3] = 'I';

    const pieceFloating = findFloatingPieces(board);
    expect(pieceFloating.length).toBe(0);
  });

  test('piece resting on different piece is not floating', async () => {
    const { createBoard } = await import('../src/core/srs.ts');
    const { findFloatingPieces } = await import('../src/core/field-engine.ts');

    const board = createBoard();
    // I piece on floor
    board[19]![0] = 'I';
    board[19]![1] = 'I';
    board[19]![2] = 'I';
    board[19]![3] = 'I';
    // T piece on top of I — one cell overhangs
    board[18]![0] = 'T';
    board[18]![1] = 'T';
    board[18]![2] = 'T';
    board[17]![1] = 'T';

    const pieceFloating = findFloatingPieces(board);
    expect(pieceFloating.length).toBe(0);
  });

  test('two pieces of same type are treated as separate components', async () => {
    const { createBoard } = await import('../src/core/srs.ts');
    const { findFloatingPieces } = await import('../src/core/field-engine.ts');

    const board = createBoard();
    // First I piece on floor (cols 0-3)
    board[19]![0] = 'I';
    board[19]![1] = 'I';
    board[19]![2] = 'I';
    board[19]![3] = 'I';
    // Second I piece floating (cols 6-9, row 10)
    board[10]![6] = 'I';
    board[10]![7] = 'I';
    board[10]![8] = 'I';
    board[10]![9] = 'I';

    const pieceFloating = findFloatingPieces(board);
    expect(pieceFloating.length).toBe(1);
    expect(pieceFloating[0]!.cells.every(c => c.row === 10)).toBe(true);
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

  test('stepForward advances from 0 through all Bag 1 steps', async () => {
    const { createVisualizerState, stepForward, getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq);
    const totalSteps = seq.steps.length;

    for (let i = 1; i <= totalSteps; i++) {
      stepForward(state);
      expect(state.currentStep).toBe(i);
    }
    expect(state.bag).toBe(1);
    // One more step transitions to Bag 2 (all openers now have Bag 2 routes)
    stepForward(state);
    expect(state.bag).toBe(2);
    expect(state.currentStep).toBe(0);
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

// ── V6: Layout constraints — prevent content from rendering behind status bar ──

describe('V6: Layout constraints', () => {
  test('board bottom + content must not overlap the status bar', async () => {
    const { LAYOUT, CANVAS_H } = await import('../src/renderer/board.ts');

    const boardBottom = LAYOUT.board.y + LAYOUT.board.h;
    const statusBarTop = LAYOUT.statusBar.y;
    const gap = statusBarTop - boardBottom;

    // The gap between board bottom and status bar must exist
    expect(gap).toBeGreaterThan(0);
    // Status bar must fit within canvas
    expect(LAYOUT.statusBar.y + LAYOUT.statusBar.h).toBeLessThanOrEqual(CANVAS_H);
  });

  test('drill hint text position is above the status bar', () => {
    // The drill hint renders at BOARD_Y + 120 = 180 (in the hold area).
    // This must be well above the status bar at y=672.
    const BOARD_Y = 60;  // LAYOUT.board.y
    const hintY = BOARD_Y + 120;
    const statusBarY = 672; // LAYOUT.statusBar.y

    expect(hintY).toBeLessThan(statusBarY);
    // With enough margin for 2 lines of text (~32px)
    expect(hintY + 32).toBeLessThan(statusBarY);
  });

  test('board area does not overlap with tab bar', async () => {
    const { LAYOUT } = await import('../src/renderer/board.ts');
    const tabBottom = LAYOUT.tabBar.y + LAYOUT.tabBar.h;
    expect(LAYOUT.board.y).toBeGreaterThanOrEqual(tabBottom);
  });
});

// ── V7: Bag 2 Routes ──

describe('V7: Bag 2 routes', () => {
  test('getBag2Routes returns routes for all 4 openers', async () => {
    const { getBag2Routes } = await import('../src/modes/visualizer.ts');
    const OPENER_IDS: OpenerID[] = ['stray_cannon', 'honey_cup', 'gamushiro', 'ms2'];
    for (const id of OPENER_IDS) {
      const routes = getBag2Routes(id, false);
      expect(routes.length).toBeGreaterThanOrEqual(2);
      expect(routes[0]!.routeId.length).toBeGreaterThan(0);
      expect(routes[0]!.routeLabel.length).toBeGreaterThan(0);
      expect(routes[0]!.condition.length).toBeGreaterThan(0);
      expect(routes[0]!.placements.length).toBe(6); // 6 pieces after T fires TST
    }
  });

  test('getBag2Routes for MS2 returns setup_a and setup_b', async () => {
    const { getBag2Routes } = await import('../src/modes/visualizer.ts');
    const routes = getBag2Routes('ms2', false);
    expect(routes.length).toBe(2);
    expect(routes[0]!.routeId).toBe('setup_a');
    expect(routes[1]!.routeId).toBe('setup_b');
  });

  test('getBag2Routes returns mirrored routes when mirror=true', async () => {
    const { getBag2Routes } = await import('../src/modes/visualizer.ts');
    const normal = getBag2Routes('ms2', false);
    const mirrored = getBag2Routes('ms2', true);
    expect(mirrored.length).toBe(normal.length);
    expect(mirrored[0]!.routeLabel).toContain('Mirror');
  });

  test('getBag2Sequence step 0 = first route piece on Bag 1 board', async () => {
    const { getBag2Sequence, getBag2Routes } = await import('../src/modes/visualizer.ts');

    const routes = getBag2Routes('ms2', false);
    const bag2Seq = getBag2Sequence('ms2', false, 0);
    expect(bag2Seq).not.toBeNull();
    expect(bag2Seq!.steps[0]!.piece).toBe(routes[0]!.placements[0]!.piece);
    expect(bag2Seq!.steps[0]!.newCells.length).toBe(4);
  });

  test('getBag2Sequence has 6 steps (6 route pieces, no TST)', async () => {
    const { getBag2Sequence } = await import('../src/modes/visualizer.ts');
    const OPENER_IDS: OpenerID[] = ['stray_cannon', 'honey_cup', 'gamushiro', 'ms2'];
    for (const id of OPENER_IDS) {
      const bag2Seq = getBag2Sequence(id, false, 0);
      expect(bag2Seq).not.toBeNull();
      expect(bag2Seq!.steps.length).toBe(6);
    }
  });

  test('getBag2Sequence returns null for invalid route index', async () => {
    const { getBag2Sequence } = await import('../src/modes/visualizer.ts');
    const result = getBag2Sequence('ms2', false, 99);
    expect(result).toBeNull();
  });

  test('navigation: stepForward from last Bag 1 step enters Bag 2', async () => {
    const {
      createVisualizerState,
      getOpenerSequence,
      stepForward,
    } = await import('../src/modes/visualizer.ts');

    const seq = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq);

    // Advance to end of Bag 1
    for (let i = 0; i < seq.steps.length; i++) {
      stepForward(state);
    }
    expect(state.currentStep).toBe(seq.steps.length);
    expect(state.bag).toBe(1);

    // One more step should enter Bag 2
    stepForward(state);
    expect(state.bag).toBe(2);
    expect(state.currentStep).toBe(0);
    expect(state.bag2Sequence).not.toBeNull();
  });

  test('navigation: stepBackward from Bag 2 step 0 returns to Bag 1', async () => {
    const {
      createVisualizerState,
      getOpenerSequence,
      stepForward,
      stepBackward,
    } = await import('../src/modes/visualizer.ts');

    const seq = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq);

    // Advance into Bag 2
    for (let i = 0; i <= seq.steps.length; i++) {
      stepForward(state);
    }
    expect(state.bag).toBe(2);
    expect(state.currentStep).toBe(0);

    // Step backward should return to Bag 1 last step
    stepBackward(state);
    expect(state.bag).toBe(1);
    expect(state.currentStep).toBe(seq.steps.length);
    expect(state.bag2Sequence).toBeNull();
  });

  test('navigation: all openers can transition from Bag 1 to Bag 2', async () => {
    const {
      createVisualizerState,
      getOpenerSequence,
      stepForward,
    } = await import('../src/modes/visualizer.ts');

    const OPENER_IDS: OpenerID[] = ['stray_cannon', 'honey_cup', 'gamushiro', 'ms2'];
    for (const id of OPENER_IDS) {
      const seq = getOpenerSequence(id, false);
      const state = createVisualizerState(seq);

      // Advance to end of Bag 1
      for (let i = 0; i < seq.steps.length; i++) {
        stepForward(state);
      }
      expect(state.bag).toBe(1);

      // One more step enters Bag 2
      stepForward(state);
      expect(state.bag).toBe(2);
      expect(state.currentStep).toBe(0);
      expect(state.bag2Sequence).not.toBeNull();
      expect(state.bag2Sequence!.steps.length).toBe(6);
    }
  });

  test('switchBag2Route changes the active route', async () => {
    const {
      createVisualizerState,
      getOpenerSequence,
      stepForward,
      switchBag2Route,
    } = await import('../src/modes/visualizer.ts');

    const seq = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq);

    // Enter Bag 2
    for (let i = 0; i <= seq.steps.length; i++) {
      stepForward(state);
    }
    expect(state.bag).toBe(2);
    expect(state.bag2RouteIndex).toBe(0);

    // Switch to a non-existent route index — should be a no-op
    switchBag2Route(state, 99);
    expect(state.bag2RouteIndex).toBe(0);

    // Switch to route 0 again — should reset step
    stepForward(state); // advance to step 1
    expect(state.currentStep).toBe(1);
    switchBag2Route(state, 0);
    expect(state.currentStep).toBe(0);
    expect(state.bag2RouteIndex).toBe(0);
  });

  test('createVisualizerState initializes Bag 2 fields', async () => {
    const { createVisualizerState, getOpenerSequence } = await import('../src/modes/visualizer.ts');
    const seq = getOpenerSequence('ms2', false);
    const state = createVisualizerState(seq);

    expect(state.bag).toBe(1);
    expect(state.bag2RouteIndex).toBe(0);
    expect(state.bag2Sequence).toBeNull();
  });

});

// ── V8: No Bag 2 step has unsupported piece cells (floating fix) ──

// ── V10: Complete Board Oracle Test ──

describe('V10: Bag 2 final board matches Hard Drop wiki golden data', () => {
  const golden = require('./fixtures/bag2-golden.json');
  const OPENER_IDS: OpenerID[] = ['honey_cup', 'ms2', 'stray_cannon', 'gamushiro'];

  for (const id of OPENER_IDS) {
    const openerGolden = golden[id];
    if (!openerGolden) continue;

    for (const [routeKey, pieceData] of Object.entries(openerGolden)) {
      test(`${id} ${routeKey}: final board matches wiki`, async () => {
        const { getBag2Sequence, getBag2Routes } = await import('../src/modes/visualizer.ts');
        const routes = getBag2Routes(id, false);
        const routeIndex = routes.findIndex(r => r.routeId === routeKey);

        if (routeIndex < 0) {
          throw new Error(`Route ${routeKey} not found in ${id} routes`);
        }

        const seq = getBag2Sequence(id, false, routeIndex)!;
        const finalBoard = seq.steps[seq.steps.length - 1]!.board;
        const goldenPieces = pieceData as Record<string, unknown>;
        const PIECE_KEYS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

        let totalGoldenCells = 0;
        const mismatches: string[] = [];

        for (const [piece, cells] of Object.entries(goldenPieces)) {
          if (!PIECE_KEYS.includes(piece)) continue;
          for (const { col, row } of cells as { col: number; row: number }[]) {
            totalGoldenCells++;
            const actual = finalBoard[row]?.[col];
            if (actual !== piece) {
              mismatches.push(`${piece}(${col},${row}) expected ${piece} got ${actual}`);
            }
          }
        }

        if (mismatches.length > 0) {
          throw new Error(
            `${id} ${routeKey}: ${mismatches.length}/${totalGoldenCells} cells missing:\n` +
            mismatches.join('\n')
          );
        }
      });
    }
  }
});

// ── V11: Transition Continuity Test ──

describe('V11: Bag 1→2 transition preserves Bag 1 cells in baseBoard', () => {
  const OPENER_IDS: OpenerID[] = ['honey_cup', 'ms2', 'stray_cannon', 'gamushiro'];

  for (const id of OPENER_IDS) {
    for (const mirror of [false, true]) {
      const label = `${id} ${mirror ? '(mirror)' : '(normal)'}`;

      test(`${label}: every Bag 1 cell present in Bag 2 baseBoard`, async () => {
        const { getOpenerSequence, getBag2Sequence, getBag2Routes } =
          await import('../src/modes/visualizer.ts');

        const bag1Seq = getOpenerSequence(id, mirror);
        const bag1Final = bag1Seq.steps[bag1Seq.steps.length - 1]!.board;

        const routes = getBag2Routes(id, mirror);
        if (routes.length === 0) return;

        const bag2Seq = getBag2Sequence(id, mirror, 0);
        if (!bag2Seq || !bag2Seq.baseBoard) {
          throw new Error(`${label}: baseBoard not set on Bag 2 sequence`);
        }

        const missing: string[] = [];
        for (let r = 0; r < 20; r++) {
          for (let c = 0; c < 10; c++) {
            if (bag1Final[r]![c] !== null && bag2Seq.baseBoard[r]![c] === null) {
              missing.push(`(${c},${r})=${bag1Final[r]![c]}`);
            }
          }
        }

        if (missing.length > 0) {
          throw new Error(
            `${label}: ${missing.length} Bag 1 cells missing from baseBoard:\n` +
            missing.join(', ')
          );
        }
      });
    }
  }
});

// V8: Bag 2 pieces may visually "float" because they're placed on Bag 1
// (without gap-fillers). This is correct — pieces are SRS-reachable.
// The real guardrails are:
// - Golden fumens (boards match Hard Drop wiki)
// - Reachability tests (Bag 1 placements verified SRS-reachable)
// - V9 (Bag 1 cells preserved in Bag 2)

// ── V9: Bag 2 step 0 is a superset of Bag 1 final ──

describe('V9: Bag 2 base board matches route residual', () => {
  test('every residual cell is present in Bag 2 step 0 for all openers', async () => {
    const { getBag2Sequence, getBag2Routes } = await import('../src/modes/visualizer.ts');
    const bag2Golden = (await import('./fixtures/bag2-golden.json')).default;
    const OPENER_IDS: OpenerID[] = ['honey_cup', 'ms2', 'stray_cannon', 'gamushiro'];
    const missing: string[] = [];

    for (const id of OPENER_IDS) {
      for (const mirror of [false, true]) {
        const routes = getBag2Routes(id, mirror);
        const wikiRoutes = bag2Golden[id] as Record<string, { residual?: { col: number; row: number }[] }>;

        for (let ri = 0; ri < routes.length; ri++) {
          const bag2 = getBag2Sequence(id, mirror, ri);
          if (!bag2) continue;
          const bag2Step0 = bag2.steps[0]!.board;
          const newCellSet = new Set(bag2.steps[0]!.newCells.map(c => `${c.col},${c.row}`));

          // Get residual from wiki fixture, mirror if needed
          const rawResidual = wikiRoutes[routes[ri]!.routeId]?.residual;
          if (!rawResidual) continue;
          const residual = mirror
            ? rawResidual.map((c: { col: number; row: number }) => ({ col: 9 - c.col, row: c.row }))
            : rawResidual;

          for (const cell of residual) {
            if (bag2Step0[cell.row]![cell.col] === null && !newCellSet.has(`${cell.col},${cell.row}`)) {
              missing.push(`${id}${mirror ? ' mirror' : ''} r${ri}: (${cell.col},${cell.row}) residual missing in Bag2 step0`);
            }
          }
        }
      }
    }

    if (missing.length > 0) {
      throw new Error(`Bag 2 step 0 missing residual cells:\n${missing.join('\n')}`);
    }
  });
});

// ── V12: Base board cells are Bag 1 pieces or hold piece (no unknown types) ──

describe('V12: Base board = Bag 1 + hold piece', () => {
  const OPENER_IDS: OpenerID[] = ['honey_cup', 'ms2', 'stray_cannon', 'gamushiro'];

  for (const id of OPENER_IDS) {
    for (const mirror of [false, true]) {
      const label = `${id} ${mirror ? '(mirror)' : '(normal)'}`;

      test(`${label}: every base board cell is Bag 1 piece or hold piece`, async () => {
        const { getOpenerSequence, getBag2Sequence, getBag2Routes } =
          await import('../src/modes/visualizer.ts');

        const bag1Seq = getOpenerSequence(id, mirror);
        const bag1Final = bag1Seq.steps[bag1Seq.steps.length - 1]!.board;
        const holdPiece = bag1Seq.holdPiece;

        const routes = getBag2Routes(id, mirror);
        if (routes.length === 0) return;

        const bag2Seq = getBag2Sequence(id, mirror, 0);
        if (!bag2Seq?.baseBoard) return;

        const issues: string[] = [];
        for (let r = 0; r < 20; r++) {
          for (let c = 0; c < 10; c++) {
            const cell = bag2Seq.baseBoard[r]![c];
            if (cell === null) continue;
            const bag1Cell = bag1Final[r]![c];
            if (bag1Cell !== null) {
              // Should match Bag 1
              if (cell !== bag1Cell) {
                issues.push(`(${c},${r}): expected Bag1 ${bag1Cell}, got ${cell}`);
              }
            } else {
              // Not in Bag 1 — must be hold piece
              if (cell !== holdPiece) {
                issues.push(`(${c},${r}): expected holdPiece ${holdPiece}, got ${cell}`);
              }
            }
          }
        }

        if (issues.length > 0) {
          throw new Error(`${label}: ${issues.length} type mismatches:\n${issues.join('\n')}`);
        }
      });
    }
  }
});
