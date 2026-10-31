import { useMemo, useState } from 'react';
import type { MealPlan, PlanDay, Recipe, SavedPlan, TakeawayChoice } from '../types';
import { useStore } from '../state/store';
import { Modal, go, useConfirm, useToast } from '../state/ui';
import { EmptyState, PageHeader, RecipeImage, RecipeLink, Stepper } from '../components/common';
import { SaveMealButton, ShareButton } from '../components/actions';
import { TakeawayPicker, useTakeawayCategory } from '../components/takeaway';
import { checkRecipeForDay, eatersFor, evaluateRecipe, generateDays, portionsFor, regenerateDay, replaceOption, suitabilitySummary } from '../lib/planner';
import { MAX_PLAN_DAYS, PLAN_LENGTHS, blankDay, changeStart, chooseRecipe, chosenRecipe, daysFromSaved, moveMeal, needsAttention, planSummary, resizePlan, setDayMode, takeawayCautions, toSavedDays } from '../lib/planEdit';
import { addDays, formatDay, nowIso, plural, todayKey, uid } from '../lib/util';
import { buildShoppingItems, mergeRegenerated } from '../lib/shopping';
import { totalMinutes } from '../lib/recipes';
import { shareText } from '../lib/share';
import { PlateChips, PlateSheet, useWriteRecipeWithFoods } from '../components/plate';
import { plateFit, plateIsEmpty, plateLabel } from '../lib/plate';
import { recipeNutrition } from '../lib/nutrition';
import { allergenLabel, dietLabel } from '../data/constants';

export function useBuildShoppingList() {
  const { plan, list, recipeMap, foodMap, saveList, household, prefs } = useStore();
  return async () => {
    if (!household) return 0;
    const extras = list?.extraMeals ?? [];
    const items = mergeRegenerated(list, buildShoppingItems(plan, recipeMap, foodMap, extras, { staples: prefs?.staples }));
    await saveList({ id: household.id, householdId: household.id, planId: plan?.id ?? null, extraMeals: extras, items, generatedAt: nowIso(), updatedAt: nowIso() });
    return items.length;
  };
}

/** Adds a recipe's ingredients to the shopping list at a number of portions (or removes it with 0). */
export function useAddRecipeToList() {
  const { plan, list, recipeMap, foodMap, saveList, household, prefs } = useStore();
  return async (recipeId: string, portions: number) => {
    if (!household) return;
    const others = (list?.extraMeals ?? []).filter((e) => e.recipeId !== recipeId);
    const extras = portions > 0 ? [...others, { recipeId, portions }] : others;
    const items = mergeRegenerated(list, buildShoppingItems(plan, recipeMap, foodMap, extras, { staples: prefs?.staples }));
    await saveList({ id: household.id, householdId: household.id, planId: plan?.id ?? null, extraMeals: extras, items, generatedAt: nowIso(), updatedAt: nowIso() });
  };
}

/** Closes a "⋯ More" menu once one of its actions is chosen. */
const closeMenu = (e: React.MouseEvent<HTMLElement>) => {
  const details = e.currentTarget.closest('details');
  if (details && (e.target as HTMLElement).closest('button')) details.open = false;
};

/** Saves a changed plan and offers Undo, so simple edits need no confirmation screens. */
function usePlanUpdate() {
  const { plan, savePlan } = useStore();
  const toast = useToast();
  return async (next: MealPlan, message?: string, undo = true) => {
    const before = plan;
    await savePlan(next);
    if (message) toast.show(message, 'success', undo && before ? { label: 'Undo', onClick: () => savePlan(before) } : undefined);
  };
}

// ---------------------------------------------------------------- Create

