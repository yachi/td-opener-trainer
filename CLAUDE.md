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
*Source corrections: #30, #31, #32, #33, #34, #35, #36, and the Bag 2 post-mortem (12 iterations, 1000 lines deleted)*

### P1. Deliver value before engineering
Answer the user's actual question first. A 3-row table beats 2,000 lines of unshipped code. Build tools only after the user has the knowledge they need. Don't research for hours when 5 minutes of teaching would suffice.
*Source corrections: #1, #8, #11, #13, #18*

### P2. Verify with evidence, not reasoning
Never say "X should work" — run it, screenshot it, read the output. Test the FULL flow end-to-end, not just one step. Compare outputs character-by-character against authoritative sources. Use exhaustive enumeration (all 5040 permutations) over probabilistic arguments. Use gravity simulation over manual inspection. Write the RED test first — a test that passes without seeing it fail proves nothing.
*Source corrections: #2, #3, #4, #5, #6, #7, #16, #20, #21, #22, #26*

### P3. Don't trust intermediaries
Agent output can be wrong even when the parsed data was correct. localStorage keys can differ from what you assume. Playwright sessions don't share state with the user's browser. Fumen strings might encode a different variant than expected. Always verify the final output against the original source yourself.
*Source corrections: #9, #14, #15, #17, #19*

### P4. Build what the user needs, not what's interesting
If something looks interactive, make it interactive. If the user can't figure out how to proceed, the UI has failed. Don't make the user do manual steps you could automate. Write tests before code. Prioritize showing over testing — a learner needs to SEE the board before being quizzed.
*Source corrections: #8, #10, #11, #12, #13, #20*

### P5. When corrected, internalize immediately
If the user says "check the screen" once, check the screen every time going forward — don't wait to be told again. If the user says "step back," actually pause and reconsider the whole approach. A correction given twice means it wasn't internalized the first time.
*Source corrections: #3, #16, #18, #21, #23, #24, #25, #37 (all were repeated corrections)*

### P6. Help, don't order — use tools proactively
When verifying, navigate to the exact screen. When checking, run the exact command. When the user needs to see something, show them. Don't say "go ahead and check" — do it.
*Source corrections: #37*

### P7. Research before asking — never block on the user for answerable questions
If you have a question that can be answered by reading code, running tests, searching the web, or spawning a deep-research agent — do that instead of asking the user. Use the biggest effort available (parallel research agents, web search, exhaustive code search) to find the answer yourself. Only ask the user when the question is genuinely unanswerable from available sources (e.g., product direction, personal preference, access credentials).

---

## Core Lessons (condensed from 42 corrections — the rest are enforced by tests or absorbed by the 5 Principles above)

> **Numbering convention**: lessons are numbered `#1..#13`. When you see
> `L8` or `L9` inside a lesson's body, that refers to **Google L8 / L9
> engineering levels** (Principal / Distinguished Engineer) per the
> global `~/.claude/CLAUDE.md` L8/L9 redesign protocol — not to lesson
> numbers. The two namespaces are disjoint.

### #1. When the user says "use X tool" — USE IT immediately
User said "use the SRS engine" 10+ times over 10 hours. Each time I invented a workaround instead. When I finally used `findAllPlacements` from Cold Clear, it worked on the first try. **Rule**: If the user names a specific tool/function/library, use it in the NEXT code change. Not after research, specs, or consensus review. The user has already evaluated the options.

### #2. Write the red test first — the user's screenshot IS the test
When the user reports a bug with a screenshot: (1) extract the exact state, (2) write a test that creates that EXACT state, (3) confirm it FAILS, (4) THEN fix. Never write tests after the fix — a test that never failed proves nothing.

### #3. Write a TEST, not a lesson — tests enforce, lessons don't
After 4 floating-piece incidents in one session, each with a new lesson, the next incident happened anyway. **Meta-rule**: When you find yourself writing "remember to check X" — write a test that checks X. The lesson says what to do. The test actually does it.

