import { addDays, fromKey } from './dates.js';
import { occurrenceDates } from './repeat.js';

// Everyone an event on the hub's own calendar can belong to, with their color (white text reads on all of them).
export const FAMILY = [
  { id: 'mom', name: 'Mom', color: '#2e8b57' }, // green
  { id: 'dad', name: 'Dad', color: '#d9661a' }, // orange
  { id: 'hank', name: 'Hank', color: '#2f6fd0' }, // blue
  { id: 'june', name: 'June', color: '#d6457f' }, // pink
];

export const memberOf = (id) => FAMILY.find((m) => m.id === id);

// Events added on the hub are saved as { id, title, date: 'YYYY-MM-DD', time: 'HH:MM' or '' for all day, person,
// repeat, exceptions } (see repeat.js). This lists each one's dates in [from, to) in the same shape as Google Calendar
// events, so the week and month views can show both.
export function hubCalendarEvents(events = [], from, to) {
  return events.flatMap((e) => {
    const member = memberOf(e.person);
    return occurrenceDates(e, from, to).map((date) => {
      const start = e.time ? new Date(`${date}T${e.time}`) : fromKey(date);
      return {
        id: `hub:${e.id}:${date}`,
        hubId: e.id,
        date,
        repeats: Boolean(e.repeat),
        title: e.title || '(No title)',
        allDay: !e.time,
        start,
        end: e.time ? new Date(start.getTime() + 60 * 60 * 1000) : addDays(start, 1),
        color: member?.color,
        textColor: '#ffffff',
        calendar: member?.name ?? 'Family',
      };
    });
  });
}
