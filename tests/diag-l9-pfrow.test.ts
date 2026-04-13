/**
 * Phase 2.5 Empirical Proof: pfrow wiki markup parser
 *
 * Parses Hard Drop wiki pfrow templates from cached YAML files,
 * extracts Bag 2 route placement data, and validates against
 * the existing routes in bag2-routes.ts.
 *
 * This test MUST pass before adding new routes to src/.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PieceType } from '../src/core/types.ts';
import { BAG2_ROUTE_DATA } from '../src/openers/bag2-routes.ts';

// ── pfrow parser ──

/** Parse a single {{pfrow|c1|c2|...|c10}} into 10 cell values */
function parsePfrowCells(pfrow: string): (PieceType | 'G' | 'P' | null)[] {
  // Extract content between {{pfrow| and }}
  const m = pfrow.match(/\{\{pfrow\|(.+?)\}\}/);
  if (!m) return [];
  const rawCells = m[1]!.split('|');
  return rawCells.map(c => {
    const trimmed = c.trim();
    if (trimmed === '' || trimmed === '.' || trimmed === '_') return null;
    if (trimmed === 'G') return 'G';
    if (trimmed === 'P') return 'P';
    // Single-char piece type
    if (/^[IJLOSTZ]$/.test(trimmed)) return trimmed as PieceType;
    // Multi-char = Bag 1 residual overlap (LZ, LL, etc.)
    if (/^[IJLOSTZGP]{2,}$/.test(trimmed)) return 'G';
    return null;
  });
}

interface PfrowGrid {
  rows: (PieceType | 'G' | 'P' | null)[][];
  totalRows: number; // including blanks
}

/** Extract all pfstart..pfend grids from wiki source text */
function extractGrids(source: string): PfrowGrid[] {
  const grids: PfrowGrid[] = [];
  // Split on {{pfstart}} and process each block
  const blocks = source.split('{{pfstart}}');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]!;
    const endIdx = block.indexOf('{{pfend}}');
    if (endIdx === -1) continue;
    const content = block.slice(0, endIdx);

    const rows: (PieceType | 'G' | 'P' | null)[][] = [];
    let totalRows = 0;

    // Count pfrowblank
    const blankCount = (content.match(/\{\{pfrowblank\}\}/g) || []).length;
    for (let b = 0; b < blankCount; b++) {
      rows.push(new Array(10).fill(null));
      totalRows++;
    }

    // Parse pfrow entries
    const pfrowMatches = content.match(/\{\{pfrow\|[^}]+\}\}/g) || [];
    for (const pfrow of pfrowMatches) {
      rows.push(parsePfrowCells(pfrow));
      totalRows++;
    }

    grids.push({ rows, totalRows });
  }
  return grids;
}

interface WikiSection {
  title: string;
  grids: PfrowGrid[];
}

/** Split wiki source by === Section === headers */
function extractSections(source: string): WikiSection[] {
  const sections: WikiSection[] = [];
  // Split by === ... === headers
  const parts = source.split(/===\s*(.+?)\s*===/);
  // parts[0] = preamble, parts[1] = title1, parts[2] = content1, ...
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i]!.trim();
    const content = parts[i + 1] || '';
    sections.push({ title, grids: extractGrids(content) });
  }
  return sections;
}

interface ExtractedRoute {
  sectionTitle: string;
  /** Bag 2 piece placements extracted from the main grid */
  placements: { piece: PieceType; cells: { col: number; row: number }[] }[];
  /** Number of Bag 3 PC minimal grids found */
  minimalCount: number;
  /** PC percentage if found in section title */
  pcRate: string | null;
}

/** From a grid, extract Bag 2 piece cells (single-char I/J/L/O/S/T/Z, not G/P) */
function extractPlacements(
  grid: PfrowGrid,
): { piece: PieceType; cells: { col: number; row: number }[] }[] {
  const rowOffset = 20 - grid.totalRows;
  const cellMap = new Map<PieceType, { col: number; row: number }[]>();

  for (let r = 0; r < grid.rows.length; r++) {
    const row = grid.rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      if (val && val !== 'G' && val !== 'P') {
        const piece = val as PieceType;
        if (!cellMap.has(piece)) cellMap.set(piece, []);
        cellMap.get(piece)!.push({ col: c, row: rowOffset + r });
      }
    }
  }

  return Array.from(cellMap.entries()).map(([piece, cells]) => ({ piece, cells }));
}

/**
 * Identify "main" Bag 2 board grids vs. minimals/residuals.
 * Main boards have G cells (Bag 1 residual) + piece cells.
 * Minimals have G cells but are smaller (5-6 rows) and show PC solutions.
 * Residuals have only G cells (post-TST shape).
 */
function isMainBag2Grid(grid: PfrowGrid): boolean {
  let hasG = false;
  let hasPiece = false;
  const pieces = new Set<string>();
  for (const row of grid.rows) {
    for (const cell of row) {
      if (cell === 'G') hasG = true;
      if (cell && cell !== 'G' && cell !== 'P') {
        hasPiece = true;
        pieces.add(cell);
      }
    }
  }
  // Main board: has both G and pieces, ≥7 rows, ≥4 distinct piece types
  return hasG && hasPiece && grid.totalRows >= 7 && pieces.size >= 4;
}

function isMinimalGrid(grid: PfrowGrid): boolean {
  let hasG = false;
  let hasPiece = false;
  for (const row of grid.rows) {
    for (const cell of row) {
      if (cell === 'G') hasG = true;
      if (cell && cell !== 'G' && cell !== 'P') hasPiece = true;
    }
  }
  // Minimals: have G + pieces, 5-6 rows (smaller than main)
  return hasG && hasPiece && grid.totalRows <= 6;
}

// ── Load wiki source ──

