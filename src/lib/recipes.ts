import type { AllergenId, DietId, Food, Recipe, RecipeIngredient } from '../types';
import type { RecipeSource } from '../data/recipes';
import { expandFood, type FoodMap } from './foods';

export interface RecipeAnalysis {
  allergens: AllergenId[];
  dietaryTags: DietId[];
  components: string[];
  /** Ingredients whose allergen / dietary information is unknown or missing. */
  unverified: { foodId: string; name: string; reason: 'unknown-info' | 'missing-food' }[];
  labelChecks: string[];
}

const ALL_DIETS: DietId[] = ['vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free', 'no-pork', 'no-beef'];

/** Derives allergens and dietary suitability from the ingredient list. */
export function analyseIngredients(ingredients: RecipeIngredient[], foods: FoodMap): RecipeAnalysis {
  const allergens = new Set<AllergenId>();
  const components = new Set<string>();
  const unverified: RecipeAnalysis['unverified'] = [];
  const labelChecks: string[] = [];
  let meat = false;
  let fish = false;
  let animal = false;
  let pork = false;
  let beef = false;

  for (const ing of ingredients) {
    const f = foods.get(ing.foodId);
    if (!f) {
      unverified.push({ foodId: ing.foodId, name: ing.foodId, reason: 'missing-food' });
      continue;
    }
    for (const id of expandFood(f.id, foods)) {
      components.add(id);
      const sub = foods.get(id);
      if (!sub) continue;
      // Parent groups (e.g. "fish") inherit nothing upward; only the item and its components count.
      if (id === f.id || f.components?.includes(id)) {
        sub.allergens.forEach((a) => allergens.add(a));
        meat ||= !!sub.diet.meat;
        fish ||= !!sub.diet.fish;
        animal ||= !!sub.diet.animal;
        pork ||= !!sub.diet.pork;
        beef ||= !!sub.diet.beef;
        if (sub.allergenInfo === 'unknown' && !unverified.some((u) => u.foodId === sub.id)) {
          unverified.push({ foodId: sub.id, name: sub.name, reason: 'unknown-info' });
        }
      }
    }
    if (f.labelCheck) labelChecks.push(f.name);
  }

  const tags = ALL_DIETS.filter((d) => {
    switch (d) {
      case 'vegetarian':
        return !meat && !fish;
      case 'vegan':
        return !meat && !fish && !animal;
      case 'pescatarian':
        return !meat;
      case 'gluten-free':
        return !allergens.has('gluten');
      case 'dairy-free':
        return !allergens.has('milk');
      case 'no-pork':
        return !pork;
      case 'no-beef':
        return !beef;
    }
  });

  return {
    allergens: [...allergens].sort(),
    // Tags can't be claimed when some ingredient information is unknown.
    dietaryTags: unverified.length ? [] : tags,
    components: [...components].sort(),
    unverified,
    labelChecks,
  };
}

export function buildRecipe(src: RecipeSource, foods: FoodMap): Recipe {
  const a = analyseIngredients(src.ingredients, foods);
  return {
    ...src,
    allergens: a.allergens,
    dietaryTags: a.dietaryTags,
    components: a.components,
    builtIn: true,
  };
}

/** Re-derives stored safety fields after an ingredient edit. */
export function refreshRecipe(recipe: Recipe, foods: FoodMap): Recipe {
  const a = analyseIngredients(recipe.ingredients, foods);
  return { ...recipe, allergens: a.allergens, dietaryTags: a.dietaryTags, components: a.components };
}

export const totalMinutes = (r: Recipe) => r.prepMinutes + r.cookMinutes;

export function ingredientsByRole(r: Recipe) {
  return {
    protein: r.ingredients.filter((i) => i.role === 'protein'),
    veg: r.ingredients.filter((i) => i.role === 'veg'),
    carb: r.ingredients.filter((i) => i.role === 'carb'),
    other: r.ingredients.filter((i) => i.role === 'other'),
  };
}

/** Emoji trio used for the illustrated recipe "plate". */
export function plateEmojis(r: Recipe, foods: FoodMap): string[] {
  const pick = (role: RecipeIngredient['role']) =>
    r.ingredients.filter((i) => i.role === role).map((i) => foods.get(i.foodId)?.emoji).filter(Boolean) as string[];
  const out = [r.emoji];
  for (const e of [...pick('veg'), ...pick('carb')]) {
    if (!out.includes(e)) out.push(e);
    if (out.length === 3) break;
  }
  return out;
}

export function foodName(id: string, foods: FoodMap): string {
  return foods.get(id)?.name ?? 'Unknown food';
}

export function isFoodInRecipe(foodId: string, r: Recipe): boolean {
  return r.components.includes(foodId);
}

export type { Food };
