import { describe, expect, it } from 'vitest';
import type { FoodPreferences, MealPlan, Member, PlanDay, Recipe } from '../types';
import { BUILT_IN_FOODS } from '../data/foods';
import { RECIPE_SOURCES } from '../data/recipes';
import { findDuplicates, suggestCategory, searchFoods, toFoodMap } from './foods';
import { buildRecipe, refreshRecipe } from './recipes';
import { evaluateRecipe, generateDays, replaceOption, similarity, type PlanContext } from './planner';
import { combineQuantities, formatQuantity, roundRecipeAmount, roundShoppingAmount, scaleAmount } from './units';
import { buildShoppingItems, mergeRegenerated } from './shopping';
import { makeBackup, seedData, validateBackup } from './backup';
import { addDays } from './util';

const foods = toFoodMap(BUILT_IN_FOODS);
const recipes = RECIPE_SOURCES.map((r) => buildRecipe(r, foods));

function member(name: string, extra: Partial<Member> = {}): Member {
  return {
    id: `m-${name}`,
    householdId: 'h1',
    name,
    age: 40,
    sex: '',
    allergies: [],
    intolerances: [],
    dietary: [],
    dislikes: [],
    nutrition: [],
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

function ctxFor(members: Member[], prefs: FoodPreferences | null = null, rs: Recipe[] = recipes): PlanContext {
  return { recipes: rs, foods, members, prefs, favourites: new Set(), recent: new Set(), maxMinutes: null };
}

function days(n: number, members: Member[]): PlanDay[] {
  return Array.from({ length: n }, (_, i) => ({
    date: addDays('2026-11-02', i),
    options: [null, null],
    selected: null,
    mode: 'cook' as const,
    eaters: members.map((m) => m.id),
    guests: 0,
    portions: null,
    rejected: [],
  }));
}

describe('catalogue integrity', () => {
  it('has at least 50 recipes with unique ids', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(50);
    expect(new Set(recipes.map((r) => r.id)).size).toBe(recipes.length);
  });

  it('references only known foods and has complete fields', () => {
    for (const r of RECIPE_SOURCES) {
      for (const i of r.ingredients) {
        expect(foods.has(i.foodId), `${r.id}: ${i.foodId}`).toBe(true);
        expect(i.amount, `${r.id}: ${i.foodId}`).toBeGreaterThan(0);
      }
      expect(r.steps.length, r.id).toBeGreaterThanOrEqual(3);
      expect(r.ingredients.some((i) => i.foodId === r.mainProtein), `${r.id} main protein listed`).toBe(true);
      expect(r.ingredients.some((i) => i.role === 'carb'), `${r.id} has a carbohydrate`).toBe(true);
      expect(r.description.length).toBeGreaterThan(20);
    }
  });

  it('uses one unit per food across recipes so the shopping list combines cleanly', () => {
    const units = new Map<string, Set<string>>();
    for (const r of RECIPE_SOURCES)
      for (const i of r.ingredients) units.set(i.foodId, (units.get(i.foodId) ?? new Set()).add(i.unit.replace(/^(tsp|tbsp)$/, 'spoon')));
    const mixed = [...units].filter(([, u]) => u.size > 1).map(([f, u]) => `${f}: ${[...u]}`);
    expect(mixed).toEqual([]);
  });

  it('derives allergens and dietary tags from ingredients', () => {
    const r = (id: string) => recipes.find((x) => x.id === id)!;
    expect(r('chicken-satay').allergens).toContain('peanuts');
    expect(r('chicken-korma').allergens).toContain('nuts');
    expect(r('fish-pie').allergens).toEqual(expect.arrayContaining(['fish', 'milk', 'gluten']));
    expect(r('garlic-prawn-linguine').allergens).toContain('crustaceans');
    expect(r('creamy-garlic-mussels').allergens).toContain('molluscs');
    expect(r('cottage-pie').allergens).toContain('fish'); // Worcestershire sauce
    expect(r('red-lentil-dhal').dietaryTags).toEqual(expect.arrayContaining(['vegan', 'vegetarian', 'gluten-free', 'dairy-free']));
    expect(r('mac-and-cheese').dietaryTags).toContain('vegetarian');
    expect(r('mac-and-cheese').dietaryTags).not.toContain('vegan');
    expect(r('cottage-pie').dietaryTags).not.toContain('pescatarian');
  });
});

describe('allergy and dietary safety', () => {
  const aoife = member('Aoife', { age: 8, allergies: [{ kind: 'allergen', id: 'milk' }] });
  const sean = member('Sean', { allergies: [{ kind: 'allergen', id: 'peanuts' }, { kind: 'allergen', id: 'nuts' }] });
  const mam = member('Mam', { dietary: ['pescatarian'], intolerances: [{ kind: 'allergen', id: 'gluten' }] });

  it('never suggests recipes containing an allergen of anyone eating', () => {
    const fam = [aoife, sean, member('Dad')];
    const plan = generateDays(days(14, fam), ctxFor(fam), 1);
    const ids = plan.flatMap((d) => d.options).filter(Boolean) as string[];
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) {
      const r = recipes.find((x) => x.id === id)!;
      expect(r.allergens, id).not.toContain('milk');
      expect(r.allergens, id).not.toContain('peanuts');
      expect(r.allergens, id).not.toContain('nuts');
    }
  });

  it('applies intolerances and diets as hard rules and explains shortages', () => {
    const fam = [
      mam,
      member('Vegan', { dietary: ['vegan'], intolerances: [{ kind: 'food', id: 'beans' }, { kind: 'food', id: 'lentils' }] }),
      member('Celery', { allergies: [{ kind: 'allergen', id: 'celery' }] }),
    ];
    const plan = generateDays(days(7, fam), ctxFor(fam), 1);
    for (const d of plan) {
      for (const id of d.options.filter(Boolean) as string[]) {
        const r = recipes.find((x) => x.id === id)!;
        expect(r.dietaryTags).toEqual(expect.arrayContaining(['vegan', 'gluten-free']));
        expect(r.allergens).not.toContain('celery');
      }
    }
    expect(plan[0].options).toEqual([null, null]);
    expect(plan[0].issue).toMatch(/not relaxed/);
    expect(plan[0].issue).toMatch(/Vegan/);
  });

  it('only applies restrictions of the people eating that day', () => {
    const dad = member('Dad');
    const fam = [aoife, dad];
    const ds = days(2, fam);
    ds[1].eaters = [dad.id];
    const ctx = ctxFor(fam);
    const satay = recipes.find((r) => r.id === 'fish-pie')!;
    expect(evaluateRecipe(satay, [aoife, dad], ctx).ok).toBe(false);
    expect(evaluateRecipe(satay, [dad], ctx).ok).toBe(true);
  });

  it('treats household exclusions of a food group as hard exclusions', () => {
    const prefs: FoodPreferences = { id: 'h1', householdId: 'h1', status: { fish: 'exclude' }, ranking: [], rankingEnabled: false, updatedAt: '' };
    const fam = [member('Dad')];
    const plan = generateDays(days(10, fam), ctxFor(fam, prefs), 3);
    for (const id of plan.flatMap((d) => d.options).filter(Boolean) as string[]) {
      expect(recipes.find((r) => r.id === id)!.components).not.toContain('fish');
    }
  });

  it('flags recipes with unverified custom ingredients for review instead of calling them safe', () => {
    const custom = { id: 'food_hazel', name: 'Hazelnut dukkah', category: 'other', emoji: '🥜', aisle: 'other' as const, allergens: [], allergenInfo: 'unknown' as const, diet: {}, custom: true };
    const map = toFoodMap([...BUILT_IN_FOODS, custom]);
    const base = recipes.find((r) => r.id === 'red-lentil-dhal')!;
    const edited = refreshRecipe({ ...base, ingredients: [...base.ingredients, { foodId: custom.id, amount: 2, unit: 'tbsp', role: 'other' }], customised: true }, map);
    expect(edited.dietaryTags).toEqual([]);
    const ctx = { ...ctxFor([aoife]), foods: map, recipes: [edited] };
    const ev = evaluateRecipe(edited, [aoife], ctx);
    expect(ev.ok).toBe(false);
    expect(ev.blocks.some((b) => b.kind === 'review')).toBe(true);
  });
});

