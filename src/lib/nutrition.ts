// Nutrition estimates calculated from each recipe's actual ingredient quantities.
import type { Recipe, RecipeIngredient } from '../types';
import type { FoodMap } from './foods';
import { DENSITY, NUTRITION_PER_100G, UNIT_GRAMS } from '../data/nutrition';

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  satFat: number;
  sugar: number;
  salt: number;
}

export const NUTRIENT_KEYS: (keyof Nutrients)[] = ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'satFat', 'sugar', 'salt'];

const zero = (): Nutrients => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, satFat: 0, sugar: 0, salt: 0 });

/** Per-100 g values for a food: its own figures if it has them, otherwise the reference table. */
export function nutrientsFor(foodId: string, foods: FoodMap): Nutrients | null {
  return foods.get(foodId)?.nutrition ?? NUTRITION_PER_100G[foodId] ?? null;
}

/** Weight in grams of an ingredient amount, or null when the unit can't be converted reliably. */
export function gramsOf(ing: Pick<RecipeIngredient, 'foodId' | 'amount' | 'unit'>): number | null {
  const d = DENSITY[ing.foodId] ?? 1;
  switch (ing.unit) {
    case 'g':
      return ing.amount;
    case 'kg':
      return ing.amount * 1000;
    case 'ml':
      return ing.amount * d;
    case 'l':
      return ing.amount * 1000 * d;
    case 'tsp':
      return ing.amount * 5 * d;
    case 'tbsp':
      return ing.amount * 15 * d;
    case 'pinch':
      return ing.amount * 0.4;
    default: {
      const per = UNIT_GRAMS[ing.foodId]?.[ing.unit];
      return per === undefined ? null : ing.amount * per;
    }
  }
}

export interface RecipeNutrition {
  total: Nutrients;
  perServing: Nutrients;
  servings: number;
  /** Ingredients that could not be counted (no data, or a unit that can't be converted). */
  missing: string[];
  counted: number;
  ingredients: number;
}

export function recipeNutrition(recipe: Recipe, foods: FoodMap): RecipeNutrition {
  const total = zero();
  const missing: string[] = [];
  let counted = 0;
  for (const ing of recipe.ingredients) {
    const per100 = nutrientsFor(ing.foodId, foods);
    const grams = gramsOf(ing);
    if (!per100 || grams === null) {
      missing.push(foods.get(ing.foodId)?.name ?? 'Unknown ingredient');
      continue;
    }
    counted++;
    for (const k of NUTRIENT_KEYS) total[k] += (per100[k] * grams) / 100;
  }
  const servings = Math.max(1, recipe.servings);
  const perServing = zero();
  for (const k of NUTRIENT_KEYS) perServing[k] = total[k] / servings;
  return { total, perServing, servings, missing, counted, ingredients: recipe.ingredients.length };
}

/** Rounded for display: kcal to the nearest 10, grams to 1 decimal under 10. */
export function fmtNutrient(key: keyof Nutrients, value: number): string {
  if (key === 'kcal') return String(Math.round(value / 10) * 10);
  if (key === 'salt') return value.toFixed(1);
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}

/** Rough reference intakes for an adult (UK/EU labelling), used only to size the bars. */
export const REFERENCE_INTAKE: Nutrients = { kcal: 2000, protein: 50, carbs: 260, fat: 70, fibre: 30, satFat: 20, sugar: 90, salt: 6 };
