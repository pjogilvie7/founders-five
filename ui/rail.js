// The dark rail: clock, year bar, window lamp, certificate, cash, net worth, rivals, drawers.
import { art, iconUrl } from './data.js';
import { money, moneyFull, signedMoney, int, esc, dateLabel } from './format.js';
import { canonicalId } from './achievements.js';

export const ACHIEVEMENTS = [
  ['inside-the-window', 'Inside the Window', 'Make your first sale in an open window.'],
  ['cooling-off', 'Cooling Off', 'Get a 10b5-1 plan to go live.'],
  ['through-the-blackout', 'Through the Blackout', 'Have a plan sell while the window is closed.'],
  ['floor-plan', 'Floor Plan', 'Put on your first collar.'],
  ['street-smart', 'Street Smart', 'Open the Street check.'],
  ['cured', 'Cured', 'Meet a margin call with cash.'],
  ['seal-breaker', 'Seal Breaker', 'See every tranche release.'],
  ['diversified', 'Diversified', 'Hold under half of your wealth in the stock.'],
  ['tax-aware', 'Tax Aware', 'Pay less tax than The Seller and end wealthier.'],
  ['beat-the-holder', 'Beat The Holder', 'Finish ahead of The Holder.'],
  ['beat-the-seller', 'Beat The Seller', 'Finish ahead of The Seller.'],
  ['beat-the-playbook', 'Beat The Playbook', 'Finish ahead of The Playbook.'],
];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const RULES = [
  ['Lockup', 'Shares release only on the dates in the prospectus. Locked shares cannot be sold, hedged or pledged.'],
  ['Trading window', 'Closed from 30 days before each earnings release until the second trading day after it.'],
  ['10b5-1 plan', 'Adopted only in an open window. Cooling-off before the first sale: 30 days for an engineer. One plan at a time.'],
  ['Rule 144 (founder)', 'Sales in any three months are capped, and none before IPO day 91.'],
  ['Credit line', 'Borrow up to 25% of pledged value. A call comes above 35%; three business days to cure, then a taxable bank sale.'],
  ['Collar', 'Put at most 90% of today’s price, call at least 110%. Cash-settled at expiry.'],
  ['Tax', '23.8% on gains. Sales cost 0.25%.'],
];

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ROW = 36;

function tween(el, to, fmt, dur = 280) {
  if (el._to === to) return;
  el._to = to;
  if (el._v === undefined || reduced()) { el._v = to; el.textContent = fmt(to); return; }
  const from = el._v, t0 = performance.now();
  cancelAnimationFrame(el._raf);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el._v = from + (to - from) * e; el.textContent = fmt(el._v);
    if (k < 1) el._raf = requestAnimationFrame(step); else el._v = to;
  };
  el._raf = requestAnimationFrame(step);
}
function flash(el, dir, cls = 'flash') {
  if (reduced()) return;
  const now = performance.now();
  if (el._lastFlash && now - el._lastFlash < 1100) return;
  el._lastFlash = now;
  el.classList.remove(cls + '-up', cls + '-down'); void el.offsetWidth;
  el.classList.add(dir > 0 ? cls + '-up' : cls + '-down');
}
const signedFull = (x) => (x > 0.5 ? '+' : '') + moneyFull(Math.abs(x) < 0.5 ? 0 : x);

const SEAL_SVG = (pct) => `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path class="half l" d="M12 2A10 10 0 0 0 12 22L13.5 17.5 10.5 14 13.5 10 10.5 6.5Z"/>
  <path class="half r" d="M12 2A10 10 0 0 1 12 22L13.5 17.5 10.5 14 13.5 10 10.5 6.5Z"/>
  <text x="12" y="15.2" text-anchor="middle" class="pct">${pct}</text></svg>`;

// engraved line icons for the drawer badges (stroke only, inherit colour)
const ICONS = {
  ach: '<svg viewBox="0 0 20 20"><path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z"/></svg>',
  port: '<svg viewBox="0 0 20 20"><path d="M3 6.5h14v9.5H3zM7 6.5V4.5h6v2M3 10.5h14"/></svg>',
  rules: '<svg viewBox="0 0 20 20"><path d="M10 3v13M5 16.5h10M4 6.5h12M4 6.5l-2 5h4zM16 6.5l-2 5h4z"/></svg>',
};

