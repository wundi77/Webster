import { useEditor } from '../store';
import { ClaudeToggle } from '../claude/ClaudeUI';
import { Icons } from '../ui/icons';
import { ALT, IconButton, Menu, MenuItem, MenuLabel, MOD, SHIFT } from '../ui/controls';
import { useEffect, useState } from 'react';
import { downloadProject, importProjectFile, openProject, saveProject, supportsFolders, useProject } from '../model/project';
import { fitAll, fitSelection, setZoom100, zoomBy } from '../model/viewport';
import { BREAKPOINTS } from '../model/factory';
import { openPreview } from '../preview/bridge';
import { useDialog } from './SiteSettings';
import { clearGuides, useView } from '../model/guides';
import { askConfirm } from '../ui/ConfirmDialog';
import { useShortcutsDialog } from '../ui/Shortcuts';
import { openNews } from '../ui/UpdateUI';
import { LangSwitch } from './TranslateDialog';

export function TopBar() {
  const name = useEditor(s => s.doc.name);
  const zoom = useEditor(s => s.zoom);
  const canUndo = useEditor(s => s.past.length > 0);
  const canRedo = useEditor(s => s.future.length > 0);
  const theme = useEditor(s => s.theme);
  const saveError = useEditor(s => s.saveError);
  const s = useEditor.getState();

  return (
    <header className="topbar">
      <div className="tb-zone tb-left">
        <WebsterMenu />
        <div className="tb-project">
          <input className="docname" value={name} aria-label="Name des Projekts" title="Name des Projekts – zum Ändern hineinklicken" spellCheck={false}
            onChange={e => s.mutate((_, doc) => { doc.name = e.target.value; }, { key: 'docname' })}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          <SaveStatus backupError={saveError} />
        </div>
      </div>
      <div className="tb-zone tb-center">
        <BreakpointSwitch />
        <LangSwitch />
        <Menu label={`${Math.round(zoom * 100)} %`} title="Zoom" btnClass="zoom-btn">
          {close => (
            <>
              <MenuItem label="Vergrößern" shortcut="+" onClick={() => { close(); zoomBy(1.25); }} />
              <MenuItem label="Verkleinern" shortcut="−" onClick={() => { close(); zoomBy(0.8); }} />
              <div className="menu-sep" />
              <MenuItem label="Auf 100 % zoomen" shortcut={`${SHIFT}0`} onClick={() => { close(); setZoom100(); }} />
              <MenuItem label="Alles einpassen" shortcut={`${SHIFT}1`} onClick={() => { close(); fitAll(); }} />
              <MenuItem label="Auswahl einpassen" shortcut={`${SHIFT}2`} onClick={() => { close(); fitSelection(); }} />
            </>
          )}
        </Menu>
      </div>
      <div className="tb-zone tb-right">
        <IconButton icon={<Icons.undo />} title={`Rückgängig (${MOD}Z)`} disabled={!canUndo} onClick={() => useEditor.getState().undo()} />
        <IconButton icon={<Icons.redo />} title={`Wiederholen (${SHIFT}${MOD}Z)`} disabled={!canRedo} onClick={() => useEditor.getState().redo()} />
        <span className="tb-sep" aria-hidden="true" />
        <IconButton icon={theme === 'dark' ? <Icons.sun /> : <Icons.moon />}
          title={theme === 'dark' ? 'Helle Oberfläche' : 'Dunkle Oberfläche'}
          onClick={() => s.setTheme(theme === 'dark' ? 'light' : 'dark')} />
        <ClaudeToggle />
        <button type="button" className="btn preview-btn" title="Live-Vorschau in neuem Tab öffnen – aktualisiert sich beim Bearbeiten (P)"
          onClick={() => { const s = useEditor.getState(); openPreview(s.pageId, s.lang); }}><Icons.play /> <span className="btn-label">Vorschau</span></button>
        <button type="button" className="btn primary publish-btn" title="Website veröffentlichen – prüfen, herunterladen, Anleitung zum Hochladen"
          onClick={() => useDialog.getState().show('publish')}><Icons.globe /> <span className="btn-label">Veröffentlichen</span></button>
      </div>
    </header>
  );
}

