// Protective Put tab (should-have): buy puts on free shares. Premium is the engine's model price.
import {
  esc, int, money, moneyFull, price, dl, dry, safe, setText, setHTML, actionForm, ensure, plateHTML, snapOf, tween,
} from './kit.js';

const newPut = (d) => d.after.puts.find((p) => !d.before.puts.some((o) => o.id === p.id));

function build(k, c) {
  c.innerHTML = `<div class="tool put">
    ${plateHTML('Protective Put', 'A put pays you if the price ends below its strike. It costs a premium up front, paid from cash and then the index fund, and the shares stay free to sell.', '<span class="chip" data-v="n"></span>')}
    <section class="box" aria-labelledby="pu-h"><h3 id="pu-h">Buy a put</h3><div data-v="form"></div></section>
    <section class="box" aria-labelledby="pu-a"><h3 id="pu-a">Your puts</h3><div data-v="list"></div></section>
  </div>`;
  k.form = actionForm(c.querySelector('[data-v=form]'), {
    kind: 'int',
    segs: [
      { name: 'put', label: 'Strike, as a share of today’s price', options: [[0.8, '80%'], [0.85, '85%'], [0.9, '90%']], def: 0.85 },
      { name: 'tenor', label: 'Tenor', options: [[6, '6 months'], [12, '12 months']], def: 12 },
    ],
    label: () => 'Shares to protect',
    head: (v, snap, api, g0) => {
      if (!g0.allowed) return '';
      const d = dry(api, { type: 'buyPut', shares: 1, putPct: v.put, tenorMonths: v.tenor });
      const p = d.ok && newPut(d); if (!p) return '';
      return `<div class="quote"><div class="q-top"><span class="tag model">model price</span><span class="num q-meta">${v.tenor}-month put, ends ${esc(dl(api, p.expiry))}</span></div>
        <div class="q-grid two"><div><span class="k">Strike</span><span class="v num">${price(p.K)}</span><span class="sub num">${Math.round(v.put * 100)}% of today’s ${price(snap.close)}</span></div>
        <div><span class="k">Premium per share</span><span class="v num">${price(p.premium)}</span><span class="sub">paid up front</span></div></div></div>`;
    },
    resolve: (v, n) => ({ type: 'buyPut', params: { putPct: v.put, tenorMonths: v.tenor, ...(n > 0 ? { shares: n } : {}) } }),
    hint: () => 'Enter a number of shares, or press MAX.',
    idle: () => 'Buy puts',
    confirm: (v, n, d) => { const p = newPut(d); return `Buy puts on ${int(n)} shares for ${moneyFull(p ? p.premium : 0)}`; },
    word: () => 'HEDGED', tone: () => 'tone-collar',
    preview: (v, n, d, snap, api) => {
      const p = newPut(d); if (!p) return '';
      return `<dl class="pv"><div><dt>Premium, model price</dt><dd class="num">${moneyFull(p.premium)}</dd></div><div><dt>Strike</dt><dd class="num">${price(p.K)}</dd></div><div><dt>Cash after</dt><dd class="num">${moneyFull(d.after.cash)}</dd></div></dl>
        <p class="t-hint">The put pays only if the close on ${esc(dl(api, p.expiry))} is under ${price(p.K)}. If it ends worthless the premium is a capital loss.</p>`;
    },
    onDone: () => safe('put', () => draw(c, snapOf(c._api) || c._snap, c._api)),
  });
}

function draw(c, snap, api) {
  const q = (s) => c.querySelector(s);
  setText(q('[data-v=n]'), snap.puts.length ? `${snap.puts.length} open` : 'None open');
  setHTML(q('[data-v=list]'), snap.puts.length
    ? `<ul class="rows">${snap.puts.map((p) => `<li class="row-item"><div class="r-main"><b class="num">${int(p.shares)} shares</b><span class="num">strike ${price(p.K)} · ${p.tenorMonths} months</span><span class="num">ends ${esc(dl(api, p.expiry))}</span></div>
      <div class="r-side"><span class="k">Model value</span><b class="num">${money(p.mark)}</b><span class="t-hint">Premium paid ${money(p.premium)}</span></div></li>`).join('')}</ul>`
    : '<p class="empty">No open puts.</p>');
  c._kit.form.update(snap, api);
}

export default {
  id: 'put', label: 'Protective Put', icon: 'assets/icons/put.svg', hotkey: '6',
  lesson: [
    { title: 'Insurance on your shares', body: 'A put pays you the difference if the price ends below its strike. You pay a premium up front whether or not it pays.' },
    { title: 'You keep the upside', body: 'Unlike a collar, a put does not cap your gains. The price of that is the premium, paid from cash and then the index fund.' },
    { title: 'At expiry', body: 'The put is settled in cash at expiry and taxed. If it ends worthless, the premium is a capital loss.' },
  ],
  // "Why it matters": the deeper deck behind the ? button, opened only when the player asks for it.
  deeper: [
    { title: "Insurance with a premium", body: "A put gives you the right to sell at the strike until it expires. If the stock crashes, the put pays the fall below the strike. If it does not, the premium is gone, like an insurance premium in a year with no claim." },
    { title: "Put or collar", body: "A collar usually costs nothing up front because you give up the upside. A put keeps every dollar of upside and charges a premium instead. So a collar costs upside later; a put costs cash now." },
    { title: "What sets the price", body: "Puts cost more when the strike is closer to today’s price, when they run longer, and when the stock is more volatile. A 90% put for 12 months on a jumpy new stock can cost a large slice of the shares’ value." },
    { title: "A worked example", body: "Stock at $100, an 85% put, premium $8 a share. If the stock ends at $60, the put pays $25, so you are down $23 a share instead of $40. If it ends at $130, the put pays nothing and you are up $22 instead of $30." },
  ],
  render(c, snap, api) {
    c._snap = snap; c._api = api;
    ensure(c, (k) => build(k, c));
    draw(c, snap, api);
  },
};
