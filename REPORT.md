# Founder's Five: play pass (2026-11-02, afternoon)

**Bottom line.** The game is slower, stops after every popup, and the index fund is the player's own call. Every suite passes on the integrated build. Committed locally on `main`, not pushed. The plan, pacing reasons and every change by file are in `PLAN-PLAY.md`; decisions are in `../prd/DECISIONS.md` under "Calls made during the play pass".

## What changed
- **Clock.** Play mode now runs 1,200 ms per trading day on SpaceX and 360 ms on blind cards at 1x (old: 250 and 95). Watch mode is unchanged.
- **Pause after popups.** The game starts paused after the intro, and every popup (release, notice, lesson, house, collar expiry, margin call) leaves the clock paused. The key reads Play, a line says "Paused. Press play or Space.", and a polite live region announces Paused and Running. Watch never pauses.
- **Fewer interrupts.** The release card comes first, then one lesson dialog for every tool it unlocked (one card per tool plus a pointer to the full lessons), not three dialogs before it. A window-open card appears only after new shares were released; otherwise it is a toast.
- **No auto-invest.** No switch, no monthly sweep, no routing of proceeds. Sale proceeds land in cash. Share codes with the old action are rejected as "from an earlier version". The debrief states idle cash as a fact.
- **After-tax rail.** Net worth on the rail, and the rival ranking, are now after the tax embedded in unsold shares. A sale no longer looks like a loss, and the in-game order matches the scoreboard.
- **Founder seat** (PJ, after the push): it opens after one finished Early engineer run, on any card. On SpaceX, whose founder shares stay locked past the last price, it deals a five-year card in the founder seat. No date is shown.
- **Why it matters** (PJ, after the push): every tool's ? button now offers an optional deeper deck after the how-to cards. It covers selling and concentration risk, the 10b5-1 plan, the collar, pledging and the credit line, cash and the index fund, the put, and the exchange fund. Each deck explains what the tool does to your wealth and what it costs, works an example in round numbers, and gives the real-world rule behind it. The text lives in each `ui/tabs/*.js` as `deeper`.
- **Known defects fixed:** collar header clipping, collar pill over the border, phone collar confirm below the fold, SOLD stamp over the window pill, interrupts queued as separate cards, the Seller's day-0 plan with every share locked. The Playbook already waited for a release.
- **Data job.** CBOE quotes are used only when they are the close of the last price session (from 15:55 ET that day, or pre-market the next weekday). An intraday run keeps the previous options file and logs a warning.
- **Playtester fixes:** Space presses a focused button instead of toggling the clock; no focus steal while typing; focus returns after popups; decision dialogs focus their text, not "Pay from cash"; disabled controls announce their reason; Put and Exchange unlock with the first release as their seal says; "No free shares to pledge. The next release is Aug 20." replaces a misleading lockup message; MAX fills whole dollars; far collar dates show the year; phone margin banner, lock card and tab-bar overlaps; intro NaN console errors; blind chart axis labels.

## Pacing (clock time, pauses extra)

| Card | 1x | 2x | 4x |
|---|---|---|---|
| SpaceX, 98 trading days, 1,200 ms a day at 1x | 1 min 58 s | 59 s | 29 s |
| Blind, about 1,261 days, 360 ms a day at 1x | 7 min 34 s | 3 min 47 s | 1 min 53 s |

Measured headless at 1x: 8 trading days in 10 s on SpaceX, 27 on c1. Watch reaches the scoreboard in 4.5 s.

## Bots, after-tax wealth before and after

| Run | Holder | Seller | Playbook |
|---|---|---|---|
| SpaceX, engineer | $79,317,950 to $79,318,681 (0.0%) | $79,610,222 to $80,287,942 (+0.9%) | $79,261,607 to $79,505,654 (+0.3%) |
| c1, engineer | $154,915,502 to $155,562,848 (+0.4%) | $266,915,527 to $264,661,130 (-0.8%) | $235,593,934 to $234,486,697 (-0.5%) |
| c1, founder | $154,915,502 to $155,562,848 (+0.4%) | $226,447,944 to $223,965,706 (-1.1%) | $205,984,560 to $204,652,280 (-0.6%) |

No bot moved more than 1.1%. The Seller and the Playbook deposit cash above a year of spending on each month start; the Holder never deposits. The SpaceX founder seat is locked until 2027, so it has no bot run. The Seller's plan on c1 engineer on day 0 is legitimate: that seat gets 15% on 2020-12-10.

## Tests on the integrated build

| Suite | Result |
|---|---|
| `node --test` | 185 of 185 (was 175) |
| `tests/e2e.mjs` | 18 of 18, zero console errors, Watch 4.5 to 4.6 s at both sizes |
| `tests/tabs-e2e.mjs` | 122 checks, zero console errors |
| `tests/shell-shots.mjs`, `pages-shots.mjs`, `score-shots.mjs`, `should-s1.mjs` | all pass, zero console errors |
| `check-golden-xlsx.mjs --verify`, `check-headlines.mjs` | all rows PASS, all cards pass |