describe('meal plan generation', () => {
  const fam = [member('A'), member('B', { age: 10 })];

  it('is deterministic for the same inputs and seed', () => {
    const a = generateDays(days(7, fam), ctxFor(fam), 5);
    const b = generateDays(days(7, fam), ctxFor(fam), 5);
    expect(a).toEqual(b);
    const c = generateDays(days(7, fam), ctxFor(fam), 6);
    expect(c.map((d) => d.options)).not.toEqual(a.map((d) => d.options));
  });

  it('gives two distinct alternatives and avoids repeating protein on consecutive days', () => {
    const plan = generateDays(days(7, fam), ctxFor(fam), 2);
    const groupOf = (id: string | null) => recipes.find((r) => r.id === id)!.proteinGroup;
    plan.forEach((d, i) => {
      expect(d.options[0]).toBeTruthy();
      expect(d.options[1]).toBeTruthy();
      expect(groupOf(d.options[0])).not.toBe(groupOf(d.options[1]));
      const a = recipes.find((r) => r.id === d.options[0])!;
      const b = recipes.find((r) => r.id === d.options[1])!;
      expect(similarity(a, b)).toBeLessThan(0.45);
      if (i > 0) expect(groupOf(d.options[0])).not.toBe(groupOf(plan[i - 1].options[0]));
    });
    const all = plan.flatMap((d) => d.options);
    expect(new Set(all).size).toBe(all.length);
  });

  it('prefers liked and ranked foods', () => {
    const prefs: FoodPreferences = { id: 'h1', householdId: 'h1', status: { salmon: 'like', chicken: 'like' }, ranking: ['salmon', 'chicken'], rankingEnabled: true, updatedAt: '' };
    const ctx = ctxFor(fam, prefs);
    const salmon = evaluateRecipe(recipes.find((r) => r.id === 'salmon-potatoes')!, fam, ctx).score;
    const chicken = evaluateRecipe(recipes.find((r) => r.id === 'chicken-curry')!, fam, ctx).score;
    const beef = evaluateRecipe(recipes.find((r) => r.id === 'beef-stew')!, fam, ctx).score;
    expect(salmon).toBeGreaterThan(chicken);
    expect(chicken).toBeGreaterThan(beef);
  });

  it('replaces a suggestion with a new one and never brings the replaced one back', () => {
    const ds = generateDays(days(3, fam), ctxFor(fam), 1);
    const plan: MealPlan = { id: 'p', householdId: 'h1', startDate: ds[0].date, seed: 1, maxMinutes: null, days: ds, createdAt: '', updatedAt: '' };
    const old = ds[0].options[1];
    const { day } = replaceOption(plan, 0, 1, ctxFor(fam));
    expect(day.options[1]).toBeTruthy();
    expect(day.options[1]).not.toBe(old);
    expect(day.rejected).toContain(old);
    expect(day.options[0]).toBe(ds[0].options[0]);
  });
});

