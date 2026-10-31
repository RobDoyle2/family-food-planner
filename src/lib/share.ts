// Sharing a recipe as a readable text summary. Contains only recipe information:
// never household names, family profiles or preferences.
import type { Recipe } from '../types';
import type { FoodMap } from './foods';
import { allergenLabel, dietLabel } from '../data/constants';
import { formatQuantity, roundRecipeAmount, scaleAmount } from './units';

export function recipeShareText(recipe: Recipe, foods: FoodMap, portions = recipe.servings): string {
  const lines: string[] = [];
  lines.push(`🍽️ ${recipe.name}`);
  lines.push(recipe.description);
  lines.push('');
  lines.push(`⏱ Prep ${recipe.prepMinutes} min · Cook ${recipe.cookMinutes} min · Serves ${portions}`);
  if (recipe.dietaryTags.length) lines.push(`✓ ${recipe.dietaryTags.map(dietLabel).join(', ')}`);
  lines.push(recipe.allergens.length ? `⚠ Contains: ${recipe.allergens.map(allergenLabel).join(', ')}` : '⚠ No major allergens in the listed ingredients');
  lines.push('');
  lines.push('INGREDIENTS');
  for (const i of recipe.ingredients) {
    const q = formatQuantity({ amount: roundRecipeAmount(scaleAmount(i.amount, recipe.servings, portions), i.unit), unit: i.unit });
    lines.push(`• ${q} ${foods.get(i.foodId)?.name ?? ''}${i.note ? `, ${i.note}` : ''}`);
  }
  lines.push('');
  lines.push('METHOD');
  recipe.steps.forEach((s, n) => lines.push(`${n + 1}. ${s}`));
  lines.push('');
  lines.push('Always check product labels for allergens.');
  lines.push('Shared from Family Food Planner — Great food. Happy families. Dinner sorted.');
  return lines.join('\n');
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'manual';

async function imageFile(recipe: Recipe): Promise<File | null> {
  if (!recipe.image) return null;
  try {
    const blob = await (await fetch(recipe.image)).blob();
    return new File([blob], `${recipe.id}.jpg`, { type: blob.type || 'image/jpeg' });
  } catch {
    return null;
  }
}

/**
 * Shares with the device's share sheet where available (including the photo if there is one),
 * otherwise copies the summary. 'manual' means neither worked and the text should be shown to copy by hand.
 */
export async function shareText(title: string, text: string, recipe?: Recipe): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function') {
    try {
      const file = recipe ? await imageFile(recipe) : null;
      const withFile: ShareData = file ? { title, text, files: [file] } : { title, text };
      await nav.share(file && nav.canShare?.(withFile) ? withFile : { title, text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // Not allowed here (e.g. inside an embedded page): fall through to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'manual';
  }
}
