// Nutrition estimates, calculated from the recipe's own ingredient quantities.
import { useState } from 'react';
import type { Recipe } from '../types';
import { useStore } from '../state/store';
import { NUTRIENT_KEYS, REFERENCE_INTAKE, fmtNutrient, recipeNutrition, type Nutrients } from '../lib/nutrition';

const LABELS: Record<keyof Nutrients, { label: string; unit: string }> = {
  kcal: { label: 'Energy', unit: 'kcal' },
  protein: { label: 'Protein', unit: 'g' },
  carbs: { label: 'Carbohydrate', unit: 'g' },
  fat: { label: 'Fat', unit: 'g' },
  fibre: { label: 'Fibre', unit: 'g' },
  satFat: { label: 'of which saturates', unit: 'g' },
  sugar: { label: 'Sugars', unit: 'g' },
  salt: { label: 'Salt', unit: 'g' },
};

export function NutritionCard({ recipe, portions }: { recipe: Recipe; portions: number }) {
  const { foodMap } = useStore();
  const [view, setView] = useState<'serving' | 'recipe'>('serving');
  const n = recipeNutrition(recipe, foodMap);
  const values = view === 'serving' ? n.perServing : Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, n.perServing[k] * portions])) as unknown as Nutrients;
  return (
    <section className="card nutrition-card" aria-labelledby="nut-h">
      <h2 id="nut-h" className="card-title">
        Nutrition <span className="badge badge-soft">Estimate</span>
      </h2>
      <div className="seg small" role="tablist" aria-label="Nutrition for">
        <button role="tab" aria-selected={view === 'serving'} className={view === 'serving' ? 'active' : ''} onClick={() => setView('serving')}>
          Per serving
        </button>
        <button role="tab" aria-selected={view === 'recipe'} className={view === 'recipe' ? 'active' : ''} onClick={() => setView('recipe')}>
          Whole recipe ({portions})
        </button>
      </div>
      <dl className="nutrients">
        {NUTRIENT_KEYS.map((k) => (
          <div key={k} className={`nutrient nutrient-${k}`}>
            <dt>{LABELS[k].label}</dt>
            <dd>
              {fmtNutrient(k, values[k])} {LABELS[k].unit}
              {view === 'serving' && (
                <span className="nut-bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (values[k] / REFERENCE_INTAKE[k]) * 100)}%` }} />
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="hint">
        Estimated from the ingredient quantities using typical values from public food tables (USDA FoodData Central, UK CoFID). Brands, cuts and cooking change the real figures. Bars show a share of an adult's reference intake. This is general information, not medical or dietary advice.
        {n.missing.length > 0 && ` Not included (no data): ${n.missing.join(', ')}.`}
      </p>
    </section>
  );
}
