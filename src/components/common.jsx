import { useId, useRef, useState } from 'react';
import { addDays, addMonths, fmtMonthYear, fmtRange, startOfMonth, startOfWeek, toKey } from '../dates.js';
import { mealLabel } from '../meals.js';

export function WeekNav({ weekStart, setWeekStart }) {
  const isThisWeek = toKey(weekStart) === toKey(startOfWeek(new Date()));
  return (
    <div className="week-nav">
      <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹</button>
      <span className="week-label">{fmtRange(weekStart, addDays(weekStart, 6))}</span>
      <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">›</button>
      {!isThisWeek && (
        <button className="link-btn" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
      )}
    </div>
  );
}

export function MonthNav({ monthStart, setMonthStart }) {
  const isThisMonth = toKey(monthStart) === toKey(startOfMonth(new Date()));
  return (
    <div className="week-nav">
      <button className="icon-btn" onClick={() => setMonthStart(addMonths(monthStart, -1))} aria-label="Previous month">‹</button>
      <span className="week-label">{fmtMonthYear(monthStart)}</span>
      <button className="icon-btn" onClick={() => setMonthStart(addMonths(monthStart, 1))} aria-label="Next month">›</button>
      {!isThisMonth && (
        <button className="link-btn" onClick={() => setMonthStart(startOfMonth(new Date()))}>This month</button>
      )}
    </div>
  );
}

// A breakfast/lunch/dinner slot. Click to type a meal; matching a saved recipe links it.
export function MealSlot({ slot, meal, recipes, onChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const cancelled = useRef(false);
  const listId = useId();
  const label = mealLabel(meal, recipes);
  const linked = Boolean(meal?.recipeId && recipes.some((r) => r.id === meal.recipeId));

  function startEditing() {
    cancelled.current = false;
    setValue(label);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (cancelled.current) return;
    const v = value.trim();
    if (v === label) return;
    if (!v) return onChange(null);
    const recipe = recipes.find((r) => r.name.toLowerCase() === v.toLowerCase());
    onChange(recipe ? { recipeId: recipe.id, text: recipe.name } : { text: v });
  }

  if (editing) {
    return (
      <div className="meal-slot editing">
        <span className="slot-name">{slot}</span>
        <input
          autoFocus
          list={listId}
          value={value}
          placeholder="Recipe or meal…"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // Tab completes a partially typed recipe name instead of leaving the field.
            if (e.key === 'Tab' && !e.shiftKey) {
              const typed = value.trim().toLowerCase();
              const match = typed && recipes.find((r) => r.name.toLowerCase().startsWith(typed));
              if (match && match.name !== value) {
                e.preventDefault();
                setValue(match.name);
              }
            }
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
        />
        <datalist id={listId}>
          {recipes.map((r) => <option key={r.id} value={r.name} />)}
        </datalist>
      </div>
    );
  }

  return (
    <button className="meal-slot" onClick={startEditing} title={linked ? 'From your recipes' : undefined}>
      <span className="slot-name">{slot}</span>
      {label ? (
        <span className="meal-name">{label}{linked && <span className="recipe-dot" aria-label="recipe" />}</span>
      ) : (
        <span className="meal-empty">+ Add</span>
      )}
    </button>
  );
}

export function TodoItem({ todo, onToggle, onChange, onDelete, showDue = true, overdue = false }) {
  return (
    <li className={`todo ${todo.done ? 'done' : ''}`}>
      <input type="checkbox" checked={todo.done} onChange={onToggle} aria-label="Done" />
      {onChange ? (
        <input
          className="plain todo-text"
          value={todo.text}
          title="Click to edit"
          aria-label="To-do"
          onChange={(e) => onChange({ text: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          // Clearing the text and leaving the field deletes the to-do.
          onBlur={() => !todo.text.trim() && onDelete?.()}
        />
      ) : (
        <span className="todo-text">{todo.text}</span>
      )}
      {overdue && <span className="badge warn">overdue</span>}
      {showDue && onChange && (
        <input
          type="date"
          className="plain due"
          value={todo.due || ''}
          onChange={(e) => onChange({ due: e.target.value || null })}
          aria-label="Due date"
        />
      )}
      {onDelete && <button className="icon-btn subtle" onClick={onDelete} aria-label="Delete to-do" title="Delete">×</button>}
    </li>
  );
}