describe('portions and shopping list', () => {
  it('scales and rounds sensibly', () => {
    expect(scaleAmount(500, 4, 6)).toBe(750);
    expect(roundRecipeAmount(scaleAmount(1, 4, 6), 'item')).toBe(1.5);
    expect(roundRecipeAmount(scaleAmount(2, 4, 6), 'clove')).toBe(3);
    expect(roundShoppingAmount(1.5, 'item')).toBe(2);
    expect(roundShoppingAmount(2.1, 'item')).toBe(2);
    expect(roundShoppingAmount(733, 'g')).toBe(750);
    expect(formatQuantity({ amount: 1250, unit: 'g' })).toBe('1.25 kg');
    expect(formatQuantity({ amount: 0.5, unit: 'tsp' })).toBe('½ tsp');
  });

  it('combines compatible units and keeps incompatible ones apart', () => {
    expect(combineQuantities([{ amount: 500, unit: 'g' }, { amount: 1, unit: 'kg' }])).toEqual([{ amount: 1500, unit: 'g' }]);
    expect(combineQuantities([{ amount: 1, unit: 'tbsp' }, { amount: 100, unit: 'ml' }])).toEqual([{ amount: 115, unit: 'ml' }]);
    expect(combineQuantities([{ amount: 1, unit: 'tbsp' }, { amount: 3, unit: 'tsp' }])).toEqual([{ amount: 2, unit: 'tbsp' }]);
    expect(combineQuantities([{ amount: 6, unit: 'tbsp' }, { amount: 6, unit: 'tbsp' }])).toEqual([{ amount: 180, unit: 'ml' }]);
    expect(combineQuantities([{ amount: 2, unit: 'item' }, { amount: 200, unit: 'g' }])).toHaveLength(2);
  });

  it('builds a combined list from selected recipes, scaled to portions', () => {
    const fam = [member('A'), member('B')];
    const ds = days(2, fam);
    ds[0] = { ...ds[0], options: ['spaghetti-bolognese', 'fish-pie'], selected: 0, portions: 6 };
    ds[1] = { ...ds[1], options: ['chilli-con-carne', 'fish-pie'], selected: 0 };
    const plan: MealPlan = { id: 'p', householdId: 'h1', startDate: ds[0].date, seed: 1, maxMinutes: null, days: ds, createdAt: '', updatedAt: '' };
    const items = buildShoppingItems(plan, new Map(recipes.map((r) => [r.id, r])), foods);
    const mince = items.find((i) => i.foodId === 'beef-mince')!;
    // 500 g × 6/4 + 500 g × 2/4 = 1000 g
    expect(mince.quantities).toEqual([{ amount: 1000, unit: 'g' }]);
    expect(mince.recipes).toHaveLength(2);
    expect(items.filter((i) => i.foodId === 'onions')).toHaveLength(1);
    expect(items.find((i) => i.foodId === 'cod')).toBeUndefined();

    const merged = mergeRegenerated({ id: 'h1', householdId: 'h1', planId: 'p', generatedAt: '', updatedAt: '', items: [{ ...mince, have: true }, { id: 'm1', key: 'm1', name: 'Milk', aisle: 'dairy', quantities: [], have: false, source: 'manual', recipes: [] }] }, items);
    expect(merged.find((i) => i.foodId === 'beef-mince')!.have).toBe(true);
    expect(merged.some((i) => i.id === 'm1')).toBe(true);
  });
});

