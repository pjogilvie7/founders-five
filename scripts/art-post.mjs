// Founder's Five T5: generates the eight engraved-line tool icons (assets/icons/*.svg)
// and writes assets/art-manifest.json. Zero credits, deterministic.
// Raster vignettes were post-processed separately (grayscale -> levels -> ink #18262F alpha PNG, see assets/CREDITS.md).
//   node scripts/art-post.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#18262F';
const TAU = Math.PI * 2;
const n1 = (v) => (Math.round(v * 10) / 10).toString();

// Parallel hatch lines between two points offsets, drawn as one path.
const hatch = (x0, y0, x1, y1, count, dx, dy) => {
  let d = '';
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    d += `M${n1(x0 + (x1 - x0) * t)} ${n1(y0 + (y1 - y0) * t)}l${n1(dx)} ${n1(dy)}`;
  }
  return d;
};

const scallop = (cx, cy, r, bumps, amp) => {
  const N = bumps * 6;
  let d = '';
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    const rr = r + amp * Math.sin(t * bumps) ;
    d += (i ? 'L' : 'M') + n1(cx + Math.cos(t) * rr) + ' ' + n1(cy + Math.sin(t) * rr);
  }
  return d + 'Z';
};

const star = (cx, cy, ro, ri, pts = 5) => {
  let d = '';
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 ? ri : ro;
    const t = -Math.PI / 2 + (i * Math.PI) / pts;
    d += (i ? 'L' : 'M') + n1(cx + Math.cos(t) * r) + ' ' + n1(cy + Math.sin(t) * r);
  }
  return d + 'Z';
};

