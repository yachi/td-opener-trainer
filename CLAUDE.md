# Project: Tetris TD Opener Practice Tool

## What the user wants to learn

Four Tetris TD (Triple-Double) openers:

| Chinese | Japanese | English | Hold | Rule |
|---------|----------|---------|------|------|
| 迷走炮 | 迷走砲 | Stray Cannon | Z | L not last of {L,J,S} |
| 蜜蜂炮 | はちみつ砲 | Honey Cup | L | L not last of {L,O,T} |
| 糖漿炮 | ガムシロ積み | Gamushiro | L | J before L (always works) |
| 山岳炮 | 山岳積み2号 | MS2 | L | J before L (always works) |

The user wants to:
1. **See** how each opener is built on the board (piece by piece)
2. **Memorize** which piece to hold and the decision rule for each
3. **Practice** recognizing which opener to use from a given bag

Priority: seeing the board shapes > memorizing rules > speed drilling

## 5 Principles (generalized from 20 mistakes)

### P0. Output-first: look at the reference, describe the output, build the minimum
Before building ANY feature: (1) open the authoritative source (wiki, existing tool, competitor), (2) describe in ONE sentence what the user will see, (3) hardcode that output as a walking skeleton, (4) if the skeleton works, ship it — no engine needed. This is Gate 0.
**Gate 1 (iteration 3):** Stop. Write "This component needs to exist because ___." If you can't fill the blank with evidence from the source, delete it. Ask "would I start this approach if starting fresh?" If no, abandon regardless of investment.
**Gate 2 (any time):** If implementation exceeds 3x the test size, something is wrong. If you're patching patches, you're in a degenerating programme — abandon.
*The most common error is to optimize a thing that should not exist. — Elon Musk*
*Lessons: #30, #31, #32, #33, #34, #35, #36, and the Bag 2 post-mortem (12 iterations, 1000 lines deleted)*

### P1. Deliver value before engineering
Answer the user's actual question first. A 3-row table beats 2,000 lines of unshipped code. Build tools only after the user has the knowledge they need. Don't research for hours when 5 minutes of teaching would suffice.
*Lessons: #1, #8, #11, #13, #18*

### P2. Verify with evidence, not reasoning
Never say "X should work" — run it, screenshot it, read the output. Test the FULL flow end-to-end, not just one step. Compare outputs character-by-character against authoritative sources. Use exhaustive enumeration (all 5040 permutations) over probabilistic arguments. Use gravity simulation over manual inspection. Write the RED test first — a test that passes without seeing it fail proves nothing.
*Lessons: #2, #3, #4, #5, #6, #7, #16, #20, #21, #22, #26*

### P3. Don't trust intermediaries
Agent output can be wrong even when the parsed data was correct. localStorage keys can differ from what you assume. Playwright sessions don't share state with the user's browser. Fumen strings might encode a different variant than expected. Always verify the final output against the original source yourself.
*Lessons: #9, #14, #15, #17, #19*

### P4. Build what the user needs, not what's interesting
If something looks interactive, make it interactive. If the user can't figure out how to proceed, the UI has failed. Don't make the user do manual steps you could automate. Write tests before code. Prioritize showing over testing — a learner needs to SEE the board before being quizzed.
*Lessons: #8, #10, #11, #12, #13, #20*

### P5. When corrected, internalize immediately
If the user says "check the screen" once, check the screen every time going forward — don't wait to be told again. If the user says "step back," actually pause and reconsider the whole approach. A correction given twice means it wasn't internalized the first time.
*Lessons: #3, #16, #18, #21, #23, #24, #25, #37 (all were repeated corrections)*

### P6. Help, don't order — use tools proactively
When verifying, navigate to the exact screen. When checking, run the exact command. When the user needs to see something, show them. Don't say "go ahead and check" — do it.
*Lessons: #37*

