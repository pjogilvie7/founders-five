// Title screen (PRD 5.2): medallion that draws in, copy, three buttons, data strip, loading / stale / error states.
import { art, loadArt, loadGuilloche, artManifest } from './data.js';
import { fullDate, daysBetween, todayISO, esc } from './format.js';

export function drawIn(svgRoot, step = 90) {
  const els = svgRoot.querySelectorAll('path,circle,line,ellipse,rect,polyline,polygon');
  els.forEach((e, k) => { e.setAttribute('pathLength', '1'); e.style.setProperty('--i', Math.min(k, 40)); e.style.setProperty('--step', step + 'ms'); });
  svgRoot.classList.add('draw');
}

export function staleInfo(meta) {
  if (!meta || !meta.asOf) return null;
  const age = daysBetween(meta.asOf, todayISO());
  return age > 4 ? `The nightly update has not run since ${fullDate(meta.asOf)}. Prices may be out of date.` : null;
}

let drawn = false;
export function renderTitle(el, ctx) {
  const { boot } = ctx;
  const ready = boot.status === 'ready';
  const meta = ready ? boot.data.meta : null;
  const blindAvailable = ready && boot.data.cardsIndex.some((c) => c.blind);
  const man = artManifest();
  const medal = man && typeof man.title === 'string'
    ? `<img class="tc-medal" src="${esc(man.title)}" alt="" onerror="this.remove()">`
    : `<div class="tc-mark">F<span>5</span></div>`;
  el.innerHTML = `
    <section class="title" aria-labelledby="t-h">
      <div class="title-wave" aria-hidden="true">${art('securityWave', { width: 1200, height: 300, lines: 30, color: '#2C4352' })}</div>
      <div class="title-inner">
        <header class="t-head">
          <h1 id="t-h">Founder’s Five</h1>
          <p class="sub">A concentrated-stock replay</p>
          <p class="lede">You own $100 million of one stock. You can’t sell it yet.</p>
        </header>
        <div class="t-hero" role="img" aria-label="A share certificate for $100,000,000, held under an IPO lockup">
          <div class="hero-rosette medallion" aria-hidden="true">${art('rosette', { size: 520, rings: 8, color: '#B08A3E', stroke: 0.5 })}</div>
          <div class="tc" aria-hidden="true">
            <div class="tc-frame">${art('certificateBorder', { width: 640, height: 420, color: '#8c6d31' })}</div>
            <div class="tc-body">
              <div class="tc-plate">${medal}</div>
              <div class="tc-text">
                <p class="tc-kicker">Share certificate</p>
                <p class="tc-amt num">$100,000,000</p>
                <p class="tc-sub">One stock · under lockup</p>
                <svg class="tc-trace" viewBox="0 0 120 26" preserveAspectRatio="none" fill="none"><path pathLength="1" d="M0 18 L10 16 L18 20 L27 13 L36 15 L45 9 L53 12 L62 7 L71 11 L80 6 L90 9 L100 4 L110 7 L120 3"/><circle cx="120" cy="3" r="2.2"/></svg>
              </div>
            </div>
            <div class="tc-seal"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><circle cx="12" cy="15.2" r="1.1" fill="currentColor" stroke="none"/></svg></div>
          </div>
        </div>
        <div class="t-rest">
          <p class="lede2">Replay a real IPO with the tools a private bank offers: staged sales, a 10b5-1 plan, a collar, a loan. Scored on Sharpe ratio, max drawdown and after-tax IRR.</p>
          ${boot.status === 'error' ? `
          <div class="alert err" role="alert"><p>Prices could not load. Reload, or open the Method page.</p>
          <div class="row"><button class="btn primary" data-a="retry">Try again</button><a class="btn" href="#/method">Method</a></div></div>` : `
          <div class="actions">
            <button class="btn primary" data-a="spcx" ${ready ? '' : 'disabled'}>Play SpaceX (live)</button>
            <div class="alt">
              <button class="btn quiet watch" data-a="watch" ${ready ? '' : 'disabled'}>Watch a finished run</button>
              <button class="btn quiet" data-a="blind" ${blindAvailable ? '' : 'disabled title="Blind cards arrive with the next data update."'}>Deal a blind IPO</button>
            </div>
          </div>`}
          <p class="strip${ready ? '' : ' loading'}" id="t-strip" role="status">${
            ready ? `Prices through ${fullDate(meta.asOf)} close · updated nightly · SpaceX card: ${meta.spcxTradingDays} trading days`
            : boot.status === 'error' ? '' : 'Loading prices…'}</p>
          ${ready && staleInfo(meta) ? `<p class="strip stale" role="status">${esc(staleInfo(meta))}</p>` : ''}
          ${ready && boot.data.meta.mock ? `<p class="strip mock">Mock data: the data job has not run yet.</p>` : ''}
          <p class="disclaimer">A historical replay for education. Not investment, tax or legal advice, and not a view on any stock today.</p>
        </div>
      </div>
    </section>`;
  const hero = el.querySelector('.t-hero');
  if (hero && !drawn) { drawIn(hero.querySelector('.hero-rosette svg'), 60); drawIn(hero.querySelector('.tc-frame svg'), 12); }
  if (ready || boot.status === 'error') drawn = true;
  // If the guilloche module lands after first paint, quietly swap it in on the next render.
  if (!man) loadArt().then(() => {}); loadGuilloche();
  if (el._titleClick) el.removeEventListener('click', el._titleClick);
  el._titleClick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a) ctx.onAction(a);
  };
  el.addEventListener('click', el._titleClick);
  // The certificate leans toward the pointer a few degrees; skipped for touch and reduced motion.
  const cert = el.querySelector('.tc');
  const still = matchMedia('(prefers-reduced-motion: reduce), (hover: none)').matches;
  const lean = (e) => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    cert.style.setProperty('--ry', (x * 7).toFixed(2) + 'deg');
    cert.style.setProperty('--rx', (-y * 5).toFixed(2) + 'deg');
  };
  const rest = () => { cert.style.removeProperty('--ry'); cert.style.removeProperty('--rx'); };
  if (cert && hero && !still) { hero.addEventListener('pointermove', lean); hero.addEventListener('pointerleave', rest); }
  el.querySelector('.actions .btn:not([disabled])')?.focus({ preventScroll: true });
  return () => {};
}
