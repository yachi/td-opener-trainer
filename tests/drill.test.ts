import { describe, test, expect } from 'bun:test';
import type { PieceType } from '../src/core/types.ts';
import type { OpenerID } from '../src/openers/types.ts';
import {
  createDrillState,
  createDrillStateWithBag,
  movePiece,
  rotatePiece,
  hardDropPiece,
  holdCurrentPiece,
  softDropPiece,
  checkOpenerMatch,
  resetDrill,
  getExpectedBoard,
} from '../src/modes/drill.ts';
import type { DrillState } from '../src/modes/drill.ts';
import { OPENERS } from '../src/openers/decision.ts';
import { createBoard } from '../src/core/srs.ts';

// ── Helpers ──

const OPENER_IDS: OpenerID[] = ['stray_cannon', 'honey_cup', 'gamushiro', 'ms2'];

// A known buildable bag for MS2 (J before L): J appears at index 0, L at index 6
const MS2_BAG: PieceType[] = ['J', 'T', 'S', 'Z', 'I', 'O', 'L'];

// A known buildable bag for Honey Cup (L not last of L,O,T): L=0, O=5, T=1
const HONEY_CUP_BAG: PieceType[] = ['L', 'T', 'S', 'Z', 'I', 'O', 'J'];

// A known buildable bag for Stray Cannon (L not last of L,J,S): L=0, J=3, S=2
const STRAY_CANNON_BAG: PieceType[] = ['L', 'T', 'S', 'J', 'I', 'O', 'Z'];

// ── D1: createDrillState ──

describe('D1: createDrillState', () => {
  test('creates a state with phase "playing"', () => {
    const state = createDrillState('ms2');
    expect(state.phase).toBe('playing');
  });

  test('spawns first piece from the bag', () => {
    const state = createDrillState('ms2');
    expect(state.activePiece).not.toBeNull();
    expect(state.activePiece!.type).toBe(state.bagPieces[0]);
  });

  test('queue contains remaining 6 pieces', () => {
    const state = createDrillState('ms2');
    expect(state.queue.length).toBe(6);
  });

  test('board is empty on creation', () => {
    const state = createDrillState('ms2');
    for (const row of state.board) {
      for (const cell of row) {
        expect(cell).toBeNull();
      }
    }
  });

  test('holdPiece is null initially', () => {
    const state = createDrillState('ms2');
    expect(state.holdPiece).toBeNull();
  });

  test('piecesPlaced starts at 0', () => {
    const state = createDrillState('ms2');
    expect(state.piecesPlaced).toBe(0);
  });

  test('generated bag is buildable for the selected opener', () => {
    for (const id of OPENER_IDS) {
      const state = createDrillState(id);
      const def = OPENERS[id];
      const buildable = def.canBuild(state.bagPieces) || def.canBuildMirror(state.bagPieces);
      expect(buildable).toBe(true);
    }
  });

  test('prefers normal side over mirror when both work', () => {
    // J before L → canBuild = true for MS2
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    expect(state.mirror).toBe(false);
  });

  test('bagPieces is a copy (not a reference to queue)', () => {
    const state = createDrillState('ms2');
    expect(state.bagPieces.length).toBe(7);
    // bagPieces should contain all 7 pieces even though queue has 6
    expect(state.bagPieces[0]).toBe(state.activePiece!.type);
  });
});

// ── D2: createDrillStateWithBag ──

describe('D2: createDrillStateWithBag', () => {
  test('uses the provided bag', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    expect(state.bagPieces).toEqual(MS2_BAG);
    expect(state.activePiece!.type).toBe('J');
    expect(state.queue).toEqual(['T', 'S', 'Z', 'I', 'O', 'L']);
  });

  test('respects mirror flag', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, true);
    expect(state.mirror).toBe(true);
  });
});

// ── D3: movePiece ──

