import { useEffect, useState } from 'react';
import type { Aisle, Quantity, ShoppingItem, ShoppingList, Unit } from '../types';
import { useStore } from '../state/store';
import { Modal, go, href, useConfirm, useToast } from '../state/ui';
import { EmptyState, PageHeader } from '../components/common';
import { AISLES, UNITS } from '../data/constants';
import { itemHint, itemQuantityText, listStats, listToCsv, listToText, newManualItem, selectedMeals, sortItems } from '../lib/shopping';
import { downloadFile, isEmbedded, nowIso, plural, todayKey } from '../lib/util';
import { useAddRecipeToList, useBuildShoppingList } from './PlannerPage';

function ItemEditor({ item, onSave, onClose }: { item: ShoppingItem; onSave: (i: ShoppingItem) => void; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [aisle, setAisle] = useState<Aisle>(item.aisle);
  const [qs, setQs] = useState<Quantity[]>(item.quantities.length ? item.quantities : [{ amount: 1, unit: 'item' }]);
  const [error, setError] = useState('');
  return (
    <Modal title={`Edit ${item.name}`} onClose={onClose} small>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setError('Please enter a name.');
          onSave({ ...item, name: name.trim(), aisle, quantities: qs.filter((q) => q.amount > 0), edited: true });
        }}
      >
        <div className="field">
          <label htmlFor="ie-name">Item</label>
          <input id="ie-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ie-aisle">Section</label>
          <select id="ie-aisle" className="input" value={aisle} onChange={(e) => setAisle(e.target.value as Aisle)}>
            {AISLES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="fieldset">
          <legend>Quantity</legend>
          {qs.map((q, i) => (
            <div className="qty-row" key={i}>
              <label className="sr-only" htmlFor={`q-amt-${i}`}>
                Amount
              </label>
              <input id={`q-amt-${i}`} className="input input-num" type="number" min={0} step="any" value={q.amount} onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, amount: Math.max(0, Number(e.target.value) || 0) } : x)))} />
              <label className="sr-only" htmlFor={`q-unit-${i}`}>
                Unit
              </label>
              <select id={`q-unit-${i}`} className="input select-compact" value={q.unit} onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, unit: e.target.value as Unit } : x)))}>
                {UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.plural}
                  </option>
                ))}
              </select>
              {qs.length > 1 && (
                <button type="button" className="icon-btn" aria-label="Remove this quantity" onClick={() => setQs(qs.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" className="link-btn" onClick={() => setQs([...qs, { amount: 1, unit: 'item' }])}>
            + Add another quantity (different unit)
          </button>
        </fieldset>
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddItemForm({ onAdd }: { onAdd: (i: ShoppingItem) => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>('item');
  const [aisle, setAisle] = useState<Aisle>('other');
  return (
    <form
      className="card add-item"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const n = parseFloat(amount);
        onAdd(newManualItem(name, Number.isFinite(n) && n > 0 ? { amount: n, unit } : null, aisle));
        setName('');
        setAmount('');
      }}
    >
      <h2 className="card-title">Add an item</h2>
      <div className="add-item-grid">
        <div className="field grow">
          <label htmlFor="ai-name">Item</label>
          <input id="ai-name" className="input" placeholder="e.g. Milk, kitchen roll" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ai-amt">Amount</label>
          <input id="ai-amt" className="input input-num" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1" />
        </div>
        <div className="field">
          <label htmlFor="ai-unit">Unit</label>
          <select id="ai-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.plural}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ai-aisle">Section</label>
          <select id="ai-aisle" className="input" value={aisle} onChange={(e) => setAisle(e.target.value as Aisle)}>
            {AISLES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary add-item-btn" type="submit" disabled={!name.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}

// Remembered per device: which sections are collapsed, and whether ticked items are hidden in shop mode.
function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* storage unavailable: keep for this session only */
    }
  };
  return [value, set];
}

/** Compact checklist for walking round the shop. */
function ShopMode({ items, onToggle }: { items: ShoppingItem[]; onToggle: (i: ShoppingItem) => void }) {
  const [collapsed, setCollapsed] = usePersisted<string[]>('ffp.shop.collapsed', []);
  const [hideTicked, setHideTicked] = usePersisted<boolean>('ffp.shop.hideTicked', true);
  const [showTicked, setShowTicked] = useState(false);
  const ticked = items.filter((i) => i.have);
  const toggleSection = (id: string) => setCollapsed(collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id]);

  return (
    <div className="shop-mode">
      <label className="toggle shop-hide">
        <input type="checkbox" role="switch" checked={hideTicked} onChange={(e) => setHideTicked(e.target.checked)} />
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-thumb" />
        </span>
        <span className="toggle-label">Hide ticked items</span>
      </label>
      {AISLES.map((a) => {
        const all = items.filter((i) => i.aisle === a.id);
        if (!all.length) return null;
        const left = all.filter((i) => !i.have).length;
        const rows = hideTicked ? all.filter((i) => !i.have) : all;
        const open = !collapsed.includes(a.id);
        if (hideTicked && left === 0) return null;
        return (
          <section key={a.id} className={`shop-section ${left === 0 ? 'done' : ''}`}>
            <h3 className="shop-section-h">
              <button type="button" className="shop-section-btn" aria-expanded={open} onClick={() => toggleSection(a.id)}>
                <span aria-hidden="true">{a.emoji}</span>
                <span className="shop-section-name">{a.label}</span>
                <span className="shop-section-count">{left === 0 ? '✓ done' : `${left} left`}</span>
                <span className="chev" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
              </button>
            </h3>
            {open && (
              <ul className="shop-rows">
                {rows.map((i) => (
                  <ShopRow key={i.id} item={i} onToggle={onToggle} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {hideTicked && ticked.length > 0 && (
        <section className="shop-section ticked-section">
          <h3 className="shop-section-h">
            <button type="button" className="shop-section-btn" aria-expanded={showTicked} onClick={() => setShowTicked(!showTicked)}>
              <span aria-hidden="true">✓</span>
              <span className="shop-section-name">Ticked off</span>
              <span className="shop-section-count">{ticked.length}</span>
              <span className="chev" aria-hidden="true">
                {showTicked ? '▾' : '▸'}
              </span>
            </button>
          </h3>
          {showTicked && (
            <ul className="shop-rows">
              {ticked.map((i) => (
                <ShopRow key={i.id} item={i} onToggle={onToggle} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ShopRow({ item, onToggle }: { item: ShoppingItem; onToggle: (i: ShoppingItem) => void }) {
  const q = itemQuantityText(item);
  return (
    <li>
      <label className={`shop-row ${item.have ? 'have' : ''}`}>
        <input type="checkbox" className="shop-check" checked={item.have} aria-label={`Tick off ${item.name}`} onChange={() => onToggle(item)} />
        <span className="shop-check-box" aria-hidden="true">
          {item.have ? '✓' : ''}
        </span>
        <span className="shop-name">{item.name}</span>
        {q && <span className="shop-qty">{q}</span>}
      </label>
    </li>
  );
}

export default function ShoppingPage() {
  const { household, list, plan, saveList, foodMap, recipeMap, settings, setShoppingView } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const buildList = useBuildShoppingList();
  const addToList = useAddRecipeToList();
  const [fullFilter, setFullFilter] = useState<'buy' | 'all'>('all');
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [quickName, setQuickName] = useState('');
  const view = settings.shoppingView ?? 'shop';

  const meals = plan ? selectedMeals(plan, recipeMap) : [];
  const generatedAt = list?.generatedAt ?? null;
  const stale = !!plan && !!generatedAt && plan.updatedAt > generatedAt;
  const hasEdits = !!list?.items.some((i) => i.source === 'plan' && i.edited);

  // Keep the list in step with the plan automatically, unless the user has edited plan items by hand.
  useEffect(() => {
    if (stale && !hasEdits && meals.length) buildList().then(() => toast.show('Shopping list updated from your plan', 'info'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, hasEdits]);

  if (!household) {
    return (
      <div className="page">
        <PageHeader title="Shopping List" />
        <EmptyState icon="🛒" title="Set up your household first" action={<button className="btn btn-primary" onClick={() => go('family')}>Go to My Family</button>} />
      </div>
    );
  }

  const current: ShoppingList = list ?? { id: household.id, householdId: household.id, planId: null, items: [], generatedAt: null, updatedAt: nowIso() };
  const stats = listStats(current.items);
  const save = (items: ShoppingItem[]) => saveList({ ...current, items: sortItems(items) });
  const unchosen = plan ? plan.days.filter((d) => d.mode === 'cook' && d.selected === null).length : 0;
  const takeaways = plan ? plan.days.filter((d) => d.mode === 'takeaway').length : 0;
  const visibleFull = current.items.filter((i) => fullFilter === 'all' || !i.have);

  const toggle = async (i: ShoppingItem) => {
    const items = current.items.map((x) => (x.id === i.id ? { ...x, have: !x.have } : x));
    await save(items);
    const hidden = view === 'shop' && !i.have && (() => {
      try {
        return JSON.parse(localStorage.getItem('ffp.shop.hideTicked') ?? 'true');
      } catch {
        return true;
      }
    })();
    if (hidden) toast.show(`${i.name} ticked off`, 'success', { label: 'Undo', onClick: () => save(items.map((x) => (x.id === i.id ? { ...x, have: false } : x))) });
  };

  const exportList = async (filename: string, content: string, type: string) => {
    const result = await downloadFile(filename, content, type);
    if (result === 'saved') toast.show('List saved');
    else if (result === 'declined') toast.show('List not saved', 'info');
    else toast.show('Saving files isn’t available here — use Copy instead.', 'info');
  };

  const rebuild = async () => {
    if (hasEdits && !(await confirm({ title: 'Update from the meal plan?', message: 'Items from the plan will be recalculated, including ones you edited. Your own items and ticks are kept.', confirmLabel: 'Update' }))) return;
    const n = await buildList();
    toast.show(`List updated: ${plural(n, 'item')}`);
  };

  return (
    <div className={`page shopping-page view-${view}`}>
      <header className="shop-header">
        <div className="shop-title-row">
          <h1>Shopping list</h1>
          <div className="seg" role="tablist" aria-label="Shopping list view">
            <button role="tab" aria-selected={view === 'shop'} className={view === 'shop' ? 'active' : ''} onClick={() => setShoppingView('shop')}>
              Shop
            </button>
            <button role="tab" aria-selected={view === 'full'} className={view === 'full' ? 'active' : ''} onClick={() => setShoppingView('full')}>
              Full list
            </button>
          </div>
        </div>
        <div className="shop-summary" aria-label="Shopping list summary">
          <span>
            <strong>{stats.total}</strong> items
          </span>
          <span className="needed">
            <strong>{stats.toBuy}</strong> still needed
          </span>
          <span>
            <strong>{stats.have}</strong> ticked off
          </span>
        </div>
        {stats.total > 0 && (
          <div className="progress slim" role="progressbar" aria-valuenow={Math.round((stats.have / stats.total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Items ticked off">
            <div className="progress-fill" style={{ width: `${(stats.have / stats.total) * 100}%` }} />
          </div>
        )}
      </header>

      {meals.length > 0 && (
        <p className="shop-source muted small no-print">
          For {plural(meals.length, 'dinner')}
          {takeaways ? ` · ${plural(takeaways, 'takeaway night')} need nothing from the shop` : ''}
          {unchosen ? ` · ${plural(unchosen, 'day')} still to choose` : ''}
          {stale && hasEdits && (
            <>
              {' · '}
              <button className="link-btn" onClick={rebuild}>
                plan changed — update list
              </button>
            </>
          )}
        </p>
      )}

      {(list?.extraMeals?.length ?? 0) > 0 && (
        <div className="extra-meals no-print" aria-label="Recipes added to this list">
          <span className="muted small">Also on this list:</span>
          {list!.extraMeals!.map((e) => {
            const r = recipeMap.get(e.recipeId);
            if (!r) return null;
            return (
              <span key={e.recipeId} className="chip chip-good">
                <a href={href(`recipes/${r.id}`)}>{r.name}</a> ({e.portions})
                <button
                  type="button"
                  className="chip-x"
                  aria-label={`Take ${r.name} off the shopping list`}
                  onClick={async () => {
                    await addToList(e.recipeId, 0);
                    toast.show(`${r.name}'s ingredients taken off the list`, 'info', { label: 'Undo', onClick: () => addToList(e.recipeId, e.portions) });
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {view === 'shop' && (
        <form
          className="quick-add no-print"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!quickName.trim()) return;
            await save([...current.items, newManualItem(quickName, null, 'other')]);
            toast.show(`${quickName.trim()} added`);
            setQuickName('');
          }}
        >
          <label htmlFor="quick-add" className="sr-only">
            Add an item
          </label>
          <input id="quick-add" className="input" placeholder="＋ Add an item (e.g. kitchen roll)" value={quickName} onChange={(e) => setQuickName(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!quickName.trim()}>
            Add
          </button>
        </form>
      )}

      {current.items.length === 0 ? (
        <EmptyState
          icon="🛒"
          title="Your shopping list is empty"
          action={
            plan && meals.length ? (
              <button className="btn btn-primary" onClick={rebuild}>
                Make list from {plural(meals.length, 'chosen dinner')}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => go('planner')}>
                Go to Meal Planner
              </button>
            )
          }
        >
          {plan ? (meals.length ? 'Make the list from your chosen dinners.' : 'Choose dinners in the Meal Planner first.') : 'Plan your dinners and the list is made for you.'}
        </EmptyState>
      ) : view === 'shop' ? (
        stats.toBuy === 0 && stats.total > 0 ? (
          <>
            <EmptyState icon="🎉" title="All done — everything's ticked off!" />
            <ShopMode items={current.items} onToggle={toggle} />
          </>
        ) : (
          <ShopMode items={current.items} onToggle={toggle} />
        )
      ) : (
        <>
          <div className="list-toolbar no-print">
            <div className="seg small" role="tablist" aria-label="Which items">
              <button role="tab" aria-selected={fullFilter === 'all'} className={fullFilter === 'all' ? 'active' : ''} onClick={() => setFullFilter('all')}>
                Everything ({stats.total})
              </button>
              <button role="tab" aria-selected={fullFilter === 'buy'} className={fullFilter === 'buy' ? 'active' : ''} onClick={() => setFullFilter('buy')}>
                Still needed ({stats.toBuy})
              </button>
            </div>
            <div className="list-actions">
              {plan && (
                <button className="btn btn-ghost btn-sm" onClick={rebuild} disabled={meals.length === 0}>
                  ↻ Update from plan
                </button>
              )}
              {!isEmbedded && (
                <button className="btn btn-ghost btn-sm" onClick={() => window.print()} disabled={!stats.total}>
                  🖨 Print
                </button>
              )}
              <button className="btn btn-ghost btn-sm" disabled={!stats.total} onClick={() => exportList(`shopping-list-${todayKey()}.txt`, listToText(current.items, `${household.name} — shopping list`, false), 'text/plain')}>
                ⬇ Text
              </button>
              <button className="btn btn-ghost btn-sm" disabled={!stats.total} onClick={() => exportList(`shopping-list-${todayKey()}.csv`, listToCsv(current.items), 'text/csv')}>
                ⬇ CSV
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={!stats.toBuy}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(listToText(current.items, `${household.name} — shopping list`, true));
                    toast.show('Items still needed copied');
                  } catch {
                    toast.show('Copying is not available here — use the text export instead.', 'error');
                  }
                }}
              >
                ⧉ Copy
              </button>
              <button
                className="btn btn-ghost btn-sm danger-text"
                onClick={async () => {
                  if (await confirm({ title: 'Clear the whole list?', message: 'All items, including ones you added yourself, will be removed.', confirmLabel: 'Clear list', danger: true })) {
                    await saveList({ ...current, items: [], generatedAt: null });
                    toast.show('List cleared');
                  }
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <h2 className="print-only">{household.name} — shopping list</h2>
          {visibleFull.length === 0 ? (
            <EmptyState icon="🎉" title="Nothing left to buy" />
          ) : (
            <div className="aisles">
              {AISLES.map((a) => {
                const items = visibleFull.filter((i) => i.aisle === a.id);
                if (!items.length) return null;
                return (
                  <section key={a.id} className="aisle" aria-labelledby={`aisle-${a.id}`}>
                    <h3 id={`aisle-${a.id}`} className="aisle-title">
                      <span aria-hidden="true">{a.emoji}</span> {a.label} <span className="count">{items.length}</span>
                    </h3>
                    <ul className="items">
                      {items.map((i) => {
                        const hint = itemHint(i, foodMap);
                        const q = itemQuantityText(i);
                        return (
                          <li key={i.id} className={`item ${i.have ? 'have' : ''}`}>
                            <div className="item-main">
                              <span className="item-name">{i.name}</span>
                              {q && <span className="item-qty">{q}</span>}
                              {hint && <span className="item-hint">{hint}</span>}
                              <div className="item-sub">
                                {i.source === 'manual' ? <span className="badge badge-soft">Added by you</span> : <span className="muted small">{i.recipes.join(' · ')}</span>}
                                {i.edited && <span className="badge badge-soft">Edited</span>}
                                {i.labelCheck && <span className="muted small">· check label</span>}
                              </div>
                            </div>
                            <label className="have-toggle">
                              <input type="checkbox" checked={i.have} aria-label={`Tick off ${i.name}`} onChange={() => toggle(i)} />
                              <span aria-hidden="true">Got it</span>
                            </label>
                            <div className="item-actions no-print">
                              <button className="icon-btn" aria-label={`Edit ${i.name}`} title="Edit" onClick={() => setEditing(i)}>
                                ✎
                              </button>
                              <button
                                className="icon-btn"
                                aria-label={`Remove ${i.name}`}
                                title="Remove"
                                onClick={async () => {
                                  const before = current.items;
                                  await save(current.items.filter((x) => x.id !== i.id));
                                  toast.show(`${i.name} removed`, 'success', { label: 'Undo', onClick: () => save(before) });
                                }}
                              >
                                🗑
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
          <div className="no-print">
            <AddItemForm
              onAdd={async (item) => {
                await save([...current.items, item]);
                toast.show(`${item.name} added`);
              }}
            />
          </div>
        </>
      )}

      {editing && (
        <ItemEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async (i) => {
            await save(current.items.map((x) => (x.id === i.id ? i : x)));
            setEditing(null);
            toast.show(`${i.name} updated`);
          }}
        />
      )}
    </div>
  );
}
