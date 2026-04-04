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
  toggleGuided,
  getTargetPlacement,
  getHoldSuggestion,
} from '../src/modes/drill.ts';
import type { DrillState } from '../src/modes/drill.ts';
import { OPENERS } from '../src/openers/decision.ts';
import { createBoard, spawnPiece } from '../src/core/srs.ts';
import { getOpenerSequence } from '../src/modes/visualizer.ts';

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

  test('generated bag is playable — pieces can be placed in order with hold (AC28)', () => {
    // Run 50 times to catch random unplayable bags
    for (let i = 0; i < 50; i++) {
      for (const id of OPENER_IDS) {
        const state = createDrillState(id);
        const sequence = getOpenerSequence(id, state.mirror);

        // Simulate: walk through bag in order, verify each piece can be placed or held
        const board: (PieceType | null)[][] = Array.from({ length: 20 }, () =>
          Array(10).fill(null),
        );
        const targetMap = new Map<PieceType, { col: number; row: number }[]>();
        for (const step of sequence.steps) {
          targetMap.set(step.piece, step.newCells);
        }

        let hold: PieceType | null = null;
        let holdUsed = false;
        let stuck = false;

        for (const piece of state.bagPieces) {
          const target = targetMap.get(piece);
          const supported = target && target.some(({ col, row }) => {
            if (row >= 19) return true;
            return row < 19 && board[row + 1]?.[col] !== null;
          });

          if (supported && target) {
            for (const { col, row } of target) board[row]![col] = piece;
            holdUsed = false;
            continue;
          }

          if (!holdUsed) {
            if (hold === null) { hold = piece; holdUsed = true; continue; }
            const holdTarget = targetMap.get(hold);
            const holdSupported = holdTarget && holdTarget.some(({ col, row }) => {
              if (row >= 19) return true;
              return row < 19 && board[row + 1]?.[col] !== null;
            });
            if (holdSupported && holdTarget) {
              for (const { col, row } of holdTarget) board[row]![col] = hold;
              hold = piece;
              holdUsed = true;
              continue;
            }
          }
          stuck = true;
          break;
        }
        expect(stuck).toBe(false);
      }
    }
  });

  test('RED TEST: exact user screenshot — Honey Cup bag [S,L,J,Z,O,I,T] is unplayable', () => {
    // User screenshot: Honey Cup normal, S in hold, L active, queue [J,Z,O,I,T]
    // Bag order: S first (held), L second (can't place — needs I below, can't hold — S occupies)
    // This proves the bug exists.
    const bag: PieceType[] = ['S', 'L', 'J', 'Z', 'O', 'I', 'T'];
    const sequence = getOpenerSequence('honey_cup', false);
    const targetMap = new Map<PieceType, { col: number; row: number }[]>();
    for (const step of sequence.steps) targetMap.set(step.piece, step.newCells);

    const board: (PieceType | null)[][] = Array.from({ length: 20 }, () => Array(10).fill(null));
    let hold: PieceType | null = null;
    let holdUsed = false;
    let stuck = false;
    let stuckPiece: PieceType | null = null;

    for (const piece of bag) {
      const target = targetMap.get(piece);
      const supported = target && target.some(({ col, row }) =>
        row >= 19 || (row < 19 && board[row + 1]?.[col] !== null),
      );
      if (supported && target) {
        for (const { col, row } of target) board[row]![col] = piece;
        holdUsed = false;
        continue;
      }
      if (!holdUsed) {
        if (hold === null) { hold = piece; holdUsed = true; continue; }
        const ht = targetMap.get(hold);
        const hs = ht && ht.some(({ col, row }) =>
          row >= 19 || (row < 19 && board[row + 1]?.[col] !== null),
        );
        if (hs && ht) {
          for (const { col, row } of ht) board[row]![col] = hold;
          hold = piece; holdUsed = true; continue;
        }
      }
      stuck = true;
      stuckPiece = piece;
      break;
    }

    // This bag IS unplayable — stuck at L (piece 2) with S in hold
    expect(stuck).toBe(true);
    expect(stuckPiece).toBe('L');
    expect(hold).toBe('S'); // S was held first, blocking L from being held
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

// ── D9b: Honey Cup / Gamushiro 7-step openers with hold piece in steps ──

describe('D9b: openers with hold piece in placement steps (7 steps, 6 placeable)', () => {
  test('RED TEST: Honey Cup — place 6 pieces correctly, should be success not mismatch', () => {
    // Honey Cup has 7 steps: O, I, Z, T, L, S, J. Hold piece = L.
    // With 7-bag + hold, only 6 pieces end up on board. J stays in hold (or whatever was swapped).
    // Build the board with the first 6 steps (O, I, Z, T, L, S) — this is what a correct 6-piece play looks like.
    const sequence = getOpenerSequence('honey_cup', false);
    const board: (PieceType | null)[][] = Array.from({ length: 20 }, () => Array(10).fill(null));

    // Place first 6 steps (all except the last one, J)
    for (let i = 0; i < 6; i++) {
      const step = sequence.steps[i]!;
      for (const { col, row } of step.newCells) {
        board[row]![col] = step.piece;
      }
    }

    const state: DrillState = {
      phase: 'playing',
      openerId: 'honey_cup',
      mirror: false,
      board,
      activePiece: null,
      holdPiece: 'J', // J ended up in hold (couldn't place it, no queue left)
      holdUsed: false,
      queue: [],
      piecesPlaced: 6,
      bagPieces: ['O', 'I', 'Z', 'T', 'L', 'S', 'J'],
      guided: true,
    };

    // This SHOULD match — the user placed 6 pieces correctly
    expect(checkOpenerMatch(state)).toBe(true);
  });

  test('RED TEST: Gamushiro — place 6 pieces correctly, should be success not mismatch', () => {
    // Gamushiro has 7 steps: J, S, I, T, Z, O, L. Hold piece = L.
    // Place first 6 (J, S, I, T, Z, O), L stays in hold.
    const sequence = getOpenerSequence('gamushiro', false);
    const board: (PieceType | null)[][] = Array.from({ length: 20 }, () => Array(10).fill(null));

    for (let i = 0; i < 6; i++) {
      const step = sequence.steps[i]!;
      for (const { col, row } of step.newCells) {
        board[row]![col] = step.piece;
      }
    }

    const state: DrillState = {
      phase: 'playing',
      openerId: 'gamushiro',
      mirror: false,
      board,
      activePiece: null,
      holdPiece: 'L',
      holdUsed: false,
      queue: [],
      piecesPlaced: 6,
      bagPieces: ['J', 'S', 'I', 'T', 'Z', 'O', 'L'],
      guided: true,
    };

    expect(checkOpenerMatch(state)).toBe(true);
  });

  test('RED TEST: MS2 — 6 steps, no hold in steps, should still work', () => {
    // MS2 has 6 steps, hold L not in steps. Sanity check — this should pass as before.
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
      guided: true,
    };
    expect(checkOpenerMatch(state)).toBe(true);
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

// ── D12: Guided mode ──

// MS2 hold piece is L. Bag with L first so we can test hold suggestion.
const MS2_BAG_L_FIRST: PieceType[] = ['L', 'J', 'T', 'S', 'Z', 'I', 'O'];

describe('D12: guided mode', () => {
  test('createDrillState sets guided to true by default', () => {
    const state = createDrillState('ms2');
    expect(state.guided).toBe(true);
  });

  test('createDrillStateWithBag sets guided to true by default', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    expect(state.guided).toBe(true);
  });

  test('toggleGuided flips the guided flag', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    expect(state.guided).toBe(true);
    const toggled = toggleGuided(state);
    expect(toggled.guided).toBe(false);
    const toggledBack = toggleGuided(toggled);
    expect(toggledBack.guided).toBe(true);
  });

  test('getTargetPlacement returns null when not guided', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    state = toggleGuided(state);
    expect(getTargetPlacement(state)).toBeNull();
  });

  test('getTargetPlacement returns cells and hint for active piece', () => {
    // MS2_BAG starts with J, which is placed (not held — L is held for MS2)
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    expect(state.activePiece!.type).toBe('J');
    const target = getTargetPlacement(state);
    expect(target).not.toBeNull();
    // Verify it matches the visualizer data
    const sequence = getOpenerSequence('ms2', false);
    const jStep = sequence.steps.find((s) => s.piece === 'J');
    expect(target!.cells).toEqual(jStep!.newCells);
    expect(target!.hint).toBe(jStep!.hint);
  });

  test('getTargetPlacement returns null when active piece should be held', () => {
    // L is the hold piece for MS2. Start with L first in bag.
    const state = createDrillStateWithBag('ms2', MS2_BAG_L_FIRST, false);
    expect(state.activePiece!.type).toBe('L');
    expect(state.holdPiece).toBeNull();
    const target = getTargetPlacement(state);
    expect(target).toBeNull();
  });

  test('getTargetPlacement returns null when phase is not playing', () => {
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    const nonPlaying = { ...state, phase: 'success' as const };
    expect(getTargetPlacement(nonPlaying)).toBeNull();
  });

  test('getHoldSuggestion returns hold piece type when active piece matches', () => {
    // L is MS2 hold piece; start with L first
    const state = createDrillStateWithBag('ms2', MS2_BAG_L_FIRST, false);
    expect(state.activePiece!.type).toBe('L');
    expect(state.holdPiece).toBeNull();
    const suggestion = getHoldSuggestion(state);
    expect(suggestion).toBe('L');
  });

  test('getHoldSuggestion returns null when hold already used', () => {
    // Hold L, then swap back — holdPiece is no longer null
    let state = createDrillStateWithBag('ms2', MS2_BAG_L_FIRST, false);
    state = holdCurrentPiece(state); // hold L, get J
    state = hardDropPiece(state); // drop J, reset holdUsed
    // Now swap: hold current (T) to get L back
    state = holdCurrentPiece(state); // hold T, get L
    // Now active is L, holdPiece is T (not null)
    expect(state.activePiece!.type).toBe('L');
    expect(state.holdPiece).not.toBeNull();
    const suggestion = getHoldSuggestion(state);
    expect(suggestion).toBeNull();
  });

  test('getHoldSuggestion returns null when not guided', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG_L_FIRST, false);
    state = toggleGuided(state);
    expect(getHoldSuggestion(state)).toBeNull();
  });

  test('getHoldSuggestion returns null when active piece is not the hold piece', () => {
    // MS2_BAG starts with J, which is not the hold piece (L)
    const state = createDrillStateWithBag('ms2', MS2_BAG, false);
    expect(state.activePiece!.type).toBe('J');
    expect(getHoldSuggestion(state)).toBeNull();
  });

  test('resetDrill preserves guided state', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    state = toggleGuided(state); // guided = false
    state = hardDropPiece(state); // place a piece
    const reset = resetDrill(state);
    expect(reset.guided).toBe(false);
  });

  test('getTargetPlacement returns supported=false when target would float (AC26)', () => {
    // S piece in MS2 is at rows 16-18, stacks on I and J.
    // On an empty board, S target floats — should have supported=false.
    const bag: PieceType[] = ['S', 'J', 'T', 'I', 'Z', 'O', 'L'];
    const state = createDrillStateWithBag('ms2', bag, false);
    expect(state.activePiece!.type).toBe('S');
    const target = getTargetPlacement(state);
    expect(target).not.toBeNull();
    expect(target!.supported).toBe(false); // S floats without I and J below it
    expect(target!.hint).toContain('S vertical'); // hint still provided
  });

  test('getTargetPlacement returns supported=true when cells are supported', () => {
    // I piece in MS2 at col 0, rows 16-19 — rests on floor
    const bag: PieceType[] = ['I', 'J', 'T', 'S', 'Z', 'O', 'L'];
    const state = createDrillStateWithBag('ms2', bag, false);
    expect(state.activePiece!.type).toBe('I');
    const target = getTargetPlacement(state);
    expect(target).not.toBeNull();
    expect(target!.supported).toBe(true); // I piece touches the floor at row 19
  });

  test('resetDrill preserves guided=true', () => {
    let state = createDrillStateWithBag('ms2', MS2_BAG, false);
    state = hardDropPiece(state);
    const reset = resetDrill(state);
    expect(reset.guided).toBe(true);
  });
});

