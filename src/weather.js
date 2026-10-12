import { useCallback, useEffect, useState } from 'react';

// Forecasts from Open-Meteo (free, no API key). Location is saved in this browser.
const LOCATION_KEY = 'ff.weatherLocation';
const REFRESH_MS = 60 * 60 * 1000;

const CONDITIONS = [
  [[0], '☀️', 'Clear'],
  [[1], '🌤️', 'Mostly clear'],
  [[2], '⛅', 'Partly cloudy'],
  [[3], '☁️', 'Cloudy'],
  [[45, 48], '🌫️', 'Fog'],
  [[51, 53, 55], '🌦️', 'Drizzle'],
  [[56, 57], '🌧️', 'Freezing drizzle'],
  [[61, 63, 65], '🌧️', 'Rain'],
  [[66, 67], '🌧️', 'Freezing rain'],
  [[71, 73, 75, 77], '🌨️', 'Snow'],
  [[80, 81, 82], '🌦️', 'Showers'],
  [[85, 86], '🌨️', 'Snow showers'],
  [[95], '⛈️', 'Thunderstorms'],
  [[96, 99], '⛈️', 'Thunderstorms with hail'],
];

function condition(code) {
  const match = CONDITIONS.find(([codes]) => codes.includes(code));
  return match ? { icon: match[1], label: match[2] } : { icon: '🌡️', label: 'Weather' };
}

function readLocation() {
  try {
    return JSON.parse(localStorage.getItem(LOCATION_KEY));
  } catch {
    return null;
  }
}

function writeLocation(location) {
  try {
    if (location) localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
    else localStorage.removeItem(LOCATION_KEY);
  } catch {
    // Storage unavailable; the location just won't be remembered after reload.
  }
}

// Accepts a US ZIP code or a city name.
async function geocode(query) {
  const params = new URLSearchParams({ name: query.trim(), count: '1', countryCode: 'US' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error(`Location lookup failed (${res.status})`);
  const place = (await res.json()).results?.[0];
  if (!place) throw new Error(`Couldn't find "${query.trim()}". Try a ZIP code or "City, State".`);
  return {
    label: [place.name, place.admin1].filter(Boolean).join(', '),
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

// Returns { "YYYY-MM-DD": { icon, label, high, low, precip } } for ~a month back through 16 days ahead.
async function fetchForecast({ latitude, longitude }) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    temperature_unit: 'fahrenheit',
    timezone: 'auto',
    past_days: '31',
    forecast_days: '16',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Weather unavailable (${res.status})`);
  const { daily } = await res.json();
  const byDay = {};
  daily.time.forEach((date, i) => {
    const high = daily.temperature_2m_max[i];
    if (high == null) return;
    byDay[date] = {
      ...condition(daily.weather_code[i]),
      high: Math.round(high),
      low: Math.round(daily.temperature_2m_min[i]),
      precip: daily.precipitation_probability_max[i],
    };
  });
  return byDay;
}

export function useWeather() {
  const [location, setLocationState] = useState(readLocation);
  const [days, setDays] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!location) {
      setDays({});
      return;
    }
    let cancelled = false;
    const load = () =>
      fetchForecast(location)
        .then((d) => {
          if (cancelled) return;
          setDays(d);
          setError(null);
        })
        .catch((err) => !cancelled && setError(err.message));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [location]);

  // Looks up the place and saves it; throws with a readable message if not found.
  const setLocation = useCallback(async (query) => {
    const place = await geocode(query);
    writeLocation(place);
    setLocationState(place);
  }, []);

  const clearLocation = useCallback(() => {
    writeLocation(null);
    setLocationState(null);
  }, []);

  return { location, days, error, setLocation, clearLocation };
}
