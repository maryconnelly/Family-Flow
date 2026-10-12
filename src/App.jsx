import { useEffect, useState } from 'react';
import { useStore } from './store.js';
import { useCalendar } from './useCalendar.js';
import { startOfWeek } from './dates.js';
import WeekView from './components/WeekView.jsx';
import Todos from './components/Todos.jsx';
import Meals from './components/Meals.jsx';
import Groceries from './components/Groceries.jsx';

const TABS = [
  ['week', 'Week'],
  ['todos', 'To-dos'],
  ['meals', 'Meals'],
  ['groceries', 'Groceries'],
];

const tabFromHash = () => {
  const hash = window.location.hash.slice(1);
  return TABS.some(([id]) => id === hash) ? hash : 'week';
};

export default function App() {
  const { state, update, error } = useStore();
  const [tab, setTab] = useState(tabFromHash);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const calendar = useCalendar(weekStart);

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
            {tab === 'week' && <WeekView {...props} calendar={calendar} />}
            {tab === 'todos' && <Todos {...props} />}
            {tab === 'meals' && <Meals {...props} />}
            {tab === 'groceries' && <Groceries {...props} />}
          </>
        )}
      </main>
    </div>
  );
}
