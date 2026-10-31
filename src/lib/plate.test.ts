import { describe, expect, it } from 'vitest';
import type { MealPlan, Member, Plate, ProteinChoiceId } from '../types';
import { BUILT_IN_FOODS } from '../data/foods';
import { RECIPE_SOURCES } from '../data/recipes';
import { toFoodMap } from './foods';
import { buildRecipe } from './recipes';
import { evaluateRecipe, generateDays, regenerateDay, type PlanContext } from './planner';
import { applyPlate, blankDay, findRecipes, mismatchedDays, moveMeal, setDayMode } from './planEdit';
import { carbCounts, carbMatches, plateFit, proteinMatches, setPlate, spreadCarbs, spreadVeg, vegCounts } from './plate';
import { assumedAtHome, buildShoppingItems, stapleNeeded } from './shopping';
import { gramsOf, recipeNutrition } from './nutrition';
import { draftFromPlate } from './ownRecipes';
import { addDays } from './util';

const foods = toFoodMap(BUILT_IN_FOODS);
const recipes = RECIPE_SOURCES.map((r) => buildRecipe(r, foods));
const byId = new Map(recipes.map((r) => [r.id, r]));
const m = (name: string, x: Partial<Member> = {}): Member => ({ id: name, householdId: 'h', name, age: 40, sex: '', allergies: [], intolerances: [], dietary: [], dislikes: [], nutrition: [], createdAt: '', updatedAt: '', ...x });
const fam = [m('Mam'), m('Dad'), m('Aoife', { age: 8 })];
const ctxFor = (members: Member[], weekVeg: string[] = []): PlanContext => ({ recipes, foods, members, prefs: null, favourites: new Set(), recent: new Set(), maxMinutes: null, weekVeg });
const ctx = ctxFor(fam);

function blankPlan(n = 5, members = fam): MealPlan {
  const start = '2026-11-02'; // a Monday
  return { id: 'p', householdId: 'h', startDate: start, seed: 1, maxMinutes: null, weekVeg: [], days: Array.from({ length: n }, (_, i) => blankDay(addDays(start, i), members)), createdAt: '', updatedAt: '' };
}
const withPlates = (plan: MealPlan, plates: Plate[]): MealPlan => ({ ...plan, days: plan.days.map((d, i) => (plates[i] ? { ...d, plate: plates[i] } : d)) });

describe('matching recipes to chosen foods', () => {
  it('matches animals by the main food, including products such as bacon, ham and sausages for pork', () => {
    const porky = recipes.filter((r) => proteinMatches('pork', r, foods));
    expect(porky.length).toBeGreaterThan(3);
    for (const r of porky) expect(r.proteinGroup === 'pork' || r.ingredients.some((i) => foods.get(i.foodId)?.parent === 'pork')).toBe(true);
    expect(recipes.some((r) => proteinMatches('pork', r, foods, 'bacon'))).toBe(true);
    // A specific product narrows the match to recipes that use it.
    const sausage = recipes.filter((r) => proteinMatches('pork', r, foods, 'pork-sausages'));
    expect(sausage.length).toBeGreaterThan(0);
    for (const r of sausage) expect(r.ingredients.some((i) => i.foodId === 'pork-sausages')).toBe(true);
  });

  it('vegetarian and vegan choices only match recipes with those tags', () => {
    for (const r of recipes.filter((x) => proteinMatches('vegan', x, foods))) expect(r.dietaryTags).toContain('vegan');
    for (const r of recipes.filter((x) => proteinMatches('vegetarian', x, foods))) expect(r.dietaryTags).toContain('vegetarian');
  });

  it('every main food tile has at least one recipe, and common pairings exist', () => {
    const tiles: ProteinChoiceId[] = ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'fish', 'salmon', 'tuna', 'prawns', 'seafood', 'eggs', 'vegetarian', 'vegan'];
    for (const t of tiles) expect(recipes.some((r) => proteinMatches(t, r, foods)), t).toBe(true);
    const pairs: [ProteinChoiceId, 'rice' | 'pasta' | 'potatoes'][] = [['chicken', 'rice'], ['beef', 'rice'], ['pork', 'pasta'], ['duck', 'potatoes'], ['vegetarian', 'pasta'], ['beef', 'pasta']];
    for (const [p, c] of pairs) expect(recipes.some((r) => proteinMatches(p, r, foods) && carbMatches(c, r, foods)), `${p}+${c}`).toBe(true);
  });
});

