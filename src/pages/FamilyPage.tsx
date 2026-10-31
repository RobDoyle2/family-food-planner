import { useEffect, useState } from 'react';
import type { AllergenId, DietId, Member, NutritionPrefId, Restriction, Sex } from '../types';
import { ADULT_AGE, ALLERGENS, COUNTRIES, DIETS, NUTRITION_PREFS, allergenLabel, dietLabel } from '../data/constants';
import { useStore } from '../state/store';
import { Modal, useConfirm, useToast } from '../state/ui';
import { Chip, EmptyState, FoodPicker, PageHeader } from '../components/common';
import { plural } from '../lib/util';

export function HouseholdForm({ onSaved, compact }: { onSaved?: () => void; compact?: boolean }) {
  const { household, saveHousehold, members } = useStore();
  const toast = useToast();
  const [name, setName] = useState(household?.name ?? '');
  const [country, setCountry] = useState(household?.country ?? 'Ireland');
  const [error, setError] = useState('');
  useEffect(() => {
    setName(household?.name ?? '');
    setCountry(household?.country ?? 'Ireland');
  }, [household?.id, household?.name, household?.country]);

  const dirty = !household || name !== household.name || country !== household.country;
  return (
    <form
      className={`card household-form ${compact ? 'compact' : ''}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return setError('Please give your household a name, e.g. “The Murphys”.');
        setError('');
        await saveHousehold({ name: name.trim(), country });
        toast.show(household ? 'Household updated' : 'Household created');
        onSaved?.();
      }}
    >
      <h2 className="card-title">{household ? 'Household' : 'Create your household'}</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="hh-name">Household name</label>
          <input id="hh-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Murphys" aria-invalid={!!error} aria-describedby={error ? 'hh-err' : undefined} />
        </div>
        <div className="field">
          <label htmlFor="hh-country">Country</label>
          <select id="hh-country" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {household && (
          <div className="field">
            <span className="label">Number of members</span>
            <p className="static-value">{plural(members.length, 'person', 'people')}</p>
          </div>
        )}
      </div>
      {error && (
        <p id="hh-err" className="field-error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={!dirty}>
          {household ? 'Save household' : 'Create household'}
        </button>
      </div>
    </form>
  );
}

const COMMON_INTOLERANCES: AllergenId[] = ['gluten', 'milk', 'eggs', 'soya'];

function RestrictionEditor({ label, value, onChange, idPrefix, commonOnly }: { label: string; value: Restriction[]; onChange: (v: Restriction[]) => void; idPrefix: string; commonOnly?: AllergenId[] }) {
  const { data, foodMap } = useStore();
  // Intolerances start with the common ones; the full list is one tap away (and always shown if something else is ticked).
  const [showAll, setShowAll] = useState(() => !commonOnly || value.some((r) => r.kind === 'allergen' && !commonOnly.includes(r.id)));
  const shownAllergens = showAll || !commonOnly ? ALLERGENS : ALLERGENS.filter((a) => commonOnly.includes(a.id));
  const hasAllergen = (id: AllergenId) => value.some((r) => r.kind === 'allergen' && r.id === id);
  const toggle = (id: AllergenId) => onChange(hasAllergen(id) ? value.filter((r) => !(r.kind === 'allergen' && r.id === id)) : [...value, { kind: 'allergen', id }]);
  const foodItems = value.filter((r) => r.kind === 'food');
  return (
    <fieldset className="fieldset">
      <legend>{label}</legend>
      <div className="check-grid">
        {shownAllergens.map((a) => (
          <label key={a.id} className={`check-pill ${hasAllergen(a.id) ? 'on' : ''}`} title={a.hint}>
            <input type="checkbox" id={`${idPrefix}-${a.id}`} checked={hasAllergen(a.id)} onChange={() => toggle(a.id)} />
            {a.id === 'milk' && commonOnly ? 'Milk / lactose' : a.label}
          </label>
        ))}
        {!showAll && (
          <button type="button" className="link-btn" onClick={() => setShowAll(true)}>
            Show all 14 allergens
          </button>
        )}
      </div>
      <p className="hint">Need a specific food instead (e.g. mushrooms or a custom food)? Search for it:</p>
      <FoodPicker label={`${label} — specific foods`} foods={data.foods} selected={foodItems.map((r) => r.id)} onPick={(f) => onChange([...value, { kind: 'food', id: f.id }])} placeholder="Search foods to add…" />
      {foodItems.length > 0 && (
        <div className="chip-row">
          {foodItems.map((r) => (
            <Chip key={r.id} tone="danger" onRemove={() => onChange(value.filter((x) => x !== r))}>
              {foodMap.get(r.id)?.name ?? 'Removed food'}
            </Chip>
          ))}
        </div>
      )}
      {foodItems.map((r) => {
        // A specific food only rules out that food. Offer the full allergen so related products (butter, cheese…) are covered too.
        const f = foodMap.get(r.id);
        const missing = (f?.allergens ?? []).filter((a) => !hasAllergen(a));
        if (!f || !missing.length) return null;
        return (
          <div key={`hint-${r.id}`} className="allergen-hint" role="note">
            <span>
              <strong>{f.name}</strong> contains {missing.map(allergenLabel).join(', ')}. Choosing the food only avoids {f.name.toLowerCase()} itself.
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...value, ...missing.map((id) => ({ kind: 'allergen' as const, id }))])}>
              Avoid all {missing.length === 1 ? allergenLabel(missing[0]).toLowerCase() : 'these allergens'}
            </button>
          </div>
        );
      })}
    </fieldset>
  );
}

function MemberEditor({ initial, onClose }: { initial: Member; onClose: () => void }) {
  const { saveMember, data, foodMap } = useStore();
  const toast = useToast();
  const [m, setM] = useState<Member>(initial);
  const [ageText, setAgeText] = useState(String(initial.age));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Member>(k: K, v: Member[K]) => setM((x) => ({ ...x, [k]: v }));
  const age = parseInt(ageText, 10);
  const isChild = !Number.isNaN(age) && age < ADULT_AGE;
  const isNew = !data.members.some((x) => x.id === initial.id);

  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!m.name.trim()) errs.name = 'Please enter a name.';
    if (Number.isNaN(age) || age < 0 || age > 120) errs.age = 'Please enter an age between 0 and 120.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    // Nutritional goals are adult-only preferences; never stored for children.
    await saveMember({ ...m, name: m.name.trim(), age, nutrition: isChild ? [] : m.nutrition });
    toast.show(isNew ? `${m.name.trim()} added to the family` : `${m.name.trim()} updated`);
    onClose();
  };

  return (
    <Modal title={isNew ? 'Add family member' : `Edit ${initial.name}`} onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="member-form">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="m-name">Name</label>
            <input id="m-name" className="input" value={m.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} autoFocus />
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>
          <div className="field">
            <label htmlFor="m-age">Age</label>
            <input id="m-age" className="input" type="number" inputMode="numeric" min={0} max={120} value={ageText} onChange={(e) => setAgeText(e.target.value)} aria-invalid={!!errors.age} />
            {errors.age && <p className="field-error">{errors.age}</p>}
          </div>
          <div className="field">
            <label htmlFor="m-sex">Sex (optional)</label>
            <select id="m-sex" className="input" value={m.sex} onChange={(e) => set('sex', e.target.value as Sex)}>
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="safety-note" role="note">
          <strong>Allergies and intolerances are strict rules.</strong> Recipes containing them are never suggested for days this person eats. Always check product labels too — brands vary.
        </div>

        <RestrictionEditor idPrefix="alg" label="Allergies" value={m.allergies} onChange={(v) => set('allergies', v)} />
        <RestrictionEditor idPrefix="int" label="Intolerances" value={m.intolerances} onChange={(v) => set('intolerances', v)} commonOnly={COMMON_INTOLERANCES} />

        <fieldset className="fieldset">
          <legend>Dietary requirements</legend>
          <div className="check-grid">
            {DIETS.map((d) => (
              <label key={d.id} className={`check-pill ${m.dietary.includes(d.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={m.dietary.includes(d.id)} onChange={() => set('dietary', toggleIn<DietId>(m.dietary, d.id))} />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Foods disliked</legend>
          <p className="hint">Dislikes make recipes less likely, but don't rule them out. Use allergies or the household “exclude” option for foods that must never appear.</p>
          <FoodPicker label="Foods disliked" foods={data.foods} selected={m.dislikes} onPick={(f) => set('dislikes', [...m.dislikes, f.id])} placeholder="Search foods…" />
          {m.dislikes.length > 0 && (
            <div className="chip-row">
              {m.dislikes.map((id) => (
                <Chip key={id} tone="warn" onRemove={() => set('dislikes', m.dislikes.filter((x) => x !== id))}>
                  {foodMap.get(id)?.name ?? 'Removed food'}
                </Chip>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="fieldset" disabled={isChild}>
          <legend>Nutritional preferences (optional, adults only)</legend>
          {isChild ? (
            <p className="hint">Nutritional goals are not offered for children. Growing children need balanced, varied family meals — speak to your GP or public health nurse with any concerns.</p>
          ) : (
            <>
              <div className="check-grid">
                {NUTRITION_PREFS.map((n) => (
                  <label key={n.id} className={`check-pill ${m.nutrition.includes(n.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={m.nutrition.includes(n.id)} onChange={() => set('nutrition', toggleIn<NutritionPrefId>(m.nutrition, n.id))} />
                    {n.label}
                  </label>
                ))}
              </div>
              <p className="hint">These gently influence suggestions. This app is not a medical or dietetic service.</p>
            </>
          )}
        </fieldset>

        <div className="modal-actions sticky-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {isNew ? 'Add member' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function restrictionText(r: Restriction, foodName: (id: string) => string) {
  return r.kind === 'allergen' ? allergenLabel(r.id as AllergenId) : foodName(r.id);
}

function MemberCard({ m, onEdit }: { m: Member; onEdit: () => void }) {
  const { deleteMember, foodMap } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const name = (id: string) => foodMap.get(id)?.name ?? 'Removed food';
  const initials = m.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <article className="card member-card">
      <header className="member-head">
        <div className="avatar" aria-hidden="true">
          {initials}
        </div>
        <div>
          <h3>{m.name}</h3>
          <p className="muted">
            {m.age} {m.age === 1 ? 'year' : 'years'} old{m.age < ADULT_AGE ? ' · child' : ''}
            {m.sex ? ` · ${m.sex}` : ''}
          </p>
        </div>
      </header>
      <dl className="member-facts">
        <div>
          <dt>Allergies</dt>
          <dd>{m.allergies.length ? m.allergies.map((r, i) => <Chip key={i} tone="danger">{restrictionText(r, name)}</Chip>) : <span className="muted">None</span>}</dd>
        </div>
        <div>
          <dt>Intolerances</dt>
          <dd>{m.intolerances.length ? m.intolerances.map((r, i) => <Chip key={i} tone="warn">{restrictionText(r, name)}</Chip>) : <span className="muted">None</span>}</dd>
        </div>
        <div>
          <dt>Diet</dt>
          <dd>{m.dietary.length ? m.dietary.map((d) => <Chip key={d} tone="good">{dietLabel(d)}</Chip>) : <span className="muted">No requirements</span>}</dd>
        </div>
        <div>
          <dt>Dislikes</dt>
          <dd>{m.dislikes.length ? m.dislikes.map((d) => <Chip key={d}>{name(d)}</Chip>) : <span className="muted">None</span>}</dd>
        </div>
        {m.nutrition.length > 0 && (
          <div>
            <dt>Nutrition</dt>
            <dd>{m.nutrition.map((n) => <Chip key={n}>{NUTRITION_PREFS.find((x) => x.id === n)?.label}</Chip>)}</dd>
          </div>
        )}
      </dl>
      <footer className="card-actions">
        <button className="btn btn-secondary btn-sm" onClick={onEdit}>
          Edit
        </button>
        <button
          className="btn btn-ghost btn-sm danger-text"
          onClick={async () => {
            if (await confirm({ title: `Remove ${m.name}?`, message: `${m.name}'s profile, allergies and preferences will be deleted. They'll also be removed from any planned dinners.`, confirmLabel: 'Remove', danger: true })) {
              await deleteMember(m.id);
              toast.show(`${m.name} removed`);
            }
          }}
        >
          Delete
        </button>
      </footer>
    </article>
  );
}

export default function FamilyPage() {
  const { household, members, newMember } = useStore();
  const [editing, setEditing] = useState<Member | null>(null);

  return (
    <div className="page">
      <PageHeader
        title="My Family"
        subtitle="Who's eating, plus allergies, intolerances, diets and dislikes."
        actions={
          household && (
            <button className="btn btn-primary" onClick={() => setEditing(newMember())}>
              + Add member
            </button>
          )
        }
      />
      <HouseholdForm />
      {household && (
        <section aria-labelledby="members-h" className="section">
          <h2 id="members-h" className="section-title">
            Family members <span className="count">{members.length}</span>
          </h2>
          {members.length === 0 ? (
            <EmptyState icon="👪" title="No family members yet" action={<button className="btn btn-primary" onClick={() => setEditing(newMember())}>Add the first member</button>}>
              Add everyone who usually eats dinner at home so the planner can respect their needs.
            </EmptyState>
          ) : (
            <div className="grid grid-cards">
              {members.map((m) => (
                <MemberCard key={m.id} m={m} onEdit={() => setEditing(m)} />
              ))}
            </div>
          )}
        </section>
      )}
      {editing && <MemberEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
