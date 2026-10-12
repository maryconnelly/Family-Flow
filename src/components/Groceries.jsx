import { useState } from 'react';
import { toKey, weekDays } from '../dates.js';
import { CATEGORIES, categorize, ingredientsForMeals } from '../groceries.js';
import { newId } from '../store.js';
import { WeekNav } from './common.jsx';

export default function Groceries({ state, update, weekStart, setWeekStart }) {
  const { groceries, meals, recipes } = state;
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [notice, setNotice] = useState(null);

  const patch = (id, p) => update('groceries', (gs) => gs.map((g) => (g.id === id ? { ...g, ...p } : g)));
  const remove = (id) => update('groceries', (gs) => gs.filter((g) => g.id !== id));

  function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    update('groceries', (gs) => [
      ...gs,
      { id: newId(), name: name.trim(), qty: qty.trim(), category: categorize(name), done: false, source: 'manual' },
    ]);
    setName('');
    setQty('');
  }

  function addFromMealPlan() {
    const items = ingredientsForMeals(meals, recipes, weekDays(weekStart).map(toKey));
    if (items.length === 0) {
      setNotice('No linked recipes planned that week. Plan meals using saved recipes first.');
      return;
    }
    // Replace any earlier unchecked meal-plan items so regenerating doesn't duplicate.
    update('groceries', (gs) => [
      ...gs.filter((g) => !(g.source === 'meals' && !g.done)),
      ...items.map((i) => ({
        id: newId(), name: i.name, qty: i.qty, category: i.category, done: false, source: 'meals', note: i.from.join(', '),
      })),
    ]);
    setNotice(`Added ${items.length} ingredients. Remove anything you already have.`);
  }

  const remaining = groceries.filter((g) => !g.done).length;
  const checked = groceries.length - remaining;
  const grouped = CATEGORIES.map((cat) => [cat, groceries.filter((g) => (g.category || 'Other') === cat)]).filter(([, items]) => items.length);

  return (
    <section className="split wide-main">
      <div className="panel main">
        <div className="panel-head">
          <h2>Grocery list <span className="muted">{remaining} to get</span></h2>
          {checked > 0 && (
            <button className="link-btn" onClick={() => update('groceries', (gs) => gs.filter((g) => !g.done))}>
              Clear {checked} checked
            </button>
          )}
        </div>

        <form onSubmit={add} className="add-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item…" />
          <input className="qty" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
          <button className="btn primary" type="submit">Add</button>
        </form>

        {groceries.length === 0 && <p className="empty">Your list is empty.</p>}
        {grouped.map(([cat, items]) => (
          <div key={cat} className="grocery-group">
            <h3>{cat}</h3>
            <ul className="todos">
              {items.map((g) => (
                <li key={g.id} className={`todo ${g.done ? 'done' : ''}`}>
                  <input type="checkbox" checked={g.done} onChange={() => patch(g.id, { done: !g.done })} aria-label="Got it" />
                  <span className="todo-text">
                    {g.name}
                    {g.qty && <span className="qty-text"> · {g.qty}</span>}
                    {g.note && <span className="note">for {g.note}</span>}
                  </span>
                  <select className="plain cat-select" value={g.category || 'Other'} onChange={(e) => patch(g.id, { category: e.target.value })} aria-label="Category">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <button className="icon-btn subtle" onClick={() => remove(g.id)} aria-label="Delete">×</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <aside className="panel side">
        <h2>From your meal plan</h2>
        <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
        <p className="hint">Collects the ingredients of every saved recipe planned this week, combining duplicates.</p>
        <button className="btn primary" onClick={addFromMealPlan}>Add this week's ingredients</button>
        {notice && <p className="notice">{notice}</p>}
      </aside>
    </section>
  );
}
