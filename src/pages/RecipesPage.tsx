import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { go, useToast } from '../state/ui';
import { EmptyState, Heart, PageHeader, RecipeImage, RecipeLink, RecipeMeta } from '../components/common';
import { checkRecipeForDay, evaluateRecipe } from '../lib/planner';
import { formatDay } from '../lib/util';
import { analyseIngredients, totalMinutes } from '../lib/recipes';

const GROUP_LABELS: Record<string, string> = {
  beef: 'Beef',
  chicken: 'Chicken',
  pork: 'Pork',
  lamb: 'Lamb',
  turkey: 'Turkey',
  duck: 'Duck',
  fish: 'Fish',
  seafood: 'Seafood',
  eggs: 'Eggs',
  beans: 'Beans',
  lentils: 'Lentils',
  tofu: 'Tofu',
  vegetarian: 'Vegetarian',
};

export default function RecipesPage({ pickDay }: { pickDay?: number }) {
  const { data, foodMap, favourites, toggleFavourite, members, planContext, plan, savePlan } = useStore();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [onlyFav, setOnlyFav] = useState(false);
  const [onlySuitable, setOnlySuitable] = useState(true);
  const [quick, setQuick] = useState(false);
  const picking = pickDay !== undefined && plan?.days[pickDay];
  const day = picking ? plan!.days[pickDay!] : null;
  const ctx = planContext();

  const rows = useMemo(() => {
    const eaters = day ? members.filter((m) => day.eaters.includes(m.id)) : members;
    return data.recipes
      .map((r) => ({ r, ev: evaluateRecipe(r, eaters, ctx) }))
      .filter(({ r, ev }) => {
        if (group !== 'all' && r.proteinGroup !== group) return false;
        if (onlyFav && !favourites.has(r.id)) return false;
        if ((onlySuitable || day) && !ev.ok) return false;
        if (quick && totalMinutes(r) > 30) return false;
        if (q.trim()) {
          const s = q.toLowerCase();
          const hay = [r.name, r.description, r.cuisine, ...r.ingredients.map((i) => foodMap.get(i.foodId)?.name ?? '')].join(' ').toLowerCase();
          if (!hay.includes(s)) return false;
        }
        return true;
      })
      .sort((a, b) => Number(favourites.has(b.r.id)) - Number(favourites.has(a.r.id)) || a.r.name.localeCompare(b.r.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.recipes, members, group, onlyFav, onlySuitable, quick, q, favourites, foodMap, day, data.preferences]);

  const groups = [...new Set(data.recipes.map((r) => r.proteinGroup))];

  const pick = async (recipeId: string) => {
    if (!plan || pickDay === undefined || !day) return;
    const r = data.recipes.find((x) => x.id === recipeId)!;
    const blocks = checkRecipeForDay(r, day, ctx);
    if (blocks.length) return toast.show(`${r.name} isn't suitable: ${blocks[0].label}`, 'error');
    const options = [...day.options] as typeof day.options;
    const slot = day.selected ?? 0;
    options[slot] = recipeId;
    await savePlan({ ...plan, days: plan.days.map((d, i) => (i === pickDay ? { ...d, options, selected: slot, skipped: false } : d)) });
    toast.show(`${r.name} chosen for ${formatDay(day.date)}`);
    go('planner');
  };

  return (
    <div className="page">
      <PageHeader
        title={day ? `Choose dinner for ${formatDay(day.date)}` : 'Recipes'}
        subtitle={day ? 'Only recipes that suit everyone eating that day are shown.' : `${data.recipes.length} family dinners. Tap a recipe for ingredients, method and portions.`}
        actions={
          <button className="btn btn-ghost" onClick={() => go('planner')}>
            ← Meal planner
          </button>
        }
      />
      <div className="toolbar">
        <div className="search-box">
          <label htmlFor="r-search" className="sr-only">
            Search recipes
          </label>
          <span aria-hidden="true" className="search-icon">
            🔍
          </span>
          <input id="r-search" type="search" className="input" placeholder="Search recipes or ingredients…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="sr-only" htmlFor="r-group">
          Main protein
        </label>
        <select id="r-group" className="input select-compact" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">All proteins</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {GROUP_LABELS[g] ?? g}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-row">
        <label className="inline-check">
          <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> Favourites only
        </label>
        {!day && (
          <label className="inline-check">
            <input type="checkbox" checked={onlySuitable} onChange={(e) => setOnlySuitable(e.target.checked)} /> Suitable for my whole family
          </label>
        )}
        <label className="inline-check">
          <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} /> 30 minutes or less
        </label>
        <span className="muted small">{rows.length} shown</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="📖" title="No recipes match">
          {onlySuitable || day ? 'Try clearing a filter. Recipes that conflict with allergies, intolerances, diets or exclusions are hidden.' : 'Try a different search.'}
        </EmptyState>
      ) : (
        <div className="grid grid-recipes">
          {rows.map(({ r, ev }) => {
            const unverified = analyseIngredients(r.ingredients, foodMap).unverified.length > 0;
            return (
              <article key={r.id} className="card recipe-card">
                <div className="recipe-card-media">
                  <RecipeLink id={r.id} className="block-link">
                    <RecipeImage recipe={r} foods={foodMap} />
                  </RecipeLink>
                  <Heart on={favourites.has(r.id)} onToggle={() => toggleFavourite(r.id)} name={r.name} />
                </div>
                <div className="recipe-card-body">
                  <p className="muted small">{r.cuisine}</p>
                  <p className="recipe-desc">{r.description}</p>
                  <RecipeMeta recipe={r} />
                  <div className="tag-row">
                    {r.customised && <span className="badge badge-soft">Customised</span>}
                    {unverified && <span className="badge badge-warn">Needs allergen review</span>}
                    {!ev.ok && <span className="badge badge-danger" title={ev.blocks.map((b) => b.label).join('\n')}>Not suitable for everyone</span>}
                  </div>
                  {!ev.ok && <p className="block-reason">{ev.blocks[0].label}</p>}
                  {day && (
                    <button className="btn btn-primary btn-sm" onClick={() => pick(r.id)}>
                      Choose for {formatDay(day.date, { weekday: 'short' })}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
