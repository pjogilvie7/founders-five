// Intro stage shown before the clock starts: five short slides, each with its own drawn illustration.
// The slide mechanics (focus trap, Escape, arrow keys, Enter, inert root) come from showLesson; this file
// turns that dialog into a full-bleed stage and swaps an illustration in for every slide.
import { showLesson } from './lesson.js';
import { art, artManifest } from './data.js';

export const INTRO_CARDS = [
  { title: 'Time runs', body: 'Each sweep of the needle is one trading day of the real record.' },
  { title: 'Your shares unlock', body: 'Shares unlock on the prospectus dates, and a seal breaks at each one.' },
  { title: 'The trading window', body: 'You can sell free shares only while the trading window is open.' },
  { title: 'Your family spends', body: 'Your family spends $2 million a year, taken on each month’s first trading day.' },
  { title: 'Three rivals', body: 'Three rivals play the same card, and their results show live in the rail.' },
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
const VIEW = { wide: '0 0 440 340', phone: '24 -50 392 440' };
const coarse = () => window.matchMedia('(pointer: coarse)').matches;
const isPhone = () => window.matchMedia('(max-width:899px)').matches;
const still = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;
const pt = (r, a) => `${(r * Math.sin(a * Math.PI / 180)).toFixed(1)} ${(-r * Math.cos(a * Math.PI / 180)).toFixed(1)}`;
const wedge = (r, a0, a1, o) => `<path d="M0 0 L${pt(r, a0)} A${r} ${r} 0 0 1 ${pt(r, a1)}Z" fill="${SEAL}" fill-opacity="${o}"/>`;

/* ---- 1. the clock (live: needle, speed keys, play and Space all work) ---- */
const CLOCK = { speed: 1, playing: true, touched: false, day: 7, frac: 138 / 360 };
const resetClock = () => Object.assign(CLOCK, { speed: 1, playing: !still(), touched: false, day: 7, frac: 138 / 360 });
const DAYS_ON_TRACK = 20;

/* A chunky key: a dark base, a face that sinks when pressed, a dashed focus ring. The whole illustration is aria-hidden and the keys are
   pointer-only (tabindex -1, no button role), so a screen reader or Tab does not meet three fake buttons; Space still runs the demo clock. */
const keyBtn = (id, x, y, w, h, label, inner, extra = '') => `
  <g class="si-kb" data-k="${id}" tabindex="-1" transform="translate(${x} ${y})">
    <rect x="0" y="5" width="${w}" height="${h}" rx="6" fill="${INK}"/>
    <g class="si-kface"><rect class="si-kbg" width="${w}" height="${h}" rx="6" fill="${extra || PAPER}" stroke="${INK}" stroke-width="1.6"/>${inner}</g>
    <rect class="si-kfocus" x="-4" y="-4" width="${w + 8}" height="${h + 13}" rx="9" fill="none" stroke="${GOLD}" stroke-width="2.2" stroke-dasharray="4 3"/>
    <rect width="${w}" height="${h + 5}" fill="transparent"/>
  </g>`;

const clock = (phone) => {
  const L = phone
    ? { dial: [220, 52], lab: [44, 178], sx: (i) => 144 + i * 84, sy: 186, sw: 76, play: [44, 186, 92, 50], trk: [44, 268], tw: 352, line: 344, spc: [88, 356] }
    : { dial: [120, 138], lab: [230, 58], sx: (i) => 230 + i * 61, sy: 66, sw: 54, play: [230, 134, 176, 50], trk: [230, 204], tw: 176, line: 274, spc: [88, 286] };
  const [px, py, pw, ph] = L.play, pcx = phone ? pw / 2 : 40;
  const speedKeys = [1, 2, 4].map((n, i) => keyBtn(`x${n}`, L.sx(i), L.sy, L.sw, 50, `Speed ${n}x`,
    `${T(L.sw / 2, 32, `${n}x`, 'si-num si-ktxt', 'middle', INK, 20)}${n === 2 ? `<rect class="si-nudge" x="-5" y="-5" width="${L.sw + 10}" height="60" rx="9" fill="none" stroke="${GOLD}" stroke-width="2"/>` : ''}`)).join('');
  const playKey = keyBtn('play', px, py, pw, ph, 'Pause the clock',
    `<g class="si-ic-play"><path d="M${pcx - 7} ${ph / 2 - 12}L${pcx + 12} ${ph / 2}L${pcx - 7} ${ph / 2 + 12}Z" fill="${PAPER}"/></g>
     <g class="si-ic-pause" fill="${PAPER}"><rect x="${pcx - 9}" y="${ph / 2 - 12}" width="7" height="24"/><rect x="${pcx + 3}" y="${ph / 2 - 12}" width="7" height="24"/></g>
     ${phone ? '' : `<text class="si-lb-play si-disp" x="${pcx + 28}" y="${ph / 2 + 6}" fill="${PAPER}" font-size="17">PLAY</text><text class="si-lb-pause si-disp" x="${pcx + 28}" y="${ph / 2 + 6}" fill="${PAPER}" font-size="17">PAUSE</text>`}`, SEAL);
  const [tx, ty] = L.trk, TW = L.tw;
  return `
  <g transform="translate(${L.dial[0]} ${L.dial[1]})">
    <circle r="96" fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/>
    <circle r="89" fill="none" stroke="${GOLD}" stroke-width="1"/>
    <g stroke="${INK}" stroke-width="1">${ticks(60, 82, 77, 5, 70)}</g>
    <g stroke="${LINE}" stroke-width=".7" fill="none"><circle r="54"/><circle r="45"/><circle r="36"/></g>
    ${T(0, 30, 'TRADING DAY', 'si-disp', 'middle', MUTED, 10.5)}${T(0, 60, '7', 'si-disp si-daynum', 'middle', INK, 27)}
    <g class="si-pausedtxt">${T(0, -30, 'PAUSED', 'si-disp', 'middle', SEAL, 12)}</g>
    <g class="si-hand" transform="rotate(138)">
      ${[0, 1, 2, 3, 4, 5, 6].map((k) => wedge(74, -(k + 1) * 11, -k * 11, (.3 - k * .042).toFixed(3))).join('')}
      <line x1="0" y1="8" x2="0" y2="-70" stroke="${SEAL}" stroke-width="2.8" stroke-linecap="round"/>
    </g>
    <circle r="6.5" fill="${INK}"/><circle r="2.4" fill="${GOLD}"/>
  </g>
  ${T(L.lab[0], L.lab[1], 'SPEED', 'si-disp', 'start', MUTED, 12)}
  ${speedKeys}${playKey}
  <g transform="translate(${tx} ${ty})">
    ${T(0, 0, 'DAY TRACKER', 'si-disp', 'start', MUTED, 12)}
    <rect class="si-track" x="0" y="45" width="${(TW * .32).toFixed(1)}" height="7" fill="${GOLD}"/>
    <line x1="0" y1="52" x2="${TW}" y2="52" stroke="${INK}" stroke-width="1.4"/>
    <g stroke="${INK}" stroke-width="1">${Array.from({ length: DAYS_ON_TRACK + 1 }, (_, i) => `<line x1="${(i * TW / DAYS_ON_TRACK).toFixed(1)}" y1="${i % 5 === 0 ? 40 : 46}" x2="${(i * TW / DAYS_ON_TRACK).toFixed(1)}" y2="52"/>`).join('')}</g>
    <g class="si-flag" transform="translate(${(TW * .32).toFixed(1)} 0)"><path d="M0 52V22" stroke="${SEAL}" stroke-width="2.2"/><path d="M0 22h16l-4.500 5 4.500 5H0Z" fill="${SEAL}"/><circle cy="52" r="4.500" fill="${SEAL}"/></g>
  </g>
  <line x1="44" y1="${L.line}" x2="396" y2="${L.line}" stroke="${GOLD}" stroke-width="1"/>
  ${coarse() ? '' : `${keyBtn('space', L.spc[0], L.spc[1], 100, 32, 'Pause or resume the clock', T(50, 21.500, 'SPACE', 'si-num', 'middle', INK, 13))}   <g transform="translate(${L.spc[0] + 114} ${L.spc[1]})"><g class="si-hint-run">${T(0, 21.500, 'PAUSES THE CLOCK', 'si-disp', 'start', MUTED, 13)}</g><g class="si-hint-paused">${T(0, 21.500, 'RESUMES THE CLOCK', 'si-disp', 'start', MUTED, 13)}</g></g>`}`;
};

/* Drives the plate: the needle sweeps one trading day per turn at 1x, and every key changes the sweep. */
let live = null;
function clockLive(svg, onTouch) {
  const S = CLOCK, TW = Number(svg.dataset.tw);
  const q = (s) => svg.querySelector(s);
  const hand = q('.si-hand'), num = q('.si-daynum'), track = q('.si-track'), flag = q('.si-flag'), play = q('[data-k=play]');
  const keys = [1, 2, 4].map((n) => [n, q(`[data-k=x${n}]`)]);
  const frame = () => {
    hand.setAttribute('transform', `rotate(${(S.frac * 360).toFixed(1)})`);
    num.textContent = String(S.day);
    const p = (((S.day - 1) % DAYS_ON_TRACK) + S.frac) / DAYS_ON_TRACK;
    track.setAttribute('width', (TW * p).toFixed(1));
    flag.setAttribute('transform', `translate(${(TW * p).toFixed(1)} 0)`);
  };
  const ui = () => {
    svg.dataset.run = S.playing ? '1' : '0';
    svg.dataset.touched = S.touched ? '1' : '0';
    keys.forEach(([n, k]) => { k.classList.toggle('is-on', S.speed === n); k.setAttribute('aria-pressed', S.speed === n ? 'true' : 'false'); });
    play.setAttribute('aria-label', S.playing ? 'Pause the clock' : 'Play the clock');
  };
  const act = (id) => {
    if (id === 'play' || id === 'space') S.playing = !S.playing;
    else { S.speed = Number(id.slice(1)); S.playing = true; }
    if (!S.touched) { S.touched = true; onTouch(); }
    ui(); frame();
  };
  svg.addEventListener('click', (e) => {
    const k = e.target.closest('.si-kb'); if (!k) return;
    act(k.dataset.k);
    if (e.detail > 0) k.blur();            // after a tap, Space goes back to meaning "pause"
  });
  svg.addEventListener('keydown', (e) => {
    const k = e.target.closest?.('.si-kb');
    if (!k || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault(); e.stopPropagation();  // Enter would otherwise advance the slide
    act(k.dataset.k);
  });
  let last = performance.now();
  const step = (now) => {
    if (!svg.isConnected) { if (live && live.svg === svg) live = null; return; }
    const dt = Math.min((now - last) / 1000, .1); last = now;
    if (S.playing) {
      S.frac += (dt / 6) * S.speed;
      while (S.frac >= 1) { S.frac -= 1; S.day += 1; }
      frame();
    }
    requestAnimationFrame(step);
  };
  ui(); frame();
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(step); });
  live = { svg, space: () => act('space'), spaceKey: q('[data-k=space]') };
}

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
    const rest = xs.slice(1), other = top === 0 ? 1 + rest.indexOf(Math.max(...rest)) : 0; // best rival's lane (1 to 3); xs.indexOf(...) + 1 ran off the end and made NaN
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