describe('D3: movePiece', () => {
  test('moves piece left', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const col0 = state.activePiece!.col;
    const moved = movePiece(state, -1, 0);
    expect(moved.activePiece!.col).toBe(col0 - 1);
  });

  test('moves piece right', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const col0 = state.activePiece!.col;
    const moved = movePiece(state, 1, 0);
    expect(moved.activePiece!.col).toBe(col0 + 1);
  });

  test('blocked by left wall returns same state', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    // Move left repeatedly until wall
    for (let i = 0; i < 15; i++) {
      state = movePiece(state, -1, 0);
    }
    const atWall = state;
    const blocked = movePiece(atWall, -1, 0);
    // Should be same state (col unchanged)
    expect(blocked.activePiece!.col).toBe(atWall.activePiece!.col);
  });

  test('blocked by right wall returns same state', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    // Move right repeatedly until wall
    for (let i = 0; i < 15; i++) {
      state = movePiece(state, 1, 0);
    }
    const atWall = state;
    const blocked = movePiece(atWall, 1, 0);
    expect(blocked.activePiece!.col).toBe(atWall.activePiece!.col);
  });

  test('does nothing when phase is not "playing"', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const nonPlaying = { ...state, phase: 'success' as const };
    const result = movePiece(nonPlaying, 1, 0);
    expect(result).toBe(nonPlaying);
  });

  test('moves piece down', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const row0 = state.activePiece!.row;
    const moved = movePiece(state, 0, 1);
    expect(moved.activePiece!.row).toBe(row0 + 1);
  });
});

// ── D4: rotatePiece ──

describe('D4: rotatePiece', () => {
  test('rotates piece clockwise', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const rot0 = state.activePiece!.rotation;
    const rotated = rotatePiece(state, 1);
    expect(rotated.activePiece!.rotation).toBe((rot0 + 1) % 4);
  });

  test('rotates piece counter-clockwise', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const rot0 = state.activePiece!.rotation;
    const rotated = rotatePiece(state, -1);
    expect(rotated.activePiece!.rotation).toBe((rot0 + 3) % 4);
  });

  test('does nothing when phase is not "playing"', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const nonPlaying = { ...state, phase: 'failed' as const };
    const result = rotatePiece(nonPlaying, 1);
    expect(result).toBe(nonPlaying);
  });
});

// ── D5: hardDropPiece ──

describe('D5: hardDropPiece', () => {
  test('locks piece and increments piecesPlaced', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const dropped = hardDropPiece(state);
    expect(dropped.piecesPlaced).toBe(1);
    // Board should have some filled cells now
    const hasFilled = dropped.board.some((row) => row.some((cell) => cell !== null));
    expect(hasFilled).toBe(true);
  });

  test('spawns next piece from queue after lock', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const dropped = hardDropPiece(state);
    // Next piece should be the second in the bag
    expect(dropped.activePiece!.type).toBe(MS2_BAG[1]);
    expect(dropped.queue.length).toBe(5);
  });

  test('resets holdUsed after spawning next piece', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    state = holdCurrentPiece(state); // hold J, spawn T
    expect(state.holdUsed).toBe(true);
    state = hardDropPiece(state); // drop T, spawn S
    expect(state.holdUsed).toBe(false);
  });

  test('does nothing when phase is not "playing"', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const nonPlaying = { ...state, phase: 'success' as const };
    const result = hardDropPiece(nonPlaying);
    expect(result).toBe(nonPlaying);
  });

  test('does nothing when no active piece', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const noActive = { ...state, activePiece: null };
    const result = hardDropPiece(noActive);
    expect(result).toBe(noActive);
  });
});

// ── D6: holdCurrentPiece ──

