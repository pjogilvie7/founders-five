// Founder's Five: guilloche generators (Intaglio visual system).
// Pure, deterministic ES module. Every function returns an SVG string; no DOM, no randomness.
// Spirograph (hypotrochoid) rosettes, interference security waves, seal rings, certificate borders.

const INK = '#18262F';
const TAU = Math.PI * 2;

const num = (v, d = 1) => {
  const s = (Math.round(v * 10 ** d) / 10 ** d).toString();
  return s === '-0' ? '0' : s;
};

// Small deterministic string hash, used only to make SVG ids unique per call arguments.
const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Closed polyline "M x y x y ..." (implicit lineto keeps the string short).
const poly = (pts, d = 1) => {
  let out = 'M' + num(pts[0][0], d) + ' ' + num(pts[0][1], d);
  for (let i = 1; i < pts.length; i++) out += ' ' + num(pts[i][0], d) + ' ' + num(pts[i][1], d);
  return out + 'Z';
};

// Hypotrochoid points. R fixed circle, r rolling circle (R/r = k), d pen distance.
// Closes after t = 2*PI for integer k. Scaled so the max radius equals `radius`.
function hypotrochoid(k, depth, radius, phase, samples) {
  const R = 1;
  const r = R / k;
  const d = r * depth; // depth ~ 0.4..1.6 controls how far loops reach
  const max = R - r + d;
  const s = radius / max;
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * TAU;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    const c = Math.cos(phase);
    const sn = Math.sin(phase);
    pts.push([(x * c - y * sn) * s, (x * sn + y * c) * s]);
  }
  return pts;
}

/**
 * Concentric spirograph rosette. Square SVG, `size` px, crisp at any size (vector).
 * Each ring is a prolate hypotrochoid with `petals` lobes; neighbouring rings are rotated half a lobe
 * so they weave, the way banknote rosettes do. Stays under ~30 KB (point budget is capped).
 * @param {{size?:number, petals?:number, rings?:number, stroke?:number, color?:string}} o
 */
export function rosette({ size = 400, petals = 12, rings = 6, stroke = 0.6, color = INK } = {}) {
  const V = 200; // internal viewBox
  const k = Math.max(3, Math.round(petals));
  const n = Math.max(1, Math.round(rings));
  const samples = Math.max(k * 8, Math.min(k * 14, Math.floor(2600 / n)));
  let body = '';
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    const a = 0.34 - 0.16 * f; // lobe depth as a fraction of the pitch circle: deep outside, shallow inside
    const depth = a * (k - 1);
    const R = 1;
    const r = R / k;
    const maxR = (R - r) + depth * r;
    const radius = 95 - f * 52; // outer ring to inner ring (viewBox units)
    const phase = (i % 2) * (Math.PI / k) + i * 0.0;
    const pts = hypotrochoid(k, depth, radius, phase, samples);
    body += `<path d="${poly(pts, 1)}"/>`;
  }
  // Fine concentric hairlines and a tight core.
  const core = hypotrochoid(k, 0.9 * (k - 1) * 0.1 + 0.4, 14, 0, Math.max(k * 8, 96));
  body += `<path d="${poly(core, 1)}"/>`;
  body += `<circle r="98" stroke-width="${num(stroke * 1.2, 2)}"/><circle r="96.5" stroke-width="${num(stroke * 0.5, 2)}"/>`;
  body += `<circle r="${num(95 - 52 - 3, 1)}" stroke-width="${num(stroke * 0.5, 2)}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${V} ${V}" role="img" aria-hidden="true">` +
    `<g transform="translate(100 100)" fill="none" stroke="${color}" stroke-width="${num(stroke, 2)}" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`
  );
}

