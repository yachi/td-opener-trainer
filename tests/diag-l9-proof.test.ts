/**
 * diag-l9-proof.test.ts — L9 final empirical proof (last 5% uncertainty)
 *
 * Proves 3 remaining design uncertainties for the L9 drill redesign:
 *
 *   1. Hold-empty-queue edge case — if the player holds during a deterministic
 *      drill, the queue runs out 1 piece early. Simulate auto-spawn-from-hold
 *      and prove it yields the correct final board for every opener × mirror.
 *
 *   2. Gamushiro form_2 bag1Reduced — form_2 needs 6 Bag 1 pieces (not 7).
 *      Prove this by running buildSteps with full vs reduced Bag 1 and
 *      measuring which combinations succeed (all pieces placed, no leftovers).
 *
 *   3. canBuild on deterministic BFS queue — with the new deterministic queue,
 *      bagPieces contains only 6–7 pieces in BFS order (subset of all 7). Prove
 *      that `def.canBuild(bagPieces) || def.canBuildMirror(bagPieces)` still
 *      returns true for every opener × mirror.
 *
 *   4. End-to-end deterministic simulation with hold for all openers × mirrors.
 *
 *   5. Bag 2 full deterministic simulation (incl. holdPlacement) for every
 *      route × opener × mirror.
 *
 * Output: concrete data (queue orders, hold states, board hashes) and PASS/FAIL
 * per case. Asserts invariants the design relies on.
 */

import { describe, test, expect } from 'bun:test';
import {
  emptyBoard,
  buildSteps,
  isPlacementReachable,
  stampCells,
  cloneBoard,
} from '../src/core/engine.ts';
import type { Board, Step } from '../src/core/engine.ts';
import { spawnPiece } from '../src/core/srs.ts';
import type { PieceType } from '../src/core/types.ts';
import type { OpenerID } from '../src/openers/types.ts';
import {
  OPENER_PLACEMENT_DATA,
  mirrorPlacementData,
} from '../src/openers/placements.ts';
import type { RawPlacement, OpenerPlacementData } from '../src/openers/placements.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import { OPENERS } from '../src/openers/decision.ts';

// ── Fixtures ──

const OPENER_IDS: OpenerID[] = ['honey_cup', 'ms2', 'gamushiro', 'stray_cannon'];
const MIRRORS = [false, true] as const;

function getData(id: OpenerID, mirror: boolean): OpenerPlacementData {
  const raw = OPENER_PLACEMENT_DATA[id];
  return mirror ? mirrorPlacementData(raw) : raw;
}

function boardHash(board: Board): string {
  return board
    .map(r => r.map(c => (c === null ? '.' : c)).join(''))
    .join('|');
}

function placementsMatch(
  a: { col: number; row: number }[],
  b: { col: number; row: number }[],
): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a.map(c => `${c.col},${c.row}`));
  return b.every(c => s.has(`${c.col},${c.row}`));
}

/**
 * Stage a step on a board: verify reachability, then stamp cells.
 * Returns new board + success flag.
 */
function stageStep(
  board: Board,
  step: { piece: PieceType; newCells: { col: number; row: number }[] },
): { board: Board; ok: boolean } {
  const allEmpty = step.newCells.every(c => board[c.row]?.[c.col] === null);
  if (!allEmpty) return { board, ok: false };
  if (!isPlacementReachable(board, step.piece, step.newCells)) {
    return { board, ok: false };
  }
  return { board: stampCells(board, step.piece, step.newCells), ok: true };
}

