import { useState } from 'react';
import type { Aisle, Quantity, ShoppingItem, ShoppingList, Unit } from '../types';
import { useStore } from '../state/store';
import { Modal, go, useConfirm, useToast } from '../state/ui';
import { EmptyState, PageHeader } from '../components/common';
import { AISLES, UNITS } from '../data/constants';
import { itemHint, itemQuantityText, listStats, listToCsv, listToText, newManualItem, selectedMeals, sortItems } from '../lib/shopping';
import { downloadFile, isEmbedded, nowIso, plural, todayKey } from '../lib/util';
import { useBuildShoppingList } from './PlannerPage';

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

export default function ShoppingPage() {
  const { household, list, plan, saveList, foodMap, recipeMap } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const buildList = useBuildShoppingList();
  const [view, setView] = useState<'buy' | 'all'>('buy');
  const [editing, setEditing] = useState<ShoppingItem | null>(null);

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
  const meals = plan ? selectedMeals(plan, recipeMap) : [];
  const unchosen = plan ? plan.days.filter((d) => !d.skipped && d.selected === null).length : 0;
  const stale = !!plan && !!current.generatedAt && plan.updatedAt > current.generatedAt;
  const visible = current.items.filter((i) => view === 'all' || !i.have);

  const exportList = async (filename: string, content: string, type: string) => {
    const result = await downloadFile(filename, content, type);
    if (result === 'saved') toast.show('List saved');
    else if (result === 'declined') toast.show('List not saved', 'info');
    else toast.show('Saving files isn’t available here — use Copy instead.', 'info');
  };

  const rebuild = async () => {
    if (current.items.some((i) => i.source === 'plan' && i.edited) && !(await confirm({ title: 'Rebuild from the meal plan?', message: 'Items from the plan will be recalculated, including ones you edited. Manual items and “already have it” ticks are kept.', confirmLabel: 'Rebuild' }))) return;
    const n = await buildList();
    toast.show(`List rebuilt: ${plural(n, 'item')}`);
  };

  return (
    <div className="page shopping-page">
      <PageHeader
        title="Shopping List"
        subtitle={meals.length ? `For ${plural(meals.length, 'dinner')}: ${meals.map((m) => m.recipe.name).join(', ')}` : 'Build it from your chosen dinners, or add items yourself.'}
        actions={
          <>
            {plan && (
              <button className="btn btn-secondary" onClick={rebuild} disabled={meals.length === 0}>
                ↻ {current.generatedAt ? 'Update from meal plan' : 'Build from meal plan'}
              </button>
            )}
          </>
        }
      />

      {stale && (
        <div className="notice no-print" role="status">
          Your meal plan has changed since this list was built.{' '}
          <button className="link-btn" onClick={rebuild}>
            Update the list
          </button>
        </div>
      )}
      {plan && unchosen > 0 && meals.length > 0 && <p className="hint no-print">{plural(unchosen, 'day')} in the plan still {unchosen === 1 ? 'has' : 'have'} no dinner chosen, so {unchosen === 1 ? 'it isn’t' : 'they aren’t'} included.</p>}

      <section className="stats" aria-label="Shopping list summary">
        <div className="stat">
          <span className="stat-num">{stats.total}</span>
          <span className="stat-label">Total ingredients</span>
        </div>
        <div className="stat stat-accent">
          <span className="stat-num">{stats.toBuy}</span>
          <span className="stat-label">Still to buy</span>
        </div>
        <div className="stat">
          <span className="stat-num">{stats.have}</span>
          <span className="stat-label">Already have</span>
        </div>
      </section>

      <div className="list-toolbar no-print">
        <div className="seg" role="tablist" aria-label="List view">
          <button role="tab" aria-selected={view === 'buy'} className={view === 'buy' ? 'active' : ''} onClick={() => setView('buy')}>
            Still to buy ({stats.toBuy})
          </button>
          <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
            Full list ({stats.total})
          </button>
        </div>
        <div className="list-actions">
          {!isEmbedded && (
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()} disabled={!stats.total}>
              🖨 Print
            </button>
          )}
          <button className="btn btn-ghost btn-sm" disabled={!stats.total} onClick={() => exportList(`shopping-list-${todayKey()}.txt`, listToText(current.items, `${household.name} — shopping list`, false), 'text/plain')}>
            ⬇ Export text
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!stats.total} onClick={() => exportList(`shopping-list-${todayKey()}.csv`, listToCsv(current.items), 'text/csv')}>
            ⬇ Export CSV
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!stats.toBuy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(listToText(current.items, `${household.name} — shopping list`, true));
                toast.show('Items still to buy copied');
              } catch {
                toast.show('Copying is not available in this browser — use Export instead.', 'error');
              }
            }}
          >
            ⧉ Copy
          </button>
          {stats.total > 0 && (
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
          )}
        </div>
      </div>

      <h2 className="print-only">{household.name} — shopping list</h2>

      {current.items.length === 0 ? (
        <EmptyState
          icon="🛒"
          title="Your shopping list is empty"
          action={
            plan && meals.length ? (
              <button className="btn btn-primary" onClick={rebuild}>
                Build from {plural(meals.length, 'chosen dinner')}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => go('planner')}>
                Go to Meal Planner
              </button>
            )
          }
        >
          {plan ? (meals.length ? 'Build the list from your chosen dinners.' : 'Choose dinners in the Meal Planner first.') : 'Create a meal plan and choose dinners, then build the list here.'}
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon="🎉" title="All done!" action={<button className="btn btn-secondary" onClick={() => setView('all')}>Show full list</button>}>
          You already have everything on the list.
        </EmptyState>
      ) : (
        <div className="aisles">
          {AISLES.map((a) => {
            const items = visible.filter((i) => i.aisle === a.id);
            if (!items.length) return null;
            return (
              <section key={a.id} className="card aisle" aria-labelledby={`aisle-${a.id}`}>
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
                          <input type="checkbox" checked={i.have} aria-label={`Already have ${i.name}`} onChange={() => save(current.items.map((x) => (x.id === i.id ? { ...x, have: !x.have } : x)))} />
                          <span aria-hidden="true">Already have it</span>
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
                              await save(current.items.filter((x) => x.id !== i.id));
                              toast.show(`${i.name} removed`);
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