const ICONS = {
  // seal (stock): scalloped wax seal with star and ribbon tails
  stock: `<path d="${scallop(16, 14, 10.5, 14, 0.8)}"/><circle cx="16" cy="14" r="7"/><circle cx="16" cy="14" r="6" stroke-width=".6"/>` +
    `<path d="${star(16, 14, 4, 1.7)}" stroke-width="1"/>` +
    `<path d="M11.5 22.5L9 30l3.6-2 2-3.2M20.5 22.5L23 30l-3.6-2-2-3.2"/><path d="${hatch(10.5, 26, 12.2, 24.4, 2, 1.4, 1.2)}" stroke-width=".6"/>`,
  // quill and calendar (10b5-1 plan)
  plan: `<rect x="3.5" y="7.5" width="17" height="20" rx="1"/><path d="M3.5 13h17M8.5 5v5M15.5 5v5"/>` +
    `<path d="${hatch(3.5, 13.8, 20.5, 13.8, 1, 0, 0)}"/>` +
    `<path d="M6.5 17h3M11 17h3M6.5 20.5h3M11 20.5h3M6.5 24h3" stroke-width="1"/>` +
    `<path d="M29 3.5C22.5 5.5 19 11 18 18l-1 3.6 3.2-1.4C26 18 28.4 11.5 29 3.5z"/><path d="M18.4 19.8L15.5 27.5M22 7.5c-1.6 3.4-3 6.6-4 11M25 6.5c-.9 2.6-2.1 5-3.4 7.6" stroke-width=".7"/>`,
  // shield bracket (collar): a shield holding a floor and a cap
  collar: `<path d="M16 2.800L26.500 6.500v9.200c0 6.100-4.400 10.200-10.500 13.500C9.900 25.900 5.500 21.800 5.500 15.700V6.500z"/>` +
    `<path d="M13.500 10.500H10v10h3.500M18.500 10.500H22v10h-3.500" stroke-width="1.6"/><path d="M13.800 15.500h4.400" stroke-width="1" stroke-dasharray="1 1.400"/>` +
    `<path d="M16 5.200L23.800 7.900" stroke-width=".5"/><path d="${hatch(7.500, 9, 7.500, 19, 1, 0, 0)}"/>`,
  // key (credit line)
  credit: `<circle cx="9.500" cy="9.500" r="6"/><circle cx="9.500" cy="9.500" r="2.400"/><path d="M13.800 13.800L28 28M23.200 23.200l3.200-3.200M19.800 19.800l2.800-2.800"/>` +
    `<path d="M6 5.200c1.200-1.200 3.200-1.800 5.200-1.200" stroke-width=".6"/><path d="${hatch(15.5, 17, 24.500, 26, 3, -1.200, 1.200)}" stroke-width=".5"/>`,
  // columns (cash and index)
  cash: `<path d="M3.500 11L16 4l12.500 7z"/><path d="M3.500 11.800h25"/><path d="M4.500 27.500h23M3 29.500h26"/>` +
    `<path d="M7 14v11.500M12 14v11.500M20 14v11.500M25 14v11.500M16 14v11.500" /><path d="M6 14h2M11 14h2M15 14h2M19 14h2M24 14h2M6 25.500h2M11 25.500h2M15 25.500h2M19 25.500h2M24 25.500h2" stroke-width="1.6"/>` +
    `<circle cx="16" cy="8.700" r="1.300" stroke-width=".8"/>`,
  // umbrella (put)
  put: `<path d="M3 16.500C3 9 9 4 16 4s13 5 13 12.500c-2-2.300-4.200-2.300-6.500 0-2.200-2.300-4.300-2.300-6.500 0-2.200-2.300-4.300-2.300-6.500 0C7.200 14.200 5 14.200 3 16.500z"/>` +
    `<path d="M16 4v1.800M16 16.500C14 11 11 7.500 9 5.800M16 16.500C18 11 21 7.500 23 5.800M16 16.500v10.200c0 2.500-3.800 2.500-3.800 0" /><path d="${hatch(8, 12, 14, 9.800, 3, 1.600, -2.600)}" stroke-width=".5"/>`,
  // vault (exchange fund)
  exchange: `<rect x="3.500" y="4.500" width="25" height="21" rx="1.500"/><rect x="6" y="7" width="20" height="16" rx=".8" stroke-width=".7"/>` +
    `<circle cx="16" cy="15" r="6"/><circle cx="16" cy="15" r="2.200"/><path d="M16 9v3M16 18v3M10 15h3M19 15h3M11.800 10.800l2.100 2.100M18.100 17.100l2.100 2.100M20.200 10.800l-2.100 2.100M13.900 17.100l-2.100 2.100" stroke-width=".9"/>` +
    `<path d="M7 25.500v3M25 25.500v3M5.500 28.500h4M22.500 28.500h4"/><path d="M24 11v1.800M24 17v1.800" stroke-width="1.4"/>`,
  // scroll (rules)
  rules: `<path d="M8 5.500h17.500a2.500 2.500 0 0 1 2.500 2.500v1.500H25.500"/><path d="M8 5.500C5.800 5.500 4.500 7 4.500 8.800s1.300 3.200 3.500 3.200h2.500"/>` +
    `<path d="M25.500 9.500V23c0 2.500 1.200 4 3 4H9.500c-2.200 0-3-1.500-3-4V12"/><path d="M28 27c-1.800 0-3-1.300-3-3.500"/>` +
    `<path d="M10.500 13h11M10.500 16.500h11M10.500 20h8" stroke-width="1"/><path d="${hatch(8.500, 12, 8.500, 24, 1, 0, 0)}"/>`,
};

const outDir = join(ROOT, 'assets', 'icons');
mkdirSync(outDir, { recursive: true });
for (const [name, body] of Object.entries(ICONS)) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="${INK}" ` +
    `stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-hidden="true">${body}</svg>\n`;
  writeFileSync(join(outDir, `${name}.svg`), svg);
}

const manifest = {
  spcx: { vignette: 'assets/vignettes/rocket.png', revealVignette: 'assets/vignettes/rocket-orbit.png' },
  neutral: ['key', 'ship', 'bridge', 'scales', 'lighthouse', 'beehive'].map((n) => `assets/vignettes/neutral-${n}.png`),
  revealByIndustry: Object.fromEntries(
    ['software', 'consumer', 'fintech', 'health', 'mobility', 'travel', 'other'].map((n) => [n, `assets/vignettes/reveal-${n}.png`]),
  ),
  title: 'assets/title/medallion.png',
  rivals: { holder: 'assets/rivals/holder.png', seller: 'assets/rivals/seller.png', playbook: 'assets/rivals/playbook.png' },
  icons: Object.fromEntries(Object.keys(ICONS).map((n) => [n, `assets/icons/${n}.svg`])),
};
writeFileSync(join(ROOT, 'assets', 'art-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote', Object.keys(ICONS).length, 'icons and art-manifest.json');
