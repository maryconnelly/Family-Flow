import { useEffect, useState } from 'react';
import { useStore } from './store.js';
import { useCalendar } from './useCalendar.js';
import { useWeather } from './weather.js';
import { addDays, monthGrid, startOfMonth, startOfWeek } from './dates.js';
import CalendarTab from './components/CalendarTab.jsx';
import Todos from './components/Todos.jsx';
import Meals from './components/Meals.jsx';
import Groceries from './components/Groceries.jsx';

const TABS = [
  ['week', 'Calendar'],
  ['todos', 'To-dos'],
  ['meals', 'Meals'],
  ['groceries', 'Groceries'],
];

const tabFromHash = () => {
  const hash = window.location.hash.slice(1);
  return TABS.some(([id]) => id === hash) ? hash : 'week';
};

const VIEW_KEY = 'ff.calendarView';

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

export default function App() {
  const { state, update, error } = useStore();
  const [tab, setTab] = useState(tabFromHash);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [view, setViewState] = useState(readView);

  const setView = (next) => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered across reloads; that's fine.
    }
  };

  // Fetch events for whatever the calendar tab is showing (the week also drives Meals/Groceries).
  const monthDays = monthGrid(monthStart);
  const showingMonth = tab === 'week' && view === 'month';
  const weather = useWeather();
  const calendar = useCalendar(
    showingMonth ? monthDays[0] : weekStart,
    showingMonth ? addDays(monthDays[monthDays.length - 1], 1) : addDays(weekStart, 7),
  );

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const props = { state, update, weekStart, setWeekStart };
  const remaining = state?.groceries.filter((g) => !g.done).length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>🌿 FamilyFlow</h1>
        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={tab === id ? 'active' : ''}>
              {label}
              {id === 'groceries' && remaining > 0 && <span className="count">{remaining}</span>}
            </a>
          ))}
        </nav>
      </header>

      {error && <div className="banner error">{error}</div>}

      <main>
        {!state ? (
          !error && <p className="empty">Loading…</p>
        ) : (
          <>
            {tab === 'week' && (
              <CalendarTab
                {...props}
                calendar={calendar}
                weather={weather}
                view={view}
                setView={setView}
                monthStart={monthStart}
                setMonthStart={setMonthStart}
              />
            )}
            {tab === 'todos' && <Todos {...props} />}
            {tab === 'meals' && <Meals {...props} />}
            {tab === 'groceries' && <Groceries {...props} />}
          </>
        )}
      </main>
    </div>
  );
}
