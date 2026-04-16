import type { PieceType } from '../core/types.ts';
import type { OpenerID } from './types.ts';
import type { RawPlacement } from './placements.ts';
import { mirrorPiece } from './placements.ts';
import { appearsBefore } from './decision.ts';
import { type Condition, evaluate, mirrorCondition, conditionToLabel } from './conditions.ts';

// ── Types ──

export interface Bag2Route {
  routeId: string;
  routeLabel: string;
  conditionLabel: string;
  condition: Condition;
  canSelect: (bag2: PieceType[]) => boolean;
  placements: RawPlacement[];
  holdPlacement: RawPlacement | null;
  tstStepIndex: number;
  /** How many pieces to drop from end of Bag 1 for this route. Default 0. */
  bag1Reduction?: number;
}

export interface Bag2Data {
  routes: Bag2Route[];
}

// ── Bag 2 Route Data (from Hard Drop wiki) ──
// Bag 2 pieces are placed directly on the Bag 1 final board.
// Some pieces may visually "float" — this is correct per SRS (reachable via kicks).

// Honey Cup Bag 2
const HONEY_CUP_BAG2_ROUTES: Bag2Route[] = [
  {
    routeId: 'ideal',
    routeLabel: 'Standard (J→S→O)',
    conditionLabel: 'Default',
    condition: { type: 'true' },
    canSelect: () => true,
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'J', cells: [{ col: 0, row: 14 }, { col: 1, row: 14 }, { col: 0, row: 15 }, { col: 0, row: 16 }], hint: 'J vertical, cols 0-1, left wall' },
      { piece: 'L', cells: [{ col: 8, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }, { col: 8, row: 16 }], hint: 'L flat, cols 6-8' },
      { piece: 'S', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 1, row: 15 }, { col: 2, row: 15 }], hint: 'S flat, cols 1-3' },
      { piece: 'O', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 6, row: 15 }, { col: 7, row: 15 }], hint: 'O flat, cols 6-7' },
      { piece: 'I', cells: [{ col: 0, row: 13 }, { col: 1, row: 13 }, { col: 2, row: 13 }, { col: 3, row: 13 }], hint: 'I horizontal, cols 0-3' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'alt_i_left',
    routeLabel: 'I-left variant',
    conditionLabel: 'I before J',
    condition: { type: 'before', a: 'I', b: 'J' },
    canSelect: (bag2) => appearsBefore(bag2, 'I', 'J'),
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'I', cells: [{ col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }, { col: 0, row: 16 }], hint: 'I vertical, col 0, left wall' },
      { piece: 'L', cells: [{ col: 6, row: 14 }, { col: 6, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }], hint: 'L vertical, cols 6-7' },
      { piece: 'S', cells: [{ col: 7, row: 14 }, { col: 7, row: 15 }, { col: 8, row: 15 }, { col: 8, row: 16 }], hint: 'S vertical, cols 7-8' },
      { piece: 'O', cells: [{ col: 1, row: 14 }, { col: 2, row: 14 }, { col: 1, row: 15 }, { col: 2, row: 15 }], hint: 'O flat, cols 1-2' },
      { piece: 'J', cells: [{ col: 1, row: 13 }, { col: 2, row: 13 }, { col: 3, row: 13 }, { col: 3, row: 14 }], hint: 'J horizontal, cols 1-3' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'l_before_j',
    routeLabel: 'L-before-J variant',
    conditionLabel: 'L before J',
    condition: { type: 'before', a: 'L', b: 'J' },
    canSelect: (bag2) => appearsBefore(bag2, 'L', 'J'),
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'I', cells: [{ col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }, { col: 0, row: 16 }], hint: 'I vertical, col 0, left wall' },
      { piece: 'L', cells: [{ col: 1, row: 13 }, { col: 2, row: 13 }, { col: 3, row: 13 }, { col: 1, row: 14 }], hint: 'L horizontal, cols 1-3' },
      { piece: 'S', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 1, row: 15 }, { col: 2, row: 15 }], hint: 'S flat, cols 1-3' },
      { piece: 'J', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 6, row: 15 }, { col: 6, row: 16 }], hint: 'J vertical, cols 6-7' },
      { piece: 'O', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }], hint: 'O flat, cols 7-8' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  // ── Fallback PC routes (boards 3-8 from wiki: "If one cannot make one of the above stacks") ──
  {
    routeId: 'fb_l_top_left',
    routeLabel: 'Fallback: L top-left',
    conditionLabel: 'L before J',
    condition: { type: 'before', a: 'L', b: 'J' },
    canSelect: (bag2) => appearsBefore(bag2, 'L', 'J'),
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'L', cells: [{ col: 0, row: 12 }, { col: 1, row: 12 }, { col: 1, row: 13 }, { col: 1, row: 14 }], hint: 'L vertical, cols 0-1, top-left' },
      { piece: 'I', cells: [{ col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }, { col: 0, row: 16 }], hint: 'I vertical, col 0, left wall' },
      { piece: 'S', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 1, row: 15 }, { col: 2, row: 15 }], hint: 'S flat, cols 1-3' },
      { piece: 'J', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 6, row: 15 }, { col: 6, row: 16 }], hint: 'J vertical, cols 6-7' },
      { piece: 'O', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }], hint: 'O flat, cols 7-8' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'fb_j_top_right',
    routeLabel: 'Fallback: J top-right',
    conditionLabel: 'J before L',
    condition: { type: 'before', a: 'J', b: 'L' },
    canSelect: (bag2) => appearsBefore(bag2, 'J', 'L'),
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'J', cells: [{ col: 9, row: 12 }, { col: 9, row: 13 }, { col: 8, row: 14 }, { col: 9, row: 14 }], hint: 'J vertical, cols 8-9, top-right' },
      { piece: 'I', cells: [{ col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }, { col: 0, row: 16 }], hint: 'I vertical, col 0, left wall' },
      { piece: 'S', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 1, row: 15 }, { col: 2, row: 15 }], hint: 'S flat, cols 1-3' },
      { piece: 'O', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 6, row: 15 }, { col: 7, row: 15 }], hint: 'O flat, cols 6-7' },
      { piece: 'L', cells: [{ col: 8, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }, { col: 8, row: 16 }], hint: 'L flat, cols 6-8' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'fb_s_early',
    routeLabel: 'Fallback: S top-right',
    conditionLabel: 'S before J',
    condition: { type: 'before', a: 'S', b: 'J' },
    canSelect: (bag2) => appearsBefore(bag2, 'S', 'J'),
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'S', cells: [{ col: 7, row: 12 }, { col: 7, row: 13 }, { col: 8, row: 13 }, { col: 8, row: 14 }], hint: 'S vertical, cols 7-8, top-right' },
      { piece: 'I', cells: [{ col: 0, row: 14 }, { col: 1, row: 14 }, { col: 2, row: 14 }, { col: 3, row: 14 }], hint: 'I horizontal, cols 0-3' },
      { piece: 'J', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 6, row: 15 }, { col: 6, row: 16 }], hint: 'J vertical, cols 6-7' },
      { piece: 'L', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 2, row: 15 }, { col: 0, row: 16 }], hint: 'L horizontal, cols 0-2, bottom-left' },
      { piece: 'O', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }], hint: 'O flat, cols 7-8' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'fb_o_top_left',
    routeLabel: 'Fallback: O top-left',
    conditionLabel: 'O before J',
    condition: { type: 'before', a: 'O', b: 'J' },
    canSelect: (bag2) => appearsBefore(bag2, 'O', 'J'),
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'O', cells: [{ col: 0, row: 12 }, { col: 1, row: 12 }, { col: 0, row: 13 }, { col: 1, row: 13 }], hint: 'O flat, cols 0-1, top-left' },
      { piece: 'I', cells: [{ col: 8, row: 13 }, { col: 8, row: 14 }, { col: 8, row: 15 }, { col: 8, row: 16 }], hint: 'I vertical, col 8' },
      { piece: 'J', cells: [{ col: 0, row: 14 }, { col: 1, row: 14 }, { col: 0, row: 15 }, { col: 0, row: 16 }], hint: 'J vertical, cols 0-1, left wall' },
      { piece: 'S', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 1, row: 15 }, { col: 2, row: 15 }], hint: 'S flat, cols 1-3' },
      { piece: 'L', cells: [{ col: 6, row: 14 }, { col: 6, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }], hint: 'L vertical, cols 6-7' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'fb_i_center',
    routeLabel: 'Fallback: I center col 6',
    conditionLabel: 'I before J',
    condition: { type: 'before', a: 'I', b: 'J' },
    canSelect: (bag2) => appearsBefore(bag2, 'I', 'J'),
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'I', cells: [{ col: 6, row: 13 }, { col: 6, row: 14 }, { col: 6, row: 15 }, { col: 6, row: 16 }], hint: 'I vertical, col 6, center' },
      { piece: 'L', cells: [{ col: 9, row: 13 }, { col: 7, row: 14 }, { col: 8, row: 14 }, { col: 9, row: 14 }], hint: 'L horizontal, cols 7-9, right' },
      { piece: 'J', cells: [{ col: 0, row: 14 }, { col: 1, row: 14 }, { col: 0, row: 15 }, { col: 0, row: 16 }], hint: 'J vertical, cols 0-1, left wall' },
      { piece: 'S', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 1, row: 15 }, { col: 2, row: 15 }], hint: 'S flat, cols 1-3' },
      { piece: 'O', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }], hint: 'O flat, cols 7-8' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
];

