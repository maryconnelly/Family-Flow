import { fromKey } from './dates.js';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_KEY = 'ff.googleToken';
const CONNECTED_KEY = 'ff.googleConnected';

export class AuthError extends Error {}

export const isConfigured = () => Boolean(CLIENT_ID);

let gisPromise = null;
export function loadGis() {
  gisPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => {
      gisPromise = null;
      reject(new Error('Could not load Google sign-in. Check your internet connection.'));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (e.g. private window); the session just won't be remembered.
  }
}

// Returns a stored token that still has at least a minute left, else null.
export function getStoredToken() {
  const token = readJson(TOKEN_KEY);
  return token && token.expiresAt > Date.now() + 60_000 ? token : null;
}

export const wasConnected = () => Boolean(readJson(CONNECTED_KEY));

export async function signIn() {
  const google = await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        const token = { accessToken: resp.access_token, expiresAt: Date.now() + resp.expires_in * 1000 };
        writeStorage(TOKEN_KEY, token);
        writeStorage(CONNECTED_KEY, true);
        resolve(token);
      },
      error_callback: (err) => reject(new Error(err.type === 'popup_closed' ? 'Sign-in window was closed.' : err.message || err.type)),
    });
    // Empty prompt: only ask for consent the first time.
    client.requestAccessToken({ prompt: '' });
  });
}

export function signOut(token) {
  if (token) window.google?.accounts.oauth2.revoke(token.accessToken, () => {});
  writeStorage(TOKEN_KEY, null);
  writeStorage(CONNECTED_KEY, null);
}

export function forgetToken() {
  writeStorage(TOKEN_KEY, null);
}

async function get(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.accessToken}` } });
  if (res.status === 401) {
    forgetToken();
    throw new AuthError('Google session expired');
  }
  if (!res.ok) throw new Error(`Google Calendar error (${res.status})`);
  return res.json();
}

function declinedByMe(event) {
  return event.attendees?.some((a) => a.self && a.responseStatus === 'declined');
}

function normalize(event, cal) {
  const allDay = Boolean(event.start.date);
  return {
    id: `${cal.id}:${event.id}`,
    title: event.summary || '(No title)',
    allDay,
    start: allDay ? fromKey(event.start.date) : new Date(event.start.dateTime),
    end: allDay ? fromKey(event.end.date) : new Date(event.end.dateTime),
    location: event.location,
    link: event.htmlLink,
    color: cal.backgroundColor,
    calendar: cal.summaryOverride || cal.summary,
  };
}

// Fetches events between start and end from every calendar that's checked in Google Calendar.
export async function fetchEvents(token, start, end) {
  const list = await get(token, `${API}/users/me/calendarList`);
  const calendars = (list.items || []).filter((c) => c.selected);
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
      const data = await get(token, `${API}/calendars/${encodeURIComponent(cal.id)}/events?${params}`);
      return (data.items || [])
        .filter((e) => e.status !== 'cancelled' && !declinedByMe(e))
        .map((e) => normalize(e, cal));
    }),
  );
  return perCalendar.flat();
}

// Events overlapping the given local day, all-day first then by start time.
export function eventsOnDay(events, day) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return events
    .filter((e) => e.start < dayEnd && e.end > dayStart)
    .sort((a, b) => b.allDay - a.allDay || a.start - b.start);
}
