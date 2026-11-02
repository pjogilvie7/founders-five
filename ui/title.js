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
  el.innerHTML = `
    <section class="title" aria-labelledby="t-h">
      <div class="title-wave" aria-hidden="true">${art('securityWave', { width: 1200, height: 300, lines: 30, color: '#2C4352' })}</div>
      <div class="title-inner">
        <div class="medallion" aria-hidden="true">
          <div class="med-rosette">${art('rosette', { size: 360, rings: 8, color: '#B08A3E', stroke: 0.5 })}</div>
          <div class="med-ring">${art('sealRing', { size: 360, color: '#8c6d31' })}</div>
          ${man && typeof man.title === 'string' ? `<img class="med-art" src="${esc(man.title)}" alt="" onerror="this.remove()">` : `<div class="med-mark">F<span>5</span></div>`}
        </div>
        <h1 id="t-h">Founder’s Five</h1>
        <p class="sub">A concentrated-stock replay</p>
        <p class="lede">You own $100 million of one stock. You can’t sell it yet.</p>
        <p class="lede2">Replay a real IPO with the tools a private bank offers: staged sales, a 10b5-1 plan, a collar, a loan. Scored on Sharpe ratio, max drawdown and after-tax IRR.</p>
        ${boot.status === 'error' ? `
          <div class="alert err" role="alert"><p>Prices could not load. Reload, or open the Method page.</p>
          <div class="row"><button class="btn primary" data-a="retry">Try again</button><a class="btn" href="#/method">Method</a></div></div>` : `
        <div class="actions">
          <button class="btn primary" data-a="spcx" ${ready ? '' : 'disabled'}>Play SpaceX (live)</button>
          <button class="btn" data-a="blind" ${blindAvailable ? '' : 'disabled title="Blind cards arrive with the next data update."'}>Deal a blind IPO</button>
          <button class="btn" data-a="watch" ${ready ? '' : 'disabled'}>Watch a finished run</button>
        </div>`}
        <p class="strip${ready ? '' : ' loading'}" id="t-strip" role="status">${
          ready ? `Prices through ${fullDate(meta.asOf)} close · updated nightly · SpaceX card: ${meta.spcxTradingDays} trading days`
          : boot.status === 'error' ? '' : 'Loading prices…'}</p>
        ${ready && staleInfo(meta) ? `<p class="strip stale" role="status">${esc(staleInfo(meta))}</p>` : ''}
        ${ready && boot.data.meta.mock ? `<p class="strip mock">Mock data: the data job has not run yet.</p>` : ''}
        <p class="disclaimer">A historical replay for education. Not investment, tax or legal advice, and not a view on any stock today.</p>
      </div>
    </section>`;
  const med = el.querySelector('.medallion');
  if (med && !drawn) { drawIn(med.querySelector('.med-rosette svg'), 70); drawIn(med.querySelector('.med-ring svg'), 20); }
  if (ready || boot.status === 'error') drawn = true;
  // If the guilloche module lands after first paint, quietly swap it in on the next render.
  if (!man) loadArt().then(() => {}); loadGuilloche();
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a) ctx.onAction(a);
  });
  el.querySelector('.actions .btn:not([disabled])')?.focus({ preventScroll: true });
  return () => {};
}
