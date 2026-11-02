import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const P = (...p) => path.join(ROOT, ...p);

export function readJson(file, fallback = undefined) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (fallback !== undefined && e.code === 'ENOENT') return fallback; throw e; }
}

const isPrim = (v) => v === null || typeof v !== 'object';

// Pretty printer that keeps price rows ([d, close, adj, vol]) on one line, so nightly diffs are one line per day.
export function stringify(v, ind = '') {
  if (isPrim(v)) return JSON.stringify(v);
  const next = ind + '  ';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every(isPrim)) return '[' + v.map((x) => JSON.stringify(x)).join(',') + ']';
    if (v.every((x) => Array.isArray(x) && x.every(isPrim)) || v.every((x) => x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every(isPrim))) {
      return '[\n' + v.map((x) => next + (Array.isArray(x) ? '[' + x.map((y) => JSON.stringify(y)).join(',') + ']' : '{' + Object.entries(x).map(([k, y]) => JSON.stringify(k) + ':' + JSON.stringify(y)).join(',') + '}')).join(',\n') + '\n' + ind + ']';
    }
    return '[\n' + v.map((x) => next + stringify(x, next)).join(',\n') + '\n' + ind + ']';
  }
  const keys = Object.keys(v);
  if (!keys.length) return '{}';
  return '{\n' + keys.map((k) => next + JSON.stringify(k) + ': ' + stringify(v[k], next)).join(',\n') + '\n' + ind + '}';
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, stringify(obj) + '\n');
  fs.renameSync(tmp, file);
}

// ISO date helpers (UTC arithmetic on YYYY-MM-DD strings)
export const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export const isoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Current date and minutes-since-midnight in New York
export function nowEastern(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
