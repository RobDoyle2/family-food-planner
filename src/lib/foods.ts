import type { Aisle, CategoryId, Food } from '../types';

export type FoodMap = Map<string, Food>;

export const toFoodMap = (foods: Food[]): FoodMap => new Map(foods.map((f) => [f.id, f]));

/** The food itself plus all of its parent groups, e.g. salmon -> [salmon, fish]. */
export function lineage(foodId: string, foods: FoodMap): string[] {
  const out: string[] = [];
  let current: string | undefined = foodId;
  while (current && !out.includes(current)) {
    out.push(current);
    current = foods.get(current)?.parent;
  }
  return out;
}

/** Every food id an ingredient represents: itself, its parents, its components and their parents. */
export function expandFood(foodId: string, foods: FoodMap, seen = new Set<string>()): Set<string> {
  if (seen.has(foodId)) return seen;
  for (const id of lineage(foodId, foods)) seen.add(id);
  for (const c of foods.get(foodId)?.components ?? []) expandFood(c, foods, seen);
  return seen;
}

/** Child foods of a group (for display such as "Fish: cod, salmon, …"). */
export function childrenOf(foodId: string, foods: Food[]): Food[] {
  return foods.filter((f) => f.parent === foodId);
}

/** Lower-case, strip accents/punctuation and simple English plurals for comparisons. */
export function normaliseName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base
    .split(' ')
    .map((w) => {
      if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2);
      if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
      if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
      return w;
    })
    .join(' ');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export interface DuplicateMatch {
  food: Food;
  kind: 'exact' | 'similar';
}

/** Finds catalogue foods equivalent or very similar to the proposed name. */
export function findDuplicates(name: string, foods: Food[], ignoreId?: string): DuplicateMatch[] {
  const n = normaliseName(name);
  if (n.length < 2) return [];
  const matches: DuplicateMatch[] = [];
  for (const f of foods) {
    if (f.id === ignoreId) continue;
    const names = [f.name, ...(f.aliases ?? [])].map(normaliseName);
    if (names.includes(n)) {
      matches.push({ food: f, kind: 'exact' });
      continue;
    }
    const close = names.some((x) => {
      if (n.length >= 5 && x.length >= 5 && levenshtein(n, x) <= (n.length >= 7 ? 2 : 1)) return true;
      return false;
    });
    if (close) matches.push({ food: f, kind: 'similar' });
  }
  return matches.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'exact' ? -1 : 1)).slice(0, 4);
}

const CATEGORY_KEYWORDS: { category: CategoryId; aisle: Aisle; words: string[] }[] = [
  {
    category: 'protein',
    aisle: 'meat',
    words: [
      'beef', 'steak', 'mince', 'chicken', 'pork', 'ham', 'bacon', 'rasher', 'sausage', 'chorizo', 'salami', 'lamb', 'mutton',
      'turkey', 'duck', 'goose', 'venison', 'rabbit', 'fish', 'cod', 'hake', 'haddock', 'pollock', 'plaice', 'sole', 'mackerel',
      'salmon', 'trout', 'tuna', 'sardine', 'anchovy', 'prawn', 'shrimp', 'crab', 'lobster', 'mussel', 'clam', 'oyster', 'scallop',
      'squid', 'calamari', 'egg', 'tofu', 'tempeh', 'seitan', 'quorn', 'lentil', 'bean', 'chickpea', 'pudding', 'meatball', 'liver',
      'halloumi', 'paneer',
    ],
  },
  {
    category: 'carbs',
    aisle: 'dry-goods',
    words: [
      'pasta', 'spaghetti', 'penne', 'fusilli', 'linguine', 'tagliatelle', 'macaroni', 'lasagne', 'gnocchi', 'noodle', 'rice', 'couscous',
      'quinoa', 'bulgur', 'barley', 'oat', 'polenta', 'bread', 'loaf', 'roll', 'bagel', 'bap', 'wrap', 'tortilla', 'pitta', 'naan',
      'flatbread', 'baguette', 'crumpet', 'scone', 'potato', 'spud', 'chip', 'wedge', 'pastry', 'pizza base', 'cracker',
    ],
  },
  {
    category: 'vegetables',
    aisle: 'fruit-veg',
    words: [
      'carrot', 'broccoli', 'cauliflower', 'pea', 'green bean', 'sweetcorn', 'corn', 'pepper', 'onion', 'shallot', 'mushroom', 'spinach',
      'cabbage', 'kale', 'courgette', 'zucchini', 'aubergine', 'eggplant', 'tomato', 'leek', 'celery', 'celeriac', 'parsnip', 'turnip',
      'swede', 'squash', 'pumpkin', 'cucumber', 'lettuce', 'rocket', 'salad', 'beetroot', 'radish', 'asparagus', 'sprout', 'artichoke',
      'fennel', 'chard', 'pak choi', 'bok choy', 'chilli', 'avocado', 'okra', 'mangetout', 'sugar snap', 'edamame',
    ],
  },
  {
    category: 'other',
    aisle: 'dairy',
    words: ['cheese', 'cheddar', 'brie', 'mozzarella', 'parmesan', 'feta', 'ricotta', 'milk', 'cream', 'yoghurt', 'yogurt', 'butter', 'kefir'],
  },
  {
    category: 'other',
    aisle: 'tinned',
    words: ['sauce', 'ketchup', 'mayo', 'mustard', 'pesto', 'paste', 'chutney', 'relish', 'stock', 'gravy', 'vinegar', 'tinned', 'jar'],
  },
  {
    category: 'other',
    aisle: 'dry-goods',
    words: ['herb', 'spice', 'salt', 'oil', 'flour', 'sugar', 'honey', 'cumin', 'paprika', 'curry', 'masala', 'cinnamon', 'nutmeg', 'thyme', 'basil', 'oregano', 'rosemary', 'sage', 'dill', 'seed', 'nut', 'almond', 'walnut'],
  },
  {
    category: 'other',
    aisle: 'fruit-veg',
    words: ['apple', 'pear', 'banana', 'orange', 'lemon', 'lime', 'berry', 'grape', 'plum', 'mango', 'pineapple', 'melon', 'garlic', 'ginger'],
  },
];

