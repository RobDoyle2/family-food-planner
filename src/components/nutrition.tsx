// Nutrition estimates, calculated from the recipe's own ingredient quantities.
import { useState } from 'react';
import type { Recipe } from '../types';
import { useStore } from '../state/store';
import { NUTRIENT_KEYS, REFERENCE_INTAKE, fmtNutrient, gramsOf, nutrientsFor, recipeNutrition, type Nutrients } from '../lib/nutrition';

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
      <details className="nut-breakdown">
        <summary>Per ingredient (per serving)</summary>
        <table className="nut-table">
          <thead>
            <tr>
              <th scope="col">Ingredient</th>
              <th scope="col">kcal</th>
              <th scope="col">Protein</th>
              <th scope="col">Carbs</th>
              <th scope="col">Fat</th>
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((ing, i) => {
              const per = nutrientsFor(ing.foodId, foodMap);
              const g = gramsOf(ing);
              const name = foodMap.get(ing.foodId)?.name ?? ing.foodId;
              if (!per || g === null)
                return (
                  <tr key={i}>
                    <th scope="row">{name}</th>
                    <td colSpan={4} className="muted">no data</td>
                  </tr>
                );
              const f = g / 100 / n.servings;
              return (
                <tr key={i}>
                  <th scope="row">{name}</th>
                  <td>{Math.round(per.kcal * f)}</td>
                  <td>{fmtNutrient('protein', per.protein * f)} g</td>
                  <td>{fmtNutrient('carbs', per.carbs * f)} g</td>
                  <td>{fmtNutrient('fat', per.fat * f)} g</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
      <p className="hint">
        Estimated from the ingredient quantities using typical values from public food tables (USDA FoodData Central, UK CoFID). Brands, cuts and cooking change the real figures. Bars show a share of an adult's reference intake. This is general information, not medical or dietary advice.
        {n.missing.length > 0 && ` Not included (no data): ${n.missing.join(', ')}.`}
      </p>
    </section>
  );
}
