// Repeating events on the hub's calendar, with the same choices as Google Calendar plus "every N weekdays".
//
// A rule looks like { freq, interval, byDay, monthly, ends }:
//   freq      'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
//             'weekdays' counts only Monday–Friday: every 2 weekdays from a Thursday is Thu, Mon, Wed, Fri, …
//   interval  every N of them (1 or more)
//   byDay     weekly only: weekdays it falls on, 0 = Sunday
//   monthly   monthly only: 'day' (same date each month) or 'nth' (e.g. the first Wednesday)
//   ends      { type: 'never' } | { type: 'on', until: 'YYYY-MM-DD' } | { type: 'after', count: N }
// An event's `exceptions` lists dates removed from its series.

import { addDays, fromKey, toKey } from './dates.js';

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };
const DAY_MS = 86400000;

// Which week of the month a date's weekday is in: 1–4, or -1 for the last one (a 5th is always the last).
export const nthOfMonth = (d) => {
  const n = Math.ceil(d.getDate() / 7);
  return n === 5 ? -1 : n;
};
const isLastOfMonth = (d) => addDays(d, 7).getMonth() !== d.getMonth();
const daysBetween = (a, b) => Math.round((b - a) / DAY_MS); // rounding absorbs daylight-saving hours
const monthsBetween = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
const isWeekday = (d) => d.getDay() !== 0 && d.getDay() !== 6;
const fmtLong = (key, year = false) => fromKey(key).toLocaleDateString(undefined, { month: 'long', day: 'numeric', ...(year && { year: 'numeric' }) });

// The quick choices in the Repeat menu, worded for the event's date like Google Calendar does.
export function presets(dateKey) {
  const d = fromKey(dateKey);
  const dow = d.getDay();
  return [
    ['daily', 'Daily', { freq: 'daily', interval: 1 }],
    ['weekly', `Weekly on ${WEEKDAY_NAMES[dow]}`, { freq: 'weekly', interval: 1, byDay: [dow] }],
    ['monthly', `Monthly on the ${ORDINALS[nthOfMonth(d)]} ${WEEKDAY_NAMES[dow]}`, { freq: 'monthly', interval: 1, monthly: 'nth' }],
    ['yearly', `Annually on ${fmtLong(dateKey)}`, { freq: 'yearly', interval: 1 }],
    ['weekdays', 'Every weekday (Monday to Friday)', { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] }],
  ];
}

function sameRule(a, b) {
  const days = (r) => [...(r.byDay || [])].sort().join(',');
  const ends = (r) => JSON.stringify(r.ends?.type && r.ends.type !== 'never' ? r.ends : { type: 'never' });
  return a.freq === b.freq && (a.interval || 1) === (b.interval || 1) && days(a) === days(b)
    && (a.freq !== 'monthly' || (a.monthly || 'day') === (b.monthly || 'day')) && ends(a) === ends(b);
}

// The Repeat menu choice for a rule: 'none', a preset id, or 'custom'.
export function presetId(rule, dateKey) {
  if (!rule) return 'none';
  return presets(dateKey).find(([, , r]) => sameRule(r, rule))?.[0] ?? 'custom';
}

// A rule in words, e.g. "Every 2 weeks on Mon, Wed, until December 1, 2026".
export function describeRepeat(rule, dateKey) {
  if (!rule) return 'Does not repeat';
  const preset = presets(dateKey).find(([, , r]) => sameRule(r, rule));
  if (preset) return preset[1];
  const d = fromKey(dateKey);
  const n = rule.interval || 1;
  const unit = { daily: 'day', weekdays: 'weekday', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq];
  let text = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  if (rule.freq === 'weekdays') text += ' (skipping weekends)';
  if (rule.freq === 'weekly') text += ` on ${(rule.byDay?.length ? [...rule.byDay].sort() : [d.getDay()]).map((i) => WEEKDAY_SHORT[i]).join(', ')}`;
  if (rule.freq === 'monthly') text += rule.monthly === 'nth' ? ` on the ${ORDINALS[nthOfMonth(d)]} ${WEEKDAY_NAMES[d.getDay()]}` : ` on day ${d.getDate()}`;
  if (rule.freq === 'yearly') text += ` on ${fmtLong(dateKey)}`;
  if (rule.ends?.type === 'on' && rule.ends.until) text += `, until ${fmtLong(rule.ends.until, true)}`;
  if (rule.ends?.type === 'after') text += `, ${rule.ends.count} time${rule.ends.count === 1 ? '' : 's'}`;
  return text;
}

