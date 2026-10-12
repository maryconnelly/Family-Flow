import { newId } from './store.js';

export const SLOTS = ['Dinner'];

export const findMeal = (meals, date, slot) => meals.find((m) => m.date === date && m.slot === slot);

// value: { recipeId, text } | { text } | null (clears the slot)
export function setMeal(update, date, slot, value) {
  update('meals', (meals) => {
    const rest = meals.filter((m) => !(m.date === date && m.slot === slot));
    return value ? [...rest, { id: newId(), date, slot, ...value }] : rest;
  });
}

// Prefers the recipe's current name; falls back to the saved text if the recipe was deleted.
export function mealLabel(meal, recipes) {
  if (!meal) return '';
  const recipe = meal.recipeId && recipes.find((r) => r.id === meal.recipeId);
  return recipe ? recipe.name : meal.text || '';
}
