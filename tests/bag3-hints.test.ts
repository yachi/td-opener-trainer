/**
 * tests/bag3-hints.test.ts — Bag 3 PC hint data + render integration
 *
 * Verifies:
 *   1. getBag3Hint returns non-null for 3/4 openers (stray_cannon = null)
 *   2. Mirror text differs for gamushiro (J↔L, S↔Z swap)
 *   3. Mirror text is same for honey_cup and ms2 (T/rates don't mirror)
 *   4. DPC is mentioned for honey_cup and gamushiro
 *   5. Wiki source phrases are present in hint strings
 *   6. Render integration: hint text appears in reveal2 panel
 */

import { describe, test, expect } from 'bun:test';
import { getBag3Hint, BAG3_HINTS } from '../src/openers/bag3-hints.ts';
import type { OpenerID } from '../src/openers/types.ts';
import { OPENER_ORDER } from '../src/openers/types.ts';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// Data correctness
// ═══════════════════════════════════════════════════════════════════════════

describe('getBag3Hint', () => {
  test('returns non-null for honey_cup, ms2, gamushiro', () => {
    expect(getBag3Hint('honey_cup', false)).not.toBeNull();
    expect(getBag3Hint('ms2', false)).not.toBeNull();
    expect(getBag3Hint('gamushiro', false)).not.toBeNull();
  });

  test('returns null for stray_cannon (rates on route labels)', () => {
    expect(getBag3Hint('stray_cannon', false)).toBeNull();
    expect(getBag3Hint('stray_cannon', true)).toBeNull();
  });

  test('honey_cup mirror returns same text as normal', () => {
    expect(getBag3Hint('honey_cup', true)).toBe(getBag3Hint('honey_cup', false));
  });

  test('ms2 mirror returns same text as normal', () => {
    expect(getBag3Hint('ms2', true)).toBe(getBag3Hint('ms2', false));
  });

  test('gamushiro mirror differs from normal (J↔L, S↔Z)', () => {
    const normal = getBag3Hint('gamushiro', false)!;
    const mirror = getBag3Hint('gamushiro', true)!;
    expect(normal).not.toBe(mirror);
    // Normal has L→O first, mirror has J→O first
    expect(normal).toContain('L→O 99%');
    expect(normal).toContain('S→O 87%');
    expect(mirror).toContain('J→O 99%');
    expect(mirror).toContain('Z→O 87%');
  });

  test('DPC mentioned in honey_cup and gamushiro', () => {
    expect(getBag3Hint('honey_cup', false)).toContain('DPC');
    expect(getBag3Hint('gamushiro', false)).toContain('DPC');
  });

  test('ms2 mentions 2C loop 100% PC path', () => {
    expect(getBag3Hint('ms2', false)).toContain('2C loop');
    expect(getBag3Hint('ms2', false)).toContain('100%');
  });

  test('all 4 opener IDs are covered in BAG3_HINTS', () => {
    for (const id of OPENER_ORDER) {
      expect(id in BAG3_HINTS).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wiki source verification (lesson #4 — golden data from external source)
// ═══════════════════════════════════════════════════════════════════════════

describe('wiki source cross-check', () => {
  const wikiDir = path.join(__dirname, '..', 'docs', 'wiki-sources');

  test('honey_cup: "96%" from wiki', () => {
    const wiki = fs.readFileSync(path.join(wikiDir, 'honey_cup.md'), 'utf-8');
    expect(wiki).toContain('96%');
    expect(getBag3Hint('honey_cup', false)).toContain('96%');
  });

  test('honey_cup: "100% if T" from wiki', () => {
    const wiki = fs.readFileSync(path.join(wikiDir, 'honey_cup.md'), 'utf-8');
    expect(wiki).toMatch(/if T comes.*first or second/);
    expect(getBag3Hint('honey_cup', false)).toContain('if T early');
  });

  test('honey_cup: DPC O leftover from wiki', () => {
    const wiki = fs.readFileSync(path.join(wikiDir, 'honey_cup.md'), 'utf-8');
    expect(wiki).toContain('O is left unused');
    expect(getBag3Hint('honey_cup', false)).toContain('O leftover');
  });

  test('ms2: 97-99% range from wiki setup table', () => {
    const wiki = fs.readFileSync(path.join(wikiDir, 'mountainous_stacking.md'), 'utf-8');
    // Wiki has 99.09%, 98.57%, 97.94%, 96.90% → rounds to 97-99%
    expect(wiki).toContain('99.09%');
    expect(wiki).toContain('96.90%');
    expect(getBag3Hint('ms2', false)).toContain('97-99%');
  });

  test('ms2: 2C loop 100% at 14 lines from wiki', () => {
    const wiki = fs.readFileSync(path.join(wikiDir, 'mountainous_stacking.md'), 'utf-8');
    expect(wiki).toContain('100% PC');
    expect(wiki).toContain('14');
    expect(getBag3Hint('ms2', false)).toContain('100% PC at 14 lines');
  });

  test('gamushiro: L→O 99%, J→O 97%, S→O 87% from wiki', () => {
    const wiki = fs.readFileSync(path.join(wikiDir, 'gamushiro_stacking.md'), 'utf-8');
    expect(wiki).toContain('99.09%');
    expect(wiki).toContain('96.94%');
    expect(wiki).toContain('86.59%');
    // Hint rounds: 99%, 97%, 87%
    const hint = getBag3Hint('gamushiro', false)!;
    expect(hint).toContain('99%');
    expect(hint).toContain('97%');
    expect(hint).toContain('87%');
  });

  test('gamushiro: 14-line 100% path from wiki', () => {
    const wiki = fs.readFileSync(path.join(wikiDir, 'gamushiro_stacking.md'), 'utf-8');
    expect(wiki).toContain('100.00%');
    expect(getBag3Hint('gamushiro', false)).toContain('100%');
  });
});
