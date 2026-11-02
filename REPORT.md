# Founder's Five: overnight build report (2026-11-02)

**Bottom line.** The game is built, tested and committed locally. It is not live yet: the session's permission system refused to create the public repo at 00:45 ET, and the build did not work around that refusal. Going live takes the three commands in `NEEDS-PJ.md` (about 3 minutes). Every check that does not need the live site passes on a local server.

## Live link
https://pjogilvie7.github.io/founders-five/ (returns 404 until the repo is pushed; see `NEEDS-PJ.md` item 1)

## What shipped against PRD section 10

**Must: all shipped.**
- The live SpaceX card and 6 blind cards, both seats.
- Clock with auto-pauses.
- Tools: Stock, 10b5-1, Collar, Credit Line, Cash and Index Fund.
- Rules panel, three bots, and a scoreboard with the four measures.
- Reveal with templated debrief, the house event and 12 achievements.
- Method, Data, AI and Glossary pages.
- Golden tests, portrait phone play and the Intaglio art.
- The nightly job is written and tested, but has not run on GitHub because no repo exists.

**Should:**
- **Shipped:** 6 blind cards, puts, exchange fund, percentile against 500 random strategies, compare runs, share codes, demo video (51 s) and the submission PDF (5 pages, 19 links).
- **Not built:** collared-share lending (engine flag exists, off), and a state tax toggle (state tax is listed as left out on the Method page and scoreboard).

**Won't:** none built, as planned.

## Test results (run 2026-11-02 10:40 ET on the final build)

| Suite | Result |
|---|---|
| `node --test` (engine and scripts) | 175 of 175 pass |
| `tests/e2e.mjs` (grader path: fresh browser, both viewports, no login, Watch reaches the scoreboard in about 5 s, data fresh) | 14 of 14 |
| `tests/tabs-e2e.mjs` (every tool, gating reasons, release, margin call, house) | 94 checks, zero console errors |
| `tests/shell-shots.mjs`, `pages-shots.mjs`, `score-shots.mjs`, `should-s1.mjs` | all pass, zero console errors |
| `tests/golden.xlsx` (live spreadsheet formulas re-derive 6 golden tests) | all rows PASS |
| `scripts/check-headlines.mjs` | all cards pass |

Data as of 2026-10-30, the last trading day before this build.

## Gauntlet against the reference game (blind critic, both questions must go to ours)

| Piece | Result |
|---|---|
| Lesson cards | won, round 1 |
| Title | won, round 2 |
| Scoreboard | won, round 3 |
| Moments (release, margin call, house) | won, round 4 |
| Seat select and intro | won, round 5 |
| Rail | won, round 8 |
| Phone | won, round 14 |
| Collar panel | **not won; logged.** 12 rounds. It wins "more finished" in most rounds and loses "would keep playing" to the reference's one-number savings card. Round 12's critic also named a sticky header that clips the panel top, a pill over the border, and a phone confirm button below the fold. The bug-fix round was cut off by the 6:00 time box, so these three defects ship. |

## Accuracy
- **Two independent critics.** A private banker and a quant each tried to break the rules and the numbers. Eleven fixes were accepted, then re-verified in the engine and in the served UI by a third, fresh agent. All 11 pass.
- **Fixes:**
  - founder cooling-off date
  - no new hedges under a 10b5-1 plan
  - margin-call deadline counted in trading days
  - forced-sale sizing
  - terminal tax nets losses
  - 20-day minimum history for collars
  - dividends
  - idle cash swept into the index fund
  - thin option expiries dropped
  - the house "skip" removed
- **Blind headlines.** These went through 4 identification rounds. Card 2 (Peloton) stays identifiable to an expert model; Card 4 (Pinterest) weakly so.

## Higgsfield credits
28.5 of the 150 authorised (19 images at 1.5 each). Log: `assets/CREDITS.md`.

## Decisions made tonight
Full table with reasons in `../prd/DECISIONS.md`. The ones that change the PRD:
- **Spending order** (RUN-4, 5 to 1): cash, then index fund, then credit line, then overdraft.
- **Collar rolls** (RUN-4, 6 to 0): a roll obeys the trading window.
- **IRR** (RUN-5, 5 to 0): after tax at both ends.
- **House** (RUN-6, 5 to 1): no "skip".
- **SpaceX day-180 tranche:** kept on Dec 8, not the reconciler's Dec 9.
- **Lyft lockup:** ends 2019-08-19, from Lyft's own 8-K.

## Monday human checklist (PRD 11)
1. **Go live** (`NEEDS-PJ.md` item 1, 3 min). Then open the link in a private window on a phone (15 min).
2. **Sign off tranches** (2 h): `data/src/*/lockup.json` against `research/reconcile-*.md`. Flagged: SpaceX Dec 8 vs Dec 9, the Lyft 8-K date, the Pinterest employee date.
3. **Read headlines and reveals** (1 h): all are marked `review: "pending"`. Decide whether Card 2 (Peloton) stays or swaps for c7 (Warner Music, ready).
4. **Finalize the PDF** (1.5 h): fill in the team names, then rerun `node scripts/make-pdf.mjs` after going live.
5. **Playtest** with a classmate (30 min).
6. **Rehearse the interview** (45 min). Say "about $189 at today's 1-year rate" for the Street check, not the PRD's $187.

## Run it locally
```bash
cd /Users/pjogilvie/fmrksAiExtraCredit/founders-five && python3 -m http.server 8800 --bind 127.0.0.1
```
Then open http://127.0.0.1:8800/
