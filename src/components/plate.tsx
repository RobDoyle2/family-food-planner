// Visual food tiles for "Plan your plate": main food, side and vegetables.
import { useMemo, useState } from 'react';
import type { CarbChoiceId, MealPlan, Plate, ProteinChoiceId } from '../types';
import { useStore } from '../state/store';
import { Modal, go, useConfirm, useToast } from '../state/ui';
import { draftFromPlate } from '../lib/ownRecipes';
import { CARB_CHOICES, PROTEIN_CHOICES, PROTEIN_FOOD, VEG_CHOICES, emptyPlate, plateLabel } from '../lib/plate';
import { childrenOf } from '../lib/foods';
import { applyPlate } from '../lib/planEdit';
import { regenerateDay } from '../lib/planner';
import { formatDay } from '../lib/util';

export function Tile({ art, label, tint, on, onClick, count, hint, small }: { art: string; label: string; tint?: string; on: boolean; onClick: () => void; count?: number; hint?: string; small?: boolean }) {
  return (
    <button type="button" className={`tile ${on ? 'on' : ''} ${small ? 'tile-sm' : ''}`} aria-pressed={on} onClick={onClick}>
      <span className="tile-art" style={{ background: tint }} aria-hidden="true">
        {art}
      </span>
      <span className="tile-label">{label}</span>
      {hint && <span className="tile-hint">{hint}</span>}
      {count !== undefined && count > 0 && (
        <span className="tile-count" aria-label={`used ${count} times`}>
          ×{count}
        </span>
      )}
      {on && (
        <span className="tile-tick" aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  );
}

/** Main food tiles plus optional specific cuts/products (bacon, ham and sausages are pork, and so on). */
export function ProteinTiles({ value, product, onChange }: { value?: ProteinChoiceId; product?: string; onChange: (protein: ProteinChoiceId | undefined, product?: string) => void }) {
  const { data, foodMap } = useStore();
  const parent = value ? PROTEIN_FOOD[value] : undefined;
  const products = useMemo(() => (parent ? childrenOf(parent, data.foods).sort((a, b) => a.name.localeCompare(b.name)) : []), [parent, data.foods]);
  return (
    <div>
      <div className="tile-grid" role="group" aria-label="Main food">
        {PROTEIN_CHOICES.map((c) => (
          <Tile key={c.id} art={c.art} label={c.label} tint={c.tint} hint={c.hint} on={value === c.id} onClick={() => onChange(value === c.id ? undefined : c.id)} />
        ))}
      </div>
      {products.length > 0 && (
        <div className="product-chips" role="group" aria-label={`Any particular ${foodMap.get(parent!)?.name.toLowerCase() ?? 'kind'}?`}>
          <span className="mini-label">Any particular kind? (optional)</span>
          <div className="quick-picks">
            <button type="button" className={`quick-pick ${!product ? 'on' : ''}`} aria-pressed={!product} onClick={() => onChange(value, undefined)}>
              Any {foodMap.get(parent!)?.name.toLowerCase()}
            </button>
            {products.map((f) => (
              <button key={f.id} type="button" className={`quick-pick ${product === f.id ? 'on' : ''}`} aria-pressed={product === f.id} onClick={() => onChange(value, product === f.id ? undefined : f.id)}>
                {f.emoji} {f.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CarbTiles({ value, onChange, counts }: { value?: CarbChoiceId; onChange: (c: CarbChoiceId | undefined) => void; counts?: Map<CarbChoiceId, number> }) {
  return (
    <div className="tile-grid" role="group" aria-label="Side">
      {CARB_CHOICES.map((c) => (
        <Tile key={c.id} art={c.art} label={c.label} tint={c.tint} on={value === c.id} count={counts?.get(c.id)} onClick={() => onChange(value === c.id ? undefined : c.id)} />
      ))}
    </div>
  );
}

export function VegTiles({ value, onChange, counts, label = 'Vegetables' }: { value: string[]; onChange: (v: string[]) => void; counts?: Map<string, number>; label?: string }) {
  const { foodMap } = useStore();
  return (
    <div className="tile-grid tile-grid-sm" role="group" aria-label={label}>
      {VEG_CHOICES.filter((id) => foodMap.has(id)).map((id) => {
        const f = foodMap.get(id)!;
        const on = value.includes(id);
        return <Tile key={id} small art={f.emoji || '🥬'} label={f.name} tint="#e6eee1" on={on} count={counts?.get(id)} onClick={() => onChange(on ? value.filter((v) => v !== id) : [...value, id])} />;
      })}
    </div>
  );
}

/** Small summary chips for a day's chosen foods. */
export function PlateChips({ plate }: { plate?: Plate }) {
  const { foodMap } = useStore();
  const text = plateLabel(plate, foodMap);
  if (!text) return null;
  return (
    <p className="plate-chips" aria-label={`Your foods: ${text}`}>
      {text.split(' · ').map((t, i) => (
        <span key={i} className="plate-chip">
          {t}
        </span>
      ))}
    </p>
  );
}

/**
 * "Edit foods" for one day. Saving updates the ideas straight away when no dinner is chosen.
 * A chosen dinner is never replaced without asking.
 */
export function PlateSheet({ plan, index, onSave, onClose }: { plan: MealPlan; index: number; onSave: (next: MealPlan, message: string) => Promise<void>; onClose: () => void }) {
  const { planContext, recipeMap, foodMap } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const day = plan.days[index];
  const [plate, setPlate] = useState<Plate>(day.plate ?? emptyPlate());
  const [step, setStep] = useState<'main' | 'side' | 'veg'>('main');
  const dayName = formatDay(day.date, { weekday: 'long' });
  const ctx = planContext(plan.maxMinutes);

  const save = async () => {
    const res = applyPlate(plan, index, plate, ctx, recipeMap);
    let next = res.plan;
    let message = `${dayName}: ${plateLabel(plate, foodMap) || 'foods cleared'}`;
    if (!res.chosenStillFits) {
      const chosenName = day.selected !== null ? recipeMap.get(day.options[day.selected] ?? '')?.name : undefined;
      const replace = await confirm({
        title: `Find a new recipe for ${dayName}?`,
        message: `${chosenName ?? 'The chosen dinner'} doesn't use the foods you've just picked. Find new ideas that do, or keep ${chosenName ?? 'it'}?`,
        confirmLabel: 'Find new ideas',
        cancelLabel: `Keep ${chosenName ?? 'it'}`,
      });
      if (replace) {
        const cleared: MealPlan = { ...next, days: next.days.map((d, i) => (i === index ? { ...d, selected: null, options: [null, null] } : d)) };
        const r = regenerateDay(cleared, index, ctx);
        next = { ...cleared, days: cleared.days.map((d, i) => (i === index ? { ...r.day, plate } : d)) };
        message = `New ideas for ${dayName} using ${plateLabel(plate, foodMap)}`;
      } else message += ` — ${chosenName} kept`;
    } else if (day.selected === null && day.mode === 'cook') message = `Ideas for ${dayName} updated to match your foods`;
    await onSave(next, message);
    if (!next.days[index].options[0]) toast.show(next.days[index].issue ?? 'No suitable recipes for these foods.', 'info');
    onClose();
  };

  return (
    <Modal title={`${dayName}'s foods`} onClose={onClose} wide>
      <div className="sheet-tabs" role="tablist" aria-label="Food groups">
        {(
          [
            ['main', 'Main food'],
            ['side', 'Side'],
            ['veg', 'Vegetables'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={step === id} className={`sheet-tab ${step === id ? 'active' : ''}`} onClick={() => setStep(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className="plate-preview" aria-live="polite">
        <strong>Plate:</strong> {plateLabel(plate, foodMap) || 'nothing chosen yet — every choice is optional'}
      </p>
      {step === 'main' && (
        <ProteinTiles
          value={plate.protein}
          product={plate.proteinFood}
          onChange={(protein, product) => {
            setPlate({ ...plate, protein, proteinFood: protein ? product : undefined });
            if (protein && protein !== plate.protein && !PROTEIN_FOOD[protein]) setStep('side');
          }}
        />
      )}
      {step === 'side' && (
        <CarbTiles
          value={plate.carb}
          onChange={(carb) => {
            setPlate({ ...plate, carb });
            if (carb) setStep('veg');
          }}
        />
      )}
      {step === 'veg' && <VegTiles value={plate.veg} onChange={(veg) => setPlate({ ...plate, veg })} />}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setPlate(emptyPlate())}>
          Clear
        </button>
        <button type="button" className="btn btn-primary" onClick={save}>
          Save foods
        </button>
      </div>
    </Modal>
  );
}

/** Opens the recipe editor with the day's foods already added as ingredients. */
export function useWriteRecipeWithFoods() {
  const { data, foodMap } = useStore();
  return (plate: Plate, servings = 4) => {
    try {
      localStorage.setItem('ffp.ownRecipeDraft', JSON.stringify(draftFromPlate(plate, data.recipes, foodMap, Math.max(1, Math.min(12, servings)))));
    } catch {
      /* drafts are a convenience only */
    }
    go('recipes/new');
  };
}