// the hero certificate plate: cut-corner paper with a double engraved rule, a drawdown tint and a hairline crack.
// Drawn on a fixed 308x150 box and stretched to the rail; the CSS decides what shows.
function platesvg(W = 308, H = 150) {
  const cut = (i, c) => `M${i + c} ${i}H${W - i - c}L${W - i} ${i + c}V${H - i - c}L${W - i - c} ${H - i}H${i + c}L${i} ${H - i - c}V${i + c}Z`;
  const dia = (x, y) => `M${x} ${y - 3.2}L${x + 3.2} ${y}L${x} ${y + 3.2}L${x - 3.2} ${y}Z`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" focusable="false">
    <defs>
      <linearGradient id="rc-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:#f8f3e6"/><stop offset=".55" style="stop-color:var(--paper)"/><stop offset="1" style="stop-color:var(--paper-2)"/></linearGradient>
      <linearGradient id="rc-sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="rc-clip"><path d="${cut(1, 14)}"/></clipPath>
    </defs>
    <path class="plate" d="${cut(1, 14)}"/>
    <path class="tint" d="${cut(1, 14)}"/>
    <path class="rule1" d="${cut(6, 10)}"/>
    <path class="rule2" d="${cut(9.5, 7)}"/>
    <path class="gem" d="${dia(W / 2, 6)} ${dia(W / 2, H - 6)} ${dia(6, H / 2)} ${dia(W - 6, H / 2)}"/>
    <path class="crack" d="M236 6L229 26L240 41L227 62L238 79L225 101L233 120L224 144"/>
    <path class="crack c2" d="M240 41L256 50L262 66M227 62L211 70L206 88"/>
    <g clip-path="url(#rc-clip)"><rect class="sheen" x="-90" y="0" width="80" height="${H}" fill="url(#rc-sheen)"/></g>
  </svg>`;
}

export function createRail(el, h) {
  el.innerHTML = `
  <aside class="rail" aria-label="Your position">
    <div class="rail-top">
      <div class="clock-row">
        <div class="clock">
          <span class="clock-card"></span>
          <output class="daylabel">—</output>
        </div>
        <div class="transport" role="group" aria-label="Clock">
          <button class="btn sm pause" data-a="pause" aria-label="Pause"><svg viewBox="0 0 16 16" aria-hidden="true"><g class="ic-pause"><rect x="3.5" y="2.5" width="3" height="11"/><rect x="9.5" y="2.5" width="3" height="11"/></g><path class="ic-play" d="M4 2.5L13 8 4 13.5Z"/></svg></button>
          <span class="speeds"></span>
        </div>
      </div>
      <div class="yearbar" role="progressbar" aria-label="Progress through the card" aria-valuemin="0" aria-valuemax="100"><i class="fill"></i><span class="marks"></span></div>
      <div class="lamp-row"><span class="lamp" aria-hidden="true"></span><span class="lamp-text">Window</span></div>
    </div>
    <div class="rcert" data-dd="0">
      <div class="cert-border" aria-hidden="true">${platesvg()}</div>
      <div class="cert-in">
        <p class="cert-head">Certificate of shares</p>
        <p class="cert-name"></p>
        <div class="cert-vig" aria-hidden="true"></div>
        <p class="cert-shares"><span class="num count">0</span> <span class="u">shares</span></p>
        <div class="seals" role="list"></div>
        <p class="cert-sub num"></p>
        <div class="stamps"></div>
      </div>
    </div>
    <div class="nw">
      <div class="nw-head"><span class="lbl">Net worth</span>
        <span class="seg" role="group" aria-label="Show"><button data-mode="wealth" aria-pressed="true">Wealth</button><button data-mode="profit" aria-pressed="false">Profit</button></span></div>
      <span class="val num nwv">—</span>
      <div class="nw-delta"><i class="nw-arr" aria-hidden="true"></i><span class="num dv">—</span><span class="since">since the start</span></div>
      <div class="cashrow"><span class="lbl">Cash</span><span class="val num cash">—</span></div>
    </div>
    <div class="money">
      <button class="rivals-toggle" aria-expanded="false" aria-controls="rail-more"><span>Rivals</span> <b class="rk"></b></button>
    </div>
    <div class="rail-more" id="rail-more">
      <section class="rivals" aria-label="Rivals"><h3><span class="lbl">Rivals</span> <b class="rank-flag" aria-hidden="true"></b><span class="gapnote">gap to you</span></h3><ol></ol></section>
      <div class="drawers">
      <details class="drawer" data-d="ach"><summary><span class="ico" aria-hidden="true">${ICONS.ach}</span><span class="s-t">Seals</span><span class="cnt"></span></summary><ul class="ach"></ul></details>
      <details class="drawer" data-d="port"><summary><span class="ico" aria-hidden="true">${ICONS.port}</span><span class="s-t">Holdings</span></summary><dl class="port"></dl></details>
      <details class="drawer" data-d="rules"><summary><span class="ico" aria-hidden="true">${ICONS.rules}</span><span class="s-t">Rules</span></summary><dl class="rules">${RULES.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl><p class="more"><a href="#/method">Every rule, with its source</a></p></details>
      </div>
    </div>
  </aside>`;
  const $ = (s) => el.querySelector(s);
  const q = {
    root: $('.rail'), card: $('.clock-card'), day: $('.daylabel'), pause: $('.pause'), speeds: $('.speeds'),
    bar: $('.yearbar'), fill: $('.yearbar .fill'), marks: $('.marks'), lamp: $('.lamp'), lampText: $('.lamp-text'),
    cert: $('.rcert'), vig: $('.cert-vig'), name: $('.cert-name'), count: $('.rcert .count'), sub: $('.cert-sub'), seals: $('.seals'), stamps: $('.stamps'),
    cash: $('.cash'), nw: $('.nwv'), nwLbl: $('.nw .lbl'), dv: $('.nw-delta .dv'), since: $('.nw-delta .since'), arr: $('.nw-arr'), delta: $('.nw-delta'), rivals: $('.rivals ol'), flag: $('.rank-flag'), rk: $('.rivals-toggle .rk'),
    ach: $('.ach'), achCnt: $('[data-d=ach] .cnt'), port: $('.port'), more: $('#rail-more'), drawers: $('.drawers'),
  };
  const sealEls = new Map(), rivalEls = new Map(), markEls = new Map(), stampEls = new Map();
  let last = {}, prevBroken = null, prevRank = null, prevNW = null, prevDelta = null, prevMode = null, prevRanks = new Map(), built = '', prevWinOpen = null, firstUpdate = true;

  // bottom fade on the drawers list only while there is more to scroll to
  const fade = () => { const d = q.drawers; d.classList.toggle('more-below', d.scrollHeight - d.scrollTop - d.clientHeight > 6); };
  q.drawers.addEventListener('scroll', fade, { passive: true });
  q.drawers.addEventListener('toggle', () => requestAnimationFrame(fade), true);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fade) : null;
  ro?.observe(q.drawers);

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'pause') h.onPause();
    else if (b.dataset.speed) h.onSpeed(Number(b.dataset.speed));
    else if (b.dataset.mode) h.onMode(b.dataset.mode);
    else if (b.classList.contains('rivals-toggle')) {
      const o = q.root.classList.toggle('more-open'); b.setAttribute('aria-expanded', String(o));
    }
  });

  // brief state-driven cues on the certificate: a sheen when a tranche breaks, a glow when the rank moves
  function certCue(cls, ms = 1100) {
    if (reduced()) return;
    q.cert.classList.remove(cls); void q.cert.offsetWidth; q.cert.classList.add(cls);
    clearTimeout(q.cert['_' + cls]); q.cert['_' + cls] = setTimeout(() => q.cert.classList.remove(cls), ms);
  }

  function build(v) {
    // (re)build static parts for a new game
    const key = v.gameKey; if (built === key) return; built = key; firstUpdate = true; prevBroken = null; prevRank = null; prevNW = null; prevDelta = null; prevRanks = new Map(); prevWinOpen = null;
    q.card.textContent = v.cardLabel + (v.watch ? ' · watching' : '');
    q.speeds.innerHTML = v.speeds.map((s) => `<button class="btn sm speed" data-speed="${s}" aria-pressed="false" aria-label="Speed ${s}x">${s}x</button>`).join('');
    q.name.textContent = v.certName;
    q.vig.innerHTML = v.vignette ? `<img src="${esc(v.vignette)}" alt="" onerror="this.parentNode.classList.add('nofig');this.remove()">` : '';
    q.vig.classList.toggle('nofig', !v.vignette);
    if (!v.vignette) q.vig.innerHTML = art('rosette', { size: 150, rings: 6, color: '#B08A3E' });
    q.seals.innerHTML = ''; sealEls.clear(); q.seals.classList.remove('in'); void q.seals.offsetWidth; q.seals.classList.add('in');
    for (const t of v.tranches) {
      const s = document.createElement('span'); s.className = 'seal'; s.setAttribute('role', 'listitem'); s.innerHTML = SEAL_SVG(t.void ? '×' : t.pct);
      s.style.setProperty('--i', String(sealEls.size));
      q.seals.appendChild(s); sealEls.set(t.id, s);
    }
    q.marks.innerHTML = ''; markEls.clear();
    for (const t of v.tranches) if (!t.void && t.pos != null) {
      const m = document.createElement('i'); m.style.left = (t.pos * 100).toFixed(2) + '%'; q.marks.appendChild(m); markEls.set(t.id, m);
    }
    q.rivals.innerHTML = ''; rivalEls.clear();
    for (const r of v.rivals) {
      const li = document.createElement('li'); li.dataset.id = r.id; li.className = r.you ? 'you' : '';
      li.innerHTML = `<b class="rk"><span class="n"></span><i class="mv" aria-hidden="true"></i></b><span class="nm">${esc(r.name)}</span><span class="num gap"></span><span class="num w"></span>`;
      q.rivals.appendChild(li); rivalEls.set(r.id, li);
    }
    q.rivals.style.height = v.rivals.length * ROW + 'px';
    q.ach.innerHTML = ACHIEVEMENTS.map(([id, n, d]) => `<li data-id="${id}"><span class="mk" aria-hidden="true"></span><span><b>${esc(n)}</b><small>${esc(d)}</small></span></li>`).join('');
    stampEls.clear(); q.stamps.innerHTML = '';
  }

  function update(v) {
    build(v);
    const s = v.snap;
    if (q.day._t !== s.dayLabel) {
      q.day._t = s.dayLabel;
      const m = /^(\S+) (\d+) of (\d+)(.*)$/.exec(s.dayLabel);
      q.day.setAttribute('aria-label', s.dayLabel);
      q.day.innerHTML = m
        ? `<span class="dk">${esc(m[1])}</span> <b class="dn">${m[2]}</b> <span class="dt">of ${m[3]}</span>${m[4].trim() ? ` <span class="dr">${esc(m[4].replace(/^[\s·]+/, ''))}</span>` : ''}`
        : esc(s.dayLabel);
    }
    q.pause.setAttribute('aria-label', v.running ? 'Pause' : 'Resume');
    q.pause.classList.toggle('paused', !v.running);
    q.root.classList.toggle('is-paused', !v.running);
    q.speeds.querySelectorAll('.speed').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === v.speed)));
    const pct = Math.round(v.progress * 1000) / 10;
    q.fill.style.width = pct + '%'; q.bar.setAttribute('aria-valuenow', Math.round(pct));
    for (const t of v.tranches) { markEls.get(t.id)?.classList.toggle('done', t.released); }
    // lamp
    const w = s.window || {};
    q.lamp.classList.toggle('open', !!w.open);
    q.root.classList.toggle('win-open', !!w.open);
    q.lampText.innerHTML = w.open
      ? `<b>Window open</b>${w.closesOn ? ` until ${esc(dateLabel(v.dctx, w.closesOn))}` : ''}${w.projected ? ' <em>projected</em>' : ''}`
      : `<b>Window closed</b>${w.opensOn ? ` until ${esc(dateLabel(v.dctx, w.opensOn))}` : ''}`;
    if (prevWinOpen === false && w.open && !reduced()) { q.lamp.classList.remove('lit'); void q.lamp.offsetWidth; q.lamp.classList.add('lit'); }
    prevWinOpen = !!w.open;
    // certificate
    const sh = s.shares, locked = sh.locked || 0, free = sh.free || 0;
    const heldN = locked + free + (sh.collared || 0) + (sh.pledged || 0);
    q.count.textContent = int(heldN);
    q.sub.textContent = `${int(free)} free · ${int(locked)} locked`;
    // drawdown tint and crack: a display state only, read off the engine's own since-start profit
    const startW = s.W - s.profit;
    const dd = s.profit < -0.5 ? (startW > 0 && s.profit < -0.1 * startW ? 2 : 1) : 0;
    q.cert.dataset.dd = String(dd);
    const broken = new Set(v.tranches.filter((t) => t.released).map((t) => t.id));
    const nextT = v.tranches.find((t) => !t.released && !t.void);
    for (const t of v.tranches) {
      const e = sealEls.get(t.id); if (!e) continue;
      const isB = broken.has(t.id);
      e.classList.toggle('broken', isB); e.classList.toggle('void', !!t.void); e.classList.toggle('next', !!nextT && nextT.id === t.id);
      e.title = t.void ? `${t.pct}% · never releases` : `${t.pct}% · ${isB ? 'released' : 'releases'} ${dateLabel(v.dctx, t.date)}`;
      e.setAttribute('aria-label', e.title);
      if (isB && prevBroken && !prevBroken.has(t.id) && !reduced()) { e.classList.add('cracking'); setTimeout(() => e.classList.remove('cracking'), 900); certCue('released', 1300); }
    }
    prevBroken = broken;
    const stamps = [];
    if ((sh.collared || 0) > 0 || (s.collars || []).length) stamps.push('Collared');
    if ((sh.pledged || 0) > 0 || (s.loan && s.loan.balance > 0)) stamps.push('Pledged');
    if (s.plan) stamps.push(s.plan.live === false ? 'Cooling off' : 'On plan');
    const key = stamps.join('|');
    if (q.stamps.dataset.k !== key) {
      q.stamps.dataset.k = key;
      q.stamps.innerHTML = stamps.map((t) => `<span class="stamp s-${slug(t)}${stampEls.has(t) ? '' : ' new'}">${esc(t)}</span>`).join('');
      stampEls.clear(); stamps.forEach((t) => stampEls.set(t, 1));
      q.cert.dataset.stamped = String(stamps.length);
    }
    // money
    tween(q.cash, s.cash, moneyFull);
    const nwv = v.mode === 'profit' ? s.profit : s.W;
    if (prevMode !== v.mode) { prevNW = null; prevDelta = null; prevMode = v.mode; }
    q.nwLbl.textContent = v.mode === 'profit' ? 'Profit' : 'Net worth';
    el.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === v.mode)));
    tween(q.nw, nwv, v.mode === 'profit' ? signedFull : moneyFull);
    q.nw.classList.toggle('pos', v.mode === 'profit' && nwv > 0.5);
    q.nw.classList.toggle('neg', v.mode === 'profit' && nwv < -0.5);
    if (prevNW != null && Math.abs(nwv - prevNW) > Math.abs(prevNW) * 0.0004) flash(q.nw, nwv - prevNW);
    prevNW = nwv;
    // since-start delta (the engine's own profit figure); in profit mode the line gives the wealth instead
    const dlt = v.mode === 'profit' ? s.W : s.profit;
    tween(q.dv, dlt, v.mode === 'profit' ? moneyFull : signedFull);
    q.since.textContent = v.mode === 'profit' ? 'net worth' : 'since the start';
    const dir = v.mode === 'profit' ? 0 : (s.profit > 0.5 ? 1 : s.profit < -0.5 ? -1 : 0);
    q.delta.dataset.dir = String(dir);
    if (prevDelta != null && dir !== 0 && Math.abs(dlt - prevDelta) > 0.5) flash(q.delta, dlt - prevDelta, 'tick');
    prevDelta = dlt;
    // rivals
    const sorted = [...v.rivals].sort((a, b) => b.W - a.W);
    const youW = (v.rivals.find((r) => r.you) || {}).W;
    const level = v.rivals.every((r) => r.you || Math.abs(r.W - youW) < 0.5);
    q.root.classList.toggle('all-level', level);
    q.root.querySelector('.gapnote').textContent = level ? 'level at start' : 'gap to you';
    sorted.forEach((r, k) => {
      const li = rivalEls.get(r.id); if (!li) return;
      li.style.transform = `translateY(${k * ROW}px)`;
      li.querySelector('.rk .n').textContent = k + 1;
      const gap = li.querySelector('.gap'), w = li.querySelector('.w');
      w.textContent = money(r.W);
      if (r.you) { gap.textContent = ''; gap.className = 'num gap'; }
      else {
        const d = r.W - youW;
        gap.textContent = Math.abs(d) < 0.5 ? (level ? '' : 'level') : signedMoney(d, { compact: true });
        gap.className = 'num gap ' + (Math.abs(d) < 0.5 ? 'lv' : d > 0 ? 'ahead' : 'behind');
        gap.setAttribute('aria-label', Math.abs(d) < 0.5 ? 'Level with you' : (d > 0 ? 'Ahead of you by ' : 'Behind you by ') + moneyFull(Math.abs(d)));
        gap.title = d > 0 ? 'Ahead of you' : d < 0 ? 'Behind you' : 'Level with you';
      }
      const was = prevRanks.get(r.id), mv = li.querySelector('.mv');
      if (was != null && was !== k && !firstUpdate) {
        mv.dataset.d = k < was ? 'up' : 'down';
        clearTimeout(mv._t); mv._t = setTimeout(() => { delete mv.dataset.d; }, 4500);
        if (!reduced()) { li.classList.remove('moved'); void li.offsetWidth; li.classList.add('moved'); }
      }
      prevRanks.set(r.id, k);
    });
    const you = sorted.findIndex((r) => r.you) + 1;
    q.rk.textContent = `${you}${['st', 'nd', 'rd', 'th'][Math.min(you, 4) - 1]}`;
    if (prevRank != null && you !== prevRank && !firstUpdate) {
      q.flag.textContent = you < prevRank ? '▲ up' : '▼ down';
      q.flag.className = 'rank-flag show ' + (you < prevRank ? 'up' : 'down');
      certCue(you < prevRank ? 'pulse-up' : 'pulse-down', 1400);
      clearTimeout(q.flag._t); q.flag._t = setTimeout(() => { q.flag.className = 'rank-flag'; }, 2200);
    }
    prevRank = you;
    // achievements
    const earned = new Set([...(v.achievements || [])].map((x) => canonicalId(x) || slug(x)));
    let n = 0;
    q.ach.querySelectorAll('li').forEach((li) => { const on = earned.has(canonicalId(li.dataset.id) || li.dataset.id); if (on) n++; li.classList.toggle('on', on); });
    const cntKey = `${n}/${ACHIEVEMENTS.length}`;
    if (q.achCnt.dataset.k !== cntKey) {
      q.achCnt.dataset.k = cntKey;
      q.achCnt.classList.toggle('has', n > 0);
      q.achCnt.innerHTML = `<span class="vh">${n} of ${ACHIEVEMENTS.length} achievements unlocked</span><span aria-hidden="true">${cntKey}</span>`;
    }
    // portfolio
    const rows = [
      ['Share price', `$${s.close.toFixed(2)}`], ['Locked', int(locked)], ['Free', int(free)], ['Collared', int(sh.collared || 0)], ['Pledged', int(sh.pledged || 0)], ['Sold', int(sh.sold || 0)],
      ['Index fund', money(s.index.value)], ['Cash', money(s.cash)], ['Loan', s.loan.balance ? money(-s.loan.balance) : '$0'],
      ['Tax owed, unpaid', s.taxOwed ? money(-s.taxOwed) : '$0'], ['Net worth', money(s.W)],
    ];
    const html = rows.map(([a, b]) => `<dt>${a}</dt><dd class="num">${b}</dd>`).join('');
    if (q.port._h !== html) { q.port._h = html; q.port.innerHTML = html; }
    firstUpdate = false;
    fade();
  }
  return { update, el: q.root, destroy() { ro?.disconnect(); cancelAnimationFrame(q.cash._raf); cancelAnimationFrame(q.nw._raf); } };
}
