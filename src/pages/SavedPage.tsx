import { useMemo, useState } from 'react';
import type { Favourite, MealPlan, SavedPlan, TakeawayPlace } from '../types';
import { useStore } from '../state/store';
import { Modal, go, useConfirm, useToast } from '../state/ui';
import { EmptyState, PageHeader, RecipeImage, RecipeLink } from '../components/common';
import { ShareButton } from '../components/actions';
import { TakeawayPlaceForm, useTakeawayCategory, websiteHref } from '../components/takeaway';
import { chooseRecipe, chosenRecipe, daysFromSaved, setDayMode } from '../lib/planEdit';
import { evaluateRecipe } from '../lib/planner';
import { totalMinutes } from '../lib/recipes';
import { formatDay, nowIso, plural, todayKey, uid } from '../lib/util';

type Tab = 'meals' | 'takeaways' | 'plans';

/** "Add to a day" picker for the current plan. */
function DaySelect({ label, onPick }: { label: string; onPick: (index: number) => void }) {
  const { plan, recipeMap } = useStore();
  const catOf = useTakeawayCategory();
  if (!plan) return null;
  const what = (i: number) => {
    const d = plan.days[i];
    if (d.mode === 'takeaway') return `takeaway (${catOf(d.takeaway?.categoryId).name})`;
    if (d.mode === 'none') return 'free';
    return chosenRecipe(d, recipeMap)?.name ?? 'not decided';
  };
  return (
    <>
      <label className="sr-only" htmlFor={`ds-${label}`}>
        {label}
      </label>
      <select
        id={`ds-${label}`}
        className="input select-compact select-sm"
        value=""
        onChange={(e) => {
          if (e.target.value !== '') onPick(Number(e.target.value));
        }}
      >
        <option value="">📅 Add to a day…</option>
        {plan.days.map((d, i) => (
          <option key={d.date + i} value={i}>
            {formatDay(d.date, { weekday: 'short', day: 'numeric', month: 'short' })} — {what(i)}
          </option>
        ))}
      </select>
    </>
  );
}

