#!/usr/bin/env node
// Merge data/src/{id}/ pieces into data/cards/{id}.json and data/cards/index.json.
// A card ships only when it has base.json AND a lockup.json whose tranches are all reconciled:true.
import fs from 'node:fs';
import path from 'node:path';
import { P, readJson, writeJson } from './lib/io.mjs';

if (process.env.NODE_TEST_CONTEXT) process.exit(0); // see update-data.mjs

const SRC = P('data', 'src');
const OUT = P('data', 'cards');
const MAX_BLIND = 6;
const INDUSTRY_KEYS = [
  ['fintech', /fintech|financ|payment|bank|crypto|insur/i],
  ['health', /health|bio|pharma|medic|therap|life sci/i],
  ['mobility', /mobil|auto|vehicle|transport|ride|\bev\b|scooter/i],
  ['travel', /travel|hospitality|lodging|airline|vacation/i],
  ['software', /software|saas|cloud|internet|data|tech/i],
  ['consumer', /consumer|retail|fitness|food|e-?commerce|media|entertain|gaming|apparel|social/i],
];

const skipped = [], shipped = [];
const manifest = readJson(P('assets', 'art-manifest.json'), null);
const universe = readJson(P('data', 'universe.json'), null);

const pathOf = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? (v.path || v.src || v.vignette || v.revealVignette || null) : null);
function industryKey(industry) {
  const keys = manifest?.revealByIndustry || {};
  const s = String(industry || '').trim();
  if (keys[s.toLowerCase()] != null) return s.toLowerCase();
  for (const [k, re] of INDUSTRY_KEYS) if (re.test(s) && keys[k] != null) return k;
  return 'other';
}

function reconciled(lockup) {
  if (!lockup || !Array.isArray(lockup.groups) || !lockup.groups.length) return 'lockup.json has no groups';
  for (const g of lockup.groups) {
    if (!Array.isArray(g.tranches) || !g.tranches.length) return `group ${g.id} has no tranches`;
    for (const t of g.tranches) if (t.reconciled !== true) return `tranche ${g.id}/${t.id} is not reconciled`;
  }
  return null;
}

// Collect candidates
const dirs = fs.existsSync(SRC) ? fs.readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
const cands = [];
for (const id of dirs) {
  const dir = path.join(SRC, id);
  const base = readJson(path.join(dir, 'base.json'), null);
  if (!base) { skipped.push([id, 'no base.json']); continue; }
  const lockup = readJson(path.join(dir, 'lockup.json'), null);
  if (!lockup) { skipped.push([id, 'no lockup.json']); continue; }
  const why = reconciled(lockup);
  if (why) { skipped.push([id, why]); continue; }
  if (base.id && base.id !== id) { skipped.push([id, `base.json id "${base.id}" does not match folder`]); continue; }
  if (!Array.isArray(base.prices) || !base.prices.length) { skipped.push([id, 'base.json has no prices']); continue; }
  cands.push({ id, dir, base, lockup });
}

const live = cands.find((c) => c.id === 'spcx');
let blind = cands.filter((c) => c.id !== 'spcx');

// Draw order: data/universe.json drawn (or drawOrder) lists tickers or ids; else numeric id order, at most 6.
const order = (universe?.drawn?.length ? universe.drawn : universe?.drawOrder || []).map((x) => String(x?.ticker ?? x?.id ?? x).toLowerCase());
const rank = (c) => {
  const i = order.indexOf(String(c.base.ticker || '').toLowerCase());
  const j = order.indexOf(c.id.toLowerCase());
  const k = i >= 0 ? i : j;
  return k >= 0 ? k : Infinity;
};
const num = (c) => Number(c.id.replace(/\D/g, '')) || 0;
blind.sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1) || num(a) - num(b));
if (universe?.drawn?.length) {
  for (const c of blind) if (rank(c) === Infinity) skipped.push([c.id, 'reconciled but not in universe.drawn']);
  blind = blind.filter((c) => rank(c) !== Infinity);
}
if (blind.length > MAX_BLIND) {
  for (const c of blind.slice(MAX_BLIND)) skipped.push([c.id, `reconciled but beyond the first ${MAX_BLIND} in draw order`]);
  blind = blind.slice(0, MAX_BLIND);
}

function assemble(c, k /* blind position */) {
  const { id, dir, base, lockup } = c;
  const isLive = id === 'spcx';
  const headlines = readJson(path.join(dir, 'headlines.json'), []);
  const reveal = readJson(path.join(dir, 'reveal.json'), { text: '', numbersChecked: false });
  let vignette = null, revealVignette = null;
  if (manifest) {
    if (isLive) {
      vignette = pathOf(manifest.spcx?.vignette);
      revealVignette = pathOf(manifest.spcx?.revealVignette);
    } else {
      vignette = pathOf(manifest.neutral?.[k]);
      revealVignette = pathOf(manifest.revealByIndustry?.[industryKey(base.industry)]) ?? pathOf(manifest.revealByIndustry?.other);
    }
  }
  return {
    id, blind: !isLive, live: isLive,
    name: base.name, ticker: base.ticker, industry: base.industry,
    vignette, revealVignette,
    ipo: base.ipo, prices: base.prices, earnings: base.earnings || [], reports: base.reports || [],
    lockup: { groups: lockup.groups },
    headlines: Array.isArray(headlines) ? headlines : [],
    reveal,
    notes: base.notes || [],
  };
}

fs.mkdirSync(OUT, { recursive: true });
const index = [];
const write = (card, label) => {
  const file = path.join(OUT, `${card.id}.json`);
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  writeJson(file, card);
  const after = fs.readFileSync(file, 'utf8');
  shipped.push(`${card.id} (${label}, ${card.prices.length} days${before === after ? ', unchanged' : before ? ', updated' : ', new'})`);
  index.push({ id: card.id, blind: card.blind, label, vignette: card.vignette, revealVignette: card.revealVignette, tradingDays: card.prices.length });
};
if (live) write(assemble(live, -1), 'SpaceX (SPCX)');
blind.forEach((c, k) => write(assemble(c, k), `Card ${k + 1}`));
writeJson(path.join(OUT, 'index.json'), index);

console.log(`build-cards: shipped ${shipped.length}: ${shipped.join('; ') || 'none'}`);
for (const [id, why] of skipped) console.log(`build-cards: skipped ${id}: ${why}`);
if (!manifest) console.log('build-cards: assets/art-manifest.json missing; vignette paths are null');
