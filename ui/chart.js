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
  // The x axis runs from day 0 to a little past today, never to the end of the data: early on the line gets room to read,
  // and the axis grows as days pass. Nothing after today is plotted (no look-ahead); only published release dates are marked.
  const lastX = Math.max(today + 10, 30);
  let lo = Math.min(...pts.map((p) => p.y), snap.offerPrice, ...collars.map((c) => c.Kp));
  let hi = Math.max(...pts.map((p) => p.y), snap.offerPrice, ...collars.map((c) => c.Kc));
  // a flat line sits mid-plot: never squeeze the range under 14% of the price
  const mid = (lo + hi) / 2, minSpan = Math.max(mid * 0.14, 1);
  if (hi - lo < minSpan) { lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const padv = (hi - lo) * 0.08;
  const inDomain = tranches.filter((t) => t.x <= lastX);
  const nextRel = tranches.filter((t) => !t.released).sort((a, b) => a.x - b.x)[0] || null;
  const daysTo = (t) => (blind ? Math.max(0, t.x - today) : Math.max(0, daysBetween(snap.d, t.date)));
  return {
    blind, pts, today, tranches, inDomain, nextRel, nextInDomain: !!(nextRel && nextRel.x <= lastX), nextDays: nextRel ? daysTo(nextRel) : null,
    wins, collars, tax, calls, offer: snap.offerPrice, first: pts[0].y, lastX, lo: Math.max(0, lo - padv), hi: hi + padv, pos, label: labelFn(dates, blind), n: dates.length,
  };
}

/** The next-release countdown the phone card shows: everything from the engine snapshot and the card's published dates. */
export function nextReleaseInfo(api, snap) {
  const nr = snap && snap.nextRelease; if (!nr) return null;
  const card = api.card(), dates = card.prices.map((p) => p[0]), pos = posFn(dates), today = Math.max(0, api.history().length - 1);
  const x = pos(nr.date), blind = !!card.blind;
  const days = blind ? Math.max(0, x - today) : Math.max(0, daysBetween(snap.d, nr.date));
  return { date: nr.date, pct: nr.pct, days, frac: x > 0 ? Math.min(1, today / x) : 0 };
}

// ---- release strip: short labelled ticks on the top axis. Labels never overlap: they take row 0, then row 1, and a label that
// fits neither merges into its neighbour, which then lists both percentages ("28%+7%"), never their sum. Pixel positions come from the live scale when it exists.
const ROW = 20, CH = 15, GAP = 7;
const labW = (t) => t.length * 6.8 + 12;
function layoutStrip(m, px, area, maxRows) {
  const chipText = !m.nextInDomain && m.nextRel ? `Next release in ${m.nextDays} ${m.nextDays === 1 ? 'day' : 'days'}` : '';
  const chip = chipText ? { text: chipText, w: chipText.length * 6.1 + 16 } : null;
  if (chip) chip.left = area.right - chip.w;
  const end = Array(maxRows).fill(-1e9), items = [];
  for (const t of m.inDomain.slice().sort((a, b) => a.x - b.x)) {
    const cx = px(t.x);
    let placed = false;
    const text = `${t.pct}%`, w = labW(text);
    let left = Math.min(Math.max(cx - w / 2, area.left), area.right - w);
    for (let r = 0; r < maxRows && !placed; r++) {
      const l = r === 0 && chip ? Math.min(left, chip.left - 4 - w) : left;
      if (l >= end[r] + 4 && l >= area.left - 1) { items.push({ t, pcts: [t.pct], label: text, ticks: [cx], left: l, w, row: r }); end[r] = l + w; placed = true; }
    }
    if (!placed && items.length) {
      const prev = items[items.length - 1]; prev.pcts.push(t.pct); prev.label = prev.pcts.map((p) => `${p}%`).join('+'); prev.ticks.push(cx); prev.merged = true;
      prev.w = labW(prev.label); end[prev.row] = Math.max(end[prev.row], prev.left + prev.w);
    }
  }
  const rows = items.reduce((a, i) => Math.max(a, i.row + 1), chip ? 1 : 0);
  return { items, chip, rows };
}