### #4. Never regenerate golden data from code
Golden test data must come from an external source (wiki, spec, user). If code output diverges from golden data, investigate — don't update the golden data. Regenerating golden data from code converts an external oracle into a tautology.

### #5. Verify the FULL flow end-to-end, every step — not just one screenshot
After any UI change, test the ENTIRE flow with Playwright (start → navigate → interact → verify each screen). A final state that looks correct can hide intermediate violations. The user should never have to ask you to check.

### #6. Bag 2 routes depend on the EXACT Bag 1 shape
Before using Bag 2 route data from ANY source, verify that the source's Bag 1 base shape matches ours. Different openers and different ROUTES within the same opener can have different Bag 1 shapes (e.g., Gamushiro Form 2 uses 6 Bag 1 pieces, Form 1 uses 7).

### #7. Piece-level floating ≠ cell-level floating
Use `findFloatingPieces` (piece-level) not `findFloatingCells` (cell-level). Tetris pieces lock as rigid bodies — a cell with nothing below it is fine if it's part of a locked piece. J/L/T/S/Z routinely have overhanging cells.

### #8. Playwright sessions don't share state with the user's browser
Playwright has its own localStorage. Changes in headless Playwright don't affect the user's browser. To change user state, add a UI feature or instruct them clearly.

### #9. Delete the fight, not fix symptoms
When 3+ symptom fixes hit the same module, the abstraction is wrong. The 2026-04-09 drill had 5 recurring bugs (opacity, board basis, BFS reachability, piece count, white outlines) — none fixed the root cause. The root cause was the FIGHT between random bag order and required placement order, reconciled by `isBagPlayable` simulation. Deleting the random bag generation dissolved all 5 bug classes at once. **Rule**: count symptom fixes per module. At 3+, stop fixing and redesign. The new design should DELETE lines, not add them.

### #10. Empirical proof before code for L8/L9 redesigns
Write diagnostic tests (`tests/diag-*.test.ts`) that validate the design with concrete data BEFORE touching production. The L9 drill mental draft was "95% confident" but empirical testing found 3 critical issues: `canBuild` fails on BFS queues, Honey Cup doctrinal hold stalls, gamushiro form_2 needs bag1Reduced. Without the tests, these would have been new bugs. **Rule**: for any L8/L9 redesign, write the proof test first. The test file IS the design doc. Only write production code after the empirical data validates the design.

### #11. Intent actions — keyboard dispatches intents, reducer interprets
The manual-reveal SPACE bug ("can't advance to bag2 after placing last piece") was the symptom of a class: `src/input/keyboard.ts` was a partial interpreter of Session state. It decided what SPACE meant based on `(phase, playMode)` but missed context (`activePiece === null?`). Every new phase variant would require another branch — classic L3 growth.

**The L9 reframe**: add semantic actions (`primary` for SPACE/ENTER, `pick` for digit keys) that the REDUCER interprets based on full Session state. Keyboard becomes a dumb key→intent mapper. The bug fix falls out for free: the reducer's `primary` case knows to `advancePhase` when `activePiece === null` in manual reveal.

**Rule**: if an input handler needs to know about state beyond the key itself, move the decision into the reducer. Input layer maps keys to intents; state layer interprets intents. Commit `2cf1565`.

### #12. Runtime invariant wrapper — catches state-corruption bug classes
After the Bug #1 (hold display) and Bug #2 (pick bounds) fixes shipped, an adversarial audit found 4+ more latent holes: NaN/Infinity stats bypass `< >` comparisons via IEEE754, bag1/bag2 had zero runtime validation, float `routeIndex` passed the bounds check and produced empty `cachedSteps` (caught downstream as an uncaught exception), and more.

**The L9 move**: wrap the reducer with `assertSessionInvariants(next)` that enforces 9 explicit rules on every reduction. Any reducer case — current or future — that produces an invalid state throws at the boundary. This catches the CLASS of state-corruption bugs, not just named instances.

