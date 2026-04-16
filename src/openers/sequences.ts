/**
 * src/openers/sequences.ts — Pure opener sequence helpers.
 *
 * Extracted from the now-deleted src/modes/visualizer.ts during the L9
 * Session redesign. These helpers are data-only: they take an opener id
 * (and optional mirror/route) and return the placement Step[] via
 * `buildSteps` — no state, no mutation, no class.
 *
 * L9 backtracking redesign: visualization uses `buildSteps` with a
 * backtracking solver. Every placement goes through the engine — no direct
 * cell editing. Routes that need a smaller Bag 1 declare `bag1Reduction`
 * explicitly in `bag2-routes.ts` (route metadata is the single source of
 * truth, no silent fallbacks).
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
 * L9 backtracking redesign: ONE `buildSteps` call resolves the joint order
 * of [bag1Used + hold + bag2]. Routes that can't fit on the full Bag 1
 * declare `bag1Reduction` to drop pieces from the end of Bag 1. Throws if
 * the engine can't place every piece — that's a data bug, not a runtime
 * fallback.
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

  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const reduction = route.bag1Reduction ?? 0;
  const bag1Used = data.placements.slice(0, data.placements.length - reduction);

  const holdArr = route.holdPlacement ? [route.holdPlacement] : [];
  const allPlacements = [...bag1Used, ...holdArr, ...route.placements];

  const allSteps = buildSteps(allPlacements);
  if (allSteps.length !== allPlacements.length) {
    throw new Error(
      `getBag2Sequence: route ${openerId}/${route.routeId} (mirror=${mirror}) ` +
      `not fully engine-placeable (${allSteps.length}/${allPlacements.length}). ` +
      `Add or adjust bag1Reduction in route data.`,
    );
  }

  const bag1End = bag1Used.length;
  const bag1FinalBoard = bag1End > 0
    ? allSteps[bag1End - 1]!.board
    : emptyBoard();

  // baseBoard = bag1FinalBoard + hold (if any). The engine may have placed
  // hold in any order, so locate its step by hint and use that step's board.
  let baseBoard = cloneBoard(bag1FinalBoard);
  const holdHint = route.holdPlacement?.hint;
  if (holdHint) {
    const holdStep = allSteps.find((s) => s.hint === holdHint);
    if (holdStep) baseBoard = cloneBoard(holdStep.board);
  }

  // Bag 2 steps = everything after bag1.
  const allBag2Steps = allSteps.slice(bag1End);
  // Display steps = exclude hold.
  const steps = holdHint
    ? allBag2Steps.filter((s) => s.hint !== holdHint)
    : allBag2Steps;

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
    tSpinSlots: data.tSpinSlots,
    baseBoard,
    bag1FinalBoard: cloneBoard(bag1FinalBoard),
  };
}
