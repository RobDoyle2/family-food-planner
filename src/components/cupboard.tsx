// Cupboard staples: oils, seasonings and other things most homes keep in stock.
import type { StapleMode, StapleSetting, StockLevel } from '../types';
import { useStore } from '../state/store';
import { Modal, useToast } from '../state/ui';
import { FoodPicker } from './common';
import { SUGGESTED_STAPLES, stapleNeeded } from '../lib/shopping';

export const STAPLE_MODES: { id: StapleMode; label: string }[] = [
  { id: 'have', label: 'Usually have at home' },
  { id: 'always', label: 'Add to every list' },
  { id: 'low', label: 'Only add when running low' },
  { id: 'never', label: "Don't add automatically" },
];

export const STOCK_LEVELS: { id: StockLevel; label: string }[] = [
  { id: 'plenty', label: 'Have plenty' },
  { id: 'low', label: 'Running low' },
  { id: 'need', label: 'Need to buy' },
];

/**
 * One simple screen: the family's staples, how each is handled, and how much is left.
 * Anything marked running low or need to buy goes on the shopping list.
 */
export function CupboardSheet({ onClose }: { onClose: () => void }) {
  const { prefs, data, foodMap, setStaple, setStaples } = useStore();
  const toast = useToast();
  const staples = prefs?.staples ?? {};
  const ids = Object.keys(staples)
    .filter((id) => foodMap.has(id))
    .sort((a, b) => foodMap.get(a)!.name.localeCompare(foodMap.get(b)!.name));
  const onList = ids.filter((id) => stapleNeeded(staples[id])).length;

  const update = (id: string, patch: Partial<StapleSetting>) => setStaple(id, { ...staples[id], ...patch });

  return (
    <Modal title="Cupboard staples" onClose={onClose} wide>
      <p className="muted small">
        Things you usually keep at home. They're left off the shopping list unless you mark them as running low or need to buy, or choose “Add to every list”. {onList ? `${onList} on this list now.` : ''}
      </p>
      {ids.length === 0 ? (
        <div className="cupboard-empty">
          <p>No staples set up yet, so everything the recipes need goes on your list.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const next: Record<string, StapleSetting> = {};
              SUGGESTED_STAPLES.filter((id) => foodMap.has(id)).forEach((id) => (next[id] = { mode: 'have', stock: 'plenty' }));
              await setStaples(next);
              toast.show(`${Object.keys(next).length} common staples added — change any of them below`);
            }}
          >
            Use the suggested staples
          </button>
          <p className="hint">Oils, salt, pepper, garlic, onions, flour, sugar, butter, stock, herbs, spices, soy sauce, tomato purée, vinegar and more.</p>
        </div>
      ) : (
        <ul className="staples">
          {ids.map((id) => {
            const f = foodMap.get(id)!;
            const s = staples[id];
            const needed = stapleNeeded(s);
            return (
              <li key={id} className={`staple ${needed ? 'on-list' : ''}`}>
                <div className="staple-top">
                  <span className="staple-name">
                    <span aria-hidden="true">{f.emoji}</span> {f.name}
                    {needed && <span className="badge badge-accent">On the list</span>}
                  </span>
                  <button type="button" className="icon-btn" aria-label={`Remove ${f.name} from staples`} onClick={() => setStaple(id, null)}>
                    ×
                  </button>
                </div>
                <div className="staple-controls">
                  <label className="sr-only" htmlFor={`st-mode-${id}`}>
                    How to handle {f.name}
                  </label>
                  <select id={`st-mode-${id}`} className="input select-compact" value={s.mode} onChange={(e) => update(id, { mode: e.target.value as StapleMode })}>
                    {STAPLE_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  {(s.mode === 'have' || s.mode === 'low') && (
                    <div className="seg small" role="group" aria-label={`How much ${f.name} is left`}>
                      {STOCK_LEVELS.map((l) => (
                        <button key={l.id} type="button" aria-pressed={s.stock === l.id} className={s.stock === l.id ? 'active' : ''} onClick={() => update(id, { stock: l.id })}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="field">
        <span className="mini-label">Add a staple</span>
        <FoodPicker label="Add a staple" foods={data.foods} selected={ids} placeholder="Search, e.g. rice, ketchup…" onPick={(f) => setStaple(f.id, { mode: 'have', stock: 'plenty' })} />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
