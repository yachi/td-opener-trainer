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
*Lessons: #30, #31, #32, #33, and the Bag 2 post-mortem (12 iterations, 1000 lines → 10-line solution)*

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
*Lessons: #3, #16, #18, #21, #23, #24, #25 (all were repeated corrections)*

---

## Detailed Lessons (from user corrections)

### 1. Don't over-engineer before delivering value
**Mistake**: User asked "help me memorize and practice 4 openers." I spawned 20+ agents, wrote 2,100 lines of code, 6 rounds of UX research — and the user still hadn't learned a single opener.
**Correction**: "stop engineering and actually walk you through learning them"
**Rule**: Teach the user first. Build tools second. A 3-row table of rules is worth more than 2,000 lines of unshipped code.

### 2. Don't guess piece placements — use authoritative data
**Mistake**: Hand-coded approximate piece positions for all 4 openers. They were wrong (floating pieces, incorrect shapes).
**Correction**: "research the 100% correct placement, do the acceptance criteria yourself, dont waste my time"
**Rule**: Always decode from community fumen strings or parse from Hard Drop wiki. Never guess Tetris board positions. Verify with gravity simulation.

### 3. Verify in the browser, don't just claim it works
**Mistake**: Said "You should see the Honey Cup rule card" without actually checking what the user sees.
**Correction**: "can you remember and verify it yourself every time"
**Rule**: After any UI change, take a screenshot with Playwright and READ it before telling the user what they should see. Never say "you should see X" — say "I verified: it shows X."

### 4. Don't claim things are the same without verifying
**Mistake**: Claimed "Honey Cup and MS2 have the same Bag 1 shape" based on sharing the same fumen. They don't.
**Correction**: User showed Hard Drop wiki screenshot proving they're different shapes.
**Rule**: Cross-reference community sources (Hard Drop wiki, shiwehi.com, four.lol) before making claims about opener shapes. Different openers have different Bag 1 shapes even if they hold the same piece.

### 5. Piece placement order matters — verify with gravity
**Mistake**: Placed S piece before L piece, causing S to float in mid-air.
**Correction**: "s is floating" / "is there any tetris engine you can use to verify"
**Rule**: After setting piece placement data, run gravity simulation: for each step, verify the piece has at least one cell resting on the floor or an existing piece. Use the permutation solver to find valid orders.

### 6. MS2 canBuild condition was wrong
**Mistake**: Used "J before S" (50% one-side, 75% with mirror). Community says 100% with mirror.
**Correction**: "why ms2 is not 100%"
**Rule**: The correct MS2 condition is "J before L" (hold whichever comes later). P(J<L or L<J) = 100%. Verify buildability rates by exhaustive enumeration of all 5040 bag permutations.

### 7. The quiz was trivially gameable
**Mistake**: `submitAnswer()` accepted any buildable opener as correct via the alternatives list. Since most bags allow 3-4 openers, randomly pressing any button showed "CORRECT."
**Correction**: "why randomly pressing 1,2,3 are all showing correct"
**Rule**: Only the highest-priority opener is the correct answer. Alternatives are informational, not accepted as correct. Write a test: random guessing should be ~33% accurate, not >50%.

### 8. The user hasn't memorized the openers yet
**Mistake**: Built a quiz that tests recognition before teaching the rules. The tool tests but doesn't teach.
**Correction**: "the user has not learned/memorize those opening yet, how they use this quiz"
**Rule**: For a new learner, the tool must teach before testing. Sequence: rule card → worked examples → binary drill → multi-opener quiz. Never cold-quiz on material the user hasn't seen.

### 9. localStorage key mismatch
**Mistake**: Wrote to `'tetris-td-onboarding'` in Playwright but the code uses `'onboarding_progress'`. The app ignored saved progress.
**Correction**: Discovered by debugging why stage wasn't advancing.
**Rule**: Always `grep STORAGE_KEY` from the source before interacting with localStorage. Never assume the key name.

### 10. Tabs were not clickable
**Mistake**: Tab bar (Quiz/Visualizer/Drill) was rendered text on canvas with no click handler. User couldn't navigate.
**Correction**: "can i just click the tab and go to visualizer directly"
**Rule**: Any UI element that looks interactive must BE interactive. Canvas elements need click hit-testing.

### 11. The tool should teach how to BUILD openers, not just NAME them
**Mistake**: Built an elaborate quiz for "which opener fits this bag?" but never showed what the openers look like on the board.
**Correction**: "what i want to learn is like how to actually build the opener for like stray opener, the app never teach me that"
**Rule**: The visualizer (step-by-step board shapes) is more important than the quiz for a learner. Prioritize showing where pieces go over testing bag recognition.