// ── D12b: Unsupported targets show hint but supported=false ──

describe('D12b: pieces arriving out of visualizer order get unsupported hints', () => {
  test('Honey Cup: S arrives before L/I — target shows but unsupported', () => {
    // Honey Cup normal places in order: O, I, Z, T, L, S, J (hold L)
    // S target is at rows 16-17, rests on L piece at rows 17-18.
    // If S arrives before L is placed, target should be unsupported.
    const bag: PieceType[] = ['S', 'O', 'I', 'Z', 'T', 'J', 'L'];
    const state = createDrillStateWithBag('honey_cup', bag, false);
    expect(state.activePiece!.type).toBe('S');

    const target = getTargetPlacement(state);
    expect(target).not.toBeNull();
    expect(target!.supported).toBe(false);
    expect(target!.hint).toContain('S');
  });

  test('Honey Cup: S becomes supported after L and I are placed', () => {
    // Place I and L first (they support S)
    const sequence = getOpenerSequence('honey_cup', false);
    const iStep = sequence.steps.find((s) => s.piece === 'I')!;
    const lStep = sequence.steps.find((s) => s.piece === 'L')!;

    // Start with S, but simulate having I and L already on board
    const bag: PieceType[] = ['S', 'O', 'Z', 'T', 'J', 'I', 'L'];
    let state = createDrillStateWithBag('honey_cup', bag, false);

    // Manually place I and L on the board
    const board = state.board.map((row) => [...row]);
    for (const { col, row } of iStep.newCells) board[row]![col] = 'I';
    for (const { col, row } of lStep.newCells) board[row]![col] = 'L';
    state = { ...state, board };

    const target = getTargetPlacement(state);
    expect(target).not.toBeNull();
    expect(target!.supported).toBe(true);
    expect(target!.cells).toEqual(sequence.steps.find((s) => s.piece === 'S')!.newCells);
  });

  test('MS2: S arrives before I and J — unsupported', () => {
    // MS2 S is at rows 16-18, stacks on I (col 0) and J (cols 1-3)
    const bag: PieceType[] = ['S', 'J', 'T', 'I', 'Z', 'O', 'L'];
    const state = createDrillStateWithBag('ms2', bag, false);
    expect(state.activePiece!.type).toBe('S');

    const target = getTargetPlacement(state);
    expect(target).not.toBeNull();
    expect(target!.supported).toBe(false);
  });

  test('Honey Cup: J arrives first — target at rows 15-17 is unsupported', () => {
    // J in Honey Cup is the last piece placed, sits on top of T and O
    const bag: PieceType[] = ['J', 'T', 'S', 'Z', 'O', 'I', 'L'];
    const state = createDrillStateWithBag('honey_cup', bag, false);
    expect(state.activePiece!.type).toBe('J');

    const target = getTargetPlacement(state);
    expect(target).not.toBeNull();
    expect(target!.supported).toBe(false);
    expect(target!.hint).toContain('J');
  });

  test('all openers: first piece in visualizer order is always supported', () => {
    const OPENER_IDS: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'];
    for (const id of OPENER_IDS) {
      for (const mirror of [false, true]) {
        const sequence = getOpenerSequence(id, mirror);
        const firstPiece = sequence.steps[0]!.piece;
        // Build bag with first visualizer piece at position 0
        const otherPieces = sequence.steps.slice(1).map((s) => s.piece);
        const bag: PieceType[] = [firstPiece, ...otherPieces, sequence.holdPiece];

        const state = createDrillStateWithBag(id, bag, mirror);
        const target = getTargetPlacement(state);
        expect(target).not.toBeNull();
        expect(target!.supported).toBe(true);
      }
    }
  });
});

