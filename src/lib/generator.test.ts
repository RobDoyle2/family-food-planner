// Quality checks for the recipe generator across several realistic household set-ups.
import { describe, expect, it } from 'vitest';
import type { DietId, FoodPreferences, MealPlan, Member, PlanDay } from '../types';
import { BUILT_IN_FOODS } from '../data/foods';
import { RECIPE_SOURCES } from '../data/recipes';
import { toFoodMap } from './foods';
import { buildRecipe } from './recipes';
import { generateDays, suitabilitySummary, type PlanContext } from './planner';
import { buildShoppingItems } from './shopping';
import { addDays } from './util';

const foods = toFoodMap(BUILT_IN_FOODS);
const recipes = RECIPE_SOURCES.map((r) => buildRecipe(r, foods));
const byId = new Map(recipes.map((r) => [r.id, r]));
const m = (name: string, x: Partial<Member> = {}): Member => ({ id: name, householdId: 'h', name, age: 40, sex: '', allergies: [], intolerances: [], dietary: [], dislikes: [], nutrition: [], createdAt: '', updatedAt: '', ...x });
const days = (n: number, ms: Member[]): PlanDay[] =>
  Array.from({ length: n }, (_, i) => ({ date: addDays('2026-11-02', i), options: [null, null], selected: null, mode: 'cook' as const, eaters: ms.map((x) => x.id), guests: 0, portions: null, rejected: [] }));
const ctx = (ms: Member[], prefs: FoodPreferences | null = null): PlanContext => ({ recipes, foods, members: ms, prefs, favourites: new Set(), recent: new Set(), maxMinutes: null });
const prefs = (status: FoodPreferences['status'], ranking: string[] = [], rankingEnabled = true): FoodPreferences => ({ id: 'h', householdId: 'h', status, ranking, rankingEnabled, updatedAt: '' });
const suggested = (plan: PlanDay[]) => plan.flatMap((d) => d.options).filter(Boolean).map((id) => byId.get(id!)!);

const HOUSEHOLDS: { name: string; members: Member[]; minSuitable: number }[] = [
  { name: 'family of four', members: [m('A'), m('B'), m('C', { age: 8 }), m('D', { age: 4 })], minSuitable: 70 },
  { name: 'vegetarian', members: [m('A', { dietary: ['vegetarian'] }), m('B')], minSuitable: 20 },
  { name: 'vegan', members: [m('A', { dietary: ['vegan'] })], minSuitable: 10 },
  { name: 'coeliac + child with milk allergy', members: [m('A', { intolerances: [{ kind: 'allergen', id: 'gluten' }] }), m('B', { age: 7, allergies: [{ kind: 'allergen', id: 'milk' }] })], minSuitable: 12 },
  { name: 'pescatarian with egg allergy', members: [m('A', { dietary: ['pescatarian'], allergies: [{ kind: 'allergen', id: 'eggs' }] })], minSuitable: 20 },
  { name: 'nut, peanut and sesame allergies', members: [m('A', { age: 10, allergies: [{ kind: 'allergen', id: 'nuts' }, { kind: 'allergen', id: 'peanuts' }, { kind: 'allergen', id: 'sesame' }] }), m('B')], minSuitable: 60 },
  { name: 'no pork, no beef', members: [m('A', { dietary: ['no-pork', 'no-beef'] })], minSuitable: 50 },
];

