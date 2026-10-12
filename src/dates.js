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

// Weeks start on Sunday.
export function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(d, -d.getDay());
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

export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const fmtMonthYear = (d) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

// Every day shown on a month calendar: whole weeks from the week containing the 1st to the week containing the last day.
export function monthGrid(monthStart) {
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((monthStart.getDay() + daysInMonth) / 7) * 7;
  const first = startOfWeek(monthStart);
  return Array.from({ length: cells }, (_, i) => addDays(first, i));
}
