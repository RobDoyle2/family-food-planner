// "Build your week — plan your plate": choose the foods first, then find recipes that use them.
import { useMemo, useState } from 'react';
import type { CarbChoiceId, MealPlan, PlanDay, Recipe } from '../types';
import { useStore } from '../state/store';
import { go, useConfirm, useToast } from '../state/ui';
import { EmptyState, PageHeader, RecipeImage, RecipeLink, Stepper } from '../components/common';
import { SaveMealButton, ShareButton } from '../components/actions';
import { CarbTiles, PlateChips, ProteinTiles, VegTiles, useWriteRecipeWithFoods } from '../components/plate';
import { TakeawayPicker, useTakeawayCategory } from '../components/takeaway';
import { CARB_CHOICES, carbChoice, carbCounts, emptyPlate, plateLabel, proteinChoice, setPlate, spreadCarbs, spreadVeg, vegCounts } from '../lib/plate';
import { MAX_PLAN_DAYS, PLAN_LENGTHS, blankDay, chosenRecipe, findRecipes, mismatchedDays, moveMeal, setDayMode } from '../lib/planEdit';
import { eatersFor, evaluateRecipe, portionsFor, regenerateDay } from '../lib/planner';
import { recipeNutrition } from '../lib/nutrition';
import { addDays, formatDay, nowIso, plural, todayKey, uid } from '../lib/util';
import { totalMinutes } from '../lib/recipes';
import { useBuildShoppingList } from './PlannerPage';

