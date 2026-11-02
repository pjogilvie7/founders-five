// Intro stage shown before the clock starts: five short slides, each with its own drawn illustration.
// The slide mechanics (focus trap, Escape, arrow keys, Enter, inert root) come from showLesson; this file
// turns that dialog into a full-bleed stage and swaps an illustration in for every slide.
import { showLesson } from './lesson.js';
import { art, artManifest } from './data.js';

export const INTRO_CARDS = [
  { title: 'Time runs', cap: 'The needle sweeps and a trading day is gone.', body: 'Each tick is one trading day of the real record. Press Space to pause, and speed up when you are ready.' },
  { title: 'Your shares unlock', cap: 'Each seal has a date. Then it cracks.', body: 'Your $100 million is locked. Shares become free on the dates in the prospectus, and the seals on your certificate break one by one.' },
  { title: 'The trading window', cap: 'A door that opens on the company’s schedule.', body: 'You can sell free shares only while the trading window is open. When it closes, the sellable count drops to zero.' },
  { title: 'Your family spends', cap: 'Every month opens with the same withdrawal.', body: 'Your family spends $2 million a year, taken on the first trading day of each month.' },
  { title: 'Three rivals', cap: 'Same card, same days, three different nerves.', body: 'The Holder, The Seller and The Playbook play the same card. Their results show live in the rail.' },
];

const INK = '#18262F', PAPER = '#F8F4E8', PAPER2 = '#E8E0CC', LINE = '#D9CEB4', GOLD = '#B08A3E', SEAL = '#9C2A23', GOOD = '#2F6B4F', MUTED = '#5B6870';

const ticks = (n, r1, r2, every, rLong) => {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), si = Math.sin(a), r = i % every === 0 ? rLong : r2;
    s += `<line x1="${(c * r1).toFixed(1)}" y1="${(si * r1).toFixed(1)}" x2="${(c * r).toFixed(1)}" y2="${(si * r).toFixed(1)}"/>`;
  }
  return s;
};
const padlock = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M-5 -1V-4a5 5 0 0 1 10 0V-1"/><rect x="-7.5" y="-1" width="15" height="11" fill="${c}" fill-opacity=".18"/></g>`;
const openLock = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M-5 -1V-4a5 5 0 0 1 9-3"/><rect x="-7.5" y="-1" width="15" height="11" fill="${c}" fill-opacity=".18"/></g>`;
const T = (x, y, txt, cls = 'si-num', anchor = 'start', fill = INK, size = 11) => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}" fill="${fill}" font-size="${size}">${txt}</text>`;

/* Every plate is drawn on a 440 x 340 sheet. Phones crop the side margins (see VIEW) so the art fills a taller, narrower plate.
   Each plate has a "hold" state that already looks mid-action, so a screenshot or a reduced-motion reader still sees it alive;
   the motion itself is CSS (see seat-intro.css), except the rivals race which is a small rAF loop. */
const VIEW = { wide: '0 0 440 340', phone: '24 -22 392 384' };
const isPhone = () => window.matchMedia('(max-width:899px)').matches;
const still = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;
const pt = (r, a) => `${(r * Math.sin(a * Math.PI / 180)).toFixed(1)} ${(-r * Math.cos(a * Math.PI / 180)).toFixed(1)}`;
const wedge = (r, a0, a1, o) => `<path d="M0 0 L${pt(r, a0)} A${r} ${r} 0 0 1 ${pt(r, a1)}Z" fill="${SEAL}" fill-opacity="${o}"/>`;

