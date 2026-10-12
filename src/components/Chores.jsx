import { useState } from 'react';
import { addDays, fmtMonthDay, todayKey, toKey } from '../dates.js';
import { newId } from '../store.js';

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

// Moves chore `id` just before (or after) `targetId` in the full chores array; display order follows array order.
function moveChore(chores, id, targetId, after) {
  if (id === targetId) return chores;
  const moving = chores.find((c) => c.id === id);
  const rest = chores.filter((c) => c.id !== id);
  const i = rest.findIndex((c) => c.id === targetId);
  if (!moving || i < 0) return chores;
  rest.splice(after ? i + 1 : i, 0, moving);
  return rest;
}

// Collapsed to a button until needed; stays open after adding so several chores can be entered in a row.
function AddChore({ sectionLabel, onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState(EVERY_DAY);

  function close() {
    setOpen(false);
    setName('');
    setDays(EVERY_DAY);
  }

  if (!open) {
    return (
      <button type="button" className="add-chore-toggle" onClick={() => setOpen(true)}>
        + Add new chore
      </button>
    );
  }

  return (
    <form
      className="add-chore"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || days.length === 0) return;
        onAdd(name.trim(), days);
        setName('');
      }}
      onKeyDown={(e) => e.key === 'Escape' && close()}
    >
      <div className="add-row">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`New ${sectionLabel.toLowerCase()} chore…`}
          aria-label={`New ${sectionLabel.toLowerCase()} chore`}
        />
        <button className="btn primary" type="submit" disabled={days.length === 0}>Add</button>
      </div>
      <div className="add-chore-footer">
        <DayPicker days={days} onChange={setDays} />
        <button type="button" className="btn" onClick={close}>Done</button>
      </div>
    </form>
  );
}

function DayNav({ date, setDate }) {
  const isToday = toKey(date) === todayKey();
  const now = new Date();
  return (
    <div className="week-nav">
      {/* Placed first so the arrows don't shift when it appears. */}
      {!isToday && (
        <button className="link-btn" onClick={() => setDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()))}>
          Today
        </button>
      )}
      <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
      <span className="week-label day-label">
        {isToday ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'long' })}
        <span className="muted"> · {fmtMonthDay(date)}</span>
      </span>
      <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
    </div>
  );
}

