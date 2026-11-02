// Founder's Five: app shell. Router, boot, game loop, event handling, wiring of rail + paper + overlays.
import { getState, setState, subscribe } from './ui/store.js';
import { parseHash, go, onRoute } from './ui/router.js';
import { loadAll, loadCard, loadArt, loadGuilloche, isMock, art, svgUrl } from './ui/data.js';
import * as mock from './ui/mock.js';
import { longDate, dateLabel, daysBetween, esc, money, moneyFull, int } from './ui/format.js';
import { renderTitle } from './ui/title.js';
import { renderSeat } from './ui/seat.js';
import { showIntro } from './ui/intro.js';
import { showLesson, showModal, overlayOpen } from './ui/lesson.js';
import { createRail, ACHIEVEMENTS } from './ui/rail.js';
import { createPaper, TAB_DEFS, START_UNLOCKED } from './ui/paper.js';

const $screen = document.getElementById('screen');
const $foot = document.getElementById('foot-date');
const TAB_IDS = TAB_DEFS.map((d) => d.id);
const BOTS = [['holder', 'The Holder'], ['seller', 'The Seller'], ['playbook', 'The Playbook']];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Clock pacing: milliseconds per trading day at 1x; the clock runs at base / speed.
// Play, SpaceX (98 trading days): 1.2 s a day, so 1 min 58 s at 1x, 59 s at 2x, 29 s at 4x.
// Play, blind cards (about 1,261 trading days): 0.36 s a day, so 7 min 34 s at 1x, 3 min 47 s at 2x, 1 min 53 s at 4x.
const PLAY_MS = { live: 1200, blind: 360 };
// Watch (always SpaceX): the older, quicker base; 250 ms / 8x puts the whole card on screen in about 3 s.
const WATCH_MS = { live: 250, blind: 95 };
const safeLS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};

// ------------------------------------------------------------------ engine
let enginePromise;
function getEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    if (!isMock()) {
      try {
        const sim = await import('./engine/sim.js');
        if (sim.createGame && sim.tick && sim.act && sim.snapshot) {
          let bots = null; try { bots = await import('./engine/bots.js'); } catch { /* not landed */ }
          return { ...sim, runBot: (bots && bots.runBot) || sim.runBot || null, real: true };
        }
      } catch { /* engine not landed: fall through to the mock */ }
    }
    return { ...mock, real: false };
  })();
  return enginePromise;
}

async function loadTabMods() {
  const out = {};
  await Promise.all(TAB_IDS.map(async (id) => {
    try { const m = await import(`./ui/tabs/${id}.js`); out[id] = m.default || null; } catch { out[id] = null; }
  }));
  return out;
}

// ------------------------------------------------------------------ boot
async function boot() {
  setState({ boot: { status: 'loading' } });
  try {
    const data = await loadAll();
    await Promise.all([loadArt(), loadGuilloche()]);
    paintWaveBackground();
    setState({ boot: { status: 'ready', data } });
  } catch (e) {
    console.warn('boot failed', e);
    setState({ boot: { status: 'error', error: String(e && e.message || e) } });
  }
}
function paintWaveBackground() {
  const wave = art('securityWave', { width: 600, height: 160, lines: 26, color: '#D9CEB4' });
  document.documentElement.style.setProperty('--wave-paper', svgUrl(wave, '#D9CEB4'));
  const waveDark = art('securityWave', { width: 600, height: 160, lines: 26, color: '#1A2C38' });
  document.documentElement.style.setProperty('--wave-dark', svgUrl(waveDark, '#1A2C38'));
}
subscribe((s) => {
  if (s.boot && s.boot.status === 'ready') $foot.textContent = `Prices through ${longDate(s.boot.data.meta.asOf)} close`;
  else if (s.boot && s.boot.status === 'error') $foot.textContent = 'Prices unavailable';
});

// ------------------------------------------------------------------ routing
let dispose = null, gen = 0, G = null, lastResult = null;