function CreatePlanForm({ onCreated }: { onCreated?: () => void }) {
  const { members, household, planContext, savePlan, plan, savedPlans, recipeMap } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [start, setStart] = useState(todayKey());
  const [count, setCount] = useState(7);
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [template, setTemplate] = useState('');
  const [busy, setBusy] = useState(false);
  const summary = useMemo(() => suitabilitySummary(members, planContext(maxMinutes)), [members, planContext, maxMinutes]);
  const saved = savedPlans.find((p) => p.id === template);

  const create = async () => {
    if (plan && !(await confirm({ title: 'Start a new plan?', message: 'Your current plan will be replaced. Tip: “Save this week” first if you want to reuse it. Your shopping list is kept until you update it.', confirmLabel: 'Start new plan', danger: true }))) return;
    setBusy(true);
    const ctx = planContext(maxMinutes);
    const seed = 1;
    let days: PlanDay[];
    let skipped: string[] = [];
    if (saved) ({ days, skipped } = daysFromSaved(saved.days, start, members, ctx, recipeMap, seed));
    else days = generateDays(Array.from({ length: count }, (_, i) => blankDay(addDays(start, i), members)), ctx, seed);
    const t = nowIso();
    await savePlan({ id: uid('plan'), householdId: household!.id, startDate: start, seed, maxMinutes, days, createdAt: t, updatedAt: t });
    setBusy(false);
    toast.show(skipped.length ? `Plan created. ${skipped.join(', ')} no longer suit${skipped.length === 1 ? 's' : ''} everyone, so new ideas were suggested.` : 'Your plan is ready — pick a dinner for each day', skipped.length ? 'info' : 'success');
    onCreated?.();
  };

  return (
    <section className="card create-plan" aria-labelledby="cp-h">
      <h2 id="cp-h" className="card-title">
        Plan your dinners
      </h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="cp-start">Starting day</label>
          <input id="cp-start" type="date" className="input" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          <p className="hint">{formatDay(start, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        {!saved && (
          <div className="field">
            <label htmlFor="cp-days">Number of days</label>
            <Stepper id="cp-days" label="Number of days" value={count} min={1} max={MAX_PLAN_DAYS} onChange={setCount} />
            <div className="quick-picks" role="group" aria-label="Common plan lengths">
              {PLAN_LENGTHS.map((n) => (
                <button key={n} type="button" className={`quick-pick ${count === n ? 'on' : ''}`} aria-pressed={count === n} onClick={() => setCount(n)}>
                  {n} days
                </button>
              ))}
            </div>
            <p className="hint">Until {formatDay(addDays(start, count - 1))}</p>
          </div>
        )}
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
        {savedPlans.length > 0 && (
          <div className="field">
            <label htmlFor="cp-template">Start from a saved week (optional)</label>
            <select id="cp-template" className="input" value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">No — suggest new dinners</option>
              {savedPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({plural(p.days.length, 'day')})
                </option>
              ))}
            </select>
          </div>
        )}
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
          {busy ? 'Planning…' : saved ? `Use “${saved.name}”` : `Plan ${count} dinners`}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Plan settings

function PlanPeriod({ plan }: { plan: MealPlan }) {
  const { members, planContext } = useStore();
  const confirm = useConfirm();
  const update = usePlanUpdate();
  const recipeMap = useStore().recipeMap;
  const catOf = useTakeawayCategory();
  const [custom, setCustom] = useState(false);
  const ctx = planContext(plan.maxMinutes);
  const n = plan.days.length;

  const applyLength = async (len: number) => {
    const res = resizePlan(plan, len, members, ctx);
    if (!res.removed.length && !res.added) return;
    const planned = res.removed.filter((d) => d.mode === 'takeaway' || (d.mode === 'cook' && d.selected !== null));
    if (planned.length) {
      const ok = await confirm({
        title: `Shorten the plan to ${plural(len, 'day')}?`,
        message: (
          <>
            <p>These days at the end will be removed:</p>
            <ul className="plain-list removed-list">
              {res.removed.map((d) => (
                <li key={d.date}>
                  <strong>{formatDay(d.date)}</strong> — {d.mode === 'takeaway' ? `Takeaway (${d.takeaway?.name || catOf(d.takeaway?.categoryId).name})` : chosenRecipe(d, recipeMap)?.name ?? 'not decided'}
                </li>
              ))}
            </ul>
            <p>Every other day stays exactly as it is. You can undo this straight afterwards.</p>
          </>
        ),
        confirmLabel: 'Remove days',
        danger: true,
      });
      if (!ok) return;
    }
    await update(res.plan, res.added ? `Added ${plural(res.added, 'day')} with new ideas — your other days are unchanged` : `Plan shortened to ${plural(len, 'day')}`);
  };

  return (
    <section className="plan-period" aria-label="Planning period">
      <div className="period-row">
        <label className="period-field">
          <span className="mini-label">Starts</span>
          <input
            type="date"
            className="input input-date"
            aria-label="Plan start date"
            value={plan.startDate}
            onChange={(e) => {
              if (e.target.value && e.target.value !== plan.startDate) update(changeStart(plan, e.target.value), `Plan now starts ${formatDay(e.target.value)} — dinners kept in the same order`);
            }}
          />
        </label>
        <div className="period-field">
          <span className="mini-label" id="len-label">
            Days
          </span>
          <div className="quick-picks compact" role="group" aria-labelledby="len-label">
            {PLAN_LENGTHS.map((len) => (
              <button key={len} type="button" className={`quick-pick ${n === len ? 'on' : ''}`} aria-pressed={n === len} aria-label={`${len} days`} onClick={() => applyLength(len)}>
                {len}
              </button>
            ))}
            <button type="button" className={`quick-pick ${!PLAN_LENGTHS.includes(n) || custom ? 'on' : ''}`} aria-pressed={custom} onClick={() => setCustom(!custom)}>
              {PLAN_LENGTHS.includes(n) ? 'Other' : `${n} days`}
            </button>
          </div>
        </div>
      </div>
      {custom && (
        <div className="period-custom">
          <Stepper label="Number of days in plan" value={n} min={1} max={MAX_PLAN_DAYS} onChange={applyLength} />
        </div>
      )}
      <p className="hint">Changing the number of days keeps everything you've planned. New days are added at the end; shortening removes days from the end.</p>
    </section>
  );
}

// ---------------------------------------------------------------- Sheets

function RecipeRow({ recipe, onChoose, reason, tag }: { recipe: Recipe; onChoose: () => void; reason?: string; tag?: string }) {
  const { foodMap } = useStore();
  return (
    <li className={`recipe-row ${reason ? 'blocked' : ''}`}>
      <RecipeImage recipe={recipe} foods={foodMap} size="sm" caption={false} />
      <div className="recipe-row-body">
        <strong>{recipe.name}</strong>
        <span className="muted small">
          {totalMinutes(recipe)} min · {recipe.difficulty}
          {tag ? ` · ${tag}` : ''}
        </span>
        {reason && <span className="block-reason">{reason}</span>}
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={onChoose} disabled={!!reason} aria-label={`Choose ${recipe.name}`}>
        Choose
      </button>
    </li>
  );
}

type SheetTab = 'ideas' | 'search' | 'saved' | 'takeaway';

function ChangeDinnerSheet({ plan, index, initialTab, onClose }: { plan: MealPlan; index: number; initialTab: SheetTab; onClose: () => void }) {
  const { data, recipeMap, members, planContext, savedMeals, favourites, foodMap } = useStore();
  const update = usePlanUpdate();
  const toast = useToast();
  const ctx = planContext(plan.maxMinutes);
  const day = plan.days[index];
  const eaters = eatersFor(day, members);
  const [tab, setTab] = useState<SheetTab>(initialTab);
  const [ideas, setIdeas] = useState<string[]>(day.options.filter(Boolean) as string[]);
  const [rejected, setRejected] = useState<string[]>(day.rejected);
  const [q, setQ] = useState('');
  const dayName = formatDay(day.date, { weekday: 'long' });
  const writeOwn = useWriteRecipeWithFoods();

  const choose = async (r: Recipe) => {
    // Keep a sensible alternative alongside the choice when it came from the ideas list.
    const res = chooseRecipe({ ...plan, days: plan.days.map((d, i) => (i === index ? { ...d, rejected } : d)) }, index, r, ctx);
    if ('error' in res) return toast.show(res.error, 'error');
    let next = res.plan;
    const other = ideas.find((id) => id !== r.id);
    if (other && ideas.includes(r.id)) next = { ...next, days: next.days.map((d, i) => (i === index ? { ...d, options: [r.id, other], selected: 0 } : d)) };
    await update(next, `${r.name} on ${dayName}`);
    onClose();
  };

  const moreIdeas = () => {
    const tempPlan = { ...plan, days: plan.days.map((d, i) => (i === index ? { ...d, options: [ideas[0] ?? null, ideas[1] ?? null] as PlanDay['options'], rejected: [...rejected, ...ideas] } : d)) };
    const res = regenerateDay(tempPlan, index, ctx);
    if (res.message || !res.day.options[0]) return toast.show(res.message ?? 'No other suitable ideas for this day.', 'info');
    setRejected([...new Set([...rejected, ...ideas])]);
    setIdeas(res.day.options.filter(Boolean) as string[]);
  };

  const evals = useMemo(() => data.recipes.map((r) => evaluateRecipe(r, eaters, { ...ctx, maxMinutes: null })), [data.recipes, eaters, ctx]);
  const search = q.trim().toLowerCase();
  const found = evals
    .filter((e) => e.ok)
    .filter((e) => !search || [e.recipe.name, e.recipe.cuisine, ...e.recipe.ingredients.map((i) => foodMap.get(i.foodId)?.name ?? '')].join(' ').toLowerCase().includes(search))
    .sort((a, b) => Number(favourites.has(b.recipe.id)) - Number(favourites.has(a.recipe.id)) || a.recipe.name.localeCompare(b.recipe.name));
  const hiddenCount = evals.filter((e) => !e.ok).length;

  const tabs: [SheetTab, string][] = [
    ['ideas', 'Ideas'],
    ['search', 'Search'],
    ['saved', `Saved${savedMeals.length ? ` (${savedMeals.length})` : ''}`],
    ['takeaway', 'Takeaway'],
  ];

  return (
    <Modal title={`${dayName}'s dinner`} onClose={onClose} wide>
      <div className="sheet-tabs" role="tablist" aria-label="Ways to choose a dinner">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`sheet-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'ideas' && (
        <div>
          {!plateIsEmpty(day.plate) ? (
            <p className="based-on">
              <strong>Based on your foods:</strong> {plateLabel(day.plate, foodMap)}. Safe for the {plural(eaters.length + day.guests, 'person', 'people')} eating.
            </p>
          ) : (
            <p className="muted small">Suggested for the {plural(eaters.length + day.guests, 'person', 'people')} eating, respecting everyone's allergies and diets.</p>
          )}
          {ideas.length === 0 ? (
            <p className="issue">{day.issue ?? 'No suggestions yet.'}</p>
          ) : (
            <ul className="recipe-rows">
              {ideas.map((id) => recipeMap.get(id)).filter(Boolean).map((r) => (
                <RecipeRow key={r!.id} recipe={r!} onChoose={() => choose(r!)} tag={day.selected !== null && day.options[day.selected] === r!.id ? 'current' : undefined} />
              ))}
            </ul>
          )}
          <div className="sheet-row-actions">
            <button type="button" className="btn btn-secondary" onClick={moreIdeas}>
              ↻ {plateIsEmpty(day.plate) ? 'Show two more ideas' : `New recipe for ${dayName}`}
            </button>
            {!plateIsEmpty(day.plate) && (
              <button type="button" className="btn btn-ghost" onClick={() => writeOwn(day.plate!, portionsFor(day))}>
                ✎ Write a recipe with these foods
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'search' && (
        <div>
          <div className="search-box">
            <label htmlFor="sheet-search" className="sr-only">
              Search recipes
            </label>
            <span aria-hidden="true" className="search-icon">
              🔍
            </span>
            <input id="sheet-search" type="search" className="input" placeholder="Search by dish or ingredient…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <ul className="recipe-rows scroll">
            {found.slice(0, 40).map((e) => (
              <RecipeRow key={e.recipe.id} recipe={e.recipe} onChoose={() => choose(e.recipe)} tag={favourites.has(e.recipe.id) ? '♥ saved' : undefined} />
            ))}
          </ul>
          {found.length === 0 && <p className="muted">No suitable recipes match “{q}”.</p>}
          {hiddenCount > 0 && <p className="hint">{plural(hiddenCount, 'recipe')} not shown because they don't suit everyone eating on {dayName}.</p>}
        </div>
      )}

      {tab === 'saved' && (
        <div>
          {savedMeals.length === 0 ? (
            <p className="muted">You haven't saved any meals yet. Tap ♡ Save on any dinner to keep it for later.</p>
          ) : (
            <ul className="recipe-rows scroll">
              {savedMeals.map((f) => {
                const r = recipeMap.get(f.recipeId);
                if (!r) return null;
                const blocks = checkRecipeForDay(r, day, ctx);
                return <RecipeRow key={f.id} recipe={r} onChoose={() => choose(r)} reason={blocks[0]?.label} tag={f.loved ? '♥ loved' : undefined} />;
              })}
            </ul>
          )}
        </div>
      )}

      {tab === 'takeaway' && (
        <TakeawayPicker
          initial={day.takeaway}
          onConfirm={async (choice: TakeawayChoice) => {
            await update(setDayMode(plan, index, 'takeaway', ctx, choice), `${dayName} is a takeaway night`);
            onClose();
          }}
        />
      )}

      <div className="sheet-footer">
        {day.mode !== 'none' && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await update(setDayMode(plan, index, 'none', ctx), `${dayName} left unplanned`);
              onClose();
            }}
          >
            ⊘ Leave {dayName} unplanned
          </button>
        )}
      </div>
    </Modal>
  );
}

function PeopleSheet({ plan, index, onClose }: { plan: MealPlan; index: number; onClose: () => void }) {
  const { members, recipeMap, planContext, savePlan } = useStore();
  const toast = useToast();
  const ctx = planContext(plan.maxMinutes);
  const day = plan.days[index];
  const portions = portionsFor(day);
  const setDay = (d: PlanDay) => savePlan({ ...plan, days: plan.days.map((x, i) => (i === index ? d : x)) });

  /** After a change of who's eating, any suggestion that is no longer safe is replaced. */
  const changeEaters = async (eaters: string[]) => {
    let d: PlanDay = { ...day, eaters };
    const p: MealPlan = { ...plan, days: plan.days.map((x, i) => (i === index ? d : x)) };
    if (d.mode === 'cook') {
      const unsafe = ([0, 1] as const).filter((s) => {
        const r = d.options[s] ? recipeMap.get(d.options[s]!) : undefined;
        return r && checkRecipeForDay(r, d, ctx).length > 0;
      });
      if (unsafe.length === 2 || (unsafe.length && !d.options[unsafe[0] === 0 ? 1 : 0])) {
        d = { ...regenerateDay(p, index, ctx).day, eaters };
        toast.show('Dinner ideas updated so they suit everyone now eating.', 'info');
      } else if (unsafe.length === 1) {
        d = { ...replaceOption(p, index, unsafe[0], ctx).day, eaters };
        toast.show('One idea was replaced so it suits everyone now eating.', 'info');
      }
    }
    await savePlan({ ...plan, days: plan.days.map((x, i) => (i === index ? d : x)) });
  };

  return (
    <Modal title={`Who's eating on ${formatDay(day.date, { weekday: 'long' })}?`} onClose={onClose} small>
      <div className="eaters" role="group" aria-label="Family members eating">
        {members.map((m) => {
          const on = day.eaters.includes(m.id);
          return (
            <button key={m.id} type="button" className={`eater ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => changeEaters(on ? day.eaters.filter((e) => e !== m.id) : [...day.eaters, m.id])}>
              {on ? '✓ ' : ''}
              {m.name}
            </button>
          );
        })}
      </div>
      <div className="people-numbers">
        <div className="mini-field">
          <span className="mini-label">Guests</span>
          <Stepper label={`Guests on ${formatDay(day.date)}`} value={day.guests} min={0} max={20} onChange={(g) => setDay({ ...day, guests: g })} />
        </div>
        <div className="mini-field">
          <span className="mini-label">
            Portions to cook{' '}
            {day.portions !== null && (
              <button type="button" className="link-btn" onClick={() => setDay({ ...day, portions: null })}>
                (reset)
              </button>
            )}
          </span>
          <Stepper label={`Portions on ${formatDay(day.date)}`} value={portions} min={1} max={40} onChange={(v) => setDay({ ...day, portions: v })} />
        </div>
      </div>
      <p className="hint">Portions start at one per person eating. Raise them for leftovers or big appetites. {day.guests > 0 && 'Guests’ allergies aren’t known to the app — please check with them.'}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function MoveSheet({ plan, index, onClose }: { plan: MealPlan; index: number; onClose: () => void }) {
  const { recipeMap, planContext } = useStore();
  const update = usePlanUpdate();
  const toast = useToast();
  const catOf = useTakeawayCategory();
  const day = plan.days[index];
  const label = (d: PlanDay) => (d.mode === 'takeaway' ? `Takeaway — ${d.takeaway?.name || catOf(d.takeaway?.categoryId).name}` : d.mode === 'none' ? 'Nothing planned' : chosenRecipe(d, recipeMap)?.name ?? 'Not decided yet');
  return (
    <Modal title={`Move ${formatDay(day.date, { weekday: 'long' })}'s dinner`} onClose={onClose} small>
      <p className="muted small">
        Moving: <strong>{label(day)}</strong>. If the other day already has a dinner, the two swap.
      </p>
      <ul className="move-list">
        {plan.days.map((d, j) =>
          j === index ? null : (
            <li key={d.date + j}>
              <button
                type="button"
                className="move-target"
                onClick={async () => {
                  const res = moveMeal(plan, index, j, planContext(plan.maxMinutes), recipeMap);
                  if ('error' in res) return toast.show(res.error, 'error');
                  await update(res.plan, `Moved to ${formatDay(d.date, { weekday: 'long' })}`);
                  onClose();
                }}
              >
                <strong>{formatDay(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                <span className="muted small">{label(d)}</span>
              </button>
            </li>
          ),
        )}
      </ul>
    </Modal>
  );
}

// ---------------------------------------------------------------- Day card

type SheetState = { kind: 'change'; tab: SheetTab } | { kind: 'people' } | { kind: 'move' } | { kind: 'plate' } | null;

function DayCard({ plan, index }: { plan: MealPlan; index: number }) {
  const { recipeMap, planContext, foodMap, savedMeals, toggleFavourite, updateSavedMeal, favourites } = useStore();
  const update = usePlanUpdate();
  const toast = useToast();
  const catOf = useTakeawayCategory();
  const [sheet, setSheet] = useState<SheetState>(null);
  const day = plan.days[index];
  const ctx = planContext(plan.maxMinutes);
  const portions = portionsFor(day);
  const today = todayKey();
  const isToday = day.date === today;
  const isPast = day.date < today;
  const chosen = chosenRecipe(day, recipeMap);
  const ideas = day.options.map((id) => (id ? recipeMap.get(id) : undefined)).filter(Boolean) as Recipe[];
  const dayName = formatDay(day.date, { weekday: 'long' });
  const saved = chosen ? savedMeals.find((f) => f.recipeId === chosen.id) : undefined;
  const status = day.mode === 'takeaway' ? 'Takeaway night' : day.mode === 'none' ? 'Nothing planned' : chosen ? 'Dinner sorted' : 'Choose a dinner';

  const quickChoose = async (r: Recipe) => {
    const slot = day.options.indexOf(r.id) as 0 | 1;
    await update({ ...plan, days: plan.days.map((d, i) => (i === index ? { ...d, selected: slot } : d)) }, `${r.name} on ${dayName}`);
  };

  const menu = (
    <details className="day-more">
      <summary className="action-btn" aria-label={`More options for ${dayName}`}>
        <span aria-hidden="true">⋯</span>
        <span>More</span>
      </summary>
      <div className="day-more-menu" onClick={closeMenu}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet({ kind: 'move' })}>
          ⇄ Move to another day
        </button>
        {day.mode !== 'takeaway' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet({ kind: 'change', tab: 'takeaway' })}>
            🥡 Make it a takeaway night
          </button>
        )}
        {day.mode !== 'cook' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => update(setDayMode(plan, index, 'cook', ctx), `Cooking on ${dayName}`)}>
            🍳 Cook a dinner instead
          </button>
        )}
        {day.mode === 'cook' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet({ kind: 'plate' })}>
            🍽 {plateIsEmpty(day.plate) ? 'Choose foods for this day' : 'Edit foods'}
          </button>
        )}
        {day.mode === 'cook' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet({ kind: 'change', tab: 'search' })}>
            🔍 Search recipes
          </button>
        )}
        {day.mode === 'cook' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet({ kind: 'change', tab: 'saved' })}>
            ♥ Pick from saved meals
          </button>
        )}
        {chosen && isPast && !saved?.loved && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              if (saved) await updateSavedMeal({ ...saved, loved: true });
              else {
                await toggleFavourite(chosen.id);
              }
              toast.show(`Glad you enjoyed it! ${chosen.name} is in your saved meals`);
            }}
          >
            😋 We loved this one
          </button>
        )}
        {day.mode !== 'none' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => update(setDayMode(plan, index, 'none', ctx), `${dayName} left unplanned`)}>
            ⊘ Leave unplanned
          </button>
        )}
      </div>
    </details>
  );

  return (
    <article id={`day-${index}`} className={`day-card mode-${day.mode} ${chosen ? 'done' : ''} ${needsAttention(day) ? 'open' : ''}`} aria-labelledby={`day-h-${index}`}>
      <header className="day-head">
        <div className="day-date" aria-hidden="true">
          <span className="dd-dow">{formatDay(day.date, { weekday: 'short' })}</span>
          <span className="dd-num">{formatDay(day.date, { day: 'numeric' })}</span>
        </div>
        <div className="day-title">
          <h3 id={`day-h-${index}`}>
            {dayName} <span className="muted day-month">{formatDay(day.date, { day: 'numeric', month: 'short' })}</span>
            {isToday && <span className="badge badge-accent">Tonight</span>}
          </h3>
          <span className={`status status-${day.mode === 'cook' ? (chosen ? 'done' : 'open') : day.mode}`}>{status}</span>
        </div>
        <button type="button" className="people-chip" onClick={() => setSheet({ kind: 'people' })} aria-label={`${portions} portions on ${dayName}. Change who's eating`}>
          <span aria-hidden="true">👥</span> {portions}
        </button>
      </header>

      {day.mode === 'cook' && !plateIsEmpty(day.plate) && (
        <div className="day-plate">
          <PlateChips plate={day.plate} />
          <button type="button" className="link-btn" onClick={() => setSheet({ kind: 'plate' })} aria-label={`Edit foods for ${dayName}`}>
            Edit foods
          </button>
        </div>
      )}
      {day.mode === 'cook' && chosen && day.plate && (() => {
        const fit = plateFit(day.plate, chosen, foodMap);
        return fit.protein && fit.carb ? null : (
          <p className="notice small-notice">
            {chosen.name} doesn't use the foods picked for {dayName}.{' '}
            <button type="button" className="link-btn" onClick={() => setSheet({ kind: 'change', tab: 'ideas' })}>
              See matching recipes
            </button>
          </p>
        );
      })()}

      {day.mode === 'cook' && chosen && (
        <div className="meal">
          <RecipeLink id={chosen.id} className="meal-media">
            <RecipeImage recipe={chosen} foods={foodMap} size="sm" caption={false} />
          </RecipeLink>
          <div className="meal-body">
            <h4>
              <RecipeLink id={chosen.id}>{chosen.name}</RecipeLink>
            </h4>
            <p className="meal-desc">{chosen.description}</p>
            <p className="meal-meta">
              ⏱ {chosen.prepMinutes} + {chosen.cookMinutes} min · {plural(portions, 'portion')} · ~{Math.round(recipeNutrition(chosen, foodMap).perServing.kcal / 10) * 10} kcal each
              {chosen.dietaryTags.includes('vegetarian') ? ' · Vegetarian' : ''}
            </p>
          </div>
        </div>
      )}

      {day.mode === 'cook' && !chosen && (
        <div className="choose">
          {ideas.length > 0 ? (
            <ul className="idea-list">
              {ideas.map((r) => (
                <li key={r.id} className="idea">
                  <RecipeLink id={r.id} className="idea-media">
                    <RecipeImage recipe={r} foods={foodMap} size="sm" caption={false} />
                  </RecipeLink>
                  <div className="idea-body">
                    <strong>
                      <RecipeLink id={r.id}>{r.name}</RecipeLink>
                    </strong>
                    <span className="muted small">
                      ⏱ {totalMinutes(r)} min{favourites.has(r.id) ? ' · ♥ saved' : ''}
                    </span>
                  </div>
                  <div className="idea-actions">
                    <SaveMealButton recipe={r} compact />
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => quickChoose(r)} aria-label={`Choose ${r.name} for ${dayName}`}>
                      Choose
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <p className="issue">{day.issue ?? 'No ideas yet for this day.'}</p>
              {!day.issue && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ ...plan, days: plan.days.map((d, i) => (i === index ? regenerateDay(plan, index, ctx).day : d)) }, `Ideas for ${dayName}${day.plate ? ' using your foods' : ''}`)}>
                  ✨ Find recipes for {dayName}
                </button>
              )}
            </div>
          )}
          {day.issue && ideas.length > 0 && <p className="issue">{day.issue}</p>}
        </div>
      )}

      {day.mode === 'takeaway' && (
        <div className="takeaway-night">
          <span className="ta-big" aria-hidden="true">
            {catOf(day.takeaway?.categoryId).emoji}
          </span>
          <div>
            <h4>{day.takeaway?.name || `${catOf(day.takeaway?.categoryId).name} takeaway`}</h4>
            <p className="muted small">
              Takeaway night · {catOf(day.takeaway?.categoryId).name} · not on the shopping list
            </p>
            {day.takeaway?.note && <p className="ta-note">“{day.takeaway.note}”</p>}
            <TakeawayCaution day={day} />
          </div>
        </div>
      )}

      {day.mode === 'none' && <p className="none-note">No dinner planned — eating out, leftovers or a night off.</p>}

      <footer className="day-actions">
        {day.mode === 'cook' && (
          <button type="button" className="action-btn primary" onClick={() => setSheet({ kind: 'change', tab: 'ideas' })}>
            <span aria-hidden="true">↻</span>
            <span>{chosen ? 'Change' : 'More ideas'}</span>
          </button>
        )}
        {day.mode === 'takeaway' && (
          <button type="button" className="action-btn primary" onClick={() => setSheet({ kind: 'change', tab: 'takeaway' })}>
            <span aria-hidden="true">✎</span>
            <span>Change takeaway</span>
          </button>
        )}
        {day.mode === 'none' && (
          <>
            <button type="button" className="action-btn primary" onClick={() => update(setDayMode(plan, index, 'cook', ctx), `Ideas added for ${dayName}`)}>
              <span aria-hidden="true">🍳</span>
              <span>Plan a dinner</span>
            </button>
            <button type="button" className="action-btn" onClick={() => setSheet({ kind: 'change', tab: 'takeaway' })}>
              <span aria-hidden="true">🥡</span>
              <span>Takeaway</span>
            </button>
          </>
        )}
        {chosen && <SaveMealButton recipe={chosen} />}
        {chosen && <ShareButton recipe={chosen} portions={portions} />}
        {menu}
      </footer>

      {sheet?.kind === 'change' && <ChangeDinnerSheet plan={plan} index={index} initialTab={sheet.tab} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'people' && <PeopleSheet plan={plan} index={index} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'move' && <MoveSheet plan={plan} index={index} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'plate' && <PlateSheet plan={plan} index={index} onSave={(next, msg) => update(next, msg)} onClose={() => setSheet(null)} />}
    </article>
  );
}

