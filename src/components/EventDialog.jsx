import { useEffect, useState } from 'react';
import { addDays, fromKey, toKey } from '../dates.js';
import { FAMILY } from '../family.js';
import { WEEKDAY_SHORT, describeRepeat, nthOfMonth, presetId, presets } from '../repeat.js';

let lastPerson = FAMILY[0].id; // a new event starts with whoever the last one was for

const UNITS = [
  ['daily', 'day', 'days'],
  ['weekdays', 'weekday (skip weekends)', 'weekdays (skip weekends)'],
  ['weekly', 'week', 'weeks'],
  ['monthly', 'month', 'months'],
  ['yearly', 'year', 'years'],
];
const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// The "Custom" repeat choices, like Google Calendar's custom recurrence plus every N weekdays.
function CustomRepeat({ rule, onChange, date }) {
  const d = fromKey(date);
  const n = rule.interval || 1;
  const ends = rule.ends || { type: 'never' };
  const patch = (p) => onChange({ ...rule, ...p });
  const toggleDay = (i) => {
    const days = rule.byDay?.length ? rule.byDay : [d.getDay()];
    const next = days.includes(i) ? days.filter((x) => x !== i) : [...days, i];
    if (next.length) patch({ byDay: next.sort() });
  };
  const setEnds = (type) =>
    patch({ ends: type === 'on' ? { type, until: ends.until || toKey(addDays(d, 30)) } : type === 'after' ? { type, count: ends.count || 10 } : { type } });

  return (
    <div className="custom-repeat">
      <label className="row">
        Repeat every
        <input type="number" min="1" max="99" value={n} onChange={(e) => patch({ interval: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} aria-label="How many" />
        <select value={rule.freq} aria-label="Unit"
          onChange={(e) => patch({ freq: e.target.value, byDay: e.target.value === 'weekly' ? [d.getDay()] : undefined, monthly: e.target.value === 'monthly' ? 'day' : undefined })}>
          {UNITS.map(([id, one, many]) => <option key={id} value={id}>{n === 1 ? one : many}</option>)}
        </select>
      </label>
      {rule.freq === 'weekly' && (
        <div className="row">
          Repeat on
          <div className="day-toggles" role="group" aria-label="Days of the week">
            {LETTERS.map((letter, i) => {
              const on = (rule.byDay?.length ? rule.byDay : [d.getDay()]).includes(i);
              return (
                <button key={i} type="button" className={on ? 'on' : ''} aria-pressed={on} aria-label={WEEKDAY_SHORT[i]} onClick={() => toggleDay(i)}>{letter}</button>
              );
            })}
          </div>
        </div>
      )}
      {rule.freq === 'monthly' && (
        <select value={rule.monthly || 'day'} onChange={(e) => patch({ monthly: e.target.value })} aria-label="Which day of the month">
          <option value="day">Monthly on day {d.getDate()}</option>
          <option value="nth">Monthly on the {ORDINALS[nthOfMonth(d)]} {d.toLocaleDateString(undefined, { weekday: 'long' })}</option>
        </select>
      )}
      {rule.freq === 'weekdays' && <p className="hint">Counts Monday to Friday only. Weekends are skipped and don't count toward the {n}.</p>}
      <fieldset className="ends">
        <legend>Ends</legend>
        <label><input type="radio" name="ends" checked={ends.type === 'never'} onChange={() => setEnds('never')} /> Never</label>
        <label>
          <input type="radio" name="ends" checked={ends.type === 'on'} onChange={() => setEnds('on')} /> On
          <input type="date" value={ends.until || ''} disabled={ends.type !== 'on'} min={date} aria-label="End date"
            onChange={(e) => e.target.value && patch({ ends: { type: 'on', until: e.target.value } })} />
        </label>
        <label>
          <input type="radio" name="ends" checked={ends.type === 'after'} onChange={() => setEnds('after')} /> After
          <input type="number" min="1" max="999" value={ends.count || 10} disabled={ends.type !== 'after'} aria-label="Number of times"
            onChange={(e) => patch({ ends: { type: 'after', count: Math.max(1, Number(e.target.value) || 1) } })} />
          times
        </label>
      </fieldset>
    </div>
  );
}

// Adding or changing an event on the hub's calendar. `date` is the day clicked (for a repeating event, the
// occurrence clicked); `initial` is the saved event when changing one. Saving or deleting a repeating event asks
// whether it's for this one, this and the following ones, or all of them, like Google Calendar.
// `template` pre-fills a new event (Duplicate); a new event's date can be changed.
export default function EventDialog({ date, initial, template, onSave, onDelete, onDuplicate, onClose }) {
  const from = initial ?? template;
  const [day, setDay] = useState(date);
  const [title, setTitle] = useState(from?.title ?? '');
  const [time, setTime] = useState(from?.time ?? '');
  const [person, setPerson] = useState(from?.person ?? lastPerson);
  const [repeat, setRepeat] = useState(from?.repeat ?? null);
  const [custom, setCustom] = useState(() => presetId(from?.repeat, initial?.date ?? date) === 'custom');
  const [scope, setScope] = useState('this');
  const repeating = Boolean(initial?.repeat);
  const ruleDate = initial?.date && scope === 'all' ? initial.date : day; // what weekday/date the repeat choices are worded for
  const choice = custom ? 'custom' : presetId(repeat, ruleDate);
  const showRepeat = !(repeating && scope === 'this'); // changing just one occurrence can't change how it repeats

  useEffect(() => {
    const close = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  function chooseRepeat(id) {
    setCustom(id === 'custom');
    if (id === 'none') setRepeat(null);
    else if (id === 'custom') setRepeat(repeat ?? { freq: 'weekly', interval: 1, byDay: [fromKey(ruleDate).getDay()], ends: { type: 'never' } });
    else setRepeat({ ...presets(ruleDate).find(([p]) => p === id)[2], ends: { type: 'never' } });
  }

  function submit(e) {
    e.preventDefault();
    if (!title.trim() || !day) return;
    lastPerson = person;
    onSave({ title: title.trim(), time, person, repeat: showRepeat ? repeat : initial.repeat, ...(!initial && { date: day }) }, scope);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog event-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-label={initial ? 'Change event' : template ? 'Copy of event' : 'New event'}>
        {template && <p className="hint dup-note">Copy of “{template.title}”. Pick a day and change anything, then Save.</p>}
        <input className="event-title-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add title" aria-label="Event name" />
        <div className="row">
          {initial ? (
            <strong>{fromKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</strong>
          ) : (
            <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Date" required />
          )}
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
          {time ? <button type="button" className="link-btn" onClick={() => setTime('')}>Make it all day</button> : <span className="muted">All day</span>}
        </div>
        <div className="person-picker" role="radiogroup" aria-label="Who it's for">
          {FAMILY.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={person === m.id} className={person === m.id ? 'on' : ''}
              style={{ '--person': m.color }} onClick={() => setPerson(m.id)}>
              {m.name}
            </button>
          ))}
        </div>

        {repeating && (
          <fieldset className="scope">
            <legend>Change or delete</legend>
            {[['this', 'This event'], ['following', 'This and following events'], ['all', 'All events']].map(([id, label]) => (
              <label key={id}><input type="radio" name="scope" checked={scope === id} onChange={() => setScope(id)} /> {label}</label>
            ))}
          </fieldset>
        )}

        {showRepeat && (
          <>
            <label className="row">
              🔁
              <select value={choice} onChange={(e) => chooseRepeat(e.target.value)} aria-label="Repeat">
                <option value="none">Does not repeat</option>
                {presets(ruleDate).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                <option value="custom">{choice === 'custom' && repeat ? `Custom: ${describeRepeat(repeat, ruleDate)}` : 'Custom…'}</option>
              </select>
            </label>
            {choice === 'custom' && repeat && <CustomRepeat rule={repeat} onChange={setRepeat} date={ruleDate} />}
          </>
        )}

        <div className="event-form-actions">
          <button className="btn primary" type="submit" disabled={!title.trim()}>Save</button>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          {onDuplicate && (
            <button className="btn" type="button" title="Make a copy of this event"
              onClick={() => onDuplicate({ title: title.trim() || initial.title, time, person, repeat: showRepeat ? repeat : initial.repeat })}>
              Duplicate
            </button>
          )}
          {onDelete && <button className="btn danger" type="button" onClick={() => onDelete(scope)}>Delete</button>}
        </div>
      </form>
    </div>
  );
}
