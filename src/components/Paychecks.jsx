import { AmountInput } from './common.jsx';
import { DAY_OPTIONS, LAST, dayNumber, money, parseDay, setAssigned } from '../budget.js';

const payDayNumber = (p) => dayNumber(p.day);

// A bill due on `dueDay` is paid from the latest paycheck on or before that day;
// bills due before the first payday come from the previous month's last paycheck.
export function paycheckFor(dueDay, paychecks) {
  const byDay = [...paychecks].sort((a, b) => payDayNumber(a) - payDayNumber(b));
  return [...byDay].reverse().find((p) => payDayNumber(p) <= dayNumber(dueDay)) ?? byDay[byDay.length - 1];
}

function BillRow({ cat, row, paychecks, onPatch, onSetAmount }) {
  const others = paychecks.filter((p) => p.id !== cat.paycheckId);
  const fixed = cat.target && cat.target.type !== 'monthly'; // weekly, yearly, etc. are edited on the Plan page
  return (
    <li className="bill">
      <span className="bill-name">{cat.name}</span>
      <label className="bill-due" title="Day of the month it's due">
        due
        <select value={cat.dueDay ?? ''} aria-label={`${cat.name} due day`} onChange={(e) => onPatch({ dueDay: parseDay(e.target.value) })}>
          <option value="">—</option>
          {DAY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{value === LAST ? 'Last day' : label}</option>)}
        </select>
      </label>
      {fixed ? (
        <span className="bill-amount muted" title="This month's share of the category's target. Change it on the Plan page.">{money(row.needed)}</span>
      ) : (
        <AmountInput cents={cat.target?.amount ?? 0} onCommit={onSetAmount} className="bill-amount" aria-label={`${cat.name} amount`} />
      )}
      <span className={`bill-status ${row.underfunded ? '' : 'funded'}`} title={row.underfunded ? `${money(row.underfunded)} still to assign this month` : 'Assigned this month'}>
        {row.needed > 0 && (row.underfunded ? '○' : '✓')}
      </span>
      <div className="bill-move">
        {others.map((p) => (
          <button key={p.id} className="link-btn" onClick={() => onPatch({ paycheckId: p.id })} title={`Pay from ${p.name}`}>→ {p.name}</button>
        ))}
        {cat.paycheckId && (
          <button className="icon-btn subtle" onClick={() => onPatch({ paycheckId: null })} aria-label={`Take ${cat.name} off this paycheck`} title="Take off this paycheck">×</button>
        )}
      </div>
    </li>
  );
}