describe('D6: holdCurrentPiece', () => {
  test('first hold: active goes to hold, next from queue spawns', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    expect(state.activePiece!.type).toBe('J');
    const held = holdCurrentPiece(state);
    expect(held.holdPiece).toBe('J');
    expect(held.activePiece!.type).toBe('T'); // second in bag
    expect(held.holdUsed).toBe(true);
    expect(held.queue.length).toBe(5); // consumed one more from queue
  });

  test('second hold: swaps active with hold', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    // Hold J, get T
    state = holdCurrentPiece(state);
    // Drop T so holdUsed resets
    state = hardDropPiece(state);
    expect(state.holdUsed).toBe(false);
    expect(state.holdPiece).toBe('J');
    // Now hold current (S) to get J back
    const activeType = state.activePiece!.type;
    state = holdCurrentPiece(state);
    expect(state.holdPiece).toBe(activeType);
    expect(state.activePiece!.type).toBe('J'); // got J back from hold
    expect(state.holdUsed).toBe(true);
  });

  test('cannot hold twice in same piece (holdUsed)', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    state = holdCurrentPiece(state); // hold J, get T
    expect(state.holdUsed).toBe(true);
    const before = state.activePiece!.type;
    const blockedHold = holdCurrentPiece(state);
    // Should be unchanged
    expect(blockedHold.activePiece!.type).toBe(before);
    expect(blockedHold.holdPiece).toBe('J');
  });

  test('does nothing when phase is not "playing"', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const nonPlaying = { ...state, phase: 'failed' as const };
    const result = holdCurrentPiece(nonPlaying);
    expect(result).toBe(nonPlaying);
  });

  test('does nothing when no active piece', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const noActive = { ...state, activePiece: null };
    const result = holdCurrentPiece(noActive);
    expect(result).toBe(noActive);
  });
});

// ── D7: softDropPiece ──

describe('D7: softDropPiece', () => {
  test('moves piece down by 1 row', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const row0 = state.activePiece!.row;
    const dropped = softDropPiece(state);
    expect(dropped.activePiece!.row).toBe(row0 + 1);
  });

  test('returns same state when at bottom', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    // Soft drop all the way down
    for (let i = 0; i < 25; i++) {
      state = softDropPiece(state);
    }
    const atBottom = state;
    const blocked = softDropPiece(atBottom);
    expect(blocked.activePiece!.row).toBe(atBottom.activePiece!.row);
  });
});

// ── D8: resetDrill ──

describe('D8: resetDrill', () => {
  test('same opener and bag, fresh board', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    state = hardDropPiece(state); // place a piece
    expect(state.piecesPlaced).toBe(1);

    const reset = resetDrill(state);
    expect(reset.openerId).toBe('ms2');
    expect(reset.bagPieces).toEqual(MS2_BAG);
    expect(reset.piecesPlaced).toBe(0);
    expect(reset.holdPiece).toBeNull();
    expect(reset.phase).toBe('playing');
    // Board should be empty
    for (const row of reset.board) {
      for (const cell of row) {
        expect(cell).toBeNull();
      }
    }
  });

  test('first piece matches first bag piece', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    state = hardDropPiece(state);
    const reset = resetDrill(state);
    expect(reset.activePiece!.type).toBe(MS2_BAG[0]);
  });

  test('preserves mirror flag', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, true);
    const reset = resetDrill(state);
    expect(reset.mirror).toBe(true);
  });
});

// ── D9: checkOpenerMatch ──