### 12. Write acceptance criteria tests BEFORE implementation
**Mistake**: Built the onboarding module without tests first. Had to retrofit tests after the fact, missing edge cases.
**Correction**: "do we have acceptance criteria yet" / "opus agents start with writing acceptance criteria first"
**Rule**: TDD — write the test file first, define the API contract, then implement to pass. The tests ARE the spec.

### 13. Don't waste the user's time with manual steps
**Mistake**: Told the user to open DevTools and paste JavaScript to skip onboarding stages. That's my job, not theirs.
**Correction**: "add first" (when I suggested a workaround instead of building the skip feature)
**Rule**: If the user needs a feature to use the tool, build it. Don't offer workarounds, console commands, or manual steps. A keyboard shortcut takes 5 minutes to add.

### 14. 糖漿炮 is Gamushiro (ガムシロ積み), not MS1/Syrup Stacking
**Mistake**: Initially identified 糖漿炮 as MS1/Syrup Stacking (hold J, 53% setup rate). Wrong opener entirely.
**Correction**: Discovered through convergence research that ガムシロ = ガムシロップ = Gum Syrup = 糖漿 (syrup in Chinese).
**Rule**: 糖漿炮 = ガムシロ積み (Gamushiro Stacking). Hold L, 100% setup with mirror, 99% PC rate. Verify Chinese↔Japanese↔English opener name mappings against community sources before coding.

### 15. Headed browser sessions don't share localStorage with Playwright headless sessions
**Mistake**: Set localStorage in Playwright, told user "you should see Honey Cup", but user's browser showed MS2 because Playwright sessions are isolated.
**Correction**: "check the screen" (repeatedly)
**Rule**: Playwright sessions have their own localStorage. Changes made in headless Playwright don't affect the user's browser. To change user's state, either add a UI feature (skip button) or instruct them clearly.

### 16. "check the screen" — verify the FULL flow, not just one screenshot
**Mistake**: Multiple times I told the user what they "should see" without verifying via screenshot. Even when I did screenshot, I only checked one step — not the full user journey.
**Correction**: "check the screen" / "show me" / "prove it" / "can you try all the new flow yourself, dont waste my time"
**Rule**: After any UI change, test the ENTIRE flow end-to-end with Playwright (start → navigate → interact → verify each screen). Screenshot and READ every step. The user should never have to ask me to check.

### 17. Check local files the user gave you before searching the web
**Mistake**: User saved the Hard Drop wiki page to `/tmp/Honey Cup - Hard Drop Tetris Wiki.mhtml`. I kept trying to WebFetch harddrop.com (403 errors) and searching the web repeatedly instead of reading the file the user already provided.
**Correction**: "check /tmp/Honey Cup - Hard Drop Tetris Wiki" / "i have shared to you before"
**Rule**: When the user says they've already shared something, check local files first (`/tmp/`, working directory, recent file paths). Don't re-search the web for data the user already downloaded for you.

### 18. Step back and think about the big picture before acting
**Mistake**: Multiple times I jumped into implementation or spawned agents without considering whether the approach was right. Built a quiz before teaching. Built a visualizer with wrong data. Researched for hours before delivering value.
**Correction**: "step back and think about the big picture and what you should do" (said twice)
**Rule**: Before spawning agents or writing code, ask: "Does this actually help the user learn the 4 openers they asked about?" If the answer is unclear, stop and ask — or just teach them directly.

### 19. Don't trust the agent's output — verify parsed data matches the source
**Mistake**: Agent parsed the MS2 wiki page and wrote code with `I horizontal` and `L on left wall`. But the wiki clearly shows `I vertical` and `J on bottom`. The parser read the correct text (`IS..`, `ISS..`) but the agent encoded the wrong piece positions.
**Correction**: "why ms2 and honey the same opening" / user showed Hard Drop screenshot proving I is vertical
**Rule**: After an agent writes piece placement data, always: (1) print the board as ASCII, (2) compare character-by-character against the wiki source, (3) screenshot the result. Don't trust that the agent correctly translated parsed data into code.