// MS2 Bag 2
const MS2_BAG2_ROUTES: Bag2Route[] = [
  {
    routeId: 'setup_a',
    routeLabel: 'Setup A (O early)',
    conditionLabel: 'Default',
    condition: { type: 'true' },
    canSelect: () => true,
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O flat, cols 8-9, bottom-right' },
      { piece: 'J', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 2, row: 15 }, { col: 2, row: 16 }], hint: 'J vertical, cols 2-3' },
      { piece: 'S', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }], hint: 'S flat, cols 6-8' },
      { piece: 'I', cells: [{ col: 9, row: 12 }, { col: 9, row: 13 }, { col: 9, row: 14 }, { col: 9, row: 15 }], hint: 'I vertical, col 9, right wall' },
      { piece: 'L', cells: [{ col: 0, row: 12 }, { col: 1, row: 12 }, { col: 1, row: 13 }, { col: 1, row: 14 }], hint: 'L vertical, cols 0-1' },
    ],
    holdPlacement: { piece: 'L', cells: [{ col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }, { col: 1, row: 15 }], hint: 'Hold L, left wall gap-filler' },
    tstStepIndex: -1,
  },
  {
    routeId: 'setup_b',
    routeLabel: 'Setup B (L before I/J)',
    conditionLabel: 'L before I and J',
    condition: { type: 'and', conditions: [{ type: 'before', a: 'L', b: 'I' }, { type: 'before', a: 'L', b: 'J' }] },
    canSelect: (bag2) => appearsBefore(bag2, 'L', 'I') && appearsBefore(bag2, 'L', 'J'),
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O flat, cols 8-9, bottom-right' },
      { piece: 'J', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 2, row: 15 }, { col: 2, row: 16 }], hint: 'J vertical, cols 2-3' },
      { piece: 'S', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }], hint: 'S flat, cols 6-8' },
      { piece: 'L', cells: [{ col: 1, row: 13 }, { col: 2, row: 13 }, { col: 3, row: 13 }, { col: 1, row: 14 }], hint: 'L horizontal, cols 1-3' },
      { piece: 'I', cells: [{ col: 0, row: 12 }, { col: 1, row: 12 }, { col: 2, row: 12 }, { col: 3, row: 12 }], hint: 'I horizontal, cols 0-3' },
    ],
    holdPlacement: { piece: 'L', cells: [{ col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }, { col: 1, row: 15 }], hint: 'Hold L, left wall gap-filler' },
    tstStepIndex: -1,
  },
  // ── Setup C & D from wiki (distinct board shapes for different piece orders) ──
  {
    routeId: 'setup_c',
    routeLabel: 'Setup C (J+O early)',
    conditionLabel: 'J before I, O before S, L after I',
    condition: { type: 'and', conditions: [{ type: 'before', a: 'J', b: 'I' }, { type: 'before', a: 'O', b: 'S' }, { type: 'not', condition: { type: 'before', a: 'L', b: 'I' } }] },
    canSelect: (bag2) => appearsBefore(bag2, 'J', 'I') && appearsBefore(bag2, 'O', 'S') && !appearsBefore(bag2, 'L', 'I'),
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'J', cells: [{ col: 0, row: 13 }, { col: 1, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }], hint: 'J vertical, cols 0-1, left' },
      { piece: 'O', cells: [{ col: 2, row: 13 }, { col: 3, row: 13 }, { col: 2, row: 14 }, { col: 3, row: 14 }], hint: 'O flat, cols 2-3' },
      { piece: 'S', cells: [{ col: 1, row: 14 }, { col: 1, row: 15 }, { col: 2, row: 15 }, { col: 2, row: 16 }], hint: 'S vertical, cols 1-2' },
      { piece: 'I', cells: [{ col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'I vertical, col 9, right wall' },
      { piece: 'L', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 8, row: 16 }, { col: 8, row: 17 }], hint: 'L vertical, cols 7-8' },
    ],
    holdPlacement: { piece: 'L', cells: [{ col: 6, row: 14 }, { col: 6, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }], hint: 'Hold L, center gap-filler' },
    tstStepIndex: -1,
  },
  {
    routeId: 'setup_d',
    routeLabel: 'Setup D (S top-right)',
    conditionLabel: 'S before J and O',
    condition: { type: 'and', conditions: [{ type: 'before', a: 'S', b: 'J' }, { type: 'before', a: 'S', b: 'O' }] },
    canSelect: (bag2) => appearsBefore(bag2, 'S', 'J') && appearsBefore(bag2, 'S', 'O'),
    placements: [
      { piece: 'Z', cells: [{ col: 4, row: 16 }, { col: 5, row: 16 }, { col: 5, row: 17 }, { col: 6, row: 17 }], hint: 'Z flat, cols 4-6' },
      { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O flat, cols 8-9, bottom-right' },
      { piece: 'S', cells: [{ col: 8, row: 13 }, { col: 9, row: 13 }, { col: 7, row: 14 }, { col: 8, row: 14 }], hint: 'S flat, cols 7-9, top-right' },
      { piece: 'I', cells: [{ col: 0, row: 14 }, { col: 1, row: 14 }, { col: 2, row: 14 }, { col: 3, row: 14 }], hint: 'I horizontal, cols 0-3' },
      { piece: 'L', cells: [{ col: 9, row: 14 }, { col: 7, row: 15 }, { col: 8, row: 15 }, { col: 9, row: 15 }], hint: 'L horizontal, cols 7-9, right' },
      { piece: 'J', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 2, row: 15 }, { col: 2, row: 16 }], hint: 'J horizontal, cols 0-2' },
    ],
    holdPlacement: { piece: 'L', cells: [{ col: 6, row: 14 }, { col: 6, row: 15 }, { col: 6, row: 16 }, { col: 7, row: 16 }], hint: 'Hold L, center gap-filler' },
    tstStepIndex: -1,
  },
];