// ---- narrow strip (plot under about 500px wide): every release is a small dot on the top axis (released = filled seal red,
// future = outline); only the next release carries a label ("Aug 6 · 20%"), so two labels never compete for the same space.
// When the next release is past the right edge of the axis, the "Next release in N days" chip takes the label row instead.
const NARROW = 500, DOT = 4, LAB_H = 20;
function narrowLayout(m) {
  const dots = m.inDomain.length > 0;
  const next = m.nextInDomain ? m.nextRel : null;
  const label = !!(next || (m.nextRel && !m.nextInDomain));
  return { dots, next, label, top: Math.max(8, 6 + (dots ? 14 : 0) + (label ? LAB_H + 4 : 0)) };
}
function narrowText(m) {
  const nr = m.nextRel; if (!nr) return '';
  if (m.nextInDomain) return `${m.blind ? `Day ${Math.round(nr.x) + 1}` : shortDate(nr.date)} \u00b7 ${nr.pct}%`;
  return `Next release in ${m.nextDays} ${m.nextDays === 1 ? 'day' : 'days'}`;
}
function drawNarrow(chart, S) {
  const { m, c, font } = S, area = chart.chartArea, xs = chart.scales.x, ctx = chart.ctx, L = narrowLayout(m);
  const body = css('--f-body', 'sans-serif');
  ctx.save();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const dy = area.top - 7;
  // dots, with a faint rail they sit on
  if (L.dots) {
    ctx.strokeStyle = rgba(c.seal, 0.28); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(area.left, dy); ctx.lineTo(area.right, dy); ctx.stroke();
    for (const t of m.inDomain) {
      const cx = xs.getPixelForValue(t.x), isNext = L.next && L.next.id === t.id, r = isNext ? DOT + 1.5 : DOT;
      ctx.beginPath(); ctx.arc(cx, dy, r, 0, Math.PI * 2);
      if (t.released) { ctx.fillStyle = c.seal; ctx.fill(); ctx.strokeStyle = c.paperHi; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.fillStyle = c.paperHi; ctx.fill(); ctx.strokeStyle = c.seal; ctx.lineWidth = isNext ? 2 : 1.4; ctx.stroke(); }
    }
  }
  if (L.label) {
    const text = narrowText(m);
    ctx.font = `${L.next ? 600 : 500} 11px ${L.next ? font : body}`;
    const w = Math.ceil(ctx.measureText(text).width) + 16, yb = area.top - (L.dots ? 15 : 6), yt = yb - LAB_H + 2, h = LAB_H - 2;
    let left;
    if (L.next) left = Math.min(Math.max(xs.getPixelForValue(L.next.x) - w / 2, area.left), area.right - w);
    else left = area.right - w;
    ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(left, yt, w, h, 3) : ctx.rect(left, yt, w, h));
    if (L.next) { ctx.fillStyle = c.paperHi; ctx.fill(); ctx.strokeStyle = c.seal; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = c.seal; }
    else { ctx.fillStyle = c.paper2; ctx.fill(); ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = c.ink; }
    ctx.fillText(text, left + w / 2, yt + h / 2 + 0.5);
  }
  ctx.restore();
}

function stripPlugin(getCtx) {
  return {
    id: 'ffReleaseStrip',
    afterDraw(chart) {
      const S = getCtx(); if (!S || !S.m) return;
      if (S.narrow) { drawNarrow(chart, S); return; }
      const { m, c, font } = S, area = chart.chartArea, xs = chart.scales.x, ctx = chart.ctx;
      const L = layoutStrip(m, (x) => xs.getPixelForValue(x), area, S.rows);
      ctx.save();
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.font = `500 11px ${font}`;
      const next = m.nextInDomain ? m.nextRel : null;
      for (const it of L.items) {
        const yb = area.top - GAP - it.row * ROW, yt = yb - CH;
        const released = it.t.released;
        const isNext = next && it.t.id === next.id;
        // ticks, up from the top axis to the label
        ctx.strokeStyle = released ? c.seal : isNext ? c.seal : rgba(c.seal, 0.8); ctx.lineWidth = released ? 1.6 : 1.3;
        for (const tx of it.ticks) { ctx.beginPath(); ctx.moveTo(tx, area.top); ctx.lineTo(tx, yb); ctx.stroke(); }
        // label chip
        ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(it.left, yt, it.w, CH, 2) : ctx.rect(it.left, yt, it.w, CH));
        if (released) { ctx.fillStyle = c.seal; ctx.fill(); ctx.fillStyle = c.paper; }
        else { ctx.fillStyle = c.paperHi; ctx.fill(); ctx.strokeStyle = c.seal; ctx.lineWidth = isNext ? 2 : 1; ctx.stroke(); ctx.fillStyle = c.seal; }
        if (isNext) ctx.font = `600 11px ${font}`;
        ctx.fillText(it.label, it.left + it.w / 2, yt + CH / 2 + 0.5);
        if (isNext) ctx.font = `500 11px ${font}`;
      }
      if (L.chip) {
        const k = L.chip, yt = area.top - GAP - CH;
        ctx.font = `500 11px ${css('--f-body', 'sans-serif')}`;
        ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(k.left, yt, k.w, CH, 2) : ctx.rect(k.left, yt, k.w, CH));
        ctx.fillStyle = c.paper2; ctx.fill(); ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = c.ink; ctx.fillText(k.text, k.left + k.w / 2, yt + CH / 2 + 0.5);
      }
      ctx.restore();
    },
  };
}