### 20. UI instructions must be clearly visible, not faint
**Mistake**: The celebration screen showed "[Space] to continue" in faint gray (#666688). User asked "how to go to next after ms2" because they couldn't see the instruction.
**Correction**: "how to go to next after ms2"
**Rule**: Any actionable instruction (press Space, press N to skip) must be clearly visible — use a contrasting color, not faint gray. If a user asks "how do I go to the next screen," the UI has failed.

### 21. Write the red test FIRST, then fix — never implementation before failing test
**Mistake**: User reported unplayable bags (L arrives before I, hold occupied). I wrote the fix (`isBagPlayable`) first, then added tests that passed. The user corrected: "you should add red tests first."
**Correction**: "industrial standard how to do it, also you should add red tests first"
**Rule**: TDD — always: (1) write a test with the EXACT failing scenario (e.g., the specific bag from the user's screenshot), (2) run it and confirm it FAILS, (3) implement the fix, (4) run it and confirm it PASSES. Never write tests after the fix — they prove nothing because you never saw them fail.

### 22. Bag "buildable" ≠ bag "playable" — validate placement order against hold constraint
**Mistake**: `canBuild(bag)` only checks the decision rule (e.g., "L not last of L,O,T"). It doesn't check whether pieces can be placed in the bag's arrival order with one hold. User got stuck: Honey Cup bag had L arriving before I, hold already occupied by S.
**Correction**: User screenshot showing L active, S in hold, I in queue — unplayable state.
**Rule**: When generating bags for drill mode, simulate the full placement sequence: for each piece in bag order, check if it can be placed (target supported) or held (hold empty/swappable). Reject bags where a piece arrives before its support AND hold can't save it.

### 23. Rendering bugs can't be caught by unit tests — add layout constraint tests
**Mistake**: Hint text rendered at y=684, behind the status bar at y=672. All unit tests passed because they test logic (getTargetPlacement returns correct data), not rendering (where text appears on canvas).
**Correction**: "why you cannot reproduce it in test"
**Rule**: For canvas rendering, add layout constraint tests that assert Y positions don't overlap reserved regions (status bar, tab bar). Unit tests cover logic; layout tests cover positioning; Playwright covers visual verification. All three layers are needed.

### 24. Record every correction as a lesson — don't wait to be told twice
**Mistake**: Throughout this session, user had to explicitly ask me to write down lessons. I should have captured each correction immediately: "translucent should not float" → lesson. "show all placeholders" → lesson. "red tests first" → lesson. Instead I implemented fixes without documenting what I learned.
**Correction**: "can you literally writing down learnings for every interaction with me"
**Rule**: After EVERY user correction — no matter how small — immediately add a numbered lesson to CLAUDE.md BEFORE continuing implementation. The lesson documents: what I did wrong, the user's exact words, and the rule to follow going forward. This is the FIRST action after a correction, not an afterthought.

### 25. "Show all" means ALL — don't interpret narrowly
**Mistake**: User asked "should we show all by default." I interpreted "all" as "show the target even when unsupported" (for the current piece only). User corrected — they meant show ALL piece targets simultaneously (the entire opener shape), not just the active piece.
**Correction**: "did i say show all placeholders?"
**Rule**: When the user says "all", they mean ALL. Don't narrow the scope based on what's easiest to implement. Ask for clarification if unsure, but default to the broader interpretation.

### 26. User's screenshot IS the red test — reproduce the exact scenario
**Mistake**: User showed a screenshot of the exact unplayable state (Honey Cup, S held, L active, I in queue). I wrote a generic playability check and generic tests. The user wanted me to reproduce THEIR exact scenario as a failing test first.
**Correction**: "industrial standard how to do it, also you should add red tests first"
**Rule**: When the user reports a bug with a screenshot: (1) extract the exact state (bag order, piece, hold, board), (2) write a test that creates that EXACT state, (3) assert it fails, (4) THEN fix. The user's reproduction case is sacred — it's the acceptance test.

### 27. Completion check must match actual placeable pieces, not hardcoded 6
**Mistake**: `hardDropPiece` checks `piecesPlaced >= 6` and compares against the full expected board. But Honey Cup and Gamushiro have 7 placement steps in the visualizer (hold piece L is also placed via hold swap). With a 7-bag + 1 hold, only 6 pieces end up on board. The expected board has 28 cells (7 pieces) but the user's board has 24 (6 pieces) — ALWAYS mismatches. The check fires before J is placed.
**Correction**: User screenshot showing "Shape mismatch" with J missing from their build but present in expected.
**Rule**: The completion check must account for the hold piece. For openers where the hold piece is also in the placement steps (Honey Cup, Gamushiro), the expected board for comparison should exclude the piece that ends up in hold. Never hardcode piece counts — derive from the opener data.

### 33. Lessons don't prevent bugs — tests do. Run findFloatingCells BEFORE claiming anything works.
**Pattern**: 4 separate floating-piece incidents in one session. Each time I added a lesson. Each time the next incident happened anyway. I have 32 lessons but lessons are instructions I must remember — I don't reliably remember. Tests are instructions the computer remembers.
**Root cause**: I verify what I built (does it render?) not what could go wrong (does it obey physics?). I have `findFloatingCells()` but never run it before claiming things work. I eyeball screenshots instead of running code.
**Permanent fix**: Before writing ANY board data, write the gravity test FIRST. Not after. Not "I'll verify with Playwright." The test runs `findFloatingCells()` on EVERY board state (Bag 1 AND Bag 2, every step, normal + mirror). If ANY cell floats unexpectedly, the test fails. This is the V1b pattern extended to all board data. No board data enters the codebase without passing this gate.
**The meta-rule**: When I find myself writing a lesson that says "remember to check X" — instead write a TEST that checks X. The lesson says what to do. The test actually does it.

### 32. Wiki pfrow cells can be multi-character — parser must handle composites
**Mistake**: The wiki uses multi-char cell names like `LZ`, `SZ` in pfrow templates. These represent Bag 1 piece overlap markers (residual). Our parser only handled single-char cells, dropping multi-char cells from the residual. This produced an incomplete residual with gaps, causing ALL Bag 2 pieces to float.
**Correction**: User screenshot of Stray Cannon J piece floating at step 6/7.
**Rule**: When parsing wiki pfrow templates: (1) ANY non-empty, non-dot cell in the residual zone is a G cell, regardless of character count. (2) Use the wiki's "clean residual" board (shows only G cells, no Bag 2 overlay) as the authoritative source. (3) After extracting, verify cell count matches expected (24 or 28 per opener).

### 31. Check EVERY step, not just the final state — intermediate steps can float
**Mistake**: Verified Stray Cannon Bag 2 by screenshotting only the final step (7/7). Said "no floating." But at step 6/7, J piece is clearly floating with a gap below it. The final O piece on top of J made the final state look connected, masking the intermediate float.
**Correction**: User screenshot of step 6/7 showing J floating.
**Rule**: When verifying board states, step through EVERY step and check gravity at each one. A final state that looks correct can hide intermediate violations. Automate this: the V1b gravity test checks every step, but only for Bag 1 — extend it to Bag 2.

### 30. The TST fires DURING Bag 2, not at the Bag 1/2 boundary — Bag 2 pieces fill gaps first
**Mistake**: Assumed the T-Spin Triple fires immediately after Bag 1 is complete. Wrote `computePostTst` that places T directly on the unfilled Bag 1 board. But Bag 1 rows are only 4-9/10 filled — the TST can't fire yet. The correct flow: (1) place some Bag 2 pieces to fill gaps around the TST pocket, (2) T enters the pocket, (3) 3 now-full rows clear, (4) remaining Bag 2 pieces placed on residual. The TST slot is also at the OVERHANG area (created by Bag 1's T piece), not at the center gap.
**Correction**: Engine correctly showed 0-2 lines cleared instead of expected 3 — because rows weren't full.
**Rule**: The TST is a mid-Bag-2 event, not a Bag 1/2 boundary event. The Bag 2 visualization must show: gap-filling pieces → T enters → lines clear → remaining pieces. Never assume board operations happen at bag boundaries — verify the actual game flow from the wiki.

### 29. "No overlapping" is not "correct" — always check physics AND compare against wiki source
**Mistake**: Saw Bag 2 screenshot with Z piece at rows 16-17 floating in mid-air (residual at row 19, nothing at rows 17-18). Said "the board looks correct — no overlapping cells." Failed to check gravity AND failed to compare against the Hard Drop wiki board diagram.
**Correction**: "why cant you see it floating? also what does hard wiki showed?"
**Rule**: When verifying a board visually: (1) check EVERY highlighted piece has support below it — if there's a gap between the piece and the nearest filled row, it's floating; (2) compare the screenshot character-by-character against the source wiki diagram. "No overlap" is necessary but not sufficient. "Physically valid AND matches source" is the bar.

### 28. Bag 2 routes depend on the EXACT Bag 1 shape — different sources use different shapes
**Mistake**: Decoded Bag 2 fumen strings from johnbeak.cz and plugged them into our visualizer. But johnbeak.cz's Bag 1 shape for Honey Cup differs from our Hard Drop wiki-sourced shape. The Bag 2 I piece at col 6 overlapped with our Bag 1 T piece at col 6.
**Correction**: User reported "first I overlapped, open playwright and check"
**Rule**: Before using Bag 2 route data from ANY source, verify that the source's Bag 1 base shape matches ours. Diff the fumen's gray (X) cells against our Bag 1 board. If they differ, the Bag 2 data is incompatible.

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
- `src/openers/decision.ts` — canBuild conditions, DECISION_PIECES, bestOpener()
- `src/modes/visualizer.ts` — piece placement data for all 4 openers
- `src/modes/onboarding.ts` — teach→try→test learning flow
- `src/modes/quiz.ts` — speed quiz (only useful after learning)
- `tests/` — 103 tests covering quiz, onboarding, visualizer
