// Intro stage shown before the clock starts: five short slides, each with its own drawn illustration.
// The slide mechanics (focus trap, Escape, arrow keys, Enter, inert root) come from showLesson; this file
// turns that dialog into a full-bleed stage and swaps an illustration in for every slide.
import { showLesson } from './lesson.js';
import { art, artManifest } from './data.js';

export const INTRO_CARDS = [
  { title: 'Time runs', body: 'Each tick is one trading day of the real record. Press Space to pause, and speed up when you are ready.' },
  { title: 'Your shares unlock', body: 'Your $100 million is locked. Shares become free on the dates in the prospectus, and the seals on your certificate break one by one.' },
  { title: 'The trading window', body: 'You can sell free shares only while the trading window is open. When it closes, the sellable count drops to zero.' },
  { title: 'Your family spends', body: 'Your family spends $2 million a year, taken on the first trading day of each month.' },
  { title: 'Three rivals', body: 'The Holder, The Seller and The Playbook play the same card. Their results show live in the rail.' },
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

/* ---- 1. the clock ---- */
const clock = () => `
  <g transform="translate(118 122)">
    <circle r="84" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
    <circle r="77" fill="none" stroke="${GOLD}" stroke-width="1"/>
    <g stroke="${INK}" stroke-width="1">${ticks(60, 70, 66, 5, 61)}</g>
    <g stroke="${LINE}" stroke-width=".7" fill="none"><circle r="46"/><circle r="38"/><circle r="30"/></g>
    ${T(0, 30, 'TRADING', 'si-disp', 'middle', MUTED, 10)}${T(0, 48, 'DAY', 'si-disp', 'middle', INK, 17)}
    <g class="si-hand"><circle r="56" fill="none"/><line x1="0" y1="0" x2="0" y2="-56" stroke="${SEAL}" stroke-width="2.6" stroke-linecap="round"/></g>
    <circle r="5.5" fill="${INK}"/><circle r="2" fill="${GOLD}"/>
  </g>
  <g transform="translate(236 70)">
    ${T(0, -8, 'SPEED', 'si-disp', 'start', MUTED, 11)}
    <rect x="0" y="0" width="46" height="46" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>
    <path d="M17 12 35 23 17 34Z" fill="${SEAL}"/>
    <g transform="translate(58 0)">
      <rect x="0" y="0" width="132" height="46" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>
      <rect class="si-spd" x="2" y="2" width="42" height="42" fill="${INK}"/>
      <g class="si-num" font-size="14" text-anchor="middle" font-weight="600">
        <text x="22" y="29" class="si-t1">1x</text><text x="66" y="29" class="si-t2">2x</text><text x="110" y="29" class="si-t4">4x</text>
      </g>
    </g>
  </g>
  <g transform="translate(236 150)">
    ${T(0, 0, 'DAY TRACKER', 'si-disp', 'start', MUTED, 11)}
    <line x1="0" y1="34" x2="184" y2="34" stroke="${INK}" stroke-width="1.4"/>
    <g stroke="${INK}" stroke-width="1">${Array.from({ length: 24 }, (_, i) => `<line x1="${i * 8 + 0.5}" y1="${i % 5 === 0 ? 26 : 30}" x2="${i * 8 + 0.5}" y2="34"/>`).join('')}</g>
    <rect class="si-track" x="0" y="31" width="184" height="6" fill="${GOLD}"/>
    <g class="si-flag"><path d="M0 34V12" stroke="${SEAL}" stroke-width="2"/><path d="M0 12h13l-4 4.5 4 4.5H0Z" fill="${SEAL}"/><circle cy="34" r="4" fill="${SEAL}"/></g>
  </g>
  <g transform="translate(40 232)" stroke="${GOLD}" stroke-width="1" fill="none"><line x1="0" y1="0" x2="360" y2="0"/></g>
  ${T(220, 252, 'SPACE PAUSES', 'si-disp', 'middle', MUTED, 11)}`;

/* ---- 2. the certificate ---- */
const certificate = () => {
  const xs = [108, 164, 220, 276, 332];
  return `
  <rect x="62" y="22" width="316" height="196" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
  <rect x="70" y="30" width="300" height="180" fill="none" stroke="${GOLD}" stroke-width="1"/>
  <g stroke="${LINE}" stroke-width=".8" fill="none">${Array.from({ length: 9 }, (_, i) => `<path d="M72 ${96 + i * 3}c40 -10 80 10 120 0s80 -10 120 0 40 6 56 0"/>`).join('')}</g>
  ${T(220, 58, 'CERTIFICATE OF SHARES', 'si-disp', 'middle', INK, 19)}
  <line x1="130" y1="68" x2="310" y2="68" stroke="${GOLD}" stroke-width="1.2"/>
  ${T(220, 86, 'One seal for each release date', 'si-body', 'middle', MUTED, 12)}
  ${xs.map((x, k) => `
    <g transform="translate(${x} 142)">
      <circle r="24" fill="none" stroke="${GOLD}" stroke-width="1" stroke-dasharray="2 3"/>
      <g class="si-lockd" style="--k:${k}"><circle r="19" fill="${SEAL}" stroke="#5e1712" stroke-width="1"/><circle r="15" fill="none" stroke="#c9605a" stroke-width="1" stroke-dasharray="2 3"/>${padlock(0, -4, .78, PAPER)}</g>
      <g class="si-freed" style="--k:${k}"><circle r="19" fill="${PAPER}" stroke="${GOOD}" stroke-width="2"/>${openLock(0, -4, .78, GOOD)}</g>
    </g>`).join('')}
  <g transform="translate(150 196)">
    <circle r="5" fill="${SEAL}"/>${T(11, 4, 'Locked', 'si-body', 'start', INK, 12)}
    <circle cx="86" r="5" fill="none" stroke="${GOOD}" stroke-width="2"/>${T(97, 4, 'Free to use', 'si-body', 'start', INK, 12)}
  </g>`;
};

/* ---- 3. the window and the sellable meter ---- */
const windowSlide = () => `
  <g transform="translate(220 40)">
    <g class="si-p-closed"><rect x="-88" y="-18" width="176" height="36" rx="18" fill="${PAPER}" stroke="${SEAL}" stroke-width="1.6"/><circle cx="-66" r="6" fill="${SEAL}"/>${T(-50, 5, 'Window closed', 'si-disp', 'start', SEAL, 15)}</g>
    <g class="si-p-open"><rect x="-88" y="-18" width="176" height="36" rx="18" fill="${PAPER}" stroke="${GOOD}" stroke-width="1.6"/><circle cx="-66" r="6" fill="${GOOD}"/><circle cx="-66" r="11" fill="none" stroke="${GOOD}" stroke-opacity=".4"/>${T(-50, 5, 'Window open', 'si-disp', 'start', GOOD, 15)}</g>
  </g>
  ${T(40, 104, 'SELLABLE NOW', 'si-disp', 'start', MUTED, 12)}
  <g transform="translate(40 114)">
    <defs><pattern id="si-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${MUTED}" stroke-width="1.3"/></pattern></defs>
    <rect width="360" height="30" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>
    <rect x="1" y="1" width="130" height="28" fill="url(#si-hatch)" opacity=".5"/>
    <rect x="132" y="1" width="227" height="28" fill="${PAPER2}"/>
    <rect class="si-sell" x="132" y="1" width="227" height="28" fill="${GOLD}"/>
    <line x1="131.5" y1="0" x2="131.5" y2="30" stroke="${INK}" stroke-width="1.4"/>
    ${T(66, 50, 'Locked', 'si-body', 'middle', INK, 12)}${T(246, 50, 'Free shares', 'si-body', 'middle', INK, 12)}
  </g>
  ${T(40, 184, 'THE CALENDAR', 'si-disp', 'start', MUTED, 12)}
  <g transform="translate(40 208)">
    <rect width="360" height="16" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>
    <rect x="1" y="1" width="70" height="14" fill="${SEAL}" fill-opacity=".85"/>
    <rect x="71" y="1" width="144" height="14" fill="${GOOD}" fill-opacity=".85"/>
    <rect x="215" y="1" width="144" height="14" fill="${SEAL}" fill-opacity=".85"/>
    <g class="si-now"><path d="M0 -5 -6 -13h12Z" fill="${INK}"/><line y1="-5" y2="21" stroke="${INK}" stroke-width="2"/></g>
    ${T(36, 34, 'Closed', 'si-body', 'middle', SEAL, 11)}${T(143, 34, 'Open', 'si-body', 'middle', GOOD, 11)}${T(287, 34, 'Closed', 'si-body', 'middle', SEAL, 11)}
  </g>`;

/* ---- 4. the family spends ---- */
const family = () => {
  const mo = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  return `
  ${T(40, 36, 'A YEAR OF FIRST TRADING DAYS', 'si-disp', 'start', MUTED, 12)}
  <g transform="translate(40 66)">
    ${mo.map((m, i) => `<g transform="translate(${i * 30.4} 0)"><rect width="26" height="40" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/><rect width="26" height="10" fill="${INK}"/>${T(13, 8, m, 'si-num', 'middle', PAPER, 8)}${T(13, 31, '1', 'si-disp', 'middle', INK, 17)}</g>`).join('')}
    <g class="si-coin"><circle cx="13" cy="-9" r="8" fill="${GOLD}" stroke="${INK}" stroke-width="1.2"/><path d="M13 -14v10M10 -11.500c0-2 6-2 6 0s-6 2.500-6 4.800 6 2 6 0" fill="none" stroke="${INK}" stroke-width="1"/></g>
  </g>
  ${T(40, 150, 'CASH', 'si-disp', 'start', MUTED, 12)}
  <g transform="translate(40 160)">
    <rect width="360" height="34" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>
    <g stroke="${LINE}" stroke-width="1">${Array.from({ length: 11 }, (_, i) => `<line x1="${(i + 1) * 30}" y1="1" x2="${(i + 1) * 30}" y2="33"/>`).join('')}</g>
    <rect class="si-cash" x="1" y="1" width="358" height="32" fill="${GOLD}"/>
  </g>
  <g transform="translate(40 222)" font-size="12">
    <rect width="12" height="12" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/><rect width="12" height="4" fill="${INK}"/>
    ${T(20, 11, 'First trading day of the month', 'si-body', 'start', INK, 12)}
    <circle cx="220" cy="6" r="6" fill="${GOLD}" stroke="${INK}"/>${T(232, 11, 'That month’s spending', 'si-body', 'start', INK, 12)}
  </g>`;
};

/* ---- 5. the rivals ---- */
const rivals = () => {
  const m = (artManifest() || {}).rivals || {};
  const lanes = [['You', null, '--v:5.4s'], ['The Holder', m.holder || 'assets/rivals/holder.png', '--v:6.6s'], ['The Seller', m.seller || 'assets/rivals/seller.png', '--v:4.8s'], ['The Playbook', m.playbook || 'assets/rivals/playbook.png', '--v:5.9s']];
  return `
  <defs>${lanes.map((_, i) => `<clipPath id="si-av${i}"><circle cx="0" cy="0" r="19"/></clipPath>`).join('')}</defs>
  ${lanes.map(([name, src], i) => `
    <g transform="translate(0 ${24 + i * 56})">
      <g transform="translate(58 22)">
        ${src ? `<image href="${src}" x="-23" y="-23" width="46" height="46" clip-path="url(#si-av${i})" preserveAspectRatio="xMidYMid slice"/><circle r="19" fill="none" stroke="${INK}" stroke-width="1.3"/>`
          : `<circle r="19" fill="${SEAL}" stroke="${INK}" stroke-width="1.3"/><circle r="15" fill="none" stroke="#c9605a" stroke-dasharray="2 3"/>${T(0, 5, 'You', 'si-disp', 'middle', PAPER, 14)}`}
      </g>
      ${T(92, 26, name, i === 0 ? 'si-disp' : 'si-body', 'start', INK, i === 0 ? 16 : 13)}
      <line x1="214" y1="22" x2="410" y2="22" stroke="${INK}" stroke-width="1.2"/>
      <g stroke="${INK}" stroke-width="1">${Array.from({ length: 13 }, (_, k) => `<line x1="${214 + k * 16.3}" y1="18" x2="${214 + k * 16.3}" y2="22"/>`).join('')}</g>
      <g transform="translate(214 0)"><g class="si-run" style="${lanes[i][2]}"><circle cx="0" cy="22" r="6" fill="${i === 0 ? SEAL : GOLD}" stroke="${INK}" stroke-width="1.2"/></g></g>
    </g>`).join('')}`;
};

const SLIDES = [clock, certificate, windowSlide, family, rivals];

const stage = (i) => `<svg class="si-svg" viewBox="0 0 440 275" role="presentation" aria-hidden="true" focusable="false">${SLIDES[i]()}</svg>`;

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
  plate.innerHTML = `<div class="intro-wave">${art('securityWave', { width: 440, height: 275, lines: 16, color: '#D9CEB4', amplitude: 10 })}</div><div class="intro-art"></div>`;
  wrap.append(plate);
  node.querySelector('.kicker').after(wrap);
  const slot = plate.querySelector('.intro-art');
  const dots = [...node.querySelectorAll('.dots i')];
  let shown = -1;
  const sync = () => {
    const i = Math.max(0, dots.findIndex((d) => d.classList.contains('on')));
    if (i === shown) return;
    shown = i;
    slot.innerHTML = stage(i);
    slot.dataset.i = String(i);
  };
  new MutationObserver(sync).observe(node.querySelector('.lesson-body'), { childList: true });
  sync();
}

export function showIntro() {
  const done = showLesson(INTRO_CARDS, { kicker: 'Before the clock starts', skipLabel: 'Skip', doneLabel: 'Start the clock', label: 'Introduction' });
  const node = document.querySelector('.dialog.lesson');
  if (node) enhance(node);
  return done;
}