**Mutation testing pitfall**: the first attempt had a local wrapper in `diag-l9-invariants.test.ts` that masked the production wrapper. Mutation testing (delete `assertSessionInvariants(next)`, run tests, expect failures) revealed that **0 tests failed** — the wrapper was decorative. The fix: delete the local wrapper and add `#0 production sessionReducer wrapper is load-bearing` tests that construct corrupt state and expect the production wrapper to throw. Only then is the wrapper provably load-bearing.

**Rule**: if you add a runtime guard, run a mutation test — delete the guard, confirm ≥1 test fails. If 0 fail, the guard is decorative and you must write a test that fails without it. Commit `244a1db`.

### #13. L9 verification convergence loop — 8 layers, mutation testing cheapest
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

### #14. Plan in mind before touching code
User's literal instruction: *"create a plan in mind, don't change any code yet."* The user explicitly separates planning from implementation and expects me to sit in planning until the plan is 100% confident.

**Rule**: When asked to redesign, DO NOT touch `src/` until:
1. I've stated the plan concretely (files changed, exact diffs, verified invariants)
2. I've run empirical probes proving the plan works end-to-end
3. The user has signaled "go" — explicitly or via a command like `/st go`

**Anti-pattern**: jumping to code after presenting a plan. Even if the plan looks complete, the user wants to iterate on it adversarially (adding new constraints) before code lands. This session had 4+ planning rounds before the empirical probe convinced both sides.

**Signal**: the user repeats "don't change any code yet" — internalize it. Next time, they shouldn't have to say it.

### #15. "Confidence claims require code proof" — empirical probes, not reasoning
I claimed "100% confidence" multiple times based on theoretical analysis. Each time, the user pushed *"use code to prove your points."* Each probe found gaps:
- Probe 1 (placeability): "concat approach" fails for 12/44 routes
- Probe 2 (backtracking): succeeds for 43/44 routes
- Probe 3 (full pipeline): 44/44 with `bag1Reduction: 1` for Gamushiro form_2

Without probes, the plan would have shipped broken.

**Rule**: when I'm about to claim ≥95% confidence in a design, write a probe FIRST (`/private/tmp/probe-*.ts` — these are throwaway, no commit needed). The probe simulates the entire proposed flow over every input the system encounters. Only after the probe validates do I state confidence.

**Pattern**: `probe-{subject}.ts` in `/private/tmp/`. Uses production imports but doesn't modify src/. Iterates over all openers × mirrors × routes × edge cases. Prints concrete data.

**Why this works**: reasoning finds KNOWN unknowns. Probes find UNKNOWN unknowns. Confidence should scale with probes run, not with introspection quality.

### #16. Testing gap = broken testing ARCHITECTURE (not missing tests)
User's L9 framing: *"testing gaps is also gaps, delete and design the testing architecture."* When a redesign reveals "oh we should test X", don't just add tests — ask why the architecture allowed X to be untested.

**The 2026-04-16 guard matrix response**: when `browseOpener` shipped with 3 unguarded edge cases, the fix wasn't "add 3 tests." The fix was a DECLARATIVE guard matrix where every `(ActionType × Phase × PlayMode)` cell has an expected outcome, with a compile-time type check that makes missing entries a TYPE ERROR. Adding a new action without declaring its guards becomes structurally impossible.

**Rule**: if I catch myself thinking "I should add a test for X," ask: (1) should the test architecture have REQUIRED this test? (2) can I make future-me's gaps structurally impossible via types / generators / matrices?

**Patterns**:
- Declarative matrix + generator (guard-matrix.test.ts): cross-product of dimensions → test cases
- Compile-time completeness (`satisfies` + `Exclude<A, B> extends never`): missing entries = type error
- Property tests (fast-check): entire classes of inputs verified, not named cases

