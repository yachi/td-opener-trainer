/**
 * src/openers/sequences.ts — Pure opener sequence helpers.
 *
 * Extracted from the now-deleted src/modes/visualizer.ts during the L9
 * Session redesign. These helpers are data-only: they take an opener id
 * (and optional mirror/route) and return the placement Step[] via
 * `buildSteps` — no state, no mutation, no class.
 *
 * Used by acceptance/reachability/field-engine tests that care about the
 * shape of the opener board, not about UI state machines.
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
  buildSteps,
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
  const steps = buildSteps(data.placements);
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
 * Mirrors the original `getBag2Sequence` semantics from visualizer.ts:
 *  - `steps` exclude the hold placement (the route's "extra" piece); the
 *    hold piece lives in `baseBoard` instead.
 *  - `baseBoard` = Bag 1 final board with the hold piece stamped on top.
 *  - When the full placement set doesn't fit on top of Bag 1 (the
 *    Gamushiro form_2 edge case), Bag 1 is reduced by one placement.
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

  // Build the FULL flat step list (bag1 + optional hold + bag2) so the
  // route placements can reference the post-bag1 board. If the full list
  // has fewer steps than inputs, some placement conflicted — retry with a
  // reduced Bag 1 (drop the last placement). Matches the old visualizer
  // behaviour for Gamushiro form_2.
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const bag1Placements = data.placements;

  const bag2All = [
    ...(route.holdPlacement ? [route.holdPlacement] : []),
    ...route.placements,
  ];

  let bag1Used = bag1Placements;
  const fullSteps = buildSteps([...bag1Placements, ...bag2All]);
  if (fullSteps.length < bag1Placements.length + bag2All.length) {
    const reducedBag1 = bag1Placements.slice(0, bag1Placements.length - 1);
    const reducedSteps = buildSteps([...reducedBag1, ...bag2All]);
    if (reducedSteps.length >= reducedBag1.length + bag2All.length) {
      bag1Used = reducedBag1;
    }
  }

  const bag1End = bag1Used.length;
  const allSteps = buildSteps([...bag1Used, ...bag2All]);

  // Filter out the hold placement from `steps` (it lives in baseBoard).
  const allBag2Steps = allSteps.slice(bag1End);
  const holdHint = route.holdPlacement?.hint;
  const steps = holdHint
    ? allBag2Steps.filter((s) => s.hint !== holdHint)
    : allBag2Steps;

  // Base board = Bag 1 final + hold piece.
  const bag1FinalBoard = bag1End > 0
    ? allSteps[bag1End - 1]!.board
    : emptyBoard();
  let baseBoard = cloneBoard(bag1FinalBoard);
  if (route.holdPlacement) {
    const emptyCells = route.holdPlacement.cells.filter(
      (c) => bag1FinalBoard[c.row]?.[c.col] === null,
    );
    if (emptyCells.length > 0) {
      baseBoard = stampCells(baseBoard, route.holdPlacement.piece, emptyCells);
    }
  }

  const bag1Seq = getOpenerSequence(openerId, mirror);
  const holdPiece = mirror
    ? OPENERS[openerId].holdPieceMirror
    : OPENERS[openerId].holdPiece;

  return {
    openerId,
    mirror,
    bag: route.placements.map((p) => p.piece),
    holdPiece,
    steps,
    fullSteps: allBag2Steps,
    tSpinSlots: bag1Seq.tSpinSlots,
    baseBoard,
    bag1FinalBoard: cloneBoard(bag1FinalBoard),
  };
}
