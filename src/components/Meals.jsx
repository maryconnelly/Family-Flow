import { useState } from 'react';
import { fmtMonthDay, fmtWeekday, todayKey, toKey, weekDays } from '../dates.js';
import { SLOTS, findMeal, setMeal } from '../meals.js';
import { newId } from '../store.js';
import { MealSlot, WeekNav } from './common.jsx';

function RecipeEditor({ recipe, onSave, onCancel, onDelete }) {
  const [name, setName] = useState(recipe.name);
  const [ingredients, setIngredients] = useState(recipe.ingredients.join('\n'));
  const [notes, setNotes] = useState(recipe.notes || '');

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      ...recipe,
      name: name.trim(),
      ingredients: ingredients.split('\n').map((l) => l.trim()).filter(Boolean),
      notes: notes.trim(),
    });
  }

  return (
    <form className="recipe-editor" onSubmit={submit}>
      <label>
        Name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sheet-pan chicken fajitas" />
      </label>
      <label>
        Ingredients <span className="hint">one per line, e.g. "2 lb chicken thighs"</span>
        <textarea rows={8} value={ingredients} onChange={(e) => setIngredients(e.target.value)} />
      </label>
      <label>
        Notes / link
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="form-actions">
        {onDelete && <button type="button" className="link-btn danger" onClick={onDelete}>Delete</button>}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary">Save recipe</button>
      </div>
    </form>
  );
}

export default function Meals({ state, update, weekStart, setWeekStart }) {
  const { meals, recipes } = state;
  const [editing, setEditing] = useState(null); // recipe object being edited, or null
  const [query, setQuery] = useState('');
  const today = todayKey();

  const shown = recipes
    .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const isNew = editing && !recipes.some((r) => r.id === editing.id);

  function save(recipe) {
    update('recipes', (rs) => (isNew ? [...rs, recipe] : rs.map((r) => (r.id === recipe.id ? recipe : r))));
    setEditing(null);
  }

  function remove(recipe) {
    if (!window.confirm(`Delete recipe "${recipe.name}"? Planned meals will keep its name.`)) return;
    update('recipes', (rs) => rs.filter((r) => r.id !== recipe.id));
    setEditing(null);
  }

  return (
    <section className="split wide-main">
      <div className="panel main">
        <div className="panel-head">
          <h2>Meal plan</h2>
          <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
        </div>
        <table className="plan-table">
          <thead>
            <tr>
              <th />
              {SLOTS.map((s) => <th key={s}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {weekDays(weekStart).map((day) => {
              const key = toKey(day);
              return (
                <tr key={key} className={key === today ? 'today' : ''}>
                  <th scope="row">
                    <span className="weekday">{fmtWeekday(day)}</span> <span className="muted">{fmtMonthDay(day)}</span>
                  </th>
                  {SLOTS.map((slot) => (
                    <td key={slot}>
                      <MealSlot
                        slot={slot}
                        meal={findMeal(meals, key, slot)}
                        recipes={recipes}
                        onChange={(value) => setMeal(update, key, slot, value)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="hint">Tip: type a saved recipe's name to link it — its ingredients can then go straight to your grocery list.</p>
      </div>

      <aside className="panel side recipes">
        <div className="panel-head">
          <h2>Recipes</h2>
          {!editing && (
            <button className="btn primary" onClick={() => setEditing({ id: newId(), name: '', ingredients: [], notes: '' })}>
              New recipe
            </button>
          )}
        </div>
        {editing ? (
          <RecipeEditor
            key={editing.id}
            recipe={editing}
            onSave={save}
            onCancel={() => setEditing(null)}
            onDelete={isNew ? null : () => remove(editing)}
          />
        ) : (
          <>
            {recipes.length > 5 && (
              <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes…" />
            )}
            {recipes.length === 0 && <p className="empty">No recipes yet. Add your go-to meals here.</p>}
            <ul className="recipe-list">
              {shown.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setEditing(r)}>
                    <span className="recipe-name">{r.name}</span>
                    <span className="muted">{r.ingredients.length} ingredients</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </section>
  );
}