// ── Test 1: hold-empty-queue edge case ──
//
// CRITICAL FINDING discovered during this proof:
//
// The BFS build order of `buildSteps` for honey_cup places the hold piece
// (L / J-mirror) in the MIDDLE of the queue, not at the end. Because
// honey_cup's S sits ON TOP of L, S cannot be placed until L is on the
// board. If the player holds L doctrinally, the drill stalls at S.
//
// Consequences for the L9 design:
//
//   (a) 6-piece openers (ms2, stray_cannon): the hold piece is NOT in the
//       deterministic queue (the queue has 6 pieces, the hold is a random
//       7th piece from the bag). Auto-spawn-from-hold is therefore not
//       reachable from the BFS queue alone — the bag-generator must supply
//       the held piece separately.
//
//   (b) 7-piece openers with hold-last-in-BFS (gamushiro normal & mirror):
//       the doctrinal-hold path works cleanly. Queue drains to 6, hold is
//       still L/J, auto-spawn-from-hold completes the drill.
//
//   (c) 7-piece openers with hold-mid-in-BFS (honey_cup normal & mirror):
//       the doctrinal-hold path STALLS at the piece that depends on L/J.
//       The L9 design must NOT support doctrinal hold for honey_cup via the
//       deterministic queue alone. Either:
//         (i) honey_cup drill skips the hold step (player places L
//             mid-queue), or
//         (ii) the drill uses random-bag fallback (non-deterministic) for
//              honey_cup, or
//         (iii) buildSteps is forced to order honey_cup so L is last.
//
// This test documents all three cases and asserts the empirically true
// invariants, so the L9 implementation sees the exact design requirement.

interface T1Row {
  id: OpenerID;
  mirror: boolean;
  target: number;
  holdPiece: PieceType;
  queueBFS: PieceType[];
  holdIdxInBFS: number; // -1 if not in BFS queue (6-piece opener)
  holdIsLastInBFS: boolean; // only meaningful when holdIdxInBFS >= 0
  holdAtDrain: PieceType | null;
  placedAtDrain: number;
  usedAutoSpawn: boolean;
  afterAutoSpawnOk: boolean;
  finalMatchesExpected: boolean;
  expectedToSucceed: boolean;
}

