// Seat select (PRD 5.3): two portrait cards with short rule chips; the founder card is a teased, locked card when the engine or lockup says no.
import { loadCard } from './data.js';
import { esc, longDate } from './format.js';

const SEATS = {
  engineer: {
    name: 'Early engineer', role: 'A non-affiliate employee who has held shares for over a year.',
    short: 'Employee. Shares held over a year.',
    chips: ['Lockup', 'Trading window', '30-day plan cooling-off'],
    rules: [
      'Shares unlock on the prospectus dates.',
      'You can sell only while the company’s trading window is open.',
      'A 10b5-1 plan waits 30 days before its first sale.',
    ],
  },
  founder: {
    name: 'Founder-CEO', role: 'An officer and director, which makes you an affiliate.',
    short: 'Officer and director. An affiliate.',
    chips: ['Rule 144 cap', 'No sales before day 91', '90-120 day cooling-off'],
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

// Engraved portrait emblems, drawn in code: a drafting compass for the engineer, a portico for the founder.
const EMBLEMS = {
  engineer: `<svg viewBox="0 0 96 96" aria-hidden="true" focusable="false"><defs><pattern id="hx-e" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><line x1="0" y1="0" x2="0" y2="4" stroke="#18262F" stroke-width=".6" opacity=".35"/></pattern></defs>
    <circle cx="48" cy="48" r="45" fill="#E8E0CC" stroke="#18262F" stroke-width="1.4"/><circle cx="48" cy="48" r="41" fill="url(#hx-e)" stroke="#B08A3E" stroke-width="1"/>
    <g fill="none" stroke="#18262F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="48" cy="22" r="4.5" fill="#F1ECDF"/><path d="M45 26 28 70M51 26 68 70"/><path d="M38 52h20" stroke-width="1.6"/></g>
    <path d="M28 70l-1.5 6 4-3ZM68 70l1.5 6-4-3Z" fill="#18262F"/>
    <path d="M24 78a34 34 0 0 0 48 0" fill="none" stroke="#9C2A23" stroke-width="1.6" stroke-dasharray="3 3" stroke-linecap="round"/></svg>`,
  founder: `<svg viewBox="0 0 96 96" aria-hidden="true" focusable="false"><defs><pattern id="hx-f" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><line x1="0" y1="0" x2="0" y2="4" stroke="#18262F" stroke-width=".6" opacity=".35"/></pattern></defs>
    <circle cx="48" cy="48" r="45" fill="#E8E0CC" stroke="#18262F" stroke-width="1.4"/><circle cx="48" cy="48" r="41" fill="url(#hx-f)" stroke="#B08A3E" stroke-width="1"/>
    <path d="M48.0 11.5 50.5 17.6 57.0 18.1 52.0 22.3 53.6 28.7 48.0 25.2 42.4 28.7 44.0 22.3 39.0 18.1 45.5 17.6Z" fill="#9C2A23" stroke="#18262F" stroke-width="1"/>
    <g fill="#F1ECDF" stroke="#18262F" stroke-width="2" stroke-linejoin="round"><path d="M22 44 48 32l26 12Z"/><path d="M26 47h44"/><rect x="29" y="48" width="7" height="21"/><rect x="44.5" y="48" width="7" height="21"/><rect x="60" y="48" width="7" height="21"/><path d="M22 70h52v4H22ZM18 74h60v4H18Z"/></g></svg>`,
};

const LOCK_BADGE = '<svg class="lock-badge" viewBox="0 0 28 28" focusable="false"><circle cx="14" cy="14" r="13"/><path d="M10 14v-2a4 4 0 0 1 8 0v2M9 14h10v7H9Z"/></svg>';

/** Short tag for a locked card, read from the gate reason the lockup check already gave; nothing is computed. */
function unlockTag(reason) {
  const m = /until ([A-Z][a-z]{2})[a-z]* (\d{1,2}), (\d{4})/.exec(reason || '');
  return m ? `Unlocks ${m[1]} ${m[2]}, ${m[3]}` : 'Not playable yet';
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
          return `<article class="seat${c.ok ? '' : ' sealed'}" data-seat="${k}"${c.ok ? '' : ` aria-describedby="why-${k}"`}>
            <div class="seat-emblem" aria-hidden="true">${EMBLEMS[k]}${c.ok ? '' : LOCK_BADGE}</div>
            <div class="seat-id"><h2>${s.name}</h2><p class="role">${s.short}</p></div>
            <ul class="chips" aria-label="Rules at this seat">${s.chips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
            ${c.ok ? `<button class="btn primary" data-seat-go="${k}">Take this seat</button>`
              : `<p class="unlock-tag">${esc(unlockTag(c.reason))}</p><p class="seal-note" id="why-${k}">${esc(c.reason)}</p>`}
            <details class="seat-details"><summary>Details</summary>
              <p class="role-full">${esc(s.role)}</p>
              <ul>${s.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
          </article>`;
        }).join('')}
      </div>
    </section>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seat-go]');
    if (b) { ctx.onPick(entry.id, b.dataset.seatGo); return; }
    const card = e.target.closest('.seat:not(.sealed)');
    if (card && !e.target.closest('details')) ctx.onPick(entry.id, card.dataset.seat);
  });
  el.querySelector('[data-seat-go]')?.focus({ preventScroll: true });
  return () => {};
}
