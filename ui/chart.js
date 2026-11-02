// Price chart for the Stock tab. Chart.js 4.4.1 and the annotation plugin are loaded globally by index.html.
// Draws only what has happened (close up to today). Future marks are dates the rules already publish: releases.
// Blind cards: x axis shows relative days, y axis the indexed price (the engine already normalizes the card).
import { shortDate, daysBetween, addDays, price } from './format.js';

const css = (n, fb) => (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb);
const rgba = (hex, a) => {
  const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function posFn(dates) {
  const n = dates.length;
  return (d) => {
    if (d <= dates[0]) return 0;
    if (d > dates[n - 1]) return n - 1 + Math.round(daysBetween(dates[n - 1], d) * 5 / 7);
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < d) lo = m + 1; else hi = m; }
    return lo;
  };
}
function labelFn(dates, blind) {
  const n = dates.length;
  return (x) => {
    if (blind) return `Day ${Math.round(x) + 1}`;
    const i = Math.round(x);
    if (i >= 0 && i < n) return shortDate(dates[i]);
    if (i < 0) return shortDate(dates[0]);
    return shortDate(addDays(dates[n - 1], Math.round((i - (n - 1)) * 7 / 5)));
  };
}

/** Everything the chart draws, as plain data. Exported so tests can read it. */
export function chartModel(api, snap, extra = {}) {
  const card = api.card(), st = api.state(), hist = api.history();
  const dates = card.prices.map((p) => p[0]);
  const blind = !!card.blind;
  const pos = posFn(dates);
  const today = Math.max(0, hist.length - 1);
  const pts = hist.map((r, i) => ({ x: i, y: r.close }));
  const group = (card.lockup && card.lockup.groups || []).find((g) => g.seats.includes(st.seat));
  const tranches = ((group && group.tranches) || []).filter((t) => t.resolvedDate).map((t) => ({
    id: t.id, pct: t.pct, date: t.resolvedDate, x: pos(t.resolvedDate), released: t.resolvedDate <= snap.d,
  }));
  // Closed windows that have started by today (30 days before each earnings release until the 2nd trading day after).
  const wins = [];
  for (const e of card.earnings || []) {
    const start = addDays(e.d, -30);
    if (start > snap.d) continue;
    let i0 = dates.findIndex((x) => x > e.d);
    const endX = i0 < 0 ? pos(addDays(e.d, 4)) : i0 + 1;
    let x1 = Math.min(endX, dates.length - 1 + 6);
    if (!snap.window.open && snap.window.opensOn && snap.window.opensOn >= e.d && start <= snap.d && endX >= today) x1 = pos(snap.window.opensOn);
    wins.push({ x0: pos(start), x1, now: !snap.window.open && x1 >= today });
  }
  const collars = (st.collars || []).map((c) => ({ id: c.id, x0: pos(c.start), x1: pos(c.expiry), Kp: c.Kp, Kc: c.Kc }));
  const closeAt = (d) => { const k = Math.min(pos(d), hist.length - 1); return hist[k] ? hist[k].close : null; };
  const evs = extra.events || [];
  const tax = evs.filter((e) => e.type === 'taxPaid').map((e) => ({ x: Math.min(pos(e.d), today), y: closeAt(e.d) })).filter((p) => p.y != null);
  const calls = evs.filter((e) => (e.type === 'marginCall' && e.pause) || e.type === 'forcedSale').map((e) => ({ x: Math.min(pos(e.d), today), y: closeAt(e.d), forced: e.type === 'forcedSale' })).filter((p) => p.y != null);
  const lastX = blind ? dates.length - 1 : Math.max(today + 2, ...tranches.map((t) => t.x), ...collars.map((c) => c.x1), today + 6);
  let lo = Math.min(...pts.map((p) => p.y), snap.offerPrice, ...collars.map((c) => c.Kp));
  let hi = Math.max(...pts.map((p) => p.y), snap.offerPrice, ...collars.map((c) => c.Kc));
  const padv = (hi - lo) * 0.08 || 1;
  return { blind, pts, today, tranches, wins, collars, tax, calls, offer: snap.offerPrice, lastX, lo: Math.max(0, lo - padv), hi: hi + padv, pos, label: labelFn(dates, blind), n: dates.length };
}

