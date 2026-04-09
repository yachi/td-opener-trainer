/**
 * src/input/keyboard.ts — Unified keyboard handler for the L9 Session app.
 *
 * One function: `setupKeyboard(dispatch, getSession)`. It dispatches
 * `SessionAction`s directly into the reducer based on the current phase.
 *
 * Key routing by phase:
 *   guess1     → 1..4 pick opener, M mirror, ENTER submit, SPACE skip,
 *                R newSession
 *   reveal1/2  → ← step back, → step forward, SPACE advance phase,
 *                P togglePlayMode, R newSession
 *                (but when playMode === 'manual', arrow keys / X / Z / C /
 *                Space are left alone so play/manual.ts can intercept
 *                them via its own global listener)
 *   guess2     → 1..4 selectRoute, SPACE skip, R newSession
 *   any phase  → R newSession
 */

import type { OpenerID } from '../openers/types.ts';
import type { Session, SessionAction } from '../session.ts';

const OPENER_BY_DIGIT: Record<number, OpenerID> = {
  1: 'stray_cannon',
  2: 'honey_cup',
  3: 'gamushiro',
  4: 'ms2',
};

export function setupKeyboard(
  dispatch: (action: SessionAction) => void,
  getSession: () => Session,
): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const session = getSession();
    const code = e.code;

    // Global: R always starts a fresh session.
    if (code === 'KeyR') {
      e.preventDefault();
      dispatch({ type: 'newSession' });
      return;
    }

    // During reveal phases in manual play mode, let play/manual.ts handle
    // gameplay keys. The ONLY keys this handler still owns in that mode
    // are P (togglePlayMode) and R (handled above).
    const isRevealManual =
      (session.phase === 'reveal1' || session.phase === 'reveal2') &&
      session.playMode === 'manual';

    if (code === 'KeyP') {
      e.preventDefault();
      dispatch({ type: 'togglePlayMode' });
      return;
    }

    if (isRevealManual) {
      // Do NOT intercept ArrowLeft/Right/Down/Up, Space, KeyX/Y/Z, KeyC —
      // play/manual.ts owns gameplay input in this mode.
      return;
    }

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

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
