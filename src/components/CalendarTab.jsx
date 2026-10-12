import { startOfMonth, startOfWeek, toKey } from '../dates.js';
import { MonthNav, WeekNav } from './common.jsx';
import MonthView from './MonthView.jsx';
import WeekView from './WeekView.jsx';
import { WeatherLocation } from './Weather.jsx';

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

export default function CalendarTab({ view, setView, monthStart, setMonthStart, calendar, weather, ...props }) {
  const { weekStart, setWeekStart } = props;

  function switchTo(next) {
    if (next === view) return;
    if (next === 'month') {
      // Show the month that most of the current week falls in.
      setMonthStart(startOfMonth(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 3)));
    } else {
      const now = new Date();
      const showingThisMonth = toKey(monthStart) === toKey(startOfMonth(now));
      setWeekStart(startOfWeek(showingThisMonth ? now : monthStart));
    }
    setView(next);
  }

  function openDay(day) {
    setWeekStart(startOfWeek(day));
    setView('week');
  }

  return (
    <section>
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="segmented" role="group" aria-label="Calendar view">
            {['week', 'month'].map((v) => (
              <button key={v} className={view === v ? 'active' : ''} aria-pressed={view === v} onClick={() => switchTo(v)}>
                {v === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          {view === 'week' ? (
            <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
          ) : (
            <MonthNav monthStart={monthStart} setMonthStart={setMonthStart} />
          )}
          <WeatherLocation weather={weather} />
        </div>
        <CalendarBar calendar={calendar} />
      </div>
      {view === 'week' ? (
        <WeekView {...props} calendar={calendar} weather={weather} />
      ) : (
        <MonthView {...props} calendar={calendar} weather={weather} monthStart={monthStart} onOpenDay={openDay} />
      )}
    </section>
  );
}