Run six browser suites in parallel on this Mac and they time out: one network blip (ERR_NETWORK_CHANGED on the font and Chart.js CDNs) and one stall under load. Each suite passed when rerun on its own.

## Final fresh playtest
A fresh Sonnet playtester who saw none of this work played SpaceX and a blind card (Airbnb) at 1280x800 and 375x812. It found zero console errors.
- **Pace.** SpaceX took about 105 s at 1x, 59 s at 2x and 29 s at 4x.
- **Seeing a release coming.** At 1x the Stock tab's "Next release in 20 days" gave about 14 s of warning. On other tabs there is no countdown.
- **Pause.** After every popup the clock stayed paused, and the tester called "Paused. Press play or Space." clear.

Fixed after the playtest:
- The lesson dialog had no visible close on touch. It now has a Close button.
- The release card listed three new tools while the lesson said five. The engine's text now lists all six.

Logged, not fixed (time box):
- **Spending drains cash.** On a blind card, a player who never sells sees cash run down by spending, so the house forces a sale. This is correct mechanics, but no line says why cash fell.
- **Desktop Sell at 800 px.** The Sell form and its result line sit below the fold.
- **Countdown units.** The countdown shows only on the Stock tab, in calendar days, while the clock counts trading days.
- **Two starting figures.** The title's "$100 million" (at the offer price) differs from the day-1 after-tax $94.1M, with no on-screen note.
- **Phone stamp.** The DEPOSITED stamp touches the Cash header on phone.
- **10b5-1 wording.** "5% a month" is 5% of free shares, and the plan-live card does not say how many shares it sold.
- **Scoreboard wording.** "The Playbook: 3 of 4 measures beaten" is ambiguous about who beat whom.
- **Blind card rotation.** The rotation is per browser, so a fresh browser always deals Card 1 first.

## Left and Needs PJ
- **Push** (deploys the live site): `cd /Users/pjogilvie/fmrksAiExtraCredit/founders-five && git pull --ff-only && git push`
- **Options data.** `data/spcx-options.json` still holds the $202.42 listed cap from the 10:50 ET manual run. Tonight's scheduled run (23:30 UTC) replaces it with the close. Check that run's log for a "SPCX options not updated" warning: if CBOE stamps the close oddly, the guard skips and says why.
- **Real phone check** of the new paused state and the docked collar confirm.
- **Not changed:** on desktop at 1280x800 the Stock tab's Sell form sits below the chart and needs a scroll (fitting it would shrink the chart to about 156 px). Jargon (lockup, 10b5-1, Rule 144) stays explained in lessons and the Glossary only.


---

# Founder's Five: overnight build report (2026-11-02)

**Bottom line.** The game is live and passes the grader path on the live site. The repo was created at 10:49 ET Monday on PJ's go-ahead, after the overnight session's permission system refused it. Pages is deployed, and the nightly data workflow has passed once on GitHub (run 41475753259), committing data and redeploying.

## Live link
https://pjogilvie7.github.io/founders-five/ (repo: https://github.com/pjogilvie7/founders-five)

`node tests/e2e.mjs https://pjogilvie7.github.io/founders-five/` gave 14 of 14, run 2026-11-02 at about 10:55 ET:
- 375x812 and 1280x800
- no login
- no console errors
- data current to the last trading day
- Watch reaches the scoreboard in 4.9 s

**Known data quirk.** The first GitHub data run was triggered by hand at about 10:50 ET. It read live option quotes against Friday's close, so the listed-option cap in the Street check reads $202.42, not Friday's $182.59. The scheduled 6:30 pm ET run (weekdays, 23:30 UTC) reads both after the close and realigns them.

**Test fixes for GitHub.** Two tests failed on the first run there and were fixed:
- The headline name-filter tests now skip when the private prospectus text in `research/` is absent.
- The options test checks the rule (5 or more strikes per expiry, a sane cap), not one day's chain.

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
1. **Phone check** (15 min): the site is live; open the link in a private window on a phone.
2. **Sign off tranches** (2 h): `data/src/*/lockup.json` against `research/reconcile-*.md`. Flagged: SpaceX Dec 8 vs Dec 9, the Lyft 8-K date, the Pinterest employee date.
3. **Read headlines and reveals** (1 h): all are marked `review: "pending"`. Decide whether Card 2 (Peloton) stays or swaps for c7 (Warner Music, ready).
4. **Finalize the PDF** (1.5 h): fill in the team names on page 1, then rerun `node scripts/make-pdf.mjs --base https://pjogilvie7.github.io/founders-five/`. The link and QR already resolve.
5. **Playtest** with a classmate (30 min).
6. **Rehearse the interview** (45 min). Say "about $189 at today's 1-year rate" for the Street check, not the PRD's $187.

## Run it locally
```bash
cd /Users/pjogilvie/fmrksAiExtraCredit/founders-five && python3 -m http.server 8800 --bind 127.0.0.1
```
Then open http://127.0.0.1:8800/
