# Project: Tetris TD Opener Practice Tool

## Lessons Learned (from user corrections)

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
