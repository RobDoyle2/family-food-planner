// "Plan your plate": families choose foods first, then recipes are found to match.
import type { CarbChoiceId, MealPlan, Plate, PlanDay, ProteinChoiceId, Recipe } from '../types';
import { lineage, type FoodMap } from './foods';

export interface Choice<T extends string> {
  id: T;
  label: string;
  /** Illustration: the animal for meats, the food itself for everything else. */
  art: string;
  /** Soft tile background. */
  tint: string;
  hint?: string;
}

export const PROTEIN_CHOICES: Choice<ProteinChoiceId>[] = [
  { id: 'chicken', label: 'Chicken', art: '🐔', tint: '#f6ead4' },
  { id: 'beef', label: 'Beef', art: '🐄', tint: '#f1e1d6' },
  { id: 'pork', label: 'Pork', art: '🐖', tint: '#f6dfdc' },
  { id: 'lamb', label: 'Lamb', art: '🐑', tint: '#eee9e0' },
  { id: 'turkey', label: 'Turkey', art: '🦃', tint: '#f0e4d6' },
  { id: 'duck', label: 'Duck', art: '🦆', tint: '#e4ece0' },
  { id: 'fish', label: 'Fish', art: '🐟', tint: '#dfeaee', hint: 'Cod, hake, haddock…' },
  { id: 'salmon', label: 'Salmon', art: '🍣', tint: '#f6e2d8' },
  { id: 'tuna', label: 'Tuna', art: '🥫', tint: '#e2e8ee' },
  { id: 'prawns', label: 'Prawns', art: '🦐', tint: '#f8e3dc' },
  { id: 'seafood', label: 'Seafood', art: '🦪', tint: '#e3e7ec', hint: 'Prawns, mussels…' },
  { id: 'eggs', label: 'Eggs', art: '🥚', tint: '#f7f0d9' },
  { id: 'vegetarian', label: 'Vegetarian', art: '🥗', tint: '#e5eedf' },
  { id: 'vegan', label: 'Vegan', art: '🌱', tint: '#e1ecd9' },
  { id: 'other', label: 'Other / any', art: '🍽️', tint: '#eee9de', hint: 'Let us suggest' },
];

export const CARB_CHOICES: Choice<CarbChoiceId>[] = [
  { id: 'potatoes', label: 'Potatoes', art: '🥔', tint: '#f1e6d2' },
  { id: 'sweet-potatoes', label: 'Sweet potatoes', art: '🍠', tint: '#f5e0d2' },
  { id: 'rice', label: 'Rice', art: '🍚', tint: '#eef0ea' },
  { id: 'pasta', label: 'Pasta', art: '🍝', tint: '#f6e7cf' },
  { id: 'noodles', label: 'Noodles', art: '🍜', tint: '#f3e8d6' },
  { id: 'couscous', label: 'Couscous', art: '🥣', tint: '#f2ead8' },
  { id: 'quinoa', label: 'Quinoa', art: '🌾', tint: '#eee9d8' },
  { id: 'bread', label: 'Bread', art: '🍞', tint: '#f3e3cc' },
  { id: 'wraps', label: 'Wraps', art: '🌯', tint: '#f0e6d4' },
  { id: 'other', label: 'Other / any', art: '🍽️', tint: '#eee9de' },
];

/** Vegetables offered as tiles (food ids from the catalogue). */
export const VEG_CHOICES = [
  'broccoli', 'carrots', 'parsnips', 'peas', 'green-beans', 'cauliflower', 'sweetcorn', 'spinach', 'cabbage',
  'courgettes', 'peppers', 'onions', 'mushrooms', 'tomatoes', 'aubergines', 'leeks', 'butternut-squash', 'cucumber',
];

/** Catalogue food for each side choice. */
export const CARB_FOOD: Partial<Record<CarbChoiceId, string>> = {
  potatoes: 'potatoes',
  'sweet-potatoes': 'sweet-potatoes',
  rice: 'rice',
  pasta: 'pasta',
  noodles: 'noodles',
  couscous: 'couscous',
  quinoa: 'quinoa',
  bread: 'bread',
  wraps: 'wraps',
};

