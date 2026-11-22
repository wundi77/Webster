// Website in zwei Sprachen: Die Hauptsprache steht wie immer in den Ebenen (text, alt).
// Übersetzungen liegen daneben in tr / altTr (je Sprachkürzel), Seitennamen und Suchmaschinen-Angaben in page.tr.
// Reine Hilfsfunktionen ohne Editor-Zustand (auch für Export und Vorschau).
import type { Page, WDocument, WNode } from './types';
import { dayText, HOURS_TEXTS_DE } from './hoursCore';

/** Sprachen, die als zweite Sprache angeboten werden (nur solche, für die Webster eigene Texte wie „Jetzt geöffnet“ kennt) */
export const ALL_LANGS: { code: string; label: string }[] = [
  { code: 'de', label: 'Deutsch' }, { code: 'en', label: 'Englisch' }, { code: 'fr', label: 'Französisch' }, { code: 'it', label: 'Italienisch' },
  { code: 'es', label: 'Spanisch' }, { code: 'nl', label: 'Niederländisch' },
];
export const langLabel = (code: string) => ALL_LANGS.find(l => l.code === code)?.label ?? code.toUpperCase();

export const mainLang = (doc: WDocument) => doc.site?.lang || 'de';
export const secondLang = (doc: WDocument): string | null => {
  const l = doc.site?.lang2;
  return l && l !== mainLang(doc) ? l : null;
};

/** Hat diese Ebene Text, der übersetzt werden sollte? (Platzhalter, Symbole und reine Zahlen nicht) */
export function needsTranslation(n: WNode): boolean {
  if (n.type !== 'text' || n.langSwitch || n.openBadge || n.visible === false) return false;
  const t = (n.text ?? '').trim();
  return /\p{L}{2,}/u.test(t);
}

/**
 * Texte in einer Öffnungszeiten-Tabelle (Wochentag und Uhrzeit), die Webster in der zweiten Sprache selbst schreibt.
 * Eigene Übersetzungen (tr) haben trotzdem Vorrang.
 */
const autoCache = new WeakMap<Page, Map<string, { day: number; time: boolean; board: WNode }>>();
export function hoursAuto(page: Page) {
  let m = autoCache.get(page);
  if (m) return m;
  m = new Map();
  for (const id in page.nodes) {
    const b = page.nodes[id];
    if (!b.hours) continue;
    b.children.forEach((rid, i) => {
      const texts = (page.nodes[rid]?.children ?? []).map(c => page.nodes[c]).filter(c => c?.type === 'text');
      if (texts[0]) m!.set(texts[0].id, { day: i, time: false, board: b });
      if (texts[1]) m!.set(texts[1].id, { day: i, time: true, board: b });
    });
  }
  autoCache.set(page, m);
  return m;
}
function autoText(a: { day: number; time: boolean; board: WNode }, lang: string): string | undefined {
  const ui = uiTexts(lang);
  if (!a.time) { const d = ui.hours.days[a.day]?.replace(/^(el|le|il) /, ''); return d ? d[0].toUpperCase() + d.slice(1) : undefined; }
  const day = a.board.hours?.days[a.day];
  return day ? dayText(day, ui.closedDay, ui.clock, ui.and) : undefined;
}

const cache = new WeakMap<Page, Map<string, Page>>();
/**
 * Seite in der zweiten Sprache: Texte und Bildbeschreibungen werden ersetzt.
 * Fehlt eine Übersetzung, bleibt der Text der Hauptsprache stehen (markUntranslated → zum Hervorheben im Editor).
 */
export function translatePage(page: Page, lang: string, main: string, markUntranslated = false): Page {
  const key = `${lang}|${main}|${markUntranslated ? 1 : 0}`;
  let m = cache.get(page);
  const hit = m?.get(key);
  if (hit) return hit;
  const nodes: Record<string, WNode> = {};
  const auto = hoursAuto(page);
  for (const id in page.nodes) {
    const n = page.nodes[id];
    const au = auto.get(id);
    const t = n.tr?.[lang] ?? (au ? autoText(au, lang) : undefined);
    const a = n.altTr?.[lang];
    if (n.langSwitch) nodes[id] = { ...n, text: main.toUpperCase() };
    else if (t !== undefined || a !== undefined) nodes[id] = { ...n, ...(t !== undefined ? { text: t } : {}), ...(a !== undefined ? { alt: a } : {}) };
    else if (markUntranslated && needsTranslation(n)) nodes[id] = { ...n, untranslated: true };
    else nodes[id] = n;
  }
  const tr = page.tr?.[lang];
  const out: Page = { ...page, nodes, name: tr?.name || page.name, seo: page.seo ? { ...page.seo, title: tr?.title ?? '', description: tr?.description ?? '' } : page.seo };
  if (!m) { m = new Map(); cache.set(page, m); }
  m.set(key, out);
  return out;
}

