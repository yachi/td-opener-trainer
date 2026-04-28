/**
 * src/input/keyboard.ts — dumb key→intent mapper for the L9 Session app.
 *
 * This module is INTENTIONALLY ignorant of phase/playMode decision-making.
 * It maps physical keys to either direct gameplay actions (movePiece,
 * rotatePiece, hold, softDrop — the Tetris gameplay inputs) or to
 * INTENT actions (`primary`, `pick`) that the reducer interprets based
 * on full Session state.
 *
 * The reducer — not keyboard.ts — decides what SPACE means in each phase.
 * This dissolves the bug class where keyboard.ts was a partial interpreter
 * of Session state and kept growing with every new phase variant.
 *
 * Key mapping (stateful decisions live in session.ts):
 *   SPACE, ENTER    → primary (reducer decides: submit? hardDrop? advance?)
 *   Digit 1..4      → pick(index) (reducer decides: setGuess? selectRoute?)
 *   M               → toggleMirror
 *   P               → togglePlayMode (only meaningful in reveal phases, but
 *                     the reducer no-ops elsewhere)
 *   R               → newSession
 *   ArrowLeft/Right → stepBackward/Forward in AUTO reveal,
 *                     movePiece(±1,0) in MANUAL reveal (DAS/ARR)
 *   ArrowDown       → softDrop (MANUAL only, DAS/ARR)
 *   ArrowUp, X      → rotatePiece(+1) (MANUAL only)
 *   Z               → rotatePiece(-1) (MANUAL only)
 *   C, Shift        → hold (MANUAL only)
 *
 * Directional and gameplay keys still need a phase/mode check because
 * DAS/ARR has to know whether to auto-repeat (only in manual reveal)
 * and because arrow keys have different semantics per mode. Those are
 * the ONLY remaining state-aware branches in this file.
 *
 * CRITICAL: DAS/ARR fires the initial dispatch SYNCHRONOUSLY on keydown.
 * Waiting for the next rAF tick creates a race with keyup (commit 0ddbe99).
 */

import { isRevealPhase, PHASE_META, type Session, type SessionAction } from '../session.ts';

// ── DAS/ARR timing (copied from deleted src/play/manual.ts) ──
const DAS_DELAY = 167; // ms before auto-repeat starts
const ARR_RATE = 33;   // ms between auto-repeat moves

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
    return isRevealPhase(session.phase) && session.playMode === 'manual';
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const session = getSession();
    const code = e.code;

    // ── Stateless key → action map (no phase/mode branching) ──
    //
    // These dispatches work the same in every phase. The reducer handles
    // any phase-specific interpretation.

    if (code === 'KeyR') {
      e.preventDefault();
      dispatch({ type: 'newSession' });
      return;
    }
    if (code === 'KeyM') {
      e.preventDefault();
      dispatch({ type: 'toggleMirror' });
      return;
    }
    if (code === 'KeyP') {
      e.preventDefault();
      dispatch({ type: 'togglePlayMode' });
      return;
    }
    if (code === 'KeyD') {
      e.preventDefault();
      dispatch({ type: 'resetDpcHold' });
      return;
    }
    if (code === 'Space' || code === 'Enter') {
      e.preventDefault();
      dispatch({ type: 'primary' });
      return;
    }
    if (code === 'BracketLeft') {
      e.preventDefault();
      const currentBag = PHASE_META[session.phase].bag;
      dispatch({ type: 'jumpToBag', bag: (currentBag - 1) as 1 | 2 | 3 | 4 | 5 });
      return;
    }
    if (code === 'BracketRight') {
      e.preventDefault();
      const currentBag = PHASE_META[session.phase].bag;
      dispatch({ type: 'jumpToBag', bag: (currentBag + 1) as 1 | 2 | 3 | 4 | 5 });
      return;
    }
    if (
      code === 'Digit1' ||
      code === 'Digit2' ||
      code === 'Digit3' ||
      code === 'Digit4' ||
      code === 'Digit5' ||
      code === 'Digit6' ||
      code === 'Digit7' ||
      code === 'Digit8' ||
      code === 'Digit9'
    ) {
      e.preventDefault();
      const index = parseInt(code.slice(-1), 10) - 1;
      dispatch({ type: 'pick', index });
      return;
    }

    // ── Directional + gameplay keys (state-aware because semantics differ
    //    between auto and manual reveal modes) ──

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
      if (code === 'KeyC' || code === 'ShiftLeft' || code === 'ShiftRight') {
        e.preventDefault();
        dispatch({ type: 'hold' });
        return;
      }
      return;
    }

    // ── Auto reveal: arrow keys step through cachedSteps ──
    if (isRevealPhase(session.phase)) {
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
