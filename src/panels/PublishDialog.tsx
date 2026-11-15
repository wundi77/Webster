// Dialog "Veröffentlichen": Prüfen → Domain → Herunterladen → Schritt-für-Schritt-Anleitung zum Hochladen
import { useEffect, useState, type ReactNode } from 'react';
import { useEditor } from '../store';
import { Icons } from '../ui/icons';
import { defaultSeo, defaultSite } from '../model/factory';
import { siteRoot } from '../export/html';
import { downloadZip, exportSite, normalizeUrl } from '../export/site';
import { addLegalFooter, createLegalPage, findLegalPage, fontPolicyMismatch, LEGAL, legalStatus, pagesWithPlaceholders, type LegalKind } from '../model/legal';
import { fontInfo } from '../model/fonts';
import { formsWithoutRecipient } from '../model/form';
import { addPolicySections, EMBED_INFO, embedReady, servicesMissingInPolicy } from '../model/embed';
import { useDialog } from './SiteSettings';
import { slug } from '../model/css';

type Level = 'ok' | 'warn' | 'info';
interface Check { id: string; level: Level; text: ReactNode; action?: { label: string; run: () => void } }

const close = () => useDialog.getState().show(null);
const openPage = (id: string) => { useEditor.getState().setPage(id); useEditor.getState().setSelection([]); close(); };

export function PublishDialog() {
  const open = useDialog(s => s.open === 'publish');
  return open ? <PublishInner /> : null;
}

