// Achievements (PRD 4.9): the twelve, their lessons, the rail drawer list and local persistence.
// Ids match engine/debrief.js ACHIEVEMENTS. A forced bank sale is a lesson card, never a badge.
import { art } from './data.js';
import { esc } from './format.js';

export const ACHIEVEMENT_META = [
  { id: 'inside-the-window', name: 'Inside the Window', condition: 'Make your first sale in an open window.', lesson: 'Insiders can sell only while the company’s trading window is open.' },
  { id: 'cooling-off', name: 'Cooling Off', condition: 'Get a 10b5-1 plan to go live.', lesson: 'A plan waits out its cooling-off period before the first sale.' },
  { id: 'through-the-blackout', name: 'Through the Blackout', condition: 'Have a plan sell while the window is closed.', lesson: 'A plan adopted in an open window can keep selling through a blackout.' },
  { id: 'floor-plan', name: 'Floor Plan', condition: 'Put on your first collar.', lesson: 'A collar sets a floor under released shares and gives up gains above a cap.' },
  { id: 'street-smart', name: 'Street Smart', condition: 'Open the Street check.', lesson: 'A model price for a hedge is not the price a dealer will quote you.' },
  { id: 'cured', name: 'Cured', condition: 'Meet a margin call with cash.', lesson: 'Cash held back is what answers a maintenance call without a forced sale.' },
  { id: 'seal-breaker', name: 'Seal Breaker', condition: 'See every tranche release.', lesson: 'The lockup is a schedule of dates, and each date changes what you can do.' },
  { id: 'diversified', name: 'Diversified', condition: 'Hold under half of your wealth in the stock.', lesson: 'Concentration is a share of wealth, not a share count.' },
  { id: 'tax-aware', name: 'Tax Aware', condition: 'Pay less tax than The Seller and end wealthier.', lesson: 'Tax is a cost you can time, and less tax paid is not the goal by itself.' },
  { id: 'beat-holder', name: 'Beat The Holder', condition: 'Beat The Holder on at least 3 of 4 measures.', lesson: 'Doing nothing is a strategy, and it is the one to beat.' },
  { id: 'beat-seller', name: 'Beat The Seller', condition: 'Beat The Seller on at least 3 of 4 measures.', lesson: 'Selling everything early is a strategy too, with its own tax bill.' },
  { id: 'beat-playbook', name: 'Beat The Playbook', condition: 'Beat The Playbook on at least 3 of 4 measures.', lesson: 'A mixed plan of selling, hedging and holding is a hard benchmark.' },
];

const ALIASES = { 'beat-the-holder': 'beat-holder', 'beat-the-seller': 'beat-seller', 'beat-the-playbook': 'beat-playbook' };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Accepts engine ids, rail slugs or display names; returns the canonical id or null. */
export function canonicalId(x) {
  const raw = x && typeof x === 'object' ? (x.id || x.title || x.name) : x;
  let s = slug(raw);
  s = ALIASES[s] || s;
  return ACHIEVEMENT_META.some((a) => a.id === s) ? s : null;
}

// ------------------------------------------------------------------ persistence (every access wrapped)
const KEY_ACH = 'ff.achievements', KEY_FIN = 'ff.finished', KEY_RUNS = 'ff.runs';
function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch { return fallback; }
}
function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } }

export function loadEarned() {
  const v = readJSON(KEY_ACH, []);
  return new Set((Array.isArray(v) ? v : []).map(canonicalId).filter(Boolean));
}
/** Merges ids into the stored set; returns the ids that were new. */
export function saveEarned(ids) {
  const have = loadEarned(), fresh = [];
  for (const x of ids || []) { const id = canonicalId(x); if (id && !have.has(id)) { have.add(id); fresh.push(id); } }
  if (fresh.length) writeJSON(KEY_ACH, [...have]);
  return fresh;
}
export function markFinished(cardId) {
  const v = readJSON(KEY_FIN, []);
  const list = Array.isArray(v) ? v : [];
  if (cardId && !list.includes(cardId)) { list.push(cardId); writeJSON(KEY_FIN, list); }
}
/** Keeps the last 20 run summaries. A run with the same id as the newest one is not stored twice. */
export function saveRun(run) {
  const v = readJSON(KEY_RUNS, []);
  const list = Array.isArray(v) ? v : [];
  if (list.length && list[list.length - 1].runId === run.runId) return list;
  list.push(run);
  const out = list.slice(-20);
  writeJSON(KEY_RUNS, out);
  return out;
}
export function loadRuns() { const v = readJSON(KEY_RUNS, []); return Array.isArray(v) ? v : []; }

// ------------------------------------------------------------------ rendering
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** One engraved medal: sealRing from ui/guilloche.js with a numeral in the open centre. */
export function medalHTML(meta, earned, size = 112) {
  const idx = ACHIEVEMENT_META.findIndex((a) => a.id === meta.id);
  let ring = '';
  try { ring = art('sealRing', { size, text: meta.name, color: 'currentColor' }); } catch { ring = ''; }
  return `<span class="medal${earned ? ' on' : ''}" aria-hidden="true" style="--ms:${size}px">${ring}<span class="medal-n">${ROMAN[idx] || ''}</span></span>`;
}

/**
 * Rail drawer list: all twelve, earned ones lit. Unearned ones show their condition.
 * `earnedIds` may hold engine ids, rail slugs or names.
 */
export function renderAchievements(el, earnedIds) {
  const earned = new Set([...(earnedIds || [])].map(canonicalId).filter(Boolean));
  el.innerHTML = ACHIEVEMENT_META.map((a) => {
    const on = earned.has(a.id);
    return `<li data-id="${a.id}" class="${on ? 'on' : ''}"><span class="mk" aria-hidden="true"></span><span><b>${esc(a.name)}</b><small>${esc(on ? a.lesson : a.condition)}</small></span></li>`;
  }).join('');
  return earned.size;
}
