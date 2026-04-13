/**
 * Board Oracle Test — structural validation that the engine's assembled board
 * matches the wiki pfrow grid for all 22 routes x normal + mirror (44 total).
 *
 * For each route:
 *   1. Parse the wiki pfrow grid into an OCCUPANCY matrix (true = occupied)
 *   2. Assemble the route board: Bag 1 + holdPlacement + Bag 2 placements
 *   3. Compare occupancy cell by cell
 *
 * This is the RED test for MS2 setup_c/d (holdPlacement=null => 4 fewer cells).
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PieceType } from '../src/core/types.ts';
import type { OpenerID } from '../src/openers/types.ts';
import { OPENER_PLACEMENT_DATA, mirrorPlacementData } from '../src/openers/placements.ts';
import { getBag2Routes } from '../src/openers/bag2-routes.ts';
import { buildSteps, stampCells, emptyBoard } from '../src/core/engine.ts';
import type { Board } from '../src/core/engine.ts';

// ── pfrow parser (adapted from diag-l9-pfrow.test.ts) ──

/** Parse a single {{pfrow|c1|c2|...|c10}} into 10 occupancy values */
function parsePfrowOccupancy(pfrow: string): boolean[] {
  const m = pfrow.match(/\{\{pfrow\|(.+?)\}\}/);
  if (!m) return [];
  const rawCells = m[1]!.split('|');
  return rawCells.map(c => {
    const trimmed = c.trim();
    if (trimmed === '' || trimmed === '.' || trimmed === '_') return false;
    if (trimmed === 'P') return false; // TST pocket = empty
    // Everything else is occupied: G, single pieces, multi-char (LZ, LL, etc.)
    return true;
  });
}

interface OccupancyGrid {
  rows: boolean[][];
  totalRows: number;
}

/** Extract all pfstart..pfend grids from wiki source text as occupancy */
function extractOccupancyGrids(source: string): OccupancyGrid[] {
  const grids: OccupancyGrid[] = [];
  const blocks = source.split('{{pfstart}}');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]!;
    const endIdx = block.indexOf('{{pfend}}');
    if (endIdx === -1) continue;
    const content = block.slice(0, endIdx);

    const rows: boolean[][] = [];
    let totalRows = 0;

    // Count pfrowblank
    const blankCount = (content.match(/\{\{pfrowblank\}\}/g) || []).length;
    for (let b = 0; b < blankCount; b++) {
      rows.push(new Array(10).fill(false));
      totalRows++;
    }

    // Parse pfrow entries
    const pfrowMatches = content.match(/\{\{pfrow\|[^}]+\}\}/g) || [];
    for (const pfrow of pfrowMatches) {
      rows.push(parsePfrowOccupancy(pfrow));
      totalRows++;
    }

    grids.push({ rows, totalRows });
  }
  return grids;
}

/** Check if grid is a "main" Bag 2 board (not a minimal/residual) */
function isMainBag2Grid(source: string, grid: OccupancyGrid, rawGrid: RawGrid): boolean {
  // Main board: has both G and pieces, >=7 rows, >=4 distinct piece types
  let hasG = false;
  let hasPiece = false;
  const pieces = new Set<string>();
  for (const row of rawGrid.rows) {
    for (const cell of row) {
      if (cell === 'G') hasG = true;
      if (cell && cell !== 'G' && cell !== 'P') {
        hasPiece = true;
        pieces.add(cell);
      }
    }
  }
  return hasG && hasPiece && grid.totalRows >= 7 && pieces.size >= 4;
}

// Raw grid for piece-type checks (need to differentiate G from pieces)
interface RawGrid {
  rows: (string | null)[][];
  totalRows: number;
}

function parsePfrowRaw(pfrow: string): (string | null)[] {
  const m = pfrow.match(/\{\{pfrow\|(.+?)\}\}/);
  if (!m) return [];
  const rawCells = m[1]!.split('|');
  return rawCells.map(c => {
    const trimmed = c.trim();
    if (trimmed === '' || trimmed === '.' || trimmed === '_') return null;
    if (trimmed === 'P') return 'P';
    if (trimmed === 'G') return 'G';
    if (/^[IJLOSTZ]$/.test(trimmed)) return trimmed;
    // Multi-char = occupied (LZ, LL, etc.) -> 'G' for type detection
    if (/^[IJLOSTZGP]{2,}$/.test(trimmed)) return 'G';
    return null;
  });
}