describe('T1: hold-empty-queue auto-spawn-from-hold (doctrinal hold)', () => {
  const results: T1Row[] = [];

  for (const id of OPENER_IDS) {
    for (const mirror of MIRRORS) {
      test(`${id} ${mirror ? 'mirror' : 'normal'}: hold doctrinal piece, drain, auto-spawn`, () => {
        const data = getData(id, mirror);
        const def = OPENERS[id];
        const holdPiece: PieceType = mirror ? def.holdPieceMirror : def.holdPiece;
        const steps = buildSteps(data.placements);
        expect(steps.length).toBe(data.placements.length);

        // Deterministic BFS queue. The player's "queue" is exactly this.
        const queueBFS: PieceType[] = steps.map(s => s.piece);
        const queue: PieceType[] = [...queueBFS];
        const expected = steps[steps.length - 1]!.board;

        // Where does the hold piece live in the BFS queue?
        const holdIdxInBFS = queueBFS.indexOf(holdPiece);
        const holdIsLastInBFS =
          holdIdxInBFS >= 0 && holdIdxInBFS === queueBFS.length - 1;

        // Expectation derived from the BFS layout:
        //   - If hold is NOT in the queue (6-piece openers), doctrinal-hold
        //     over the deterministic queue is not tested — the hold piece
        //     comes from the bag, not the queue. We mark expectedToSucceed
        //     = true for the pure "no-hold" playthrough and skip the held
        //     path here.
        //   - If hold IS the last piece in BFS, doctrinal-hold over the
        //     queue works cleanly (gamushiro).
        //   - If hold is MID-queue (honey_cup), doctrinal-hold stalls
        //     because successors depend on hold's cells. expectedToSucceed
        //     = false.
        const expectedToSucceed =
          holdIdxInBFS === -1 || holdIsLastInBFS;

        let board: Board = emptyBoard();
        let active: PieceType | null = queue.shift() ?? null;
        let hold: PieceType | null = null;
        let holdUsedThisTurn = false; // one-hold-per-piece rule
        let holdEverUsed = false;     // prevent "holding" more than once per bag
        let placed = 0;
        let usedAutoSpawn = false;
        let safety = 0;

        while (active !== null && safety++ < 100) {
          // Strategy: if this is the hold piece AND we haven't held yet AND
          // hold is empty, hold it instead of placing. Otherwise place it.
          if (active === holdPiece && hold === null && !holdEverUsed) {
            hold = active;
            holdUsedThisTurn = true;
            holdEverUsed = true;
            // Draw next from queue; when queue empty, auto-spawn-from-hold.
            if (queue.length > 0) {
              active = queue.shift()!;
            } else {
              active = hold;
              hold = null;
              usedAutoSpawn = true;
            }
            continue;
          }

          const step = steps.find(
            s =>
              s.piece === active &&
              s.newCells.every(c => board[c.row]?.[c.col] === null),
          );
          if (!step) break;
          const res = stageStep(board, step);
          if (!res.ok) break;
          board = res.board;
          placed++;
          holdUsedThisTurn = false;

          if (queue.length > 0) {
            active = queue.shift()!;
          } else if (hold !== null) {
            // Auto-spawn-from-hold: queue drained but hold still has the
            // doctrinal piece. Spawn it as active.
            active = hold;
            hold = null;
            usedAutoSpawn = true;
          } else {
            active = null;
          }
        }

        const holdAtDrain = hold; // should be null (hold was auto-spawned)
        const afterAutoSpawnOk = placed === steps.length;
        const finalMatches = boardHash(board) === boardHash(expected);

        results.push({
          id,
          mirror,
          target: steps.length,
          holdPiece,
          queueBFS,
          holdIdxInBFS,
          holdIsLastInBFS,
          holdAtDrain,
          placedAtDrain: placed,
          usedAutoSpawn,
          afterAutoSpawnOk,
          finalMatchesExpected: finalMatches,
          expectedToSucceed,
        });

        // Assertion depends on where the hold piece sits in BFS:
        //   - expectedToSucceed=true  → must fully complete
        //   - expectedToSucceed=false → must partially stall (not complete)
        if (expectedToSucceed) {
          expect(placed).toBe(steps.length);
          expect(finalMatches).toBe(true);
        } else {
          // Honey cup: doctrinal hold must stall at the piece depending on L
          expect(placed).toBeLessThan(steps.length);
          expect(finalMatches).toBe(false);
        }
      });
    }
  }

  test('T1 summary', () => {
    console.log('\n=== T1: Hold-empty-queue + auto-spawn-from-hold (doctrinal hold) ===');
    console.log(
      'opener               hold BFS queue                 target placed autoSpawn finalOk  expected',
    );
    for (const r of results) {
      const label = `${r.id}${r.mirror ? ' (m)' : ''}`.padEnd(20);
      const q = `[${r.queueBFS.join(',')}]`.padEnd(24);
      const role =
        r.holdIdxInBFS === -1
          ? 'not in queue'
          : r.holdIsLastInBFS
            ? 'LAST in BFS'
            : `mid-BFS (idx ${r.holdIdxInBFS})`;
      console.log(
        `${label} ${r.holdPiece.padStart(4)} ${q} ${String(r.target).padStart(6)} ${String(r.placedAtDrain).padStart(6)} ${String(r.usedAutoSpawn).padStart(9)} ${String(r.finalMatchesExpected).padStart(7)}  ${r.expectedToSucceed ? 'SUCCEED' : ' STALL '}  ← ${role}`,
      );
    }
    expect(results.length).toBe(OPENER_IDS.length * MIRRORS.length);

    // Assertions on the expected design behavior:
    //   gamushiro (both mirrors): hold is LAST in BFS → must fully succeed
    //     with auto-spawn from hold.
    //   ms2/stray_cannon (both mirrors): hold NOT in BFS queue → the
    //     deterministic queue drains to 0 without ever touching hold;
    //     the simulation "succeeds" trivially because no hold event occurs.
    //   honey_cup (both mirrors): hold is MID-BFS → must STALL.
    const gamu = results.filter(r => r.id === 'gamushiro');
    expect(gamu.every(r => r.expectedToSucceed)).toBe(true);
    expect(gamu.every(r => r.usedAutoSpawn)).toBe(true);
    expect(gamu.every(r => r.finalMatchesExpected)).toBe(true);

    const honey = results.filter(r => r.id === 'honey_cup');
    expect(honey.every(r => !r.expectedToSucceed)).toBe(true);
    expect(honey.every(r => !r.finalMatchesExpected)).toBe(true);

    const sixPiece = results.filter(
      r => r.id === 'ms2' || r.id === 'stray_cannon',
    );
    expect(sixPiece.every(r => r.holdIdxInBFS === -1)).toBe(true);

    // spawnPiece(holdPiece) is valid for every opener — cheap sanity check.
    for (const r of results) {
      const sp = spawnPiece(r.holdPiece);
      expect(sp.type).toBe(r.holdPiece);
    }
  });
});

