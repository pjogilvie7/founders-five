// sharecode.js: a run as a short URL-safe string. The code holds the card id, the seat and the action log; replaying the log
// with the engine on the same card and market gives the same score to the cent. No server, no login.
//
// Layout (bytes, then base64url without padding):
//   version(1) | cardId length(1) + ascii | seat(1) | action count(varint) | actions... | checksum(3)
// An action is: type(1), days since the previous action's date (varint; the first is days since 2015-01-01), then the fields
// for that type in a fixed order. A number is a varint of (n * 4 + tag): tag 0 whole number, tag 1 hundredths (0.85 -> 85),
// tag 2 a raw 64-bit float follows. The checksum is the first three bytes of a 32-bit FNV-1a over everything before it.

export const VERSION = 1;
const SEATS = ["engineer", "founder"];
const EPOCH = Date.UTC(2015, 0, 1);

const CHOICES = {
  house: ["cash", "credit", "sell", "skip"],
  marginCall: ["post", "sell", "wait"],
  collarExpiry: ["roll", "end"],
};
// type id -> [name, fields]; a field is a key (number), [key, list] for a choice, [key, "bool"] or [key, "str"] (short ascii)
const TYPES = [
  ["sell", ["shares"]],
  ["adoptPlan", ["pct", "months"]],
  ["cancelPlan", []],
  ["collar", ["shares", "tenorMonths", "putPct"]],
  ["unwindCollar", [["id", "str"]]],
  ["pledge", ["shares"]],
  ["unpledge", ["shares"]],
  ["draw", ["amount"]],
  ["repay", ["amount"]],
  ["deposit", ["amount"]],
  ["withdraw", ["amount"]],
  ["setAutoInvest", [["on", "bool"]]],
  ["house", [["choice", CHOICES.house]]],
  ["marginCall", [["choice", CHOICES.marginCall]]],
  ["collarExpiry", [["choice", CHOICES.collarExpiry]]],
  ["buyPut", ["shares", "putPct", "tenorMonths"]],
  ["exchange", ["shares"]],
];
const BY_NAME = new Map(TYPES.map((t, i) => [t[0], i]));

export class ShareCodeError extends Error {
  constructor(msg) { super(msg); this.name = "ShareCodeError"; }
}
const bad = (msg) => new ShareCodeError(msg);

// ------------------------------------------------------------------ bytes
function fnv32(bytes, n) {
  let h = 0x811c9dc5;
  for (let i = 0; i < n; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

class Writer {
  constructor() { this.b = []; }
  byte(x) { this.b.push(x & 255); }
  varint(n) {
    if (!(n >= 0) || !Number.isSafeInteger(n)) throw bad("A number in the run is out of range.");
    while (n >= 128) { this.b.push((n % 128) | 128); n = Math.floor(n / 128); }
    this.b.push(n);
  }
  number(v) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw bad("A number in the run cannot be shared.");
    if (Number.isInteger(v) && v * 4 + 3 <= Number.MAX_SAFE_INTEGER) { this.varint(v * 4); return; }
    const h = Math.round(v * 100);
    if (h / 100 === v && h * 4 + 3 <= Number.MAX_SAFE_INTEGER) { this.varint(h * 4 + 1); return; }
    this.varint(2);
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, v);
    for (let i = 0; i < 8; i++) this.b.push(dv.getUint8(i));
  }
}

class Reader {
  constructor(bytes) { this.b = bytes; this.p = 0; }
  byte() { if (this.p >= this.b.length) throw bad("The share code is cut short."); return this.b[this.p++]; }
  varint() {
    let n = 0, mul = 1;
    for (let k = 0; k < 9; k++) {
      const x = this.byte();
      n += (x & 127) * mul;
      if (!(x & 128)) return n;
      mul *= 128;
    }
    throw bad("The share code is not valid.");
  }
  number() {
    const v = this.varint(), tag = v % 4, n = Math.floor(v / 4);
    if (tag === 0) return n;
    if (tag === 1) return n / 100;
    if (tag === 2 && n === 0) {
      const dv = new DataView(new ArrayBuffer(8));
      for (let i = 0; i < 8; i++) dv.setUint8(i, this.byte());
      return dv.getFloat64(0);
    }
    throw bad("The share code is not valid.");
  }
}

const dayNo = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) throw bad("An action has no valid date.");
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - EPOCH) / 864e5);
};
const dayIso = (n) => new Date(EPOCH + n * 864e5).toISOString().slice(0, 10);

