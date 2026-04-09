/**
 * Golden test: Bag 2 route placement data vs Hard Drop wiki source.
 *
 * This test compares every hardcoded Bag 2 route in visualizer.ts against
 * the authoritative coordinates extracted from the Hard Drop wiki's pfrow
 * templates. If a route's piece placement doesn't match the wiki, this test
 * fails — preventing the manual-transcription errors that caused 3/8 routes
 * to be wrong (1-row shift from miscounting multi-char cells like LL, LZ).
 *
 * Golden data: tests/fixtures/bag2-golden.json
 * Source: Hard Drop wiki pfrow templates, extracted 2026-04-06 via Playwright
 * Rule: Only single-char piece cells (I,J,L,O,S,T,Z) are Bag 2 pieces.
 *       Multi-char cells (LL, LZ, LJ) are Bag 1 residual overlap markers.
 */
import { describe, test, expect } from 'bun:test';
import type { OpenerID } from '../src/openers/types.ts';
import goldenData from './fixtures/bag2-golden.json';

// Type for the golden data structure
type CellCoord = { col: number; row: number };
type PieceCoords = Record<string, CellCoord[]>;
type RouteGolden = Record<string, PieceCoords>;

const OPENERS: OpenerID[] = ['honey_cup', 'stray_cannon', 'gamushiro', 'ms2'];

describe('Bag 2 golden test: codebase matches Hard Drop wiki', () => {
  for (const openerId of OPENERS) {
    const openerGolden = (goldenData as Record<string, RouteGolden>)[openerId];
    if (!openerGolden) continue;

    for (const [routeId, expectedPieces] of Object.entries(openerGolden)) {
      test(`${openerId} / ${routeId} — all 6 pieces match wiki coordinates`, async () => {
        const { getBag2Routes } = await import('../src/openers/bag2-routes.ts');
        const routes = getBag2Routes(openerId, false);
        const route = routes.find((r) => r.routeId === routeId);
        expect(route).toBeDefined();

        for (const placement of route!.placements) {
          const piece = placement.piece;
          const expected = expectedPieces[piece];
          if (!expected) {
            throw new Error(
              `Piece ${piece} in route ${routeId} not found in golden data`,
            );
          }

          // Sort both by row then col for stable comparison
          const actualCells = [...placement.cells].sort(
            (a, b) => a.row - b.row || a.col - b.col,
          );
          const expectedCells = [...expected].sort(
            (a, b) => a.row - b.row || a.col - b.col,
          );

          expect(actualCells).toEqual(expectedCells);
        }
      });
    }
  }
});