describe('the engine with plates', () => {
  it('suggests two different recipes that both use the chosen main food', () => {
    const plan = withPlates(blankPlan(), [{ protein: 'chicken', veg: [] }, { protein: 'beef', veg: [] }, { protein: 'pork', veg: [] }, { protein: 'duck', veg: [] }, { protein: 'vegetarian', veg: [] }]);
    const days = generateDays(plan.days, ctx, 1);
    const want: ProteinChoiceId[] = ['chicken', 'beef', 'pork', 'duck', 'vegetarian'];
    days.forEach((d, i) => {
      expect(d.options[0]).toBeTruthy();
      for (const id of d.options.filter(Boolean)) expect(proteinMatches(want[i], byId.get(id!)!, foods)).toBe(true);
      if (d.options[1]) expect(d.options[1]).not.toBe(d.options[0]);
    });
  });

  it('prefers the chosen side', () => {
    const plan = withPlates(blankPlan(2), [{ protein: 'chicken', carb: 'rice', veg: [] }, { protein: 'beef', carb: 'pasta', veg: [] }]);
    const days = generateDays(plan.days, ctx, 1);
    expect(carbMatches('rice', byId.get(days[0].options[0]!)!, foods)).toBe(true);
    expect(carbMatches('pasta', byId.get(days[1].options[0]!)!, foods)).toBe(true);
  });

  it('never relaxes allergies: explains instead when no recipe with the chosen food is safe', () => {
    const fishAllergy = [m('Mam'), m('Seán', { allergies: [{ kind: 'allergen', id: 'fish' }] })];
    const c = ctxFor(fishAllergy);
    const plan = withPlates(blankPlan(1, fishAllergy), [{ protein: 'salmon', veg: [] }]);
    const [d] = generateDays(plan.days, c, 1);
    expect(d.issue).toMatch(/salmon/i);
    expect(d.issue).toMatch(/not relaxed/);
    for (const id of d.options.filter(Boolean)) expect(evaluateRecipe(byId.get(id!)!, fishAllergy, c).ok).toBe(true);
  });

  it('works for households of one and of eight', () => {
    for (const n of [1, 8]) {
      const people = Array.from({ length: n }, (_, i) => m(`P${i}`));
      const plan = withPlates(blankPlan(3, people), [{ protein: 'chicken', veg: [] }, { protein: 'beef', veg: [] }, { protein: 'eggs', veg: [] }]);
      const days = generateDays(plan.days, ctxFor(people), 1);
      for (const d of days) expect(d.options[0]).toBeTruthy();
    }
  });

  it('is deterministic', () => {
    const plan = withPlates(blankPlan(), [{ protein: 'chicken', carb: 'rice', veg: ['broccoli'] }]);
    expect(generateDays(plan.days, ctx, 3)).toEqual(generateDays(plan.days, ctx, 3));
  });
});

describe('editing foods for a day', () => {
  it('updates the ideas straight away when no dinner is chosen', () => {
    let plan = blankPlan();
    plan = { ...plan, days: generateDays(plan.days, ctx, 1) };
    const { plan: p, chosenStillFits } = applyPlate(plan, 1, { protein: 'chicken', veg: [] }, ctx, byId);
    expect(chosenStillFits).toBe(true);
    for (const id of p.days[1].options.filter(Boolean)) expect(proteinMatches('chicken', byId.get(id!)!, foods)).toBe(true);
    expect(p.days[0]).toEqual(plan.days[0]); // other days untouched
  });

  it('never replaces a chosen dinner, but reports that it no longer fits', () => {
    let plan = withPlates(blankPlan(), [{ protein: 'beef', veg: [] }]);
    plan = { ...plan, days: generateDays(plan.days, ctx, 1) };
    plan = { ...plan, days: plan.days.map((d, i) => (i === 0 ? { ...d, selected: 0 as const } : d)) };
    const chosen = plan.days[0].options[0];
    const { plan: p, chosenStillFits } = applyPlate(plan, 0, { protein: 'chicken', veg: [] }, ctx, byId);
    expect(chosenStillFits).toBe(false);
    expect(p.days[0].options[0]).toBe(chosen);
    expect(p.days[0].selected).toBe(0);
    expect(mismatchedDays(p, byId, foods)).toEqual([0]);
  });

  it('"new recipe for this day" gives a different recipe with the same foods', () => {
    let plan = withPlates(blankPlan(), [{ protein: 'chicken', veg: [] }]);
    plan = { ...plan, days: generateDays(plan.days, ctx, 1) };
    const before = plan.days[0].options;
    const { day } = regenerateDay(plan, 0, ctx);
    expect(day.options[0]).toBeTruthy();
    expect(before).not.toContain(day.options[0]);
    expect(proteinMatches('chicken', byId.get(day.options[0]!)!, foods)).toBe(true);
    expect(day.plate?.protein).toBe('chicken');
  });

  it('find my recipes keeps chosen dinners unless asked to replace them', () => {
    let plan = withPlates(blankPlan(), [{ protein: 'beef', veg: [] }, { protein: 'chicken', veg: [] }]);
    plan = { ...plan, days: generateDays(plan.days, ctx, 1) };
    plan = { ...plan, days: plan.days.map((d, i) => (i === 0 ? { ...d, selected: 0 as const } : d)) };
    const kept = findRecipes(plan, ctx);
    expect(kept.days[0].options[0]).toBe(plan.days[0].options[0]);
    expect(kept.days[0].selected).toBe(0);
    const replaced = findRecipes(plan, ctx, true);
    expect(replaced.days[0].selected).toBeNull();
  });

  it('moving a meal takes its foods with it', () => {
    let plan = withPlates(blankPlan(), [{ protein: 'beef', veg: [] }, { protein: 'chicken', veg: [] }]);
    plan = { ...plan, days: generateDays(plan.days, ctx, 1) };
    const res = moveMeal(plan, 0, 1, ctx, byId);
    if ('error' in res) throw new Error(res.error);
    expect(res.plan.days[0].plate?.protein).toBe('chicken');
    expect(res.plan.days[1].plate?.protein).toBe('beef');
  });
});