export function createPriceChart(host, api, getEvents = () => []) {
  host.classList.add('pchart');
  host.innerHTML = '<canvas role="img" aria-label="Price chart"></canvas><p class="pchart-sr" aria-live="off"></p>';
  const canvas = host.querySelector('canvas'), sr = host.querySelector('.pchart-sr');
  let chart = null, key = '', fallback = null;
  const S = { m: null, c: null, font: 'monospace', rows: 1, narrow: false };
  const R = { lab: (v) => String(v), blind: false, lastX: 30 };
  const Chart = window.Chart;
  const C = () => ({ ink: css('--ink', '#18262F'), muted: css('--muted', '#5B6870'), gold: css('--gold', '#B08A3E'), seal: css('--seal', '#9C2A23'), collar: css('--collar', '#2E6E72'), line: css('--paper-line', '#D9CEB4'), paper: css('--paper', '#F1ECDF'), paper2: css('--paper-2', '#E8E0CC'), paperHi: '#FBF7EC' });

  function ensureChart(m) {
    if (chart || !Chart) return;
    const c = C();
    try { const A = window['chartjs-plugin-annotation']; if (A && !Chart.registry.plugins.get('annotation')) Chart.register(A); } catch { /* already registered */ }
    chart = new Chart(canvas, {
      type: 'line',
      plugins: [stripPlugin(() => S)],
      data: { datasets: [] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        layout: { padding: { top: 30, right: 8, bottom: 0, left: 0 } },
        scales: {
          x: { type: 'linear', min: 0, max: m.lastX, grid: { color: rgba(c.line, 0.45), drawTicks: false }, border: { color: c.ink },
            ticks: { color: c.muted, maxTicksLimit: 6, padding: 6, autoSkipPadding: 14, maxRotation: 0, font: { family: css('--f-num', 'monospace'), size: 11 }, callback: (v) => R.lab(v) },
            // the last tick sits on the axis end: drop the one before it when the two labels would touch
            afterBuildTicks: (sc) => { const t = sc.ticks; if (t.length > 3 && t[t.length - 1].value - t[t.length - 2].value < R.lastX * 0.15) t.splice(t.length - 2, 1); } },
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
    const nxt = m.nextRel ? ` Next release ${m.nextDays === 0 ? 'today' : `in ${m.nextDays} ${m.nextDays === 1 ? 'day' : 'days'}`}, ${m.nextRel.pct}% of the shares.` : '';
    sr.textContent = `Close ${price(m.pts[m.pts.length - 1].y)}${m.blind ? ' (indexed)' : ''}. Offer ${price(m.offer)}. ${m.tranches.filter((t) => t.released).length} of ${m.tranches.length} releases so far.${nxt}`;
    canvas.setAttribute('aria-label', `Price chart. ${sr.textContent}`);
    if (!Chart) { fallbackSvg(m); return; }
    ensureChart(m);
    const c = C();
    R.lab = m.label; R.blind = m.blind; R.lastX = m.lastX;
    const phone = window.innerWidth < 900;
    const last = m.pts[m.pts.length - 1];
    const ds = [
      { type: 'line', data: m.pts, borderColor: c.ink, borderWidth: phone ? 2.4 : 2, borderCapStyle: 'round', borderJoinStyle: 'round', pointRadius: 0, pointHoverRadius: 3, tension: 0, order: 2,
        fill: 'start', backgroundColor: rgba(c.ink, 0.035) },
      // today, and the first close as a ring so the line always has a visible start
      { type: 'scatter', data: [last], pointRadius: 4.5, backgroundColor: c.ink, borderColor: c.paperHi, borderWidth: 2, order: 1 },
    ];
    if (m.pts.length > 1) ds.push({ type: 'scatter', data: [m.pts[0]], pointRadius: 3.5, backgroundColor: c.paperHi, borderColor: c.ink, borderWidth: 1.6, order: 1 });
    if (m.tax.length) ds.push({ type: 'scatter', data: m.tax, pointRadius: 6, pointStyle: 'rectRot', backgroundColor: c.gold, borderColor: c.ink, borderWidth: 1.2, order: 1 });
    if (m.calls.length) ds.push({ type: 'scatter', data: m.calls, pointRadius: 7, backgroundColor: c.seal, borderColor: '#F1ECDF', borderWidth: 2, order: 1 });
    chart.data.datasets = ds;
    const numFont = css('--f-num', 'monospace');
    // Reference-line labels are small paper chips at the right edge of the plot, so the price line never runs through text.
    // When the two lines are close together the chips step apart (the higher price goes up, the lower goes down).
    const plotH = (chart.chartArea && chart.chartArea.height) || Math.max(120, host.clientHeight - 60);
    const gapPx = Math.abs(m.first - m.offer) / (m.hi - m.lo) * plotH, shift = gapPx < 24 ? Math.ceil((24 - gapPx) / 2) : 0;
    const apart = { first: m.first >= m.offer ? -shift : shift, offer: m.first >= m.offer ? shift : -shift };
    const chip = (border, color, yAdjust, weight = '500') => ({ position: 'end', xAdjust: -2, yAdjust, backgroundColor: c.paperHi, borderColor: border, borderWidth: 1, borderRadius: 3,
      color, font: { family: numFont, size: 11, weight }, padding: { x: 5, y: 2 } });
    const ann = {
      // the future is not drawn, only tinted: nothing here has happened yet
      future: { type: 'box', xMin: m.today, xMax: m.lastX, backgroundColor: rgba(c.ink, 0.03), borderWidth: 0, drawTime: 'beforeDatasetsDraw' },
      first: { type: 'line', yMin: m.first, yMax: m.first, xMin: 0, xMax: m.lastX, borderColor: rgba(c.ink, 0.38), borderWidth: 1, borderDash: [1.5, 3.5],
        label: { display: m.pts.length < 40, content: m.blind ? `First ${m.first.toFixed(0)}` : `First close ${price(m.first)}`, ...chip(c.line, c.muted, apart.first) } },
      offer: { type: 'line', yMin: m.offer, yMax: m.offer, borderColor: c.gold, borderWidth: 1.2, borderDash: [5, 4],
        label: { display: true, content: m.blind ? 'Offer 100' : `Offer ${price(m.offer)}`, ...chip(c.gold, c.ink, apart.offer, '600') } },
    };
    // Release marks: every tranche keeps an entry, but only the next release inside the axis draws a full-height rule;
    // the rest are the short labelled ticks the strip plugin draws above the plot.
    m.tranches.forEach((t, i) => {
      const isNext = m.nextInDomain && m.nextRel.id === t.id;
      ann['t' + i] = { type: 'line', display: isNext, xMin: t.x, xMax: t.x, borderColor: c.seal, borderWidth: 1.4, borderDash: [4, 3] };
    });
    m.wins.forEach((w, i) => { ann['w' + i] = { type: 'box', xMin: w.x0, xMax: w.x1, backgroundColor: rgba(c.ink, w.now ? 0.1 : 0.055), borderWidth: 0, drawTime: 'beforeDatasetsDraw' }; });
    m.collars.forEach((b, i) => { ann['c' + i] = { type: 'box', xMin: b.x0, xMax: b.x1, yMin: b.Kp, yMax: b.Kc, backgroundColor: rgba(c.collar, 0.16), borderColor: c.collar, borderWidth: 1, borderDash: [4, 3], drawTime: 'beforeDatasetsDraw' }; });
    chart.options.plugins.annotation.annotations = ann;
    chart.options.scales.x.max = m.lastX;
    chart.options.scales.y.min = m.lo; chart.options.scales.y.max = m.hi;
    // room above the plot for the strip: one row, or two when labels crowd
    const area = chart.chartArea, w = host.clientWidth || 320;
    const est = area && area.width > 40 ? { left: area.left, right: area.right } : { left: 46, right: w - 12 };
    const pxEst = (x) => est.left + (x / m.lastX) * (est.right - est.left);
    S.m = m; S.c = c; S.font = numFont;
    // the chart may still be sized for the previous window width, so the host decides narrow, not the old plot area
    S.narrow = (host.clientWidth || w) - 56 < NARROW;
    if (S.narrow) { S.rows = 0; chart.options.layout.padding.top = narrowLayout(m).top; }
    else { S.rows = layoutStrip(m, pxEst, est, 2).rows; chart.options.layout.padding.top = S.rows ? GAP + S.rows * ROW + 4 : 8; }
    chart.update('none');
    // where the plot starts, so the phone's in-chart key can sit in its top-right corner
    const pa = chart.chartArea;
    if (pa) { host.style.setProperty('--plot-top', `${Math.round(pa.top)}px`); host.style.setProperty('--plot-right', `${Math.max(0, Math.round((host.clientWidth || 0) - pa.right))}px`); }
  }
  return { update, destroy() { if (chart) chart.destroy(); }, get chart() { return chart; } };
}
