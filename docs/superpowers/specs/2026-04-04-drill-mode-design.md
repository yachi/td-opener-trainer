# Drill Mode: Acceptance Criteria

## User Story
As a learner who has seen the openers in the visualizer, I want to practice placing pieces myself using real Tetris controls, so I can build muscle memory for each opener.

## SRS Engine (Core)

- [x] **AC1**: Pieces rotate using standard SRS kick tables (JLSZT table + I-piece table, 5 kick tests per rotation)
- [x] **AC2**: Pieces spawn centered at row 20-21, cols 3-6 (I) or 3-5 (others)
- [x] **AC3**: Hard drop instantly places piece and locks
- [x] **AC4**: Soft drop moves piece down instantly (no gravity)
- [x] **AC5**: DAS ~167ms, ARR ~33ms for left/right movement
- [x] **AC6**: Hold piece works (swap once per piece, grayed out until next piece)
- [x] **AC7**: 7-bag randomizer (already exists)

## Drill Flow

- [x] **AC8**: User selects an opener to practice (MS2 / Honey Cup / Stray Cannon / Gamushiro)
- [x] **AC9**: Bag is generated; only bags where the selected opener is buildable are given
- [x] **AC10**: Ghost piece shows where current piece will land (standard guideline feature)
- [x] **AC11**: After Bag 1 (7 pieces placed or held), board is compared against the correct opener shape
- [x] **AC12**: If correct: show success + which T-spin slots are available
- [x] **AC13**: If wrong: show the expected shape side-by-side, option to retry same bag
- [x] **AC14**: Mirror variants accepted as correct (e.g. MS2 normal or MS2 mirror)

## Controls

- [x] **AC15**: Arrow keys = move/soft drop, Up = rotate CW, Z = rotate CCW, Space = hard drop, C = hold
- [x] **AC16**: Controls shown on screen (first 3 sessions, then hideable)
- [x] **AC17**: Accessible via tab navigation from other modes

## Placement Guidance (Guided Mode)

### User Story
As a learner who hasn't memorized where pieces go, I want the drill to show me where each piece should be placed, so I can learn by doing instead of memorizing first.

### Acceptance Criteria

- [ ] **AC18**: Guided mode is ON by default, togglable with H key
- [ ] **AC19**: When guided mode is ON, the target placement for the current piece is shown as a translucent outline on the board (same color as piece, ~20% opacity)
- [ ] **AC20**: The target outline uses the opener's placement data from visualizer.ts (same source of truth as the visualizer step-by-step)
- [ ] **AC21**: A text hint is shown below the board describing the placement (e.g., "I vertical, col 0, left wall") — same hints from the visualizer
- [ ] **AC22**: When the user places a piece in the WRONG position, the target outline stays visible so they can see where it should have gone
- [ ] **AC23**: The hold piece suggestion is shown (e.g., "Hold L" highlighted in the hold box) when the current piece is the one that should be held for this opener
- [ ] **AC24**: When guided mode is OFF, no outlines or hints are shown (pure practice)
- [ ] **AC25**: Status bar shows "Guided" or "Free" indicator, with "[H] toggle hints" text
- [ ] **AC26**: Target outline must respect physics — every target cell must be supported (resting on the floor or on an existing piece). If the target position would float given the current board, hide the target for that piece

### Design Notes
- The target placement must account for mirror (use the same mirror logic from visualizer.ts)
- The target must account for piece ORDER — the visualizer has a specific placement order, show the target for whichever piece should be placed at this step
- If the user places pieces out of order vs the visualizer's sequence, the guidance degrades gracefully (show target for the current piece type regardless of step number)
- The hold suggestion only appears when the opener requires holding that specific piece (e.g., L for MS2/Gamushiro/Honey Cup, Z for Stray Cannon)

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