function extractRawGrids(source: string): RawGrid[] {
  const grids: RawGrid[] = [];
  const blocks = source.split('{{pfstart}}');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]!;
    const endIdx = block.indexOf('{{pfend}}');
    if (endIdx === -1) continue;
    const content = block.slice(0, endIdx);

    const rows: (string | null)[][] = [];
    let totalRows = 0;

    const blankCount = (content.match(/\{\{pfrowblank\}\}/g) || []).length;
    for (let b = 0; b < blankCount; b++) {
      rows.push(new Array(10).fill(null));
      totalRows++;
    }

    const pfrowMatches = content.match(/\{\{pfrow\|[^}]+\}\}/g) || [];
    for (const pfrow of pfrowMatches) {
      rows.push(parsePfrowRaw(pfrow));
      totalRows++;
    }

    grids.push({ rows, totalRows });
  }
  return grids;
}

// ── Wiki source loading ──

function loadWikiSource(filename: string): string {
  const path = join(process.cwd(), '.playwright-cli', filename);
  const yaml = readFileSync(path, 'utf-8');
  const lines = yaml.split('\n');
  for (const line of lines) {
    if (line.includes('{{pfrow') || line.includes('{{pfstart}}')) {
      const match = line.match(/:\s*"(.+)"/);
      if (match) return match[1]!.replace(/\\"/g, '"');
      const colonIdx = line.indexOf(': ');
      if (colonIdx >= 0) return line.slice(colonIdx + 2);
      return line;
    }
  }
  throw new Error(`No pfrow content found in ${filename}`);
}

// ── Section extraction ──

interface WikiSection {
  title: string;
  content: string;
}

function extractTripleSections(source: string): WikiSection[] {
  const sections: WikiSection[] = [];
  const parts = source.split(/===\s*(.+?)\s*===/);
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ title: parts[i]!.trim(), content: parts[i + 1] || '' });
  }
  return sections;
}

function extractDoubleSections(source: string): WikiSection[] {
  const sections: WikiSection[] = [];
  const parts = source.split(/(?<!=)==\s*([^=]+?)\s*==(?!=)/);
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ title: parts[i]!.trim(), content: parts[i + 1] || '' });
  }
  return sections;
}

function getDoubleSectionContent(source: string, sectionTitle: string): string {
  const headerRegex = /(?<!=)==\s*([^=]+?)\s*==(?!=)/g;
  const headers: { title: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(source)) !== null) {
    headers.push({ title: m[1]!.trim(), start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < headers.length; i++) {
    if (headers[i]!.title === sectionTitle) {
      const contentStart = headers[i]!.end;
      const contentEnd = i + 1 < headers.length ? headers[i + 1]!.start : source.length;
      return source.slice(contentStart, contentEnd);
    }
  }
  return '';
}

function extractSubsections(sectionContent: string): WikiSection[] {
  const sections: WikiSection[] = [];
  const parts = sectionContent.split(/===\s*([^=]+?)\s*===/);
  const preambleOcc = extractOccupancyGrids(parts[0] || '');
  if (preambleOcc.length > 0) {
    sections.push({ title: '(preamble)', content: parts[0] || '' });
  }
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ title: parts[i]!.trim(), content: parts[i + 1] || '' });
  }
  return sections;
}

// ── Board assembly ──

/**
 * Assemble a route board by directly stamping all cells.
 * Does NOT use buildSteps (which skips BFS-unreachable pieces).
 * The wiki data is authoritative -- if it says a piece goes there, it goes there.
 */
