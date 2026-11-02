// Shared helpers for the tool tabs: dry runs on the engine, gated-control copy, number fields with MAX,
// segmented choices, one generic action form, number tweens and success stamps.
// The UI never computes money: every figure comes from the engine (canDo, act on a cloned state, snapshot, collarQuote).
import * as sim from '../../engine/sim.js';
import { esc, int, money, moneyFull, price, pct, dateLabel, shortDate, daysBetween, addDays } from '../format.js';

export { sim, esc, int, money, moneyFull, price, pct, shortDate, daysBetween, addDays };

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ dates
const dctxCache = new WeakMap();
export function dctx(api) {
  const card = api.card();
  let x = dctxCache.get(card);
  if (!x) {
    const dates = card.prices.map((p) => p[0]);
    x = { blind: !!card.blind, dates, firstDate: dates[0] };
    dctxCache.set(card, x);
  }
  return x;
}
export const dl = (api, d) => (d ? dateLabel(dctx(api), d) : '');

/** First trading day of the next calendar month, from the card's dates (or the next weekday past the data). */
export function nextMonthStart(api, d) {
  const dates = dctx(api).dates;
  const [y, m] = d.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const key = `${ny}-${String(nm).padStart(2, '0')}`;
  const hit = dates.find((x) => x.slice(0, 7) === key);
  if (hit) return hit;
  let c = `${key}-01`;
  for (let k = 0; k < 4; k++) { const wd = new Date(c + 'T00:00:00Z').getUTCDay(); if (wd !== 0 && wd !== 6) break; c = addDays(c, 1); }
  return c;
}
/** Calendar quarter end after or on d. */
export function quarterEnd(d) {
  const [y, m] = d.split('-').map(Number);
  const qm = Math.ceil(m / 3) * 3;
  const last = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][qm - 1] + (qm === 2 ? 0 : 0);
  return `${y}-${String(qm).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ engine access
export function snapOf(api) { try { return sim.snapshot(api.state()); } catch { return null; } }

/** Dry run of an action on the engine. {ok, events, before, after} or {ok:false, error}. */
export function dry(api, action) {
  try {
    const st = api.state();
    const r = sim.act(st, action);
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, events: r.events || [], before: sim.snapshot(st), after: sim.snapshot(r.state) };
  } catch (e) {
    return { ok: false, error: null, broken: true };
  }
}
export const evOf = (d, type) => (d.events || []).find((e) => e.type === type);

// Events the tabs cannot get from the shell (tax paid, plan sales, margin calls): recorded from engine.tick.
// api.events() is used when the shell provides it.
export function events(api) {
  if (api && typeof api.events === 'function') return api.events();
  const G = window.__ff && window.__ff.G;
  if (!G || !G.engine) return [];
  const rec = (window.__ffRec ||= { key: null, list: [], hooked: false, eng: null });
  if (rec.key !== G.gameKey || rec.eng !== G.engine) { rec.key = G.gameKey; rec.eng = G.engine; rec.list = []; rec.hooked = false; }
  if (!rec.hooked && typeof G.engine.tick === 'function') {
    const orig = G.engine.tick;
    const keep = new Set(['taxPaid', 'marginCall', 'forcedSale', 'planSale', 'planLive']);
    G.engine.tick = (s) => {
      const r = orig(s);
      for (const e of r.events || []) if (keep.has(e.type)) rec.list.push({ type: e.type, d: e.d, text: e.text, pause: e.pause, data: e.data });
      return r;
    };
    rec.hooked = true;
  }
  return rec.list;
}

// ------------------------------------------------------------------ DOM helpers
export function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
export function setHTML(el, h) { if (el && el._h !== h) { el._h = h; el.innerHTML = h; } }
export const $ = (root, sel) => root.querySelector(sel);

export function safe(label, fn) {
  try { return fn(); } catch (e) { (window.__tabErrors ||= []).push(`${label}: ${e && e.message}`); console.warn('tab', label, e); return undefined; }
}

/** Animate a number in place. Reduced motion: instant. */
export function tween(el, v, fmt, opts = {}) {
  if (!el) return;
  if (v == null || Number.isNaN(v)) { setText(el, '—'); el._v = undefined; return; }
  const from = el._v;
  el._v = v;
  cancelAnimationFrame(el._raf);
  if (from === undefined || from === v || reduced() || document.hidden) { el.textContent = fmt(v); return; }
  const big = Math.abs(v - from) > Math.max(1, Math.abs(from)) * (opts.flash ?? 0.004);
  if (big && opts.flash !== false) {
    el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(v > from ? 'flash-up' : 'flash-down');
  }
  const t0 = performance.now(), dur = 420;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (v - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step); else el.textContent = fmt(v);
  };
  el._raf = requestAnimationFrame(step);
}

/** Success stamp on the plate (the certificate area) of a panel. */
export function stamp(root, word, tone = '') {
  const plate = root.querySelector('.plate');
  if (!plate) return;
  plate.querySelectorAll('.t-stamp').forEach((s) => s.remove());
  const s = document.createElement('span');
  s.className = 't-stamp ' + tone;
  s.textContent = word;
  s.setAttribute('aria-hidden', 'true');
  plate.appendChild(s);
  setTimeout(() => s.remove(), 2800);
}

// ------------------------------------------------------------------ gate copy
export function reasonText(api, g) {
  if (!g || g.allowed) return '';
  let r = g.reason || 'Not available right now';
  if (g.opensOn) {
    const l = dl(api, g.opensOn);
    if (l && !r.toLowerCase().includes(l.toLowerCase())) r += `. Opens ${l}`;
  }
  return r;
}
export function gateHTML(api, g) {
  const t = reasonText(api, g);
  return t ? `<p class="gate"><span class="lockdot" aria-hidden="true"></span><span>${esc(/[.!?]$/.test(t) ? t : t + '.')}</span></p>` : '';
}

// ------------------------------------------------------------------ number fields
export function fmtField(raw, dec) {
  let s = String(raw).replace(/[^0-9.]/g, '');
  if (!dec) s = s.replace(/\./g, '');
  else { const k = s.indexOf('.'); if (k >= 0) s = s.slice(0, k + 1) + s.slice(k + 1).replace(/\./g, '').slice(0, 2); }
  const parts = s.split('.');
  let i = parts[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `${i}.${parts[1]}` : i;
}
export const readNum = (inp) => Number(String(inp.value).replace(/,/g, '')) || 0;

// ------------------------------------------------------------------ segmented choices
let uid = 0;
function segHTML(id, s) {
  return `<div class="segf"><span class="segf-l" id="${id}-${s.name}-l">${esc(s.label)}</span>
    <div class="seg2" role="radiogroup" aria-labelledby="${id}-${s.name}-l" data-seg="${s.name}">${s.options.map(([v, t]) =>
      `<button type="button" role="radio" aria-checked="${String(v) === String(s.def)}" data-v="${esc(v)}" tabindex="${String(v) === String(s.def) ? 0 : -1}">${esc(t)}</button>`).join('')}</div></div>`;
}
export function wireSegs(root, onChange) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.seg2 button'); if (!b) return;
    pick(b.parentNode, b); onChange();
  });
  root.addEventListener('keydown', (e) => {
    const b = e.target.closest('.seg2 button'); if (!b) return;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const bs = [...b.parentNode.querySelectorAll('button')], k = bs.indexOf(b);
    const n = bs[(k + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length];
    pick(b.parentNode, n); n.focus(); onChange();
  });
}
function pick(group, btn) {
  group.querySelectorAll('button').forEach((x) => { const on = x === btn; x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; });
}
export function segVals(root) {
  const o = {};
  root.querySelectorAll('.seg2').forEach((g) => {
    const b = g.querySelector('[aria-checked=true]');
    if (b) { const v = b.dataset.v; o[g.dataset.seg] = v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v; }
  });
  return o;
}

// ------------------------------------------------------------------ the generic action form
/**
 * cfg: {
 *   kind: 'int' | 'money' | 'none',
 *   segs: [{name, label, options:[[value, text]], def}],
 *   label(vals): input label,
 *   resolve(vals, n) -> {type, params}   // n is 0 when empty (leave the amount out)
 *   head(vals, snap, api, g0) -> html shown above the input (quotes),
 *   hint(vals, g0) -> text when nothing is entered,
 *   preview(vals, n, dry, snap, api) -> html live preview from the engine,
 *   confirm(vals, n, dry) -> exact button text,
 *   idle(vals) -> button text when not ready,
 *   word(vals) -> stamp word, tone(vals),
 *   onDone() }
 */
export function actionForm(host, cfg) {
  const id = 'f' + (++uid);
  const money$ = cfg.kind === 'money';
  const hasIn = cfg.kind !== 'none';
  host.classList.add('aform');
  host.innerHTML = `${(cfg.segs || []).map((s) => segHTML(id, s)).join('')}
    <div class="t-head"></div>
    ${hasIn ? `<div class="fld"><label for="${id}-in" class="fld-l"></label><div class="fld-row"><input id="${id}-in" class="fld-in num" inputmode="${money$ ? 'decimal' : 'numeric'}" autocomplete="off" spellcheck="false" placeholder="${money$ ? '$0' : '0'}"><button type="button" class="btn sm max" data-max>MAX</button></div><p class="fld-max num"></p></div>` : ''}
    <div class="t-prev" aria-live="polite"></div>
    <div class="t-gate"></div>
    <button type="button" class="btn primary t-go" aria-disabled="true"></button>
    <p class="t-res" aria-live="polite"></p>`;
  const q = (s) => host.querySelector(s);
  const input = q('.fld-in'), goBtn = q('.t-go'), resEl = q('.t-res');
  let last = { snap: null, api: null }, cur = null;

  const vals = () => segVals(host);

  function update(snap, api) {
    if (snap) last.snap = snap; if (api) last.api = api;
    snap = last.snap; api = last.api;
    if (!snap || !api) return;
    const v = vals();
    const n = hasIn ? readNum(input) : 0;
    const base = cfg.resolve(v, 0);
    const g0 = api.canDo(base.type, base.params || {});
    const withN = n > 0 ? cfg.resolve(v, n) : base;
    const g = n > 0 ? api.canDo(withN.type, withN.params || {}) : g0;
    const ready = hasIn ? n > 0 && g.allowed : g0.allowed;
    let d = null;
    if (ready) d = dry(api, { type: withN.type, ...(withN.params || {}) });
    const dryErr = d && !d.ok && d.error ? d.error : '';
    const valid = ready && d && d.ok;
    cur = { valid, action: { type: withN.type, ...(withN.params || {}) }, vals: v, n };

    if (hasIn) {
      setText(q('.fld-l'), typeof cfg.label === 'function' ? cfg.label(v) : cfg.label);
      const max = g0.max;
      const mx = q('.fld-max');
      const maxTxt = g0.allowed && max > 0 ? `Up to ${money$ ? moneyFull(max) : int(max)}` : '';
      setText(mx, maxTxt);
      const mb = q('[data-max]');
      mb.setAttribute('aria-disabled', String(!(max > 0)));
      mb._max = max;
    }
    setHTML(q('.t-head'), cfg.head ? cfg.head(v, snap, api, g0) || '' : '');
    let gateG = null;
    if (!g0.allowed) gateG = g0; else if (n > 0 && !g.allowed) gateG = g;
    let gateHtml = gateG ? gateHTML(api, gateG) : dryErr ? `<p class="gate"><span class="lockdot" aria-hidden="true"></span><span>${esc(dryErr)}</span></p>` : '';
    setHTML(q('.t-gate'), gateHtml);
    let prev = '';
    if (valid) prev = cfg.preview ? cfg.preview(v, n, d, snap, api) || '' : '';
    else if (g0.allowed && !gateG && !dryErr) prev = `<p class="t-hint">${esc(cfg.hint ? cfg.hint(v, g0) : '')}</p>`;
    setHTML(q('.t-prev'), prev);
    goBtn.textContent = valid ? cfg.confirm(v, n, d) : (cfg.idle ? cfg.idle(v) : 'Confirm');
    goBtn.setAttribute('aria-disabled', String(!valid));
    goBtn.classList.toggle('ready', !!valid);
  }

  function go() {
    const { api } = last;
    if (!cur || !cur.valid) {
      const gt = q('.t-gate');
      gt.classList.remove('nudge'); void gt.offsetWidth; gt.classList.add('nudge');
      if (input && !input.value) input.focus();
      return;
    }
    if (document.activeElement && host.contains(document.activeElement)) document.activeElement.blur();
    const action = cur.action, v = cur.vals;
    const r = api.act(action);
    if (r && r.ok) {
      if (input) input.value = '';
      const txt = (r.events || []).filter((e) => e.text && e.type !== 'achievement' && e.type !== 'toolUnlock').map((e) => e.text).join(' ');
      resEl.textContent = txt;
      resEl.classList.remove('pop'); void resEl.offsetWidth; resEl.classList.add('pop');
      const root = host.closest('.tool') || host;
      stamp(root, typeof cfg.word === 'function' ? cfg.word(v) : cfg.word, cfg.tone ? cfg.tone(v) : '');
      cfg.onDone && cfg.onDone(r);
    }
    update(snapOf(api) || last.snap, api);
  }

  goBtn.addEventListener('click', go);
  if (input) {
    input.addEventListener('input', () => { input.value = fmtField(input.value, money$); update(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    q('[data-max]').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.getAttribute('aria-disabled') === 'true' || !(b._max > 0)) { const gt = q('.t-gate'); gt.classList.remove('nudge'); void gt.offsetWidth; gt.classList.add('nudge'); return; }
      input.value = fmtField(money$ ? String(Math.round(b._max * 100) / 100) : String(Math.floor(b._max)), money$);
      update(); goBtn.focus({ preventScroll: true });
    });
  }
  wireSegs(host, () => update());
  return { update, vals, el: host, get current() { return cur; }, input, setResult(t) { resEl.textContent = t; } };
}

// ------------------------------------------------------------------ misc
export function bigStat(label, key, sub) {
  return `<div class="big"><span class="k">${esc(label)}</span><span class="v num" data-v="${key}">—</span>${sub ? `<span class="sub num" data-s="${key}"></span>` : ''}</div>`;
}

export function ensure(c, build) {
  if (!c._kit) { c._kit = {}; build(c._kit, c); }
  return c._kit;
}

/** Plain tool lede: heading plus one line of what the panel does. */
export function plateHTML(title, lede, extra = '') {
  return `<div class="plate"><header class="tool-h"><h2>${esc(title)}</h2>${extra}</header>${lede ? `<p class="t-lede">${esc(lede)}</p>` : ''}</div>`;
}
