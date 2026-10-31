// Core data types for Family Food Planner.

/** The 14 allergens that must be declared on food labels in Ireland / the EU. */
export type AllergenId =
  | 'gluten'
  | 'crustaceans'
  | 'eggs'
  | 'fish'
  | 'peanuts'
  | 'soya'
  | 'milk'
  | 'nuts'
  | 'celery'
  | 'mustard'
  | 'sesame'
  | 'sulphites'
  | 'lupin'
  | 'molluscs';

export type DietId =
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'gluten-free'
  | 'dairy-free'
  | 'no-pork'
  | 'no-beef';

export type NutritionPrefId = 'more-veg' | 'higher-protein' | 'less-red-meat' | 'more-fish';

/** Built-in categories are fixed; user categories have ids starting with "cat_". */
export type CategoryId = string;

export interface Category {
  id: CategoryId;
  name: string;
  emoji: string;
  builtIn: boolean;
}

export type Aisle = 'meat-fish' | 'fruit-veg' | 'dairy' | 'bakery' | 'dry-goods' | 'tinned' | 'other';

/** How trustworthy a food's allergen / dietary information is. */
export type AllergenInfoStatus = 'verified' | 'declared' | 'unknown';

export interface DietFlags {
  meat?: boolean;
  fish?: boolean; // fish or shellfish
  animal?: boolean; // any animal product (meat, fish, dairy, egg, honey)
  pork?: boolean;
  beef?: boolean;
}

export interface Food {
  id: string;
  name: string;
  category: CategoryId;
  emoji: string;
  description?: string;
  /** Data URL of a user supplied photo. */
  image?: string;
  aliases?: string[];
  /** Parent food group, e.g. salmon -> fish. Exclusions of a parent apply to children. */
  parent?: string;
  allergens: AllergenId[];
  allergenInfo: AllergenInfoStatus;
  /** Other foods this product contains (e.g. pesto contains basil, parmesan, nuts). */
  components?: string[];
  diet: DietFlags;
  aisle: Aisle;
  /** Processed product whose recipe varies by brand: always check the label. */
  labelCheck?: boolean;
  /** Less widely stocked in typical Irish supermarkets. */
  specialty?: boolean;
  /** Typical pack size for shopping hints. */
  pack?: { size: number; unit: 'g' | 'ml' | 'item' | 'clove'; label: string };
  /** Fresh items that spoil quickly; reusing them across the week reduces waste. */
  perishable?: boolean;
  custom?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type Unit =
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'tsp'
  | 'tbsp'
  | 'item'
  | 'clove'
  | 'tin'
  | 'pack'
  | 'slice'
  | 'bunch'
  | 'pinch';

export type IngredientRole = 'protein' | 'veg' | 'carb' | 'other';

export interface RecipeIngredient {
  foodId: string;
  amount: number;
  unit: Unit;
  role: IngredientRole;
  note?: string;
}

export type Difficulty = 'Easy' | 'Medium' | 'Harder';

export interface Recipe {
  id: string;
  name: string;
  description: string;
  emoji: string;
  image?: string;
  cuisine: string;
  mainProtein: string; // food id
  /** Used to avoid repeating the same protein on consecutive days. */
  proteinGroup: string;
  ingredients: RecipeIngredient[];
  prepMinutes: number;
  cookMinutes: number;
  difficulty: Difficulty;
  servings: number;
  steps: string[];
  /** Derived from ingredients when the record is built. */
  dietaryTags: DietId[];
  allergens: AllergenId[];
  /** Every food id present, including nested components and parent groups. */
  components: string[];
  builtIn: boolean;
  customised?: boolean;
  originalIngredients?: RecipeIngredient[];
  updatedAt?: string;
}

export type Sex = '' | 'female' | 'male' | 'other';

export type Restriction = { kind: 'allergen'; id: AllergenId } | { kind: 'food'; id: string };

export interface Household {
  id: string;
  name: string;
  country: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  householdId: string;
  name: string;
  age: number;
  sex: Sex;
  allergies: Restriction[];
  intolerances: Restriction[];
  dietary: DietId[];
  dislikes: string[]; // food ids
  nutrition: NutritionPrefId[]; // adults only
  createdAt: string;
  updatedAt: string;
}

export type FoodStatus = 'like' | 'dislike' | 'exclude';

export interface FoodPreferences {
  id: string; // = householdId
  householdId: string;
  status: Record<string, FoodStatus>;
  /** Ordered favourite food ids (most loved first). Only used when rankingEnabled. */
  ranking: string[];
  rankingEnabled: boolean;
  updatedAt: string;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  options: [string | null, string | null];
  selected: 0 | 1 | null;
  skipped: boolean;
  eaters: string[]; // member ids
  guests: number;
  /** Manual portion override; null means "one per person eating". */
  portions: number | null;
  /** Recipes the user replaced for this day, never re-suggested for it. */
  rejected: string[];
  issue?: string;
}

export interface MealPlan {
  id: string;
  householdId: string;
  startDate: string;
  seed: number;
  maxMinutes: number | null;
  days: PlanDay[];
  createdAt: string;
  updatedAt: string;
}

export interface Quantity {
  amount: number;
  unit: Unit;
}

export interface ShoppingItem {
  id: string;
  /** foodId for generated items, generated id for manual items. */
  key: string;
  foodId?: string;
  name: string;
  aisle: Aisle;
  quantities: Quantity[];
  have: boolean;
  source: 'plan' | 'manual';
  recipes: string[];
  edited?: boolean;
  labelCheck?: boolean;
}

export interface ShoppingList {
  id: string; // = householdId
  householdId: string;
  planId: string | null;
  items: ShoppingItem[];
  generatedAt: string | null;
  updatedAt: string;
}

export interface Favourite {
  id: string; // `${householdId}:${recipeId}`
  householdId: string;
  recipeId: string;
  addedAt: string;
}

export interface Settings {
  id: 'app';
  activeHouseholdId: string | null;
  seedVersion: number;
  /** Recipes from the previous plan, gently de-prioritised for variety. */
  recentRecipeIds: string[];
}

export interface AppData {
  households: Household[];
  members: Member[];
  foods: Food[];
  categories: Category[];
  preferences: FoodPreferences[];
  recipes: Recipe[];
  mealPlans: MealPlan[];
  shoppingLists: ShoppingList[];
  favourites: Favourite[];
  settings: Settings[];
}

export type StoreName = keyof AppData;
