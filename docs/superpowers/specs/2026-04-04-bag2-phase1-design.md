# Bag 2 Visualization Phase 1: Acceptance Criteria

## User Story
As a learner who has built the Bag 1 opener shape, I want to see how to execute the T-Spin Triple in Bag 2, so I can complete the full TD attack instead of just knowing the setup.

## Context
- All 4 openers fire a TST (T-Spin Triple) in Bag 2, then TSD + Perfect Clear in Bag 3
- Bag 2 is NOT deterministic — each opener has 3-5 routes depending on piece order
- Phase 1 scope: show 2 routes per opener (covers 80-100% of cases)
- Phase 1 is visualization only (like the Bag 1 visualizer), not a playable drill

## Route Data (2 routes per opener)

### MS2
| Route | Condition | Shape | Coverage |
|-------|-----------|-------|----------|
| C (Olive) | S first among {I,O,S} | Olive Stacking ideal | ~50% |
| D (Hotcake) | O first among {I,O,S} | Hotcake ideal | ~30% |
| Combined | | | ~80% |

### Honey Cup
| Route | Condition | Shape | Coverage |
|-------|-----------|-------|----------|
| Main | O before L in Bag 2 | Honey Cup ideal | ~67% |
| Compromise | L before O | Compromise shape | ~33% |
| Combined | | | 100% |

### Gamushiro
| Route | Condition | Shape | Coverage |
|-------|-----------|-------|----------|
| A (Default) | O comes early | Gamushiro default | ~83% |
| D (Alt) | O comes late | Gamushiro alt | ~17% |
| Combined | | | 100% |

### Stray Cannon
| Route | Condition | Shape | Coverage |
|-------|-----------|-------|----------|
| A (Ideal) | J first among {J,O,S} | Olive Stacking ideal | ~67% |
| D (Kuromitsu) | S first among {J,O,S} | Kuromitsu ideal | ~33% |
| Combined | | | 100% |

## Acceptance Criteria

### Visualizer Extension
- [ ] **B1**: Bag 2 tab/section added to the visualizer (separate from Bag 1 steps)
- [ ] **B2**: For each opener, 2 routes are shown with their condition label (e.g., "Route C: S comes first")
- [ ] **B3**: Each route shows step-by-step piece placement on the board, starting from the Bag 1 final shape
- [ ] **B4**: The TST execution step is highlighted (T piece entering the T-spin slot)
- [ ] **B5**: Post-TST residual shape is shown (board after 3 lines clear)
- [ ] **B6**: User can switch between Route 1 and Route 2 with keyboard (e.g., 1/2 keys) or click

### Board Continuity
- [ ] **B7**: Bag 2 visualization starts from the correct Bag 1 final board (6 pieces placed, matching the opener)
- [ ] **B8**: The held piece from Bag 1 is shown in the hold box and gets used during Bag 2
- [ ] **B9**: Line clears are visualized — when the TST fires, 3 rows disappear and remaining pieces drop

### Route Condition Display
- [ ] **B10**: The route condition is displayed clearly (e.g., "S appears before O and I in Bag 2")
- [ ] **B11**: The decision pieces are highlighted in the queue (same style as Bag 1 quiz decision highlighting)

### Navigation
- [ ] **B12**: Bag 1 → Bag 2 navigation via arrow keys or step-through (after Bag 1's last step, → goes to Bag 2)
- [ ] **B13**: Status bar shows "Bag 2 · Route C · Step 3/8" or similar

## Not in Scope (Phase 1)
- No Bag 2 drill (playable practice) — visualization only
- No Bag 3 / Perfect Clear visualization
- No auto-route detection from actual bag pieces
- No more than 2 routes per opener
- No fumen import/decode for route data (hardcode placement data like Bag 1)

## Data Source
- Route shapes and placements from tetristemplate.info (primary) and johnbeak.cz (verification)
- Must decode fumen strings or manually extract board positions from wiki pages
- Use the same placement data format as Bag 1 (`RawPlacement[]` in visualizer.ts)

## Label Convention
Use tetristemplate.info's route labels (A/B/C/D/E) as canonical, with a mapping note to johnbeak.cz labels for cross-reference.
