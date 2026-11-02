// Data loading (loadAll, loadCard) and art helpers (guilloche from ui/guilloche.js, with a built-in fallback).
import { mockData, mockCard } from './mock.js';

const params = () => new URLSearchParams(location.search);
export const isMockForced = () => params().has('mock');
let mockMode = false;
export const isMock = () => mockMode;

async function getJSON(url, required = true) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) { const e = new Error(`${url}: ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

export async function loadAll() {
  if (params().has('fail')) throw new Error('forced failure (?fail)');
  if (isMockForced()) { mockMode = true; return mockData(); }
  try {
    const meta = await getJSON('data/meta.json');
    const [log, market, cardsIndex, spcxOptions] = await Promise.all([
      getJSON('data/update-log.json').catch(() => []),
      getJSON('data/market.json').catch(() => null),
      getJSON('data/cards/index.json'),
      getJSON('data/spcx-options.json').catch(() => null),
    ]);
    if (!market) throw new Error('data/market.json missing');
    return { meta, log, market, cardsIndex, spcxOptions };
  } catch (e) {
    // Local dev convenience only: before the data job has run, serve mock data on localhost.
    if (e.status === 404 && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) { mockMode = true; return mockData(); }
    throw e;
  }
}

const cards = new Map();
export async function loadCard(id) {
  if (cards.has(id)) return cards.get(id);
  const c = mockMode ? mockCard(id) : await getJSON(`data/cards/${id}.json`);
  cards.set(id, c);
  return c;
}
export function dropCard(id) { cards.delete(id); }

// ---------------------------------------------------------------- art
let manifest;
export async function loadArt() {
  if (manifest !== undefined) return manifest;
  if (mockMode) { manifest = null; return null; }
  try { manifest = await getJSON('assets/art-manifest.json'); } catch { manifest = null; }
  return manifest;
}
export function artManifest() { return manifest || null; }

let gmod;
export async function loadGuilloche() {
  if (gmod !== undefined) return gmod;
  try { gmod = await import('./guilloche.js'); } catch { gmod = null; }
  return gmod;
}
export function guilloche() { return gmod || null; }

const f = (n) => +n.toFixed(2);
function spiro(cx, cy, R, n, d) {
  // hypotrochoid with r = R/n: n petals (n may end in .5 for a two-turn curve)
  const r = R / n, k = n - 1, turns = n % 1 ? 2 : 1, steps = 300 * turns; let path = '';
  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * Math.PI * 2 * turns;
    path += (s ? 'L' : 'M') + f(cx + (R - r) * Math.cos(t) + d * Math.cos(k * t)) + ' ' + f(cy + (R - r) * Math.sin(t) - d * Math.sin(k * t));
  }
  return path + 'Z';
}

const fallback = {
  rosette({ size = 240, rings = 7, color = 'currentColor', stroke = 0.45 } = {}) {
    const c = size / 2, R = size * 0.46; let g = '';
    const ns = [8, 11, 7.5, 12, 9, 13.5, 10, 6.5];
    for (let k = 0; k < rings; k++) {
      const Rk = R * (1 - k * 0.1), n = ns[k % ns.length], r = Rk / n;
      g += `<path d="${spiro(c, c, Rk, n, r * (0.85 + 0.12 * (k % 3)))}" />`;
    }
    g += `<circle cx="${c}" cy="${c}" r="${R * 1.02}" /><circle cx="${c}" cy="${c}" r="${R * 0.12}" />`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" fill="none" stroke="${color}" stroke-width="${stroke}" aria-hidden="true">${g}</svg>`;
  },
  securityWave({ width = 600, height = 120, lines = 22, color = 'currentColor' } = {}) {
    const w = width, h = height; let g = '';
    for (let k = 0; k < lines; k++) {
      let p = '';
      for (let x = 0; x <= w; x += 6) {
        const y = h / 2 + Math.sin(x / 38 + k * 0.28) * (h * 0.28) + Math.sin(x / 91 - k * 0.2) * (h * 0.14) + (k - lines / 2) * 1.6;
        p += (x ? 'L' : 'M') + x + ' ' + f(y);
      }
      g += `<path d="${p}" />`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" fill="none" stroke="${color}" stroke-width="0.5" aria-hidden="true">${g}</svg>`;
  },
  sealRing({ size = 120, color = 'currentColor' } = {}) {
    const c = size / 2, ticks = 72; let g = `<circle cx="${c}" cy="${c}" r="${c - 1.5}"/><circle cx="${c}" cy="${c}" r="${c - 6}"/>`;
    for (let k = 0; k < ticks; k++) { const a = k / ticks * Math.PI * 2; g += `<line x1="${f(c + Math.cos(a) * (c - 6))}" y1="${f(c + Math.sin(a) * (c - 6))}" x2="${f(c + Math.cos(a) * (c - 10))}" y2="${f(c + Math.sin(a) * (c - 10))}"/>`; }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" fill="none" stroke="${color}" stroke-width="0.7" aria-hidden="true">${g}</svg>`;
  },
  certificateBorder({ width = 300, height = 400, color = 'currentColor' } = {}) {
    const w = width, h = height;
    let g = `<rect x="3" y="3" width="${w - 6}" height="${h - 6}"/><rect x="8" y="8" width="${w - 16}" height="${h - 16}"/>`;
    const ins = 12;
    for (let k = 0; k < 4; k++) { const cx = k % 2 ? w - ins - 6 : ins + 6, cy = k > 1 ? h - ins - 6 : ins + 6; g += `<path d="${spiro(cx, cy, 14, 5, 2.6)}"/>`; }
    for (let x = 30; x < w - 30; x += 3) g += `<line x1="${x}" y1="10.5" x2="${x}" y2="12.5"/><line x1="${x}" y1="${h - 12.5}" x2="${x}" y2="${h - 10.5}"/>`;
    for (let y = 30; y < h - 30; y += 3) g += `<line x1="10.5" y1="${y}" x2="12.5" y2="${y}"/><line x1="${w - 12.5}" y1="${y}" x2="${w - 10.5}" y2="${y}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" fill="none" stroke="${color}" stroke-width="0.6" aria-hidden="true">${g}</svg>`;
  },
};

/** art('rosette', opts) -> SVG string. Uses ui/guilloche.js when it exports a working function. */
export function art(name, opts = {}) {
  const fn = gmod && gmod[name];
  if (typeof fn === 'function') {
    try { const s = fn(opts); if (typeof s === 'string' && s.includes('<svg')) return s; } catch { /* fall through */ }
  }
  return fallback[name](opts);
}
/** CSS url() data URI for an SVG string with currentColor replaced. */
export function svgUrl(svg, color) {
  const s = svg.replace(/currentColor/g, color).replace(/<svg /, (m) => (/xmlns=/.test(svg) ? m : m + 'xmlns="http://www.w3.org/2000/svg" '));
  return `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
}
export function iconUrl(key) {
  const m = manifest && manifest.icons && manifest.icons[key];
  return typeof m === 'string' ? m : null;
}
