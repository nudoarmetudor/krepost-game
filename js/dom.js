// Tiny DOM helpers and the inline icon set.

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'disabled') el.disabled = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  coin: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="#ffcf4a"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="#b3800f" stroke-width="1.6"/></svg>',
  gem: '<svg viewBox="0 0 20 20"><path d="M10 1.5 17.5 8 10 18.5 2.5 8Z" fill="#6fe7ff"/><path d="M2.5 8h15M10 1.5 7 8l3 10.5L13 8z" fill="none" stroke="#2a8fae" stroke-width="1"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  stone: '<svg viewBox="0 0 20 20"><path d="M10 1.5 17.4 5.8v8.4L10 18.5 2.6 14.2V5.8Z" fill="#b48cff"/><path d="M10 6.5 13.4 8.5v3L10 13.5 6.6 11.5v-3Z" fill="#6a45c4"/></svg>',
  shard: '<svg viewBox="0 0 20 20"><path d="M10 1.5 16 12 10 18.5 4 12Z" fill="#ff9bf2"/><path d="M10 1.5 10 18.5" stroke="#a8459a" stroke-width="1"/></svg>',
  cash: '<svg viewBox="0 0 20 20"><rect x="1.5" y="4.5" width="17" height="11" rx="2" fill="#7cf5a8"/><circle cx="10" cy="10" r="3" fill="#1f6b3e"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 21V10l2-1V5h3v2l3-2 3 2V5h3v4l2 1v11h-6v-5h-4v5Z"/></svg>',
  workshop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z"/></svg>',
  labs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="7" y="3" width="12" height="16" rx="2"/><path d="M5 6.5v12A2.5 2.5 0 0 0 7.5 21H15"/></svg>',
  modules: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4"/></svg>',
  ultimate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5Z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8l-6.3 3.6 1.5-7.1L1.8 9.4 9 8.6Z"/></svg>',
  logo: '<svg viewBox="0 0 64 64"><defs><radialGradient id="lg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb547" stop-opacity=".45"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#lg)"/><path d="M32 10 37 13 43 12 45 18 51 21 50 27 54 32 50 37 51 43 45 46 43 52 37 51 32 54 27 51 21 52 19 46 13 43 14 37 10 32 14 27 13 21 19 18 21 12 27 13Z" fill="#2b3550" stroke="#ffb547" stroke-width="2.4" stroke-linejoin="round"/><circle cx="32" cy="32" r="11" fill="#1a2136"/><circle cx="32" cy="32" r="8" fill="#ffb547" opacity=".35"/><circle cx="32" cy="32" r="5.5" fill="#ffd68c"/><circle cx="32" cy="32" r="2.6" fill="#fffaf0"/></svg>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = 'ic ' + cls;
  span.style.display = 'inline-flex';
  span.innerHTML = ICONS[name] || '';
  return span;
}

export function cur(name, value, cls = '') {
  return h('span', { class: 'cur ' + cls }, icon(name), h('span', { class: 'amt' }, value));
}

export function toast(msg) {
  const root = document.getElementById('toast-root');
  const t = h('div', { class: 'toast' }, msg);
  root.append(t);
  setTimeout(() => t.remove(), 2500);
}

let openModals = 0;

export function modalOpen() {
  return openModals > 0;
}

// Shows content in a modal. Returns a close function.
export function modal(content, { dismissable = true, onClose, cls = '' } = {}) {
  const root = document.getElementById('modal-root');
  const box = h('div', { class: 'modal ' + cls, role: 'dialog' }, content);
  const back = h('div', { class: 'back' }, box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openModals--;
    back.remove();
    if (onClose) onClose();
  };
  if (dismissable) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  openModals++;
  root.append(back);
  return close;
}
