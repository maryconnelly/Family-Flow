import { useState } from 'react';
import { fmtMonthDay, fmtTime, fmtWeekday, todayKey, toKey, weekDays } from '../dates.js';
import { eventsOnDay } from '../google.js';
import { SLOTS, findMeal, setMeal } from '../meals.js';
import { newId } from '../store.js';
import { MealSlot, TodoItem, WeekNav } from './common.jsx';

function CalendarBar({ calendar }) {
  const { status, error, connect, disconnect, refresh } = calendar;
  return (
    <div className="calendar-bar">
      {status === 'unconfigured' && (
        <span className="muted">Google Calendar isn't set up yet — add your client ID to <code>.env.local</code> (see README).</span>
      )}
      {status === 'disconnected' && <button className="btn primary" onClick={connect}>Connect Google Calendar</button>}
      {status === 'expired' && (
        <>
          <span className="muted">Google session expired.</span>
          <button className="btn" onClick={connect}>Reconnect</button>
        </>
      )}
      {status === 'loading' && <span className="muted">Syncing calendar…</span>}
      {status === 'ready' && (
        <>
          <span className="muted">Google Calendar connected</span>
          <button className="link-btn" onClick={refresh}>Refresh</button>
          <button className="link-btn" onClick={disconnect}>Disconnect</button>
        </>
      )}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

function QuickAddTodo({ onAdd }) {
  const [text, setText] = useState('');
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAdd(text.trim());
        setText('');
      }}
    >
      <input className="plain" value={text} onChange={(e) => setText(e.target.value)} placeholder="+ To-do" />
    </form>
  );
}

export default function WeekView({ state, update, calendar, weekStart, setWeekStart }) {
  const today = todayKey();
  const { todos, recipes, meals, lists } = state;

  const patchTodo = (id, patch) => update('todos', (ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const addTodo = (text, due) =>
    update('todos', (ts) => [...ts, { id: newId(), listId: lists[0]?.id, text, done: false, due, createdAt: Date.now() }]);

  return (
    <section>
      <div className="toolbar">
        <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
        <CalendarBar calendar={calendar} />
      </div>
      <div className="week-grid">
        {weekDays(weekStart).map((day) => {
          const key = toKey(day);
          const isToday = key === today;
          const events = eventsOnDay(calendar.events, day);
          const dayTodos = todos.filter((t) => t.due === key);
          const overdue = isToday ? todos.filter((t) => !t.done && t.due && t.due < today) : [];
          return (
            <article key={key} className={`day-card ${isToday ? 'today' : ''} ${key < today ? 'past' : ''}`}>
              <header className="day-head">
                <span className="weekday">{fmtWeekday(day)}</span>
                <span className="date">{fmtMonthDay(day)}</span>
              </header>

              {events.length > 0 && (
                <ul className="events">
                  {events.map((ev) => (
                    <li key={ev.id} className="event" style={{ '--cal': ev.color }}>
                      <a href={ev.link} target="_blank" rel="noreferrer" title={`${ev.calendar}${ev.location ? ` · ${ev.location}` : ''}`}>
                        <span className="event-time">{ev.allDay ? 'All day' : fmtTime(ev.start)}</span>
                        <span className="event-title">{ev.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              <div className="meals">
                {SLOTS.map((slot) => (
                  <MealSlot
                    key={slot}
                    slot={slot}
                    meal={findMeal(meals, key, slot)}
                    recipes={recipes}
                    onChange={(value) => setMeal(update, key, slot, value)}
                  />
                ))}
              </div>

              <ul className="todos compact">
                {[...overdue, ...dayTodos].map((t) => (
                  <TodoItem
                    key={t.id}
                    todo={t}
                    overdue={t.due < key}
                    showDue={false}
                    onToggle={() => patchTodo(t.id, { done: !t.done })}
                  />
                ))}
              </ul>
              <QuickAddTodo onAdd={(text) => addTodo(text, key)} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
