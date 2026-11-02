// Compare runs (PRD 5.5, should-have): the last saved runs on the same card and seat, side by side, with this run marked.
// Reads the run summaries that ui/scoreboard.js saves under localStorage "ff.runs" (ui/achievements.js). Display only.
import { loadRuns } from './achievements.js';
import { money, pct, esc } from './format.js';

const MINUS = '−';
const MAX_ROWS = 8;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const sharpeText = (x) => (fin(x) ? (x < 0 && Math.abs(x) >= 0.05 ? MINUS : '') + Math.abs(x).toFixed(1) : '—');

function dateText(at) {
  if (!fin(at)) return 'Now';
  const t = new Date(at);
  const opts = { month: 'short', day: 'numeric' };
  if (t.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  try { return t.toLocaleDateString('en-US', opts); } catch { return t.toISOString().slice(0, 10); }
}

/**
 * @param el   container to fill
 * @param opts {cardId, seat, runId (this run's id in ff.runs), current (a run summary to show when it is not saved), watch, runs?}
 */
export function renderCompare(el, { cardId, seat, runId = null, current = null, watch = false, runs = null } = {}) {
  const all = runs || loadRuns();
  let rows = all.filter((r) => r && r.cardId === cardId && r.seat === seat);
  if (current && !rows.some((r) => r.runId === current.runId)) rows = rows.concat([{ ...current }]);
  const shown = rows.slice(-MAX_ROWS).reverse(); // newest first
  if (!shown.length) {
    el.innerHTML = `<h2 class="sc-cmp-h">Compare runs</h2><p class="sc-cmp-empty">${watch
      ? 'Watching a run does not save it. Play this card to the end, then play it again to compare.'
      : 'No saved runs yet on this card and seat.'}</p>`;
    return;
  }
  const body = shown.map((r) => {
    const here = runId != null && r.runId === runId;
    return `<tr data-run="${esc(r.runId || '')}"${here ? ' class="current" aria-current="true"' : ''}>
      <th scope="row">${esc(dateText(r.at))}${here ? `<span class="sc-cmp-tag">${esc(r.label || 'This run')}</span>` : ''}</th>
      <td class="num" data-label="After-tax wealth">${esc(money(r.afterTaxWealth))}</td>
      <td class="num" data-label="Sharpe">${esc(sharpeText(r.sharpe))}</td>
      <td class="num" data-label="Max drawdown">${esc(pct(r.maxDrawdown, 1))}</td>
      <td class="num" data-label="IRR">${esc(pct(r.irr, 1))}</td></tr>`;
  }).join('');
  const only = shown.length === 1;
  el.innerHTML = `<h2 class="sc-cmp-h">Compare runs</h2>
    <p class="sc-cmp-lede">${only ? 'This is the only saved run on this card and seat so far. Play it again to compare.' : `Your last ${shown.length} runs on this card and seat, newest first.`} Saved in this browser only.</p>
    <div class="sc-cmp-scroll"><table class="sc-cmp-table">
      <caption class="sr-only">Saved runs on this card and seat</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">After-tax wealth</th><th scope="col">Sharpe</th><th scope="col">Max drawdown</th><th scope="col">IRR</th></tr></thead>
      <tbody>${body}</tbody></table></div>`;
}

export default { renderCompare };
