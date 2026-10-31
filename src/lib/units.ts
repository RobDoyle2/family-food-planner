import type { Food, Quantity, Unit } from '../types';
import { UNITS } from '../data/constants';

export type UnitFamily = 'mass' | 'volume' | 'count';

const TO_BASE: Partial<Record<Unit, { family: UnitFamily; factor: number }>> = {
  g: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  tsp: { family: 'volume', factor: 5 },
  tbsp: { family: 'volume', factor: 15 },
};

/** Units that can be added together. Count units only combine with the same unit. */
export function familyKey(unit: Unit): string {
  return TO_BASE[unit]?.family ?? `count:${unit}`;
}

export const isSpoon = (u: Unit) => u === 'tsp' || u === 'tbsp';

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}

/** Sensible rounding for a scaled recipe quantity (what you'd measure in the kitchen). */
export function roundRecipeAmount(amount: number, unit: Unit): number {
  if (amount <= 0) return 0;
  switch (unit) {
    case 'g':
    case 'ml':
      if (amount < 10) return Math.max(1, Math.round(amount));
      if (amount < 100) return roundTo(amount, 5);
      if (amount < 1000) return roundTo(amount, 10);
      return roundTo(amount, 25);
    case 'kg':
    case 'l':
      return roundTo(amount, 0.05);
    case 'tsp':
    case 'tbsp':
      return Math.max(0.25, roundTo(amount, 0.25));
    case 'pinch':
      return Math.max(1, Math.round(amount));
    default:
      // Countable things: halves are fine in a recipe (½ onion), never less than ¼.
      return Math.max(0.25, roundTo(amount, amount < 2 ? 0.25 : 0.5));
  }
}

/** Practical shopping rounding: whole items, tidy weights. */
export function roundShoppingAmount(amount: number, unit: Unit): number {
  if (amount <= 0) return 0;
  switch (unit) {
    case 'g':
    case 'ml':
      if (amount < 50) return Math.max(5, Math.ceil(amount / 5) * 5);
      if (amount < 500) return Math.ceil(amount / 10) * 10;
      return Math.ceil(amount / 50) * 50;
    case 'kg':
    case 'l':
      return Math.ceil(amount * 10) / 10;
    case 'tsp':
    case 'tbsp':
      return Math.max(0.5, Math.ceil(amount * 2) / 2);
    default:
      // Buy whole items; tolerate tiny overshoots from scaling (2.1 onions -> 2).
      return Math.max(1, Math.ceil(amount - 0.15));
  }
}

export function scaleAmount(amount: number, fromServings: number, toServings: number): number {
  if (fromServings <= 0) return amount;
  return (amount * toServings) / fromServings;
}

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [0.5, '½'],
  [0.75, '¾'],
];

export function formatNumber(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  for (const [v, s] of FRACTIONS) if (Math.abs(frac - v) < 0.01) return whole ? `${whole}${s}` : s;
  if (Math.abs(frac) < 0.01) return String(whole);
  return String(Math.round(n * 100) / 100);
}

export function unitLabel(unit: Unit, amount: number): string {
  const u = UNITS.find((x) => x.id === unit);
  if (!u) return unit;
  return amount > 1 ? u.plural : u.label;
}

/** "500 g", "1.2 kg", "2 cloves", "½ tsp". Count "item" units read as bare numbers. */
export function formatQuantity(q: Quantity): string {
  let { amount, unit } = q;
  if (unit === 'g' && amount >= 1000) {
    amount = amount / 1000;
    unit = 'kg';
  } else if (unit === 'ml' && amount >= 1000) {
    amount = amount / 1000;
    unit = 'l';
  }
  const num = unit === 'kg' || unit === 'l' ? String(Math.round(amount * 100) / 100) : formatNumber(amount);
  if (unit === 'item') return num;
  if (unit === 'g' || unit === 'kg' || unit === 'ml') return `${num} ${unit}`;
  return `${num} ${unitLabel(unit, amount)}`;
}

/**
 * Adds quantities together, merging only compatible units.
 * Mass merges into grams, volume into millilitres (or spoons if only spoons were used),
 * counts merge only with the identical unit.
 */
export function combineQuantities(list: Quantity[]): Quantity[] {
  const groups = new Map<string, Quantity[]>();
  for (const q of list) {
    const k = familyKey(q.unit);
    groups.set(k, [...(groups.get(k) ?? []), q]);
  }
  const out: Quantity[] = [];
  for (const [key, qs] of groups) {
    if (key === 'mass') {
      out.push({ amount: qs.reduce((s, q) => s + q.amount * TO_BASE[q.unit]!.factor, 0), unit: 'g' });
    } else if (key === 'volume') {
      const allSpoons = qs.every((q) => isSpoon(q.unit));
      const ml = qs.reduce((s, q) => s + q.amount * TO_BASE[q.unit]!.factor, 0);
      // Spoon measures read naturally up to ~6 tbsp; beyond that a bottle volume is clearer.
      if (allSpoons && ml <= 90) {
        out.push(ml >= 15 && (qs.some((q) => q.unit === 'tbsp') || ml % 15 === 0) ? { amount: ml / 15, unit: 'tbsp' } : { amount: ml / 5, unit: 'tsp' });
      } else out.push({ amount: ml, unit: 'ml' });
    } else {
      out.push({ amount: qs.reduce((s, q) => s + q.amount, 0), unit: qs[0].unit });
    }
  }
  return out;
}

/** e.g. "≈ 2 packs (500 g)" for mince, when the food has a known pack size. */
export function packHint(q: Quantity, food?: Food): string | null {
  if (!food?.pack) return null;
  const { pack } = food;
  const base = TO_BASE[q.unit];
  const packBase = TO_BASE[pack.unit];
  let packs: number;
  if (base && packBase) {
    if (base.family !== packBase.family) return null;
    packs = Math.ceil((q.amount * base.factor) / (pack.size * packBase.factor) - 0.05);
  } else if (!base && !packBase && q.unit === pack.unit) {
    // Counted things sold in bigger units, e.g. garlic cloves -> bulbs, celery sticks -> heads.
    packs = Math.ceil(q.amount / pack.size - 0.05);
  } else return null;
  if (packs < 1) return null;
  const label = packs > 1 ? `${pack.label}s` : pack.label;
  const countUnit = pack.unit === 'item' || pack.unit === 'clove';
  return countUnit ? `≈ ${packs} ${label}` : `≈ ${packs} ${label} (${formatQuantity({ amount: pack.size, unit: pack.unit })})`;
}
