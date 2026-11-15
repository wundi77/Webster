// Schalter „Claude“ in der Kopfleiste, kurze Meldung und Hervorhebung der geänderten Ebenen
import { useEffect, useState } from 'react';
import { useClaude, startClaudeBridge } from './bridge';
import { useEditor, viewPage } from '../store';
import { absRect } from '../model/geometry';
import type { Pt } from '../model/types';

export function ClaudeToggle() {
  const enabled = useClaude(s => s.enabled);
  const connected = useClaude(s => s.connected);
  useEffect(() => { startClaudeBridge(); }, []);
  const title = !enabled
    ? 'Claude-Verbindung ist aus. Einschalten, damit Claude Code dein Layout sehen und ändern kann.'
    : connected
      ? 'Mit Claude Code verbunden. Claude kann dein Layout sehen und ändern (alles mit ⌘Z rückgängig). Klicken zum Ausschalten.'
      : 'Claude-Verbindung ist an, wartet auf Claude Code. Starte Claude Code im Webster-Ordner. Klicken zum Ausschalten.';
  return (
    <button type="button" className={`btn claude-btn${enabled ? ' on' : ''}`} title={title} aria-pressed={enabled}
      onClick={() => useClaude.getState().toggle()}>
      <span className={`claude-dot${enabled ? (connected ? ' ok' : ' wait') : ''}`} />
      <span className="btn-label">Claude</span>
    </button>
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
