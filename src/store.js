import { useCallback, useEffect, useRef, useState } from 'react';

const SAVE_DELAY_MS = 300;
const MERGE_MS = 1000; // changes to the same thing this close together undo as one
const MAX_HISTORY = 100;

export const newId = () => crypto.randomUUID();

function save(key, value, { keepalive = false } = {}) {
  return fetch(`/api/state/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    keepalive,
  }).then((res) => {
    if (!res.ok) throw new Error(`Save failed (${res.status})`);
  });
}

// Loads all app data from the local server and saves each collection (debounced) when it changes.
export function useStore() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const latest = useRef(null);
  const timers = useRef({});

  useEffect(() => {
    fetch('/api/state')
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load data (${res.status})`);
        return res.json();
      })
      .then((data) => {
        latest.current = data;
        setState(data);
      })
      .catch((err) => setError(`${err.message}. Is the server running? Try "npm run dev".`));
  }, []);

  // Flush pending saves if the tab is closed mid-debounce.
  useEffect(() => {
    const flush = () => {
      for (const [key, timer] of Object.entries(timers.current)) {
        clearTimeout(timer);
        save(key, latest.current[key], { keepalive: true }).catch(() => {});
      }
      timers.current = {};
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // Write new values for some collections, then save each one shortly after.
  const apply = useCallback((changes) => {
    latest.current = { ...latest.current, ...changes };
    setState(latest.current);
    for (const key of Object.keys(changes)) {
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => {
        delete timers.current[key];
        save(key, latest.current[key])
          .then(() => setError(null))
          .catch((err) => setError(`${err.message} — your last change may not be saved.`));
      }, SAVE_DELAY_MS);
    }
  }, []);

  // Undo history. Each step remembers what the collections it touched looked like before. Changes made together
  // (one click that updates several things) are one step, and quick repeated changes to the same thing (typing a
  // name) merge into one step too.
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const sameAction = useRef(false);
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const syncHistory = () => setHistorySize({ undo: undoStack.current.length, redo: redoStack.current.length });

  const update = useCallback((key, fn, { history = true } = {}) => {
    const before = latest.current[key];
    const value = fn(before);
    if (value === before) return;
    if (history) {
      const now = Date.now();
      const top = undoStack.current[undoStack.current.length - 1];
      const keys = top && Object.keys(top.before);
      const typing = top && keys.length === 1 && keys[0] === key && now - top.at < MERGE_MS;
      if (top && (sameAction.current || typing)) {
        if (!(key in top.before)) top.before[key] = before;
        top.at = now;
      } else {
        undoStack.current = [...undoStack.current.slice(-(MAX_HISTORY - 1)), { before: { [key]: before }, at: now }];
      }
      redoStack.current = [];
      sameAction.current = true;
      queueMicrotask(() => { sameAction.current = false; });
      syncHistory();
    }
    apply({ [key]: value });
  }, [apply]);

  // Move one step between the stacks, putting back what it remembers and keeping what's there now for the way back.
  const travel = useCallback((from, to) => {
    const step = from.current.pop();
    if (!step) return;
    const now = Object.fromEntries(Object.keys(step.before).map((k) => [k, latest.current[k]]));
    to.current.push({ before: now, at: 0 });
    apply(step.before);
    syncHistory();
  }, [apply]);
  const undo = useCallback(() => travel(undoStack, redoStack), [travel]);
  const redo = useCallback(() => travel(redoStack, undoStack), [travel]);

  // ⌘Z / Ctrl+Z undoes, ⇧⌘Z / Ctrl+Y redoes. While you're in the middle of typing in a box, the box's own undo
  // is left alone; once you've pressed Enter or just clicked into a box, ⌘Z undoes the app's last change.
  useEffect(() => {
    let typedIn = null;
    const onInput = (e) => { typedIn = e.target; };
    const onFocus = () => { typedIn = null; };
    const onKey = (e) => {
      if (e.key === 'Enter') typedIn = null;
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const el = document.activeElement;
      const typingInBox = el?.isContentEditable || el?.tagName === 'TEXTAREA'
        || (el?.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(el.type));
      if (typingInBox && typedIn === el) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo();
      else undo();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('input', onInput, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('focusin', onFocus);
    };
  }, [undo, redo]);

  return { state, update, error, undo, redo, canUndo: historySize.undo > 0, canRedo: historySize.redo > 0 };
}