**Signal**: "add a test for X" is a band-aid; "make X untestable-to-forget" is L9.

### #17. Iterative constraint addition — user narrows the design space
Over the 2026-04-16 planning loop, the user added constraints one at a time:
1. "order is wrong" → need engine ordering
2. "make sure the bag can be placed like the wiki" → need playability guarantee
3. "stop directly edit cells, all placement through the tetris engine" → engine is single authority
4. "review as L9" → question the abstraction

Each constraint eliminated a design option. The final plan is the intersection. If I had proposed the final design upfront, I would have missed the middle constraints and shipped a partial fix.

**Rule**: when the user adds a new constraint mid-planning, treat it as another L9 review lens, not a scope change. Re-examine the current plan against ALL accumulated constraints. If the plan doesn't satisfy one, iterate. Don't defend the current plan — ingest the constraint and revise.

**Anti-pattern**: "I've already thought about that." The user wouldn't have added the constraint if it was already addressed. Accept it as new signal.

**This session's net effect**: 7 planning rounds, 3 empirical probes, zero code changes until round 8. The plan that shipped was fundamentally different from round 1's plan — all constraints accumulated into a coherent design. Net result: -820 lines.

### #18. Scattered string guards = shotgun surgery — use metadata tables
Adding guess3/reveal3 required updating 15+ locations with `phase === 'reveal1' || phase === 'reveal2' || phase === 'reveal3'`. Two were missed in keyboard.ts, causing bugs that the test suite didn't catch (guard-matrix tests cover reducer, not keyboard/renderer behavior).

**The L9 reframe**: the problem isn't "we forgot 2 locations" — the architecture allows an unbounded number of locations to forget. The fix: `PHASE_META: Record<Phase, PhaseMeta>` with `satisfies` for compile-time completeness. `isRevealPhase()` / `isGuessPhase()` replace all 13 scattered triples. Adding a new phase = 1 table row. Missing it = type error.

**Rule**: when you find 3+ locations branching on the same enum/union values, replace with a metadata table + query helpers. The table is the single source of truth; the helpers are the API. This generalizes beyond phases to any discriminated union.

**Mutation testing proof**: `isRevealPhase=true` → 236 test failures; `isGuessPhase=true` → 74 failures. Both functions are load-bearing. Commit `291d820`.

### #19. Engine gateway — session.ts MUST NOT import raw placement functions
`session.ts` had `stampCells` and `lockAndClear` imports that bypassed BFS validation. This caused 2 latent bugs: (1) stampCells doesn't clear lines, so PC manual play produced wrong boards after intermediate line clears, (2) the auto-advance skipped user-placed PC steps with line clears.

**The L9 reframe**: the problem isn't "these callers forgot to validate" — the architecture allowed importing unvalidated functions. The fix: session.ts only imports engine-validated APIs (`buildSteps`, `replayPcSteps`, `findTstStep`). Raw placement functions (`stampCells`, `lockAndClear`, `lockPiece`) stay in engine.ts for internal use and tests. `tests/diag-l9-engine-gateway.test.ts` enforces the boundary via source-text grep — importing a raw function is a test failure.

**Rule**: when adding new board-mutation logic, add it to `engine.ts` as a validated function (with BFS reachability or equivalent). NEVER add `stampCells`, `lockAndClear`, or direct `board[row][col] =` to `session.ts`. The architecture test catches this.

**Auto-advance rule**: `hardDrop` auto-advance past line-clear steps ONLY applies in `reveal2` (TST step, system-placed). In `reveal3` (PC), ALL steps are user-placed — no auto-advance. Commit `2dc0c24`.

## Architectural Invariants (MUST follow — enforced by tests)

### ALL piece placements go through the tetris engine
Every piece placed on a board MUST be validated by the engine's BFS reachability check (`isPlacementReachable`). There are exactly 3 validated entry points:
- **`buildSteps`** — DFS backtracking with BFS pruning (Bag 1/2 placements)
- **`replayPcSteps`** — linear replay with BFS check per step (PC placements)
- **`findTstStep`** — BFS-validated T-Spin Triple finder

