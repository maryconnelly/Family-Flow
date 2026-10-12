// Dates are stored as local "YYYY-MM-DD" keys (never toISOString, which shifts to UTC).
export function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Weeks start on Monday.
export function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(d, -((d.getDay() + 6) % 7));
}

export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export const todayKey = () => toKey(new Date());

export const fmtWeekday = (d) => d.toLocaleDateString(undefined, { weekday: 'short' });
export const fmtMonthDay = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function fmtRange(start, end) {
  const sameMonth = start.getMonth() === end.getMonth();
  const endFmt = sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' };
  return `${fmtMonthDay(start)} – ${end.toLocaleDateString(undefined, endFmt)}`;
}
