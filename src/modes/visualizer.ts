import type { PieceType } from '../core/types.ts';
import type { OpenerID } from '../openers/types.ts';
import { OPENERS } from '../openers/decision.ts';
import { OPENER_PLACEMENT_DATA, mirrorPlacementData } from '../openers/placements.ts';
import { getBag2Routes } from '../openers/bag2-routes.ts';
import { buildSteps, emptyBoard, cloneBoard, stampCells } from '../core/engine.ts';
import type { Board } from '../core/engine.ts';

// ── Re-exports for backwards compatibility ──

export type { RawPlacement, OpenerPlacementData } from '../openers/placements.ts';
export type { Bag2Route, Bag2Data } from '../openers/bag2-routes.ts';
export { getBag2Routes } from '../openers/bag2-routes.ts';
export { OPENER_PLACEMENT_DATA } from '../openers/placements.ts';

import type { Step } from '../core/engine.ts';
export type { Step };
export type PlacementStep = Step; // compat alias

/** Compat type for getOpenerSequence — used by drill.ts and tests */
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

export interface VisualizerState {
  openerId: OpenerID;
  mirror: boolean;
  steps: Step[];         // flat: bag1 + hold? + bag2
  bag1End: number;       // index after last Bag 1 step
  currentStep: number;   // 0 = empty board, 1..steps.length
  routeIndex: number;    // -1 = bag1 only, 0+ = bag2 route
}

// ── Public API ──

export function getOpenerSequence(openerId: OpenerID, mirror: boolean): OpenerSequence {
  const def = OPENERS[openerId];
  const holdPiece = mirror ? def.holdPieceMirror : def.holdPiece;
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const steps = buildSteps(data.placements);
  const bag = [...steps.map(s => s.piece), holdPiece];
  return { openerId, mirror, bag, holdPiece, steps, tSpinSlots: data.tSpinSlots };
}

export function createVisualizerState(
  openerId: OpenerID,
  mirror: boolean,
  routeIndex: number = 0,
): VisualizerState {
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const bag1Placements = data.placements;

  const routes = getBag2Routes(openerId, mirror);
  const route = routes[routeIndex] ?? null;

  // Engine-driven: try full Bag 1 first. If any Bag 2 piece gets stuck
  // (conflict), reduce Bag 1 by 1 piece (the held piece stays out).
  // The engine's support-ordered placement handles the rest.
  const bag2All = route
    ? [...(route.holdPlacement ? [route.holdPlacement] : []), ...route.placements]
    : [];

  let bag1Used = bag1Placements;
  if (route && bag2All.length > 0) {
    // Try full Bag 1
    const fullSteps = buildSteps([...bag1Placements, ...bag2All]);
    if (fullSteps.length < bag1Placements.length + bag2All.length) {
      // Some pieces stuck — try with one fewer Bag 1 piece
      const reducedBag1 = bag1Placements.slice(0, bag1Placements.length - 1);
      const reducedSteps = buildSteps([...reducedBag1, ...bag2All]);
      if (reducedSteps.length >= reducedBag1.length + bag2All.length) {
        bag1Used = reducedBag1;
      }
    }
  }

  const allPlacements = route
    ? [...bag1Used, ...bag2All]
    : [...bag1Placements];

  return {
    openerId,
    mirror,
    steps: buildSteps(allPlacements),
    bag1End: bag1Used.length,
    currentStep: 0,
    routeIndex: route ? routeIndex : -1,
  };
}

export function stepForward(state: VisualizerState): void {
  if (state.currentStep < state.steps.length) state.currentStep++;
}

export function stepBackward(state: VisualizerState): void {
  if (state.currentStep > 0) state.currentStep--;
}

export function jumpToStep(state: VisualizerState, step: number): void {
  state.currentStep = Math.max(0, Math.min(step, state.steps.length));
}

export function getCurrentBoard(state: VisualizerState): Board {
  return state.currentStep === 0
    ? emptyBoard()
    : state.steps[state.currentStep - 1]!.board;
}

export function switchRoute(state: VisualizerState, routeIndex: number): VisualizerState {
  const newState = createVisualizerState(state.openerId, state.mirror, routeIndex);
  newState.currentStep = newState.bag1End; // jump to Bag 2 start
  return newState;
}

export function switchOpener(openerId: OpenerID, mirror: boolean): VisualizerState {
  return createVisualizerState(openerId, mirror);
}

export function toggleMirror(state: VisualizerState): VisualizerState {
  return createVisualizerState(state.openerId, !state.mirror, Math.max(0, state.routeIndex));
}

/** Compat: build Bag 2 steps for tests that need them. Returns steps + baseBoard. */
export function getBag2Sequence(openerId: OpenerID, mirror: boolean, routeIndex: number) {
  const routes = getBag2Routes(openerId, mirror);
  if (routeIndex < 0 || routeIndex >= routes.length) return null;
  const route = routes[routeIndex]!;
  const state = createVisualizerState(openerId, mirror, routeIndex);
  // Bag 2 steps = everything after bag1End, excluding hold piece
  // The hold is inserted into bag2 at holdInsertIndex, find and skip it
  const allBag2 = state.steps.slice(state.bag1End);
  const holdHint = route.holdPlacement?.hint;
  const bag2Steps = holdHint ? allBag2.filter(s => s.hint !== holdHint) : allBag2;
  // Base board = Bag 1 final + hold piece (computed directly)
  const bag1FinalBoard = state.bag1End > 0 ? state.steps[state.bag1End - 1]!.board : emptyBoard();
  let baseBoard = cloneBoard(bag1FinalBoard);
  if (route.holdPlacement) {
    const emptyCells = route.holdPlacement.cells.filter(c => bag1FinalBoard[c.row]?.[c.col] === null);
    if (emptyCells.length > 0) {
      baseBoard = stampCells(baseBoard, route.holdPlacement.piece, emptyCells);
    }
  }
  const bag1Seq = getOpenerSequence(openerId, mirror);
  return {
    openerId, mirror,
    bag: routes[routeIndex]!.placements.map(p => p.piece),
    holdPiece: mirror ? OPENERS[openerId].holdPieceMirror : OPENERS[openerId].holdPiece,
    steps: bag2Steps,
    tSpinSlots: bag1Seq.tSpinSlots,
    baseBoard,
  };
}