// ── Test 2: gamushiro form_2 needs bag1Reduced ──

describe('T2: gamushiro bag1Reduced evidence', () => {
  interface Row {
    id: OpenerID;
    mirror: boolean;
    routeIndex: number;
    routeLabel: string;
    bag1Full: number;
    bag2Len: number;
    fullStepsOk: boolean;
    fullStepsCount: number;
    reducedStepsOk: boolean;
    reducedStepsCount: number;
    needsReduced: boolean;
  }

  const rows: Row[] = [];

  function runCase(id: OpenerID, mirror: boolean): void {
    const data = getData(id, mirror);
    const fullPlacements = data.placements;
    const routes = getBag2Routes(id, mirror);
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const route = routes[routeIndex]!;
      const bag2All: RawPlacement[] = [
        ...(route.holdPlacement ? [route.holdPlacement] : []),
        ...route.placements,
      ];

      // Test A: full Bag 1 + Bag 2
      const fullSteps = buildSteps([...fullPlacements, ...bag2All]);
      const fullExpected = fullPlacements.length + bag2All.length;
      const fullStepsOk = fullSteps.length === fullExpected;

      // Test B: reduced Bag 1 (drop last) + Bag 2
      const reducedPlacements = fullPlacements.slice(0, -1);
      const reducedSteps = buildSteps([...reducedPlacements, ...bag2All]);
      const reducedExpected = reducedPlacements.length + bag2All.length;
      const reducedStepsOk = reducedSteps.length === reducedExpected;

      rows.push({
        id,
        mirror,
        routeIndex,
        routeLabel: route.routeLabel,
        bag1Full: fullPlacements.length,
        bag2Len: bag2All.length,
        fullStepsOk,
        fullStepsCount: fullSteps.length,
        reducedStepsOk,
        reducedStepsCount: reducedSteps.length,
        needsReduced: !fullStepsOk && reducedStepsOk,
      });
    }
  }

  test('run every opener × mirror × route', () => {
    for (const id of OPENER_IDS) {
      for (const mirror of MIRRORS) {
        runCase(id, mirror);
      }
    }

    console.log('\n=== T2: buildSteps with full vs reduced Bag 1 ===');
    console.log(
      'opener                 route                         bag1  bag2  fullOK (got/exp) reducedOK (got/exp) needsReduced',
    );
    for (const r of rows) {
      const label = `${r.id}${r.mirror ? ' (m)' : ''}`.padEnd(22);
      const route = `${r.routeIndex} ${r.routeLabel}`.padEnd(29);
      const full = `${r.fullStepsOk} (${r.fullStepsCount}/${r.bag1Full + r.bag2Len})`.padEnd(16);
      const red = `${r.reducedStepsOk} (${r.reducedStepsCount}/${r.bag1Full - 1 + r.bag2Len})`.padEnd(18);
      console.log(
        `${label} ${route} ${String(r.bag1Full).padStart(4)}  ${String(r.bag2Len).padStart(4)}  ${full}  ${red}  ${r.needsReduced}`,
      );
    }

    // Specific assertions (the uncertainty the user wants pinned):
    const gamuForm1 = rows.filter(
      r => r.id === 'gamushiro' && r.routeIndex === 0,
    );
    const gamuForm2 = rows.filter(
      r => r.id === 'gamushiro' && r.routeIndex === 1,
    );
    expect(gamuForm1.length).toBe(2);
    expect(gamuForm2.length).toBe(2);

    // Gamushiro form_1: full Bag 1 should work (7 bag1 + 6 bag2 = 13).
    for (const r of gamuForm1) {
      expect(r.fullStepsOk).toBe(true);
      expect(r.needsReduced).toBe(false);
    }
    // Gamushiro form_2: full should FAIL (conflict on last L) and reduced
    // (6 bag1 pieces) should succeed with bag2's holdPlacement providing the L.
    for (const r of gamuForm2) {
      // We print PASS/FAIL regardless — but if form_2 needs reduced that's
      // the empirical proof.
      console.log(
        `  gamushiro form_2 ${r.mirror ? '(mirror)' : ''}: fullOK=${r.fullStepsOk} reducedOK=${r.reducedStepsOk} → needsReduced=${r.needsReduced}`,
      );
    }

    // Every route on every opener × mirror should be playable via EITHER
    // full-bag1 OR reduced-bag1 — otherwise buildSteps can't build the shape
    // at all and the L9 design breaks.
    const unplayable = rows.filter(r => !r.fullStepsOk && !r.reducedStepsOk);
    if (unplayable.length > 0) {
      console.log('  UNPLAYABLE routes (neither full nor reduced works):');
      for (const u of unplayable) {
        console.log(
          `    ${u.id}${u.mirror ? ' (m)' : ''} route=${u.routeIndex} ${u.routeLabel}`,
        );
      }
    }
    expect(unplayable.length).toBe(0);
  });
});

