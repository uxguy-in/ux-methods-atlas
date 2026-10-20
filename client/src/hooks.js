import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { get } from './api.js';

export function useApi(url) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    if (!url) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    get(url)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error) => live && setState({ data: null, error, loading: false }));
    return () => { live = false; };
  }, [url]);
  return state;
}

export const useMeta = () => useApi('/api/meta');
export const useMethods = () => useApi('/api/methods');

// State that belongs to one visit of a page: kept when the visitor comes back to it with Back,
// and fresh when they arrive by clicking a link. Stored per history entry for the browser session.
export function useRemembered(name, initial) {
  const { key, pathname } = useLocation();
  const id = `atlas-page:${key}:${pathname}:${name}`;
  const [value, setValue] = useState(() => {
    try {
      const saved = sessionStorage.getItem(id);
      if (saved !== null) return JSON.parse(saved);
    } catch { /* storage unavailable */ }
    return typeof initial === 'function' ? initial() : initial;
  });
  useEffect(() => {
    try { sessionStorage.setItem(id, JSON.stringify(value ?? null)); } catch { /* storage unavailable or full */ }
  }, [id, value]);
  return [value, setValue];
}
