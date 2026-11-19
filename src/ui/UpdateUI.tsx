// Hinweis „Neue Version“ und Fenster „Was ist neu“
import { useEffect, useState } from 'react';
import { reloadToLatest, useUpdate, watchForUpdates } from '../update';
import { markNewsSeen, NEWS, seenNews, unseenNews, type NewsEntry } from '../whatsNew';
import { create } from 'zustand';

/** „Was ist neu?“ von Hand öffnen (Menü „Webster“) */
export const useNews = create<{ manual: number }>(() => ({ manual: 0 }));
export const openNews = () => useNews.setState(s => ({ manual: s.manual + 1 }));
import { useProject } from '../model/project';
import { useStartup } from '../panels/ProjectDialog';
import { loadRecent } from '../persist';
import { Icons } from './icons';

/** Leiste oben, wenn während der Arbeit eine neue Version erschienen ist */
export function UpdateBanner() {
  const available = useUpdate(s => s.available);
  // Auf dem Startbildschirm kann nichts verloren gehen: dort gleich neu laden
  useEffect(() => { watchForUpdates(() => !useProject.getState().started); }, []);
  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <span>Es gibt eine neue Version von Webster.</span>
      <span className="muted">Speichere vorher dein Projekt.</span>
      <button type="button" className="btn primary" onClick={() => reloadToLatest(available)}>Jetzt aktualisieren</button>
      <button type="button" className="ibtn" aria-label="Später" title="Später" onClick={() => useUpdate.setState({ available: null })}><Icons.close /></button>
    </div>
  );
}

/** Fenster „Was ist neu“: nur für Leute, die Webster schon vorher benutzt haben */
export function WhatsNew() {
  const [entries, setEntries] = useState<NewsEntry[]>([]);
  useEffect(() => {
    const seen = seenNews();
    const list = unseenNews(seen);
    if (!list.length) return;
    (async () => {
      let returning = !!seen;
      if (!returning) {
        const st = useStartup.getState();
        let hadClaude = false;
        try { hadClaude = localStorage.getItem('webster.claude') !== null; } catch { /* egal */ }
        returning = !!(st.backup || st.meta || st.legacy) || hadClaude || (await loadRecent().catch(() => [])).length > 0;
      }
      if (returning) setEntries(list); else markNewsSeen();
    })();
  }, []);
  const manual = useNews(s => s.manual);
  useEffect(() => { if (manual) setEntries(NEWS.slice(0, 3)); }, [manual]);
  const close = () => { markNewsSeen(); setEntries([]); };
  useEffect(() => {
    if (!entries.length) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [entries.length]);
  if (!entries.length) return null;
  return (
    <div className="dialog-backdrop news-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog news-dialog" role="dialog" aria-modal="true" aria-labelledby="news-title">
        <header className="dialog-head">
          <h2 id="news-title">Was ist neu?</h2>
          <button type="button" className="ibtn" aria-label="Schließen" title="Schließen (Esc)" onClick={close}><Icons.close /></button>
        </header>
        <div className="dialog-body news-body">
          {entries.map(n => (
            <section key={n.id}>
              <h3>{n.title} <span className="muted">· {new Date(n.id.slice(0, 10)).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}</span></h3>
              <ul>{n.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </section>
          ))}
        </div>
        <footer className="dialog-foot">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn primary" autoFocus onClick={close}>Los geht’s</button>
        </footer>
      </div>
    </div>
  );
}