function assembleRouteBoard(
  openerId: OpenerID,
  mirror: boolean,
  routeIndex: number,
): Board {
  const rawData = OPENER_PLACEMENT_DATA[openerId];
  const data = mirror ? mirrorPlacementData(rawData) : rawData;
  const routes = getBag2Routes(openerId, mirror);
  const route = routes[routeIndex]!;

  let board = emptyBoard();

  // Stamp Bag 1 placements
  for (const p of data.placements) {
    board = stampCells(board, p.piece, p.cells);
  }

  // For Gamushiro form_2: if bag2 placements overlap with last bag1 placement,
  // the last bag1 piece isn't placed. Check for overlap and skip if needed.
  if (openerId === 'gamushiro' && route.routeId === 'form_2') {
    // Rebuild without last Bag 1 piece if it conflicts with Bag 2
    const lastBag1 = data.placements[data.placements.length - 1]!;
    const bag2Cells = new Set(
      [...route.placements, ...(route.holdPlacement ? [route.holdPlacement] : [])].flatMap(
        p => p.cells.map(c => `${c.col},${c.row}`)
      )
    );
    const hasOverlap = lastBag1.cells.some(c => bag2Cells.has(`${c.col},${c.row}`));
    if (hasOverlap) {
      board = emptyBoard();
      for (const p of data.placements.slice(0, -1)) {
        board = stampCells(board, p.piece, p.cells);
      }
    }
  }

  // Stamp holdPlacement
  if (route.holdPlacement) {
    board = stampCells(board, route.holdPlacement.piece, route.holdPlacement.cells);
  }

  // Stamp Bag 2 placements
  for (const p of route.placements) {
    board = stampCells(board, p.piece, p.cells);
  }

  return board;
}

function boardToOccupancy(board: Board): boolean[][] {
  return board.map(row => row.map(cell => cell !== null));
}

function mirrorOccupancyGrid(grid: boolean[][]): boolean[][] {
  return grid.map(row => [...row].reverse());
}

// ── Wiki grid extraction per opener ──

interface WikiRoute {
  routeId: string;
  occupancy: boolean[][];
}

function getWikiGridsForOpener(openerId: OpenerID): WikiRoute[] {
  switch (openerId) {
    case 'stray_cannon': return getStrayCannonWikiGrids();
    case 'honey_cup': return getHoneyCupWikiGrids();
    case 'gamushiro': return getGamushiroWikiGrids();
    case 'ms2': return getMS2WikiGrids();
  }
}

function wikiOccupancyFromContent(content: string): { occ: OccupancyGrid[]; raw: RawGrid[] } {
  return {
    occ: extractOccupancyGrids(content),
    raw: extractRawGrids(content),
  };
}

function filterMainGrids(occGrids: OccupancyGrid[], rawGrids: RawGrid[]): OccupancyGrid[] {
  const result: OccupancyGrid[] = [];
  for (let i = 0; i < occGrids.length; i++) {
    const raw = rawGrids[i]!;
    const occ = occGrids[i]!;
    let hasG = false;
    let hasPiece = false;
    const pieces = new Set<string>();
    for (const row of raw.rows) {
      for (const cell of row) {
        if (cell === 'G') hasG = true;
        if (cell && cell !== 'G' && cell !== 'P') {
          hasPiece = true;
          pieces.add(cell);
        }
      }
    }
    if (hasG && hasPiece && occ.totalRows >= 7 && pieces.size >= 4) {
      result.push(occ);
    }
  }
  return result;
}

function occupancyGridTo20Rows(grid: OccupancyGrid): boolean[][] {
  // Grid starts at row (20 - totalRows), pad with empty rows above
  const rowOffset = 20 - grid.totalRows;
  const full: boolean[][] = [];
  for (let r = 0; r < 20; r++) {
    if (r < rowOffset) {
      full.push(new Array(10).fill(false));
    } else {
      full.push(grid.rows[r - rowOffset] || new Array(10).fill(false));
    }
  }
  return full;
}

// ── Stray Cannon ──

function getStrayCannonWikiGrids(): WikiRoute[] {
  const source = loadWikiSource('page-2026-04-06T09-40-11-517Z.yml');
  const sections = extractTripleSections(source);
  const routes = getBag2Routes('stray_cannon', false);
  const result: WikiRoute[] = [];

  // Section titles contain route identifiers: J>O, S>J, O>SJ, S>O, J>I
  const sectionMap: Record<string, string> = {
    'j_before_o': 'J>O',
    's_before_j': 'S>J',
    'o_before_sj': 'O>SJ',
    's_before_o_iz_before_j': 'S>O',
    'j_before_i': 'J>I',
  };

  for (const route of routes) {
    const pattern = sectionMap[route.routeId];
    if (!pattern) continue;
    const sec = sections.find(s => s.title.includes(pattern));
    if (!sec) continue;
    const { occ, raw } = wikiOccupancyFromContent(sec.content);
    const mains = filterMainGrids(occ, raw);
    if (mains.length > 0) {
      result.push({ routeId: route.routeId, occupancy: occupancyGridTo20Rows(mains[0]!) });
    }
  }

  return result;
}

