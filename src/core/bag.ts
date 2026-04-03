import type { PieceType } from './types';
import { ALL_PIECE_TYPES } from './types';

/** Fisher-Yates shuffle (in-place, returns the same array). */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i]!, array[j]!] = [array[j]!, array[i]!];
  }
  return array;
}

/** Generate a fresh 7-bag (all 7 piece types in random order). */
export function generateBag(): PieceType[] {
  return shuffle([...ALL_PIECE_TYPES]);
}

/**
 * Generate a weighted bag that has a 30% chance to replay one of the
 * provided wrong bags (selected by weight), and a 70% chance to return
 * a fresh random bag.
 */
export function generateWeightedBag(
  wrongBags: { bag: PieceType[]; weight: number }[],
): PieceType[] {
  if (wrongBags.length === 0) {
    return generateBag();
  }

  if (Math.random() < 0.3) {
    // Pick a wrong bag proportional to its weight
    const totalWeight = wrongBags.reduce((sum, wb) => sum + wb.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const wb of wrongBags) {
      roll -= wb.weight;
      if (roll <= 0) {
        return [...wb.bag];
      }
    }
    // Fallback (shouldn't reach here due to floating-point, but just in case)
    return [...wrongBags[wrongBags.length - 1]!.bag];
  }

  return generateBag();
}
