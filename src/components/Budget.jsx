import { useEffect, useId, useRef, useState } from 'react';
import { addDays, addMonths, fmtMonthYear, fromKey, monthGrid, startOfMonth, todayKey, toKey } from '../dates.js';
import { newId } from '../store.js';
import { AmountInput, CalculatorButton, MonthNav } from './common.jsx';
import {
  DAY_OPTIONS, ordinal, RTA, SPLIT, UNCAT, accountBalances, splitRemainder, computeBudget, fmtDue, isPastDue, lastDayOf, money, monthOf, parseDay, parseMoney,
  setAssigned, shiftMonth, targetDueDate, targetProgress, TARGET_TYPES, isSavingsTarget, targetOccurrences, isPaymentId, paymentId,
  REPEAT_OPTIONS, enterDueRecurring, firstOccurrenceFrom, nextOccurrence,
} from '../budget.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ACCOUNT_TYPES = [
  ['checking', 'Checking'],
  ['savings', 'Savings'],
  ['cash', 'Cash'],
  ['credit', 'Credit card'],
];
const PAGE = 100;

// Soonest "fund by" date first; categories without one keep their order after the dated ones.
function byFundDate(cats, month) {
  const due = new Map(cats.map((c) => [c.id, targetDueDate(c, month)]));
  return [...cats].sort((a, b) => {
    const da = due.get(a.id);
    const db = due.get(b.id);
    return da && db ? da.localeCompare(db) : da ? -1 : db ? 1 : 0;
  });
}

function availableClass(cat, row) {
  if (row.available < 0) return row.creditOverspent >= -row.available ? 'under' : 'neg';
  if (row.owed > 0 && row.available < row.owed) return 'under';
  if (cat?.target?.amount && row.underfunded > 0) return 'under';
  return row.available > 0 ? 'pos' : 'zero';
}

// Category <select> options, grouped like the budget. Transfers are encoded as "xfer:<accountId>".
// `split` is the label for the "split between categories" choice; leave it out to hide that choice.
function CategoryOptions({ groups, categories, accounts, ownAccountId, uncategorized, startingDebt, split, transfers = true }) {
  const others = transfers ? accounts.filter((a) => a.id !== ownAccountId) : [];
  return (
    <>
      {uncategorized && <option value={UNCAT}>⚠️ Uncategorized</option>}
      {split && <option value={SPLIT}>{split}</option>}
      {startingDebt && <option value={paymentId(ownAccountId)}>💳 Starting balance (existing debt)</option>}
      <option value={RTA}>💰 Ready to Assign (income)</option>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.name}>
          {categories.filter((c) => c.groupId === g.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ))}
      {others.length > 0 && (
        <optgroup label="Transfer to / from">
          {others.map((a) => <option key={a.id} value={`xfer:${a.id}`}>↔ {a.name}</option>)}
        </optgroup>
      )}
    </>
  );
}

/* ---------- Plan (the budget itself) ---------- */

// A name that's being renamed in place: Enter or clicking away saves, Escape puts it back. A blank name isn't saved.
function InlineName({ value, onSave, onDone }) {
  const [text, setText] = useState(value);
  const cancelled = useRef(false);
  function finish() {
    const name = text.trim();
    if (!cancelled.current && name && name !== value) onSave(name);
    onDone();
  }
  return (
    <input className="inline-name" value={text} autoFocus aria-label="Category name" onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)} onBlur={finish} onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
      }} />
  );
}

// A date box that only saves complete dates. Typing a year digit by digit passes through years like 0002;
// those stay in the box without being saved, so the field doesn't jump while you type.
function DateField({ value, onCommit, ...rest }) {
  const [text, setText] = useState(value || '');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value || '');
  }, [value, focused]);
  return (
    <input type="date" value={text} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} {...rest}
      onChange={(e) => {
        setText(e.target.value);
        if (/^(19|20)\d\d-\d\d-\d\d$/.test(e.target.value)) onCommit(e.target.value);
      }} />
  );
}

