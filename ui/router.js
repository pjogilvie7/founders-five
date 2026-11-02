// Hash router: #/ #/seat/{card} #/play/{card}/{seat} #/watch #/score #/method #/data #/ai #/glossary
export function parseHash(h = location.hash) {
  const parts = h.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  const [name, a, b] = parts;
  switch (name) {
    case undefined: return { name: 'title' };
    case 'seat': return a ? { name: 'seat', cardId: a } : { name: 'title' };
    case 'play': return a && b ? { name: 'play', cardId: a, seat: b } : { name: 'title' };
    case 'watch': return { name: 'watch' };
    case 'score': return { name: 'score' };
    case 'method': case 'data': case 'ai': case 'glossary': return { name: 'page', page: name };
    default: return { name: 'title' };
  }
}
export function go(path) {
  const target = '#' + (path.startsWith('/') ? path : '/' + path);
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}
export function onRoute(cb) {
  const f = () => { if (location.hash && !location.hash.startsWith('#/')) return; cb(parseHash()); };
  window.addEventListener('hashchange', f);
  return () => window.removeEventListener('hashchange', f);
}
