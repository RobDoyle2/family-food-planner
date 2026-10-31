import { describe, expect, it } from 'vitest';
import type { AppData, MealPlan, Member, PlanDay } from '../types';
import { BUILT_IN_FOODS } from '../data/foods';
import { RECIPE_SOURCES } from '../data/recipes';
import { toFoodMap } from './foods';
import { buildRecipe } from './recipes';
import { generateDays, type PlanContext } from './planner';
import { blankDay, changeStart, chooseRecipe, daysFromSaved, moveMeal, planSummary, resizePlan, setDayMode, takeawayCautions, toSavedDays } from './planEdit';
import { buildShoppingItems } from './shopping';
import { migrateData } from './migrate';
import { seedData, validateBackup, makeBackup } from './backup';
import { addDays } from './util';

const foods = toFoodMap(BUILT_IN_FOODS);
const recipes = RECIPE_SOURCES.map((r) => buildRecipe(r, foods));
const byId = new Map(recipes.map((r) => [r.id, r]));
const m = (name: string, x: Partial<Member> = {}): Member => ({ id: name, householdId: 'h', name, age: 40, sex: '', allergies: [], intolerances: [], dietary: [], dislikes: [], nutrition: [], createdAt: '', updatedAt: '', ...x });
const fam = [m('Mam'), m('Dad'), m('Aoife', { age: 8, allergies: [{ kind: 'allergen', id: 'milk' }] })];
const ctx: PlanContext = { recipes, foods, members: fam, prefs: null, favourites: new Set(), recent: new Set(), maxMinutes: null };

function weekPlan(n = 7): MealPlan {
  const start = '2026-11-02';
  const days = generateDays(Array.from({ length: n }, (_, i) => blankDay(addDays(start, i), fam)), ctx, 1);
  // Choose the first option everywhere.
  return { id: 'p', householdId: 'h', startDate: start, seed: 1, maxMinutes: null, days: days.map((d) => ({ ...d, selected: 0 as const })), createdAt: '', updatedAt: '' };
}