describe('custom foods', () => {
  it('detects duplicates and near-duplicates', () => {
    expect(findDuplicates('carrot', BUILT_IN_FOODS)[0]).toMatchObject({ kind: 'exact', food: { id: 'carrots' } });
    expect(findDuplicates('Zucchini', BUILT_IN_FOODS)[0]?.food.id).toBe('courgettes');
    expect(findDuplicates('Brocolli', BUILT_IN_FOODS)[0]).toMatchObject({ kind: 'similar', food: { id: 'broccoli' } });
    expect(findDuplicates('Pak choi', BUILT_IN_FOODS)).toEqual([]);
  });

  it('suggests categories', () => {
    expect(suggestCategory('Smoked mackerel', BUILT_IN_FOODS)?.category).toBe('protein');
    expect(suggestCategory('Pak choi', BUILT_IN_FOODS)?.category).toBe('vegetables');
    expect(suggestCategory('Potato gnocchi', BUILT_IN_FOODS)?.category).toBe('carbs');
    expect(suggestCategory('Eggplant', BUILT_IN_FOODS)?.category).toBe('vegetables');
    expect(suggestCategory('Brie', BUILT_IN_FOODS)?.category).toBe('other');
  });

  it('searches by partial names and aliases', () => {
    expect(searchFoods('sal', BUILT_IN_FOODS)[0].id).toBe('salmon');
    expect(searchFoods('zucch', BUILT_IN_FOODS).map((f) => f.id)).toContain('courgettes');
    expect(searchFoods('mince', BUILT_IN_FOODS).length).toBeGreaterThanOrEqual(3);
  });
});

describe('backup', () => {
  it('round-trips a valid backup', () => {
    const data = seedData();
    const res = validateBackup(JSON.stringify(makeBackup(data)));
    expect(res.ok).toBe(true);
    expect(res.data!.recipes.length).toBe(data.recipes.length);
  });

  it('reports structural errors', () => {
    expect(validateBackup('{nope').errors[0]).toMatch(/not valid JSON/);
    const bad = makeBackup(seedData()) as unknown as { data: Record<string, unknown> };
    (bad.data.members as unknown[]) = [{ id: 'x', name: 'Bob', age: 'ten', householdId: 'h' }];
    delete bad.data.recipes;
    const res = validateBackup(JSON.stringify(bad));
    expect(res.ok).toBe(false);
    expect(res.errors.join('\n')).toMatch(/recipes/);
    expect(res.errors.join('\n')).toMatch(/age/);
  });
});

describe('shopping hints', () => {
  it('suggests whole bulbs, heads and packs', async () => {
    const { packHint } = await import('./units');
    expect(packHint({ amount: 12, unit: 'clove' }, foods.get('garlic'))).toBe('≈ 2 bulbs');
    expect(packHint({ amount: 3, unit: 'item' }, foods.get('celery'))).toBe('≈ 1 head');
    expect(packHint({ amount: 1000, unit: 'g' }, foods.get('beef-mince'))).toBe('≈ 2 packs (500 g)');
    expect(packHint({ amount: 2, unit: 'item' }, foods.get('onions'))).toBeNull();
  });
});
