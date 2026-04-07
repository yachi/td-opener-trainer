# Complete Rewrite: Tetris Visualizer Engine

## Thesis

A Tetris opener visualization is a **fold over placements**. Everything else is derived. The current 800-line visualizer.ts exists because the code stores derived data as source data, then spends hundreds of lines keeping the derivations consistent. An ACM champion writes 50 lines of engine and 150 lines of data.

## The Engine (~50 lines)

```typescript
type Piece = 'I'|'T'|'O'|'S'|'Z'|'L'|'J';
type Cell = Piece | null;
type Board = Cell[][];
type Placement = { piece: Piece; col: number; row: number; rot: 0|1|2|3; hint: string };

// Derive cells from SRS definitions — the ONLY way to get cell coordinates
function cells(p: Placement): {col: number; row: number}[] {
  return PIECE_DEFINITIONS[p.piece].cells[p.rot]
    .map(([dc, dr]) => ({ col: p.col + dc, row: p.row + dr }));
}

// Place one piece. Pure function. Throws on any invalid state.
function place(board: Board, p: Placement): { board: Board; cells: {col:number;row:number}[] } {
  const b = board.map(r => [...r]);
  const cs = cells(p);
  for (const {col, row} of cs) {
    if (row < 0 || row >= 20 || col < 0 || col >= 10) throw Error(`OOB: ${p.piece}(${col},${row})`);
    if (b[row][col] !== null) throw Error(`Conflict: ${p.piece}(${col},${row}) on ${b[row][col]}`);
    b[row][col] = p.piece;
  }
  return { board: b, cells: cs };
}

// Build entire sequence. One fold. No special cases.
function buildSequence(placements: Placement[]): { board: Board; piece: Piece; newCells: ...; hint: string }[] {
  const steps = [];
  let board = emptyBoard();
  for (const p of placements) {
    const result = place(board, p);
    board = result.board;
    steps.push({ board, piece: p.piece, newCells: result.cells, hint: p.hint });
  }
  return steps;
}
```

No `getOpenerSequence`. No `getBag2Sequence`. No `baseBoard`. No `allowOverwrite`. No `?? fallback`. No fixture lookup. One function, one fold.

## The Data (~150 lines)

Each route is a flat array of Placements. Bag 1 + hold + Bag 2, in order.

```typescript
const MS2: OpenerDef = {
  id: 'ms2', nameEn: 'MS2', nameCn: '山岳炮', nameJa: '山岳積み2号',
  holdPiece: 'L',
  tstSlot: { col: 4, row: 18, rot: 2 },
  bag1: [
    { piece: 'I', col: -1, row: 16, rot: 1, hint: 'I vertical, col 0' },
    { piece: 'S', col:  0, row: 16, rot: 1, hint: 'S vertical, cols 0-1' },
    { piece: 'T', col:  6, row: 17, rot: 1, hint: 'T CW, col 7 overhang' },
    { piece: 'J', col:  0, row: 18, rot: 0, hint: 'J spawn, cols 1-3' },
    { piece: 'Z', col:  3, row: 17, rot: 0, hint: 'Z flat, cols 4-5' },
    { piece: 'O', col:  8, row: 18, rot: 0, hint: 'O, cols 8-9' },
  ],
  routes: [
    {
      id: 'setup_a', label: 'Setup A (O early)',
      condition: 'O comes early', conditionPieces: ['O', 'I'],
      hold: { piece: 'L', col: -1, row: 13, rot: 1, hint: 'Hold L, left wall' },
      bag2: [
        { piece: 'Z', col: 3, row: 15, rot: 0, hint: 'Z flat, cols 4-5' },
        { piece: 'O', col: 8, row: 16, rot: 0, hint: 'O, cols 8-9' },
        { piece: 'J', col: 1, row: 14, rot: 3, hint: 'J CCW, cols 2-3' },
        { piece: 'S', col: 5, row: 15, rot: 1, hint: 'S CW, cols 6-8' },
        { piece: 'I', col: 8, row: 12, rot: 1, hint: 'I vertical, col 9' },
        { piece: 'L', col: -1, row: 12, rot: 1, hint: 'L CW, cols 0-1' },
      ],
    },
    // ... more routes
  ],
};
```

14 placements per route × 4 numbers each. No cell arrays. Mirroring is computed:
```typescript
function mirrorPlacement(p: Placement): Placement {
  const width = pieceWidth(p.piece, p.rot);
  return { ...p, piece: mirrorPiece(p.piece), col: 9 - p.col - width + 1, rot: mirrorRotation(p.rot) };
}
```

## Validation: Mathematical Invariants

After `buildSequence()`, prove invariants:

