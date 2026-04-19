/**
 * Generate golden fixture for drill-queue tests.
 *
 * Runs buildSteps for all opener×mirror×route combinations and serializes
 * the step ordering to JSON. This replaces re-solving at test time (~247s)
 * with a <1s fixture read.
 *
 * Usage: bun run scripts/generate-drill-golden.ts
 * Re-run when placement data changes.
 */
import { buildSteps } from '../src/core/engine.ts';
import {
  OPENER_PLACEMENT_DATA,
  mirrorPlacementData,
  type RawPlacement,
} from '../src/openers/placements.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import type { OpenerID } from '../src/openers/types.ts';

interface GoldenEntry {
  opener: OpenerID;
  mirror: boolean;
  routeId: string;
  bag1Reduction: number;
  inputCount: number;
  stepHints: string[];
}

const OPENERS: OpenerID[] = ['honey_cup', 'gamushiro', 'ms2', 'stray_cannon'];
const golden: GoldenEntry[] = [];

for (const id of OPENERS) {
  for (const mirror of [false, true]) {
    const routes = getBag2Routes(id, mirror);
    for (const route of routes) {
      const raw = OPENER_PLACEMENT_DATA[id];
      const data = mirror ? mirrorPlacementData(raw) : raw;
      const bag1 = data.placements;
      const holdArr: RawPlacement[] = route.holdPlacement
        ? [route.holdPlacement]
        : [];
      const bag2 = route.placements;
      const reduction = route.bag1Reduction ?? 0;
      const bag1Used = bag1.slice(0, bag1.length - reduction);
      const all = [...bag1Used, ...holdArr, ...bag2];

      const steps = buildSteps(all);
      if (steps.length < all.length) {
        throw new Error(
          `buildSteps incomplete: ${id} mirror=${mirror} route=${route.routeId} ` +
            `(${steps.length}/${all.length}). Check bag1Reduction metadata.`,
        );
      }

      golden.push({
        opener: id,
        mirror,
        routeId: route.routeId,
        bag1Reduction: reduction,
        inputCount: all.length,
        stepHints: steps.map((s) => s.hint),
      });
    }
  }
}

const outPath = 'tests/fixtures/drill-steps-golden.json';
await Bun.write(outPath, JSON.stringify(golden, null, 2) + '\n');
console.log(
  `Generated ${golden.length} entries → ${outPath} (${(JSON.stringify(golden).length / 1024).toFixed(1)} KB)`,
);