function TakeawayCaution({ day }: { day: PlanDay }) {
  const { members, foodMap } = useStore();
  const people = takeawayCautions(day, members);
  if (!people.length) return null;
  const needs = (m: (typeof people)[number]) =>
    [...m.allergies, ...m.intolerances].map((r) => (r.kind === 'allergen' ? allergenLabel(r.id).toLowerCase() : foodMap.get(r.id)?.name.toLowerCase() ?? 'a food')).concat(m.dietary.map((d) => dietLabel(d).toLowerCase()));
  return (
    <p className="ta-caution" role="note">
      ⚠ Ingredients unknown — ask the restaurant about {people.map((m) => `${m.name} (${needs(m).join(', ')})`).join('; ')}.
    </p>
  );
}

// ---------------------------------------------------------------- Week overview

function WeekStrip({ plan }: { plan: MealPlan }) {
  const { recipeMap } = useStore();
  const catOf = useTakeawayCategory();
  return (
    <ol className="week-chips" aria-label="Week at a glance">
      {plan.days.map((d, i) => {
        const r = chosenRecipe(d, recipeMap);
        const state = d.mode === 'takeaway' ? 'takeaway' : d.mode === 'none' ? 'none' : r ? 'done' : 'open';
        const what = d.mode === 'takeaway' ? `takeaway (${catOf(d.takeaway?.categoryId).name})` : d.mode === 'none' ? 'nothing planned' : r ? r.name : 'needs a dinner';
        return (
          <li key={d.date + i}>
            <a
              href={`#day-${i}`}
              className={`week-chip ${state}`}
              aria-label={`${formatDay(d.date)}: ${what}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`day-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <span className="wc-dow">{formatDay(d.date, { weekday: 'narrow' })}</span>
              <span className="wc-num">{formatDay(d.date, { day: 'numeric' })}</span>
              <span className="wc-dot" aria-hidden="true">
                {state === 'takeaway' ? catOf(d.takeaway?.categoryId).emoji : state === 'done' ? '✓' : state === 'none' ? '–' : '?'}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

function SaveWeekSheet({ plan, onClose }: { plan: MealPlan; onClose: () => void }) {
  const { household, saveSavedPlan } = useStore();
  const toast = useToast();
  const [name, setName] = useState(`Week of ${formatDay(plan.startDate, { day: 'numeric', month: 'long' })}`);
  return (
    <Modal title="Save this week" onClose={onClose} small>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const p: SavedPlan = { id: uid('splan'), householdId: household!.id, name: name.trim(), days: toSavedDays(plan), createdAt: nowIso() };
          await saveSavedPlan(p);
          toast.show(`“${p.name}” saved — find it in Saved › Weekly plans`);
          onClose();
        }}
      >
        <div className="field">
          <label htmlFor="sw-name">Name</label>
          <input id="sw-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <p className="hint">Saves the dinners and takeaway nights so you can reuse this week later. Dates and who's eating are set when you reuse it.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save week
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function PlannerPage() {
  const { household, members, plan, savePlan, deletePlan, planContext, list, recipeMap } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const buildList = useBuildShoppingList();
  const catOf = useTakeawayCategory();
  const [creating, setCreating] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState(false);

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
          subtitle="Great food. Happy families. Dinner sorted."
          actions={
            plan && (
              <button className="btn btn-ghost" onClick={() => setCreating(false)}>
                Back to current plan
              </button>
            )
          }
        />
        <section className="card build-cta" aria-labelledby="build-cta-h">
          <div className="build-cta-art" aria-hidden="true">
            🐔 🍚 🥦
          </div>
          <div>
            <h2 id="build-cta-h" className="card-title">
              Build your week — plan your plate
            </h2>
            <p className="muted">Choose the main food, side and vegetables for each day, then we find recipes that use them. Every choice is optional.</p>
            <button className="btn btn-primary btn-lg" onClick={() => go('build')}>
              🍽 Build your week
            </button>
          </div>
        </section>
        <p className="or-divider">
          <span>or let us suggest dinners straight away</span>
        </p>
        <CreatePlanForm onCreated={() => setCreating(false)} />
      </div>
    );
  }

  const sum = planSummary(plan);
  const pct = sum.total ? Math.round((sum.sorted / sum.total) * 100) : 0;
  const firstOpen = plan.days.findIndex(needsAttention);

  const shareWeek = async () => {
    const lines = ['Our dinners', ...plan.days.map((d) => `${formatDay(d.date, { weekday: 'short', day: 'numeric', month: 'short' })} — ${d.mode === 'takeaway' ? `Takeaway (${d.takeaway?.name || catOf(d.takeaway?.categoryId).name})` : d.mode === 'none' ? 'Nothing planned' : chosenRecipe(d, recipeMap)?.name ?? 'To be decided'}`), '', 'Planned with Family Food Planner'];
    const res = await shareText('Our dinners', lines.join('\n'));
    toast.show(res === 'shared' ? 'Shared' : res === 'copied' ? 'This week’s dinners copied — paste them into a message' : res === 'cancelled' ? 'Not shared' : 'Sharing isn’t available here', res === 'manual' ? 'error' : 'success');
  };

  return (
    <div className="page planner">
      <PageHeader
        title="Your dinners"
        subtitle={`${formatDay(plan.days[0]?.date ?? plan.startDate, { weekday: 'short', day: 'numeric', month: 'short' })} – ${formatDay(plan.days[plan.days.length - 1]?.date ?? plan.startDate, { weekday: 'short', day: 'numeric', month: 'short' })}`}
      />

      <section className="plan-overview card" aria-label="Plan progress">
        <div className="overview-top">
          <p className="overview-count">
            <strong>{sum.sorted}</strong> of {sum.total} days sorted
          </p>
          <p className="overview-detail muted small">
            {plural(sum.cooked, 'dinner')} chosen{sum.takeaway ? ` · ${plural(sum.takeaway, 'takeaway')}` : ''}
            {sum.none ? ` · ${sum.none} free` : ''}
            {sum.open ? (
              <>
                {' · '}
                <a
                  href={`#day-${firstOpen}`}
                  className="needs-link"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`day-${firstOpen}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {sum.open} still to choose
                </a>
              </>
            ) : null}
          </p>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Days sorted">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <WeekStrip plan={plan} />
        <div className="plan-actions">
          <button
            className="btn btn-primary btn-sm"
            disabled={sum.cooked === 0}
            title={sum.cooked === 0 ? 'Choose at least one dinner first' : undefined}
            onClick={async () => {
              if (list?.items.some((i) => i.source === 'plan' && i.edited) && !(await confirm({ title: 'Update the shopping list?', message: 'Items from the plan will be recalculated, including ones you edited. Your own items and ticks are kept.', confirmLabel: 'Update list' }))) return;
              const n = await buildList();
              toast.show(`Shopping list ready: ${plural(n, 'item')}${sum.takeaway ? ` (takeaway nights not included)` : ''}`);
              go('shopping');
            }}
          >
            🛒 Shopping list
          </button>
          <button className="action-btn" onClick={() => go('build')}>
            <span aria-hidden="true">🍽</span>
            <span>Plan your plates</span>
          </button>
          <button className={`action-btn ${editingPeriod ? 'on' : ''}`} aria-expanded={editingPeriod} onClick={() => setEditingPeriod(!editingPeriod)}>
            <span aria-hidden="true">✎</span>
            <span>Dates &amp; length</span>
          </button>
          {sum.open > 0 && (
            <button
              className="action-btn"
              onClick={async () => {
                const seed = plan.seed + 1;
                await savePlan({ ...plan, seed, days: generateDays(plan.days, planContext(plan.maxMinutes), seed, true) });
                toast.show('Fresh ideas for the days still to choose — chosen dinners kept');
              }}
            >
              <span aria-hidden="true">↻</span>
              <span>Fresh ideas</span>
            </button>
          )}
          <details className="day-more">
            <summary className="action-btn" aria-label="More plan options">
              <span aria-hidden="true">⋯</span>
              <span>More</span>
            </summary>
            <div className="day-more-menu" onClick={closeMenu}>
              <button className="btn btn-ghost btn-sm" onClick={shareWeek}>
                ↗ Share this week
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSavingWeek(true)}>
                ♡ Save this week
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}>
                ＋ Start a new plan
              </button>
              <button
                className="btn btn-ghost btn-sm danger-text"
                onClick={async () => {
                  if (await confirm({ title: 'Delete this meal plan?', message: 'The plan will be deleted. Your shopping list and saved meals are kept.', confirmLabel: 'Delete plan', danger: true })) {
                    await deletePlan();
                    toast.show('Meal plan deleted');
                  }
                }}
              >
                Delete plan
              </button>
            </div>
          </details>
        </div>
        {editingPeriod && <PlanPeriod plan={plan} />}
      </section>

      <div className="days">
        {plan.days.map((d, i) => (
          <DayCard key={`${d.date}-${i}`} plan={plan} index={i} />
        ))}
      </div>
      {savingWeek && <SaveWeekSheet plan={plan} onClose={() => setSavingWeek(false)} />}
    </div>
  );
}