/** Catalogue food for each main-food choice, used to offer specific cuts and products. */
export const PROTEIN_FOOD: Partial<Record<ProteinChoiceId, string>> = {
  chicken: 'chicken',
  beef: 'beef',
  pork: 'pork',
  lamb: 'lamb',
  turkey: 'turkey',
  duck: 'duck',
  fish: 'fish',
  seafood: 'seafood',
};

const ANIMALS: ProteinChoiceId[] = ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck'];

export const proteinChoice = (id?: ProteinChoiceId) => PROTEIN_CHOICES.find((c) => c.id === id);
export const carbChoice = (id?: CarbChoiceId) => CARB_CHOICES.find((c) => c.id === id);

export const emptyPlate = (): Plate => ({ veg: [] });

export function plateIsEmpty(p?: Plate): boolean {
  return !p || (!p.protein && !p.carb && !p.veg.length);
}

/** Is this recipe built around the chosen main food? (Not just a garnish of it.) */
export function proteinMatches(choice: ProteinChoiceId, recipe: Recipe, foods: FoodMap, product?: string): boolean {
  const main = recipe.mainProtein ? lineage(recipe.mainProtein, foods) : [];
  let ok: boolean;
  if (ANIMALS.includes(choice)) ok = recipe.proteinGroup === choice || main.includes(choice);
  else if (choice === 'fish') ok = recipe.proteinGroup === 'fish';
  else if (choice === 'seafood') ok = recipe.proteinGroup === 'seafood';
  else if (choice === 'eggs') ok = recipe.proteinGroup === 'eggs';
  else if (choice === 'salmon' || choice === 'tuna' || choice === 'prawns') ok = main.includes(choice);
  else if (choice === 'vegetarian') ok = recipe.dietaryTags.includes('vegetarian');
  else if (choice === 'vegan') ok = recipe.dietaryTags.includes('vegan');
  else ok = true;
  if (ok && product) ok = recipe.ingredients.some((i) => lineage(i.foodId, foods).includes(product));
  return ok;
}

/** The recipe's sides: carbohydrate ingredients, ignoring breadcrumbs and similar binders. */
export function sidesOf(recipe: Recipe, foods: FoodMap): Set<string> {
  const out = new Set<string>();
  for (const i of recipe.ingredients) {
    if (i.role !== 'carb' || i.foodId === 'breadcrumbs') continue;
    lineage(i.foodId, foods).forEach((id) => out.add(id));
  }
  return out;
}

export function carbMatches(choice: CarbChoiceId, recipe: Recipe, foods: FoodMap): boolean {
  const food = CARB_FOOD[choice];
  return !food || sidesOf(recipe, foods).has(food);
}

export function vegMatches(veg: string[], recipe: Recipe): string[] {
  return veg.filter((v) => recipe.components.includes(v));
}

export interface PlateFit {
  protein: boolean;
  carb: boolean;
  veg: string[];
  /** How many of the chosen foods the recipe uses. */
  used: number;
  chosen: number;
}

export function plateFit(plate: Plate | undefined, recipe: Recipe, foods: FoodMap): PlateFit {
  const p = plate ?? emptyPlate();
  const protein = p.protein ? proteinMatches(p.protein, recipe, foods, p.proteinFood) : true;
  const carb = p.carb ? carbMatches(p.carb, recipe, foods) : true;
  const veg = vegMatches(p.veg, recipe);
  const chosen = (p.protein && p.protein !== 'other' ? 1 : 0) + (p.carb && p.carb !== 'other' ? 1 : 0) + p.veg.length;
  const used = (p.protein && p.protein !== 'other' && protein ? 1 : 0) + (p.carb && p.carb !== 'other' && carb ? 1 : 0) + veg.length;
  return { protein, carb, veg, used, chosen };
}

/** Score added to a recipe for a day: strongly prefers the chosen side and vegetables. */
export function plateBonus(plate: Plate | undefined, weekVeg: string[], recipe: Recipe, foods: FoodMap): number {
  if (!plate && !weekVeg.length) return 0;
  let s = 0;
  if (plate?.carb && plate.carb !== 'other') s += carbMatches(plate.carb, recipe, foods) ? 12 : -4;
  if (plate?.veg.length) s += Math.min(vegMatches(plate.veg, recipe).length, 4) * 4;
  else if (weekVeg.length) s += Math.min(vegMatches(weekVeg, recipe).length, 3) * 1.5;
  return s;
}

