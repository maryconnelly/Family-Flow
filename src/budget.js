// Envelope budgeting math, YNAB-style. All amounts are integer cents; months are "YYYY-MM" keys.
//
// Each category's Available = last month's leftover (never below zero) + Assigned + Activity.
// Overspending in a month isn't carried in the category; it comes out of the next month's Ready to Assign.

import { addDays, fromKey, toKey, todayKey } from './dates.js';

export const RTA = 'rta'; // transactions categorized as income go to Ready to Assign
export const UNCAT = ''; // spending whose category was deleted
export const SPLIT = 'split'; // a transaction divided between categories; its lines are in `splits`

// The pieces a transaction counts as in the budget: itself, or one piece per split line. If the lines don't add
// up to the transaction, the difference counts as uncategorized so account balances and the budget still agree.
export function txnParts(t) {
  if (!t.splits?.length) return [t];
  const parts = t.splits.map((s) => ({ ...t, categoryId: s.categoryId, amount: s.amount, splits: undefined }));
  const rest = t.amount - t.splits.reduce((sum, s) => sum + s.amount, 0);
  if (rest) parts.push({ ...t, categoryId: UNCAT, amount: rest, splits: undefined });
  return parts;
}

export const splitRemainder = (t) => t.amount - (t.splits || []).reduce((sum, s) => sum + s.amount, 0);

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

// The next time a yearly date falls on or after the start of `month`. The saved date is the first time it's due,
// so a date still ahead (say, next year's registration) is used as is; once it's past, it repeats on the same month and day.
export function nextYearly(date, month) {
  if (monthOf(date) >= month) return date;
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
  // Regular targets count what came over from last month plus what's assigned now, against this month's full amount.
  const [funded, goal] = isSavingsTarget(target) ? [row.available, target.amount] : [row.carry + row.assigned, row.goal];
  return goal ? Math.max(0, Math.min(1, funded / goal)) : 1;
}

// Each credit card has a payment category with this id. A card's starting balance is categorized to it,
// which marks it as existing debt rather than spending.
export const paymentId = (accountId) => `cc:${accountId}`;
export const isPaymentId = (id) => typeof id === 'string' && id.startsWith('cc:');

