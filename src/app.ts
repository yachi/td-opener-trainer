/**
 * src/app.ts — L9 Session redesign entry point (Reframing A+).
 *
 * One state machine (Session), one renderer (renderSession), one keyboard
 * handler (setupKeyboard). No manual-play closure, no dirty-flag hack for
 * manual mode, no activePiece passed as a third renderer arg — activePiece
 * lives in Session and the renderer reads it directly.
 */

import {
  createSession,
  sessionReducer,
  type Session,
  type SessionAction,
} from './session.ts';
import { renderSession, renderWelcome } from './renderer/session.ts';
import { setupKeyboard } from './input/keyboard.ts';
import { CANVAS_W, CANVAS_H } from './renderer/board.ts';

// ── Welcome screen (shown once before first session) ──

let showWelcome = true;

// ── Canvas bootstrap ──

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Canvas element #game not found');
}
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Failed to get 2D rendering context');
}

// ── Session + dispatch ──

let session: Session = createSession();
let dirty = true;

function dispatch(action: SessionAction): void {
  if (showWelcome) {
    if (action.type === 'primary') {
      showWelcome = false;
      dirty = true;
    }
    return;
  }
  session = sessionReducer(session, action);
  dirty = true;
}

// Expose for debug inspection from the browser console.
(window as unknown as { __session: () => Session }).__session = () => session;

// ── Input ──

const keyboard = setupKeyboard(dispatch, () => session);
keyboard.attach();

// ── Render loop ──

function frame(now: number): void {
  // Drive DAS/ARR auto-repeat for held keys (no-op outside manual reveal).
  keyboard.tick(now);

  if (showWelcome) {
    renderWelcome(ctx!, now);
    requestAnimationFrame(frame);
    return;
  }
  if (dirty) {
    renderSession(ctx!, session);
    dirty = false;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