// Stray Cannon Bag 2
const STRAY_CANNON_BAG2_ROUTES: Bag2Route[] = [
  {
    routeId: 'j_before_o',
    routeLabel: 'Route 1 (J>O, 98% PC)',
    conditionLabel: 'Default',
    condition: { type: 'true' },
    canSelect: () => true,
    placements: [
      { piece: 'L', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 3, row: 17 }], hint: 'L horizontal, cols 3-5' },
      { piece: 'S', cells: [{ col: 0, row: 14 }, { col: 0, row: 15 }, { col: 1, row: 15 }, { col: 1, row: 16 }], hint: 'S vertical, cols 0-1' },
      { piece: 'Z', cells: [{ col: 3, row: 14 }, { col: 2, row: 15 }, { col: 3, row: 15 }, { col: 2, row: 16 }], hint: 'Z vertical, cols 2-3' },
      { piece: 'I', cells: [{ col: 9, row: 13 }, { col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }], hint: 'I vertical, col 9, right wall' },
      { piece: 'J', cells: [{ col: 8, row: 13 }, { col: 8, row: 14 }, { col: 7, row: 15 }, { col: 8, row: 15 }], hint: 'J vertical, cols 7-8' },
      { piece: 'O', cells: [{ col: 6, row: 13 }, { col: 7, row: 13 }, { col: 6, row: 14 }, { col: 7, row: 14 }], hint: 'O flat, cols 6-7' },
    ],
    holdPlacement: { piece: 'Z', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'Hold Z, right side gap-filler' },
    tstStepIndex: -1,
  },
  {
    routeId: 's_before_j',
    routeLabel: 'Route 2 (S>J, 84% PC)',
    conditionLabel: 'S before J',
    condition: { type: 'before', a: 'S', b: 'J' },
    canSelect: (bag2) => appearsBefore(bag2, 'S', 'J'),
    placements: [
      { piece: 'L', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 3, row: 17 }], hint: 'L horizontal, cols 3-5' },
      { piece: 'S', cells: [{ col: 7, row: 15 }, { col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }], hint: 'S vertical, cols 7-8' },
      { piece: 'I', cells: [{ col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }, { col: 9, row: 17 }], hint: 'I vertical, col 9, right wall' },
      { piece: 'O', cells: [{ col: 2, row: 14 }, { col: 3, row: 14 }, { col: 2, row: 15 }, { col: 3, row: 15 }], hint: 'O flat, cols 2-3' },
      { piece: 'J', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 8, row: 14 }, { col: 8, row: 15 }], hint: 'J horizontal, cols 6-8' },
      { piece: 'Z', cells: [{ col: 2, row: 12 }, { col: 1, row: 13 }, { col: 2, row: 13 }, { col: 1, row: 14 }], hint: 'Z vertical, cols 1-2' },
    ],
    holdPlacement: { piece: 'Z', cells: [{ col: 0, row: 15 }, { col: 1, row: 15 }, { col: 1, row: 16 }, { col: 2, row: 16 }], hint: 'Hold Z, left side gap-filler' },
    tstStepIndex: -1,
  },
  {
    routeId: 'o_before_sj',
    routeLabel: 'Route 3 (O>SJ, 71% PC)',
    conditionLabel: 'O before S and J',
    condition: { type: 'and', conditions: [{ type: 'before', a: 'O', b: 'S' }, { type: 'before', a: 'O', b: 'J' }] },
    canSelect: (bag2) => appearsBefore(bag2, 'O', 'S') && appearsBefore(bag2, 'O', 'J'),
    placements: [
      { piece: 'J', cells: [{ col: 1, row: 12 }, { col: 2, row: 12 }, { col: 1, row: 13 }, { col: 1, row: 14 }], hint: 'J vertical, cols 1-2' },
      { piece: 'S', cells: [{ col: 2, row: 13 }, { col: 2, row: 14 }, { col: 3, row: 14 }, { col: 3, row: 15 }], hint: 'S vertical, cols 2-3' },
      { piece: 'I', cells: [{ col: 9, row: 13 }, { col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }], hint: 'I vertical, col 9, right wall' },
      { piece: 'Z', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 7, row: 15 }, { col: 8, row: 15 }], hint: 'Z flat, cols 6-8' },
      { piece: 'O', cells: [{ col: 1, row: 15 }, { col: 2, row: 15 }, { col: 1, row: 16 }, { col: 2, row: 16 }], hint: 'O flat, cols 1-2' },
      { piece: 'L', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 3, row: 17 }], hint: 'L horizontal, cols 3-5' },
    ],
    holdPlacement: { piece: 'Z', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'Hold Z, right side gap-filler' },
    tstStepIndex: -1,
  },
  {
    routeId: 's_before_o_iz_before_j',
    routeLabel: 'Route 4 (S>O IZ>J, 85% PC, Extra)',
    conditionLabel: 'S before O, and I or Z before J',
    condition: { type: 'and', conditions: [{ type: 'before', a: 'S', b: 'O' }, { type: 'or', conditions: [{ type: 'before', a: 'I', b: 'J' }, { type: 'before', a: 'Z', b: 'J' }] }] },
    canSelect: (bag2) => appearsBefore(bag2, 'S', 'O') && (appearsBefore(bag2, 'I', 'J') || appearsBefore(bag2, 'Z', 'J')),
    placements: [
      { piece: 'J', cells: [{ col: 8, row: 12 }, { col: 9, row: 12 }, { col: 8, row: 13 }, { col: 8, row: 14 }], hint: 'J vertical, cols 8-9' },
      { piece: 'S', cells: [{ col: 2, row: 13 }, { col: 2, row: 14 }, { col: 3, row: 14 }, { col: 3, row: 15 }], hint: 'S vertical, cols 2-3' },
      { piece: 'I', cells: [{ col: 9, row: 13 }, { col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }], hint: 'I vertical, col 9, right wall' },
      { piece: 'Z', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 7, row: 15 }, { col: 8, row: 15 }], hint: 'Z flat, cols 6-8' },
      { piece: 'O', cells: [{ col: 1, row: 15 }, { col: 2, row: 15 }, { col: 1, row: 16 }, { col: 2, row: 16 }], hint: 'O flat, cols 1-2' },
      { piece: 'L', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 3, row: 17 }], hint: 'L horizontal, cols 3-5' },
    ],
    holdPlacement: { piece: 'Z', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'Hold Z, right side gap-filler' },
    tstStepIndex: -1,
  },
  {
    routeId: 'j_before_i',
    routeLabel: 'Route 5 (J>I, 53% PC, Extra)',
    conditionLabel: 'J before I',
    condition: { type: 'before', a: 'J', b: 'I' },
    canSelect: (bag2) => appearsBefore(bag2, 'J', 'I'),
    placements: [
      { piece: 'O', cells: [{ col: 1, row: 13 }, { col: 2, row: 13 }, { col: 1, row: 14 }, { col: 2, row: 14 }], hint: 'O flat, cols 1-2' },
      { piece: 'S', cells: [{ col: 0, row: 14 }, { col: 0, row: 15 }, { col: 1, row: 15 }, { col: 1, row: 16 }], hint: 'S vertical, cols 0-1' },
      { piece: 'Z', cells: [{ col: 3, row: 14 }, { col: 2, row: 15 }, { col: 3, row: 15 }, { col: 2, row: 16 }], hint: 'Z vertical, cols 2-3' },
      { piece: 'I', cells: [{ col: 6, row: 14 }, { col: 7, row: 14 }, { col: 8, row: 14 }, { col: 9, row: 14 }], hint: 'I horizontal, cols 6-9' },
      { piece: 'J', cells: [{ col: 7, row: 15 }, { col: 8, row: 15 }, { col: 9, row: 15 }, { col: 9, row: 16 }], hint: 'J horizontal, cols 7-9' },
      { piece: 'L', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 5, row: 16 }, { col: 3, row: 17 }], hint: 'L horizontal, cols 3-5' },
    ],
    holdPlacement: { piece: 'Z', cells: [{ col: 7, row: 16 }, { col: 8, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'Hold Z, right side gap-filler' },
    tstStepIndex: -1,
  },
];

