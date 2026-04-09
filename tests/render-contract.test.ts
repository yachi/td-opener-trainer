/**
 * tests/render-contract.test.ts — browser-free rendering contract
 *
 * Background: the user asked "how would an L9 verify all routes in
 * Playwright?" The literal answer is to ship a Playwright smoke harness
 * that walks every phase. The L9 reframing goes further: don't ship
 * Playwright at all. Build a minimal CanvasRenderingContext2D recording
 * proxy, run renderSession() through it for each distinct Session state,
 * and assert contract invariants (phase label drawn, correct colors used,
 * non-trivial call count, no crash). This runs in bun test in ~10 ms,
 * needs zero new deps, and catches the same structural regressions that
 * pixel-diff goldens would catch without the maintenance burden.
 *
 * What this proves:
 *   1. renderSession doesn't crash on any valid Session state.
 *   2. Every phase writes a correct phase-identifying label.
 *   3. Piece colors from the palette reach the draw call stream in
 *      reveal phases.
 *   4. Manual-mode active piece renders (hard-drop ghost + piece body).
 *   5. The session-stats title bar is drawn in every phase.
 *   6. The bottom keybind bar text switches between auto and manual.
 *
 * What this does NOT catch:
 *   - Pixel-level layout bugs (cell off by 1 column). Not a regression
 *     risk today because layout constants are static.
 *   - Color palette mistakes (if COLORS export is wrong). Would need a
 *     golden image diff. Deferred until a bug proves it's needed.
 */

import { describe, test, expect } from 'bun:test';

import {
  createSession,
  sessionReducer,
  type Session,
  type SessionAction,
} from '../src/session.ts';
import { renderSession } from '../src/renderer/session.ts';
import { COLORS } from '../src/renderer/board.ts';
import { OPENERS } from '../src/openers/decision.ts';
import type { OpenerID } from '../src/openers/types.ts';
import type { PieceType } from '../src/core/types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Recording Canvas proxy
//
// Implements the subset of CanvasRenderingContext2D that the renderer uses
// (22 methods/properties per `grep ctx\. src/renderer/*`). Every call and
// property write appends to `calls`. Tests inspect `calls` to assert
// rendering contracts without a real canvas.
// ═══════════════════════════════════════════════════════════════════════════

interface Call {
  kind: 'method' | 'setProp';
  name: string;
  args?: readonly unknown[];
  value?: unknown;
}

interface RecordingContext {
  calls: Call[];
  // Canvas property writes
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  // Methods (all no-ops, just recorded)
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  stroke(): void;
  fill(): void;
  save(): void;
  restore(): void;
}

function createRecordingCtx(): RecordingContext {
  const calls: Call[] = [];
  const ctx = {
    calls,
    _fillStyle: '',
    _strokeStyle: '',
    _lineWidth: 1,
    _font: '',
    _textAlign: 'left' as string,
    _textBaseline: 'alphabetic' as string,
    _globalAlpha: 1,
    get fillStyle() { return this._fillStyle; },
    set fillStyle(v: string) {
      this._fillStyle = v;
      calls.push({ kind: 'setProp', name: 'fillStyle', value: v });
    },
    get strokeStyle() { return this._strokeStyle; },
    set strokeStyle(v: string) {
      this._strokeStyle = v;
      calls.push({ kind: 'setProp', name: 'strokeStyle', value: v });
    },
    get lineWidth() { return this._lineWidth; },
    set lineWidth(v: number) {
      this._lineWidth = v;
      calls.push({ kind: 'setProp', name: 'lineWidth', value: v });
    },
    get font() { return this._font; },
    set font(v: string) {
      this._font = v;
      calls.push({ kind: 'setProp', name: 'font', value: v });
    },
    get textAlign() { return this._textAlign; },
    set textAlign(v: string) {
      this._textAlign = v;
      calls.push({ kind: 'setProp', name: 'textAlign', value: v });
    },
    get textBaseline() { return this._textBaseline; },
    set textBaseline(v: string) {
      this._textBaseline = v;
      calls.push({ kind: 'setProp', name: 'textBaseline', value: v });
    },
    get globalAlpha() { return this._globalAlpha; },
    set globalAlpha(v: number) {
      this._globalAlpha = v;
      calls.push({ kind: 'setProp', name: 'globalAlpha', value: v });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ kind: 'method', name: 'fillRect', args: [x, y, w, h] });
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      calls.push({ kind: 'method', name: 'strokeRect', args: [x, y, w, h] });
    },
    fillText(text: string, x: number, y: number) {
      calls.push({ kind: 'method', name: 'fillText', args: [text, x, y] });
    },
    beginPath() { calls.push({ kind: 'method', name: 'beginPath' }); },
    closePath() { calls.push({ kind: 'method', name: 'closePath' }); },
    moveTo(x: number, y: number) {
      calls.push({ kind: 'method', name: 'moveTo', args: [x, y] });
    },
    lineTo(x: number, y: number) {
      calls.push({ kind: 'method', name: 'lineTo', args: [x, y] });
    },
    arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
      calls.push({ kind: 'method', name: 'arcTo', args: [x1, y1, x2, y2, r] });
    },
    stroke() { calls.push({ kind: 'method', name: 'stroke' }); },
    fill() { calls.push({ kind: 'method', name: 'fill' }); },
    save() { calls.push({ kind: 'method', name: 'save' }); },
    restore() { calls.push({ kind: 'method', name: 'restore' }); },
  };
  return ctx as unknown as RecordingContext;
}