function loadWikiSource(filename: string): string {
  const path = join(process.cwd(), '.playwright-cli', filename);
  const yaml = readFileSync(path, 'utf-8');
  // Content is on line 61 in a textbox element — find the long line
  const lines = yaml.split('\n');
  for (const line of lines) {
    if (line.includes('{{pfrow') || line.includes('{{pfstart}}')) {
      // Extract the actual content string (may be quoted)
      const match = line.match(/:\s*"(.+)"/);
      if (match) return match[1]!.replace(/\\"/g, '"');
      // If not quoted, the content follows after the key
      const colonIdx = line.indexOf(': ');
      if (colonIdx >= 0) return line.slice(colonIdx + 2);
      return line;
    }
  }
  throw new Error(`No pfrow content found in ${filename}`);
}

/** Split wiki source by == Section == headers (double equals, top-level) */
function extractDoubleSections(source: string): WikiSection[] {
  const sections: WikiSection[] = [];
  // Match == ... == but NOT === ... ===
  const parts = source.split(/(?<!=)==\s*([^=]+?)\s*==(?!=)/);
  // parts[0] = preamble, parts[1] = title1, parts[2] = content1, ...
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i]!.trim();
    const content = parts[i + 1] || '';
    sections.push({ title, grids: extractGrids(content) });
  }
  return sections;
}

/**
 * Extract === subsections within a specific == section's content.
 * Used for Gamushiro and MS2 which have route-specific === headers
 * nested inside a top-level == section.
 */
function extractSubsections(sectionContent: string): WikiSection[] {
  // Re-parse the raw content of a == section for === sub-headers
  // We need the raw text, not just grids, so rebuild from source
  const sections: WikiSection[] = [];
  const parts = sectionContent.split(/===\s*([^=]+?)\s*===/);
  // parts[0] = content before first ===, parts[1] = title1, parts[2] = content1, ...
  // Include the preamble (content before first ===) if it has grids
  const preambleGrids = extractGrids(parts[0] || '');
  if (preambleGrids.length > 0) {
    sections.push({ title: '(preamble)', grids: preambleGrids });
  }
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i]!.trim();
    const content = parts[i + 1] || '';
    sections.push({ title, grids: extractGrids(content) });
  }
  return sections;
}

/**
 * Get raw text content of a specific == section (for re-parsing with ===).
 * Finds the content between the target == header == and the next == header ==.
 * Properly handles nested === subsections (they stay in the content).
 */
function getDoubleSectionContent(source: string, sectionTitle: string): string {
  // Find the position of the target == header
  // Match == Title == but NOT === Title ===
  // Strategy: find all == header == positions, then extract content between them
  const headerRegex = /(?<!=)==\s*([^=]+?)\s*==(?!=)/g;
  const headers: { title: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(source)) !== null) {
    headers.push({ title: m[1]!.trim(), start: m.index, end: m.index + m[0].length });
  }

  for (let i = 0; i < headers.length; i++) {
    if (headers[i]!.title === sectionTitle) {
      const contentStart = headers[i]!.end;
      // Find next == header that is NOT a === header
      // We need to distinguish: the headers array already contains both == and === matches
      // Actually, === will match the == pattern too. So we need to post-filter.
      // Better approach: find the next header at the SAME level (==, not ===)
      const contentEnd = i + 1 < headers.length ? headers[i + 1]!.start : source.length;
      return source.slice(contentStart, contentEnd);
    }
  }
  return '';
}

// ── Tests ──

describe('pfrow parser: unit tests', () => {
  test('parses single-char pieces', () => {
    const cells = parsePfrowCells('{{pfrow| | | | | | |O|O|J|I}}');
    expect(cells).toEqual([null, null, null, null, null, null, 'O', 'O', 'J', 'I']);
  });

  test('parses G, P, and multi-char as expected', () => {
    const cells = parsePfrowCells('{{pfrow|G|S|Z|L|L|L|P|LZ|LZ|I}}');
    expect(cells[0]).toBe('G');
    expect(cells[1]).toBe('S');
    expect(cells[6]).toBe('P');
    expect(cells[7]).toBe('G'); // LZ → G
    expect(cells[8]).toBe('G'); // LZ → G
    expect(cells[9]).toBe('I');
  });

  test('handles empty/space cells', () => {
    const cells = parsePfrowCells('{{pfrow|G|G|G|G|G| |G|G|G|G}}');
    expect(cells[5]).toBeNull();
  });
});

describe('Stray Cannon wiki parsing', () => {
  const source = loadWikiSource('page-2026-04-06T09-40-11-517Z.yml');

  test('source loads and contains pfrow data', () => {
    expect(source).toContain('{{pfrow');
    expect(source).toContain('{{pfstart}}');
  });

  test('extracts 5 sections (route headers)', () => {
    const sections = extractSections(source);
    const titles = sections.map(s => s.title);
    console.log('Sections found:', titles);
    expect(sections.length).toBeGreaterThanOrEqual(5);
    // Known route titles
    expect(titles.some(t => t.includes('J>O'))).toBe(true);
    expect(titles.some(t => t.includes('S>J'))).toBe(true);
    expect(titles.some(t => t.includes('O>SJ'))).toBe(true);
    expect(titles.some(t => t.includes('S>O'))).toBe(true);
    expect(titles.some(t => t.includes('J>I'))).toBe(true);
  });

  test('identifies main Bag 2 boards per section', () => {
    const sections = extractSections(source);
    for (const sec of sections) {
      const mains = sec.grids.filter(isMainBag2Grid);
      const minimals = sec.grids.filter(isMinimalGrid);
      console.log(
        `  ${sec.title}: ${sec.grids.length} grids total, ` +
          `${mains.length} main boards, ${minimals.length} minimals`,
      );
    }
  });
});