/* ---- 1. the clock ---- */
const clock = () => `
  <g transform="translate(124 148)">
    <circle r="96" fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/>
    <circle r="89" fill="none" stroke="${GOLD}" stroke-width="1"/>
    <g stroke="${INK}" stroke-width="1">${ticks(60, 82, 77, 5, 70)}</g>
    <g stroke="${LINE}" stroke-width=".7" fill="none"><circle r="54"/><circle r="45"/><circle r="36"/></g>
    ${T(0, 44, 'TRADING', 'si-disp', 'middle', MUTED, 11)}${T(0, 64, 'DAY', 'si-disp', 'middle', INK, 19)}
    <g class="si-hand">
      ${[0, 1, 2, 3, 4, 5, 6].map((k) => wedge(74, -(k + 1) * 11, -k * 11, (.3 - k * .042).toFixed(3))).join('')}
      <line x1="0" y1="8" x2="0" y2="-70" stroke="${SEAL}" stroke-width="2.8" stroke-linecap="round"/>
    </g>
    <circle r="6.5" fill="${INK}"/><circle r="2.4" fill="${GOLD}"/>
  </g>
  <g transform="translate(246 82)">
    ${T(0, 0, 'SPEED', 'si-disp', 'start', MUTED, 12)}
    <g transform="translate(0 10)">
      <rect width="44" height="44" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>
      <path d="M16 11 34 22 16 33Z" fill="${SEAL}"/>
      <g transform="translate(52 0)">
        <rect width="118" height="44" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>
        <rect class="si-spd" x="2" y="2" width="38" height="40" fill="${INK}"/>
        <g class="si-num" font-size="15" text-anchor="middle" font-weight="600">
          <text x="21" y="28" class="si-t1">1x</text><text x="59" y="28" class="si-t2">2x</text><text x="97" y="28" class="si-t4">4x</text>
        </g>
      </g>
    </g>
  </g>
  <g transform="translate(246 168)">
    ${T(0, 0, 'DAY TRACKER', 'si-disp', 'start', MUTED, 12)}
    <rect class="si-track" x="0" y="43" width="170" height="7" fill="${GOLD}"/>
    <line x1="0" y1="50" x2="170" y2="50" stroke="${INK}" stroke-width="1.4"/>
    <g stroke="${INK}" stroke-width="1">${Array.from({ length: 22 }, (_, i) => `<line x1="${i * 7.8 + 0.5}" y1="${i % 5 === 0 ? 40 : 45}" x2="${i * 7.8 + 0.5}" y2="50"/>`).join('')}</g>
    <g class="si-flag"><path d="M0 50V22" stroke="${SEAL}" stroke-width="2.2"/><path d="M0 22h16l-4.500 5 4.500 5H0Z" fill="${SEAL}"/><circle cy="50" r="4.500" fill="${SEAL}"/></g>
  </g>
  <line x1="44" y1="268" x2="396" y2="268" stroke="${GOLD}" stroke-width="1"/>
  <g transform="translate(112 284)">
    <rect x="0" y="4" width="84" height="26" rx="4" fill="${INK}"/>
    <g class="si-key"><rect x="0" y="0" width="84" height="26" rx="4" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>${T(42, 17.500, 'SPACE', 'si-num', 'middle', INK, 12)}</g>
    ${T(98, 21, 'PAUSES THE CLOCK', 'si-disp', 'start', MUTED, 13)}
  </g>`;

