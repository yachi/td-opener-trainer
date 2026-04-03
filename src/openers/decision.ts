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

// ── Decision Piece Groups ──

export const DECISION_PIECES: Record<OpenerID, { pieces: PieceType[]; rule: string }> = {
  honey_cup: { pieces: ['L', 'O', 'T'], rule: 'L must NOT be last among L/O/T' },
  ms2: { pieces: ['J', 'L'], rule: 'J must appear before L (hold L)' },
  gamushiro: { pieces: ['J', 'L'], rule: 'J must appear before L (hold L)' },
  stray_cannon: { pieces: ['L', 'J', 'S'], rule: 'L must NOT be last among L/J/S' },
};

/** Mirror-side decision piece groups. */
const DECISION_PIECES_MIRROR: Record<OpenerID, { pieces: PieceType[]; rule: string }> = {
  honey_cup: { pieces: ['J', 'O', 'T'], rule: 'J must NOT be last among J/O/T' },
  ms2: { pieces: ['L', 'J'], rule: 'L must appear before J (hold J)' },
  gamushiro: { pieces: ['L', 'J'], rule: 'L must appear before J (hold J)' },
  stray_cannon: { pieces: ['J', 'L', 'Z'], rule: 'J must NOT be last among J/L/Z' },
};

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
    setupRate: { oneSide: 0.50, withMirror: 1.0 },
    canBuild: (bag) => appearsBefore(bag, 'J', 'L'),
    canBuildMirror: (bag) => appearsBefore(bag, 'L', 'J'),
    priority: 2,
  },

  gamushiro: {
    id: 'gamushiro',
    nameEn: 'Gamushiro',
    nameJa: 'ガムシロ積み',
    nameCn: '糖漿炮',
    holdPiece: 'L',
    holdPieceMirror: 'J',
    setupRate: { oneSide: 0.50, withMirror: 1.0 },
    canBuild: (bag) => appearsBefore(bag, 'J', 'L'),
    canBuildMirror: (bag) => appearsBefore(bag, 'L', 'J'),
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

// ── Explanation Generator ──

function ordinal(n: number): string {
  const pos = n + 1; // 0-indexed to 1-indexed
  if (pos === 1) return '1st';
  if (pos === 2) return '2nd';
  if (pos === 3) return '3rd';
  return `${pos}th`;
}

function generateExplanation(
  bag: PieceType[],
  id: OpenerID,
  mirror: boolean,
  alternatives: OpenerID[],
): string {
  const info = mirror ? DECISION_PIECES_MIRROR[id] : DECISION_PIECES[id];
  const def = OPENERS[id];
  const positions = info.pieces.map((p) => ({ piece: p, idx: indexOf(bag, p) }));

  // Build the position string like "J(2nd)" or "L(3rd)/O(5th)/T(7th)"
  const posStr = positions
    .map((p) => `${p.piece}(${ordinal(p.idx)})`)
    .join('/');

  // Determine the label
  let label = def.nameEn;
  // If MS2 is the winner and Gamushiro is in alternatives (or vice versa), show both
  if (id === 'ms2' && alternatives.includes('gamushiro')) {
    label = 'MS2 / Gamushiro';
  } else if (id === 'gamushiro' && alternatives.includes('ms2')) {
    label = 'MS2 / Gamushiro';
  }

  // For "before" rules (ms2, gamushiro): "J(2nd) before S(5th) → MS2 ✓"
  if (id === 'ms2' || id === 'gamushiro') {
    const a = positions[0]!;
    const b = positions[1]!;
    return `${a.piece}(${ordinal(a.idx)}) before ${b.piece}(${ordinal(b.idx)}) → ${label} ✓`;
  }

  // For "not last" rules (honey_cup, stray_cannon): "L(3rd) not last of L/O(5th)/T(7th) → Honey Cup ✓"
  const keyPiece = positions[0]!;
  const othersStr = positions
    .slice(1)
    .map((p) => `${p.piece}(${ordinal(p.idx)})`)
    .join('/');
  return `${keyPiece.piece}(${ordinal(keyPiece.idx)}) not last of ${othersStr} → ${label} ✓`;
}

// ── Best Opener Selection ──

export interface BestOpenerResult {
  opener: OpenerDefinition;
  mirror: boolean;
  alternatives: OpenerID[];
  decisionPieces: PieceType[];
  explanation: string;
}

/**
 * Select the best opener for a given bag, checking in priority order.
 * Also collects all alternative openers that could be built from this bag.
 * When Gamushiro and MS2 are both buildable, both appear as alternatives to each other.
 */
export function bestOpener(bag: PieceType[]): BestOpenerResult {
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
    return {
      opener: fallback,
      mirror: false,
      alternatives: [],
      decisionPieces: DECISION_PIECES.stray_cannon.pieces,
      explanation: 'No opener buildable — fallback to Stray Cannon',
    };
  }

  const best = buildable[0]!;
  const alternatives = buildable
    .filter((b) => b.id !== best.id)
    .map((b) => b.id);

  const info = best.mirror
    ? DECISION_PIECES_MIRROR[best.id]
    : DECISION_PIECES[best.id];

  return {
    opener: OPENERS[best.id],
    mirror: best.mirror,
    alternatives,
    decisionPieces: info.pieces,
    explanation: generateExplanation(bag, best.id, best.mirror, alternatives),
  };
}
