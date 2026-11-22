// Einstellungen für Suchmaschinen & Teilen (pro Seite) und für die ganze Website
import { useRef, useState } from 'react';
import { create } from 'zustand';
import { useEditor } from '../store';
import type { PageSeo, SiteSettings } from '../model/types';
import { defaultSeo, defaultSite } from '../model/factory';
import { addImageFiles } from '../model/library';
import { pageFiles } from '../export/html';
import { normalizeUrl } from '../export/site';
import { missingTranslations } from '../model/i18n';
import { hasLangSwitch, insertLangSwitch, setSecondLang } from '../model/language';
import { openTranslate } from './TranslateDialog';

/** Welcher Dialog ist offen? */
export type DialogId = 'export' | 'publish' | 'icons';
export const useDialog = create<{ open: DialogId | null; tab: string | null; show: (d: DialogId | null, tab?: string) => void }>(set => ({
  open: null, tab: null, show: (d, tab) => set({ open: d, tab: tab ?? null }),
}));

export const LANGS: [string, string][] = [
  ['de', 'Deutsch'], ['en', 'Englisch'], ['fr', 'Französisch'], ['it', 'Italienisch'], ['es', 'Spanisch'],
  ['nl', 'Niederländisch'], ['pl', 'Polnisch'], ['tr', 'Türkisch'], ['da', 'Dänisch'], ['sv', 'Schwedisch'],
];

export const DESC_MAX = 160;
export const TITLE_MAX = 60;

const setSeo = (pageId: string, patch: Partial<PageSeo>, key: string) =>
  useEditor.getState().mutate((_, d) => {
    const p = d.pages.find(x => x.id === pageId);
    if (p) p.seo = { ...defaultSeo(), ...p.seo, ...patch };
  }, { key: `seo-${key}-${pageId}`, system: true });

const setSite = (patch: Partial<SiteSettings>, key: string) =>
  useEditor.getState().mutate((_, d) => { d.site = { ...defaultSite(), ...d.site, ...patch }; }, { key: `site-${key}`, system: true });

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={`char-count${n > max ? ' over' : ''}`} title={`Empfohlen: höchstens ${max} Zeichen`}>{n}/{max}</span>;
}

/** Bildauswahl aus der Bibliothek (mit Hochladen) */
export function ImagePick({ value, onChange, label, hint }: { value: string | null; onChange: (id: string | null) => void; label: string; hint: string }) {
  const images = useEditor(s => s.doc.library.images);
  const file = useRef<HTMLInputElement>(null);
  const img = images.find(i => i.id === value);
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="img-pick">
        <div className="img-pick-thumb">{img ? <img src={img.src} alt="" /> : <span>–</span>}</div>
        <select className="select grow" aria-label={label} value={img ? img.id : ''} onChange={e => onChange(e.target.value || null)}>
          <option value="">Kein Bild</option>
          {images.map(i => <option key={i.id} value={i.id}>{i.name} ({i.w}×{i.h})</option>)}
        </select>
        <button type="button" className="btn small" title="Bild vom Computer hinzufügen" onClick={() => file.current?.click()}>Hochladen …</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={async e => {
          const f = [...(e.target.files ?? [])];
          e.target.value = '';
          const [id] = await addImageFiles(f);
          if (id) onChange(id);
        }} />
      </div>
      <div className="field-hint">{hint}</div>
    </div>
  );
}

/** Titel, Beschreibung, Vorschaubild einer Seite */
export function PageSeoFields({ pageId }: { pageId: string }) {
  const page = useEditor(s => s.doc.pages.find(p => p.id === pageId));
  const siteName = useEditor(s => s.doc.site?.name || s.doc.name);
  const file = useEditor(s => pageFiles(s.doc).get(pageId));
  if (!page) return null;
  const seo = { ...defaultSeo(), ...page.seo };
  return (
    <>
      <div className="field">
        <div className="field-label">Seitentitel <Counter n={seo.title.length} max={TITLE_MAX} /></div>
        <input className="textinput" value={seo.title} placeholder={`${page.name} – ${siteName}`} spellCheck
          onChange={e => setSeo(pageId, { title: e.target.value }, 'title')} />
        <div className="field-hint">Erscheint im Browser-Tab und als Überschrift bei Google.</div>
      </div>
      <div className="field">
        <div className="field-label">Beschreibung <Counter n={seo.description.length} max={DESC_MAX} /></div>
        <textarea className="textinput area" rows={3} value={seo.description} spellCheck
          placeholder="Worum geht es auf dieser Seite? Ein bis zwei Sätze."
          onChange={e => setSeo(pageId, { description: e.target.value }, 'desc')} />
        <div className="field-hint">Der kurze Text unter dem Titel in den Suchergebnissen.</div>
      </div>
      {file && <div className="field-hint">Dateiname beim Export: <code>{file}</code></div>}
    </>
  );
}