describe('sharing sides and vegetables across the week', () => {
  it('shares rice ×2, pasta ×2, potatoes ×1 over five days without the same side twice in a row', () => {
    const plan = withPlates(blankPlan(), [{ protein: 'chicken', veg: [] }, { protein: 'beef', veg: [] }, { protein: 'pork', veg: [] }, { protein: 'duck', veg: [] }, { protein: 'vegetarian', veg: [] }]);
    const p = spreadCarbs(plan, { rice: 2, pasta: 2, potatoes: 1 }, recipes, foods);
    const counts = carbCounts(p);
    expect(counts.get('rice')).toBe(2);
    expect(counts.get('pasta')).toBe(2);
    expect(counts.get('potatoes')).toBe(1);
    for (let i = 1; i < 5; i++) expect(p.days[i].plate!.carb).not.toBe(p.days[i - 1].plate!.carb);
    // Every day's main food + side combination has at least one recipe.
    for (const d of p.days) expect(recipes.some((r) => proteinMatches(d.plate!.protein!, r, foods) && carbMatches(d.plate!.carb!, r, foods)), `${d.plate!.protein}+${d.plate!.carb}`).toBe(true);
  });

  it('leaves takeaway nights and days with a side alone', () => {
    let plan = blankPlan();
    plan = setDayMode(plan, 2, 'takeaway', ctx, { categoryId: 'chinese' });
    plan = { ...plan, days: plan.days.map((d, i) => (i === 0 ? setPlate(d, { carb: 'bread' }) : d)) };
    const p = spreadCarbs(plan, { rice: 5 }, recipes, foods);
    expect(p.days[0].plate!.carb).toBe('bread');
    expect(p.days[2].plate?.carb).toBeUndefined();
  });

  it('shares the week’s vegetables so each one is used', () => {
    const p = spreadVeg(blankPlan(), ['broccoli', 'carrots', 'parsnips', 'peas'], recipes, foods);
    const counts = vegCounts(p);
    for (const v of ['broccoli', 'carrots', 'parsnips', 'peas']) expect(counts.get(v)).toBeGreaterThan(0);
    for (const d of p.days) expect(d.plate!.veg).toHaveLength(2);
  });

  it('plate fit reports what a recipe uses', () => {
    const r = byId.get('beef-broccoli-rice')!;
    const f = plateFit({ protein: 'beef', carb: 'rice', veg: ['broccoli', 'carrots'] }, r, foods);
    expect(f.protein && f.carb).toBe(true);
    expect(f.veg).toContain('broccoli');
  });
});

