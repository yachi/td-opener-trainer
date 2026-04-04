# Drill Mode: Acceptance Criteria

## User Story
As a learner who has seen the openers in the visualizer, I want to practice placing pieces myself using real Tetris controls, so I can build muscle memory for each opener.

## SRS Engine (Core)

- [ ] **AC1**: Pieces rotate using standard SRS kick tables (JLSZT table + I-piece table, 5 kick tests per rotation)
- [ ] **AC2**: Pieces spawn centered at row 20-21, cols 3-6 (I) or 3-5 (others)
- [ ] **AC3**: Hard drop instantly places piece and locks
- [ ] **AC4**: Soft drop moves piece down instantly (no gravity)
- [ ] **AC5**: DAS ~167ms, ARR ~33ms for left/right movement
- [ ] **AC6**: Hold piece works (swap once per piece, grayed out until next piece)
- [ ] **AC7**: 7-bag randomizer (already exists)

## Drill Flow

- [ ] **AC8**: User selects an opener to practice (MS2 / Honey Cup / Stray Cannon / Gamushiro)
- [ ] **AC9**: Bag is generated; only bags where the selected opener is buildable are given
- [ ] **AC10**: Ghost piece shows where current piece will land (standard guideline feature)
- [ ] **AC11**: After Bag 1 (7 pieces placed or held), board is compared against the correct opener shape
- [ ] **AC12**: If correct: show success + which T-spin slots are available
- [ ] **AC13**: If wrong: show the expected shape side-by-side, option to retry same bag
- [ ] **AC14**: Mirror variants accepted as correct (e.g. MS2 normal or MS2 mirror)

## Controls

- [ ] **AC15**: Arrow keys = move/soft drop, Up = rotate CW, Z = rotate CCW, Space = hard drop, C = hold
- [ ] **AC16**: Controls shown on screen (first 3 sessions, then hideable)
- [ ] **AC17**: Accessible via tab navigation from other modes

## Not in Scope

- No gravity (pieces don't fall — opener practice is deliberate, infinite think time)
- No line clears, scoring, levels, garbage
- No 180° rotation (standard SRS, not SRS+)
- No Bag 2 / T-spin execution (future scope)

## SRS Reference Data

### JLSZT Kick Table
Convention: (x, y) where +x = right, +y = up. States: 0 = spawn, R = CW, 2 = 180, L = CCW.

| Rotation | Test 1 | Test 2 | Test 3 | Test 4 | Test 5 |
|----------|--------|--------|--------|--------|--------|
| 0 → R | ( 0, 0) | (-1, 0) | (-1,+1) | ( 0,-2) | (-1,-2) |
| R → 0 | ( 0, 0) | (+1, 0) | (+1,-1) | ( 0,+2) | (+1,+2) |
| R → 2 | ( 0, 0) | (+1, 0) | (+1,-1) | ( 0,+2) | (+1,+2) |
| 2 → R | ( 0, 0) | (-1, 0) | (-1,+1) | ( 0,-2) | (-1,-2) |
| 2 → L | ( 0, 0) | (+1, 0) | (+1,+1) | ( 0,-2) | (+1,-2) |
| L → 2 | ( 0, 0) | (-1, 0) | (-1,-1) | ( 0,+2) | (-1,+2) |
| L → 0 | ( 0, 0) | (-1, 0) | (-1,-1) | ( 0,+2) | (-1,+2) |
| 0 → L | ( 0, 0) | (+1, 0) | (+1,+1) | ( 0,-2) | (+1,-2) |

### I-Piece Kick Table

| Rotation | Test 1 | Test 2 | Test 3 | Test 4 | Test 5 |
|----------|--------|--------|--------|--------|--------|
| 0 → R | ( 0, 0) | (-2, 0) | (+1, 0) | (-2,-1) | (+1,+2) |
| R → 0 | ( 0, 0) | (+2, 0) | (-1, 0) | (+2,+1) | (-1,-2) |
| R → 2 | ( 0, 0) | (-1, 0) | (+2, 0) | (-1,+2) | (+2,-1) |
| 2 → R | ( 0, 0) | (+1, 0) | (-2, 0) | (+1,-2) | (-2,+1) |
| 2 → L | ( 0, 0) | (+2, 0) | (-1, 0) | (+2,+1) | (-1,-2) |
| L → 2 | ( 0, 0) | (-2, 0) | (+1, 0) | (-2,-1) | (+1,+2) |
| L → 0 | ( 0, 0) | (+1, 0) | (-2, 0) | (+1,-2) | (-2,+1) |
| 0 → L | ( 0, 0) | (-1, 0) | (+2, 0) | (-1,+2) | (+2,-1) |

### Piece Spawn Positions (0-indexed, row 0 = bottom)

| Piece | Cells (col, row) |
|-------|-----------------|
| I | (3,20), (4,20), (5,20), (6,20) |
| O | (4,20), (5,20), (4,21), (5,21) |
| T | (3,20), (4,20), (5,20), (4,21) |
| S | (3,20), (4,20), (4,21), (5,21) |
| Z | (4,20), (5,20), (3,21), (4,21) |
| J | (3,20), (4,20), (5,20), (3,21) |
| L | (3,20), (4,20), (5,20), (5,21) |

### Timing

| Parameter | Value |
|-----------|-------|
| DAS | 167ms |
| ARR | 33ms |
| Lock delay | N/A (no gravity, hard drop = instant lock) |
| Gravity | None |
