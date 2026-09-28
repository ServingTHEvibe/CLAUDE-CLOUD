// Goodie Concierge — a short, on-brand order intake.
// UI + conversation only. Payload shape and submission live in lib/orders.js.
import {
  buildOrderLead, submitOrder, formatOrderSummary, getSiteConfig, compressImage, OrderError,
} from './lib/orders.js';

const DRAFT_KEY = 'tmg-concierge-v1';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const prettyDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
};
const firstName = (n) => (n || '').trim().split(/\s+/)[0] || 'friend';

const COLORS = [
  ['Pink', '#ff5fa2'], ['Gold', '#d9a441'], ['Black', '#111'], ['White', '#f7f3ec'],
  ['Blue', '#4a7bd8'], ['Purple', '#8a5cd6'], ['Red', '#d8343f'], ['Green', '#3f9d6b'], ['Pastels', '#f3c6d9'],
];

const STEPS = [
  {
    key: 'orderType', label: 'Order', kind: 'choice',
    ask: () => "Hey, welcome in. What are we making today?",
    options: ['Birthday cake', 'Cookies', 'Treat box', 'Something custom'],
  },
  {
    key: 'products', label: 'Details', kind: 'text', optional: true, skip: 'Not sure yet',
    ask: (a) => ({
      'Birthday cake': 'Love that. Any flavor or cake details in mind?',
      Cookies: 'Good call. Which cookies are you craving?',
      'Treat box': 'A little of everything. What should go in the box?',
      'Something custom': "Let's hear it. What are you picturing?",
    }[a.orderType] || 'Tell me a little more.'),
    placeholder: (a) => (a.orderType === 'Cookies' ? 'e.g. chocolate chip' : 'Flavors, style, anything'),
  },
  {
    key: 'eventType', label: 'Occasion', kind: 'choice', other: true,
    ask: () => "What's the occasion?",
    options: ['Birthday', 'Baby shower', 'Wedding', 'Graduation', 'Corporate', 'Holiday', 'Just because'],
  },
  {
    key: 'quantity', label: 'Quantity', kind: 'number', optional: true, skip: 'Not sure yet',
    ask: (a) => (a.orderType === 'Cookies' ? 'How many cookies are we talking?' : 'About how many people are we feeding?'),
    chips: (a) => (a.orderType === 'Cookies' ? ['12', '24', '48', '100'] : ['10', '25', '50', '100']),
  },
  {
    key: 'eventDate', label: 'Date', kind: 'date',
    ask: (a) => (a.eventType && a.eventType !== 'Just because' ? `When's the ${a.eventType.toLowerCase()}?` : 'When do you need it?'),
  },
  {
    key: 'fulfillment', label: 'Pickup / delivery', kind: 'choice',
    ask: () => "Pickup or delivery? We'll confirm what's available for your date.",
    options: ['Pickup', 'Delivery', 'Not sure yet'],
  },
  {
    key: 'theme', label: 'Theme & colors', kind: 'theme', optional: true,
    ask: () => 'Any theme or colors? Tap a few, type a theme, or skip.',
  },
  {
    key: 'referenceImages', label: 'Photos', kind: 'images', optional: true,
    ask: () => 'Got inspiration pics? Add up to 3 and we\'ll see what you see.',
  },
  {
    key: 'notes', label: 'Notes', kind: 'textarea', optional: true, skip: 'Nothing else',
    ask: () => 'Anything else? Names or messages, allergies, the vibe…',
  },
  {
    key: 'name', label: 'Name', kind: 'text', autocomplete: 'name',
    ask: () => "Almost done. What's your name?", placeholder: () => 'Your name',
  },
  {
    key: 'contact', label: 'Contact', kind: 'contact',
    ask: (a) => `Nice to meet you, ${esc(firstName(a.name))}. Where can we reach you? Phone, email, or both.`,
  },
];

function display(step, a) {
  switch (step.key) {
    case 'eventDate': return a.eventDate ? prettyDate(a.eventDate) : '';
    case 'quantity': return a.quantity || 'Not sure yet';
    case 'products': return a.products || 'Not sure yet';
    case 'theme': return [a.theme, a.colors && a.colors.join(', ')].filter(Boolean).join(' · ') || 'No theme yet';
    case 'referenceImages': return a.referenceImages && a.referenceImages.length ? `${a.referenceImages.length} photo${a.referenceImages.length > 1 ? 's' : ''}` : 'No photos';
    case 'notes': return a.notes || 'Nothing else';
    case 'contact': return [a.phone, a.email].filter(Boolean).join(' · ');
    default: return a[step.key] || '';
  }
}

