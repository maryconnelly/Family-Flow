import { useState } from 'react';
import { newId } from '../store.js';
import { TodoItem } from './common.jsx';
import { todayKey } from '../dates.js';

const byDueThenCreated = (a, b) =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt - b.createdAt;

export default function Todos({ state, update }) {
  const { lists, todos } = state;
  const [selectedId, setSelectedId] = useState(lists[0]?.id);
  const [newList, setNewList] = useState('');
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const list = lists.find((l) => l.id === selectedId) ?? lists[0];
  const today = todayKey();

  const items = todos.filter((t) => t.listId === list?.id);
  const open = items.filter((t) => !t.done).sort(byDueThenCreated);
  const done = items.filter((t) => t.done);

  const patch = (id, p) => update('todos', (ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const remove = (id) => update('todos', (ts) => ts.filter((t) => t.id !== id));

  function addTodo(e) {
    e.preventDefault();
    if (!text.trim() || !list) return;
    update('todos', (ts) => [...ts, { id: newId(), listId: list.id, text: text.trim(), done: false, due: due || null, createdAt: Date.now() }]);
    setText('');
    setDue('');
  }

  function addList(e) {
    e.preventDefault();
    if (!newList.trim()) return;
    const id = newId();
    update('lists', (ls) => [...ls, { id, name: newList.trim() }]);
    setSelectedId(id);
    setNewList('');
  }

  function deleteList(target) {
    const count = todos.filter((t) => t.listId === target.id).length;
    if (count && !window.confirm(`Delete "${target.name}" and its ${count} to-do(s)?`)) return;
    update('lists', (ls) => ls.filter((l) => l.id !== target.id));
    update('todos', (ts) => ts.filter((t) => t.listId !== target.id));
    setSelectedId(lists.find((l) => l.id !== target.id)?.id);
  }

  return (
    <section className="split">
      <aside className="panel side">
        <h2>Lists</h2>
        <ul className="nav-list">
          {lists.map((l) => {
            const openCount = todos.filter((t) => t.listId === l.id && !t.done).length;
            return (
              <li key={l.id}>
                <button className={l.id === list?.id ? 'active' : ''} onClick={() => setSelectedId(l.id)}>
                  <span>{l.name}</span>
                  {openCount > 0 && <span className="count">{openCount}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <form onSubmit={addList} className="inline-form">
          <input value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="New list…" />
        </form>
      </aside>

      {list && (
        <div className="panel main">
          <div className="panel-head">
            <input
              className="plain title-input"
              value={list.name}
              onChange={(e) => update('lists', (ls) => ls.map((l) => (l.id === list.id ? { ...l, name: e.target.value } : l)))}
              aria-label="List name"
            />
            {lists.length > 1 && (
              <button className="link-btn danger" onClick={() => deleteList(list)}>Delete list</button>
            )}
          </div>

          <form onSubmit={addTodo} className="add-row">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do…" />
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
            <button className="btn primary" type="submit">Add</button>
          </form>

          {open.length === 0 && <p className="empty">Nothing to do here. 🎉</p>}
          <ul className="todos">
            {open.map((t) => (
              <TodoItem
                key={t.id}
                todo={t}
                overdue={Boolean(t.due && t.due < today)}
                onToggle={() => patch(t.id, { done: true })}
                onChange={(p) => patch(t.id, p)}
                onDelete={() => remove(t.id)}
              />
            ))}
          </ul>

          {done.length > 0 && (
            <details className="done-section">
              <summary>Completed ({done.length})</summary>
              <ul className="todos">
                {done.map((t) => (
                  <TodoItem
                    key={t.id}
                    todo={t}
                    onToggle={() => patch(t.id, { done: false })}
                    onChange={(p) => patch(t.id, p)}
                    onDelete={() => remove(t.id)}
                  />
                ))}
              </ul>
              <button className="link-btn" onClick={() => update('todos', (ts) => ts.filter((t) => !(t.listId === list.id && t.done)))}>
                Clear completed
              </button>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