describe('shopping list groups and cupboard staples', () => {
  const plan = (): MealPlan => {
    let p = withPlates(blankPlan(2), [{ protein: 'chicken', carb: 'rice', veg: ['broccoli'] }, { protein: 'beef', carb: 'pasta', veg: [] }]);
    p = { ...p, days: generateDays(p.days, ctx, 1).map((d) => ({ ...d, selected: 0 as const })) };
    return p;
  };

  it('splits chosen proteins, sides and vegetables from the other ingredients', () => {
    const items = buildShoppingItems(plan(), byId, foods);
    const main = items.filter((i) => i.kind === 'main');
    const extra = items.filter((i) => i.kind === 'extra');
    expect(main.length).toBeGreaterThan(2);
    expect(extra.length).toBeGreaterThan(0);
    for (const i of extra) expect(['protein', 'carb', 'veg']).not.toContain(byId.get(plan().days[0].options[0]!)!.ingredients.find((x) => x.foodId === i.foodId)?.role);
  });

  it('without staples set up, nothing changes', () => {
    const a = buildShoppingItems(plan(), byId, foods).map((i) => i.foodId);
    const b = buildShoppingItems(plan(), byId, foods, [], { staples: {} }).map((i) => i.foodId);
    expect(a).toEqual(b);
  });

  it('olive oil: left off when usually at home, added when running low, always added when chosen', () => {
    const p = plan();
    const uses = buildShoppingItems(p, byId, foods).some((i) => i.foodId === 'olive-oil');
    expect(uses).toBe(true);
    const has = (staples: Parameters<typeof buildShoppingItems>[4]) => buildShoppingItems(p, byId, foods, [], staples).find((i) => i.foodId === 'olive-oil');
    expect(has({ staples: { 'olive-oil': { mode: 'have', stock: 'plenty' } } })).toBeUndefined();
    expect(assumedAtHome(p, byId, { 'olive-oil': { mode: 'have', stock: 'plenty' } })).toContain('olive-oil');
    expect(has({ staples: { 'olive-oil': { mode: 'have', stock: 'low' } } })?.kind).toBe('cupboard');
    expect(has({ staples: { 'olive-oil': { mode: 'always', stock: 'plenty' } } })?.kind).toBe('cupboard');
    expect(has({ staples: { 'olive-oil': { mode: 'never', stock: 'need' } } })).toBeUndefined();
    // A staple to restock appears even when no recipe uses it this week.
    const extra = buildShoppingItems(p, byId, foods, [], { staples: { ketchup: { mode: 'low', stock: 'need' } } }).find((i) => i.foodId === 'ketchup');
    expect(extra?.kind).toBe('cupboard');
    expect(stapleNeeded({ mode: 'low', stock: 'plenty' })).toBe(false);
  });
});

describe('nutrition estimates', () => {
  it('converts units to grams', () => {
    expect(gramsOf({ foodId: 'olive-oil', amount: 1, unit: 'tbsp' })).toBeCloseTo(13.8, 1);
    expect(gramsOf({ foodId: 'chicken-breast', amount: 1, unit: 'kg' })).toBe(1000);
  });

  it('every built-in recipe has a complete, plausible estimate', () => {
    for (const r of recipes) {
      const n = recipeNutrition(r, foods);
      expect(n.missing, r.name).toEqual([]);
      expect(n.perServing.kcal, r.name).toBeGreaterThan(250);
      expect(n.perServing.kcal, r.name).toBeLessThan(1300);
      expect(n.perServing.protein, r.name).toBeGreaterThan(5);
    }
  });

  it('per serving is the total divided by servings, and unknown foods are reported not guessed', () => {
    const r = byId.get('spaghetti-bolognese')!;
    const n = recipeNutrition(r, foods);
    expect(n.perServing.kcal * r.servings).toBeCloseTo(n.total.kcal, 5);
    const custom = { ...r, ingredients: [...r.ingredients, { foodId: 'mystery', amount: 100, unit: 'g' as const, role: 'other' as const }] };
    const m2 = toFoodMap([...BUILT_IN_FOODS, { ...BUILT_IN_FOODS[0], id: 'mystery', name: 'Mystery sauce', custom: true, parent: undefined }]);
    expect(recipeNutrition(custom, m2).missing).toEqual(['Mystery sauce']);
  });
});

describe('writing a recipe from the chosen foods', () => {
  it('starts a draft with the main food, side and vegetables', () => {
    const d = draftFromPlate({ protein: 'pork', proteinFood: 'pork-sausages', carb: 'potatoes', veg: ['peas'] }, recipes, foods, 4);
    expect(d.ingredients.map((i) => i.foodId)).toEqual(['pork-sausages', 'potatoes', 'peas']);
    expect(d.name).toMatch(/Pork sausages with potatoes and peas/i);
  });
});
