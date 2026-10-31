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

/** Shop sections, in walking order. ("meat-fish" is a legacy value migrated on load.) */
export type Aisle = 'fruit-veg' | 'meat' | 'fish' | 'dairy' | 'bakery' | 'dry-goods' | 'tinned' | 'frozen' | 'sauces' | 'other';

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
  /** Created by the family (an "Own recipe"). */
  own?: boolean;
  createdAt?: string;
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

/** What happens on a day: cook a recipe, have a takeaway, or nothing planned. */
export type DayMode = 'cook' | 'takeaway' | 'none';

export interface TakeawayChoice {
  categoryId: string;
  /** A saved favourite takeaway place, if one was chosen. */
  placeId?: string;
  /** Restaurant or takeaway name typed for this night. */
  name?: string;
  note?: string;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  options: [string | null, string | null];
  selected: 0 | 1 | null;
  mode: DayMode;
  takeaway?: TakeawayChoice;
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

/** A recipe added straight to the shopping list (not via the plan), at a number of portions. */
export interface ExtraMeal {
  recipeId: string;
  portions: number;
}

export interface ShoppingList {
  id: string; // = householdId
  householdId: string;
  planId: string | null;
  /** Recipes added from a recipe page; their ingredients are combined with the plan's. */
  extraMeals?: ExtraMeal[];
  items: ShoppingItem[];
  generatedAt: string | null;
  updatedAt: string;
}

/** A saved meal ("My Saved Meals"). */
export interface Favourite {
  id: string; // `${householdId}:${recipeId}`
  householdId: string;
  recipeId: string;
  addedAt: string;
  /** "We loved it" — a meal the family particularly enjoyed. */
  loved?: boolean;
  note?: string;
}

export interface TakeawayCategory {
  id: string;
  name: string;
  emoji: string;
  builtIn: boolean;
}

/** A favourite takeaway place. */
export interface TakeawayPlace {
  id: string;
  householdId: string;
  name: string;
  categoryId: string;
  address?: string;
  phone?: string;
  website?: string;
  /** Favourite dishes or the usual order. */
  usualOrder?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedPlanDay {
  mode: DayMode;
  recipeId?: string;
  takeaway?: TakeawayChoice;
}

/** A weekly plan kept as a reusable template. */
export interface SavedPlan {
  id: string;
  householdId: string;
  name: string;
  days: SavedPlanDay[];
  createdAt: string;
}

export type ShoppingView = 'shop' | 'full';

export interface Settings {
  id: 'app';
  activeHouseholdId: string | null;
  seedVersion: number;
  /** Recipes from the previous plan, gently de-prioritised for variety. */
  recentRecipeIds: string[];
  /** Shopping list view the user last chose. */
  shoppingView?: ShoppingView;
  /** Data format version; older data is migrated on load. */
  dataVersion?: number;
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
  takeawayPlaces: TakeawayPlace[];
  takeawayCategories: TakeawayCategory[];
  savedPlans: SavedPlan[];
}

export type StoreName = keyof AppData;
