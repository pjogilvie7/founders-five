// Tiny pub/sub store.
let state = {};
const subs = new Set();
export const getState = () => state;
export function setState(fn) {
  const patch = typeof fn === 'function' ? fn(state) : fn;
  state = { ...state, ...patch };
  for (const f of [...subs]) f(state);
}
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