/* ---- 2. the certificate ---- */
const certificate = () => {
  const xs = [92, 156, 220, 284, 348];
  const shards = Array.from({ length: 10 }, (_, i) => { const a = i * 36 + 10; return `<line x1="${(Math.cos(a * Math.PI / 180) * 30).toFixed(1)}" y1="${(Math.sin(a * Math.PI / 180) * 30).toFixed(1)}" x2="${(Math.cos(a * Math.PI / 180) * 42).toFixed(1)}" y2="${(Math.sin(a * Math.PI / 180) * 42).toFixed(1)}"/>`; }).join('');
  return `
  <rect x="34" y="26" width="372" height="290" fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/>
  <rect x="43" y="35" width="354" height="272" fill="none" stroke="${GOLD}" stroke-width="1"/>
  <g stroke="${LINE}" stroke-width=".8" fill="none">${Array.from({ length: 9 }, (_, i) => `<path d="M46 ${236 + i * 3}c50 -10 100 10 150 0s90 -10 140 0 40 6 60 0"/>`).join('')}</g>
  ${T(220, 80, 'CERTIFICATE OF SHARES', 'si-disp', 'middle', INK, 21)}
  <line x1="120" y1="92" x2="320" y2="92" stroke="${GOLD}" stroke-width="1.2"/>
  ${T(220, 114, 'One seal for each release date', 'si-body', 'middle', MUTED, 13)}
  ${xs.map((x, k) => `
    <g transform="translate(${x} 182)" class="si-seal${k < 2 ? ' is-open' : ''}" style="--k:${k}">
      <circle r="28" fill="none" stroke="${GOLD}" stroke-width="1" stroke-dasharray="2 3"/>
      <g class="si-burst" stroke="${GOLD}" stroke-width="2" stroke-linecap="round">${shards}</g>
      <g class="si-lockd"><circle r="23" fill="${SEAL}" stroke="#5e1712" stroke-width="1"/><circle r="18" fill="none" stroke="#c9605a" stroke-width="1" stroke-dasharray="2 3"/>${padlock(0, -5, .95, PAPER)}
        ${k === 2 ? `<path class="si-crack" d="M-2 -22 3 -12 -4 -4 4 5 -1 22" fill="none" stroke="${PAPER}" stroke-width="2" stroke-linejoin="round"/>` : ''}</g>
      <g class="si-freed"><circle r="23" fill="${PAPER}" stroke="${GOOD}" stroke-width="2.2"/>${openLock(0, -5, .95, GOOD)}</g>
    </g>`).join('')}
  <g transform="translate(130 268)">
    <circle r="6" fill="${SEAL}"/>${T(13, 5, 'Locked', 'si-body', 'start', INK, 13)}
    <circle cx="96" r="6" fill="none" stroke="${GOOD}" stroke-width="2.200"/>${T(109, 5, 'Free to use', 'si-body', 'start', INK, 13)}
  </g>`;
};

/* ---- 3. the window and the sellable meter ---- */
const windowSlide = () => `
  <g transform="translate(220 56)">
    <g class="si-p-closed"><rect x="-96" y="-20" width="192" height="40" rx="20" fill="${PAPER}" stroke="${SEAL}" stroke-width="1.8"/><circle cx="-72" r="7" fill="${SEAL}"/>${T(-54, 6, 'Window closed', 'si-disp', 'start', SEAL, 17)}</g>
    <g class="si-p-open"><rect x="-96" y="-20" width="192" height="40" rx="20" fill="${PAPER}" stroke="${GOOD}" stroke-width="1.8"/><circle cx="-72" r="7" fill="${GOOD}"/><circle class="si-halo" cx="-72" r="12" fill="none" stroke="${GOOD}" stroke-opacity=".5"/>${T(-54, 6, 'Window open', 'si-disp', 'start', GOOD, 17)}</g>
  </g>
  ${T(34, 130, 'SELLABLE NOW', 'si-disp', 'start', MUTED, 13)}
  <g transform="translate(342 112)"><g class="si-chip"><rect width="64" height="26" rx="13" fill="${GOLD}" stroke="${INK}" stroke-width="1.3"/>${T(32, 18, 'Sell', 'si-body', 'middle', INK, 13)}</g></g>
  <g transform="translate(34 142)">
    <defs><pattern id="si-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${MUTED}" stroke-width="1.3"/></pattern></defs>
    <rect width="372" height="36" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
    <rect x="1" y="1" width="134" height="34" fill="url(#si-hatch)" opacity=".5"/>
    <rect x="136" y="1" width="235" height="34" fill="${PAPER2}"/>
    <rect class="si-sell" x="136" y="1" width="235" height="34" fill="${GOLD}"/>
    <line x1="135.500" y1="0" x2="135.500" y2="36" stroke="${INK}" stroke-width="1.5"/>
    ${T(68, 58, 'Locked', 'si-body', 'middle', INK, 13)}${T(254, 58, 'Free shares', 'si-body', 'middle', INK, 13)}
  </g>
  ${T(34, 226, 'THE CALENDAR', 'si-disp', 'start', MUTED, 13)}
  <g transform="translate(34 246)">
    <rect width="372" height="20" fill="${PAPER}" stroke="${INK}" stroke-width="1.3"/>
    <rect x="1" y="1" width="73" height="18" fill="${SEAL}" fill-opacity=".85"/>
    <rect x="74" y="1" width="149" height="18" fill="${GOOD}" fill-opacity=".85"/>
    <rect x="223" y="1" width="148" height="18" fill="${SEAL}" fill-opacity=".85"/>
    <g class="si-now"><circle class="si-halo" cy="10" r="11" fill="none" stroke="${INK}" stroke-opacity=".5"/><path d="M0 -4 -7 -14h14Z" fill="${INK}"/><line y1="-4" y2="26" stroke="${INK}" stroke-width="2.200"/></g>
    ${T(37, 42, 'Closed', 'si-body', 'middle', SEAL, 13)}${T(148, 42, 'Open', 'si-body', 'middle', GOOD, 13)}${T(297, 42, 'Closed', 'si-body', 'middle', SEAL, 13)}
  </g>`;