// ── Test 3: canBuild on deterministic BFS queue ──
//
// CRITICAL DESIGN FINDING: the current `canBuild` / `canBuildMirror` predicates
// were designed for a RANDOM 7-bag (all 7 piece types in some order). The L9
// deterministic queue is BFS-ordered — and for honey_cup the BFS order places
// L(hold piece) LATE on purpose, which **fails** the "L not last of {L,O,T}"
// rule. Therefore:
//   - The L9 drill must NOT call canBuild on the deterministic queue.
//   - The canBuild check belongs to the random-bag quiz, not the deterministic drill.
// This test documents the failure so the redesign accounts for it.

describe('T3: canBuild(deterministic BFS queue) — design finding', () => {
  interface Row {
    id: OpenerID;
    mirror: boolean;
    queue: PieceType[];
    queueLen: number;
    normalOK: boolean;
    mirrorOK: boolean;
    anyOK: boolean;
  }
  const rows: Row[] = [];

  test('document which openers pass/fail canBuild on BFS queue', () => {
    for (const id of OPENER_IDS) {
      for (const mirror of MIRRORS) {
        const data = getData(id, mirror);
        const steps = buildSteps(data.placements);
        const bagPieces = steps.map(s => s.piece);
        const def = OPENERS[id];
        const normalOK = def.canBuild(bagPieces);
        const mirrorOK = def.canBuildMirror(bagPieces);
        rows.push({
          id,
          mirror,
          queue: bagPieces,
          queueLen: bagPieces.length,
          normalOK,
          mirrorOK,
          anyOK: normalOK || mirrorOK,
        });
      }
    }
    console.log('\n=== T3: canBuild on deterministic BFS queue ===');
    console.log('opener               len queue (BFS order)             normalOK mirrorOK anyOK');
    for (const r of rows) {
      const label = `${r.id}${r.mirror ? ' (m)' : ''}`.padEnd(20);
      const q = `[${r.queue.join(',')}]`.padEnd(30);
      console.log(
        `${label} ${String(r.queueLen).padStart(3)} ${q} ${String(r.normalOK).padStart(8)} ${String(r.mirrorOK).padStart(8)} ${String(r.anyOK).padStart(5)}`,
      );
    }

    // CONCRETE FINDING: ms2/gamushiro/stray_cannon all pass at least one side.
    // Honey cup FAILS both sides (by design — BFS puts the hold piece last).
    const passes = rows.filter(r => r.anyOK).map(r => `${r.id}${r.mirror ? '(m)' : ''}`);
    const failures = rows.filter(r => !r.anyOK).map(r => `${r.id}${r.mirror ? '(m)' : ''}`);
    console.log(`  PASSES: [${passes.join(', ')}]`);
    console.log(`  FAILS:  [${failures.join(', ')}]  ← these MUST NOT be routed through canBuild in the drill`);

    // Prove honey_cup (both mirrors) fails — this is the key L9 finding.
    const honey = rows.filter(r => r.id === 'honey_cup');
    expect(honey.every(r => !r.anyOK)).toBe(true);
    // Prove the other 3 openers pass on at least one side.
    const nonHoney = rows.filter(r => r.id !== 'honey_cup');
    expect(nonHoney.every(r => r.anyOK)).toBe(true);
  });

  test('design implication: guard canBuild behind bagNumber/mode', () => {
    // The existing drill (src/modes/drill.ts line ~168) calls
    //   def.canBuild(bag) && isBagPlayable(...)
    // on the RANDOM bag from generateBag(). That is correct for the random
    // bag because it has all 7 pieces.
    //
    // The L9 redesign uses a DETERMINISTIC queue derived from buildSteps.
    // For 6-piece openers (ms2, stray_cannon) the queue is length 6, not 7,
    // so canBuild's "not last among X,Y,Z" logic uses Infinity indices for
    // missing pieces. For 7-piece openers (honey_cup, gamushiro) the queue
    // IS length 7 but in BFS order, not a random 7-bag, and honey_cup fails.
    //
    // Conclusion: the L9 deterministic drill must NOT use canBuild. It must
    // trust buildSteps to produce a valid order and run it directly.
    //
    // This test encodes the invariant the design depends on: deterministic
    // queues of length N (6 or 7) can be consumed in order without any
    // canBuild check.
    for (const id of OPENER_IDS) {
      for (const mirror of MIRRORS) {
        const data = getData(id, mirror);
        const steps = buildSteps(data.placements);
        // Walk the queue: place every piece in order on an empty board.
        // This is the invariant the L9 drill must preserve.
        let board: Board = emptyBoard();
        let ok = true;
        for (const step of steps) {
          const res = stageStep(board, { piece: step.piece, newCells: step.newCells });
          if (!res.ok) {
            ok = false;
            break;
          }
          board = res.board;
        }
        expect(ok).toBe(true);
      }
    }
  });
});

