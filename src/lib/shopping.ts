import type { ExtraMeal, MealPlan, Quantity, Recipe, ShoppingItem, ShoppingList, StapleSetting } from '../types';
import { AISLES, aisleLabel } from '../data/constants';
import { lineage, type FoodMap } from './foods';
import { portionsFor } from './planner';
import { combineQuantities, formatQuantity, packHint, roundShoppingAmount, scaleAmount } from './units';
import { uid } from './util';

export interface ScaledIngredient {
  foodId: string;
  name: string;
  quantity: Quantity;
  note?: string;
}

/** Selected recipes in a plan with their portion counts. */
export function selectedMeals(plan: MealPlan | null, recipes: Map<string, Recipe>) {
  const out: { date: string; recipe: Recipe; portions: number }[] = [];
  for (const d of plan?.days ?? []) {
    if (d.mode !== 'cook' || d.selected === null) continue;
    const id = d.options[d.selected];
    const r = id ? recipes.get(id) : undefined;
    if (r) out.push({ date: d.date, recipe: r, portions: portionsFor(d) });
  }
  return out;
}

/**
 * Combines ingredients from every selected dinner. Identical foods merge;
 * quantities add up where units are compatible, otherwise they are listed side by side.
 */
/** Common cupboard staples offered as suggestions (food ids). */
export const SUGGESTED_STAPLES = [
  'olive-oil', 'vegetable-oil', 'salt', 'black-pepper', 'garlic', 'onions', 'plain-flour', 'cornflour', 'sugar', 'honey', 'butter',
  'chicken-stock', 'beef-stock', 'veg-stock', 'mixed-herbs', 'thyme', 'oregano', 'bay-leaves', 'paprika', 'cumin', 'curry-powder',
  'chilli-powder', 'garam-masala', 'turmeric', 'cinnamon', 'soy-sauce', 'tomato-puree', 'ketchup', 'vinegar',
];

/** True when a staple should be on this list (always, or marked running low / need to buy). */
export function stapleNeeded(s: StapleSetting | undefined): boolean {
  if (!s) return false;
  if (s.mode === 'always') return true;
  if (s.mode === 'never') return false;
  return s.stock === 'low' || s.stock === 'need';
}

export interface BuildOptions {
  staples?: Record<string, StapleSetting>;
}

/**
 * Builds the list from every selected dinner (and recipes added straight to the list).
 * Identical foods merge; quantities add up where units are compatible, otherwise they are listed side by side.
 * Items are tagged: main (proteins, sides, vegetables and foods chosen for plates), extra (supporting
 * ingredients) or cupboard (staples, included only as the family has asked).
 */
export function buildShoppingItems(plan: MealPlan | null, recipes: Map<string, Recipe>, foods: FoodMap, extras: ExtraMeal[] = [], opts: BuildOptions = {}): ShoppingItem[] {
  const staples = opts.staples ?? {};
  const byFood = new Map<string, { quantities: Quantity[]; recipes: Set<string>; roles: Set<string> }>();
  const extraMeals = extras.map((e) => ({ recipe: recipes.get(e.recipeId), portions: e.portions })).filter((e): e is { recipe: Recipe; portions: number } => !!e.recipe);
  for (const { recipe, portions } of [...selectedMeals(plan, recipes), ...extraMeals]) {
    for (const ing of recipe.ingredients) {
      const entry = byFood.get(ing.foodId) ?? { quantities: [], recipes: new Set<string>(), roles: new Set<string>() };
      entry.quantities.push({ amount: scaleAmount(ing.amount, recipe.servings, portions), unit: ing.unit });
      entry.recipes.add(recipe.name);
      entry.roles.add(ing.foodId === 'breadcrumbs' ? 'other' : ing.role);
      byFood.set(ing.foodId, entry);
    }
  }
  // Foods the family chose on purpose for their plates.
  const chosen = new Set<string>();
  for (const d of plan?.days ?? []) {
    if (d.mode !== 'cook' || !d.plate) continue;
    if (d.plate.proteinFood) chosen.add(d.plate.proteinFood);
    d.plate.veg.forEach((v) => chosen.add(v));
  }
  const isChosen = (foodId: string) => lineage(foodId, foods).some((id) => chosen.has(id));

  const items: ShoppingItem[] = [];
  for (const [foodId, entry] of byFood) {
    const staple = staples[foodId];
    if (staple && !stapleNeeded(staple)) continue; // usually at home: left off the list
    const f = foods.get(foodId);
    const quantities = combineQuantities(entry.quantities).map((q) => ({ amount: roundShoppingAmount(q.amount, q.unit), unit: q.unit }));
    const main = entry.roles.has('protein') || entry.roles.has('carb') || entry.roles.has('veg') || isChosen(foodId);
    items.push({
      id: `plan:${foodId}`,
      key: foodId,
      foodId,
      name: f?.name ?? foodId,
      aisle: f?.aisle ?? 'other',
      quantities,
      have: false,
      source: 'plan',
      kind: staple ? 'cupboard' : main ? 'main' : 'extra',
      recipes: [...entry.recipes].sort(),
      labelCheck: f?.labelCheck,
    });
  }
  // Staples to restock even if no recipe needs them this week.
  for (const [foodId, setting] of Object.entries(staples)) {
    if (byFood.has(foodId) || !stapleNeeded(setting)) continue;
    const f = foods.get(foodId);
    if (!f) continue;
    items.push({ id: `plan:${foodId}`, key: foodId, foodId, name: f.name, aisle: f.aisle, quantities: [], have: false, source: 'plan', kind: 'cupboard', recipes: [] });
  }
  return sortItems(items);
}

