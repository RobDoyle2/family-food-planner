import type { AllergenId, FoodPreferences, MealPlan, Member, PlanDay, Recipe, Restriction } from '../types';
import { allergenLabel, dietLabel, ADULT_AGE } from '../data/constants';
import { analyseIngredients, totalMinutes, type RecipeAnalysis } from './recipes';
import type { FoodMap } from './foods';

export interface PlanContext {
  recipes: Recipe[];
  foods: FoodMap;
  members: Member[];
  prefs: FoodPreferences | null;
  favourites: Set<string>;
  recent: Set<string>;
  maxMinutes: number | null;
}

export type BlockKind = 'allergy' | 'intolerance' | 'diet' | 'excluded' | 'review' | 'time';

export interface Block {
  kind: BlockKind;
  /** Grouping key used to summarise why recipes were excluded. */
  key: string;
  label: string;
}

export interface Evaluation {
  recipe: Recipe;
  ok: boolean;
  blocks: Block[];
  score: number;
  highlights: string[];
  analysis: RecipeAnalysis;
}

/** Ingredients so common they shouldn't make two dishes count as "similar". */
const STAPLES = new Set([
  'salt', 'black-pepper', 'olive-oil', 'vegetable-oil', 'garlic', 'onions', 'red-onion', 'butter', 'plain-flour', 'chicken-stock',
  'veg-stock', 'beef-stock', 'tomato-puree', 'thyme', 'oregano', 'mixed-herbs', 'parsley', 'bay-leaves', 'sugar', 'cornflour',
]);

/** Deterministic pseudo-random number in [0, 1) from a string (FNV-1a). */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

function restrictionMatches(r: Restriction, recipe: Recipe): boolean {
  return r.kind === 'allergen' ? recipe.allergens.includes(r.id) : recipe.components.includes(r.id);
}

function restrictionName(r: Restriction, foods: FoodMap): string {
  return r.kind === 'allergen' ? allergenLabel(r.id as AllergenId) : foods.get(r.id)?.name ?? 'a removed food';
}

export function hasSafetyRestrictions(eaters: Member[], prefs: FoodPreferences | null): boolean {
  return (
    eaters.some((m) => m.allergies.length || m.intolerances.length || m.dietary.length) ||
    Object.values(prefs?.status ?? {}).includes('exclude')
  );
}

