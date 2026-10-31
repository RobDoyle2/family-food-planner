import { useMemo, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Food, FoodStatus } from '../types';
import { useStore } from '../state/store';
import { Modal, useConfirm, useToast } from '../state/ui';
import { EmptyState, FoodImage, PageHeader, Toggle } from '../components/common';
import { FoodFormModal } from '../components/FoodForm';
import { searchFoods } from '../lib/foods';
import { allergenLabel, sortCategories } from '../data/constants';

type Filter = 'all' | 'like' | 'dislike' | 'exclude' | 'custom';

function StatusButtons({ food, status }: { food: Food; status?: FoodStatus }) {
  const { setFoodStatus } = useStore();
  const btn = (s: FoodStatus, icon: string, label: string) => (
    <button
      type="button"
      className={`status-btn status-${s} ${status === s ? 'on' : ''}`}
      aria-pressed={status === s}
      aria-label={`${label}: ${food.name}`}
      title={label}
      onClick={() => setFoodStatus(food.id, status === s ? null : s)}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="status-text">{label}</span>
    </button>
  );
  return (
    <div className="status-buttons" role="group" aria-label={`Preference for ${food.name}`}>
      {btn('like', '♥', 'Like')}
      {btn('dislike', '👎', 'Dislike')}
      {btn('exclude', '⛔', 'Exclude')}
    </div>
  );
}

function FoodCard({ food, onEdit }: { food: Food; onEdit: (f: Food) => void }) {
  const { prefs, data } = useStore();
  const status = prefs?.status[food.id];
  const cat = data.categories.find((c) => c.id === food.category);
  return (
    <article className={`card food-card ${status ? `has-${status}` : ''}`}>
      <FoodImage food={food} />
      <div className="food-card-body">
        <div className="food-card-tags">
          {food.custom && <span className="badge badge-soft">Custom</span>}
          {food.custom && food.allergenInfo === 'unknown' && <span className="badge badge-warn" title="Allergen information not checked">Unchecked</span>}
          {food.allergens.length > 0 && (
            <span className="badge badge-allergen" title={food.allergens.map(allergenLabel).join(', ')}>
              {food.allergens.length === 1 ? allergenLabel(food.allergens[0]).split(' ')[0] : `${food.allergens.length} allergens`}
            </span>
          )}
          {!food.custom && <span className="muted small">{cat?.name}</span>}
        </div>
        <StatusButtons food={food} status={status} />
        {food.custom && (
          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(food)}>
            Edit
          </button>
        )}
      </div>
    </article>
  );
}