export default function Paychecks({ state, update, month, budget }) {
  const { budgetPaychecks: paychecks, budgetCategories: categories, budgetGroups: groups } = state;
  const patchCat = (id, p) => update('budgetCategories', (cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const patchPay = (id, p) => update('budgetPaychecks', (ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const setAmount = (cat, amount) => patchCat(cat.id, { target: amount ? { ...cat.target, type: 'monthly', amount } : null });
  const ordered = groups.flatMap((g) => categories.filter((c) => c.groupId === g.id));
  const billsFor = (payId) =>
    ordered.filter((c) => c.paycheckId === payId).sort((a, b) => (dayNumber(a.dueDay) ?? 99) - (dayNumber(b.dueDay) ?? 99));

  // Unsplit categories worth showing: ones with a due day or a target. Others can be added from the menu.
  const unsplit = ordered.filter((c) => !paychecks.some((p) => p.id === c.paycheckId));
  const suggested = unsplit.filter((c) => c.dueDay || c.target?.amount);
  const autoSplittable = unsplit.filter((c) => c.dueDay);

  function autoSplit() {
    update('budgetCategories', (cs) =>
      cs.map((c) => (autoSplittable.includes(c) ? { ...c, paycheckId: paycheckFor(c.dueDay, paychecks).id } : c)),
    );
  }

  function fund(bills) {
    update('budgetAssigned', (assigned) =>
      bills.reduce((a, c) => {
        const row = budget.rows[c.id];
        return row.underfunded ? setAssigned(a, c.id, month, row.assigned + row.underfunded) : a;
      }, assigned),
    );
  }

  return (
    <div className="paychecks">
      <p className="hint">
        Set each paycheck's payday and take-home pay, give each bill a due day and amount, and choose which check pays it.
        The amount is the category's monthly target, so it shows up in the Plan view too.
      </p>

      <div className="paycheck-grid">
        {paychecks.map((p, i) => {
          const bills = billsFor(p.id);
          const total = bills.reduce((s, c) => s + budget.rows[c.id].needed, 0);
          const toFund = bills.reduce((s, c) => s + budget.rows[c.id].underfunded, 0);
          const left = p.amount - total;
          return (
            <section key={p.id} className={`panel paycheck pay-${i}`}>
              <div className="panel-head">
                <input className="plain title-input" value={p.name} aria-label="Paycheck name" onChange={(e) => patchPay(p.id, { name: e.target.value })} />
              </div>
              <div className="paycheck-fields">
                <label>
                  Payday
                  <select value={String(p.day)} aria-label={`${p.name} payday`}
                    onChange={(e) => patchPay(p.id, { day: parseDay(e.target.value) })}>
                    {DAY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Take-home
                  <AmountInput cents={p.amount} onCommit={(amount) => patchPay(p.id, { amount })} className="boxed" aria-label={`${p.name} take-home pay`} />
                </label>
              </div>

              {bills.length === 0 ? (
                <p className="empty">No bills on this paycheck yet.</p>
              ) : (
                <ul className="bill-list">
                  {bills.map((c) => (
                    <BillRow key={c.id} cat={c} row={budget.rows[c.id]} paychecks={paychecks}
                      onPatch={(patch) => patchCat(c.id, patch)} onSetAmount={(amount) => setAmount(c, amount)} />
                  ))}
                </ul>
              )}

              <select className="add-bill" value="" aria-label={`Add a bill to ${p.name}`} onChange={(e) => e.target.value && patchCat(e.target.value, { paycheckId: p.id })}>
                <option value="">+ Add a bill…</option>
                {groups.map((g) => {
                  const options = categories.filter((c) => c.groupId === g.id && c.paycheckId !== p.id);
                  return options.length > 0 && (
                    <optgroup key={g.id} label={g.name}>
                      {options.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.paycheckId ? ` (move from ${paychecks.find((x) => x.id === c.paycheckId)?.name})` : ''}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>

              <dl className="breakdown paycheck-totals">
                <dt>Take-home</dt><dd>{money(p.amount)}</dd>
                <dt>Bills</dt><dd>−{money(total)}</dd>
                <dt><strong>{left < 0 ? 'Short by' : 'Left for everything else'}</strong></dt>
                <dd><strong className={left < 0 ? 'negative' : 'left-over'}>{money(Math.abs(left))}</strong></dd>
              </dl>
              {toFund > 0 && (
                <button className="btn primary" onClick={() => fund(bills)} title="Assign each bill's amount in this month's plan">
                  💸 Got paid — fund these bills ({money(toFund)})
                </button>
              )}
              {total > 0 && toFund === 0 && <p className="hint funded">✓ Every bill on this check is funded this month.</p>}
            </section>
          );
        })}
      </div>

      {suggested.length > 0 && (
        <section className="panel unsplit">
          <div className="panel-head">
            <h2>Not on a paycheck yet</h2>
            {autoSplittable.length > 0 && (
              <button className="btn" onClick={autoSplit} title="Each bill goes to the latest paycheck on or before its due day">
                ✨ Split {autoSplittable.length} by due date
              </button>
            )}
          </div>
          <ul className="bill-list">
            {suggested.map((c) => (
              <BillRow key={c.id} cat={c} row={budget.rows[c.id]} paychecks={paychecks}
                onPatch={(patch) => patchCat(c.id, patch)} onSetAmount={(amount) => setAmount(c, amount)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