**`session.ts` MUST NOT import**: `stampCells`, `lockAndClear`, `findAllPlacements`, `lockPiece`. These are internal engine primitives. If you need to place a piece from session.ts, add a new validated function to `engine.ts` that wraps the raw operation with BFS validation.

**`hardDrop` uses `cachedSteps[step].board`** (engine-validated) instead of stamping directly. Auto-advance past line-clear steps is **reveal2-only** (TST); in reveal3 (PC) all steps are user-placed.

**Enforced by**: `tests/diag-l9-engine-gateway.test.ts` — architecture test greps session.ts source; importing banned functions or writing `board[row][col] =` is a test failure.

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
- `src/session.ts` — unified reducer, `SessionAction` union (18 actions including intent actions `primary`/`pick`, browse action `browseOpener`, and `selectPcSolution`), `PHASE_META` table (`satisfies Record<Phase, PhaseMeta>` for compile-time completeness), `isRevealPhase`/`isGuessPhase` helpers, `assertSessionInvariants` (9 runtime invariants), `InvariantViolation`, `createSession`. `deriveBoard` centrally computes board from `(baseBoard, cachedSteps, step)` for reveal+auto states — individual actions set step/baseBoard/cachedSteps, never board. `hardDrop` uses `cachedSteps[step].board` (engine-validated) instead of raw `stampCells`; auto-advance restricted to `reveal2` only. **Does NOT import stampCells/lockAndClear** — all boards come from engine-validated functions. Production `sessionReducer` wraps raw reducer with deriveBoard + invariant check.
- `src/renderer/session.ts` — single phase-aware renderer, reads everything from Session (no static doctrinal reads except rule card + opener name). `drawReveal1Panel` shows user's held piece in manual mode (Bug #1 fix). 6 phase panels: guess1/reveal1/guess2/reveal2/guess3/reveal3.
- `src/renderer/board.ts` — canvas primitives, `COLORS` palette, `drawCell`, `drawPieceInBox`
- `src/input/keyboard.ts` — dumb key→intent mapper. DAS/ARR timing lives here. Uses `isRevealPhase()` from session.ts — no hardcoded phase strings. No phase-specific branching for SPACE/ENTER/digits (those dispatch intents; reducer interprets).
- `src/openers/bag3-pc.ts` — HC Perfect Clear solutions (4 normal + 4 mirror), `getPcSolutions(opener, mirror)`
- `src/app.ts` — thin entry: canvas setup, `setupKeyboard`, frame loop. ~70 LOC.

**Engine (post-L9 backtracking redesign — commit `044cb40`):**
- `src/core/engine.ts` — backtracking `buildSteps` (DFS + BFS pruning, mutate+undo, 100K attempt cap, returns longest prefix on failure). `findAllPlacements`, `stampCells`, `lockAndClear`, `findTstStep` (validated TST finder), `replayPcSteps` (BFS-validated PC replay), fumen bridge. **session.ts MUST NOT import `stampCells`/`lockAndClear`/`findAllPlacements`** — use `buildSteps`/`replayPcSteps`/`findTstStep` instead. Architecture enforced by `tests/diag-l9-engine-gateway.test.ts`.
- `src/openers/bag2-routes.ts` — `Bag2Route.bag1Reduction?: number` metadata. Only Gamushiro form_2 sets it (= 1) — its wiki board genuinely can't fit full Bag 1 (verified by 100K attempts failing in `/private/tmp/probe-backtrack.ts`).
- `src/openers/sequences.ts` — `getBag2Sequence` does ONE `buildSteps` call on `[bag1Used + hold + bag2]`, throws on incomplete (data bug, not runtime fallback).