```typescript
function validateSequence(steps, tstSlot): void {
  for (let i = 0; i < steps.length; i++) {
    const b = steps[i].board;

    // Invariant 1: exactly 4*(i+1) non-null cells
    assert(countCells(b) === 4 * (i + 1));

    // Invariant 2: no floating cells (except TST overhang)
    for (let r = 0; r < 19; r++)
      for (let c = 0; c < 10; c++)
        if (b[r][c] !== null && b[r+1][c] === null)
          assert(isTstOverhang(r, c, tstSlot), `Float at (${c},${r}) step ${i+1}`);

    // Invariant 3: every cell type appears in multiples of 4 (complete pieces)
    const counts = new Map<Piece, number>();
    for (const row of b) for (const cell of row) if (cell) counts.set(cell, (counts.get(cell) ?? 0) + 1);
    for (const [piece, count] of counts) assert(count % 4 === 0, `${piece} has ${count} cells`);
  }
}
```

These 3 invariants catch **every bug class** from the 17-commit history:
1. Cell count: catches missing/extra cells, wrong data
2. Gravity: catches floating pieces, bad TST-clear hacks
3. Piece completeness: catches partial placements, type confusion

## Test Oracle: Per-Step Fumens

```typescript
// Generated ONCE from verified data. Never regenerated from code.
const ORACLE: Record<string, string[]> = {
  'ms2/setup_a': [
    'v115@9gh0Je...', // step 1: I placed
    'v115@9gB8He...', // step 2: S placed
    // ... one per step
  ],
};

test('oracle: every step matches', () => {
  for (const [routeId, fumens] of Object.entries(ORACLE)) {
    const steps = buildSequence(ROUTES[routeId]);
    for (let i = 0; i < steps.length; i++)
      expect(boardToFumen(steps[i].board)).toBe(fumens[i]);
  }
});
```

Any code change that alters ANY intermediate board = immediate test failure.

## What Gets Deleted

| File/concept | Lines | Reason |
|---|---|---|
| `getOpenerSequence()` | 50 | Replaced by `buildSequence()` |
| `getBag2Sequence()` | 60 | Replaced by `buildSequence()` |
| 79 cell arrays in route data | 400 | Replaced by anchor+rotation |
| `baseBoard` concept | 30 | Doesn't exist — continuous sequence |
| `OpenerSequence.baseBoard` field | 10 | Deleted |
| Base board construction in renderer | 20 | Renderer just reads `steps[i].board` |
| `bag2-golden.json` runtime import | 1800 (fixture) | Test oracle only, no runtime use |
| `CellType = PieceType \| 'G'` | 0 (already gone) | Already deleted |
| `TST-clear derivation` | 15 | Doesn't exist — no base board |
| `holdPlacement` field on Bag2Route | 10 | Hold is just another Placement in the array |
| `mirrorBag2Route` hold/residual logic | 15 | Mirror just flips anchor col |
| `allowOverwrite` usage | 0 (already gone) | Structurally impossible |

**Total deleted: ~800 lines** (effectively all of visualizer.ts's placement logic)

## What Gets Written

| New code | Lines | Purpose |
|---|---|---|
| `src/core/sequence.ts` | 80 | `buildSequence()`, `validateSequence()`, types |
| Route data (all openers, anchor+rotation) | 200 | 8 routes × ~25 lines |
| `src/modes/visualizer.ts` (simplified) | 150 | State machine, renderer adapter, key handling |
| Per-step fumen oracle | 100 | ~12 fumens × 8 routes |
| Invariant tests (V14) | 30 | Cell count + gravity + piece completeness |

**Total written: ~560 lines.** Net reduction: ~240 lines with stronger guarantees.

## The Renderer Changes

Currently the renderer has complex logic for `inBag2`, `baseBoard`, `bag1CellSet` dimming. After the rewrite:

```typescript
// Renderer just reads the step
const board = steps[currentStep].board;
const newCells = steps[currentStep].newCells;
// Draw board. Highlight newCells. That's it.
```

Dimming for "Bag 1 cells" during Bag 2 viewing: compare `steps[currentStep].board` vs `steps[bag1EndIndex].board`. Cells present in both → dimmed. New cells → highlighted. Pure derivation from the step data.

## Migration: Phase 1 is the hardest

### Phase 1: Convert all 79 placements to anchor+rotation
Write `cellsToAnchorRotation(piece, cells)` that reverse-engineers the anchor+rotation from existing cell arrays. Run on all 79 placements. Verify round-trip: `getPieceCells(converted) === original`. This gives us the new data format without changing behavior.

### Phase 2: Write `buildSequence()` and route data structures
New `src/core/sequence.ts` with the fold. New route data format. Wire into existing renderer with minimal adapter.

### Phase 3: Delete old code
Remove `getOpenerSequence`, `getBag2Sequence`, `baseBoard`, old route data, fixture imports.

### Phase 4: Validation + oracle
Add invariant checks. Generate per-step fumens. Freeze as oracle.

### Phase 5: Gamushiro Form 2
Verify against wiki. Fix data. Engine rejects bad data — investigate, don't hack.

## Success Criteria

- `buildSequence()` is the ONLY way to produce board states
- Zero hardcoded cell arrays
- Zero `allowOverwrite`
- Gravity validated at every step
- Per-step fumen oracle for every route
- Engine throws on any data conflict
- Gamushiro Form 2 passes strict validation (after wiki-verified data fix)
- Net code reduction ≥ 200 lines
