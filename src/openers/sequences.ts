/**
 * src/openers/sequences.ts — Pure opener sequence helpers.
 *
 * Extracted from the now-deleted src/modes/visualizer.ts during the L9
 * Session redesign. These helpers are data-only: they take an opener id
 * (and optional mirror/route) and return the placement Step[] via
 * `stampSteps` — no state, no mutation, no class.
 *
 * L9 stamp-over-BFS redesign: visualization uses `stampSteps` (pure cell
 * stamping, no BFS). The wiki placement data is the source of truth.
 * BFS reachability verification lives in tests, not in the rendering path.
 */

import type { PieceType } from '../core/types.ts';
import type { OpenerID } from './types.ts';
import { OPENERS } from './decision.ts';
import {
  OPENER_PLACEMENT_DATA,
  mirrorPlacementData,
} from './placements.ts';
import { getBag2Routes } from './bag2-routes.ts';
import {
  stampSteps,
  emptyBoard,
  cloneBoard,
  stampCells,
  type Board,
  type Step,
} from '../core/engine.ts';

// Re-export Step so tests can use it without reaching into core/engine.
export type { Step };

/**
 * A full opener sequence: bag 1 placements + metadata. The `bag` field is
 * the concatenation of the placement pieces with the doctrinal hold piece
 * appended (so tests that want the "full 7-piece bag" can read it).
 */
export interface OpenerSequence {
  openerId: OpenerID;
  mirror: boolean;
  bag: PieceType[];
  holdPiece: PieceType;
  steps: Step[];
  tSpinSlots: {
    tst: { col: number; row: number; rotation: number } | null;
    tsd: { col: number; row: number; rotation: number } | null;
  };
}

/**
 * Build the Bag 1 placement sequence for a given opener (and optional mirror).
 * Pure function — the result depends only on the static placement data.
 */
export function getOpenerSequence(
  openerId: OpenerID,
  mirror: boolean,
): OpenerSequence {
  const def = OPENERS[openerId];
  const holdPiece = mirror ? def.holdPieceMirror : def.holdPiece;
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const steps = stampSteps(data.placements);
  const bag = [...steps.map((s) => s.piece), holdPiece];
  return {
    openerId,
    mirror,
    bag,
    holdPiece,
    steps,
    tSpinSlots: data.tSpinSlots,
  };
}

/**
 * A Bag 2 route's placement sequence, layered on top of the corresponding
 * Bag 1 final board. Returns `null` for an invalid route index so callers
 * can cleanly skip unsupported cases.
 *
 * L9 redesign: uses `stampSteps` instead of BFS-based `buildSteps`.
 * The wiki placement data IS the source of truth — cells are stamped
 * directly onto the Bag 1 board. No BFS reachability, no Bag 1 reduction.
 * BFS verification lives in tests (board oracle + reachability tests).
 */
export interface Bag2Sequence {
  openerId: OpenerID;
  mirror: boolean;
  bag: PieceType[];
  holdPiece: PieceType;
  /** Bag 2 steps WITHOUT hold placement (for visualizer display). */
  steps: Step[];
  /** ALL Bag 2 steps INCLUDING hold placement (for session manual play). */
  fullSteps: Step[];
  tSpinSlots: OpenerSequence['tSpinSlots'];
  /** Bag 1 final + hold piece stamped (for display). */
  baseBoard: Board;
  /** Bag 1 final WITHOUT hold (matches fullSteps board ancestry). */
  bag1FinalBoard: Board;
}

export function getBag2Sequence(
  openerId: OpenerID,
  mirror: boolean,
  routeIndex: number,
): Bag2Sequence | null {
  const routes = getBag2Routes(openerId, mirror);
  if (routeIndex < 0 || routeIndex >= routes.length) return null;
  const route = routes[routeIndex]!;

  // 1. Bag 1 final board — stamp directly, no BFS.
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const bag1Steps = stampSteps(data.placements);
  const bag1FinalBoard = bag1Steps.length > 0
    ? bag1Steps[bag1Steps.length - 1]!.board
    : emptyBoard();

  // 2. Hold placement — stamp onto Bag 1 board (if any).
  let board = cloneBoard(bag1FinalBoard);
  const holdSteps: Step[] = [];
  if (route.holdPlacement) {
    const emptyCells = route.holdPlacement.cells.filter(
      (c) => board[c.row]?.[c.col] === null,
    );
    if (emptyCells.length > 0) {
      board = stampCells(cloneBoard(board), route.holdPlacement.piece, emptyCells);
      holdSteps.push({
        piece: route.holdPlacement.piece,
        board: cloneBoard(board),
        newCells: emptyCells,
        hint: route.holdPlacement.hint ?? '',
      });
    }
  }
  const baseBoard = cloneBoard(board);

  // 3. Bag 2 pieces — stamp one by one onto the board.
  const bag2Steps: Step[] = [];
  for (const p of route.placements) {
    board = stampCells(cloneBoard(board), p.piece, p.cells);
    bag2Steps.push({
      piece: p.piece,
      board: cloneBoard(board),
      newCells: [...p.cells],
      hint: p.hint ?? '',
    });
  }

  const holdPiece = mirror
    ? OPENERS[openerId].holdPieceMirror
    : OPENERS[openerId].holdPiece;

  return {
    openerId,
    mirror,
    bag: route.placements.map((p) => p.piece),
    holdPiece,
    steps: bag2Steps,
    fullSteps: [...holdSteps, ...bag2Steps],
    tSpinSlots: data.tSpinSlots,
    baseBoard,
    bag1FinalBoard: cloneBoard(bag1FinalBoard),
  };
}
