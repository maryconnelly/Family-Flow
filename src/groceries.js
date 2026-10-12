export const CATEGORIES = ['Produce', 'Meat & seafood', 'Dairy & eggs', 'Bakery', 'Pantry', 'Frozen', 'Household', 'Other'];

// Checked in order, so specific phrases ("peanut butter") win over generic words ("butter").
const KEYWORDS = [
  ['Pantry', ['black pepper', 'peanut butter', 'pepper flakes', 'coconut milk', 'tomato paste', 'tomato sauce', 'canned']],
  ['Frozen', ['frozen', 'ice cream']],
  ['Produce', ['apple', 'banana', 'lettuce', 'spinach', 'onion', 'garlic', 'tomato', 'potato', 'carrot', 'pepper', 'lemon', 'lime', 'avocado', 'cilantro', 'parsley', 'basil', 'broccoli', 'cucumber', 'mushroom', 'celery', 'berry', 'berries', 'fruit', 'zucchini', 'kale', 'ginger', 'scallion', 'herb', 'orange', 'grape', 'squash', 'corn', 'cabbage', 'salad', 'jalapeno', 'mint']],
  ['Meat & seafood', ['chicken', 'beef', 'pork', 'turkey', 'sausage', 'bacon', 'salmon', 'shrimp', 'fish', 'ham', 'steak', 'tuna', 'lamb']],
  ['Dairy & eggs', ['milk', 'cheese', 'butter', 'yogurt', 'cream', 'egg', 'parmesan', 'mozzarella', 'cheddar', 'feta']],
  ['Bakery', ['bread', 'tortilla', 'bun', 'bagel', 'roll', 'pita', 'baguette', 'croissant']],
  ['Pantry', ['rice', 'pasta', 'flour', 'sugar', 'oil', 'salt', 'vinegar', 'sauce', 'beans', 'broth', 'stock', 'spice', 'cereal', 'oats', 'honey', 'noodles', 'cumin', 'paprika', 'oregano', 'cinnamon', 'vanilla', 'lentils', 'chips', 'crackers', 'coffee', 'tea', 'syrup', 'mustard', 'ketchup', 'mayo']],
  ['Household', ['paper towel', 'toilet paper', 'soap', 'detergent', 'trash bag', 'foil', 'sponge', 'shampoo', 'toothpaste']],
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYWORD_RES = KEYWORDS.map(([cat, words]) => [cat, words.map((w) => new RegExp(`\\b${escape(w)}(s|es)?\\b`, 'i'))]);

export function categorize(name) {
  for (const [cat, res] of KEYWORD_RES) if (res.some((re) => re.test(name))) return cat;
  return 'Other';
}

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const UNIT_ALIASES = {
  c: 'cup', tablespoon: 'tbsp', teaspoon: 'tsp', pound: 'lb', ounce: 'oz', gram: 'g',
  liter: 'l', package: 'pkg', pkgs: 'pkg',
};
const UNITS = ['cups?', 'c', 'tbsps?', 'tablespoons?', 'tsps?', 'teaspoons?', 'lbs?', 'pounds?', 'oz', 'ounces?',
  'g', 'grams?', 'kg', 'ml', 'l', 'liters?', 'cans?', 'cloves?', 'packages?', 'pkgs?', 'bunch(?:es)?', 'heads?',
  'slices?', 'pinch(?:es)?', 'jars?', 'bags?', 'box(?:es)?', 'sticks?', 'bottles?', 'dozen'];
const QTY = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.?\\d+|[½¼¾⅓⅔⅛])[½¼¾⅓⅔⅛]?';
const LINE_RE = new RegExp(`^(${QTY}(?:\\s*-\\s*${QTY})?)?\\s*(?:(${UNITS.join('|')})\\.?\\s+)?(?:of\\s+)?(.+)$`, 'i');

function toNumber(qty) {
  let total = 0;
  for (const part of qty.trim().split(/\s+|(?=[½¼¾⅓⅔⅛])/)) {
    if (part in FRACTIONS) total += FRACTIONS[part];
    else if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split('/').map(Number);
      if (!b) return null;
      total += a / b;
    } else if (/^\d*\.?\d+$/.test(part)) total += Number(part);
    else return null;
  }
  return total;
}

function singular(word) {
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/oes$/.test(word)) return word.slice(0, -2);
  if (/(ch|sh|x)es$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

function normalizeUnit(unit) {
  if (!unit) return '';
  const u = singular(unit.toLowerCase());
  return UNIT_ALIASES[u] || u;
}

const ABBREVIATED = new Set(['tbsp', 'tsp', 'lb', 'oz', 'g', 'kg', 'ml', 'l', 'pkg', 'dozen']);
function pluralUnit(unit, n) {
  if (!unit || n <= 1 || ABBREVIATED.has(unit)) return unit;
  return /(ch|sh|x)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

function fmtNumber(n) {
  const whole = Math.floor(n);
  const frac = n - whole;
  const match = Object.entries(FRACTIONS).find(([, v]) => Math.abs(v - frac) < 0.01);
  if (match) return whole ? `${whole}${match[0]}` : match[0];
  return String(Number(n.toFixed(2)));
}

// "1 1/2 cups chopped onions, diced" -> { qty: "1 1/2", unit: "cup", name: "chopped onions" }
export function parseIngredient(line) {
  const m = line.trim().match(LINE_RE);
  if (!m) return { qty: '', unit: '', name: line.trim() };
  const name = m[3].replace(/\s*\(.*?\)\s*/g, ' ').replace(/,.*$/, '').trim();
  return { qty: (m[1] || '').trim(), unit: normalizeUnit(m[2]), name: name || m[3].trim() };
}

// Turns the recipes planned on the given dates into a merged shopping list.
export function ingredientsForMeals(meals, recipes, dateKeys) {
  const dates = new Set(dateKeys);
  const byName = new Map();
  for (const meal of meals) {
    if (!dates.has(meal.date) || !meal.recipeId) continue;
    const recipe = recipes.find((r) => r.id === meal.recipeId);
    if (!recipe) continue;
    for (const line of recipe.ingredients) {
      if (!line.trim()) continue;
      const ing = parseIngredient(line);
      const key = ing.name.toLowerCase().split(' ').map(singular).join(' ');
      if (!byName.has(key)) byName.set(key, { name: ing.name, parts: [], from: new Set() });
      const entry = byName.get(key);
      entry.parts.push(ing);
      entry.from.add(recipe.name);
    }
  }

  return [...byName.values()].map(({ name, parts, from }) => {
    // Sum quantities that share a unit; keep anything unparseable as written.
    const sums = new Map();
    const loose = [];
    for (const { qty, unit } of parts) {
      if (!qty) continue;
      const n = toNumber(qty);
      if (n == null) loose.push(unit ? `${qty} ${unit}` : qty);
      else sums.set(unit, (sums.get(unit) || 0) + n);
    }
    const qty = [
      ...[...sums].map(([unit, n]) => [fmtNumber(n), pluralUnit(unit, n)].filter(Boolean).join(' ')),
      ...loose,
    ].join(' + ');
    return { name, qty, category: categorize(name), from: [...from] };
  });
}
