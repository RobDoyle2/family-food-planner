import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// ---------- Toasts ----------
type ToastKind = 'info' | 'success' | 'error';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  action?: ToastAction;
}
interface ToastApi {
  show: (text: string, kind?: ToastKind, action?: ToastAction) => void;
}
const ToastCtx = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback((text: string, kind: ToastKind = 'success', action?: ToastAction) => {
    const id = next.current++;
    setToasts([{ id, text, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : action ? 4500 : 2400);
  }, []);
  // Opening a dialog clears earlier messages so they never cover its title or close button.
  useEffect(() => {
    const clear = () => setToasts([]);
    window.addEventListener('ffp:dialog-open', clear);
    return () => window.removeEventListener('ffp:dialog-open', clear);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Confirm dialog ----------
export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title} onClose={() => close(false)} small>
          {state.message && <div className="confirm-message">{state.message}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => close(false)}>
              {state.cancelLabel ?? 'Cancel'}
            </button>
            <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
              {state.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

// ---------- Modal ----------
export function Modal({ title, onClose, children, small, wide }: { title: string; onClose: () => void; children: ReactNode; small?: boolean; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the top-most dialog closes.
      const all = document.querySelectorAll('.modal');
      if (all[all.length - 1] === panel.current) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    window.dispatchEvent(new Event('ffp:dialog-open'));
    const first = panel.current?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button:not(.modal-close)');
    first?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className={`modal ${small ? 'modal-small' : ''} ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- Hash routing ----------
// Routes are plain names (#family, #recipe-irish-stew) so links also work when the app is hosted
// inside a page that only passes simple hashes. Internally pages still use paths like "recipes/irish-stew".
// Old "#/path" links keep working.

/** "recipes/irish-stew" -> "#recipe-irish-stew"; "settings" -> "#app-settings". */
export function href(path: string): string {
  const [a, b, c] = path.split('/');
  if (a === 'recipes' && b === 'pick') return `#pick-${c}`;
  if (a === 'recipes' && b === 'new') return '#new-recipe';
  if (a === 'recipes' && b === 'own') return '#own-recipes';
  if (a === 'recipes' && b === 'edit') return `#edit-recipe-${c}`;
  if (a === 'recipes' && b) return `#recipe-${b}`;
  if (a === 'settings') return '#app-settings';
  return `#${a || 'home'}`;
}

export function parseHash(hash: string): string[] {
  const h = hash.replace(/^#/, '');
  if (h.startsWith('/')) return h.split('/').filter(Boolean);
  if (!h) return ['home'];
  const pick = /^pick-(\d+)$/.exec(h);
  if (pick) return ['recipes', 'pick', pick[1]];
  if (h === 'new-recipe') return ['recipes', 'new'];
  if (h === 'own-recipes') return ['recipes', 'own'];
  if (h.startsWith('edit-recipe-')) return ['recipes', 'edit', h.slice('edit-recipe-'.length)];
  if (h.startsWith('recipe-')) return ['recipes', h.slice('recipe-'.length)];
  if (h === 'app-settings') return ['settings'];
  return [h];
}

export function useHashRoute(): [string[], (path: string) => void] {
  const [parts, setParts] = useState<string[]>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      setParts(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [parts, go];
}

export function go(path: string) {
  window.location.hash = href(path);
}