/** Checks a recipe against everyone eating, and scores it. Hard rules are never relaxed. */
export function evaluateRecipe(recipe: Recipe, eaters: Member[], ctx: PlanContext, cache?: Map<string, RecipeAnalysis>): Evaluation {
  let analysis = cache?.get(recipe.id);
  if (!analysis) {
    analysis = analyseIngredients(recipe.ingredients, ctx.foods);
    cache?.set(recipe.id, analysis);
  }
  // Use the freshly derived data for safety checks, so stale stored fields can never hide an allergen.
  const live: Recipe = { ...recipe, allergens: analysis.allergens, components: analysis.components, dietaryTags: analysis.dietaryTags };
  const blocks: Block[] = [];

  for (const m of eaters) {
    for (const r of m.allergies) {
      if (restrictionMatches(r, live)) {
        const n = restrictionName(r, ctx.foods);
        blocks.push({ kind: 'allergy', key: `allergy:${m.id}:${r.kind}:${r.id}`, label: `Contains ${n.toLowerCase()} — ${m.name}'s allergy` });
      }
    }
    for (const r of m.intolerances) {
      if (restrictionMatches(r, live)) {
        const n = restrictionName(r, ctx.foods);
        blocks.push({ kind: 'intolerance', key: `intol:${m.id}:${r.kind}:${r.id}`, label: `Contains ${n.toLowerCase()} — ${m.name}'s intolerance` });
      }
    }
    for (const d of m.dietary) {
      if (!live.dietaryTags.includes(d) && !analysis.unverified.length) {
        blocks.push({ kind: 'diet', key: `diet:${m.id}:${d}`, label: `Not ${dietLabel(d).toLowerCase()} — ${m.name}` });
      }
    }
  }

  const status = ctx.prefs?.status ?? {};
  for (const [foodId, s] of Object.entries(status)) {
    if (s === 'exclude' && live.components.includes(foodId)) {
      blocks.push({ kind: 'excluded', key: `excl:${foodId}`, label: `Contains ${ctx.foods.get(foodId)?.name.toLowerCase() ?? 'an excluded food'} (excluded)` });
    }
  }

  if (analysis.unverified.length && hasSafetyRestrictions(eaters, ctx.prefs)) {
    const names = analysis.unverified.map((u) => u.name).join(', ');
    blocks.push({ kind: 'review', key: 'review', label: `Needs review: allergen information unknown for ${names}` });
  }

  if (ctx.maxMinutes && totalMinutes(recipe) > ctx.maxMinutes) {
    blocks.push({ kind: 'time', key: 'time', label: `Takes longer than ${ctx.maxMinutes} minutes` });
  }

  // ---- Soft scoring ----
  let score = 0;
  const highlights: string[] = [];
  const ranking = ctx.prefs?.rankingEnabled ? ctx.prefs.ranking.filter((id) => status[id] === 'like') : [];
  const comps = new Set(live.components);
  const proteinLineage = new Set(analysis.components.filter((c) => c === recipe.mainProtein || ctx.foods.get(recipe.mainProtein)?.parent === c));

  for (const [foodId, s] of Object.entries(status)) {
    if (!comps.has(foodId)) continue;
    const isMain = proteinLineage.has(foodId);
    if (s === 'like') {
      score += isMain ? 5 : 2.5;
      const rank = ranking.indexOf(foodId);
      if (rank >= 0) score += ((ranking.length - rank) / ranking.length) * (isMain ? 9 : 5);
      const name = ctx.foods.get(foodId)?.name;
      if (name && highlights.length < 3) highlights.push(rank >= 0 ? `${name} (ranked #${rank + 1})` : name);
    } else if (s === 'dislike') {
      score -= isMain ? 9 : 5;
    }
  }
  for (const m of eaters) {
    for (const d of m.dislikes) if (comps.has(d)) score -= proteinLineage.has(d) ? 5 : 3;
  }

  const adults = eaters.filter((m) => m.age >= ADULT_AGE);
  const vegCount = recipe.ingredients.filter((i) => i.role === 'veg').length;
  const group = recipe.proteinGroup;
  for (const m of adults) {
    for (const n of m.nutrition) {
      if (n === 'more-veg') score += Math.min(vegCount, 4) * 0.4;
      if (n === 'higher-protein' && ['chicken', 'turkey', 'fish', 'seafood', 'beans', 'lentils', 'tofu', 'eggs'].includes(group)) score += 1;
      if (n === 'less-red-meat' && ['beef', 'lamb', 'pork'].includes(group)) score -= 1.5;
      if (n === 'more-fish' && (group === 'fish' || group === 'seafood')) score += 2;
    }
  }

  // Ingredient availability: speciality items are harder to find in a typical shop.
  const specialty = recipe.ingredients.filter((i) => ctx.foods.get(i.foodId)?.specialty).length;
  score -= specialty * 1;

  if (ctx.favourites.has(recipe.id)) {
    score += 3;
    highlights.unshift('Family favourite');
  }
  if (ctx.recent.has(recipe.id)) score -= 2;

  return { recipe, ok: blocks.length === 0, blocks, score, highlights, analysis };
}

