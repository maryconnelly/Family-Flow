// Envelope budgeting math, YNAB-style. All amounts are integer cents; months are "YYYY-MM" keys.
//
// Each category's Available = last month's leftover (never below zero) + Assigned + Activity.
// Overspending in a month isn't carried in the category; it comes out of the next month's Ready to Assign.

import { fromKey, todayKey } from './dates.js';

export const RTA = 'rta'; // transactions categorized as income go to Ready to Assign
export const UNCAT = ''; // spending whose category was deleted

export const monthOf = (dateKey) => dateKey.slice(0, 7);

export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthsBetween(from, to) {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

// Due days and paydays are 1–31 or 'last' (the last day of the month, whatever its length).
export const LAST = 'last';
export const ordinal = (n) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${s}`;
};
export const DAY_OPTIONS = [...Array.from({ length: 31 }, (_, i) => [String(i + 1), ordinal(i + 1)]), [LAST, 'Last day of the month']];
export const dayNumber = (day) => (day === LAST ? 31 : day);
export const parseDay = (value) => (value === '' ? null : value === LAST ? LAST : Number(value));

const daysIn = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const lastDayOf = (month) => `${month}-${String(daysIn(month)).padStart(2, '0')}`;

export const TARGET_TYPES = [
  ['weekly', 'Weekly'],
  ['biweekly', 'Every 2 weeks'],
  ['monthly', 'Monthly'],
  ['yearly', 'Yearly'],
  ['byDate', 'Once, by a date'],
];
// Targets that save up toward a lump sum (measured by Available) rather than a regular amount assigned each month.
export const isSavingsTarget = (target) => target?.type === 'byDate' || target?.type === 'yearly';

const dateKey = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, daysIn(`${y}-${String(m).padStart(2, '0')}`))).padStart(2, '0')}`;
const monthDays = (month) => Array.from({ length: daysIn(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
const DAY_MS = 86400000;

// Dates in `month` that a weekly or every-2-weeks target comes due.
export function targetOccurrences(target, month) {
  if (target.type === 'weekly') return monthDays(month).filter((k) => fromKey(k).getDay() === (target.weekday ?? 5));
  if (target.type === 'biweekly' && target.date) {
    const anchor = fromKey(target.date);
    return monthDays(month).filter((k) => {
      const diff = Math.round((fromKey(k) - anchor) / DAY_MS); // rounding absorbs daylight-saving hours
      return ((diff % 14) + 14) % 14 === 0;
    });
  }
  return [];
}

// The next time a yearly date (only its month and day count) falls on or after the start of `month`.
export function nextYearly(date, month) {
  const [, mm, dd] = date.split('-').map(Number);
  const year = Number(month.slice(0, 4));
  const occ = dateKey(year, mm, dd);
  return monthOf(occ) < month ? dateKey(year + 1, mm, dd) : occ;
}

// The date a category's target should be funded by, seen from `month`; null if it has no date.
// Monthly targets use the category's due day; save-by-date targets saved before days existed mean the end of that month.
export function targetDueDate(cat, month) {
  const t = cat.target;
  if (!t?.amount) return null;
  switch (t.type) {
    case 'byDate':
      return t.date?.length === 7 ? lastDayOf(t.date) : t.date || null;
    case 'yearly':
      return t.date ? nextYearly(t.date, month) : null;
    case 'weekly':
    case 'biweekly': {
      // This month: the next one still coming. Other months: the first.
      const occ = targetOccurrences(t, month);
      const today = todayKey();
      return monthOf(today) === month ? occ.find((k) => k >= today) ?? occ[occ.length - 1] ?? null : occ[0] ?? null;
    }
    default:
      if (cat.dueDay == null) return null;
      return `${month}-${String(Math.min(dayNumber(cat.dueDay), daysIn(month))).padStart(2, '0')}`;
  }
}

export function fmtDue(key) {
  const d = fromKey(key);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export const isPastDue = (key) => Boolean(key) && key < todayKey();

export const money = (cents) =>
  (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

// "1,234.50" or "$12" → cents; null if it isn't a number.
export function parseMoney(text) {
  const cleaned = String(text).replace(/[$,\s]/g, '');
  if (!cleaned || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

// What a category's target asks for this month, given what was left over coming into it.
function targetNeed(target, month, carry) {
  if (!target?.amount) return 0;
  // Saving toward a date: spread what's still missing over the months left, including the due month.
  const spread = (due) => Math.ceil(Math.max(0, target.amount - carry) / Math.max(1, monthsBetween(month, monthOf(due)) + 1));
  switch (target.type) {
    case 'weekly':
    case 'biweekly':
      return target.amount * targetOccurrences(target, month).length;
    case 'yearly':
      return target.date ? spread(nextYearly(target.date, month)) : target.amount;
    case 'byDate':
      return target.date ? spread(target.date) : target.amount;
    default:
      return target.amount;
  }
}

export function targetProgress(cat, row) {
  const { target } = cat;
  if (!target?.amount) return null;
  const [funded, goal] = isSavingsTarget(target) ? [row.available, target.amount] : [row.assigned, row.needed];
  return goal ? Math.max(0, Math.min(1, funded / goal)) : 1;
}

// Budget figures for `month`: one row per category plus Ready to Assign and month totals.
export function computeBudget({ budgetCategories: categories, budgetAssigned: assigned, budgetTransactions: txns }, month) {
  const key = (cat, m) => `${cat}|${m}`;
  const activity = new Map();
  const assignedIn = new Map();
  const incomeByMonth = new Map();
  const months = new Set([month]);
  const add = (map, k, v) => map.set(k, (map.get(k) || 0) + v);

  for (const t of txns) {
    if (t.transferAccountId) continue; // moving money between accounts doesn't touch the budget
    const m = monthOf(t.date);
    months.add(m);
    if (t.categoryId === RTA) add(incomeByMonth, m, t.amount);
    else add(activity, key(categories.some((c) => c.id === t.categoryId) ? t.categoryId : UNCAT, m), t.amount);
  }
  const catIds = new Set(categories.map((c) => c.id));
  const liveAssigned = assigned.filter((a) => catIds.has(a.categoryId) && a.amount);
  for (const a of liveAssigned) {
    months.add(a.month);
    add(assignedIn, key(a.categoryId, a.month), a.amount);
  }

  const ids = [...catIds, UNCAT];
  const carry = Object.fromEntries(ids.map((id) => [id, 0]));
  const rows = {};
  let overspentBefore = 0;
  let overspentLastMonth = 0;
  let income = 0;
  for (let m = [...months].sort()[0]; m <= month; m = shiftMonth(m, 1)) {
    income += incomeByMonth.get(m) || 0;
    for (const id of ids) {
      const row = { carry: carry[id], assigned: assignedIn.get(key(id, m)) || 0, activity: activity.get(key(id, m)) || 0 };
      row.available = row.carry + row.assigned + row.activity;
      if (m === month) {
        rows[id] = row;
      } else {
        if (row.available < 0) {
          overspentBefore -= row.available;
          if (m === shiftMonth(month, -1)) overspentLastMonth -= row.available;
        }
        carry[id] = Math.max(0, row.available);
      }
    }
  }

  for (const cat of categories) {
    const row = rows[cat.id];
    row.needed = targetNeed(cat.target, month, row.carry);
    row.underfunded = Math.max(0, row.needed - row.assigned);
  }

  const totalAssigned = liveAssigned.reduce((sum, a) => sum + a.amount, 0); // future months count too
  const sum = (field) => ids.reduce((s, id) => s + rows[id][field], 0);
  const prev = shiftMonth(month, -1);
  return {
    rows,
    readyToAssign: income - totalAssigned - overspentBefore,
    income: incomeByMonth.get(month) || 0,
    overspentLastMonth,
    totals: { carry: sum('carry'), assigned: sum('assigned'), activity: sum('activity'), available: sum('available') },
    underfunded: categories.reduce((s, c) => s + rows[c.id].underfunded, 0),
    lastMonth: (id) => ({ assigned: assignedIn.get(key(id, prev)) || 0, activity: activity.get(key(id, prev)) || 0 }),
  };
}

// Current balance of every account, transfers included.
export function accountBalances(accounts, txns) {
  const bal = Object.fromEntries(accounts.map((a) => [a.id, 0]));
  for (const t of txns) {
    if (t.accountId in bal) bal[t.accountId] += t.amount;
    if (t.transferAccountId in bal) bal[t.transferAccountId] -= t.amount;
  }
  return bal;
}

// Set (not add to) the amount assigned to a category in a month.
export function setAssigned(assigned, categoryId, month, amount) {
  const rest = assigned.filter((a) => !(a.categoryId === categoryId && a.month === month));
  return amount ? [...rest, { categoryId, month, amount }] : rest;
}
