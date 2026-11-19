// „Was ist neu“: Beim nächsten Besuch nach einer Änderung zeigt Webster neue Einträge einmal kurz an.
// Neuen Eintrag OBEN einfügen. id = Datum (JJJJ-MM-TT, bei mehreren am Tag mit -2, -3 …).
// Wer Webster zum ersten Mal öffnet, sieht nichts davon.

export interface NewsEntry { id: string; title: string; items: string[] }

export const NEWS: NewsEntry[] = [
  {
    id: '2026-11-19',
    title: 'Neu in Webster',
    items: [
      'Mit Claude verbinden: Der Knopf „Claude“ öffnet jetzt eine Anleitung. Jeder verbindet sein eigenes Claude.',
      'Fertige Abschnitte: Kopfbereiche, Vorteile, Preise, Fragen, Stimmen, Kontakt – mit einem Klick einfügen.',
      'Farbschemata mit Dunkel-Modus und einheitliche Abstände (S, M, L, XL).',
      'Neue Bausteine: Akkordeon, Reiter, Pop-up und Hinweis-Texte.',
      'Bilder: Großansicht per Klick, wichtiger Bildpunkt, Bildbeschreibung.',
      'Bewegung: Linien zeichnen sich selbst, Ebenen in die Tiefe staffeln, Animation beim Scrollen oder per Knopf.',
      'Seiten-Check im Menü „Datei“ und Besucher-Statistik ohne Cookies.',
    ],
  },
];

const SEEN_KEY = 'webster.newsSeen';

export function seenNews(): string | null {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}
export function markNewsSeen() {
  try { if (NEWS[0]) localStorage.setItem(SEEN_KEY, NEWS[0].id); } catch { /* egal */ }
}
/** Einträge, die diese Person noch nicht gesehen hat */
export function unseenNews(seen: string | null): NewsEntry[] {
  return seen ? NEWS.filter(n => n.id > seen) : NEWS;
}
