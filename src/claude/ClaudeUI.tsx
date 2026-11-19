// Schalter „Claude“ in der Kopfleiste, kurze Meldung und Hervorhebung der geänderten Ebenen
import { useEffect, useState } from 'react';
import { useClaude, startClaudeBridge } from './bridge';
import { useEditor, viewPage } from '../store';
import { absRect } from '../model/geometry';
import type { Pt } from '../model/types';
import { Icons } from '../ui/icons';
import bridgeSrc from '../../bridge/webster-mcp.mjs?raw';

export function ClaudeToggle() {
  const enabled = useClaude(s => s.enabled);
  const connected = useClaude(s => s.connected);
  useEffect(() => { startClaudeBridge(); }, []);
  const title = !enabled
    ? 'Mit Claude verbinden: Claude kann dann dein Layout sehen und ändern.'
    : connected
      ? 'Mit Claude verbunden. Klicken für Einstellungen.'
      : 'Wartet auf Claude. Klicken für die Anleitung.';
  return (
    <button type="button" className={`btn claude-btn${enabled ? ' on' : ''}`} title={title} aria-haspopup="dialog"
      onClick={() => useClaude.setState({ dialog: true })}>
      <span className={`claude-dot${enabled ? (connected ? ' ok' : ' wait') : ''}`} />
      <span className="btn-label">Claude</span>
    </button>
  );
}

const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const FOLDER = '~/Webster-Verbindung';
const COMMAND = `mkdir -p ${FOLDER} && mv ~/Downloads/webster-mcp.mjs ${FOLDER}/ && claude mcp add --scope user webster -- node ${FOLDER}/webster-mcp.mjs`;
const ASK_CLAUDE = 'Bitte verbinde dich mit Webster: Ich habe die Datei „webster-mcp.mjs“ heruntergeladen (im Ordner Downloads). '
  + `Lege sie in den Ordner ${FOLDER}, trage sie mit „claude mcp add --scope user webster -- node ${FOLDER}/webster-mcp.mjs“ als MCP-Server ein `
  + 'und prüfe, ob Node.js installiert ist (sonst bitte installieren). Sag mir danach, ob ich Claude neu starten muss.';

function downloadBridge() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bridgeSrc], { type: 'text/javascript' }));
  a.download = 'webster-mcp.mjs';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function CopyBox({ text, label, plain }: { text: string; label: string; plain?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className={`claude-copy${plain ? ' plain' : ''}`}>
      <code>{text}</code>
      <button type="button" className="btn" aria-label={label} onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* egal */ }
      }}>{done ? 'Kopiert ✓' : 'Kopieren'}</button>
    </div>
  );
}

/** Fenster „Mit Claude verbinden“: Schalter, Zustand und Anleitung für das eigene Claude */
export function ClaudeDialog() {
  const open = useClaude(s => s.dialog);
  const enabled = useClaude(s => s.enabled);
  const connected = useClaude(s => s.connected);
  const [expert, setExpert] = useState(false);
  const close = () => useClaude.setState({ dialog: false });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  if (!open) return null;
  const status = !enabled ? 'Aus' : connected ? 'Verbunden' : 'Wartet auf Claude …';
  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog claude-dialog" role="dialog" aria-modal="true" aria-labelledby="claude-title">
        <header className="dialog-head">
          <h2 id="claude-title">Mit Claude verbinden</h2>
          <button type="button" className="ibtn" aria-label="Schließen" title="Schließen (Esc)" onClick={close}><Icons.close /></button>
        </header>
        <div className="dialog-body claude-body">
          <p>Claude kann dein Layout dann sehen und ändern. Jede Änderung lässt sich mit ⌘Z zurücknehmen.
            Du nutzt dafür <b>dein eigenes Claude-Konto</b>: Die Anmeldung passiert in Claude, Webster speichert keine Zugangsdaten.</p>
          <div className={`claude-status${enabled ? (connected ? ' ok' : ' wait') : ''}`}>
            <span className={`claude-dot${enabled ? (connected ? ' ok' : ' wait') : ''}`} />
            <span className="claude-status-text">{status}</span>
            <button type="button" className={`btn${enabled ? '' : ' primary'}`} onClick={() => useClaude.getState().setEnabled(!enabled)}>
              {enabled ? 'Verbindung ausschalten' : 'Verbindung einschalten'}
            </button>
          </div>
          {enabled && connected && <p className="notice ok">Alles bereit. Schreib Claude einfach, was es an deiner Seite ändern soll.</p>}
          {!connected && (
            <>
              <h3>Einmalig einrichten</h3>
              <p className="muted">Du brauchst ein Claude-Konto und Claude Code (im Terminal oder in der Claude-App im Bereich „Code“) auf diesem Computer.</p>
              {IS_LOCAL && <p className="notice">Wenn du Claude im Webster-Ordner startest, ist die Verbindung dort schon eingerichtet. Dann reicht Schritt 3.</p>}
              <ol className="claude-steps">
                <li>
                  <b>Verbindungsprogramm herunterladen.</b> Eine kleine Datei, über die Claude und Webster miteinander sprechen. Sie läuft nur auf deinem Computer.
                  <div><button type="button" className="btn primary" onClick={downloadBridge}><Icons.download /> webster-mcp.mjs herunterladen</button></div>
                </li>
                <li>
                  <b>In Claude eintragen.</b> Kopiere diesen Satz und schicke ihn an Claude. Claude richtet den Rest selbst ein.
                  <CopyBox text={ASK_CLAUDE} label="Satz für Claude kopieren" plain />
                  <button type="button" className="linkish" onClick={() => setExpert(v => !v)}>{expert ? 'Befehl ausblenden' : 'Lieber selbst im Terminal?'}</button>
                  {expert && <CopyBox text={COMMAND} label="Befehl kopieren" />}
                </li>
                <li>
                  <b>Claude neu starten und oben „Verbindung einschalten“.</b> Fragt der Browser, ob Webster auf Geräte im lokalen Netzwerk zugreifen darf, klicke auf „Zulassen“: Gemeint ist nur das Verbindungsprogramm auf deinem Computer. Der Punkt wird grün, sobald es klappt.
                </li>
              </ol>
            </>
          )}
        </div>
        <footer className="dialog-foot">
          <span className="muted" style={{ flex: 1 }}>Die Verbindung gilt nur auf diesem Computer.</span>
          <button type="button" className="btn" onClick={close}>Fertig</button>
        </footer>
      </div>
    </div>
  );
}

/** Meldung unten in der Mitte („Claude hat … geändert“) */
export function ClaudeNote() {
  const note = useClaude(s => s.note);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!note) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, [note]);
  if (!note || !visible) return null;
  return <div className="claude-note" role="status">{note.text}</div>;
}

/** Kurzes Aufleuchten der geänderten Ebenen auf der Arbeitsfläche */
export function ClaudeFlash({ zoom, pan }: { zoom: number; pan: Pt }) {
  const flash = useClaude(s => s.flash);
  const page = useEditor(viewPage);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!flash) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 1600);
    return () => clearTimeout(t);
  }, [flash]);
  if (!flash || !on) return null;
  return (
    <div className="claude-flash-layer">
      {flash.ids.filter(id => page.nodes[id]).map(id => {
        const r = absRect(page, id);
        return <div key={id + flash.at} className="claude-flash" style={{ left: r.x * zoom + pan.x, top: r.y * zoom + pan.y, width: r.w * zoom, height: r.h * zoom }} />;
      })}
    </div>
  );
}
