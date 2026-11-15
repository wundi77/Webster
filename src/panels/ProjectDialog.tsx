// Startfenster (Projekte), „Neues Projekt“ und „Speichern unter“
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useEditor } from '../store';
import { Icons } from '../ui/icons';
import type { WDocument } from '../model/types';
import type { BackupMeta, RecentProject } from '../persist';
import { loadRecent, clearLegacyDocument } from '../persist';
import {
  adoptLegacy, folderName, importProjectFile, newProject, openProject, openRecent, restoreBackup, saveProjectAs, startBlank,
  supportsFolders, useProject,
} from '../model/project';
import { askConfirm } from '../ui/ConfirmDialog';

/** Was beim Start gefunden wurde (Notfallkopie, bisheriges Dokument) */
export const useStartup = create<{ backup: WDocument | null; meta: BackupMeta | null; legacy: WDocument | null }>(() => ({ backup: null, meta: null, legacy: null }));

const when = (t: number) => new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ProjectDialog() {
  const dialog = useProject(s => s.dialog);
  return dialog ? <ProjectDialogInner mode={dialog} /> : null;
}

function ProjectDialogInner({ mode }: { mode: 'start' | 'new' | 'saveas' }) {
  const docName = useEditor(s => s.doc.name);
  const { busy, message, started } = useProject();
  const { backup, meta, legacy } = useStartup();
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [name, setName] = useState(mode === 'saveas' ? (docName === 'Unbenannt' ? '' : docName) : '');
  useEffect(() => { loadRecent().then(setRecent); }, []);
  const close = () => {
    if (!useProject.getState().started) startBlank();
    useProject.getState().show(null);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy]);

  const showLegacy = mode !== 'saveas' && !!legacy;
  // Notfallkopie nur anbieten, wenn sie nicht ohnehin das bisherige Dokument ist
  const showBackup = mode === 'start' && !started && backup && meta?.dirty
    && !(legacy && meta.projectId === null && JSON.stringify(backup.pages) === JSON.stringify(legacy.pages));
  const title = mode === 'saveas' ? 'Projekt speichern' : 'Projekte';

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy && started) close(); }}>
      <div className="dialog project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-title">
        <header className="dialog-head">
          <h2 id="project-title">{title}</h2>
          <button type="button" className="ibtn" aria-label="Schließen" title="Schließen (Esc)" onClick={close} disabled={busy}><Icons.close /></button>
        </header>
        <div className="dialog-body project-body">
          {!supportsFolders && (
            <div className="notice warn browser-note" role="note">
              <strong>Dieser Browser kann keine Projektordner speichern.</strong>
              <p>Bitte öffne Webster in <b>Google Chrome</b> oder <b>Microsoft Edge</b> (Adresse: <code>{location.origin}</code>). Nur dort kann Webster Projekte direkt in einem Ordner auf deinem Mac speichern.</p>
              <p>Du kannst trotzdem weitermachen: Beim Speichern wird dann das ganze Projekt als eine Datei in „Downloads“ abgelegt.</p>
            </div>
          )}
          {message && <p className={`notice ${message.kind === 'error' ? 'warn' : ''}`} role="alert">{message.text}</p>}

          {showBackup && (
            <div className="project-card recover">
              <div><strong>Ungesicherte Änderungen gefunden</strong>
                <p>„{backup!.name}“ – zuletzt geändert am {when(meta!.changedAt)}. Webster wurde geschlossen, ohne dass diese Änderungen gespeichert wurden.</p></div>
              <button type="button" className="btn primary" disabled={busy} onClick={() => restoreBackup(backup!, meta!.projectId)}>Wiederherstellen</button>
            </div>
          )}
          {showLegacy && (
            <div className="project-card">
              <div><strong>Dein bisheriges Dokument „{legacy!.name}“</strong>
                <p>Stammt aus der Zeit vor den Projektordnern und liegt noch im Browser. Übernimm es und speichere es dann mit ⌘S in einem Ordner.</p></div>
              <div className="project-card-actions">
                <button type="button" className="btn primary" disabled={busy} onClick={async () => { if (mode === 'start' || await askConfirm({ title: 'Das aktuelle Dokument wird ersetzt. Fortfahren?', confirmLabel: 'Fortfahren' })) adoptLegacy(legacy!); }}>Übernehmen</button>
                <button type="button" className="btn ghost" disabled={busy} title="Bisheriges Dokument endgültig aus dem Browser löschen"
                  onClick={async () => { if (await askConfirm({ title: `„${legacy!.name}“ endgültig verwerfen?`, message: 'Das kann nicht rückgängig gemacht werden.', confirmLabel: 'Verwerfen', danger: true })) { await clearLegacyDocument(); useStartup.setState({ legacy: null }); } }}>Verwerfen</button>
              </div>
            </div>
          )}

          <section className="project-new">
            <h3>{mode === 'saveas' ? 'Wo soll das Projekt gespeichert werden?' : 'Neues Projekt'}</h3>
            <div className="row">
              <input className="textinput grow" value={name} onChange={e => setName(e.target.value)} placeholder="Projektname, z. B. Café Sonne" spellCheck={false}
                autoFocus={mode !== 'start' || (!showBackup && !showLegacy)} aria-label="Projektname"
                onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !busy) (mode === 'saveas' ? saveProjectAs(name) : newProject(name)); }} />
              <button type="button" className="btn primary" disabled={busy || !name.trim()} onClick={() => (mode === 'saveas' ? saveProjectAs(name) : newProject(name))}>
                {busy ? 'Bitte warten …' : supportsFolders ? 'Ordner wählen …' : mode === 'saveas' ? 'Herunterladen' : 'Anlegen'}
              </button>
            </div>
            {supportsFolders && (
              <p className="field-hint">Du wählst gleich, <b>wo</b> das Projekt liegen soll, z. B. „Dokumente/Webster“. Webster legt dort den Ordner „{folderName(name || 'Projektname')}“ an – mit der Projektdatei und den Unterordnern „bilder“ und „videos“.</p>
            )}
          </section>

          {mode !== 'saveas' && (
            <>
              <div className="row project-open">
                <button type="button" className="btn" disabled={busy} onClick={() => openProject()}><Icons.file /> {supportsFolders ? 'Projekt öffnen …' : 'Projektdatei öffnen …'}</button>
                {supportsFolders && <button type="button" className="btn ghost" disabled={busy} onClick={() => importProjectFile()}>Alte Projektdatei importieren (.webster.json) …</button>}
              </div>
              {supportsFolders && recent.length > 0 && (
                <section>
                  <h3>Zuletzt geöffnet</h3>
                  <ul className="recent-list">
                    {recent.map(r => (
                      <li key={r.id}>
                        <button type="button" disabled={busy} onClick={() => openRecent(r).then(() => loadRecent().then(setRecent))}>
                          <Icons.board className="ticon" />
                          <span className="recent-name">{r.name}</span>
                          <span className="recent-meta">Ordner „{r.handle.name}“ · {when(r.openedAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
        {mode === 'start' && !started && (
          <footer className="dialog-foot">
            <button type="button" className="btn ghost" onClick={close}>Ohne Projekt ausprobieren</button>
            <span className="muted">Änderungen werden erst gespeichert, wenn du „Speichern“ wählst (⌘S).</span>
          </footer>
        )}
      </div>
    </div>
  );
}
