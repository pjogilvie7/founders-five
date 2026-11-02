// Scoreboard and reveal (PRD 4.8, 4.9, 4.10, 5.5). Every number shown comes from ctx.score, ctx.botScores or the engine.
// The only arithmetic here is display: ranking values for the "best" mark and one subtraction for "the change".
import { art, artManifest, loadArt, loadGuilloche } from './data.js';
import { money, moneyFull, longDate, esc, int } from './format.js';
import { ACHIEVEMENT_META, medalHTML, canonicalId, loadEarned, saveEarned, markFinished, saveRun } from './achievements.js';
import { renderCompare } from './compare.js';

const MINUS = '−';
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export const JPM_LINE = 'In J.P. Morgan\'s 2014 study of Russell 3000 stocks from 1980 to 2014, about 40% fell 70% or more from their peak and never recovered. That is a lifetime figure, not a five-year rate.';

export const LEAVES_OUT = [
  'Pre-IPO GRATs', 'Gifts to trusts', 'Charitable remainder trusts', 'Donor-advised funds',
  'QSBS (Section 1202)', 'State tax', 'Straddle rules', 'Real dealer spreads',
];

const BOT_NAMES = { holder: 'The Holder', seller: 'The Seller', playbook: 'The Playbook' };

// ------------------------------------------------------------------ number text
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
function fixed(x, dp) {
  if (!fin(x)) return '—';
  const t = Math.abs(x).toFixed(dp);
  return (x < 0 && Number(t) !== 0 ? MINUS : '') + t;
}
const pctText = (x, dp = 1) => (fin(x) ? fixed(x * 100, dp) + '%' : 'n/a');

const MEASURES = [
  { key: 'sharpe', dp: 1, scale: 1, name: 'Sharpe ratio', hint: 'Return above cash for each unit of ups and downs. Higher is better.', val: (s) => s.sharpe, text: (s) => fixed(s.sharpe, 1) },
  {
    key: 'drawdown', dp: 1, scale: 100, name: 'Max drawdown', hint: 'The worst fall from a peak, after adding spending back. Shallower is better.',
    val: (s) => (s.maxDrawdown ? s.maxDrawdown.pct : null), text: (s) => pctText(s.maxDrawdown && s.maxDrawdown.pct, 1),
    sub: (s) => (s.maxDrawdown && s.maxDrawdown.peakDate && s.maxDrawdown.troughDate ? `${longDate(s.maxDrawdown.peakDate)} to ${longDate(s.maxDrawdown.troughDate)}` : ''),
  },
  { key: 'irr', dp: 1, scale: 100, name: 'After-tax IRR', hint: 'Yearly rate of return after the tax you would owe on a sale. Higher is better.', val: (s) => s.irr, text: (s) => pctText(s.irr, 1) },
  { key: 'wealth', dp: 0, scale: 1, name: 'After-tax family wealth', hint: 'What the family ends with plus what it spent, after tax. Higher is better.', val: (s) => s.afterTaxWealth, text: (s) => money(s.afterTaxWealth) },
];

// ------------------------------------------------------------------ pieces
function emblemFor(key, label) {
  const m = artManifest();
  const src = m && m.rivals && m.rivals[key];
  if (src) return `<img class="sc-emb" src="${esc(src)}" alt="" width="40" height="40" loading="lazy">`;
  let svg = '';
  try { svg = art('rosette', { size: 40, rings: 4, color: 'currentColor' }); } catch { /* none */ }
  return `<span class="sc-emb sc-emb-svg" aria-hidden="true">${svg}</span>`;
}

function participants(ctx) {
  const { watch, score, botScores = {} } = ctx;
  const out = [{ key: 'you', emblem: watch ? 'playbook' : 'you', label: watch ? `${BOT_NAMES.playbook} (watched)` : 'You', score, you: true }];
  for (const k of ['holder', 'seller', 'playbook']) {
    if (watch && k === 'playbook') continue;
    if (botScores[k]) out.push({ key: k, emblem: k, label: BOT_NAMES[k], score: botScores[k] });
  }
  return out;
}

