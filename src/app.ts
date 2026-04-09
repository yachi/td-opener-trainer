/**
 * src/app.ts — L9 Session redesign entry point.
 *
 * One state machine (Session), one renderer (renderSession), one keyboard
 * handler (setupKeyboard), plus an optional manual-play input handler for
 * reveal phases. No modes, no localStorage, no prevAppMode shadow state.
 *
 * Replaces the 866-LOC mode-routing entry from the pre-L9 architecture.
 */

import {
  createSession,
  sessionReducer,
  type Session,
  type SessionAction,
} from './session.ts';
import { renderSession } from './renderer/session.ts';
import { setupKeyboard } from './input/keyboard.ts';
import { createManualPlayHandler } from './play/manual.ts';
import { CANVAS_W, CANVAS_H } from './renderer/board.ts';

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
  session = sessionReducer(session, action);
  dirty = true;
}

// Expose for debug inspection from the browser console.
(window as unknown as { __session: () => Session }).__session = () => session;

// ── Input handlers ──

setupKeyboard(dispatch, () => session);

const manual = createManualPlayHandler(dispatch, () => session);
manual.attach();

// ── Render loop ──

function frame(now: number): void {
  // Drive manual-play DAS/ARR every frame. The handler internally checks
  // phase/playMode and no-ops when not in a manual reveal.
  manual.tick(now);

  // In manual reveal, the active piece moves without the Session dispatching,
  // so we must redraw every frame to show movement/rotation/ghost updates.
  const isManualReveal =
    (session.phase === 'reveal1' || session.phase === 'reveal2') &&
    session.playMode === 'manual';

  if (dirty || isManualReveal) {
    renderSession(ctx!, session, manual.getActivePiece());
    dirty = false;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
