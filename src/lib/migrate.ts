// Brings stored or imported data up to the current format without losing anything.
import type { Aisle, AppData, MealPlan, PlanDay, ShoppingList, StoreName } from '../types';
import { DATA_VERSION } from '../data/constants';

const AISLE_IDS: Aisle[] = ['fruit-veg', 'meat', 'fish', 'dairy', 'bakery', 'dry-goods', 'tinned', 'frozen', 'sauces', 'other'];

/** Stores added after version 1; older data and backups simply don't have them yet. */
export const OPTIONAL_STORES: StoreName[] = ['takeawayPlaces', 'takeawayCategories', 'savedPlans'];

type LegacyDay = PlanDay & { skipped?: boolean };

export function migrateDay(d: LegacyDay): PlanDay {
  if (d.mode) {
    if (!('skipped' in d)) return d;
    const { skipped: _drop, ...rest } = d;
    void _drop;
    return rest;
  }
  const { skipped, ...rest } = d;
  return { ...rest, mode: skipped ? 'none' : 'cook' };
}

function migratePlan(p: MealPlan): MealPlan {
  return { ...p, days: p.days.map((d) => migrateDay(d as LegacyDay)) };
}

/**
 * Upgrades data to the current format. Returns the upgraded data and the stores that changed,
 * so only those need writing back.
 */
export function migrateData(input: AppData): { data: AppData; changed: StoreName[] } {
  const changed = new Set<StoreName>();
  const data: AppData = { ...input };
  for (const s of OPTIONAL_STORES) {
    if (!Array.isArray(data[s])) {
      (data as unknown as Record<string, unknown[]>)[s] = [];
    }
  }

  // Day modes ("skipped" -> mode).
  if (data.mealPlans.some((p) => p.days.some((d) => !d.mode || 'skipped' in d))) {
    data.mealPlans = data.mealPlans.map(migratePlan);
    changed.add('mealPlans');
  }

  // Shop sections: the old combined "meat-fish" section is split.
  const foods = new Map(data.foods.map((f) => [f.id, f]));
  const fixAisle = (aisle: string, foodId?: string, fishy?: boolean): Aisle => {
    if (AISLE_IDS.includes(aisle as Aisle)) return aisle as Aisle;
    const fromFood = foodId ? foods.get(foodId)?.aisle : undefined;
    if (fromFood && AISLE_IDS.includes(fromFood)) return fromFood;
    if (aisle === 'meat-fish') return fishy ? 'fish' : 'meat';
    return 'other';
  };
  if (data.foods.some((f) => !AISLE_IDS.includes(f.aisle))) {
    data.foods = data.foods.map((f) => (AISLE_IDS.includes(f.aisle) ? f : { ...f, aisle: fixAisle(f.aisle, undefined, !!f.diet?.fish) }));
    foods.clear();
    data.foods.forEach((f) => foods.set(f.id, f));
    changed.add('foods');
  }
  if (data.shoppingLists.some((l) => l.items.some((i) => !AISLE_IDS.includes(i.aisle)))) {
    data.shoppingLists = data.shoppingLists.map(
      (l): ShoppingList => ({ ...l, items: l.items.map((i) => (AISLE_IDS.includes(i.aisle) ? i : { ...i, aisle: fixAisle(i.aisle, i.foodId, !!(i.foodId && foods.get(i.foodId)?.diet.fish)) })) }),
    );
    changed.add('shoppingLists');
  }

  // Settings defaults.
  if (data.settings.some((s) => (s.dataVersion ?? 1) < DATA_VERSION)) {
    data.settings = data.settings.map((s) => ({ ...s, shoppingView: s.shoppingView ?? 'shop', dataVersion: DATA_VERSION }));
    changed.add('settings');
  }
  return { data, changed: [...changed] };
}
