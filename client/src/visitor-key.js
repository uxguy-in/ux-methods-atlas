// A visitor's own Anthropic API key, kept only in their browser. By default it lasts for the
// browser tab (sessionStorage); "remember" keeps it on this device (localStorage).
const NAME = 'atlas-anthropic-key';

function store(kind) {
  try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; }
}

export function getVisitorKey() {
  try { return store('session')?.getItem(NAME) || store('local')?.getItem(NAME) || ''; } catch { return ''; }
}

export function isRemembered() {
  try { return Boolean(store('local')?.getItem(NAME)); } catch { return false; }
}

export function setVisitorKey(key, remember) {
  forgetVisitorKey();
  try { store(remember ? 'local' : 'session')?.setItem(NAME, key.trim()); } catch { /* storage unavailable */ }
}

export function forgetVisitorKey() {
  for (const kind of ['session', 'local']) {
    try { store(kind)?.removeItem(NAME); } catch { /* storage unavailable */ }
  }
}

export const looksLikeKey = (k) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k.trim());
