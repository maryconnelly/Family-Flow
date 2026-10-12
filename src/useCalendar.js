import { useCallback, useEffect, useState } from 'react';
import { AuthError, fetchEvents, getStoredToken, isConfigured, loadGis, signIn, signOut, wasConnected } from './google.js';

// Loads Google Calendar events in [rangeStart, rangeEnd).
export function useCalendar(rangeStart, rangeEnd) {
  const [token, setToken] = useState(() => getStoredToken());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();

  // Load Google's script early so the sign-in popup opens directly from the click.
  useEffect(() => {
    if (isConfigured()) loadGis().catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    if (token.expiresAt <= Date.now() + 60_000) {
      setToken(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEvents(token, new Date(startMs), new Date(endMs))
      .then((evs) => {
        if (cancelled) return;
        setEvents(evs);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthError) setToken(null);
        else setError(err.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, startMs, endMs, refreshCount]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      setToken(await signIn());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const disconnect = useCallback(() => {
    signOut(token);
    setToken(null);
    setEvents([]);
  }, [token]);

  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);

  let status;
  if (!isConfigured()) status = 'unconfigured';
  else if (!token) status = wasConnected() ? 'expired' : 'disconnected';
  else if (loading) status = 'loading';
  else status = 'ready';

  return { status, events: token ? events : [], error, connect, disconnect, refresh };
}
