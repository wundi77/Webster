// Pflichtseiten (Impressum, Datenschutz): Vorlagen, Fußzeile mit Links, Prüfung vor dem Veröffentlichen.
// Hinweis: Die Vorlagen sind Gliederungen zum Ausfüllen – keine Rechtsberatung.
import type { Breakpoint, Page, WDocument, WNode } from './types';
import { createNode, createPage, defaultTextStyle, makeFill, makeLayout, BREAKPOINTS } from './factory';
import { resolveNode } from './resolve';
import { cloneFromMain } from './components';
import { allPages } from './pageRules';
import { siteRoot } from '../export/html';
import { useEditor } from '../store';

export type LegalKind = 'impressum' | 'datenschutz';

export const LEGAL: Record<LegalKind, { name: string; match: RegExp }> = {
  impressum: { name: 'Impressum', match: /impressum|imprint/i },
  datenschutz: { name: 'Datenschutz', match: /datenschutz|privacy/i },
};

export { FOOTER_NAME } from './css';
import { FOOTER_NAME } from './css';

export const findLegalPage = (doc: WDocument, kind: LegalKind) => doc.pages.find(p => LEGAL[kind].match.test(p.name));

/** Häufigste Schrift der Startseite (damit die Vorlagen zum Design passen) */
export function mainFont(doc: WDocument): string {
  const count = new Map<string, number>();
  for (const p of doc.pages) for (const id in p.nodes) {
    const f = p.nodes[id].textStyle?.fontFamily;
    if (f) count.set(f, (count.get(f) ?? 0) + (p.nodes[id].text?.length ?? 1));
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Inter';
}

function text(font: string, t: string, size: number, weight: number, extra: Partial<WNode> = {}): WNode {
  return createNode('text', {
    name: t.split('\n')[0].slice(0, 40), text: t, sizingH: 'fill', sizingV: 'auto',
    textStyle: { ...defaultTextStyle(), fontFamily: font, fontSize: size, fontWeight: weight, lineHeight: size > 24 ? 1.2 : 1.55 },
    ...extra,
  });
}

function sections(kind: LegalKind, doc: WDocument): [string, string][] {
  if (kind === 'impressum') return [
    ['Angaben gemäß § 5 DDG', '[Vorname Nachname oder Firmenname]\n[Straße Hausnummer]\n[PLZ Ort]'],
    ['Kontakt', 'Telefon: [Telefonnummer]\nE-Mail: [E-Mail-Adresse]'],
    ['Umsatzsteuer-ID', 'Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:\n[USt-IdNr. – diesen Abschnitt löschen, falls du keine hast]'],
    ['Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV', '[Name und Anschrift – nur nötig bei journalistisch-redaktionellen Inhalten, z. B. einem Blog mit Nachrichten. Sonst diesen Abschnitt löschen.]'],
  ];
  const selfHost = doc.site?.selfHostFonts ?? true;
  return [
    ['1. Verantwortliche Stelle', 'Verantwortlich für die Datenverarbeitung auf dieser Website ist:\n[Vorname Nachname oder Firmenname]\n[Straße Hausnummer, PLZ Ort]\nE-Mail: [E-Mail-Adresse]'],
    ['2. Hosting und Server-Logfiles', 'Diese Website wird bei [Name und Anschrift deines Webhosters] betrieben. Beim Aufruf der Seiten speichert der Server automatisch Informationen in sogenannten Server-Logfiles, z. B. IP-Adresse, Datum und Uhrzeit, aufgerufene Seite und verwendeter Browser. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren und stabilen Betrieb). [Speicherdauer laut deinem Webhoster ergänzen]'],
    ['3. Cookies und Analyse', 'Diese Website setzt keine Cookies und verwendet keine Analyse- oder Tracking-Werkzeuge.'],
    ['4. Schriftarten', selfHost
      ? 'Die Schriftarten dieser Website sind lokal eingebunden. Beim Aufruf der Seiten wird keine Verbindung zu Servern Dritter (z. B. Google) aufgebaut.'
      : 'Diese Website lädt Schriftarten von Google Fonts (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland). Dabei wird Ihre IP-Adresse an Google übertragen. [Prüfen! Empfehlung: Beim Export „Schriften mitliefern“ einschalten und diesen Abschnitt anpassen.]'],
    ['5. Kontakt per E-Mail', 'Wenn Sie uns per E-Mail kontaktieren, verarbeiten wir Ihre Angaben, um die Anfrage zu bearbeiten (Art. 6 Abs. 1 lit. b bzw. f DSGVO). Die Daten werden gelöscht, sobald sie dafür nicht mehr benötigt werden.'],
    ['6. Ihre Rechte', 'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO). Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren.'],
  ];
}

/** Legt eine Vorlage-Seite an (gibt die Seiten-ID zurück) */
export function createLegalPage(kind: LegalKind): string {
  const doc = useEditor.getState().doc;
  const existing = findLegalPage(doc, kind);
  if (existing) return existing.id;
  const font = mainFont(doc);
  const page = createPage(LEGAL[kind].name);
  const add = (n: WNode, parent?: WNode) => {
    page.nodes[n.id] = n;
    n.parentId = parent?.id ?? null;
    if (parent) parent.children.push(n.id); else page.rootIds.push(n.id);
    return n;
  };
  const root = add(createNode('board', {
    name: 'Desktop', w: 1440, h: 900, site: true, sizingV: 'auto',
    layout: { ...makeLayout('flex', 'column'), gap: 0, padding: [0, 0, 0, 0] },
  }));
  const area = add(createNode('board', {
    name: 'Bereich', sizingH: 'fill', sizingV: 'auto', fills: [], clip: false,
    layout: { ...makeLayout('flex', 'column'), gap: 0, padding: [96, 120, 96, 120] },
  }), root);
  area.overrides = { mobile: { layout: { ...area.layout!, padding: [48, 20, 48, 20] } } };
  const content = add(createNode('board', {
    name: 'Inhalt', sizingH: 'fill', sizingV: 'auto', maxW: 760, fills: [], clip: false,
    layout: { ...makeLayout('flex', 'column'), gap: 28, padding: [0, 0, 0, 0] },
  }), area);
  add(text(font, kind === 'impressum' ? 'Impressum' : 'Datenschutzerklärung', 44, 700, { name: 'Überschrift' }), content);
  add(createNode('text', {
    name: 'Hinweis (vor dem Veröffentlichen löschen)', sizingH: 'fill', sizingV: 'auto',
    text: '[Vorlage: Ersetze alle Angaben in eckigen Klammern und lösche diesen Hinweis. Das ist keine Rechtsberatung – prüfe die Angaben im Zweifel mit einem Generator deines Webhosters oder einer Fachperson.]',
    fills: [makeFill('#B54708')],
    textStyle: { ...defaultTextStyle(), fontFamily: font, fontSize: 14, lineHeight: 1.5, italic: true },
  }), content);
  for (const [h, body] of sections(kind, doc)) {
    const sec = add(createNode('board', {
      name: h.slice(0, 40), sizingH: 'fill', sizingV: 'auto', fills: [], clip: false,
      layout: { ...makeLayout('flex', 'column'), gap: 6, padding: [0, 0, 0, 0] },
    }), content);
    add(text(font, h, 20, 700, { name: 'Zwischenüberschrift' }), sec);
    add(text(font, body, 16, 400, { name: 'Text' }), sec);
  }
  useEditor.getState().mutate((_, d) => { d.pages.push(page); });
  return page.id;
}

/** Hat jede Webseite einen Link auf die Seite? */
export function pagesMissingLink(doc: WDocument, targetId: string): Page[] {
  return doc.pages.filter(p => p.id !== targetId && siteRoot(p) && !Object.values(p.nodes).some(n => n.link?.type === 'page' && n.link.pageId === targetId));
}

const BPS: Breakpoint[] = ['desktop', 'tablet', 'mobile'];
const FOOT_H = 72;

/** Fußzeile mit © und Links zu Impressum/Datenschutz – auf allen Seiten (als Komponente) */
export function addLegalFooter(): number {
  const s = useEditor.getState();
  const doc = s.doc;
  const imp = findLegalPage(doc, 'impressum');
  const ds = findLegalPage(doc, 'datenschutz');
  if (!imp && !ds) return 0;
  const font = mainFont(doc);
  const year = new Date().getFullYear();
  const owner = doc.site?.name || doc.name;

  // Bestehende Fußzeile (Hauptkomponente) wiederverwenden
  let mainPage = allPages(doc).find(p => Object.values(p.nodes).some(n => n.isMain && n.name === FOOTER_NAME));
  let count = 0;
  // Nur Seiten, auf denen noch ein Link fehlt (keine doppelten Fußzeilen)
  const need = new Set([imp, ds].filter(Boolean).flatMap(t => pagesMissingLink(doc, t!.id).map(p => p.id)));
  if (!need.size) return 0;
  s.mutate((_, d) => {
    const targets = d.pages.filter(p => siteRoot(p) && need.has(p.id));
    if (!targets.length) return;
    let mainId: string | null = mainPage ? Object.values(allPages(d).find(p => p.id === mainPage!.id)!.nodes).find(n => n.isMain && n.name === FOOTER_NAME)!.id : null;
    let pm = mainPage ? allPages(d).find(p => p.id === mainPage!.id)! : null;

    const place = (pg: Page, foot: WNode) => {
      const root = siteRoot(pg)!;
      const r = pg.nodes[root.id];
      foot.parentId = r.id;
      r.children.push(foot.id);
      if (r.layout) {
        foot.absolute = false; foot.sizingH = 'fill'; foot.sizingV = 'auto';
      } else {
        foot.sizingV = 'fixed'; foot.h = FOOT_H;
        // Ohne Layout: unten anhängen und das Board verlängern – je Bildschirmgröße
        for (const bp of BPS) {
          const rb = resolveNode(r, bp);
          if (bp === 'desktop') { foot.x = 0; foot.y = rb.h; foot.w = rb.w; foot.sizingH = 'fixed'; }
          else {
            foot.overrides ??= {};
            foot.overrides[bp] = { ...foot.overrides[bp], x: 0, y: rb.h, w: BREAKPOINTS.find(b => b.id === bp)!.width ?? rb.w };
          }
        }
        r.h += FOOT_H;
        for (const bp of ['tablet', 'mobile'] as const) if (r.overrides?.[bp]?.h !== undefined) r.overrides[bp]!.h = (r.overrides[bp]!.h as number) + FOOT_H;
      }
    };

    for (const pg of targets) {
      const has = Object.values(pg.nodes).some(n => (n.isMain && n.name === FOOTER_NAME) || (n.componentId && n.componentId === mainId));
      if (has) continue;
      if (!mainId) {
        // Original auf eigenem Komponenten-Board anlegen
        const cp = createPage(FOOTER_NAME);
        const foot = createNode('board', {
          name: FOOTER_NAME, isMain: true, w: 1440, h: FOOT_H, sizingV: 'auto', fills: [makeFill('#F2F2F3')],
          layout: { ...makeLayout('flex', 'row'), wrap: true, gap: 24, rowGap: 8, padding: [24, 120, 24, 120], align: 'center' },
        });
        foot.overrides = { mobile: { layout: { ...foot.layout!, padding: [20, 20, 20, 20] } } };
        cp.nodes[foot.id] = foot;
        const mk = (t: string, link?: WNode['link']) => {
          const n = createNode('text', {
            name: t, text: t, parentId: foot.id, link,
            fills: [makeFill('#555555')],
            textStyle: { ...defaultTextStyle(), fontFamily: font, fontSize: 14 },
            hover: link ? { fills: [makeFill('#111111')] } : undefined,
          });
          cp.nodes[n.id] = n;
          foot.children.push(n.id);
        };
        mk(`© ${year} ${owner}`);
        if (imp) mk('Impressum', { type: 'page', pageId: imp.id });
        if (ds) mk('Datenschutz', { type: 'page', pageId: ds.id });
        cp.rootIds = [foot.id];
        (d.componentPages ??= []).push(cp);
        mainId = foot.id;
        pm = cp;
      }
      {
        const id = cloneFromMain(pg, pm!, mainId, null, true);
        const inst = pg.nodes[id];
        place(pg, inst);
        // Breite/Größenverhalten hängen vom Board der jeweiligen Seite ab
        inst.touched = ['sizingH', 'sizingV', 'h', 'absolute', 'w', 'tablet.w', 'mobile.w'];
      }
      count++;
    }
  });
  return count;
}

export interface LegalStatus {
  kind: LegalKind;
  page: Page | undefined;
  missingLinks: Page[];
  placeholders: boolean;
}

export function legalStatus(doc: WDocument): LegalStatus[] {
  return (['impressum', 'datenschutz'] as LegalKind[]).map(kind => {
    const page = findLegalPage(doc, kind);
    return {
      kind, page,
      missingLinks: page ? pagesMissingLink(doc, page.id) : [],
      placeholders: !!page && Object.values(page.nodes).some(n => n.type === 'text' && /\[[^\]]+\]/.test(n.text ?? '')),
    };
  });
}

/** Seiten, auf denen noch Platzhalter in [eckigen Klammern] stehen */
export function pagesWithPlaceholders(doc: WDocument): Page[] {
  return doc.pages.filter(p => siteRoot(p) && Object.values(p.nodes).some(n => n.type === 'text' && /\[[^\]]+\]/.test(n.text ?? '')));
}

/** Passt der Abschnitt „Schriftarten“ der Datenschutzerklärung noch zur Export-Einstellung? */
export function fontPolicyMismatch(doc: WDocument, usesWebFonts: boolean): 'says-local' | 'says-google' | null {
  const page = findLegalPage(doc, 'datenschutz');
  if (!page || !usesWebFonts) return null;
  const txt = Object.values(page.nodes).map(n => n.text ?? '').join(' ');
  const selfHost = doc.site?.selfHostFonts ?? true;
  if (!selfHost && /lokal eingebunden/i.test(txt)) return 'says-local';
  if (selfHost && /Google Fonts/i.test(txt)) return 'says-google';
  return null;
}
