import { useMemo, useState } from 'react';
import type { IngredientRole, Recipe, RecipeIngredient, Unit } from '../types';
import { useStore } from '../state/store';
import { go, useConfirm, useToast } from '../state/ui';
import { EmptyState, FoodPicker, RecipeImage, Stepper } from '../components/common';
import { SaveMealButton, ShareButton } from '../components/actions';
import { useAddRecipeToList } from './PlannerPage';
import { analyseIngredients } from '../lib/recipes';
import { checkRecipeForDay, evaluateRecipe } from '../lib/planner';
import { formatQuantity, roundRecipeAmount, scaleAmount } from '../lib/units';
import { allergenLabel, dietLabel, UNITS } from '../data/constants';
import { formatDay, resizeImage } from '../lib/util';

const ROLES: { id: IngredientRole; label: string }[] = [
  { id: 'protein', label: 'Main protein' },
  { id: 'veg', label: 'Vegetables' },
  { id: 'carb', label: 'Carbohydrates' },
  { id: 'other', label: 'Other ingredients' },
];

function IngredientEditor({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const { data, foodMap, saveRecipe } = useStore();
  const toast = useToast();
  const [rows, setRows] = useState<RecipeIngredient[]>(recipe.ingredients.map((i) => ({ ...i })));
  const [swapping, setSwapping] = useState<number | null>(null);
  const analysis = useMemo(() => analyseIngredients(rows, foodMap), [rows, foodMap]);
  const update = (i: number, patch: Partial<RecipeIngredient>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="card editor-card" aria-labelledby="ie-h">
      <h2 id="ie-h" className="card-title">
        Customise ingredients
      </h2>
      <p className="muted">
        Map your own foods into this recipe, swap ingredients or change amounts (for {recipe.servings} servings). The original is kept so you can restore it at any time.
      </p>
      <ul className="ing-edit-list">
        {rows.map((row, i) => {
          const f = foodMap.get(row.foodId);
          return (
            <li key={i} className="ing-edit-row">
              <div className="ing-edit-name">
                <span aria-hidden="true">{f?.emoji}</span> <strong>{f?.name ?? 'Missing food'}</strong>
                {f?.custom && f.allergenInfo === 'unknown' && <span className="badge badge-warn">Allergens unchecked</span>}
              </div>
              <div className="ing-edit-fields">
                <label className="sr-only" htmlFor={`amt-${i}`}>
                  Amount of {f?.name}
                </label>
                <input id={`amt-${i}`} className="input input-num" type="number" min={0} step="any" value={row.amount} onChange={(e) => update(i, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                <label className="sr-only" htmlFor={`unit-${i}`}>
                  Unit
                </label>
                <select id={`unit-${i}`} className="input select-compact" value={row.unit} onChange={(e) => update(i, { unit: e.target.value as Unit })}>
                  {UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.plural}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor={`role-${i}`}>
                  Ingredient type
                </label>
                <select id={`role-${i}`} className="input select-compact" value={row.role} onChange={(e) => update(i, { role: e.target.value as IngredientRole })}>
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSwapping(swapping === i ? null : i)}>
                  Swap
                </button>
                <button type="button" className="btn btn-ghost btn-sm danger-text" aria-label={`Remove ${f?.name}`} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
              {swapping === i && (
                <FoodPicker
                  label={`Replace ${f?.name}`}
                  foods={data.foods}
                  selected={rows.map((r) => r.foodId)}
                  placeholder={`Replace ${f?.name ?? 'ingredient'} with…`}
                  onPick={(food) => {
                    update(i, { foodId: food.id });
                    setSwapping(null);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="field">
        <span className="label">Add an ingredient (including your custom foods)</span>
        <FoodPicker label="Add ingredient" foods={data.foods} selected={rows.map((r) => r.foodId)} placeholder="Search foods to add…" onPick={(food) => setRows((r) => [...r, { foodId: food.id, amount: 1, unit: 'item', role: food.category === 'vegetables' ? 'veg' : food.category === 'carbs' ? 'carb' : food.category === 'protein' ? 'protein' : 'other' }])} />
      </div>
      {analysis.unverified.length > 0 && (
        <div className="issue" role="note">
          <strong>Allergen review needed:</strong> {analysis.unverified.map((u) => u.name).join(', ')} {analysis.unverified.length === 1 ? 'has' : 'have'} no checked allergen information. This recipe won't be treated as allergen-safe or suggested to anyone with allergies, intolerances or diets until the food's allergens are declared in Food Preferences.
        </div>
      )}
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={rows.length === 0 || rows.some((r) => r.amount <= 0)}
          onClick={async () => {
            await saveRecipe({ ...recipe, ingredients: rows.filter((r) => r.amount > 0), customised: true, originalIngredients: recipe.originalIngredients ?? recipe.ingredients });
            toast.show('Recipe ingredients saved');
            onDone();
          }}
        >
          Save ingredients
        </button>
      </div>
    </section>
  );
}

export default function RecipeDetailPage({ id }: { id: string }) {
  const { recipeMap, foodMap, members, planContext, plan, savePlan, restoreRecipe, saveRecipe, deleteRecipe, list } = useStore();
  const addToList = useAddRecipeToList();
  const toast = useToast();
  const confirm = useConfirm();
  const recipe = recipeMap.get(id);
  const [portions, setPortions] = useState(() => (members.length || recipe?.servings) ?? 4);
  const [editing, setEditing] = useState(false);
  const analysis = useMemo(() => (recipe ? analyseIngredients(recipe.ingredients, foodMap) : null), [recipe, foodMap]);

  if (!recipe || !analysis) {
    return (
      <div className="page">
        <EmptyState icon="📖" title="Recipe not found" action={<button className="btn btn-primary" onClick={() => go('recipes')}>All recipes</button>} />
      </div>
    );
  }

  const ctx = planContext();
  const perMember = members.map((m) => ({ m, ev: evaluateRecipe(recipe, [m], ctx) }));
  const scaled = (i: RecipeIngredient) => ({ amount: roundRecipeAmount(scaleAmount(i.amount, recipe.servings, portions), i.unit), unit: i.unit });

  const addToDay = async (index: number) => {
    if (!plan) return;
    const day = plan.days[index];
    const blocks = checkRecipeForDay(recipe, day, ctx);
    if (blocks.length) return toast.show(`Not suitable for ${formatDay(day.date)}: ${blocks[0].label}`, 'error');
    const slot = day.selected ?? 0;
    const options = [...day.options] as typeof day.options;
    options[slot] = recipe.id;
    await savePlan({ ...plan, days: plan.days.map((d, i) => (i === index ? { ...d, options, selected: slot, mode: 'cook' as const } : d)) });
    toast.show(`${recipe.name} chosen for ${formatDay(day.date)}`);
  };

  return (
    <div className="page recipe-page">
      <button className="btn btn-ghost back-btn" onClick={() => (window.history.length > 1 ? window.history.back() : go('recipes'))}>
        ← Back
      </button>
      <section className="recipe-hero card">
        <div className="recipe-hero-media">
          <RecipeImage recipe={recipe} foods={foodMap} size="lg" caption={false} />
        </div>
        <div className="recipe-hero-body">
          <p className="eyebrow">{recipe.cuisine}</p>
          <h1>{recipe.name}</h1>
          <p className="lead">{recipe.description}</p>
          <dl className="facts">
            <div>
              <dt>Prep</dt>
              <dd>{recipe.prepMinutes} min</dd>
            </div>
            <div>
              <dt>Cook</dt>
              <dd>{recipe.cookMinutes} min</dd>
            </div>
            <div>
              <dt>Difficulty</dt>
              <dd>{recipe.difficulty}</dd>
            </div>
            <div>
              <dt>{recipe.proteinGroup === 'vegetarian' ? 'Main ingredient' : 'Main protein'}</dt>
              <dd>{foodMap.get(recipe.mainProtein)?.name}</dd>
            </div>
          </dl>
          <div className="tag-row">
            {analysis.dietaryTags.map((t) => (
              <span key={t} className="badge badge-soft">
                {dietLabel(t)}
              </span>
            ))}
          </div>
          <div className="portion-row">
            <label htmlFor="portions">Portions</label>
            <Stepper id="portions" label="Portions" value={portions} min={1} max={40} onChange={setPortions} />
            <span className="muted small">Original recipe serves {recipe.servings}</span>
            {portions !== recipe.servings && (
              <button className="link-btn" onClick={() => setPortions(recipe.servings)}>
                Reset
              </button>
            )}
          </div>
          <div className="hero-actions">
            <SaveMealButton recipe={recipe} />
            <ShareButton recipe={recipe} portions={portions} />
            {(() => {
              const onList = list?.extraMeals?.find((e) => e.recipeId === recipe.id);
              return (
                <button
                  type="button"
                  className={`action-btn ${onList ? 'on' : ''}`}
                  onClick={async () => {
                    await addToList(recipe.id, portions);
                    toast.show(onList ? `Shopping list updated for ${portions} portions` : `Ingredients for ${portions} added to your shopping list`, 'success', {
                      label: 'Open list',
                      onClick: () => go('shopping'),
                    });
                  }}
                >
                  <span aria-hidden="true">🛒</span>
                  <span>{onList ? (onList.portions === portions ? `On your list (${portions})` : `Update list to ${portions}`) : 'Add ingredients to shopping list'}</span>
                </button>
              );
            })()}
            {plan && (
              <>
                <label className="sr-only" htmlFor="add-day">
                  Choose for a day in the plan
                </label>
                <select
                  id="add-day"
                  className="input select-compact"
                  value=""
                  onChange={(e) => {
                    if (e.target.value !== '') addToDay(Number(e.target.value));
                  }}
                >
                  <option value="">📅 Choose for a day…</option>
                  {plan.days.map((d, i) => (
                    <option key={d.date + i} value={i}>
                      {formatDay(d.date)}
                    </option>
                  ))}
                </select>
              </>
            )}
            {recipe.own ? (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => go(`recipes/edit/${recipe.id}`)}>
                  ✎ Edit recipe
                </button>
                <button
                  className="btn btn-ghost btn-sm danger-text"
                  onClick={async () => {
                    const planned = plan?.days.some((d) => d.options.includes(recipe.id));
                    if (
                      !(await confirm({
                        title: `Delete ${recipe.name}?`,
                        message: `Your recipe will be deleted.${planned ? ' It will also be taken out of your meal plan, so those days will need a dinner choosing.' : ''} It will be removed from your saved meals and shopping list too.`,
                        confirmLabel: 'Delete recipe',
                        danger: true,
                      }))
                    )
                      return;
                    await deleteRecipe(recipe.id);
                    toast.show(`${recipe.name} deleted`);
                    go('recipes/own');
                  }}
                >
                  Delete recipe
                </button>
              </>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)} disabled={editing}>
                ✎ Customise ingredients
              </button>
            )}
            {recipe.customised && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  if (await confirm({ title: 'Restore the original recipe?', message: 'Your ingredient changes will be discarded.', confirmLabel: 'Restore' })) {
                    await restoreRecipe(recipe.id);
                    toast.show('Original ingredients restored');
                  }
                }}
              >
                Restore original
              </button>
            )}
            <label className="btn btn-ghost btn-sm file-btn">
              📷 {recipe.image ? 'Change photo' : 'Add your photo'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    await saveRecipe({ ...recipe, image: await resizeImage(f, 900) });
                    toast.show('Photo saved');
                  } catch (err) {
                    toast.show((err as Error).message, 'error');
                  }
                }}
              />
            </label>
            {recipe.image && (
              <button className="btn btn-ghost btn-sm" onClick={() => saveRecipe({ ...recipe, image: undefined })}>
                Remove photo
              </button>
            )}
          </div>
        </div>
      </section>

      {editing && <IngredientEditor recipe={recipe} onDone={() => setEditing(false)} />}

      <section className="card safety-card" aria-labelledby="safety-h">
        <h2 id="safety-h" className="card-title">
          Allergens & suitability
        </h2>
        <p>
          <strong>{analysis.unverified.length ? 'Known allergens (incomplete):' : 'Contains:'}</strong>{' '}
          {analysis.allergens.length
            ? analysis.allergens.map(allergenLabel).join(', ')
            : analysis.unverified.length
              ? 'none recorded — but some ingredients have not been checked'
              : 'none of the 14 major allergens, based on the listed ingredients'}
        </p>
        {analysis.unverified.length > 0 && (
          <p className="issue">
            <strong>Needs review:</strong> allergen information is unknown for {analysis.unverified.map((u) => u.name).join(', ')}. This recipe is not shown as allergen-safe.
          </p>
        )}
        {analysis.labelChecks.length > 0 && (
          <p className="muted">
            <strong>Check the label:</strong> {analysis.labelChecks.join(', ')} — recipes vary between brands and may contain other allergens.
          </p>
        )}
        {members.length > 0 && (
          <ul className="suit-list">
            {perMember.map(({ m, ev }) => (
              <li key={m.id} className={ev.ok ? 'ok' : 'no'}>
                <span aria-hidden="true">{ev.ok ? '✓' : '✗'}</span> <strong>{m.name}</strong>: {ev.ok ? 'suitable' : ev.blocks.map((b) => b.label.replace(` — ${m.name}'s allergy`, ' (allergy)').replace(` — ${m.name}'s intolerance`, ' (intolerance)').replace(` — ${m.name}`, '')).join('; ')}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="recipe-columns">
        <section className="card" aria-labelledby="ing-h">
          <h2 id="ing-h" className="card-title">
            Ingredients <span className="muted small">for {portions}</span>
          </h2>
          {ROLES.map((role) => {
            const list = recipe.ingredients.filter((i) => i.role === role.id);
            if (!list.length) return null;
            return (
              <div key={role.id} className="ing-group">
                <h3>{role.label}</h3>
                <ul className="ing-list">
                  {list.map((i, k) => {
                    const f = foodMap.get(i.foodId);
                    return (
                      <li key={k}>
                        <span className="ing-qty">{formatQuantity(scaled(i))}</span>
                        <span className="ing-name">
                          {f?.name ?? 'Missing food'}
                          {i.note && <span className="muted">, {i.note}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
        <section className="card" aria-labelledby="method-h">
          <h2 id="method-h" className="card-title">
            Method
          </h2>
          <ol className="steps">
            {recipe.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {portions !== recipe.servings && <p className="hint">Cooking times are for the original {recipe.servings} servings — larger batches may need a bigger dish or a little longer.</p>}
        </section>
      </div>
    </div>
  );
}