describe('D9: checkOpenerMatch', () => {
  test('empty board does not match any opener', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    expect(checkOpenerMatch(state)).toBe(false);
  });

  test('board matching expected shape returns true', () => {
    // Build the expected board manually and stuff it into state
    const expected = getExpectedBoard('ms2', false);
    const state: DrillState = {
      phase: 'playing',
      openerId: 'ms2',
      mirror: false,
      board: expected,
      activePiece: null,
      holdPiece: 'L',
      holdUsed: false,
      queue: [],
      piecesPlaced: 6,
      bagPieces: MS2_BAG,
    };
    expect(checkOpenerMatch(state)).toBe(true);
  });

  test('shape match ignores piece types (colors)', () => {
    // Take the expected board and replace all piece types with 'T'
    const expected = getExpectedBoard('ms2', false);
    const recolored = expected.map((row) =>
      row.map((cell) => (cell !== null ? ('T' as PieceType) : null))
    );
    const state: DrillState = {
      phase: 'playing',
      openerId: 'ms2',
      mirror: false,
      board: recolored,
      activePiece: null,
      holdPiece: 'L',
      holdUsed: false,
      queue: [],
      piecesPlaced: 6,
      bagPieces: MS2_BAG,
    };
    expect(checkOpenerMatch(state)).toBe(true);
  });

  test('board with one extra cell does not match', () => {
    const expected = getExpectedBoard('ms2', false);
    const modified = expected.map((row) => [...row]);
    // Add an extra cell in an empty spot on row 19
    for (let col = 0; col < 10; col++) {
      if (modified[19]![col] === null) {
        modified[19]![col] = 'T';
        break;
      }
    }
    const state: DrillState = {
      phase: 'playing',
      openerId: 'ms2',
      mirror: false,
      board: modified,
      activePiece: null,
      holdPiece: 'L',
      holdUsed: false,
      queue: [],
      piecesPlaced: 6,
      bagPieces: MS2_BAG,
    };
    expect(checkOpenerMatch(state)).toBe(false);
  });

  test('board with one missing cell does not match', () => {
    const expected = getExpectedBoard('ms2', false);
    const modified = expected.map((row) => [...row]);
    // Remove a filled cell from row 19
    for (let col = 0; col < 10; col++) {
      if (modified[19]![col] !== null) {
        modified[19]![col] = null;
        break;
      }
    }
    const state: DrillState = {
      phase: 'playing',
      openerId: 'ms2',
      mirror: false,
      board: modified,
      activePiece: null,
      holdPiece: 'L',
      holdUsed: false,
      queue: [],
      piecesPlaced: 6,
      bagPieces: MS2_BAG,
    };
    expect(checkOpenerMatch(state)).toBe(false);
  });
});

// ── D10: getExpectedBoard ──

describe('D10: getExpectedBoard', () => {
  test('returns a 20x10 board for each opener', () => {
    for (const id of OPENER_IDS) {
      const board = getExpectedBoard(id, false);
      expect(board.length).toBe(20);
      for (const row of board) {
        expect(row.length).toBe(10);
      }
    }
  });

  test('expected board has filled cells in bottom rows', () => {
    for (const id of OPENER_IDS) {
      const board = getExpectedBoard(id, false);
      // Bottom 2 rows should have some filled cells
      const bottom2 = [...board[18]!, ...board[19]!];
      const filledCount = bottom2.filter((c) => c !== null).length;
      expect(filledCount).toBeGreaterThan(0);
    }
  });

  test('mirror board is horizontally flipped', () => {
    const normal = getExpectedBoard('ms2', false);
    const mirror = getExpectedBoard('ms2', true);
    // Check that row 19 is mirrored (col i <-> col 9-i) in terms of filled/empty
    for (let col = 0; col < 10; col++) {
      const normalFilled = normal[19]![col] !== null;
      const mirrorFilled = mirror[19]![9 - col] !== null;
      expect(mirrorFilled).toBe(normalFilled);
    }
  });
});

// ── D11: Full flow integration ──

describe('D11: Full flow — drop all 6 pieces', () => {
  test('dropping 6 pieces transitions to success or failed', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    // Drop all pieces (they won't form the opener, but we test the state machine)
    for (let i = 0; i < 6; i++) {
      if (state.phase !== 'playing') break;
      if (!state.activePiece) break;
      state = hardDropPiece(state);
    }
    // After 6 drops, phase should be 'success' or 'failed'
    expect(['success', 'failed']).toContain(state.phase);
    expect(state.piecesPlaced).toBe(6);
  });

  test('hold + drop flow: hold first piece, drop 6 others', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    // Hold J (first piece)
    state = holdCurrentPiece(state);
    expect(state.holdPiece).toBe('J');
    expect(state.activePiece!.type).toBe('T');

    // Drop 5 pieces from queue
    for (let i = 0; i < 5; i++) {
      if (state.phase !== 'playing') break;
      state = hardDropPiece(state);
    }

    // Now swap hold (J) back and drop it
    if (state.phase === 'playing' && state.activePiece) {
      state = holdCurrentPiece(state); // swap current with J
      state = hardDropPiece(state); // drop J
    }

    expect(['success', 'failed']).toContain(state.phase);
    expect(state.piecesPlaced).toBe(6);
  });
});