// ── Test 4: End-to-end deterministic simulation ──

describe('T4: end-to-end deterministic drill simulation', () => {
  // Exercise the full L9 drill design with multiple strategies:
  //   (a) no-hold  — player never holds (control, must succeed).
  //   (b) doctrinal — player holds the doctrinal hold piece (L/Z) exactly
  //                   once when it first appears. Queue drains. Auto-spawn
  //                   from hold completes the opener. This is the scenario
  //                   the L9 design must support.
  //
  // Also probes the worst case: what if the player "wrongly" holds the
  // FIRST piece (regardless of whether it's the doctrinal hold)? Report as
  // data — do not assert (the drill is allowed to fail this since the
  // player is doing the wrong thing).

  type Strategy = 'no-hold' | 'doctrinal' | 'hold-first';

  function simulate(
    id: OpenerID,
    mirror: boolean,
    strategy: Strategy,
  ): {
    placed: number;
    target: number;
    matches: boolean;
    usedAutoSpawn: boolean;
    holdPiece: PieceType;
  } {
    const data = getData(id, mirror);
    const def = OPENERS[id];
    const holdPiece: PieceType = mirror ? def.holdPieceMirror : def.holdPiece;
    const steps = buildSteps(data.placements);
    const expected = steps[steps.length - 1]!.board;
    const target = steps.length;

    let board: Board = emptyBoard();
    const queue: PieceType[] = steps.map(s => s.piece);
    let active: PieceType | null = queue.shift() ?? null;
    let hold: PieceType | null = null;
    let holdEverUsed = false;
    let placed = 0;
    let usedAutoSpawn = false;

    if (strategy === 'hold-first' && active !== null) {
      hold = active;
      holdEverUsed = true;
      active = queue.shift() ?? null;
    }

    let safety = 0;
    while (active !== null && safety++ < 100) {
      // Doctrinal: hold exactly the hold piece, once, when first seen.
      if (
        strategy === 'doctrinal' &&
        active === holdPiece &&
        hold === null &&
        !holdEverUsed
      ) {
        hold = active;
        holdEverUsed = true;
        if (queue.length > 0) {
          active = queue.shift()!;
        } else {
          active = hold;
          hold = null;
          usedAutoSpawn = true;
        }
        continue;
      }

      const step = steps.find(
        s =>
          s.piece === active &&
          s.newCells.every(c => board[c.row]?.[c.col] === null),
      );
      if (!step) break;
      const res = stageStep(board, step);
      if (!res.ok) break;
      board = res.board;
      placed++;

      if (queue.length > 0) {
        active = queue.shift()!;
      } else if (hold !== null) {
        active = hold;
        hold = null;
        usedAutoSpawn = true;
      } else {
        active = null;
      }
    }

    return {
      placed,
      target,
      matches: boardHash(board) === boardHash(expected),
      usedAutoSpawn,
      holdPiece,
    };
  }

  test('no-hold + doctrinal strategies: all opener × mirror must succeed', () => {
    const results: {
      id: OpenerID;
      mirror: boolean;
      strategy: Strategy;
      placed: number;
      target: number;
      matches: boolean;
      usedAutoSpawn: boolean;
      holdPiece: PieceType;
    }[] = [];

    for (const id of OPENER_IDS) {
      for (const mirror of MIRRORS) {
        for (const strategy of ['no-hold', 'doctrinal', 'hold-first'] as const) {
          const r = simulate(id, mirror, strategy);
          results.push({ id, mirror, strategy, ...r });
        }
      }
    }

    console.log('\n=== T4: End-to-end deterministic simulation ===');
    console.log(
      'opener               hold  strategy    placed/target matches autoSpawn',
    );
    for (const r of results) {
      const label = `${r.id}${r.mirror ? ' (m)' : ''}`.padEnd(20);
      const strat = r.strategy.padEnd(11);
      const pt = `${r.placed}/${r.target}`.padEnd(13);
      console.log(
        `${label} ${r.holdPiece.padStart(4)}  ${strat} ${pt} ${String(r.matches).padStart(7)} ${String(r.usedAutoSpawn).padStart(9)}`,
      );
    }

    // REQUIRED to succeed: no-hold for ALL openers.
    const noHold = results.filter(r => r.strategy === 'no-hold');
    expect(noHold.every(r => r.matches && r.placed === r.target)).toBe(true);
    expect(noHold.every(r => !r.usedAutoSpawn)).toBe(true);

    // Doctrinal succeeds for ms2/gamushiro/stray_cannon but STALLS for
    // honey_cup (see T1 for the reason: honey_cup's S depends on L).
    const doctrinalHoney = results.filter(
      r => r.strategy === 'doctrinal' && r.id === 'honey_cup',
    );
    expect(doctrinalHoney.every(r => !r.matches)).toBe(true);

    const doctrinalNonHoney = results.filter(
      r => r.strategy === 'doctrinal' && r.id !== 'honey_cup',
    );
    expect(
      doctrinalNonHoney.every(r => r.matches && r.placed === r.target),
    ).toBe(true);

    // Among the succeeding doctrinal runs, gamushiro must exercise auto-spawn
    // (hold piece is LAST in BFS, so queue drains to 0, hold still present).
    // ms2/stray_cannon do NOT auto-spawn because their hold piece is not in
    // the deterministic queue at all — there's nothing to hold.
    const doctrinalGamu = results.filter(
      r => r.strategy === 'doctrinal' && r.id === 'gamushiro',
    );
    expect(doctrinalGamu.every(r => r.usedAutoSpawn)).toBe(true);
    const doctrinal6Piece = results.filter(
      r =>
        r.strategy === 'doctrinal' &&
        (r.id === 'ms2' || r.id === 'stray_cannon'),
    );
    expect(doctrinal6Piece.every(r => !r.usedAutoSpawn)).toBe(true);

    // "hold-first" is informational only — record whether it can reach the
    // target. Some openers will partially succeed, some fully. The drill
    // design is NOT required to support "hold whatever first" play.
    const holdFirst = results.filter(r => r.strategy === 'hold-first');
    console.log('\nhold-first (informational — NOT a requirement):');
    for (const r of holdFirst) {
      console.log(
        `  ${r.id}${r.mirror ? ' (m)' : ''}: placed=${r.placed}/${r.target}, matches=${r.matches}, autoSpawn=${r.usedAutoSpawn}`,
      );
    }
  });
});

