import { useMemo, useState } from 'react';
import type { AllergenId, Aisle, Category, Food } from '../types';
import { AISLES, ALLERGENS, sortCategories } from '../data/constants';
import { useStore } from '../state/store';
import { Modal, useToast } from '../state/ui';
import { DEFAULT_AISLE_FOR_CATEGORY, findDuplicates, suggestCategory } from '../lib/foods';
import { nowIso, resizeImage, uid } from '../lib/util';
import { FoodImage } from './common';

const EMOJI_FOR_CATEGORY: Record<string, string> = { protein: '🍖', vegetables: '🥬', carbs: '🌾', other: '🫙' };

/** Add or edit a custom food. New foods start with "unknown" allergen information. */
export function FoodFormModal({ initial, onClose, onDelete, onSaved, defaultName = '' }: { initial?: Food; onClose: () => void; onDelete?: () => void; onSaved?: (f: Food) => void; defaultName?: string }) {
  const { data, saveFood, saveCategory } = useStore();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? defaultName);
  const [category, setCategory] = useState(initial?.category ?? '');
  const [categoryTouched, setCategoryTouched] = useState(!!initial);
  const [aisle, setAisle] = useState<Aisle | ''>(initial?.aisle ?? '');
  const [aisleTouched, setAisleTouched] = useState(!!initial);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [image, setImage] = useState<string | undefined>(initial?.image);
  const [imgError, setImgError] = useState('');
  const [info, setInfo] = useState<'unknown' | 'declared'>(initial?.allergenInfo === 'declared' ? 'declared' : 'unknown');
  const [allergens, setAllergens] = useState<AllergenId[]>(initial?.allergens ?? []);
  const [diet, setDiet] = useState(initial?.diet ?? {});
  const [newCat, setNewCat] = useState('');
  const [error, setError] = useState('');
  const [allowSimilar, setAllowSimilar] = useState(false);

  const suggestion = useMemo(() => suggestCategory(name, data.foods), [name, data.foods]);
  const dupes = useMemo(() => findDuplicates(name, data.foods, initial?.id), [name, data.foods, initial?.id]);
  const exact = dupes.find((d) => d.kind === 'exact');
  const effectiveCategory = categoryTouched ? category : suggestion?.category ?? category;
  const effectiveAisle: Aisle = (aisleTouched ? aisle : suggestion?.aisle) || DEFAULT_AISLE_FOR_CATEGORY[effectiveCategory] || 'other';
  const categories = sortCategories(data.categories);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Please enter a food name.');
    if (!effectiveCategory) return setError('Please choose a category.');
    if (exact) return setError(`“${exact.food.name}” is already in the catalogue. Use it instead, or choose a more specific name.`);
    if (dupes.length && !allowSimilar) return setError('A similar food already exists. Tick “This is a different food” to add it anyway.');
    let cat = effectiveCategory;
    if (cat === '__new') {
      if (!newCat.trim()) return setError('Please name the new category.');
      const c: Category = { id: uid('cat'), name: newCat.trim(), emoji: '🏷️', builtIn: false };
      await saveCategory(c);
      cat = c.id;
    }
    const t = nowIso();
    const food: Food = {
      ...(initial ?? {}),
      id: initial?.id ?? uid('food'),
      name: name.trim(),
      category: cat,
      emoji: initial?.emoji ?? EMOJI_FOR_CATEGORY[cat] ?? '🍽️',
      description: description.trim() || undefined,
      image,
      aisle: effectiveAisle,
      allergens: info === 'declared' ? allergens : [],
      allergenInfo: info,
      diet: info === 'declared' ? diet : {},
      custom: true,
      createdAt: initial?.createdAt ?? t,
      updatedAt: t,
    };
    await saveFood(food);
    onSaved?.(food);
    toast.show(initial ? `${food.name} updated` : `${food.name} added to ${categories.find((c) => c.id === cat)?.name ?? 'the catalogue'}`);
    onClose();
  };

  const preview: Food = {
    id: 'preview',
    name: name || 'New food',
    category: effectiveCategory || 'other',
    emoji: EMOJI_FOR_CATEGORY[effectiveCategory] ?? '🍽️',
    image,
    aisle: effectiveAisle,
    allergens: [],
    allergenInfo: 'unknown',
    diet: {},
  };

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add a food'} onClose={onClose} wide>
      <form onSubmit={save} noValidate className="food-form">
        <div className="food-form-top">
          <FoodImage food={preview} size="lg" />
          <div className="food-form-fields">
            <div className="field">
              <label htmlFor="ff-name">Food name</label>
              <input id="ff-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setError(''); setAllowSimilar(false); }} autoFocus placeholder="e.g. Smoked mackerel" />
              {dupes.length > 0 && (
                <div className={`dupe-warning ${exact ? 'exact' : ''}`} role="alert">
                  {exact ? <>⚠️ <strong>{exact.food.name}</strong> already exists in the catalogue.</> : <>Similar food{dupes.length > 1 ? 's' : ''} already in the catalogue: {dupes.map((d) => d.food.name).join(', ')}.</>}
                  {!exact && (
                    <label className="inline-check">
                      <input type="checkbox" checked={allowSimilar} onChange={(e) => setAllowSimilar(e.target.checked)} /> This is a different food
                    </label>
                  )}
                </div>
              )}
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ff-cat">Category</label>
                <select id="ff-cat" className="input" value={effectiveCategory} onChange={(e) => { setCategory(e.target.value); setCategoryTouched(true); }}>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new">+ New category…</option>
                </select>
                {!categoryTouched && suggestion && <p className="hint">Suggested automatically ({suggestion.reason}). You can change it.</p>}
              </div>
              <div className="field">
                <label htmlFor="ff-aisle">Shopping list section</label>
                <select id="ff-aisle" className="input" value={effectiveAisle} onChange={(e) => { setAisle(e.target.value as Aisle); setAisleTouched(true); }}>
                  {AISLES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {effectiveCategory === '__new' && (
              <div className="field">
                <label htmlFor="ff-newcat">New category name</label>
                <input id="ff-newcat" className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Fruit" />
              </div>
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor="ff-desc">Description (optional)</label>
          <textarea id="ff-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="ff-img">Photo (optional)</label>
          <div className="image-row">
            <input
              id="ff-img"
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setImage(await resizeImage(file));
                  setImgError('');
                } catch (err) {
                  setImgError((err as Error).message);
                }
              }}
            />
            {image && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImage(undefined)}>
                Remove photo
              </button>
            )}
          </div>
          {imgError && <p className="field-error">{imgError}</p>}
        </div>

        <fieldset className="fieldset">
          <legend>Allergen information</legend>
          <label className="radio-row">
            <input type="radio" name="info" checked={info === 'unknown'} onChange={() => setInfo('unknown')} />
            <span>
              <strong>Not checked</strong> — recipes using this food will be flagged for review and not treated as allergen-safe.
            </span>
          </label>
          <label className="radio-row">
            <input type="radio" name="info" checked={info === 'declared'} onChange={() => setInfo('declared')} />
            <span>
              <strong>I've checked the label</strong> and will declare its allergens below.
            </span>
          </label>
          {info === 'declared' && (
            <>
              <div className="check-grid">
                {ALLERGENS.map((a) => (
                  <label key={a.id} className={`check-pill ${allergens.includes(a.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={allergens.includes(a.id)} onChange={() => setAllergens((x) => (x.includes(a.id) ? x.filter((y) => y !== a.id) : [...x, a.id]))} />
                    {a.label}
                  </label>
                ))}
              </div>
              <div className="check-grid">
                <label className={`check-pill ${diet.meat ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!diet.meat} onChange={(e) => setDiet({ ...diet, meat: e.target.checked, animal: e.target.checked || diet.animal })} /> Contains meat
                </label>
                <label className={`check-pill ${diet.fish ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!diet.fish} onChange={(e) => setDiet({ ...diet, fish: e.target.checked, animal: e.target.checked || diet.animal })} /> Contains fish/shellfish
                </label>
                <label className={`check-pill ${diet.animal ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!diet.animal} onChange={(e) => setDiet({ ...diet, animal: e.target.checked })} /> Any animal product
                </label>
                <label className={`check-pill ${diet.pork ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!diet.pork} onChange={(e) => setDiet({ ...diet, pork: e.target.checked })} /> Contains pork
                </label>
                <label className={`check-pill ${diet.beef ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!diet.beef} onChange={(e) => setDiet({ ...diet, beef: e.target.checked })} /> Contains beef
                </label>
              </div>
            </>
          )}
          <p className="hint">Adding a food never adds it to recipes automatically. To use it in a recipe, open the recipe and choose “Customise ingredients”.</p>
        </fieldset>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions sticky-actions">
          {onDelete && (
            <button type="button" className="btn btn-ghost danger-text push-left" onClick={onDelete}>
              Delete food
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {initial ? 'Save food' : 'Add food'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
