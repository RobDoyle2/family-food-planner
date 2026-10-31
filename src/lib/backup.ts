import type { AppData, Category, Food, Recipe, Settings } from '../types';
import { STORES } from './db';
import { BUILT_IN_FOODS } from '../data/foods';
import { RECIPE_SOURCES } from '../data/recipes';
import { BUILT_IN_CATEGORIES, SEED_VERSION } from '../data/constants';
import { buildRecipe, refreshRecipe } from './recipes';
import { toFoodMap } from './foods';

export const EXPORT_APP = 'family-food-planner';
export const EXPORT_VERSION = 1;

export interface BackupFile {
  app: typeof EXPORT_APP;
  version: number;
  exportedAt: string;
  data: AppData;
}

export function makeBackup(data: AppData): BackupFile {
  return { app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data };
}

type Check = (r: Record<string, unknown>) => string | null;

const isStr = (v: unknown) => typeof v === 'string';
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isArr = Array.isArray;

const req =
  (field: string, test: (v: unknown) => boolean, what: string): Check =>
  (r) =>
    test(r[field]) ? null : `“${field}” should be ${what}`;

const RULES: Record<keyof AppData, Check[]> = {
  households: [req('name', isStr, 'text'), req('country', isStr, 'text')],
  members: [
    req('householdId', isStr, 'text'),
    req('name', isStr, 'text'),
    req('age', isNum, 'a number'),
    req('allergies', isArr, 'a list'),
    req('intolerances', isArr, 'a list'),
    req('dietary', isArr, 'a list'),
    req('dislikes', isArr, 'a list'),
  ],
  foods: [req('name', isStr, 'text'), req('category', isStr, 'text'), req('allergens', isArr, 'a list'), req('allergenInfo', (v) => v === 'verified' || v === 'declared' || v === 'unknown', 'verified, declared or unknown')],
  categories: [req('name', isStr, 'text')],
  preferences: [req('householdId', isStr, 'text'), req('status', (v) => !!v && typeof v === 'object' && !isArr(v), 'an object'), req('ranking', isArr, 'a list')],
  recipes: [req('name', isStr, 'text'), req('ingredients', isArr, 'a list'), req('servings', (v) => isNum(v) && (v as number) > 0, 'a positive number'), req('steps', isArr, 'a list')],
  mealPlans: [req('householdId', isStr, 'text'), req('startDate', isStr, 'a date'), req('days', isArr, 'a list')],
  shoppingLists: [req('householdId', isStr, 'text'), req('items', isArr, 'a list')],
  favourites: [req('householdId', isStr, 'text'), req('recipeId', isStr, 'text')],
  settings: [],
};

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  data?: AppData;
  summary?: string[];
}

/** Validates an imported backup completely before anything is replaced. */
export function validateBackup(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`The file is not valid JSON (${(e as Error).message}).`] };
  }
  const errors: string[] = [];
  if (!parsed || typeof parsed !== 'object') return { ok: false, errors: ['The file does not contain a backup object.'] };
  const b = parsed as Partial<BackupFile>;
  if (b.app !== EXPORT_APP) errors.push('This file was not created by Family Food Planner (missing “app” marker).');
  if (typeof b.version !== 'number') errors.push('The backup version number is missing.');
  else if (b.version > EXPORT_VERSION) errors.push(`This backup is from a newer version (${b.version}) of the app.`);
  if (!b.data || typeof b.data !== 'object') {
    errors.push('The backup has no “data” section.');
    return { ok: false, errors };
  }
  const data = b.data as Partial<AppData>;
  for (const store of STORES) {
    const list = data[store];
    if (!isArr(list)) {
      errors.push(`Section “${store}” is missing or is not a list.`);
      continue;
    }
    const ids = new Set<string>();
    list.forEach((rec: unknown, i: number) => {
      if (!rec || typeof rec !== 'object') {
        errors.push(`${store} #${i + 1}: not a record.`);
        return;
      }
      const r = rec as Record<string, unknown>;
      if (!isStr(r.id) || !(r.id as string)) errors.push(`${store} #${i + 1}: missing “id”.`);
      else if (ids.has(r.id as string)) errors.push(`${store} #${i + 1}: duplicate id “${r.id}”.`);
      else ids.add(r.id as string);
      for (const rule of RULES[store]) {
        const msg = rule(r);
        if (msg) errors.push(`${store} #${i + 1}${isStr(r.name) ? ` (${r.name})` : ''}: ${msg}.`);
      }
    });
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 30).concat(errors.length > 30 ? [`…and ${errors.length - 30} more problems.`] : []) };
  const full = data as AppData;
  // Cross-reference: members must belong to a household in the file.
  const hh = new Set(full.households.map((h) => h.id));
  full.members.forEach((m) => {
    if (!hh.has(m.householdId)) errors.push(`Member “${m.name}” refers to a household that is not in the file.`);
  });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    data: full,
    summary: [
      `${full.households.length} household(s)`,
      `${full.members.length} family member(s)`,
      `${full.foods.filter((f) => f.custom).length} custom food(s)`,
      `${full.recipes.length} recipe(s)`,
      `${full.mealPlans.length} meal plan(s)`,
      `${full.shoppingLists.reduce((n, l) => n + l.items.length, 0)} shopping item(s)`,
      `${full.favourites.length} favourite(s)`,
    ],
  };
}

/** Fresh application data containing only the built-in catalogue. */
export function seedData(): AppData {
  const foods = BUILT_IN_FOODS.map((f) => ({ ...f }));
  const map = toFoodMap(foods);
  const settings: Settings = { id: 'app', activeHouseholdId: null, seedVersion: SEED_VERSION, recentRecipeIds: [] };
  return {
    households: [],
    members: [],
    foods,
    categories: BUILT_IN_CATEGORIES.map((c) => ({ ...c })),
    preferences: [],
    recipes: RECIPE_SOURCES.map((r) => buildRecipe(r, map)),
    mealPlans: [],
    shoppingLists: [],
    favourites: [],
    settings: [settings],
  };
}

/**
 * Brings stored built-in foods and recipes up to date with a newer catalogue,
 * keeping custom foods, user photos and user-customised recipes.
 */
export function upgradeCatalogue(data: AppData): { foods: Food[]; recipes: Recipe[]; categories: Category[] } {
  const seed = seedData();
  const storedFoods = new Map(data.foods.map((f) => [f.id, f]));
  const foods = [
    ...seed.foods.map((f) => ({ ...f, image: storedFoods.get(f.id)?.image })),
    ...data.foods.filter((f) => f.custom),
  ];
  const map = toFoodMap(foods);
  const storedRecipes = new Map(data.recipes.map((r) => [r.id, r]));
  const recipes = [
    ...seed.recipes.map((r) => {
      const old = storedRecipes.get(r.id);
      return old?.customised ? refreshRecipe(old, map) : { ...r, image: old?.image };
    }),
    ...data.recipes.filter((r) => !r.builtIn).map((r) => refreshRecipe(r, map)),
  ];
  const categories = [...BUILT_IN_CATEGORIES, ...data.categories.filter((c) => !c.builtIn)];
  return { foods, recipes, categories };
}
