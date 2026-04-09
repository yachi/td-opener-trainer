# L9 Session Redesign — Delete Modes, Unify into One Loop

**Date**: 2026-04-09
**Level**: L9 (problem reframe, not restructure)
**Status**: Phase 2.5 complete (empirical proof passing) — awaiting user spec review before Phase 3

---

## 0. Problem reframe

**Stated problem**: "Very hard to reset the progress and start again."

**L9 reframe**: Modes are the disease. The app has 4 state machines (`onboarding`, `quiz`, `visualizer`, `drill`) with 2 localStorage silos, fragmented reset semantics, and a one-way door on onboarding completion. Adding a "reset" button is L3 — it treats the symptom. The L9 move is to **delete the mode architecture**, because once there is only one state machine with no persistence, **reset stops being a concept** — every new bag IS a reset.

**One-sentence insight**: There is no visualizer, drill, quiz, or onboarding. There is a **bag**, a **guess**, and a **build**. Every "mode" in the current codebase is just a different lens on those three variables.

---

## 1. Context & scope

**Current state** (from Phase 1 research — see agent reports in conversation 2026-04-09):

- 4 modes × 4 separate state machines. `app.ts` is 866 LOC of branching orchestration.
- 2 localStorage keys: `onboarding_progress` (OnboardingProgress, 474 LOC of mastery logic), `tetris-td-quiz-stats` (StoredQuizStats).
- `src/renderer/onboarding.ts` alone is **1,172 LOC**.
- Zero `localStorage.removeItem()` calls in all of `src/`.
- Onboarding completion is a **one-way door** — once `currentStage === 'complete'`, no UI path restarts it.
- 7 distinct reset pain points identified (see Phase 1 report).

**In scope**: full architectural redesign of the flow, deletion of mode abstraction, removal of persistence, redesign of the on-screen UX.

**Out of scope**: engine primitives (`src/core/srs.ts`, `src/core/engine.ts`), opener data (`src/openers/*`), test infrastructure, golden data (wiki-verified placement data stays).

---

## 2. Goals & non-goals

### Goals
1. Dissolve the "hard to reset" problem by eliminating persistent state entirely.
2. Delete ≥2× more lines than are added (L9 budget discipline).
3. Keep all three core user needs: **see** shapes, **memorize** rules, **practice** recognition.
4. Single-screen UX — no mode tabs, no home screen, no navigation traps.
5. Preserve the proven engine + opener decision layers (100% reuse).

### Non-goals
1. Feature additions — no new openers, no new drill variants, no new quiz types.
2. Backwards-compatible migration of old localStorage keys — they get deleted, period.
3. Progress tracking beyond in-session counters.
4. High-score persistence or accounts.

---

## 3. Cross-team impact

None. Solo project, no downstream consumers outside this repo. No API contracts to preserve.

---

## 4. The design

### 4.1 State shape

One module: `src/session.ts`. One type:

```ts
type Session = {
  bag1: Piece[]                       // random 7-perm, fresh every loop
  bag2: Piece[]                       // random 7-perm for route phase
  phase: 'guess1' | 'reveal1' | 'guess2' | 'reveal2'
  guess: { opener: OpenerId; mirror: boolean } | null
  correct: boolean | null             // after submit
  board: Board                        // live board being built
  cachedSteps: BuildStep[]            // placements for reveal (auto or manual)
  step: number                        // index into cachedSteps
  playMode: 'auto' | 'manual'         // auto = animate, manual = user places
  route: Bag2RouteId | null           // picked after guess2
  sessionStats: {                     // in-memory only — NEVER persisted
    total: number
    correct: number
    streak: number
  }
}
```

### 4.2 Reducer actions

10 actions, all exercised in Phase 2.5 proof tests:

