import { staticGet, staticPost } from './static-api.js';

export const STATIC = import.meta.env.VITE_STATIC === '1';
const cache = new Map();

async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { status: res.status, needsKey: Boolean(body.needsKey) });
  return body;
}

export function get(url) {
  if (!cache.has(url)) {
    const p = STATIC ? staticGet(url) : request(url);
    cache.set(url, p.catch((e) => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
}

export const post = (url, data, headers = {}) => (STATIC
  ? staticPost(url, data)
  : request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) }));
