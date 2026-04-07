import { describe, test, expect } from 'bun:test';
import fc from 'fast-check';
import {
  createVisualizerState,
  getBag2Routes,
  getCurrentBoard,
} from '../src/modes/visualizer.ts';
import type { VisualizerState } from '../src/modes/visualizer.ts';
import type { OpenerID } from '../src/openers/types.ts';
import {
  dispatchVisualizerAction,
  type VisualizerContainer,
} from '../src/dispatcher/visualizer.ts';

// ── Helpers ──

function cont(openerId: OpenerID = 'ms2', mirror = false): VisualizerContainer {
  return { visualizer: createVisualizerState(openerId, mirror) };
}

function dispatch(c: VisualizerContainer, action: string): boolean {
  return dispatchVisualizerAction(c, action);
}

// ── Invariant assertions for new flat state ──

function assertInvariants(viz: VisualizerState): void {
  expect(viz.currentStep).toBeGreaterThanOrEqual(0);
  expect(viz.currentStep).toBeLessThanOrEqual(viz.steps.length);
  expect(viz.bag1End).toBeGreaterThan(0);
  expect(viz.bag1End).toBeLessThanOrEqual(viz.steps.length);

  // Board at current step should be retrievable
  const board = getCurrentBoard(viz);
  expect(board.length).toBe(20);
  expect(board[0]!.length).toBe(10);
}

// ── AC#1: Red Test — press 1, 5, → ──

describe('AC1: press 1 → 5 → right arrow', () => {
  test('advances Bag 2 step (the reported bug)', () => {
    const c = cont('ms2');
    dispatch(c, 'option_1');
    dispatch(c, 'option_5');
    // After option_5: state rebuilt with route 0, currentStep at bag1End
    expect(c.visualizer.routeIndex).toBe(0);
    expect(c.visualizer.currentStep).toBe(c.visualizer.bag1End);
    dispatch(c, 'advance');
    expect(c.visualizer.currentStep).toBe(c.visualizer.bag1End + 1);
  });

  test('press 5 directly enters Bag 2', () => {
    const c = cont('ms2');
    dispatch(c, 'option_5');
    expect(c.visualizer.routeIndex).toBe(0);
    expect(c.visualizer.currentStep).toBe(c.visualizer.bag1End);
    dispatch(c, 'advance');
    expect(c.visualizer.currentStep).toBe(c.visualizer.bag1End + 1);
  });

  test('press 6 enters Bag 2 route B', () => {
    const c = cont('ms2');
    const routes = getBag2Routes('ms2', false);
    if (routes.length < 2) return;
    dispatch(c, 'option_6');
    expect(c.visualizer.routeIndex).toBe(1);
  });
});

// ── AC#2: Invariants after every dispatch ──

describe('AC2: invariants after every dispatch', () => {
  const ACTIONS = [
    'advance', 'step_back',
    'option_1', 'option_2', 'option_3', 'option_4',
    'option_5', 'option_6',
    'toggle_mode', 'reset_stats',
  ];

  for (const action of ACTIONS) {
    test(`single ${action} from initial`, () => {
      const c = cont('ms2');
      dispatch(c, action);
      assertInvariants(c.visualizer);
    });
  }

  test('option_1 → option_5 (the bug path)', () => {
    const c = cont('ms2');
    dispatch(c, 'option_1');
    assertInvariants(c.visualizer);
    dispatch(c, 'option_5');
    assertInvariants(c.visualizer);
  });
});

// ── AC#3: Property-based fuzzing ──

describe('AC3: random key sequences maintain invariants', () => {
  const actionArb = fc.constantFrom(
    'advance', 'step_back',
    'option_1', 'option_2', 'option_3', 'option_4',
    'option_5', 'option_6',
    'toggle_mode', 'reset_stats',
  );
  const openerArb = fc.constantFrom<OpenerID>(
    'ms2', 'honey_cup', 'stray_cannon', 'gamushiro',
  );

  test('100 random sequences of length 1-20', () => {
    fc.assert(
      fc.property(
        openerArb,
        fc.array(actionArb, { minLength: 1, maxLength: 20 }),
        (openerId, actions) => {
          const c = cont(openerId);
          for (const action of actions) {
            dispatch(c, action);
            assertInvariants(c.visualizer);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('getCurrentBoard never crashes', () => {
    fc.assert(
      fc.property(
        openerArb,
        fc.array(actionArb, { minLength: 1, maxLength: 10 }),
        (openerId, actions) => {
          const c = cont(openerId);
          for (const action of actions) {
            dispatch(c, action);
            expect(() => getCurrentBoard(c.visualizer)).not.toThrow();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
