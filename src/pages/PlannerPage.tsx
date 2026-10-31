import { useMemo, useState } from 'react';
import type { MealPlan, PlanDay, Recipe } from '../types';
import { useStore } from '../state/store';
import { go, useConfirm, useToast } from '../state/ui';
import { EmptyState, Heart, PageHeader, RecipeImage, RecipeLink, RecipeMeta, Stepper } from '../components/common';
import { checkRecipeForDay, eatersFor, evaluateRecipe, generateDays, portionsFor, regenerateDay, replaceOption, suitabilitySummary } from '../lib/planner';
import { addDays, formatDay, nowIso, plural, todayKey, uid } from '../lib/util';
import { buildShoppingItems, mergeRegenerated } from '../lib/shopping';
import { dietLabel } from '../data/constants';

export function useBuildShoppingList() {
  const { plan, list, recipeMap, foodMap, saveList, household } = useStore();
  return async () => {
    if (!plan || !household) return 0;
    const items = mergeRegenerated(list, buildShoppingItems(plan, recipeMap, foodMap));
    await saveList({ id: household.id, householdId: household.id, planId: plan.id, items, generatedAt: nowIso(), updatedAt: nowIso() });
    return items.length;
  };
}

function CreatePlanForm({ onCreated }: { onCreated?: () => void }) {
  const { members, household, planContext, savePlan, plan } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [start, setStart] = useState(todayKey());
  const [count, setCount] = useState(7);
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const summary = useMemo(() => suitabilitySummary(members, planContext(maxMinutes)), [members, planContext, maxMinutes]);

  const create = async () => {
    if (plan && !(await confirm({ title: 'Replace the current meal plan?', message: 'Your current plan will be replaced. Your shopping list stays until you rebuild it.', confirmLabel: 'Create new plan', danger: true }))) return;
    setBusy(true);
    const days: PlanDay[] = Array.from({ length: count }, (_, i) => ({
      date: addDays(start, i),
      options: [null, null],
      selected: null,
      skipped: false,
      eaters: members.map((m) => m.id),
      guests: 0,
      portions: null,
      rejected: [],
    }));
    const seed = 1;
    const t = nowIso();
    const p: MealPlan = { id: uid('plan'), householdId: household!.id, startDate: start, seed, maxMinutes, days: generateDays(days, planContext(maxMinutes), seed), createdAt: t, updatedAt: t };
    await savePlan(p);
    setBusy(false);
    toast.show(`${count}-day plan created — choose one of the two dinners for each day`);
    onCreated?.();
  };

  return (
    <section className="card create-plan" aria-labelledby="cp-h">
      <h2 id="cp-h" className="card-title">
        Create a meal plan
      </h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="cp-start">Starting day</label>
          <input id="cp-start" type="date" className="input" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          <p className="hint">{formatDay(start, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="field">
          <label htmlFor="cp-days">Number of days</label>
          <Stepper id="cp-days" label="Number of days" value={count} min={1} max={31} onChange={setCount} />
          <div className="quick-picks" role="group" aria-label="Common plan lengths">
            {[3, 5, 7, 10, 14].map((n) => (
              <button key={n} type="button" className={`quick-pick ${count === n ? 'on' : ''}`} aria-pressed={count === n} onClick={() => setCount(n)}>
                {n} days
              </button>
            ))}
          </div>
          <p className="hint">Until {formatDay(addDays(start, count - 1))}</p>
        </div>
        <div className="field">
          <label htmlFor="cp-time">Maximum cooking time</label>
          <select id="cp-time" className="input" value={maxMinutes ?? ''} onChange={(e) => setMaxMinutes(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Any time</option>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">1 hour</option>
            <option value="90">1½ hours</option>
          </select>
        </div>
      </div>
      <div className={`suitability ${summary.ok < 4 ? 'low' : ''}`}>
        <p>
          <strong>
            {summary.ok} of {summary.total}
          </strong>{' '}
          recipes suit everyone in the household{members.length ? '' : ' (no family members added yet)'}.
        </p>
        {summary.reasons.length > 0 && (
          <details>
            <summary>Why some recipes are excluded</summary>
            <ul>
              {summary.reasons.slice(0, 8).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div className="form-actions">
        <button className="btn btn-primary btn-lg" onClick={create} disabled={busy}>
          {busy ? 'Planning…' : `Generate ${count}-day plan`}
        </button>
      </div>
    </section>
  );
}

function OptionCard({ recipe, chosen, otherChosen, onChoose, onReplace, day }: { recipe: Recipe; chosen: boolean; otherChosen: boolean; onChoose: () => void; onReplace: () => void; day: PlanDay }) {
  const { foodMap, favourites, toggleFavourite, planContext, members } = useStore();
  const ev = useMemo(() => evaluateRecipe(recipe, eatersFor(day, members), planContext()), [recipe, day, members, planContext]);
  return (
    <article className={`option-card ${chosen ? 'chosen' : ''} ${otherChosen ? 'dimmed' : ''}`} aria-label={`${recipe.name}${chosen ? ' (chosen)' : ''}`}>
      <div className="option-media">
        <RecipeImage recipe={recipe} foods={foodMap} size="sm" caption={false} />
        <Heart on={favourites.has(recipe.id)} onToggle={() => toggleFavourite(recipe.id)} name={recipe.name} />
        {chosen && <span className="chosen-badge">✓ Chosen</span>}
      </div>
      <div className="option-body">
        <h4>
          <RecipeLink id={recipe.id}>{recipe.name}</RecipeLink>
        </h4>
        <RecipeMeta recipe={recipe} />
        {ev.highlights.length > 0 && <p className="highlights">♥ {ev.highlights.join(' · ')}</p>}
        <div className="tag-row">
          {recipe.dietaryTags
            .filter((t) => t === 'vegetarian' || t === 'vegan' || t === 'gluten-free' || t === 'dairy-free')
            .map((t) => (
              <span key={t} className="badge badge-soft">
                {dietLabel(t)}
              </span>
            ))}
        </div>
        <div className="option-actions">
          <button className={`btn btn-sm ${chosen ? 'btn-secondary' : 'btn-primary'}`} aria-pressed={chosen} onClick={onChoose}>
            {chosen ? 'Chosen ✓' : 'Choose this'}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onReplace} aria-label={`Replace ${recipe.name} with another suggestion`}>
            ↻ Replace
          </button>
        </div>
      </div>
    </article>
  );
}

function DayCard({ plan, index }: { plan: MealPlan; index: number }) {
  const { members, recipeMap, savePlan, planContext } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const day = plan.days[index];
  const ctx = planContext(plan.maxMinutes);
  const portions = portionsFor(day);

  const setDay = async (d: PlanDay, msg?: string) => {
    await savePlan({ ...plan, days: plan.days.map((x, i) => (i === index ? d : x)) });
    if (msg) toast.show(msg, 'info');
  };

  /** After a change of who's eating, any suggestion that is no longer safe is replaced. */
  const changeEaters = async (eaters: string[]) => {
    let d: PlanDay = { ...day, eaters };
    let p: MealPlan = { ...plan, days: plan.days.map((x, i) => (i === index ? d : x)) };
    const unsafe = ([0, 1] as const).filter((s) => {
      const r = d.options[s] ? recipeMap.get(d.options[s]!) : undefined;
      return r && checkRecipeForDay(r, d, ctx).length > 0;
    });
    let note: string | undefined;
    if (unsafe.length === 2 || (unsafe.length && !d.options[unsafe[0] === 0 ? 1 : 0])) {
      d = regenerateDay(p, index, ctx).day;
      note = 'Suggestions updated so they suit everyone now eating.';
    } else if (unsafe.length === 1) {
      d = replaceOption(p, index, unsafe[0], ctx).day;
      note = 'One suggestion was replaced so it suits everyone now eating.';
    }
    p = { ...plan, days: plan.days.map((x, i) => (i === index ? d : x)) };
    await savePlan(p);
    if (note) toast.show(note, 'info');
  };

  const swapWith = async (j: number) => {
    const other = plan.days[j];
    const a: PlanDay = { ...day, options: other.options, selected: other.selected, rejected: other.rejected, issue: other.issue, skipped: other.skipped };
    const b: PlanDay = { ...other, options: day.options, selected: day.selected, rejected: day.rejected, issue: day.issue, skipped: day.skipped };
    for (const [d, label] of [[a, formatDay(day.date)], [b, formatDay(other.date)]] as const) {
      for (const id of d.options) {
        const r = id ? recipeMap.get(id) : undefined;
        const blocks = r ? checkRecipeForDay(r, d, ctx) : [];
        if (r && blocks.length) {
          toast.show(`Can't swap: ${r.name} isn't suitable on ${label} (${blocks[0].label}).`, 'error');
          return;
        }
      }
    }
    await savePlan({ ...plan, days: plan.days.map((x, i) => (i === index ? a : i === j ? b : x)) });
    toast.show(`Swapped ${formatDay(day.date, { weekday: 'long' })} and ${formatDay(other.date, { weekday: 'long' })}`);
  };

  const removeDay = async () => {
    if (!(await confirm({ title: `Remove ${formatDay(day.date)}?`, message: 'This day will be removed from the plan.', confirmLabel: 'Remove day', danger: true }))) return;
    await savePlan({ ...plan, days: plan.days.filter((_, i) => i !== index) });
  };

  const recipes = day.options.map((id) => (id ? recipeMap.get(id) ?? null : null));
  const isToday = day.date === todayKey();

  return (
    <article className={`card day-card ${day.skipped ? 'skipped' : ''} ${day.selected !== null ? 'done' : ''}`} aria-labelledby={`day-${index}`}>
      <header className="day-head">
        <div>
          <h3 id={`day-${index}`}>
            {formatDay(day.date, { weekday: 'long' })}
            {isToday && <span className="badge badge-accent">Today</span>}
          </h3>
          <p className="muted">{formatDay(day.date, { day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="day-status">
          {day.skipped ? <span className="badge">Not planned</span> : day.selected !== null ? <span className="badge badge-good">✓ Planned</span> : <span className="badge badge-warn">Choose a dinner</span>}
        </div>
      </header>

      <div className="day-controls">
        <div className="eaters" role="group" aria-label={`Who is eating on ${formatDay(day.date)}`}>
          {members.map((m) => {
            const on = day.eaters.includes(m.id);
            return (
              <button key={m.id} className={`eater ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => changeEaters(on ? day.eaters.filter((e) => e !== m.id) : [...day.eaters, m.id])} disabled={day.skipped}>
                {on ? '✓ ' : ''}
                {m.name}
              </button>
            );
          })}
        </div>
        <div className="day-numbers">
          <div className="mini-field">
            <span className="mini-label">Guests</span>
            <Stepper label={`Guests on ${formatDay(day.date)}`} value={day.guests} min={0} max={20} onChange={(g) => setDay({ ...day, guests: g })} />
          </div>
          <div className="mini-field">
            <span className="mini-label">
              Portions to cook{' '}
              {day.portions !== null && (
                <button className="link-btn" onClick={() => setDay({ ...day, portions: null })}>
                  (reset)
                </button>
              )}
            </span>
            <Stepper label={`Portions on ${formatDay(day.date)}`} value={portions} min={1} max={40} onChange={(n) => setDay({ ...day, portions: n })} />
          </div>
        </div>
        {day.guests > 0 && <p className="hint">Guests' allergies aren't known to the app — please check with them.</p>}
      </div>

      {day.skipped ? (
        <p className="skipped-note">No dinner planned for this day (eating out, leftovers or a takeaway).</p>
      ) : (
        <>
          {day.eaters.length === 0 && day.guests === 0 && <p className="hint">Nobody is marked as eating — tap names above.</p>}
          <div className="options">
            {recipes.map((r, slot) =>
              r ? (
                <OptionCard
                  key={slot}
                  day={day}
                  recipe={r}
                  chosen={day.selected === slot}
                  otherChosen={day.selected !== null && day.selected !== slot}
                  onChoose={() => setDay({ ...day, selected: day.selected === slot ? null : (slot as 0 | 1) })}
                  onReplace={async () => {
                    const res = replaceOption(plan, index, slot as 0 | 1, ctx);
                    if (res.message) toast.show(res.message, 'error');
                    else await setDay(res.day);
                  }}
                />
              ) : (
                <div key={slot} className="option-card option-empty">
                  <p>No {slot === 1 ? 'second ' : ''}suggestion available.</p>
                </div>
              ),
            )}
          </div>
          {day.issue && (
            <div className="issue" role="note">
              <strong>Why there are fewer suggestions:</strong> {day.issue}
            </div>
          )}
        </>
      )}

      <footer className="day-actions">
        {!day.skipped && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              const res = regenerateDay(plan, index, ctx);
              await setDay(res.day, res.message);
            }}
          >
            ↻ New suggestions
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setDay({ ...day, skipped: !day.skipped, selected: day.skipped ? day.selected : null })}>
          {day.skipped ? '＋ Plan this day' : '⊘ Leave unplanned'}
        </button>
        <details className="day-more">
          <summary className="btn btn-ghost btn-sm">⋯ More</summary>
          <div className="day-more-menu">
          {!day.skipped && (
            <button className="btn btn-ghost btn-sm" onClick={() => go(`recipes/pick/${index}`)}>
              📖 Pick from recipes
            </button>
          )}
          {day.rejected.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setDay({ ...day, rejected: [] }, 'Replaced suggestions can appear again for this day.')}>
              Reset replaced ({day.rejected.length})
            </button>
          )}
          {plan.days.length > 1 && (
            <>
              <label className="sr-only" htmlFor={`swap-${index}`}>
                Swap meals with another day
              </label>
              <select
                id={`swap-${index}`}
                className="input select-compact select-sm"
                value=""
                onChange={(e) => {
                  if (e.target.value !== '') swapWith(Number(e.target.value));
                }}
              >
                <option value="">⇅ Swap with…</option>
                {plan.days.map((d, j) =>
                  j === index ? null : (
                    <option key={d.date + j} value={j}>
                      {formatDay(d.date)}
                    </option>
                  ),
                )}
              </select>
            </>
          )}
          <button className="btn btn-ghost btn-sm danger-text" onClick={removeDay}>
            Remove day
          </button>
          </div>
        </details>
      </footer>
    </article>
  );
}

export default function PlannerPage() {
  const { household, members, plan, savePlan, deletePlan, planContext, list } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const buildList = useBuildShoppingList();
  const [creating, setCreating] = useState(false);

  if (!household || members.length === 0) {
    return (
      <div className="page">
        <PageHeader title="Meal Planner" />
        <EmptyState icon="👪" title={household ? 'Add your family first' : 'Set up your household first'} action={<button className="btn btn-primary" onClick={() => go('family')}>Go to My Family</button>}>
          The planner needs to know who's eating — and their allergies — before it can suggest safe dinners.
        </EmptyState>
      </div>
    );
  }

  if (!plan || creating) {
    return (
      <div className="page">
        <PageHeader
          title="Meal Planner"
          subtitle="Two dinner ideas for every day, matched to your family."
          actions={
            <>
              {plan && (
                <button className="btn btn-ghost" onClick={() => setCreating(false)}>
                  Back to current plan
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => go('recipes')}>
                Browse recipes
              </button>
            </>
          }
        />
        <CreatePlanForm onCreated={() => setCreating(false)} />
      </div>
    );
  }

  const chosen = plan.days.filter((d) => d.selected !== null && !d.skipped).length;
  const active = plan.days.filter((d) => !d.skipped).length;
  const pct = active ? Math.round((chosen / active) * 100) : 0;
  const last = plan.days[plan.days.length - 1];

  return (
    <div className="page">
      <PageHeader
        title="Meal Planner"
        subtitle={
          <>
            {plural(plan.days.length, 'day')} from {formatDay(plan.startDate)}
            {plan.maxMinutes ? ` · up to ${plan.maxMinutes} min` : ''}
          </>
        }
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => go('recipes')}>
              Recipes
            </button>
            <button className="btn btn-ghost" onClick={() => setCreating(true)}>
              New plan
            </button>
          </>
        }
      />

      <section className="card plan-summary" aria-label="Plan progress">
        <div className="progress-block">
          <div className="progress-label">
            <strong>
              {chosen} of {active}
            </strong>{' '}
            dinners chosen
          </div>
          <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Dinners chosen">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="hint">
            Tap names to set who's eating each day. <strong>Guests</strong> are extra people at the table. <strong>Portions to cook</strong> starts at one per person — raise it for leftovers or big appetites.
          </p>
        </div>
        <div className="plan-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              const seed = plan.seed + 1;
              await savePlan({ ...plan, seed, days: generateDays(plan.days, planContext(plan.maxMinutes), seed, true) });
              toast.show('New suggestions for every day without a chosen dinner');
            }}
          >
            ↻ Regenerate unchosen days
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              const day: PlanDay = { date: addDays(last.date, 1), options: [null, null], selected: null, skipped: false, eaters: members.map((m) => m.id), guests: 0, portions: null, rejected: [] };
              const days = [...plan.days, day];
              const filled = generateDays(days, planContext(plan.maxMinutes), plan.seed, true);
              await savePlan({ ...plan, days: filled });
              toast.show(`Added ${formatDay(day.date)}`);
            }}
          >
            ＋ Add a day
          </button>
          <button
            className="btn btn-ghost btn-sm danger-text"
            onClick={async () => {
              if (await confirm({ title: 'Delete this meal plan?', message: 'The plan will be deleted. Your shopping list is kept.', confirmLabel: 'Delete plan', danger: true })) {
                await deletePlan();
                toast.show('Meal plan deleted');
              }
            }}
          >
            Delete plan
          </button>
          <button
            className="btn btn-primary"
            disabled={chosen === 0}
            title={chosen === 0 ? 'Choose at least one dinner first' : undefined}
            onClick={async () => {
              if (list?.items.some((i) => i.source === 'plan' && i.edited) && !(await confirm({ title: 'Rebuild the shopping list?', message: 'Items you edited that came from the plan will be recalculated. Manual items and “already have it” ticks are kept.', confirmLabel: 'Rebuild list' }))) return;
              const n = await buildList();
              toast.show(`Shopping list ready: ${plural(n, 'item')}`);
              go('shopping');
            }}
          >
            🛒 Build shopping list
          </button>
        </div>
      </section>

      <div className="days">
        {plan.days.map((d, i) => (
          <DayCard key={`${d.date}-${i}`} plan={plan} index={i} />
        ))}
      </div>
    </div>
  );
}