/** Staples the recipes use that are assumed to be at home (shown as a quick reminder). */
export function assumedAtHome(plan: MealPlan | null, recipes: Map<string, Recipe>, staples: Record<string, StapleSetting>, extras: ExtraMeal[] = []): string[] {
  const used = new Set<string>();
  const meals = [...selectedMeals(plan, recipes).map((m) => m.recipe), ...extras.map((e) => recipes.get(e.recipeId)).filter((r): r is Recipe => !!r)];
  meals.forEach((r) => r.ingredients.forEach((i) => used.add(i.foodId)));
  return [...used].filter((id) => staples[id]?.mode === 'have' && !stapleNeeded(staples[id]));
}

/** Which group an item is shown in: things chosen for meals, or the supporting ingredients. */
export const itemGroup = (i: ShoppingItem): 'main' | 'extra' => (i.source === 'manual' || !i.kind || i.kind === 'main' ? 'main' : 'extra');

export function sortItems(items: ShoppingItem[]): ShoppingItem[] {
  const order = new Map(AISLES.map((a, i) => [a.id, i]));
  return [...items].sort((a, b) => (order.get(a.aisle) ?? 99) - (order.get(b.aisle) ?? 99) || a.name.localeCompare(b.name));
}

/**
 * Rebuilds the plan-generated part of a list, keeping manual items
 * and remembering which foods were already ticked as "already have it".
 */
export function mergeRegenerated(existing: ShoppingList | null, fresh: ShoppingItem[]): ShoppingItem[] {
  const had = new Set((existing?.items ?? []).filter((i) => i.have).map((i) => i.key));
  const manual = (existing?.items ?? []).filter((i) => i.source === 'manual');
  return sortItems([...fresh.map((i) => ({ ...i, have: had.has(i.key) })), ...manual]);
}

export function newManualItem(name: string, quantity: Quantity | null, aisle: ShoppingItem['aisle']): ShoppingItem {
  const id = uid('item');
  return { id, key: id, name: name.trim(), aisle, quantities: quantity ? [quantity] : [], have: false, source: 'manual', recipes: [] };
}

export const itemQuantityText = (i: ShoppingItem) => i.quantities.map(formatQuantity).join(' + ');

export function itemHint(i: ShoppingItem, foods: FoodMap): string | null {
  if (!i.foodId || i.quantities.length !== 1) return null;
  return packHint(i.quantities[0], foods.get(i.foodId));
}

export function listStats(items: ShoppingItem[]) {
  const have = items.filter((i) => i.have).length;
  return { total: items.length, toBuy: items.length - have, have };
}

/** Plain-text export grouped by shop section. */
export function listToText(items: ShoppingItem[], title: string, onlyToBuy: boolean): string {
  const lines = [title, ''];
  for (const a of AISLES) {
    const group = items.filter((i) => i.aisle === a.id && (!onlyToBuy || !i.have));
    if (!group.length) continue;
    lines.push(aisleLabel(a.id).toUpperCase());
    for (const i of group) {
      const q = itemQuantityText(i);
      lines.push(`${i.have ? '[x]' : '[ ]'} ${i.name}${q ? ' — ' + q : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function listToCsv(items: ShoppingItem[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [['Section', 'Item', 'Quantity', 'Already have', 'Used in'].map(esc).join(',')];
  for (const i of items) rows.push([aisleLabel(i.aisle), i.name, itemQuantityText(i), i.have ? 'yes' : 'no', i.recipes.join('; ')].map(esc).join(','));
  return rows.join('\n');
}
