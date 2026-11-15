// Dialog "Website exportieren": Seiten prüfen, Angaben für Suchmaschinen, ZIP herunterladen
import { useEffect, useState } from 'react';
import { useEditor } from '../store';
import { Icons } from '../ui/icons';
import { defaultSeo, defaultSite } from '../model/factory';
import { pageFiles, siteRoot } from '../export/html';
import { downloadZip, exportSite, type ExportWarning } from '../export/site';
import { PageSeoFields, SiteFields, useDialog } from './SiteSettings';

function pageIssues(page: ReturnType<typeof useEditor.getState>['doc']['pages'][number], hasUrl: boolean): string[] {
  const out: string[] = [];
  const seo = { ...defaultSeo(), ...page.seo };
  if (!siteRoot(page)) out.push('Kein Board – die Seite bleibt leer');
  if (!seo.title) out.push('Kein Seitentitel');
  if (!seo.description) out.push('Keine Beschreibung');
  return out;
}

export function ExportDialog() {
  const open = useDialog(s => s.open === 'export');
  return open ? <ExportDialogInner /> : null;
}

function ExportDialogInner() {
  const close = () => useDialog.getState().show(null);
  const doc = useEditor(s => s.doc);
  const [sel, setSel] = useState<string>(() => useDialog.getState().tab ?? 'site');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ name: string; size: number; warnings: ExportWarning[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const site = { ...defaultSite(), ...doc.site };
  const files = pageFiles(doc);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy]);

  const setFonts = (v: boolean) => useEditor.getState().mutate((_, d) => { d.site = { ...defaultSite(), ...d.site, selfHostFonts: v }; }, { system: true });

  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await exportSite(useEditor.getState().doc, { selfHostFonts: site.selfHostFonts });
      downloadZip(r);
      setResult({ name: r.fileName, size: r.zip.length, warnings: r.warnings.filter(w => !w.pageId) });
    } catch (e) {
      setError(`Der Export ist fehlgeschlagen: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const totalIssues = doc.pages.reduce((n, p) => n + pageIssues(p, !!site.url).length, 0);
  const selPage = doc.pages.find(p => p.id === sel);

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header className="dialog-head">
          <h2 id="export-title">Website exportieren</h2>
          <button type="button" className="ibtn" aria-label="Schließen" title="Schließen (Esc)" onClick={close} disabled={busy}><Icons.close /></button>
        </header>
        <div className="dialog-body export-body">
          <nav className="export-list" aria-label="Website und Seiten">
            <button type="button" className={`export-item${sel === 'site' ? ' active' : ''}`} onClick={() => setSel('site')}>
              <Icons.globe />
              <span className="export-item-main"><span className="export-item-name">Website</span><span className="export-item-file">{site.name || doc.name}</span></span>
            </button>
            <div className="export-list-label">Seiten</div>
            {doc.pages.map((p, i) => {
              const issues = pageIssues(p, !!site.url);
              return (
                <button key={p.id} type="button" className={`export-item${sel === p.id ? ' active' : ''}`} onClick={() => setSel(p.id)}
                  title={issues.length ? issues.join(' · ') : 'Alles ausgefüllt'}>
                  <Icons.file />
                  <span className="export-item-main">
                    <span className="export-item-name">{p.name}{i === 0 && <span className="tag">Startseite</span>}</span>
                    <span className="export-item-file">{files.get(p.id)}</span>
                  </span>
                  {issues.length > 0 ? <span className="issue-dot" aria-label={`${issues.length} Hinweise`}>{issues.length}</span> : <span className="ok-dot" aria-label="Vollständig">✓</span>}
                </button>
              );
            })}
          </nav>
          <div className="export-detail">
            {sel === 'site' || !selPage ? (
              <>
                <h3>Angaben zur Website</h3>
                <SiteFields />
              </>
            ) : (
              <>
                <h3>{selPage.name} <span className="muted">· Suchmaschinen & Teilen</span></h3>
                {pageIssues(selPage, !!site.url).filter(t => t.startsWith('Kein Board')).map(t => <p key={t} className="notice warn">{t}. Lege auf dieser Seite ein Board an.</p>)}
                <PageSeoFields pageId={selPage.id} />
              </>
            )}
          </div>
        </div>
        <footer className="dialog-foot">
          <label className="check" title="Die Schriften werden in den ZIP-Ordner gepackt. So lädt der Browser der Besucher nichts von Google – das ist datenschutzfreundlich (DSGVO).">
            <input type="checkbox" checked={site.selfHostFonts} onChange={e => setFonts(e.target.checked)} />
            <span>Schriften mitliefern <span className="muted">(DSGVO-freundlich, empfohlen)</span></span>
          </label>
          <div className="spacer" />
          <div className="export-status" aria-live="polite">
            {busy ? 'Website wird erstellt …'
              : error ? <span className="err">{error}</span>
              : result ? <span>Heruntergeladen: <b>{result.name}</b> ({Math.max(1, Math.round(result.size / 1024))} KB){result.warnings.map(w => <span key={w.text} className="err"> · {w.text}</span>)}</span>
              : totalIssues ? `${totalIssues} ${totalIssues === 1 ? 'Hinweis' : 'Hinweise'} – du kannst trotzdem exportieren.`
              : `${doc.pages.length} ${doc.pages.length === 1 ? 'Seite' : 'Seiten'}, alles ausgefüllt.`}
          </div>
          <button type="button" className="btn primary" onClick={run} disabled={busy}><Icons.download /> {busy ? 'Bitte warten …' : 'ZIP herunterladen'}</button>
        </footer>
      </div>
    </div>
  );
}
