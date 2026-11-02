# Founder's Five: build progress

Orchestrator: Opus 5.5 session started 2026-11-02 00:21 ET. Builders: Sonnet subagents. Spec: `../prd/PRD.md`. Contracts: `engine/types.md`.
Resume rule: this file alone is enough to continue. Statuses: todo, running, check, done, failed, cut.

## Now
- Wave: 1 (launched 00:30 ET)
- Live URL: not yet (target https://pjogilvie7.github.io/founders-five/)
- Higgsfield credits used: 28.5 of 150

## Tasks

| Wave | Task | Owner | Files owned | Status | Check | Result |
|---|---|---|---|---|---|---|
| 0 | Skeleton, contracts, tokens, progress | orchestrator | engine/types.md, app.css tokens, PROGRESS.md, package.json | done | files exist; every task listed | pass |
| 1 | T0 Stax reference screenshots | sonnet | reference/stax/ | running | 10 PNGs (5 screens x 2 sizes) + notes.md | |
| 1 | T1 Data job: SPCX, SPY, rates, CBOE, SEC; build-cards; workflows | sonnet | scripts/update-data.mjs, scripts/build-cards.mjs, scripts/lib/*, data/meta.json, data/update-log.json, data/market.json, data/spcx-options.json, data/test-status.json, data/src/spcx/base.json, .github/workflows/* | done | `node scripts/update-data.mjs` writes data; meta.asOf = last trading day | 33/33 tests; asOf 2026-10-30; facts match; street check model 188.84 @ DGS1 4.42% vs market 182.59 |
| 1 | T2 Card universe, seeded draw, blind card base data | sonnet | scripts/universe.mjs, scripts/fetch-card.mjs, data/universe.json, data/src/c*/base.json | running | universe lists included/excluded with 424B4 links; draw reproducible | |
| 1 | T3a SpaceX lockup read A | sonnet | data/src/spcx/lockup-readA.json | done | tranches with quotes and pages | |
| 1 | T3b SpaceX lockup read B (no shared context) | sonnet | data/src/spcx/lockup-readB.json | done | tranches with quotes and pages | |
| 1 | T4 Engine core: pricing, metrics, tax, calendar; tests 1-5, 9, 10 | sonnet | engine/pricing.js, metrics.js, tax.js, calendar.js, engine/core.test.js | done | `node --test` green | 21/21 pass (orchestrator re-ran) |
| 1 | T7 Engine sim: lockup, rules, loan, sim, bots, debrief; tests 6-8, 11, 12 | sonnet | engine/lockup.js, rules.js, loan.js, sim.js, bots.js, debrief.js, engine/sim.test.js | done | `node --test` green; bots run on every card | 97/97 tests (all suites); bots on real SPCX: holder/seller/playbook after-tax wealth $79.3M/$79.4M/$80.4M; puts + exchange fund built |
| 1 | T5 Art: Higgsfield vignettes and icons (cap 150 credits), procedural guilloche | sonnet | assets/**, ui/guilloche.js | done | assets populated; CREDITS.md with prompts and credits | 19 rasters + 8 SVG icons + guilloche; 28.5 credits (1185.75 -> 1157.25) |
| 1 | T6 UI shell: title, seat select, intro, rail, paper, tabs frame, routing, lesson overlay | sonnet | index.html, app.css, app.js, ui/data.js, ui/format.js, ui/store.js, ui/rail.js, ui/paper.js, ui/title.js, ui/seat.js, ui/intro.js, ui/lesson.js, ui/mock.js | running | screenshots 1280x800 and 375x812 | |
| 1 | T11 Pages: Method, Data, AI, Glossary | sonnet | ui/pages.js, ui/glossary.js | done | every 4.8 formula verbatim; every rule links a source | ~130 checks pass; formulas verbatim vs PRD; 9 rules linked; 19 screenshots |
| 1.5 | T3c SpaceX reconciler | sonnet | data/src/spcx/lockup.json | done | matches filing; diffs vs PRD 4.1 listed | 10 tranches reconciled; Dec 9 proposal overruled to Dec 8 (fact 3, specific clause); data/cards/spcx.json shipped |
| 1.5 | T3 blind-card lockup reads A/B + reconciler for drawn cards; T3c SpaceX reconciler | sonnet | data/src/*/lockup*.json | todo | reconciled or dropped; >= 4 blind cards | |
| 2 | T8 Headlines and reveals | sonnet | data/src/c*/headlines.json, reveal.json, scripts/check-headlines.mjs | todo | 8 per card; check passes | |
| 2 | T9 Tool tabs + events + chart wired to engine | sonnet | ui/tabs/*.js, ui/events.js, ui/chart.js | todo | scripted run hits release, window close, margin call, house | |
| 2 | T10 Scoreboard, reveal, debrief, achievements | sonnet | ui/scoreboard.js, ui/achievements.js | todo | scoreboard values equal score() | |
| 3 | Integration, e2e, grader path | orchestrator + sonnet | tests/e2e.spec.mjs | todo | scoreboard < 60 s via Watch | |
| 3 | Accuracy critics: banker, quant | sonnet x2 | reports only | todo | findings fixed or logged | |
| 3 | Gauntlet x8 pieces vs Stax | sonnet builders + critics | per piece | todo | wins blind or logged | |
| 4 | Repo, Pages, workflow run, live check | orchestrator | .github | todo | live URL passes no-login check | |
| 4 | Should-haves in order | sonnet | | todo | | |
| 4 | Demo video, submission PDF, REPORT, NEEDS-PJ | sonnet | submission/, REPORT.md | todo | | |

## Open gaps
- Collared lending and the 500-strategy percentile are not built yet (should-haves).
- BLOCKER: `gh repo create --public` denied by the auto-mode classifier at 00:45 (Create Public Surface). Logged in NEEDS-PJ.md with exact commands; build continues and is tested on a local server.
- Keep-awake request was denied by the auto-mode classifier at 00:21; relying on the app's own per-turn hold.

## Decisions taken tonight (also appended to ../prd/DECISIONS.md)
- Blind cards are normalized in the engine (offer = $100, 1,000,000 shares; volume and shares outstanding scaled) so indexed prices, share counts and dollars stay consistent. Reason: PRD Q18 (prices indexed to 100) without breaking W_t. Cost if wrong: none; a display choice, returns identical.
- IRR starts from after-tax day-0 wealth (panel RUN-5, 5-0).
- Spending draws cash, index fund, credit line, overdraft (RUN-4 D1); collar rolls obey the window (RUN-4 D2).
- Street check copy generated from nightly data (DGS1 4.42%: model cap $188.84 vs listed $182.59).
- Sales cost (0.25%) reduces the amount realized for tax; golden test 9 calls the tax function with cost 0.
