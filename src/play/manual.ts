/**
 * src/play/manual.ts — Manual-play input handler for the L9 Session redesign.
 *
 * Refactored from src/modes/drill.ts: extracts ONLY the input-handling and
 * piece-locking logic, drops all drill-specific state (mastery, phases,
 * targets, success/fail UI). The output is a tiny handler that:
 *
 *   1. Reads the current Session on every keyboard event.
 *   2. Maintains a local active piece + DAS/ARR timers + holdUsed flag.
 *   3. On hard-drop, dispatches a `pieceDrop` action with the locked cells.
 *
 * The reducer in src/session.ts is the single source of truth for the locked
 * board, the queue, and the step counter. This handler ONLY tracks the
 * in-flight active piece (rotation/position) — local UI state that the
 * reducer doesn't need to know about until the piece locks.
 *
 * Reuses DAS/ARR constants and key-mapping pattern from src/input/drill-keyboard.ts
 * (DAS_DELAY=167ms, ARR_RATE=33ms). Reuses src/core/srs.ts for piece movement,
 * rotation, and hard-drop.
 */

import type { PieceType } from '../core/types';
import {
  spawnPiece,
  tryMove,
  tryRotate,
  hardDrop,
  getPieceCells,
  type ActivePiece,
  type Board,
} from '../core/srs';
import type { Session, SessionAction } from '../session';

// ── DAS/ARR timing — copied from src/input/drill-keyboard.ts ──

const DAS_DELAY = 167; // ms before auto-repeat starts
const ARR_RATE = 33;   // ms between auto-repeat moves

// Keys that auto-repeat (DAS/ARR).
const REPEAT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown']);

// Instant actions (fire once on keydown, no repeat).
type InstantAction =
  | 'rotate_cw'
  | 'rotate_ccw'
  | 'hard_drop'
  | 'hold';

const INSTANT_MAP: Record<string, InstantAction> = {
  ArrowUp: 'rotate_cw',
  KeyX: 'rotate_cw',
  KeyZ: 'rotate_ccw',
  Space: 'hard_drop',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
};

type RepeatAction = 'move_left' | 'move_right' | 'soft_drop';

const REPEAT_ACTION_MAP: Record<string, RepeatAction> = {
  ArrowLeft: 'move_left',
  ArrowRight: 'move_right',
  ArrowDown: 'soft_drop',
};

interface KeyState {
  pressed: boolean;
  downAt: number;
  lastRepeatAt: number;
  firedInitial: boolean;
}

// ── Public handle ──

export interface ManualPlayHandler {
  /** Attach window keyboard listeners. */
  attach(): void;
  /** Remove keyboard listeners. */
  detach(): void;
  /** Drive DAS/ARR repeats — call from the render loop with `performance.now()`. */
  tick(now: number): void;
  /** Reset local in-flight state (e.g., when the session phase changes). */
  reset(): void;
  /** The current in-flight active piece (for renderer ghost overlay). */
  getActivePiece(): ActivePiece | null;
}

/**
 * Create a manual-play input handler bound to a Session dispatcher.
 *
 * @param dispatch  Session reducer dispatcher (from src/session.ts).
 * @param getSession Returns the current Session snapshot.
 */