// Dates ("YYYY-MM-DD") an event falls on in [from, to). Walks day by day from the series start so that
// "after N times" and "every N weekdays" count correctly. `skipExceptions: false` includes removed dates.
export function occurrenceDates(ev, from, to, { skipExceptions = true } = {}) {
  const rule = ev.repeat;
  if (!rule) return ev.date >= from && ev.date < to ? [ev.date] : [];
  const start = fromKey(ev.date);
  const ends = rule.ends || { type: 'never' };
  const stop = ends.type === 'on' && ends.until && ends.until < to ? toKey(addDays(fromKey(ends.until), 1)) : to;
  const skip = new Set(skipExceptions ? ev.exceptions || [] : []);
  const interval = Math.max(1, rule.interval || 1);
  const dow = start.getDay();
  const nth = nthOfMonth(start);
  const byDay = rule.byDay?.length ? rule.byDay : [dow];
  const firstWeek = addDays(start, -dow);
  const out = [];
  let count = 0;
  let weekdayIndex = 0;

  for (let d = start, k = ev.date; k < stop; d = addDays(d, 1), k = toKey(d)) {
    let hit = false;
    switch (rule.freq) {
      case 'daily':
        hit = daysBetween(start, d) % interval === 0;
        break;
      case 'weekdays':
        if (isWeekday(d)) hit = weekdayIndex++ % interval === 0;
        break;
      case 'weekly':
        hit = byDay.includes(d.getDay()) && Math.floor(daysBetween(firstWeek, d) / 7) % interval === 0;
        break;
      case 'monthly':
        if (monthsBetween(start, d) % interval === 0) {
          hit = rule.monthly === 'nth'
            ? d.getDay() === dow && (nth === -1 ? isLastOfMonth(d) : Math.ceil(d.getDate() / 7) === nth)
            : d.getDate() === start.getDate(); // months without that date are skipped, like Google
        }
        break;
      case 'yearly':
        hit = d.getMonth() === start.getMonth() && d.getDate() === start.getDate() && (d.getFullYear() - start.getFullYear()) % interval === 0;
        break;
      default:
        break;
    }
    if (!hit) continue;
    count += 1;
    if (ends.type === 'after' && count > ends.count) break;
    if (k >= from && !skip.has(k)) out.push(k);
  }
  return out;
}

const dayBefore = (key) => toKey(addDays(fromKey(key), -1));

// End a series just before `date`. A series that ends after N times keeps the count of the ones before it.
function endBefore(ev, date) {
  const ends = ev.repeat.ends?.type === 'after'
    ? { type: 'after', count: occurrenceDates(ev, ev.date, date, { skipExceptions: false }).length }
    : { type: 'on', until: dayBefore(date) };
  return { ...ev, repeat: { ...ev.repeat, ends }, exceptions: (ev.exceptions || []).filter((x) => x < date) };
}

// Save changes to one occurrence (`date`) of an event. scope: 'this' | 'following' | 'all'.
// `fields` are { title, time, person, repeat }; changing only this one ignores a new repeat.
export function applyEdit(events, id, date, fields, scope, makeId) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return events;
  if (!ev.repeat || scope === 'all' || (scope === 'following' && date === ev.date)) {
    return events.map((e) => (e.id === id ? { ...e, ...fields } : e));
  }
  const rest = events.filter((e) => e.id !== id);
  if (scope === 'this') {
    const single = { ...ev, ...fields, id: makeId(), date, repeat: null, exceptions: [], createdAt: Date.now() };
    return [...rest, { ...ev, exceptions: [...(ev.exceptions || []), date] }, single];
  }
  // This and following: the old series stops the day before, and a new one starts here with the changes.
  let repeat = fields.repeat;
  if (repeat?.ends?.type === 'after' && ev.repeat.ends?.type === 'after' && sameRule({ ...repeat, ends: null }, { ...ev.repeat, ends: null })) {
    const before = occurrenceDates(ev, ev.date, date, { skipExceptions: false }).length;
    repeat = { ...repeat, ends: { type: 'after', count: Math.max(1, ev.repeat.ends.count - before) } };
  }
  const following = { ...ev, ...fields, repeat, id: makeId(), date, exceptions: (ev.exceptions || []).filter((x) => x > date), createdAt: Date.now() };
  return [...rest, endBefore(ev, date), following];
}

// Delete one occurrence, it and the ones after it, or the whole series.
export function applyDelete(events, id, date, scope) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return events;
  if (!ev.repeat || scope === 'all' || (scope === 'following' && date === ev.date)) return events.filter((e) => e.id !== id);
  if (scope === 'this') return events.map((e) => (e.id === id ? { ...e, exceptions: [...(e.exceptions || []), date] } : e));
  return events.map((e) => (e.id === id ? endBefore(e, date) : e));
}
