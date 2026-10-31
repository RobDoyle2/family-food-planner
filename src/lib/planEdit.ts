// Editing operations for a meal plan. Each changes only what it must, so one evening
// can be changed without disturbing the rest of the week.
import type { DayMode, MealPlan, Member, PlanDay, Recipe, SavedPlanDay, TakeawayChoice } from '../types';
import { addDays } from './util';
import { checkRecipeForDay, eatersFor, generateDays, type PlanContext } from './planner';

export const PLAN_LENGTHS = [3, 5, 7, 10, 14];
export const MAX_PLAN_DAYS = 31;

export function blankDay(date: string, members: Member[]): PlanDay {
  return { date, options: [null, null], selected: null, mode: 'cook', eaters: members.map((m) => m.id), guests: 0, portions: null, rejected: [] };
}

/** The recipe chosen for a cooking day, if any. */
export function chosenRecipe(day: PlanDay, recipes: Map<string, Recipe>): Recipe | undefined {
  if (day.mode !== 'cook' || day.selected === null) return undefined;
  const id = day.options[day.selected];
  return id ? recipes.get(id) : undefined;
}

/** Days that still need a decision: cooking days without a chosen dinner. */
export function needsAttention(day: PlanDay): boolean {
  return day.mode === 'cook' && day.selected === null;
}

export function planSummary(plan: MealPlan) {
  const cooked = plan.days.filter((d) => d.mode === 'cook' && d.selected !== null).length;
  const takeaway = plan.days.filter((d) => d.mode === 'takeaway').length;
  const none = plan.days.filter((d) => d.mode === 'none').length;
  const open = plan.days.filter(needsAttention).length;
  return { total: plan.days.length, cooked, takeaway, none, open, sorted: cooked + takeaway + none };
}

/**
 * Changes the number of days. Existing days keep their meals.
 * Shrinking removes days from the end (they are returned so the user can be told);
 * growing adds days at the end with fresh suggestions, leaving every existing day untouched.
 */
export function resizePlan(plan: MealPlan, length: number, members: Member[], ctx: PlanContext): { plan: MealPlan; removed: PlanDay[]; added: number } {
  const n = Math.max(1, Math.min(MAX_PLAN_DAYS, Math.round(length)));
  if (n === plan.days.length) return { plan, removed: [], added: 0 };
  if (n < plan.days.length) return { plan: { ...plan, days: plan.days.slice(0, n) }, removed: plan.days.slice(n), added: 0 };
  const extra = Array.from({ length: n - plan.days.length }, (_, i) => blankDay(addDays(plan.startDate, plan.days.length + i), members));
  const days = generateDays([...plan.days, ...extra], ctx, plan.seed, true, true);
  return { plan: { ...plan, days }, removed: [], added: extra.length };
}

/** Moves the plan to a new start date. Meals stay in the same order; only the dates change. */
export function changeStart(plan: MealPlan, start: string): MealPlan {
  return { ...plan, startDate: start, days: plan.days.map((d, i) => ({ ...d, date: addDays(start, i) })) };
}

const MEAL_FIELDS = ['options', 'selected', 'rejected', 'issue', 'mode', 'takeaway'] as const;
type MealPart = Pick<PlanDay, (typeof MEAL_FIELDS)[number]>;
const mealOf = (d: PlanDay): MealPart => ({ options: d.options, selected: d.selected, rejected: d.rejected, issue: d.issue, mode: d.mode, takeaway: d.takeaway });

/**
 * Moves the meal on one day to another day. If the other day already has a meal, the two swap.
 * Who is eating stays with each day, so the moved recipe is safety-checked for the new day's people.
 */
