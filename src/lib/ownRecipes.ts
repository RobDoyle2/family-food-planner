// The family's own recipes: built from catalogue foods so allergens, diets and the
// shopping list work exactly as they do for the built-in recipes.
import type { Difficulty, IngredientRole, Recipe, RecipeIngredient, Unit } from '../types';
import { lineage, type FoodMap } from './foods';
import { refreshRecipe } from './recipes';
import { uid } from './util';
import { CARB_FOOD, PROTEIN_FOOD } from './plate';

export interface RecipeDraft {
  name: string;
  description: string;
  emoji: string;
  cuisine: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  difficulty: Difficulty;
  ingredients: RecipeIngredient[];
  /** One step per line. */
  method: string;
  image?: string;
}

export const DISH_EMOJIS = ['🍲', '🍝', '🍛', '🥘', '🍗', '🥩', '🐟', '🥧', '🍜', '🥗', '🌯', '🍕', '🍔', '🍳', '🥙', '🍚'];

const GROUPS = ['beef', 'lamb', 'pork', 'chicken', 'turkey', 'duck', 'fish', 'seafood', 'eggs', 'beans', 'lentils', 'tofu'];

/** The protein group used for day-to-day variety, e.g. salmon -> fish, lamb mince -> lamb. */
export function proteinGroupFor(foodId: string | undefined, foods: FoodMap): string {
  if (!foodId) return 'vegetarian';
  const line = lineage(foodId, foods);
  const g = line.find((id) => GROUPS.includes(id));
  if (g) return g;
  const f = foods.get(foodId);
  if (f?.diet.meat) return 'meat';
  if (f?.diet.fish) return 'fish';
  return 'vegetarian';
}

/** The main protein: the first "protein" ingredient, otherwise the first ingredient. */
export function mainProteinOf(ingredients: RecipeIngredient[]): string | undefined {
  return (ingredients.find((i) => i.role === 'protein') ?? ingredients[0])?.foodId;
}

/**
 * A sensible starting unit and amount for a food, taken from how the catalogue's recipes
 * use it (for 4 servings), so quantities combine cleanly on the shopping list.
 */
export function typicalUse(foodId: string, recipes: Recipe[], foods: FoodMap): { amount: number; unit: Unit; role: IngredientRole } {
  const uses = recipes.flatMap((r) => r.ingredients.filter((i) => i.foodId === foodId).map((i) => ({ ...i, amount: (i.amount * 4) / r.servings })));
  if (uses.length) {
    const counts = new Map<Unit, number[]>();
    uses.forEach((u) => counts.set(u.unit, [...(counts.get(u.unit) ?? []), u.amount]));
    const [unit, amounts] = [...counts].sort((a, b) => b[1].length - a[1].length)[0];
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const roles = uses.map((u) => u.role);
    const role = roles.sort((a, b) => roles.filter((x) => x === b).length - roles.filter((x) => x === a).length)[0];
    return { unit, amount: Math.round(median * 4) / 4, role };
  }
  const f = foods.get(foodId);
  const role: IngredientRole = f?.category === 'protein' ? 'protein' : f?.category === 'vegetables' ? 'veg' : f?.category === 'carbs' ? 'carb' : 'other';
  return { unit: role === 'other' ? 'item' : 'g', amount: role === 'other' ? 1 : role === 'protein' ? 500 : 300, role };
}

export function emptyDraft(): RecipeDraft {
  return { name: '', description: '', emoji: '🍲', cuisine: '', servings: 4, prepMinutes: 15, cookMinutes: 30, difficulty: 'Easy', ingredients: [], method: '' };
}

export function draftFromRecipe(r: Recipe): RecipeDraft {
  return {
    name: r.name,
    description: r.description,
    emoji: r.emoji,
    cuisine: r.cuisine,
    servings: r.servings,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    difficulty: r.difficulty,
    ingredients: r.ingredients.map((i) => ({ ...i })),
    method: r.steps.join('\n'),
    image: r.image,
  };
}

export const stepsOf = (method: string) =>
  method
    .split('\n')
    .map((s) => s.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim())
    .filter(Boolean);

/** Problems that stop the recipe being saved, keyed by field. */
export function validateDraft(d: RecipeDraft, existing: Recipe[], editingId?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const name = d.name.trim();
  if (!name) e.name = 'Please give your recipe a name.';
  else if (existing.some((r) => r.id !== editingId && r.name.trim().toLowerCase() === name.toLowerCase())) e.name = `There's already a recipe called “${name}”. Please choose a different name.`;
  if (!d.ingredients.length) e.ingredients = 'Add at least one ingredient so it can go on the shopping list.';
  else if (d.ingredients.some((i) => !(i.amount > 0))) e.ingredients = 'Every ingredient needs an amount greater than 0.';
  if (!stepsOf(d.method).length) e.method = 'Add the method — one step per line.';
  if (!(d.servings >= 1 && d.servings <= 40)) e.servings = 'Servings must be between 1 and 40.';
  if (!(d.prepMinutes >= 0) || !(d.cookMinutes >= 0)) e.times = 'Times must be 0 minutes or more.';
  return e;
}

/** Builds the stored recipe. Allergens, diets and components are derived from the ingredients. */
export function recipeFromDraft(d: RecipeDraft, foods: FoodMap, existing?: Recipe): Recipe {
  const main = mainProteinOf(d.ingredients);
  const base: Recipe = {
    id: existing?.id ?? uid('own'),
    name: d.name.trim(),
    description: d.description.trim() || `${d.name.trim()} — one of our family recipes.`,
    emoji: d.emoji,
    image: d.image,
    cuisine: d.cuisine.trim() || 'Family recipe',
    mainProtein: main ?? '',
    proteinGroup: proteinGroupFor(main, foods),
    ingredients: d.ingredients.map((i) => ({ ...i, note: i.note?.trim() || undefined })),
    prepMinutes: Math.round(d.prepMinutes),
    cookMinutes: Math.round(d.cookMinutes),
    difficulty: d.difficulty,
    servings: Math.round(d.servings),
    steps: stepsOf(d.method),
    dietaryTags: [],
    allergens: [],
    components: [],
    builtIn: false,
    own: true,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  return refreshRecipe(base, foods);
}

/** A new-recipe draft that starts with the foods chosen for a day ("Write a recipe with these foods"). */
export function draftFromPlate(plate: import('../types').Plate, recipes: Recipe[], foods: FoodMap, servings = 4): RecipeDraft {
  const ids: string[] = [];
  const main = plate.proteinFood ?? (plate.protein ? PROTEIN_FOOD[plate.protein] : undefined);
  if (main && foods.has(main)) ids.push(main);
  const side = plate.carb ? CARB_FOOD[plate.carb] : undefined;
  if (side && foods.has(side)) ids.push(side);
  plate.veg.filter((v) => foods.has(v)).forEach((v) => ids.push(v));
  const ingredients = ids.map((foodId) => {
    const use = typicalUse(foodId, recipes, foods);
    return { foodId, amount: Math.round(((use.amount || 1) * servings) / 4), unit: use.unit, role: use.role };
  });
  const names = ids.map((id) => foods.get(id)!.name);
  return { ...emptyDraft(), servings, name: names.length ? `${names[0]}${names[1] ? ' with ' + names.slice(1, 3).join(' and ').toLowerCase() : ''}` : '', ingredients };
}