describe('changing the planning period', () => {
  it('shrinks 7 → 5, keeping the first five meals and reporting the removed ones', () => {
    const plan = weekPlan();
    const { plan: p, removed } = resizePlan(plan, 5, fam, ctx);
    expect(p.days).toHaveLength(5);
    expect(p.days).toEqual(plan.days.slice(0, 5));
    expect(removed.map((d) => d.date)).toEqual(['2026-11-07', '2026-11-08']);
  });

  it('extends 7 → 10 without changing any existing day, and fills the new days safely', () => {
    const plan = weekPlan();
    const { plan: p, added } = resizePlan(plan, 10, fam, ctx);
    expect(added).toBe(3);
    expect(p.days.slice(0, 7)).toEqual(plan.days);
    expect(p.days.map((d) => d.date).slice(7)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
    for (const d of p.days.slice(7)) {
      expect(d.options[0]).toBeTruthy();
      expect(d.options[1]).toBeTruthy();
      for (const id of d.options) expect(byId.get(id!)!.allergens).not.toContain('milk');
    }
  });

  it('moves the start date without changing meals', () => {
    const plan = weekPlan();
    const p = changeStart(plan, '2026-11-10');
    expect(p.days[0].date).toBe('2026-11-10');
    expect(p.days[6].date).toBe('2026-11-16');
    expect(p.days.map((d) => d.options)).toEqual(plan.days.map((d) => d.options));
  });
});

describe('editing one evening', () => {
  it('chooses a searched recipe for one day only', () => {
    const plan = weekPlan();
    const r = recipes.find((x) => x.id === 'red-lentil-dhal')!;
    const res = chooseRecipe(plan, 2, r, ctx);
    expect('plan' in res).toBe(true);
    if (!('plan' in res)) return;
    const d = res.plan.days[2];
    expect(d.options[d.selected!]).toBe('red-lentil-dhal');
    res.plan.days.forEach((x, i) => i !== 2 && expect(x).toEqual(plan.days[i]));
  });

  it('refuses a recipe that breaks an allergy', () => {
    const res = chooseRecipe(weekPlan(), 0, byId.get('fish-pie')!, ctx);
    expect('error' in res && res.error).toMatch(/milk/i);
  });

  it('moves a meal to another day by swapping, keeping who eats with each day', () => {
    const plan = weekPlan();
    plan.days[4] = { ...plan.days[4], eaters: ['Mam', 'Dad'], guests: 2 };
    const res = moveMeal(plan, 0, 4, ctx, byId);
    if (!('plan' in res)) throw new Error(res.error);
    expect(res.plan.days[4].options).toEqual(plan.days[0].options);
    expect(res.plan.days[0].options).toEqual(plan.days[4].options);
    expect(res.plan.days[4].guests).toBe(2);
    expect(res.plan.days[4].date).toBe(plan.days[4].date);
  });

  it('blocks moving a meal to a day where it would be unsafe', () => {
    const plan = weekPlan();
    plan.days[1] = { ...plan.days[1], eaters: ['Mam', 'Dad'], options: ['fish-pie', plan.days[1].options[1]], selected: 0 };
    const res = moveMeal(plan, 1, 3, ctx, byId);
    expect('error' in res).toBe(true);
  });
});

describe('takeaway nights', () => {
  it('switches to takeaway and back, keeping the recipe suggestions', () => {
    const plan = weekPlan();
    const t = setDayMode(plan, 3, 'takeaway', ctx, { categoryId: 'indian', name: 'Taj Mahal', note: 'Korma for Aoife?' });
    expect(t.days[3].mode).toBe('takeaway');
    expect(t.days[3].takeaway).toMatchObject({ categoryId: 'indian', name: 'Taj Mahal' });
    const back = setDayMode(t, 3, 'cook', ctx);
    expect(back.days[3].options).toEqual(plan.days[3].options);
    expect(back.days[3].selected).toBe(0);
  });

  it('never adds takeaway nights to the shopping list', () => {
    const plan = weekPlan();
    const t = setDayMode(setDayMode(plan, 1, 'takeaway', ctx, { categoryId: 'chinese' }), 5, 'takeaway', ctx, { categoryId: 'pizza' });
    const all = new Set(buildShoppingItems(plan, byId, foods).flatMap((i) => i.recipes));
    const withTakeaways = new Set(buildShoppingItems(t, byId, foods).flatMap((i) => i.recipes));
    const r1 = byId.get(plan.days[1].options[0]!)!.name;
    const r5 = byId.get(plan.days[5].options[0]!)!.name;
    expect(all.has(r1) && all.has(r5)).toBe(true);
    expect(withTakeaways.has(r1)).toBe(false);
    expect(withTakeaways.has(r5)).toBe(false);
    expect(withTakeaways.size).toBe(5);
  });

  it('flags people whose allergies must be checked with the restaurant', () => {
    const t = setDayMode(weekPlan(), 0, 'takeaway', ctx, { categoryId: 'chinese' });
    expect(takeawayCautions(t.days[0], fam).map((x) => x.name)).toEqual(['Aoife']);
  });

  it('summarises the week', () => {
    let p = weekPlan();
    p = setDayMode(p, 2, 'takeaway', ctx, { categoryId: 'chinese' });
    p = setDayMode(p, 4, 'none', ctx);
    p = { ...p, days: p.days.map((d, i) => (i === 6 ? { ...d, selected: null } : d)) };
    expect(planSummary(p)).toMatchObject({ total: 7, cooked: 4, takeaway: 1, none: 1, open: 1 });
  });
});

describe('saved weekly plans', () => {
  it('round-trips a week as a template, safety-checking it for whoever is eating now', () => {
    let p = weekPlan();
    p = setDayMode(p, 4, 'takeaway', ctx, { categoryId: 'pizza' });
    const saved = toSavedDays(p);
    expect(saved[4]).toEqual({ mode: 'takeaway', takeaway: { categoryId: 'pizza' } });
    const { days, skipped } = daysFromSaved(saved, '2026-12-01', fam, ctx, byId, 3);
    expect(skipped).toEqual([]);
    expect(days[0].date).toBe('2026-12-01');
    expect(days[0].options[days[0].selected!]).toBe(p.days[0].options[0]);
    expect(days[4].mode).toBe('takeaway');
    // A saved fish pie is not reused for a family with a milk allergy.
    const res = daysFromSaved([{ mode: 'cook', recipeId: 'fish-pie' }], '2026-12-01', fam, ctx, byId, 1);
    expect(res.skipped).toEqual(['Fish Pie']);
    expect(res.days[0].options).not.toContain('fish-pie');
  });
});

describe('data migration from version 1', () => {
  it('upgrades skipped days, old shop sections and missing stores without losing data', () => {
    const v1 = seedData() as unknown as Record<string, unknown>;
    delete v1.takeawayPlaces;
    delete v1.takeawayCategories;
    delete v1.savedPlans;
    const data = v1 as unknown as AppData;
    data.settings = [{ id: 'app', activeHouseholdId: 'h', seedVersion: 2, recentRecipeIds: [] }];
    data.mealPlans = [{ id: 'p', householdId: 'h', startDate: '2026-11-02', seed: 1, maxMinutes: null, createdAt: '', updatedAt: '', days: [
      { date: '2026-11-02', options: ['irish-stew', 'shakshuka'], selected: 0, skipped: false, eaters: [], guests: 0, portions: null, rejected: [] } as unknown as PlanDay,
      { date: '2026-11-03', options: [null, null], selected: null, skipped: true, eaters: [], guests: 0, portions: null, rejected: [] } as unknown as PlanDay,
    ] }];
    data.shoppingLists = [{ id: 'h', householdId: 'h', planId: 'p', generatedAt: null, updatedAt: '', items: [
      { id: '1', key: 'salmon', foodId: 'salmon', name: 'Salmon fillets', aisle: 'meat-fish' as never, quantities: [], have: true, source: 'plan', recipes: [] },
      { id: '2', key: 'x', name: 'Black pudding', aisle: 'meat-fish' as never, quantities: [], have: false, source: 'manual', recipes: [] },
    ] }];
    const { data: up, changed } = migrateData(data);
    expect(changed).toEqual(expect.arrayContaining(['mealPlans', 'shoppingLists', 'settings']));
    expect(up.mealPlans[0].days.map((d) => d.mode)).toEqual(['cook', 'none']);
    expect('skipped' in up.mealPlans[0].days[0]).toBe(false);
    expect(up.mealPlans[0].days[0].options).toEqual(['irish-stew', 'shakshuka']);
    expect(up.shoppingLists[0].items.map((i) => [i.aisle, i.have])).toEqual([['fish', true], ['meat', false]]);
    expect(up.takeawayPlaces).toEqual([]);
    expect(up.settings[0].shoppingView).toBe('shop');
    // Running it again changes nothing.
    expect(migrateData(up).changed).toEqual([]);
  });

  it('accepts and upgrades a version 1 backup file', () => {
    const v1 = makeBackup(seedData()) as unknown as { version: number; data: Record<string, unknown> };
    v1.version = 1;
    delete v1.data.takeawayPlaces;
    delete v1.data.savedPlans;
    delete v1.data.takeawayCategories;
    const res = validateBackup(JSON.stringify(v1));
    expect(res.ok).toBe(true);
    expect(res.data!.takeawayPlaces).toEqual([]);
  });
});
