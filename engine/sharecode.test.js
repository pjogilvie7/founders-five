// sharecode.test.js: round trip, replay to the cent on a real card, tamper rejection. Run: node --test engine/
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeShare, decodeShare, shareLink, replayShare, resultFromShare, ShareCodeError, VERSION } from "./sharecode.js";
import { runBot, BOTS } from "./bots.js";
import { score } from "./sim.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const market = readJSON("data/market.json");
const spcxOptions = readJSON("data/spcx-options.json");
const c1 = readJSON("data/cards/c1.json");
const spcx = readJSON("data/cards/spcx.json");

test("share code: round trip of every action type, including fractions and floats", () => {
  const log = [
    { type: "sell", shares: 1234567, d: "2020-03-02" },
    { type: "adoptPlan", pct: 5, months: 12, d: "2020-03-02" },
    { type: "cancelPlan", d: "2020-04-01" },
    { type: "collar", shares: 90000, tenorMonths: 12, putPct: 0.85, d: "2020-04-01" },
    { type: "unwindCollar", id: "c3", d: "2020-05-04" },
    { type: "pledge", shares: 50000, d: "2020-05-04" },
    { type: "draw", amount: 1234567.89, d: "2020-05-05" },
    { type: "repay", amount: 0.1 + 0.2, d: "2020-05-06" },
    { type: "deposit", amount: 250000, d: "2020-05-06" },
    { type: "withdraw", amount: 1e9, d: "2020-05-07" },
    { type: "setAutoInvest", on: false, d: "2020-05-07" },
    { type: "house", choice: "credit", d: "2021-09-01" },
    { type: "marginCall", choice: "wait", d: "2021-09-02" },
    { type: "collarExpiry", choice: "roll", d: "2021-09-03" },
    { type: "buyPut", shares: 20000, putPct: 0.9, tenorMonths: 6, d: "2021-09-03" },
    { type: "exchange", shares: 400000, d: "2024-12-31" },
    { type: "unpledge", shares: 1, d: "2024-12-31" },
  ];
  const code = encodeShare({ cardId: "c1", seat: "founder", log });
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const back = decodeShare(code);
  assert.equal(back.cardId, "c1");
  assert.equal(back.seat, "founder");
  assert.deepEqual(back.log, log);
  assert.ok(VERSION >= 1);
  assert.equal(shareLink(code, "http://x/y/"), `http://x/y/#/code/${code}`);
});

test("share code: a bot run on a real five-year card replays to the cent", async () => {
  for (const bot of BOTS) {
    const run = runBot(bot, c1, "engineer", market, null);
    const code = encodeShare({ cardId: "c1", seat: "engineer", log: run.state.log });
    const dec = decodeShare(code);
    assert.deepEqual(dec.log, run.state.log.map((a) => ({ ...a })));
    const { state, score: sc } = await replayShare(dec, { card: c1, market });
    const want = run.score;
    assert.equal(sc.afterTaxWealth, want.afterTaxWealth, `${bot} wealth`);
    assert.equal(Math.round(sc.afterTaxWealth * 100), Math.round(want.afterTaxWealth * 100));
    assert.equal(sc.sharpe, want.sharpe);
    assert.equal(sc.irr, want.irr);
    assert.equal(JSON.stringify(state.history), JSON.stringify(run.state.history));
    assert.ok(code.length < 3000, `${bot} code is ${code.length} characters`);
  }
});

test("share code: the live SpaceX card replays too, and resultFromShare returns what the scoreboard needs", async () => {
  const run = runBot("playbook", spcx, "engineer", market, spcxOptions);
  const code = encodeShare({ cardId: "spcx", seat: "engineer", log: run.state.log });
  const res = await resultFromShare(decodeShare(code), { card: spcx, market, spcxOptions });
  assert.equal(res.score.afterTaxWealth, run.score.afterTaxWealth);
  assert.equal(res.shared, true);
  assert.equal(res.watch, false);
  assert.deepEqual(Object.keys(res.botScores).sort(), [...BOTS].sort());
  assert.equal(res.botScores.holder.afterTaxWealth, runBot("holder", spcx, "engineer", market, spcxOptions).score.afterTaxWealth);
  assert.equal(score(res.state).afterTaxWealth, run.score.afterTaxWealth);
});

