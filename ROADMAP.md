# Roadmap

## Done
- [x] Onboarding: rule cards → worked examples → binary drill (MS2, Honey Cup, Stray Cannon)
- [x] Quiz mode: 3-button speed quiz, auto-advance, decision explanations, stats tracking
- [x] Visualizer: step-by-step board shapes for all 4 openers (normal + mirror)
- [x] Drill mode: SRS engine + DAS/ARR input + guided mode + playable bag validation
- [x] Navigation: clickable tabs, keyboard shortcuts
- [x] Drill mode visual verification (Playwright)

## Next
- [ ] Gamushiro in onboarding (currently skipped — data + logic exists, just needs stage flow)
- [ ] Deploy to GitHub Pages (`td-opener-trainer`)

## Bag 2 Visualization (researched, not yet scoped)

### How TD openers work across 3 bags
| Bag | Action | Lines cleared |
|-----|--------|---------------|
| Bag 1 | Build foundation (what we have now) | 0 |
| Bag 2 | Fire TST (T-Spin Triple) | 3 |
| Bag 3 | Fire TSD + Perfect Clear | 5 (8 total) |

### Key finding: Bag 2 is NOT deterministic
Each opener has 3-5 routes depending on which Bag 2 pieces arrive first.

| Opener | Decision rule | # Routes | Beginner set |
|--------|-------------|----------|-------------|
| MS2 | Which of {I,O,S} first in Bag 2? S→A, O→B, I→C | 4 | C + D (~80%) |
| Honey Cup | O before L? + J/Z order | 3-7 | Main + Compromise (100%) |
| Gamushiro | Always A or D route (O timing) | 4 | A alone (83%) |
| Stray Cannon | Which of {J,O,S} first? J→A, O→B, S→C | 3+ | A first (highest PC) |

### Routes are shared between openers (learn 5 shapes, cover all 4)
| Shape | Used by |
|-------|---------|
| Olive Stacking | MS2 Route C + Stray Cannon Route A |
| Gamushiro Default | MS2 Route A + Gamushiro Default |
| Kuromitsu | MS2 Route E + Stray Cannon Route D |
| Hotcake (old) | MS2 Route D (unique) |
| Donut | MS2 Route B (rare) |

### Label mismatch warning
johnbeak.cz and tetristemplate.info use DIFFERENT A/B/C/D labels for the same routes.
Must establish canonical mapping before building.

### Implementation phases
**Phase 1** (beginner): 2 routes per opener with binary condition ("S before O? → Route 1")
**Phase 2** (intermediate): Learning order (C→D→A→B), progressive unlock
**Phase 3** (gap in ecosystem): Auto-detect route from actual Bag 2 pieces, interactive drill

### Sources
- johnbeak.cz: most detailed data (route tables, minimal solves, fumen links)
- tetristemplate.info: best pedagogy (learning order, progressive disclosure)
- Wicurio wiki: simplest beginner presentation (2 routes only)

### Current Status
- Framework built (types, navigation, rendering, 8 routes × 2 = 16 with mirror) — committed
- Wiki source parser built — extracts boards from Hard Drop {{pfrow}} markup via Playwright
- Placement data + post-TST residual extracted for 8 routes (2 per opener) from wiki
- Golden fixture (`tests/fixtures/bag2-golden.json`) stores wiki-extracted coordinates + residual
- Each `Bag2Route` has a `residual` field (post-TST cells from wiki), used as Bag 2 base board
- **BLOCKER**: Bridge step rendering bug (canvas.ts:277) — Bag 2 step 0 shows wrong board. See "Acceptance Test Overhaul" section below.

## Bag 2 architectural decision
Bag 2 pieces interlock — no valid sequential placement order exists. Show the COMPLETE final board and highlight one piece per step. No floating possible because all pieces are always present. Matches Hard Drop wiki (one board per route).

## Done: Cold Clear libtetris ported (2026-04-06)
`src/core/cold-clear.ts` — BFS move finder, reachability check, lock+clear. 26 tests.
- `findAllPlacements(board, piece)` — all SRS-reachable lock positions
- `isPlacementReachable(board, type, col, row, rot)` — target reachability
- `lockAndClear(board, piece)` — immutable place + line clear
Ready for: Bag 2 placement validation, Phase 3 auto-route, Bag 3 PC solver.

## Bag 2 Acceptance Test Overhaul (from root cause analysis 2026-04-06)

### Problem
3 visual bugs in one session, all passing 378 tests. Root cause: tests verify intermediate data (piece coords, fumen strings) but never compare complete rendered output against the wiki source. This is the Test Oracle Problem — tests answer "does the data match itself?" instead of "does the output match the wiki?"

### Fix: 3 items

- [ ] **Complete Board Oracle Test** — compare the 20×10 board cell-by-cell at Bag 2 final step against wiki-extracted golden data (52 cells: 24 pieces + 28 residual). External oracle from Hard Drop wiki, not self-generated. Data already extracted in `tests/fixtures/bag2-golden.json`. One test that would have caught all 3 data bugs.

- [ ] **Bridge Step Fix (canvas.ts:277)** — Bag 2 Step 0/N shows `steps[0].board` which already has the first piece placed. The base board (Bag 1 + residual, no Bag 2 pieces) is not exposed to the renderer. Fix: either add a `baseBoard` field on the sequence, or prepend a step 0 with just the base board. This is the bug the user reported as "4→6 board jumps."

- [ ] **Transition Continuity Test** — assert every Bag 1 cell visible at step 6/6 is also visible (non-null) at Bag 2 step 0. Catches rendering-level bugs where data is correct but display is wrong.

### Why this keeps happening (meta)
Pattern: fix symptom → add narrow test for that symptom → next symptom passes the narrow test. The oracle test breaks this cycle because it tests the COMPLETE output against the EXTERNAL source, not a property of the intermediate data.

## Backlog
- [ ] Adaptive quiz weighting (replay wrong bags more often — data model exists)
- [ ] Bag 3 PC visualization (after Bag 2 is built)
- [ ] Drill difference highlighting (red outline on mismatched cells in failed screen)
