import { useState } from 'react';
import { startOfMonth, todayKey, toKey } from '../dates.js';
import { newId } from '../store.js';
import { AmountInput, MonthNav } from './common.jsx';
import Paychecks from './Paychecks.jsx';
import {
  DAY_OPTIONS, RTA, UNCAT, accountBalances, computeBudget, fmtDue, isPastDue, lastDayOf, money, monthOf, parseDay, parseMoney,
  setAssigned, shiftMonth, targetDueDate, targetProgress, TARGET_TYPES, isSavingsTarget, targetOccurrences,
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
  if (row.available < 0) return 'neg';
  if (cat?.target?.amount && row.underfunded > 0) return 'under';
  return row.available > 0 ? 'pos' : 'zero';
}

// Category <select> options, grouped like the budget. Transfers are encoded as "xfer:<accountId>".
function CategoryOptions({ groups, categories, accounts, ownAccountId, uncategorized }) {
  const others = accounts.filter((a) => a.id !== ownAccountId);
  return (
    <>
      {uncategorized && <option value={UNCAT}>⚠️ Uncategorized</option>}
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

function Inspector({ state, update, budget, month, cat, onClose }) {
  const { budgetCategories: categories, budgetGroups: groups } = state;
  const [moveAmount, setMoveAmount] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const row = budget.rows[cat.id];
  const last = budget.lastMonth(cat.id);
  const assign = (amount) => update('budgetAssigned', (a) => setAssigned(a, cat.id, month, amount));
  const patch = (p) => update('budgetCategories', (cs) => cs.map((c) => (c.id === cat.id ? { ...c, ...p } : c)));
  const patchTarget = (p) => patch({ target: { ...cat.target, ...p } });

  const quick = [
    cat.target?.amount && row.underfunded > 0 && ['Underfunded', row.assigned + row.underfunded],
    ['Assigned last month', last.assigned],
    ['Spent last month', Math.max(0, -last.activity)],
    row.available < 0 && ['Cover overspending', row.assigned - row.available],
    ['Reset assigned', 0],
  ].filter(Boolean);

  function deleteCategory() {
    const used = state.budgetTransactions.filter((t) => t.categoryId === cat.id).length;
    const msg = used
      ? `Delete "${cat.name}"? Its ${used} transaction(s) will become uncategorized and its assigned money returns to Ready to Assign.`
      : `Delete "${cat.name}"? Any money assigned to it returns to Ready to Assign.`;
    if (!window.confirm(msg)) return;
    update('budgetCategories', (cs) => cs.filter((c) => c.id !== cat.id));
    update('budgetAssigned', (as) => as.filter((a) => a.categoryId !== cat.id));
    update('budgetTransactions', (ts) => ts.map((t) => (t.categoryId === cat.id ? { ...t, categoryId: UNCAT } : t)));
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
    setMoveAmount('');
  }

  const progress = targetProgress(cat, row);
  const due = targetDueDate(cat, month);
  const pastDue = row.underfunded > 0 && isPastDue(due);
  const saving = isSavingsTarget(cat.target);
  const occurrences = cat.target && ['weekly', 'biweekly'].includes(cat.target.type) && targetOccurrences(cat.target, month).length;

  // Keep the amount when switching how often it repeats; fill in a sensible date or weekday if it needs one.
  function changeTargetType(type) {
    const date = type === 'biweekly' ? todayKey() : lastDayOf(shiftMonth(month, 2));
    const keepDate = cat.target.date && (type === 'biweekly') === (cat.target.type === 'biweekly');
    patchTarget({ type, date: keepDate ? cat.target.date : date, weekday: cat.target.weekday ?? new Date().getDay() });
  }
  return (
    <aside className="panel side inspector">
      <div className="panel-head">
        <input className="plain title-input" value={cat.name} aria-label="Category name" onChange={(e) => patch({ name: e.target.value })} />
        <button className="icon-btn subtle" onClick={onClose} aria-label="Close details" title="Close">×</button>
      </div>
      <label className="group-move">
        Group
        <select value={cat.groupId} onChange={(e) => patch({ groupId: e.target.value })}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>

      <div className="avail-summary">
        <span className={`avail-pill big ${availableClass(cat, row)}`}>{money(row.available)}</span>
        <span className="muted">Available</span>
      </div>
      <dl className="breakdown">
        <dt>Left over from last month</dt><dd>{money(row.carry)}</dd>
        <dt>Assigned this month</dt><dd>{money(row.assigned)}</dd>
        <dt>Activity</dt><dd>{money(row.activity)}</dd>
      </dl>

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

      <div className="inspector-section">
        <h3>Target</h3>
        {!cat.target ? (
          <button className="btn" onClick={() => patch({ target: { type: 'monthly', amount: 0 } })}>🎯 Create a target</button>
        ) : (
          <div className="target-edit">
            <label className="target-repeat">
              Repeats
              <select value={cat.target.type} onChange={(e) => changeTargetType(e.target.value)} aria-label="How often">
                {TARGET_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <div className="target-fields">
              <label>
                {saving ? 'Save' : 'Assign'}
                <AmountInput cents={cat.target.amount} onCommit={(amount) => patchTarget({ amount })} className="boxed" aria-label="Target amount" />
              </label>
              {cat.target.type === 'weekly' && (
                <label>
                  every
                  <select value={cat.target.weekday ?? 5} onChange={(e) => patchTarget({ weekday: Number(e.target.value) })} aria-label="Day of the week">
                    {WEEKDAYS.map((name, i) => <option key={name} value={i}>{name}</option>)}
                  </select>
                </label>
              )}
              {cat.target.type === 'biweekly' && (
                <label>
                  every other week from
                  <input type="date" value={cat.target.date || ''} onChange={(e) => e.target.value && patchTarget({ date: e.target.value })} aria-label="Starting on" />
                </label>
              )}
              {cat.target.type === 'monthly' && (
                <label>
                  by the
                  <select value={cat.dueDay ?? ''} onChange={(e) => patch({ dueDay: parseDay(e.target.value) })} aria-label="Due day each month">
                    <option value="">any day</option>
                    {DAY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              )}
              {(cat.target.type === 'yearly' || cat.target.type === 'byDate') && (
                <label>
                  {cat.target.type === 'yearly' ? 'every year by' : 'by'}
                  <input type="date" value={due || ''} onChange={(e) => e.target.value && patchTarget({ date: e.target.value })} aria-label="Have it by" />
                </label>
              )}
            </div>
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
                  {occurrences && ` ${occurrences} × ${money(cat.target.amount)} = ${money(row.needed)} this month.`}
                </p>
              </>
            )}
            <button className="link-btn danger" onClick={() => patch({ target: null })}>Remove target</button>
          </div>
        )}
      </div>

      <form className="inspector-section" onSubmit={moveMoney}>
        <h3>Move money</h3>
        <div className="move-money">
          <input inputMode="decimal" value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} placeholder="$ Amount" aria-label="Amount to move" />
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move to">
            <option value="">to…</option>
            {groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {categories.filter((c) => c.groupId === g.id && c.id !== cat.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({money(budget.rows[c.id].available)})</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button className="btn" type="submit" disabled={!parseMoney(moveAmount) || !moveTo}>Move</button>
        </div>
      </form>

      <button className="link-btn danger delete-cat" onClick={deleteCategory}>Delete category</button>
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

function Plan({ state, update, month, budget, balances, goToAccounts }) {
  const { budgetGroups: groups, budgetCategories: categories } = state;
  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [addingTo, setAddingTo] = useState(null);
  const [newCat, setNewCat] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const selected = categories.find((c) => c.id === selectedId);
  const assign = (id, amount) => update('budgetAssigned', (a) => setAssigned(a, id, month, amount));
  const uncat = budget.rows[UNCAT];
  const showUncat = uncat.activity || uncat.available;

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
            {groups.map((g) => {
              const cats = byFundDate(categories.filter((c) => c.groupId === g.id), month);
              const sum = (f) => cats.reduce((s, c) => s + budget.rows[c.id][f], 0);
              const isCollapsed = collapsed.has(g.id);
              return (
                <tbody key={g.id}>
                  <tr className="group-row">
                    <th>
                      <div className="group-name">
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
                  {!isCollapsed && cats.map((c) => {
                    const row = budget.rows[c.id];
                    const progress = targetProgress(c, row);
                    const due = row.underfunded ? targetDueDate(c, month) : null;
                    return (
                      <tr key={c.id} className={`cat-row ${c.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(c.id)}>
                        <th>
                          <button className="cat-name" onClick={() => setSelectedId(c.id)}>{c.name}</button>
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
                          <AmountInput cents={row.assigned} math onCommit={(v) => assign(c.id, v)} aria-label={`Assigned to ${c.name}`}
                            onFocusCapture={() => setSelectedId(c.id)} />
                        </td>
                        <td className="activity">{money(row.activity)}</td>
                        <td><span className={`avail-pill ${availableClass(c, row)}`}>{money(row.available)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
            {showUncat ? (
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
        <form onSubmit={addGroup} className="add-row">
          <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Add a category group…" />
          <button className="btn" type="submit">Add group</button>
        </form>
        <p className="hint">Tip: type <code>+50</code> or <code>-20</code> in Assigned to add to or take from what's there.</p>
      </div>

      {selected ? (
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
function rewrite(t, own, amount, category) {
  const base = { ...t, accountId: own, amount, transferAccountId: undefined, categoryId: undefined };
  return category.startsWith('xfer:') ? { ...base, transferAccountId: category.slice(5) } : { ...base, categoryId: category };
}

function TxnRow({ t, view, state, update, payeesId }) {
  const { budgetAccounts: accounts } = state;
  const p = perspective(t, view);
  const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? '—';
  const patch = (fields) => update('budgetTransactions', (ts) => ts.map((x) => (x.id === t.id ? { ...x, ...fields } : x)));
  const replace = (next) => update('budgetTransactions', (ts) => ts.map((x) => (x.id === t.id ? next : x)));
  const isUncat = !t.transferAccountId && t.categoryId !== RTA && !state.budgetCategories.some((c) => c.id === t.categoryId);

  return (
    <tr className={isUncat ? 'uncat' : ''}>
      <td><input type="date" className="plain" value={t.date} onChange={(e) => e.target.value && patch({ date: e.target.value })} aria-label="Date" /></td>
      {!view && (
        <td>
          <select className="plain" value={p.own} aria-label="Account"
            onChange={(e) => replace(rewrite(t, e.target.value, p.amount, p.category === `xfer:${e.target.value}` ? RTA : p.category))}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </td>
      )}
      <td><input className="plain" list={payeesId} value={t.payee} placeholder="Payee" onChange={(e) => patch({ payee: e.target.value })} aria-label="Payee" /></td>
      <td>
        <select className="plain" value={isUncat ? UNCAT : p.category} aria-label="Category" onChange={(e) => replace(rewrite(t, p.own, p.amount, e.target.value))}
          title={t.transferAccountId ? `Transfer between ${accountName(t.accountId)} and ${accountName(t.transferAccountId)}` : undefined}>
          <CategoryOptions groups={state.budgetGroups} categories={state.budgetCategories} accounts={accounts} ownAccountId={p.own} uncategorized={isUncat} />
        </select>
      </td>
      <td><input className="plain" value={t.memo || ''} placeholder="Memo" onChange={(e) => patch({ memo: e.target.value })} aria-label="Memo" /></td>
      <td><AmountInput cents={p.amount < 0 ? -p.amount : 0} blankZero onCommit={(v) => replace(rewrite(t, p.own, -v, p.category))} aria-label="Outflow" /></td>
      <td><AmountInput cents={p.amount > 0 ? p.amount : 0} blankZero className="inflow" onCommit={(v) => replace(rewrite(t, p.own, v, p.category))} aria-label="Inflow" /></td>
      <td>
        <button className="icon-btn subtle" aria-label="Delete transaction" title="Delete"
          onClick={() => update('budgetTransactions', (ts) => ts.filter((x) => x.id !== t.id))}>×</button>
      </td>
    </tr>
  );
}

function AddTransaction({ state, update, view, payeesId }) {
  const { budgetAccounts: accounts, budgetTransactions: txns, budgetCategories: categories } = state;
  const [date, setDate] = useState(todayKey);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [payee, setPayee] = useState('');
  const [category, setCategory] = useState(categories[0]?.id ?? RTA);
  const [memo, setMemo] = useState('');
  const [outflow, setOutflow] = useState('');
  const [inflow, setInflow] = useState('');
  const own = view || accountId;

  // Like YNAB, a payee you've used before fills in the category you used last time.
  function rememberCategory() {
    const name = payee.trim().toLowerCase();
    const last = name && [...txns].reverse().find((t) => t.payee.trim().toLowerCase() === name && (t.accountId === own || t.transferAccountId === own || !t.transferAccountId));
    if (last) setCategory(perspective(last, own).category);
  }

  function submit(e) {
    e.preventDefault();
    const out = parseMoney(outflow) ?? 0;
    const inn = parseMoney(inflow) ?? 0;
    const amount = Math.abs(inn) - Math.abs(out);
    if (!amount || !own || category === `xfer:${own}`) return;
    const t = { id: newId(), date, payee: payee.trim(), memo: memo.trim(), createdAt: Date.now() };
    update('budgetTransactions', (ts) => [...ts, rewrite(t, own, amount, category)]);
    setPayee('');
    setMemo('');
    setOutflow('');
    setInflow('');
  }

  return (
    <form className="add-txn" onSubmit={submit}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayKey())} aria-label="Date" />
      {!view && (
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <input className="payee" list={payeesId} value={payee} onChange={(e) => setPayee(e.target.value)} onBlur={rememberCategory} placeholder="Payee" aria-label="Payee" />
      <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
        <CategoryOptions groups={state.budgetGroups} categories={categories} accounts={accounts} ownAccountId={own} />
      </select>
      <input className="memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo" aria-label="Memo" />
      <input className="money-in" inputMode="decimal" value={outflow} onChange={(e) => { setOutflow(e.target.value); setInflow(''); }} placeholder="Outflow" aria-label="Outflow" />
      <input className="money-in" inputMode="decimal" value={inflow} onChange={(e) => { setInflow(e.target.value); setOutflow(''); }} placeholder="Inflow" aria-label="Inflow" />
      <button className="btn primary" type="submit">Add</button>
    </form>
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
  const payeesId = 'budget-payees';
  const account = accounts.find((a) => a.id === view);
  const total = accounts.reduce((s, a) => s + balances[a.id], 0);

  function addAccount(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const id = newId();
    const cents = Math.abs(parseMoney(start) ?? 0) * (type === 'credit' ? -1 : 1); // a card balance is money owed
    update('budgetAccounts', (as) => [...as, { id, name: name.trim(), type }]);
    if (cents) {
      update('budgetTransactions', (ts) => [
        ...ts,
        { id: newId(), date: todayKey(), accountId: id, payee: 'Starting Balance', categoryId: RTA, memo: '', amount: cents, createdAt: Date.now() },
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
    setView('');
  }

  const q = search.trim().toLowerCase();
  const catName = Object.fromEntries(state.budgetCategories.map((c) => [c.id, c.name]));
  const shown = txns
    .filter((t) => !view || t.accountId === view || t.transferAccountId === view)
    .filter((t) => !q || [t.payee, t.memo, catName[t.categoryId]].some((s) => s?.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const payees = [...new Set(txns.map((t) => t.payee.trim()).filter(Boolean))].sort();

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
              <p className="hint">The starting balance goes to Ready to Assign{type === 'credit' ? ' (as money you need to budget for)' : ''}.</p>
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
                  <button className="link-btn danger" onClick={deleteAccount}>Delete</button>
                </>
              ) : (
                <h2 className="title-input">All accounts</h2>
              )}
              <input className="search txn-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" aria-label="Search transactions" />
            </div>

            <datalist id={payeesId}>{payees.map((p) => <option key={p} value={p} />)}</datalist>
            <AddTransaction key={view} state={state} update={update} view={view} payeesId={payeesId} />

            {shown.length === 0 ? (
              <p className="empty">{q ? 'No matching transactions.' : 'No transactions yet.'}</p>
            ) : (
              <div className="table-scroll">
                <table className="register">
                  <thead>
                    <tr>
                      <th>Date</th>{!view && <th>Account</th>}<th>Payee</th><th>Category</th><th>Memo</th>
                      <th className="num">Outflow</th><th className="num">Inflow</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, limit).map((t) => <TxnRow key={t.id} t={t} view={view} state={state} update={update} payeesId={payeesId} />)}
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

  function assignUnderfunded() {
    update('budgetAssigned', (assigned) =>
      state.budgetCategories.reduce((a, c) => {
        const row = budget.rows[c.id];
        return row.underfunded ? setAssigned(a, c.id, month, row.assigned + row.underfunded) : a;
      }, assigned),
    );
  }

  return (
    <div className="budget">
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="segmented" role="group" aria-label="Budget section">
            {[['plan', 'Plan'], ['paychecks', 'Paychecks'], ['accounts', 'Accounts']].map(([id, label]) => (
              <button key={id} className={section === id ? 'active' : ''} aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>
            ))}
          </div>
          {section !== 'accounts' && <MonthNav monthStart={monthStart} setMonthStart={setMonthStart} />}
        </div>
        {section !== 'accounts' && (
          <div className="rta-wrap">
            {section === 'plan' && budget.underfunded > 0 && (
              <button className="btn" onClick={assignUnderfunded} title="Assign what every target needs this month">
                🎯 Fund targets ({money(budget.underfunded)})
              </button>
            )}
            <div className={`rta ${rta < 0 ? 'neg' : rta > 0 ? 'pos' : 'zero'}`}>
              <strong>{money(rta)}</strong>
              <span>{rta < 0 ? 'Assigned more than you have' : rta > 0 ? 'Ready to Assign' : 'All money assigned'}</span>
            </div>
          </div>
        )}
      </div>

      {section === 'plan' && (
        <Plan state={state} update={update} month={month} budget={budget} balances={balances} goToAccounts={() => setSection('accounts')} />
      )}
      {section === 'paychecks' && <Paychecks state={state} update={update} month={month} budget={budget} />}
      {section === 'accounts' && <Accounts state={state} update={update} balances={balances} />}
    </div>
  );
}
