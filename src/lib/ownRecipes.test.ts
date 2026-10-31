import { describe, expect, it } from 'vitest';
import type { Food, MealPlan, Member, PlanDay } from '../types';
import { BUILT_IN_FOODS } from '../data/foods';
import { RECIPE_SOURCES } from '../data/recipes';
import { toFoodMap } from './foods';
import { buildRecipe } from './recipes';
import { emptyDraft, recipeFromDraft, stepsOf, typicalUse, validateDraft, type RecipeDraft } from './ownRecipes';
import { evaluateRecipe, generateDays, type PlanContext } from './planner';
import { blankDay } from './planEdit';
import { buildShoppingItems } from './shopping';
import { addDays } from './util';

const custom: Food = { id: 'food_bp', name: 'Black pudding', category: 'protein', emoji: '🍖', aisle: 'meat', allergens: [], allergenInfo: 'unknown', diet: {}, custom: true };
const foods = toFoodMap([...BUILT_IN_FOODS, custom]);
const builtIn = RECIPE_SOURCES.map((r) => buildRecipe(r, foods));
const m = (name: string, x: Partial<Member> = {}): Member => ({ id: name, householdId: 'h', name, age: 40, sex: '', allergies: [], intolerances: [], dietary: [], dislikes: [], nutrition: [], createdAt: '', updatedAt: '', ...x });

const stew: RecipeDraft = {
  ...emptyDraft(),
  name: "Granny's Beef Stew",
  servings: 4,
  ingredients: [
    { foodId: 'beef-diced', amount: 700, unit: 'g', role: 'protein' },
    { foodId: 'carrots', amount: 3, unit: 'item', role: 'veg' },
    { foodId: 'onions', amount: 2, unit: 'item', role: 'veg' },
    { foodId: 'potatoes', amount: 1000, unit: 'g', role: 'carb' },
    { foodId: 'butter', amount: 30, unit: 'g', role: 'other' },
  ],
  method: '1. Brown the beef.\n2. Add the vegetables\n\n- Simmer for 2 hours.',
};