export function moveMeal(plan: MealPlan, from: number, to: number, ctx: PlanContext, recipes: Map<string, Recipe>): { plan: MealPlan } | { error: string } {
  if (from === to) return { plan };
  const a = plan.days[from];
  const b = plan.days[to];
  const placed: [PlanDay, PlanDay] = [
    { ...b, ...mealOf(a) },
    { ...a, ...mealOf(b) },
  ];
  for (const d of placed) {
    if (d.mode !== 'cook') continue;
    const options = [...d.options] as PlanDay['options'];
    for (const slot of [0, 1] as const) {
      const r = options[slot] ? recipes.get(options[slot]!) : undefined;
      if (!r || checkRecipeForDay(r, d, ctx).length === 0) continue;
      if (d.selected === slot) return { error: `${r.name} isn't suitable for everyone eating on ${d.date}: ${checkRecipeForDay(r, d, ctx)[0].label}.` };
      options[slot] = null; // drop an unsuitable alternative; a fresh one can be suggested
    }
    d.options = options;
  }
  const days = plan.days.map((d, i) => (i === to ? placed[0] : i === from ? placed[1] : d));
  return { plan: { ...plan, days } };
}

/** Puts a specific recipe on a day (from search, saved meals or alternatives) after a safety check. */
export function chooseRecipe(plan: MealPlan, index: number, recipe: Recipe, ctx: PlanContext): { plan: MealPlan } | { error: string } {
  const day = plan.days[index];
  const blocks = checkRecipeForDay(recipe, day, ctx);
  if (blocks.length) return { error: `${recipe.name} isn't suitable for everyone eating that day: ${blocks[0].label}.` };
  const options = [...day.options] as PlanDay['options'];
  let slot = options.indexOf(recipe.id) as -1 | 0 | 1;
  if (slot === -1) {
    slot = day.selected ?? (options[0] ? 1 : 0);
    options[slot] = recipe.id;
  }
  const next: PlanDay = { ...day, mode: 'cook', options, selected: slot as 0 | 1, issue: undefined };
  return { plan: { ...plan, days: plan.days.map((d, i) => (i === index ? next : d)) } };
}

/**
 * Switches a day between cooking, takeaway and nothing planned.
 * Recipe suggestions are kept, so switching back to cooking restores them.
 */
export function setDayMode(plan: MealPlan, index: number, mode: DayMode, ctx: PlanContext, takeaway?: TakeawayChoice): MealPlan {
  const day = plan.days[index];
  const next: PlanDay = { ...day, mode, takeaway: mode === 'takeaway' ? takeaway ?? day.takeaway ?? { categoryId: 'other' } : day.takeaway };
  let days = plan.days.map((d, i) => (i === index ? next : d));
  if (mode === 'cook' && !next.options[0] && !next.options[1]) days = generateDays(days, ctx, plan.seed, true, true);
  return { ...plan, days };
}

/** People with allergies, intolerances or diets eating on a takeaway night — their needs must be checked with the restaurant. */
export function takeawayCautions(day: PlanDay, members: Member[]): Member[] {
  return eatersFor(day, members).filter((m) => m.allergies.length || m.intolerances.length || m.dietary.length);
}

/** Keeps a plan's dinners as a reusable template (no dates, no household details). */
export function toSavedDays(plan: MealPlan): SavedPlanDay[] {
  return plan.days.map((d) => {
    if (d.mode === 'takeaway') return { mode: 'takeaway', takeaway: d.takeaway };
    if (d.mode === 'none') return { mode: 'none' };
    const id = d.selected !== null ? d.options[d.selected] : null;
    return id ? { mode: 'cook', recipeId: id } : { mode: 'cook' };
  });
}

/**
 * Builds plan days from a saved template, starting on a date. Saved recipes that no longer suit
 * the people eating are not used; those days get fresh, safe suggestions instead.
 */
export function daysFromSaved(saved: SavedPlanDay[], start: string, members: Member[], ctx: PlanContext, recipes: Map<string, Recipe>, seed: number): { days: PlanDay[]; skipped: string[] } {
  const skipped: string[] = [];
  const days = saved.map((s, i) => {
    const d = blankDay(addDays(start, i), members);
    if (s.mode !== 'cook') return { ...d, mode: s.mode, takeaway: s.takeaway };
    const r = s.recipeId ? recipes.get(s.recipeId) : undefined;
    if (!r) return d;
    if (checkRecipeForDay(r, d, ctx).length) {
      skipped.push(r.name);
      return d;
    }
    return { ...d, options: [r.id, null] as PlanDay['options'], selected: 0 as const };
  });
  // Fill alternatives and any empty cooking days without touching the saved choices.
  const filled = generateDays(days, ctx, seed, true, true);
  return { days: filled, skipped };
}
