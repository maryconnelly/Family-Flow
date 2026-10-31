import { useId, useState } from 'react';
import { newId } from '../store.js';

const STATUSES = [
  ['idea', '💡 Idea'],
  ['bought', '🛍️ Bought'],
  ['wrapped', '🎁 Wrapped'],
  ['given', '✅ Given'],
];
const STATUS_ORDER = STATUSES.map(([id]) => id);

const priceOf = (gift) => Number(gift.price) || 0;
const isPurchased = (gift) => gift.status !== 'idea';
const money = (n) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });

function GiftItem({ gift, occasionsId, onPatch, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`gift-item status-${gift.status}`}>
      <select
        className={`gift-status status-${gift.status}`}
        value={gift.status}
        onChange={(e) => onPatch({ status: e.target.value })}
        aria-label="Status"
      >
        {STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <div className="gift-main">
        <input
          className="plain gift-idea"
          value={gift.idea}
          aria-label="Gift idea"
          title="Click to edit"
          onChange={(e) => onPatch({ idea: e.target.value })}
        />
        {(gift.occasion || gift.notes) && (
          <span className="gift-meta">
            {gift.occasion && <span className="gift-occasion">{gift.occasion}</span>}
            {gift.notes && <span className="muted">{gift.notes}</span>}
          </span>
        )}
      </div>
      <label className="gift-price">
        <span aria-hidden="true">$</span>
        <input
          className="plain"
          inputMode="decimal"
          value={gift.price ?? ''}
          placeholder="—"
          aria-label="Price"
          onChange={(e) => onPatch({ price: e.target.value.replace(/[^\d.]/g, '') })}
        />
      </label>
      {gift.link ? (
        <a className="recipe-link" href={gift.link} target="_blank" rel="noreferrer" title="Open link" aria-label={`Open link for ${gift.idea}`}>↗</a>
      ) : (
        <span className="link-spacer" />
      )}
      <button className="icon-btn subtle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Details" title="Details">▾</button>
      <button className="icon-btn subtle" onClick={onDelete} aria-label={`Delete ${gift.idea}`} title="Delete">×</button>
      {open && (
        <div className="gift-details">
          <label>
            Link
            <input type="url" value={gift.link || ''} placeholder="https://…" onChange={(e) => onPatch({ link: e.target.value.trim() })} />
          </label>
          <label>
            Occasion
            <input list={occasionsId} value={gift.occasion || ''} placeholder="e.g. Christmas 2026" onChange={(e) => onPatch({ occasion: e.target.value })} />
          </label>
          <label className="wide">
            Notes
            <input value={gift.notes || ''} placeholder="Size, color, where to buy…" onChange={(e) => onPatch({ notes: e.target.value })} />
          </label>
          <button type="button" className="btn primary" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
    </li>
  );
}

export default function Gifts({ state, update }) {
  const { giftPeople: people, gifts } = state;
  const [selectedId, setSelectedId] = useState(people[0]?.id ?? null);
  const [occasion, setOccasion] = useState(''); // '' shows every occasion
  const [newPerson, setNewPerson] = useState('');
  const [idea, setIdea] = useState('');
  const [price, setPrice] = useState('');
  const [newOccasion, setNewOccasion] = useState('');
  const occasionsId = useId();

  const person = people.find((p) => p.id === selectedId) ?? people[0];
  const occasions = [...new Set(gifts.map((g) => g.occasion?.trim()).filter(Boolean))].sort();
  const shown = gifts.filter((g) => !occasion || g.occasion?.trim() === occasion);
  const giftsFor = (id) => shown.filter((g) => g.personId === id);
  const spent = (list) => list.filter(isPurchased).reduce((sum, g) => sum + priceOf(g), 0);

  const patchGift = (id, p) => update('gifts', (gs) => gs.map((g) => (g.id === id ? { ...g, ...p } : g)));
  const patchPerson = (id, p) => update('giftPeople', (ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));

  function addPerson(e) {
    e.preventDefault();
    if (!newPerson.trim()) return;
    const id = newId();
    update('giftPeople', (ps) => [...ps, { id, name: newPerson.trim(), budget: '' }]);
    setSelectedId(id);
    setNewPerson('');
  }

  function deletePerson(target) {
    const count = gifts.filter((g) => g.personId === target.id).length;
    if (count && !window.confirm(`Remove ${target.name} and their ${count} gift idea(s)?`)) return;
    update('giftPeople', (ps) => ps.filter((p) => p.id !== target.id));
    update('gifts', (gs) => gs.filter((g) => g.personId !== target.id));
    setSelectedId(people.find((p) => p.id !== target.id)?.id ?? null);
  }

  function addGift(e) {
    e.preventDefault();
    if (!idea.trim() || !person) return;
    update('gifts', (gs) => [
      ...gs,
      {
        id: newId(),
        personId: person.id,
        idea: idea.trim(),
        price: price.replace(/[^\d.]/g, ''),
        occasion: (newOccasion || occasion).trim(),
        status: 'idea',
        link: '',
        notes: '',
        createdAt: Date.now(),
      },
    ]);
    setIdea('');
    setPrice('');
  }

  const personGifts = person
    ? giftsFor(person.id).sort(
        (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.createdAt - b.createdAt,
      )
    : [];
  const budget = Number(person?.budget) || 0;
  const personSpent = spent(personGifts);
  const totalSpent = spent(shown);

  return (
    <section className="split">
      <datalist id={occasionsId}>
        {occasions.map((o) => <option key={o} value={o} />)}
      </datalist>

      <aside className="panel side">
        <h2>Gifts for</h2>
        {occasions.length > 0 && (
          <select value={occasion} onChange={(e) => setOccasion(e.target.value)} aria-label="Occasion">
            <option value="">All occasions</option>
            {occasions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <ul className="nav-list">
          {people.map((p) => {
            const list = giftsFor(p.id);
            const bought = list.filter(isPurchased).length;
            return (
              <li key={p.id}>
                <button className={p.id === person?.id ? 'active' : ''} onClick={() => setSelectedId(p.id)}>
                  <span>{p.name}</span>
                  {list.length > 0 && <span className="count" title={`${bought} of ${list.length} bought`}>{bought}/{list.length}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <form onSubmit={addPerson} className="inline-form">
          <input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} placeholder="Add a person…" />
        </form>
        {totalSpent > 0 && (
          <p className="hint">Spent{occasion ? ` for ${occasion}` : ''}: <strong>{money(totalSpent)}</strong></p>
        )}
      </aside>

      <div className="panel main">
        {!person ? (
          <p className="empty">Add the people you shop for on the left, then jot down gift ideas as they come to you.</p>
        ) : (
          <>
            <div className="panel-head">
              <input
                className="plain title-input"
                value={person.name}
                aria-label="Name"
                onChange={(e) => patchPerson(person.id, { name: e.target.value })}
              />
              <button className="link-btn danger" onClick={() => deletePerson(person)}>Remove</button>
            </div>

            <div className="gift-budget">
              <label>
                Budget $
                <input
                  className="budget-input"
                  inputMode="decimal"
                  value={person.budget || ''}
                  placeholder="—"
                  onChange={(e) => patchPerson(person.id, { budget: e.target.value.replace(/[^\d.]/g, '') })}
                />
              </label>
              <span className={budget && personSpent > budget ? 'over-budget' : 'muted'}>
                {money(personSpent)} spent{budget ? ` of ${money(budget)}` : ''}
                {budget > 0 && personSpent > budget && ' — over budget'}
              </span>
              {budget > 0 && (
                <span className="budget-bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (personSpent / budget) * 100)}%` }} />
                </span>
              )}
            </div>

            <form onSubmit={addGift} className="add-row gift-add">
              <input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={`Gift idea for ${person.name}…`} />
              <input className="qty" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$ Price" aria-label="Price" />
              <input
                className="occasion-input"
                list={occasionsId}
                value={newOccasion}
                onChange={(e) => setNewOccasion(e.target.value)}
                placeholder={occasion || 'Occasion'}
                aria-label="Occasion"
              />
              <button className="btn primary" type="submit">Add</button>
            </form>

            {personGifts.length === 0 ? (
              <p className="empty">No gift ideas{occasion ? ` for ${occasion}` : ''} yet.</p>
            ) : (
              <ul className="gift-list">
                {personGifts.map((g) => (
                  <GiftItem
                    key={g.id}
                    gift={g}
                    occasionsId={occasionsId}
                    onPatch={(p) => patchGift(g.id, p)}
                    onDelete={() => update('gifts', (gs) => gs.filter((x) => x.id !== g.id))}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