/* ---- 4. the family spends ---- */
const family = () => {
  const mo = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  return `
  ${T(34, 52, 'A YEAR OF FIRST TRADING DAYS', 'si-disp', 'start', MUTED, 13)}
  <g transform="translate(34 74)">
    ${mo.map((m, i) => `<g transform="translate(${i * 31} 0)"><rect width="27" height="46" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/><rect width="27" height="11" fill="${INK}"/>${T(13.500, 9, m, 'si-num', 'middle', PAPER, 9)}${T(13.500, 36, '1', 'si-disp', 'middle', INK, 20)}</g>`).join('')}
    <g class="si-hl"><line x1="13.500" y1="52" x2="13.500" y2="150" stroke="${SEAL}" stroke-width="1.200" stroke-dasharray="2 4" stroke-opacity=".6"/><rect x="-2.500" y="-2.500" width="32" height="51" fill="none" stroke="${SEAL}" stroke-width="2.200"/></g>
    <g class="si-coin"><g class="si-fall"><circle cx="13.500" cy="23" r="9" fill="${GOLD}" stroke="${INK}" stroke-width="1.3"/><path d="M13.500 17v12M10 21.500c0-2.500 7-2.500 7 0s-7 3-7 5.500 7 2.500 7 0" fill="none" stroke="${INK}" stroke-width="1.100"/></g></g>
  </g>
  ${T(34, 214, 'CASH', 'si-disp', 'start', MUTED, 13)}
  <g transform="translate(34 226)">
    <rect width="372" height="42" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
    <rect class="si-cash" x="1" y="1" width="370" height="40" fill="${GOLD}"/>
    <g stroke="${INK}" stroke-opacity=".35" stroke-width="1">${Array.from({ length: 11 }, (_, i) => `<line x1="${(i + 1) * 31}" y1="1" x2="${(i + 1) * 31}" y2="41"/>`).join('')}</g>
  </g>
  <g transform="translate(34 298)">
    <rect width="13" height="13" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/><rect width="13" height="4.500" fill="${INK}"/>
    ${T(22, 12, 'First trading day of the month', 'si-body', 'start', INK, 13)}
    <circle cx="232" cy="6.500" r="6.500" fill="${GOLD}" stroke="${INK}"/>${T(244, 12, 'That month’s spending', 'si-body', 'start', INK, 13)}
  </g>`;
};