describe('Stray Cannon: validate existing routes', () => {
  const source = loadWikiSource('page-2026-04-06T09-40-11-517Z.yml');
  const sections = extractSections(source);
  const existingRoutes = BAG2_ROUTE_DATA.stray_cannon.routes;

  test('J>O route: parser matches existing placement data', () => {
    const joSection = sections.find(s => s.title.includes('J>O'));
    expect(joSection).toBeDefined();
    const mains = joSection!.grids.filter(isMainBag2Grid);
    expect(mains.length).toBeGreaterThanOrEqual(1);

    const parsed = extractPlacements(mains[0]!);
    const existing = existingRoutes[0]!; // j_before_o

    // Compare piece types present
    const parsedPieces = new Set(parsed.map(p => p.piece));
    const existingPieces = new Set(existing.placements.map(p => p.piece));
    console.log('Parsed pieces:', [...parsedPieces].sort().join(','));
    console.log('Existing pieces:', [...existingPieces].sort().join(','));

    // All existing pieces should be in parsed (parser may find more due to hold piece)
    for (const p of existingPieces) {
      expect(parsedPieces.has(p)).toBe(true);
    }

    // Validate cell positions for each piece
    for (const ep of existing.placements) {
      const pp = parsed.find(p => p.piece === ep.piece);
      expect(pp).toBeDefined();
      if (pp) {
        const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
        const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
        console.log(`  ${ep.piece}: existing=${eCells.join('|')} parsed=${pCells.join('|')}`);
        expect(pCells).toEqual(eCells);
      }
    }
  });

  test('S>J route: parser matches existing placement data', () => {
    const sjSection = sections.find(s => s.title.includes('S>J'));
    expect(sjSection).toBeDefined();
    const mains = sjSection!.grids.filter(isMainBag2Grid);
    expect(mains.length).toBeGreaterThanOrEqual(1);

    const parsed = extractPlacements(mains[0]!);
    const existing = existingRoutes[1]!; // s_before_j

    for (const ep of existing.placements) {
      const pp = parsed.find(p => p.piece === ep.piece);
      expect(pp).toBeDefined();
      if (pp) {
        const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
        const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
        console.log(`  ${ep.piece}: existing=${eCells.join('|')} parsed=${pCells.join('|')}`);
        expect(pCells).toEqual(eCells);
      }
    }
  });
});

describe('Stray Cannon: extract MISSING routes', () => {
  const source = loadWikiSource('page-2026-04-06T09-40-11-517Z.yml');
  const sections = extractSections(source);

  for (const routeName of ['O>SJ', 'S>O', 'J>I']) {
    test(`${routeName}: extract placement data`, () => {
      const sec = sections.find(s => s.title.includes(routeName));
      expect(sec).toBeDefined();
      if (!sec) return;

      const mains = sec.grids.filter(isMainBag2Grid);
      const minimals = sec.grids.filter(isMinimalGrid);

      console.log(`\n=== ${sec.title} ===`);
      console.log(`  Main boards: ${mains.length}, Minimals: ${minimals.length}`);

      for (let gi = 0; gi < mains.length; gi++) {
        const placements = extractPlacements(mains[gi]!);
        console.log(`  Board ${gi}:`);
        for (const p of placements) {
          const cells = p.cells.map(c => `{col:${c.col},row:${c.row}}`).join(', ');
          console.log(`    ${p.piece}: [${cells}]`);
        }
      }

      console.log(`  Bag 3 minimals: ${minimals.length}`);
      for (let mi = 0; mi < Math.min(minimals.length, 2); mi++) {
        const placements = extractPlacements(minimals[mi]!);
        const pieces = placements.map(p => p.piece).sort().join(',');
        console.log(`    Minimal ${mi}: pieces=[${pieces}]`);
      }

      // Every main board should have ≥5 distinct piece types
      for (const main of mains) {
        const placements = extractPlacements(main);
        expect(placements.length).toBeGreaterThanOrEqual(5);
      }
    });
  }
});

describe('Bag 3 PC minimals: count per route', () => {
  const source = loadWikiSource('page-2026-04-06T09-40-11-517Z.yml');
  const sections = extractSections(source);

  test('each route section has Bag 3 PC minimals', () => {
    for (const sec of sections) {
      const minimals = sec.grids.filter(isMinimalGrid);
      console.log(`${sec.title}: ${minimals.length} Bag 3 minimals`);
      // At least the implemented routes should have minimals
      if (sec.title.includes('J>O') || sec.title.includes('S>J')) {
        expect(minimals.length).toBeGreaterThan(0);
      }
    }
  });
});

// ════════════════════════════════════════════════════════
// Honey Cup wiki parsing
// ════════════════════════════════════════════════════════

describe('Honey Cup wiki parsing', () => {
  const source = loadWikiSource('page-2026-04-06T09-39-06-091Z.yml');

  test('source loads and contains pfrow data', () => {
    expect(source).toContain('{{pfrow');
    expect(source).toContain('{{pfstart}}');
  });

  test('extracts == sections including "Second Bag"', () => {
    const sections = extractDoubleSections(source);
    const titles = sections.map(s => s.title);
    console.log('Honey Cup == sections:', titles);
    expect(titles).toContain('Second Bag');
    expect(titles).toContain('Honey Cup');
    expect(titles).toContain('Third Bag');
  });

  test('Second Bag section has grids with main boards', () => {
    const sections = extractDoubleSections(source);
    const bag2Section = sections.find(s => s.title === 'Second Bag');
    expect(bag2Section).toBeDefined();

    console.log(`\nHoney Cup Second Bag: ${bag2Section!.grids.length} total grids`);
    for (let i = 0; i < bag2Section!.grids.length; i++) {
      const g = bag2Section!.grids[i]!;
      const isMain = isMainBag2Grid(g);
      const isMin = isMinimalGrid(g);
      const pieces = new Set<string>();
      let hasG = false;
      for (const row of g.rows) {
        for (const cell of row) {
          if (cell === 'G') hasG = true;
          if (cell && cell !== 'G' && cell !== 'P') pieces.add(cell);
        }
      }
      console.log(
        `  Grid ${i}: ${g.totalRows} rows, G=${hasG}, pieces=[${[...pieces].sort().join(',')}], ` +
          `main=${isMain}, minimal=${isMin}`,
      );
    }
  });
});

