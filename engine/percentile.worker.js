// Web Worker for engine/percentile.js: runs the random strategies off the page's thread.
// Message in: {id, params:{card, seat, market, spcxOptions, n, seed}}. Out: {id, progress} ... then {id, done:true, results} or {id, error}.
import { randomStrategiesAsync } from "./percentile.js";

self.onmessage = async (e) => {
  const { id, params } = e.data || {};
  try {
    const results = await randomStrategiesAsync({ ...params, onProgress: (p) => self.postMessage({ id, progress: p }) });
    self.postMessage({ id, done: true, results });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