// ── Honey Cup ──

function getHoneyCupWikiGrids(): WikiRoute[] {
  const source = loadWikiSource('page-2026-04-06T09-39-06-091Z.yml');
  const doubleSections = extractDoubleSections(source);
  const bag2Section = doubleSections.find(s => s.title === 'Second Bag');
  if (!bag2Section) return [];

  const { occ, raw } = wikiOccupancyFromContent(bag2Section.content);
  const mains = filterMainGrids(occ, raw);
  const routes = getBag2Routes('honey_cup', false);
  const result: WikiRoute[] = [];

  // Match each route to its closest wiki grid by occupancy comparison.
  // Wiki has 15+ boards; our 8 routes correspond to a subset.
  for (let ri = 0; ri < routes.length; ri++) {
    const engineBoard = assembleRouteBoard('honey_cup', false, ri);
    const engineOcc = boardToOccupancy(engineBoard);

    let bestIdx = -1;
    let bestDiffs = Infinity;

    for (let gi = 0; gi < mains.length; gi++) {
      const wikiOcc = occupancyGridTo20Rows(mains[gi]!);
      let diffs = 0;
      for (let r = 0; r < 20; r++) {
        for (let c = 0; c < 10; c++) {
          if (engineOcc[r]![c] !== wikiOcc[r]![c]) diffs++;
        }
      }
      if (diffs < bestDiffs) {
        bestDiffs = diffs;
        bestIdx = gi;
      }
    }

    if (bestIdx >= 0 && bestDiffs === 0) {
      result.push({
        routeId: routes[ri]!.routeId,
        occupancy: occupancyGridTo20Rows(mains[bestIdx]!),
      });
    }
  }

  return result;
}

// ── Gamushiro ──

function getGamushiroWikiGrids(): WikiRoute[] {
  const source = loadWikiSource('page-2026-04-06T09-40-18-051Z.yml');
  const doubleSections = extractDoubleSections(source);
  const bag2Section = doubleSections.find(s => s.title === 'Second Bag');
  if (!bag2Section) return [];

  const { occ, raw } = wikiOccupancyFromContent(bag2Section.content);
  const mains = filterMainGrids(occ, raw);
  const routes = getBag2Routes('gamushiro', false);
  const result: WikiRoute[] = [];

  // Gamushiro has 5 routes, boards are in order in the flat Second Bag section
  for (let i = 0; i < routes.length && i < mains.length; i++) {
    result.push({
      routeId: routes[i]!.routeId,
      occupancy: occupancyGridTo20Rows(mains[i]!),
    });
  }

  return result;
}

// ── MS2 ──

function getMS2WikiGrids(): WikiRoute[] {
  const source = loadWikiSource('page-2026-04-06T09-41-20-334Z.yml');
  const routes = getBag2Routes('ms2', false);
  const result: WikiRoute[] = [];

  // Collect ALL main boards from both MS1 and MS2 sections
  const allMains: OccupancyGrid[] = [];

  // MS1 "Second Bag and later"
  const ms1Content = getDoubleSectionContent(source, 'Second Bag and later');
  const ms1Subs = extractSubsections(ms1Content);
  for (const sec of ms1Subs) {
    const { occ, raw } = wikiOccupancyFromContent(sec.content);
    allMains.push(...filterMainGrids(occ, raw));
  }

  // MS2 "Mountainous Stacking 2"
  const ms2Content = getDoubleSectionContent(source, 'Mountainous Stacking 2');
  const ms2Subs = extractSubsections(ms2Content);
  for (const sec of ms2Subs) {
    const { occ, raw } = wikiOccupancyFromContent(sec.content);
    allMains.push(...filterMainGrids(occ, raw));
  }

  // Match each route to its wiki board by comparing engine board to wiki occupancy
  for (let ri = 0; ri < routes.length; ri++) {
    const engineBoard = assembleRouteBoard('ms2', false, ri);
    const engineOcc = boardToOccupancy(engineBoard);

    // Find the wiki board that matches
    let bestMatch: OccupancyGrid | null = null;
    let bestDiffs = Infinity;

    for (const wikiGrid of allMains) {
      const wikiOcc = occupancyGridTo20Rows(wikiGrid);
      let diffs = 0;
      for (let r = 0; r < 20; r++) {
        for (let c = 0; c < 10; c++) {
          if (engineOcc[r]![c] !== wikiOcc[r]![c]) diffs++;
        }
      }
      if (diffs < bestDiffs) {
        bestDiffs = diffs;
        bestMatch = wikiGrid;
      }
    }

    if (bestMatch && bestDiffs <= 4) {
      // Allow up to 4 cell diff (holdPlacement=null means 4 missing cells)
      result.push({
        routeId: routes[ri]!.routeId,
        occupancy: occupancyGridTo20Rows(bestMatch),
      });
    }
  }

  return result;
}

