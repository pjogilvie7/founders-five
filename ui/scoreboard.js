// Scoreboard and reveal (PRD 4.8, 4.9, 4.10, 5.5). Every number shown comes from ctx.score, ctx.botScores or the engine.
// The only arithmetic here is display: ranking values for the "best" mark and one subtraction for "the change".
import { art, artManifest, loadArt, loadGuilloche } from './data.js';
import { money, moneyFull, longDate, esc, int } from './format.js';
import { ACHIEVEMENT_META, medalHTML, canonicalId, loadEarned, saveEarned, markFinished, saveRun } from './achievements.js';

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
  return `<div class="sc-cert blind" id="sc-cert" data-state="front" tabindex="0" role="group" aria-label="Certificate. Select to turn it over.">
    <div class="sc-flip">
      <div class="sc-face front" data-face="front"><span class="sc-border" aria-hidden="true">${border}</span>
        <div class="sc-face-in"><p class="sc-cert-head">Certificate of shares</p>${vig(card.vignette || entry.vignette, 'An engraved allegory')}
        <h2 class="sc-co">${esc(label)}</h2><p class="sc-tick">Sealed</p><p class="sc-live">Breaking the seal.</p></div></div>
      <div class="sc-face back" data-face="back" aria-hidden="true"><span class="sc-border" aria-hidden="true">${border}</span>
        <div class="sc-face-in"><p class="sc-cert-head">Revealed</p>${vig(card.revealVignette || entry.revealVignette, 'An engraved vignette for the company')}${title}
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
    if (k < 1) requestAnimationFrame(step);
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
  if (!watch) {
    saveEarned(earnedNow);
    saveRun({
      runId: `${cardId}|${ctx.seat}|${score && score.afterTaxWealth}|${state && state.log ? state.log.length : 0}`, at: Date.now(),
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
  const buttons = watch
    ? `<a class="btn primary" data-action="play-yourself" href="${seatHref}">Play it yourself</a>
       <a class="btn" data-action="watch-again" href="#/watch">Watch again</a>${nb ? `<a class="btn" data-action="deal-another" href="#/seat/${encodeURIComponent(nb.id)}">Deal another card</a>` : ''}`
    : `<a class="btn primary" data-action="play-again" href="#/play/${encodeURIComponent(cardId)}/${encodeURIComponent(ctx.seat)}">Play again</a>
       <a class="btn" data-action="switch-seat" href="${seatHref}">Switch seat</a>${nb ? `<a class="btn" data-action="deal-another" href="#/seat/${encodeURIComponent(nb.id)}">Deal another card</a>` : ''}`;

  const kicker = watch ? 'The Playbook, finished' : (card.blind ? 'Card finished' : 'Card finished so far');
  const headline = watch ? 'A finished run, watched' : 'Your result';
  const live = !!card.live;

  el.innerHTML = `<article class="sc" data-card="${esc(cardId)}" data-seat="${esc(ctx.seat || '')}" data-watch="${watch ? 'true' : 'false'}" data-blind="${card.blind ? 'true' : 'false'}">
    <header class="sc-head sc-in" style="--i:0"><p class="kicker">${esc(kicker)}</p><h1>${esc(headline)}</h1></header>
    <div class="sc-top">
      <section class="sc-in sc-cert-wrap" style="--i:1" aria-label="Certificate">${certHTML(ctx)}</section>
      <section class="sc-in sc-bigcard" style="--i:2" aria-labelledby="sc-big-l">
        <p class="sc-big-l" id="sc-big-l">After-tax family wealth</p>
        <p class="sc-big num" id="sc-big" data-value="${fin(final) ? final : ''}">${fin(final) ? esc(moneyFull(final)) : '—'}</p>
        <dl class="sc-big-dl">
          <div><dt>Starting wealth, after tax</dt><dd class="num" id="sc-w0">${fin(W0) ? esc(moneyFull(W0)) : '—'}</dd></div>
          <div><dt>Change</dt><dd class="num ${change != null && change < 0 ? 'down' : 'up'}" id="sc-chg">${change == null ? '—' : (change < 0 ? '' : '+') + esc(moneyFull(change))}</dd></div>
        </dl>
        <p class="sc-big-note">${watch ? 'This is The Playbook\'s number, not yours. ' : ''}Counts what the family spent, and takes out the tax you would owe if you sold everything on the last day. The starting figure takes out the tax already built into the shares on day one, so the change shows what the decisions did.${live ? ' The card is still running, so this is a result so far.' : ''}</p>
      </section>
    </div>

    <section class="sc-in sc-measures" style="--i:3" aria-labelledby="sc-m-h">
      <h2 id="sc-m-h">Four measures</h2>
      ${tableHTML(cols)}
    </section>

    <section class="sc-in sc-debrief" style="--i:4" aria-labelledby="sc-d-h">
      <h2 id="sc-d-h">Debrief</h2>
      ${verdict ? `<p class="sc-verdict" id="sc-verdict">${esc(verdict)}</p>` : ''}
      ${watch ? '<p class="sc-watchnote">You watched this run, so “you” below means The Playbook.</p>' : ''}
      ${paras.map((p) => `<p class="sc-para">${esc(p)}</p>`).join('')}
      ${card.blind && card.reveal && card.reveal.text ? `<div class="sc-reveal"><h3>What the card was</h3><p class="sc-para" id="sc-reveal-text">${esc(card.reveal.text)}</p></div>` : ''}
    </section>

    <section class="sc-in sc-ach" style="--i:5" aria-labelledby="sc-a-h">
      <h2 id="sc-a-h">Achievements</h2>
      <p class="sc-ach-lede">${watch ? 'Watching earns none. Achievements come from your own play.' : esc(earnedSet.size ? `${earnedSet.size} earned this run.` : 'None earned this run.')}</p>
      ${forced.length && !watch ? `<div class="sc-lesson" role="note" data-lesson="forced-sale"><h3>A lesson from the bank sale</h3>
        <p>The bank sold ${esc(int(forcedShares))} of your pledged shares at the close${forced.length > 1 ? ` in ${forced.length} sales` : ''}, ignoring the trading window, and each sale was taxed. A loan against one stock lets the bank choose the day, and it chooses the day the price is low. This is a lesson, not a badge.</p></div>` : ''}
      <ul class="sc-medals">${medals}</ul>
    </section>

    <section class="sc-in sc-leaves" style="--i:6" aria-labelledby="sc-l-h">
      <h2 id="sc-l-h">What this replay leaves out</h2>
      <p>This is a simplified model of one stock. It does not include:</p>
      <ul class="sc-leaves-list">${LEAVES_OUT.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>

    <footer class="sc-actions sc-in" style="--i:7">
      ${buttons}
      <button class="btn" type="button" data-action="compare-runs" data-hook="compare-runs" hidden>Compare runs</button>
      <button class="btn" type="button" data-action="copy-share-code" data-hook="copy-share-code" hidden>Copy share code</button>
    </footer>
  </article>`;

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
    };
    if (reduced()) { cert.classList.add('instant'); set(true); }
    else setTimeout(() => { if (cert.isConnected) set(true); }, 650);
    const toggle = () => set(cert.dataset.state !== 'back');
    cert.addEventListener('click', toggle);
    cert.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }
  return () => {};
}

export default { renderScoreboard };
