import type { PieceType } from '../core/types';
import type { OpenerDefinition, OpenerID } from './types';

// ── Helpers ──

/** Returns the index of the first occurrence of `piece` in `bag`, or Infinity. */
function indexOf(bag: PieceType[], piece: PieceType): number {
  const i = bag.indexOf(piece);
  return i === -1 ? Infinity : i;
}

/** Returns true if `piece` is NOT the last to appear among `group` in `bag`. */
function isNotLast(bag: PieceType[], piece: PieceType, group: PieceType[]): boolean {
  let lastIdx = -1;
  let pieceIdx = -1;
  for (const p of group) {
    const i = indexOf(bag, p);
    if (i > lastIdx) {
      lastIdx = i;
    }
    if (p === piece) {
      pieceIdx = i;
    }
  }
  return pieceIdx < lastIdx;
}

/** Returns true if `a` appears before `b` in `bag`. */
function appearsBefore(bag: PieceType[], a: PieceType, b: PieceType): boolean {
  return indexOf(bag, a) < indexOf(bag, b);
}

// ── Opener Definitions ──

export const OPENERS: Record<OpenerID, OpenerDefinition> = {
  honey_cup: {
    id: 'honey_cup',
    nameEn: 'Honey Cup',
    nameJa: 'はちみつ砲',
    nameCn: '蜜蜂炮',
    holdPiece: 'L',
    holdPieceMirror: 'J',
    setupRate: { oneSide: 0.5, withMirror: 0.6556 },
    canBuild: (bag) => isNotLast(bag, 'L', ['L', 'O', 'T']),
    canBuildMirror: (bag) => isNotLast(bag, 'J', ['J', 'O', 'T']),
    priority: 1,
  },

  ms2: {
    id: 'ms2',
    nameEn: 'MS2',
    nameJa: '山岳積み2号',
    nameCn: '山岳炮',
    holdPiece: 'L',
    holdPieceMirror: 'J',
    setupRate: { oneSide: 0.6667, withMirror: 1.0 },
    canBuild: (bag) => appearsBefore(bag, 'J', 'S'),
    canBuildMirror: (bag) => appearsBefore(bag, 'L', 'Z'),
    priority: 2,
  },

  gamushiro: {
    id: 'gamushiro',
    nameEn: 'Gamushiro',
    nameJa: 'ガムシロ積み',
    nameCn: '糖漿炮',
    holdPiece: 'L',
    holdPieceMirror: 'J',
    setupRate: { oneSide: 0.6667, withMirror: 1.0 },
    canBuild: (bag) => appearsBefore(bag, 'J', 'S'),
    canBuildMirror: (bag) => appearsBefore(bag, 'L', 'Z'),
    priority: 3,
  },

  stray_cannon: {
    id: 'stray_cannon',
    nameEn: 'Stray Cannon',
    nameJa: '迷走砲',
    nameCn: '迷走炮',
    holdPiece: 'Z',
    holdPieceMirror: 'S',
    setupRate: { oneSide: 0.6667, withMirror: 0.8333 },
    canBuild: (bag) => isNotLast(bag, 'L', ['L', 'J', 'S']),
    canBuildMirror: (bag) => isNotLast(bag, 'J', ['J', 'L', 'Z']),
    priority: 4,
  },
};

/** Priority-sorted list of opener IDs (lowest priority number = highest priority). */
const PRIORITY_ORDER: OpenerID[] = (['honey_cup', 'ms2', 'gamushiro', 'stray_cannon'] as const).slice();

/**
 * Select the best opener for a given bag, checking in priority order.
 * Also collects all alternative openers that could be built from this bag.
 * When Gamushiro and MS2 are both buildable, both appear as alternatives to each other.
 */
export function bestOpener(
  bag: PieceType[],
): { opener: OpenerDefinition; mirror: boolean; alternatives: OpenerID[] } {
  // Collect all buildable openers (id + mirror flag)
  const buildable: { id: OpenerID; mirror: boolean }[] = [];

  for (const id of PRIORITY_ORDER) {
    const def = OPENERS[id];
    if (def.canBuild(bag)) {
      buildable.push({ id, mirror: false });
    } else if (def.canBuildMirror(bag)) {
      buildable.push({ id, mirror: true });
    }
  }

  if (buildable.length === 0) {
    // Fallback: return the lowest-priority opener as non-mirror with empty alternatives
    const fallback = OPENERS.stray_cannon;
    return { opener: fallback, mirror: false, alternatives: [] };
  }

  const best = buildable[0]!;
  const alternatives = buildable
    .filter((b) => b.id !== best.id)
    .map((b) => b.id);

  return {
    opener: OPENERS[best.id],
    mirror: best.mirror,
    alternatives,
  };
}