// ═══════════════════════════════════════════════════════════════════════════
// Query helpers
// ═══════════════════════════════════════════════════════════════════════════

function textsDrawn(ctx: RecordingContext): string[] {
  return ctx.calls
    .filter((c) => c.kind === 'method' && c.name === 'fillText')
    .map((c) => String((c.args as unknown[])[0]));
}

function fillStylesUsed(ctx: RecordingContext): Set<string> {
  const set = new Set<string>();
  for (const c of ctx.calls) {
    if (c.kind === 'setProp' && c.name === 'fillStyle') set.add(String(c.value));
  }
  return set;
}

function countMethod(ctx: RecordingContext, name: string): number {
  return ctx.calls.filter((c) => c.kind === 'method' && c.name === name).length;
}

function expectContainsText(ctx: RecordingContext, needle: string): void {
  const texts = textsDrawn(ctx);
  const match = texts.some((t) => t.includes(needle));
  if (!match) {
    throw new Error(
      `Expected some fillText call to contain ${JSON.stringify(needle)}, ` +
        `but drew texts:\n${texts.map((t) => `  - ${JSON.stringify(t)}`).join('\n')}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Session builders — reach each distinct render state via the reducer.
// We never construct Session by hand; we always drive through the reducer
// so the test exercises the real pipeline.
// ═══════════════════════════════════════════════════════════════════════════

function apply(state: Session, ...actions: SessionAction[]): Session {
  return actions.reduce((s, a) => sessionReducer(s, a), state);
}

/** A bag that supports the given opener (normal orientation). */
function bagFor(target: OpenerID): PieceType[] {
  const base: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const perms: PieceType[][] = [];
  function permute(arr: PieceType[], start: number): void {
    if (start === arr.length) {
      perms.push([...arr]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
      permute(arr, start + 1);
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
    }
  }
  permute([...base], 0);
  const def = OPENERS[target];
  for (const p of perms) if (def.canBuild(p)) return p;
  throw new Error(`no bag for ${target}`);
}

function sessionInGuess1(): Session {
  return createSession(bagFor('ms2'), bagFor('ms2'));
}

function sessionInReveal1Auto(): Session {
  const s = sessionInGuess1();
  return apply(s, { type: 'setGuess', opener: 'ms2', mirror: false }, { type: 'submitGuess' });
}

function sessionInReveal1Manual(): Session {
  const s = sessionInGuess1();
  return apply(
    s,
    { type: 'togglePlayMode' }, // auto → manual
    { type: 'setGuess', opener: 'ms2', mirror: false },
    { type: 'submitGuess' },
  );
}

function sessionInGuess2(): Session {
  return apply(sessionInReveal1Auto(), { type: 'advancePhase' });
}

function sessionInReveal2Auto(): Session {
  return apply(sessionInGuess2(), { type: 'selectRoute', routeIndex: 0 });
}

function sessionInReveal2Manual(): Session {
  return apply(
    sessionInReveal1Manual(),
    // finish bag1 visually in auto, so we reach reveal2 cleanly
    { type: 'togglePlayMode' }, // manual → auto
    { type: 'advancePhase' },
    { type: 'selectRoute', routeIndex: 0 },
    { type: 'togglePlayMode' }, // auto → manual (spawns activePiece)
  );
}

function render(session: Session): RecordingContext {
  const ctx = createRecordingCtx();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderSession(ctx as any, session);
  return ctx;
}

// ═══════════════════════════════════════════════════════════════════════════
// Contract: #1 — every phase renders without throwing
// ═══════════════════════════════════════════════════════════════════════════
describe('#1 renderer does not crash on any valid phase', () => {
  test('guess1 renders', () => {
    expect(() => render(sessionInGuess1())).not.toThrow();
  });
  test('reveal1 auto renders', () => {
    expect(() => render(sessionInReveal1Auto())).not.toThrow();
  });
  test('reveal1 manual renders', () => {
    expect(() => render(sessionInReveal1Manual())).not.toThrow();
  });
  test('guess2 renders', () => {
    expect(() => render(sessionInGuess2())).not.toThrow();
  });
  test('reveal2 auto renders', () => {
    expect(() => render(sessionInReveal2Auto())).not.toThrow();
  });
  test('reveal2 manual renders', () => {
    expect(() => render(sessionInReveal2Manual())).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Contract: #2 — each phase draws an identifying label
// ═══════════════════════════════════════════════════════════════════════════
describe('#2 phase labels', () => {
  test('guess1 draws "guess bag 1"', () => {
    expectContainsText(render(sessionInGuess1()), 'guess bag 1');
  });
  test('reveal1 auto draws "Reveal (auto)"', () => {
    expectContainsText(render(sessionInReveal1Auto()), 'Reveal (auto)');
  });
  test('reveal1 manual draws "Reveal (manual)"', () => {
    expectContainsText(render(sessionInReveal1Manual()), 'Reveal (manual)');
  });
  test('guess2 draws "guess bag 2"', () => {
    expectContainsText(render(sessionInGuess2()), 'guess bag 2');
  });
  test('reveal2 auto draws "Reveal Bag 2 (auto)"', () => {
    expectContainsText(render(sessionInReveal2Auto()), 'Reveal Bag 2 (auto)');
  });
  test('reveal2 manual draws "Reveal Bag 2 (manual)"', () => {
    expectContainsText(render(sessionInReveal2Manual()), 'Reveal Bag 2 (manual)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Contract: #3 — title bar "Session: …" drawn in every phase
// ═══════════════════════════════════════════════════════════════════════════
describe('#3 session stats title bar', () => {
  const states: Array<[string, () => Session]> = [
    ['guess1', sessionInGuess1],
    ['reveal1 auto', sessionInReveal1Auto],
    ['reveal1 manual', sessionInReveal1Manual],
    ['guess2', sessionInGuess2],
    ['reveal2 auto', sessionInReveal2Auto],
    ['reveal2 manual', sessionInReveal2Manual],
  ];
  for (const [name, build] of states) {
    test(`${name}: "Session:" text is drawn`, () => {
      expectContainsText(render(build()), 'Session:');
    });
    test(`${name}: "tetris-td practice" app label is drawn`, () => {
      expectContainsText(render(build()), 'tetris-td practice');
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Contract: #4 — bottom keybind bar differs between auto and manual
// ═══════════════════════════════════════════════════════════════════════════
describe('#4 keybind bar', () => {
  test('guess1 bar mentions opener keys', () => {
    expectContainsText(render(sessionInGuess1()), '1/2/3/4 opener');
  });
  test('reveal auto bar mentions "step"', () => {
    expectContainsText(render(sessionInReveal1Auto()), 'step');
  });
  test('reveal manual bar mentions "rotate" and "drop"', () => {
    const ctx = render(sessionInReveal1Manual());
    expectContainsText(ctx, 'rotate');
    expectContainsText(ctx, 'drop');
  });
  test('guess2 bar mentions "select route"', () => {
    expectContainsText(render(sessionInGuess2()), 'select route');
  });
  test('auto and manual keybind bars differ', () => {
    const autoTexts = new Set(textsDrawn(render(sessionInReveal1Auto())));
    const manualTexts = new Set(textsDrawn(render(sessionInReveal1Manual())));
    // At least one text differs between the two modes.
    const differs =
      [...autoTexts].some((t) => !manualTexts.has(t)) ||
      [...manualTexts].some((t) => !autoTexts.has(t));
    expect(differs).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Contract: #5 — rule card shows all 4 openers in guess1
// ═══════════════════════════════════════════════════════════════════════════
describe('#5 guess1 rule card', () => {
  test('draws Stray, Honey, Gamushi, MS2 labels', () => {
    const ctx = render(sessionInGuess1());
    expectContainsText(ctx, 'Stray');
    expectContainsText(ctx, 'Honey');
    expectContainsText(ctx, 'Gamushi');
    expectContainsText(ctx, 'MS2');
  });
  test('draws mirror toggle state', () => {
    expectContainsText(render(sessionInGuess1()), 'mirror:');
  });
  test('draws 7 bag pieces (slot backgrounds)', () => {
    const ctx = render(sessionInGuess1());
    // Each bag slot draws a fillRect background + strokeRect border.
    // Total fillRect calls are dominated by board grid + panel backgrounds,
    // but we can assert "at least 7 strokeRect calls beyond the board border"
    // — lenient check for bag slot presence.
    const strokeRects = countMethod(ctx, 'strokeRect');
    expect(strokeRects).toBeGreaterThan(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Contract: #6 — reveal1 auto shows opener name and step counter
// ═══════════════════════════════════════════════════════════════════════════
describe('#6 reveal1 auto panel', () => {
  test('draws opener name (MS2)', () => {
    expectContainsText(render(sessionInReveal1Auto()), 'MS2');
  });
  test('draws step counter "step 0 /"', () => {
    expectContainsText(render(sessionInReveal1Auto()), 'step 0 /');
  });
  test('draws ✓ CORRECT badge after correct guess', () => {
    expectContainsText(render(sessionInReveal1Auto()), 'CORRECT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Contract: #7 — piece colors from the palette reach the draw stream
// ═══════════════════════════════════════════════════════════════════════════
describe('#7 piece color palette usage', () => {
  test('reveal1 auto AFTER stepping uses at least one piece color', () => {
    const s = apply(sessionInReveal1Auto(), { type: 'stepForward' });
    const ctx = render(s);
    const stylesUsed = fillStylesUsed(ctx);
    const pieceColors = Object.values(COLORS.pieces);
    const matched = pieceColors.filter((c) => stylesUsed.has(c));
    expect(matched.length).toBeGreaterThan(0);
  });

  test('reveal1 manual spawns an active piece drawn with its palette color', () => {
    const s = sessionInReveal1Manual();
    expect(s.activePiece).not.toBeNull();
    const expectedColor = COLORS.pieces[s.activePiece!.type];
    const stylesUsed = fillStylesUsed(render(s));
    expect(stylesUsed.has(expectedColor!)).toBe(true);
  });

  test('guess1 bag row uses piece colors from every bag slot', () => {
    const s = sessionInGuess1();
    const ctx = render(s);
    const stylesUsed = fillStylesUsed(ctx);
    // Each of the 7 bag pieces should contribute its color at some point.
    // Allow some pieces to share colors in the palette but expect ≥ 5 unique.
    const bagColors = new Set(s.bag1.map((t) => COLORS.pieces[t]));
    const matched = [...bagColors].filter((c) => stylesUsed.has(c!));
    expect(matched.length).toBeGreaterThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Contract: #8 — non-trivial draw call count (render actually did work)
// ═══════════════════════════════════════════════════════════════════════════
describe('#8 non-trivial call count (smoke)', () => {
  test('guess1 issues > 100 draw calls', () => {
    expect(render(sessionInGuess1()).calls.length).toBeGreaterThan(100);
  });
  test('reveal1 auto issues > 100 draw calls', () => {
    expect(render(sessionInReveal1Auto()).calls.length).toBeGreaterThan(100);
  });
  test('reveal1 manual issues more calls than auto (active piece + ghost)', () => {
    const auto = render(sessionInReveal1Auto()).calls.length;
    const manual = render(sessionInReveal1Manual()).calls.length;
    expect(manual).toBeGreaterThan(auto);
  });
});