// Smooth interference wave as a quadratic path (T shorthand keeps it small).
function waveLine(width, y, amp, cycles, phases, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const u = (i / steps) * TAU;
    const yy =
      y +
      amp *
        (Math.sin(u * cycles[0] + phases[0]) * 0.6 +
          Math.sin(u * cycles[1] + phases[1]) * 0.3 +
          Math.sin(u * cycles[2] + phases[2]) * 0.1);
    pts.push([x, yy]);
  }
  let d = `M${num(pts[0][0])} ${num(pts[0][1])}`;
  // First quad segment needs an explicit control point; later ones use T.
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m1 = mid(pts[0], pts[1]);
  d += `L${num(m1[0])} ${num(m1[1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    d += (i === 1 ? `Q${num(pts[i][0])} ${num(pts[i][1])} ${num(m[0])} ${num(m[1])}` : `T${num(m[0])} ${num(m[1])}`);
  }
  d += `L${num(pts[pts.length - 1][0])} ${num(pts[pts.length - 1][1])}`;
  return d;
}

/**
 * Banknote security-wave background: stacked sinusoid interference lines that bunch and part.
 * Stretches to its box (preserveAspectRatio none) so it can sit behind any panel.
 * @param {{width?:number, height?:number, lines?:number, color?:string, amplitude?:number}} o
 */
export function securityWave({ width = 1200, height = 400, lines = 36, color = INK, amplitude = 18 } = {}) {
  const n = Math.max(2, Math.round(lines));
  const steps = Math.max(24, Math.min(64, Math.round(width / 18)));
  const pitch = height / (n + 1);
  let d = '';
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const y = pitch * (i + 1);
    // Two families drift in and out of phase, giving the moire "pinch" of a security print.
    const pa = f * 2.2;
    const pb = f * 1.1 + 1.2;
    const cycles = [2 + Math.floor(width / 500), 3.5 + Math.floor(width / 380), 5 + Math.floor(width / 260)];
    d += waveLine(width, y, amplitude * (0.55 + 0.45 * Math.sin(f * Math.PI)), cycles, [pa, pb, pa * 1.7], steps);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="0.6" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`
  );
}

/**
 * Circular seal stamp (wax or foil): scalloped rim, text on a circle (top half reads clockwise, bottom
 * half reads left to right), inner rosette, star dots. The central field is left open for a mark.
 * @param {{size?:number, text?:string, color?:string}} o
 */
export function sealRing({ size = 160, text = 'FOUNDER\u2019S FIVE \u00B7 REPLAY', color = INK } = {}) {
  const V = 200;
  const id = 'sr' + hash(String(text) + String(size) + color);
  const scallops = 36;
  const R0 = 96;
  const amp = 2.6;
  const pts = [];
  const N = scallops * 8;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    const r = R0 + amp * Math.abs(Math.sin((t * scallops) / 2)) - amp;
    pts.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  const rim = `<path d="${poly(pts, 1)}" stroke-width="1.4"/>`;
  const core = hypotrochoid(9, 1.1, 38, 0, 270);
  const core2 = hypotrochoid(9, 0.7, 38, Math.PI / 9, 270);

  // Split the legend into a top arc and a bottom arc.
  const up = String(text).toUpperCase();
  let parts = up.split(/\s*\u00B7\s*/).filter(Boolean);
  if (parts.length < 2) {
    const w = up.split(/\s+/).filter(Boolean);
    const h = Math.ceil(w.length / 2);
    parts = w.length > 1 ? [w.slice(0, h).join(' '), w.slice(h).join(' ')] : [up];
  }
  const h = Math.ceil(parts.length / 2);
  const top = parts.slice(0, h).join(' \u00B7 ');
  const bottom = parts.slice(h).join(' \u00B7 ');
  const fs = 14;
  const rt = 68; // top baseline radius (glyphs grow outward)
  const rb = 81; // bottom baseline radius (glyphs grow inward)
  const txtAttrs = `font-family="'Cormorant SC',Georgia,serif" font-weight="600" font-size="${fs}" letter-spacing="2.2" fill="${color}" stroke="none" text-anchor="middle"`;
  const defs =
    `<defs><path id="${id}t" d="M${-rt} 0A${rt} ${rt} 0 0 1 ${rt} 0"/><path id="${id}b" d="M${-rb} 0A${rb} ${rb} 0 0 0 ${rb} 0"/></defs>`;
  let legend = `<text ${txtAttrs}><textPath href="#${id}t" startOffset="50%">${esc(top)}</textPath></text>`;
  if (bottom) legend += `<text ${txtAttrs}><textPath href="#${id}b" startOffset="50%">${esc(bottom)}</textPath></text>`;
  const stars = [0, 1].map((i) => {
    const a = i * Math.PI;
    return `<path d="M${num(Math.cos(a) * 75 - 2.2)} ${num(Math.sin(a) * 75)}h4.4M${num(Math.cos(a) * 75)} ${num(Math.sin(a) * 75 - 2.2)}v4.4" stroke-width="0.9"/>`;
  }).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${V} ${V}" role="img" aria-label="${esc(text)}">` +
    defs +
    `<g transform="translate(100 100)" fill="none" stroke="${color}" stroke-width="0.9" stroke-linejoin="round">` +
    rim +
    `<circle r="89" stroke-width="0.7"/><circle r="50" stroke-width="1.1"/><circle r="47.500" stroke-width="0.5"/>` +
    `<path d="${poly(core, 1)}" stroke-width="0.4" opacity="0.75"/><path d="${poly(core2, 1)}" stroke-width="0.4" opacity="0.75"/>` +
    legend + stars +
    `</g></svg>`
  );
}

