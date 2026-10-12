import { Fragment, useState } from 'react';
import { fmtWeekday, todayKey, toKey, weekDays } from '../dates.js';
import { newId } from '../store.js';
import { WeekNav } from './common.jsx';

// Days are stored as getDay() numbers: 0 = Sunday … 6 = Saturday.
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const PRESETS = [
  ['Every day', EVERY_DAY],
  ['Weekdays', [1, 2, 3, 4, 5]],
  ['Weekends', [0, 6]],
];

const SECTIONS = [
  ['morning', '☀️ Morning'],
  ['afterschool', '🎒 After School'],
  ['evening', '🌙 Evening'],
];
// Chores saved before sections existed count as Morning.
const sectionOf = (chore) => (SECTIONS.some(([id]) => id === chore.section) ? chore.section : 'morning');

function SectionPicker({ value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label="Time of day">
      {SECTIONS.map(([id, label]) => (
        <button key={id} type="button" className={value === id ? 'active' : ''} aria-pressed={value === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const sameDays = (a, b) => a.length === b.length && a.every((d) => b.includes(d));

function describeDays(days) {
  const preset = PRESETS.find(([, d]) => sameDays(d, days));
  if (preset) return preset[0];
  if (days.length === 0) return 'No days';
  return [...days].sort().map((d) => DAY_NAMES[d]).join(', ');
}

function DayPicker({ days, onChange }) {
  const toggle = (d) => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());
  return (
    <div className="day-picker">
      <div className="day-toggles" role="group" aria-label="Repeat on">
        {LETTERS.map((letter, d) => (
          <button
            key={d}
            type="button"
            className={days.includes(d) ? 'on' : ''}
            aria-pressed={days.includes(d)}
            aria-label={DAY_NAMES[d]}
            onClick={() => toggle(d)}
          >
            {letter}
          </button>
        ))}
      </div>
      {PRESETS.map(([label, preset]) => (
        <button key={label} type="button" className="link-btn" onClick={() => onChange(preset)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function AddChore({ onAdd }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState(EVERY_DAY);
  const [section, setSection] = useState('morning');
  return (
    <form
      className="add-chore"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || days.length === 0) return;
        onAdd(name.trim(), days, section);
        setName('');
      }}
    >
      <div className="add-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a chore, e.g. Make bed" />
        <button className="btn primary" type="submit" disabled={days.length === 0}>Add</button>
      </div>
      <SectionPicker value={section} onChange={setSection} />
      <DayPicker days={days} onChange={setDays} />
    </form>
  );
}

function KidChart({ kid, chores, checked, days, today, update }) {
  const [editingId, setEditingId] = useState(null);

  const patchChore = (id, p) => update('chores', (cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const removeChore = (chore) => {
    update('chores', (cs) => cs.filter((c) => c.id !== chore.id));
    update('choreChecks', (cs) => cs.filter((c) => c.choreId !== chore.id));
  };
  const toggle = (choreId, date) =>
    update('choreChecks', (cs) =>
      checked.has(`${choreId}|${date}`)
        ? cs.filter((c) => !(c.choreId === choreId && c.date === date))
        : [...cs, { choreId, date }],
    );

  const scheduled = (chore, day) => chore.days.includes(day.getDay());
  const todayDow = new Date().getDay();
  const dueToday = chores.filter((c) => c.days.includes(todayDow));
  const doneToday = dueToday.filter((c) => checked.has(`${c.id}|${today}`)).length;
  let weekDue = 0;
  let weekDone = 0;
  for (const c of chores) {
    for (const day of days) {
      if (!scheduled(c, day)) continue;
      weekDue += 1;
      if (checked.has(`${c.id}|${toKey(day)}`)) weekDone += 1;
    }
  }

  return (
    <div className={`panel kid-panel ${kid.id === 'kid2' ? 'kid-b' : 'kid-a'}`}>
      <div className="panel-head">
        <input
          className="plain title-input"
          value={kid.name}
          aria-label="Kid's name"
          title="Click to rename"
          onChange={(e) => update('kids', (ks) => ks.map((k) => (k.id === kid.id ? { ...k, name: e.target.value } : k)))}
        />
        <div className="kid-stats">
          {dueToday.length > 0 &&
            (doneToday === dueToday.length ? (
              <span className="all-done">⭐ All done today!</span>
            ) : (
              <span>Today: <strong>{doneToday}/{dueToday.length}</strong></span>
            ))}
          {weekDue > 0 && <span className="muted">This week: {weekDone}/{weekDue}</span>}
        </div>
      </div>

      {chores.length === 0 ? (
        <p className="empty">No chores yet. Add one below.</p>
      ) : (
        <table className="chore-table">
          <thead>
            <tr>
              <th className="chore-col">Chore</th>
              {days.map((day) => (
                <th key={toKey(day)} className={toKey(day) === today ? 'today' : ''}>
                  <span className="dow">{fmtWeekday(day)}</span>
                  <span className="dnum">{day.getDate()}</span>
                </th>
              ))}
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map(([sectionId, label]) => {
              const list = chores.filter((c) => sectionOf(c) === sectionId);
              if (list.length === 0) return null;
              return (
                <Fragment key={sectionId}>
                  <tr className="section-row">
                    <th colSpan={days.length + 2}>{label}</th>
                  </tr>
                  {list.map((chore) => (
                    <Fragment key={chore.id}>
                      <tr>
                        <td className="chore-col">
                          <input
                            className="plain chore-name"
                            value={chore.name}
                            aria-label="Chore name"
                            title="Click to rename"
                            onChange={(e) => patchChore(chore.id, { name: e.target.value })}
                          />
                          <button className="link-btn chore-days" onClick={() => setEditingId(editingId === chore.id ? null : chore.id)}>
                            {describeDays(chore.days)} ▾
                          </button>
                        </td>
                        {days.map((day) => {
                          const key = toKey(day);
                          if (!scheduled(chore, day)) return <td key={key} className={`off ${key === today ? 'today' : ''}`} />;
                          const done = checked.has(`${chore.id}|${key}`);
                          return (
                            <td key={key} className={key === today ? 'today' : ''}>
                              <input
                                type="checkbox"
                                className="chore-check"
                                checked={done}
                                disabled={key > today}
                                title={key > today ? 'Not yet!' : undefined}
                                aria-label={`${chore.name} on ${fmtWeekday(day)}`}
                                onChange={() => toggle(chore.id, key)}
                              />
                            </td>
                          );
                        })}
                        <td>
                          <button className="icon-btn subtle" onClick={() => removeChore(chore)} aria-label={`Delete ${chore.name}`} title="Delete chore">×</button>
                        </td>
                      </tr>
                      {editingId === chore.id && (
                        <tr className="edit-row">
                          <td colSpan={days.length + 2}>
                            <div className="chore-edit">
                              <SectionPicker value={sectionOf(chore)} onChange={(sec) => patchChore(chore.id, { section: sec })} />
                              <DayPicker days={chore.days} onChange={(d) => d.length && patchChore(chore.id, { days: d })} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      <AddChore
        onAdd={(name, choreDays, section) =>
          update('chores', (cs) => [...cs, { id: newId(), kidId: kid.id, name, days: choreDays, section, createdAt: Date.now() }])
        }
      />
    </div>
  );
}

export default function Chores({ state, update, weekStart, setWeekStart }) {
  const { kids, chores, choreChecks } = state;
  const today = todayKey();
  const days = weekDays(weekStart);
  const checked = new Set(choreChecks.map((c) => `${c.choreId}|${c.date}`));

  return (
    <section>
      <div className="toolbar">
        <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
      </div>
      <div className="kid-grid">
        {kids.map((kid) => (
          <KidChart
            key={kid.id}
            kid={kid}
            chores={chores.filter((c) => c.kidId === kid.id)}
            checked={checked}
            days={days}
            today={today}
            update={update}
          />
        ))}
      </div>
    </section>
  );
}