const SLIDES = [() => clock(isPhone()), certificate, windowSlide, family, rivals];

const stage = (i, onTouch) => {
  const wrap = document.createElement('div');
  const phone = isPhone(), live1 = i === 0;
  const a11y = 'role="presentation" aria-hidden="true"';
  wrap.innerHTML = `<svg class="si-svg" data-s="${i}" data-tw="${phone ? 352 : 176}" viewBox="${phone ? VIEW.phone : VIEW.wide}" ${a11y} focusable="false"><g transform="translate(220 170) scale(.94) translate(-220 -170)">${SLIDES[i]()}</g></svg>`;
  const svg = wrap.firstElementChild;
  if (live1) clockLive(svg, onTouch);
  if (i === 4) race(svg, !still());
  return svg;
};

// Touch devices have no Space key: say what pauses the clock there.
const capHint = () => (coarse() ? 'Tap a speed or play. Tap the play button to pause.' : 'Tap a speed or play. Space pauses.');
const capDone = () => (coarse() ? 'That is the clock. Tap the play button to pause it any time.' : 'That is the clock. Space pauses it any time.');

function enhance(node) {
  node.classList.add('intro');
  const bg = document.createElement('div');
  bg.className = 'intro-bg'; bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = art('securityWave', { width: 1200, height: 420, lines: 34, color: '#2C4352', amplitude: 22 });
  node.prepend(bg);
  const plate = document.createElement('div');
  plate.className = 'intro-plate';
  const wrap = document.createElement('div');
  wrap.className = 'intro-stage';
  wrap.innerHTML = `<div class="intro-rosette" aria-hidden="true">${art('rosette', { size: 900, petals: 14, rings: 9, stroke: 0.7, color: 'currentColor' })}</div>`;
  plate.innerHTML = `<div class="intro-wave" aria-hidden="true">${art('securityWave', { width: 440, height: 340, lines: 18, color: '#D9CEB4', amplitude: 10 })}</div><div class="intro-art"></div>`;
  wrap.append(plate);
  node.querySelector('.kicker').after(wrap);
  const slot = plate.querySelector('.intro-art');
  const body = node.querySelector('.lesson-body');
  const next = node.querySelector('[data-a=next]');
  const dots = [...node.querySelectorAll('.dots i')];
  let shown = -1, capEl = null;
  // Next is dimmed (never disabled) until the student has touched one clock control; one touch, no gate on later slides.
  const gate = () => { node.dataset.gate = shown === 0 && !CLOCK.touched ? '1' : '0'; };
  const setCap = () => { if (capEl) capEl.textContent = CLOCK.touched ? capDone() : capHint(); };
  const onTouch = () => {
    gate(); setCap();
    if (still()) return;
    next.classList.remove('si-pop'); void next.offsetWidth; next.classList.add('si-pop');
  };
  next.addEventListener('animationend', () => next.classList.remove('si-pop'));
  const render = (dir) => {
    slot.replaceChildren(stage(shown, onTouch));
    slot.dataset.i = String(shown); slot.dataset.dir = dir;
    slot.style.animation = 'none'; void slot.offsetWidth; slot.style.animation = '';
  };
  const sync = () => {
    const i = Math.max(0, dots.findIndex((d) => d.classList.contains('on')));
    if (i === shown) return;
    const dir = i < shown ? 'back' : 'fwd';
    shown = i;
    capEl = null;
    if (i === 0) {
      capEl = document.createElement('p');
      capEl.className = 'intro-cap'; capEl.setAttribute('aria-live', 'polite');
      body.querySelector('p')?.after(capEl); setCap();
    }
    gate(); render(dir);
  };
  new MutationObserver(sync).observe(body, { childList: true });
  window.matchMedia('(max-width:899px)').addEventListener('change', () => { if (node.isConnected && shown >= 0) render('fwd'); });

  // Space pauses the clock while the first slide is showing, wherever focus is (a focused clock key keeps its own Space).
  let swallow = false;
  const down = (e) => {
    if (!node.isConnected) { document.removeEventListener('keydown', down, true); document.removeEventListener('keyup', up, true); return; }
    if (e.key !== ' ' || shown !== 0 || !live || !live.svg.isConnected || e.target.closest?.('.si-kb')) return;
    e.preventDefault(); e.stopPropagation(); swallow = true;
    live.space();
    live.spaceKey?.classList.add('is-down');
  };
  const up = (e) => {
    if (e.key !== ' ' || !swallow) return;
    e.preventDefault(); swallow = false; live?.spaceKey?.classList.remove('is-down');
  };
  document.addEventListener('keydown', down, true);
  document.addEventListener('keyup', up, true);
  sync();
}

export function showIntro() {
  resetClock(); live = null;
  const done = showLesson(INTRO_CARDS, { kicker: 'Before the clock starts', skipLabel: 'Skip', doneLabel: 'Start the clock', label: 'Introduction' });
  const node = document.querySelector('.dialog.lesson');
  if (node) enhance(node);
  return done;
}
