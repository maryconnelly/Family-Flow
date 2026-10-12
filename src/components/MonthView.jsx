import { fmtTime, monthGrid, todayKey, toKey } from '../dates.js';
import { eventsOnDay } from '../google.js';
import { SLOTS, findMeal, mealLabel } from '../meals.js';

const MAX_EVENTS = 3;
// Jan 4, 2026 is a Sunday; used only to get localized weekday names.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2026, 0, 4 + i).toLocaleDateString(undefined, { weekday: 'short' }),
);

export default function MonthView({ state, calendar, monthStart, onOpenDay }) {
  const today = todayKey();
  const { meals, recipes, todos } = state;

  return (
    <div className="month">
      <div className="month-head">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="month-grid">
        {monthGrid(monthStart).map((day) => {
          const key = toKey(day);
          const events = eventsOnDay(calendar.events, day);
          const dayMeals = SLOTS.map((slot) => mealLabel(findMeal(meals, key, slot), recipes)).filter(Boolean);
          const openTodos = todos.filter((t) => t.due === key && !t.done).length;
          const classes = [
            'month-cell',
            day.getMonth() !== monthStart.getMonth() && 'outside',
            key === today && 'today',
            key < today && 'past',
          ].filter(Boolean).join(' ');
          return (
            <button key={key} className={classes} onClick={() => onOpenDay(day)} title="Open this week">
              <span className="month-date">{day.getDate()}</span>
              {events.slice(0, MAX_EVENTS).map((ev) => (
                <span key={ev.id} className="month-event" style={{ '--cal': ev.color }}>
                  {!ev.allDay && <span className="event-time">{fmtTime(ev.start)} </span>}
                  {ev.title}
                </span>
              ))}
              {events.length > MAX_EVENTS && <span className="month-more">+{events.length - MAX_EVENTS} more</span>}
              {dayMeals.length > 0 && <span className="month-meals">🍽 {dayMeals.join(' · ')}</span>}
              {openTodos > 0 && <span className="month-todos">☐ {openTodos} to-do{openTodos > 1 ? 's' : ''}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