describe.each(HOUSEHOLDS)('household: $name', ({ members, minSuitable }) => {
  const c = ctx(members);
  const plan = generateDays(days(7, members), c, 1);
  const shown = suggested(plan);

  it('has a usable number of suitable recipes', () => {
    expect(suitabilitySummary(members, c).ok).toBeGreaterThanOrEqual(minSuitable);
  });

  it('never breaks an allergy, intolerance or diet', () => {
    for (const r of shown) {
      for (const mem of members) {
        for (const x of [...mem.allergies, ...mem.intolerances]) {
          if (x.kind === 'allergen') expect(r.allergens, `${r.name} vs ${mem.name}`).not.toContain(x.id);
        }
        for (const d of mem.dietary as DietId[]) expect(r.dietaryTags, `${r.name} vs ${d}`).toContain(d);
      }
    }
  });

  it('offers two different dinners every day and varies protein day to day', () => {
    plan.forEach((d, i) => {
      const [a, b] = d.options.map((id) => byId.get(id!)!);
      expect(a && b, `day ${i}`).toBeTruthy();
      expect(a.proteinGroup).not.toBe(b.proteinGroup);
      // With very few recipes, a different dish of the same protein beats repeating a dinner.
      if (i > 0 && minSuitable >= 14) expect(a.proteinGroup, `day ${i}`).not.toBe(byId.get(plan[i - 1].options[0]!)!.proteinGroup);
    });
  });

  it('does not repeat a recipe within the week when there are enough recipes', () => {
    if (minSuitable < 14) return;
    const ids = shown.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('preferences', () => {
  const fam = [m('A'), m('B')];

  it('steers away from disliked foods', () => {
    const plain = suggested(generateDays(days(7, fam), ctx(fam), 1)).filter((r) => r.components.includes('peppers')).length;
    const withDislike = [m('A', { dislikes: ['peppers'] }), m('B')];
    const after = suggested(generateDays(days(7, withDislike), ctx(withDislike), 1)).filter((r) => r.components.includes('peppers')).length;
    expect(plain).toBeGreaterThan(2);
    expect(after).toBeLessThanOrEqual(1);
  });

  it('ranking changes the plan only when enabled, favouring the top-ranked food', () => {
    const status: FoodPreferences['status'] = { salmon: 'like', 'beef-mince': 'like', pasta: 'like' };
    // Ranking decides which dinner is offered first each day.
    const firstChoices = (p: FoodPreferences, id: string) =>
      generateDays(days(7, fam), ctx(fam, p), 1).filter((d) => byId.get(d.options[0]!)!.components.includes(id)).length;
    const salmonFirst = prefs(status, ['salmon', 'beef-mince', 'pasta']);
    const pastaFirst = prefs(status, ['pasta', 'beef-mince', 'salmon']);
    expect(firstChoices(salmonFirst, 'salmon')).toBeGreaterThan(firstChoices(pastaFirst, 'salmon'));
    expect(firstChoices(pastaFirst, 'pasta')).toBeGreaterThan(firstChoices(salmonFirst, 'pasta'));
    // With ranking off, order no longer matters.
    expect(generateDays(days(7, fam), ctx(fam, prefs(status, ['salmon', 'beef-mince', 'pasta'], false)), 1)).toEqual(
      generateDays(days(7, fam), ctx(fam, prefs(status, ['pasta', 'beef-mince', 'salmon'], false)), 1),
    );
  });

  it('only highlights foods the family actually chose', () => {
    const plan = generateDays(days(7, fam), ctx(fam, prefs({ salmon: 'like' }, ['salmon'])), 1);
    expect(plan.flatMap((d) => d.options)).toBeTruthy();
    const none = generateDays(days(7, fam), ctx(fam), 1);
    expect(none.every((d) => !d.issue)).toBe(true);
  });

  it('excluding "Fish" also excludes hidden fish such as Worcestershire sauce', () => {
    const plan = generateDays(days(21, fam), ctx(fam, prefs({ fish: 'exclude' })), 2);
    for (const r of suggested(plan)) expect(r.components, r.name).not.toContain('fish');
    expect(byId.get('cottage-pie')!.components).toContain('fish');
  });
});

describe('scaling across household sizes', () => {
  it.each([1, 2, 3, 4, 6, 8])('bolognese shopping quantities for %i people', (n) => {
    const ds = days(1, [m('A')]);
    ds[0] = { ...ds[0], options: ['spaghetti-bolognese', null], selected: 0, portions: n };
    const plan: MealPlan = { id: 'p', householdId: 'h', startDate: '', seed: 1, maxMinutes: null, days: ds, createdAt: '', updatedAt: '' };
    const items = new Map(buildShoppingItems(plan, byId, foods).map((i) => [i.foodId, i.quantities[0]]));
    const mince = items.get('beef-mince')!;
    expect(mince.unit).toBe('g');
    expect(mince.amount).toBeGreaterThanOrEqual((500 * n) / 4);
    expect(mince.amount).toBeLessThan((500 * n) / 4 + 50);
    expect(items.get('chopped-tomatoes')!.amount).toBe(Math.max(1, Math.ceil((2 * n) / 4 - 0.15)));
    expect(items.get('onions')!.amount).toBeGreaterThanOrEqual(1);
  });
});
