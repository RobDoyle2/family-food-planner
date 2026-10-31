import { useRef, useState } from 'react';
import type { Recipe } from '../types';
import { useStore } from '../state/store';
import { Modal, useToast } from '../state/ui';
import { recipeShareText, shareText } from '../lib/share';

/** One-tap save to My Saved Meals (tap again to remove, with Undo). */
export function SaveMealButton({ recipe, compact }: { recipe: Recipe; compact?: boolean }) {
  const { favourites, toggleFavourite } = useStore();
  const toast = useToast();
  const on = favourites.has(recipe.id);
  return (
    <button
      type="button"
      className={`action-btn save-btn ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={on ? `Remove ${recipe.name} from saved meals` : `Save ${recipe.name}`}
      onClick={async (e) => {
        e.stopPropagation();
        await toggleFavourite(recipe.id);
        if (on) toast.show(`Removed from saved meals`, 'info', { label: 'Undo', onClick: () => toggleFavourite(recipe.id) });
        else toast.show(`Saved to My Saved Meals`);
      }}
    >
      <span aria-hidden="true">{on ? '♥' : '♡'}</span>
      {!compact && <span>{on ? 'Saved' : 'Save'}</span>}
    </button>
  );
}

/** Shares a recipe summary (no household details) via the share sheet, or copies it. */
export function ShareButton({ recipe, portions, compact }: { recipe: Recipe; portions?: number; compact?: boolean }) {
  const { foodMap } = useStore();
  const toast = useToast();
  const [manual, setManual] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <button
        type="button"
        className="action-btn share-btn"
        aria-label={`Share ${recipe.name}`}
        onClick={async (e) => {
          e.stopPropagation();
          const text = recipeShareText(recipe, foodMap, portions);
          const res = await shareText(recipe.name, text, recipe);
          if (res === 'shared') toast.show('Shared');
          else if (res === 'copied') toast.show('Recipe copied — paste it into a message to share it');
          else if (res === 'manual') setManual(text);
        }}
      >
        <span aria-hidden="true">↗</span>
        {!compact && <span>Share</span>}
      </button>
      {manual && (
        <Modal title={`Share ${recipe.name}`} onClose={() => setManual(null)}>
          <p className="muted">Sharing isn't available here. Select the text below and copy it into a message.</p>
          <textarea ref={area} className="input share-text" readOnly value={manual} rows={12} onFocus={(e) => e.target.select()} />
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => area.current?.select()}>
              Select all
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