describe('Honey Cup: validate existing routes', () => {
  const source = loadWikiSource('page-2026-04-06T09-39-06-091Z.yml');
  const sections = extractDoubleSections(source);
  const bag2Section = sections.find(s => s.title === 'Second Bag')!;
  const existingRoutes = BAG2_ROUTE_DATA.honey_cup.routes;

  test('Standard route (ideal): parser matches existing placement data', () => {
    // The first main board in "Second Bag" should be the standard/ideal route
    const mains = bag2Section.grids.filter(isMainBag2Grid);
    expect(mains.length).toBeGreaterThanOrEqual(1);

    const parsed = extractPlacements(mains[0]!);
    const existing = existingRoutes[0]!; // ideal

    console.log('\nHoney Cup Standard route validation:');
    const parsedPieces = new Set(parsed.map(p => p.piece));
    const existingPieces = new Set(existing.placements.map(p => p.piece));
    console.log('  Parsed pieces:', [...parsedPieces].sort().join(','));
    console.log('  Existing pieces:', [...existingPieces].sort().join(','));

    for (const p of existingPieces) {
      expect(parsedPieces.has(p)).toBe(true);
    }

    for (const ep of existing.placements) {
      const pp = parsed.find(p => p.piece === ep.piece);
      expect(pp).toBeDefined();
      if (pp) {
        const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
        const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
        console.log(`  ${ep.piece}: existing=${eCells.join('|')} parsed=${pCells.join('|')}`);
        expect(pCells).toEqual(eCells);
      }
    }
  });

  test('Alt I-left route (alt_i_left): parser matches existing placement data', () => {
    // The second main board should be the alt route (I vertical on left)
    const mains = bag2Section.grids.filter(isMainBag2Grid);
    expect(mains.length).toBeGreaterThanOrEqual(2);

    const parsed = extractPlacements(mains[1]!);
    const existing = existingRoutes[1]!; // alt_i_left

    console.log('\nHoney Cup Alt I-left route validation:');
    for (const ep of existing.placements) {
      const pp = parsed.find(p => p.piece === ep.piece);
      expect(pp).toBeDefined();
      if (pp) {
        const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
        const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
        console.log(`  ${ep.piece}: existing=${eCells.join('|')} parsed=${pCells.join('|')}`);
        expect(pCells).toEqual(eCells);
      }
    }
  });
});

describe('Honey Cup: extract MISSING routes', () => {
  const source = loadWikiSource('page-2026-04-06T09-39-06-091Z.yml');
  const sections = extractDoubleSections(source);
  const bag2Section = sections.find(s => s.title === 'Second Bag')!;
  const mains = bag2Section.grids.filter(isMainBag2Grid);

  test('identify all main Bag 2 boards', () => {
    console.log(`\nHoney Cup Second Bag: ${mains.length} main boards found`);
    // Print all main boards' placements
    for (let gi = 0; gi < mains.length; gi++) {
      const placements = extractPlacements(mains[gi]!);
      console.log(`\n  Board ${gi} (${mains[gi]!.totalRows} rows):`);
      for (const p of placements) {
        const cells = p.cells.map(c => `{col:${c.col},row:${c.row}}`).join(', ');
        console.log(`    ${p.piece}: [${cells}]`);
      }
    }
    expect(mains.length).toBeGreaterThanOrEqual(2);
  });

  test('extract missing routes (boards beyond the first 2)', () => {
    // First 2 are validated above. Print the rest as missing routes.
    console.log(`\n=== Honey Cup: Missing Route Boards ===`);
    for (let gi = 2; gi < mains.length; gi++) {
      const placements = extractPlacements(mains[gi]!);
      console.log(`\n  Missing Board ${gi} (${mains[gi]!.totalRows} rows):`);
      for (const p of placements) {
        const cells = p.cells.map(c => `{col:${c.col},row:${c.row}}`).join(', ');
        console.log(`    ${p.piece}: [${cells}]`);
      }
      // Every main board should have ≥5 distinct piece types
      expect(placements.length).toBeGreaterThanOrEqual(5);
    }
  });

  test('Bag 3 minimals count', () => {
    const minimals = bag2Section.grids.filter(isMinimalGrid);
    console.log(`\nHoney Cup Bag 3 minimals: ${minimals.length}`);
    for (let mi = 0; mi < Math.min(minimals.length, 3); mi++) {
      const placements = extractPlacements(minimals[mi]!);
      const pieces = placements.map(p => p.piece).sort().join(',');
      console.log(`  Minimal ${mi}: pieces=[${pieces}], rows=${minimals[mi]!.totalRows}`);
    }
  });

  test('Third Bag section has PC minimals', () => {
    const thirdBag = sections.find(s => s.title === 'Third Bag')!;
    expect(thirdBag).toBeDefined();
    const minimals = thirdBag.grids.filter(isMinimalGrid);
    const mains3 = thirdBag.grids.filter(isMainBag2Grid);
    console.log(
      `\nHoney Cup Third Bag: ${thirdBag.grids.length} grids total, ` +
        `${mains3.length} main-like, ${minimals.length} minimals`,
    );
  });
});

// ════════════════════════════════════════════════════════
// Gamushiro wiki parsing
// ════════════════════════════════════════════════════════
// NOTE: Gamushiro wiki has == Second Bag == with a FLAT grid list (5 grids, no === subsections).
// The === Form A/B/C/D === headers are in "Third Bag and later (Other continuations)" section
// and represent Bag 3+ continuation patterns, NOT Bag 2 routes.

