# Roadmap

## Done
- [x] Onboarding: rule cards → worked examples → binary drill (MS2, Honey Cup, Stray Cannon)
- [x] Quiz mode: 3-button speed quiz, auto-advance, decision explanations, stats tracking
- [x] Visualizer: step-by-step board shapes for all 4 openers (normal + mirror)
- [x] Drill mode: SRS engine + DAS/ARR input + drill state machine + renderer
- [x] Navigation: clickable tabs, keyboard shortcuts

## Next
- [ ] Deploy to GitHub Pages (`td-opener-trainer`)
  - Add `"scripts": { "build": "vite build" }` to package.json
  - Set `base: '/td-opener-trainer/'` in vite.config.ts
  - Create `.github/workflows/deploy.yml` (bun + GitHub Actions)
  - `gh repo create td-opener-trainer --public --source=. --push`
  - Enable GitHub Actions as Pages source in repo settings
- [ ] Drill mode visual verification (never tested in browser)
- [ ] Gamushiro in onboarding (currently skipped)

## Backlog
- [ ] Bag 2 visualization (TST/TSD execution after Bag 1 setup)
- [ ] Adaptive quiz weighting (replay wrong bags more often)
- [ ] Drill mode polish (post visual verification)
