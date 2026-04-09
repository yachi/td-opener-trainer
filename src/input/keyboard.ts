/**
 * src/input/keyboard.ts — Unified keyboard handler for the L9 Session app.
 *
 * Post-Reframing A+: this module is the ONLY place input state lives. Game
 * state (activePiece, holdPiece, holdUsed) is in Session; DAS/ARR timers
 * live HERE because they're fundamentally a stateful-input concern driven
 * by wall-clock time, not game logic.
 *
 * setupKeyboard(dispatch, getSession) returns { attach, detach, tick(now) }.
 *
 * Key routing by phase:
 *   guess1     → 1..4 pick opener, M mirror, ENTER/SPACE submit (or skip),
 *                R newSession
 *   guess2     → 1..4 selectRoute, SPACE newSession, R newSession
 *   reveal auto → ←→ stepBackward/Forward, SPACE advancePhase,
 *                 P togglePlayMode, R newSession
 *   reveal manual → ←→ movePiece(±1,0) with DAS/ARR, ↓ softDrop with DAS/ARR,
 *                   ↑/X rotatePiece(+1), Z rotatePiece(-1),
 *                   SPACE hardDrop, C/Shift hold, P togglePlayMode, R newSession
 *
 * CRITICAL: DAS/ARR must fire the initial dispatch SYNCHRONOUSLY on keydown.
 * Waiting for the next rAF tick creates a race with keyup (commit 0ddbe99
 * fixed this in the old manual.ts; preserved here).
 */

import type { OpenerID } from '../openers/types.ts';
import type { Session, SessionAction } from '../session.ts';

// ── DAS/ARR timing (copied from deleted src/play/manual.ts) ──
const DAS_DELAY = 167; // ms before auto-repeat starts
const ARR_RATE = 33;   // ms between auto-repeat moves

const OPENER_BY_DIGIT: Record<number, OpenerID> = {
  1: 'stray_cannon',
  2: 'honey_cup',
  3: 'gamushiro',
  4: 'ms2',
};

// Keys that auto-repeat in manual reveal (DAS/ARR).
const REPEAT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown']);

/**
 * Returns the SessionAction to dispatch for a repeat key in manual mode.
 * Pure function — used both by the initial-fire path (keydown) and the
 * auto-repeat path (tick).
 */
function actionForRepeatKey(code: string): SessionAction | null {
  if (code === 'ArrowLeft') return { type: 'movePiece', dx: -1, dy: 0 };
  if (code === 'ArrowRight') return { type: 'movePiece', dx: 1, dy: 0 };
  if (code === 'ArrowDown') return { type: 'softDrop' };
  return null;
}

interface KeyState {
  downAt: number;
  lastRepeatAt: number;
  pressed: boolean;
}

export interface KeyboardHandler {
  attach(): void;
  detach(): void;
  /** Drive DAS/ARR auto-repeat — call from the render loop with performance.now(). */
  tick(now: number): void;
}

export function setupKeyboard(
  dispatch: (action: SessionAction) => void,
  getSession: () => Session,
): KeyboardHandler {
  const keyStates = new Map<string, KeyState>();

  function isManualReveal(session: Session): boolean {
    return (
      (session.phase === 'reveal1' || session.phase === 'reveal2') &&
      session.playMode === 'manual'
    );
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const session = getSession();
    const code = e.code;

    // ── Global: R always starts a fresh session ──
    if (code === 'KeyR') {
      e.preventDefault();
      dispatch({ type: 'newSession' });
      return;
    }

    // ── Global: P toggles playMode (except in guess phases where it's noise) ──
    if (code === 'KeyP') {
      if (session.phase === 'reveal1' || session.phase === 'reveal2') {
        e.preventDefault();
        dispatch({ type: 'togglePlayMode' });
      }
      return;
    }

    // ── Manual reveal: gameplay keys ──
    if (isManualReveal(session)) {
      const repeatAction = actionForRepeatKey(code);
      if (repeatAction) {
        e.preventDefault();
        // Fire the initial move SYNCHRONOUSLY (not on next tick) to prevent
        // the race condition where keyup clears pressed before tick runs.
        dispatch(repeatAction);
        const now = performance.now();
        keyStates.set(code, { downAt: now, lastRepeatAt: now, pressed: true });
        return;
      }

      if (code === 'ArrowUp' || code === 'KeyX') {
        e.preventDefault();
        dispatch({ type: 'rotatePiece', direction: 1 });
        return;
      }
      if (code === 'KeyZ') {
        e.preventDefault();
        dispatch({ type: 'rotatePiece', direction: -1 });
        return;
      }
      if (code === 'Space') {
        e.preventDefault();
        dispatch({ type: 'hardDrop' });
        return;
      }
      if (code === 'KeyC' || code === 'ShiftLeft' || code === 'ShiftRight') {
        e.preventDefault();
        dispatch({ type: 'hold' });
        return;
      }
      return;
    }

    // ── Session-level keys by phase ──
    switch (session.phase) {
      case 'guess1': {
        if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
          e.preventDefault();
          const digit = parseInt(code.slice(-1), 10);
          const opener = OPENER_BY_DIGIT[digit];
          if (!opener) return;
          const mirror = session.guess?.mirror ?? false;
          dispatch({ type: 'setGuess', opener, mirror });
          return;
        }
        if (code === 'KeyM') {
          e.preventDefault();
          dispatch({ type: 'toggleMirror' });
          return;
        }
        if (code === 'Enter') {
          e.preventDefault();
          if (session.guess !== null) dispatch({ type: 'submitGuess' });
          return;
        }
        if (code === 'Space') {
          e.preventDefault();
          if (session.guess !== null) {
            dispatch({ type: 'submitGuess' });
          } else {
            dispatch({ type: 'newSession' });
          }
          return;
        }
        return;
      }

      case 'reveal1':
      case 'reveal2': {
        // Auto mode (manual is handled above).
        if (code === 'ArrowLeft') {
          e.preventDefault();
          dispatch({ type: 'stepBackward' });
          return;
        }
        if (code === 'ArrowRight') {
          e.preventDefault();
          dispatch({ type: 'stepForward' });
          return;
        }
        if (code === 'Space') {
          e.preventDefault();
          dispatch({ type: 'advancePhase' });
          return;
        }
        return;
      }

      case 'guess2': {
        if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
          e.preventDefault();
          const idx = parseInt(code.slice(-1), 10) - 1;
          dispatch({ type: 'selectRoute', routeIndex: idx });
          return;
        }
        if (code === 'Space') {
          e.preventDefault();
          dispatch({ type: 'newSession' });
          return;
        }
        return;
      }
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    const code = e.code;
    if (REPEAT_KEYS.has(code)) {
      const state = keyStates.get(code);
      if (state) state.pressed = false;
    }
  }

  function tick(now: number): void {
    const session = getSession();
    if (!isManualReveal(session)) {
      // Clear any leftover key state if we exited manual reveal.
      if (keyStates.size > 0) keyStates.clear();
      return;
    }
    for (const [code, state] of keyStates) {
      if (!state.pressed) continue;
      const elapsed = now - state.downAt;
      if (elapsed < DAS_DELAY) continue;
      const sinceLast = now - state.lastRepeatAt;
      if (sinceLast >= ARR_RATE) {
        const action = actionForRepeatKey(code);
        if (action) dispatch(action);
        state.lastRepeatAt = now;
      }
    }
  }

  return {
    attach(): void {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
    },
    detach(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      keyStates.clear();
    },
    tick,
  };
}
