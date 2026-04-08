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

## Technical Reference

### localStorage Keys
- `'onboarding_progress'` — OnboardingProgress (NOT 'tetris-td-onboarding')
- `'tetris-td-quiz-stats'` — StoredQuizStats

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

### Key Files
- `src/core/srs.ts` — SRS rotation, kick tables, `hardDrop`, `spawnPiece`, collision detection
- `src/core/engine.ts` — unified engine: BFS `findAllPlacements`, `buildSteps`, fumen bridge, `findFloatingPieces`, `lockAndClear`
- `src/modes/visualizer.ts` — unified `VisualizerState` (6 flat fields), placement data for all 4 openers × 8 routes
- `src/modes/onboarding.ts` — shape_preview→rule_card→examples→drill→celebration learning flow
- `src/modes/quiz.ts` — speed quiz (only useful after learning)
- `tests/acceptance.test.ts` — 28 acceptance tests: gravity, no disappearing, cell count, wiki oracle
- `tests/` — 460 tests across 11 files

## Workflow: L8 Redesign Protocol

Trigger: user says **"L8"**, "L8 mode", or "work on X as a google l8 engineer".

**Core rule: ALL work happens in spawned agents — including reading code for implementation prep. The main session ONLY orchestrates (spawns agents, reviews their output, commits). Never read implementation files, write code, or do pre-work in the main session — it pollutes context and makes reverting hard. If you need to understand code before giving agent instructions, spawn a research agent for that.**

### L8 Mindset
Think like a Google L8 principal engineer. The default is DELETE code and REDESIGN the system, not patch or extend. Every function must justify its existence with evidence (callers, tests). Dead code dies. Duplicate paths merge. If the current design is why the problem exists, fix the design — not the instance. Draft 99% of the code mentally before writing anything. Reference industrial standards (open source reference implementations, peer-reviewed learning models, formal specs).

### Phase 1: Research Agents (spawn 2-3 opus agents in parallel)
Split research by angle — e.g., agent 1 maps current architecture, agent 2 researches industrial standards, agent 3 traces all callers/tests. Each prompt must include:
- Specific research scope (don't overlap)
- "DO NOT write code or edit files. Research only."
- Convergence loop: draft design, adversarial review, gap scan, repeat until 0 new findings
- Output: exact file-by-file change list with line numbers, what to DELETE, what to MERGE, what's new

### Phase 2: Converge & Review
Main session reads all agent outputs. Build cross-agent disagreement table, resolve to 0 disagreements. Ask user for approval if scope is large.

### Phase 3: Implementation Agents (spawn 2-3 opus agents in parallel)
Split the work into independent slices. Each agent gets:
- Precise instructions: exact functions to copy/delete, exact lines to change
- `mode: bypassPermissions` (agents get blocked on Edit/Bash otherwise)
- "DO NOT commit"

### Phase 4: Verify & Commit (main session)
1. `bun test` — all tests pass
2. Playwright screenshot — visual verification
3. `git diff --stat` — review total impact
4. Commit with conventional commit message
