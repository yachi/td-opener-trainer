# Engine Redesign: Continuous Sequence with Physical Validation

## Problem

17 fix commits for one concept (Bag 2 base board). Root cause: board states COPIED from wiki instead of COMPUTED from piece placements. Every copy is a manual data point that can be wrong. The architecture has a hole between Bag 1 and Bag 2 that every hack tries to bridge.

## Design: One Fold

A Tetris board is a fold over piece placements:

```
boards = placements.reduce((acc, p) => {
  const prev = acc[acc.length - 1];
  const next = engine.place(prev, p);
  engine.validate(next);
  return [...acc, next];
}, [emptyBoard()]);
```

Every board state is DERIVED. Nothing is hardcoded except the placements themselves.

## Data Model

### Before: 79 hardcoded cell arrays

```typescript
{ piece: 'L', cells: [{col:0,row:12}, {col:1,row:12}, {col:1,row:13}, {col:1,row:14}], hint: '...' }
```

### After: anchor + rotation (4 numbers)

```typescript
{ piece: 'L', col: 0, row: 12, rotation: 1, hint: '...' }
```

The engine calls `getPieceCells({type: 'L', col: 0, row: 12, rotation: 1})` to derive the 4 cells. Wrong cell coordinates become **structurally impossible** — the engine computes them from SRS definitions.

Type:
```typescript
interface Placement {
  piece: PieceType;
  col: number;      // anchor column (top-left of bounding box)
  row: number;      // anchor row
  rotation: 0 | 1 | 2 | 3;  // SRS rotation state
  hint: string;     // UI display hint
}
```

### Route = one flat array

```typescript
interface OpenerRoute {
  openerId: OpenerID;
  routeId: string;
  routeLabel: string;
  condition: string;
  conditionPieces: PieceType[];
  holdPiece: PieceType;
  bag1Placements: Placement[];   // pieces 1-6 (or 1-7 for openers with 7 Bag 1 pieces)
  holdPlacement: Placement | null; // held piece gap-filler
  bag2Placements: Placement[];   // Bag 2 route pieces
}
```

The visualizer builds one continuous sequence:
```
[...bag1Placements, holdPlacement, ...bag2Placements].filter(Boolean)
```

Labels "Bag 1" / "Bag 2" are derived from indices. No separate getOpenerSequence + getBag2Sequence.

## Engine: `buildSequence()`

One function replaces getOpenerSequence + getBag2Sequence:

```typescript
function buildSequence(route: OpenerRoute): PlacementStep[] {
  const allPlacements = [
    ...route.bag1Placements,
    ...(route.holdPlacement ? [route.holdPlacement] : []),
    ...route.bag2Placements,
  ];

  const steps: PlacementStep[] = [];
  let board = emptyBoard();

  for (const placement of allPlacements) {
    const cells = getPieceCells({
      type: placement.piece,
      col: placement.col,
      row: placement.row,
      rotation: placement.rotation,
    });

    // Engine validates
    const field = boardToField(board);
    placePieceFromCells(field, placement.piece, cells);  // strict: no allowOverwrite
    board = fieldToBoard(field);

    steps.push({ piece: placement.piece, board: cloneBoard(board), newCells: cells, hint: placement.hint });
  }

  return steps;
}
```

Every cell is engine-placed. No allowOverwrite. No fallbacks. No fixture lookups.

## Validation Pipeline

After `buildSequence()`, run validation:

```typescript
function validateSequence(steps: PlacementStep[]): void {
  for (let i = 0; i < steps.length; i++) {
    const board = steps[i].board;

    // 1. No floating cells (except TST overhang at the known pocket)
    const floating = findFloatingCells(board);
    const unexpected = floating.filter(f => !isTstOverhang(f, tstSlot));
    if (unexpected.length > 0) throw new Error(`Step ${i+1}: floating cells`);

    // 2. Cell count = 4 * (i+1) — each step adds exactly 4 cells
    const cellCount = countNonNull(board);
    if (cellCount !== 4 * (i + 1)) throw new Error(`Step ${i+1}: expected ${4*(i+1)} cells, got ${cellCount}`);
  }
}
```