// The editable fields of a target. `value` holds { target, dueDay } (the due day belongs to the category but only
// matters for monthly targets); `onChange` gets the fields that changed.
function TargetEditor({ value, onChange, month }) {
  const t = value.target;
  if (!t) return <button className="btn" onClick={() => onChange({ target: { type: 'monthly', amount: 0 } })}>🎯 Add a target</button>;
  const patchTarget = (p) => onChange({ target: { ...t, ...p } });
  const saving = isSavingsTarget(t);

  // Keep the amount when switching how often it repeats; fill in a sensible date or weekday if it needs one.
  function changeTargetType(type) {
    const date = type === 'biweekly' ? todayKey() : lastDayOf(shiftMonth(month, 2));
    const keepDate = t.date && (type === 'biweekly') === (t.type === 'biweekly');
    patchTarget({ type, date: keepDate ? t.date : date, weekday: t.weekday ?? new Date().getDay() });
  }

  return (
    <div className="target-edit">
      <label className="target-repeat">
        Repeats
        <select value={t.type} onChange={(e) => changeTargetType(e.target.value)} aria-label="How often">
          {TARGET_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <div className="target-fields">
        <label>
          {saving ? 'Save' : 'Assign'}
          <AmountInput cents={t.amount} onCommit={(amount) => patchTarget({ amount })} className="boxed" aria-label="Target amount" />
        </label>
        {t.type === 'weekly' && (
          <label>
            every
            <select value={t.weekday ?? 5} onChange={(e) => patchTarget({ weekday: Number(e.target.value) })} aria-label="Day of the week">
              {WEEKDAYS.map((name, i) => <option key={name} value={i}>{name}</option>)}
            </select>
          </label>
        )}
        {t.type === 'biweekly' && (
          <label>
            every other week from
            <DateField value={t.date} onCommit={(date) => patchTarget({ date })} aria-label="Starting on" />
          </label>
        )}
        {t.type === 'monthly' && (
          <label>
            by the
            <select value={value.dueDay ?? ''} onChange={(e) => onChange({ dueDay: parseDay(e.target.value) })} aria-label="Due day each month">
              <option value="">any day</option>
              {DAY_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
        )}
        {(t.type === 'yearly' || t.type === 'byDate') && (
          <label>
            {t.type === 'yearly' ? 'every year by' : 'by'}
            <DateField value={targetDueDate(value, month)} onCommit={(date) => patchTarget({ date })} aria-label="Have it by" />
          </label>
        )}
      </div>
    </div>
  );
}

// The side panel for a category that doesn't exist yet: name, group and an optional target, created on Save.
function NewCategoryPanel({ groups, update, month, defaultGroupId, onCancel, onCreated }) {
  const [draft, setDraft] = useState({ name: '', groupId: defaultGroupId ?? groups[0]?.id ?? '', target: null, dueDay: null });
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  const canSave = draft.name.trim() && groups.some((g) => g.id === draft.groupId);

  function save() {
    if (!canSave) return;
    const id = newId();
    update('budgetCategories', (cs) => [...cs, { id, name: draft.name.trim(), groupId: draft.groupId, target: draft.target, dueDay: draft.dueDay }]);
    onCreated(id);
  }

  return (
    <aside className="panel side inspector">
      <div className="category-info editing">
        <div className="panel-head">
          <h2 className="title-input">New category</h2>
          <button className="icon-btn subtle" onClick={onCancel} aria-label="Cancel new category" title="Cancel">×</button>
        </div>
        <input className="title-input boxed" value={draft.name} placeholder="Category name" aria-label="Category name" autoFocus
          onChange={(e) => patch({ name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); }} />
        <label className="group-move">
          Group
          {groups.length ? (
            <select value={draft.groupId} onChange={(e) => patch({ groupId: e.target.value })}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          ) : (
            <span className="hint">Add a category group first (below the budget).</span>
          )}
        </label>
      </div>
      <div className="inspector-section target-section editing">
        <div className="section-head"><h3>Target <span className="muted">(optional)</span></h3></div>
        <TargetEditor value={draft} onChange={patch} month={month} />
      </div>
      <div className="settings-actions">
        <button className="btn primary" onClick={save} disabled={!canSave}>Save category</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
        {draft.target && <button className="btn danger" onClick={() => patch({ target: null })}>Remove target</button>}
      </div>
    </aside>
  );
}

function Inspector({ state, update, budget, month, cat, onClose }) {
  const { budgetCategories: categories, budgetGroups: groups } = state;
  const [moving, setMoving] = useState(false); // the move-money inputs show only after clicking Move money
  const [moveAmount, setMoveAmount] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const row = budget.rows[cat.id];
  const last = budget.lastMonth(cat.id);
  const assign = (amount) => update('budgetAssigned', (a) => setAssigned(a, cat.id, month, amount));

  const saveCategory = (fields) => update('budgetCategories', (cs) => cs.map((c) => (c.id === cat.id ? { ...c, ...fields } : c)));

  // The name and group, and separately the target, are locked until their Edit button is clicked.
  // Changes go into a draft that Save applies and Cancel throws away.
  const [info, setInfo] = useState(null); // { name, groupId } while editing; null = locked
  function saveInfo() {
    saveCategory({ name: info.name.trim() || cat.name, groupId: info.groupId });
    setInfo(null);
  }

  const [draft, setDraft] = useState(null); // { target, dueDay } while editing the target; null = locked
  const editing = draft !== null;
  const shown = editing ? { ...cat, ...draft } : cat;
  const startEditing = (changes = {}) => setDraft({ dueDay: cat.dueDay ?? null, target: cat.target ?? null, ...changes });
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  function save() {
    saveCategory(draft);
    setDraft(null);
  }
  function deleteTarget() {
    if (!window.confirm(`Delete the target for "${cat.name}"? The money already in it stays.`)) return;
    saveCategory({ target: null });
    setDraft(null);
  }

  const quick = [
    cat.target?.amount && row.underfunded > 0 && ['Underfunded', row.assigned + row.underfunded],
    ['Assigned last month', last.assigned],
    ['Spent last month', Math.max(0, -last.activity)],
    row.available < 0 && ['Cover overspending', row.assigned - row.available],
    ['Reset assigned', 0],
  ].filter(Boolean);

  function deleteCategory() {
    const usesCat = (t) => t.categoryId === cat.id || t.splits?.some((s) => s.categoryId === cat.id);
    const used = state.budgetTransactions.filter(usesCat).length;
    const msg = used
      ? `Delete "${cat.name}"? Its ${used} transaction(s) will become uncategorized and its assigned money returns to Ready to Assign.`
      : `Delete "${cat.name}"? Any money assigned to it returns to Ready to Assign.`;
    if (!window.confirm(msg)) return;
    update('budgetCategories', (cs) => cs.filter((c) => c.id !== cat.id));
    update('budgetAssigned', (as) => as.filter((a) => a.categoryId !== cat.id));
    const uncat = (x) => (x.categoryId === cat.id ? { ...x, categoryId: UNCAT } : x);
    update('budgetTransactions', (ts) => ts.map((t) => (usesCat(t) ? { ...uncat(t), ...(t.splits && { splits: t.splits.map(uncat) }) } : t)));
    onClose();
  }

  function moveMoney(e) {
    e.preventDefault();
    const amount = parseMoney(moveAmount);
    if (!amount || !moveTo) return;
    const toRow = budget.rows[moveTo];
    update('budgetAssigned', (a) =>
      setAssigned(setAssigned(a, cat.id, month, row.assigned - amount), moveTo, month, toRow.assigned + amount),
    );
    closeMove();
  }

  function closeMove() {
    setMoving(false);
    setMoveAmount('');
    setMoveTo('');
  }

  const cards = state.budgetAccounts.filter((a) => a.type === 'credit');
  const progress = targetProgress(cat, row);
  const due = targetDueDate(cat, month);
  const pastDue = row.underfunded > 0 && isPastDue(due);
  const saving = isSavingsTarget(cat.target);
  const occurrences = cat.target && ['weekly', 'biweekly'].includes(cat.target.type) && targetOccurrences(cat.target, month).length;

  // The saved target in words, e.g. "Assign $200.00 each month by the 15th".
  function describeTarget() {
    const amount = money(cat.target.amount);
    switch (cat.target.type) {
      case 'weekly': return `Assign ${amount} every ${WEEKDAYS[cat.target.weekday ?? 5]}`;
      case 'biweekly': return `Assign ${amount} every other week${cat.target.date ? ` from ${fmtDue(cat.target.date)}` : ''}`;
      case 'yearly': return `Save ${amount} every year${due ? ` by ${fmtDue(due)}` : ''}`;
      case 'byDate': return `Save ${amount}${due ? ` by ${fmtDue(due)}` : ''}`;
      default: return `Assign ${amount} each month${cat.dueDay == null ? '' : cat.dueDay === 'last' ? ' by the last day' : ` by the ${ordinal(cat.dueDay)}`}`;
    }
  }

  return (
    <aside className="panel side inspector">
      <div className={`category-info ${info ? 'editing' : ''}`}>
        <div className="panel-head">
          {info ? (
            <input className="title-input boxed" value={info.name} aria-label="Category name" autoFocus
              onChange={(e) => setInfo({ ...info, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') saveInfo(); if (e.key === 'Escape') setInfo(null); }} />
          ) : (
            <>
              <h2 className="title-input clickable-name" title="Click to rename" onClick={() => setInfo({ name: cat.name, groupId: cat.groupId })}>{cat.name}</h2>
              <button className="icon-btn subtle-visible" onClick={() => setInfo({ name: cat.name, groupId: cat.groupId })}
                aria-label="Edit name and group" title="Edit name and group">✏️</button>
            </>
          )}
          <button className="icon-btn subtle" onClick={onClose} aria-label="Close details" title="Close">×</button>
        </div>
        <label className="group-move">
          Group
          {info ? (
            <select value={info.groupId} onChange={(e) => setInfo({ ...info, groupId: e.target.value })}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          ) : (
            <span className="locked-value">{groups.find((g) => g.id === cat.groupId)?.name ?? '—'}</span>
          )}
        </label>
        {info && (
          <div className="settings-actions">
            <button className="btn primary" onClick={saveInfo}>Save</button>
            <button className="btn" onClick={() => setInfo(null)}>Cancel</button>
          </div>
        )}
      </div>

      <div className="avail-summary">
        <span className={`avail-pill big ${availableClass(cat, row)}`}>{money(row.available)}</span>
        <span className="muted">Available</span>
      </div>
      <dl className="breakdown">
        <dt>Left over from last month</dt><dd>{money(row.carry)}</dd>
        <dt>Assigned this month</dt><dd>{money(row.assigned)}</dd>
        <dt>Activity</dt><dd>{money(row.activity)}</dd>
      </dl>
      {row.creditOverspent > 0 && (
        <p className="notice warn">
          {money(row.creditOverspent)} was overspent on a credit card. It's now card debt; assign money here to cover it, or
          it resets to $0 next month without affecting Ready to Assign.
        </p>
      )}

      <div className="inspector-section">
        <h3>Quick assign</h3>
        <div className="quick-assign">
          {quick.map(([label, value]) => (
            <button key={label} className="btn" onClick={() => assign(value)} disabled={value === row.assigned}>
              <span>{label}</span>
              <strong>{money(value)}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className={`inspector-section target-section ${editing ? 'editing' : ''}`}>
        <div className="section-head">
          <h3>Target</h3>
          {!editing && cat.target && <button className="btn small" onClick={() => startEditing()} title="Edit the target">✏️ Edit</button>}
        </div>
        {editing ? (
          <TargetEditor value={shown} onChange={patch} month={month} />
        ) : !cat.target ? (
          <button className="btn" onClick={() => startEditing({ target: { type: 'monthly', amount: 0 } })}>🎯 Create a target</button>
        ) : (
          <div className="target-edit">
            <p className="target-summary">{describeTarget()}</p>
            {cat.target.amount > 0 && (
              <>
                <span className="target-bar" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></span>
                <p className={row.underfunded ? (pastDue ? 'hint overdue' : 'hint') : 'hint funded'}>
                  {row.underfunded
                    ? pastDue
                      ? `⚠️ Past due: still ${money(row.underfunded)} short of what was needed by ${fmtDue(due)}.`
                      : saving
                        ? `Assign ${money(row.underfunded)} more this month to have ${money(cat.target.amount)} by ${fmtDue(due)}.`
                        : `Assign ${money(row.underfunded)} more${due ? ` by ${fmtDue(due)}` : ' this month'}.`
                    : saving && row.available >= cat.target.amount
                      ? '🎉 Fully funded!'
                      : '✓ On track this month.'}
                  {saving && ` Needs ${money(row.needed)}/month.`}
                  {occurrences && ` ${occurrences} × ${money(cat.target.amount)} = ${money(row.goal)} this month.`}
                  {!saving && row.carry > 0 && row.goal > 0 && ` ${money(Math.min(row.carry, row.goal))} of it came over from last month.`}
                </p>
              </>
            )}
          </div>
        )}
        {editing && (
          <div className="settings-actions">
            <button className="btn primary" onClick={save}>Save</button>
            <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
            {cat.target && <button className="btn danger" onClick={deleteTarget}>Delete target</button>}
          </div>
        )}
      </div>

      {!moving ? (
        <div className="inspector-section settings-actions">
          <button className="btn" onClick={() => setMoving(true)}>↔ Move money</button>
          <button className="btn danger" onClick={deleteCategory}>Delete category</button>
        </div>
      ) : (
      <form className="inspector-section" onSubmit={moveMoney} onKeyDown={(e) => e.key === 'Escape' && closeMove()}>
        <h3>Move money from {cat.name}</h3>
        <div className="move-money">
          <input autoFocus inputMode="decimal" value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} placeholder="$ Amount" aria-label="Amount to move" />
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move to">
            <option value="">to…</option>
            {groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {categories.filter((c) => c.groupId === g.id && c.id !== cat.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({money(budget.rows[c.id].available)})</option>
                ))}
              </optgroup>
            ))}
            {cards.length > 0 && (
              <optgroup label="Credit Card Payments">
                {cards.map((a) => <option key={a.id} value={paymentId(a.id)}>{a.name} ({money(budget.rows[paymentId(a.id)].available)})</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div className="settings-actions">
          <button className="btn primary" type="submit" disabled={!parseMoney(moveAmount) || !moveTo}>Move</button>
          <button className="btn" type="button" onClick={closeMove}>Cancel</button>
        </div>
      </form>
      )}

    </aside>
  );
}

// Details for a credit card's payment category.
function CardInspector({ update, budget, month, card, onClose }) {
  const id = paymentId(card.id);
  const row = budget.rows[id];
  const uncovered = Math.max(0, row.owed - row.available);
  const assign = (amount) => update('budgetAssigned', (a) => setAssigned(a, id, month, amount));
  const quick = [
    uncovered > 0 && ['Cover the whole balance', row.assigned + uncovered],
    ['Assigned last month', budget.lastMonth(id).assigned],
    ['Reset assigned', 0],
  ].filter(Boolean);

  return (
    <aside className="panel side inspector">
      <div className="panel-head">
        <h2 className="title-input">💳 {card.name}</h2>
        <button className="icon-btn subtle" onClick={onClose} aria-label="Close details" title="Close">×</button>
      </div>
      <div className="avail-summary">
        <span className={`avail-pill big ${availableClass(null, row)}`}>{money(row.available)}</span>
        <span className="muted">Available for payment</span>
      </div>
      <dl className="breakdown">
        <dt>Left over from last month</dt><dd>{money(row.carry)}</dd>
        <dt>Assigned this month</dt><dd>{money(row.assigned)}</dd>
        <dt>Card spending covered by categories</dt><dd>{money(row.funded)}</dd>
        <dt>Payments &amp; other</dt><dd>{money(row.payments)}</dd>
        <dt><strong>Card balance</strong></dt><dd><strong>{money(row.owed)}</strong></dd>
      </dl>
      {uncovered > 0 ? (
        <p className="notice warn">
          {money(uncovered)} of this balance isn't covered yet: debt from before you started, or spending that went over a category.
          Assign money here to pay it down.
        </p>
      ) : (
        row.owed > 0 && <p className="hint funded">✓ You have enough set aside to pay this card in full.</p>
      )}
      <div className="inspector-section">
        <h3>Quick assign</h3>
        <div className="quick-assign">
          {quick.map(([label, value]) => (
            <button key={label} className="btn" onClick={() => assign(value)} disabled={value === row.assigned}>
              <span>{label}</span>
              <strong>{money(value)}</strong>
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        To pay the card, add a transaction on the Accounts page from checking with the category set to ↔ {card.name}.
        Spending on the card from a category that has money moves it here automatically.
      </p>
    </aside>
  );
}

function MonthSummary({ budget, balances, accounts, goToAccounts }) {
  const { totals } = budget;
  return (
    <aside className="panel side inspector">
      <h2>This month</h2>
      <dl className="breakdown">
        <dt>Income</dt><dd>{money(budget.income)}</dd>
        <dt>Left over from last month</dt><dd>{money(totals.carry)}</dd>
        <dt>Assigned</dt><dd>{money(totals.assigned)}</dd>
        <dt>Activity</dt><dd>{money(totals.activity)}</dd>
        <dt><strong>Available</strong></dt><dd><strong>{money(totals.available)}</strong></dd>
      </dl>
      {budget.overspentLastMonth > 0 && (
        <p className="notice warn">Last month was overspent by {money(budget.overspentLastMonth)}, which came out of this month's Ready to Assign.</p>
      )}
      <div className="inspector-section">
        <h3>Accounts</h3>
        {accounts.length === 0 ? (
          <p className="hint">Add your bank accounts to start tracking spending. <button className="link-btn" onClick={goToAccounts}>Add an account</button></p>
        ) : (
          <ul className="account-mini">
            {accounts.map((a) => (
              <li key={a.id}><span>{a.name}</span><span className={balances[a.id] < 0 ? 'negative' : ''}>{money(balances[a.id])}</span></li>
            ))}
          </ul>
        )}
      </div>
      <p className="hint">Click a category to see details, set a target, or move money.</p>
    </aside>
  );
}

function Plan({ state, update, month, budget, balances, goToAccounts, creating, setCreating, onlyOverspent, setOnlyOverspent }) {
  const { budgetGroups: groups, budgetCategories: categories } = state;
  const [selectedId, setSelectedIdRaw] = useState(null);
  // Picking a category (or closing its panel) also leaves "new category" mode.
  const setSelectedId = (id) => { setSelectedIdRaw(id); setCreating(false); };
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [addingTo, setAddingTo] = useState(null);
  const [newCat, setNewCat] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const selected = categories.find((c) => c.id === selectedId);
  const cards = state.budgetAccounts.filter((a) => a.type === 'credit');
  const selectedCard = isPaymentId(selectedId) && cards.find((a) => paymentId(a.id) === selectedId);
  const assign = (id, amount) => update('budgetAssigned', (a) => setAssigned(a, id, month, amount));
  const uncat = budget.rows[UNCAT];
  const showUncat = uncat.activity || uncat.available;

  // Categories show soonest due date first until you drag one; from then on they keep the order you dragged them into.
  // Which of the two applies is remembered in this browser.
  const [sortMode, setSortMode] = useState(() => {
    try { return localStorage.getItem('budget-plan-sort') || 'due'; } catch { return 'due'; }
  });
  function changeSort(mode) {
    setSortMode(mode);
    try { localStorage.setItem('budget-plan-sort', mode); } catch { /* not saved; fine */ }
  }
  const groupCats = (groupId) => {
    const cats = categories.filter((c) => c.groupId === groupId);
    return sortMode === 'due' ? byFundDate(cats, month) : cats;
  };

  // Move a category into a group, before `beforeId` (null = the end of the group). The order as it looks now
  // is what gets saved, so dragging while sorted by due date starts from that order. Afterwards it's "My order".
  function moveCategory(id, groupId, beforeId) {
    const lists = new Map(groups.map((g) => [g.id, groupCats(g.id).map((c) => c.id).filter((x) => x !== id)]));
    const target = lists.get(groupId);
    if (!target) return;
    const at = beforeId ? target.indexOf(beforeId) : -1;
    target.splice(at < 0 ? target.length : at, 0, id);
    update('budgetCategories', (cs) => {
      const byId = new Map(cs.map((c) => [c.id, c]));
      const ordered = groups.flatMap((g) => lists.get(g.id).filter((x) => byId.has(x)).map((x) => ({ ...byId.get(x), groupId: g.id })));
      const placed = new Set(ordered.map((c) => c.id));
      return [...ordered, ...cs.filter((c) => !placed.has(c.id))];
    });
    changeSort('mine');
  }

  // Up/down arrow keys on a drag handle: one step within the group, or across into the next group.
  function moveBy(cat, dir) {
    const gi = groups.findIndex((g) => g.id === cat.groupId);
    const list = groupCats(cat.groupId).map((c) => c.id);
    const i = list.indexOf(cat.id);
    if (dir < 0) {
      if (i > 0) moveCategory(cat.id, cat.groupId, list[i - 1]);
      else if (gi > 0) moveCategory(cat.id, groups[gi - 1].id, null);
    } else if (i < list.length - 1) {
      moveCategory(cat.id, cat.groupId, list[i + 2] ?? null);
    } else if (gi < groups.length - 1) {
      moveCategory(cat.id, groups[gi + 1].id, groupCats(groups[gi + 1].id)[0]?.id ?? null);
    }
  }

  const [renamingId, setRenamingId] = useState(null); // the category whose name is being typed over in the table
  const [armed, setArmed] = useState(null); // a row becomes draggable only while its handle is held, so inputs still select text
  const [dragId, setDragId] = useState(null);
  const [drop, setDrop] = useState(null); // { id, pos: 'before' | 'after' } over a category, or { groupId } over a group heading
  const endDrag = () => { setArmed(null); setDragId(null); setDrop(null); };

  // Groups reorder the same way, by the handle on their heading. Hovering anywhere over a group (heading or
  // categories) drops before or after it, depending on which half of it you're over.
  const [armedGroup, setArmedGroup] = useState(null);
  const [dragGroup, setDragGroup] = useState(null);
  const [groupDrop, setGroupDrop] = useState(null); // { id, pos: 'before' | 'after' }
  const endGroupDrag = () => { setArmedGroup(null); setDragGroup(null); setGroupDrop(null); };

  function moveGroup(id, beforeId) {
    update('budgetGroups', (gs) => {
      const moving = gs.find((g) => g.id === id);
      const rest = gs.filter((g) => g.id !== id);
      const at = beforeId ? rest.findIndex((g) => g.id === beforeId) : -1;
      rest.splice(at < 0 ? rest.length : at, 0, moving);
      return rest;
    });
  }

  function moveGroupBy(g, dir) {
    const i = groups.findIndex((x) => x.id === g.id);
    if (dir < 0 && i > 0) moveGroup(g.id, groups[i - 1].id);
    if (dir > 0 && i < groups.length - 1) moveGroup(g.id, groups[i + 2]?.id ?? null);
  }

  function overGroup(e, g) {
    if (!dragGroup) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const pos = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
    if (groupDrop?.id !== g.id || groupDrop.pos !== pos) setGroupDrop({ id: g.id, pos });
  }

  function dropGroup(e, g) {
    if (!dragGroup) return;
    e.preventDefault();
    if (dragGroup !== g.id && groupDrop) {
      const rest = groups.filter((x) => x.id !== dragGroup);
      const beforeId = groupDrop.pos === 'before' ? g.id : rest[rest.findIndex((x) => x.id === g.id) + 1]?.id ?? null;
      moveGroup(dragGroup, beforeId);
    }
    endGroupDrag();
  }

  function overCategory(e, c) {
    if (!dragId) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const pos = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
    if (drop?.id !== c.id || drop.pos !== pos) setDrop({ id: c.id, pos });
  }

  function dropOnCategory(e, c) {
    e.preventDefault();
    if (dragId && dragId !== c.id && drop) {
      const list = groupCats(c.groupId).map((x) => x.id).filter((x) => x !== dragId);
      const beforeId = drop.pos === 'before' ? c.id : list[list.indexOf(c.id) + 1] ?? null;
      moveCategory(dragId, c.groupId, beforeId);
    }
    endDrag();
  }

  function dropOnGroup(e, g) {
    e.preventDefault();
    if (dragId) moveCategory(dragId, g.id, groupCats(g.id).find((c) => c.id !== dragId)?.id ?? null); // to the top of the group
    endDrag();
  }

  function toggleGroup(id) {
    const next = new Set(collapsed);
    next.has(id) ? next.delete(id) : next.add(id);
    setCollapsed(next);
  }

  function addCategory(e) {
    e.preventDefault();
    if (newCat.trim()) {
      const id = newId();
      update('budgetCategories', (cs) => [...cs, { id, groupId: addingTo, name: newCat.trim(), target: null }]);
      setSelectedId(id);
    }
    setNewCat('');
    setAddingTo(null);
  }

  function addGroup(e) {
    e.preventDefault();
    if (!newGroup.trim()) return;
    update('budgetGroups', (gs) => [...gs, { id: newId(), name: newGroup.trim() }]);
    setNewGroup('');
  }

  return (
    <section className="split wide-main">
      <div className="panel main budget-panel">
        <div className="table-scroll">
          <table className="budget-table">
            <thead>
              <tr><th>Category</th><th>Assigned</th><th>Activity</th><th>Available</th></tr>
            </thead>
            {onlyOverspent && (
              <tbody>
                <tr className="filter-row">
                  <td colSpan={4}>
                    <div className="filter-bar">
                      <span>⚠️ Showing only overspent categories. Assign money to cover them, or move money from another category.</span>
                      <button className="btn small" onClick={() => setOnlyOverspent(false)}>Show all</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            )}
            {cards.length > 0 && !onlyOverspent && (
              <tbody>
                <tr className="group-row">
                  <th><div className="group-name"><span className="collapse-btn" aria-hidden="true">💳</span><span>Credit Card Payments</span></div></th>
                  <td>{money(cards.reduce((s, a) => s + budget.rows[paymentId(a.id)].assigned, 0))}</td>
                  <td>{money(cards.reduce((s, a) => s + budget.rows[paymentId(a.id)].activity, 0))}</td>
                  <td>{money(cards.reduce((s, a) => s + budget.rows[paymentId(a.id)].available, 0))}</td>
                </tr>
                {cards.map((a) => {
                  const id = paymentId(a.id);
                  const row = budget.rows[id];
                  const uncovered = row.owed - row.available;
                  return (
                    <tr key={id} className={`cat-row ${id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(id)}>
                      <th>
                        <button className="cat-name" onClick={() => setSelectedId(id)}>{a.name}</button>
                        <span className={`target-note ${uncovered > 0 ? '' : 'muted'}`}>
                          {row.owed > 0 ? `Balance ${money(row.owed)}` : 'Paid off'}
                          {uncovered > 0 && row.owed > 0 && ` · ${money(uncovered)} not covered`}
                        </span>
                      </th>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="assign-cell" onFocusCapture={() => setSelectedId(id)}>
                          <CalculatorButton cents={row.assigned} onCommit={(v) => assign(id, v)} label={`${a.name} payment`} />
                          <AmountInput cents={row.assigned} math onCommit={(v) => assign(id, v)} aria-label={`Assigned to ${a.name} payment`} />
                        </div>
                      </td>
                      <td className="activity">{money(row.activity)}</td>
                      <td><span className={`avail-pill ${availableClass(null, row)}`}>{money(row.available)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            )}
            {groups.map((g) => {
              const cats = groupCats(g.id);
              const sum = (f) => cats.reduce((s, c) => s + budget.rows[c.id][f], 0);
              const isCollapsed = collapsed.has(g.id) && !onlyOverspent;
              const shown = onlyOverspent ? cats.filter((c) => budget.rows[c.id].available < 0) : cats;
              if (onlyOverspent && !shown.length) return null;
              return (
                <tbody key={g.id} onDragOver={(e) => overGroup(e, g)} onDrop={(e) => dropGroup(e, g)}
                  className={[dragGroup === g.id && 'dragging', groupDrop?.id === g.id && dragGroup !== g.id && `group-drop-${groupDrop.pos}`].filter(Boolean).join(' ')}>
                  <tr className={`group-row ${drop?.groupId === g.id ? 'drop-into' : ''}`}
                    draggable={armedGroup === g.id}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.id); setDragGroup(g.id); }}
                    onDragEnd={endGroupDrag}
                    onDragOver={(e) => { if (!dragId) return; e.preventDefault(); if (drop?.groupId !== g.id) setDrop({ groupId: g.id }); }}
                    onDrop={(e) => { if (dragId) dropOnGroup(e, g); }}>
                    <th>
                      <div className="group-name">
                        <button className="drag-handle group-handle" aria-label={`Move the ${g.name} group (drag, or use the up and down arrow keys)`} title="Drag to reorder group"
                          onMouseDown={() => setArmedGroup(g.id)} onMouseUp={() => !dragGroup && setArmedGroup(null)}
                          onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveGroupBy(g, e.key === 'ArrowUp' ? -1 : 1); } }}>
                          ⋮⋮
                        </button>
                        <button className="collapse-btn" onClick={() => toggleGroup(g.id)} aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${g.name}`}>
                          {isCollapsed ? '▸' : '▾'}
                        </button>
                        <input className="plain" value={g.name} aria-label="Group name"
                          onChange={(e) => update('budgetGroups', (gs) => gs.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))} />
                        <button className="icon-btn subtle add" onClick={() => { setAddingTo(g.id); setNewCat(''); }} aria-label={`Add category to ${g.name}`} title="Add category">+</button>
                        {cats.length === 0 && (
                          <button className="icon-btn subtle" onClick={() => update('budgetGroups', (gs) => gs.filter((x) => x.id !== g.id))} aria-label={`Delete ${g.name}`} title="Delete group">×</button>
                        )}
                      </div>
                    </th>
                    <td>{money(sum('assigned'))}</td>
                    <td>{money(sum('activity'))}</td>
                    <td>{money(sum('available'))}</td>
                  </tr>
                  {addingTo === g.id && (
                    <tr className="add-cat-row">
                      <td colSpan={4}>
                        <form onSubmit={addCategory}>
                          <input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category name…"
                            onBlur={addCategory} onKeyDown={(e) => e.key === 'Escape' && setAddingTo(null)} />
                        </form>
                      </td>
                    </tr>
                  )}
                  {!isCollapsed && shown.map((c) => {
                    const row = budget.rows[c.id];
                    const progress = targetProgress(c, row);
                    const due = row.underfunded ? targetDueDate(c, month) : null;
                    return (
                      <tr key={c.id} onClick={() => setSelectedId(c.id)}
                        className={['cat-row', c.id === selectedId && 'selected', dragId === c.id && 'dragging', drop?.id === c.id && dragId !== c.id && `drop-${drop.pos}`].filter(Boolean).join(' ')}
                        draggable={armed === c.id}
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); setDragId(c.id); }}
                        onDragOver={(e) => overCategory(e, c)} onDrop={(e) => dropOnCategory(e, c)} onDragEnd={endDrag}>
                        <th>
                          <button className="drag-handle" aria-label={`Move ${c.name} (drag, or use the up and down arrow keys)`} title="Drag to reorder"
                            onMouseDown={() => setArmed(c.id)} onMouseUp={() => !dragId && setArmed(null)} onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveBy(c, e.key === 'ArrowUp' ? -1 : 1); } }}>
                            ⋮⋮
                          </button>
                          {renamingId === c.id ? (
                            <InlineName value={c.name} onDone={() => setRenamingId(null)}
                              onSave={(name) => update('budgetCategories', (cs) => cs.map((x) => (x.id === c.id ? { ...x, name } : x)))} />
                          ) : (
                            <button className="cat-name" title="Click to rename" onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); setRenamingId(c.id); }}>{c.name}</button>
                          )}
                          {progress !== null && (
                            <span className={`target-bar ${row.underfunded ? 'under' : ''}`} title={row.underfunded ? `${money(row.underfunded)} underfunded` : 'Target on track'}>
                              <span style={{ width: `${progress * 100}%` }} />
                            </span>
                          )}
                          {due && (
                            <span className={`target-note ${isPastDue(due) ? 'overdue' : ''}`}>
                              {money(row.underfunded)} needed by {fmtDue(due)}
                            </span>
                          )}
                        </th>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="assign-cell" onFocusCapture={() => setSelectedId(c.id)}>
                            <CalculatorButton cents={row.assigned} onCommit={(v) => assign(c.id, v)} label={c.name} />
                            <AmountInput cents={row.assigned} math onCommit={(v) => assign(c.id, v)} aria-label={`Assigned to ${c.name}`} />
                          </div>
                        </td>
                        <td className="activity">{money(row.activity)}</td>
                        <td><span className={`avail-pill ${availableClass(c, row)}`}>{money(row.available)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
            {showUncat && !onlyOverspent ? (
              <tbody>
                <tr className="cat-row uncat">
                  <th title="Spending from categories you deleted. Recategorize these transactions.">⚠️ Uncategorized</th>
                  <td />
                  <td className="activity">{money(uncat.activity)}</td>
                  <td><span className={`avail-pill ${availableClass(null, uncat)}`}>{money(uncat.available)}</span></td>
                </tr>
              </tbody>
            ) : null}
          </table>
        </div>
        {!onlyOverspent && <form onSubmit={addGroup} className="add-row">
          <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Add a category group…" />
          <button className="btn" type="submit">Add group</button>
        </form>}
        <p className="hint">Tip: click <strong>+−×÷</strong> beside an Assigned amount for a calculator, or type <code>+50</code>, <code>-20</code>, <code>*2</code> or <code>/2</code> right in the box.</p>
      </div>

      {creating ? (
        <NewCategoryPanel groups={groups} update={update} month={month} defaultGroupId={selected?.groupId}
          onCancel={() => setCreating(false)} onCreated={setSelectedId} />
      ) : selectedCard ? (
        <CardInspector key={selectedCard.id} update={update} budget={budget} month={month} card={selectedCard} onClose={() => setSelectedId(null)} />
      ) : selected ? (
        <Inspector key={selected.id} state={state} update={update} budget={budget} month={month} cat={selected} onClose={() => setSelectedId(null)} />
      ) : (
        <MonthSummary budget={budget} balances={balances} accounts={state.budgetAccounts} goToAccounts={goToAccounts} />
      )}
    </section>
  );
}

/* ---------- Accounts & transactions ---------- */

// A transaction as seen from one account: transfers show the opposite sign on the receiving side.
function perspective(t, accountId) {
  const own = accountId && t.transferAccountId === accountId ? accountId : t.accountId;
  const flipped = own !== t.accountId;
  return {
    own,
    amount: flipped ? -t.amount : t.amount,
    category: t.transferAccountId ? `xfer:${flipped ? t.accountId : t.transferAccountId}` : t.categoryId,
  };
}

// Rewrite a transaction from `own`'s point of view with a new signed amount and/or category value.
// Split lines are kept only while the category stays "split".
function rewrite(t, own, amount, category) {
  const base = { ...t, accountId: own, amount, transferAccountId: undefined, categoryId: undefined, splits: category === SPLIT ? t.splits : undefined };
  return category.startsWith('xfer:') ? { ...base, transferAccountId: category.slice(5) } : { ...base, categoryId: category };
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// A transaction's date: a calendar popup with the repeat choices at the bottom. `repeat` is a frequency ('' = none). The popup is positioned
// against the window so the register's scrolling container doesn't clip it.
function DatePicker({ date, onDate, repeat, nextDate, onRepeat }) {
  const [pos, setPos] = useState(null); // null = closed
  const [shown, setShown] = useState(() => startOfMonth(fromKey(date)));
  const button = useRef(null);
  const pop = useRef(null);
  const today = todayKey();

  useEffect(() => {
    if (!pos) return;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !pop.current?.contains(e.target) && !button.current?.contains(e.target)) setPos(null);
    };
    const closeOnScroll = (e) => !pop.current?.contains(e.target) && setPos(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnScroll);
    };
  }, [pos]);

  function toggle() {
    if (pos) return setPos(null);
    const r = button.current.getBoundingClientRect();
    const height = 400;
    setShown(startOfMonth(fromKey(date)));
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 268)), top: r.bottom + height > window.innerHeight ? Math.max(8, r.top - height - 4) : r.bottom + 4 });
  }

  const pick = (fn) => (...args) => { fn(...args); setPos(null); };
  return (
    <>
      <button ref={button} type="button" className={`plain date-btn ${pos ? 'open' : ''}`} onClick={toggle} aria-haspopup="dialog" aria-expanded={Boolean(pos)}
        title={repeat ? `Repeats ${repeatLabel[repeat].toLowerCase()} · next ${fmtDue(nextDate)}` : undefined}>
        {fromKey(date).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })}
        {repeat && <span className="repeat-mark" aria-label="Repeats"> 🔁</span>}
      </button>
      {pos && (
        <div ref={pop} className="date-pop" role="dialog" aria-label="Date and repeat" style={pos}>
          <div className="date-pop-head">
            <button type="button" className="icon-btn" onClick={() => setShown(addMonths(shown, -1))} aria-label="Previous month">‹</button>
            <strong>{fmtMonthYear(shown)}</strong>
            <button type="button" className="icon-btn" onClick={() => setShown(addMonths(shown, 1))} aria-label="Next month">›</button>
          </div>
          <div className="date-pop-grid">
            {WEEKDAY_INITIALS.map((d, i) => <span key={i} className="dow">{d}</span>)}
            {monthGrid(shown).map((d) => {
              const k = toKey(d);
              const cls = [k === date && 'sel', k === today && 'today', d.getMonth() !== shown.getMonth() && 'other'].filter(Boolean).join(' ');
              return <button type="button" key={k} className={cls} onClick={pick(() => onDate(k))}>{d.getDate()}</button>;
            })}
          </div>
          <div className="date-pop-repeat" role="group" aria-label="Repeat">
            <span className="dow">Repeat</span>
            {REPEAT_OPTIONS.map(([id, label]) => {
              const on = repeat === id;
              return (
                <button type="button" key={id} className={on ? 'on' : ''} aria-pressed={on} onClick={pick(() => !on && onRepeat(id))}>
                  <span className="check">{on ? '✓' : ''}</span>{label}
                </button>
              );
            })}
            {repeat && <p className="hint">Next: {fmtDue(nextDate)}</p>}
          </div>
        </div>
      )}
    </>
  );
}

// How well a payee matches what's typed: starts with it, then has a word starting with it, then contains it anywhere.
// null if it doesn't match, or is exactly what's typed already.
function payeeRank(name, q) {
  const l = name.toLowerCase();
  if (l === q) return null;
  if (l.startsWith(q)) return 0;
  if (l.split(/[\s\-&/.,']+/).some((w) => w.startsWith(q))) return 1;
  return l.includes(q) ? 2 : null;
}

// A payee box that suggests payees used before as you type. `payees` is most recently used first, which breaks ties.
// The list is positioned against the window so the register's scrolling container doesn't clip it.
function PayeeInput({ value, onChange, onPick, onBlur, payees, inputRef, boxClassName = '', ...rest }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const ownRef = useRef(null);
  const ref = inputRef || ownRef;
  const list = useRef(null);
  const listId = useId();
  const q = value.trim().toLowerCase();
  const matches = q
    ? payees.map((name) => [name, payeeRank(name, q)]).filter(([, r]) => r !== null).sort((a, b) => a[1] - b[1]).slice(0, 8).map(([name]) => name)
    : [];
  const show = open && matches.length > 0 && pos;

  useEffect(() => {
    if (!show) return;
    const close = (e) => !list.current?.contains(e.target) && setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [show]);

  function type(e) {
    onChange(e.target.value);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 2, minWidth: Math.max(r.width, 180) });
    setActive(0);
    setOpen(true);
  }

  function pick(name) {
    onChange(name);
    onPick?.(name);
    setOpen(false);
  }

  function keyDown(e) {
    if (!show) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault(); // pick the suggestion instead of submitting the form
      pick(matches[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    }
  }

  // Bold the part of the name that matches what's typed.
  const label = (name) => {
    const i = name.toLowerCase().indexOf(q);
    return i < 0 ? name : <>{name.slice(0, i)}<mark>{name.slice(i, i + q.length)}</mark>{name.slice(i + q.length)}</>;
  };

  return (
    <span className={`payee-box ${boxClassName}`}>
      <input ref={ref} value={value} onChange={type} onKeyDown={keyDown} autoComplete="off" role="combobox" aria-autocomplete="list"
        aria-expanded={Boolean(show)} aria-controls={listId} aria-activedescendant={show ? `${listId}-${active}` : undefined}
        onBlur={(e) => { setOpen(false); onBlur?.(e); }} {...rest} />
      {show && (
        <ul ref={list} id={listId} className="payee-pop" role="listbox" style={pos}>
          {matches.map((name, i) => (
            <li key={name} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(name); }} onMouseEnter={() => setActive(i)}>
              {label(name)}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

function TxnRow({ t, view, state, update, payees }) {
  const { budgetAccounts: accounts } = state;
  const p = perspective(t, view);
  const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? '—';
  const patch = (fields) => update('budgetTransactions', (ts) => ts.map((x) => (x.id === t.id ? { ...x, ...fields } : x)));
  const replace = (next) => update('budgetTransactions', (ts) => ts.map((x) => (x.id === t.id ? next : x)));
  const startingDebt = t.categoryId === paymentId(t.accountId);
  const isSplit = t.categoryId === SPLIT && t.splits?.length > 0;
  const lineUncat = (x) => x.categoryId !== RTA && !state.budgetCategories.some((c) => c.id === x.categoryId);
  const isUncat = !t.transferAccountId && !startingDebt && !isSplit && lineUncat(t);
  const rec = t.recurringId && (state.budgetRecurring || []).find((r) => r.id === t.recurringId);
  const remainder = isSplit ? splitRemainder(t) : 0;
  const unfinished = isSplit && (remainder !== 0 || t.splits.some((x) => lineUncat(x) || !x.amount));
  const [open, setOpen] = useState(false);
  const showLines = isSplit && (open || unfinished); // lines stay open until every one has a category and they add up
  const lead = view ? 2 : 3; // columns before Category

  function changeCategory(value) {
    if (value === SPLIT) {
      // Start with the current category holding the whole amount, plus an empty line to fill in.
      const first = t.transferAccountId || startingDebt || isUncat ? UNCAT : t.categoryId;
      const splits = [
        { id: newId(), categoryId: first, amount: p.amount, memo: '' },
        { id: newId(), categoryId: UNCAT, amount: 0, memo: '' },
      ];
      replace({ ...rewrite(t, p.own, p.amount, SPLIT), splits });
      return;
    }
    if (isSplit && !window.confirm('Put the whole transaction in one category? Its split lines will be removed.')) return;
    replace(rewrite(t, p.own, p.amount, value));
  }

  // Down to one line, it's no longer a split: the whole amount goes to that line's category.
  const setLines = (splits) => (splits.length === 1 ? replace({ ...t, categoryId: splits[0].categoryId, splits: undefined }) : patch({ splits }));
  const patchLine = (id, fields) => setLines(t.splits.map((x) => (x.id === id ? { ...x, ...fields } : x)));
  const sameDirection = Math.sign(remainder) === Math.sign(t.amount);
  const addLine = () => setLines([...t.splits, { id: newId(), categoryId: UNCAT, amount: sameDirection ? remainder : 0, memo: '' }]);

  // Starting, changing or stopping a repeat from any of its transactions. Dates already past are skipped,
  // so nothing gets backfilled: the next one is entered (as pending) on the first due date from today.
  function setRepeat(frequency) {
    if (!frequency) {
      if (rec && window.confirm(`Stop repeating "${rec.template.payee || 'this transaction'}"? Transactions already entered stay.`)) {
        update('budgetRecurring', (rs) => rs.filter((r) => r.id !== rec.id));
      }
      return;
    }
    const today = todayKey();
    if (rec) {
      const lastEntered = state.budgetTransactions.filter((x) => x.recurringId === rec.id).reduce((d, x) => (x.date > d ? x.date : d), rec.startDate);
      const from = toKey(addDays(fromKey(lastEntered), 1));
      const next = { ...rec, frequency };
      next.nextDate = firstOccurrenceFrom(next, from > today ? from : today);
      update('budgetRecurring', (rs) => rs.map((r) => (r.id === rec.id ? next : r)));
      return;
    }
    const { id, date, createdAt, pending, recurringId, ...template } = t;
    const created = { id: newId(), frequency, startDate: t.date, template };
    created.nextDate = firstOccurrenceFrom(created, today);
    update('budgetRecurring', (rs) => [...(rs || []), created]);
    patch({ recurringId: created.id });
  }

  return (
    <>
    <tr className={[isUncat && 'uncat', t.pending && 'pending', isSplit && 'has-split'].filter(Boolean).join(' ')}>
      <td><DatePicker date={t.date} onDate={(date) => patch({ date })} repeat={rec?.frequency ?? ''} nextDate={rec?.nextDate} onRepeat={setRepeat} /></td>
      {!view && (
        <td>
          <select className="plain" value={p.own} aria-label="Account"
            onChange={(e) => replace(rewrite(t, e.target.value, p.amount, p.category === `xfer:${e.target.value}` ? RTA : p.category))}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </td>
      )}
      <td><PayeeInput className="plain" payees={payees} value={t.payee} placeholder="Payee" onChange={(payee) => patch({ payee })} aria-label="Payee" /></td>
      <td>
        <div className="cat-cell">
          <select className="plain" value={isSplit ? SPLIT : isUncat ? UNCAT : p.category} aria-label="Category" onChange={(e) => changeCategory(e.target.value)}
            title={t.transferAccountId ? `Transfer between ${accountName(t.accountId)} and ${accountName(t.transferAccountId)}` : undefined}>
            <CategoryOptions groups={state.budgetGroups} categories={state.budgetCategories} accounts={accounts} ownAccountId={p.own} uncategorized={isUncat}
              startingDebt={startingDebt} split={isSplit ? `✂️ Split (${t.splits.length})` : '✂️ Split between categories…'} />
          </select>
          {isSplit && (
            <button className="split-toggle" onClick={() => setOpen(!showLines)} disabled={unfinished} aria-expanded={showLines}
              aria-label={showLines ? 'Hide split lines' : 'Show split lines'} title={unfinished ? 'Finish splitting to hide the lines' : undefined}>
              {showLines ? '▾' : '▸'}
            </button>
          )}
        </div>
      </td>
      <td><input className="plain" value={t.memo || ''} placeholder="Memo" onChange={(e) => patch({ memo: e.target.value })} aria-label="Memo" /></td>
      <td><AmountInput cents={p.amount < 0 ? -p.amount : 0} blankZero onCommit={(v) => replace(rewrite(t, p.own, -v, p.category))} aria-label="Outflow" /></td>
      <td><AmountInput cents={p.amount > 0 ? p.amount : 0} blankZero className="inflow" onCommit={(v) => replace(rewrite(t, p.own, v, p.category))} aria-label="Inflow" /></td>
      <td>
        <button className={`clear-btn ${t.pending ? 'is-pending' : ''}`} onClick={() => patch({ pending: !t.pending })}
          title={t.pending ? 'Pending. Click once it clears your bank.' : 'Cleared. Click to mark pending.'}
          aria-label={t.pending ? 'Mark cleared' : 'Mark pending'}>
          {t.pending ? 'Pending' : '✓'}
        </button>
      </td>
      <td>
        <button className="icon-btn subtle" aria-label="Delete transaction" title="Delete"
          onClick={() => update('budgetTransactions', (ts) => ts.filter((x) => x.id !== t.id))}>×</button>
      </td>
    </tr>
    {showLines && t.splits.map((x) => (
      <tr key={x.id} className={['split-line', lineUncat(x) && 'uncat', t.pending && 'pending'].filter(Boolean).join(' ')}>
        <td colSpan={lead} className="split-mark">↳</td>
        <td>
          <select className="plain" value={lineUncat(x) ? UNCAT : x.categoryId} aria-label="Split category" onChange={(e) => patchLine(x.id, { categoryId: e.target.value })}>
            {lineUncat(x) && <option value={UNCAT}>Choose a category…</option>}
            <CategoryOptions groups={state.budgetGroups} categories={state.budgetCategories} accounts={accounts} transfers={false} />
          </select>
        </td>
        <td><input className="plain" value={x.memo || ''} placeholder="Memo" onChange={(e) => patchLine(x.id, { memo: e.target.value })} aria-label="Split memo" /></td>
        <td><AmountInput cents={x.amount < 0 ? -x.amount : 0} blankZero onCommit={(v) => patchLine(x.id, { amount: -v })} aria-label="Split outflow" /></td>
        <td><AmountInput cents={x.amount > 0 ? x.amount : 0} blankZero className="inflow" onCommit={(v) => patchLine(x.id, { amount: v })} aria-label="Split inflow" /></td>
        <td />
        <td><button className="icon-btn subtle" aria-label="Remove split line" title="Remove line" onClick={() => setLines(t.splits.filter((y) => y.id !== x.id))}>×</button></td>
      </tr>
    ))}
    {showLines && (
      <tr className="split-line split-foot">
        <td colSpan={lead} />
        <td colSpan={6}>
          <button className="link-btn" onClick={addLine}>+ Add a line</button>
          {remainder !== 0 && (
            <span className="split-left">
              {sameDirection
                ? `${money(Math.abs(remainder))} still to split. Until then it counts as Uncategorized.`
                : `The lines add up to ${money(Math.abs(remainder))} more than the transaction.`}
            </span>
          )}
        </td>
      </tr>
    )}
    </>
  );
}

function AddTransaction({ state, update, view, payees }) {
  const { budgetAccounts: accounts, budgetTransactions: txns, budgetCategories: categories } = state;
  const [date, setDate] = useState(todayKey);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [payee, setPayee] = useState('');
  const [category, setCategory] = useState(''); // '' shows the "Category" placeholder
  const [memo, setMemo] = useState('');
  const [outflow, setOutflow] = useState('');
  const [inflow, setInflow] = useState('');
  const [repeat, setRepeat] = useState('');
  const [lines, setLines] = useState([]); // split lines being filled in; amounts are typed text like the main fields
  const [error, setError] = useState('');
  const payeeInput = useRef(null);
  const own = view || accountId;

  const cents = (out, inn) => Math.abs(parseMoney(inn) ?? 0) - Math.abs(parseMoney(out) ?? 0);
  const blankLine = (fields) => ({ id: newId(), categoryId: '', memo: '', out: '', inn: '', ...fields });
  const asText = (c) => (Math.abs(c) / 100).toFixed(2);
  const linesFrom = (splits) => splits.map((x) => blankLine({ categoryId: x.categoryId, memo: x.memo || '', out: x.amount < 0 ? asText(x.amount) : '', inn: x.amount > 0 ? asText(x.amount) : '' }));
  const patchLine = (id, fields) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...fields } : l)));

  function chooseCategory(value) {
    setCategory(value);
    setError('');
    // Start splitting with what's typed so far on the first line.
    if (value === SPLIT && !lines.length) setLines([blankLine({ out: outflow, inn: inflow }), blankLine()]);
  }

  // Like YNAB, a payee you've used before fills in the category (or split) you used last time.
  function rememberCategory(picked = payee) {
    if (category === SPLIT && lines.some((l) => l.categoryId)) return; // don't undo lines already chosen
    const name = picked.trim().toLowerCase();
    const last = name && [...txns].reverse().find((t) => t.payee.trim().toLowerCase() === name && (t.accountId === own || t.transferAccountId === own || !t.transferAccountId));
    if (!last) return;
    setCategory(perspective(last, own).category);
    if (last.splits?.length) setLines(linesFrom(last.splits));
  }

  const splitting = category === SPLIT;
  const lineTotal = lines.reduce((sum, l) => sum + cents(l.out, l.inn), 0);
  const typedTotal = cents(outflow, inflow);
  const splitLeft = splitting && typedTotal ? typedTotal - lineTotal : 0;

  function submit(e) {
    e.preventDefault();
    // When splitting, the total can be left blank: it's then the lines added up.
    const amount = splitting && !typedTotal ? lineTotal : typedTotal;
    if (!amount || !own || !category || category === `xfer:${own}`) return;
    let splits;
    if (splitting) {
      const filled = lines.filter((l) => l.categoryId || cents(l.out, l.inn));
      if (filled.length < 2) return setError('Add at least two lines, or pick a single category instead.');
      if (filled.some((l) => !l.categoryId)) return setError('Choose a category for every line.');
      if (filled.some((l) => !cents(l.out, l.inn))) return setError('Give every line an amount.');
      if (lineTotal !== amount) return setError(`The lines add up to ${money(Math.abs(lineTotal))}, but the transaction is ${money(Math.abs(amount))}.`);
      splits = filled.map((l) => ({ id: l.id, categoryId: l.categoryId, amount: cents(l.out, l.inn), memo: l.memo.trim() }));
    }
    const t = rewrite({ id: newId(), date, payee: payee.trim(), memo: memo.trim(), createdAt: Date.now() }, own, amount, category);
    if (splits) t.splits = splits;
    if (repeat) {
      // This one is entered as typed; later ones are entered as pending when they come due.
      const { id, date: _, createdAt, ...template } = t;
      const rec = { id: newId(), frequency: repeat, startDate: date, template };
      rec.nextDate = nextOccurrence(rec, date);
      t.recurringId = rec.id;
      update('budgetRecurring', (rs) => [...(rs || []), rec]);
    }
    update('budgetTransactions', (ts) => [...ts, t]);
    setDate(todayKey());
    setCategory('');
    setRepeat('');
    setLines([]);
    setError('');
    setPayee('');
    setMemo('');
    setOutflow('');
    setInflow('');
    payeeInput.current?.focus();
  }

  return (
    <form className="add-txn" onSubmit={submit}>
      <DatePicker date={date} onDate={setDate} repeat={repeat} nextDate={repeat && nextOccurrence({ frequency: repeat, startDate: date }, date)} onRepeat={setRepeat} />
      {!view && (
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <PayeeInput inputRef={payeeInput} boxClassName="payee" payees={payees} value={payee} onChange={setPayee}
        onPick={rememberCategory} onBlur={() => rememberCategory()} placeholder="Payee" aria-label="Payee" />
      <select value={category} onChange={(e) => chooseCategory(e.target.value)} aria-label="Category" required className={category ? '' : 'placeholder'}>
        <option value="" disabled>Category</option>
        <CategoryOptions groups={state.budgetGroups} categories={categories} accounts={accounts} ownAccountId={own} split="✂️ Split between categories…" />
      </select>
      <input className="memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo" aria-label="Memo" />
      <input className="money-in" inputMode="decimal" value={outflow} onChange={(e) => { setOutflow(e.target.value); setInflow(''); }}
        placeholder={splitting && lineTotal < 0 ? money(-lineTotal) : 'Outflow'} aria-label="Outflow" />
      <input className="money-in" inputMode="decimal" value={inflow} onChange={(e) => { setInflow(e.target.value); setOutflow(''); }}
        placeholder={splitting && lineTotal > 0 ? money(lineTotal) : 'Inflow'} aria-label="Inflow" />
      <button className="btn primary" type="submit">Add</button>
      {splitting && (
        <div className="add-split">
          {lines.map((l, i) => (
            <div key={l.id} className="add-split-line">
              <span className="split-mark" aria-hidden="true">↳</span>
              <select value={l.categoryId} onChange={(e) => { patchLine(l.id, { categoryId: e.target.value }); setError(''); }}
                aria-label={`Line ${i + 1} category`} className={l.categoryId ? '' : 'placeholder'}>
                <option value="" disabled>Category</option>
                <CategoryOptions groups={state.budgetGroups} categories={categories} accounts={accounts} transfers={false} />
              </select>
              <input className="memo" value={l.memo} onChange={(e) => patchLine(l.id, { memo: e.target.value })} placeholder="Memo" aria-label={`Line ${i + 1} memo`} />
              <input className="money-in" inputMode="decimal" value={l.out} onChange={(e) => { patchLine(l.id, { out: e.target.value, inn: '' }); setError(''); }}
                placeholder="Outflow" aria-label={`Line ${i + 1} outflow`} />
              <input className="money-in" inputMode="decimal" value={l.inn} onChange={(e) => { patchLine(l.id, { inn: e.target.value, out: '' }); setError(''); }}
                placeholder="Inflow" aria-label={`Line ${i + 1} inflow`} />
              <button type="button" className="icon-btn" aria-label={`Remove line ${i + 1}`} title="Remove line"
                onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>×</button>
            </div>
          ))}
          <div className="add-split-foot">
            <button type="button" className="link-btn"
              onClick={() => setLines((ls) => [...ls, blankLine(splitLeft ? { out: splitLeft < 0 ? asText(splitLeft) : '', inn: splitLeft > 0 ? asText(splitLeft) : '' } : {})])}>
              + Add a line
            </button>
            {splitLeft !== 0 && (
              <span className="split-left">
                {Math.sign(splitLeft) === Math.sign(typedTotal) ? `${money(Math.abs(splitLeft))} left to split` : `Lines are ${money(Math.abs(splitLeft))} over the total`}
              </span>
            )}
            {!typedTotal && lineTotal !== 0 && <span className="muted">Total: {money(Math.abs(lineTotal))}</span>}
          </div>
        </div>
      )}
      {error && <p className="hint error-text">{error}</p>}
      {repeat && <p className="hint">Each time it comes due it's added as pending. Mark it cleared once it shows up at your bank.</p>}
    </form>
  );
}

const repeatLabel = Object.fromEntries(REPEAT_OPTIONS);

function RecurringList({ state, update, view }) {
  const accountName = (id) => state.budgetAccounts.find((a) => a.id === id)?.name ?? '—';
  const shown = (state.budgetRecurring || [])
    .filter((r) => !view || r.template.accountId === view || r.template.transferAccountId === view)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  if (!shown.length) return null;

  function stop(rec) {
    if (!window.confirm(`Stop repeating "${rec.template.payee || 'this transaction'}"? Transactions already entered stay.`)) return;
    update('budgetRecurring', (rs) => rs.filter((r) => r.id !== rec.id));
  }

  return (
    <details className="recurring">
      <summary>🔁 Repeating ({shown.length})</summary>
      <ul>
        {shown.map((r) => {
          const amount = view && r.template.transferAccountId === view ? -r.template.amount : r.template.amount;
          return (
            <li key={r.id}>
              <span className="grow">{r.template.payee || 'No payee'}{!view && <span className="muted"> · {accountName(r.template.accountId)}</span>}</span>
              <span className={amount < 0 ? '' : 'inflow'}>{money(amount)}</span>
              <span className="muted">{repeatLabel[r.frequency]} · next {fmtDue(r.nextDate)}</span>
              <button className="icon-btn subtle" aria-label="Stop repeating" title="Stop repeating" onClick={() => stop(r)}>×</button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Accounts({ state, update, balances }) {
  const { budgetAccounts: accounts, budgetTransactions: txns } = state;
  const [view, setView] = useState(accounts[0]?.id ?? ''); // '' = all accounts
  const [name, setName] = useState('');
  const [type, setType] = useState('checking');
  const [start, setStart] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const account = accounts.find((a) => a.id === view);
  const total = accounts.reduce((s, a) => s + balances[a.id], 0);
  const pending = accountBalances(accounts, txns.filter((t) => t.pending));

  function addAccount(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const id = newId();
    const cents = Math.abs(parseMoney(start) ?? 0) * (type === 'credit' ? -1 : 1); // a card balance is money owed
    update('budgetAccounts', (as) => [...as, { id, name: name.trim(), type }]);
    if (cents) {
      update('budgetTransactions', (ts) => [
        ...ts,
        { id: newId(), date: todayKey(), accountId: id, payee: 'Starting Balance', categoryId: type === 'credit' ? paymentId(id) : RTA, memo: '', amount: cents, createdAt: Date.now() },
      ]);
    }
    setView(id);
    setName('');
    setStart('');
  }

  function deleteAccount() {
    const count = txns.filter((t) => t.accountId === account.id || t.transferAccountId === account.id).length;
    if (!window.confirm(`Delete ${account.name}${count ? ` and its ${count} transaction(s)` : ''}? This changes your budget totals.`)) return;
    update('budgetAccounts', (as) => as.filter((a) => a.id !== account.id));
    update('budgetTransactions', (ts) => ts.filter((t) => t.accountId !== account.id && t.transferAccountId !== account.id));
    update('budgetRecurring', (rs) => (rs || []).filter((r) => r.template.accountId !== account.id && r.template.transferAccountId !== account.id));
    setView('');
  }

  const q = search.trim().toLowerCase();
  const catName = Object.fromEntries(state.budgetCategories.map((c) => [c.id, c.name]));
  const searchText = (t) => [t.payee, t.memo, catName[t.categoryId], ...(t.splits || []).flatMap((s) => [catName[s.categoryId], s.memo])];
  const shown = txns
    .filter((t) => !view || t.accountId === view || t.transferAccountId === view)
    .filter((t) => !q || searchText(t).some((s) => s?.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  // Every payee used before, most recent first (one spelling per name, the latest).
  const payees = [];
  const seenPayees = new Set();
  for (const t of [...txns].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0))) {
    const name = t.payee.trim();
    if (name && !seenPayees.has(name.toLowerCase())) {
      seenPayees.add(name.toLowerCase());
      payees.push(name);
    }
  }

  return (
    <section className="split">
      <aside className="panel side">
        <h2>Accounts</h2>
        <ul className="nav-list">
          <li>
            <button className={!view ? 'active' : ''} onClick={() => setView('')}>
              <span>All accounts</span><span className={total < 0 ? 'negative' : 'muted'}>{money(total)}</span>
            </button>
          </li>
          {accounts.map((a) => (
            <li key={a.id}>
              <button className={view === a.id ? 'active' : ''} onClick={() => setView(a.id)}>
                <span>{a.name}</span><span className={balances[a.id] < 0 ? 'negative' : 'muted'}>{money(balances[a.id])}</span>
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addAccount} className="add-account">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an account…" aria-label="Account name" />
          {name.trim() && (
            <>
              <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Account type">
                {ACCOUNT_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)}
                placeholder={type === 'credit' ? 'Balance owed today' : 'Balance today'} aria-label="Starting balance" />
              <button className="btn primary" type="submit">Add account</button>
              <p className="hint">
                {type === 'credit'
                  ? "What you owe today is tracked as existing debt. The card gets a payment category on the Plan where you can set money aside to pay it down."
                  : 'The starting balance goes to Ready to Assign.'}
              </p>
            </>
          )}
        </form>
      </aside>

      <div className="panel main">
        {accounts.length === 0 ? (
          <p className="empty">Add your checking, savings, cash and credit card accounts on the left. Each one's starting balance becomes money you can assign.</p>
        ) : (
          <>
            <div className="panel-head">
              {account ? (
                <>
                  <input className="plain title-input" value={account.name} aria-label="Account name"
                    onChange={(e) => update('budgetAccounts', (as) => as.map((a) => (a.id === account.id ? { ...a, name: e.target.value } : a)))} />
                  <span className={`account-balance ${balances[account.id] < 0 ? 'negative' : ''}`}>{money(balances[account.id])}</span>
                  {pending[account.id] !== 0 && (
                    <span className="muted pending-note" title="Working balance includes transactions that haven't cleared yet">
                      Cleared {money(balances[account.id] - pending[account.id])} · Pending {money(pending[account.id])}
                    </span>
                  )}
                  <button className="link-btn danger" onClick={deleteAccount}>Delete</button>
                </>
              ) : (
                <h2 className="title-input">All accounts</h2>
              )}
              <input className="search txn-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" aria-label="Search transactions" />
            </div>

            <AddTransaction key={view} state={state} update={update} view={view} payees={payees} />
            <RecurringList state={state} update={update} view={view} />

            {shown.length === 0 ? (
              <p className="empty">{q ? 'No matching transactions.' : 'No transactions yet.'}</p>
            ) : (
              <div className="table-scroll">
                <table className="register">
                  <thead>
                    <tr>
                      <th>Date</th>{!view && <th>Account</th>}<th>Payee</th><th>Category</th><th>Memo</th>
                      <th className="num">Outflow</th><th className="num">Inflow</th><th>Status</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, limit).map((t) => <TxnRow key={t.id} t={t} view={view} state={state} update={update} payees={payees} />)}
                  </tbody>
                </table>
              </div>
            )}
            {shown.length > limit && (
              <button className="link-btn" onClick={() => setLimit(limit + PAGE)}>Show more ({shown.length - limit} older)</button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- Tab ---------- */

export default function Budget({ state, update }) {
  const [section, setSection] = useState('plan');
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const month = monthOf(toKey(monthStart));
  const budget = computeBudget(state, month);
  const balances = accountBalances(state.budgetAccounts, state.budgetTransactions);
  const rta = budget.readyToAssign;
  const [creatingCategory, setCreatingCategory] = useState(false);

  // The Plan's side panel sticks just below the toolbar, which can wrap to more than one line; keep its height in a CSS variable.
  const toolbar = useRef(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  useEffect(() => {
    const el = toolbar.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setToolbarHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Enter repeating transactions that have come due as pending. The schedules advance in the same update,
  // so a second run (React strict mode, or another render) finds nothing left to enter.
  const today = todayKey();
  useEffect(() => {
    if (!(state.budgetRecurring || []).some((r) => r.nextDate <= today)) return;
    let entered = [];
    update('budgetRecurring', (rs) => {
      const result = enterDueRecurring(rs || [], newId, today);
      entered = result.entered;
      return result.recurring;
    }, { history: false });
    if (entered.length) update('budgetTransactions', (ts) => [...ts, ...entered], { history: false });
  }, [state.budgetRecurring, today, update]);

  const overspent = state.budgetCategories.filter((c) => budget.rows[c.id]?.available < 0);
  const overspentTotal = overspent.reduce((s, c) => s - budget.rows[c.id].available, 0);
  // The overspent button filters the Plan to just those categories; once they're all covered, everything shows again.
  const [onlyOverspent, setOnlyOverspent] = useState(false);
  if (onlyOverspent && !overspent.length) setOnlyOverspent(false);
  const filtering = onlyOverspent && overspent.length > 0 && section === 'plan';

  function assignUnderfunded() {
    update('budgetAssigned', (assigned) =>
      state.budgetCategories.reduce((a, c) => {
        const row = budget.rows[c.id];
        return row.underfunded ? setAssigned(a, c.id, month, row.assigned + row.underfunded) : a;
      }, assigned),
    );
  }

  return (
    <div className="budget" style={{ '--toolbar-h': `${toolbarHeight}px` }}>
      <div className="toolbar" ref={toolbar}>
        <div className="toolbar-left">
          <div className="segmented" role="group" aria-label="Budget section">
            {[['plan', 'Plan'], ['accounts', 'Accounts']].map(([id, label]) => (
              <button key={id} className={section === id ? 'active' : ''} aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>
            ))}
          </div>
          {section !== 'accounts' && <MonthNav monthStart={monthStart} setMonthStart={setMonthStart} />}
        </div>
        {section !== 'accounts' && (
          <div className="rta-wrap">
            {section === 'plan' && overspent.length > 0 && (
              <button className={`btn overspent-alert ${filtering ? 'on' : ''}`} aria-pressed={filtering} onClick={() => setOnlyOverspent(!filtering)}
                title={`${filtering ? 'Show all categories' : 'Show only overspent categories'}: ${overspent.map((c) => `${c.name} (${money(-budget.rows[c.id].available)})`).join(', ')}`}>
                ⚠️ {overspent.length} overspent · {money(-overspentTotal)}
              </button>
            )}
            {section === 'plan' && budget.underfunded > 0 && (
              <button className="btn" onClick={assignUnderfunded} title="Assign what every target needs this month">
                🎯 Fund targets ({money(budget.underfunded)})
              </button>
            )}
            {section === 'plan' && (
              <button className="btn" onClick={() => setCreatingCategory(true)} aria-pressed={creatingCategory}>+ Add category</button>
            )}
            <div className={`rta ${rta < 0 ? 'neg' : rta > 0 ? 'pos' : 'zero'}`}>
              <strong>{money(rta)}</strong>
              <span>{rta < 0 ? 'Assigned more than you have' : rta > 0 ? 'Ready to Assign' : 'All money assigned'}</span>
            </div>
          </div>
        )}
      </div>

      {section === 'plan' && (
        <Plan state={state} update={update} month={month} budget={budget} balances={balances} goToAccounts={() => setSection('accounts')}
          creating={creatingCategory} setCreating={setCreatingCategory} onlyOverspent={filtering} setOnlyOverspent={setOnlyOverspent} />
      )}
      {section === 'accounts' && <Accounts state={state} update={update} balances={balances} />}
    </div>
  );
}