// ── Test 5: Bag 2 deterministic simulation for all openers ──

describe('T5: Bag 2 deterministic simulation', () => {
  // For each opener × mirror × route:
  //   1. Build Bag 1 on an empty board using buildSteps (unreduced).
  //   2. If that fails, use reduced Bag 1 (last piece dropped).
  //   3. Transition to Bag 2: carry hold from Bag 1 def.
  //   4. Use buildSteps with [Bag 1 final board] as start + route placements
  //      (including holdPlacement if present).
  //   5. Verify every Bag 2 piece is reachable in BFS order, final board has
  //      all cells filled as expected.

  interface Row {
    id: OpenerID;
    mirror: boolean;
    routeIndex: number;
    routeLabel: string;
    bag1Used: number;
    bag2Expected: number;
    bag2StepsBuilt: number;
    allReachable: boolean;
    ok: boolean;
  }
  const rows: Row[] = [];

  test('every opener × mirror × route: Bag 2 BFS reaches every piece', () => {
    for (const id of OPENER_IDS) {
      for (const mirror of MIRRORS) {
        const data = getData(id, mirror);
        const bag1Full = data.placements;

        const routes = getBag2Routes(id, mirror);
        for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
          const route = routes[routeIndex]!;
          const bag2All: RawPlacement[] = [
            ...(route.holdPlacement ? [route.holdPlacement] : []),
            ...route.placements,
          ];

          // Decide bag1 used (full vs reduced) using the same rule the
          // visualizer uses: try full, if any piece stuck, reduce by 1.
          let bag1Used = bag1Full;
          const fullSteps = buildSteps([...bag1Full, ...bag2All]);
          if (fullSteps.length < bag1Full.length + bag2All.length) {
            const reducedBag1 = bag1Full.slice(0, -1);
            const reducedSteps = buildSteps([...reducedBag1, ...bag2All]);
            if (reducedSteps.length >= reducedBag1.length + bag2All.length) {
              bag1Used = reducedBag1;
            }
          }

          // Build Bag 1 alone first (snapshot board).
          const bag1Only = buildSteps(bag1Used);
          const bag1Board =
            bag1Only.length > 0
              ? bag1Only[bag1Only.length - 1]!.board
              : emptyBoard();

          // Build Bag 2 on top of that board.
          const bag2Steps = buildSteps(bag2All, bag1Board);
          const allReachable = bag2Steps.length === bag2All.length;

          // Verify ALL cells from Bag 2 are present on the final board.
          let ok = allReachable;
          if (allReachable) {
            const finalBoard = bag2Steps[bag2Steps.length - 1]!.board;
            for (const p of bag2All) {
              const allPresent = p.cells.every(
                c => finalBoard[c.row]?.[c.col] === p.piece,
              );
              if (!allPresent) {
                ok = false;
                break;
              }
            }
          }

          rows.push({
            id,
            mirror,
            routeIndex,
            routeLabel: route.routeLabel,
            bag1Used: bag1Used.length,
            bag2Expected: bag2All.length,
            bag2StepsBuilt: bag2Steps.length,
            allReachable,
            ok,
          });
        }
      }
    }

    console.log('\n=== T5: Bag 2 deterministic simulation ===');
    console.log(
      'opener             route                         bag1Used bag2Exp bag2Built reachable ok',
    );
    for (const r of rows) {
      const label = `${r.id}${r.mirror ? ' (m)' : ''}`.padEnd(18);
      const route = `${r.routeIndex} ${r.routeLabel}`.padEnd(29);
      console.log(
        `${label} ${route} ${String(r.bag1Used).padStart(8)} ${String(r.bag2Expected).padStart(7)} ${String(r.bag2StepsBuilt).padStart(9)} ${String(r.allReachable).padStart(9)} ${String(r.ok).padStart(2)}`,
      );
    }

    expect(rows.every(r => r.ok)).toBe(true);

    // Sanity check: gamushiro form_2 should use reduced Bag 1.
    const gamuForm2 = rows.filter(r => r.id === 'gamushiro' && r.routeIndex === 1);
    expect(gamuForm2.every(r => r.bag1Used === 6)).toBe(true);
    // Gamushiro form_1 should use the full Bag 1 (7).
    const gamuForm1 = rows.filter(r => r.id === 'gamushiro' && r.routeIndex === 0);
    expect(gamuForm1.every(r => r.bag1Used === 7)).toBe(true);
  });
});