### P7. Research before asking — never block on the user for answerable questions
If you have a question that can be answered by reading code, running tests, searching the web, or spawning a deep-research agent — do that instead of asking the user. Use the biggest effort available (parallel research agents, web search, exhaustive code search) to find the answer yourself. Only ask the user when the question is genuinely unanswerable from available sources (e.g., product direction, personal preference, access credentials).

---

## Core Lessons (condensed from 42 corrections — the rest are enforced by tests or absorbed by the 5 Principles above)

### L1. When the user says "use X tool" — USE IT immediately
User said "use the SRS engine" 10+ times over 10 hours. Each time I invented a workaround instead. When I finally used `findAllPlacements` from Cold Clear, it worked on the first try. **Rule**: If the user names a specific tool/function/library, use it in the NEXT code change. Not after research, specs, or consensus review. The user has already evaluated the options.

### L2. Write the red test first — the user's screenshot IS the test
When the user reports a bug with a screenshot: (1) extract the exact state, (2) write a test that creates that EXACT state, (3) confirm it FAILS, (4) THEN fix. Never write tests after the fix — a test that never failed proves nothing.

### L3. Write a TEST, not a lesson — tests enforce, lessons don't
After 4 floating-piece incidents in one session, each with a new lesson, the next incident happened anyway. **Meta-rule**: When you find yourself writing "remember to check X" — write a test that checks X. The lesson says what to do. The test actually does it.

### L4. Never regenerate golden data from code
Golden test data must come from an external source (wiki, spec, user). If code output diverges from golden data, investigate — don't update the golden data. Regenerating golden data from code converts an external oracle into a tautology.

### L5. Verify the FULL flow end-to-end, every step — not just one screenshot
After any UI change, test the ENTIRE flow with Playwright (start → navigate → interact → verify each screen). A final state that looks correct can hide intermediate violations. The user should never have to ask you to check.

### L6. Bag 2 routes depend on the EXACT Bag 1 shape
Before using Bag 2 route data from ANY source, verify that the source's Bag 1 base shape matches ours. Different openers and different ROUTES within the same opener can have different Bag 1 shapes (e.g., Gamushiro Form 2 uses 6 Bag 1 pieces, Form 1 uses 7).

### L7. Piece-level floating ≠ cell-level floating
Use `findFloatingPieces` (piece-level) not `findFloatingCells` (cell-level). Tetris pieces lock as rigid bodies — a cell with nothing below it is fine if it's part of a locked piece. J/L/T/S/Z routinely have overhanging cells.

### L8. Playwright sessions don't share state with the user's browser
Playwright has its own localStorage. Changes in headless Playwright don't affect the user's browser. To change user state, add a UI feature or instruct them clearly.

### L9. Delete the fight, not fix symptoms
When 3+ symptom fixes hit the same module, the abstraction is wrong. The 2026-04-09 drill had 5 recurring bugs (opacity, board basis, BFS reachability, piece count, white outlines) — none fixed the root cause. The root cause was the FIGHT between random bag order and required placement order, reconciled by `isBagPlayable` simulation. Deleting the random bag generation dissolved all 5 bug classes at once. **Rule**: count symptom fixes per module. At 3+, stop fixing and redesign. The new design should DELETE lines, not add them.

### L10. Empirical proof before code for L8/L9 redesigns
Write diagnostic tests (`tests/diag-*.test.ts`) that validate the design with concrete data BEFORE touching production. The L9 drill mental draft was "95% confident" but empirical testing found 3 critical issues: `canBuild` fails on BFS queues, Honey Cup doctrinal hold stalls, gamushiro form_2 needs bag1Reduced. Without the tests, these would have been new bugs. **Rule**: for any L8/L9 redesign, write the proof test first. The test file IS the design doc. Only write production code after the empirical data validates the design.

### L11. Intent actions — keyboard dispatches intents, reducer interprets
The manual-reveal SPACE bug ("can't advance to bag2 after placing last piece") was the symptom of a class: `src/input/keyboard.ts` was a partial interpreter of Session state. It decided what SPACE meant based on `(phase, playMode)` but missed context (`activePiece === null?`). Every new phase variant would require another branch — classic L3 growth.