/** Das eine Menü: Projekt, Website, Ansicht, Hilfe */
function WebsterMenu() {
  const v = useView();
  const hasGuides = useEditor(s => s.doc.pages.some(p => Object.values(p.nodes).some(n => n.guides?.length)));
  const theme = useEditor(s => s.theme);
  return (
    <Menu label={<span className="w-logo">W</span>} title="Menü Webster" btnClass="w-btn" popClass="w-menu">
      {close => (
        <>
          <MenuLabel>Projekt</MenuLabel>
          <MenuItem label="Projekte …" onClick={() => { close(); useProject.getState().show('start'); }} />
          <MenuItem label="Neues Projekt …" onClick={() => { close(); useProject.getState().show('new'); }} />
          <MenuItem label={supportsFolders ? 'Projekt öffnen …' : 'Projektdatei öffnen …'} shortcut={`${MOD}O`} onClick={() => { close(); openProject(); }} />
          <MenuItem label="Speichern" shortcut={`${MOD}S`} onClick={() => { close(); saveProject(); }} />
          {supportsFolders && <MenuItem label="Speichern unter …" shortcut={`${SHIFT}${MOD}S`} onClick={() => { close(); useProject.getState().show('saveas'); }} />}
          {supportsFolders && <MenuItem label="Alte Projektdatei importieren …" onClick={() => { close(); importProjectFile(); }} />}
          {supportsFolders && <MenuItem label="Als einzelne Datei herunterladen" onClick={() => { close(); downloadProject(); }} />}
          <div className="menu-sep" />
          <MenuLabel>Website</MenuLabel>
          <MenuItem label="Einstellungen der Website …" onClick={() => { close(); useDialog.getState().show('export', 'site'); }} />
          <MenuItem label="Seiten-Check …" onClick={() => { close(); useDialog.getState().show('publish'); }} />
          <MenuItem label="Website exportieren …" shortcut={`${SHIFT}${MOD}E`} onClick={() => { close(); useDialog.getState().show('export'); }} />
          <MenuItem label="Veröffentlichen …" onClick={() => { close(); useDialog.getState().show('publish'); }} />
          <div className="menu-sep" />
          <MenuLabel>Ansicht</MenuLabel>
          <MenuItem label="Lineale" shortcut={`${SHIFT}R`} checked={v.rulers} onClick={() => { close(); v.toggle('rulers'); }} />
          <MenuItem label="Hilfslinien anzeigen" shortcut={`${SHIFT}H`} checked={v.guides} onClick={() => { close(); v.toggle('guides'); }} />
          <MenuItem label="Hilfslinien sperren" checked={v.guidesLocked} onClick={() => { close(); v.toggle('guidesLocked'); }} />
          <MenuItem label="Spaltenraster anzeigen" shortcut={`${SHIFT}G`} checked={v.grids} onClick={() => { close(); v.toggle('grids'); }} />
          <MenuItem label="Hilfslinien dieser Seite löschen" disabled={!hasGuides}
            onClick={async () => { close(); if (await askConfirm({ title: 'Alle Hilfslinien dieser Seite löschen?', message: 'Rückgängig mit ⌘Z möglich.', confirmLabel: 'Löschen', danger: true })) clearGuides(); }} />
          <MenuItem label={theme === 'dark' ? 'Helle Oberfläche' : 'Dunkle Oberfläche'} onClick={() => { close(); useEditor.getState().setTheme(theme === 'dark' ? 'light' : 'dark'); }} />
          <div className="menu-sep" />
          <MenuItem label="Tastenkürzel …" onClick={() => { close(); useShortcutsDialog.setState({ open: true }); }} />
          <MenuItem label="Was ist neu?" onClick={() => { close(); openNews(); }} />
        </>
      )}
    </Menu>
  );
}

function BreakpointSwitch() {
  const bp = useEditor(s => s.breakpoint);
  const setBp = useEditor(s => s.setBreakpoint);
  return (
    <div className="bp-switch" role="radiogroup" aria-label="Breakpoint">
      {BREAKPOINTS.map((b, i) => {
        const I = Icons[b.id];
        return (
          <button key={b.id} type="button" role="radio" aria-checked={bp === b.id}
            className={`bp-btn${bp === b.id ? ' active' : ''}`}
            title={`${b.label}${b.width ? ` (${b.width} px)` : ''} – ${b.hint} (${ALT}${i + 1})`}
            onClick={() => setBp(b.id)}>
            <I /><span>{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Speicher-Stand unter dem Projektnamen: „● Gespeichert“ / „Seit x Min. ungesichert“ – Klick speichert */
function SaveStatus({ backupError }: { backupError: boolean }) {
  const { dirtySince, savedAt, handle, busy, message, folder } = useProject();
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(x => x + 1), 20000); return () => window.clearInterval(t); }, []);
  const dirty = dirtySince !== null;
  const mins = dirty ? Math.floor((Date.now() - dirtySince) / 60000) : 0;
  const failed = message?.kind === 'error' && !useProject.getState().dialog;
  const text = busy ? 'Speichert …'
    : failed ? 'Speichern fehlgeschlagen'
    : !dirty ? 'Gespeichert'
    : !handle && supportsFolders ? 'Noch nicht gespeichert'
    : mins < 1 ? 'Ungesichert' : `Seit ${mins < 60 ? `${mins} Min.` : `${Math.floor(mins / 60)} Std.`} ungesichert`;
  const level = failed ? 'warn' : !dirty ? 'ok' : mins >= 15 || (!handle && supportsFolders) ? 'warn' : 'dirty';
  const where = handle ? `Projektordner „${folder}“` : supportsFolders ? 'noch kein Projektordner' : 'Download-Datei';
  const title = `${dirty ? 'Ungesicherte Änderungen' : 'Alles gespeichert'} · ${where}${savedAt ? ` · zuletzt gespeichert ${new Date(savedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}`
    + (backupError ? '\nHinweis: Die Notfallkopie im Browser konnte nicht angelegt werden (Speicher voll).' : '')
    + `\nSpeichern (${MOD}S)`;
  return (
    <button type="button" className={`save-btn ${level}`} title={failed ? message!.text : title}
      aria-label={`Speichern – ${text}`} disabled={busy} onClick={() => saveProject()}>
      <span className="save-dot" aria-hidden="true" />
      <span className="save-text">{text}</span>
    </button>
  );
}