describe('Gamushiro wiki parsing', () => {
  const source = loadWikiSource('page-2026-04-06T09-40-18-051Z.yml');

  test('source loads and contains pfrow data', () => {
    expect(source).toContain('{{pfrow');
    expect(source).toContain('{{pfstart}}');
  });

  test('extracts == "Second Bag" section with flat grid list', () => {
    const sections = extractDoubleSections(source);
    const titles = sections.map(s => s.title);
    console.log('Gamushiro == sections:', titles);
    expect(titles).toContain('Second Bag');

    const bag2 = sections.find(s => s.title === 'Second Bag')!;
    console.log(`\nGamushiro Second Bag: ${bag2.grids.length} total grids`);
    for (let i = 0; i < bag2.grids.length; i++) {
      const g = bag2.grids[i]!;
      const isMain = isMainBag2Grid(g);
      const isMin = isMinimalGrid(g);
      const pieces = new Set<string>();
      let hasG = false;
      for (const row of g.rows) {
        for (const cell of row) {
          if (cell === 'G') hasG = true;
          if (cell && cell !== 'G' && cell !== 'P') pieces.add(cell);
        }
      }
      console.log(
        `  Grid ${i}: ${g.totalRows} rows, G=${hasG}, pieces=[${[...pieces].sort().join(',')}], ` +
          `main=${isMain}, minimal=${isMin}`,
      );
    }
  });

  test('Form headers are in "Third Bag and later" section, not "Second Bag"', () => {
    const bag2Content = getDoubleSectionContent(source, 'Second Bag');
    expect(bag2Content.includes('===')).toBe(false);

    const thirdContent = getDoubleSectionContent(source, 'Third Bag and later (Other continuations)');
    const subs = extractSubsections(thirdContent);
    const titles = subs.map(s => s.title);
    console.log('Gamushiro "Third Bag and later" subsections:', titles);
    expect(titles.some(t => t.includes('Form A'))).toBe(true);
    expect(titles.some(t => t.includes('Form B'))).toBe(true);
  });
});

describe('Gamushiro: validate existing routes', () => {
  const source = loadWikiSource('page-2026-04-06T09-40-18-051Z.yml');
  const sections = extractDoubleSections(source);
  const bag2 = sections.find(s => s.title === 'Second Bag')!;
  const mains = bag2.grids.filter(isMainBag2Grid);
  const existingRoutes = BAG2_ROUTE_DATA.gamushiro.routes;

  test('form_1 (L→O): matches a main board in Second Bag', () => {
    const existing = existingRoutes[0]!; // form_1
    let matched = false;

    console.log(`\nGamushiro form_1 validation: checking ${mains.length} main boards`);
    for (let gi = 0; gi < mains.length; gi++) {
      const parsed = extractPlacements(mains[gi]!);
      let allMatch = true;
      for (const ep of existing.placements) {
        const pp = parsed.find(p => p.piece === ep.piece);
        if (!pp) { allMatch = false; break; }
        const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
        const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
        if (JSON.stringify(eCells) !== JSON.stringify(pCells)) { allMatch = false; break; }
      }
      if (allMatch) {
        console.log(`  Board ${gi} matches form_1`);
        matched = true;
        for (const ep of existing.placements) {
          const pp = parsed.find(p => p.piece === ep.piece)!;
          const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
          console.log(`    ${ep.piece}: ${eCells.join('|')}`);
        }
        break;
      } else {
        const parsedPieces = parsed.map(p => p.piece).sort().join(',');
        console.log(`  Board ${gi}: [${parsedPieces}] no match`);
      }
    }
    expect(matched).toBe(true);
  });

  test('form_2 (O at bottom): matches a main board in Second Bag', () => {
    const existing = existingRoutes[1]!; // form_2
    let matched = false;

    console.log(`\nGamushiro form_2 validation: checking ${mains.length} main boards`);
    for (let gi = 0; gi < mains.length; gi++) {
      const parsed = extractPlacements(mains[gi]!);
      let allMatch = true;
      for (const ep of existing.placements) {
        const pp = parsed.find(p => p.piece === ep.piece);
        if (!pp) { allMatch = false; break; }
        const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
        const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
        if (JSON.stringify(eCells) !== JSON.stringify(pCells)) { allMatch = false; break; }
      }
      if (allMatch) {
        console.log(`  Board ${gi} matches form_2`);
        matched = true;
        for (const ep of existing.placements) {
          const pp = parsed.find(p => p.piece === ep.piece)!;
          const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
          console.log(`    ${ep.piece}: ${eCells.join('|')}`);
        }
        break;
      }
    }
    expect(matched).toBe(true);
  });
});

describe('Gamushiro: extract MISSING routes', () => {
  const source = loadWikiSource('page-2026-04-06T09-40-18-051Z.yml');
  const sections = extractDoubleSections(source);
  const bag2 = sections.find(s => s.title === 'Second Bag')!;
  const mains = bag2.grids.filter(isMainBag2Grid);
  const existingRoutes = BAG2_ROUTE_DATA.gamushiro.routes;

  test('identify all Bag 2 boards and extract missing ones', () => {
    console.log(`\nGamushiro Second Bag: ${mains.length} main boards`);

    for (let gi = 0; gi < mains.length; gi++) {
      const parsed = extractPlacements(mains[gi]!);
      let matchedRoute: string | null = null;
      for (const existing of existingRoutes) {
        let allMatch = true;
        for (const ep of existing.placements) {
          const pp = parsed.find(p => p.piece === ep.piece);
          if (!pp) { allMatch = false; break; }
          const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
          const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
          if (JSON.stringify(eCells) !== JSON.stringify(pCells)) { allMatch = false; break; }
        }
        if (allMatch) { matchedRoute = existing.routeId; break; }
      }

      if (matchedRoute) {
        console.log(`  Board ${gi}: MATCHES ${matchedRoute}`);
      } else {
        console.log(`  Board ${gi}: *** MISSING ROUTE ***`);
        for (const p of parsed) {
          const cells = p.cells.map(c => `{col:${c.col},row:${c.row}}`).join(', ');
          console.log(`    ${p.piece}: [${cells}]`);
        }
      }
    }
  });

  test('Bag 3 minimals and continuation forms count', () => {
    const minimals = bag2.grids.filter(isMinimalGrid);
    console.log(`\nGamushiro Second Bag minimals: ${minimals.length}`);

    // Also check Third Bag section
    const thirdBag = sections.find(s => s.title === 'Third Bag (Perfect Clear)')!;
    if (thirdBag) {
      const thirdMinimals = thirdBag.grids.filter(isMinimalGrid);
      const thirdMains = thirdBag.grids.filter(isMainBag2Grid);
      console.log(
        `Gamushiro Third Bag: ${thirdBag.grids.length} grids, ` +
          `${thirdMains.length} main, ${thirdMinimals.length} minimals`,
      );
    }

    // Continuation forms in "Third Bag and later"
    const contContent = getDoubleSectionContent(source, 'Third Bag and later (Other continuations)');
    const contSubs = extractSubsections(contContent);
    console.log('\nGamushiro continuation forms:');
    for (const sec of contSubs) {
      const secMains = sec.grids.filter(isMainBag2Grid);
      const secMinimals = sec.grids.filter(isMinimalGrid);
      console.log(`  ${sec.title}: ${sec.grids.length} grids, ${secMains.length} main, ${secMinimals.length} minimals`);
    }
  });
});

