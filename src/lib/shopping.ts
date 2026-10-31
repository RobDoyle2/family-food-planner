import type { ExtraMeal, MealPlan, Quantity, Recipe, ShoppingItem, ShoppingList } from '../types';
import { AISLES, aisleLabel } from '../data/constants';
import type { FoodMap } from './foods';
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
export function buildShoppingItems(plan: MealPlan | null, recipes: Map<string, Recipe>, foods: FoodMap, extras: ExtraMeal[] = []): ShoppingItem[] {
  const byFood = new Map<string, { quantities: Quantity[]; recipes: Set<string> }>();
  const extraMeals = extras.map((e) => ({ recipe: recipes.get(e.recipeId), portions: e.portions })).filter((e): e is { recipe: Recipe; portions: number } => !!e.recipe);
  for (const { recipe, portions } of [...selectedMeals(plan, recipes), ...extraMeals]) {
    for (const ing of recipe.ingredients) {
      const entry = byFood.get(ing.foodId) ?? { quantities: [], recipes: new Set<string>() };
      entry.quantities.push({ amount: scaleAmount(ing.amount, recipe.servings, portions), unit: ing.unit });
      entry.recipes.add(recipe.name);
      byFood.set(ing.foodId, entry);
    }
  }
  const items: ShoppingItem[] = [];
  for (const [foodId, entry] of byFood) {
    const f = foods.get(foodId);
    const quantities = combineQuantities(entry.quantities).map((q) => ({ amount: roundShoppingAmount(q.amount, q.unit), unit: q.unit }));
    items.push({
      id: `plan:${foodId}`,
      key: foodId,
      foodId,
      name: f?.name ?? foodId,
      aisle: f?.aisle ?? 'other',
      quantities,
      have: false,
      source: 'plan',
      recipes: [...entry.recipes].sort(),
      labelCheck: f?.labelCheck,
    });
  }
  return sortItems(items);
}

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
