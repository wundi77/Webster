// Eigenes Bestätigungsfenster (statt window.confirm, das manche Browser-Umgebungen still unterdrücken)
import { useEffect, useRef } from 'react';
import { create } from 'zustand';

type Ask = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type State = { ask: (Ask & { resolve: (ok: boolean) => void }) | null };

const useConfirm = create<State>(() => ({ ask: null }));

/** Fragt nach; liefert true bei „Bestätigen“, false bei „Abbrechen“/Esc/Klick daneben */
export function askConfirm(opts: Ask): Promise<boolean> {
  useConfirm.getState().ask?.resolve(false);
  return new Promise(resolve => useConfirm.setState({ ask: { ...opts, resolve } }));
}

export function ConfirmDialog() {
  const ask = useConfirm(s => s.ask);
  const okRef = useRef<HTMLButtonElement>(null);
  const done = (ok: boolean) => { ask?.resolve(ok); useConfirm.setState({ ask: null }); };

  useEffect(() => {
    if (!ask) return;
    okRef.current?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  if (!ask) return null;
  return (
    <div className="dialog-backdrop confirm-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) done(false); }}>
      <div className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
        onKeyDown={e => e.stopPropagation()}>
        <div className="confirm-body">
          <h2 id="confirm-title">{ask.title}</h2>
          {ask.message && <p>{ask.message}</p>}
        </div>
        <footer className="dialog-foot">
          <div className="spacer" />
          <button type="button" className="btn" onClick={() => done(false)}>{ask.cancelLabel ?? 'Abbrechen'}</button>
          <button ref={okRef} type="button" className={`btn ${ask.danger ? 'danger-solid' : 'primary'}`} onClick={() => done(true)}>
            {ask.confirmLabel ?? 'OK'}
          </button>
        </footer>
      </div>
    </div>
  );
}