export function createManualPlayHandler(
  dispatch: (action: SessionAction) => void,
  getSession: () => Session,
): ManualPlayHandler {
  // Local in-flight state — recomputed when the reducer step advances.
  let activePiece: ActivePiece | null = null;
  let lastStepIndex = -1;
  let lastPhase: Session['phase'] | null = null;
  let holdUsed = false;
  let internalHoldPiece: PieceType | null = null;

  const keyStates = new Map<string, KeyState>();
  const pendingInstant: InstantAction[] = [];

  // ── Active-piece sync ──

  /**
   * The Session reducer owns the queue (via cachedSteps[step].piece). This
   * helper rehydrates the local active piece whenever the step changes.
   */
  function syncActivePiece(): void {
    const session = getSession();
    const isReveal =
      session.phase === 'reveal1' || session.phase === 'reveal2';
    if (!isReveal || session.playMode !== 'manual') {
      activePiece = null;
      lastStepIndex = -1;
      lastPhase = session.phase;
      return;
    }

    // Reset on phase transition.
    if (lastPhase !== session.phase) {
      holdUsed = false;
      internalHoldPiece = null;
      lastPhase = session.phase;
    }

    // Spawn next piece when the reducer advanced step (or first frame).
    if (session.step !== lastStepIndex) {
      const step = session.cachedSteps[session.step];
      if (step) {
        activePiece = spawnPiece(step.piece);
        holdUsed = false;
      } else {
        activePiece = null;
      }
      lastStepIndex = session.step;
    }
  }

  // ── Keyboard handlers ──

  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const code = e.code;

    // Only intercept gameplay keys when in a manual-reveal phase. Otherwise
    // let the global session keyboard handler take them (1/2/3/4, M, ENTER…).
    const session = getSession();
    const isManualReveal =
      (session.phase === 'reveal1' || session.phase === 'reveal2') &&
      session.playMode === 'manual';
    if (!isManualReveal) return;

    const instant = INSTANT_MAP[code];
    if (instant) {
      e.preventDefault();
      pendingInstant.push(instant);
      return;
    }

    if (REPEAT_KEYS.has(code)) {
      e.preventDefault();
      const now = performance.now();
      // Fire the initial move IMMEDIATELY on keydown so quick taps always
      // register — without this, a fast keyup before the next rAF tick would
      // flip pressed=false and the initial move would be lost.
      const action = REPEAT_ACTION_MAP[code];
      if (action) {
        syncActivePiece();
        processRepeat(action, getSession().board);
      }
      keyStates.set(code, {
        pressed: true,
        downAt: now,
        lastRepeatAt: now,
        firedInitial: true,
      });
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    const code = e.code;
    if (REPEAT_KEYS.has(code)) {
      const state = keyStates.get(code);
      if (state) state.pressed = false;
    }
  }

  // ── Action processing ──

  function processInstant(action: InstantAction): void {
    syncActivePiece();
    if (!activePiece) return;
    const session = getSession();
    const board = session.board;

    switch (action) {
      case 'rotate_cw': {
        const next = tryRotate(board, activePiece, 1);
        if (next) activePiece = next;
        return;
      }
      case 'rotate_ccw': {
        const next = tryRotate(board, activePiece, -1);
        if (next) activePiece = next;
        return;
      }
      case 'hard_drop': {
        const dropped = hardDrop(board, activePiece);
        const cells = getPieceCells(dropped);
        // Send the drop to the reducer. The reducer validates against the
        // expected step and either accepts (advances step) or rejects (no-op).
        dispatch({
          type: 'pieceDrop',
          piece: dropped.type,
          cells,
        });
        // Re-sync local piece — if accepted, step changed and syncActivePiece
        // will spawn the next one. If rejected, lastStepIndex still matches
        // and we keep the current piece (user retries).
        syncActivePiece();
        return;
      }
      case 'hold': {
        handleHold();
        return;
      }
    }
  }

  function processRepeat(action: RepeatAction, board: Board): void {
    if (!activePiece) return;
    switch (action) {
      case 'move_left': {
        const next = tryMove(board, activePiece, -1, 0);
        if (next) activePiece = next;
        return;
      }
      case 'move_right': {
        const next = tryMove(board, activePiece, 1, 0);
        if (next) activePiece = next;
        return;
      }
      case 'soft_drop': {
        const next = tryMove(board, activePiece, 0, 1);
        if (next) activePiece = next;
        return;
      }
    }
  }

  /**
   * Local hold logic. The Session reducer doesn't model hold — the queue is
   * fixed by cachedSteps. We allow the user to swap the current active piece
   * with a held piece purely as a UX convenience. If the swap doesn't yield
   * a piece type that matches the next expected step, the user's eventual
   * hard-drop will be rejected by the reducer (no harm done).
   *
   * Resolved default: hold is a one-shot per step (matches drill convention).
   */
  function handleHold(): void {
    if (!activePiece || holdUsed) return;
    const currentType = activePiece.type;
    if (internalHoldPiece === null) {
      internalHoldPiece = currentType;
      // No "next from queue" — the next piece is whatever the reducer says.
      // Pull cachedSteps[step + 1] as a preview if available; otherwise the
      // user hits hard_drop on the empty held piece, which is rejected.
      const session = getSession();
      const nextStep = session.cachedSteps[session.step + 1];
      if (nextStep) {
        activePiece = spawnPiece(nextStep.piece);
      } else {
        activePiece = null;
      }
    } else {
      // Swap current with hold.
      const swapType = internalHoldPiece;
      internalHoldPiece = currentType;
      activePiece = spawnPiece(swapType);
    }
    holdUsed = true;
  }

  // ── Public methods ──

  return {
    attach(): void {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      syncActivePiece();
    },

    detach(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      keyStates.clear();
      pendingInstant.length = 0;
    },

    tick(now: number): void {
      // Keep local active piece in sync with reducer state on every frame —
      // the reducer might be advanced by other handlers (auto-mode toggle,
      // newSession, etc.).
      syncActivePiece();

      const session = getSession();
      const isManualReveal =
        (session.phase === 'reveal1' || session.phase === 'reveal2') &&
        session.playMode === 'manual';

      // Drain instant queue regardless of phase (they were captured while
      // we were in manual reveal — process them, but skip if no piece).
      while (pendingInstant.length > 0) {
        const a = pendingInstant.shift()!;
        if (isManualReveal) processInstant(a);
      }

      if (!isManualReveal) return;

      const board = session.board;

      // Process DAS/ARR for held keys.
      for (const [code, state] of keyStates) {
        if (!state.pressed) continue;
        const action = REPEAT_ACTION_MAP[code];
        if (!action) continue;

        if (!state.firedInitial) {
          processRepeat(action, board);
          state.firedInitial = true;
          state.lastRepeatAt = now;
          continue;
        }

        const elapsed = now - state.downAt;
        if (elapsed < DAS_DELAY) continue;

        const sinceLast = now - state.lastRepeatAt;
        if (sinceLast >= ARR_RATE) {
          processRepeat(action, board);
          state.lastRepeatAt = now;
        }
      }
    },

    reset(): void {
      activePiece = null;
      lastStepIndex = -1;
      lastPhase = null;
      holdUsed = false;
      internalHoldPiece = null;
      keyStates.clear();
      pendingInstant.length = 0;
    },

    getActivePiece(): ActivePiece | null {
      return activePiece;
    },
  };
}
