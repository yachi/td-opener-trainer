// DAS/ARR keyboard input handler for drill mode

const DAS_DELAY = 167; // ms before auto-repeat starts
const ARR_RATE = 33;   // ms between auto-repeat moves

export interface DrillInputHandler {
  update(now: number): string[];  // returns list of actions to dispatch
  destroy(): void;                // cleanup event listeners
}

// Keys that auto-repeat (DAS/ARR)
const REPEAT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown']);

// Instant actions (fire once on keydown, no repeat)
const INSTANT_MAP: Record<string, string> = {
  ArrowUp: 'rotate_cw',
  KeyX: 'rotate_cw',
  KeyZ: 'rotate_ccw',
  Space: 'hard_drop',
  KeyC: 'hold',
  Digit1: 'select_1',
  Digit2: 'select_2',
  Digit3: 'select_3',
  Digit4: 'select_4',
  KeyR: 'retry',
  Enter: 'confirm',
};

const REPEAT_ACTION_MAP: Record<string, string> = {
  ArrowLeft: 'move_left',
  ArrowRight: 'move_right',
  ArrowDown: 'soft_drop',
};

interface KeyState {
  pressed: boolean;
  downAt: number;      // timestamp of keydown
  lastRepeatAt: number; // timestamp of last repeat emit
  firedInitial: boolean; // whether the initial press action was emitted
}

export function setupDrillInput(): DrillInputHandler {
  const keyStates = new Map<string, KeyState>();
  const pendingInstant: string[] = []; // instant actions queued on keydown

  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;

    const code = e.code;

    // Handle instant actions
    const instantAction = INSTANT_MAP[code];
    if (instantAction) {
      e.preventDefault();
      pendingInstant.push(instantAction);
      return;
    }

    // Handle repeat keys
    if (REPEAT_KEYS.has(code)) {
      e.preventDefault();
      const now = performance.now();
      keyStates.set(code, {
        pressed: true,
        downAt: now,
        lastRepeatAt: now,
        firedInitial: false,
      });
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    const code = e.code;
    if (REPEAT_KEYS.has(code)) {
      const state = keyStates.get(code);
      if (state) {
        state.pressed = false;
      }
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return {
    update(now: number): string[] {
      const actions: string[] = [];

      // Drain instant actions
      while (pendingInstant.length > 0) {
        actions.push(pendingInstant.shift()!);
      }

      // Process DAS/ARR for held keys
      for (const [code, state] of keyStates) {
        if (!state.pressed) continue;

        const action = REPEAT_ACTION_MAP[code];
        if (!action) continue;

        if (!state.firedInitial) {
          // Fire initial press immediately
          actions.push(action);
          state.firedInitial = true;
          state.lastRepeatAt = now;
          continue;
        }

        const elapsed = now - state.downAt;
        if (elapsed < DAS_DELAY) continue; // Still in DAS delay

        // ARR: emit at ARR_RATE intervals
        const timeSinceLastRepeat = now - state.lastRepeatAt;
        if (timeSinceLastRepeat >= ARR_RATE) {
          // Emit one move per ARR interval (don't batch multiples to avoid skipping)
          actions.push(action);
          state.lastRepeatAt = now;
        }
      }

      return actions;
    },

    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
  };
}
