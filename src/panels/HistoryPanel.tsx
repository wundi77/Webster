// Verlauf: alle Arbeitsschritte dieser Sitzung; Klick springt zu diesem Stand
import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { describeChange } from '../model/history';
import { MOD, SHIFT } from '../ui/controls';
import { deleteSnapshot, refreshSnapshots, restoreSnapshot, saveSnapshot, useSnapshots, type SnapshotInfo } from '../model/snapshots';
import { useProject } from '../model/project';
import { askConfirm } from '../ui/ConfirmDialog';

const when = (t: number) => new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Benannte Zwischenstände: bleiben im Projektordner, auch nach dem Schließen */
function Snapshots() {
  const { list, loading, error } = useSnapshots();
  const hasFolder = useProject(p => !!p.handle);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { void refreshSnapshots(); }, []);
  const save = async () => {
    setBusy(true);
    const ok = await saveSnapshot(name);
    setBusy(false);
    if (ok) { setName(''); setDone('Gesichert.'); setTimeout(() => setDone(null), 2500); }
  };
  const restore = async (s: SnapshotInfo) => {
    const ok = await askConfirm({ title: `Zu „${s.name}“ zurückkehren?`, message: 'Die Seite sieht danach aus wie zu diesem Zeitpunkt. Dein jetziger Stand ist nicht verloren: Mit ⌘Z kommst du wieder zurück.', confirmLabel: 'Zurückkehren' });
    if (ok && await restoreSnapshot(s)) { setDone(`„${s.name}“ wiederhergestellt.`); setTimeout(() => setDone(null), 3000); }
  };
  const remove = async (s: SnapshotInfo) => {
    if (await askConfirm({ title: `„${s.name}“ löschen?`, message: 'Der Zwischenstand wird endgültig entfernt.', confirmLabel: 'Löschen', danger: true })) await deleteSnapshot(s);
  };
  return (
    <div className="snaps">
      <div className="snaps-title">Zwischenstände</div>
      <p className="hint">Sichere einen Stand unter einem Namen, z. B. „Version für Kunden“. Du kannst jederzeit dorthin zurück – auch nach Tagen.</p>
      <form className="snaps-new" onSubmit={e => { e.preventDefault(); void save(); }}>
        <input className="textinput grow" value={name} placeholder="Name, z. B. Version für Kunden" aria-label="Name des Zwischenstands" onChange={e => setName(e.target.value)} onKeyDown={e => e.stopPropagation()} />
        <button type="submit" className="btn" disabled={busy}>{busy ? '…' : 'Sichern'}</button>
      </form>
      {done && <p className="notice ok keep" role="status">{done}</p>}
      {error && <p className="notice warn keep">{error}</p>}
      {!hasFolder && <p className="hint keep">Solange das Projekt nicht in einem Ordner gespeichert ist, liegen Zwischenstände nur in diesem Browser (höchstens 10).</p>}
      {loading && !list.length ? null : list.length ? (
        <ul className="snaps-list">
          {list.map(s => (
            <li key={s.id} className="snap">
              <div className="snap-text"><b title={s.name}>{s.name}</b><span>{when(s.savedAt)}</span></div>
              <button type="button" className="btn small" onClick={() => void restore(s)} title="Zu diesem Stand zurückkehren">Zurück</button>
              <button type="button" className="btn small" onClick={() => void remove(s)} title="Zwischenstand löschen" aria-label={`${s.name} löschen`}>×</button>
            </li>
          ))}
        </ul>
      ) : <p className="hint keep">Noch keine Zwischenstände.</p>}
    </div>
  );
}

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
      <Snapshots />
      <div className="snaps-title">Arbeitsschritte</div>
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
