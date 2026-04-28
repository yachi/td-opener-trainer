/**
 * tests/diag-l9-bag5-pc.test.ts — Phase 2.5 empirical proof for bag 5 PC data.
 *
 * Validates bag 5 PC solutions that complete the DPC cycle:
 * §1: Solution existence matches expected (8 have PC, 8 don't)
 * §2: Every solution achieves Perfect Clear (0 cells remaining)
 * §3: Every placement BFS-reachable via replayPcSteps
 * §4: Uses all 7 piece types (full bag, no hold)
 * §5: Shared boards produce identical solutions
 */

import { describe, test, expect } from 'bun:test';
import { getDpcSolutions } from '../src/openers/bag4-dpc.ts';
import { getBag5PcSolution } from '../src/openers/bag5-pc.ts';
import { emptyBoard, replayPcSteps } from '../src/core/engine.ts';
import type { PieceType } from '../src/core/types.ts';

const HOLD_PIECES: PieceType[] = ['O', 'S', 'Z', 'I', 'J', 'L'];
const ALL_PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];

/** Replay DPC placements and return the post-TSD board. */
function getPostTsdBoard(holdPiece: PieceType, dpcIndex: number) {
  const dpcSol = getDpcSolutions(holdPiece)[dpcIndex]!;
  const steps = replayPcSteps(emptyBoard(), dpcSol.placements);
  return steps[steps.length - 1]!.board;
}

// ── §1: Solution existence ──

describe('§1 bag 5 PC solution existence', () => {
  const EXPECTED: { holdPiece: PieceType; index: number; name: string; hasPc: boolean }[] = [
    { holdPiece: 'O', index: 0, name: 'Kuruma DPC', hasPc: true },
    { holdPiece: 'O', index: 1, name: 'TSD DPC', hasPc: true },
    { holdPiece: 'O', index: 2, name: 'Kuruma DPC (Mirror)', hasPc: true },
    { holdPiece: 'O', index: 3, name: 'TSD DPC (Mirror)', hasPc: true },
    { holdPiece: 'S', index: 0, name: 'Kuruma DPC', hasPc: true },
    { holdPiece: 'S', index: 1, name: 'Lime DPC', hasPc: false },
    { holdPiece: 'Z', index: 0, name: 'Kuruma DPC (Mirror)', hasPc: true },
    { holdPiece: 'Z', index: 1, name: 'Lime DPC (Mirror)', hasPc: false },
    { holdPiece: 'I', index: 0, name: 'Fake Butter DPC', hasPc: true },
    { holdPiece: 'I', index: 1, name: 'Pelican DPC', hasPc: true },
    { holdPiece: 'I', index: 2, name: 'Bad TKI DPC', hasPc: false },
    { holdPiece: 'I', index: 3, name: 'Fake Butter DPC (Mirror)', hasPc: false },
    { holdPiece: 'I', index: 4, name: 'Pelican DPC (Mirror)', hasPc: false },
    { holdPiece: 'I', index: 5, name: 'Bad TKI DPC (Mirror)', hasPc: false },
    { holdPiece: 'J', index: 0, name: 'TSM J SPC', hasPc: false },
    { holdPiece: 'L', index: 0, name: 'TSM J SPC (Mirror)', hasPc: false },
  ];

  for (const { holdPiece, index, name, hasPc } of EXPECTED) {
    test(`${holdPiece}-hold #${index}: ${name} — ${hasPc ? 'has PC' : 'no PC'}`, () => {
      const sol = getBag5PcSolution(holdPiece, index);
      if (hasPc) {
        expect(sol).not.toBeNull();
        expect(sol!.placements.length).toBe(7);
      } else {
        expect(sol).toBeNull();
      }
    });
  }

  test('total: 8 variants with PC, 8 without', () => {
    let withPc = 0;
    let withoutPc = 0;
    for (const holdPiece of HOLD_PIECES) {
      const dpcSols = getDpcSolutions(holdPiece);
      for (let i = 0; i < dpcSols.length; i++) {
        if (getBag5PcSolution(holdPiece, i)) withPc++;
        else withoutPc++;
      }
    }
    expect(withPc).toBe(8);
    expect(withoutPc).toBe(8);
  });

  test('T-hold returns null (no DPC solutions → no bag 5 PC)', () => {
    expect(getBag5PcSolution('T', 0)).toBeNull();
  });
});

// ── §2: Every solution achieves Perfect Clear ──

describe('§2 every bag 5 PC solution achieves Perfect Clear', () => {
  for (const holdPiece of HOLD_PIECES) {
    const dpcSols = getDpcSolutions(holdPiece);
    for (let i = 0; i < dpcSols.length; i++) {
      const pcSol = getBag5PcSolution(holdPiece, i);
      if (!pcSol) continue;

      test(`${holdPiece}-hold #${i}: ${dpcSols[i]!.name} — Perfect Clear`, () => {
        const postTsd = getPostTsdBoard(holdPiece, i);
        const steps = replayPcSteps(postTsd, pcSol.placements);
        expect(steps.length).toBe(7);

        // Final board must be completely empty
        const lastBoard = steps[steps.length - 1]!.board;
        let cellCount = 0;
        for (let r = 0; r < 20; r++)
          for (let c = 0; c < 10; c++)
            if (lastBoard[r]![c] !== null) cellCount++;
        expect(cellCount).toBe(0);
      });
    }
  }
});

// ── §3: Every placement BFS-reachable ──

describe('§3 every bag 5 PC placement is BFS-reachable', () => {
  for (const holdPiece of HOLD_PIECES) {
    const dpcSols = getDpcSolutions(holdPiece);
    for (let i = 0; i < dpcSols.length; i++) {
      const pcSol = getBag5PcSolution(holdPiece, i);
      if (!pcSol) continue;

      test(`${holdPiece}-hold #${i}: ${dpcSols[i]!.name} — all 7 steps reachable`, () => {
        const postTsd = getPostTsdBoard(holdPiece, i);
        // replayPcSteps throws if any placement is not BFS-reachable
        const steps = replayPcSteps(postTsd, pcSol.placements);
        expect(steps.length).toBe(7);
      });
    }
  }
});

// ── §4: Uses all 7 piece types ──

describe('§4 every bag 5 PC solution uses all 7 piece types', () => {
  for (const holdPiece of HOLD_PIECES) {
    const dpcSols = getDpcSolutions(holdPiece);
    for (let i = 0; i < dpcSols.length; i++) {
      const pcSol = getBag5PcSolution(holdPiece, i);
      if (!pcSol) continue;

      test(`${holdPiece}-hold #${i}: ${dpcSols[i]!.name} — uses IOTSZLJ`, () => {
        const pieces = new Set(pcSol.placements.map(p => p.piece));
        expect(pieces.size).toBe(7);
        for (const p of ALL_PIECES) {
          expect(pieces.has(p)).toBe(true);
        }
      });
    }
  }
});

// ── §5: Shared boards produce identical solutions ──

describe('§5 shared post-TSD boards use the same PC solution', () => {
  test('O-hold Kuruma = S-hold Kuruma (same post-TSD board)', () => {
    const oSol = getBag5PcSolution('O', 0)!;
    const sSol = getBag5PcSolution('S', 0)!;
    expect(oSol).toBe(sSol); // Same object reference (shared)
  });

  test('O-hold Kuruma Mirror = Z-hold Kuruma Mirror (same post-TSD board)', () => {
    const oSol = getBag5PcSolution('O', 2)!;
    const zSol = getBag5PcSolution('Z', 0)!;
    expect(oSol).toBe(zSol); // Same object reference (shared)
  });
});