// ════════════════════════════════════════════════════════
// MS2 wiki parsing
// ════════════════════════════════════════════════════════
// NOTE: The MS2 wiki page is "Mountainous Stacking" which covers MS1, MS2, MS3.
// - MS1: == First Bag == and == Second Bag and later ==
// - MS2: == Mountainous Stacking 2 == (with === subsections)
// - MS3: == Mountainous Stacking 3 ==
// MS2 Bag 2 routes are in the == Mountainous Stacking 2 == section.
// Also check == Second Bag and later == (MS1) since existing routes may overlap.

describe('MS2 wiki parsing', () => {
  const source = loadWikiSource('page-2026-04-06T09-41-20-334Z.yml');

  test('source loads and contains pfrow data', () => {
    expect(source).toContain('{{pfrow');
    expect(source).toContain('{{pfstart}}');
  });

  test('extracts == sections for MS1, MS2, MS3', () => {
    const sections = extractDoubleSections(source);
    const titles = sections.map(s => s.title);
    console.log('MS2 wiki == sections:', titles);
    expect(titles).toContain('Mountainous Stacking 2');
    expect(titles).toContain('Second Bag and later'); // MS1
  });

  test('MS2 section and MS1 "Second Bag and later" grid analysis', () => {
    // MS1 "Second Bag and later"
    const ms1Content = getDoubleSectionContent(source, 'Second Bag and later');
    const ms1Subs = extractSubsections(ms1Content);
    console.log('\nMS1 "Second Bag and later" subsections:');
    for (const sec of ms1Subs) {
      const mains = sec.grids.filter(isMainBag2Grid);
      const minimals = sec.grids.filter(isMinimalGrid);
      console.log(
        `  ${sec.title}: ${sec.grids.length} grids, ` +
          `${mains.length} main, ${minimals.length} minimals`,
      );
      for (let i = 0; i < Math.min(sec.grids.length, 3); i++) {
        const g = sec.grids[i]!;
        const pieces = new Set<string>();
        let hasG = false;
        for (const row of g.rows) {
          for (const cell of row) {
            if (cell === 'G') hasG = true;
            if (cell && cell !== 'G' && cell !== 'P') pieces.add(cell);
          }
        }
        console.log(
          `    Grid ${i}: ${g.totalRows} rows, G=${hasG}, pieces=[${[...pieces].sort().join(',')}]`,
        );
      }
    }

    // MS2
    const ms2Content = getDoubleSectionContent(source, 'Mountainous Stacking 2');
    const ms2Subs = extractSubsections(ms2Content);
    console.log('\nMS2 "Mountainous Stacking 2" subsections:');
    for (const sec of ms2Subs) {
      const mains = sec.grids.filter(isMainBag2Grid);
      const minimals = sec.grids.filter(isMinimalGrid);
      console.log(
        `  ${sec.title}: ${sec.grids.length} grids, ` +
          `${mains.length} main, ${minimals.length} minimals`,
      );
    }
  });
});

