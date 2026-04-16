import type { OpenerID } from './types';

interface Bag3Hint {
  normal: string;
  mirror: string | null; // null = same as normal
}

/**
 * Bag 3 PC hint data, wiki-sourced from docs/wiki-sources/*.md.
 *
 * HC/MS2: mirror text is the same (T/rates don't change with mirror).
 * Gamushiro: mirror swaps J↔L and S↔Z per mirrorPiece().
 * Stray Cannon: null — route labels already show PC%, hint would be redundant.
 */
export const BAG3_HINTS: Record<OpenerID, Bag3Hint | null> = {
  honey_cup: {
    normal: 'Bag 3 PC ~96% (100% if T early). After PC: DPC continuation (O leftover).',
    mirror: null,
  },
  ms2: {
    normal: 'Bag 3 PC: 4 setups @ 97-99%. 2C loop: 100% PC at 14 lines.',
    mirror: null,
  },
  gamushiro: {
    normal: 'Bag 3 PC: L→O 99%, J→O 97%, S→O 87%. 14-line path: 100%. DPC after PC.',
    mirror: 'Bag 3 PC: J→O 99%, L→O 97%, Z→O 87%. 14-line path: 100%. DPC after PC.',
  },
  stray_cannon: null,
};

export function getBag3Hint(opener: OpenerID, mirror: boolean): string | null {
  const entry = BAG3_HINTS[opener];
  if (!entry) return null;
  return mirror && entry.mirror !== null ? entry.mirror : entry.normal;
}