**Test infrastructure (L9 speed redesign — commit `c73efe0`, 377s → 18s):**
- `tests/pbt-config.ts` — fast-check `configureGlobal` preload: dev=50 runs/5s cap, CI=2000 runs/60s cap
- `scripts/generate-drill-golden.ts` — golden fixture generator for drill-queue (gofmt/rustc/Z3 pattern). Re-run when placement data changes.
- `tests/fixtures/drill-steps-golden.json` — precomputed `buildSteps` output for all 44 opener×mirror×route combos (25KB). Source of truth = placement data, NOT code output. If code diverges, investigate — don't regenerate.
- Scripts: `test:fast` (19 files, ~15s dev loop), `test:slow` (2 heavy files), `test:ci` (CI=true, full PBT ~60s)

**Tests (22 files, 1113 tests, ~46K assertions, 19s full suite):**
- `tests/guard-matrix.test.ts` — 237 tests, declarative guard matrix (18 actions × 12 contexts) + edge cases + phase metadata structural tests. Compile-time completeness: adding a new action without guard spec OR a new phase without PHASE_META entry is a type error.
- `tests/diag-l9-session.test.ts` — 46 tests, Session reducer core actions (Phase 2.5 empirical proof for `9f4d8ae`)
- `tests/diag-l9-manual.test.ts` — 45 tests, manual-play actions (Phase 2.5 for Reframing A+ `a02012e`)
- `tests/diag-l9-intent.test.ts` — 22 tests, intent actions `primary`/`pick` + browse delegation (Phase 2.5 for `2cf1565` + `964f4ce`)
- `tests/diag-l9-invariants.test.ts` — 28 tests, runtime invariants + `#0` load-bearing wrapper tests (Phase 2.5 for `d590c8d` + `244a1db`)
- `tests/diag-l9-property.test.ts` — 13 fast-check properties, dev=50 runs (via pbt-config.ts), CI=2000 runs. Covers full action space + float/NaN/Infinity rejection.
- `tests/diag-l9-stamp.test.ts` — 66 tests, historical stamp proof (retained; local inline `stampSteps` still exercises the cell-data contract)
- `tests/diag-l9-board-oracle.test.ts` — 88 tests, assembled board occupancy vs wiki pfrow data
- `tests/diag-l9-engine-gateway.test.ts` — 7 tests, architecture boundary (session.ts doesn't import raw placement functions), PC manual hardDrop with line clears, reveal2 TST auto-advance
- `tests/diag-drill-queue.test.ts` — 169 tests, drill-queue ordering. Diag 4 uses golden fixture (was 131s×2 DFS exhaustion, now <1s fixture read).
- `tests/keyboard.test.ts` — 67 tests, input→dispatch mapping + DAS/ARR timing with mocked clock (browser-free)
- `tests/render-contract.test.ts` — 44 tests, recording canvas proxy verifies state→render contract (browser-free)
- `tests/acceptance.test.ts` — gravity, cell count, wiki oracle (uses `route.bag1Reduction` metadata)

**Deleted in L9 redesigns (don't look for these):**
- `src/modes/{onboarding,quiz,visualizer,drill}.ts` — the 4-mode architecture (deleted `9f4d8ae`)
- `src/play/manual.ts` — closure-based manual-play handler (deleted `a02012e`, state moved into Session)
- `src/stats/tracker.ts` — localStorage stats (deleted with persistence layer)
- `src/dispatcher/visualizer.ts` — (deleted)
- `src/renderer/{onboarding,drill,canvas}.ts` — mode-specific renderers (deleted)
- `src/core/engine.ts :: stampSteps` — raw cell-stamping function (deleted `044cb40`, was one side of the two-function fight; replaced by backtracking buildSteps)
- `tests/diag-l9-proof.test.ts` — historical Phase 2.5 proof (deleted `044cb40`, negative assertions inverted under backtracking)
- `localStorage` keys `onboarding_progress` and `tetris-td-quiz-stats` — persistence removed. Session lives in memory only; closing the tab IS the reset.

