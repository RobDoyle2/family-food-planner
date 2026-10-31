import { useEffect, useMemo, useState } from 'react';
import type { Difficulty, Food, IngredientRole, RecipeIngredient, Unit } from '../types';
import { useStore } from '../state/store';
import { go, useConfirm, useToast } from '../state/ui';
import { EmptyState, FoodPicker, PageHeader, Stepper } from '../components/common';
import { FoodFormModal } from '../components/FoodForm';
import { DISH_EMOJIS, draftFromRecipe, emptyDraft, recipeFromDraft, typicalUse, validateDraft, type RecipeDraft } from '../lib/ownRecipes';
import { analyseIngredients } from '../lib/recipes';
import { evaluateRecipe } from '../lib/planner';
import { allergenLabel, dietLabel, UNITS } from '../data/constants';
import { resizeImage } from '../lib/util';

const ROLES: { id: IngredientRole; label: string }[] = [
  { id: 'protein', label: 'Main protein' },
  { id: 'veg', label: 'Vegetable' },
  { id: 'carb', label: 'Carbohydrate' },
  { id: 'other', label: 'Other' },
];

const DRAFT_KEY = 'ffp.ownRecipeDraft';

function loadDraft(): RecipeDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as RecipeDraft) : null;
  } catch {
    return null;
  }
}

function storeDraft(d: RecipeDraft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* drafts are a convenience only */
  }
}

