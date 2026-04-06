import { describe, test, expect } from 'bun:test';
import fc from 'fast-check';
import {
  createVisualizerState,
  getOpenerSequence,
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
  return { visualizer: createVisualizerState(getOpenerSequence(openerId, mirror)) };
}

function dispatch(c: VisualizerContainer, action: string): boolean {
  return dispatchVisualizerAction(c, action);
}

function advanceToBag1End(c: VisualizerContainer): void {
  const steps = c.visualizer.sequence.steps.length;
  for (let i = 0; i < steps; i++) dispatch(c, 'advance');
}

// ── AC#2: State Invariant Assertions ──

function assertInvariants(viz: VisualizerState): void {
  expect([1, 2]).toContain(viz.bag);
  expect(viz.currentStep).toBeGreaterThanOrEqual(0);
  expect(viz.bag2RouteIndex).toBeGreaterThanOrEqual(0);

  if (viz.bag === 2) {
    expect(viz.bag2Sequence).not.toBeNull();
    expect(viz.currentStep).toBeLessThanOrEqual(viz.bag2Sequence!.steps.length);
  } else {
    expect(viz.currentStep).toBeLessThanOrEqual(viz.sequence.steps.length);
  }
}

// ── AC#1: Red Test — press 1, 5, → ──

describe('AC1: press 1 → 5 → right arrow', () => {
  test('advances Bag 2 step (the reported bug)', () => {
    const c = cont('ms2');
    dispatch(c, 'option_1');
    dispatch(c, 'option_5');
    expect(c.visualizer.bag).toBe(2);
    expect(c.visualizer.bag2Sequence).not.toBeNull();
    dispatch(c, 'advance');
    expect(c.visualizer.currentStep).toBe(1);
  });

  test('press 5 directly enters Bag 2', () => {
    const c = cont('ms2');
    dispatch(c, 'option_5');
    expect(c.visualizer.bag).toBe(2);
    expect(c.visualizer.bag2Sequence).not.toBeNull();
    dispatch(c, 'advance');
    expect(c.visualizer.currentStep).toBe(1);
  });

  test('press 6 enters Bag 2 route B', () => {
    const c = cont('ms2');
    const routes = getBag2Routes('ms2', false);
    if (routes.length < 2) return;
    dispatch(c, 'option_6');
    expect(c.visualizer.bag).toBe(2);
    expect(c.visualizer.bag2Sequence).not.toBeNull();
    expect(c.visualizer.bag2RouteIndex).toBe(1);
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
        fc.array(actionArb, { minLength: 1, maxLength: 15 }),
        (openerId, actions) => {
          const c = cont(openerId);
          for (const action of actions) {
            dispatch(c, action);
            const board = getCurrentBoard(c.visualizer);
            expect(board).toBeDefined();
            expect(board.length).toBe(20);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ── AC#5: 0-switch transition coverage ──

describe('AC5: transition coverage', () => {
  const ACTIONS = [
    'advance', 'step_back',
    'option_1', 'option_2', 'option_3', 'option_4',
    'option_5', 'option_6',
    'toggle_mode', 'reset_stats',
  ];
  const OPENERS: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'];

  describe('from bag1_step0', () => {
    for (const a of ACTIONS) {
      test(a, () => {
        const c = cont('ms2');
        dispatch(c, a);
        assertInvariants(c.visualizer);
      });
    }
  });

  describe('from bag1_mid', () => {
    for (const a of ACTIONS) {
      test(a, () => {
        const c = cont('ms2');
        dispatch(c, 'advance');
        dispatch(c, 'advance');
        dispatch(c, 'advance');
        dispatch(c, a);
        assertInvariants(c.visualizer);
      });
    }
  });

  describe('from bag1_end', () => {
    for (const a of ACTIONS) {
      test(a, () => {
        const c = cont('ms2');
        advanceToBag1End(c);
        dispatch(c, a);
        assertInvariants(c.visualizer);
      });
    }
  });

  describe('from bag2 via advance', () => {
    for (const a of ACTIONS) {
      test(a, () => {
        const c = cont('ms2');
        advanceToBag1End(c);
        dispatch(c, 'advance');
        if (c.visualizer.bag !== 2) return;
        dispatch(c, a);
        assertInvariants(c.visualizer);
      });
    }
  });

  describe('from bag2 via option_5', () => {
    for (const a of ACTIONS) {
      test(a, () => {
        const c = cont('ms2');
        dispatch(c, 'option_5');
        if (c.visualizer.bag !== 2) return;
        dispatch(c, a);
        assertInvariants(c.visualizer);
      });
    }
  });

  describe('from bag2_mid', () => {
    for (const a of ACTIONS) {
      test(a, () => {
        const c = cont('ms2');
        advanceToBag1End(c);
        dispatch(c, 'advance');
        if (c.visualizer.bag !== 2) return;
        dispatch(c, 'advance');
        dispatch(c, 'advance');
        dispatch(c, a);
        assertInvariants(c.visualizer);
      });
    }
  });

  describe('all openers × option_5', () => {
    for (const opener of OPENERS) {
      for (const mirror of [false, true]) {
        test(`${opener}${mirror ? ' mirror' : ''}: option_5 loads bag2`, () => {
          const c = cont(opener, mirror);
          const routes = getBag2Routes(opener, mirror);
          if (routes.length === 0) return;
          dispatch(c, 'option_5');
          expect(c.visualizer.bag).toBe(2);
          assertInvariants(c.visualizer);
        });
      }
    }
  });
});