// Budget figures for `month`: one row per category plus Ready to Assign and month totals.
//
// Credit cards work like YNAB: spending on a card from a category that has money moves that money into
// the card's payment category. Spending more than the category has is credit overspending; it becomes
// card debt and resets next month without touching Ready to Assign. Payments and other money flowing
// into or out of a card come out of (or go into) its payment category.
export function computeBudget(state, month) {
  const { budgetCategories: categories, budgetAssigned: assigned, budgetTransactions: txns } = state;
  const cards = (state.budgetAccounts || []).filter((a) => a.type === 'credit');
  const isCard = new Set(cards.map((a) => a.id));
  const key = (cat, m) => `${cat}|${m}`;
  const catIds = new Set(categories.map((c) => c.id));
  const resolve = (id) => (catIds.has(id) ? id : UNCAT);
  const spending = new Map(); // key(cat, m) -> that month's cash and card transactions, in order
  const paymentActivity = new Map(); // key(paymentId, m) -> payments and other card money, as the payment category sees it
  const activity = new Map(); // total activity per category, for "last month" figures
  const assignedIn = new Map();
  const incomeByMonth = new Map();
  const owedThrough = new Map(); // key(cardId, m) -> change in what's owed that month
  const months = new Set([month]);
  const add = (map, k, v) => map.set(k, (map.get(k) || 0) + v);

  for (const txn of txns) {
    const m = monthOf(txn.date);
    months.add(m);
    if (txn.transferAccountId) {
      const t = txn;
      // Moving money between accounts is budget-neutral, except that a card's side of it changes its payment category.
      for (const [acct, amount] of [[t.accountId, t.amount], [t.transferAccountId, -t.amount]]) {
        if (!isCard.has(acct)) continue;
        add(paymentActivity, key(paymentId(acct), m), -amount);
        add(owedThrough, key(acct, m), -amount);
      }
      continue;
    }
    for (const t of txnParts(txn)) {
      if (isCard.has(t.accountId)) {
        add(owedThrough, key(t.accountId, m), -t.amount);
        if (t.categoryId === paymentId(t.accountId)) continue; // starting debt
        if (t.categoryId === RTA) {
          add(incomeByMonth, m, t.amount);
          add(paymentActivity, key(paymentId(t.accountId), m), -t.amount);
          continue;
        }
      } else if (t.categoryId === RTA) {
        add(incomeByMonth, m, t.amount);
        continue;
      }
      const k = key(resolve(t.categoryId), m);
      if (!spending.has(k)) spending.set(k, []);
      spending.get(k).push({ ...t, card: isCard.has(t.accountId) ? t.accountId : null });
      add(activity, k, t.amount);
    }
  }

  const payIds = cards.map((a) => paymentId(a.id));
  const assignable = new Set([...catIds, ...payIds]);
  const liveAssigned = assigned.filter((a) => assignable.has(a.categoryId) && a.amount);
  for (const a of liveAssigned) {
    months.add(a.month);
    add(assignedIn, key(a.categoryId, a.month), a.amount);
  }

  const spendIds = [...catIds, UNCAT];
  const ids = [...spendIds, ...payIds];
  const carry = Object.fromEntries(ids.map((id) => [id, 0]));
  const owed = Object.fromEntries(cards.map((a) => [a.id, 0]));
  const rows = {};
  let overspentBefore = 0;
  let overspentLastMonth = 0;
  let income = 0;
  for (let m = [...months].sort()[0]; m <= month; m = shiftMonth(m, 1)) {
    income += incomeByMonth.get(m) || 0;
    const fundedIn = Object.fromEntries(cards.map((a) => [a.id, 0]));
    const monthRows = {};

    for (const id of spendIds) {
      const assignedNow = assignedIn.get(key(id, m)) || 0;
      const txnsNow = (spending.get(key(id, m)) || []).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
      // Walk the month in date order: a card purchase is covered by whatever the category has at that point.
      let running = carry[id] + assignedNow;
      const spentOn = new Map(); // card -> net spending (refunds reduce it)
      const unfunded = new Map(); // card -> purchases the category couldn't cover when they happened
      for (const t of txnsNow) {
        if (t.card) {
          if (t.amount < 0) add(unfunded, t.card, -t.amount - Math.min(-t.amount, Math.max(0, running)));
          add(spentOn, t.card, -t.amount);
        }
        running += t.amount;
      }
      const available = running;
      // If the category ends the month covered (say, after assigning more), all its card spending counts as covered.
      const unfundedTotal = [...unfunded.values()].reduce((s, v) => s + v, 0);
      const creditOverspent = Math.min(unfundedTotal, Math.max(0, -available));
      let toUnfund = creditOverspent;
      [...spentOn].forEach(([card, spent], i, all) => {
        const share = i === all.length - 1 ? toUnfund : Math.round((creditOverspent * (unfunded.get(card) || 0)) / (unfundedTotal || 1));
        fundedIn[card] += spent - share;
        toUnfund -= share;
      });
      monthRows[id] = { carry: carry[id], assigned: assignedNow, activity: available - carry[id] - assignedNow, available, creditOverspent };
    }

    for (const card of cards) {
      const id = paymentId(card.id);
      owed[card.id] += owedThrough.get(key(card.id, m)) || 0;
      const payments = paymentActivity.get(key(id, m)) || 0;
      const row = { carry: carry[id], assigned: assignedIn.get(key(id, m)) || 0, payments, funded: fundedIn[card.id], creditOverspent: 0 };
      row.activity = payments + row.funded;
      row.available = row.carry + row.assigned + row.activity;
      row.owed = owed[card.id];
      monthRows[id] = row;
    }

    for (const id of ids) {
      const row = monthRows[id];
      if (m === month) {
        rows[id] = row;
      } else {
        // Only cash overspending comes out of Ready to Assign; credit overspending is already card debt.
        const cashOverspent = Math.max(0, -row.available - row.creditOverspent);
        overspentBefore += cashOverspent;
        if (m === shiftMonth(month, -1)) overspentLastMonth += cashOverspent;
        carry[id] = Math.max(0, row.available);
      }
    }
  }

  for (const cat of categories) {
    const row = rows[cat.id];
    // goal: what the target is for this month. needed: what has to be assigned this month to reach it. Savings
    // targets already spread what's missing after the leftover; regular ones count the leftover toward the goal.
    row.goal = targetNeed(cat.target, month, row.carry);
    row.needed = isSavingsTarget(cat.target) ? row.goal : Math.max(0, row.goal - row.carry);
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
    lastMonth: (id) => ({
      assigned: assignedIn.get(key(id, prev)) || 0,
      activity: isPaymentId(id) ? paymentActivity.get(key(id, prev)) || 0 : activity.get(key(id, prev)) || 0,
    }),
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

// Repeating transactions. Each schedule keeps a template transaction and the next date it comes due;
// when that date arrives the transaction is entered as pending until it's marked cleared.
export const REPEAT_OPTIONS = [
  ['', "Doesn't repeat"],
  ['weekly', 'Every week'],
  ['biweekly', 'Every 2 weeks'],
  ['monthly', 'Every month'],
  ['yearly', 'Every year'],
];

// The occurrence after `date`. Monthly and yearly keep the start date's day, moved earlier in shorter months.
export function nextOccurrence(rec, date) {
  const [y, m] = date.split('-').map(Number);
  const [, startMonth, startDay] = rec.startDate.split('-').map(Number);
  switch (rec.frequency) {
    case 'weekly':
      return toKey(addDays(fromKey(date), 7));
    case 'biweekly':
      return toKey(addDays(fromKey(date), 14));
    case 'yearly':
      return dateKey(y + 1, startMonth, startDay);
    default:
      return dateKey(m === 12 ? y + 1 : y, (m % 12) + 1, startDay);
  }
}

// The first occurrence after the start date that falls on or after `from`.
export function firstOccurrenceFrom(rec, from) {
  let date = nextOccurrence(rec, rec.startDate);
  while (date < from) date = nextOccurrence(rec, date);
  return date;
}

// Pending transactions for every occurrence due through `today`, and the schedules moved past them.
export function enterDueRecurring(recurring, makeId, today = todayKey()) {
  const entered = [];
  const next = recurring.map((rec) => {
    let date = rec.nextDate;
    while (date <= today) {
      entered.push({ ...rec.template, id: makeId(), date, pending: true, recurringId: rec.id, createdAt: Date.now() });
      date = nextOccurrence(rec, date);
    }
    return date === rec.nextDate ? rec : { ...rec, nextDate: date };
  });
  return { entered, recurring: next };
}
