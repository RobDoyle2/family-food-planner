import { useStore } from '../state/store';
import { go, href } from '../state/ui';
import { RecipeImage, RecipeLink, RecipeMeta } from '../components/common';
import { HouseholdForm } from './FamilyPage';
import { portionsFor } from '../lib/planner';
import { listStats } from '../lib/shopping';
import { formatDay, plural, todayKey } from '../lib/util';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function HomePage() {
  const { household, members, plan, list, prefs, favourites, recipeMap, foodMap } = useStore();

  if (!household) {
    return (
      <div className="page home">
        <section className="hero">
          <div>
            <p className="eyebrow">Fáilte — welcome</p>
            <h1>Dinner, decided.</h1>
            <p className="lead">Family Food Planner suggests two dinner ideas for every day, respects everyone's allergies and preferences, and writes your shopping list for you.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            🥘
          </div>
        </section>
        <HouseholdForm />
      </div>
    );
  }

  const today = todayKey();
  const chosen = plan?.days.filter((d) => !d.skipped && d.selected !== null) ?? [];
  const active = plan?.days.filter((d) => !d.skipped) ?? [];
  const pct = active.length ? Math.round((chosen.length / active.length) * 100) : 0;
  const nextDay = plan?.days.find((d) => d.date >= today && !d.skipped && d.selected !== null);
  const nextRecipe = nextDay ? recipeMap.get(nextDay.options[nextDay.selected!]!) : undefined;
  const stats = listStats(list?.items ?? []);
  const favs = [...favourites].map((id) => recipeMap.get(id)).filter(Boolean).slice(0, 6);
  const liked = Object.values(prefs?.status ?? {}).filter((s) => s === 'like').length;

  const steps = [
    { done: members.length > 0, label: 'Add your family members', path: 'family' },
    { done: liked > 0, label: 'Mark foods you like', path: 'foods' },
    { done: !!plan, label: 'Create a meal plan', path: 'planner' },
    { done: chosen.length > 0, label: 'Choose your dinners', path: 'planner' },
    { done: stats.total > 0, label: 'Build your shopping list', path: 'shopping' },
  ];
  const remaining = steps.filter((s) => !s.done);

  return (
    <div className="page home">
      <section className="hero">
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1>{household.name}</h1>
          <p className="lead">
            {plural(members.length, 'person', 'people')} at the table
            {plan ? ` · ${chosen.length} of ${active.length} dinners planned` : ''}.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => go('planner')}>
            {plan ? '📅 Open meal plan' : '✨ Create meal plan'}
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          🥘
        </div>
      </section>

      {remaining.length > 0 && (
        <section className="card checklist" aria-labelledby="ck-h">
          <h2 id="ck-h" className="card-title">
            Getting started
          </h2>
          <ol>
            {steps.map((s) => (
              <li key={s.label} className={s.done ? 'done' : ''}>
                <span className="check" aria-hidden="true">
                  {s.done ? '✓' : ''}
                </span>
                {s.done ? (
                  <span>{s.label}</span>
                ) : (
                  <a href={href(s.path)}>{s.label}</a>
                )}
                {s.done && <span className="sr-only">(done)</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="dash-grid">
        <section className="card next-dinner" aria-labelledby="nd-h">
          <h2 id="nd-h" className="card-title">
            Next dinner
          </h2>
          {nextDay && nextRecipe ? (
            <div className="next-body">
              <RecipeLink id={nextRecipe.id} className="block-link">
                <RecipeImage recipe={nextRecipe} foods={foodMap} />
              </RecipeLink>
              <div>
                <p className="eyebrow">{nextDay.date === today ? 'Tonight' : formatDay(nextDay.date)}</p>
                <h3>
                  <RecipeLink id={nextRecipe.id}>{nextRecipe.name}</RecipeLink>
                </h3>
                <RecipeMeta recipe={nextRecipe} />
                <p className="muted small">For {plural(portionsFor(nextDay), 'portion')}</p>
              </div>
            </div>
          ) : (
            <p className="muted">{plan ? 'No upcoming dinner chosen yet.' : 'No meal plan yet.'}</p>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => go('planner')}>
            {plan ? 'Go to planner' : 'Create meal plan'}
          </button>
        </section>

        <section className="card" aria-labelledby="pp-h">
          <h2 id="pp-h" className="card-title">
            Meal planning progress
          </h2>
          {plan ? (
            <>
              <div className="progress-label">
                <strong>{chosen.length}</strong> of {active.length} dinners chosen
              </div>
              <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Dinners chosen">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <ul className="week-strip">
                {plan.days.map((d, i) => {
                  const r = d.selected !== null ? recipeMap.get(d.options[d.selected]!) : undefined;
                  return (
                    <li key={d.date + i} className={d.skipped ? 'skip' : r ? 'set' : 'open'}>
                      <span className="ws-day">{formatDay(d.date, { weekday: 'short' })}</span>
                      <span className="ws-meal">{d.skipped ? 'Not planned' : r ? r.name : 'Choose…'}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="muted">Create a plan to see your week at a glance.</p>
          )}
        </section>

        <section className="card" aria-labelledby="sl-h">
          <h2 id="sl-h" className="card-title">
            Shopping list
          </h2>
          <div className="stats compact">
            <div className="stat">
              <span className="stat-num">{stats.total}</span>
              <span className="stat-label">Items</span>
            </div>
            <div className="stat stat-accent">
              <span className="stat-num">{stats.toBuy}</span>
              <span className="stat-label">To buy</span>
            </div>
            <div className="stat">
              <span className="stat-num">{stats.have}</span>
              <span className="stat-label">Have</span>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => go('shopping')}>
            Open shopping list
          </button>
        </section>
      </div>

      <section className="section" aria-labelledby="fav-h">
        <div className="section-head">
          <h2 id="fav-h" className="section-title">
            Favourite recipes
          </h2>
          <a href={href('recipes')}>All recipes →</a>
        </div>
        {favs.length ? (
          <div className="fav-row">
            {favs.map((r) => (
              <RecipeLink key={r!.id} id={r!.id} className="fav-card">
                <RecipeImage recipe={r!} foods={foodMap} size="sm" />
              </RecipeLink>
            ))}
          </div>
        ) : (
          <p className="muted">Tap the ♡ on any recipe to save it here. Favourites are suggested a little more often.</p>
        )}
      </section>

      <section className="section" aria-labelledby="qn-h">
        <h2 id="qn-h" className="section-title">
          Quick links
        </h2>
        <div className="quick-grid">
          {[
            { path: 'family', icon: '👪', title: 'My Family', text: 'Members, allergies & diets' },
            { path: 'foods', icon: '🥕', title: 'Food Preferences', text: 'Likes, dislikes & rankings' },
            { path: 'recipes', icon: '📖', title: 'Recipes', text: `${recipeMap.size} family dinners` },
            { path: 'shopping', icon: '🛒', title: 'Shopping List', text: `${stats.toBuy} to buy` },
            { path: 'settings', icon: '⚙️', title: 'Settings', text: 'Backup & restore' },
          ].map((q) => (
            <a key={q.path} href={href(q.path)} className="quick-card card">
              <span className="quick-icon" aria-hidden="true">
                {q.icon}
              </span>
              <span>
                <strong>{q.title}</strong>
                <span className="muted small">{q.text}</span>
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
