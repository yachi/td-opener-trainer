/**
 * tests/diag-l9-bag5-pc.test.ts — Phase 2.5 empirical proof for bag 5 PC data.
 *
 * Validates bag 5 PC solutions that complete the DPC cycle:
 * §1: Solution existence — all 16 DPC variants have PC solutions
 * §2: Solution counts per variant
 * §3: Every solution achieves Perfect Clear (0 cells remaining)
 * §4: Every placement BFS-reachable via replayPcSteps
 * §5: Uses all 7 piece types (full bag, no hold)
 * §6: Shared boards produce identical solutions (reference equality)
 */

import { describe, test, expect } from 'bun:test';
import { getDpcSolutions } from '../src/openers/bag4-dpc.ts';
import { getBag5PcSolution, getBag5PcSolutions } from '../src/openers/bag5-pc.ts';
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
  const EXPECTED: { holdPiece: PieceType; index: number; name: string }[] = [
    { holdPiece: 'O', index: 0, name: 'Kuruma DPC' },
    { holdPiece: 'O', index: 1, name: 'TSD DPC' },
    { holdPiece: 'O', index: 2, name: 'Kuruma DPC (Mirror)' },
    { holdPiece: 'O', index: 3, name: 'TSD DPC (Mirror)' },
    { holdPiece: 'S', index: 0, name: 'Kuruma DPC' },
    { holdPiece: 'S', index: 1, name: 'Lime DPC' },
    { holdPiece: 'Z', index: 0, name: 'Kuruma DPC (Mirror)' },
    { holdPiece: 'Z', index: 1, name: 'Lime DPC (Mirror)' },
    { holdPiece: 'I', index: 0, name: 'Fake Butter DPC' },
    { holdPiece: 'I', index: 1, name: 'Pelican DPC' },
    { holdPiece: 'I', index: 2, name: 'Bad TKI DPC' },
    { holdPiece: 'I', index: 3, name: 'Fake Butter DPC (Mirror)' },
    { holdPiece: 'I', index: 4, name: 'Pelican DPC (Mirror)' },
    { holdPiece: 'I', index: 5, name: 'Bad TKI DPC (Mirror)' },
    { holdPiece: 'J', index: 0, name: 'TSM J SPC' },
    { holdPiece: 'L', index: 0, name: 'TSM J SPC (Mirror)' },
  ];

  for (const { holdPiece, index, name } of EXPECTED) {
    test(`${holdPiece}-hold #${index}: ${name} — has PC`, () => {
      const sol = getBag5PcSolution(holdPiece, index);
      expect(sol).not.toBeNull();
      expect(sol!.placements.length).toBe(7);
    });
  }

  test('total: all 16 variants have PC', () => {
    let withPc = 0;
    for (const holdPiece of HOLD_PIECES) {
      const dpcSols = getDpcSolutions(holdPiece);
      for (let i = 0; i < dpcSols.length; i++) {
        if (getBag5PcSolution(holdPiece, i)) withPc++;
      }
    }
    expect(withPc).toBe(16);
  });

  test('T-hold returns null (no DPC solutions → no bag 5 PC)', () => {
    expect(getBag5PcSolution('T', 0)).toBeNull();
  });
});

// ── §2: Solution counts per variant ──

describe('§2 solution counts per variant', () => {
  const EXPECTED_COUNTS: { holdPiece: PieceType; index: number; name: string; count: number }[] = [
    { holdPiece: 'O', index: 0, name: 'Kuruma DPC', count: 2 },
    { holdPiece: 'O', index: 1, name: 'TSD DPC', count: 3 },
    { holdPiece: 'O', index: 2, name: 'Kuruma DPC (Mirror)', count: 2 },
    { holdPiece: 'O', index: 3, name: 'TSD DPC (Mirror)', count: 3 },
    { holdPiece: 'S', index: 0, name: 'Kuruma DPC', count: 2 },
    { holdPiece: 'S', index: 1, name: 'Lime DPC', count: 2 },
    { holdPiece: 'Z', index: 0, name: 'Kuruma DPC (Mirror)', count: 2 },
    { holdPiece: 'Z', index: 1, name: 'Lime DPC (Mirror)', count: 2 },
    { holdPiece: 'I', index: 0, name: 'Fake Butter DPC', count: 1 },
    { holdPiece: 'I', index: 1, name: 'Pelican DPC', count: 2 },
    { holdPiece: 'I', index: 2, name: 'Bad TKI DPC', count: 2 },
    { holdPiece: 'I', index: 3, name: 'Fake Butter DPC (Mirror)', count: 1 },
    { holdPiece: 'I', index: 4, name: 'Pelican DPC (Mirror)', count: 2 },
    { holdPiece: 'I', index: 5, name: 'Bad TKI DPC (Mirror)', count: 2 },
    { holdPiece: 'J', index: 0, name: 'TSM J SPC', count: 1 },
    { holdPiece: 'L', index: 0, name: 'TSM J SPC (Mirror)', count: 1 },
  ];

  for (const { holdPiece, index, name, count } of EXPECTED_COUNTS) {
    test(`${holdPiece}-hold #${index}: ${name} — ${count} solutions`, () => {
      const sols = getBag5PcSolutions(holdPiece, index);
      expect(sols.length).toBe(count);
    });
  }

  test('total: 30 solutions across all variants', () => {
    let total = 0;
    for (const holdPiece of HOLD_PIECES) {
      const dpcSols = getDpcSolutions(holdPiece);
      for (let i = 0; i < dpcSols.length; i++) {
        total += getBag5PcSolutions(holdPiece, i).length;
      }
    }
    expect(total).toBe(30);
  });

  test('T-hold returns empty array', () => {
    expect(getBag5PcSolutions('T', 0)).toEqual([]);
  });
});

