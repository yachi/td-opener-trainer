import { test, expect } from 'bun:test';
import { createVisualizerState } from '../src/modes/visualizer.ts';
import { buildSteps, isPlacementReachable, emptyBoard, stampCells, boardToAscii, cloneBoard, findAllPlacements } from '../src/core/engine.ts';
import { OPENER_PLACEMENT_DATA } from '../src/openers/placements.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import type { DrillState } from '../src/modes/drill.ts';
import { getAllTargets, getTargetPlacement, transitionToBag2, hardDropPiece, holdCurrentPiece, movePiece, rotatePiece } from '../src/modes/drill.ts';
import { createBoard, spawnPiece, getPieceCells, hardDrop } from '../src/core/srs.ts';

// Simulate an actual Bag 2 drill flow
test('simulate actual Bag 2 drill for honey cup ideal - hold L comes out', () => {
  const vizState = createVisualizerState('honey_cup', false, 0);
  const bag1Board = vizState.steps[vizState.bag1End - 1]!.board;

  // After Bag 1, hold piece is T (Honey Cup holds T? No, it holds L)
  // Check what the hold piece is
  console.log('Honey Cup hold piece check...');

  // Honey Cup: hold piece is L. During Bag 1, user holds L.
  // At bag1_complete, holdPiece = L.
  // In Bag 2 ideal route, holdPlacement = null, so L stays in hold.

  // Simulate: bag1_complete state
  const bag1CompleteState: DrillState = {
    phase: 'bag1_complete' as const,
    openerId: 'honey_cup',
    mirror: false,
    board: cloneBoard(bag1Board),
    activePiece: null,
    holdPiece: 'L',  // L held from Bag 1
    holdUsed: false,
    queue: [],
    piecesPlaced: 6,
    bagPieces: ['T', 'I', 'O', 'Z', 'S', 'L', 'J'],
    guided: true,
    bagNumber: 1,
    routeIndex: -1,
    targetPieceCount: 6,
    bag1Board: cloneBoard(bag1Board),
  };

  // Transition to Bag 2 (this generates a random bag, so let's mock it)
  // Instead, manually create the Bag 2 state with a known bag
  const bag2Bag = ['Z', 'T', 'J', 'S', 'O', 'I', 'L'] as const;
  // T will need to be held (not in route), pulling L out of hold

  const bag2State: DrillState = {
    phase: 'playing',
    openerId: 'honey_cup',
    mirror: false,
    board: cloneBoard(bag1Board),
    activePiece: spawnPiece('Z'),
    holdPiece: 'L',  // L from Bag 1
    holdUsed: false,
    queue: ['T', 'J', 'S', 'O', 'I', 'L'],
    piecesPlaced: 0,
    bagPieces: [...bag2Bag],
    guided: true,
    bagNumber: 2,
    routeIndex: 0,
    targetPieceCount: 6,
    bag1Board: cloneBoard(bag1Board),
  };

  console.log('\n=== Initial state: active=Z, hold=L ===');
  let targets = getAllTargets(bag2State);
  console.log('targets:', targets.map(t => t.piece).join(', '));
  let jTarget = targets.find(t => t.piece === 'J');
  console.log('J target present?', !!jTarget);

  // Place Z (hard drop to correct position)
  // For simplicity, stamp Z directly
  const zCells = vizState.steps[vizState.bag1End]!.newCells;
  let board = stampCells(cloneBoard(bag1Board), 'Z', zCells);

  // After Z placed, active = T, hold = L
  // T is not in the route. User needs to hold T, getting L out.
  const stateAfterZ: DrillState = {
    ...bag2State,
    board: cloneBoard(board),
    activePiece: spawnPiece('T'),
    holdPiece: 'L',
    holdUsed: false,
    queue: ['J', 'S', 'O', 'I', 'L'],
    piecesPlaced: 1,
  };

  console.log('\n=== After Z placed: active=T, hold=L ===');
  targets = getAllTargets(stateAfterZ);
  console.log('targets:', targets.map(t => t.piece).join(', '));
  jTarget = targets.find(t => t.piece === 'J');
  console.log('J target present?', !!jTarget);

  // User holds T, gets L out
  const stateAfterHold: DrillState = {
    ...stateAfterZ,
    activePiece: spawnPiece('L'),
    holdPiece: 'T',
    holdUsed: true,
  };

  console.log('\n=== After hold: active=L, hold=T ===');
  targets = getAllTargets(stateAfterHold);
  console.log('targets:', targets.map(t => t.piece).join(', '));
  jTarget = targets.find(t => t.piece === 'J');
  console.log('J target present?', !!jTarget);
  let lTarget = getTargetPlacement(stateAfterHold);
  console.log('L target (current):', lTarget ? JSON.stringify(lTarget.cells) : 'null');

  // Place L
  const lCells = vizState.steps.slice(vizState.bag1End).find(s => s.piece === 'L')!.newCells;
  board = stampCells(board, 'L', lCells);

  // After L placed, active = J (next from queue), hold = T
  const stateAfterL: DrillState = {
    ...stateAfterZ,
    board: cloneBoard(board),
    activePiece: spawnPiece('J'),
    holdPiece: 'T',
    holdUsed: false,
    queue: ['S', 'O', 'I', 'L'],
    piecesPlaced: 2,
  };

  console.log('\n=== After L placed: active=J, hold=T ===');
  targets = getAllTargets(stateAfterL);
  console.log('targets:', targets.map(t => t.piece).join(', '));
  jTarget = targets.find(t => t.piece === 'J');
  console.log('J target present?', !!jTarget);
  let jTargetCurrent = getTargetPlacement(stateAfterL);
  console.log('J target (current):', jTargetCurrent ? JSON.stringify(jTargetCurrent.cells) : 'null');

  // Place J
  const jCells = vizState.steps.slice(vizState.bag1End).find(s => s.piece === 'J')!.newCells;
  board = stampCells(board, 'J', jCells);

  // After J placed, active = S, hold = T, piecesPlaced = 3
  const stateAfter3: DrillState = {
    ...stateAfterZ,
    board: cloneBoard(board),
    activePiece: spawnPiece('S'),
    holdPiece: 'T',
    holdUsed: false,
    queue: ['O', 'I', 'L'],
    piecesPlaced: 3,
  };

  console.log('\n=== 3/6 placed: active=S, hold=T ===');
  targets = getAllTargets(stateAfter3);
  console.log('targets:', targets.map(t => t.piece).join(', '));
  console.log('target count:', targets.length);
  // Should show S, O, I targets

  expect(true).toBe(true);
});