/**
 * Rectangular certificate border: double hairline frame, braided wave bands along each edge,
 * spirograph rosettes in the four corners, and an inner double rule.
 * @param {{width?:number, height?:number, color?:string}} o
 */
export function certificateBorder({ width = 800, height = 560, color = INK } = {}) {
  const W = width;
  const H = height;
  const o = 6; // outer frame inset
  const c0 = 17; // centre line of the band (and corner rosette centre)
  const rc = 8; // corner rosette radius
  const amp = 6.2; // half-height of the braid
  const wl = 16; // braid wavelength
  const TWO = TAU;

  const strip = (len) => {
    if (len < wl) return '';
    const cycles = Math.max(2, Math.round(len / wl));
    const n = cycles * 8;
    let a = '';
    let b = '';
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * len;
      const s = Math.sin((i / n) * cycles * TWO) * amp;
      a += (i === 0 ? 'M' : 'L') + num(x) + ' ' + num(s);
      b += (i === 0 ? 'M' : 'L') + num(x) + ' ' + num(-s);
    }
    return `<path d="${a}"/><path d="${b}"/>`;
  };

  let g = '';
  g += `<rect x="${o}" y="${o}" width="${W - 2 * o}" height="${H - 2 * o}" stroke-width="1.4"/>`;
  g += `<rect x="${o + 3}" y="${o + 3}" width="${W - 2 * o - 6}" height="${H - 2 * o - 6}" stroke-width="0.5"/>`;
  g += `<rect x="28" y="28" width="${W - 56}" height="${H - 56}" stroke-width="0.7"/>`;
  g += `<rect x="31" y="31" width="${W - 62}" height="${H - 62}" stroke-width="0.35"/>`;
  const run = (v) => v - 2 * (c0 + rc);
  g += `<g transform="translate(${c0 + rc} ${c0})">${strip(run(W))}</g>`;
  g += `<g transform="translate(${c0 + rc} ${H - c0})">${strip(run(W))}</g>`;
  g += `<g transform="translate(${c0} ${c0 + rc}) rotate(90)">${strip(run(H))}</g>`;
  g += `<g transform="translate(${W - c0} ${c0 + rc}) rotate(90)">${strip(run(H))}</g>`;
  const rp = poly(hypotrochoid(8, 1.8, rc - 0.4, 0, 160), 1);
  const rp2 = poly(hypotrochoid(8, 1.0, rc - 3, Math.PI / 8, 160), 1);
  for (const x of [c0, W - c0])
    for (const y of [c0, H - c0])
      g += `<g transform="translate(${x} ${y})"><path d="${rp}" stroke-width="0.4"/><path d="${rp2}" stroke-width="0.4"/><circle r="${rc}" stroke-width="0.7"/></g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">` +
    `<g fill="none" stroke="${color}" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.6">${g}</g></svg>`
  );
}

export default { rosette, securityWave, sealRing, certificateBorder };