function toB64url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.slice(i, i + 0x8000));
  const b64 = typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  if (typeof str !== "string" || !/^[A-Za-z0-9_-]+$/.test(str)) throw bad("The share code has characters it should not.");
  if (str.length % 4 === 1) throw bad("The share code is not valid.");
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ------------------------------------------------------------------ encode / decode
/** @param {{cardId:string, seat:string, log:Array}} run  log = state.log: [{type, ...params, d}] */
export function encodeShare({ cardId, seat, log }) {
  if (typeof cardId !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(cardId)) throw bad("The card id cannot be shared.");
  const seatNo = SEATS.indexOf(seat);
  if (seatNo < 0) throw bad("The seat cannot be shared.");
  const w = new Writer();
  w.byte(VERSION);
  w.byte(cardId.length);
  for (let i = 0; i < cardId.length; i++) w.byte(cardId.charCodeAt(i));
  w.byte(seatNo);
  w.varint((log || []).length);
  let prev = dayNo("2015-01-01");
  for (const a of log || []) {
    const t = BY_NAME.get(a && a.type);
    if (t === undefined) throw bad(`The action "${a && a.type}" cannot be shared.`);
    w.byte(t);
    const day = dayNo(a.d);
    if (day < prev) throw bad("The log is out of order.");
    w.varint(day - prev); prev = day;
    for (const f of TYPES[t][1]) {
      if (typeof f === "string") w.number(a[f]);
      else if (f[1] === "bool") w.byte(a[f[0]] ? 1 : 0);
      else if (f[1] === "str") {
        const v = String(a[f[0]]);
        if (!/^[\x20-\x7e]{1,60}$/.test(v)) throw bad("A value in the run cannot be shared.");
        w.byte(v.length);
        for (let i = 0; i < v.length; i++) w.byte(v.charCodeAt(i));
      } else { const k = f[1].indexOf(a[f[0]]); if (k < 0) throw bad(`The choice "${a[f[0]]}" cannot be shared.`); w.byte(k); }
    }
  }
  const sum = fnv32(w.b, w.b.length);
  w.byte(sum >>> 24); w.byte(sum >>> 16); w.byte(sum >>> 8);
  return toB64url(w.b);
}

/** Returns {cardId, seat, log}. Throws ShareCodeError with a plain message for a code that is wrong, cut or tampered with. */
export function decodeShare(code) {
  const text = String(code || "").trim();
  const bytes = fromB64url(text);
  if (toB64url(bytes) !== text) throw bad("The share code is not valid.");
  if (bytes.length < 8) throw bad("The share code is too short.");
  const n = bytes.length - 3;
  const sum = fnv32(bytes, n);
  if (bytes[n] !== ((sum >>> 24) & 255) || bytes[n + 1] !== ((sum >>> 16) & 255) || bytes[n + 2] !== ((sum >>> 8) & 255)) {
    throw bad("The share code does not check out. It may have been cut or changed.");
  }
  const r = new Reader(bytes.slice(0, n));
  if (r.byte() !== VERSION) throw bad("This share code is from a different version of the game.");
  const len = r.byte();
  let cardId = "";
  for (let i = 0; i < len; i++) cardId += String.fromCharCode(r.byte());
  const seat = SEATS[r.byte()];
  if (!seat || !/^[A-Za-z0-9_-]+$/.test(cardId)) throw bad("The share code is not valid.");
  const count = r.varint();
  const log = [];
  let day = dayNo("2015-01-01");
  for (let k = 0; k < count; k++) {
    const t = TYPES[r.byte()];
    if (!t) throw bad("The share code is not valid.");
    day += r.varint();
    const a = { type: t[0] };
    for (const f of t[1]) {
      if (typeof f === "string") a[f] = r.number();
      else if (f[1] === "bool") a[f[0]] = r.byte() === 1;
      else if (f[1] === "str") { const n2 = r.byte(); let v = ""; for (let i = 0; i < n2; i++) v += String.fromCharCode(r.byte()); a[f[0]] = v; }
      else { const v = f[1][r.byte()]; if (v === undefined) throw bad("The share code is not valid."); a[f[0]] = v; }
    }
    a.d = dayIso(day);
    log.push(a);
  }
  if (r.p !== n) throw bad("The share code is not valid.");
  return { cardId, seat, log };
}

/** The link the Copy button hands out. `base` is the page URL without a hash. */
export function shareLink(code, base) {
  const b = base != null ? base : (typeof location !== "undefined" ? location.href.split("#")[0] : "");
  return `${b}#/code/${code}`;
}

// ------------------------------------------------------------------ replay
/**
 * Replays a decoded code on its card. Returns {state, score}; `cfg` is {card, market, spcxOptions?}. Imports the engine lazily so
 * encode/decode stay light.
 */
export async function replayShare(decoded, cfg) {
  const { replay, score } = await import("./sim.js");
  const state = replay({ card: cfg.card, seat: decoded.seat, market: cfg.market, spcxOptions: cfg.spcxOptions || null }, decoded.log, { toEnd: true });
  return { state, score: score(state) };
}

/**
 * Everything the scoreboard needs for a shared run, in the shape app.js keeps for a finished game (lastResult):
 * {cardId, seat, watch:false, shared:true, card, state, snap, score, botScores, achievements}.
 */
export async function resultFromShare(decoded, { card, market, spcxOptions = null }) {
  const [sim, bots] = await Promise.all([import("./sim.js"), import("./bots.js")]);
  const { state, score } = await replayShare(decoded, { card, market, spcxOptions });
  const cache = (globalThis.__ffBots ||= new Map());
  const botScores = {};
  for (const id of bots.BOTS) {
    const key = `${card.id}|${decoded.seat}|${id}|${card.prices.length}`;
    let r = cache.get(key);
    if (!r) { r = bots.runBot(id, card, decoded.seat, market, spcxOptions); cache.set(key, r); }
    botScores[id] = r.score;
  }
  return { cardId: card.id, seat: decoded.seat, watch: false, shared: true, card, state, snap: sim.snapshot(state), score, botScores, achievements: [] };
}
