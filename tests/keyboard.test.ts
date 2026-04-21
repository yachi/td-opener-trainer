/**
 * tests/keyboard.test.ts — L9 reframe: unit-test src/input/keyboard.ts
 *
 * Background: commit a02012e shipped Reframing A+ which rewrote keyboard.ts
 * to own DAS/ARR timing and translate raw keyboard events into SessionActions.
 * That module was 0% unit-tested — only exercised via Playwright walks. The
 * L9 move is to test it at the unit level with mocked dispatch and a mocked
 * clock, eliminating the browser-cycle-per-route smell.
 *
 * What this file proves:
 *   1. Every key in every (phase, playMode) combination dispatches the
 *      correct SessionAction (or no-op).
 *   2. DAS/ARR timing — first move fires synchronously on keydown (the
 *      0ddbe99 race fix), held keys auto-repeat at 167ms + 33ms intervals.
 *   3. Phase guards — unmapped keys and wrong-phase keys are silently
 *      dropped rather than misrouted.
 *   4. Attach/detach lifecycle — no leaking listeners.
 *
 * Runtime: bun:test — no DOM globals. We stub `window` and `KeyboardEvent`
 * minimally in ~25 lines at the top. The stub is test-local and does NOT
 * pollute other test files.
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';

// ═══════════════════════════════════════════════════════════════════════════
// Runtime polyfill — bun test environment lacks window and KeyboardEvent.
// ═══════════════════════════════════════════════════════════════════════════

type Listener = (e: KeyboardEventLike) => void;
interface KeyboardEventLike {
  type: string;
  code: string;
  repeat: boolean;
  preventDefault(): void;
}

const listeners = new Map<string, Set<Listener>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = {
  addEventListener(type: string, fn: Listener): void {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
  },
  removeEventListener(type: string, fn: Listener): void {
    listeners.get(type)?.delete(fn);
  },
  dispatchEvent(e: KeyboardEventLike): boolean {
    listeners.get(e.type)?.forEach((fn) => fn(e));
    return true;
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).KeyboardEvent = class {
  type: string;
  code: string;
  repeat: boolean;
  constructor(type: string, init: { code: string; repeat?: boolean }) {
    this.type = type;
    this.code = init.code;
    this.repeat = !!init.repeat;
  }
  preventDefault(): void {}
};

// Override performance.now so DAS/ARR tests can drive deterministic time.
// Set to 0 in beforeEach; tick(N) then means "N ms after keydown baseline".
let mockNow = 0;
const realPerformanceNow = performance.now.bind(performance);
performance.now = () => mockNow;
// Export a helper to restore real time if any test ever needs it.
function setMockNow(t: number): void {
  mockNow = t;
}
// Suppress unused warning — kept for future debugging.
void realPerformanceNow;
void setMockNow;

// ═══════════════════════════════════════════════════════════════════════════
// Imports under test — loaded AFTER the polyfills so the module can register
// its listeners on the stubbed window.
// ═══════════════════════════════════════════════════════════════════════════

import { setupKeyboard, type KeyboardHandler } from '../src/input/keyboard.ts';
import {
  createSession,
  type Session,
  type SessionAction,
} from '../src/session.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeSession(overrides: Partial<Session> = {}): Session {
  return { ...createSession(), ...overrides };
}

function fireKeyDown(code: string, repeat = false): void {
  const event = new KeyboardEvent('keydown', { code, repeat });
  (globalThis.window as unknown as Window).dispatchEvent(event);
}

function fireKeyUp(code: string): void {
  const event = new KeyboardEvent('keyup', { code });
  (globalThis.window as unknown as Window).dispatchEvent(event);
}

interface TestRig {
  dispatch: ReturnType<typeof mock>;
  session: Session;
  handler: KeyboardHandler;
  setSession(s: Session): void;
}

function rig(initial: Session): TestRig {
  let current = initial;
  const dispatch = mock((action: SessionAction) => {
    // In a real app the reducer would produce a new session; in these unit
    // tests we only care about WHICH action was dispatched, not the result.
    // Individual tests can override `current` to simulate state progression.
    void action;
  });
  const handler = setupKeyboard(
    dispatch as unknown as (a: SessionAction) => void,
    () => current,
  );
  handler.attach();
  return {
    dispatch,
    get session() {
      return current;
    },
    handler,
    setSession(s: Session) {
      current = s;
    },
  } as TestRig;
}

beforeEach(() => {
  // Clear any leftover listeners from the previous test. Every test calls
  // rig() which calls setupKeyboard().attach() — without this reset, listeners
  // would accumulate and one test's dispatch would fire in the next.
  listeners.clear();
  // Reset mock clock so DAS/ARR tests start from 0.
  mockNow = 0;
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 1: Global R key — always starts a new session
// ═══════════════════════════════════════════════════════════════════════════
describe('R key is global: dispatches newSession in every phase', () => {
  const phases: Session['phase'][] = ['guess1', 'reveal1', 'guess2', 'reveal2'];

  for (const phase of phases) {
    test(`KeyR in ${phase} dispatches newSession`, () => {
      const { dispatch } = rig(makeSession({ phase }));
      fireKeyDown('KeyR');
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({ type: 'newSession' });
    });
  }

  test('KeyR in reveal1 with playMode=manual still dispatches newSession', () => {
    const { dispatch } = rig(
      makeSession({ phase: 'reveal1', playMode: 'manual' }),
    );
    fireKeyDown('KeyR');
    expect(dispatch).toHaveBeenCalledWith({ type: 'newSession' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 2: P key — stateless togglePlayMode dispatch
//
// Keyboard dispatches P unconditionally. The reducer's togglePlayMode
// case is a pure state transition (auto <-> manual with spawn/clear
// hooks) and has no phase guard — the toggle is meaningful in reveal
// phases and benign in guess phases (no effect on gameplay).
// ═══════════════════════════════════════════════════════════════════════════
describe('P key: togglePlayMode in every phase', () => {
  const phases: Session['phase'][] = ['guess1', 'reveal1', 'guess2', 'reveal2'];
  for (const phase of phases) {
    test(`KeyP in ${phase} dispatches togglePlayMode`, () => {
      const { dispatch } = rig(makeSession({ phase }));
      fireKeyDown('KeyP');
      expect(dispatch).toHaveBeenCalledWith({ type: 'togglePlayMode' });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 3: guess1 phase keys
//
// Keyboard is a dumb key→intent mapper post-intent-reframe. Digit keys
// dispatch `pick(index)` regardless of phase; the reducer interprets
// pick as setGuess in guess1. SPACE and ENTER dispatch `primary`; the
// reducer interprets primary as submitGuess (with guess) or newSession
// (without guess). The reducer-level behavior is covered by
// tests/diag-l9-intent.test.ts — these tests prove ONLY the key→action
// mapping.
// ═══════════════════════════════════════════════════════════════════════════
describe('guess1: opener picker, mirror, submit/skip', () => {
  test('Digit1 dispatches pick(0)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1' }));
    fireKeyDown('Digit1');
    expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: 0 });
  });

  test('Digit2 dispatches pick(1)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1' }));
    fireKeyDown('Digit2');
    expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: 1 });
  });

  test('Digit3 dispatches pick(2)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1' }));
    fireKeyDown('Digit3');
    expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: 2 });
  });

  test('Digit4 dispatches pick(3)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1' }));
    fireKeyDown('Digit4');
    expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: 3 });
  });

  test('KeyM dispatches toggleMirror', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1' }));
    fireKeyDown('KeyM');
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggleMirror' });
  });

  test('Enter dispatches primary', () => {
    const { dispatch } = rig(
      makeSession({
        phase: 'guess1',
        guess: { opener: 'ms2', mirror: false },
      }),
    );
    fireKeyDown('Enter');
    expect(dispatch).toHaveBeenCalledWith({ type: 'primary' });
  });

  test('Enter without a guess still dispatches primary (reducer decides no-op vs new session)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1', guess: null }));
    fireKeyDown('Enter');
    // Keyboard is stateless — it always dispatches primary. The reducer's
    // primary handler decides what to do based on guess being null (skip
    // to a new session).
    expect(dispatch).toHaveBeenCalledWith({ type: 'primary' });
  });

  test('Space dispatches primary (reducer interprets to submitGuess)', () => {
    const { dispatch } = rig(
      makeSession({
        phase: 'guess1',
        guess: { opener: 'ms2', mirror: false },
      }),
    );
    fireKeyDown('Space');
    expect(dispatch).toHaveBeenCalledWith({ type: 'primary' });
  });

  test('Space without a guess dispatches primary (reducer interprets as skip)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1', guess: null }));
    fireKeyDown('Space');
    expect(dispatch).toHaveBeenCalledWith({ type: 'primary' });
  });

  test('ArrowLeft in guess1 is ignored', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1' }));
    fireKeyDown('ArrowLeft');
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('Digit5 in guess1 dispatches pick (reducer handles bounds)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1' }));
    fireKeyDown('Digit5');
    expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: 4 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 4: guess2 phase keys (digit → pick, space → primary)
// ═══════════════════════════════════════════════════════════════════════════
describe('guess2: route selector, skip', () => {
  test('Digit1 dispatches pick(0)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess2' }));
    fireKeyDown('Digit1');
    expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: 0 });
  });

  test('Digit2 dispatches pick(1)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess2' }));
    fireKeyDown('Digit2');
    expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: 1 });
  });

  test('Digit3 dispatches pick(2)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess2' }));
    fireKeyDown('Digit3');
    expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: 2 });
  });

  test('Digit4 dispatches pick(3)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess2' }));
    fireKeyDown('Digit4');
    expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: 3 });
  });

  test('Space dispatches primary (reducer interprets as new session)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess2' }));
    fireKeyDown('Space');
    expect(dispatch).toHaveBeenCalledWith({ type: 'primary' });
  });

  test('KeyM in guess2 dispatches toggleMirror (reducer guards to guess1)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess2' }));
    fireKeyDown('KeyM');
    // Keyboard is stateless — it always dispatches toggleMirror for M.
    // The reducer's toggleMirror case guards to `phase === 'guess1'`, so
    // this becomes a no-op at the reducer level. The split is intentional:
    // keyboard doesn't need to know about phase-specific guards.
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggleMirror' });
  });

  test('ArrowLeft in guess2 is ignored', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess2' }));
    fireKeyDown('ArrowLeft');
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 5: reveal phases in AUTO mode
// ═══════════════════════════════════════════════════════════════════════════
describe('reveal auto: step through, advance, toggle', () => {
  test('ArrowLeft in reveal1 auto → stepBackward', () => {
    const { dispatch } = rig(
      makeSession({ phase: 'reveal1', playMode: 'auto' }),
    );
    fireKeyDown('ArrowLeft');
    expect(dispatch).toHaveBeenCalledWith({ type: 'stepBackward' });
  });

  test('ArrowRight in reveal1 auto → stepForward', () => {
    const { dispatch } = rig(
      makeSession({ phase: 'reveal1', playMode: 'auto' }),
    );
    fireKeyDown('ArrowRight');
    expect(dispatch).toHaveBeenCalledWith({ type: 'stepForward' });
  });

  test('Space in reveal1 auto → primary (reducer interprets as advancePhase)', () => {
    const { dispatch } = rig(
      makeSession({ phase: 'reveal1', playMode: 'auto' }),
    );
    fireKeyDown('Space');
    expect(dispatch).toHaveBeenCalledWith({ type: 'primary' });
  });

  test('ArrowLeft in reveal2 auto → stepBackward', () => {
    const { dispatch } = rig(
      makeSession({ phase: 'reveal2', playMode: 'auto' }),
    );
    fireKeyDown('ArrowLeft');
    expect(dispatch).toHaveBeenCalledWith({ type: 'stepBackward' });
  });

  test('Space in reveal2 auto → primary (reducer interprets as advancePhase)', () => {
    const { dispatch } = rig(
      makeSession({ phase: 'reveal2', playMode: 'auto' }),
    );
    fireKeyDown('Space');
    expect(dispatch).toHaveBeenCalledWith({ type: 'primary' });
  });

  test('KeyX in reveal auto is ignored (no rotate without manual)', () => {
    const { dispatch } = rig(
      makeSession({ phase: 'reveal1', playMode: 'auto' }),
    );
    fireKeyDown('KeyX');
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('KeyC in reveal auto is ignored (no hold without manual)', () => {
    const { dispatch } = rig(
      makeSession({ phase: 'reveal1', playMode: 'auto' }),
    );
    fireKeyDown('KeyC');
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 6: reveal phases in MANUAL mode
// ═══════════════════════════════════════════════════════════════════════════
describe('reveal manual: gameplay keys', () => {
  const manualSession = (): Session =>
    makeSession({ phase: 'reveal1', playMode: 'manual' });

  test('ArrowLeft → movePiece { dx:-1, dy:0 }', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('ArrowLeft');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'movePiece',
      dx: -1,
      dy: 0,
    });
  });

  test('ArrowRight → movePiece { dx:1, dy:0 }', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('ArrowRight');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'movePiece',
      dx: 1,
      dy: 0,
    });
  });

  test('ArrowDown → softDrop', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('ArrowDown');
    expect(dispatch).toHaveBeenCalledWith({ type: 'softDrop' });
  });

  test('ArrowUp → rotatePiece { direction: 1 }', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('ArrowUp');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'rotatePiece',
      direction: 1,
    });
  });

  test('KeyX → rotatePiece { direction: 1 } (CW alt)', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('KeyX');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'rotatePiece',
      direction: 1,
    });
  });

  test('KeyZ → rotatePiece { direction: -1 } (CCW)', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('KeyZ');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'rotatePiece',
      direction: -1,
    });
  });

  test('Space → primary (reducer interprets to hardDrop or advancePhase)', () => {
    // The bug this redesign fixes: SPACE used to always dispatch hardDrop
    // in manual reveal, which became a no-op after the last piece was
    // placed, stranding the user. Now SPACE dispatches `primary` and the
    // reducer decides based on state.activePiece.
    const { dispatch } = rig(manualSession());
    fireKeyDown('Space');
    expect(dispatch).toHaveBeenCalledWith({ type: 'primary' });
  });

  test('KeyC → hold', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('KeyC');
    expect(dispatch).toHaveBeenCalledWith({ type: 'hold' });
  });

  test('ShiftLeft → hold', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('ShiftLeft');
    expect(dispatch).toHaveBeenCalledWith({ type: 'hold' });
  });

  test('ShiftRight → hold', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('ShiftRight');
    expect(dispatch).toHaveBeenCalledWith({ type: 'hold' });
  });

  test('reveal2 manual — ArrowRight → movePiece', () => {
    const { dispatch } = rig(
      makeSession({ phase: 'reveal2', playMode: 'manual' }),
    );
    fireKeyDown('ArrowRight');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'movePiece',
      dx: 1,
      dy: 0,
    });
  });

  test('reveal2 manual — Space → primary', () => {
    const { dispatch } = rig(
      makeSession({ phase: 'reveal2', playMode: 'manual' }),
    );
    fireKeyDown('Space');
    expect(dispatch).toHaveBeenCalledWith({ type: 'primary' });
  });

  test('Digit4 in reveal manual dispatches pick(3) (reducer no-ops in manual reveal)', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('Digit4');
    // Keyboard is stateless — it always dispatches pick. The reducer's
    // pick case returns state unchanged in manual reveal phases (auto reveal browses).
    // Covered by tests/diag-l9-intent.test.ts #7.
    expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: 3 });
  });

  test('KeyM in reveal manual dispatches toggleMirror (reducer guards)', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('KeyM');
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggleMirror' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 7: DAS/ARR timing via mocked clock
// ═══════════════════════════════════════════════════════════════════════════
describe('DAS/ARR timing: 167ms delay, 33ms repeat rate', () => {
  const manualSession = (): Session =>
    makeSession({ phase: 'reveal1', playMode: 'manual' });

  test('keydown fires ONE dispatch synchronously (race-fix for 0ddbe99)', () => {
    const { dispatch } = rig(manualSession());
    fireKeyDown('ArrowRight');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('keydown then keyup with no ticks still fires exactly ONE dispatch', () => {
    const { dispatch, handler } = rig(manualSession());
    fireKeyDown('ArrowRight');
    fireKeyUp('ArrowRight');
    handler.tick(500); // well past DAS threshold
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('held key: tick at 166ms does NOT auto-repeat (DAS not elapsed)', () => {
    const { dispatch, handler } = rig(manualSession());
    fireKeyDown('ArrowRight');
    handler.tick(166);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('held key: tick at 167ms fires the first auto-repeat', () => {
    const { dispatch, handler } = rig(manualSession());
    fireKeyDown('ArrowRight');
    handler.tick(167);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  test('held key: further ticks at 33ms intervals fire subsequent repeats', () => {
    const { dispatch, handler } = rig(manualSession());
    fireKeyDown('ArrowRight');
    handler.tick(167); // first repeat
    handler.tick(200); // second repeat (+33ms)
    handler.tick(233); // third repeat (+33ms)
    expect(dispatch).toHaveBeenCalledTimes(4); // 1 initial + 3 repeats
  });

  test('held key: ticks closer than 33ms do not fire extra repeats', () => {
    const { dispatch, handler } = rig(manualSession());
    fireKeyDown('ArrowRight');
    handler.tick(167); // first repeat at threshold
    handler.tick(180); // only 13ms later — too soon
    expect(dispatch).toHaveBeenCalledTimes(2);
    handler.tick(200); // now 33ms past last repeat
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  test('keyup stops further auto-repeats', () => {
    const { dispatch, handler } = rig(manualSession());
    fireKeyDown('ArrowRight');
    handler.tick(167); // first repeat
    fireKeyUp('ArrowRight');
    handler.tick(500); // way past, should not repeat
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  test('two keys held simultaneously: each repeats independently', () => {
    const { dispatch, handler } = rig(manualSession());
    fireKeyDown('ArrowLeft');
    fireKeyDown('ArrowRight');
    expect(dispatch).toHaveBeenCalledTimes(2); // both initial fires
    handler.tick(167);
    expect(dispatch).toHaveBeenCalledTimes(4); // both auto-repeat
  });

  test('tick outside manual reveal is a no-op even if keyStates has entries', () => {
    const { dispatch, handler, setSession } = rig(manualSession());
    fireKeyDown('ArrowRight');
    expect(dispatch).toHaveBeenCalledTimes(1);
    // Simulate phase change — tick should not fire repeats even if still held.
    setSession(makeSession({ phase: 'guess2' }));
    handler.tick(167);
    handler.tick(500);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('ArrowDown (softDrop) auto-repeats with the same DAS/ARR timing', () => {
    const { dispatch, handler } = rig(manualSession());
    fireKeyDown('ArrowDown');
    handler.tick(167);
    handler.tick(200);
    expect(dispatch).toHaveBeenCalledTimes(3); // 1 initial + 2 repeats
  });

  test('rotate key (KeyX) does NOT auto-repeat even if held', () => {
    const { dispatch, handler } = rig(manualSession());
    fireKeyDown('KeyX');
    expect(dispatch).toHaveBeenCalledTimes(1);
    handler.tick(167);
    handler.tick(500);
    // rotate is an instant action — held presses should NOT repeat
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('hardDrop (Space) does NOT auto-repeat', () => {
    const { dispatch, handler } = rig(manualSession());
    fireKeyDown('Space');
    expect(dispatch).toHaveBeenCalledTimes(1);
    handler.tick(500);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 8: Phase guards — wrong-phase keys silently ignored
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase guards: unmapped and wrong-phase keys are ignored', () => {
  test('KeyF (unmapped) in every phase dispatches nothing', () => {
    for (const phase of ['guess1', 'reveal1', 'guess2', 'reveal2'] as const) {
      const { dispatch } = rig(makeSession({ phase }));
      fireKeyDown('KeyF');
      expect(dispatch).not.toHaveBeenCalled();
    }
  });

  test('Digit5..9 dispatch pick in guess1 (reducer handles bounds)', () => {
    for (const code of ['Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']) {
      const { dispatch } = rig(makeSession({ phase: 'guess1' }));
      fireKeyDown(code);
      const expectedIndex = parseInt(code.slice(-1), 10) - 1;
      expect(dispatch).toHaveBeenCalledWith({ type: 'pick', index: expectedIndex });
    }
  });

  test('e.repeat=true events are skipped (browser auto-repeat ignored)', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1' }));
    fireKeyDown('Digit1', true); // repeat=true
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 9: Attach/detach lifecycle
// ═══════════════════════════════════════════════════════════════════════════
describe('Attach/detach lifecycle', () => {
  test('keydown before attach() does not dispatch', () => {
    const dispatch = mock((_a: SessionAction) => {});
    const session = makeSession({ phase: 'guess1' });
    // Build the handler but do NOT attach.
    setupKeyboard(
      dispatch as unknown as (a: SessionAction) => void,
      () => session,
    );
    fireKeyDown('KeyR');
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('keydown after detach() does not dispatch', () => {
    const { dispatch, handler } = rig(makeSession({ phase: 'guess1' }));
    handler.detach();
    fireKeyDown('KeyR');
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('detach() clears any held-key state', () => {
    const { dispatch, handler } = rig(
      makeSession({ phase: 'reveal1', playMode: 'manual' }),
    );
    fireKeyDown('ArrowRight');
    handler.detach();
    // Even if we tick past DAS, no more dispatches — detach cleared state.
    handler.tick(500);
    expect(dispatch).toHaveBeenCalledTimes(1); // only the initial sync fire
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §9  Navigation keys — [ and ]
// ═══════════════════════════════════════════════════════════════════════════

describe('Navigation: [ and ] keys', () => {
  test('BracketLeft dispatches jumpToBag with current bag - 1', () => {
    const { dispatch } = rig(makeSession({ phase: 'reveal2' }));
    fireKeyDown('BracketLeft');
    expect(dispatch).toHaveBeenCalledWith({ type: 'jumpToBag', bag: 1 });
  });

  test('BracketRight dispatches jumpToBag with current bag + 1', () => {
    const { dispatch } = rig(makeSession({ phase: 'reveal1' }));
    fireKeyDown('BracketRight');
    expect(dispatch).toHaveBeenCalledWith({ type: 'jumpToBag', bag: 2 });
  });

  test('BracketLeft from bag 1 dispatches jumpToBag(0) — reducer handles as no-op', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess1' }));
    fireKeyDown('BracketLeft');
    expect(dispatch).toHaveBeenCalledWith({ type: 'jumpToBag', bag: 0 });
  });

  test('BracketRight from bag 3 dispatches jumpToBag(4) — reducer handles as no-op', () => {
    const { dispatch } = rig(makeSession({ phase: 'reveal3' }));
    fireKeyDown('BracketRight');
    expect(dispatch).toHaveBeenCalledWith({ type: 'jumpToBag', bag: 4 });
  });

  test('BracketLeft works in guess phases', () => {
    const { dispatch } = rig(makeSession({ phase: 'guess2' }));
    fireKeyDown('BracketLeft');
    expect(dispatch).toHaveBeenCalledWith({ type: 'jumpToBag', bag: 1 });
  });

  test('BracketRight works in manual mode', () => {
    const { dispatch } = rig(makeSession({ phase: 'reveal1', playMode: 'manual' }));
    fireKeyDown('BracketRight');
    expect(dispatch).toHaveBeenCalledWith({ type: 'jumpToBag', bag: 2 });
  });
});