| Action | Valid phase | Effect |
|---|---|---|
| `newSession` | any | Regenerate bag1/bag2, reset phase/board/guess/correct. **Keeps sessionStats and playMode** (in-session soft reset). |
| `setGuess` | `guess1` | Set `guess.opener` without submitting |
| `toggleMirror` | `guess1` (with guess set) | Flip `guess.mirror` |
| `submitGuess` | `guess1` | Compute `correct` via **buildable relation** (see L10 finding #1), cache steps, advance to `reveal1` |
| `stepForward` | `reveal1`, `reveal2` | `step++`, apply placement to `board` |
| `stepBackward` | `reveal1`, `reveal2` | `step--`, roll back placement |
| `togglePlayMode` | any | Flip auto ↔ manual |
| `pieceDrop` | `reveal1`, `reveal2` (manual) | Validate user placement against expected cells (set equality via stringified keys); advance step on match |
| `selectRoute` | `guess2` | Pick bag2 route, cache bag2 steps **against the bag1 final board** (not an empty board), advance to `reveal2` |
| `advancePhase` | `reveal1`, `reveal2` | reveal1→guess2; reveal2→newSession (with stats carried forward) |

`createSession()` (not an action, a constructor) is the **cold-start path**: fresh everything INCLUDING `sessionStats` zeroed. Used only on page load.

### 4.3 Correctness semantics

**Critical finding from Phase 2.5 (L10 surprise #1)**: "correct answer" MUST use the `canBuild || canBuildMirror` **buildable relation**, NOT `bestOpener`. Reason: `bestOpener` is priority-ordered `[honey(1), ms2(2), gamushiro(3), stray(4)]`, and MS2 has `setupRate.withMirror: 1.0`, so `bestOpener` can never return `stray_cannon` and often skips `gamushiro`. Using it as the correctness oracle would make half the openers un-guessable.

**The rule**: user's guess is correct iff `OPENERS[guess.opener].canBuild(bag1) || (guess.mirror && canBuildMirror(bag1, guess.opener))`. MS2 and Gamushiro are implicitly interchangeable under this rule — both match whenever `appearsBefore(bag, 'J', 'L')`, so guessing either is correct. This matches the existing special case at `src/modes/quiz.ts:165-168`.

**On wrong guess**: `reveal1` still shows a build — but of the **authoritative `bestOpener`** answer, not the user's wrong guess. This makes the reveal an educational correction rather than a misleading demo.

### 4.4 UX — single screen, always

```
┌──────────────────────────────────────────────────────────────┐
│  [Session: 12 / 15 · streak 5]          tetris-td practice   │
├─────────────────────┬────────────────────────────────────────┤
│                     │  Phase: guess bag 1                    │
│                     │  Bag: Z S J L T I O                    │
│                     │                                        │
│   BOARD (live)      │  (1) Stray    L not last of {L,J,S}    │
│                     │  (2) Honey    L not last of {L,O,T}    │
│                     │  (3) Gamushi  J before L               │
│                     │  (4) MS2      J before L               │
│                     │  [M] mirror: off                       │
│                     │                                        │
│                     │  ENTER submit · SPACE skip             │
├─────────────────────┴────────────────────────────────────────┤
│  1/2/3/4 opener  M mirror  ENTER submit  P auto/manual  R new│
└──────────────────────────────────────────────────────────────┘
```

**UX principles**:
1. **Rule card IS the UI** — 4 opener rules visible during every `guess1`. Memorization via repeated exposure, not one-time lesson.
2. **Every session starts at `guess1` with a fresh bag** — no home screen, no mode selector.
3. **Reset is free** — SPACE after reveal = new bag. R any time = new bag. Close tab = session dies. Nothing survives reload.
4. **Keyboard-native**: `1-4` opener, `M` mirror, `ENTER` submit, `SPACE` advance, `P` auto/manual, `H` hint overlay, `R` new bag, `←/→` step.
5. **Auto ↔ manual is a toggle, not a mode switch** — `P` flips whether the reveal animates itself or waits for user inputs. Same state, different input handler.

---

## 5. Alternatives considered

### Alternative A: Add "reset everything" button, keep modes
- **Delta**: ~+100 LOC (button + confirmation + multi-silo wipe).
- **Rejected because**: treats symptom, not root cause. Still have 4 mode state machines, `prevAppMode` shadow state, onboarding one-way door, etc. Fails the L9 "delete the fight" rule.

### Alternative B: Unify into one mode, keep persistence
- **Delta**: ~−500 LOC.
- **Rejected because**: persistence is the source of the reset problem. Keeping it means the UX still has to expose reset affordances, migration logic, and version fields. Half-measure.

### Alternative C (chosen): Delete modes AND delete persistence
- **Delta**: ~−2,700 LOC + ~+1,160 LOC = **−1,540 LOC net**.
- **Chosen because**: dissolves the problem category, not just the instance. Matches L9 "redefine the problem" principle per Jeff Dean framework in CLAUDE.md.

---

## 6. Migration plan

Atomic single-commit refactor with clear rollback (single `git revert`).

1. **Phase 2.5 (complete)**: `tests/diag-l9-session.test.ts` — 44 tests, 382 assertions, 1046 lines. Reference reducer inlined. Passing against real engine primitives. **586 total tests pass.**
2. **Phase 3a**: Copy reference reducer → `src/session.ts`. Make diag test import from production path. Verify green.
3. **Phase 3b**: Build `src/renderer/session.ts` (unified single-screen renderer). Reuse `src/renderer/board.ts`, `queue.ts` primitives. Old renderers still compile but unreferenced.
4. **Phase 3c**: Rewrite `src/app.ts` entry to route through Session only. Delete `src/modes/onboarding.ts`, `quiz.ts`, `visualizer.ts`. Refactor `src/modes/drill.ts` → `src/play/manual.ts` (~200 LOC). Delete `src/renderer/onboarding.ts`, `src/renderer/drill.ts`, `src/dispatcher/visualizer.ts`. Delete persistence in `src/stats/tracker.ts`.
5. **Phase 4**: `bun test` (expect ≥586 pass), Playwright screenshot every phase, `git diff --stat` verify deletion > addition, single conventional commit.

**Rollback points**: After Phase 3a (session reducer added, nothing deleted yet). After Phase 3b (renderer added, still nothing deleted). After Phase 3c (full refactor, pre-commit). At each point, `git reset --hard HEAD` returns to safety since nothing is committed until Phase 4.

---

## 7. Phase 2.5 L10 surprises (caught by empirical proof)

These are the 7 issues the diagnostic test file discovered BEFORE any src/ modification — exactly the "surprises" L10 is designed to surface. Implementation agents MUST respect these:

1. **`bestOpener` is NOT the correctness oracle** — it's priority-ordered and stray_cannon/gamushiro can never win. Use `canBuild || canBuildMirror`.
2. **MS2 and Gamushiro are interchangeable for correctness** — both match `appearsBefore(bag, 'J', 'L')`. Guessing either is correct when either is correct.
3. **Reveal-on-wrong-guess shows the authoritative `bestOpener` answer**, not the user's (possibly un-buildable) guess.
4. **`newSession` keeps sessionStats** (user pressed R for new bag) but **`createSession()` zeros them** (cold page load). Two distinct reset paths.
5. **`toggleMirror` guarded to `phase === 'guess1' && guess !== null`** — otherwise it mutates reveal state.
6. **`pieceDrop` cell comparison via stringified `{col,row}` key sets** — BFS cell order isn't stable.
7. **`selectRoute` captures the bag1 final board** from `cachedSteps.at(-1).board` before computing bag2 steps — matching existing drill `transitionToBag2` pattern.

---

## 8. Deletions budget

| File | LOC | Fate |
|---|---|---|
| `src/modes/onboarding.ts` | 474 | DELETE |
| `src/renderer/onboarding.ts` | 1,172 | DELETE |
| `src/modes/quiz.ts` | 223 | DELETE (absorbed into `guess1`/`guess2`) |
| `src/modes/visualizer.ts` | 162 | DELETE (absorbed into `reveal1`/`reveal2`) |
| `src/dispatcher/visualizer.ts` | 61 | DELETE |
| `src/stats/tracker.ts` persistence | ~50 of 114 | DELETE (keep in-memory counter logic) |
| `src/app.ts` branching | ~350 of 866 | DELETE |
| `src/renderer/canvas.ts` branching | ~150 of 549 | DELETE |
| `src/modes/drill.ts` → `src/play/manual.ts` | 529 → ~200 | REFACTOR (−329) |
| `onboarding_progress` localStorage | — | DELETE |
| `tetris-td-quiz-stats` localStorage | — | DELETE |

**Deletion total**: ~2,700 LOC.

| New file | LOC | Role |
|---|---|---|
| `src/session.ts` | ~250 | Session state + reducer |
| `src/renderer/session.ts` | ~350 | Unified phase-aware renderer |
| `src/play/manual.ts` | ~200 | Manual-play input (refactored drill) |
| `src/input/keyboard.ts` | ~60 | Single unified keyboard handler |
| `tests/diag-l9-session.test.ts` | 1046 | Empirical proof (already shipped in Phase 2.5) |

**Addition total**: ~1,906 LOC (including the proof tests, which are already in place).

**Net production code delta**: −2,700 + 860 = **−1,840 LOC net in src/** (excluding test file). Deletion > addition by 3.1×. **Unambiguously L9.**

---

## 9. Metrics

| Metric | Value |
|---|---|
| Effort | high (3 implementation agents, ~3-4 hours orchestration) |
| Impact | very high (dissolves 7 pain points from Phase 1 agent 1's list) |
| Confidence | 95% (Phase 2.5 proof tests green — the reference reducer IS validated) |
| Risk | medium (large diff, atomic revert possible, 586 tests as safety net) |
| Reversibility | high (single commit, `git revert` restores) |
| Maintainability | +++ (one state shape vs four) |
| Expandability | +++ (new openers drop into same reducer) |

---

## 10. Success criteria

1. `bun test` reports ≥586 pass, 0 fail (including all 44 new diag-l9-session tests).
2. Playwright screenshots of every phase (guess1, reveal1 auto, reveal1 manual, guess2, reveal2) render correctly.
3. `git diff --stat` shows lines deleted > 2× lines added.
4. No `localStorage.getItem` or `localStorage.setItem` calls remain in `src/`.
5. No references to `appMode`, `prevAppMode`, `onboardingMenuOpen`, `OnboardingProgress`, `StoredQuizStats` anywhere in `src/`.
6. A brand-new user closing and reopening the tab lands in `guess1` with fresh bags and zero stats (verified by Playwright).
