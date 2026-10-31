import { useState } from 'react';
import type { TakeawayCategory, TakeawayChoice, TakeawayPlace } from '../types';
import { useStore } from '../state/store';
import { Modal, useConfirm, useToast } from '../state/ui';
import { nowIso, uid } from '../lib/util';

export function useTakeawayCategory() {
  const { takeawayCategories } = useStore();
  return (id?: string): TakeawayCategory => takeawayCategories.find((c) => c.id === id) ?? { id: 'other', name: 'Other takeaway', emoji: '🛍️', builtIn: true };
}

/** Category tiles with a written label, plus "add your own". */
export function TakeawayCategoryTiles({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { takeawayCategories, saveTakeawayCategory } = useStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  return (
    <div>
      <div className="ta-tiles" role="radiogroup" aria-label="Type of takeaway">
        {takeawayCategories.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={value === c.id} className={`ta-tile ${value === c.id ? 'on' : ''}`} onClick={() => onChange(c.id)}>
            <span className="ta-tile-emoji" aria-hidden="true">
              {c.emoji}
            </span>
            <span className="ta-tile-name">{c.name}</span>
          </button>
        ))}
        {!adding && (
          <button type="button" className="ta-tile ta-tile-add" onClick={() => setAdding(true)}>
            <span className="ta-tile-emoji" aria-hidden="true">
              ＋
            </span>
            <span className="ta-tile-name">Add your own</span>
          </button>
        )}
      </div>
      {adding && (
        <div className="inline-form">
          <label htmlFor="ta-new-cat" className="sr-only">
            New takeaway type
          </label>
          <input id="ta-new-cat" className="input" placeholder="e.g. Vietnamese" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={async () => {
              const c: TakeawayCategory = { id: uid('tac'), name: name.trim(), emoji: '🥢', builtIn: false };
              await saveTakeawayCategory(c);
              onChange(c.id);
              setAdding(false);
              setName('');
            }}
          >
            Add
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/** Choosing a takeaway night: a saved favourite, or a type plus optional name and note. */
export function TakeawayPicker({ initial, onConfirm, confirmLabel = 'Make it a takeaway night' }: { initial?: TakeawayChoice; onConfirm: (c: TakeawayChoice) => void; confirmLabel?: string }) {
  const { takeawayPlaces, saveTakeawayPlace, household } = useStore();
  const catOf = useTakeawayCategory();
  const [choice, setChoice] = useState<TakeawayChoice>(initial ?? { categoryId: '' });
  const [remember, setRemember] = useState(false);
  const toast = useToast();
  const isSavedPlace = !!choice.placeId && takeawayPlaces.some((p) => p.id === choice.placeId);

  return (
    <div className="ta-picker">
      {takeawayPlaces.length > 0 && (
        <section aria-labelledby="ta-fav-h">
          <h3 id="ta-fav-h" className="sheet-heading">
            Your favourite takeaways
          </h3>
          <div className="ta-places">
            {takeawayPlaces.map((p) => {
              const c = catOf(p.categoryId);
              const on = choice.placeId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  className={`ta-place ${on ? 'on' : ''}`}
                  onClick={() => setChoice(on ? { categoryId: p.categoryId } : { categoryId: p.categoryId, placeId: p.id, name: p.name, note: p.usualOrder || choice.note })}
                >
                  <span className="ta-place-emoji" aria-hidden="true">
                    {c.emoji}
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <span className="muted small">{c.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section aria-labelledby="ta-type-h">
        <h3 id="ta-type-h" className="sheet-heading">
          Type of takeaway
        </h3>
        <TakeawayCategoryTiles value={choice.categoryId} onChange={(id) => setChoice({ ...choice, categoryId: id, placeId: isSavedPlace && takeawayPlaces.find((p) => p.id === choice.placeId)?.categoryId === id ? choice.placeId : undefined })} />
      </section>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ta-name">Restaurant or takeaway (optional)</label>
          <input id="ta-name" className="input" value={choice.name ?? ''} placeholder="e.g. Golden Dragon" onChange={(e) => setChoice({ ...choice, name: e.target.value, placeId: undefined })} />
        </div>
        <div className="field">
          <label htmlFor="ta-note">Usual order or note (optional)</label>
          <input id="ta-note" className="input" value={choice.note ?? ''} placeholder="e.g. 2 curries, rice, chips for the kids" onChange={(e) => setChoice({ ...choice, note: e.target.value })} />
        </div>
      </div>
      {!isSavedPlace && choice.name?.trim() && (
        <label className="inline-check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Save “{choice.name.trim()}” to My Favourite Takeaways
        </label>
      )}
      <div className="modal-actions sticky-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!choice.categoryId}
          onClick={async () => {
            let final: TakeawayChoice = { ...choice, name: choice.name?.trim() || undefined, note: choice.note?.trim() || undefined };
            if (remember && final.name && household) {
              const t = nowIso();
              const place: TakeawayPlace = { id: uid('place'), householdId: household.id, name: final.name, categoryId: final.categoryId, usualOrder: final.note, createdAt: t, updatedAt: t };
              await saveTakeawayPlace(place);
              final = { ...final, placeId: place.id };
              toast.show(`${place.name} saved to your favourite takeaways`);
            }
            onConfirm(final);
          }}
        >
          {choice.categoryId ? confirmLabel : 'Choose a type of takeaway'}
        </button>
      </div>
    </div>
  );
}

/** Add or edit a favourite takeaway place. */
export function TakeawayPlaceForm({ initial, onClose }: { initial?: TakeawayPlace; onClose: () => void }) {
  const { household, saveTakeawayPlace, deleteTakeawayPlace } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [p, setP] = useState<Partial<TakeawayPlace>>(initial ?? { categoryId: '' });
  const [error, setError] = useState('');
  const set = (k: keyof TakeawayPlace, v: string) => setP((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add a favourite takeaway'} onClose={onClose} wide>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!p.name?.trim()) return setError('Please enter the takeaway’s name.');
          if (!p.categoryId) return setError('Please choose a type of takeaway.');
          const t = nowIso();
          await saveTakeawayPlace({
            id: initial?.id ?? uid('place'),
            householdId: household!.id,
            name: p.name.trim(),
            categoryId: p.categoryId,
            address: p.address?.trim() || undefined,
            phone: p.phone?.trim() || undefined,
            website: p.website?.trim() || undefined,
            usualOrder: p.usualOrder?.trim() || undefined,
            notes: p.notes?.trim() || undefined,
            createdAt: initial?.createdAt ?? t,
            updatedAt: t,
          });
          toast.show(initial ? 'Takeaway updated' : `${p.name.trim()} added to your favourite takeaways`);
          onClose();
        }}
      >
        <div className="field">
          <label htmlFor="tp-name">Name</label>
          <input id="tp-name" className="input" value={p.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Golden Dragon" autoFocus />
        </div>
        <div className="field">
          <span className="label">Type of takeaway</span>
          <TakeawayCategoryTiles value={p.categoryId ?? ''} onChange={(id) => set('categoryId', id)} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="tp-address">Address or area (optional)</label>
            <input id="tp-address" className="input" value={p.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tp-phone">Phone (optional)</label>
            <input id="tp-phone" className="input" type="tel" value={p.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tp-web">Website (optional)</label>
            <input id="tp-web" className="input" type="url" value={p.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="tp-order">Favourite dishes or usual order (optional)</label>
          <input id="tp-order" className="input" value={p.usualOrder ?? ''} onChange={(e) => set('usualOrder', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tp-notes">Notes (optional)</label>
          <textarea id="tp-notes" className="input" rows={2} value={p.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Ask about nuts for Seán" />
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions sticky-actions">
          {initial && (
            <button
              type="button"
              className="btn btn-ghost danger-text push-left"
              onClick={async () => {
                if (!(await confirm({ title: `Remove ${initial.name}?`, message: 'It will be removed from your favourite takeaways. Planned takeaway nights keep their details.', confirmLabel: 'Remove', danger: true }))) return;
                await deleteTakeawayPlace(initial.id);
                toast.show(`${initial.name} removed`);
                onClose();
              }}
            >
              Remove
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {initial ? 'Save' : 'Add takeaway'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Safe link for a stored website: only http(s), otherwise shown as text. */
export function websiteHref(url?: string): string | null {
  if (!url) return null;
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