export default function RecipeEditorPage({ id }: { id?: string }) {
  const { data, recipeMap, foodMap, members, planContext, saveRecipe } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const existing = id ? recipeMap.get(id) : undefined;
  const [draft, setDraft] = useState<RecipeDraft>(() => (existing ? draftFromRecipe(existing) : loadDraft() ?? emptyDraft()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addingFood, setAddingFood] = useState(false);
  const [imgError, setImgError] = useState('');
  const restoredDraft = useMemo(() => !existing && !!loadDraft(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep an unsaved new recipe on this device so nothing is lost when navigating away.
  useEffect(() => {
    if (!existing) storeDraft(draft);
  }, [draft, existing]);

  const set = <K extends keyof RecipeDraft>(k: K, v: RecipeDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setIng = (i: number, patch: Partial<RecipeIngredient>) => setDraft((d) => ({ ...d, ingredients: d.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addFood = (f: Food) => {
    const use = typicalUse(f.id, data.recipes, foodMap);
    setDraft((d) => ({ ...d, ingredients: [...d.ingredients, { foodId: f.id, amount: (use.amount * d.servings) / 4 || 1, unit: use.unit, role: use.role }] }));
    setErrors((e) => ({ ...e, ingredients: '' }));
  };

  // Live safety summary, derived from the ingredients exactly as for built-in recipes.
  const analysis = useMemo(() => analyseIngredients(draft.ingredients, foodMap), [draft.ingredients, foodMap]);
  const preview = useMemo(() => (draft.ingredients.length ? recipeFromDraft({ ...draft, name: draft.name || 'Recipe', method: draft.method || 'x' }, foodMap, existing) : null), [draft, foodMap, existing]);
  const perMember = preview ? members.map((m) => ({ m, ev: evaluateRecipe(preview, [m], planContext()) })) : [];

  if (id && !existing) {
    return (
      <div className="page">
        <EmptyState icon="📖" title="Recipe not found" action={<button className="btn btn-primary" onClick={() => go('recipes')}>All recipes</button>} />
      </div>
    );
  }
  if (existing && !existing.own) {
    return (
      <div className="page">
        <EmptyState icon="📖" title="Built-in recipes can't be rewritten" action={<button className="btn btn-primary" onClick={() => go(`recipes/${existing.id}`)}>Back to the recipe</button>}>
          You can still customise its ingredients from the recipe page, or add your own version as a new recipe.
        </EmptyState>
      </div>
    );
  }

  const save = async () => {
    const errs = validateDraft(draft, data.recipes, existing?.id);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.show('Please check the highlighted parts of the recipe.', 'error');
      document.querySelector('.field-error, .editor-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const recipe = recipeFromDraft(draft, foodMap, existing);
    await saveRecipe(recipe);
    if (!existing) storeDraft(null);
    toast.show(existing ? `${recipe.name} updated` : `${recipe.name} added to your own recipes`);
    go(`recipes/${recipe.id}`);
  };

  return (
    <div className="page recipe-editor">
      <PageHeader title={existing ? `Edit ${existing.name}` : 'Add your own recipe'} subtitle="Your recipe joins the planner's ideas, respects everyone's allergies and adds its ingredients to the shopping list." />
      {restoredDraft && (
        <div className="notice">
          We kept the recipe you started earlier.{' '}
          <button
            type="button"
            className="link-btn"
            onClick={async () => {
              if (await confirm({ title: 'Start again?', message: 'The unfinished recipe will be cleared.', confirmLabel: 'Clear form', danger: true })) {
                setDraft(emptyDraft());
                setErrors({});
              }
            }}
          >
            Start again
          </button>
        </div>
      )}

      <section className="card editor-section" aria-labelledby="ed-basics">
        <h2 id="ed-basics" className="card-title">
          About the recipe
        </h2>
        <div className="field">
          <label htmlFor="ed-name">Recipe name</label>
          <input id="ed-name" className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Granny's Beef Stew" aria-invalid={!!errors.name} />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor="ed-desc">Short description (optional)</label>
          <textarea id="ed-desc" className="input" rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Slow-cooked and hearty — the kids' favourite on a cold night." />
        </div>
        <div className="field">
          <span className="label" id="ed-emoji-label">
            Picture
          </span>
          <div className="emoji-pick" role="radiogroup" aria-labelledby="ed-emoji-label">
            {DISH_EMOJIS.map((e) => (
              <button key={e} type="button" role="radio" aria-checked={draft.emoji === e} aria-label={`Picture ${e}`} className={`emoji-opt ${draft.emoji === e ? 'on' : ''}`} onClick={() => set('emoji', e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="image-row">
            <label className="btn btn-ghost btn-sm file-btn">
              📷 {draft.image ? 'Change photo' : 'Add your own photo (optional)'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (ev) => {
                  const f = ev.target.files?.[0];
                  if (!f) return;
                  try {
                    set('image', await resizeImage(f, 900));
                    setImgError('');
                  } catch (err) {
                    setImgError((err as Error).message);
                  }
                }}
              />
            </label>
            {draft.image && (
              <>
                <img src={draft.image} alt="Your recipe photo" className="editor-photo" />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('image', undefined)}>
                  Remove photo
                </button>
              </>
            )}
          </div>
          {imgError && <p className="field-error">{imgError}</p>}
        </div>
        <div className="field">
          <label htmlFor="ed-cuisine">Type of food (optional)</label>
          <input id="ed-cuisine" className="input" value={draft.cuisine} onChange={(e) => set('cuisine', e.target.value)} placeholder="e.g. Irish, Italian, Family favourite" />
        </div>
      </section>

      <section className="card editor-section" aria-labelledby="ed-times">
        <h2 id="ed-times" className="card-title">
          Servings and time
        </h2>
        <div className="form-grid times-grid">
          <div className="field field-wide">
            <label htmlFor="ed-servings">Serves</label>
            <Stepper id="ed-servings" label="Serves" value={draft.servings} min={1} max={40} onChange={(n) => set('servings', n)} />
            <p className="hint">Enter quantities for this many people. They're scaled for each dinner.</p>
          </div>
          <div className="field">
            <label htmlFor="ed-prep">Preparation (minutes)</label>
            <input id="ed-prep" className="input input-num" type="number" inputMode="numeric" min={0} value={draft.prepMinutes} onChange={(e) => set('prepMinutes', Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="field">
            <label htmlFor="ed-cook">Cooking (minutes)</label>
            <input id="ed-cook" className="input input-num" type="number" inputMode="numeric" min={0} value={draft.cookMinutes} onChange={(e) => set('cookMinutes', Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="field">
            <label htmlFor="ed-diff">Difficulty</label>
            <select id="ed-diff" className="input" value={draft.difficulty} onChange={(e) => set('difficulty', e.target.value as Difficulty)}>
              <option>Easy</option>
              <option>Medium</option>
              <option>Harder</option>
            </select>
          </div>
        </div>
        {errors.servings && <p className="field-error">{errors.servings}</p>}
        {errors.times && <p className="field-error">{errors.times}</p>}
      </section>

      <section className="card editor-section" aria-labelledby="ed-ing">
        <h2 id="ed-ing" className="card-title">
          Ingredients <span className="muted small">for {draft.servings}</span>
        </h2>
        <p className="muted small">Choose each ingredient from the food list so it goes on the shopping list and is checked for allergies.</p>
        {draft.ingredients.length > 0 && (
          <ul className="ing-edit-list">
            {draft.ingredients.map((row, i) => {
              const f = foodMap.get(row.foodId);
              return (
                <li key={i} className="ing-edit-row">
                  <div className="ing-edit-name">
                    <span aria-hidden="true">{f?.emoji}</span> <strong>{f?.name ?? 'Missing food'}</strong>
                    {f?.custom && f.allergenInfo === 'unknown' && <span className="badge badge-warn">Allergens unchecked</span>}
                  </div>
                  <div className="ing-edit-fields">
                    <label className="sr-only" htmlFor={`own-amt-${i}`}>
                      Amount of {f?.name}
                    </label>
                    <input id={`own-amt-${i}`} className="input input-num" type="number" inputMode="decimal" min={0} step="any" value={row.amount} onChange={(e) => setIng(i, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                    <label className="sr-only" htmlFor={`own-unit-${i}`}>
                      Unit for {f?.name}
                    </label>
                    <select id={`own-unit-${i}`} className="input select-compact" value={row.unit} onChange={(e) => setIng(i, { unit: e.target.value as Unit })}>
                      {UNITS.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.plural}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`own-role-${i}`}>
                      Type of ingredient for {f?.name}
                    </label>
                    <select id={`own-role-${i}`} className="input select-compact" value={row.role} onChange={(e) => setIng(i, { role: e.target.value as IngredientRole })}>
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`own-note-${i}`}>
                      Note for {f?.name}
                    </label>
                    <input id={`own-note-${i}`} className="input ing-note" placeholder="Note, e.g. chopped" value={row.note ?? ''} onChange={(e) => setIng(i, { note: e.target.value })} />
                    <button type="button" className="icon-btn" aria-label={`Remove ${f?.name}`} onClick={() => setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((_, j) => j !== i) }))}>
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="field">
          <span className="label">Add an ingredient</span>
          <FoodPicker label="Add an ingredient" foods={data.foods} selected={draft.ingredients.map((r) => r.foodId)} onPick={addFood} placeholder="Search foods, e.g. mince, carrots, stock…" />
          <button type="button" className="link-btn add-food-link" onClick={() => setAddingFood(true)}>
            Can't find it? ＋ Add a new food
          </button>
        </div>
        {errors.ingredients && <p className="field-error editor-error">{errors.ingredients}</p>}
      </section>

      <section className="card editor-section" aria-labelledby="ed-method">
        <h2 id="ed-method" className="card-title">
          Method
        </h2>
        <div className="field">
          <label htmlFor="ed-steps">Steps — one per line</label>
          <textarea
            id="ed-steps"
            className="input"
            rows={7}
            value={draft.method}
            onChange={(e) => set('method', e.target.value)}
            placeholder={'Brown the mince in a large pan.\nAdd the onions and carrots and soften for 5 minutes.\nPour in the stock and simmer for 30 minutes.'}
            aria-invalid={!!errors.method}
          />
          {errors.method && <p className="field-error">{errors.method}</p>}
        </div>
      </section>

      {preview && (
        <section className="card safety-card" aria-labelledby="ed-safety">
          <h2 id="ed-safety" className="card-title">
            Allergens and suitability
          </h2>
          <p>
            <strong>{analysis.unverified.length ? 'Known allergens (incomplete):' : 'Contains:'}</strong> {analysis.allergens.length ? analysis.allergens.map(allergenLabel).join(', ') : analysis.unverified.length ? 'none recorded yet' : 'none of the 14 major allergens'}
          </p>
          {analysis.dietaryTags.length > 0 && <p className="muted">Suitable for: {analysis.dietaryTags.map(dietLabel).join(', ')}</p>}
          {analysis.unverified.length > 0 && (
            <p className="issue">
              <strong>Needs review:</strong> allergen information is unknown for {analysis.unverified.map((u) => u.name).join(', ')}. Until you declare it (Family › Food likes › Edit food), this recipe won't be suggested to anyone with allergies, intolerances or diets.
            </p>
          )}
          {perMember.length > 0 && (
            <ul className="suit-list">
              {perMember.map(({ m, ev }) => (
                <li key={m.id} className={ev.ok ? 'ok' : 'no'}>
                  <span aria-hidden="true">{ev.ok ? '✓' : '✗'}</span> <strong>{m.name}</strong>: {ev.ok ? 'suitable' : ev.blocks[0].label}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="editor-actions">
        <button type="button" className="btn btn-ghost" onClick={() => (existing ? go(`recipes/${existing.id}`) : go('recipes/own'))}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={save}>
          {existing ? 'Save changes' : 'Save recipe'}
        </button>
      </div>

      {addingFood && <FoodFormModal onClose={() => setAddingFood(false)} onSaved={addFood} />}
    </div>
  );
}