export function createPriceChart(host, api, getEvents = () => []) {
  host.classList.add('pchart');
  host.innerHTML = '<canvas role="img" aria-label="Price chart"></canvas><p class="pchart-sr" aria-live="off"></p>';
  const canvas = host.querySelector('canvas'), sr = host.querySelector('.pchart-sr');
  let chart = null, key = '', fallback = null;
  const R = { lab: (v) => String(v), blind: false };
  const Chart = window.Chart;
  const C = () => ({ ink: css('--ink', '#18262F'), muted: css('--muted', '#5B6870'), gold: css('--gold', '#B08A3E'), seal: css('--seal', '#9C2A23'), collar: css('--collar', '#2E6E72'), line: css('--paper-line', '#D9CEB4') });

  function ensureChart(m) {
    if (chart || !Chart) return;
    const c = C();
    try { const A = window['chartjs-plugin-annotation']; if (A && !Chart.registry.plugins.get('annotation')) Chart.register(A); } catch { /* already registered */ }
    chart = new Chart(canvas, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        layout: { padding: { top: 6, right: 8, bottom: 0, left: 0 } },
        scales: {
          x: { type: 'linear', min: 0, max: m.lastX, grid: { color: rgba(c.line, 0.45), drawTicks: false }, border: { color: c.ink },
            ticks: { color: c.muted, maxTicksLimit: 6, padding: 6, font: { family: css('--f-num', 'monospace'), size: 11 }, callback: (v) => R.lab(v) } },
          y: { grid: { color: rgba(c.line, 0.6) }, border: { color: c.ink },
            ticks: { color: c.muted, maxTicksLimit: 5, font: { family: css('--f-num', 'monospace'), size: 11 }, callback: (v) => (R.blind ? Number(v).toFixed(0) : '$' + Number(v).toFixed(0)) } },
        },
        plugins: {
          legend: { display: false },
          annotation: { annotations: {} },
          tooltip: {
            filter: (it) => it.datasetIndex === 0,
            backgroundColor: c.ink, titleColor: '#F1ECDF', bodyColor: '#F1ECDF', displayColors: false, padding: 8, cornerRadius: 2,
            titleFont: { family: css('--f-body', 'sans-serif'), size: 12 }, bodyFont: { family: css('--f-num', 'monospace'), size: 12 },
            callbacks: { title: (it) => R.lab(it[0].parsed.x), label: (it) => (R.blind ? `Index ${it.parsed.y.toFixed(1)}` : price(it.parsed.y)) },
          },
        },
      },
    });
  }

  function fallbackSvg(m) {
    // Chart.js did not load (offline): a plain SVG line so the panel is never empty.
    if (!fallback) { fallback = document.createElement('div'); fallback.className = 'pchart-fb'; host.appendChild(fallback); canvas.hidden = true; }
    const W = 600, H = 200, X = (x) => (x / Math.max(1, m.lastX)) * W, Y = (v) => H - ((v - m.lo) / (m.hi - m.lo)) * H;
    const d = m.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
    fallback.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Close price"><path d="M0 ${Y(m.offer)}H${W}" stroke="${C().gold}" stroke-dasharray="4 4" fill="none"/><path d="${d}" stroke="${C().ink}" stroke-width="1.6" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function update(snap) {
    const evs = getEvents();
    const k = [snap.d, snap.window.open, api.state().collars.map((c) => c.id).join(), evs.length, host.clientWidth].join('|');
    if (k === key) return; key = k;
    const m = chartModel(api, snap, { events: evs });
    sr.textContent = `Close ${price(m.pts[m.pts.length - 1].y)}${m.blind ? ' (indexed)' : ''}. Offer ${price(m.offer)}. ${m.tranches.filter((t) => t.released).length} of ${m.tranches.length} releases so far.`;
    canvas.setAttribute('aria-label', `Price chart. ${sr.textContent}`);
    if (!Chart) { fallbackSvg(m); return; }
    ensureChart(m);
    const c = C();
    R.lab = m.label; R.blind = m.blind;
    const ds = [
      { type: 'line', data: m.pts, borderColor: c.ink, borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 3, tension: 0, order: 2 },
      { type: 'scatter', data: [m.pts[m.pts.length - 1]], pointRadius: 4, backgroundColor: c.ink, borderColor: '#F1ECDF', borderWidth: 2, order: 1 },
    ];
    if (m.tax.length) ds.push({ type: 'scatter', data: m.tax, pointRadius: 6, pointStyle: 'rectRot', backgroundColor: c.gold, borderColor: c.ink, borderWidth: 1.2, order: 1 });
    if (m.calls.length) ds.push({ type: 'scatter', data: m.calls, pointRadius: 7, backgroundColor: c.seal, borderColor: '#F1ECDF', borderWidth: 2, order: 1 });
    chart.data.datasets = ds;
    const ann = {
      offer: { type: 'line', yMin: m.offer, yMax: m.offer, borderColor: c.gold, borderWidth: 1.2, borderDash: [5, 4],
        label: { display: true, content: m.blind ? 'Offer 100' : `Offer ${price(m.offer)}`, position: 'start', backgroundColor: 'transparent', color: c.gold, font: { family: css('--f-num', 'monospace'), size: 10, weight: '500' }, padding: 2, yAdjust: -8 } },
    };
    const nextRel = m.tranches.filter((t) => !t.released).sort((a, b) => a.x - b.x)[0];
    m.tranches.forEach((t, i) => {
      const show = t.pct >= 15 || (nextRel && nextRel.id === t.id);
      ann['t' + i] = { type: 'line', xMin: t.x, xMax: t.x, borderColor: c.seal, borderWidth: t.released ? 1.6 : 1.2, borderDash: t.released ? [] : [3, 3],
        label: show ? { display: true, content: `${t.pct}%`, position: 'start', backgroundColor: c.seal, color: '#F1ECDF', font: { family: css('--f-num', 'monospace'), size: 10 }, padding: { x: 4, y: 1 }, borderRadius: 1, yAdjust: 2 } : { display: false } };
    });
    m.wins.forEach((w, i) => { ann['w' + i] = { type: 'box', xMin: w.x0, xMax: w.x1, backgroundColor: rgba(c.ink, w.now ? 0.1 : 0.055), borderWidth: 0, drawTime: 'beforeDatasetsDraw' }; });
    m.collars.forEach((b, i) => { ann['c' + i] = { type: 'box', xMin: b.x0, xMax: b.x1, yMin: b.Kp, yMax: b.Kc, backgroundColor: rgba(c.collar, 0.16), borderColor: c.collar, borderWidth: 1, borderDash: [4, 3], drawTime: 'beforeDatasetsDraw' }; });
    chart.options.plugins.annotation.annotations = ann;
    chart.options.scales.x.max = m.lastX;
    chart.options.scales.y.min = m.lo; chart.options.scales.y.max = m.hi;
    chart.update('none');
  }
  return { update, destroy() { if (chart) chart.destroy(); }, get chart() { return chart; } };
}
