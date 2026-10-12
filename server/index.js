import express from 'express';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'familyflow.json');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3001;

// Each key is a top-level array the client reads and replaces as a whole.
const KEYS = ['lists', 'todos', 'recipes', 'meals', 'groceries'];

function defaultState() {
  return {
    lists: [{ id: 'inbox', name: 'Inbox' }],
    todos: [],
    recipes: [],
    meals: [],
    groceries: [],
  };
}

async function load() {
  try {
    return { ...defaultState(), ...JSON.parse(await fs.readFile(DATA_FILE, 'utf8')) };
  } catch (err) {
    if (err.code === 'ENOENT') return defaultState();
    throw err;
  }
}

let state = await load();

// Serialize writes and replace the file atomically so a crash can't leave half-written JSON.
let writeQueue = Promise.resolve();
function persist() {
  const write = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2));
    await fs.rename(tmp, DATA_FILE);
  });
  writeQueue = write.catch(() => {});
  return write;
}

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/api/state', (_req, res) => res.json(state));

app.put('/api/state/:key', async (req, res) => {
  const { key } = req.params;
  if (!KEYS.includes(key)) return res.status(404).json({ error: `Unknown key "${key}"` });
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Body must be an array' });
  state = { ...state, [key]: req.body };
  try {
    await persist();
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to save data:', err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

if (process.env.NODE_ENV === 'production' && existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

// Bind to localhost only: this is a personal app and the data never leaves your machine.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`FamilyFlow API listening on http://localhost:${PORT} (data: ${DATA_FILE})`);
});