async function route(r) {
  const my = ++gen;
  if (dispose) { try { dispose(); } catch (e) { console.warn(e); } dispose = null; }
  if (G && r.name !== 'play' && r.name !== 'watch') stopGame();
  const boot = getState().boot;
  $screen.dataset.screen = r.name;
  $screen.scrollTop = 0;
  const needsData = ['seat', 'play', 'watch', 'score', 'code'].includes(r.name);
  if (needsData && boot.status === 'loading') { $screen.innerHTML = '<section class="center"><p class="loading-line" role="status">Loading prices…</p></section>'; return; }
  if (needsData && boot.status === 'error') { go('/'); return; }
  switch (r.name) {
    case 'title': dispose = renderTitle($screen, { boot, onAction: titleAction }) || null; break;
    case 'seat': {
      const entry = boot.data.cardsIndex.find((c) => c.id === r.cardId);
      if (!entry) { go('/'); return; }
      const engine = await getEngine(); if (my !== gen) return;
      dispose = (await renderSeat($screen, { entry, engine, onPick: (id, seat) => go(`/play/${id}/${seat}`) })) || null; break;
    }
    case 'play': dispose = await startGame({ cardId: r.cardId, seat: r.seat, watch: false }, my); break;
    case 'watch': dispose = await startGame({ cardId: 'spcx', seat: 'engineer', watch: true }, my); break;
    case 'score': dispose = await renderScore(my); break;
    case 'code': dispose = await renderCodeRoute(r.code, my); break;
    case 'page': dispose = await renderPageRoute(r.page, my); break;
  }
}

function titleAction(a) {
  const d = getState().boot;
  if (a === 'retry') { boot(); return; }
  if (d.status !== 'ready') return;
  if (a === 'spcx') go('/seat/spcx');
  else if (a === 'watch') go('/watch');
  else if (a === 'blind') {
    const blinds = d.data.cardsIndex.filter((c) => c.blind); if (!blinds.length) return;
    const n = Number(safeLS.get('ff.blind') || 0);
    safeLS.set('ff.blind', String(n + 1));
    go('/seat/' + blinds[n % blinds.length].id);
  }
}

async function renderPageRoute(name, my) {
  $screen.innerHTML = `<div class="page-wrap"><nav class="page-nav"><a href="#/">‹ Founder’s Five</a></nav><div class="page-body"><p class="loading-line" role="status">Loading…</p></div></div>`;
  const body = $screen.querySelector('.page-body');
  try {
    const m = await import('./ui/pages.js');
    if (my !== gen) return null;
    body.innerHTML = '';
    await m.renderPage(name, body, { data: getState().boot.data, go, mock: isMock() });
  } catch (e) {
    if (e && /Failed to fetch dynamically imported|Importing a module script failed|error loading dynamically/i.test(String(e.message))) {
      body.innerHTML = `<h1 class="page-h">${esc(name[0].toUpperCase() + name.slice(1))}</h1><p class="loading-line">This page arrives with the next build.</p>`;
    } else { console.warn(e); body.innerHTML = `<p class="loading-line">This page could not load.</p>`; }
  }
  return null;
}

async function renderScore(my) {
  const res = lastResult;
  if (!res) {
    $screen.innerHTML = `<section class="center"><h1 class="page-h">No finished run yet</h1><p class="lede2">Watch a run, or play a card to the end.</p><div class="actions"><a class="btn primary" href="#/watch">Watch a finished run</a><a class="btn" href="#/">Home</a></div></section>`;
    return null;
  }
  $screen.innerHTML = '<div class="score-wrap"></div>';
  const host = $screen.firstElementChild;
  try {
    const m = await import('./ui/scoreboard.js');
    if (my !== gen) return null;
    const fn = m.renderScoreboard || m.render || (m.default && m.default.render);
    if (typeof fn !== 'function') throw new Error('scoreboard.js has no renderScoreboard');
    await fn(host, { ...res, go, data: getState().boot.data });
  } catch (e) {
    if (!/Failed to fetch dynamically imported|Importing a module script failed|error loading dynamically/i.test(String(e.message))) console.warn('scoreboard failed', e);
    host.innerHTML = placeholderScore(res);
  }
  return null;
}
// #/code/{code}: replay a shared run with the engine and show its scoreboard (nothing is saved to ff.runs)
async function renderCodeRoute(code, my) {
  const fail = (msg) => { $screen.innerHTML = `<section class="center"><h1 class="page-h">That share code did not open</h1><p class="lede2">${esc(msg)}</p><div class="actions"><a class="btn primary" href="#/watch">Watch a finished run</a><a class="btn" href="#/">Home</a></div></section>`; return null; };
  $screen.innerHTML = '<section class="center"><p class="loading-line" role="status">Replaying the shared run…</p></section>';
  try {
    const sc = await import('./engine/sharecode.js');
    const dec = sc.decodeShare(code);
    const data = getState().boot.data;
    const card = await loadCard(dec.cardId);
    const res = await sc.resultFromShare(dec, { card, market: data.market, spcxOptions: data.spcxOptions });
    if (my !== gen) return null;
    lastResult = res;
  } catch (e) { return my === gen ? fail(e && e.name === 'ShareCodeError' ? e.message : 'The run could not be replayed on this card.') : null; }
  return renderScore(my);
}
function placeholderScore(res) {
  const s = res.score || {};
  const fw = s.afterTaxWealth ?? s.finalW ?? res.snap.W;
  return `<section class="score-ph"><p class="kicker">${esc(res.watch ? 'The Playbook, finished' : 'Card finished')}</p>
    <h1>After-tax family wealth</h1><p class="big num">${moneyFull(fw)}</p>
    <p class="lede2">The full scoreboard arrives with the next build.</p>
    <div class="actions"><a class="btn primary" href="#/">${res.watch ? 'Play it yourself' : 'Home'}</a><a class="btn" href="#/seat/${esc(res.cardId)}">Play again</a></div></section>`;
}

