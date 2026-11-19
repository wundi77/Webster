// Verlauf: alle Arbeitsschritte dieser Sitzung; Klick springt zu diesem Stand
import { useEffect, useRef } from 'react';
import { useEditor } from '../store';
import { describeChange } from '../model/history';
import { MOD, SHIFT } from '../ui/controls';

export function HistoryPanel() {
  const past = useEditor(s => s.past);
  const doc = useEditor(s => s.doc);
  const future = useEditor(s => s.future);
  const all = [...past, doc, ...future];
  const cur = past.length;
  const curRef = useRef<HTMLLIElement>(null);
  useEffect(() => { curRef.current?.scrollIntoView({ block: 'nearest' }); }, [cur]);
  return (
    <section className="section history">
      <p className="hint">Rückgängig: {MOD}Z · Wiederholen: {SHIFT}{MOD}Z. Der Verlauf gilt nur, bis du Webster schließt.</p>
      <ol className="history-list">
        {all.map((d, i) => {
          const label = i === 0 ? 'Geöffnet' : describeChange(all[i - 1], d);
          const state = i === cur ? 'current' : i > cur ? 'future' : '';
          return (
            <li key={i} ref={i === cur ? curRef : undefined}>
              <button type="button" className={`history-item ${state}`} aria-current={i === cur ? 'step' : undefined}
                title={i > cur ? 'Wiederherstellen' : i < cur ? 'Zu diesem Stand zurück' : 'Aktueller Stand'}
                onClick={() => useEditor.getState().jumpTo(i)}>
                <span className="history-n">{i === 0 ? '•' : i}</span>{label}
              </button>
            </li>
          );
        })}
      </ol>
      {past.length >= 199 && <p className="hint">Es werden die letzten 200 Schritte gemerkt.</p>}
    </section>
  );
}