/** Ingredient similarity (Jaccard) ignoring kitchen staples. */
export function similarity(a: Recipe, b: Recipe): number {
  const sa = new Set(a.ingredients.map((i) => i.foodId).filter((x) => !STAPLES.has(x)));
  const sb = new Set(b.ingredients.map((i) => i.foodId).filter((x) => !STAPLES.has(x)));
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const SIMILARITY_LIMIT = 0.45;

export function tooSimilar(a: Recipe, b: Recipe): boolean {
  return a.id === b.id || a.proteinGroup === b.proteinGroup || similarity(a, b) >= SIMILARITY_LIMIT;
}

export function eatersFor(day: PlanDay, members: Member[]): Member[] {
  return members.filter((m) => day.eaters.includes(m.id));
}

export function portionsFor(day: PlanDay): number {
  return Math.max(1, day.portions ?? day.eaters.length + day.guests);
}

/** The recipe that represents a day for variety purposes. */
export function chosenRecipeId(day: PlanDay): string | null {
  if (day.mode !== 'cook') return null;
  if (day.selected !== null) return day.options[day.selected];
  return day.options[0];
}

/** Explains, in plain language, why recipes were ruled out, e.g. "Contains milk — Aoife's allergy (23 recipes)". */
export function explainExclusions(evals: Evaluation[]): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const e of evals) {
    const seen = new Set<string>();
    for (const b of e.blocks) {
      if (seen.has(b.key)) continue;
      seen.add(b.key);
      const c = counts.get(b.key) ?? { label: b.label, n: 0 };
      c.n++;
      counts.set(b.key, c);
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map((c) => `${c.label} (${c.n} recipe${c.n === 1 ? '' : 's'})`);
}

interface PickState {
  days: PlanDay[];
  ctx: PlanContext;
  seed: number;
  cache: Map<string, RecipeAnalysis>;
  byId: Map<string, Recipe>;
}

function groupOf(day: PlanDay | undefined, byId: Map<string, Recipe>): string | null {
  if (!day) return null;
  const id = chosenRecipeId(day);
  return id ? byId.get(id)?.proteinGroup ?? null : null;
}

function dayScore(e: Evaluation, index: number, st: PickState): number {
  const r = e.recipe;
  let s = e.score;
  const usedIds: string[] = [];
  const groups: string[] = [];
  const perishables = new Set<string>();
  st.days.forEach((d, i) => {
    if (i === index || d.mode !== 'cook') return;
    for (const id of d.options) if (id) usedIds.push(id);
    const g = groupOf(d, st.byId);
    if (g) groups.push(g);
    const chosen = chosenRecipeId(d);
    const cr = chosen ? st.byId.get(chosen) : undefined;
    cr?.ingredients.forEach((ing) => {
      if (st.ctx.foods.get(ing.foodId)?.perishable) perishables.add(ing.foodId);
    });
  });
  s -= usedIds.filter((x) => x === r.id).length * 14;
  if (groupOf(st.days[index - 1], st.byId) === r.proteinGroup) s -= 10;
  if (groupOf(st.days[index + 1], st.byId) === r.proteinGroup) s -= 10;
  s -= groups.filter((g) => g === r.proteinGroup).length * 1.5;
  // Reuse fresh ingredients bought for other dinners this week to reduce waste.
  const shared = r.ingredients.filter((i) => perishables.has(i.foodId)).length;
  s += Math.min(shared, 3) * 0.8;
  s += hash01(`${st.seed}|${st.days[index].date}|${r.id}`) * 2.5;
  return s;
}

export interface DayPick {
  options: [string | null, string | null];
  issue?: string;
}

function rank(index: number, st: PickState, exclude: Set<string>): { evals: Evaluation[]; ok: Evaluation[] } {
  const eaters = eatersFor(st.days[index], st.ctx.members);
  const evals = st.ctx.recipes.map((r) => evaluateRecipe(r, eaters, st.ctx, st.cache));
  const ok = evals
    .filter((e) => e.ok && !exclude.has(e.recipe.id))
    .map((e) => ({ e, s: dayScore(e, index, st) }))
    .sort((a, b) => b.s - a.s || a.e.recipe.id.localeCompare(b.e.recipe.id))
    .map((x) => x.e);
  return { evals, ok };
}

function issueText(okCount: number, evals: Evaluation[]): string {
  const reasons = explainExclusions(evals.filter((e) => !e.ok)).slice(0, 4);
  const head =
    okCount === 0
      ? 'No recipes in the catalogue suit everyone eating this day, so nothing was suggested.'
      : 'Only one recipe suits everyone eating this day, so a second alternative could not be offered.';
  return `${head} Allergy, intolerance and exclusion rules were not relaxed. ${reasons.length ? 'Main reasons: ' + reasons.join('; ') + '.' : ''}`.trim();
}

/** Broad families: a lentil dhal and a chickpea curry are both "plant" dinners. */
const PROTEIN_FAMILY: Record<string, string> = {
  beef: 'red', lamb: 'red', pork: 'red',
  chicken: 'poultry', turkey: 'poultry', duck: 'poultry',
  fish: 'sea', seafood: 'sea',
  eggs: 'veg', vegetarian: 'veg', beans: 'veg', lentils: 'veg', tofu: 'veg',
};

const mainCarb = (r: Recipe) => r.ingredients.find((i) => i.role === 'carb')?.foodId;

/** The cuisine's main word, so "Indian-style" and "Indian" match. */
const cuisineKey = (r: Recipe) => r.cuisine.toLowerCase().replace(/-style/, '').split(/[ ,]/)[0];

/**
 * Chooses the second option so the pair offers a real choice. In order of preference:
 * different protein family + cuisine + main carb; different protein + cuisine; different protein; not too similar.
 */
function pickPartner(first: Recipe, ranked: Evaluation[]): Recipe | null {
  const rest = ranked.map((e) => e.recipe).filter((r) => r.id !== first.id);
  const differs = (r: Recipe) => !tooSimilar(first, r);
  const tiers: ((r: Recipe) => boolean)[] = [
    (r) => differs(r) && PROTEIN_FAMILY[r.proteinGroup] !== PROTEIN_FAMILY[first.proteinGroup] && cuisineKey(r) !== cuisineKey(first) && mainCarb(r) !== mainCarb(first),
    (r) => differs(r) && cuisineKey(r) !== cuisineKey(first) && mainCarb(r) !== mainCarb(first),
    (r) => differs(r) && cuisineKey(r) !== cuisineKey(first),
    differs,
    (r) => similarity(first, r) < SIMILARITY_LIMIT,
    () => true,
  ];
  // Only look a little way down the ranking so preferences still matter more than novelty.
  const window = rest.slice(0, 12);
  for (const tier of tiers) {
    const hit = window.find(tier) ?? (tier === tiers[tiers.length - 1] ? rest[0] : undefined);
    if (hit) return hit;
  }
  for (const tier of tiers) {
    const hit = rest.find(tier);
    if (hit) return hit;
  }
  return null;
}

function pickForDay(index: number, st: PickState, exclude: Set<string>): DayPick {
  const { evals, ok } = rank(index, st, exclude);
  if (ok.length === 0) {
    // Allow repeats from elsewhere in the plan before giving up (never safety rules).
    return { options: [null, null], issue: issueText(0, evals) };
  }
  const a = ok[0].recipe;
  const b = pickPartner(a, ok);
  if (!b) return { options: [a.id, null], issue: issueText(1, evals) };
  return { options: [a.id, b.id] };
}

function makeState(days: PlanDay[], ctx: PlanContext, seed: number): PickState {
  return { days, ctx, seed, cache: new Map(), byId: new Map(ctx.recipes.map((r) => [r.id, r])) };
}

/**
 * Fills cooking days with two alternatives.
 * - keepSelected: days with a chosen dinner are left alone.
 * - emptyOnly: only days that have no suggestions yet are filled (used when adding days),
 *   so nothing the family has already seen or chosen changes.
 * Deterministic: identical inputs and seed always give an identical plan.
 */
export function generateDays(days: PlanDay[], ctx: PlanContext, seed: number, keepSelected = true, emptyOnly = false): PlanDay[] {
  const out = days.map((d) => ({ ...d, options: [...d.options] as PlanDay['options'] }));
  const st = makeState(out, ctx, seed);
  const touch = (d: PlanDay) => d.mode === 'cook' && !(keepSelected && d.selected !== null) && !(emptyOnly && (d.options[0] || d.options[1]));
  const todo = out.map(touch);
  // Clear days being regenerated first so they don't influence each other's variety scoring.
  out.forEach((d, i) => {
    if (todo[i]) out[i] = { ...d, options: [null, null], selected: null, issue: undefined };
  });
  st.days = out;
  out.forEach((d, i) => {
    if (!todo[i]) return;
    const pick = pickForDay(i, st, new Set(d.rejected));
    out[i] = { ...d, options: pick.options, selected: null, issue: pick.issue };
  });
  return out;
}

/** New pair of suggestions for one day, avoiding what is currently shown. */
export function regenerateDay(plan: MealPlan, index: number, ctx: PlanContext): { day: PlanDay; message?: string } {
  const day = plan.days[index];
  const st = makeState(plan.days, ctx, plan.seed + 1000 + index * 7 + day.rejected.length);
  const current = day.options.filter(Boolean) as string[];
  let pick = pickForDay(index, st, new Set([...day.rejected, ...current]));
  let message: string | undefined;
  if (!pick.options[0]) {
    pick = pickForDay(index, st, new Set(day.rejected));
    message = 'There are no other suitable recipes for this day, so the current suggestions were kept.';
  }
  return { day: { ...day, options: pick.options, selected: null, issue: pick.issue }, message };
}

/** Replaces one of the two suggestions. The replaced recipe won't be suggested again for this day. */
export function replaceOption(plan: MealPlan, index: number, slot: 0 | 1, ctx: PlanContext): { day: PlanDay; message?: string } {
  const day = plan.days[index];
  const current = day.options[slot];
  const other = day.options[slot === 0 ? 1 : 0];
  const rejected = current ? [...new Set([...day.rejected, current])] : day.rejected;
  const st = makeState(plan.days, ctx, plan.seed);
  const exclude = new Set([...rejected, ...(other ? [other] : [])]);
  const { ok, evals } = rank(index, st, exclude);
  const byId = st.byId;
  const otherRecipe = other ? byId.get(other) : undefined;
  const choice = otherRecipe ? pickPartner(otherRecipe, ok.filter((e) => e.recipe.id !== otherRecipe.id)) : ok[0]?.recipe ?? null;
  if (!choice) {
    const reasons = explainExclusions(evals.filter((e) => !e.ok)).slice(0, 3);
    return {
      day,
      message: `No other suitable recipe is available for this day.${reasons.length ? ' ' + reasons.join('; ') + '.' : ''} You can reset replaced suggestions to see earlier ones again.`,
    };
  }
  const options = [...day.options] as PlanDay['options'];
  options[slot] = choice.id;
  return {
    day: { ...day, options, rejected, selected: day.selected === slot ? null : day.selected, issue: undefined },
  };
}

/** Safety check used when the user moves or hand-picks a recipe for a day. */
export function checkRecipeForDay(recipe: Recipe, day: PlanDay, ctx: PlanContext): Block[] {
  const ev = evaluateRecipe(recipe, eatersFor(day, ctx.members), { ...ctx, maxMinutes: null });
  return ev.blocks;
}

/** How many recipes suit the given people, plus reasons for the rest. */
export function suitabilitySummary(eaters: Member[], ctx: PlanContext) {
  const evals = ctx.recipes.map((r) => evaluateRecipe(r, eaters, ctx));
  const ok = evals.filter((e) => e.ok).length;
  return { ok, total: evals.length, reasons: explainExclusions(evals.filter((e) => !e.ok)) };
}
