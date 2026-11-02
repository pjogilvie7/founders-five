// Overlays: three-card lesson (next/back/done, Escape closes, Enter confirms) and the engraved choice modal.
import { esc, } from './format.js';
import { art } from './data.js';

let open = 0;
export const overlayOpen = () => open > 0;

export const DEFAULT_LESSONS = {
  stock: [
    { title: 'Your shares', body: 'Every share on your certificate is locked until a seal breaks. Released shares become free to use.' },
    { title: 'Selling', body: 'You can sell free shares only while the trading window is open. Each sale costs 0.25% and the gain is taxed at 23.8%.' },
    { title: 'Where the money goes', body: 'Sale proceeds go to cash, then into the index fund if auto-invest is on. Index fund gains are taxed when you withdraw.' },
  ],
  plan: [
    { title: 'A plan sells for you', body: 'A 10b5-1 plan sells a fixed percentage of your free shares each month. It keeps selling while the window is closed.' },
    { title: 'Adopt it in an open window', body: 'You can adopt a plan only when the window is open. Changing or cancelling it starts everything over.' },
    { title: 'Cooling-off', body: 'The first sale waits out a cooling-off period, 30 days for an engineer. The tab shows the date the plan goes live.' },
  ],
  collar: [
    { title: 'A floor and a cap', body: 'A zero-cost collar buys a put below today’s price and sells a call above it. The call pays for the put, so nothing changes hands up front.' },
    { title: 'You keep the shares', body: 'You keep your shares and your vote, but you give up gains above the cap. Collared shares cannot be sold until the collar ends.' },
    { title: 'At expiry', body: 'At expiry the difference is settled in cash and taxed. You can roll the collar at that day’s prices or let it end.' },
  ],
  credit: [
    { title: 'Borrowing against your shares', body: 'You can pledge free shares and borrow up to 25% of their value. Borrowing is not a sale, so it does not realize a gain, and the loan costs interest.' },
    { title: 'The maintenance call', body: 'If the loan rises above 35% of the pledged value, the bank issues a call. You post cash, or shares are sold.' },
    { title: 'The forced sale', body: 'You have three trading days to meet a call. If the loan is still above 35% at the close of the next trading day, the bank sells enough shares at that close. That sale is taxed and ignores the window.' },
  ],
  cash: [
    { title: 'Cash', body: 'Cash earns the one-month Treasury rate. Your family’s spending comes out of it on the first trading day of each month.' },
    { title: 'The index fund', body: 'Idle cash can sit in an index fund that tracks SPY with dividends reinvested. Moving money in and out takes one click.' },
    { title: 'Tax on the way out', body: 'Index fund gains are taxed when you withdraw, at 23.8% of the gain over your average cost.' },
  ],
};

function focusables(root) {
  return [...root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter((e) => e.offsetParent !== null || e === document.activeElement);
}

function mount(node, { onEscape } = {}) {
  const prev = document.activeElement;
  const back = document.createElement('div');
  back.className = 'overlay';
  back.appendChild(node);
  document.body.appendChild(back);
  document.getElementById('root')?.setAttribute('inert', '');
  open++;
  const key = (e) => {
    if (e.key === 'Escape' && onEscape) { e.preventDefault(); e.stopPropagation(); onEscape(); }
    else if (e.key === 'Tab') {
      const f = focusables(node); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!node.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', key, true);
  requestAnimationFrame(() => back.classList.add('in'));
  return () => {
    document.removeEventListener('keydown', key, true);
    open = Math.max(0, open - 1);
    if (!open) document.getElementById('root')?.removeAttribute('inert');
    back.classList.remove('in');
    back.remove();
    if (prev && document.contains(prev)) prev.focus();
  };
}

/**
 * cards: [{title, body}]. Resolves 'done' | 'skip' | 'esc'.
 * opts: {kicker, doneLabel, skipLabel, label}
 */
export function showLesson(cards, opts = {}) {
  return new Promise((resolve) => {
    let i = 0;
    const node = document.createElement('div');
    node.className = 'dialog lesson';
    node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-label', opts.label || opts.kicker || 'Lesson');
    node.innerHTML = `
      <div class="dlg-art">${art('sealRing', { size: 120, color: '#8c6d31' })}</div>
      <p class="kicker">${esc(opts.kicker || 'Lesson')}</p>
      <div class="lesson-body" aria-live="polite"></div>
      <div class="dots" aria-hidden="true">${cards.map(() => '<i></i>').join('')}</div>
      <div class="dlg-actions">
        ${opts.skipLabel ? `<button class="btn ghost" data-a="skip">${esc(opts.skipLabel)}</button>` : ''}
        <span class="grow"></span>
        <button class="btn" data-a="back">Back</button>
        <button class="btn primary" data-a="next"></button>
      </div>`;
    const body = node.querySelector('.lesson-body'), dots = [...node.querySelectorAll('.dots i')];
    const next = node.querySelector('[data-a=next]'), backBtn = node.querySelector('[data-a=back]');
    let close;
    const finish = (r) => { close(); resolve(r); };
    const draw = () => {
      const c = cards[i];
      body.innerHTML = `<h2 class="dlg-title">${esc(c.title)}</h2><p>${esc(c.body)}</p><p class="step">${i + 1} of ${cards.length}</p>`;
      body.classList.remove('flip'); void body.offsetWidth; body.classList.add('flip');
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      backBtn.disabled = i === 0;
      next.textContent = i === cards.length - 1 ? (opts.doneLabel || 'Done') : 'Next';
    };
    node.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'next') { if (i === cards.length - 1) finish('done'); else { i++; draw(); } }
      else if (a === 'back') { if (i > 0) { i--; draw(); } }
      else if (a === 'skip') finish('skip');
    });
    node.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' && i < cards.length - 1) { i++; draw(); }
      else if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); }
      else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); next.click(); }
    });
    close = mount(node, { onEscape: () => finish('esc') });
    draw();
    next.focus();
  });
}

/**
 * Centered engraved modal with choices. choices: [{id, label, primary?, disabled?, reason?}].
 * Resolves with the chosen id; there is no Escape (a choice is required).
 */
export function showModal({ kicker, title, text, choices, tone }) {
  return new Promise((resolve) => {
    const node = document.createElement('div');
    node.className = 'dialog event' + (tone ? ' ' + tone : '');
    node.setAttribute('role', 'alertdialog'); node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-label', title || kicker || 'Decision');
    node.innerHTML = `
      <div class="dlg-art">${art('sealRing', { size: 120, color: '#8c6d31' })}</div>
      <p class="kicker">${esc(kicker || 'Your move')}</p>
      <h2 class="dlg-title">${esc(title || '')}</h2>
      <p>${esc(text || '')}</p>
      <div class="choices">${choices.map((c) => `<div class="choice"><button class="btn${c.primary ? ' primary' : ''}" data-id="${esc(c.id)}"${c.disabled ? ' aria-disabled="true"' : ''}>${esc(c.label)}</button>${c.reason ? `<span class="why">${esc(c.reason)}</span>` : ''}</div>`).join('')}</div>`;
    let close;
    node.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]'); if (!b || b.getAttribute('aria-disabled') === 'true') return;
      close(); resolve(b.dataset.id);
    });
    close = mount(node);
    (node.querySelector('button.primary:not([aria-disabled])') || node.querySelector('button:not([aria-disabled])') || node.querySelector('button'))?.focus();
  });
}
