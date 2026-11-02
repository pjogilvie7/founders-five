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
  const needsData = ['seat', 'play', 'watch', 'score'].includes(r.name);
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
  if (/collar|put|hedge/.test(s)) return 'collar';
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
      if (r) { series[id] = r.series; scores[id] = r.score; if (watch && id === 'playbook') replayList = (r.state && r.state.log) || []; }
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
    userPaused: false, holds: new Set(), speed: watch ? 8 : 1, speeds: watch ? [2, 4, 8] : [1, 2, 4], mode: 'wealth',
    unlocked: new Set(START_UNLOCKED), notices: [], achievements: ach, marginSynthetic: null, marginText: '', lessonQueue: [], lessonBusy: false,
    over: false, acc: 0, last: 0, snap: null, gameKey: `${cardId}|${seat}|${watch}|${Date.now()}`,
  };
  const g = G;
  $screen.innerHTML = `<div class="play${watch ? ' watching' : ''}"><div class="rail-host"></div><div class="paper-host"></div></div>`;
  const api = {
    act: (a) => doAct(a), canDo: (t, p) => g.engine.canDo(g.state, t, p),
    pause: () => { g.userPaused = true; refresh(); }, resume: () => { g.userPaused = false; refresh(); },
    openLesson: (id) => openLesson(id), history: () => g.state.history || [], card: () => g.card, state: () => g.state, watch,
  };
  g.api = api;
  g.rail = createRail($screen.querySelector('.rail-host'), {
    onPause: togglePause, onSpeed: (s) => { g.speed = s; refresh(); }, onMode: (m) => { g.mode = m; refresh(); },
  });
  g.paper = createPaper($screen.querySelector('.paper-host'), {
    api, mods, h: { onLesson: openLesson, onChoice: onMarginChoice, onContinue: continueNotices },
  });

  g.onKey = (e) => {
    if (!G || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, typing = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (overlayOpen() || typing) return;
    if (e.key === ' ') { e.preventDefault(); if (g.notices.length) continueNotices(); else togglePause(); }
    else if (/^[1-5]$/.test(e.key)) { const id = TAB_IDS[Number(e.key) - 1]; g.paper.select(id, true); }
  };
  g.onKeyUp = (e) => { if (e.key === ' ' && !overlayOpen() && !(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) e.preventDefault(); };
  document.addEventListener('keydown', g.onKey); document.addEventListener('keyup', g.onKeyUp);

  g.holds.add('intro');
  if (watch) applyReplay();
  refresh();
  window.__ff = Object.assign(window.__ff || {}, { G: g, inject: (ev) => { handleEvents([ev]); refresh(); }, step: (n = 1) => { for (let k = 0; k < n && !g.over; k++) stepOnce(); refresh(); }, refresh, doAct });
  g.raf = requestAnimationFrame(frame);

  if (watch) { g.holds.delete('intro'); g.paper.toast('Watching The Playbook play SpaceX at 8x.', ''); }
  else {
    await showIntro();
    if (g.dead) return null;
    g.holds.delete('intro');
  }
  return () => stopGame();
}

const running = () => G && !G.userPaused && G.holds.size === 0 && !G.over;
function togglePause() { if (!G) return; G.userPaused = !G.userPaused; refresh(); }
function continueNotices() { if (!G) return; G.notices = []; G.holds.delete('notice'); refresh(); }

function frame(t) {
  if (!G || G.dead) return;
  const g = G;
  g.raf = requestAnimationFrame(frame);
  const dt = Math.min(t - (g.last || t), 250); g.last = t;
  if (!running()) { g.acc = 0; return; }
  const interval = (g.card.live ? 250 : 95) / g.speed;
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
  if (g.marginSynthetic && !g.state.loan.call) { g.marginSynthetic = null; g.holds.delete('margin'); g.paper.toast(`Test banner: "${choice}" chosen.`, ''); refresh(); return; }
  const r = doAct({ type: 'marginCall', choice });
  if (r.ok) { g.holds.delete('margin'); refresh(); }
}

function openLesson(id) {
  const g = G; if (!g) return;
  const cards = g.paper.lesson(id); if (!cards) return;
  g.holds.add('lesson-ref');
  showLesson(cards, { kicker: g.paper.label(id), label: g.paper.label(id) + ' lesson' }).then(() => { g.holds.delete('lesson-ref'); refresh(); });
}
async function runLessons() {
  const g = G; if (g.lessonBusy) return; g.lessonBusy = true;
  while (g.lessonQueue.length && !g.dead) {
    const id = g.lessonQueue.shift(), cards = g.paper.lesson(id); if (!cards) continue;
    g.holds.add('lesson');
    await showLesson(cards, { kicker: `${g.paper.label(id)} unlocked`, label: g.paper.label(id) + ' lesson', doneLabel: 'Got it' });
  }
  g.holds.delete('lesson'); g.lessonBusy = false; if (!g.dead) refresh();
}
function unlockTool(id, lesson = true) {
  const g = G; if (!id || g.unlocked.has(id)) return;
  g.unlocked = new Set([...g.unlocked, id]);
  if (lesson && !g.watch) { g.lessonQueue.push(id); g.holds.add('lesson'); queueMicrotask(runLessons); }
}

const CHOICES = {
  house: { kicker: 'Decision', title: 'The house', list: [['cash', 'Pay from cash and index fund', true], ['credit', 'Draw the credit line'], ['sell', 'Sell shares'], ['skip', 'Skip the house']] },
  collarExpiry: { kicker: 'Decision', title: 'Your collar has expired', list: [['roll', 'Roll at today’s prices', true], ['end', 'Let it end']] },
};
async function openChoice(ev) {
  const g = G, def = CHOICES[ev.type]; if (!def) return;
  g.holds.add('choice');
  const given = ev.data && Array.isArray(ev.data.choices) ? ev.data.choices : null;
  const list = given ? given.map((c) => [c.choice || c.id, c.label, c.primary]) : def.list;
  let note = '';
  for (;;) {
    const choices = list.map(([id, label, primary]) => {
      let c = { allowed: true };
      try { c = g.engine.canDo(g.state, ev.type, { choice: id }) || c; } catch { /* engine may not model per-choice gates */ }
      return { id, label, primary, disabled: c.allowed === false, reason: c.allowed === false ? c.reason : '' };
    });
    const id = await showModal({ kicker: def.kicker, title: def.title, text: ev.text + (note ? ` ${note}` : ''), choices });
    if (g.dead) return;
    const r = g.engine.act(g.state, { type: ev.type, choice: id });
    if (r.error) { note = r.error; continue; }
    g.state = r.state; handleEvents(r.events || []); break;
  }
  g.holds.delete('choice'); refresh();
}

function saveAch() {
  let life = []; try { life = JSON.parse(safeLS.get('ff.ach') || '[]'); } catch { /* ignore */ }
  safeLS.set('ff.ach', JSON.stringify([...new Set([...life, ...G.achievements])]));
}

function handleEvents(events, quiet) {
  const g = G;
  for (const ev of events) {
    const watch = g.watch;
    switch (ev.type) {
      case 'toolUnlock': {
        const d = ev.data || {}; const ids = [].concat(d.tools || d.tool || d.id || d.tab || []).map(toolId).filter(Boolean);
        (ids.length ? ids : [toolId(ev.text)]).forEach((id) => unlockTool(id));
        break;
      }
      case 'release': case 'windowOpen': case 'planLive':
        if (watch) g.paper.toast(ev.text, 'info');
        else { g.notices = [...g.notices, { text: ev.text }]; g.holds.add('notice'); }
        break;
      case 'windowClose': case 'planSale': g.paper.toast(ev.text, 'info'); break;
      case 'taxPaid': g.paper.toast(ev.text, 'warn'); break;
      case 'forcedSale':
        if (watch) g.paper.toast(ev.text, 'err');
        else { g.notices = [...g.notices, { text: ev.text }]; g.holds.add('notice'); }
        break;
      case 'news': g.paper.setNews(ev.text, dateLabel(g.dctx, ev.d)); break;
      case 'achievement': {
        const id = (ev.data && (ev.data.id || ev.data.name)) || ev.text; g.achievements.add(id); saveAch();
        if (!quiet) g.paper.toast(`Achievement: ${(ev.data && ev.data.name) || ev.text}`, 'ach');
        break;
      }
      case 'marginCall':
        g.marginText = ev.text;
        if (!g.state.loan || !g.state.loan.call) g.marginSynthetic = ev.data || {};
        if (!watch) g.holds.add('margin');
        break;
      case 'house': case 'collarExpiry': if (!watch) openChoice(ev); break;
      case 'cardEnd': break;
      case 'spend': break;
      default: if (ev.pause && !watch && ev.text) { g.notices = [...g.notices, { text: ev.text }]; g.holds.add('notice'); }
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
  if (freed) for (const id of ['plan', 'collar', 'credit']) unlockTool(id);
  g.snap = snap;
  const i = Math.min(snap.i, 1e9);
  const rivals = [{ id: 'you', name: g.watch ? 'The Playbook' : 'You', W: snap.W, you: true }];
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
    running: !!running(), watch: g.watch, dctx: g.dctx, achievements: [...g.achievements], unlocked: g.unlocked, notices: g.notices,
    marginText: g.marginText, seat: g.seat, cardId: g.cardId,
  };
  g.rail.update(view); g.paper.update(view);
}

// ------------------------------------------------------------------ start
onRoute(route);
let prevBoot = null;
subscribe((s) => { if (s.boot !== prevBoot) { prevBoot = s.boot; route(parseHash()); } });
boot();
