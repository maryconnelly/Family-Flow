// Reads a recipe from a web page using the schema.org "Recipe" data most recipe sites embed for search engines.

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;

export class ImportError extends Error {}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

// Strips tags and entities (some sites put HTML inside JSON-LD strings).
function clean(text) {
  return decodeEntities(decodeEntities(String(text).replace(/<[^>]*>/g, ' ')))
    .replace(/\s+/g, ' ')
    .trim();
}

// Removes site clutter from ingredient lines, e.g. "1 tsp thyme ($0.10)" or "chili powder*".
function tidyIngredient(line) {
  return line
    .replace(/\s*\(\s*\$[\d.,]+\s*\)/g, '')
    .replace(/\(\s*-\s*/g, '(')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRecipe(node) {
  const type = node?.['@type'];
  return Array.isArray(type) ? type.includes('Recipe') : type === 'Recipe';
}

// JSON-LD can be a single object, an array, or nested under @graph.
function findRecipe(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item);
      if (found) return found;
    }
    return null;
  }
  if (isRecipe(node)) return node;
  return findRecipe(node['@graph']) || findRecipe(node.mainEntity);
}

function extractRecipe(html) {
  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of scripts) {
    let data;
    try {
      data = JSON.parse(body.trim());
    } catch {
      continue; // Some sites ship malformed JSON-LD; try the next block.
    }
    const recipe = findRecipe(data);
    if (recipe) return recipe;
  }
  return null;
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      // An honest user agent: sites' bot protection blocks requests that claim to be Chrome but aren't.
      headers: { 'User-Agent': 'FamilyFlow/0.1 (personal recipe import)' },
    });
    if (res.status === 401 || res.status === 403) {
      throw new ImportError("That site blocked the request (it may need a login or block automated access). You'll need to add the ingredients by hand.");
    }
    if (!res.ok) throw new ImportError(`The page couldn't be loaded (error ${res.status}).`);
    const length = Number(res.headers.get('content-length'));
    if (length > MAX_BYTES) throw new ImportError('That page is too large to read.');
    const html = await res.text();
    return html.length > MAX_BYTES ? html.slice(0, MAX_BYTES) : html;
  } catch (err) {
    if (err instanceof ImportError) throw err;
    if (err.name === 'AbortError') throw new ImportError('The page took too long to load.');
    throw new ImportError("Couldn't reach that page. Check the link and your internet connection.");
  } finally {
    clearTimeout(timer);
  }
}

export async function importRecipe(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    throw new ImportError("That doesn't look like a web address.");
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ImportError('Only http and https links can be imported.');

  const recipe = extractRecipe(await fetchPage(url.href));
  if (!recipe) {
    throw new ImportError("Couldn't find recipe details on that page. You'll need to add the ingredients by hand.");
  }

  const ingredients = [recipe.recipeIngredient ?? recipe.ingredients ?? []].flat().map((i) => tidyIngredient(clean(i))).filter(Boolean);
  if (ingredients.length === 0) throw new ImportError('That page has a recipe but no ingredient list.');

  return { name: clean(recipe.name || ''), ingredients, url: url.href };
}
