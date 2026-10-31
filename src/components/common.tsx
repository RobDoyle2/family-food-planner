import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Food, Recipe } from '../types';
import { searchFoods, type FoodMap } from '../lib/foods';
import { plateEmojis, totalMinutes } from '../lib/recipes';
import { go, href } from '../state/ui';

const TINTS: Record<string, string> = {
  protein: '#f3e1d8',
  vegetables: '#e3ecdf',
  carbs: '#f4ead2',
  other: '#ece6dc',
};

const GROUP_TINTS: Record<string, [string, string]> = {
  beef: ['#f1d9cf', '#e7c2b3'],
  lamb: ['#efdcd2', '#e2c3b5'],
  pork: ['#f5e0d6', '#ebc9ba'],
  chicken: ['#f6e7cf', '#ecd4ad'],
  turkey: ['#f3e5d0', '#e6d0ae'],
  duck: ['#efdfd0', '#e0c7ae'],
  fish: ['#dfe9ea', '#c6d9dc'],
  seafood: ['#e2e7ee', '#c9d3e0'],
  eggs: ['#f7efd2', '#eedfa9'],
  vegetarian: ['#e3ecdf', '#cfdfc8'],
  beans: ['#e8eadb', '#d5dbbd'],
  lentils: ['#f1e6d3', '#e3d1b3'],
  tofu: ['#e9ece4', '#d6ddcc'],
};

/** A food "photo": the user's own image, or an illustrated tile. The name is always shown. */
export function FoodImage({ food, size = 'md', showName = true }: { food: Food; size?: 'sm' | 'md' | 'lg'; showName?: boolean }) {
  return (
    <figure className={`food-image food-image-${size}`}>
      <div className="food-image-art" style={{ background: TINTS[food.category] ?? '#eee6da' }} aria-hidden={!food.image}>
        {food.image ? <img src={food.image} alt={food.name} loading="lazy" /> : <span className="food-emoji">{food.emoji || '🍽️'}</span>}
      </div>
      {showName && <figcaption className="food-image-name">{food.name}</figcaption>}
    </figure>
  );
}

/** Recipe image: the user's photo or an illustrated plate. Always captioned with the dish name. */
export function RecipeImage({ recipe, foods, size = 'md', caption = true }: { recipe: Recipe; foods: FoodMap; size?: 'sm' | 'md' | 'lg'; caption?: boolean }) {
  const [a, b] = GROUP_TINTS[recipe.proteinGroup] ?? ['#efe7da', '#e1d5c1'];
  const em = plateEmojis(recipe, foods);
  return (
    <figure className={`recipe-image recipe-image-${size}`}>
      <div className="recipe-image-art" style={{ background: `radial-gradient(circle at 30% 20%, ${a}, ${b})` }}>
        {recipe.image ? (
          <img src={recipe.image} alt={recipe.name} loading="lazy" />
        ) : (
          <div className="plate" aria-hidden="true">
            <span className="plate-main">{em[0]}</span>
            {em[1] && <span className="plate-side plate-side-1">{em[1]}</span>}
            {em[2] && <span className="plate-side plate-side-2">{em[2]}</span>}
          </div>
        )}
      </div>
      {caption && <figcaption className="recipe-image-name">{recipe.name}</figcaption>}
    </figure>
  );
}

/**
 * Number control with large − / + buttons and a box you can type into.
 * Built for phones: big targets, no double-tap zoom, the keyboard closes when a button is pressed,
 * and the box can be cleared while typing (it falls back to the last valid number when you leave it).
 */
export function Stepper({ value, onChange, min = 0, max = 99, label, id }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string; id?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  const input = useRef<HTMLInputElement>(null);
  // Text being typed; null when the box isn't being edited.
  const [draft, setDraft] = useState<string | null>(null);
  const clampN = (n: number) => Math.min(max, Math.max(min, n));

  const step = (delta: number) => {
    if (document.activeElement === input.current) input.current?.blur();
    setDraft(null);
    onChange(clampN(value + delta));
  };

  const commit = (text: string) => {
    setDraft(null);
    const n = parseInt(text, 10);
    if (!Number.isNaN(n) && clampN(n) !== value) onChange(clampN(n));
  };

  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper-btn" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => step(-1)}>
        <span aria-hidden="true">−</span>
      </button>
      <input
        ref={input}
        id={inputId}
        className="stepper-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={draft ?? String(value)}
        onFocus={(e) => {
          setDraft(String(value));
          e.target.select();
        }}
        onChange={(e) => {
          const text = e.target.value.replace(/\D/g, '').slice(0, 3);
          setDraft(text);
          const n = parseInt(text, 10);
          if (!Number.isNaN(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'ArrowUp') {
            e.preventDefault();
            step(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            step(-1);
          }
        }}
      />
      <button type="button" className="stepper-btn" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => step(1)}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** Search-as-you-type food chooser used for allergies, dislikes and ingredient mapping. */
export function FoodPicker({
  foods,
  selected = [],
  onPick,
  placeholder = 'Search foods…',
  label,
}: {
  foods: Food[];
  selected?: string[];
  onPick: (f: Food) => void;
  placeholder?: string;
  label: string;
}) {
  const [q, setQ] = useState('');
  const id = useId();
  const results = useMemo(() => (q.trim() ? searchFoods(q, foods).filter((f) => !selected.includes(f.id)).slice(0, 8) : []), [q, foods, selected]);
  return (
    <div className="food-picker">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input id={id} type="search" className="input" value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {results.length > 0 && (
        <ul className="picker-results" role="listbox" aria-label={`${label} results`}>
          {results.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                className="picker-option"
                onClick={() => {
                  onPick(f);
                  setQ('');
                }}
              >
                <span aria-hidden="true">{f.emoji}</span> {f.name}
                {f.custom && <span className="badge badge-soft">Custom</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && results.length === 0 && <p className="hint">No matching foods. You can add it in Food Preferences → Add food.</p>}
    </div>
  );
}

export function Chip({ children, onRemove, tone = 'neutral' }: { children: ReactNode; onRemove?: () => void; tone?: 'neutral' | 'danger' | 'warn' | 'good' }) {
  return (
    <span className={`chip chip-${tone}`}>
      {children}
      {onRemove && (
        <button type="button" className="chip-x" aria-label={`Remove ${typeof children === 'string' ? children : ''}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}

export function RecipeMeta({ recipe }: { recipe: Recipe }) {
  return (
    <div className="recipe-meta">
      <span title="Total time">⏱ {totalMinutes(recipe)} min</span>
      <span title="Difficulty">◔ {recipe.difficulty}</span>
      <span title="Base servings">👥 {recipe.servings}</span>
    </div>
  );
}

export function Heart({ on, onToggle, name }: { on: boolean; onToggle: () => void; name: string }) {
  return (
    <button
      type="button"
      className={`heart ${on ? 'heart-on' : ''}`}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Save ${name} as a favourite`}
      title={on ? 'Remove from favourites' : 'Save as favourite'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {on ? '♥' : '♡'}
    </button>
  );
}

export function RecipeLink({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <a className={className} href={href(`recipes/${id}`)} onClick={(e) => {
      e.preventDefault();
      go(`recipes/${id}`);
    }}>
      {children}
    </a>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; id?: string }) {
  const auto = useId();
  const i = id ?? auto;
  return (
    <label className="toggle" htmlFor={i}>
      <input id={i} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  );
}