// Gamushiro Bag 2
const GAMUSHIRO_BAG2_ROUTES: Bag2Route[] = [
  {
    routeId: 'form_1',
    routeLabel: 'Form 1 (L→O, 99% PC)',
    conditionLabel: 'Default',
    condition: { type: 'true' },
    canSelect: () => true,
    placements: [
      { piece: 'Z', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'Z flat, cols 3-5' },
      { piece: 'J', cells: [{ col: 1, row: 14 }, { col: 2, row: 14 }, { col: 1, row: 15 }, { col: 1, row: 16 }], hint: 'J vertical, cols 1-2' },
      { piece: 'S', cells: [{ col: 6, row: 15 }, { col: 7, row: 15 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'S flat, cols 5-7' },
      { piece: 'L', cells: [{ col: 8, row: 14 }, { col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }], hint: 'L vertical, cols 8-9' },
      { piece: 'I', cells: [{ col: 0, row: 12 }, { col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }], hint: 'I vertical, col 0, left wall' },
      { piece: 'O', cells: [{ col: 8, row: 12 }, { col: 9, row: 12 }, { col: 8, row: 13 }, { col: 9, row: 13 }], hint: 'O flat, cols 8-9' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'form_2',
    bag1Reduction: 1,
    routeLabel: 'Form 2 (OO at bottom)',
    conditionLabel: 'O after J, S, L',
    condition: { type: 'and', conditions: [{ type: 'not', condition: { type: 'before', a: 'O', b: 'J' } }, { type: 'not', condition: { type: 'before', a: 'O', b: 'S' } }, { type: 'not', condition: { type: 'before', a: 'O', b: 'L' } }] },
    canSelect: (bag2) => !appearsBefore(bag2, 'O', 'J') && !appearsBefore(bag2, 'O', 'S') && !appearsBefore(bag2, 'O', 'L'),
    placements: [
      { piece: 'Z', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'Z flat, cols 3-5' },
      { piece: 'O', cells: [{ col: 8, row: 16 }, { col: 9, row: 16 }, { col: 8, row: 17 }, { col: 9, row: 17 }], hint: 'O flat, cols 8-9, bottom-right' },
      { piece: 'J', cells: [{ col: 1, row: 14 }, { col: 2, row: 14 }, { col: 1, row: 15 }, { col: 1, row: 16 }], hint: 'J vertical, cols 1-2' },
      { piece: 'S', cells: [{ col: 6, row: 15 }, { col: 7, row: 15 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'S flat, cols 5-7' },
      { piece: 'I', cells: [{ col: 0, row: 12 }, { col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }], hint: 'I vertical, col 0, left wall' },
      { piece: 'L', cells: [{ col: 8, row: 12 }, { col: 9, row: 12 }, { col: 9, row: 13 }, { col: 9, row: 14 }], hint: 'L vertical, cols 8-9' },
    ],
    holdPlacement: { piece: 'L', cells: [{ col: 8, row: 13 }, { col: 8, row: 14 }, { col: 8, row: 15 }, { col: 9, row: 15 }], hint: 'Hold L, right side gap-filler' },
    tstStepIndex: -1,
  },
  {
    routeId: 'o_early',
    routeLabel: 'O early (top-left)',
    conditionLabel: 'O before L',
    condition: { type: 'before', a: 'O', b: 'L' },
    canSelect: (bag2) => appearsBefore(bag2, 'O', 'L'),
    placements: [
      { piece: 'Z', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'Z flat, cols 3-5' },
      { piece: 'O', cells: [{ col: 1, row: 12 }, { col: 2, row: 12 }, { col: 1, row: 13 }, { col: 2, row: 13 }], hint: 'O flat, cols 1-2, top-left' },
      { piece: 'J', cells: [{ col: 1, row: 14 }, { col: 2, row: 14 }, { col: 1, row: 15 }, { col: 1, row: 16 }], hint: 'J vertical, cols 1-2' },
      { piece: 'L', cells: [{ col: 8, row: 14 }, { col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }], hint: 'L vertical, cols 8-9' },
      { piece: 'S', cells: [{ col: 6, row: 15 }, { col: 7, row: 15 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'S flat, cols 5-7' },
      { piece: 'I', cells: [{ col: 0, row: 12 }, { col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }], hint: 'I vertical, col 0, left wall' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'o_mid_right',
    routeLabel: 'O mid-right',
    conditionLabel: 'O before S',
    condition: { type: 'and', conditions: [{ type: 'before', a: 'O', b: 'S' }, { type: 'not', condition: { type: 'before', a: 'O', b: 'L' } }] },
    canSelect: (bag2) => appearsBefore(bag2, 'O', 'S') && !appearsBefore(bag2, 'O', 'L'),
    placements: [
      { piece: 'Z', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'Z flat, cols 3-5' },
      { piece: 'O', cells: [{ col: 6, row: 13 }, { col: 7, row: 13 }, { col: 6, row: 14 }, { col: 7, row: 14 }], hint: 'O flat, cols 6-7, mid-right' },
      { piece: 'J', cells: [{ col: 1, row: 14 }, { col: 2, row: 14 }, { col: 1, row: 15 }, { col: 1, row: 16 }], hint: 'J vertical, cols 1-2' },
      { piece: 'L', cells: [{ col: 8, row: 14 }, { col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }], hint: 'L vertical, cols 8-9' },
      { piece: 'S', cells: [{ col: 6, row: 15 }, { col: 7, row: 15 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'S flat, cols 5-7' },
      { piece: 'I', cells: [{ col: 0, row: 12 }, { col: 0, row: 13 }, { col: 0, row: 14 }, { col: 0, row: 15 }], hint: 'I vertical, col 0, left wall' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
  {
    routeId: 'l_early',
    routeLabel: 'L early (I col 9)',
    conditionLabel: 'L before I',
    condition: { type: 'before', a: 'L', b: 'I' },
    canSelect: (bag2) => appearsBefore(bag2, 'L', 'I'),
    placements: [
      { piece: 'Z', cells: [{ col: 3, row: 16 }, { col: 4, row: 16 }, { col: 4, row: 17 }, { col: 5, row: 17 }], hint: 'Z flat, cols 3-5' },
      { piece: 'L', cells: [{ col: 7, row: 10 }, { col: 7, row: 11 }, { col: 7, row: 12 }, { col: 8, row: 12 }], hint: 'L vertical, cols 7-8, top-right' },
      { piece: 'O', cells: [{ col: 7, row: 13 }, { col: 8, row: 13 }, { col: 7, row: 14 }, { col: 8, row: 14 }], hint: 'O flat, cols 7-8' },
      { piece: 'I', cells: [{ col: 9, row: 13 }, { col: 9, row: 14 }, { col: 9, row: 15 }, { col: 9, row: 16 }], hint: 'I vertical, col 9, right wall' },
      { piece: 'J', cells: [{ col: 1, row: 14 }, { col: 2, row: 14 }, { col: 1, row: 15 }, { col: 1, row: 16 }], hint: 'J vertical, cols 1-2' },
      { piece: 'S', cells: [{ col: 6, row: 15 }, { col: 7, row: 15 }, { col: 5, row: 16 }, { col: 6, row: 16 }], hint: 'S flat, cols 5-7' },
    ],
    holdPlacement: null,
    tstStepIndex: -1,
  },
];

export const BAG2_ROUTE_DATA: Record<OpenerID, Bag2Data> = {
  ms2: { routes: MS2_BAG2_ROUTES },
  gamushiro: { routes: GAMUSHIRO_BAG2_ROUTES },
  honey_cup: { routes: HONEY_CUP_BAG2_ROUTES },
  stray_cannon: { routes: STRAY_CANNON_BAG2_ROUTES },
};

// ── Mirror ──

function mirrorBag2Placement(p: RawPlacement): RawPlacement {
  return {
    piece: mirrorPiece(p.piece),
    cells: p.cells.map((c) => ({ col: 9 - c.col, row: c.row })),
    hint: p.hint + ' (mirrored)',
  };
}

function mirrorBag2Route(route: Bag2Route): Bag2Route {
  return {
    ...route,
    routeLabel: route.routeLabel + ' (Mirror)',
    condition: mirrorCondition(route.condition),
    canSelect: (bag2) => route.canSelect(bag2.map(mirrorPiece)),
    placements: route.placements.map(mirrorBag2Placement),
    holdPlacement: route.holdPlacement ? mirrorBag2Placement(route.holdPlacement) : null,
  };
}

// ── Public API ──

export function getBag2Routes(openerId: OpenerID, mirror: boolean): Bag2Route[] {
  const data = BAG2_ROUTE_DATA[openerId];
  if (!data || data.routes.length === 0) return [];
  return mirror ? data.routes.map(mirrorBag2Route) : [...data.routes];
}