const STEPS = [
  { id: 'days', label: 'Days', icon: '📅' },
  { id: 'mains', label: 'Mains', icon: '🍗' },
  { id: 'sides', label: 'Sides', icon: '🍚' },
  { id: 'veg', label: 'Veg', icon: '🥦' },
  { id: 'recipes', label: 'Recipes', icon: '📖' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

const dow = (d: PlanDay) => formatDay(d.date, { weekday: 'short' });
const dayLong = (d: PlanDay) => formatDay(d.date, { weekday: 'long' });

function usePlanSave() {
  const { plan, savePlan } = useStore();
  const toast = useToast();
  return async (next: MealPlan, message?: string) => {
    const before = plan;
    await savePlan(next);
    if (message) toast.show(message, 'success', before ? { label: 'Undo', onClick: () => savePlan(before) } : undefined);
  };
}

// ---------------------------------------------------------------- Step 1: days

function DaysStep({ onNext }: { onNext: () => void }) {
  const { plan, members, household, savePlan } = useStore();
  const confirm = useConfirm();
  const save = usePlanSave();
  const [start, setStart] = useState(plan?.startDate ?? todayKey());
  const [count, setCount] = useState(plan?.days.length ?? 7);
  const [fresh, setFresh] = useState(!plan);

  const create = async () => {
    if (plan && !(await confirm({ title: 'Start a new week?', message: 'Your current plan will be replaced by a new, empty week. Tip: save this week first if you want to reuse it.', confirmLabel: 'Start a new week', danger: true }))) return;
    const t = nowIso();
    const days = Array.from({ length: count }, (_, i) => blankDay(addDays(start, i), members));
    await savePlan({ id: uid('plan'), householdId: household!.id, startDate: start, seed: 1, maxMinutes: null, days, weekVeg: [], createdAt: t, updatedAt: t });
    setFresh(false);
    onNext();
  };

  if (!plan || fresh) {
    return (
      <section className="card build-step" aria-labelledby="bs-days">
        <h2 id="bs-days" className="card-title">
          When are you planning for?
        </h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="bw-start">Starting day</label>
            <input id="bw-start" type="date" className="input" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
            <p className="hint">{formatDay(start, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          <div className="field">
            <label htmlFor="bw-days">Number of days</label>
            <Stepper id="bw-days" label="Number of days" value={count} min={1} max={MAX_PLAN_DAYS} onChange={setCount} />
            <div className="quick-picks" role="group" aria-label="Common plan lengths">
              {PLAN_LENGTHS.map((n) => (
                <button key={n} type="button" className={`quick-pick ${count === n ? 'on' : ''}`} aria-pressed={count === n} onClick={() => setCount(n)}>
                  {n} days
                </button>
              ))}
            </div>
            <p className="hint">Until {formatDay(addDays(start, count - 1))}</p>
          </div>
        </div>
        <p className="muted small">Everyone in the family ({members.map((m) => m.name).join(', ')}) eats every day to start with — you can change that for each day next.</p>
        <div className="form-actions">
          {plan && (
            <button type="button" className="btn btn-ghost" onClick={() => setFresh(false)}>
              Keep my current week
            </button>
          )}
          <button type="button" className="btn btn-primary btn-lg" onClick={create}>
            Start planning {plural(count, 'day')}
          </button>
        </div>
      </section>
    );
  }

  const setPortions = (i: number, n: number) => {
    const d = plan.days[i];
    const natural = d.eaters.length + d.guests;
    save({ ...plan, days: plan.days.map((x, j) => (j === i ? { ...x, portions: n === natural ? null : n } : x)) });
  };

  return (
    <section className="card build-step" aria-labelledby="bs-days">
      <h2 id="bs-days" className="card-title">
        {formatDay(plan.days[0].date, { weekday: 'short', day: 'numeric', month: 'short' })} – {formatDay(plan.days[plan.days.length - 1].date, { weekday: 'short', day: 'numeric', month: 'short' })}
      </h2>
      <p className="muted small">How many people are eating each day? Recipes and the shopping list are scaled to match.</p>
      <ul className="people-days">
        {plan.days.map((d, i) => (
          <li key={d.date} className={`people-day mode-${d.mode}`}>
            <span className="pd-day">{dayLong(d)}</span>
            {d.mode === 'cook' ? <Stepper label={`People eating on ${dayLong(d)}`} value={portionsFor(d)} min={1} max={30} onChange={(n) => setPortions(i, n)} /> : <span className="muted small">{d.mode === 'takeaway' ? 'Takeaway' : 'Nothing planned'}</span>}
          </li>
        ))}
      </ul>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setFresh(true)}>
          ＋ Start a new week instead
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Next: main foods →
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Day picker (shared by steps 2–4)

function DayTabs({ plan, active, onPick, summary }: { plan: MealPlan; active: number; onPick: (i: number) => void; summary: (d: PlanDay) => string }) {
  return (
    <div className="build-days" role="tablist" aria-label="Day">
      {plan.days.map((d, i) => (
        <button key={d.date} role="tab" aria-selected={i === active} className={`build-day ${i === active ? 'active' : ''} mode-${d.mode}`} onClick={() => onPick(i)}>
          <span className="bd-dow">{dow(d)}</span>
          <span className="bd-sum">{summary(d)}</span>
        </button>
      ))}
    </div>
  );
}

const nextCookDay = (plan: MealPlan, from: number) => {
  for (let i = from + 1; i < plan.days.length; i++) if (plan.days[i].mode === 'cook') return i;
  return from;
};

// ---------------------------------------------------------------- Step 2: mains

function MainsStep({ plan, onNext }: { plan: MealPlan; onNext: () => void }) {
  const { planContext } = useStore();
  const save = usePlanSave();
  const catOf = useTakeawayCategory();
  const [active, setActive] = useState(() => Math.max(0, plan.days.findIndex((d) => d.mode === 'cook' && !d.plate?.protein)));
  const [takeaway, setTakeaway] = useState(false);
  const day = plan.days[active];
  const ctx = planContext(plan.maxMinutes);
  const setDay = (d: PlanDay) => ({ ...plan, days: plan.days.map((x, i) => (i === active ? d : x)) });

  return (
    <section className="card build-step" aria-labelledby="bs-mains">
      <h2 id="bs-mains" className="card-title">
        What's the main food each day?
      </h2>
      <p className="muted small">Pick a tile for each day — or skip any day and decide later.</p>
      <DayTabs plan={plan} active={active} onPick={(i) => { setActive(i); setTakeaway(false); }} summary={(d) => (d.mode === 'takeaway' ? '🥡' : d.mode === 'none' ? '—' : proteinChoice(d.plate?.protein)?.art ?? '?')} />
      <h3 className="build-day-h">{dayLong(day)}</h3>
      {day.mode === 'cook' && !takeaway && (
        <ProteinTiles
          value={day.plate?.protein}
          product={day.plate?.proteinFood}
          onChange={async (protein, product) => {
            const changedAnimal = protein !== day.plate?.protein;
            await save(setDay(setPlate(day, { protein, proteinFood: protein ? product : undefined })));
            // Move on to the next day after choosing a main food that has no specific kinds to pick from.
            if (protein && changedAnimal && !['chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'fish', 'seafood'].includes(protein)) setActive(nextCookDay(plan, active));
          }}
        />
      )}
      {day.mode === 'cook' && takeaway && (
        <TakeawayPicker
          initial={day.takeaway}
          onConfirm={async (choice) => {
            await save(setDayMode(plan, active, 'takeaway', ctx, choice), `${dayLong(day)} is a takeaway night`);
            setTakeaway(false);
            setActive(nextCookDay(plan, active));
          }}
        />
      )}
      {day.mode !== 'cook' && (
        <p className="none-note">
          {day.mode === 'takeaway' ? `${catOf(day.takeaway?.categoryId).emoji} Takeaway night${day.takeaway?.name ? ` — ${day.takeaway.name}` : ''}` : 'Nothing planned — eating out, leftovers or a night off.'}
        </p>
      )}
      <div className="build-day-actions">
        {day.mode === 'cook' ? (
          <>
            {day.plate?.protein && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(setDay(setPlate(day, { protein: undefined, proteinFood: undefined })))}>
                Not decided yet
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTakeaway(!takeaway)} aria-pressed={takeaway}>
              🥡 Takeaway night
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(setDayMode(plan, active, 'none', ctx), `${dayLong(day)} left unplanned`)}>
              ⊘ Nothing planned
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => save({ ...plan, days: plan.days.map((d, i) => (i === active ? { ...d, mode: 'cook' } : d)) })}>
            🍳 Cook this day instead
          </button>
        )}
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Next: sides →
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Step 3: sides

function safeFor(plan: MealPlan, ctx: ReturnType<ReturnType<typeof useStore>['planContext']>, members: ReturnType<typeof useStore>['members']): Recipe[] {
  // Recipes that suit everyone eating on at least one cooking day.
  const cook = plan.days.filter((d) => d.mode === 'cook');
  return ctx.recipes.filter((r) => cook.some((d) => evaluateRecipe(r, eatersFor(d, members), { ...ctx, maxMinutes: null }).ok));
}

function SidesStep({ plan, onNext }: { plan: MealPlan; onNext: () => void }) {
  const { planContext, members, foodMap } = useStore();
  const save = usePlanSave();
  const ctx = planContext(plan.maxMinutes);
  const counts = carbCounts(plan);
  const cookDays = plan.days.filter((d) => d.mode === 'cook').length;
  const [wanted, setWanted] = useState<Partial<Record<CarbChoiceId, number>>>(() => Object.fromEntries(counts));
  const [active, setActive] = useState(() => Math.max(0, plan.days.findIndex((d) => d.mode === 'cook')));
  const total = Object.values(wanted).reduce((a, b) => a + (b ?? 0), 0);
  const day = plan.days[active];
  const safe = useMemo(() => safeFor(plan, ctx, members), [plan.days, members]); // eslint-disable-line react-hooks/exhaustive-deps

  const share = async () => {
    const cleared = { ...plan, days: plan.days.map((d) => (d.mode === 'cook' && d.plate ? { ...d, plate: { ...d.plate, carb: undefined } } : d)) };
    const next = spreadCarbs(cleared, wanted, safe, foodMap);
    await save(next, 'Sides shared across the week — swap any day below');
  };

  return (
    <section className="card build-step" aria-labelledby="bs-sides">
      <h2 id="bs-sides" className="card-title">
        Which sides this week?
      </h2>
      <p className="muted small">Say how often you'd like each one and we'll share them out, avoiding the same side two days running. Or set each day yourself below.</p>
      <ul className="carb-counts">
        {CARB_CHOICES.filter((c) => c.id !== 'other').map((c) => (
          <li key={c.id} className={`carb-count ${(wanted[c.id] ?? 0) > 0 ? 'on' : ''}`}>
            <span className="cc-art" aria-hidden="true" style={{ background: c.tint }}>
              {c.art}
            </span>
            <span className="cc-name">{c.label}</span>
            <Stepper label={`${c.label} — days this week`} value={wanted[c.id] ?? 0} min={0} max={cookDays} onChange={(n) => setWanted({ ...wanted, [c.id]: n })} />
          </li>
        ))}
      </ul>
      <p className={`hint ${total > cookDays ? 'warn-text' : ''}`}>
        {total} of {plural(cookDays, 'cooking day')} {total > cookDays ? '— more than there are days; the extras will be left out' : ''}
      </p>
      <button type="button" className="btn btn-secondary" onClick={share} disabled={total === 0}>
        ⇄ Share them across the week
      </button>

      <h3 className="build-sub">Each day</h3>
      <DayTabs plan={plan} active={active} onPick={setActive} summary={(d) => (d.mode !== 'cook' ? '—' : carbChoice(d.plate?.carb)?.art ?? '?')} />
      <h4 className="build-day-h">
        {dayLong(day)} {day.plate?.protein && <span className="muted small">· {plateLabel({ protein: day.plate.protein, proteinFood: day.plate.proteinFood, veg: [] }, foodMap)}</span>}
      </h4>
      {day.mode === 'cook' ? (
        <CarbTiles
          value={day.plate?.carb}
          counts={counts}
          onChange={async (carb) => {
            await save({ ...plan, days: plan.days.map((d, i) => (i === active ? setPlate(d, { carb }) : d)) });
            if (carb) setActive(nextCookDay(plan, active));
          }}
        />
      ) : (
        <p className="none-note">{day.mode === 'takeaway' ? 'Takeaway night — no side needed.' : 'Nothing planned this day.'}</p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Next: vegetables →
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Step 4: veg

function VegStep({ plan, onNext }: { plan: MealPlan; onNext: () => void }) {
  const { planContext, members, foodMap } = useStore();
  const save = usePlanSave();
  const ctx = planContext(plan.maxMinutes);
  const [active, setActive] = useState(() => Math.max(0, plan.days.findIndex((d) => d.mode === 'cook')));
  const weekVeg = plan.weekVeg ?? [];
  const counts = vegCounts(plan);
  const day = plan.days[active];
  const safe = useMemo(() => safeFor(plan, ctx, members), [plan.days, members]); // eslint-disable-line react-hooks/exhaustive-deps

  const share = async () => {
    const cleared = { ...plan, days: plan.days.map((d) => (d.mode === 'cook' && d.plate ? { ...d, plate: { ...d.plate, veg: [] } } : d)) };
    await save(spreadVeg(cleared, weekVeg, safe, foodMap), 'Vegetables shared across the week');
  };

  return (
    <section className="card build-step" aria-labelledby="bs-veg">
      <h2 id="bs-veg" className="card-title">
        Which vegetables this week?
      </h2>
      <p className="muted small">Pick the vegetables you'd like to use. Recipes that use them are preferred, and you can give each day its own.</p>
      <VegTiles label="Vegetables for the week" value={weekVeg} counts={counts} onChange={(v) => save({ ...plan, weekVeg: v })} />
      <button type="button" className="btn btn-secondary" onClick={share} disabled={!weekVeg.length}>
        ⇄ Share them across the days
      </button>

      <h3 className="build-sub">Each day (optional)</h3>
      <DayTabs plan={plan} active={active} onPick={setActive} summary={(d) => (d.mode !== 'cook' ? '—' : d.plate?.veg.length ? d.plate.veg.map((v) => foodMap.get(v)?.emoji ?? '🥬').slice(0, 2).join('') : '?')} />
      <h4 className="build-day-h">{dayLong(day)}</h4>
      {day.mode === 'cook' ? (
        <VegTiles label={`Vegetables on ${dayLong(day)}`} value={day.plate?.veg ?? []} counts={counts} onChange={(veg) => save({ ...plan, days: plan.days.map((d, i) => (i === active ? setPlate(d, { veg }) : d)) })} />
      ) : (
        <p className="none-note">{day.mode === 'takeaway' ? 'Takeaway night.' : 'Nothing planned this day.'}</p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Next: see your week →
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Step 5: overview + recipes

function kcalOf(r: Recipe, foods: ReturnType<typeof useStore>['foodMap']) {
  return Math.round(recipeNutrition(r, foods).perServing.kcal / 10) * 10;
}

function Suggestion({ plan, index, recipe, onChoose }: { plan: MealPlan; index: number; recipe: Recipe; onChoose: () => void }) {
  const { foodMap } = useStore();
  const day = plan.days[index];
  return (
    <li className="suggestion">
      <RecipeLink id={recipe.id} className="idea-media">
        <RecipeImage recipe={recipe} foods={foodMap} size="sm" caption={false} />
      </RecipeLink>
      <div className="idea-body">
        <strong>
          <RecipeLink id={recipe.id}>{recipe.name}</RecipeLink>
        </strong>
        <span className="muted small">
          ⏱ {totalMinutes(recipe)} min · {recipe.cuisine} · ~{kcalOf(recipe, foodMap)} kcal per serving
        </span>
      </div>
      <div className="idea-actions">
        <SaveMealButton recipe={recipe} compact />
        <ShareButton recipe={recipe} portions={portionsFor(day)} compact />
        <button type="button" className="btn btn-primary btn-sm" onClick={onChoose} aria-label={`Choose ${recipe.name} for ${dayLong(day)}`}>
          Choose
        </button>
      </div>
    </li>
  );
}

function PlateRow({ plan, index }: { plan: MealPlan; index: number }) {
  const { recipeMap, foodMap, planContext } = useStore();
  const save = usePlanSave();
  const toast = useToast();
  const catOf = useTakeawayCategory();
  const write = useWriteRecipeWithFoods();
  const day = plan.days[index];
  const ctx = planContext(plan.maxMinutes);
  const chosen = chosenRecipe(day, recipeMap);
  const ideas = day.options.map((id) => (id ? recipeMap.get(id) : undefined)).filter(Boolean) as Recipe[];
  const label = plateLabel(day.plate, foodMap);
  const name = dayLong(day);

  const swap = async (to: number) => {
    const res = moveMeal(plan, index, to, ctx, recipeMap);
    if ('error' in res) return toast.show(res.error, 'error');
    await save(res.plan, `${name} and ${dayLong(plan.days[to])} swapped`);
  };
  const newIdeas = async () => {
    const res = regenerateDay(plan, index, ctx);
    if (res.message) toast.show(res.message, 'info');
    await save({ ...plan, days: plan.days.map((d, i) => (i === index ? { ...res.day, rejected: [...new Set([...d.rejected, ...(d.options.filter(Boolean) as string[])])] } : d)) }, `New ideas for ${name}${label ? ' using ' + label : ''}`);
  };
  const choose = (r: Recipe) => save({ ...plan, days: plan.days.map((d, i) => (i === index ? { ...d, selected: d.options.indexOf(r.id) as 0 | 1 } : d)) }, `${r.name} on ${name}`);

  return (
    <li className={`plate-row mode-${day.mode}`}>
      <div className="plate-row-head">
        <span className="pr-day">{name}</span>
        <span className="pr-foods">
          {day.mode === 'takeaway' ? `${catOf(day.takeaway?.categoryId).emoji} Takeaway${day.takeaway?.name ? ' — ' + day.takeaway.name : ''}` : day.mode === 'none' ? 'Nothing planned' : label ? label.split(' · ').join(' | ') : 'Foods not chosen — any safe idea'}
        </span>
        <span className="pr-move">
          <button type="button" className="icon-btn" disabled={index === 0} aria-label={`Swap ${name} with the day before`} onClick={() => swap(index - 1)}>
            ↑
          </button>
          <button type="button" className="icon-btn" disabled={index === plan.days.length - 1} aria-label={`Swap ${name} with the day after`} onClick={() => swap(index + 1)}>
            ↓
          </button>
        </span>
      </div>
      {day.mode === 'cook' && chosen && (
        <div className="pr-chosen">
          <span>
            ✓ <RecipeLink id={chosen.id}>{chosen.name}</RecipeLink> <span className="muted small">· ~{kcalOf(chosen, foodMap)} kcal per serving</span>
          </span>
          <button type="button" className="link-btn" onClick={() => save({ ...plan, days: plan.days.map((d, i) => (i === index ? { ...d, selected: null } : d)) })}>
            Change
          </button>
        </div>
      )}
      {day.mode === 'cook' && !chosen && ideas.length > 0 && (
        <ul className="suggestions">
          {ideas.map((r) => (
            <Suggestion key={r.id} plan={plan} index={index} recipe={r} onChoose={() => choose(r)} />
          ))}
        </ul>
      )}
      {day.mode === 'cook' && !chosen && day.issue && <p className="issue">{day.issue}</p>}
      {day.mode === 'cook' && !chosen && (ideas.length > 0 || day.issue) && (
        <div className="pr-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={newIdeas}>
            ↻ New recipe for {formatDay(day.date, { weekday: 'long' })}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(`recipes/pick/${index}`)}>
            🔍 Search
          </button>
          {label && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => write(day.plate ?? emptyPlate(), portionsFor(day))}>
              ✎ Write my own with these foods
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function RecipesStep({ plan }: { plan: MealPlan }) {
  const { planContext, recipeMap, foodMap, list } = useStore();
  const buildList = useBuildShoppingList();
  const save = usePlanSave();
  const confirm = useConfirm();
  const toast = useToast();
  const ctx = planContext(plan.maxMinutes);
  const chosenCount = plan.days.filter((d) => chosenRecipe(d, recipeMap)).length;
  const hasIdeas = plan.days.some((d) => d.mode === 'cook' && (d.options[0] || d.options[1] || d.selected !== null));
  const mismatched = mismatchedDays(plan, recipeMap, foodMap);
  const cookDays = plan.days.filter((d) => d.mode === 'cook');
  const kcal = cookDays.map((d) => chosenRecipe(d, recipeMap)).filter(Boolean).map((r) => kcalOf(r!, foodMap));

  const find = async () => {
    let replace = false;
    if (chosenCount) {
      replace = await confirm({
        title: 'Replace dinners you have already chosen?',
        message: `${plural(chosenCount, 'day')} already ${chosenCount === 1 ? 'has' : 'have'} a chosen dinner. New ideas are found for the other days either way.`,
        confirmLabel: 'Replace them too',
        cancelLabel: 'Keep my choices',
      });
    }
    const next = findRecipes(plan, ctx, replace);
    await save(next, 'Recipes found for your foods — choose one for each day');
    const empty = next.days.filter((d) => d.mode === 'cook' && !d.options[0] && d.selected === null).length;
    if (empty) toast.show(`${plural(empty, 'day')} had no suitable recipe — see the note on ${empty === 1 ? 'that day' : 'those days'}.`, 'info');
  };

  return (
    <section className="card build-step" aria-labelledby="bs-recipes">
      <h2 id="bs-recipes" className="card-title">
        Your week's plates
      </h2>
      <p className="muted small">Two different ideas per day, using your chosen foods and always safe for everyone eating. Swap days with ↑ ↓.</p>
      <button type="button" className="btn btn-primary btn-lg find-btn" onClick={find}>
        ✨ {hasIdeas ? 'Find my recipes again' : 'Find my recipes'}
      </button>
      {mismatched.length > 0 && (
        <p className="notice">
          {mismatched.map((i) => dayLong(plan.days[i])).join(', ')}: the chosen dinner doesn't match the foods you picked. Tap “Change” on {mismatched.length === 1 ? 'that day' : 'those days'} to see recipes that do.
        </p>
      )}
      <ol className="plate-rows">
        {plan.days.map((d, i) => (
          <PlateRow key={`${d.date}-${i}`} plan={plan} index={i} />
        ))}
      </ol>
      {kcal.length > 0 && <p className="hint">Chosen dinners average about {Math.round(kcal.reduce((a, b) => a + b, 0) / kcal.length / 10) * 10} kcal per serving (estimate).</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => go('planner')}>
          See my week
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!chosenCount}
          onClick={async () => {
            if (list?.items.some((i) => i.source === 'plan' && i.edited) && !(await confirm({ title: 'Update the shopping list?', message: 'Items from the plan will be recalculated, including ones you edited. Your own items and ticks are kept.', confirmLabel: 'Update list' }))) return;
            const n = await buildList();
            toast.show(`Shopping list ready: ${plural(n, 'item')}`);
            go('shopping');
          }}
        >
          🛒 Shopping list
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Page

export default function BuildPage() {
  const { household, members, plan } = useStore();
  const [step, setStep] = useState<StepId>(() => {
    try {
      const s = sessionStorage.getItem('ffp.build.step') as StepId | null;
      if (s && plan && STEPS.some((x) => x.id === s)) return s;
    } catch {
      /* ignore */
    }
    return 'days';
  });
  const goStep = (s: StepId) => {
    setStep(s);
    try {
      sessionStorage.setItem('ffp.build.step', s);
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0 });
  };

  if (!household || members.length === 0) {
    return (
      <div className="page">
        <PageHeader title="Build your week" />
        <EmptyState icon="👪" title="Add your family first" action={<button className="btn btn-primary" onClick={() => go('family')}>Go to My Family</button>}>
          We need to know who's eating — and any allergies — before suggesting dinners.
        </EmptyState>
      </div>
    );
  }

  const current = !plan ? 'days' : step;
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="page build-page">
      <PageHeader title="Build your week" subtitle="Plan your plate: choose your foods first, then find recipes that use them." />
      <nav className="build-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button key={s.id} type="button" className={`build-step-btn ${s.id === current ? 'active' : ''} ${i < idx ? 'done' : ''}`} aria-current={s.id === current ? 'step' : undefined} disabled={!plan && s.id !== 'days'} onClick={() => goStep(s.id)}>
            <span aria-hidden="true">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
      {current === 'days' && <DaysStep onNext={() => goStep('mains')} />}
      {plan && current === 'mains' && <MainsStep plan={plan} onNext={() => goStep('sides')} />}
      {plan && current === 'sides' && <SidesStep plan={plan} onNext={() => goStep('veg')} />}
      {plan && current === 'veg' && <VegStep plan={plan} onNext={() => goStep('recipes')} />}
      {plan && current === 'recipes' && <RecipesStep plan={plan} />}
      {plan && current !== 'recipes' && (
        <section className="plate-overview" aria-label="Your week so far">
          <h3 className="build-sub">Your week so far</h3>
          <ul className="overview-rows">
            {plan.days.map((d) => (
              <li key={d.date}>
                <strong>{dow(d)}</strong> {d.mode === 'takeaway' ? <span>🥡 Takeaway</span> : d.mode === 'none' ? <span className="muted">Nothing planned</span> : d.plate && (d.plate.protein || d.plate.carb || d.plate.veg.length) ? <PlateChips plate={d.plate} /> : <span className="muted">Not decided</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

