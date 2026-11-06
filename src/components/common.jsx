import { useEffect, useId, useRef, useState } from 'react';
import { addDays, addMonths, fmtMonthYear, fmtRange, startOfMonth, startOfWeek, toKey } from '../dates.js';
import { mealLabel } from '../meals.js';
import { evalMoney, money, parseMoney } from '../budget.js';

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

// Shows a formatted amount; on focus it becomes a plain number to edit.
// With `math` you can also type a calculation: the box empties on focus and its placeholder shows the amount.
// "+20" / "-20" / "*2" / "/2" work from the current amount, "45 + 12.50" is worked out, a plain number replaces it,
// and leaving it empty changes nothing.
export function AmountInput({ cents, onCommit, math = false, blankZero = false, className = '', ...rest }) {
  const [text, setText] = useState(null);
  const cancelled = useRef(false);
  const ref = useRef(null);
  const editing = text !== null;

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  function commit() {
    const t = text?.trim();
    setText(null);
    if (cancelled.current || t === undefined) return;
    let next;
    if (math) {
      if (t === '') return;
      next = evalMoney(/^[+\-−*/×÷x]/i.test(t) ? `${cents / 100}${t}` : t);
    } else {
      next = t === '' ? 0 : parseMoney(t);
      if (next !== null) next = Math.abs(next);
    }
    if (next !== null && next !== cents) onCommit(next);
  }

  return (
    <input
      ref={ref}
      className={`plain amount ${className}`}
      inputMode={math ? 'text' : 'decimal'}
      value={editing ? text : blankZero && !cents ? '' : money(cents)}
      placeholder={math && editing ? money(cents) : rest.placeholder}
      onFocus={() => {
        cancelled.current = false;
        setText(math ? '' : cents ? (cents / 100).toFixed(2) : '');
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      {...rest}
    />
  );
}

const CALC_KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', 'C', '+'];
const OPS = '+−×÷';
const toDollars = (cents) => String(Math.round(cents) / 100);
const forEval = (expr) => expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');

// A small button showing + − × ÷ that drops down a calculator starting from `cents`. Save hands the result to
// `onCommit`. It works with the mouse or the keyboard (digits, + - * /, Enter to save, Esc to close).
export function CalculatorButton({ cents, onCommit, label = 'amount' }) {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState('');
  const [fresh, setFresh] = useState(true); // the starting amount is showing; a digit replaces it, an operator continues from it
  const [pos, setPos] = useState(null);
  const button = useRef(null);
  const pop = useRef(null);
  const result = evalMoney(forEval(expr));

  function toggle() {
    if (open) return setOpen(false);
    const r = button.current.getBoundingClientRect();
    const height = 300;
    setExpr(toDollars(cents));
    setFresh(true);
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 236)), top: r.bottom + height > window.innerHeight ? Math.max(8, r.top - height - 4) : r.bottom + 4 });
    setOpen(true);
  }

  function press(key) {
    if (key === 'C') { setExpr(''); setFresh(false); return; }
    if (key === '⌫') { setExpr((x) => x.slice(0, -1)); setFresh(false); return; }
    if (key === '=') { if (result !== null) { setExpr(toDollars(result)); setFresh(true); } return; }
    if (OPS.includes(key)) {
      // A second operator in a row replaces the first.
      setExpr((x) => (x && OPS.includes(x.slice(-1)) ? x.slice(0, -1) : x || '0') + key);
    } else {
      setExpr((x) => (fresh ? '' : x) + key);
    }
    setFresh(false);
  }

  function save() {
    if (result === null) return;
    if (result !== cents) onCommit(result);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      const map = { '*': '×', x: '×', '/': '÷', '-': '−', Backspace: '⌫', Delete: 'C' };
      const key = map[e.key] ?? e.key;
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'Enter') save();
      else if (CALC_KEYS.includes(key) || key === '⌫' || key === '=') press(key);
      else return;
      e.preventDefault();
    };
    const away = (e) => !pop.current?.contains(e.target) && !button.current?.contains(e.target) && setOpen(false);
    const closeOnScroll = (e) => !pop.current?.contains(e.target) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', away);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnScroll);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnScroll);
    };
  });

  return (
    <>
      <button ref={button} type="button" className={`calc-toggle ${open ? 'open' : ''}`} onClick={toggle}
        aria-label={`Calculator for ${label}`} aria-expanded={open} title="Calculator">
        <span>+</span><span>−</span><span>×</span><span>÷</span>
      </button>
      {open && (
        <div ref={pop} className="calculator" style={pos} role="dialog" aria-label={`Calculator for ${label}`}>
          <div className="calc-display">
            <div className="calc-expr">{expr || '0'}</div>
            <div className="calc-result">{result === null ? '…' : money(result)}</div>
          </div>
          <div className="calc-keys">
            {CALC_KEYS.map((k) => (
              <button key={k} type="button" className={OPS.includes(k) ? 'op' : k === 'C' ? 'clear' : ''} onClick={() => press(k)}>{k}</button>
            ))}
            <button type="button" onClick={() => press('⌫')} aria-label="Backspace">⌫</button>
            <button type="button" className="op" onClick={() => press('=')}>=</button>
            <button type="button" className="save" onClick={save} disabled={result === null}>Save</button>
          </div>
          <div className="calc-was">Was {money(cents)}</div>
        </div>
      )}
    </>
  );
}
