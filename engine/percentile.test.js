// percentile.test.js: the 500 random legal strategies are deterministic, legal and fast enough. Run: node --test engine/
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomStrategies, randomStrategiesAsync, randomStrategiesInBackground, percentileOf, fnv1a, mulberry32, randomPolicy } from "./percentile.js";
import { createGame, runWithPolicy, canDo, score } from "./sim.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const market = readJSON("data/market.json");
const spcxOptions = readJSON("data/spcx-options.json");
const c2 = readJSON("data/cards/c2.json");
const spcx = readJSON("data/cards/spcx.json");

test("percentile: PRNG pieces are the standard ones", () => {
  assert.equal(fnv1a(""), 0x811c9dc5);
  assert.equal(fnv1a("a"), 0xe40c292c);
  const a = mulberry32(12345), b = mulberry32(12345);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test("percentile: same card, seat and seed give the same 500 results; other seats or seeds differ", () => {
  const args = { card: c2, seat: "engineer", market, n: 500 };
  const t0 = performance.now();
  const a = randomStrategies(args);
  const ms = performance.now() - t0;
  const b = randomStrategies(args);
  assert.equal(a.length, 500);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.every((r) => Number.isFinite(r.afterTaxWealth) && Number.isFinite(r.sharpe)));
  const spread = a.map((r) => r.afterTaxWealth).sort((x, y) => x - y);
  assert.ok(spread[spread.length - 1] > spread[0] * 1.1, "strategies differ from one another");
  const c = randomStrategies({ ...args, seed: "another seed", n: 40 });
  assert.notEqual(JSON.stringify(c), JSON.stringify(a.slice(0, 40)));
  const d = randomStrategies({ ...args, seat: "founder", n: 40 });
  assert.notEqual(JSON.stringify(d), JSON.stringify(a.slice(0, 40)));
  // the default seed is the string `${card.id}|${seat}`
  assert.equal(JSON.stringify(randomStrategies({ ...args, seed: "c2|engineer", n: 40 })), JSON.stringify(a.slice(0, 40)));
  console.log(`  500 random strategies on a five-year card: ${Math.round(ms)} ms`);
});

test("percentile: SpaceX 98-day card is deterministic too", () => {
  const args = { card: spcx, seat: "engineer", market, spcxOptions, n: 500 };
  const t0 = performance.now();
  const a = randomStrategies(args);
  const ms = performance.now() - t0;
  assert.equal(JSON.stringify(a), JSON.stringify(randomStrategies(args)));
  console.log(`  500 random strategies on the live card: ${Math.round(ms)} ms`);
});

test("percentile: the async version gives the same results, in batches of 25, with progress", async () => {
  const args = { card: c2, seat: "engineer", market, n: 100 };
  const seen = [];
  const a = await randomStrategiesAsync({ ...args, onProgress: (p) => seen.push(p) });
  assert.equal(JSON.stringify(a), JSON.stringify(randomStrategies(args)));
  assert.ok(seen.length >= 4 && seen[seen.length - 1] === 1);
  assert.ok(seen.every((p, i) => i === 0 || p > seen[i - 1]));
  // without a Worker (Node) the background version falls back to the same batches
  const b = await randomStrategiesInBackground(args);
  assert.equal(JSON.stringify(b), JSON.stringify(a));
  // it can be stopped
  let stop = false;
  const c = await randomStrategiesAsync({ ...args, n: 500, shouldStop: () => stop, onProgress: () => { stop = true; } });
  assert.equal(c, null);
});

test("percentile: every action a random strategy takes is one canDo allows on that day", () => {
  const start = createGame({ card: c2, seat: "engineer", market });
  const acts = [];
  for (let seed = 1; seed <= 12; seed++) {
    const policy = randomPolicy(mulberry32(seed * 977));
    const wrapped = {
      ...policy,
      day(s, ev) {
        const list = policy.day(s, ev);
        for (const a of list) { acts.push(a.type); assert.equal(canDo(s, a.type, a).allowed, true, `${a.type} on ${s.d}`); }
        return list;
      },
    };
    const end = runWithPolicy(start, wrapped);
    assert.ok(Number.isFinite(score(end).afterTaxWealth));
    assert.ok(end.log.length <= acts.length + 50);
  }
  assert.ok(acts.length >= 10, `${acts.length} actions over 12 strategies`);
  assert.ok(new Set(acts).size >= 3, `action types: ${[...new Set(acts)].join(", ")}`);
});

test("percentileOf: share of strategies beaten, ties count half, junk ignored", () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentileOf(5.5, arr), 50);
  assert.equal(percentileOf(100, arr), 100);
  assert.equal(percentileOf(-1, arr), 0);
  assert.equal(percentileOf(5, arr), 45);
  assert.equal(percentileOf(5, [5, 5, 5, 5]), 50);
  assert.equal(percentileOf(5, [NaN, 1, undefined, 9]), 50);
  assert.equal(percentileOf(NaN, arr), null);
  assert.equal(percentileOf(5, []), null);
});
