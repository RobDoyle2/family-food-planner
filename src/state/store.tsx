import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, Category, Favourite, Food, FoodPreferences, FoodStatus, Household, MealPlan, Member, Recipe, SavedPlan, Settings, ShoppingList, ShoppingView, StoreName, TakeawayCategory, TakeawayPlace } from '../types';
import { TAKEAWAY_CATEGORIES } from '../data/constants';
import * as db from '../lib/db';
import { seedData, upgradeCatalogue } from '../lib/backup';
import { migrateData } from '../lib/migrate';
import { SEED_VERSION } from '../data/constants';
import { toFoodMap, type FoodMap } from '../lib/foods';
import { refreshRecipe } from '../lib/recipes';
import { buildShoppingItems, mergeRegenerated } from '../lib/shopping';
import type { PlanContext } from '../lib/planner';
import { nowIso, uid } from '../lib/util';
import { useToast } from './ui';

type Changes = { [K in StoreName]?: { put?: AppData[K]; del?: string[] } };

const EMPTY: AppData = {
  households: [],
  members: [],
  foods: [],
  categories: [],
  preferences: [],
  recipes: [],
  mealPlans: [],
  shoppingLists: [],
  favourites: [],
  settings: [],
  takeawayPlaces: [],
  takeawayCategories: [],
  savedPlans: [],
};

function applyChanges(data: AppData, changes: Changes): AppData {
  const next = { ...data } as AppData;
  for (const key of Object.keys(changes) as StoreName[]) {
    const c = changes[key]!;
    let list = data[key] as { id: string }[];
    if (c.del?.length) list = list.filter((r) => !c.del!.includes(r.id));
    for (const rec of (c.put ?? []) as { id: string }[]) {
      const i = list.findIndex((r) => r.id === rec.id);
      list = i >= 0 ? list.map((r, j) => (j === i ? rec : r)) : [...list, rec];
    }
    (next as unknown as Record<string, unknown>)[key] = list;
  }
  return next;
}

export interface Store {
  ready: boolean;
  loadError: string | null;
  storageOk: boolean;
  data: AppData;
  settings: Settings;
  household: Household | null;
  members: Member[];
  prefs: FoodPreferences | null;
  plan: MealPlan | null;
  list: ShoppingList | null;
  favourites: Set<string>;
  savedMeals: Favourite[];
  takeawayPlaces: TakeawayPlace[];
  takeawayCategories: TakeawayCategory[];
  savedPlans: SavedPlan[];
  foodMap: FoodMap;
  recipeMap: Map<string, Recipe>;
  planContext: (maxMinutes?: number | null) => PlanContext;