/* ---- 5. the rivals ---- */
const RAIL = { x0: 220, len: 190 };
const lanes = () => {
  const m = (artManifest() || {}).rivals || {};
  return [['You', null], ['The Holder', m.holder || 'assets/rivals/holder.png'], ['The Seller', m.seller || 'assets/rivals/seller.png'], ['The Playbook', m.playbook || 'assets/rivals/playbook.png']];
};
const rivals = () => `
  <defs>${[0, 1, 2, 3].map((i) => `<clipPath id="si-av${i}"><circle cx="0" cy="0" r="22"/></clipPath>`).join('')}</defs>
  ${lanes().map(([name, src], i) => `
    <g transform="translate(0 ${30 + i * 74})">
      ${i ? `<line x1="40" y1="-12" x2="410" y2="-12" stroke="${LINE}" stroke-width="1"/>` : ''}
      <g transform="translate(64 30)">
        ${src ? `<image href="${src}" x="-26" y="-26" width="52" height="52" clip-path="url(#si-av${i})" preserveAspectRatio="xMidYMid slice"/><circle r="22" fill="none" stroke="${INK}" stroke-width="1.4"/>`
          : `<circle class="si-pulse" r="22" fill="none" stroke="${SEAL}" stroke-width="2"/><circle class="si-pulse si-pulse2" r="22" fill="none" stroke="${SEAL}" stroke-width="1.500"/><circle r="22" fill="${SEAL}" stroke="${INK}" stroke-width="1.400"/><circle r="17.500" fill="none" stroke="#c9605a" stroke-dasharray="2 3"/>${T(0, 5.500, 'You', 'si-disp', 'middle', PAPER, 16)}`}
      </g>
      ${T(100, 36, i === 0 ? 'Your seat' : name, i === 0 ? 'si-disp' : 'si-body', 'start', INK, i === 0 ? 17 : 14)}
      <line x1="${RAIL.x0}" y1="30" x2="${RAIL.x0 + RAIL.len}" y2="30" stroke="${INK}" stroke-width="1.300"/>
      <g stroke="${INK}" stroke-width="1">${Array.from({ length: 13 }, (_, k) => `<line x1="${RAIL.x0 + k * RAIL.len / 12}" y1="25" x2="${RAIL.x0 + k * RAIL.len / 12}" y2="30"/>`).join('')}</g>
      <line class="si-trail" x1="${RAIL.x0}" y1="30" x2="${RAIL.x0 + 60}" y2="30" stroke="${i ? GOLD : SEAL}" stroke-width="3.500" stroke-linecap="round"/>
      <circle class="si-dot" cx="${RAIL.x0 + 60}" cy="30" r="7.500" fill="${i ? GOLD : SEAL}" stroke="${INK}" stroke-width="1.300"/>
    </g>`).join('')}
  <g class="si-gap"><line class="si-gap-l" y1="22" y2="22" stroke="${INK}" stroke-width="1.200" stroke-dasharray="3 3"/><path class="si-gap-a" d="" fill="none" stroke="${INK}" stroke-width="1.300"/>
    <g class="si-gap-pill"><rect x="-21" y="-9" width="42" height="18" rx="9" fill="${PAPER}" stroke="${INK}" stroke-width="1.200"/>${T(0, 4.500, 'gap', 'si-body', 'middle', INK, 12)}</g></g>
  <g class="si-lead"><path d="M0 0V-20" stroke="${INK}" stroke-width="1.800"/><path d="M0 -20h15l-4.500 5 4.500 5H0Z" fill="${GOLD}" stroke="${INK}" stroke-width="1.100" stroke-linejoin="round"/></g>`;

