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
  ['cured', 'Cured', 'Meet a maintenance call by posting cash.'],
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
  ['Credit line', 'Borrow up to 25% of pledged value. A call comes above 35%. You have three trading days to post cash; the bank sells at the close of the fourth, and the sale is taxable.'],
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

// engraved medallions for the Seals drawer: a ringed coin like the certificate's tranche tokens, one line glyph per seal
const GLYPHS = {
  'inside-the-window': '<rect x="22" y="20" width="20" height="22" rx="1.5"/><path d="M32 20v22M22 31h20M19.5 46h25"/>',
  'cooling-off': '<path d="M25 19h14M25 45h14M26 19v4l6 9-6 9v4M38 19v4l-6 9 6 9v4"/>',
  'through-the-blackout': '<path d="M38 19A13 13 0 1 0 45 38A10.5 10.5 0 0 1 38 19Z"/><path d="M43 22.5v.1M46.5 28v.1"/>',
  'floor-plan': '<path d="M21 21h22M21 43h22M25 38l5-6 4 3 6-10"/>',
  'street-smart': '<circle cx="29" cy="29" r="9"/><path d="M35.5 35.5L45 45M25 29h8"/>',
  'cured': '<ellipse cx="32" cy="23" rx="10" ry="3.5"/><path d="M22 23v6c0 2 4.5 3.5 10 3.5s10-1.5 10-3.5v-6M22 29v6c0 2 4.5 3.5 10 3.5s10-1.5 10-3.5v-6M22 35v6c0 2 4.5 3.5 10 3.5s10-1.5 10-3.5v-6"/>',
  'seal-breaker': '<g transform="translate(-3 1)"><path d="M30 20A12 12 0 0 0 30 44L32.5 38 28 32 32.5 26Z"/></g><g transform="translate(3 -1)"><path d="M34 20A12 12 0 0 1 34 44L31.5 38 36 32 31.5 26Z"/></g>',
  'diversified': '<g transform="translate(2 -2)"><path d="M32 32V20A12 12 0 0 1 42.4 38Z"/></g><path d="M32 32L42.4 38A12 12 0 1 1 32 20Z"/>',
  'tax-aware': '<rect x="23" y="19" width="18" height="26" rx="1.5"/><path d="M28 19v26M32 26h6M32 31h6M32 36h4"/>',
  'beat-the-holder': '<circle cx="32" cy="24" r="4.5"/><path d="M28 31h8M29 31c0 6-3 8-4 12h14c-1-4-4-6-4-12M23 46h18"/>',
  'beat-the-seller': '<path d="M24 20v8h16v-8h-3v3h-3v-3h-4v3h-3v-3ZM26 28v13M38 28v13M23 41h18v4H23Z"/>',
  'beat-the-playbook': '<circle cx="32" cy="20" r="2"/><path d="M32 23c-5 4-7 8-5 12 1 2 3 3 5 3s4-1 5-3c2-4 0-8-5-12ZM33 27l-3 5M28 42h8M25 46h14"/>',
};
const MEDAL = (id) => `<svg class="medal" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <circle class="m-rim" cx="32" cy="32" r="29.5"/><circle class="m-dots" cx="32" cy="32" r="27"/><circle class="m-ring" cx="32" cy="32" r="23.5"/>
  <g class="m-glyph">${GLYPHS[id] || ''}</g></svg>`;

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
    <path class="crack" d="M296 12L291 30L299 46L289 66L298 84L288 104L296 122L289 140"/>
    <path class="crack c2" d="M299 46L303 58M289 66L281 74L283 88"/>
    <g clip-path="url(#rc-clip)"><rect class="sheen" x="-90" y="0" width="80" height="${H}" fill="url(#rc-sheen)"/></g>
  </svg>`;
}

// one drawer: a tile in the strip plus a panel that, on a wide screen, slides out over the main pane
const drawer = (id, title, icon, cnt, sub, body) => `<details class="drawer" data-d="${id}"><summary><span class="ico" aria-hidden="true">${icon}</span><span class="s-t">${title}</span>${cnt}</summary>
        <div class="dpanel" tabindex="-1" role="region" aria-label="${title}"><div class="dp-head"><h3>${title}</h3>${sub}<button type="button" class="dp-close" aria-label="Close ${title}"></button></div><div class="dp-body">${body}</div></div></details>`;

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
      <section class="rivals" aria-label="Rivals"><h3><span class="lbl">Rivals</span> <b class="rank-flag" aria-hidden="true"></b><span class="gapnote">value · gap</span></h3><ol></ol></section>
      <div class="drawers">
      ${drawer('ach', 'Seals', ICONS.ach, '<span class="cnt"></span>', '', `<div class="sp"><div class="sp-bar" role="progressbar" aria-label="Seals earned" aria-valuemin="0" aria-valuemax="${ACHIEVEMENTS.length}"><i></i></div><p class="sp-n num"><b>0</b> of ${ACHIEVEMENTS.length}</p></div><div class="sd" aria-live="polite"><span class="sd-k"></span><b class="sd-t"></b><span class="sd-d"></span></div><ul class="ach"></ul>`)}
      ${drawer('port', 'Holdings', ICONS.port, '', '', '<dl class="port"></dl>')}
      ${drawer('rules', 'Rules', ICONS.rules, '', '', `<dl class="rules">${RULES.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl><p class="more"><a href="#/method">Every rule, with its source</a></p>`)}
      </div>
    </div>
  </aside>`;
  const $ = (s) => el.querySelector(s);
  const q = {
    root: $('.rail'), card: $('.clock-card'), day: $('.daylabel'), pause: $('.pause'), speeds: $('.speeds'),
    bar: $('.yearbar'), fill: $('.yearbar .fill'), marks: $('.marks'), lamp: $('.lamp'), lampText: $('.lamp-text'),
    cert: $('.rcert'), vig: $('.cert-vig'), name: $('.cert-name'), count: $('.rcert .count'), sub: $('.cert-sub'), seals: $('.seals'), stamps: $('.stamps'),
    cash: $('.cash'), nw: $('.nwv'), nwLbl: $('.nw .lbl'), dv: $('.nw-delta .dv'), since: $('.nw-delta .since'), arr: $('.nw-arr'), delta: $('.nw-delta'), rivals: $('.rivals ol'), flag: $('.rank-flag'), rk: $('.rivals-toggle .rk'),
    ach: $('.ach'), achCnt: $('[data-d=ach] .cnt'), spBar: $('.sp-bar'), spFill: $('.sp-bar i'), spN: $('.sp-n'), sdK: $('.sd-k'), sdT: $('.sd-t'), sdD: $('.sd-d'), port: $('.port'), drawers: $('.drawers'),
  };
  const sealEls = new Map(), rivalEls = new Map(), markEls = new Map(), stampEls = new Map();
  let last = {}, prevEarned = null, hoverSeal = null, nextSeal = null, prevBroken = null, prevRank = null, prevNW = null, prevDelta = null, prevMode = null, prevRanks = new Map(), built = '', prevWinOpen = null, firstUpdate = true;

  // drawers: on a wide screen only one is open, it takes focus, Escape or a click outside closes it and focus goes back to its tile
  const wide = () => matchMedia('(min-width: 900px)').matches;
  const drawerEls = [...q.drawers.querySelectorAll('.drawer')];
  let openD = null;
  const closeDrawer = (d, refocus) => { d.open = false; if (refocus) d.querySelector('summary').focus({ preventScroll: true }); };
  q.drawers.addEventListener('toggle', (e) => {
    const d = e.target; if (!d.classList?.contains('drawer')) return;
    if (d.open) {
      if (wide()) { for (const o of drawerEls) if (o !== d && o.open) o.open = false; requestAnimationFrame(() => d.querySelector('.dpanel').focus({ preventScroll: true })); }
      openD = d;
    } else if (openD === d) openD = null;
  }, true);
  // details line: the seal under the pointer or focus, otherwise the next one to earn
  const showSeal = () => {
    const li = hoverSeal || nextSeal, a = li && ACHIEVEMENTS.find((x) => x[0] === li.dataset.id);
    if (!a) { q.sdK.textContent = 'All earned'; q.sdT.textContent = 'Every seal is yours.'; q.sdD.textContent = ''; return; }
    q.sdK.textContent = hoverSeal ? (li.classList.contains('on') ? 'Earned' : 'Not yet earned') : 'Next seal';
    q.sdT.textContent = a[1]; q.sdD.textContent = a[2];
  };
  const pick = (e) => { const li = e.target.closest?.('.ach li'); if (li) { hoverSeal = li; showSeal(); } };
  const unpick = (e) => { if (!e.target.closest?.('.ach li')) return; hoverSeal = null; showSeal(); };
  q.ach.addEventListener('pointerover', pick); q.ach.addEventListener('focusin', pick);
  q.ach.addEventListener('pointerout', unpick); q.ach.addEventListener('focusout', unpick);
  q.drawers.addEventListener('click', (e) => { const c = e.target.closest('.dp-close'); if (c) closeDrawer(c.closest('.drawer'), true); });
  const onKey = (e) => { if (e.key === 'Escape' && openD && wide() && !e.defaultPrevented) { e.preventDefault(); closeDrawer(openD, true); } };
  const onDown = (e) => { if (openD && wide() && !e.target.closest('.drawers')) closeDrawer(openD, false); };
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onDown);

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
    const key = v.gameKey; if (built === key) return; built = key; firstUpdate = true; prevBroken = null; prevRank = null; prevNW = null; prevDelta = null; prevRanks = new Map(); prevWinOpen = null; for (const d of drawerEls) d.open = false;
    for (const d of drawerEls) d.open = false;
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
      li.innerHTML = `<b class="rk"><span class="n"></span><i class="mv" aria-hidden="true"></i></b><span class="nm">${esc(r.name)}</span><span class="num w"></span><span class="num gap">${r.you ? 'you' : ''}</span>`;
      q.rivals.appendChild(li); rivalEls.set(r.id, li);
    }
    q.rivals.style.height = v.rivals.length * ROW + 'px';
    q.ach.innerHTML = ACHIEVEMENTS.map(([id, n, d]) => `<li data-id="${id}" tabindex="0">${MEDAL(id)}<b>${esc(n)}</b><span class="vh">${esc(d)}. <i class="st">Not yet earned</i></span></li>`).join('');
    prevEarned = null; hoverSeal = null;
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
      if (!firstUpdate && !reduced()) q.day.querySelector('.dn')?.classList.add('bump');
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
    sorted.forEach((r, k) => {
      const li = rivalEls.get(r.id); if (!li) return;
      li.style.transform = `translateY(${k * ROW}px)`;
      li.querySelector('.rk .n').textContent = k + 1;
      const gap = li.querySelector('.gap'), w = li.querySelector('.w');
      w.textContent = money(r.W);
      if (r.you) { gap.className = 'num gap me'; }
      else {
        const d = r.W - youW;
        gap.textContent = Math.abs(d) < 0.5 ? 'level' : signedMoney(d, { compact: true });
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
    let n = 0, firstOff = null;
    const nowEarned = new Set();
    q.ach.querySelectorAll('li').forEach((li) => {
      const id = li.dataset.id, on = earned.has(canonicalId(id) || id);
      if (on) { n++; nowEarned.add(id); } else if (!firstOff) firstOff = li;
      const was = li.classList.contains('on');
      li.classList.toggle('on', on);
      li.querySelector('.st').textContent = on ? 'Earned' : 'Not yet earned';
      if (on && !was && prevEarned && !reduced()) { li.classList.remove('won'); void li.offsetWidth; li.classList.add('won'); setTimeout(() => li.classList.remove('won'), 1200); }
    });
    prevEarned = nowEarned; nextSeal = firstOff;
    q.spFill.style.width = (n / ACHIEVEMENTS.length * 100) + '%';
    q.spBar.setAttribute('aria-valuenow', String(n));
    q.spN.innerHTML = `<b>${n}</b> of ${ACHIEVEMENTS.length}`;
    showSeal();
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
  }
  return { update, el: q.root, destroy() { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); cancelAnimationFrame(q.cash._raf); cancelAnimationFrame(q.nw._raf); } };
}
