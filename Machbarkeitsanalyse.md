# Machbarkeitsanalyse: Penpot-artiger Webbaukasten in Claude Code

Stand: 14.11.2026

## 1. Kurzfazit

**Machbar, aber nicht als 1:1-Kopie von Penpot, und es läuft nicht „in“ Claude Code, sondern daneben.**

- Claude Code ist eine Entwicklungsumgebung, keine Oberfläche für grafische Apps. Ich kann die Anwendung hier **bauen, starten und testen**. Du benutzt sie dann als lokale Web-App im Browser-Fenster der Claude-App oder in Chrome (optional später als eigenständige Mac-App).
- Eine **exakte 1:1-Kopie** von Penpot ist nicht sinnvoll: Penpot ist das Ergebnis von über 10 Jahren Arbeit eines ganzen Teams (ClojureScript + Rust/WebAssembly-Renderer, Server, Datenbank, Echtzeit-Zusammenarbeit). Penpot ist außerdem Open Source (MPL-2.0), du kannst also das Original selbst lokal betreiben.
- Der wichtigere Punkt: **Penpot ist ein Design-Werkzeug, kein Webseiten-Baukasten.** Es zeichnet Entwürfe, erzeugt aber keine fertigen, hostbaren Webseiten. Was du beschreibst (gestalten → testen → ohne Code exportieren → hosten), entspricht eher **Webflow oder Framer, mit einer Penpot-ähnlichen Bedienung**. Genau so etwas lässt sich hier realistisch bauen.

## 2. Zum Penpot-MCP

In dieser Sitzung sind **keine Penpot-MCP-Werkzeuge verbunden**. Der Penpot-MCP besteht aus zwei Teilen: dem Plugin im Browser und einem lokalen MCP-Server, der zusätzlich in Claude Code eingetragen sein muss. Der zweite Teil fehlt hier.
Für die Analyse ist das kein Hindernis: Werkzeuge und Aufbau von Penpot sind öffentlich dokumentiert und mir bekannt. Für die spätere Umsetzung wäre die Verbindung trotzdem nützlich, etwa um Penpot-Dateien zu importieren.

## 3. Was Penpot bietet und wie machbar das jeweils ist

| Bereich | Penpot-Funktion | Machbarkeit im eigenen Tool |
|---|---|---|
| Arbeitsfläche | Unendliche Fläche, Zoom, Pan, Lineale, Hilfslinien, Raster, Snapping, Abstandsanzeige | ✅ gut machbar |
| Werkzeuge | Board/Frame, Rechteck, Ellipse, Text, Bild, Pfad/Stift, Kurve | ✅ (Pfad-/Bezier-Editor 🟡 aufwendig) |
| Ebenen | Ebenenbaum, Gruppen, Sperren, Ausblenden, Umbenennen, Reihenfolge | ✅ |
| Design-Panel | X/Y/B/H, Drehung, Radien, Füllung, Kontur, Schatten, Unschärfe, Deckkraft, Mischmodi | ✅ pixelgenau |
| Layout | Flex-Layout, Grid-Layout, Constraints, Auto-Größe | ✅ (im eigenen Tool sogar **echtes** CSS-Flex/Grid) |
| Typografie | Schriften (Google Fonts + eigene), Zeilenhöhe, Laufweite, Textstile | ✅ |
| Farben | Farbwähler, Verläufe, Farbbibliotheken | ✅ |
| Assets | Komponenten, Farben, Typografien, Bilder; gemeinsame Bibliotheken | ✅ |
| Komponenten | Haupt-Komponente, Instanzen, Überschreibungen, Varianten | 🟡 machbar, logisch anspruchsvoll |
| Design-Tokens | Tokens/Themes (W3C-Format) | ✅ (werden direkt zu CSS-Variablen) |
| Prototyping | Interaktionen, Flows, Übergänge, Vorschau | ✅ als echte Links und Animationen |
| Inspect/Code | CSS/SVG/HTML-Ansicht | ✅ und besser, weil der Export echter Code ist |
| Export | PNG/JPG/SVG/PDF | ✅ |
| Verlauf | Rückgängig/Wiederholen, Versionen | ✅ |
| Zusammenarbeit | Echtzeit mit mehreren Personen, Kommentare, Teams | 🔴 sehr aufwendig, für eine Einzelperson unnötig (weglassen) |
| Plugins/API | Plugin-System | 🔴 weglassen |

## 4. Was über Penpot hinausgeht (dein eigentliches Ziel)

| Funktion | Machbarkeit |
|---|---|
| Responsive Breakpoints (Desktop/Tablet/Handy) mit eigenen Werten | ✅ |
| Mehrere Seiten, Navigation, SEO-Angaben (Titel, Beschreibung, Social-Vorschaubild) | ✅ |
| Interaktionen: Hover-Zustände, Animationen, Scroll-Effekte, Menüs, Akkordeons, Slider | ✅ |
| Formulare (Kontakt) | ✅ über externe Dienste (z. B. Formspree, Netlify Forms) |
| Export als **statisches HTML5 + CSS + JS** (läuft auf jedem Webspace) | ✅ Kernfunktion |
| Export als **Tailwind CSS**-Projekt | ✅ |
| Export als **React/Next.js**-Projekt | ✅ |
| Bildoptimierung (WebP/AVIF, responsive Größen, Lazy Loading) | ✅ |
| Ein-Klick-Veröffentlichung (Netlify, Vercel, Cloudflare Pages, GitHub Pages, FTP) | ✅ technisch. Das Konto und die Zugangsdaten richtest **du** ein, das darf ich nicht übernehmen |
| CMS/Blog mit Datenbank, Login, Shop | 🔴 eigenes Großprojekt, nicht im ersten Umfang |