/* Rivals race: positions are decoration (smooth waves with different tempos), seeded so the first frame shows a rival ahead. */
const RACE = [{ x0: .3, P: 7.4 }, { x0: .56, P: 8.7 }, { x0: .88, P: 6.5 }, { x0: .44, P: 9.6 }];
const AMP = .43, T0 = .5;
const racePos = (r, t) => { const w = (Math.PI * 2) / r.P, ph = Math.asin((r.x0 - .5) / AMP) - w * T0; return .5 + AMP * Math.sin(w * t + ph); };
function race(svg, loop) {
  const dots = [...svg.querySelectorAll('.si-dot')], trails = [...svg.querySelectorAll('.si-trail')];
  const gl = svg.querySelector('.si-gap-l'), ga = svg.querySelector('.si-gap-a'), pill = svg.querySelector('.si-gap-pill'), lead = svg.querySelector('.si-lead'), gap = svg.querySelector('.si-gap');
  const rowY = (i) => 30 + i * 74;
  const frame = (t) => {
    const xs = RACE.map((r) => RAIL.x0 + 7 + racePos(r, t) * (RAIL.len - 14));
    xs.forEach((x, i) => { dots[i].setAttribute('cx', x.toFixed(1)); trails[i].setAttribute('x2', x.toFixed(1)); });
    const top = xs.indexOf(Math.max(...xs));
    const other = top === 0 ? xs.indexOf(Math.max(...xs.slice(1))) + 1 : 0;
    const a = Math.min(xs[0], xs[top === 0 ? other : top]), b = Math.max(xs[0], xs[top === 0 ? other : top]);
    const yb = rowY(0) + 50;
    gl.setAttribute('x1', a.toFixed(1)); gl.setAttribute('x2', b.toFixed(1)); gl.setAttribute('y1', yb); gl.setAttribute('y2', yb);
    ga.setAttribute('d', `M${a.toFixed(1)} ${yb - 6}v12M${b.toFixed(1)} ${yb - 6}v12`);
    pill.setAttribute('transform', `translate(${((a + b) / 2).toFixed(1)} ${yb})`);
    gap.style.opacity = b - a > 26 ? 1 : 0;
    lead.setAttribute('transform', `translate(${xs[top].toFixed(1)} ${rowY(top) + 22.5})`);
  };
  frame(T0);
  if (!loop) return;
  const t0 = performance.now();
  const step = (now) => { if (!svg.isConnected) return; frame(T0 + (now - t0) / 1000); requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

const SLIDES = [clock, certificate, windowSlide, family, rivals];

const stage = (i, dir) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg class="si-svg" data-s="${i}" viewBox="${isPhone() ? VIEW.phone : VIEW.wide}" role="presentation" aria-hidden="true" focusable="false"><g transform="translate(220 170) scale(.94) translate(-220 -170)">${SLIDES[i]()}</g></svg>`;
  const svg = wrap.firstElementChild;
  if (i === 4) race(svg, !still());
  return svg;
};

function enhance(node) {
  node.classList.add('intro');
  const bg = document.createElement('div');
  bg.className = 'intro-bg'; bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = art('securityWave', { width: 1200, height: 420, lines: 34, color: '#2C4352', amplitude: 22 });
  node.prepend(bg);
  const plate = document.createElement('div');
  plate.className = 'intro-plate'; plate.setAttribute('aria-hidden', 'true');
  const wrap = document.createElement('div');
  wrap.className = 'intro-stage'; wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<div class="intro-rosette">${art('rosette', { size: 900, petals: 14, rings: 9, stroke: 0.7, color: 'currentColor' })}</div>`;
  plate.innerHTML = `<div class="intro-wave">${art('securityWave', { width: 440, height: 340, lines: 18, color: '#D9CEB4', amplitude: 10 })}</div><div class="intro-art"></div>`;
  wrap.append(plate);
  node.querySelector('.kicker').after(wrap);
  const slot = plate.querySelector('.intro-art');
  const body = node.querySelector('.lesson-body');
  const dots = [...node.querySelectorAll('.dots i')];
  let shown = -1;
  const sync = () => {
    const i = Math.max(0, dots.findIndex((d) => d.classList.contains('on')));
    if (i === shown) return;
    const dir = i < shown ? 'back' : 'fwd';
    shown = i;
    const cap = document.createElement('p');
    cap.className = 'intro-cap'; cap.textContent = INTRO_CARDS[i].cap;
    body.querySelector('.dlg-title')?.after(cap);
    slot.replaceChildren(stage(i));
    slot.dataset.i = String(i); slot.dataset.dir = dir;
    slot.style.animation = 'none'; void slot.offsetWidth; slot.style.animation = '';
  };
  new MutationObserver(sync).observe(body, { childList: true });
  window.matchMedia('(max-width:899px)').addEventListener('change', () => { const s = slot.querySelector('svg'); if (s) s.setAttribute('viewBox', isPhone() ? VIEW.phone : VIEW.wide); });
  sync();
}

export function showIntro() {
  const done = showLesson(INTRO_CARDS, { kicker: 'Before the clock starts', skipLabel: 'Skip', doneLabel: 'Start the clock', label: 'Introduction' });
  const node = document.querySelector('.dialog.lesson');
  if (node) enhance(node);
  return done;
}
