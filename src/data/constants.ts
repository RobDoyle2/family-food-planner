import type { AllergenId, Aisle, Category, DietId, NutritionPrefId, TakeawayCategory, Unit } from '../types';

export const ALLERGENS: { id: AllergenId; label: string; hint: string }[] = [
  { id: 'gluten', label: 'Gluten (cereals)', hint: 'Wheat, barley, rye, oats, spelt' },
  { id: 'milk', label: 'Milk', hint: 'Includes lactose and all dairy' },
  { id: 'eggs', label: 'Eggs', hint: '' },
  { id: 'fish', label: 'Fish', hint: '' },
  { id: 'crustaceans', label: 'Crustaceans', hint: 'Prawns, crab, lobster' },
  { id: 'molluscs', label: 'Molluscs', hint: 'Mussels, clams, squid' },
  { id: 'peanuts', label: 'Peanuts', hint: '' },
  { id: 'nuts', label: 'Tree nuts', hint: 'Almonds, cashews, walnuts…' },
  { id: 'soya', label: 'Soya', hint: '' },
  { id: 'sesame', label: 'Sesame', hint: '' },
  { id: 'celery', label: 'Celery', hint: 'Including celeriac and celery salt' },
  { id: 'mustard', label: 'Mustard', hint: '' },
  { id: 'sulphites', label: 'Sulphites', hint: 'Sulphur dioxide' },
  { id: 'lupin', label: 'Lupin', hint: '' },
];

export const allergenLabel = (id: AllergenId) => ALLERGENS.find((a) => a.id === id)?.label ?? id;

export const DIETS: { id: DietId; label: string }[] = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'pescatarian', label: 'Pescatarian' },
  { id: 'gluten-free', label: 'Gluten-free' },
  { id: 'dairy-free', label: 'Dairy-free' },
  { id: 'no-pork', label: 'No pork' },
  { id: 'no-beef', label: 'No beef' },
];

export const dietLabel = (id: DietId) => DIETS.find((d) => d.id === id)?.label ?? id;

export const NUTRITION_PREFS: { id: NutritionPrefId; label: string }[] = [
  { id: 'more-veg', label: 'More vegetables' },
  { id: 'higher-protein', label: 'Lean protein' },
  { id: 'less-red-meat', label: 'Less red meat' },
  { id: 'more-fish', label: 'More fish' },
];

export const BUILT_IN_CATEGORIES: Category[] = [
  { id: 'protein', name: 'Meat & protein', emoji: '🍗', builtIn: true },
  { id: 'vegetables', name: 'Vegetables', emoji: '🥦', builtIn: true },
  { id: 'carbs', name: 'Carbohydrates', emoji: '🍝', builtIn: true },
  { id: 'other', name: 'Other ingredients', emoji: '🧂', builtIn: true },
];

/** Built-in categories in their fixed order, then the family's own categories alphabetically. */
export function sortCategories(list: Category[]): Category[] {
  const order = new Map(BUILT_IN_CATEGORIES.map((c, i) => [c.id, i]));
  return [...list].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99) || a.name.localeCompare(b.name));
}

export const AISLES: { id: Aisle; label: string; emoji: string }[] = [
  { id: 'fruit-veg', label: 'Fruit and vegetables', emoji: '🥕' },
  { id: 'meat', label: 'Meat and poultry', emoji: '🥩' },
  { id: 'fish', label: 'Fish and seafood', emoji: '🐟' },
  { id: 'dairy', label: 'Dairy and eggs', emoji: '🧀' },
  { id: 'bakery', label: 'Bakery', emoji: '🍞' },
  { id: 'dry-goods', label: 'Dry goods and pasta', emoji: '🌾' },
  { id: 'tinned', label: 'Tinned and packaged goods', emoji: '🥫' },
  { id: 'frozen', label: 'Frozen foods', emoji: '🧊' },
  { id: 'sauces', label: 'Sauces, herbs and spices', emoji: '🌿' },
  { id: 'other', label: 'Other', emoji: '🛒' },
];

export const aisleLabel = (id: Aisle) => AISLES.find((a) => a.id === id)?.label ?? id;

export const UNITS: { id: Unit; label: string; plural: string }[] = [
  { id: 'g', label: 'g', plural: 'g' },
  { id: 'kg', label: 'kg', plural: 'kg' },
  { id: 'ml', label: 'ml', plural: 'ml' },
  { id: 'l', label: 'litre', plural: 'litres' },
  { id: 'tsp', label: 'tsp', plural: 'tsp' },
  { id: 'tbsp', label: 'tbsp', plural: 'tbsp' },
  { id: 'item', label: 'item', plural: 'items' },
  { id: 'clove', label: 'clove', plural: 'cloves' },
  { id: 'tin', label: 'tin', plural: 'tins' },
  { id: 'pack', label: 'pack', plural: 'packs' },
  { id: 'slice', label: 'slice', plural: 'slices' },
  { id: 'bunch', label: 'bunch', plural: 'bunches' },
  { id: 'pinch', label: 'pinch', plural: 'pinches' },
];

export const COUNTRIES = [
  'Ireland',
  'United Kingdom',
  'France',
  'Germany',
  'Spain',
  'Italy',
  'Netherlands',
  'Belgium',
  'Portugal',
  'Poland',
  'United States',
  'Canada',
  'Australia',
  'New Zealand',
  'Other',
];

/** Recipes and catalogue are re-seeded when this number increases. */
export const SEED_VERSION = 3;

/** Format of stored data. 2 = takeaways, saved plans, 10 shop sections, day modes. */
export const DATA_VERSION = 2;

export const TAKEAWAY_CATEGORIES: TakeawayCategory[] = [
  { id: 'chinese', name: 'Chinese', emoji: '🥡', builtIn: true },
  { id: 'indian', name: 'Indian', emoji: '🍛', builtIn: true },
  { id: 'chipper', name: 'Fish and chips / Chipper', emoji: '🍟', builtIn: true },
  { id: 'pizza', name: 'Pizza', emoji: '🍕', builtIn: true },
  { id: 'kebab', name: 'Kebab', emoji: '🥙', builtIn: true },
  { id: 'thai', name: 'Thai', emoji: '🍜', builtIn: true },
  { id: 'japanese', name: 'Japanese / Sushi', emoji: '🍣', builtIn: true },
  { id: 'burgers', name: 'Burgers', emoji: '🍔', builtIn: true },
  { id: 'mexican', name: 'Mexican', emoji: '🌮', builtIn: true },
  { id: 'fried-chicken', name: 'Fried chicken', emoji: '🍗', builtIn: true },
  { id: 'lebanese', name: 'Lebanese / Middle Eastern', emoji: '🧆', builtIn: true },
  { id: 'greek', name: 'Mediterranean / Greek', emoji: '🫒', builtIn: true },
  { id: 'sandwiches', name: 'Sandwiches and wraps', emoji: '🥪', builtIn: true },
  { id: 'other', name: 'Other takeaway', emoji: '🛍️', builtIn: true },
];

export const ADULT_AGE = 18;