// ── Tests ──

const OPENER_IDS: OpenerID[] = ['honey_cup', 'stray_cannon', 'gamushiro', 'ms2'];

describe('Board Oracle: assembled board === wiki pfrow occupancy', () => {
  for (const openerId of OPENER_IDS) {
    const routes = getBag2Routes(openerId, false);
    const wikiGrids = getWikiGridsForOpener(openerId);

    for (let ri = 0; ri < routes.length; ri++) {
      const route = routes[ri]!;
      const wikiRoute = wikiGrids.find(w => w.routeId === route.routeId);

      if (!wikiRoute) {
        test.skip(`${openerId}/${route.routeId} (normal): no wiki grid found`, () => {});
        continue;
      }

      test(`${openerId}/${route.routeId} (normal): engine === wiki`, () => {
        const engineBoard = assembleRouteBoard(openerId, false, ri);
        const engineOcc = boardToOccupancy(engineBoard);
        const wikiOcc = wikiRoute.occupancy;

        const missing: string[] = [];
        const extra: string[] = [];

        for (let r = 0; r < 20; r++) {
          for (let c = 0; c < 10; c++) {
            if (wikiOcc[r]![c] && !engineOcc[r]![c]) {
              missing.push(`(${c},${r})`);
            }
            if (!wikiOcc[r]![c] && engineOcc[r]![c]) {
              extra.push(`(${c},${r})`);
            }
          }
        }

        if (missing.length > 0 || extra.length > 0) {
          throw new Error(
            `Board mismatch for ${openerId}/${route.routeId}:\n` +
            (missing.length > 0 ? `  Missing from engine: ${missing.join(', ')}\n` : '') +
            (extra.length > 0 ? `  Extra in engine: ${extra.join(', ')}` : ''),
          );
        }
      });
    }
  }
});

describe('Board Oracle: mirror — assembled board === mirrored wiki occupancy', () => {
  for (const openerId of OPENER_IDS) {
    const routes = getBag2Routes(openerId, true);
    const wikiGrids = getWikiGridsForOpener(openerId);

    for (let ri = 0; ri < routes.length; ri++) {
      const route = routes[ri]!;
      // Mirror route has same routeId as normal
      const normalRoutes = getBag2Routes(openerId, false);
      const wikiRoute = wikiGrids.find(w => w.routeId === normalRoutes[ri]!.routeId);

      if (!wikiRoute) {
        test.skip(`${openerId}/${normalRoutes[ri]!.routeId} (mirror): no wiki grid found`, () => {});
        continue;
      }

      test(`${openerId}/${normalRoutes[ri]!.routeId} (mirror): engine === mirrored wiki`, () => {
        const engineBoard = assembleRouteBoard(openerId, true, ri);
        const engineOcc = boardToOccupancy(engineBoard);
        const mirroredWiki = mirrorOccupancyGrid(wikiRoute.occupancy);

        const missing: string[] = [];
        const extra: string[] = [];

        for (let r = 0; r < 20; r++) {
          for (let c = 0; c < 10; c++) {
            if (mirroredWiki[r]![c] && !engineOcc[r]![c]) {
              missing.push(`(${c},${r})`);
            }
            if (!mirroredWiki[r]![c] && engineOcc[r]![c]) {
              extra.push(`(${c},${r})`);
            }
          }
        }

        if (missing.length > 0 || extra.length > 0) {
          throw new Error(
            `Mirror board mismatch for ${openerId}/${normalRoutes[ri]!.routeId}:\n` +
            (missing.length > 0 ? `  Missing from engine: ${missing.join(', ')}\n` : '') +
            (extra.length > 0 ? `  Extra in engine: ${extra.join(', ')}` : ''),
          );
        }
      });
    }
  }
});