export function createConcierge() {
  const root = document.querySelector('[data-concierge]');
  const panel = root.querySelector('.concierge__panel');
  const log = root.querySelector('[data-log]');
  const composer = root.querySelector('[data-composer]');
  const bar = root.querySelector('[data-concierge-progress]');
  const listeners = [];

  let answers = {};
  let stepIndex = 0;
  let mode = 'steps'; // steps | review | sending | done
  let editing = false;
  let started = false;
  let opener = null;
  let lastLead = null;

  // ---------- persistence (per-visitor convenience only) ----------
  const save = () => {
    try {
      const { referenceImages, ...rest } = answers;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers: rest, stepIndex, mode: mode === 'done' ? 'steps' : mode }));
    } catch { /* storage unavailable */ }
  };
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ } };
  const loadDraft = () => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
  };

  // ---------- transcript ----------
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  function bubble(html, who = 'bot', cls = '') {
    const el = document.createElement('div');
    el.className = `msg msg--${who} ${cls}`.trim();
    el.innerHTML = html;
    log.appendChild(el);
    scroll();
    return el;
  }
  function botSays(html, instant) {
    if (instant || reduced) { bubble(html); return Promise.resolve(); }
    const t = bubble('<i></i><i></i><i></i>', 'bot', 'msg--typing');
    t.setAttribute('aria-hidden', 'true');
    return new Promise((r) => setTimeout(() => { t.remove(); bubble(html); r(); }, 420 + Math.min(500, html.length * 6)));
  }
  function meSays(step) {
    const el = bubble(esc(display(step, answers)), 'me');
    if (step.key === 'referenceImages' && answers.referenceImages && answers.referenceImages.length) {
      el.innerHTML += `<div class="msg__thumbs">${answers.referenceImages.map((i) => `<img src="${i.dataUrl}" alt="">`).join('')}</div>`;
    }
  }

  const progress = () => {
    const p = mode === 'done' ? 1 : mode === 'review' || mode === 'sending' ? 0.96 : stepIndex / STEPS.length;
    bar.style.width = `${Math.round(p * 100)}%`;
  };

  // ---------- composer rendering ----------
  function setComposer(html, onSubmit) {
    composer.innerHTML = html;
    composer.onsubmit = (e) => { e.preventDefault(); onSubmit && onSubmit(); };
    const first = composer.querySelector('input:not([type=hidden]):not(.hp input), textarea, button');
    if (first && root.classList.contains('is-open')) first.focus({ preventScroll: true });
  }
  const skipBtn = (step) => (step.optional ? `<button class="chip chip--quiet" type="button" data-skip>${esc(step.skip || 'Skip')}</button>` : '');
  const err = (msg) => {
    let p = composer.querySelector('.composer__error');
    if (!p) { p = document.createElement('p'); p.className = 'composer__error'; p.setAttribute('role', 'alert'); composer.prepend(p); }
    p.textContent = msg;
  };

  function renderStep() {
    const step = STEPS[stepIndex];
    const a = answers;
    progress();
    const commit = (patch) => {
      Object.assign(answers, patch);
      meSays(step);
      advance();
    };
    const wireSkip = (patch) => {
      const s = composer.querySelector('[data-skip]');
      if (s) s.onclick = () => commit(patch);
    };

    if (step.kind === 'choice') {
      setComposer(`
        <div class="chips" role="group" aria-label="${esc(step.label)}">
          ${step.options.map((o) => `<button class="chip" type="button" data-v="${esc(o)}" aria-pressed="${a[step.key] === o}">${esc(o)}</button>`).join('')}
        </div>
        ${step.other ? `<div class="field-row"><input class="input" name="other" placeholder="Something else…" aria-label="Other ${esc(step.label.toLowerCase())}"><button class="send" type="submit" aria-label="Send">↑</button></div>` : ''}`,
      () => {
        const v = composer.querySelector('[name=other]').value.trim();
        if (!v) return err('Pick one above or type it in.');
        commit({ [step.key]: v });
      });
      composer.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => commit({ [step.key]: b.dataset.v }); });
      return;
    }

    if (step.kind === 'text' || step.kind === 'number') {
      const isNum = step.kind === 'number';
      const chips = step.chips ? step.chips(a) : [];
      setComposer(`
        ${chips.length || step.optional ? `<div class="chips">${chips.map((c) => `<button class="chip" type="button" data-v="${c}">${c}</button>`).join('')}${skipBtn(step)}</div>` : ''}
        <div class="field-row">
          <input class="input" name="v" ${isNum ? 'type="number" inputmode="numeric" min="1" max="10000"' : 'type="text"'}
            ${step.autocomplete ? `autocomplete="${step.autocomplete}"` : ''} maxlength="300"
            placeholder="${esc(step.placeholder ? step.placeholder(a) : isNum ? 'Type a number' : 'Type here')}"
            aria-label="${esc(step.label)}" value="${esc(a[step.key] || '')}">
          <button class="send" type="submit" aria-label="Send">↑</button>
        </div>`,
      () => {
        const v = composer.querySelector('[name=v]').value.trim();
        if (!v) return step.optional ? commit({ [step.key]: '' }) : err('Just need this one.');
        if (isNum && !(Number(v) >= 1)) return err('A whole number works best.');
        commit({ [step.key]: v });
      });
      composer.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => commit({ [step.key]: b.dataset.v }); });
      wireSkip({ [step.key]: '' });
      return;
    }

    if (step.kind === 'textarea') {
      setComposer(`
        <div class="chips">${skipBtn(step)}</div>
        <div class="field-row">
          <textarea class="input" name="v" maxlength="1500" placeholder="Type here" aria-label="${esc(step.label)}">${esc(a[step.key] || '')}</textarea>
          <button class="send" type="submit" aria-label="Send">↑</button>
        </div>`,
      () => commit({ [step.key]: composer.querySelector('[name=v]').value.trim() }));
      wireSkip({ [step.key]: '' });
      return;
    }

    if (step.kind === 'date') {
      setComposer(`
        <div class="field-row">
          <input class="input" type="date" name="v" min="${todayISO()}" value="${esc(a.eventDate || '')}" aria-label="Event date" required>
          <button class="send" type="submit" aria-label="Send">↑</button>
        </div>
        <p class="composer__hint">Not locked in? Pick your best guess and add a note later.</p>`,
      () => {
        const v = composer.querySelector('[name=v]').value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return err('Pick a date.');
        if (v < todayISO()) return err('That date has already passed.');
        commit({ eventDate: v });
      });
      return;
    }

    if (step.kind === 'theme') {
      const picked = new Set(a.colors || []);
      setComposer(`
        <div class="chips" role="group" aria-label="Colors">
          ${COLORS.map(([n, c]) => `<button class="chip chip--swatch" type="button" style="--sw:${c}" data-c="${n}" aria-pressed="${picked.has(n)}">${n}</button>`).join('')}
        </div>
        <div class="field-row">
          <input class="input" name="theme" maxlength="200" placeholder="Theme (optional)" aria-label="Theme" value="${esc(a.theme || '')}">
          <button class="send" type="submit" aria-label="Send">↑</button>
        </div>
        <div class="composer__actions"><span></span>${skipBtn(step)}</div>`,
      () => commit({ theme: composer.querySelector('[name=theme]').value.trim(), colors: Array.from(picked) }));
      composer.querySelectorAll('[data-c]').forEach((b) => {
        b.onclick = () => {
          const n = b.dataset.c;
          picked.has(n) ? picked.delete(n) : picked.add(n);
          b.setAttribute('aria-pressed', String(picked.has(n)));
        };
      });
      wireSkip({ theme: '', colors: [] });
      return;
    }

    if (step.kind === 'images') {
      const imgs = (a.referenceImages || []).slice();
      const paint = () => {
        setComposer(`
          <div class="upload">
            ${imgs.map((im, i) => `<span class="upload__thumb"><img src="${im.dataUrl}" alt="Reference photo ${i + 1}"><button type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">✕</button></span>`).join('')}
            ${imgs.length < 3 ? '<input id="tmg-upload" type="file" accept="image/*" multiple><label class="chip" for="tmg-upload" tabindex="0">+ Add photos</label>' : ''}
          </div>
          <div class="composer__actions">
            ${skipBtn(step)}
            <button class="btn btn--gold" type="submit" ${imgs.length ? '' : 'disabled'}>Use ${imgs.length || ''} photo${imgs.length === 1 ? '' : 's'}</button>
          </div>`,
        () => commit({ referenceImages: imgs }));
        const input = composer.querySelector('input[type=file]');
        const label = composer.querySelector('label[for=tmg-upload]');
        if (label) label.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
        if (input) input.onchange = async () => {
          const files = Array.from(input.files).slice(0, 3 - imgs.length);
          for (const f of files) {
            try { imgs.push(await compressImage(f)); } catch { err(`Couldn't read ${f.name}. Try a JPG or PNG.`); }
          }
          paint();
        };
        composer.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { imgs.splice(+b.dataset.rm, 1); paint(); }; });
        wireSkip({ referenceImages: [] });
      };
      paint();
      return;
    }

    if (step.kind === 'contact') {
      setComposer(`
        <div class="field-row">
          <div class="field"><label for="tmg-phone">Phone</label><input id="tmg-phone" class="input" type="tel" name="phone" autocomplete="tel" inputmode="tel" maxlength="30" value="${esc(a.phone || '')}"></div>
          <div class="field"><label for="tmg-email">Email</label><input id="tmg-email" class="input" type="email" name="email" autocomplete="email" maxlength="200" value="${esc(a.email || '')}"></div>
        </div>
        <div class="hp" aria-hidden="true"><label>Company<input name="company" tabindex="-1" autocomplete="off"></label></div>
        <div class="composer__actions"><span class="composer__hint">We only use this to confirm your order.</span><button class="btn btn--gold" type="submit">Continue</button></div>`,
      () => {
        const phone = composer.querySelector('[name=phone]');
        const email = composer.querySelector('[name=email]');
        const p = phone.value.trim(), e = email.value.trim();
        phone.removeAttribute('aria-invalid'); email.removeAttribute('aria-invalid');
        if (!p && !e) return err('Add a phone number or an email.');
        if (p && !/^\+?[\d\s().-]{7,20}$/.test(p)) { phone.setAttribute('aria-invalid', 'true'); return err('That phone number looks off.'); }
        if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { email.setAttribute('aria-invalid', 'true'); return err('That email looks off.'); }
        answers.honeypot = composer.querySelector('[name=company]').value;
        commit({ phone: p, email: e });
      });
    }
  }

  function advance() {
    save();
    if (editing) { editing = false; return review(); }
    stepIndex += 1;
    if (stepIndex >= STEPS.length) return review();
    composer.innerHTML = '';
    botSays(STEPS[stepIndex].ask(answers)).then(renderStep);
  }

  // ---------- review / submit ----------
  function review() {
    mode = 'review';
    save();
    progress();
    composer.innerHTML = '';
    botSays('Here\'s your order. Tap <b>Edit</b> to change anything.').then(() => {
      const rows = STEPS.map((s, i) => `<div><dt>${esc(s.label)}</dt><dd>${esc(display(s, answers))}</dd><button type="button" data-edit="${i}">Edit</button></div>`).join('');
      const card = bubble(`<dl>${rows}</dl>`, 'bot', 'review');
      card.querySelectorAll('[data-edit]').forEach((b) => {
        b.onclick = () => {
          if (mode !== 'review') return;
          mode = 'steps'; editing = true; stepIndex = +b.dataset.edit;
          composer.innerHTML = '';
          botSays(STEPS[stepIndex].ask(answers)).then(renderStep);
        };
      });
      setComposer(`
        <div class="composer__actions">
          <span class="composer__hint">Pricing and timing are confirmed with you directly.</span>
          <button class="btn btn--gold btn--lg" type="submit">Send my order</button>
        </div>`, send);
    });
  }

  async function send() {
    if (mode !== 'review') return;
    mode = 'sending';
    const btn = composer.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Sending…';
    const lead = buildOrderLead(answers);
    lastLead = lead;
    try {
      const res = await submitOrder(lead, { honeypot: answers.honeypot });
      mode = 'done';
      progress();
      clearDraft();
      composer.innerHTML = '';
      const who = lead.phone && lead.email ? 'by phone or email' : lead.phone ? `at ${esc(lead.phone)}` : `at ${esc(lead.email)}`;
      await botSays(`Order request sent. We'll reach out ${who} to confirm details, pricing and timing.`);
      await botSays(`Your reference: <b>${esc(res.id)}</b>. Thanks, ${esc(firstName(lead.name))}!`);
      setComposer(`<div class="composer__actions"><button class="chip" type="button" data-again>Start another order</button><button class="btn btn--gold" type="button" data-done>Done</button></div>`);
      composer.querySelector('[data-again]').onclick = restart;
      composer.querySelector('[data-done]').onclick = close;
    } catch (e) {
      mode = 'review';
      if (e instanceof OrderError && e.code === 'invalid') {
        btn.disabled = false; btn.textContent = 'Send my order';
        return err(e.message);
      }
      await fallback(lead, e);
    }
  }

  // Ordering service not connected (or down): never lose the customer's details.
  async function fallback(lead, e) {
    const cfg = await getSiteConfig();
    const c = cfg.contact || {};
    const text = formatOrderSummary(lead);
    const msg = e.code === 'not_configured'
      ? 'Online ordering is still being connected, so this couldn\'t send from here.'
      : 'Hmm, that didn\'t go through.';
    const next = c.email || c.phone
      ? ' Your details are saved. Send them straight to us below:'
      : ' Your details are saved on this device. Copy them, or try again in a bit.';
    await botSays(msg + next);
    const actions = [];
    if (c.email) actions.push(`<a class="btn btn--gold" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Order request: ' + lead.orderType)}&body=${encodeURIComponent(text)}">Email it</a>`);
    if (c.phone) actions.push(`<a class="btn btn--gold" href="sms:${esc(c.phone)}?&body=${encodeURIComponent(text)}">Text it</a>`);
    actions.push('<button class="chip" type="button" data-copy>Copy details</button>');
    if (e.code !== 'not_configured') actions.push('<button class="chip chip--quiet" type="button" data-retry>Try again</button>');
    setComposer(`<div class="composer__actions" style="flex-wrap:wrap;justify-content:flex-start">${actions.join('')}</div>`);
    const copy = composer.querySelector('[data-copy]');
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; }
    };
    const retry = composer.querySelector('[data-retry]');
    if (retry) retry.onclick = () => { log.lastChild && log.lastChild.remove(); review(); };
  }

  // ---------- lifecycle ----------
  function begin(preset) {
    log.innerHTML = '';
    answers = {}; stepIndex = 0; mode = 'steps'; editing = false; started = true;
    const draft = loadDraft();
    if (draft && draft.answers && Object.keys(draft.answers).length && !preset) {
      answers = draft.answers;
      stepIndex = Math.min(draft.stepIndex || 0, STEPS.length);
      bubble('Welcome back. Picking up where you left off.');
      for (let i = 0; i < Math.min(stepIndex, STEPS.length); i++) {
        bubble(STEPS[i].ask(answers));
        meSays(STEPS[i]);
      }
      if (draft.mode === 'review' || stepIndex >= STEPS.length) return review();
      bubble(STEPS[stepIndex].ask(answers));
      return renderStep();
    }
    botSays(STEPS[0].ask(answers), true).then(() => {
      if (preset && STEPS[0].options.includes(preset)) {
        answers.orderType = preset;
        meSays(STEPS[0]);
        advance();
      } else renderStep();
    });
  }

  function restart() { clearDraft(); begin(); }

  function trap(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = Array.from(panel.querySelectorAll('button, [href], input:not([tabindex="-1"]), textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open({ preset } = {}) {
    opener = document.activeElement;
    root.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => root.classList.add('is-open'));
    document.addEventListener('keydown', trap);
    listeners.forEach((fn) => fn(true));
    if (!started || mode === 'done' || (preset && !answers.orderType)) begin(preset);
    setTimeout(() => {
      const f = composer.querySelector('input:not(.hp input), textarea, button') || panel.querySelector('[data-close-concierge].icon-btn');
      f && f.focus({ preventScroll: true });
    }, reduced ? 0 : 120);
  }

  function close() {
    root.classList.remove('is-open');
    document.removeEventListener('keydown', trap);
    document.documentElement.style.overflow = '';
    setTimeout(() => { root.hidden = true; }, reduced ? 0 : 420);
    listeners.forEach((fn) => fn(false));
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  root.querySelectorAll('[data-close-concierge]').forEach((b) => b.addEventListener('click', close));
  root.querySelector('[data-restart]').addEventListener('click', restart);

  return {
    open, close,
    onToggle(fn) { listeners.push(fn); },
    get lastLead() { return lastLead; },
  };
}