test("share code: an empty log is a valid run; the code is short", () => {
  const code = encodeShare({ cardId: "c3", seat: "engineer", log: [] });
  assert.ok(code.length < 30);
  assert.deepEqual(decodeShare(code), { cardId: "c3", seat: "engineer", log: [] });
});

test("share code: the retired house \"skip\" choice is refused on encode, and an old code that carries it is rejected cleanly", () => {
  const good = encodeShare({ cardId: "c1", seat: "engineer", log: [{ type: "house", choice: "cash", d: "2020-03-02" }] });
  const bytes = [...Buffer.from(good, "base64url")];
  const n = bytes.length - 3;
  bytes[n - 1] = 3; // the choice byte is the last one before the checksum; 3 was "skip"
  let h = 0x811c9dc5;
  for (let i = 0; i < n; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  bytes[n] = (h >>> 24) & 255; bytes[n + 1] = (h >>> 16) & 255; bytes[n + 2] = (h >>> 8) & 255;
  const old = Buffer.from(bytes).toString("base64url");
  assert.throws(() => decodeShare(old), (e) => e instanceof ShareCodeError && /earlier version of the game/.test(e.message));
  assert.throws(() => encodeShare({ cardId: "c1", seat: "engineer", log: [{ type: "house", choice: "skip", d: "2020-03-02" }] }), ShareCodeError);
});

test("share code: a changed, cut or padded code is rejected by the checksum", () => {
  const run = runBot("playbook", c1, "engineer", market, null);
  const code = encodeShare({ cardId: "c1", seat: "engineer", log: run.state.log });
  decodeShare(code);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let rejected = 0, tried = 0;
  for (let pos = 0; pos < code.length - 1; pos += Math.max(1, Math.floor(code.length / 40))) {
    const ch = code[pos];
    const swap = alphabet[(alphabet.indexOf(ch) + 7) % 64];
    const bad = code.slice(0, pos) + swap + code.slice(pos + 1);
    tried++;
    assert.throws(() => decodeShare(bad), ShareCodeError, `changed character ${pos}`);
    rejected++;
  }
  assert.equal(rejected, tried);
  assert.ok(tried >= 20);
  assert.throws(() => decodeShare(code.slice(0, -4)), ShareCodeError);
  assert.throws(() => decodeShare(code + "AAAA"), ShareCodeError);
  assert.throws(() => decodeShare(code.slice(1)), ShareCodeError);
  assert.throws(() => decodeShare(""), ShareCodeError);
  assert.throws(() => decodeShare("not a code!"), ShareCodeError);
  assert.throws(() => encodeShare({ cardId: "c1", seat: "engineer", log: [{ type: "nope", d: "2020-01-01" }] }), ShareCodeError);
  assert.throws(() => encodeShare({ cardId: "c1", seat: "owner", log: [] }), ShareCodeError);
});

test("share code: random legal strategies (every action type, margin calls, forced answers) replay to the cent", async () => {
  const { randomPolicy, mulberry32 } = await import("./percentile.js");
  const { createGame, runWithPolicy } = await import("./sim.js");
  const kinds = new Set();
  for (const [card, seat, opts] of [[c1, "engineer", null], [c1, "founder", null], [spcx, "engineer", spcxOptions]]) {
    for (let seed = 1; seed <= 6; seed++) {
      const cfg = { card, seat, market, spcxOptions: opts };
      const end = runWithPolicy(createGame(cfg), randomPolicy(mulberry32(seed * 101)));
      end.log.forEach((a) => kinds.add(a.type));
      const dec = decodeShare(encodeShare({ cardId: card.id, seat, log: end.log }));
      const { state, score: sc } = await replayShare(dec, { card, market, spcxOptions: opts });
      assert.equal(sc.afterTaxWealth, score(end).afterTaxWealth, `${card.id} ${seat} seed ${seed} (${end.log.length} actions)`);
      assert.equal(JSON.stringify(state.history), JSON.stringify(end.history));
    }
  }
  assert.ok(kinds.size >= 8, `random runs used ${kinds.size} action types: ${[...kinds].join(", ")}`);
});