describe('own recipes', () => {
  it('derives allergens, diets and the protein group from the ingredients', () => {
    const r = recipeFromDraft(stew, foods);
    expect(r.own).toBe(true);
    expect(r.builtIn).toBe(false);
    expect(r.allergens).toEqual(['milk']);
    expect(r.proteinGroup).toBe('beef');
    expect(r.mainProtein).toBe('beef-diced');
    expect(r.dietaryTags).toContain('gluten-free');
    expect(r.dietaryTags).not.toContain('vegetarian');
    expect(r.steps).toEqual(['Brown the beef.', 'Add the vegetables', 'Simmer for 2 hours.']);
    expect(r.cuisine).toBe('Family recipe');
  });

  it('is never suggested to someone it is unsafe for, and is preferred when it is safe', () => {
    const r = recipeFromDraft(stew, foods);
    const aoife = m('Aoife', { allergies: [{ kind: 'allergen', id: 'milk' }] });
    const ctx = (members: Member[]): PlanContext => ({ recipes: [...builtIn, r], foods, members, prefs: null, favourites: new Set(), recent: new Set(), maxMinutes: null });
    expect(evaluateRecipe(r, [aoife], ctx([aoife])).ok).toBe(false);
    const fam = [m('A'), m('B')];
    const ev = evaluateRecipe(r, fam, ctx(fam));
    expect(ev.ok && ev.highlights[0]).toBe('Your recipe');
    const days = generateDays(Array.from({ length: 14 }, (_, i) => blankDay(addDays('2026-11-02', i), fam)), ctx(fam), 1);
    expect(days.flatMap((d) => d.options)).toContain(r.id);
    const unsafe = generateDays(Array.from({ length: 14 }, (_, i) => blankDay(addDays('2026-11-02', i), [aoife])), ctx([aoife]), 1);
    expect(unsafe.flatMap((d) => d.options)).not.toContain(r.id);
  });

  it('flags a recipe using an unchecked custom food instead of calling it safe', () => {
    const r = recipeFromDraft({ ...stew, ingredients: [...stew.ingredients, { foodId: 'food_bp', amount: 4, unit: 'slice', role: 'protein' }] }, foods);
    expect(r.dietaryTags).toEqual([]);
    const aoife = m('Aoife', { allergies: [{ kind: 'allergen', id: 'milk' }] });
    const ctx: PlanContext = { recipes: [r], foods, members: [aoife], prefs: null, favourites: new Set(), recent: new Set(), maxMinutes: null };
    expect(evaluateRecipe(r, [m('Nut', { allergies: [{ kind: 'allergen', id: 'nuts' }] })], ctx).blocks.some((b) => b.kind === 'review')).toBe(true);
  });

  it('suggests the catalogue unit and a typical amount so the shopping list combines cleanly', () => {
    expect(typicalUse('beef-mince', builtIn, foods)).toMatchObject({ unit: 'g', amount: 500, role: 'protein' });
    expect(typicalUse('onions', builtIn, foods)).toMatchObject({ unit: 'item', role: 'veg' });
    expect(typicalUse('garlic', builtIn, foods).unit).toBe('clove');
    expect(typicalUse('food_bp', builtIn, foods)).toMatchObject({ unit: 'g', role: 'protein' });
  });

  it('validates the form', () => {
    expect(validateDraft(emptyDraft(), builtIn)).toMatchObject({ name: expect.any(String), ingredients: expect.any(String), method: expect.any(String) });
    expect(validateDraft({ ...stew, name: 'irish stew' }, builtIn).name).toMatch(/already a recipe/);
    expect(validateDraft({ ...stew, ingredients: [{ ...stew.ingredients[0], amount: 0 }] }, builtIn).ingredients).toMatch(/amount/);
    expect(validateDraft(stew, builtIn)).toEqual({});
    const r = recipeFromDraft(stew, foods);
    expect(validateDraft(stew, [...builtIn, r], r.id)).toEqual({});
    expect(stepsOf('  \n3) Serve hot\n')).toEqual(['Serve hot']);
  });

  it('puts its ingredients on the shopping list, combined with planned dinners and recipes added directly', () => {
    const r = recipeFromDraft(stew, foods);
    const recipes = new Map([...builtIn, r].map((x) => [x.id, x]));
    const day: PlanDay = { ...blankDay('2026-11-02', [m('A'), m('B'), m('C'), m('D')]), options: [r.id, 'irish-stew'], selected: 0 };
    const plan: MealPlan = { id: 'p', householdId: 'h', startDate: day.date, seed: 1, maxMinutes: null, days: [day], createdAt: '', updatedAt: '' };
    const planned = buildShoppingItems(plan, recipes, foods);
    expect(planned.find((i) => i.foodId === 'beef-diced')!.quantities).toEqual([{ amount: 700, unit: 'g' }]);
    expect(planned.find((i) => i.foodId === 'beef-diced')!.recipes).toEqual(["Granny's Beef Stew"]);
    // The same recipe added again straight from its page for 2 more portions: one combined line.
    const both = buildShoppingItems(plan, recipes, foods, [{ recipeId: r.id, portions: 2 }]);
    expect(both.find((i) => i.foodId === 'beef-diced')!.quantities).toEqual([{ amount: 1050, unit: 'g' }]);
    expect(both.filter((i) => i.foodId === 'carrots')).toHaveLength(1);
    // With no plan at all, a recipe can still go on the list.
    const only = buildShoppingItems(null, recipes, foods, [{ recipeId: 'spaghetti-bolognese', portions: 8 }]);
    expect(only.find((i) => i.foodId === 'beef-mince')!.quantities).toEqual([{ amount: 1000, unit: 'g' }]);
  });
});