function SortableRow({ food, index, count, onMove, onUnrank }: { food: Food; index: number; count: number; onMove: (from: number, to: number) => void; onUnrank: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: food.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`rank-row ${isDragging ? 'dragging' : ''}`}>
      <button className="drag-handle" aria-label={`Drag to reorder ${food.name}`} {...attributes} {...listeners}>
        ⠿
      </button>
      <span className="rank-num">{index + 1}</span>
      <FoodImage food={food} size="sm" showName={false} />
      <span className="rank-name">{food.name}</span>
      <div className="rank-actions">
        <button className="icon-btn" aria-label={`Move ${food.name} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
          ↑
        </button>
        <button className="icon-btn" aria-label={`Move ${food.name} down`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
          ↓
        </button>
        <button className="icon-btn" aria-label={`Remove ${food.name} from favourites`} title="Remove from liked foods" onClick={onUnrank}>
          ×
        </button>
      </div>
    </li>
  );
}

function RankingPanel() {
  const { prefs, foodMap, setRanking, setRankingEnabled, setFoodStatus } = useStore();
  const liked = useMemo(() => {
    const status = prefs?.status ?? {};
    const ranked = (prefs?.ranking ?? []).filter((id) => status[id] === 'like' && foodMap.has(id));
    const rest = Object.keys(status).filter((id) => status[id] === 'like' && !ranked.includes(id) && foodMap.has(id));
    return [...ranked, ...rest];
  }, [prefs, foodMap]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = (from: number, to: number) => setRanking(arrayMove(liked, from, to));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(liked.indexOf(String(e.active.id)), liked.indexOf(String(e.over.id)));
  };
  const enabled = prefs?.rankingEnabled ?? true;

  return (
    <section className="card ranking-card" aria-labelledby="rank-h">
      <div className="ranking-head">
        <div>
          <h2 id="rank-h" className="card-title">
            Favourite foods ranking
          </h2>
          <p className="muted">Drag to put the foods your family loves most at the top. Higher-ranked foods appear more often in suggestions.</p>
        </div>
        <Toggle checked={enabled} onChange={setRankingEnabled} label="Use ranking" />
      </div>
      {liked.length === 0 ? (
        <EmptyState icon="♥" title="No liked foods yet">
          Tap “Like” on foods in the catalogue and they'll appear here to rank.
        </EmptyState>
      ) : enabled ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={liked} strategy={verticalListSortingStrategy}>
            <ol className="rank-list" aria-label="Ranked favourite foods">
              {liked.map((id, i) => (
                <SortableRow key={id} food={foodMap.get(id)!} index={i} count={liked.length} onMove={move} onUnrank={() => setFoodStatus(id, null)} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <>
          <p className="hint">Ranking is off — all liked foods count equally.</p>
          <div className="chip-row">
            {liked.map((id) => (
              <span key={id} className="chip chip-good">
                {foodMap.get(id)?.name}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CategoryManager({ onClose }: { onClose: () => void }) {
  const { data, saveCategory, deleteCategory } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState('');
  const custom = data.categories.filter((c) => !c.builtIn);
  return (
    <Modal title="Food categories" onClose={onClose} small>
      <ul className="plain-list">
        {sortCategories(data.categories).map((c) => (
          <li key={c.id} className="cat-row">
            <span>
              {c.emoji} {c.name} <span className="muted small">({data.foods.filter((f) => f.category === c.id).length})</span>
            </span>
            {!c.builtIn && (
              <button
                className="btn btn-ghost btn-sm danger-text"
                onClick={async () => {
                  const n = data.foods.filter((f) => f.category === c.id).length;
                  if (await confirm({ title: `Delete “${c.name}”?`, message: n ? `${n} food(s) will move to “Other ingredients”.` : 'This category is empty.', confirmLabel: 'Delete', danger: true })) {
                    await deleteCategory(c.id);
                    toast.show('Category deleted');
                  }
                }}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (data.categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) return toast.show('That category already exists', 'error');
          await saveCategory({ id: `cat_${Date.now().toString(36)}`, name: name.trim(), emoji: '🏷️', builtIn: false });
          setName('');
          toast.show('Category added');
        }}
      >
        <label htmlFor="new-cat" className="sr-only">
          New category name
        </label>
        <input id="new-cat" className="input" placeholder="New category, e.g. Fruit" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" type="submit">
          Add
        </button>
      </form>
      {custom.length === 0 && <p className="hint">You haven't created any categories yet.</p>}
    </Modal>
  );
}

export default function FoodsPage() {
  const { data, prefs, deleteFood } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [tab, setTab] = useState<'browse' | 'rank'>('browse');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  const [managingCats, setManagingCats] = useState(false);

  const shown = useMemo(() => {
    let list = data.foods;
    if (cat !== 'all') list = list.filter((f) => f.category === cat);
    if (filter === 'custom') list = list.filter((f) => f.custom);
    else if (filter !== 'all') list = list.filter((f) => prefs?.status[f.id] === filter);
    return q.trim() ? searchFoods(q, list) : [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [data.foods, cat, filter, q, prefs]);

  const counts = useMemo(() => {
    const s = Object.values(prefs?.status ?? {});
    return { like: s.filter((x) => x === 'like').length, dislike: s.filter((x) => x === 'dislike').length, exclude: s.filter((x) => x === 'exclude').length };
  }, [prefs]);

  const removeFood = async (f: Food) => {
    const usedIn = data.recipes.filter((r) => r.ingredients.some((i) => i.foodId === f.id));
    const inProfiles = data.members.filter((m) => m.dislikes.includes(f.id) || [...m.allergies, ...m.intolerances].some((r) => r.kind === 'food' && r.id === f.id));
    const ok = await confirm({
      title: `Remove “${f.name}” from the catalogue?`,
      message: (
        <>
          <p>This custom food will be permanently deleted.</p>
          {usedIn.length > 0 && <p>It will also be removed from {usedIn.length} customised recipe(s): {usedIn.map((r) => r.name).join(', ')}.</p>}
          {inProfiles.length > 0 && (
            <p>
              <strong>It is listed in the profile of {inProfiles.map((m) => m.name).join(', ')}</strong> (allergy, intolerance or dislike) and will be removed from there.
            </p>
          )}
        </>
      ),
      confirmLabel: 'Delete food',
      danger: true,
    });
    if (!ok) return;
    await deleteFood(f.id);
    setEditing(null);
    toast.show(`${f.name} removed`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Food Preferences"
        subtitle="Tell us what your family likes, dislikes and never eats."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            + Add food
          </button>
        }
      />

      <div className="tabs" role="tablist" aria-label="Food preference views">
        <button role="tab" aria-selected={tab === 'browse'} className={`tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>
          Browse catalogue
        </button>
        <button role="tab" aria-selected={tab === 'rank'} className={`tab ${tab === 'rank' ? 'active' : ''}`} onClick={() => setTab('rank')}>
          Rank favourites {counts.like > 0 && <span className="count">{counts.like}</span>}
        </button>
      </div>

      {tab === 'rank' ? (
        <RankingPanel />
      ) : (
        <>
          <div className="toolbar">
            <div className="search-box">
              <label htmlFor="food-search" className="sr-only">
                Search foods
              </label>
              <span aria-hidden="true" className="search-icon">
                🔍
              </span>
              <input id="food-search" type="search" className="input" placeholder="Search foods, e.g. “sal” or “courgette”" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <label className="sr-only" htmlFor="food-filter">
              Show
            </label>
            <select id="food-filter" className="input select-compact" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="all">All foods</option>
              <option value="like">Liked ({counts.like})</option>
              <option value="dislike">Disliked ({counts.dislike})</option>
              <option value="exclude">Excluded ({counts.exclude})</option>
              <option value="custom">My custom foods ({data.foods.filter((f) => f.custom).length})</option>
            </select>
          </div>
          <div className="category-chips" role="group" aria-label="Categories">
            <button className={`cat-chip ${cat === 'all' ? 'active' : ''}`} aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
              All
            </button>
            {sortCategories(data.categories).map((c) => (
              <button key={c.id} className={`cat-chip ${cat === c.id ? 'active' : ''}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                <span aria-hidden="true">{c.emoji}</span> {c.name}
              </button>
            ))}
            <button className="cat-chip cat-chip-manage" onClick={() => setManagingCats(true)}>
              ✎ Categories
            </button>
          </div>
          <p className="hint legend">
            <strong>Like</strong> = suggest more often · <strong>Dislike</strong> = suggest less often · <strong>Exclude</strong> = never suggest (a strict rule)
          </p>

          {shown.length === 0 ? (
            <EmptyState
              icon="🔍"
              title={q ? `No foods match “${q}”` : 'No foods here yet'}
              action={
                <button className="btn btn-primary" onClick={() => setEditing('new')}>
                  {q ? `Add “${q}” as a new food` : 'Add a food'}
                </button>
              }
            >
              {q ? 'Try a shorter search, or add it to the catalogue.' : 'Add your own foods to this category.'}
            </EmptyState>
          ) : (
            <div className="grid grid-foods" aria-live="polite">
              {shown.map((f) => (
                <FoodCard key={f.id} food={f} onEdit={setEditing} />
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <FoodFormModal
          initial={editing === 'new' ? undefined : editing}
          defaultName={editing === 'new' ? q : ''}
          onClose={() => setEditing(null)}
          onDelete={editing === 'new' ? undefined : () => removeFood(editing)}
        />
      )}
      {managingCats && <CategoryManager onClose={() => setManagingCats(false)} />}
    </div>
  );
}