This catches:
- Floating pieces (today's Gamushiro bug)
- Missing/extra cells (data errors)
- Conflicts (engine already catches)
- Wrong SRS shapes (engine already catches)

## Test Oracle: Per-Step Fumens

Each route has frozen fumen strings for every step:

```typescript
const MS2_SETUP_A_FUMENS = [
  'v115@...', // after piece 1
  'v115@...', // after piece 2
  // ...
  'v115@...', // after piece 12 (final)
];
```

Generated ONCE from wiki-verified data, then frozen. Any code change that produces a different fumen at ANY step = test failure. No regeneration — investigate and fix.

## What Gets Deleted

| Current code | Lines | Status |
|---|---|---|
| `getOpenerSequence()` | ~50 | Replaced by `buildSequence()` |
| `getBag2Sequence()` | ~60 | Replaced by `buildSequence()` |
| 79 hardcoded cell arrays | ~400 | Replaced by anchor+rotation (~100 lines) |
| `baseBoard` construction | ~30 | Deleted — no concept |
| `bag2-golden.json` residual data | 1800 | Test oracle only, residual concept gone |
| `CellType`, `'G'` type | ~20 | Deleted — only PieceType exists |
| TST-clear derivation | ~15 | Deleted — continuous sequence |
| `allowOverwrite: true` | 0 already | Stays at 0 |
| `mirrorBag2Route` residual/hold logic | ~10 | Simplified — just mirror anchor col |

## What Gets Added

| New code | Lines (est) | Purpose |
|---|---|---|
| `Placement` type | 10 | Anchor+rotation, no cells |
| `OpenerRoute` type | 15 | Unified route with all placements |
| `buildSequence()` | 30 | One fold, engine-validated |
| `validateSequence()` | 20 | Gravity + cell count check |
| Anchor+rotation data for 79 placements | 100 | Compact, engine-derivable |
| Per-step fumen oracle test | 30 | Every intermediate state validated |
| V14: gravity test for all steps | 20 | No floating cells ever |

Net: **delete ~600 lines, add ~225 lines.**

## Migration Path

### Phase 1: Convert data model (anchor+rotation)
- Write `cellsToPlacement(piece, cells)` converter: given 4 cells, find the anchor+rotation
- Run on all 79 placements → generate compact data
- Verify round-trip: `getPieceCells(converted) === original cells`

### Phase 2: Unify into buildSequence
- Replace getOpenerSequence + getBag2Sequence with buildSequence
- One continuous step array, labels derived from indices
- Update renderer to use single sequence

### Phase 3: Validation + oracle
- Add gravity check after every step
- Generate per-step fumens, freeze as test oracle
- Flag Gamushiro Form 2 conflicts for wiki investigation

### Phase 4: Delete dead code
- Remove old functions, old types, old fixture runtime dependency
- Remove baseBoard concept from renderer
- Clean up CLAUDE.md lessons that reference deleted concepts

## Gamushiro Form 2

The only route with Bag 1 conflicts. The engine will reject the O piece placement (conflicts with Bag 1 L). This is CORRECT — the data needs wiki verification. Options:
1. The O piece coordinates are wrong in our data
2. The O is placed after TST (needs intermediate TST step in sequence)
3. The route data was extracted from a different wiki variant

Action: verify against wiki via Playwright. Do NOT hack around the conflict.

## Success Criteria

- [ ] Zero `allowOverwrite: true` in production
- [ ] Zero hardcoded cell arrays in placement data
- [ ] Every board state derived from engine
- [ ] Gravity validated at every step
- [ ] Per-step fumen oracle for all routes
- [ ] buildSequence() throws on any data conflict
- [ ] Net code reduction (target: -400 lines)