// ── §3: Every solution achieves Perfect Clear ──

describe('§3 every bag 5 PC solution achieves Perfect Clear', () => {
  for (const holdPiece of HOLD_PIECES) {
    const dpcSols = getDpcSolutions(holdPiece);
    for (let i = 0; i < dpcSols.length; i++) {
      const allSols = getBag5PcSolutions(holdPiece, i);
      for (let si = 0; si < allSols.length; si++) {
        const pcSol = allSols[si]!;
        test(`${holdPiece}-hold #${i} sol ${si}: ${dpcSols[i]!.name} — Perfect Clear`, () => {
          const postTsd = getPostTsdBoard(holdPiece, i);
          const steps = replayPcSteps(postTsd, pcSol.placements);
          expect(steps.length).toBe(7);

          const lastBoard = steps[steps.length - 1]!.board;
          let cellCount = 0;
          for (let r = 0; r < 20; r++)
            for (let c = 0; c < 10; c++)
              if (lastBoard[r]![c] !== null) cellCount++;
          expect(cellCount).toBe(0);
        });
      }
    }
  }
});

// ── §4: Every placement BFS-reachable ──

describe('§4 every bag 5 PC placement is BFS-reachable', () => {
  for (const holdPiece of HOLD_PIECES) {
    const dpcSols = getDpcSolutions(holdPiece);
    for (let i = 0; i < dpcSols.length; i++) {
      const allSols = getBag5PcSolutions(holdPiece, i);
      for (let si = 0; si < allSols.length; si++) {
        const pcSol = allSols[si]!;
        test(`${holdPiece}-hold #${i} sol ${si}: ${dpcSols[i]!.name} — all 7 steps reachable`, () => {
          const postTsd = getPostTsdBoard(holdPiece, i);
          // replayPcSteps throws if any placement is not BFS-reachable
          const steps = replayPcSteps(postTsd, pcSol.placements);
          expect(steps.length).toBe(7);
        });
      }
    }
  }
});

// ── §5: Uses all 7 piece types ──

describe('§5 every bag 5 PC solution uses all 7 piece types', () => {
  for (const holdPiece of HOLD_PIECES) {
    const dpcSols = getDpcSolutions(holdPiece);
    for (let i = 0; i < dpcSols.length; i++) {
      const allSols = getBag5PcSolutions(holdPiece, i);
      for (let si = 0; si < allSols.length; si++) {
        const pcSol = allSols[si]!;
        test(`${holdPiece}-hold #${i} sol ${si}: ${dpcSols[i]!.name} — uses IOTSZLJ`, () => {
          const pieces = new Set(pcSol.placements.map(p => p.piece));
          expect(pieces.size).toBe(7);
          for (const p of ALL_PIECES) {
            expect(pieces.has(p)).toBe(true);
          }
        });
      }
    }
  }
});

// ── §6: Shared boards produce identical solutions ──

describe('§6 shared post-TSD boards use the same PC solutions', () => {
  test('O-hold Kuruma = S-hold Kuruma (same array reference)', () => {
    const oSols = getBag5PcSolutions('O', 0);
    const sSols = getBag5PcSolutions('S', 0);
    expect(oSols).toBe(sSols);
  });

  test('O-hold Kuruma Mirror = Z-hold Kuruma Mirror (same array reference)', () => {
    const oSols = getBag5PcSolutions('O', 2);
    const zSols = getBag5PcSolutions('Z', 0);
    expect(oSols).toBe(zSols);
  });

  test('getBag5PcSolution returns same first element for shared boards', () => {
    expect(getBag5PcSolution('O', 0)).toBe(getBag5PcSolution('S', 0));
    expect(getBag5PcSolution('O', 2)).toBe(getBag5PcSolution('Z', 0));
  });
});
