# Founder's Five: play pass plan (2026-11-02)

Goal: make the game much better to play without changing its design. Three required changes (slower clock, pause after every popup, player-driven index fund), the six known defects, the data job bug, then the friction three playtesters found.

## Pacing

Play mode steps one trading day every `MS_PER_DAY / speed` ms, with speeds 1x, 2x and 4x.

| Card | Trading days | ms per day at 1x | 1x | 2x | 4x |
|---|---|---|---|---|---|
| SpaceX (live) | 98 | 1,200 | 1 min 58 s | 59 s | 29 s |
| Blind cards | about 1,261 | 360 | 7 min 34 s | 3 min 47 s | 1 min 53 s |

Times are clock time only; every popup adds a pause on top.

Why these numbers:
- The old 1x on SpaceX was 250 ms a day (25 s for the card). PJ called it "super quick" and 4x "like the Flash". The new 4x is the old 1x, so 4x is fast but followable.
- At the new 1x, the ten trading days before a SpaceX release take 12 s. That is enough to read the countdown, open the Stock tab and sell or set a plan before the release card arrives.
- Blind cards are 13 times longer. At 1,200 ms they would take 25 min, too long for a class demo. At 360 ms, the first release (about day 125) arrives after about 45 s, and the five years take under 8 min. "Run to the release" (4x) covers a quiet stretch in seconds.
- Watch mode is unchanged (old base, 2x/4x/8x, starts at 8x), so the grader path still reaches the scoreboard in about 5 s.

## Changes, ranked by what a first-time player would notice

| # | Change | Task | Acceptance check a non-coder can see |
|---|---|---|---|
| 1 | Slower clock, per card type | T2 | At 1x on SpaceX the day counter moves about once a second; the first release card arrives about 40 s in |
| 2 | Pause after every popup, with a labelled paused state; the game starts paused after the intro | T2 | Close a release card: the day number stops, the play button reads as Play, Space or the button starts it again. Watch mode never stops |
| 3 | Release card first, then one lesson dialog for all tools unlocked together | T2 | At the first SpaceX release: one release card, then one lesson dialog, not three |
| 4 | Auto-invest removed: proceeds land in cash, no sweep, no switch, no copy | T1, T2, T3 | Sell shares: cash rises by the proceeds, the index fund does not move. The Cash tab has no switch. The Method page and lessons never mention auto-invest |
| 5 | Bots deposit explicitly; the Seller waits for its first release before a plan | T1 | Scoreboard rival numbers within a few percent of before (table in REPORT.md) |
| 6 | Debrief states idle cash as a fact | T1, T3 | After a run that left cash idle, the debrief shows one line: how much sat idle and what it would have earned |
| 7 | Collar panel: header no longer clips the top, pill inside the border, confirm reachable on phone | T3 | Open the Collar tab at 375x812: confirm button visible without scrolling past the quote |
| 8 | SOLD stamp no longer covers the "Window open" pill | T3 | Sell on the Stock tab: both the stamp and the pill are readable |
| 9 | Share codes with the old auto-invest action are rejected cleanly | T1 | Opening such a link shows "from an earlier version" |
| 10 | Data job never mixes intraday option quotes with a prior close | T4 | A test shows a 10:50 ET chain is rejected and an 18:30 ET chain accepted |
| 11+ | Playtester friction (below) | by file owner | listed per item |

## Tasks and file ownership (no shared files)

- **T1 engine:** engine/sim.js, bots.js, debrief.js, sharecode.js, types.md, the engine tests, ui/mock.js.
- **T2 clock and pause:** app.js, ui/rail.js, ui/paper.js, ui/tabs/stock.js, ui/css/rail.css, phone.css, moments.css, tests/e2e.mjs, tabs-e2e.mjs, shell-shots.mjs, should-s1.mjs.
- **T3 copy and visual defects:** ui/tabs/cash.js, collar.js, kit.js, tabs.css, ui/css/collar.css, ui/lesson.js, ui/pages.js, pages.css, ui/scoreboard.js and its CSS, app.css, tests/pages-shots.mjs, score-shots.mjs.
- **T4 data job:** scripts/update-data.mjs, scripts/lib/cboe.mjs, options.mjs, scripts/data.test.js.

The orchestrator alone edits `../prd/DECISIONS.md`, REPORT.md and this file, and fixes integration seams by hand.

## Decisions

Logged with reasons and the cost if wrong in `../prd/DECISIONS.md`, section "Calls made during the play pass (2026-11-02)".

## Playtester friction

Added below once the three playtest reports are in.

### From the three first playtests (ranked by what a first-time player notices)

| # | Friction | Owner | Fix |
|---|---|---|---|
| 11 | Clock too fast; Continue restarts it at once (all three testers) | T2 | Items 1 and 2 above |
| 12 | Rail net worth and rival ranking contradict the scoreboard; a sale looks like a loss | T1 + T2 | Rail shows after-tax net worth and ranks rivals on it |
| 13 | Three lesson dialogs (9 pages) before the first release card | T2 | Item 3 above |
| 14 | About 26 interrupts on a blind card, mostly window-open cards | T2 | Window card only after a new release; otherwise a toast |
| 15 | Space on a focused button pauses the clock instead of pressing it | T2 | Space toggles only when focus is not on a control |
| 16 | Focus jumps to Continue while typing in the sell box; focus lost to the page after popups | T2 | No focus steal while typing; focus returns to where it was |
| 17 | Phone collar confirm behind the tab bar; stamps cover chips and forms | T3 | Sticky confirm; stamps moved off controls |
| 18 | House dialog focuses "Pay from cash" so a reflex Enter commits $10M | T3 | Focus starts on the dialog text |
| 19 | Phone maintenance-call banner truncated mid-sentence | T2 | Full text, compact |
| 20 | "Locked by the lockup" shown when shares are free but all pledged | T1 | Reason says no free shares are left, and when the next release is |
| 21 | Release count-up floods screen readers; pause and resume are silent | T2 | One announcement; aria-live state line |
| 22 | Credit MAX fills a fractional dollar; collar expiry has no year; Street check gap unexplained | T3 | Whole dollars; year on far dates; one factual line |
| 23 | Disabled controls not announced with their reason; intro demo keys announced as buttons | T3 | aria-describedby to the reason; demo hidden from assistive tech |
| 24 | Scoreboard: focus lands on the page, certificate is a group not a button | T3 | Focus the heading; certificate is a button |

Logged, not fixed: the 10b5-1 header says "first trading day of each month" while the first sale waits for cooling-off (accurate, the cooling-off line explains it); "Window open until Jul 5" on day 1 with no free shares (true and harmless).

### From the phone-gamer playtest

| # | Friction | Owner | Fix |
|---|---|---|---|
| 25 | Exchange and Put tabs still "Sealed: unlocks with your first release" after it | T2 | Tabs unlock when their seal text says |
| 26 | House dialog styles "Pay from cash" as the default even when it cannot cover $10M | T2 | No house choice is styled as the default |
| 27 | Console "NaN" SVG errors during the intro tour | T3 | Fixed at the source |
| 28 | Intro says "Space pauses" on a phone | T3 | Touch devices read "Tap the play button to pause" |
| 29 | Phone sell box cut off by the tab bar; delta runs into its label; blind chart axis labels collide; title kicker touches the card edge | T2, T3 | Layout fixes |

Logged, not fixed: jargon (lockup, 10b5-1, Rule 144, affiliate) is explained in the lessons and Glossary, and this pass adds no new copy systems; a blind card's first window closes early on some cards (the record's own dates; the slower clock and the starting pause give about 11 s at 1x to act).