/** Name, Sprache, Adresse, Favicon der Website */
/** Besucher-Statistik mit Plausible: nur die Domain eintragen */
function AnalyticsFields() {
  const a = useEditor(s => s.doc.site?.analytics ?? null);
  const url = useEditor(s => s.doc.site?.url ?? '');
  const guess = url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const clean = (v: string) => v.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const [own, setOwn] = useState(!!a?.host);
  return (
    <div className="field">
      <div className="field-label">Besucher-Statistik (Plausible)</div>
      <label className="check" style={{ marginTop: 0 }}>
        <input type="checkbox" checked={!!a} onChange={e => setSite({ analytics: e.target.checked ? { domain: guess } : null }, 'analytics')} />
        Besuche zählen – ohne Cookies, ohne Banner
      </label>
      {a && (
        <>
          <input className="textinput" style={{ marginTop: 6 }} value={a.domain} placeholder="meine-seite.de" spellCheck={false} aria-label="Domain bei Plausible"
            onChange={e => setSite({ analytics: { ...a, domain: clean(e.target.value) } }, 'analytics')} />
          <label className="check"><input type="checkbox" checked={own} onChange={e => { setOwn(e.target.checked); if (!e.target.checked) setSite({ analytics: { domain: a.domain } }, 'analytics'); }} /> Eigener Plausible-Server</label>
          {own && <input className="textinput" style={{ marginTop: 6 }} value={a.host ?? ''} placeholder="https://statistik.meine-seite.de" spellCheck={false} aria-label="Adresse des eigenen Plausible-Servers"
            onChange={e => setSite({ analytics: { ...a, host: e.target.value.trim() || undefined } }, 'analytics')} />}
          <div className="field-hint">
            1. Konto bei plausible.io anlegen (kostenpflichtig, mit Testzeit) und dort die Domain eintragen – genau so wie hier.
            2. Website exportieren und hochladen. Die Zahlen siehst du dann bei Plausible. In der Vorschau wird nichts gezählt.
            {!a.domain && ' Trage noch die Domain ein.'}
          </div>
        </>
      )}
    </div>
  );
}

/** Zweite Sprache: auswählen, Sprachumschalter einsetzen, Übersetzen-Fenster */
function SecondLangFields({ lang, lang2 }: { lang: string; lang2: string | null }) {
  const has = useEditor(s => hasLangSwitch(s.doc));
  const missing = useEditor(s => (lang2 ? missingTranslations(s.doc, lang2) : 0));
  return (
    <div className="field">
      <div className="field-label">Zweite Sprache</div>
      <select className="select" value={lang2 && lang2 !== lang ? lang2 : ''} onChange={e => setSecondLang(e.target.value || null)}>
        <option value="">Keine – nur eine Sprache</option>
        {LANGS.filter(([k]) => k !== lang).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {lang2 && lang2 !== lang && (
        <>
          <div className="row" style={{ marginTop: 6 }}>
            <button type="button" className="btn grow" onClick={openTranslate}>Übersetzen …{missing ? ` (${missing} offen)` : ''}</button>
          </div>
          {!has && <div className="row"><button type="button" className="btn grow" onClick={() => insertLangSwitch()}>Sprachumschalter einsetzen</button></div>}
          <div className="field-hint">
            Oben in der Leiste schaltest du zwischen {lang.toUpperCase()} und {lang2.toUpperCase()} um und übersetzt Texte direkt auf der Seite.
            Noch nicht übersetzte Texte sind gestrichelt umrandet. Beim Export entsteht jede Seite zweimal (z. B. index.html und {lang2}.html).
            {!has && ' Mit dem Sprachumschalter wechseln Besucher zwischen den Sprachen.'}
          </div>
        </>
      )}
    </div>
  );
}

export function SiteFields() {
  const raw = useEditor(s => s.doc.site);
  const site = { ...defaultSite(), ...raw };
  const docName = useEditor(s => s.doc.name);
  return (
    <>
      <div className="field">
        <div className="field-label">Name der Website</div>
        <input className="textinput" value={site.name} placeholder={docName} onChange={e => setSite({ name: e.target.value }, 'name')} />
      </div>
      <div className="field">
        <div className="field-label">Sprache</div>
        <select className="select" value={site.lang} onChange={e => setSite({ lang: e.target.value }, 'lang')}>
          {LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          {!LANGS.some(([k]) => k === site.lang) && <option value={site.lang}>{site.lang}</option>}
        </select>
      </div>
      <SecondLangFields lang={site.lang} lang2={site.lang2 ?? null} />
      <div className="field">
        <div className="field-label">Adresse (optional)</div>
        <input className="textinput" value={site.url} placeholder="https://www.meine-seite.de" spellCheck={false}
          onChange={e => setSite({ url: e.target.value.trim() }, 'url')}
          onBlur={e => { const v = normalizeUrl(e.target.value); if (v !== e.target.value) setSite({ url: v }, 'url'); }} />
        <div className="field-hint">Wird für die Sitemap für Suchmaschinen gebraucht.</div>
      </div>
      <ImagePick label="Favicon" value={site.favicon} onChange={id => setSite({ favicon: id }, 'favicon')}
        hint="Das kleine Symbol im Browser-Tab. Ideal: quadratisch, mindestens 512 × 512 px (PNG oder SVG)." />
      <AnalyticsFields />
    </>
  );
}
