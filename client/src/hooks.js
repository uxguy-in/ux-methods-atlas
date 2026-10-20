import { useEffect, useState } from 'react';
import { get } from './api.js';

export function useApi(url) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
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