function useChecks(): Check[] {
  const doc = useEditor(s => s.doc);
  const site = { ...defaultSite(), ...doc.site };
  const out: Check[] = [];

  for (const st of legalStatus(doc)) {
    const name = LEGAL[st.kind].name;
    if (!st.page) {
      out.push({
        id: st.kind, level: 'warn',
        text: <><b>{name}</b> fehlt. {st.kind === 'impressum' ? 'Für geschäftsmäßige Websites in Deutschland Pflicht.' : 'Pflicht, sobald personenbezogene Daten verarbeitet werden – das tut praktisch jede Website (Server-Logfiles).'}</>,
        action: { label: 'Vorlage anlegen', run: () => createLegalPage(st.kind as LegalKind) },
      });
    } else if (st.placeholders) {
      const id = st.page.id;
      out.push({ id: st.kind, level: 'warn', text: <><b>{name}</b>: Es stehen noch Platzhalter in [eckigen Klammern] darin.</>, action: { label: 'Seite öffnen', run: () => openPage(id) } });
    } else {
      out.push({ id: st.kind, level: 'ok', text: <><b>{name}</b> ist vorhanden und ausgefüllt.</> });
    }
  }
  const status = legalStatus(doc);
  const missing = new Set(status.flatMap(s => s.missingLinks.map(p => p.name)));
  if (status.some(s => s.page)) {
    out.push(missing.size
      ? { id: 'links', level: 'warn', text: <>Nicht auf jeder Seite verlinkt (fehlt auf: {[...missing].join(', ')}). Impressum und Datenschutz müssen von jeder Seite aus erreichbar sein.</>, action: { label: 'Fußzeile mit Links einfügen', run: () => { addLegalFooter(); } } }
      : { id: 'links', level: 'ok', text: <>Impressum und Datenschutz sind von jeder Seite aus verlinkt.</> });
  }
  const webFonts = doc.pages.some(p => siteRoot(p) && Object.values(p.nodes).some(n => { const f = n.textStyle && fontInfo(n.textStyle.fontFamily); return !!f && !f.system; }));
  const mismatch = fontPolicyMismatch(doc, webFonts);
  const dsPage = findLegalPage(doc, 'datenschutz');
  if (mismatch && dsPage) out.push(mismatch === 'says-local'
    ? { id: 'fontpol', level: 'warn', text: <>Die Datenschutzerklärung sagt, die Schriften seien lokal eingebunden – „Schriften mitliefern“ ist aber ausgeschaltet, die Seite lädt sie von Google.</>, action: { label: 'Mitliefern einschalten', run: () => useEditor.getState().mutate((_, d) => { d.site = { ...defaultSite(), ...d.site, selfHostFonts: true }; }, { system: true }) } }
    : { id: 'fontpol', level: 'info', text: <>Die Datenschutzerklärung erwähnt Google Fonts, die Schriften werden aber jetzt mitgeliefert. Den Abschnitt „Schriftarten“ kannst du anpassen.</>, action: { label: 'Seite öffnen', run: () => openPage(dsPage.id) } });

  const ph = pagesWithPlaceholders(doc).filter(p => !status.some(s => s.page?.id === p.id));
  if (ph.length) out.push({ id: 'ph', level: 'warn', text: <>Platzhalter in [eckigen Klammern] auf: {ph.map(p => p.name).join(', ')}.</>, action: { label: 'Seite öffnen', run: () => openPage(ph[0].id) } });

  for (const f of formsWithoutRecipient(doc)) {
    out.push({ id: 'form-' + f.id, level: 'warn', text: <>Das Kontaktformular auf <b>{f.page.name}</b> hat noch keine Empfänger-Adresse.</>,
      action: { label: 'Formular öffnen', run: () => { openPage(f.page.id); useEditor.getState().setSelection([f.id]); } } });
  }
  for (const p of doc.pages) for (const id in p.nodes) {
    const e = p.nodes[id].embed;
    if (e && !embedReady(doc, e)) {
      out.push({ id: 'embed-' + id, level: 'warn', text: <>{EMBED_INFO[e.kind].label} auf <b>{p.name}</b> ist noch nicht eingerichtet (Link, Adresse oder Datei fehlt) und bleibt leer.</>,
        action: { label: 'Öffnen', run: () => { openPage(p.id); useEditor.getState().setSelection([id]); } } });
    }
  }
  const missingSvc = servicesMissingInPolicy(doc);
  if (missingSvc.length) out.push({ id: 'embed-policy', level: 'warn',
    text: <>Die Datenschutzerklärung erwähnt noch nicht: {missingSvc.map(k => EMBED_INFO[k].service).join(', ')}.</>,
    action: { label: 'Abschnitt einfügen', run: () => addPolicySections(missingSvc) } });
  const empty = doc.pages.filter(p => !siteRoot(p));
  if (empty.length) out.push({ id: 'empty', level: 'warn', text: <>Ohne Inhalt (kein Board): {empty.map(p => p.name).join(', ')}.</>, action: { label: 'Seite öffnen', run: () => openPage(empty[0].id) } });

  const seoMissing = doc.pages.filter(p => { const s = { ...defaultSeo(), ...p.seo }; return siteRoot(p) && (!s.title || !s.description); });
  out.push(seoMissing.length
    ? { id: 'seo', level: 'info', text: <>Titel oder Beschreibung für Google fehlen auf: {seoMissing.map(p => p.name).join(', ')}.</>, action: { label: 'Ergänzen', run: () => useDialog.getState().show('export', seoMissing[0].id) } }
    : { id: 'seo', level: 'ok', text: <>Alle Seiten haben Titel und Beschreibung für Google.</> });
  out.push(site.favicon
    ? { id: 'fav', level: 'ok', text: <>Favicon (Symbol im Browser-Tab) ist gesetzt.</> }
    : { id: 'fav', level: 'info', text: <>Kein Favicon (Symbol im Browser-Tab) – optional.</>, action: { label: 'Einstellen', run: () => useDialog.getState().show('export', 'site') } });
  return out;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="pub-step">
      <div className="pub-num" aria-hidden="true">{n}</div>
      <div className="pub-step-body">
        <h3>{title}</h3>
        {children}
      </div>
    </section>
  );
}

