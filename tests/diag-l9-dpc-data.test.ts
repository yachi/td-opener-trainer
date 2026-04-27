/**
 * tests/diag-l9-dpc-data.test.ts — Phase 2.5 empirical proof for Hard Drop DPC data.
 *
 * Validates all DPC solutions from Hard Drop wiki:
 * §1: Solution counts per hold piece (8 normals + mirrors = 16 total)
 * §2: Every placement achieves TSD (2 lines cleared) on empty board
 * §3: Every placement BFS-reachable via replayPcSteps
 * §4: Mirror symmetry (Z = mirror(S), L = mirror(J), O/I self-mirror)
 */

import { describe, test, expect } from 'bun:test';
import { getDpcSolutions } from '../src/openers/bag4-dpc.ts';
import { emptyBoard, replayPcSteps } from '../src/core/engine.ts';
import type { PieceType } from '../src/core/types.ts';
import { BOARD_WIDTH } from '../src/core/types.ts';

const ALL_PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];

// ── §1: Solution counts ──

describe('§1 DPC solution counts per hold piece', () => {
  const EXPECTED: Record<PieceType, number> = {
    O: 4,  // 2 normals + 2 self-mirrors
    S: 2,  // 2 normals
    Z: 2,  // mirror(S)
    I: 6,  // 3 normals + 3 self-mirrors
    J: 1,  // 1 normal
    L: 1,  // mirror(J)
    T: 0,  // no data
  };

  for (const piece of ALL_PIECES) {
    test(`${piece}-hold: ${EXPECTED[piece]} solutions`, () => {
      expect(getDpcSolutions(piece).length).toBe(EXPECTED[piece]);
    });
  }

  test('total across all hold pieces = 16', () => {
    const total = ALL_PIECES.reduce((sum, p) => sum + getDpcSolutions(p).length, 0);
    expect(total).toBe(16);
  });
});

// ── §2: Every solution achieves TSD (2 lines cleared) ──

describe('§2 every DPC solution clears exactly 2 lines on TSD step', () => {
  for (const holdPiece of ALL_PIECES) {
    const solutions = getDpcSolutions(holdPiece);
    for (let i = 0; i < solutions.length; i++) {
      const sol = solutions[i]!;
      test(`${holdPiece}-hold #${i}: ${sol.name} — TSD clears 2 lines`, () => {
        const steps = replayPcSteps(emptyBoard(), sol.placements);
        expect(steps.length).toBe(sol.placements.length);

        // Find the T placement step — it should clear 2 lines (TSD)
        const tStep = steps.find(s => s.piece === 'T');
        expect(tStep).toBeDefined();
        // TSM J SPC and its mirror are TSS (1 line), all others are TSD (2 lines)
        if (sol.name.includes('TSM J SPC')) {
          // TSM J SPC is a T-Spin Mini — T clears 0 lines, total 1 line cleared
          expect(tStep!.linesCleared).toBeUndefined();
          const totalCleared = steps.reduce((sum, s) => sum + (s.linesCleared ?? 0), 0);
          expect(totalCleared).toBe(1);
        } else {
          expect(tStep!.linesCleared).toBe(2);
        }
      });
    }
  }
});

// ── §3: Every placement BFS-reachable via replayPcSteps ──

describe('§3 every DPC placement is BFS-reachable', () => {
  for (const holdPiece of ALL_PIECES) {
    const solutions = getDpcSolutions(holdPiece);
    for (let i = 0; i < solutions.length; i++) {
      const sol = solutions[i]!;
      test(`${holdPiece}-hold #${i}: ${sol.name} — all ${sol.placements.length} steps reachable`, () => {
        // replayPcSteps throws if any placement is not BFS-reachable
        const steps = replayPcSteps(emptyBoard(), sol.placements);
        expect(steps.length).toBe(sol.placements.length);

        // After all placements, count remaining cells
        const lastBoard = steps[steps.length - 1]!.board;
        let cellCount = 0;
        for (let r = 0; r < 20; r++) {
          for (let c = 0; c < 10; c++) {
            if (lastBoard[r]![c] !== null) cellCount++;
          }
        }
        // TSD setups: 8×4=32 cells - 2×10=20 cleared = 12 remaining
        // TSS setups: 8×4=32 cells - 1×10=10 cleared = 22 remaining
        if (sol.name.includes('TSM J SPC')) {
          expect(cellCount).toBe(22);
        } else {
          expect(cellCount).toBe(12);
        }
      });
    }
  }
});

// ── §4: Mirror symmetry ──

describe('§4 mirror symmetry', () => {
  test('Z-hold solutions are mirrors of S-hold solutions', () => {
    const sSolutions = getDpcSolutions('S');
    const zSolutions = getDpcSolutions('Z');
    expect(zSolutions.length).toBe(sSolutions.length);
    for (let i = 0; i < sSolutions.length; i++) {
      const s = sSolutions[i]!;
      const z = zSolutions[i]!;
      expect(z.holdPiece).toBe('Z');
      expect(z.name).toBe(`${s.name} (Mirror)`);
      // Verify cell positions are mirrored
      for (let j = 0; j < s.placements.length; j++) {
        const sp = s.placements[j]!;
        const zp = z.placements[j]!;
        for (let k = 0; k < sp.cells.length; k++) {
          expect(zp.cells[k]!.col).toBe(BOARD_WIDTH - 1 - sp.cells[k]!.col);
          expect(zp.cells[k]!.row).toBe(sp.cells[k]!.row);
        }
      }
    }
  });

  test('L-hold solutions are mirrors of J-hold solutions', () => {
    const jSolutions = getDpcSolutions('J');
    const lSolutions = getDpcSolutions('L');
    expect(lSolutions.length).toBe(jSolutions.length);
    for (let i = 0; i < jSolutions.length; i++) {
      const j = jSolutions[i]!;
      const l = lSolutions[i]!;
      expect(l.holdPiece).toBe('L');
      expect(l.name).toBe(`${j.name} (Mirror)`);
    }
  });

  test('O-hold includes self-mirror variants', () => {
    const solutions = getDpcSolutions('O');
    expect(solutions.length).toBe(4); // 2 normal + 2 mirror
    expect(solutions[2]!.name).toContain('(Mirror)');
    expect(solutions[3]!.name).toContain('(Mirror)');
    // Normals don't contain "(Mirror)"
    expect(solutions[0]!.name).not.toContain('(Mirror)');
    expect(solutions[1]!.name).not.toContain('(Mirror)');
  });

  test('I-hold includes self-mirror variants', () => {
    const solutions = getDpcSolutions('I');
    expect(solutions.length).toBe(6); // 3 normal + 3 mirror
    expect(solutions[3]!.name).toContain('(Mirror)');
    expect(solutions[4]!.name).toContain('(Mirror)');
    expect(solutions[5]!.name).toContain('(Mirror)');
  });
});