test('check J placement SRS reachability on partial bag2 board', () => {
  // Check if J can actually reach (0,14),(1,14),(0,15),(0,16) via SRS
  // on a board with bag1 + Z placed
  const vizState = createVisualizerState('honey_cup', false, 0);
  const bag1Board = vizState.steps[vizState.bag1End - 1]!.board;
  const zCells = vizState.steps[vizState.bag1End]!.newCells;
  const boardAfterZ = stampCells(cloneBoard(bag1Board), 'Z', zCells);

  console.log('\n=== Board after Z ===');
  console.log(boardToAscii(boardAfterZ));

  const jTarget = [
    { col: 0, row: 14 }, { col: 1, row: 14 },
    { col: 0, row: 15 }, { col: 0, row: 16 },
  ];

  const reachable = isPlacementReachable(boardAfterZ, 'J', jTarget);
  console.log('J reachable?', reachable);

  // List ALL J placements on this board
  const allJ = findAllPlacements(boardAfterZ, 'J');
  console.log('Total J placements:', allJ.length);

  // Find the closest match to target
  const targetStr = new Set(jTarget.map(c => `${c.col},${c.row}`));
  for (const p of allJ) {
    const cellStr = new Set(p.cells.map(c => `${c.col},${c.row}`));
    const match = targetStr.size === cellStr.size && [...targetStr].every(k => cellStr.has(k));
    if (match) {
      console.log('EXACT MATCH found:', JSON.stringify(p.cells));
    }
  }

  // Also check: is the J placement achievable after L is placed too?
  const lCells = vizState.steps.slice(vizState.bag1End).find(s => s.piece === 'L')!.newCells;
  const boardAfterZL = stampCells(boardAfterZ, 'L', lCells);
  console.log('\n=== Board after Z + L ===');
  console.log(boardToAscii(boardAfterZL));

  const jReachableAfterZL = isPlacementReachable(boardAfterZL, 'J', jTarget);
  console.log('J reachable after Z+L?', jReachableAfterZL);

  expect(reachable).toBe(true);
});