function KidChart({ kid, chores, section, sectionLabel, date, today, checked, update }) {
  const [editingId, setEditingId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { id, after }

  const dateKey = toKey(date);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  const isFuture = dateKey > today;
  const due = chores.filter((c) => c.days.includes(date.getDay()));
  const notDue = chores.filter((c) => !c.days.includes(date.getDay()));
  const doneCount = due.filter((c) => checked.has(`${c.id}|${dateKey}`)).length;

  const patchChore = (id, p) => update('chores', (cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const removeChore = (chore) => {
    update('chores', (cs) => cs.filter((c) => c.id !== chore.id));
    update('choreChecks', (cs) => cs.filter((c) => c.choreId !== chore.id));
  };
  const toggle = (choreId) =>
    update('choreChecks', (cs) =>
      checked.has(`${choreId}|${dateKey}`)
        ? cs.filter((c) => !(c.choreId === choreId && c.date === dateKey))
        : [...cs, { choreId, date: dateKey }],
    );
  const reorder = (id, targetId, after) => update('chores', (cs) => moveChore(cs, id, targetId, after));

  // Arrow keys on a focused handle move the chore past its neighbor in the same list.
  function onHandleKey(e, list, index) {
    const neighbor = e.key === 'ArrowUp' ? list[index - 1] : e.key === 'ArrowDown' ? list[index + 1] : null;
    if (!neighbor) return;
    e.preventDefault();
    const id = list[index].id;
    reorder(id, neighbor.id, e.key === 'ArrowDown');
    requestAnimationFrame(() => document.querySelector(`[data-handle="${id}"]`)?.focus());
  }

  // Dropping above a row's middle inserts before it, below inserts after.
  const dragProps = (chore) => ({
    onDragOver: (e) => {
      if (!draggingId) return; // Ignore drags from the other kid's chart.
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      if (dropTarget?.id !== chore.id || dropTarget.after !== after) setDropTarget({ id: chore.id, after });
    },
    onDrop: (e) => {
      if (!draggingId) return;
      e.preventDefault();
      if (dropTarget) reorder(draggingId, dropTarget.id, dropTarget.after);
      setDraggingId(null);
      setDropTarget(null);
    },
  });

  function renderChore(chore, list, index, checkable) {
    const done = checkable && checked.has(`${chore.id}|${dateKey}`);
    const classes = [
      'chore-item',
      done && 'done',
      draggingId === chore.id && 'dragging',
      dropTarget?.id === chore.id && draggingId !== chore.id && (dropTarget.after ? 'drop-after' : 'drop-before'),
    ].filter(Boolean).join(' ');
    return (
      <li key={chore.id} className={classes} {...dragProps(chore)}>
        <button
          type="button"
          className="drag-handle"
          draggable
          data-handle={chore.id}
          aria-label={`Reorder ${chore.name} (use arrow keys)`}
          title="Drag to reorder"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', chore.id);
            e.dataTransfer.setDragImage(e.currentTarget.closest('li'), 12, 16);
            setDraggingId(chore.id);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDropTarget(null);
          }}
          onKeyDown={(e) => onHandleKey(e, list, index)}
        >
          ⠿
        </button>
        {checkable && (
          <input
            type="checkbox"
            className="chore-check"
            checked={done}
            disabled={isFuture}
            title={isFuture ? 'Not yet!' : undefined}
            aria-label={`${chore.name} done`}
            onChange={() => toggle(chore.id)}
          />
        )}
        <div className="chore-text">
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
        </div>
        <button className="icon-btn subtle" onClick={() => removeChore(chore)} aria-label={`Delete ${chore.name}`} title="Delete chore">×</button>
        {editingId === chore.id && (
          <div className="chore-edit">
            <DayPicker days={chore.days} onChange={(d) => d.length && patchChore(chore.id, { days: d })} />
            <div className="move-to">
              <span className="hint">Move to:</span>
              <SectionPicker value={sectionOf(chore)} onChange={(sec) => patchChore(chore.id, { section: sec })} />
              <button type="button" className="btn primary done-btn" onClick={() => setEditingId(null)}>Done</button>
            </div>
          </div>
        )}
      </li>
    );
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
        {due.length > 0 && (
          <div className="kid-stats">
            {doneCount === due.length ? (
              <span className="all-done">⭐ All done!</span>
            ) : (
              <span><strong>{doneCount}/{due.length}</strong> done</span>
            )}
          </div>
        )}
      </div>

      {chores.length === 0 ? (
        <p className="empty">No {sectionLabel.toLowerCase()} chores yet.</p>
      ) : due.length === 0 ? (
        <p className="empty">No {sectionLabel.toLowerCase()} chores on {weekday}. 🎉</p>
      ) : (
        <ul className="chore-list">{due.map((chore, i) => renderChore(chore, due, i, true))}</ul>
      )}

      {notDue.length > 0 && (
        <details className="not-due">
          <summary>{notDue.length} not on {weekday}</summary>
          <ul className="chore-list">{notDue.map((chore, i) => renderChore(chore, notDue, i, false))}</ul>
        </details>
      )}

      <AddChore
        key={section}
        sectionLabel={sectionLabel}
        onAdd={(name, choreDays) =>
          update('chores', (cs) => [...cs, { id: newId(), kidId: kid.id, name, days: choreDays, section, createdAt: Date.now() }])
        }
      />
    </div>
  );
}

// Opens on the part of the day it is now.
function currentSection() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afterschool';
  return 'evening';
}

export default function Chores({ state, update }) {
  const { kids, chores, choreChecks } = state;
  const [section, setSection] = useState(currentSection);
  const [date, setDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const today = todayKey();
  const checked = new Set(choreChecks.map((c) => `${c.choreId}|${c.date}`));
  const sectionLabel = SECTIONS.find(([id]) => id === section)[1].replace(/^\S+\s/, '');

  return (
    <section>
      <div className="toolbar">
        <div className="section-tabs">
          <SectionPicker value={section} onChange={setSection} />
        </div>
        <DayNav date={date} setDate={setDate} />
      </div>
      <div className="kid-grid">
        {kids.map((kid) => (
          <KidChart
            key={kid.id}
            kid={kid}
            chores={chores.filter((c) => c.kidId === kid.id && sectionOf(c) === section)}
            section={section}
            sectionLabel={sectionLabel}
            date={date}
            today={today}
            checked={checked}
            update={update}
          />
        ))}
      </div>
    </section>
  );
}