function SavedMeals() {
  const { savedMeals, recipeMap, foodMap, members, planContext, plan, savePlan, toggleFavourite, updateSavedMeal } = useStore();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'loved' | 'unplanned'>('all');
  const ctx = planContext();
  const planned = new Set(plan ? (plan.days.map((d) => chosenRecipe(d, recipeMap)?.id).filter(Boolean) as string[]) : []);

  const rows = useMemo(
    () =>
      savedMeals
        .map((f) => ({ f, r: recipeMap.get(f.recipeId) }))
        .filter((x): x is { f: Favourite; r: NonNullable<typeof x.r> } => !!x.r)
        .filter(({ f, r }) => (filter === 'loved' ? f.loved : filter === 'unplanned' ? !planned.has(r.id) : true))
        .filter(({ r }) => {
          const s = q.trim().toLowerCase();
          return !s || [r.name, r.cuisine, r.description, ...r.ingredients.map((i) => foodMap.get(i.foodId)?.name ?? '')].join(' ').toLowerCase().includes(s);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedMeals, recipeMap, filter, q, foodMap, plan],
  );

  if (!savedMeals.length) {
    return (
      <EmptyState icon="♡" title="No saved meals yet" action={<button className="btn btn-primary" onClick={() => go('recipes')}>Browse recipes</button>}>
        Tap ♡ Save on any dinner idea — in your plan, on a recipe or while browsing — and it will be kept here for another week.
      </EmptyState>
    );
  }

  return (
    <div className="saved-meals">
      <div className="toolbar">
        <div className="search-box">
          <label htmlFor="saved-search" className="sr-only">
            Search saved meals
          </label>
          <span aria-hidden="true" className="search-icon">
            🔍
          </span>
          <input id="saved-search" type="search" className="input" placeholder="Search your saved meals…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="quick-picks" role="group" aria-label="Filter saved meals">
        {(
          [
            ['all', `All (${savedMeals.length})`],
            ['loved', `♥ Loved (${savedMeals.filter((f) => f.loved).length})`],
            ['unplanned', 'Not in this plan'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`quick-pick ${filter === id ? 'on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="muted">No saved meals match.</p>
      ) : (
        <ul className="saved-list">
          {rows.map(({ f, r }) => {
            const ev = evaluateRecipe(r, members, ctx);
            return (
              <li key={f.id} className="saved-card">
                <RecipeLink id={r.id} className="saved-media">
                  <RecipeImage recipe={r} foods={foodMap} size="sm" caption={false} />
                </RecipeLink>
                <div className="saved-body">
                  <h3>
                    <RecipeLink id={r.id}>{r.name}</RecipeLink>
                  </h3>
                  <p className="muted small">
                    ⏱ {totalMinutes(r)} min · {r.difficulty}
                    {planned.has(r.id) ? ' · in this plan' : ''}
                  </p>
                  {!ev.ok && <p className="block-reason">Not suitable for everyone: {ev.blocks[0].label}</p>}
                  <div className="saved-actions">
                    {plan && (
                      <DaySelect
                        label={`Add ${r.name} to a day`}
                        onPick={async (i) => {
                          const res = chooseRecipe(plan, i, r, ctx);
                          if ('error' in res) return toast.show(res.error, 'error');
                          await savePlan(res.plan);
                          toast.show(`${r.name} planned for ${formatDay(plan.days[i].date, { weekday: 'long' })}`, 'success', { label: 'Open plan', onClick: () => go('planner') });
                        }}
                      />
                    )}
                    <button
                      type="button"
                      className={`action-btn ${f.loved ? 'on' : ''}`}
                      aria-pressed={!!f.loved}
                      onClick={() => updateSavedMeal({ ...f, loved: !f.loved })}
                    >
                      <span aria-hidden="true">{f.loved ? '😋' : '🙂'}</span>
                      <span>{f.loved ? 'Loved it' : 'We loved it'}</span>
                    </button>
                    <ShareButton recipe={r} compact />
                    <button
                      type="button"
                      className="action-btn"
                      aria-label={`Remove ${r.name} from saved meals`}
                      onClick={async () => {
                        await toggleFavourite(r.id);
                        toast.show(`${r.name} removed`, 'info', { label: 'Undo', onClick: () => updateSavedMeal(f) });
                      }}
                    >
                      <span aria-hidden="true">✕</span>
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FavouriteTakeaways() {
  const { takeawayPlaces, takeawayCategories, plan, planContext, savePlan, deleteTakeawayCategory } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const catOf = useTakeawayCategory();
  const [editing, setEditing] = useState<TakeawayPlace | 'new' | null>(null);
  const custom = takeawayCategories.filter((c) => !c.builtIn);

  return (
    <div>
      <div className="section-head">
        <p className="muted">Your go-to places, ready to drop into any night of the plan.</p>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          + Add a takeaway
        </button>
      </div>
      {takeawayPlaces.length === 0 ? (
        <EmptyState icon="🥡" title="No favourite takeaways yet" action={<button className="btn btn-primary" onClick={() => setEditing('new')}>Add your first takeaway</button>}>
          Save the places you order from, with your usual order, so takeaway night is one tap.
        </EmptyState>
      ) : (
        <ul className="saved-list">
          {takeawayPlaces.map((p) => {
            const c = catOf(p.categoryId);
            const web = websiteHref(p.website);
            return (
              <li key={p.id} className="saved-card takeaway-card">
                <span className="ta-big" aria-hidden="true">
                  {c.emoji}
                </span>
                <div className="saved-body">
                  <h3>{p.name}</h3>
                  <p className="muted small">
                    {c.name}
                    {p.address ? ` · ${p.address}` : ''}
                  </p>
                  {p.usualOrder && <p className="ta-note">Usual: {p.usualOrder}</p>}
                  {p.notes && <p className="small">{p.notes}</p>}
                  {(p.phone || web) && (
                    <p className="small contact">
                      {p.phone && (
                        <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>
                          📞 {p.phone}
                        </a>
                      )}
                      {web && (
                        <a href={web} target="_blank" rel="noopener noreferrer">
                          🌐 {p.website}
                        </a>
                      )}
                    </p>
                  )}
                  <div className="saved-actions">
                    {plan && (
                      <DaySelect
                        label={`Plan ${p.name} for a night`}
                        onPick={async (i) => {
                          await savePlan(setDayMode(plan, i, 'takeaway', planContext(plan.maxMinutes), { categoryId: p.categoryId, placeId: p.id, name: p.name, note: p.usualOrder }));
                          toast.show(`${p.name} on ${formatDay(plan.days[i].date, { weekday: 'long' })}`, 'success', { label: 'Open plan', onClick: () => go('planner') });
                        }}
                      />
                    )}
                    <button type="button" className="action-btn" onClick={() => setEditing(p)}>
                      <span aria-hidden="true">✎</span>
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {custom.length > 0 && (
        <section className="section">
          <h3 className="section-title">Your takeaway types</h3>
          <ul className="plain-list">
            {custom.map((c) => (
              <li key={c.id} className="cat-row">
                <span>
                  {c.emoji} {c.name}
                </span>
                <button
                  className="btn btn-ghost btn-sm danger-text"
                  onClick={async () => {
                    if (await confirm({ title: `Delete “${c.name}”?`, message: 'Takeaways of this type will become “Other takeaway”.', confirmLabel: 'Delete', danger: true })) {
                      await deleteTakeawayCategory(c.id);
                      toast.show('Takeaway type deleted');
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editing && <TakeawayPlaceForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UseWeekSheet({ saved, onClose }: { saved: SavedPlan; onClose: () => void }) {
  const { plan, household, members, planContext, recipeMap, savePlan } = useStore();
  const toast = useToast();
  const [start, setStart] = useState(todayKey());
  return (
    <Modal title={`Use “${saved.name}”`} onClose={onClose} small>
      <div className="field">
        <label htmlFor="uw-start">Starting day</label>
        <input id="uw-start" type="date" className="input" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
      </div>
      {plan && <p className="hint">This replaces your current plan. Save it first if you want to keep it.</p>}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={async () => {
            const ctx = planContext();
            const { days, skipped } = daysFromSaved(saved.days, start, members, ctx, recipeMap, 1);
            const t = nowIso();
            const p: MealPlan = { id: uid('plan'), householdId: household!.id, startDate: start, seed: 1, maxMinutes: null, days, createdAt: t, updatedAt: t };
            await savePlan(p);
            toast.show(skipped.length ? `Plan ready. ${skipped.join(', ')} no longer suit${skipped.length === 1 ? 's' : ''} everyone, so new ideas were suggested.` : 'Plan ready', skipped.length ? 'info' : 'success');
            onClose();
            go('planner');
          }}
        >
          Use this week
        </button>
      </div>
    </Modal>
  );
}

function SavedWeeks() {
  const { savedPlans, recipeMap, deleteSavedPlan, saveSavedPlan } = useStore();
  const toast = useToast();
  const catOf = useTakeawayCategory();
  const [using, setUsing] = useState<SavedPlan | null>(null);
  if (!savedPlans.length) {
    return (
      <EmptyState icon="🗓️" title="No saved weeks yet" action={<button className="btn btn-primary" onClick={() => go('planner')}>Go to your plan</button>}>
        In the planner, tap “♡ Save this week” to keep a week that worked well and reuse it later.
      </EmptyState>
    );
  }
  return (
    <ul className="saved-list">
      {savedPlans.map((p) => (
        <li key={p.id} className="saved-card week-card">
          <div className="saved-body">
            <h3>{p.name}</h3>
            <p className="muted small">
              {plural(p.days.length, 'day')} · saved {formatDay(p.createdAt.slice(0, 10), { day: 'numeric', month: 'short' })}
            </p>
            <ol className="week-preview">
              {p.days.map((d, i) => (
                <li key={i}>
                  {d.mode === 'takeaway' ? `${catOf(d.takeaway?.categoryId).emoji} ${d.takeaway?.name || catOf(d.takeaway?.categoryId).name}` : d.mode === 'none' ? '— free night' : d.recipeId ? recipeMap.get(d.recipeId)?.name ?? 'Recipe' : 'Dinner to choose'}
                </li>
              ))}
            </ol>
            <div className="saved-actions">
              <button className="btn btn-primary btn-sm" onClick={() => setUsing(p)}>
                Use this week
              </button>
              <button
                className="action-btn"
                onClick={async () => {
                  await deleteSavedPlan(p.id);
                  toast.show(`“${p.name}” deleted`, 'info', { label: 'Undo', onClick: () => saveSavedPlan(p) });
                }}
              >
                <span aria-hidden="true">✕</span>
                <span>Delete</span>
              </button>
            </div>
          </div>
        </li>
      ))}
      {using && <UseWeekSheet saved={using} onClose={() => setUsing(null)} />}
    </ul>
  );
}

export default function SavedPage({ initialTab = 'meals' }: { initialTab?: Tab }) {
  const { savedMeals, takeawayPlaces, savedPlans, household } = useStore();
  const [tab, setTab] = useState<Tab>(initialTab);
  if (!household) {
    return (
      <div className="page">
        <PageHeader title="My Saved Meals" />
        <EmptyState icon="♡" title="Set up your household first" action={<button className="btn btn-primary" onClick={() => go('home')}>Get started</button>} />
      </div>
    );
  }
  return (
    <div className="page">
      <PageHeader title="My Saved Meals" subtitle="Dinners you love, favourite takeaways and weeks worth repeating." />
      <div className="tabs" role="tablist" aria-label="Saved collections">
        {(
          [
            ['meals', 'Meals', savedMeals.length],
            ['takeaways', 'Takeaways', takeawayPlaces.length],
            ['plans', 'Weekly plans', savedPlans.length],
          ] as const
        ).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label} {n > 0 && <span className="count">{n}</span>}
          </button>
        ))}
      </div>
      {tab === 'meals' && <SavedMeals />}
      {tab === 'takeaways' && <FavouriteTakeaways />}
      {tab === 'plans' && <SavedWeeks />}
    </div>
  );
}
