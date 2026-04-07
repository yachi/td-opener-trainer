# Engine Redesign: One Fold, Cell Arrays, Strict Validation

## The Change

Replace two separate functions (`getOpenerSequence` + `getBag2Sequence`) with one fold over a flat placement array. Keep cell arrays (they work). Add invariant validation.

## Why

17 bug-fix commits. Every bug was in the gap between Bag 1 and Bag 2: base board construction, residual hacks, TST-clear derivation, allowOverwrite bypasses. The fold eliminates the gap.

## Proof

7/8 routes already pass strict one-fold validation with existing cell arrays:
```
✓ ms2/setup_a: 13 pieces, one fold, strict
✓ ms2/setup_b: 13 pieces, one fold, strict
✓ honey_cup/ideal: 13 pieces, one fold, strict
✓ honey_cup/alt_i_left: 13 pieces, one fold, strict
✓ stray_cannon/j_before_o: 13 pieces, one fold, strict
✓ stray_cannon/s_before_j: 13 pieces, one fold, strict
✓ gamushiro/form_1: 13 pieces, one fold, strict
✗ gamushiro/form_2: hold L conflicts Bag 1 L at (8,15) — DATA issue, needs wiki fix
```

## Implementation

### `buildSequence(placements)` — the fold

```typescript
function buildSequence(placements: RawPlacement[]): Step[] {
  let board = emptyBoard();
  return placements.map(p => {
    const field = boardToField(board);
    placePieceFromCells(field, p.piece, p.cells); // strict
    board = fieldToBoard(field);
    return { piece: p.piece, board: cloneBoard(board), newCells: [...p.cells], hint: p.hint };
  });
}
```

### Route data — flat array

```typescript
const allPlacements = [
  ...opener.bag1Placements,            // from existing data
  ...(route.holdPlacement ? [route.holdPlacement] : []),
  ...route.bag2Placements,             // from existing data
];
const steps = buildSequence(allPlacements);
// steps[0..5] = Bag 1, steps[6] = hold, steps[7..12] = Bag 2
```

### Invariants

After build, validate:
1. Cell count = 4 × step index (each step adds exactly 4)
2. No floating cells (except TST overhang)
3. Each piece type count is multiple of 4

### What gets deleted

- `getBag2Sequence()` base board construction (~60 lines)
- TST-clear derivation (~15 lines)
- `baseBoard` field on OpenerSequence
- `bag2-golden.json` runtime import (already test-only)
- `allowOverwrite: true` usage (already 0)

### What stays

- Cell arrays in placement data (validated, working)
- `placePieceFromCells` (the engine)
- Fumen encoding/decoding
- Existing tests (adapted to new API)

### Gamushiro Form 2

The ONE remaining data issue. Hold L at (8,13-15),(9,15) conflicts with Bag 1 L at (8,15). Needs wiki verification to determine correct hold placement. Do NOT hack around it.

## Future (separate project)

- Anchor+rotation data format (requires fixing bounding-box vs pivot coordinate mapping)
- Automated wiki extraction pipeline
- SRS reachability validation per step