Hinweis: Ein „HTML2“ gibt es nicht, der aktuelle Standard ist HTML5 (Living Standard). Den unterstützen alle Exporte.

## 5. Der entscheidende Architektur-Punkt

Penpot zeichnet Formen (SVG/WebAssembly), und Code entsteht erst nachträglich als Annäherung. Für einen Webseiten-Baukasten ist das ungünstig.

**Empfehlung:** Die Arbeitsfläche besteht aus **echten HTML-Elementen mit echtem CSS**. Damit:

- ist die Darstellung im Editor exakt die spätere Webseite (pixelgenau, keine Abweichung zwischen Entwurf und Ergebnis),
- funktionieren Flex, Grid, Schriften und Animationen genau wie im Browser,
- ist der Export eine direkte Übersetzung und keine Schätzung.

**Technik:** React + TypeScript + Vite für den Editor, Zustandsverwaltung mit Undo/Redo, Projekte als JSON-Dateien im Projektordner (lokal, ohne Server und Datenbank). Exporter für HTML/CSS, Tailwind und React. Alles läuft lokal auf deinem Mac (Node 24 ist installiert).

## 6. Optionen im Vergleich

| Option | Beschreibung | Aufwand | Ergebnis |
|---|---|---|---|
| **A. Penpot selbst betreiben** | Original-Penpot per Docker lokal | sehr gering | 100 % Penpot, aber kein Webseiten-Export und kein Hosting |
| **B. Penpot + Claude als Übersetzer** | Du gestaltest weiter in Penpot, ich setze den Entwurf über den MCP in eine fertige Webseite um und stelle sie bereit | gering | Schnell nutzbar, aber jede Umsetzung läuft über mich und nicht per Knopfdruck |
| **C. Eigener Baukasten (empfohlen)** | Penpot-ähnliche Bedienung, echte HTML/CSS-Fläche, Export und Hosting eingebaut | hoch, schrittweise | Genau dein Ziel: gestalten, testen, exportieren, hosten ohne Code |
| C+ Abkürzung | Wie C, aber auf einer bestehenden Open-Source-Engine aufgebaut (z. B. GrapesJS, BSD-Lizenz) | mittel | Schneller am Ziel, weniger Kontrolle über die Bedienung |

## 7. Vorgehen für Option C (in Etappen, jede einzeln nutzbar)

1. **Grundgerüst:** Editor-Oberfläche wie Penpot (Werkzeugleiste, Ebenen links, Design-Panel rechts), Arbeitsfläche mit Zoom/Pan, Rechteck/Text/Bild/Board, Auswählen/Verschieben/Größe ändern, Undo/Redo, Speichern
2. **Pixelgenaues Design-Panel:** Maße, Füllungen, Konturen, Radien, Schatten, Typografie, Google Fonts, Snapping, Hilfslinien
3. **Layout:** Flex und Grid, Breakpoints für Desktop/Tablet/Handy
4. **Assets & Komponenten:** Farben, Textstile, Bilder, Komponenten mit Instanzen und Überschreibungen, Design-Tokens
5. **Interaktionen & Vorschau:** Seiten, Links, Hover, Animationen, Live-Vorschau in echten Gerätegrößen
6. **Export:** HTML5/CSS/JS, Tailwind, React/Next.js, Bildoptimierung, SEO
7. **Veröffentlichen:** Ein-Klick-Deployment (z. B. Netlify oder Vercel), FTP-Export
8. Optional: Import von Penpot-Dateien, Vorlagen, Pfad-Werkzeug, Desktop-App

Realistisch ist **jede Etappe ein bis mehrere Arbeitssitzungen**. Nach Etappe 1 bis 2 hast du schon ein benutzbares Werkzeug, nach Etappe 6 kannst du komplette Webseiten exportieren.

## 8. Risiken & Grenzen

- **Umfang:** Der größte Risikofaktor. Gegenmittel sind feste Etappen und frühes Ausprobieren durch dich.
- **Feinschliff:** Die Bedienung eines Profi-Werkzeugs (Tastenkürzel, Snapping-Gefühl, Mehrfachauswahl) braucht Iterationen mit deinem Feedback.
- **Keine Echtzeit-Zusammenarbeit**, kein Plugin-System, zunächst kein CMS/Shop.
- **Hosting-Konten** und Zugangsdaten legst du selbst an. Ich richte danach die Veröffentlichung ein.
- **Rechtlich:** Bedienkonzept und Funktionsumfang nachzubauen ist unproblematisch. Penpots Logo, Namen und Grafiken übernehmen wir nicht, die App bekommt einen eigenen Namen.

## 9. Empfehlung

**Option C**, aufgebaut als lokale Web-App mit echter HTML/CSS-Arbeitsfläche, Penpot-ähnlicher Bedienung und eingebautem Export und Hosting. Als Start eignet sich Etappe 1 (Grundgerüst), damit du früh siehst und testest, ob die Richtung stimmt.
