// Zweite Sprache: Umschalter oben und Fenster „Übersetzen“ (alle Texte nebeneinander)
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { useEditor } from '../store';
import type { Page, WDocument } from '../model/types';
import { hoursAuto, langLabel, mainLang, missingTranslations, needsTranslation, secondLang } from '../model/i18n';
import { setPageTranslation, setTranslation } from '../model/language';

const useTranslate = create<{ open: boolean }>(() => ({ open: false }));
export const openTranslate = () => useTranslate.setState({ open: true });

/** Oben in der Leiste: in welcher Sprache wird gerade bearbeitet? (nur mit zweiter Sprache) */
export function LangSwitch() {
  const l1 = useEditor(s => mainLang(s.doc));
  const l2 = useEditor(s => secondLang(s.doc));
  const lang = useEditor(s => s.lang);
  const missing = useEditor(s => (l2 ? missingTranslations(s.doc, l2) : 0));
  if (!l2) return null;
  const set = useEditor.getState().setLang;
  return (
    <div className="bp-switch lang-switch" role="radiogroup" aria-label="Sprache bearbeiten">
      <button type="button" role="radio" aria-checked={!lang} className={`bp-btn${!lang ? ' active' : ''}`} title={`Texte auf ${langLabel(l1)} bearbeiten`} onClick={() => set(null)}>{l1.toUpperCase()}</button>
      <button type="button" role="radio" aria-checked={lang === l2} className={`bp-btn${lang === l2 ? ' active' : ''}`}
        title={`Texte auf ${langLabel(l2)} bearbeiten${missing ? ` – ${missing} noch nicht übersetzt (gestrichelt umrandet)` : ''}`} onClick={() => set(l2)}>
        {l2.toUpperCase()}{missing > 0 && <span className="lang-missing">{missing}</span>}
      </button>
      <button type="button" className="bp-btn" title="Alle Texte nebeneinander übersetzen" onClick={openTranslate}>Übersetzen</button>
    </div>
  );
}

interface Row { pageId: string; nodeId: string; text: string; tr: string }
interface Group { id: string; title: string; page: Page; rows: Row[]; isSite: boolean }

function groups(doc: WDocument, lang: string): Group[] {
  const out: Group[] = [];
  const add = (p: Page, title: string, isSite: boolean) => {
    const rows: Row[] = [];
    const seen = new Set<string>();
    const auto = hoursAuto(p);
    const walk = (id: string) => {
      const n = p.nodes[id];
      if (!n || seen.has(id)) return;
      seen.add(id);
      // Kopien von Komponenten (Kopf-/Fußzeile) werden beim Original übersetzt
      const copy = !!n.componentId && !n.isMain && !(n.touched ?? []).includes('text');
      if (!copy && needsTranslation(n) && !auto.has(id)) rows.push({ pageId: p.id, nodeId: id, text: n.text ?? '', tr: n.tr?.[lang] ?? '' });
      if (copy && n.mainId === n.componentId) return; // ganze Kopie überspringen
      n.children.forEach(walk);
    };
    p.rootIds.forEach(walk);
    if (rows.length || isSite) out.push({ id: p.id, title, page: p, rows, isSite });
  };
  doc.pages.forEach(p => add(p, `Seite „${p.name}“`, true));
  (doc.componentPages ?? []).forEach(p => add(p, `Baustein „${p.name}“ (auf allen Seiten gleich)`, false));
  return out;
}

export function TranslateDialog() {
  const open = useTranslate(s => s.open);
  const doc = useEditor(s => s.doc);
  const l2 = secondLang(doc);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const close = () => useTranslate.setState({ open: false });
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [open]);
  const list = useMemo(() => (open && l2 ? groups(doc, l2) : []), [open, doc, l2]);
  if (!open || !l2) return null;
  const l1 = mainLang(doc);
  const missing = missingTranslations(doc, l2);
  const area = (v: string) => Math.min(6, Math.max(1, Math.ceil(v.length / 46) + (v.match(/\n/g)?.length ?? 0)));
  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog tr-dialog" role="dialog" aria-modal="true" aria-labelledby="tr-title" onKeyDown={e => e.stopPropagation()}>
        <header className="dialog-head">
          <h2 id="tr-title">Übersetzen: {langLabel(l1)} → {langLabel(l2)}</h2>
          <span className="muted">{missing ? `${missing} Text${missing === 1 ? '' : 'e'} noch offen` : 'Alles übersetzt'}</span>
        </header>
        <div className="dialog-body tr-body">
          <div className="tr-head"><span>{langLabel(l1)}</span><span>{langLabel(l2)}</span></div>
          {list.map(g => {
            const rows = onlyMissing ? g.rows.filter(r => !r.tr.trim()) : g.rows;
            const seo = g.page.tr?.[l2] ?? {};
            if (onlyMissing && !rows.length) return null;
            return (
              <section key={g.id} className="tr-group">
                <h3>{g.title}</h3>
                {g.isSite && !onlyMissing && (
                  <>
                    <div className="tr-row tr-meta"><div><span className="tr-k">Seitenname</span>{g.page.name}</div>
                      <input className="textinput" value={seo.name ?? ''} placeholder={g.page.name} onChange={e => setPageTranslation(g.page.id, l2, { name: e.target.value })} /></div>
                    <div className="tr-row tr-meta"><div><span className="tr-k">Titel für Suchmaschinen</span>{g.page.seo?.title || <i className="muted">(leer)</i>}</div>
                      <input className="textinput" value={seo.title ?? ''} onChange={e => setPageTranslation(g.page.id, l2, { title: e.target.value })} /></div>
                    <div className="tr-row tr-meta"><div><span className="tr-k">Beschreibung für Suchmaschinen</span>{g.page.seo?.description || <i className="muted">(leer)</i>}</div>
                      <textarea className="textinput area" rows={2} value={seo.description ?? ''} onChange={e => setPageTranslation(g.page.id, l2, { description: e.target.value })} /></div>
                  </>
                )}
                {rows.map(r => (
                  <div key={r.nodeId} className={`tr-row${r.tr.trim() ? '' : ' open'}`}>
                    <div className="tr-src">{r.text}</div>
                    <textarea className="textinput area" rows={area(r.tr || r.text)} value={r.tr} placeholder="Übersetzung …" aria-label={`Übersetzung von: ${r.text.slice(0, 60)}`}
                      onChange={e => setTranslation(r.pageId, r.nodeId, l2, e.target.value)} />
                  </div>
                ))}
                {!rows.length && !g.isSite && <p className="hint">Keine Texte.</p>}
              </section>
            );
          })}
        </div>
        <footer className="dialog-foot">
          <label className="check"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> Nur fehlende zeigen</label>
          <div className="spacer" />
          <span className="muted tr-tip">Tipp: Du kannst Texte auch direkt auf der Seite übersetzen – oben auf {l2.toUpperCase()} umschalten.</span>
          <button type="button" className="btn primary" onClick={close}>Fertig</button>
        </footer>
      </div>
    </div>
  );
}