/** "Rice ×2, Pasta ×2, Potatoes ×1" for the week. */
export function carbCounts(plan: MealPlan): Map<CarbChoiceId, number> {
  const m = new Map<CarbChoiceId, number>();
  for (const d of plan.days) if (d.mode === 'cook' && d.plate?.carb) m.set(d.plate.carb, (m.get(d.plate.carb) ?? 0) + 1);
  return m;
}

export function vegCounts(plan: MealPlan): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of plan.days) if (d.mode === 'cook') for (const v of d.plate?.veg ?? []) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

export function setPlate(day: PlanDay, patch: Partial<Plate>): PlanDay {
  return { ...day, plate: { ...emptyPlate(), ...day.plate, ...patch } };
}

/**
 * Shares out the sides the family wants (e.g. rice ×2, pasta ×2, potatoes ×1) across cooking days
 * that don't have one yet: avoiding the same side two days running and favouring combinations
 * that have suitable recipes. Days already chosen are left alone.
 */
export function spreadCarbs(plan: MealPlan, wanted: Partial<Record<CarbChoiceId, number>>, safeRecipes: Recipe[], foods: FoodMap): MealPlan {
  const left = new Map(Object.entries(wanted).filter(([, n]) => (n ?? 0) > 0) as [CarbChoiceId, number][]);
  const days = plan.days.map((d) => ({ ...d }));
  days.forEach((d, i) => {
    if (d.mode !== 'cook' || d.plate?.carb || !left.size) return;
    const prev = days[i - 1]?.plate?.carb;
    const options = [...left.entries()].map(([carb, n]) => {
      const fits = safeRecipes.filter((r) => (!d.plate?.protein || proteinMatches(d.plate.protein, r, foods, d.plate.proteinFood)) && carbMatches(carb, r, foods)).length;
      return { carb, score: (fits > 0 ? 10 : 0) + Math.min(fits, 3) - (carb === prev ? 6 : 0) + n * 0.5 };
    });
    options.sort((a, b) => b.score - a.score);
    const pick = options[0].carb;
    days[i] = setPlate(d, { carb: pick });
    const n = left.get(pick)! - 1;
    if (n <= 0) left.delete(pick);
    else left.set(pick, n);
  });
  return { ...plan, days };
}

/**
 * Gives each cooking day without vegetables two of the week's chosen vegetables, rotating so each
 * is used, and preferring vegetables that appear in recipes matching that day's foods.
 */
export function spreadVeg(plan: MealPlan, weekVeg: string[], safeRecipes: Recipe[], foods: FoodMap, perDay = 2): MealPlan {
  if (!weekVeg.length) return plan;
  const used = new Map(weekVeg.map((v) => [v, 0]));
  plan.days.forEach((d) => d.plate?.veg.forEach((v) => used.has(v) && used.set(v, used.get(v)! + 1)));
  const days = plan.days.map((d) => {
    if (d.mode !== 'cook' || d.plate?.veg.length) return d;
    const fitting = safeRecipes.filter((r) => (!d.plate?.protein || proteinMatches(d.plate.protein, r, foods)) && (!d.plate?.carb || carbMatches(d.plate.carb, r, foods)));
    const ranked = [...weekVeg].sort((a, b) => {
      const fa = fitting.filter((r) => r.components.includes(a)).length;
      const fb = fitting.filter((r) => r.components.includes(b)).length;
      return used.get(a)! - used.get(b)! || fb - fa || weekVeg.indexOf(a) - weekVeg.indexOf(b);
    });
    const veg = ranked.slice(0, Math.min(perDay, ranked.length));
    veg.forEach((v) => used.set(v, used.get(v)! + 1));
    return setPlate(d, { veg });
  });
  return { ...plan, weekVeg, days };
}

/** "Chicken · Rice · Broccoli · Carrots" */
export function plateLabel(plate: Plate | undefined, foods: FoodMap): string {
  if (!plate) return '';
  const parts: string[] = [];
  if (plate.protein) parts.push(plate.proteinFood ? foods.get(plate.proteinFood)?.name ?? proteinChoice(plate.protein)!.label : proteinChoice(plate.protein)!.label);
  if (plate.carb) parts.push(carbChoice(plate.carb)!.label);
  plate.veg.forEach((v) => parts.push(foods.get(v)?.name ?? v));
  return parts.join(' · ');
}
