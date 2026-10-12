import { useCallback, useEffect, useRef, useState } from 'react';

const SAVE_DELAY_MS = 300;

export const newId = () => crypto.randomUUID();

function save(key, value, { keepalive = false } = {}) {
  return fetch(`/api/state/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    keepalive,
  }).then((res) => {
    if (!res.ok) throw new Error(`Save failed (${res.status})`);
  });
}

// Loads all app data from the local server and saves each collection (debounced) when it changes.
export function useStore() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const latest = useRef(null);
  const timers = useRef({});

  useEffect(() => {
    fetch('/api/state')
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load data (${res.status})`);
        return res.json();
      })
      .then((data) => {
        latest.current = data;
        setState(data);
      })
      .catch((err) => setError(`${err.message}. Is the server running? Try "npm run dev".`));
  }, []);

  // Flush pending saves if the tab is closed mid-debounce.
  useEffect(() => {
    const flush = () => {
      for (const [key, timer] of Object.entries(timers.current)) {
        clearTimeout(timer);
        save(key, latest.current[key], { keepalive: true }).catch(() => {});
      }
      timers.current = {};
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const update = useCallback((key, fn) => {
    latest.current = { ...latest.current, [key]: fn(latest.current[key]) };
    setState(latest.current);
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      delete timers.current[key];
      save(key, latest.current[key])
        .then(() => setError(null))
        .catch((err) => setError(`${err.message} — your last change may not be saved.`));
    }, SAVE_DELAY_MS);
  }, []);

  return { state, update, error };
}
