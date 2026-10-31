import { useStore } from '../state/store';
import { go, href } from '../state/ui';
import { RecipeImage, RecipeLink } from '../components/common';
import { HouseholdForm } from './FamilyPage';
import { portionsFor } from '../lib/planner';
import { chosenRecipe, planSummary } from '../lib/planEdit';
import { listStats } from '../lib/shopping';
import { formatDay, plural, todayKey } from '../lib/util';
import { useTakeawayCategory } from '../components/takeaway';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function HomePage() {
  const { household, members, plan, list, prefs, savedMeals, recipeMap, foodMap } = useStore();
  const catOf = useTakeawayCategory();

  if (!household) {
    return (
      <div className="page home">
        <section className="hero">
          <div>
            <p className="eyebrow">Fáilte — welcome</p>
            <h1>
              Great food. Happy families. <span className="hero-accent">Dinner sorted.</span>
            </h1>
            <p className="lead">Tell us who's at your table and we'll suggest dinners everyone can eat, plan your week in minutes and write the shopping list for you.</p>
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
  const sum = plan ? planSummary(plan) : null;
  const tonightIndex = plan ? plan.days.findIndex((d) => d.date >= today) : -1;
  const tonight = tonightIndex >= 0 ? plan!.days[tonightIndex] : undefined;
  const tonightRecipe = tonight ? chosenRecipe(tonight, recipeMap) : undefined;
  const stats = listStats(list?.items ?? []);
  const saved = savedMeals.map((f) => recipeMap.get(f.recipeId)).filter(Boolean).slice(0, 8);
  const liked = Object.values(prefs?.status ?? {}).filter((s) => s === 'like').length;
  const when = tonight ? (tonight.date === today ? 'Tonight' : formatDay(tonight.date, { weekday: 'long' })) : '';

  const steps = [
    { done: members.length > 0, label: 'Add your family', path: 'family' },
    { done: liked > 0, label: 'Tell us foods you like', path: 'foods' },
    { done: !!plan, label: 'Plan your dinners', path: 'planner' },
    { done: !!sum && sum.cooked > 0, label: 'Choose your dinners', path: 'planner' },
    { done: stats.total > 0, label: 'Get your shopping list', path: 'shopping' },
  ];
  const remaining = steps.filter((s) => !s.done);

  return (
    <div className="page home">
      <section className="hero">
        <div>
          <p className="eyebrow">
            {greeting()}, {household.name}
          </p>
          <h1>
            Great food. Happy families. <span className="hero-accent">Dinner sorted.</span>
          </h1>
          <p className="lead">
            {plural(members.length, 'person', 'people')} at the table
            {sum ? ` · ${sum.sorted} of ${sum.total} days sorted` : ''}.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => go('planner')}>
              {plan ? (sum && sum.open ? `📅 Choose ${plural(sum.open, 'dinner')}` : '📅 Open your plan') : '✨ Plan this week'}
            </button>
            {stats.toBuy > 0 && (
              <button className="btn btn-secondary btn-lg" onClick={() => go('shopping')}>
                🛒 {stats.toBuy} to buy
              </button>
            )}
          </div>
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
                {s.done ? <span>{s.label}</span> : <a href={href(s.path)}>{s.label}</a>}
                {s.done && <span className="sr-only">(done)</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="dash-grid">
        <section className="card tonight" aria-labelledby="tn-h">
          <h2 id="tn-h" className="card-title">
            {tonight ? `${when}'s dinner` : 'Next dinner'}
          </h2>
          {tonight && tonightRecipe ? (
            <div className="tonight-body">
              <RecipeLink id={tonightRecipe.id} className="block-link">
                <RecipeImage recipe={tonightRecipe} foods={foodMap} />
              </RecipeLink>
              <p className="muted">{tonightRecipe.description}</p>
              <p className="meal-meta">
                ⏱ {tonightRecipe.prepMinutes + tonightRecipe.cookMinutes} min · {plural(portionsFor(tonight), 'portion')}
              </p>
              <a className="btn btn-secondary btn-sm" href={href(`recipes/${tonightRecipe.id}`)}>
                See the recipe
              </a>
            </div>
          ) : tonight?.mode === 'takeaway' ? (
            <div className="takeaway-night">
              <span className="ta-big" aria-hidden="true">
                {catOf(tonight.takeaway?.categoryId).emoji}
              </span>
              <div>
                <h3>{tonight.takeaway?.name || `${catOf(tonight.takeaway?.categoryId).name} takeaway`}</h3>
                <p className="muted small">Takeaway night — no cooking!</p>
                {tonight.takeaway?.note && <p className="ta-note">“{tonight.takeaway.note}”</p>}
              </div>
            </div>
          ) : (
            <>
              <p className="muted">{!plan ? 'No plan yet — it only takes a couple of minutes.' : tonight?.mode === 'none' ? 'Nothing planned — enjoy the night off.' : tonight ? 'Not chosen yet.' : 'Your plan has finished.'}</p>
              <button className="btn btn-primary btn-sm" onClick={() => go('planner')}>
                {plan && tonight ? 'Choose a dinner' : 'Plan your dinners'}
              </button>
            </>
          )}
        </section>

        <section className="card" aria-labelledby="wk-h">
          <h2 id="wk-h" className="card-title">
            This plan
          </h2>
          {plan && sum ? (
            <>
              <div className="progress" role="progressbar" aria-valuenow={Math.round((sum.sorted / sum.total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Days sorted">
                <div className="progress-fill" style={{ width: `${(sum.sorted / sum.total) * 100}%` }} />
              </div>
              <ul className="week-strip">
                {plan.days.map((d, i) => {
                  const r = chosenRecipe(d, recipeMap);
                  const cls = d.mode === 'takeaway' ? 'takeaway' : d.mode === 'none' ? 'skip' : r ? 'set' : 'open';
                  return (
                    <li key={d.date + i} className={cls}>
                      <span className="ws-day">{formatDay(d.date, { weekday: 'short' })}</span>
                      <span className="ws-meal">
                        {d.mode === 'takeaway' ? `${catOf(d.takeaway?.categoryId).emoji} ${d.takeaway?.name || catOf(d.takeaway?.categoryId).name + ' takeaway'}` : d.mode === 'none' ? 'Night off' : r ? r.name : 'Choose…'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="muted">Plan 3, 5, 7 or 14 days — whatever suits your week.</p>
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
              <span className="stat-label">Still needed</span>
            </div>
            <div className="stat">
              <span className="stat-num">{stats.have}</span>
              <span className="stat-label">Ticked off</span>
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
            Your saved meals
          </h2>
          <a href={href('saved')}>See all →</a>
        </div>
        {saved.length ? (
          <div className="fav-row">
            {saved.map((r) => (
              <RecipeLink key={r!.id} id={r!.id} className="fav-card">
                <RecipeImage recipe={r!} foods={foodMap} size="sm" />
              </RecipeLink>
            ))}
          </div>
        ) : (
          <p className="muted">Tap ♡ Save on any dinner idea to keep it here for another week.</p>
        )}
      </section>

      <section className="section" aria-labelledby="qn-h">
        <h2 id="qn-h" className="section-title">
          Explore
        </h2>
        <div className="quick-grid">
          {[
            { path: 'recipes', icon: '📖', title: 'All recipes', text: `${recipeMap.size} family dinners` },
            { path: 'takeaways', icon: '🥡', title: 'Favourite takeaways', text: 'Make takeaway night one tap' },
            { path: 'family', icon: '👪', title: 'Your family', text: 'Allergies, diets & dislikes' },
            { path: 'foods', icon: '🥕', title: 'Food likes', text: 'Likes, dislikes & rankings' },
            { path: 'settings', icon: '⚙️', title: 'Backup & settings', text: 'Keep your data safe' },
          ].map((q) => (
            <a key={q.path} href={href(q.path)} className="quick-card">
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