// ── D13: Target correctness across full placement (AC27) ──

describe('D13: target matches visualizer data through full placement sequence', () => {
  const OPENER_IDS: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'];

  for (const id of OPENER_IDS) {
    for (const mirror of [false, true]) {
      const label = `${id} ${mirror ? '(mirror)' : '(normal)'}`;

      test(`${label}: targets match visualizer at each step`, () => {
        const sequence = getOpenerSequence(id, mirror);
        // Build a bag in the visualizer's placement order, with hold piece at position 0
        // so it gets held first, then placed pieces follow
        const placedPieces = sequence.steps.map((s) => s.piece);
        const bag: PieceType[] = [sequence.holdPiece, ...placedPieces];

        let state = createDrillStateWithBag(id, bag, mirror);
        expect(state.guided).toBe(true);

        // First piece is the hold piece — hold it
        expect(state.activePiece!.type).toBe(sequence.holdPiece);
        expect(getHoldSuggestion(state)).toBe(sequence.holdPiece);
        state = holdCurrentPiece(state);

        // Now walk through each placement step
        for (let i = 0; i < sequence.steps.length; i++) {
          if (state.phase !== 'playing' || !state.activePiece) break;
          const step = sequence.steps[i]!;
          expect(state.activePiece.type).toBe(step.piece);

          const target = getTargetPlacement(state);
          // Target should exist and be supported (we place in visualizer order)
          expect(target).not.toBeNull();
          expect(target!.supported).toBe(true);
          // Target cells must match exactly
          expect(target!.cells).toEqual(step.newCells);
          expect(target!.hint).toBe(step.hint);

          // Place the piece at the correct position by setting board directly
          // (we can't easily move+rotate+drop to exact position in a unit test,
          //  so we simulate by locking the cells onto the board manually)
          const newBoard = state.board.map((row) => [...row]);
          for (const { col, row } of step.newCells) {
            newBoard[row]![col] = step.piece;
          }

          // Advance to next piece
          const nextQueue = state.queue.slice();
          const nextType = nextQueue.shift();
          state = {
            ...state,
            board: newBoard,
            piecesPlaced: state.piecesPlaced + 1,
            activePiece: nextType ? spawnPiece(nextType) : null,
            queue: nextQueue,
            holdUsed: false,
          };
        }
      });
    }
  }
});