describe('MS2: validate existing routes', () => {
  const source = loadWikiSource('page-2026-04-06T09-41-20-334Z.yml');
  const existingRoutes = BAG2_ROUTE_DATA.ms2.routes;

  // Collect ALL main boards from both MS1 and MS2 sections
  function getAllMainBoards(): { section: string; grid: PfrowGrid; index: number }[] {
    const allMains: { section: string; grid: PfrowGrid; index: number }[] = [];

    // MS1 "Second Bag and later"
    const ms1Content = getDoubleSectionContent(source, 'Second Bag and later');
    const ms1Subs = extractSubsections(ms1Content);
    for (const sec of ms1Subs) {
      const mains = sec.grids.filter(isMainBag2Grid);
      for (let i = 0; i < mains.length; i++) {
        allMains.push({ section: `MS1/${sec.title}`, grid: mains[i]!, index: i });
      }
    }

    // MS2 "Mountainous Stacking 2"
    const ms2Content = getDoubleSectionContent(source, 'Mountainous Stacking 2');
    const ms2Subs = extractSubsections(ms2Content);
    for (const sec of ms2Subs) {
      const mains = sec.grids.filter(isMainBag2Grid);
      for (let i = 0; i < mains.length; i++) {
        allMains.push({ section: `MS2/${sec.title}`, grid: mains[i]!, index: i });
      }
    }

    return allMains;
  }

  test('Setup A (O early): matches a board in wiki', () => {
    const allMains = getAllMainBoards();
    const existing = existingRoutes[0]!; // setup_a
    let matched = false;

    console.log(`\nMS2 Setup A validation: searching ${allMains.length} main boards`);
    for (const m of allMains) {
      const parsed = extractPlacements(m.grid);
      let allMatch = true;
      for (const ep of existing.placements) {
        const pp = parsed.find(p => p.piece === ep.piece);
        if (!pp) { allMatch = false; break; }
        const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
        const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
        if (JSON.stringify(eCells) !== JSON.stringify(pCells)) { allMatch = false; break; }
      }
      if (allMatch) {
        console.log(`  Board [${m.section} #${m.index}] matches setup_a`);
        for (const ep of existing.placements) {
          const pp = parsed.find(p => p.piece === ep.piece)!;
          const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
          console.log(`    ${ep.piece}: ${eCells.join('|')}`);
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Print first 5 boards for debugging
      console.log('  No match found. First 5 boards:');
      for (let i = 0; i < Math.min(5, allMains.length); i++) {
        const m = allMains[i]!;
        const parsed = extractPlacements(m.grid);
        console.log(`  [${m.section} #${m.index}]: ${parsed.map(p => p.piece).sort().join(',')}`);
        for (const ep of existing.placements) {
          const pp = parsed.find(p => p.piece === ep.piece);
          if (pp) {
            const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
            const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
            const ok = JSON.stringify(eCells) === JSON.stringify(pCells);
            if (!ok) console.log(`    ${ep.piece}: MISMATCH e=${eCells.join('|')} p=${pCells.join('|')}`);
          } else {
            console.log(`    ${ep.piece}: MISSING`);
          }
        }
      }
    }

    expect(matched).toBe(true);
  });

  test('Setup B (L before I/J): matches a board in wiki', () => {
    const allMains = getAllMainBoards();
    const existing = existingRoutes[1]!; // setup_b
    let matched = false;

    console.log(`\nMS2 Setup B validation: searching ${allMains.length} main boards`);
    for (const m of allMains) {
      const parsed = extractPlacements(m.grid);
      let allMatch = true;
      for (const ep of existing.placements) {
        const pp = parsed.find(p => p.piece === ep.piece);
        if (!pp) { allMatch = false; break; }
        const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
        const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
        if (JSON.stringify(eCells) !== JSON.stringify(pCells)) { allMatch = false; break; }
      }
      if (allMatch) {
        console.log(`  Board [${m.section} #${m.index}] matches setup_b`);
        for (const ep of existing.placements) {
          const pp = parsed.find(p => p.piece === ep.piece)!;
          const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
          console.log(`    ${ep.piece}: ${eCells.join('|')}`);
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      console.log('  No match found. First 5 boards:');
      for (let i = 0; i < Math.min(5, allMains.length); i++) {
        const m = allMains[i]!;
        const parsed = extractPlacements(m.grid);
        console.log(`  [${m.section} #${m.index}]: ${parsed.map(p => p.piece).sort().join(',')}`);
        for (const ep of existing.placements) {
          const pp = parsed.find(p => p.piece === ep.piece);
          if (pp) {
            const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
            const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
            const ok = JSON.stringify(eCells) === JSON.stringify(pCells);
            if (!ok) console.log(`    ${ep.piece}: MISMATCH e=${eCells.join('|')} p=${pCells.join('|')}`);
          } else {
            console.log(`    ${ep.piece}: MISSING`);
          }
        }
      }
    }

    expect(matched).toBe(true);
  });
});

describe('MS2: extract MISSING routes', () => {
  const source = loadWikiSource('page-2026-04-06T09-41-20-334Z.yml');
  const existingRoutes = BAG2_ROUTE_DATA.ms2.routes;

  test('identify all Bag 2 boards from MS2 section and find missing ones', () => {
    const ms2Content = getDoubleSectionContent(source, 'Mountainous Stacking 2');
    const ms2Subs = extractSubsections(ms2Content);

    // Also check MS1 section
    const ms1Content = getDoubleSectionContent(source, 'Second Bag and later');
    const ms1Subs = extractSubsections(ms1Content);

    const allSections = [
      ...ms1Subs.map(s => ({ ...s, prefix: 'MS1' })),
      ...ms2Subs.map(s => ({ ...s, prefix: 'MS2' })),
    ];

    let missingCount = 0;

    for (const sec of allSections) {
      const mains = sec.grids.filter(isMainBag2Grid);
      if (mains.length === 0) continue;

      console.log(`\n  ${sec.prefix}/${sec.title}: ${mains.length} main boards`);
      for (let gi = 0; gi < mains.length; gi++) {
        const parsed = extractPlacements(mains[gi]!);
        let matchedRoute: string | null = null;

        for (const existing of existingRoutes) {
          let allMatch = true;
          for (const ep of existing.placements) {
            const pp = parsed.find(p => p.piece === ep.piece);
            if (!pp) { allMatch = false; break; }
            const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
            const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
            if (JSON.stringify(eCells) !== JSON.stringify(pCells)) { allMatch = false; break; }
          }
          if (allMatch) { matchedRoute = existing.routeId; break; }
        }

        if (matchedRoute) {
          console.log(`    Board ${gi}: MATCHES ${matchedRoute}`);
        } else {
          console.log(`    Board ${gi}: *** MISSING ***`);
          for (const p of parsed) {
            const cells = p.cells.map(c => `{col:${c.col},row:${c.row}}`).join(', ');
            console.log(`      ${p.piece}: [${cells}]`);
          }
          missingCount++;
        }
      }
    }

    console.log(`\n  Total missing MS2 routes: ${missingCount}`);
  });

  test('Bag 3 minimals count per section', () => {
    const ms2Content = getDoubleSectionContent(source, 'Mountainous Stacking 2');
    const ms2Subs = extractSubsections(ms2Content);
    const ms1Content = getDoubleSectionContent(source, 'Second Bag and later');
    const ms1Subs = extractSubsections(ms1Content);

    console.log('\nMS minimals per subsection:');
    for (const sec of [...ms1Subs.map(s => ({ ...s, p: 'MS1' })), ...ms2Subs.map(s => ({ ...s, p: 'MS2' }))]) {
      const minimals = sec.grids.filter(isMinimalGrid);
      if (minimals.length > 0 || sec.grids.length > 0) {
        console.log(`  ${sec.p}/${sec.title}: ${minimals.length} minimals (of ${sec.grids.length} grids)`);
      }
    }
  });
});

// ════════════════════════════════════════════════════════
// Summary: extract ALL missing routes from all 4 openers
// ════════════════════════════════════════════════════════

describe('Summary: all openers missing route extraction', () => {
  test('print formatted summary of all extracted routes', () => {
    const results: {
      opener: string;
      routeLabel: string;
      placements: { piece: PieceType; cells: { col: number; row: number }[] }[];
      minimalCount: number;
    }[] = [];

    // ── Stray Cannon (already done, re-extract for summary) ──
    const scSource = loadWikiSource('page-2026-04-06T09-40-11-517Z.yml');
    const scSections = extractSections(scSource);
    for (const routeName of ['O>SJ', 'S>O', 'J>I']) {
      const sec = scSections.find(s => s.title.includes(routeName));
      if (!sec) continue;
      const mains = sec.grids.filter(isMainBag2Grid);
      const minimals = sec.grids.filter(isMinimalGrid);
      for (let gi = 0; gi < mains.length; gi++) {
        results.push({
          opener: 'stray_cannon',
          routeLabel: `${sec.title} [${gi}]`,
          placements: extractPlacements(mains[gi]!),
          minimalCount: gi === 0 ? minimals.length : 0,
        });
      }
    }

    // ── Honey Cup ──
    const hcSource = loadWikiSource('page-2026-04-06T09-39-06-091Z.yml');
    const hcSections = extractDoubleSections(hcSource);
    const hcBag2 = hcSections.find(s => s.title === 'Second Bag')!;
    const hcMains = hcBag2.grids.filter(isMainBag2Grid);
    const hcMinimals = hcBag2.grids.filter(isMinimalGrid);
    for (let gi = 2; gi < hcMains.length; gi++) {
      results.push({
        opener: 'honey_cup',
        routeLabel: `Second Bag board ${gi}`,
        placements: extractPlacements(hcMains[gi]!),
        minimalCount: gi === 2 ? hcMinimals.length : 0,
      });
    }

    // ── Gamushiro ──
    // Gamushiro has flat grid list in == Second Bag == (no === subsections)
    const gsSource = loadWikiSource('page-2026-04-06T09-40-18-051Z.yml');
    const gsSections = extractDoubleSections(gsSource);
    const gsBag2 = gsSections.find(s => s.title === 'Second Bag')!;
    const gsMains = gsBag2.grids.filter(isMainBag2Grid);
    const gsMinimals = gsBag2.grids.filter(isMinimalGrid);
    const gsExisting = BAG2_ROUTE_DATA.gamushiro.routes;
    for (let gi = 0; gi < gsMains.length; gi++) {
      const parsed = extractPlacements(gsMains[gi]!);
      let isExisting = false;
      for (const existing of gsExisting) {
        let allMatch = true;
        for (const ep of existing.placements) {
          const pp = parsed.find(p => p.piece === ep.piece);
          if (!pp) { allMatch = false; break; }
          const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
          const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
          if (JSON.stringify(eCells) !== JSON.stringify(pCells)) { allMatch = false; break; }
        }
        if (allMatch) { isExisting = true; break; }
      }
      if (!isExisting) {
        results.push({
          opener: 'gamushiro',
          routeLabel: `Second Bag board ${gi}`,
          placements: parsed,
          minimalCount: gi === 0 ? gsMinimals.length : 0,
        });
      }
    }

    // ── MS2 ──
    const ms2Source = loadWikiSource('page-2026-04-06T09-41-20-334Z.yml');
    const ms2Content = getDoubleSectionContent(ms2Source, 'Mountainous Stacking 2');
    const ms2Subs = extractSubsections(ms2Content);
    const ms2Existing = BAG2_ROUTE_DATA.ms2.routes;
    for (const sec of ms2Subs) {
      const mains = sec.grids.filter(isMainBag2Grid);
      const minimals = sec.grids.filter(isMinimalGrid);
      for (let gi = 0; gi < mains.length; gi++) {
        const parsed = extractPlacements(mains[gi]!);
        // Check if it matches an existing route
        let isExisting = false;
        for (const existing of ms2Existing) {
          let allMatch = true;
          for (const ep of existing.placements) {
            const pp = parsed.find(p => p.piece === ep.piece);
            if (!pp) { allMatch = false; break; }
            const eCells = ep.cells.map(c => `${c.col},${c.row}`).sort();
            const pCells = pp.cells.map(c => `${c.col},${c.row}`).sort();
            if (JSON.stringify(eCells) !== JSON.stringify(pCells)) { allMatch = false; break; }
          }
          if (allMatch) { isExisting = true; break; }
        }
        if (!isExisting) {
          results.push({
            opener: 'ms2',
            routeLabel: `${sec.title} [${gi}]`,
            placements: parsed,
            minimalCount: gi === 0 ? minimals.length : 0,
          });
        }
      }
    }

    // ── Print Summary ──
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  MISSING ROUTES SUMMARY: ${results.length} total`);
    console.log(`${'='.repeat(60)}`);

    for (const r of results) {
      console.log(`\n[${r.opener}] ${r.routeLabel}`);
      for (const p of r.placements) {
        const cells = p.cells.map(c => `{col:${c.col},row:${c.row}}`).join(', ');
        console.log(`  { piece: '${p.piece}', cells: [${cells}] },`);
      }
      if (r.minimalCount > 0) {
        console.log(`  Bag 3 minimals: ${r.minimalCount}`);
      }
    }

    expect(results.length).toBeGreaterThan(0);
  });
});