**The L9 reframe**: add semantic actions (`primary` for SPACE/ENTER, `pick` for digit keys) that the REDUCER interprets based on full Session state. Keyboard becomes a dumb key→intent mapper. The bug fix falls out for free: the reducer's `primary` case knows to `advancePhase` when `activePiece === null` in manual reveal.

**Rule**: if an input handler needs to know about state beyond the key itself, move the decision into the reducer. Input layer maps keys to intents; state layer interprets intents. Commit `2cf1565`.

### L12. Runtime invariant wrapper — catches state-corruption bug classes
After the Bug #1 (hold display) and Bug #2 (pick bounds) fixes shipped, an adversarial audit found 4+ more latent holes: NaN/Infinity stats bypass `< >` comparisons via IEEE754, bag1/bag2 had zero runtime validation, float `routeIndex` passed the bounds check and produced empty `cachedSteps` (caught downstream as an uncaught exception), and more.

**The L9 move**: wrap the reducer with `assertSessionInvariants(next)` that enforces 9 explicit rules on every reduction. Any reducer case — current or future — that produces an invalid state throws at the boundary. This catches the CLASS of state-corruption bugs, not just named instances.

**Mutation testing pitfall**: the first attempt had a local wrapper in `diag-l9-invariants.test.ts` that masked the production wrapper. Mutation testing (delete `assertSessionInvariants(next)`, run tests, expect failures) revealed that **0 tests failed** — the wrapper was decorative. The fix: delete the local wrapper and add `#0 production sessionReducer wrapper is load-bearing` tests that construct corrupt state and expect the production wrapper to throw. Only then is the wrapper provably load-bearing.

**Rule**: if you add a runtime guard, run a mutation test — delete the guard, confirm ≥1 test fails. If 0 fail, the guard is decorative and you must write a test that fails without it. Commit `244a1db`.

### L13. L9 verification convergence loop — 8 layers, mutation testing cheapest
"Tests pass" is NOT "verified at L9". The verification layers:
1. **Unit tests** (per-case fixtures)
2. **Integration / Playwright** (end-to-end)
3. **Mutation testing** — delete each guard one at a time, verify ≥1 test fails
4. **Property-based adversarial testing** — fast-check over 10k+ random sequences
5. **Coverage measurement** (optional)
6. **Performance profiling** (optional)
7. **Adversarial review** — independent reviewer tries to break the fix
8. **Invariant completeness** — enumerate every field and check runtime or type guarantee

**Loop protocol**: spawn parallel adversarial reviewers; converge findings; fix them; spawn another round; repeat until zero new findings. Typical: 3-4 rounds for a non-trivial fix.

**Highest value-for-time ratio**: mutation testing. It's cheaper than property-based testing and exposes "decorative guards" that unit tests silently pass over. Run a mutation pass on every new guard before claiming a fix is verified.

**Cheapest way to NOT converge**: spawn one agent, declare convergence if it finds nothing. Real convergence needs at least 2 adversarial rounds because round 1 often misses what it focused too narrowly on.

## Technical Reference

### Opener Conditions (verified by exhaustive enumeration of 5040 permutations)
| Opener | Normal | Mirror | With Mirror |
|--------|--------|--------|:-----------:|
| Honey Cup | L not last of {L,O,T} | J not last of {J,O,T} | 83% |
| MS2/Gamushiro | J before L | L before J | **100%** |
| Stray Cannon | L not last of {L,J,S} | J not last of {J,L,Z} | **100%** |

### Gravity Verification
After setting piece placement data, run:
```typescript
const resting = cells.some(c => c.row >= 19 || board[c.row+1]?.[c.col] !== null);
```
If not resting, the placement order is wrong. Use permutation solver to find valid orders.

### Fumen Sources
- Standard TD shape: `v115@9gB8HeC8DeA8BeC8AeJ8AeE8JeAgH` (24 cells, gray)
- Honey Cup shape: different from MS2 — parse from `/tmp/Honey Cup - Hard Drop Tetris Wiki.mhtml`
- Use `tetris-fumen` npm package to decode: `decoder.decode('v115@...')`