  saveHousehold: (h: Pick<Household, 'name' | 'country'>) => Promise<Household>;
  saveMember: (m: Member) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  newMember: () => Member;
  saveFood: (f: Food) => Promise<void>;
  deleteFood: (id: string) => Promise<void>;
  saveCategory: (c: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  setFoodStatus: (foodId: string, status: FoodStatus | null) => Promise<void>;
  setRanking: (ids: string[]) => Promise<void>;
  setRankingEnabled: (on: boolean) => Promise<void>;
  savePlan: (p: MealPlan) => Promise<void>;
  deletePlan: () => Promise<void>;
  saveRecipe: (r: Recipe) => Promise<void>;
  restoreRecipe: (id: string) => Promise<void>;
  /** Deletes an own recipe and removes it from the plan, saved meals and shopping list. */
  deleteRecipe: (id: string) => Promise<void>;
  toggleFavourite: (recipeId: string) => Promise<void>;
  updateSavedMeal: (f: Favourite) => Promise<void>;
  saveTakeawayPlace: (p: TakeawayPlace) => Promise<void>;
  deleteTakeawayPlace: (id: string) => Promise<void>;
  saveTakeawayCategory: (c: TakeawayCategory) => Promise<void>;
  deleteTakeawayCategory: (id: string) => Promise<void>;
  saveSavedPlan: (p: SavedPlan) => Promise<void>;
  deleteSavedPlan: (id: string) => Promise<void>;
  setShoppingView: (v: ShoppingView) => Promise<void>;
  saveList: (l: ShoppingList) => Promise<void>;
  replaceAllData: (d: AppData) => Promise<void>;
  resetAll: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const ref = useRef<AppData>(EMPTY);
  const toast = useToast();

  // ---- Load (and seed on first run) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let loaded = await db.loadAll();
        const settings = loaded.settings.find((s) => s.id === 'app');
        if (!settings) {
          loaded = seedData();
          await db.replaceAll(loaded);
        } else if (settings.seedVersion < SEED_VERSION) {
          const up = upgradeCatalogue(loaded);
          loaded = { ...loaded, ...up, settings: [{ ...settings, seedVersion: SEED_VERSION }] };
          await db.replaceAll(loaded);
        }
        // Upgrade older data (day modes, shop sections, new stores) and save only what changed.
        const migrated = migrateData(loaded);
        loaded = migrated.data;
        for (const store of migrated.changed) await db.putMany(store, loaded[store] as never);
        if (cancelled) return;
        ref.current = loaded;
        setData(loaded);
      } catch (e) {
        // Fall back to an in-memory session so the app is still usable.
        const fresh = seedData();
        ref.current = fresh;
        setData(fresh);
        setStorageOk(false);
        setLoadError((e as Error).message || 'Local storage is unavailable.');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback(
    async (changes: Changes) => {
      const next = applyChanges(ref.current, changes);
      ref.current = next;
      setData(next);
      try {
        for (const key of Object.keys(changes) as StoreName[]) {
          const c = changes[key]!;
          if (c.del?.length) await db.removeMany(key, c.del);
          if (c.put?.length) await db.putMany(key, c.put as never);
        }
        setStorageOk(true);
      } catch (e) {
        setStorageOk(false);
        toast.show(`Could not save to this device: ${(e as Error).message || 'storage error'}. Your change is kept until you close the app — export a backup.`, 'error');
      }
    },
    [toast],
  );

  const settings: Settings = data.settings.find((s) => s.id === 'app') ?? { id: 'app', activeHouseholdId: null, seedVersion: SEED_VERSION, recentRecipeIds: [] };
  const household = data.households.find((h) => h.id === settings.activeHouseholdId) ?? data.households[0] ?? null;
  const hid = household?.id ?? '';
  const members = useMemo(() => data.members.filter((m) => m.householdId === hid).sort((a, b) => b.age - a.age || a.name.localeCompare(b.name)), [data.members, hid]);
  const prefs = data.preferences.find((p) => p.householdId === hid) ?? null;
  const plan = data.mealPlans.find((p) => p.householdId === hid) ?? null;
  const list = data.shoppingLists.find((l) => l.householdId === hid) ?? null;
  const favourites = useMemo(() => new Set(data.favourites.filter((f) => f.householdId === hid).map((f) => f.recipeId)), [data.favourites, hid]);
  const savedMeals = useMemo(() => data.favourites.filter((f) => f.householdId === hid).sort((a, b) => b.addedAt.localeCompare(a.addedAt)), [data.favourites, hid]);
  const takeawayPlaces = useMemo(() => data.takeawayPlaces.filter((p) => p.householdId === hid).sort((a, b) => a.name.localeCompare(b.name)), [data.takeawayPlaces, hid]);
  const takeawayCategories = useMemo(() => [...TAKEAWAY_CATEGORIES.slice(0, -1), ...data.takeawayCategories.filter((c) => !c.builtIn).sort((a, b) => a.name.localeCompare(b.name)), TAKEAWAY_CATEGORIES[TAKEAWAY_CATEGORIES.length - 1]], [data.takeawayCategories]);
  const savedPlans = useMemo(() => data.savedPlans.filter((p) => p.householdId === hid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.savedPlans, hid]);
  const foodMap = useMemo(() => toFoodMap(data.foods), [data.foods]);
  const recipeMap = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes]);

  const cur = () => {
    const d = ref.current;
    const s = d.settings.find((x) => x.id === 'app')!;
    const h = d.households.find((x) => x.id === s?.activeHouseholdId) ?? d.households[0] ?? null;
    return { d, s, h, hid: h?.id ?? '' };
  };

  const ensurePrefs = (): FoodPreferences => {
    const { d, hid } = cur();
    return d.preferences.find((p) => p.householdId === hid) ?? { id: hid, householdId: hid, status: {}, ranking: [], rankingEnabled: true, updatedAt: nowIso() };
  };

  const store: Store = {
    ready,
    loadError,
    storageOk,
    data,
    settings,
    household,
    members,
    prefs,
    plan,
    list,
    favourites,
    savedMeals,
    takeawayPlaces,
    takeawayCategories,
    savedPlans,
    foodMap,
    recipeMap,
    planContext: (maxMinutes = null) => ({
      recipes: data.recipes,
      foods: foodMap,
      members,
      prefs,
      favourites,
      recent: new Set(settings.recentRecipeIds),
      maxMinutes,
    }),

    async saveHousehold(input) {
      const { s, h } = cur();
      const t = nowIso();
      const rec: Household = h ? { ...h, ...input, updatedAt: t } : { id: uid('hh'), ...input, createdAt: t, updatedAt: t };
      const changes: Changes = { households: { put: [rec] } };
      if (!h) {
        changes.settings = { put: [{ ...(s ?? settings), activeHouseholdId: rec.id }] };
        changes.preferences = { put: [{ id: rec.id, householdId: rec.id, status: {}, ranking: [], rankingEnabled: true, updatedAt: t }] };
      }
      await apply(changes);
      return rec;
    },

    newMember() {
      const t = nowIso();
      return { id: uid('mem'), householdId: cur().hid, name: '', age: 30, sex: '', allergies: [], intolerances: [], dietary: [], dislikes: [], nutrition: [], createdAt: t, updatedAt: t };
    },

    async saveMember(m) {
      const { d } = cur();
      const isNew = !d.members.some((x) => x.id === m.id);
      const changes: Changes = { members: { put: [{ ...m, updatedAt: nowIso() }] } };
      // New members eat on every planned day by default.
      const p = d.mealPlans.find((x) => x.householdId === m.householdId);
      if (isNew && p) changes.mealPlans = { put: [{ ...p, days: p.days.map((day) => ({ ...day, eaters: [...day.eaters, m.id] })) }] };
      await apply(changes);
    },

    async deleteMember(id) {
      const { d } = cur();
      const p = d.mealPlans.find((x) => x.days.some((day) => day.eaters.includes(id)));
      const changes: Changes = { members: { del: [id] } };
      if (p) changes.mealPlans = { put: [{ ...p, days: p.days.map((day) => ({ ...day, eaters: day.eaters.filter((e) => e !== id) })) }] };
      await apply(changes);
    },

    async saveFood(f) {
      const { d } = cur();
      const rec = { ...f, updatedAt: nowIso() };
      const foods = toFoodMap(d.foods.map((x) => (x.id === f.id ? rec : x)).concat(d.foods.some((x) => x.id === f.id) ? [] : [rec]));
      // Recipes that use this food must have their allergen data re-derived.
      const affected = d.recipes.filter((r) => r.ingredients.some((i) => i.foodId === f.id)).map((r) => refreshRecipe(r, foods));
      await apply({ foods: { put: [rec] }, ...(affected.length ? { recipes: { put: affected } } : {}) });
    },

    async deleteFood(id) {
      const { d } = cur();
      const t = nowIso();
      const remaining = d.foods.filter((f) => f.id !== id);
      const map = toFoodMap(remaining);
      const recipes = d.recipes
        .filter((r) => r.ingredients.some((i) => i.foodId === id))
        .map((r) => refreshRecipe({ ...r, ingredients: r.ingredients.filter((i) => i.foodId !== id), updatedAt: t }, map));
      const prefsList = d.preferences
        .filter((p) => p.status[id] || p.ranking.includes(id))
        .map((p) => {
          const status = { ...p.status };
          delete status[id];
          return { ...p, status, ranking: p.ranking.filter((x) => x !== id), updatedAt: t };
        });
      const mems = d.members
        .filter((m) => m.dislikes.includes(id) || [...m.allergies, ...m.intolerances].some((r) => r.kind === 'food' && r.id === id))
        .map((m) => ({
          ...m,
          dislikes: m.dislikes.filter((x) => x !== id),
          allergies: m.allergies.filter((r) => !(r.kind === 'food' && r.id === id)),
          intolerances: m.intolerances.filter((r) => !(r.kind === 'food' && r.id === id)),
        }));
      await apply({ foods: { del: [id] }, recipes: { put: recipes }, preferences: { put: prefsList }, members: { put: mems } });
    },

    async saveCategory(c) {
      await apply({ categories: { put: [c] } });
    },

    async deleteCategory(id) {
      const { d } = cur();
      const moved = d.foods.filter((f) => f.category === id).map((f) => ({ ...f, category: 'other' }));
      await apply({ categories: { del: [id] }, foods: { put: moved } });
    },

    async setFoodStatus(foodId, status) {
      const p = ensurePrefs();
      const s = { ...p.status };
      if (status) s[foodId] = status;
      else delete s[foodId];
      let ranking = p.ranking.filter((id) => s[id] === 'like');
      if (status === 'like' && !ranking.includes(foodId)) ranking = [...ranking, foodId];
      await apply({ preferences: { put: [{ ...p, status: s, ranking, updatedAt: nowIso() }] } });
    },

    async setRanking(ids) {
      const p = ensurePrefs();
      await apply({ preferences: { put: [{ ...p, ranking: ids, updatedAt: nowIso() }] } });
    },

    async setRankingEnabled(on) {
      const p = ensurePrefs();
      await apply({ preferences: { put: [{ ...p, rankingEnabled: on, updatedAt: nowIso() }] } });
    },

    async savePlan(p) {
      const { d, s } = cur();
      // One current plan per household: a new plan replaces the old one, whose dinners count as "recent" for variety.
      const old = d.mealPlans.filter((x) => x.householdId === p.householdId && x.id !== p.id);
      const changes: Changes = { mealPlans: { put: [{ ...p, updatedAt: nowIso() }], del: old.map((x) => x.id) } };
      if (old.length) {
        const recent = old.flatMap((x) => x.days.map((day) => (day.selected !== null ? day.options[day.selected] : null))).filter(Boolean) as string[];
        changes.settings = { put: [{ ...s, recentRecipeIds: recent }] };
      }
      await apply(changes);
    },

    async deletePlan() {
      const { d, s, hid } = cur();
      const p = d.mealPlans.find((x) => x.householdId === hid);
      if (!p) return;
      const used = p.days.map((day) => (day.selected !== null ? day.options[day.selected] : null)).filter(Boolean) as string[];
      await apply({ mealPlans: { del: [p.id] }, settings: { put: [{ ...s, recentRecipeIds: used }] } });
    },

    async saveRecipe(r) {
      const map = toFoodMap(cur().d.foods);
      await apply({ recipes: { put: [refreshRecipe({ ...r, updatedAt: nowIso() }, map)] } });
    },

    async deleteRecipe(id) {
      const { d } = cur();
      const map = toFoodMap(d.foods);
      const recipes = new Map(d.recipes.filter((r) => r.id !== id).map((r) => [r.id, r]));
      const plans = d.mealPlans
        .filter((p) => p.days.some((day) => day.options.includes(id)))
        .map((p) => ({
          ...p,
          updatedAt: nowIso(),
          days: p.days.map((day) => {
            if (!day.options.includes(id)) return day;
            const slot = day.options.indexOf(id);
            const options = day.options.map((o) => (o === id ? null : o)) as typeof day.options;
            return { ...day, options, selected: day.selected === slot ? null : day.selected };
          }),
        }));
      const lists = d.shoppingLists
        .filter((l) => l.extraMeals?.some((e) => e.recipeId === id) || l.items.some((i) => i.source === 'plan'))
        .map((l) => {
          const extras = (l.extraMeals ?? []).filter((e) => e.recipeId !== id);
          const plan = plans.find((p) => p.householdId === l.householdId) ?? d.mealPlans.find((p) => p.householdId === l.householdId) ?? null;
          return { ...l, extraMeals: extras, items: mergeRegenerated(l, buildShoppingItems(plan, recipes, map, extras)), updatedAt: nowIso() };
        });
      await apply({
        recipes: { del: [id] },
        favourites: { del: d.favourites.filter((f) => f.recipeId === id).map((f) => f.id) },
        mealPlans: { put: plans },
        shoppingLists: { put: lists },
      });
    },

    async restoreRecipe(id) {
      const { d } = cur();
      const r = d.recipes.find((x) => x.id === id);
      if (!r?.originalIngredients) return;
      const map = toFoodMap(d.foods);
      const restored = refreshRecipe({ ...r, ingredients: r.originalIngredients, customised: false, originalIngredients: undefined, updatedAt: nowIso() }, map);
      await apply({ recipes: { put: [restored] } });
    },

    async toggleFavourite(recipeId) {
      const { d, hid } = cur();
      const id = `${hid}:${recipeId}`;
      if (d.favourites.some((f) => f.id === id)) await apply({ favourites: { del: [id] } });
      else {
        const fav: Favourite = { id, householdId: hid, recipeId, addedAt: nowIso() };
        await apply({ favourites: { put: [fav] } });
      }
    },

    async updateSavedMeal(f) {
      await apply({ favourites: { put: [f] } });
    },

    async saveTakeawayPlace(p) {
      await apply({ takeawayPlaces: { put: [{ ...p, updatedAt: nowIso() }] } });
    },

    async deleteTakeawayPlace(id) {
      // Planned nights keep the name they were saved with, so nothing in the plan breaks.
      await apply({ takeawayPlaces: { del: [id] } });
    },

    async saveTakeawayCategory(c) {
      await apply({ takeawayCategories: { put: [c] } });
    },

    async deleteTakeawayCategory(id) {
      const { d } = cur();
      const places = d.takeawayPlaces.filter((p) => p.categoryId === id).map((p) => ({ ...p, categoryId: 'other', updatedAt: nowIso() }));
      const plans = d.mealPlans
        .filter((p) => p.days.some((day) => day.takeaway?.categoryId === id))
        .map((p) => ({ ...p, days: p.days.map((day) => (day.takeaway?.categoryId === id ? { ...day, takeaway: { ...day.takeaway, categoryId: 'other' } } : day)) }));
      await apply({ takeawayCategories: { del: [id] }, takeawayPlaces: { put: places }, mealPlans: { put: plans } });
    },

    async saveSavedPlan(p) {
      await apply({ savedPlans: { put: [p] } });
    },

    async deleteSavedPlan(id) {
      await apply({ savedPlans: { del: [id] } });
    },

    async setShoppingView(v) {
      const { s } = cur();
      if (s.shoppingView !== v) await apply({ settings: { put: [{ ...s, shoppingView: v }] } });
    },

    async saveList(l) {
      await apply({ shoppingLists: { put: [{ ...l, updatedAt: nowIso() }] } });
    },

    async replaceAllData(next) {
      try {
        await db.replaceAll(next);
        ref.current = next;
        setData(next);
        setStorageOk(true);
      } catch (e) {
        throw new Error(`Could not write to local storage: ${(e as Error).message}`);
      }
    },

    async resetAll() {
      await store.replaceAllData(seedData());
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
