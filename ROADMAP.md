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
- Framework built (types, navigation, rendering, 11 tests) — committed
- Wiki source parser built — extracts boards from Hard Drop {{pfrow}} markup via Playwright
- All 4 openers' wiki sources cached at /tmp/ and parsed into Bag 2 boards
- Placement data extracted and gravity-verified for 8 routes (2 per opener)
- **BLOCKER**: Bag 2 boards show post-TST residual (after 3 lines clear), not pre-TST. The visualizer needs to handle: (1) T enters TST slot, (2) 3 lines clear, (3) residual drops, (4) remaining 6 pieces placed. This requires line-clear logic in the visualizer.
- Previous attempt with johnbeak.cz fumen data REVERTED — their Bag 1 shapes differ from ours
- Hard Drop wiki data is compatible — Bag 1 shapes match confirmed

## Planned: Port Cold Clear libtetris to TypeScript
Cold Clear's `libtetris` (~1000 lines Rust) provides reachability checking (`find_moves()` — BFS from spawn through SRS moves) that tetris-fumen doesn't have. Needed for:
- **Bag 2 validation**: verify placements are physically reachable, not just gravity-valid
- **PC solver**: enumerate all possible Bag 3 placements for Perfect Clear
- **Phase 3 auto-route**: detect optimal route from actual Bag 2 pieces
Source: https://github.com/MinusKelvin/cold-clear (archived, `libtetris/src/`)

## Backlog
- [ ] Adaptive quiz weighting (replay wrong bags more often — data model exists)
- [ ] Bag 3 PC visualization (after Bag 2 is built)
- [ ] Drill difference highlighting (red outline on mismatched cells in failed screen)