function PublishInner() {
  const doc = useEditor(s => s.doc);
  const site = { ...defaultSite(), ...doc.site };
  const checks = useChecks();
  const [urlDraft, setUrlDraft] = useState(site.url);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [how, setHow] = useState<'ftp' | 'browser'>('ftp');
  const folder = slug(site.name || doc.name) || 'website';
  const warnCount = checks.filter(c => c.level === 'warn').length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy]);

  const saveUrl = () => {
    const v = normalizeUrl(urlDraft);
    setUrlDraft(v);
    if (v !== site.url) useEditor.getState().mutate((_, d) => { d.site = { ...defaultSite(), ...d.site, url: v }; }, { system: true });
  };

  const download = async () => {
    setBusy(true); setDone(null);
    try {
      const r = await exportSite(useEditor.getState().doc, { selfHostFonts: site.selfHostFonts });
      downloadZip(r);
      setDone(`${r.fileName} wurde in deinen Download-Ordner gespeichert.`);
    } catch (e) {
      setDone(`Fehler: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const domain = site.url.replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'deine-domain.de';

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="dialog publish-dialog" role="dialog" aria-modal="true" aria-labelledby="pub-title">
        <header className="dialog-head">
          <h2 id="pub-title">Website veröffentlichen</h2>
          <button type="button" className="ibtn" aria-label="Schließen" title="Schließen (Esc)" onClick={close} disabled={busy}><Icons.close /></button>
        </header>
        <div className="dialog-body pub-body">
          <Step n={1} title="Vor dem Veröffentlichen prüfen">
            <ul className="pub-checks">
              {checks.map(c => (
                <li key={c.id} className={`pub-check ${c.level}`}>
                  <span className="pub-icon" aria-label={c.level === 'ok' ? 'Erledigt' : c.level === 'warn' ? 'Wichtig' : 'Hinweis'}>{c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : 'i'}</span>
                  <span className="pub-text">{c.text}</span>
                  {c.action && <button type="button" className="btn small" onClick={c.action.run}>{c.action.label}</button>}
                </li>
              ))}
            </ul>
            <p className="pub-note">Die Vorlagen für Impressum und Datenschutz sind Gliederungen zum Ausfüllen – keine Rechtsberatung. Viele Webhoster bieten kostenlose Generatoren; im Zweifel lass die Texte prüfen.</p>
          </Step>

          <Step n={2} title="Deine Domain">
            <div className="row">
              <input className="textinput grow" value={urlDraft} placeholder="www.meine-seite.de" spellCheck={false} aria-label="Domain"
                onChange={e => setUrlDraft(e.target.value)} onBlur={saveUrl} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            </div>
            <p className="pub-note">Wird für die Sitemap für Google gebraucht (kommt automatisch in den Ordner).</p>
          </Step>

          <Step n={3} title="Website herunterladen">
            <div className="row pub-dl">
              <button type="button" className="btn primary" onClick={download} disabled={busy}><Icons.download /> {busy ? 'Wird erstellt …' : 'ZIP herunterladen'}</button>
              {warnCount > 0 && !done && <span className="pub-note">Noch {warnCount} {warnCount === 1 ? 'wichtiger Punkt' : 'wichtige Punkte'} offen – du kannst trotzdem herunterladen.</span>}
              {done && <span className="pub-note" aria-live="polite">{done}</span>}
            </div>
            <p className="pub-note">Öffne die ZIP-Datei per Doppelklick. Es entsteht ein Ordner <b>{folder}</b> mit <code>index.html</code>, <code>css</code>, <code>bilder</code> usw. Hochgeladen wird <b>der Inhalt</b> dieses Ordners, nicht der Ordner selbst.</p>
          </Step>

          <Step n={4} title="Bei deinem Webhoster hochladen">
            <div className="seg pub-seg" role="tablist">
              <button type="button" role="tab" aria-selected={how === 'ftp'} className={`seg-text${how === 'ftp' ? ' active' : ''}`} onClick={() => setHow('ftp')}>Mit FTP-Programm (empfohlen)</button>
              <button type="button" role="tab" aria-selected={how === 'browser'} className={`seg-text${how === 'browser' ? ' active' : ''}`} onClick={() => setHow('browser')}>Im Browser (Datei-Manager)</button>
            </div>
            {how === 'ftp' ? (
              <ol className="pub-list">
                <li><b>Programm installieren:</b> kostenlos z. B. <b>Cyberduck</b> (cyberduck.io) oder <b>FileZilla</b> (filezilla-project.org).</li>
                <li><b>Zugangsdaten nachschlagen:</b> im Kundenbereich deines Webhosters unter „FTP“, „SFTP“ oder „Webspace“: <i>Server</i>, <i>Benutzername</i> und <i>Passwort</i>. Nimm <b>SFTP</b>, wenn angeboten – das ist verschlüsselt.</li>
                <li><b>Verbinden:</b> In Cyberduck auf „Neue Verbindung“, oben <i>SFTP</i> wählen, die Daten eintragen, „Verbinden“.</li>
                <li><b>Richtigen Ordner öffnen:</b> den Ordner, auf den deine Domain zeigt – oft das oberste Verzeichnis, <code>htdocs</code>, <code>html</code> oder <code>www</code>. Das steht bei deinem Webhoster in den Domain-Einstellungen („Ziel“ oder „Verzeichnis“). Liegt dort eine alte Platzhalterseite (z. B. <code>index.htm</code>), lösche sie.</li>
                <li><b>Hochziehen:</b> Alles aus dem Ordner <b>{folder}</b> markieren (⌘A) und in das Fenster ziehen.</li>
              </ol>
            ) : (
              <ol className="pub-list">
                <li>Im Kundenbereich deines Webhosters den <b>Datei-Manager</b> öffnen (heißt manchmal „Webspace-Explorer“ oder „Dateien“).</li>
                <li>In den Ordner wechseln, auf den deine Domain zeigt (siehe Domain-Einstellungen beim Webhoster).</li>
                <li>Kann der Datei-Manager <b>ZIP-Dateien entpacken</b>, lade die ZIP-Datei hoch und entpacke sie dort. Verschiebe danach den Inhalt des Ordners <b>{folder}</b> eine Ebene nach oben.</li>
                <li>Sonst: alle Dateien und Ordner aus <b>{folder}</b> einzeln hochladen – Ordner wie <code>css</code> und <code>bilder</code> vorher mit gleichem Namen anlegen.</li>
              </ol>
            )}
          </Step>

          <Step n={5} title="Domain verbinden & HTTPS einschalten">
            <ol className="pub-list">
              <li><b>Domain beim selben Webhoster:</b> In den Domain-Einstellungen <b>{domain}</b> mit dem Ordner aus Schritt 4 verbinden (meist schon voreingestellt).</li>
              <li><b>Domain bei einem anderen Anbieter:</b> Dort in den DNS-Einstellungen die Einträge setzen, die dein Webhoster nennt (meist ein <i>A-Eintrag</i> und ein <i>CNAME</i> für „www“). Das kann bis zu 24 Stunden dauern.</li>
              <li><b>SSL-Zertifikat aktivieren</b> (meist kostenlos, „Let’s Encrypt“). Dann ist die Seite über <code>https://</code> erreichbar und Browser zeigen keine Warnung.</li>
              <li><b>Testen:</b> <code>https://{domain}</code> aufrufen, alle Links anklicken und auch auf dem Handy ansehen.</li>
            </ol>
          </Step>

          <Step n={6} title="Später etwas ändern">
            <p className="pub-note pub-plain">In Webster ändern → hier erneut <b>ZIP herunterladen</b> → wie in Schritt 4 hochladen und die alten Dateien überschreiben. Siehst du noch die alte Version, lade die Seite im Browser mit ⌘⇧R neu.</p>
          </Step>
        </div>
      </div>
    </div>
  );
}
