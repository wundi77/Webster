// Einstellungen für Kopfleiste & Menü (rechter Bereich)
import { useState } from 'react';
import { useEditor, viewPage } from '../store';
import type { NavCollapse, NavSettings, WNode } from '../model/types';
import { defaultNav, hasNavHeader, insertHeader, navOwner } from '../model/nav';
import { ColorField, Section } from '../ui/controls';
import { Icons } from '../ui/icons';

/** Kopfleiste, zu der die Ebene gehört (oder die Ebene selbst) */
function useOwner(node: WNode): WNode | undefined {
  return useEditor(s => {
    const page = viewPage(s);
    let n: WNode | undefined = page.nodes[node.id];
    while (n) { if (n.nav) return n; n = page.nodes[n.parentId ?? '']; }
    return node.navLinks ? navOwner(page, node.id) : undefined;
  });
}

export function NavSection({ node }: { node: WNode }) {
  const owner = useOwner(node);
  const setBp = useEditor(s => s.setBreakpoint);
  if (!owner?.nav) return null;
  const nav = { ...defaultNav(), ...owner.nav };
  const set = (patch: Partial<NavSettings>, key: string) =>
    useEditor.getState().mutate(pg => { const n = pg.nodes[owner.id]; if (n) n.nav = { ...defaultNav(), ...n.nav, ...patch }; }, { key: `nav-${key}` });
  return (
    <Section title="Menü">
      <div className="field">
        <div className="field-label">Als ☰-Symbol anzeigen</div>
        <select className="select" value={nav.collapse} onChange={e => {
          const v = e.target.value as NavCollapse;
          set({ collapse: v }, 'collapse');
          if (v !== 'never') setBp(v);
        }}>
          <option value="mobile">Nur auf dem Handy (bis 767 px)</option>
          <option value="tablet">Auf Tablet und Handy (bis 1024 px)</option>
          <option value="never">Nie – Links immer zeigen</option>
        </select>
      </div>
      <p className="proto-hint">Oben fixieren und eine kleinere Version nach dem Scrollen: im Reiter „Elemente“ unter „Beim Scrollen“.</p>
      {nav.collapse !== 'never' && (
        <>
          <div className="field"><div className="field-label">Farbe des ☰-Symbols</div>
            <ColorField color={nav.iconColor} onChange={c => c.color && set({ iconColor: c.color }, 'icon')} /></div>
          <div className="field"><div className="field-label">Geöffnetes Menü: Hintergrund</div>
            <ColorField color={nav.overlayBg} onChange={c => c.color && set({ overlayBg: c.color }, 'bg')} /></div>
          <div className="field"><div className="field-label">Geöffnetes Menü: Schrift</div>
            <ColorField color={nav.overlayText} onChange={c => c.color && set({ overlayText: c.color }, 'fg')} /></div>
          <p className="proto-hint">Das geöffnete Menü füllt den ganzen Bildschirm. Ausprobieren in der Vorschau (P) mit „Mobil“.</p>
        </>
      )}
      <UpdatePages />
    </Section>
  );
}

function UpdatePages() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <div className="row"><button type="button" className="btn grow" title="Neue Seiten ins Menü aufnehmen und die Kopfleiste auf Seiten ohne sie einfügen"
        onClick={() => { const r = insertHeader(); setMsg(r.links || r.pages ? `${r.links} Menüpunkt(e) ergänzt, auf ${r.pages} Seite(n) eingefügt.` : 'Alles aktuell.'); }}>
        <Icons.reset /> Seiten im Menü aktualisieren</button></div>
      {msg && <p className="proto-hint" aria-live="polite">{msg}</p>}
    </>
  );
}

/** Für den Prototyp-Tab ohne Auswahl */
export function NavInsertSection() {
  const exists = useEditor(s => hasNavHeader(s.doc));
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Section title="Kopfleiste & Menü">
      <p className="proto-hint">{exists
        ? 'Die Kopfleiste ist eine Komponente: Änderst du sie auf einer Seite (das Original), ändert sie sich überall.'
        : 'Fügt oben auf allen Seiten eine Kopfleiste mit Logo-Text und Links zu allen Seiten ein. Auf dem Handy wird das Menü zum ☰-Symbol.'}</p>
      <div className="row"><button type="button" className="btn grow" onClick={() => {
        const r = insertHeader();
        setMsg(exists ? (r.links || r.pages ? `${r.links} Menüpunkt(e) ergänzt, auf ${r.pages} Seite(n) eingefügt.` : 'Alles aktuell.') : `Kopfleiste auf ${r.pages} Seite(n) eingefügt.`);
      }}>{exists ? <><Icons.reset /> Seiten im Menü aktualisieren</> : <><Icons.plus /> Kopfleiste mit Menü einfügen</>}</button></div>
      {msg && <p className="proto-hint" aria-live="polite">{msg}</p>}
    </Section>
  );
}