/** Fehlende Übersetzungen (für Prüfliste und Übersetzen-Fenster) */
export function missingTranslations(doc: WDocument, lang: string): number {
  let c = 0;
  for (const p of [...doc.pages, ...(doc.componentPages ?? [])]) for (const id in p.nodes) {
    const n = p.nodes[id];
    if (n.componentId && n.mainId && !n.isMain && !(n.touched ?? []).includes('text')) continue; // Kopie: zählt beim Original
    if (needsTranslation(n) && !n.tr?.[lang]?.trim() && !hoursAuto(p).has(id)) c++;
  }
  return c;
}

/** Dateiname einer Seite in der zweiten Sprache: index.html → en.html, kontakt.html → kontakt-en.html */
export const langFile = (file: string, lang: string) => (file === 'index.html' ? `${lang}.html` : file.replace(/\.html$/, `-${lang}.html`));

// ---------- Texte, die Webster selbst auf die Website schreibt ----------

export interface UiTexts {
  hours: typeof HOURS_TEXTS_DE;
  /** {what} = Karte/Video, {service} = Anbieter */
  load: string; map: string; video: string;
  dataNote: string; privacy: string; openOn: string;
  formSent: string;
  /** Öffnungszeiten-Tabelle: „geschlossen“, „und“, „Uhr“ */
  closedDay: string; and: string; clock: string;
}
const DE: UiTexts = {
  hours: HOURS_TEXTS_DE, load: '{what} von {service} laden', map: 'Karte', video: 'Video',
  dataNote: 'Beim Laden werden Daten an {service} übertragen.', privacy: 'Datenschutz', openOn: 'Auf {service} öffnen',
  formSent: 'Ihr E-Mail-Programm wurde geöffnet – bitte senden Sie die Nachricht dort ab.',
  closedDay: 'geschlossen', and: 'und', clock: 'Uhr',
};
const UI: Record<string, UiTexts> = {
  de: DE,
  en: {
    hours: { open: 'Open now · until {t}', closed: 'Closed now · opens {w} at {t}', closedPlain: 'Closed now', today: 'today', tomorrow: 'tomorrow', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
    load: 'Load {what} from {service}', map: 'map', video: 'video', dataNote: 'Loading sends data to {service}.', privacy: 'Privacy', openOn: 'Open on {service}',
    formSent: 'Your email app has opened – please send the message from there.',
    closedDay: 'closed', and: 'and', clock: '',
  },
  fr: {
    hours: { open: 'Ouvert · jusqu’à {t}', closed: 'Fermé · ouvre {w} à {t}', closedPlain: 'Fermé', today: 'aujourd’hui', tomorrow: 'demain', days: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] },
    load: 'Charger la {what} de {service}', map: 'carte', video: 'vidéo', dataNote: 'Le chargement transmet des données à {service}.', privacy: 'Confidentialité', openOn: 'Ouvrir sur {service}',
    formSent: 'Votre messagerie s’est ouverte – envoyez le message depuis celle-ci.',
    closedDay: 'fermé', and: 'et', clock: '',
  },
  es: {
    hours: { open: 'Abierto · hasta las {t}', closed: 'Cerrado · abre {w} a las {t}', closedPlain: 'Cerrado', today: 'hoy', tomorrow: 'mañana', days: ['el lunes', 'el martes', 'el miércoles', 'el jueves', 'el viernes', 'el sábado', 'el domingo'] },
    load: 'Cargar {what} de {service}', map: 'mapa', video: 'vídeo', dataNote: 'Al cargar se envían datos a {service}.', privacy: 'Privacidad', openOn: 'Abrir en {service}',
    formSent: 'Se ha abierto tu programa de correo: envía el mensaje desde allí.',
    closedDay: 'cerrado', and: 'y', clock: '',
  },
  it: {
    hours: { open: 'Aperto · fino alle {t}', closed: 'Chiuso · apre {w} alle {t}', closedPlain: 'Chiuso', today: 'oggi', tomorrow: 'domani', days: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'] },
    load: 'Carica {what} da {service}', map: 'mappa', video: 'video', dataNote: 'Il caricamento invia dati a {service}.', privacy: 'Privacy', openOn: 'Apri su {service}',
    formSent: 'Il tuo programma di posta si è aperto: invia il messaggio da lì.',
    closedDay: 'chiuso', and: 'e', clock: '',
  },
  nl: {
    hours: { open: 'Nu open · tot {t}', closed: 'Nu gesloten · opent {w} om {t}', closedPlain: 'Nu gesloten', today: 'vandaag', tomorrow: 'morgen', days: ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] },
    load: '{what} van {service} laden', map: 'Kaart', video: 'Video', dataNote: 'Bij het laden worden gegevens naar {service} gestuurd.', privacy: 'Privacy', openOn: 'Openen op {service}',
    formSent: 'Je e-mailprogramma is geopend – verstuur het bericht daar.',
    closedDay: 'gesloten', and: 'en', clock: '',
  },
};
export const uiTexts = (lang: string | undefined): UiTexts => UI[lang ?? 'de'] ?? UI.en;
export const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