### Key Files (post-L9 redesign — commit `9f4d8ae` deleted the 4-mode architecture)

**Engine (unchanged, stable):**
- `src/core/srs.ts` — SRS rotation, kick tables, `hardDrop`, `spawnPiece`, `ActivePiece`, `Board`
- `src/core/engine.ts` — BFS `findAllPlacements`, `buildSteps`, `stampCells`, `lockAndClear`, fumen bridge
- `src/openers/placements.ts` — Bag 1 placement data for all 4 openers, mirror helpers
- `src/openers/bag2-routes.ts` — Bag 2 route data, `getBag2Routes`, route predicates
- `src/openers/decision.ts` — `bestOpener`, `canBuild`, `canBuildMirror`, opener definitions
- `src/openers/sequences.ts` — `getOpenerSequence` (extracted from deleted `modes/visualizer.ts`)

**Session (the single state machine — replaces the deleted 4-mode architecture):**
- `src/session.ts` — unified reducer, `SessionAction` union (16 actions including intent actions `primary`/`pick`), `assertSessionInvariants` (9 runtime invariants), `InvariantViolation`, `createSession`. Production `sessionReducer` wraps raw reducer with invariant check.
- `src/renderer/session.ts` — single phase-aware renderer, reads everything from Session (no static doctrinal reads except rule card + opener name). `drawReveal1Panel` shows user's held piece in manual mode (Bug #1 fix).
- `src/renderer/board.ts` — canvas primitives, `COLORS` palette, `drawCell`, `drawPieceInBox`
- `src/input/keyboard.ts` — dumb key→intent mapper. DAS/ARR timing lives here. No phase-specific branching for SPACE/ENTER/digits (those dispatch intents; reducer interprets).
- `src/app.ts` — thin entry: canvas setup, `setupKeyboard`, frame loop. ~70 LOC.

**Tests (15 files, 518 tests, ~40,889 assertions):**
- `tests/diag-l9-session.test.ts` — 44 tests, Session reducer core actions (Phase 2.5 empirical proof for `9f4d8ae`)
- `tests/diag-l9-manual.test.ts` — 45 tests, manual-play actions (Phase 2.5 for Reframing A+ `a02012e`)
- `tests/diag-l9-intent.test.ts` — 20 tests, intent actions `primary`/`pick` (Phase 2.5 for `2cf1565`)
- `tests/diag-l9-invariants.test.ts` — 28 tests, runtime invariants + `#0` load-bearing wrapper tests (Phase 2.5 for `d590c8d` + `244a1db`)
- `tests/diag-l9-property.test.ts` — 13 fast-check properties, 16k+ random runs covering the full action space + float/NaN/Infinity rejection
- `tests/keyboard.test.ts` — 67 tests, input→dispatch mapping + DAS/ARR timing with mocked clock (browser-free)
- `tests/render-contract.test.ts` — 44 tests, recording canvas proxy verifies state→render contract (browser-free)
- `tests/acceptance.test.ts` — gravity, cell count, wiki oracle
- `tests/diag-l9-proof.test.ts` — prior L9 drill redesign proof (kept as historical record)

**Deleted in L9 redesigns (don't look for these):**
- `src/modes/{onboarding,quiz,visualizer,drill}.ts` — the 4-mode architecture (deleted `9f4d8ae`)
- `src/play/manual.ts` — closure-based manual-play handler (deleted `a02012e`, state moved into Session)
- `src/stats/tracker.ts` — localStorage stats (deleted with persistence layer)
- `src/dispatcher/visualizer.ts` — (deleted)
- `src/renderer/{onboarding,drill,canvas}.ts` — mode-specific renderers (deleted)
- `localStorage` keys `onboarding_progress` and `tetris-td-quiz-stats` — persistence removed. Session lives in memory only; closing the tab IS the reset.

