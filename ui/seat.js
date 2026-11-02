// Seat select (PRD 5.3): two engraved cards; the founder card is sealed when the engine or lockup says no.
import { art, loadCard } from './data.js';
import { esc, longDate } from './format.js';

const SEATS = {
  engineer: {
    name: 'Early engineer', role: 'A non-affiliate employee who has held shares for over a year.',
    rules: [
      'Shares unlock on the prospectus dates.',
      'You can sell only while the company’s trading window is open.',
      'A 10b5-1 plan waits 30 days before its first sale.',
    ],
  },
  founder: {
    name: 'Founder-CEO', role: 'An officer and director, which makes you an affiliate.',
    rules: [
      'Same lockup and trading window, plus a longer 10b5-1 cooling-off: the later of 90 days or 2 business days after the next 10-Q or 10-K, up to 120.',
      'Rule 144 caps what you can sell in any three months.',
      'No sale before day 91 after the IPO.',
    ],
  },
};

/** Returns {ok, reason}. Uses a lockup check, then the engine's own refusal if it throws. */
export function seatCheck(card, seat, engine) {
  const g = card.lockup && card.lockup.groups.find((x) => x.seats.includes(seat));
  if (!g) {
    return { ok: false, reason: card.id === 'spcx' && seat === 'founder'
      ? 'The founder’s shares are locked until June 12, 2027 (424B4).' : 'This seat is not playable on this card.' };
  }
  if (engine) {
    try { engine.createGame({ card, seat, market: { spy: [], rates: { dgs1mo: [], dgs1: [], sofr: [] } } }); }
    catch (e) { if (e && e.reason) return { ok: false, reason: e.reason }; if (e && /locked until|not playable/i.test(e.message || '')) return { ok: false, reason: e.message }; }
  }
  return { ok: true, reason: '' };
}

export async function renderSeat(el, ctx) {
  const entry = ctx.entry;
  el.innerHTML = `<section class="seat-screen"><p class="loading-line" role="status">Opening the card…</p></section>`;
  let card;
  try { card = await loadCard(entry.id); }
  catch { el.innerHTML = `<section class="seat-screen"><div class="alert err" role="alert"><p>This card could not load.</p><a class="btn" href="#/">Back</a></div></section>`; return () => {}; }
  const engine = ctx.engine;
  const checks = { engineer: seatCheck(card, 'engineer', engine), founder: seatCheck(card, 'founder', engine) };
  const live = !!card.live;
  const cardNote = live
    ? `Live card: ${entry.tradingDays} trading days so far. Not comparable with five-year cards.`
    : 'Five years of trading days. The company is revealed when the card ends.';
  el.innerHTML = `
    <section class="seat-screen" aria-labelledby="s-h">
      <a class="back" href="#/">‹ Back</a>
      <p class="kicker">${esc(entry.label)}</p>
      <h1 id="s-h">Choose your seat</h1>
      <p class="lede2">${esc(cardNote)}</p>
      <div class="seats">
        ${['engineer', 'founder'].map((k) => {
          const s = SEATS[k], c = checks[k];
          return `<article class="seat${c.ok ? '' : ' sealed'}" data-seat="${k}">
            <div class="seat-art" aria-hidden="true">${art('rosette', { size: 160, rings: 5, color: '#CDBF9F' })}</div>
            <h2>${s.name}</h2><p class="role">${s.role}</p>
            <ul>${s.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
            ${c.ok ? `<button class="btn primary" data-seat-go="${k}">Take this seat</button>`
              : `<div class="seal-note"><svg class="padlock" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10"/><path d="M8 11V9.5a3 3 0 0 1 6 0V11M7 11h8v6H7Z"/></svg><p id="why-${k}">${esc(c.reason)}</p></div>
                 <button class="btn" aria-disabled="true" aria-describedby="why-${k}">Sealed</button>`}
          </article>`;
        }).join('')}
      </div>
    </section>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seat-go]'); if (b) ctx.onPick(entry.id, b.dataset.seatGo);
  });
  el.querySelector('[data-seat-go]')?.focus({ preventScroll: true });
  return () => {};
}
