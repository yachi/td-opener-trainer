# Roadmap

## Done
- [x] Onboarding: rule cards → worked examples → binary drill (MS2, Honey Cup, Stray Cannon)
- [x] Quiz mode: 3-button speed quiz, auto-advance, decision explanations, stats tracking
- [x] Visualizer: step-by-step board shapes for all 4 openers (normal + mirror)
- [x] Drill mode: SRS engine + DAS/ARR input + guided mode + playable bag validation
- [x] Navigation: clickable tabs, keyboard shortcuts
- [x] Drill mode golden data verification (bun test against fixtures)
- [x] Cold Clear libtetris port (`src/core/cold-clear.ts` — BFS move finder, reachability, lock+clear, 26 tests)
- [x] Bag 2 Phase 1: 2 routes per opener, residual data, wiki golden fixture (420 tests total)
- [x] Bag 2 Acceptance Test Overhaul: oracle test (V10), bridge step fix (baseBoard), continuity test (V11)

## Next
- [ ] Gamushiro in onboarding (currently skipped — data + logic exists, just needs stage flow)
- [ ] Deploy to GitHub Pages (`td-opener-trainer`) — workflow exists at `.github/workflows/deploy.yml`, needs push/enable

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

### Current Status (Phase 1 complete)
- 8 routes (2 per opener) with residual data, wiki golden fixture, 420 tests
- Bridge step fixed (baseBoard exposed to renderer)
- Oracle test (V10) + continuity test (V11) prevent regression

## Bag 2 architectural decision
Bag 2 pieces interlock — no valid sequential placement order exists. Show the COMPLETE final board and highlight one piece per step. No floating possible because all pieces are always present. Matches Hard Drop wiki (one board per route).

## Lessons: Bag 2 Acceptance Test Overhaul (2026-04-06)
3 visual bugs in one session, all passing 378 tests. Root cause: Test Oracle Problem — tests verified intermediate data, not complete output against wiki. Fixed by: V10 oracle test (cell-by-cell vs wiki), bridge step baseBoard, V11 continuity test. All 3 now done and passing (420 tests).

## Backlog
- [ ] Adaptive quiz weighting (replay wrong bags more often — data model exists)
- [ ] Bag 3 PC visualization (after Bag 2 is built)
- [ ] Drill difference highlighting (red outline on mismatched cells in failed screen)