const FISH_WORDS = ['fish', 'cod', 'hake', 'haddock', 'pollock', 'plaice', 'sole', 'mackerel', 'salmon', 'trout', 'tuna', 'sardine', 'anchov', 'prawn', 'shrimp', 'crab', 'lobster', 'mussel', 'clam', 'oyster', 'scallop', 'squid', 'calamari'];

export interface CategorySuggestion {
  category: CategoryId;
  aisle: Aisle;
  reason: string;
}

/** Best-effort category suggestion for a new food name. Returns null when unsure. */
export function suggestCategory(name: string, foods: Food[]): CategorySuggestion | null {
  const n = normaliseName(name);
  if (n.length < 3) return null;
  // 1. A catalogue food whose name appears inside the new name ("smoked salmon" -> salmon).
  const words = n.split(' ');
  let best: Food | null = null;
  for (const f of foods) {
    if (f.custom) continue;
    const fn = normaliseName(f.name);
    const hit = fn.split(' ').every((w) => words.includes(w));
    if (hit && (!best || fn.length > normaliseName(best.name).length)) best = f;
  }
  if (best) return { category: best.category, aisle: best.aisle, reason: `similar to “${best.name}”` };
  // 2. Keyword lists: the longest keyword that starts a word wins ("eggplant" beats "egg").
  let hit: { group: (typeof CATEGORY_KEYWORDS)[number]; kw: string } | null = null;
  for (const group of CATEGORY_KEYWORDS) {
    for (const kw of group.words) {
      const matches = kw.includes(' ') ? n.includes(kw) : words.some((w) => w.startsWith(kw));
      if (matches && (!hit || kw.length > hit.kw.length)) hit = { group, kw };
    }
  }
  if (hit) {
    const fishy = FISH_WORDS.some((w) => words.some((x) => x.startsWith(w)));
    const aisle = hit.group.aisle === 'meat' && fishy ? 'fish' : hit.group.aisle;
    return { category: hit.group.category, aisle, reason: `contains “${hit.kw}”` };
  }
  return null;
}

export const DEFAULT_AISLE_FOR_CATEGORY: Record<string, Aisle> = {
  protein: 'meat',
  vegetables: 'fruit-veg',
  carbs: 'dry-goods',
  other: 'other',
};

/** Simple case-insensitive partial-match search over names, aliases and descriptions. */
export function searchFoods(query: string, foods: Food[]): Food[] {
  const q = normaliseName(query);
  if (!q) return foods;
  const raw = query.toLowerCase().trim();
  const scored: { f: Food; s: number }[] = [];
  for (const f of foods) {
    const name = f.name.toLowerCase();
    const names = [name, ...(f.aliases ?? []).map((x) => x.toLowerCase())];
    let s = 0;
    if (name.startsWith(raw)) s = 4;
    else if (names.some((x) => x.startsWith(raw))) s = 3;
    else if (names.some((x) => x.split(/\s+/).some((w) => w.startsWith(raw)))) s = 2;
    else if (names.some((x) => x.includes(raw) || normaliseName(x).includes(q))) s = 1;
    else if (f.description?.toLowerCase().includes(raw)) s = 0.5;
    if (s > 0) scored.push({ f, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.f.name.localeCompare(b.f.name)).map((x) => x.f);
}