// ------------------------------------------------------------------ game
function stopGame() {
  if (!G) return;
  G.dead = true; cancelAnimationFrame(G.raf);
  document.removeEventListener('keydown', G.onKey); document.removeEventListener('keyup', G.onKeyUp);
  G.rail?.destroy?.();
  G = null; window.__ff && (window.__ff.G = null);
}

function toolId(x) {
  const s = String(x || '').toLowerCase();
  if (/stock|sell/.test(s)) return 'stock';
  if (/plan|10b5/.test(s)) return 'plan';
  if (/exchange/.test(s)) return 'exchange';
  if (/collar/.test(s)) return 'collar';
  if (/\bput\b|protective/.test(s)) return 'put';
  if (/hedge/.test(s)) return 'collar';
  if (/credit|loan|pledge/.test(s)) return 'credit';
  if (/cash|index/.test(s)) return 'cash';
  return null;
}

async function startGame({ cardId, seat, watch }, my) {
  $screen.innerHTML = `<section class="center"><p class="loading-line" role="status">Dealing the card…</p></section>`;
  const data = getState().boot.data;
  const entry = data.cardsIndex.find((c) => c.id === cardId);
  if (!entry) { go('/'); return null; }
  let card, engine, mods;
  try { [card, engine, mods] = await Promise.all([loadCard(cardId), getEngine(), loadTabMods()]); }
  catch (e) { console.warn(e); $screen.innerHTML = `<section class="center"><div class="alert err" role="alert"><p>This card could not load.</p><a class="btn" href="#/">Back</a></div></section>`; return null; }
  if (my !== gen) return null;
  await new Promise((r) => setTimeout(r, 20));
  let state;
  try { state = engine.createGame({ card, seat, market: data.market, spcxOptions: data.spcxOptions }); }
  catch (e) { $screen.innerHTML = `<section class="center"><div class="alert err" role="alert"><p>${esc(e.reason || e.message)}</p><a class="btn" href="#/seat/${esc(cardId)}">Back</a></div></section>`; return null; }

  // rivals (and, when watching, the bot being replayed)
  const series = {}, scores = {};
  const botCache = (window.__ffBots ||= new Map());
  const runBot = engine.runBot;
  let replayList = [];
  if (runBot) {
    for (const [id] of BOTS) {
      const key = `${cardId}|${seat}|${id}|${card.prices.length}`;
      let r = botCache.get(key);
      if (!r) { try { r = runBot(id, card, seat, data.market, data.spcxOptions); } catch (e) { console.warn('bot failed', id, e); r = null; } botCache.set(key, r); }
      if (r) { series[id] = r.seriesAfterTax || r.series; scores[id] = r.score; if (watch && id === 'playbook') replayList = (r.state && r.state.log) || []; }
    }
  }
  if (my !== gen) return null;

  // geometry for the year bar and seals
  const dates = card.prices.map((p) => p[0]);
  const group = card.lockup.groups.find((g) => g.seats.includes(seat));
  const tr = group.tranches.map((t) => ({ id: t.id, pct: t.pct, date: t.resolvedDate, void: !t.resolvedDate }));
  tr.sort((a, b) => (a.void - b.void) || String(a.date).localeCompare(String(b.date)));
  const first = dates[0], endDate = [dates[dates.length - 1], ...tr.filter((t) => t.date).map((t) => t.date)].sort().pop();
  const span = Math.max(1, daysBetween(first, card.live ? endDate : dates[dates.length - 1]));
  tr.forEach((t) => { t.pos = t.date ? Math.min(1, daysBetween(first, t.date) / span) : null; });
  const dctx = { blind: !!card.blind, dates, firstDate: first };

  const ach = new Set(); // this run only; the lifetime set lives in localStorage ff.ach
  G = {
    cardId, seat, watch, card, entry, engine, state, series, scores, replay: { list: replayList, ptr: 0 }, dctx, tr, span, first,
    userPaused: !watch, holds: new Set(), speed: watch ? 8 : 1, speeds: watch ? [2, 4, 8] : [1, 2, 4], mode: 'wealth',
    unlocked: new Set(START_UNLOCKED), notices: [], achievements: ach, marginSynthetic: null, marginText: '', lessonQueue: [], lessonBusy: false, choiceQueue: [], choiceBusy: false,
    over: false, acc: 0, last: 0, snap: null, eventLog: [], gameKey: `${cardId}|${seat}|${watch}|${Date.now()}`,
  };
  const g = G;
  $screen.innerHTML = `<div class="play${watch ? ' watching' : ''}"><div class="rail-host"></div><div class="paper-host"></div></div>`;
  const api = {
    act: (a) => doAct(a), canDo: (t, p) => g.engine.canDo(g.state, t, p),
    pause: () => { g.userPaused = true; refresh(); }, resume: () => { g.userPaused = false; refresh(); },
    openLesson: (id) => openLesson(id), history: () => g.state.history || [], card: () => g.card, state: () => g.state, watch,
    events: () => g.eventLog,
  };
  g.api = api;
  g.rail = createRail($screen.querySelector('.rail-host'), {
    onPause: togglePause, onSpeed: (s) => { g.speed = s; refresh(); }, onMode: (m) => { g.mode = m; refresh(); },
  });
  g.paper = createPaper($screen.querySelector('.paper-host'), {
    api, mods, h: { onLesson: openLesson, onChoice: onMarginChoice, onContinue: continueNotices },
  });

  // Space belongs to the clock (or to a shown notice) only when focus is on the page body or plain content. On a button, tab,
  // link, summary or field it keeps its own job: activating that control, or typing a space.
  g.onKey = (e) => {
    if (!G || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, typing = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (overlayOpen() || typing) return;
    if (e.key === ' ') { if (onControl(t)) return; e.preventDefault(); if (shownNotices().length) continueNotices(); else togglePause(); }
    else if (/^[1-7]$/.test(e.key)) { const id = TAB_IDS[Number(e.key) - 1]; g.paper.select(id, true); }
  };
  g.onKeyUp = (e) => { if (e.key === ' ' && !overlayOpen() && !onControl(e.target)) e.preventDefault(); };
  document.addEventListener('keydown', g.onKey); document.addEventListener('keyup', g.onKeyUp);

  g.holds.add('intro');
  if (watch) applyReplay();
  refresh();
  window.__ff = Object.assign(window.__ff || {}, { G: g, inject: (ev) => { handleEvents([ev]); refresh(); }, step: (n = 1) => { for (let k = 0; k < n && !g.over; k++) stepOnce(); refresh(); }, refresh, doAct });
  g.raf = requestAnimationFrame(frame);

  if (watch) { g.holds.delete('intro'); refresh(); g.paper.toast('Watching The Playbook play SpaceX at 8x.', ''); }
  else {
    const prevFocus = document.activeElement;
    await showIntro();
    if (g.dead) return null;
    g.holds.delete('intro');
    refresh(); restoreFocus(prevFocus);
  }
  return () => stopGame();
}

const CONTROL = 'button, a[href], summary, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="link"]';
const onControl = (t) => !!(t && t.closest && t.closest(CONTROL));
// After a popup closes, focus goes back to what had it (if it is still on the page and visible), else to the rail's play key.
function restoreFocus(prev) {
  const ok = (e) => e && e !== document.body && e.isConnected && e.getClientRects().length > 0 && !e.closest('[inert]') && !e.disabled;
  const t = ok(prev) ? prev : document.querySelector('.rail .pause');
  if (t && t.focus) t.focus({ preventScroll: true });
}
const running = () => G && !G.userPaused && G.holds.size === 0 && !G.over;
// Play and Pause on the rail and Space. A card or call that holds the clock is answered first: the play key then
// continues the card, or says what is open, instead of flipping the player's own pause.
function togglePause() {
  const g = G; if (!g || g.over) return;
  if (!g.userPaused && g.holds.size) {
    if (shownNotices().length) continueNotices();
    else if (g.holds.has('margin')) g.paper.toast('The clock waits for you to answer the maintenance call.', '');
    return;
  }
  g.userPaused = !g.userPaused; refresh();
}
// Why the clock is stopped, for the rail: '' while it runs, then 'margin', 'card', 'user' or 'over'.
function pauseKind(g) {
  if (running()) return '';
  if (g.over) return 'over';
  if (g.holds.has('margin')) return 'margin';
  if (g.holds.size) return 'card';
  return 'user';
}
// A popup closed: in Play the clock stays paused so the player can look at what changed. Watch keeps running.
function pauseAfterPopup(g) { if (g && !g.watch) g.userPaused = true; }
// One interrupt at a time. A maintenance call outranks everything, then a house or collar-expiry decision (it cannot be put
// off), then the release / notice card, then ONE lesson for every tool that card unlocked (the release is the cause, the
// lesson the consequence). Whatever is waiting stays out of the DOM until its turn, so no card is ever drawn behind another.
function interruptBlocked(g) {
  return g.holds.has('margin') || g.holds.has('lesson-ref') || g.choiceBusy || g.choiceQueue.length > 0 || overlayOpen();
}
function shownNotices() { return G && !interruptBlocked(G) ? G.notices : []; }
function continueNotices() { if (!G || !shownNotices().length) return; G.notices = []; G.holds.delete('notice'); pauseAfterPopup(G); refresh(); }
function pumpChoices() {
  const g = G;
  if (!g || g.dead || g.choiceBusy || !g.choiceQueue.length) return;
  if (g.holds.has('intro') || g.holds.has('margin') || g.holds.has('lesson-ref') || g.lessonBusy || overlayOpen()) return;
  g.choiceBusy = true;
  const ev = g.choiceQueue.shift();
  queueMicrotask(() => openChoice(ev));
}

function frame(t) {
  if (!G || G.dead) return;
  const g = G;
  g.raf = requestAnimationFrame(frame);
  const dt = Math.min(t - (g.last || t), 250); g.last = t;
  if (!running()) { g.acc = 0; return; }
  const base = g.watch ? WATCH_MS : PLAY_MS;
  const interval = (g.card.live ? base.live : base.blind) / g.speed;
  g.acc += dt;
  let n = 0;
  while (g.acc >= interval && n < 14 && running()) { g.acc -= interval; stepOnce(); n++; }
  if (n) refresh();
}

function applyReplay() {
  const g = G, rp = g.replay;
  while (rp.ptr < rp.list.length) {
    const e = rp.list[rp.ptr], a = e && (e.action || e), d = (e && (e.d || (e.action && e.action.d))) || (a && a.d);
    if (!a || !a.type) { rp.ptr++; continue; }
    if (d && d > g.state.d) break;
    rp.ptr++;
    const { d: _d, ...act } = a;
    try { const r = g.engine.act(g.state, act); if (!r.error) { g.state = r.state; handleEvents(r.events || [], true); } } catch (err) { console.warn('replay', err); }
  }
}

function stepOnce() {
  const g = G;
  const r = g.engine.tick(g.state);
  g.state = r.state;
  if (g.watch) { handleEvents(r.events || []); applyReplay(); if (g.state.pendingEvent) defaultChoice(); }
  else handleEvents(r.events || []);
  if (g.state.done && !g.over) finish();
}
function defaultChoice() {
  const g = G, t = g.state.pendingEvent && g.state.pendingEvent.type; if (!t) return;
  const a = t === 'house' ? { type: 'house', choice: 'cash' } : t === 'collarExpiry' ? { type: 'collarExpiry', choice: 'end' } : { type: 'marginCall', choice: 'post' };
  const r = g.engine.act(g.state, a); if (!r.error) g.state = r.state; else g.state = { ...g.state, pendingEvent: null };
}

function doAct(action) {
  const g = G; if (!g) return { ok: false };
  if (g.watch) { g.paper.toast('You are watching a finished run. Play it yourself to make moves.', ''); return { ok: false, error: 'watching' }; }
  const r = g.engine.act(g.state, action);
  if (r.error) { g.paper.toast(r.error, 'err'); return { ok: false, error: r.error }; }
  g.state = r.state;
  handleEvents(r.events || []);
  refresh();
  return { ok: true, events: r.events || [] };
}

async function onMarginChoice(choice) {
  const g = G; if (!g) return;
  const prev = document.activeElement; setTimeout(() => restoreFocus(prev), 0);
  if (g.marginSynthetic && !g.state.loan.call) { g.marginSynthetic = null; g.holds.delete('margin'); pauseAfterPopup(g); g.paper.toast(`Test banner: "${choice}" chosen.`, ''); refresh(); return; }
  const r = doAct({ type: 'marginCall', choice });
  if (r.ok) { g.holds.delete('margin'); pauseAfterPopup(g); refresh(); }
}

function openLesson(id) {
  const g = G; if (!g) return;
  const cards = g.paper.lesson(id); if (!cards) return;
  g.holds.add('lesson-ref');
  const prev = document.activeElement;
  showLesson(cards, { kicker: g.paper.label(id), label: g.paper.label(id) + ' lesson' }).then(() => { g.holds.delete('lesson-ref'); pauseAfterPopup(g); refresh(); restoreFocus(prev); });
}
// Every tool unlocked together (the first release opens three) is walked through in ONE dialog, each card titled with its tool.
async function runLessons() {
  const g = G; if (!g || g.lessonBusy || g.dead || g.holds.has('intro') || overlayOpen()) return;
  const ids = [...new Set(g.lessonQueue.splice(0))].filter((id) => g.paper.lesson(id));
  if (!ids.length) { g.holds.delete('lesson'); refresh(); return; }
  g.lessonBusy = true; g.holds.add('lesson');
  const prev = document.activeElement;
  // Several tools at once: the first card of each, then a pointer to the full lessons (15 cards in a row was a wall).
  const cards = ids.length > 1
    ? [...ids.map((id) => { const c = g.paper.lesson(id)[0]; return { ...c, title: `${g.paper.label(id)}: ${c.title}` }; }),
      { title: 'The full lessons', body: 'Each tool’s full lesson opens from the ? button beside the tabs.' }]
    : g.paper.lesson(ids[0]);
  const names = ids.map((id) => g.paper.label(id));
  await showLesson(cards, {
    kicker: ids.length > 1 ? `${ids.length} tools unlocked` : `${names[0]} unlocked`,
    label: ids.length > 1 ? `${names.join(', ')} lessons` : `${names[0]} lesson`, doneLabel: 'Got it', skipLabel: 'Close',
  });
  if (g.dead) return;
  g.holds.delete('lesson'); g.lessonBusy = false; pauseAfterPopup(g); refresh(); restoreFocus(prev);
}
// A lesson waits until nothing else is open; the release card that caused it comes first.
function pumpLessons() {
  const g = G;
  if (!g || g.dead || g.lessonBusy || !g.lessonQueue.length) return;
  if (g.holds.has('intro') || g.holds.has('margin') || g.holds.has('lesson-ref') || g.holds.has('notice') || g.notices.length || g.choiceBusy || g.choiceQueue.length || overlayOpen()) return;
  queueMicrotask(runLessons);
}
function unlockTool(id, lesson = true) {
  const g = G; if (!id || g.unlocked.has(id)) return;
  g.unlocked = new Set([...g.unlocked, id]);
  if (lesson && !g.watch) { g.lessonQueue.push(id); g.holds.add('lesson'); }
}

const CHOICES = {
  house: { kicker: 'Decision', title: 'The house', list: [['cash', 'Pay from cash and the index fund'], ['credit', 'Draw the credit line'], ['sell', 'Sell shares']] },   // no choice is primary: the detail lines say what each covers
  collarExpiry: { kicker: 'Decision', title: 'Your collar has expired', list: [['roll', 'Roll at today’s prices', true], ['end', 'Let it end']] },
};
// The cost, in large type, between the copy and the choices (the amount is the engine's own).
function stakeLine(ev) {
  const amt = ev.data && ev.data.amount; if (typeof amt !== 'number') return;
  const dlg = document.querySelector('.dialog.event .choices'); if (!dlg || dlg.parentNode.querySelector('.stake')) return;
  const s = document.createElement('div'); s.className = 'stake';
  s.innerHTML = `<span class="stake-l">Amount due</span><span class="num stake-n">${moneyFull(amt)}</span>`;
  dlg.parentNode.insertBefore(s, dlg);
}
// A line of consequence under each house button. Only figures the engine put on the event: what cash and the index fund hold,
// how much room the credit line has, how many shares a sale would take. Nothing is worked out here.
function houseDetail(ev, id) {
  const d = ev.data || {};
  if (ev.type !== 'house') return '';
  if (id === 'cash' && typeof d.liquid === 'number') return `Cash and index fund hold ${money(d.liquid)}`;
  if (id === 'credit' && typeof d.headroom === 'number') return `Credit line has room for ${money(d.headroom)}`;
  if (id === 'sell' && typeof d.sharesToSell === 'number') return `Sells ${int(d.sharesToSell)} shares`;
  return '';
}
function decorateChoices(ev, choices) {
  document.querySelectorAll('.dialog.event .choice .btn').forEach((b) => {
    const c = choices.find((x) => x.id === b.dataset.id); if (!c) return;
    const detail = c.detail || houseDetail(ev, c.id); if (!detail) return;
    const label = b.textContent;
    b.innerHTML = `<span class="c-l">${esc(label)}</span><span class="c-d num">${esc(detail)}</span>`;
  });
}
async function openChoice(ev) {
  const g = G, def = CHOICES[ev.type]; if (!def) { g.choiceBusy = false; return; }
  const given = ev.data && Array.isArray(ev.data.choices) ? ev.data.choices : null;
  // The engine may send choices as plain ids ("cash") or as objects; labels come from CHOICES when missing.
  const labelOf = (id) => { const hit = def.list.find((x) => x[0] === id); return hit ? hit : [id, id, false]; };
  const list = given ? given.map((c) => (typeof c === 'string' ? labelOf(c) : [c.choice || c.id, c.label || labelOf(c.choice || c.id)[1], ev.type === 'house' ? false : (c.primary != null ? c.primary : labelOf(c.choice || c.id)[2])])) : def.list;
  let note = '';
  const prevFocus = document.activeElement;
  for (;;) {
    const choices = list.map(([id, label, primary]) => {
      let c = { allowed: true };
      try { c = g.engine.canDo(g.state, ev.type, { choice: id }) || c; } catch { /* engine may not model per-choice gates */ }
      return { id, label, primary, disabled: c.allowed === false, reason: c.allowed === false ? c.reason : '' };
    });
    const shown = showModal({ kicker: def.kicker, title: def.title, text: ev.text + (note ? ` ${note}` : ''), choices });
    stakeLine(ev); decorateChoices(ev, choices);
    const id = await shown;
    if (g.dead) return;
    const r = g.engine.act(g.state, { type: ev.type, choice: id });
    if (r.error) { note = r.error; continue; }
    g.state = r.state; handleEvents(r.events || []); break;
  }
  g.choiceBusy = false;
  if (!g.choiceQueue.length) g.holds.delete('choice');
  pauseAfterPopup(g);
  refresh(); restoreFocus(prevFocus);
}

function saveAch() {
  let life = []; try { life = JSON.parse(safeLS.get('ff.ach') || '[]'); } catch { /* ignore */ }
  safeLS.set('ff.ach', JSON.stringify([...new Set([...life, ...G.achievements])]));
}

// Presentation data for one notice card. Every number comes from the engine event, the snapshot or the tranche list.
// A release card stores only what the event itself said (which tranches, how many shares); the free / locked counts, the chip
// strip and "Release k of N" are filled in by liveMoment() from the same snapshot the rail renders, so they cannot disagree.
function momentFor(ev) {
  const d = ev.data || {}, m = { text: ev.text, type: ev.type };
  if (ev.type === 'release') {
    if (Array.isArray(d.tranches) && d.shares != null && d.pct != null) { m.kind = 'release'; m.pct = d.pct; m.shares = d.shares; m.ids = d.tranches.slice(); }
    else m.kind = d.never ? 'never' : d.relocked ? 'relock' : 'release';
  } else m.kind = ev.type;
  return m;
}
function liveMoment(m, snap) {
  if (m.kind !== 'release' || !m.ids) return m;
  const g = G, dated = g.tr.filter((t) => t.date);   // a price tranche that never fired has no date and is not a release
  return {
    ...m, free: snap.shares.free, locked: snap.shares.locked, total: dated.length,
    idx: m.ids.map((id) => dated.findIndex((t) => t.id === id) + 1).filter(Boolean).sort((a, b) => a - b),
    pips: g.tr.map((t) => ({ pct: t.pct, void: t.void, state: m.ids.includes(t.id) ? 'new' : (t.date && t.date <= snap.d ? 'done' : 'wait') })),
  };
}

function handleEvents(events, quiet) {
  const g = G;
  if (g && events && events.length) { g.eventLog = g.eventLog || []; for (const ev of events) g.eventLog.push(ev); }
  for (const ev of events) {
    const watch = g.watch;
    switch (ev.type) {
      case 'toolUnlock': {
        const d = ev.data || {}; const ids = [].concat(d.tools || d.tool || d.id || d.tab || []).map(toolId).filter(Boolean);
        (ids.length ? ids : [toolId(ev.text)]).forEach((id) => unlockTool(id));
        break;
      }
      case 'release': case 'planLive':
        if (watch) g.paper.toast(ev.text, 'info');
        else { g.notices = [...g.notices, momentFor(ev)]; g.holds.add('notice'); }
        break;
      case 'windowOpen': {
        // A card (and a pause) only when shares have been released since the last window card; otherwise a toast. The rail lamp always shows the window.
        const sh = g.engine.snapshot(g.state).shares, rel = (sh.total || 0) - (sh.locked || 0);
        if (watch || rel <= (g.winSeen || 0)) g.paper.toast(ev.text, 'info');
        else { g.winSeen = rel; g.notices = [...g.notices, momentFor(ev)]; g.holds.add('notice'); }
        break;
      }
      case 'windowClose': case 'planSale': g.paper.toast(ev.text, 'info'); break;
      case 'dividend': if (!quiet) g.paper.toast(ev.text, 'info'); break;   // the engine's own text, no arithmetic here
      case 'taxPaid': g.paper.toast(ev.text, 'warn'); break;
      case 'forcedSale':
        if (watch) g.paper.toast(ev.text, 'err');
        else { g.notices = [...g.notices, momentFor(ev)]; g.holds.add('notice'); }
        break;
      case 'news': g.paper.setNews(ev.text, dateLabel(g.dctx, ev.d)); break;
      case 'achievement': {
        const id = (ev.data && (ev.data.id || ev.data.name)) || ev.text; g.achievements.add(id); saveAch();
        if (!quiet) g.paper.toast(`Seal earned: ${String((ev.data && (ev.data.title || ev.data.name)) || ev.text).split('. ')[0]}`, 'ach');
        break;
      }
      case 'marginCall':
        g.marginText = ev.text;
        if (!g.state.loan || !g.state.loan.call) g.marginSynthetic = ev.data || {};
        if (!watch) g.holds.add('margin');
        break;
      case 'house': case 'collarExpiry': if (!watch) { g.choiceQueue.push(ev); g.holds.add('choice'); } break;
      case 'cardEnd': break;
      case 'spend': break;
      default: if (ev.pause && !watch && ev.text) { g.notices = [...g.notices, momentFor(ev)]; g.holds.add('notice'); }
    }
  }
}

function finish() {
  const g = G; g.over = true;
  const snap = g.engine.snapshot(g.state);
  let score = null; try { score = g.engine.score ? g.engine.score(g.state) : null; } catch (e) { console.warn(e); }
  lastResult = { cardId: g.cardId, seat: g.seat, watch: g.watch, card: g.card, state: g.state, snap, score, botScores: g.scores, achievements: [...g.achievements], engine: g.engine };
  setState({ result: lastResult });
  g.paper.toast(g.watch ? 'The run is finished.' : 'The card has ended.', 'info');
  refresh();
  setTimeout(() => { if (G === g && !g.dead) go('/score'); }, reduced() ? 300 : 1100);
}

function refresh() {
  const g = G; if (!g || g.dead) return;
  const snap = g.engine.snapshot(g.state);
  // inference: a tool unlocks as soon as the shares it needs are free, even if the engine sent no event
  const freed = (snap.shares.free || 0) + (snap.shares.sold || 0) + (snap.shares.collared || 0) + (snap.shares.pledged || 0) > 0;
  // every tab whose seal says "Unlocks with your first release" (paper.js TAB_DEFS) opens with it
  if (freed) for (const id of ['plan', 'collar', 'credit', 'put', 'exchange']) unlockTool(id);
  g.snap = snap;
  const i = Math.min(snap.i, 1e9);
  const rivals = [{ id: 'you', name: g.watch ? 'The Playbook' : 'You', W: snap.Wat ?? snap.W, you: true }];
  for (const [id, name] of BOTS) {
    if (g.watch && id === 'playbook') continue;
    const s = g.series[id]; if (s) rivals.push({ id, name, W: s[Math.min(i, s.length - 1)] });
  }
  const call = snap.loan && snap.loan.call;
  let vsnap = snap;
  if (!call && g.marginSynthetic) vsnap = { ...snap, loan: { ...snap.loan, call: g.marginSynthetic } };
  const view = {
    snap: vsnap, gameKey: g.gameKey, cardLabel: g.entry.label, certName: g.card.blind ? g.entry.label + ' · sealed' : g.card.name,
    vignette: g.card.vignette || null,
    tranches: g.tr.map((t) => ({ ...t, released: !!t.date && t.date <= snap.d })), rivals, mode: g.mode,
    progress: Math.min(1, Math.max(0, daysBetween(g.first, snap.d) / g.span)), speeds: g.speeds, speed: g.speed,
    running: !!running(), pause: pauseKind(g), watch: g.watch, dctx: g.dctx, achievements: [...g.achievements], unlocked: g.unlocked, notices: shownNotices().map((m) => liveMoment(m, snap)),
    marginText: g.marginText, seat: g.seat, cardId: g.cardId,
  };
  g.rail.update(view); g.paper.update(view);
  pumpChoices(); pumpLessons();
}

// ------------------------------------------------------------------ start
onRoute(route);
let prevBoot = null;
subscribe((s) => { if (s.boot !== prevBoot) { prevBoot = s.boot; route(parseHash()); } });
boot();
