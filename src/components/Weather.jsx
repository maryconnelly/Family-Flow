import { useState } from 'react';

// Shows the saved weather location, or a ZIP code form until one is set.
export function WeatherLocation({ weather }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await weather.setLocation(value);
      setEditing(false);
      setValue('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (weather.location && !editing) {
    return (
      <span className="location">
        <button className="link-btn" onClick={() => setEditing(true)} title="Change weather location">
          📍 {weather.location.label}
        </button>
        {weather.error && <span className="error-text">{weather.error}</span>}
      </span>
    );
  }

  return (
    <form className="location-form" onSubmit={submit}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ZIP for weather"
        aria-label="ZIP code or city for weather"
        autoFocus={editing}
        onKeyDown={(e) => e.key === 'Escape' && weather.location && setEditing(false)}
      />
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Finding…' : 'Save'}</button>
      {weather.location && (
        <button type="button" className="link-btn" onClick={() => setEditing(false)}>Cancel</button>
      )}
      {error && <span className="error-text">{error}</span>}
    </form>
  );
}

export function DayWeather({ forecast, compact = false }) {
  if (!forecast) return null;
  const { icon, label, high, low, precip } = forecast;
  const title = `${label} · High ${high}° / Low ${low}°${precip != null ? ` · ${precip}% chance of rain` : ''}`;
  return (
    <span className={`day-weather ${compact ? 'compact' : ''}`} title={title}>
      <span className="wx-icon" aria-hidden="true">{icon}</span>
      <span className="wx-temp">
        {high}°{!compact && <span className="wx-low"> / {low}°</span>}
      </span>
      {!compact && precip >= 30 && <span className="wx-precip">💧{precip}%</span>}
    </span>
  );
}
