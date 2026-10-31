import { ConfirmProvider, ToastProvider, useHashRoute, href } from './state/ui';
import { StoreProvider, useStore } from './state/store';
import HomePage from './pages/HomePage';
import FamilyPage from './pages/FamilyPage';
import FoodsPage from './pages/FoodsPage';
import PlannerPage from './pages/PlannerPage';
import RecipesPage from './pages/RecipesPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import ShoppingPage from './pages/ShoppingPage';
import SettingsPage from './pages/SettingsPage';
import SavedPage from './pages/SavedPage';
import RecipeEditorPage from './pages/RecipeEditorPage';

const NAV = [
  { path: 'home', label: 'Home', icon: '🏡' },
  { path: 'planner', label: 'Meal Plan', short: 'Plan', icon: '📅' },
  { path: 'saved', label: 'Saved', icon: '♡' },
  { path: 'shopping', label: 'Shopping', icon: '🛒' },
  { path: 'family', label: 'Family', icon: '👪' },
];

/** Family profiles and food preferences sit together: both describe the household. */
function FamilyTabs({ active }: { active: 'family' | 'foods' }) {
  return (
    <nav className="sub-tabs" aria-label="Family sections">
      <a href={href('family')} className={active === 'family' ? 'active' : ''} aria-current={active === 'family' ? 'page' : undefined}>
        People
      </a>
      <a href={href('foods')} className={active === 'foods' ? 'active' : ''} aria-current={active === 'foods' ? 'page' : undefined}>
        Food likes &amp; dislikes
      </a>
    </nav>
  );
}

function Shell() {
  const [route, navigate] = useHashRoute();
  const store = useStore();
  const [section, sub] = route;
  const active = section === 'recipes' ? 'planner' : section === 'foods' ? 'family' : section === 'takeaways' ? 'saved' : section;

  let page;
  switch (section) {
    case 'family':
      page = (
        <>
          <FamilyTabs active="family" />
          <FamilyPage />
        </>
      );
      break;
    case 'foods':
      page = (
        <>
          <FamilyTabs active="foods" />
          <FoodsPage />
        </>
      );
      break;
    case 'saved':
      page = <SavedPage key="saved" />;
      break;
    case 'takeaways':
      page = <SavedPage key="takeaways" initialTab="takeaways" />;
      break;
    case 'planner':
      page = <PlannerPage />;
      break;
    case 'recipes':
      page =
        sub === 'pick' ? (
          <RecipesPage key={`pick-${route[2]}`} pickDay={Number(route[2])} />
        ) : sub === 'new' ? (
          <RecipeEditorPage key="new" />
        ) : sub === 'edit' ? (
          <RecipeEditorPage key={`edit-${route[2]}`} id={route[2]} />
        ) : sub === 'own' ? (
          <RecipesPage key="own" initialTab="own" />
        ) : sub ? (
          <RecipeDetailPage key={sub} id={sub} />
        ) : (
          <RecipesPage key="all" />
        );
      break;
    case 'shopping':
      page = <ShoppingPage />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    default:
      page = <HomePage />;
  }

  return (
    <div className="app">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href={href('home')} onClick={(e) => { e.preventDefault(); navigate('home'); }}>
          <img src="./icon.svg" alt="" width="34" height="34" />
          <span>Family Food Planner</span>
        </a>
        <nav className="topnav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.path} href={href(n.path)} className={active === n.path ? 'active' : ''} aria-current={active === n.path ? 'page' : undefined}>
              <span aria-hidden="true">{n.icon}</span> {n.label}
            </a>
          ))}
        </nav>
        <a href={href('settings')} className={`settings-link ${active === 'settings' ? 'active' : ''}`} aria-current={active === 'settings' ? 'page' : undefined} aria-label="Settings" title="Settings">
          <span aria-hidden="true">⚙️</span>
          <span className="settings-text">Settings</span>
        </a>
      </header>

      {!store.storageOk && (
        <div className="storage-banner" role="alert">
          <strong>Storage problem:</strong> {store.loadError ?? 'Recent changes could not be saved to this device.'} Changes are kept only while this tab is open — export a backup from Settings.
        </div>
      )}

      <main id="main" tabIndex={-1} className="main">
        {store.ready ? page : <div className="loading" aria-busy="true"><div className="spinner" />Loading your kitchen…</div>}
      </main>

      <nav className="bottomnav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.path} href={href(n.path)} className={active === n.path ? 'active' : ''} aria-current={active === n.path ? 'page' : undefined}>
            <span className="bn-icon" aria-hidden="true">{n.icon}</span>
            <span className="bn-label">{n.short ?? n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider>
          <Shell />
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
