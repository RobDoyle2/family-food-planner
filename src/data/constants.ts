import type { AllergenId, Aisle, Category, DietId, NutritionPrefId, Unit } from '../types';

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
  { id: 'meat-fish', label: 'Meat and fish', emoji: '🥩' },
  { id: 'fruit-veg', label: 'Fruit and vegetables', emoji: '🥕' },
  { id: 'dairy', label: 'Dairy', emoji: '🧀' },
  { id: 'bakery', label: 'Bakery', emoji: '🍞' },
  { id: 'dry-goods', label: 'Dry goods', emoji: '🌾' },
  { id: 'tinned', label: 'Tinned and packaged goods', emoji: '🥫' },
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
export const SEED_VERSION = 2;

export const ADULT_AGE = 18;