function tableHTML(cols) {
  const head = cols.map((c) => `<th scope="col" class="${c.you ? 'you' : ''}" data-col="${c.key}">${emblemFor(c.emblem)}<span class="sc-colname">${esc(c.label)}</span></th>`).join('');
  const rows = MEASURES.map((m) => {
    // rank at the displayed precision, so two values that look the same are both best (or neither, when all four look the same)
    const vals = cols.map((c) => { const v = m.val(c.score); return fin(v) ? Number((v * m.scale).toFixed(m.dp)) : -Infinity; });
    const best = Math.max(...vals);
    const allTie = vals.every((v) => v === vals[0]);
    const cells = cols.map((c, i) => {
      const isBest = fin(best) && !allTie && vals[i] === best;
      const sub = m.sub ? m.sub(c.score) : '';
      return `<td data-label="${esc(c.label)}" data-measure="${m.key}" data-col="${c.key}" class="${isBest ? 'best' : ''}${c.you ? ' you' : ''}">` +
        `<span class="sc-v num">${esc(m.text(c.score))}</span>` +
        (sub ? `<span class="sc-sub">${esc(sub)}</span>` : '') +
        (isBest ? '<span class="sc-bestflag">Best</span>' : '') + '</td>';
    }).join('');
    return `<tr data-measure="${m.key}"><th scope="row"><span class="sc-mname">${esc(m.name)}</span><span class="sc-hint">${esc(m.hint)}</span></th>${cells}</tr>`;
  }).join('');
  return `<table class="sc-table"><caption class="sr-only">Four measures for you and the rival strategies. The best value in each row is marked.</caption>` +
    `<thead><tr><th scope="col"><span class="sr-only">Measure</span></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

// Standings by after-tax family wealth, in the order the big number is shown. Rank is by the displayed figure, so two
// results that look the same share a rank and are marked "Tied", not "Winner"; nobody wins when every figure looks the same.
const ORD = ['first', 'second', 'third', 'fourth', 'fifth'];
function standingsModel(cols, watch) {
  const rows = cols.map((c) => ({ c, v: c.score && c.score.afterTaxWealth, txt: money(c.score && c.score.afterTaxWealth) }));
  const ok = rows.filter((r) => fin(r.v));
  const same = (a, b) => a.txt === b.txt;
  rows.forEach((r) => { r.rank = fin(r.v) ? 1 + ok.filter((o) => !same(o, r) && o.v > r.v).length : null; });
  rows.forEach((r) => { r.group = r.rank == null ? 1 : rows.filter((o) => o.rank === r.rank).length; });
  rows.sort((a, b) => (a.rank == null) - (b.rank == null) || (a.rank || 0) - (b.rank || 0));
  rows.forEach((r) => { r.name = r.c.you && !watch ? 'You' : (r.c.you ? BOT_NAMES.playbook : r.c.label); r.tied = r.group > 1; r.win = r.rank === 1 && r.group === 1; });
  const me = rows.find((r) => r.c.you) || null;
  const mates = me && me.tied ? rows.filter((o) => o !== me && o.rank === me.rank) : [];
  return { rows, me, mates, n: rows.length, watch };
}

function standingsHTML(model, duels = {}) {
  const items = model.rows.map((r, i) => {
    const tag = r.win ? 'Winner' : r.tied ? 'Tied' : '';
    return `<li class="sc-st${r.c.you ? ' you' : ''}${r.win ? ' win' : ''}${r.tied ? ' tie' : ''}" data-key="${esc(r.c.key)}" data-rank="${r.rank == null ? '' : r.rank}" style="--j:${i}">
      <span class="sc-rk num" aria-hidden="true">${r.rank == null ? '' : r.rank}</span>${emblemFor(r.c.emblem)}
      <span class="sc-nm"><span class="sr-only">Rank ${r.rank == null ? 'unknown' : r.rank}${r.tied ? ' (tied)' : ''}: </span>${esc(r.name)}${r.c.you && model.watch ? '<small>watched</small>' : ''}</span>
      <span class="sc-ld" aria-hidden="true"></span>${duels[r.c.key] ? `<span class="sc-vs ${duels[r.c.key].state}"><span class="sc-pips" aria-hidden="true">${duels[r.c.key].pips}</span><span class="sc-vs-n"><b class="num">${duels[r.c.key].n}</b> of 4<span class="sr-only"> measures beaten</span></span></span>` : '<span class="sc-vs none"></span>'}<span class="sc-wv num">${esc(r.txt)}</span>
      <span class="sc-wf${r.tied ? ' tie' : ''}">${tag}</span></li>`;
  }).join('');
  return `<ol class="sc-stand" aria-label="Standings by after-tax family wealth">${items}</ol>`;
}

// Hero rank line: the rank in words, with an explicit "tied with" line when two results show the same figure.
function rankLine(model, watch) {
  const m = model.me;
  if (!m || m.rank == null) return { crest: '', big: 'No rank', sub: '' };
  const who = watch ? BOT_NAMES.playbook : 'You';
  const word = ORD[m.rank - 1] || `${m.rank}th`;
  if (m.tied) {
    const names = model.mates.map((o) => o.name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return { crest: String(m.rank), tied: true, big: `${who} ${watch ? 'is' : 'are'} tied with ${list}`, sub: `Level for ${word} place of ${model.n} on after-tax wealth, as the figures are shown.` };
  }
  return { crest: String(m.rank), big: `${who} finished ${word} of ${model.n}`, sub: '' };
}

// Head to head: how many of the four measures the player's score beats each rival on (engine compare(), counted).
function duelMap(ctx, cmp, watch) {
  const out = {};
  if (!cmp) return out;
  const { score, botScores = {} } = ctx;
  const names = { sharpe: 'Sharpe ratio', maxDrawdown: 'Max drawdown', irr: 'After-tax IRR', afterTaxWealth: 'After-tax wealth' };
  for (const k of ['holder', 'seller', 'playbook']) {
    if (!botScores[k] || (watch && k === 'playbook')) continue;
    let c; try { c = cmp(score, botScores[k]); } catch { continue; }
    out[k] = { n: c.count, state: c.count >= 3 ? 'won' : c.count <= 1 ? 'lost' : 'split',
      pips: Object.entries(names).map(([m, label]) => `<i class="${c.wins[m] ? 'on' : ''}" title="${esc(label + (c.wins[m] ? ': ahead' : ': not ahead'))}"></i>`).join('') };
  }
  return out;
}

function certHTML(ctx) {
  const { card, score } = ctx;
  const entry = (ctx.data && ctx.data.cardsIndex || []).find((c) => c.id === card.id) || {};
  const prices = card.prices || [];
  const first = prices.length ? prices[0][0] : '', last = prices.length ? prices[prices.length - 1][0] : '';
  const ipo = card.ipo || {};
  const border = (() => { try { return art('certificateBorder', { width: 420, height: 440, color: 'currentColor' }); } catch { return ''; } })();
  const vig = (src, alt) => (src ? `<span class="sc-vig"><img src="${esc(src)}" alt="${esc(alt)}"></span>` : '');
  const lines = [
    ipo.pricingDate ? `<div><dt>IPO priced</dt><dd class="num">${esc(longDate(ipo.pricingDate))}</dd></div>` : '',
    ipo.firstTrade ? `<div><dt>First trade</dt><dd class="num">${esc(longDate(ipo.firstTrade))}</dd></div>` : '',
    first ? `<div><dt>${card.live ? 'Played so far' : 'Window played'}</dt><dd class="num">${esc(longDate(first))} to ${esc(longDate(last))}</dd></div>` : '',
  ].join('');
  const title = `<h2 class="sc-co">${esc(card.name || '')}</h2><p class="sc-tick num">${esc(card.ticker || '')}${card.industry ? ` · ${esc(card.industry)}` : ''}</p>`;

  if (!card.blind) {
    const days = score && score.days != null ? score.days : prices.length;
    return `<div class="sc-cert live" id="sc-cert"><div class="sc-face back" data-face="back"><span class="sc-border" aria-hidden="true">${border}</span>
      <div class="sc-face-in"><p class="sc-cert-head">Certificate of shares</p>${vig(card.vignette || entry.vignette, 'An engraved rocket')}${title}
      <dl class="sc-dl">${lines}</dl>
      <p class="sc-live">Live card: ${esc(int(days))} trading days so far. Not comparable with five-year cards.</p></div></div></div>`;
  }
  const label = entry.label || 'Sealed card';
  return `<div class="sc-cert blind" id="sc-cert" data-state="front" tabindex="0" role="button" aria-pressed="false" aria-label="Certificate. Select to turn it over.">
    <div class="sc-flip">
      <div class="sc-face front" data-face="front"><span class="sc-border" aria-hidden="true">${border}</span>
        <div class="sc-face-in"><p class="sc-cert-head">Certificate of shares</p>${vig(card.vignette || entry.vignette, 'An engraved allegory')}
        <h2 class="sc-co">${esc(label)}</h2><p class="sc-tick">Sealed</p><p class="sc-live">Breaking the seal.</p></div></div>
      <div class="sc-face back" data-face="back" aria-hidden="true"><span class="sc-border" aria-hidden="true">${border}</span>
        <div class="sc-face-in"><p class="sc-cert-head">Certificate of shares</p>${vig(card.revealVignette || entry.revealVignette, 'An engraved vignette for the company')}${title}
        <dl class="sc-dl">${lines}</dl>
        <p class="sc-jpm">${esc(JPM_LINE)}</p><span class="stamp sc-stamp">Revealed</span></div></div>
    </div></div>`;
}

function countUp(node, final, text) {
  node.textContent = text(final);
  if (reduced() || !fin(final)) return;
  const dur = 1150, t0 = performance.now();
  node.textContent = text(0);
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (t) => {
    if (!node.isConnected) return;
    const k = Math.min(1, (t - t0) / dur);
    node.textContent = k >= 1 ? text(final) : text(final * ease(k));
    if (k < 1) requestAnimationFrame(step); else node.classList.add('landed');
  };
  requestAnimationFrame(step);
}

function nextBlind(ctx) {
  const idx = (ctx.data && ctx.data.cardsIndex) || [];
  const blinds = idx.filter((c) => c.blind);
  if (!blinds.length) return null;
  const at = blinds.findIndex((c) => c.id === ctx.cardId);
  if (at < 0) return blinds[0];
  const nxt = blinds[(at + 1) % blinds.length];
  return nxt;
}

// ------------------------------------------------------------------ percentile section (PRD 4.8, should-have)
const SVGNS = 'http://www.w3.org/2000/svg';
const MARK = {
  you: { letter: 'Y', color: 'var(--seal)' },
  holder: { letter: 'H', color: 'var(--ink)' },
  seller: { letter: 'S', color: 'var(--collar)' },
  playbook: { letter: 'P', color: 'var(--gold)' },
};
const markOf = (c, watch) => MARK[c.you && watch ? 'playbook' : c.key] || MARK[c.key];

const strategyCache = new Map(); // `${card}|${seat}|${days}` -> promise of [{afterTaxWealth, sharpe}]
const progressTo = new Map();    // same key -> the latest progress callback

function histogramSVG(uid, { title, values, marks, fmt }) {
  const W = 400, H = 214, L = 10, R = 10, base = 184, plotTop = 82, bins = 24;
  const all = values.concat(marks.map((m) => m.value)).filter(fin);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.02; lo -= pad; hi += pad;
  const x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const counts = new Array(bins).fill(0);
  for (const v of values) if (fin(v)) counts[Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * bins)))]++;
  const top = Math.max(...counts, 1);
  const bw = (W - L - R) / bins;
  const bars = counts.map((c, i) => {
    if (!c) return '';
    const h = Math.max(2, (c / top) * (base - plotTop));
    return `<rect class="hg-bar" x="${(L + i * bw + 0.8).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${(bw - 1.6).toFixed(1)}" height="${h.toFixed(1)}" fill="url(#${uid}-h)"><title>${c} of ${values.length} strategies</title></rect>`;
  }).join('');
  // markers: a lettered seal on a stem; seals that would touch step up to the next lane
  const placed = marks.filter((m) => fin(m.value)).map((m) => ({ ...m, px: x(m.value) })).sort((a, b) => a.px - b.px);
  const laneX = [];
  for (const m of placed) {
    let lane = 0;
    while (laneX[lane] != null && Math.abs(m.px - laneX[lane]) < 19) lane++;
    laneX[lane] = m.px; m.lane = lane;
  }
  const marksSvg = placed.map((m) => {
    const cy = 11 + m.lane * 19;
    return `<g class="hg-mark${m.you ? ' you' : ''}" style="--mc:${m.color}"><line x1="${m.px.toFixed(1)}" x2="${m.px.toFixed(1)}" y1="${cy + 9}" y2="${base}" class="hg-stem"/>` +
      `<circle cx="${m.px.toFixed(1)}" cy="${cy}" r="9" class="hg-seal"/><text x="${m.px.toFixed(1)}" y="${cy + 4.4}" text-anchor="middle" class="hg-letter">${m.letter}</text></g>`;
  }).join('');
  const mid = (lo + hi) / 2;
  const desc = `${title}: 500 random legal strategies run from ${fmt(Math.min(...values.filter(fin)))} to ${fmt(Math.max(...values.filter(fin)))}. ` + placed.map((m) => `${m.name} ${fmt(m.value)}`).join('; ') + '.';
  return `<svg class="hg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${uid}-t" xmlns="${SVGNS}" preserveAspectRatio="xMidYMid meet">
    <title id="${uid}-t">${esc(desc)}</title>
    <defs><pattern id="${uid}-h" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" class="hg-bg"/><line x1="0" y1="0" x2="0" y2="4" class="hg-hatch"/></pattern></defs>
    ${bars}
    <line class="hg-base" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/>
    ${[lo + pad, mid, hi - pad].map((v, i) => `<line class="hg-tick" x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="${base}" y2="${base + 5}"/><text class="hg-axis" x="${Math.min(W - 2, Math.max(2, x(v))).toFixed(1)}" y="${base + 19}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}">${esc(fmt(v))}</text>`).join('')}
    ${marksSvg}
  </svg>`;
}

function strategiesFor(ctx, onProgress) {
  const { card, seat } = ctx;
  const key = `${card.id}|${seat}|${card.prices.length}`;
  let p = strategyCache.get(key);
  if (!p) {
    p = import('../engine/percentile.js').then((m) => m.randomStrategiesInBackground(
      { card, seat, market: ctx.data.market, spcxOptions: ctx.data.spcxOptions || null, n: 500 }, { onProgress: (x) => { const f = progressTo.get(key); if (f) f(x); } }));
    strategyCache.set(key, p);
    p.catch(() => strategyCache.delete(key));
  }
  progressTo.set(key, onProgress);
  return p;
}

async function renderPercentile(el, ctx, cols) {
  const watch = !!ctx.watch;
  const host = el.querySelector('#sc-pct-body');
  if (!host) return;
  const status = host.querySelector('.sc-pct-status');
  let results;
  try {
    results = await strategiesFor(ctx, (p) => { if (status && status.isConnected) status.textContent = `Running 500 random legal strategies: ${Math.round(p * 100)}%`; });
  } catch (e) { console.warn('percentile failed', e); results = null; }
  if (!host.isConnected) return;
  if (!results || !results.length) { host.innerHTML = '<p class="sc-pct-status">The comparison with random strategies could not run in this browser.</p>'; return; }
  const { percentileOf } = await import('../engine/percentile.js');
  const wealth = results.map((r) => r.afterTaxWealth), sharpe = results.map((r) => r.sharpe);
  const rows = cols.map((c) => {
    const mk = markOf(c, watch);
    return { key: c.key, you: c.you, name: c.you && !watch ? 'You' : (c.you ? BOT_NAMES.playbook : c.label), letter: mk.letter, color: mk.color,
      w: c.score.afterTaxWealth, s: c.score.sharpe, pw: percentileOf(c.score.afterTaxWealth, wealth), ps: percentileOf(c.score.sharpe, sharpe) };
  });
  const me = rows[0];
  const uid = 'hg' + Math.random().toString(36).slice(2, 7);
  const n = results.length;
  const pc = (x) => (fin(x) ? `${int(Math.round(x))}%` : 'n/a');
  const subject = watch ? BOT_NAMES.playbook : 'You';
  const fmtS = (v) => fixed(v, 1);
  host.innerHTML = `
    <p class="sc-pct-line" id="sc-pct-line">${esc(subject)} finished ahead of <b class="num">${esc(pc(me.pw))}</b> of ${n} random legal strategies on after-tax wealth.</p>
    <p class="sc-pct-line2" id="sc-pct-line2">On Sharpe ratio, ${esc(subject === 'You' ? 'you' : subject)} finished ahead of <b class="num">${esc(pc(me.ps))}</b>.</p>
    <div class="sc-pct-charts">
      <figure class="sc-hg"><figcaption>After-tax family wealth</figcaption>${histogramSVG(uid + 'w', { title: 'After-tax family wealth', values: wealth, marks: rows.map((r) => ({ name: r.name, letter: r.letter, color: r.color, you: r.you, value: r.w })), fmt: (v) => money(v) })}</figure>
      <figure class="sc-hg"><figcaption>Sharpe ratio</figcaption>${histogramSVG(uid + 's', { title: 'Sharpe ratio', values: sharpe, marks: rows.map((r) => ({ name: r.name, letter: r.letter, color: r.color, you: r.you, value: r.s })), fmt: fmtS })}</figure>
    </div>
    <ul class="sc-pct-key" aria-label="Where each strategy landed">${rows.map((r) => `<li data-key="${r.key}"><span class="sc-seal" style="--mc:${r.color}" aria-hidden="true">${r.letter}</span>
      <span class="sc-pk-n">${esc(r.name)}</span><span class="sc-pk-v">Wealth <b class="num">${esc(money(r.w))}</b>, ahead of ${esc(pc(r.pw))}</span><span class="sc-pk-v">Sharpe <b class="num">${esc(fmtS(r.s))}</b>, ahead of ${esc(pc(r.ps))}</span></li>`).join('')}</ul>
    <p class="sc-pct-note">Each random strategy is a made-up mix of sales, plans, collars, loans and index moves, and every move was one the rules allow on the day it was tried. They are a yardstick for how much the choices matter, not a list of things to do. The mix is fixed for this card and seat, so the same 500 appear every time.</p>`;
  host.dataset.ready = 'true';
  const meta = el.querySelector('#sc-pct-meta');
  if (meta) meta.textContent = `Ahead of ${pc(me.pw)} on wealth`;
}

// ------------------------------------------------------------------ main
export async function renderScoreboard(el, ctx) {
  await Promise.all([loadArt().catch(() => null), loadGuilloche().catch(() => null)]);
  const { card, state, score, watch } = ctx;
  const botScores = ctx.botScores || {};
  const cardId = ctx.cardId || (card && card.id);

  // Engine debrief and achievements (engine/debrief.js). A failure leaves those sections out rather than breaking the page.
  let deb = null, cmp = null, earnedNow = [];
  try {
    const m = await import('../engine/debrief.js');
    cmp = m.compare;
    try { deb = m.debrief(state, score, botScores); } catch (e) { console.warn('debrief failed', e); }
    try { earnedNow = m.achievements(state, score, botScores); } catch (e) { earnedNow = []; }
  } catch (e) { earnedNow = (ctx.achievements || []); }
  earnedNow = [...new Set(earnedNow.map(canonicalId).filter(Boolean))];

  // Persistence (try/catch inside the helpers).
  const before = loadEarned();
  markFinished(cardId);
  const shared = !!ctx.shared;
  const runId = `${cardId}|${ctx.seat}|${score && score.afterTaxWealth}|${state && state.log ? state.log.length : 0}`;
  if (!watch && !shared) {
    saveEarned(earnedNow);
    saveRun({
      runId, at: Date.now(),
      cardId, seat: ctx.seat, blind: !!card.blind,
      sharpe: score && score.sharpe, maxDrawdown: score && score.maxDrawdown && score.maxDrawdown.pct, irr: score && score.irr, afterTaxWealth: score && score.afterTaxWealth,
      verdict: deb && deb.verdict || '',
    });
  }

  const cols = participants(ctx);
  // After-tax starting wealth (decision RUN-5): the engine's day-0 IRR flow, i.e. W_0 less the tax embedded in the stake.
  const W0 = score && score.flows && score.flows[0] ? -score.flows[0].amount : (state && state.history && state.history[0] ? state.history[0].W : null);
  const final = score ? score.afterTaxWealth : null;
  // display-only: the change from the starting wealth to the final number
  const change = fin(W0) && fin(final) ? final - W0 : null;

  // verdict
  let verdict = deb ? deb.verdict : '';
  if (watch && cmp) {
    const parts = ['holder', 'seller'].filter((k) => botScores[k]).map((k) => `${BOT_NAMES[k]} on ${cmp(score, botScores[k]).count} of 4`);
    verdict = parts.length ? `${BOT_NAMES.playbook} beat ${parts.join(' and ')} measures.` : '';
  }
  const paras = deb ? (watch ? deb.paragraphs.slice(0, 2) : deb.paragraphs) : [];

  const forced = state && state.stats && Array.isArray(state.stats.forced) ? state.stats.forced : [];
  const forcedShares = forced.reduce((a, f) => a + (f.shares || 0), 0);

  const earnedSet = new Set(watch ? [] : earnedNow);
  const medals = ACHIEVEMENT_META.map((a, i) => {
    const now = earnedSet.has(a.id), ever = !now && before.has(a.id) && !watch;
    const state_ = now ? 'now' : ever ? 'before' : 'locked';
    return `<li class="sc-medal ${state_}" data-id="${a.id}" data-earned="${now}" style="--i:${i}">${medalHTML(a, now || ever, 104)}
      <span class="sc-mtxt"><b>${esc(a.name)}</b><span>${esc(now ? a.lesson : ever ? 'Earned in an earlier run. ' + a.lesson : a.condition)}</span>
      <em>${now ? 'Earned this run' : ever ? 'Earned before' : 'Not yet'}</em></span></li>`;
  }).join('');

  const nb = nextBlind(ctx);
  const seatHref = `#/seat/${encodeURIComponent(cardId)}`;
  const dealHref = nb ? `#/seat/${encodeURIComponent(nb.id)}` : null;
  // the same actions twice: once in the hero (always the first thing in reach) and once in a dock that
  // slides up when the hero row has scrolled out of view. Only the dock carries the data-action / data-hook hooks.
  const barHTML = (hero) => {
    const a = (name) => (hero ? `data-cta="${name}"` : `data-action="${name}"`);
    const mainBtn = watch
      ? `<a class="btn primary" ${a('play-yourself')} href="${seatHref}">Play it yourself</a>`
      : `<a class="btn primary" ${a('play-again')} href="#/play/${encodeURIComponent(cardId)}/${encodeURIComponent(ctx.seat)}">Play again</a>`;
    const sideBtn = watch
      ? `<a class="sc-q" ${a('watch-again')} href="#/watch">Watch again</a>`
      : `<a class="sc-q" ${a('switch-seat')} href="${seatHref}">Switch seat</a>`;
    return `${mainBtn}
        ${dealHref ? `<a class="btn" ${a('deal-another')} href="${dealHref}">Deal another card</a>` : ''}
        <button class="btn sc-sharebtn" type="button" ${a('copy-share-code')}${hero ? '' : ' data-hook="copy-share-code"'} aria-controls="sc-share"><span class="sc-sharebtn-t">Copy share code</span></button>
        ${sideBtn}
        ${hero ? '' : `<button class="sc-q" type="button" data-action="compare-runs" data-hook="compare-runs" aria-expanded="false" aria-controls="sc-compare">Compare runs</button>`}`;
  };
  const model = standingsModel(cols, watch);
  const rk = rankLine(model, watch);
  const duels = duelMap(ctx, cmp, watch);

  const kicker = watch ? 'The Playbook, finished' : shared ? 'A shared run, replayed' : (card.blind ? 'Card finished' : 'Card finished so far');
  const headline = watch ? 'A finished run, watched' : shared ? 'A shared result' : 'Your result';
  const live = !!card.live;
  const showPct = !!(ctx.data && ctx.data.market && card.prices && card.prices.length);

  // hero seal strip: the seals earned this run, large, stamped in one after another with a NEW mark on first-time ones;
  // below them a pip for each of the twelve (gold = earned this run, dark = earned before)
  let trayN = 0;
  const nowList = ACHIEVEMENT_META.filter((a) => earnedSet.has(a.id));
  const fresh = nowList.filter((a) => !before.has(a.id));
  const sealCards = nowList.map((a) => {
    const isNew = !before.has(a.id), k = trayN++;
    return `<li class="sc-slot now${isNew ? ' fresh' : ''}" data-id="${a.id}" style="--k:${k}" title="${esc(a.name + ': ' + a.lesson)}">${medalHTML(a, true, 64)}
      <span class="sc-slot-n">${esc(a.name)}</span>${isNew ? '<span class="sc-new" aria-hidden="true">New</span>' : ''}<span class="sr-only">${isNew ? ', new' : ', earned before'}</span></li>`;
  }).join('');
  const pips = ACHIEVEMENT_META.map((a) => {
    const now = earnedSet.has(a.id), ever = !now && before.has(a.id);
    return `<li class="${now ? 'now' : ever ? 'before' : ''}" title="${esc(a.name)}"><span class="sr-only">${esc(a.name)}: ${now ? 'earned this run' : ever ? 'earned before' : 'not yet earned'}</span></li>`;
  }).join('');
  const collected = ACHIEVEMENT_META.filter((a) => earnedSet.has(a.id) || before.has(a.id)).length;
  const sealsHTML = watch
    ? `<div class="sc-seals quiet"><p class="sc-seals-l">Watching earns no seals. <a href="${seatHref}">Play it yourself</a> to collect them.</p></div>`
    : `<div class="sc-seals${nowList.length ? '' : ' none'}" aria-labelledby="sc-seals-l">
        <p class="sc-seals-l" id="sc-seals-l">${nowList.length
          ? `<b class="num">${nowList.length}</b> ${nowList.length === 1 ? 'seal' : 'seals'} earned this run${fresh.length ? `, <b class="num">${fresh.length}</b> new` : ''}`
          : 'No seals earned this run'}<span class="sc-seals-c num">${collected} of ${ACHIEVEMENT_META.length} collected</span></p>
        ${nowList.length ? `<ul class="sc-tray-row" data-count="${nowList.length}">${sealCards}</ul>` : ''}
        <ul class="sc-pips" aria-label="All seals">${pips}</ul></div>`;

  const acc = (id, title, meta, body, open = false) => `<details class="sc-acc" id="${id}"${open ? ' open' : ''}><summary><span class="sc-acc-t">${title}</span><span class="sc-acc-m">${meta}</span><span class="sc-acc-x" aria-hidden="true"></span></summary><div class="sc-acc-b">${body}</div></details>`;
  const leaveBody = `<div class="sc-leaves"><p>This is a simplified model of one stock. It does not include:</p>
      <ul class="sc-leaves-list">${LEAVES_OUT.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  const measuresBody = `${tableHTML(cols)}
      <details class="sc-big-more"><summary>How the big number is counted</summary>
        <p class="sc-big-note">${watch ? 'This is The Playbook\'s number, not yours. ' : ''}Counts what the family spent, and takes out the tax you would owe if you sold everything on the last day. The starting figure takes out the tax already built into the shares on day one, so the change shows what the decisions did.${live ? ' The card is still running, so this is a result so far.' : ''}</p></details>`;
  const debriefBody = `${watch ? '<p class="sc-watchnote">You watched this run, so “you” below means The Playbook.</p>' : ''}
      ${paras.map((p) => `<p class="sc-para">${esc(p)}</p>`).join('')}`;
  const achBody = `<p class="sc-ach-lede">${watch ? 'Watching earns none. Achievements come from your own play.' : esc(earnedSet.size ? `${earnedSet.size} earned this run.` : 'None earned this run.')}</p>
      <ul class="sc-medals">${medals}</ul>`;
  const revealBlock = card.blind && card.reveal && card.reveal.text
    ? `<section class="sc-in sc-reveal" style="--i:3" aria-labelledby="sc-rev-h"><h3 id="sc-rev-h">What the card was</h3><p class="sc-para" id="sc-reveal-text">${esc(card.reveal.text)}</p></section>` : '';
  const lessonBlock = forced.length && !watch
    ? `<section class="sc-in sc-lesson" style="--i:3" role="note" data-lesson="forced-sale"><h3>A lesson from the bank sale</h3>
        <p>The bank sold ${esc(int(forcedShares))} of your pledged shares at the close${forced.length > 1 ? ` in ${forced.length} sales` : ''}, ignoring the trading window, and each sale was taxed. A loan against one stock can be called when the price falls, and the bank sells at the close of the sale day at whatever price the stock has by then. This is a lesson, not a badge.</p></section>` : '';

  el.innerHTML = `<article class="sc" data-card="${esc(cardId)}" data-seat="${esc(ctx.seat || '')}" data-watch="${watch ? 'true' : 'false'}" data-blind="${card.blind ? 'true' : 'false'}">
    <header class="sc-head sc-in" style="--i:0"><p class="kicker">${esc(kicker)}</p><h1>${esc(headline)}</h1></header>
    <div class="sc-top">
      <section class="sc-in sc-cert-wrap" style="--i:1" aria-label="Certificate">${certHTML(ctx)}</section>
      <section class="sc-in sc-bigcard" style="--i:2" aria-label="Result">
        <div class="sc-rank${rk.tied ? ' tied' : ''}" id="sc-rank">
          ${rk.crest ? `<span class="sc-crest" aria-hidden="true"><b class="num">${esc(rk.crest)}</b>${rk.tied ? '<i>tied</i>' : ''}</span>` : ''}
          <div class="sc-rank-t"><p class="sc-rank-h" id="sc-rank-h">${esc(rk.big)}</p><p class="sc-rank-s">${esc(rk.sub)}</p></div>
        </div>
        <div class="sc-numrow">
          <div class="sc-numcol"><p class="sc-big-l" id="sc-big-l">After-tax family wealth</p>
            <p class="sc-big num" id="sc-big" data-value="${fin(final) ? final : ''}">${fin(final) ? esc(moneyFull(final)) : '—'}</p></div>
          <dl class="sc-big-dl">
            <div><dt>Starting, after tax</dt><dd class="num" id="sc-w0">${fin(W0) ? esc(moneyFull(W0)) : '—'}</dd></div>
            <div><dt>Change</dt><dd class="num ${change != null && change < 0 ? 'down' : 'up'}" id="sc-chg">${change == null ? '—' : (change < 0 ? '' : '+') + esc(moneyFull(change))}</dd></div>
          </dl>
        </div>
        ${verdict ? `<p class="sc-verdict" id="sc-verdict">${esc(verdict)}</p>` : ''}
        <p class="sc-stand-c">Rank by wealth. The bars count the four measures you beat each rival on.</p>
        ${standingsHTML(model, duels)}
        ${sealsHTML}
        <div class="sc-cta" id="sc-cta">${barHTML(true)}</div>
      </section>
    </div>
    ${revealBlock}${lessonBlock}

    <section class="sc-in sc-report" style="--i:4" aria-labelledby="sc-r-h">
      <div class="sc-report-h"><h2 id="sc-r-h">The full report</h2><button class="sc-q" type="button" id="sc-toggle-all" aria-pressed="false">Open all</button></div>
      <p class="sc-report-lede">Everything behind the number. Open what you want to check.</p>
      ${acc('sc-m-h', 'Four measures', 'Sharpe, drawdown, IRR, wealth', measuresBody)}
      ${showPct ? acc('sc-p-h', `Against 500 random strategies${live ? ` <span class="sc-pct-tag">${esc(`${score && score.days != null ? score.days : card.prices.length}-day card`)}</span>` : ''}`, '<span id="sc-pct-meta">Running now</span>',
        '<div id="sc-pct-body" aria-live="polite"><p class="sc-pct-status" role="status">Running 500 random legal strategies: 0%</p></div>') : ''}
      ${acc('sc-d-h', 'Debrief', `${paras.length} short ${paras.length === 1 ? 'paragraph' : 'paragraphs'}`, debriefBody)}
      ${acc('sc-a-h', 'All twelve seals', watch ? 'None from watching' : `${collected} of ${ACHIEVEMENT_META.length} collected`, achBody)}
      ${acc('sc-l-h', 'What this replay leaves out', `${LEAVES_OUT.length} things`, leaveBody)}
    </section>

    <section class="sc-compare" id="sc-compare" aria-label="Compare runs" hidden></section>
    <footer class="sc-actions" aria-label="Next steps">
      <div class="sc-bar-in">${barHTML(false)}</div>
    </footer>
    <div class="sc-share" id="sc-share" role="group" aria-label="Share link" hidden>
      <div class="sc-share-top"><label for="sc-share-link" class="sc-share-l">Share link</label><button type="button" class="sc-q sc-share-x" id="sc-share-x">Close</button></div>
      <input id="sc-share-link" class="sc-share-input" type="text" readonly spellcheck="false" autocomplete="off">
      <p class="sc-share-note" id="sc-share-note" role="status"></p>
    </div>
  </article>`;

  // percentile histograms (background worker; the page stays responsive)
  if (showPct) renderPercentile(el, ctx, cols).catch((e) => { console.warn('percentile failed', e); const b = el.querySelector('#sc-pct-body'); if (b) b.innerHTML = '<p class="sc-pct-status">The comparison with random strategies could not run.</p>'; });

  // Compare runs
  const cmpBtn = el.querySelector('[data-hook="compare-runs"]'), cmpAll = [...el.querySelectorAll('[aria-controls="sc-compare"]')], cmpBox = el.querySelector('#sc-compare');
  if (cmpBtn && cmpBox) {
    cmpAll.forEach((b) => b.addEventListener('click', () => {
      const open = cmpBox.hidden;
      cmpBox.hidden = !open; cmpAll.forEach((x) => x.setAttribute('aria-expanded', String(open)));
      if (open) {
        renderCompare(cmpBox, {
          cardId, seat: ctx.seat, watch, runId: watch ? null : runId,
          current: !watch ? { runId, at: null, sharpe: score && score.sharpe, maxDrawdown: score && score.maxDrawdown && score.maxDrawdown.pct, irr: score && score.irr, afterTaxWealth: score && score.afterTaxWealth, label: shared ? 'Shared run' : 'This run' } : null,
        });
        cmpBox.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      }
    }));
  }

  // Copy share code: the link opens in a small card above the bar, and the button confirms the copy at once
  const shBtn = el.querySelector('[data-hook="copy-share-code"]'), shAll = [...el.querySelectorAll('.sc-sharebtn')], shBox = el.querySelector('#sc-share');
  if (shBtn && shBox) {
    const input = shBox.querySelector('input'), note = shBox.querySelector('#sc-share-note'), x = shBox.querySelector('#sc-share-x');
    let timer = 0, last = shBtn;
    const closeShare = (refocus) => { shBox.hidden = true; shAll.forEach((b) => b.setAttribute('aria-expanded', 'false')); if (refocus) last.focus(); };
    x.addEventListener('click', () => closeShare(true));
    shBox.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeShare(true); } });
    const onShare = async (ev) => {
      last = (ev && ev.currentTarget) || shBtn;
      shBox.hidden = false; shAll.forEach((b) => b.setAttribute('aria-expanded', 'true'));
      let link = '';
      try {
        const sc = await import('../engine/sharecode.js');
        const code = sc.encodeShare({ cardId, seat: ctx.seat, log: (state && state.log) || [] });
        link = sc.shareLink(code);
        shBtn.dataset.code = code;
      } catch (e) {
        input.value = ''; input.hidden = true;
        note.textContent = 'This run cannot be turned into a share code.';
        return;
      }
      input.hidden = false; input.value = link; shBtn.dataset.link = link;
      let copied = false;
      try { await navigator.clipboard.writeText(link); copied = true; } catch { copied = false; }
      if (!copied) {
        try { input.focus(); input.select(); copied = !!document.execCommand('copy'); } catch { copied = false; }
      }
      note.textContent = copied
        ? 'Link copied. Anyone who opens it sees this run replayed on the same card, with no account.'
        : 'Select the link above and copy it. Anyone who opens it sees this run replayed on the same card.';
      if (!copied) { try { input.focus(); input.select(); } catch { /* ignore */ } }
      if (copied) {
        shAll.forEach((b) => { b.querySelector('.sc-sharebtn-t').textContent = 'Link copied'; b.classList.add('done'); }); clearTimeout(timer);
        timer = setTimeout(() => shAll.forEach((b) => { b.querySelector('.sc-sharebtn-t').textContent = 'Copy share code'; b.classList.remove('done'); }), 1800);
      }
    };
    shAll.forEach((b) => b.addEventListener('click', onShare));
  }

  // report accordions: open or close them all
  const tAll = el.querySelector('#sc-toggle-all');
  if (tAll) tAll.addEventListener('click', () => {
    const accs = [...el.querySelectorAll('.sc-report > .sc-acc')];
    const open = accs.some((d) => !d.open);
    accs.forEach((d) => { d.open = open; });
    tAll.textContent = open ? 'Close all' : 'Open all'; tAll.setAttribute('aria-pressed', String(open));
  });

  // the dock appears once the hero's own action row has scrolled out of view
  const art_ = el.querySelector('.sc'), cta = el.querySelector('#sc-cta');
  if (art_ && cta) {
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((es) => { art_.classList.toggle('docked', !es[es.length - 1].isIntersecting); }, { threshold: 0.6 });
      io.observe(cta);
    } else art_.classList.add('docked');
  }

  // big number count-up (once)
  const big = el.querySelector('#sc-big');
  if (big && fin(final)) countUp(big, final, (v) => moneyFull(v));

  // certificate border: drawn at the face's real size so the corner rosettes are not stretched
  const drawBorders = () => el.querySelectorAll('.sc-face').forEach((f) => {
    const w = f.offsetWidth, h = f.offsetHeight, b = f.querySelector('.sc-border');
    if (!w || !h || !b || b.dataset.size === `${w}x${h}`) return;
    try { b.innerHTML = art('certificateBorder', { width: w, height: h, color: 'currentColor' }); b.dataset.size = `${w}x${h}`; } catch { /* keep the first border */ }
  });
  drawBorders();
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(drawBorders); el.querySelectorAll('.sc-face').forEach((f) => ro.observe(f)); }

  // certificate flip
  const cert = el.querySelector('#sc-cert');
  if (cert && cert.classList.contains('blind')) {
    const front = cert.querySelector('.front'), back = cert.querySelector('.back');
    const set = (flipped) => {
      cert.dataset.state = flipped ? 'back' : 'front';
      cert.classList.toggle('flipped', flipped);
      front.setAttribute('aria-hidden', String(flipped)); back.setAttribute('aria-hidden', String(!flipped));
      cert.setAttribute('aria-pressed', String(flipped));
      const who = [back.querySelector('.sc-co'), back.querySelector('.sc-tick')].map((n) => (n && n.textContent || '').trim()).filter(Boolean).join(', ');
      cert.setAttribute('aria-label', flipped ? `Certificate, turned over${who ? ': ' + who : ''}. Select to turn it back.` : 'Certificate. Select to turn it over.');
    };
    if (reduced()) { cert.classList.add('instant'); set(true); }
    else setTimeout(() => { if (cert.isConnected) set(true); }, 650);
    const toggle = () => set(cert.dataset.state !== 'back');
    cert.addEventListener('click', toggle);
    cert.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }
  // On arrival, focus goes to the page heading (not a control), so a keyboard or screen-reader player starts at the top of the result.
  const h1 = el.querySelector('.sc-head h1');
  if (h1) { h1.tabIndex = -1; try { h1.focus({ preventScroll: true }); } catch { /* no focus */ } }
  return () => {};
}

export default { renderScoreboard };
