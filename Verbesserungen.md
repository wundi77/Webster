# Webster – Verbesserungsliste

Stand: 14.11.2026, nach Abschluss der Etappen 1–7 und der Punkte 1–8 dieser Liste.

## Vorgeschlagene Reihenfolge

| # | Punkt | Warum zuerst / Aufwand |
|---|-------|------------------------|
| 1 | ~~**Mobiles Menü**~~ ✅ erledigt (14.11.2026) | Kopfleiste mit Menü, ☰-Symbol pro Menü ab Tablet/Mobil, Vollbild-Menü, oben fixieren. |
| 2 | ~~**Kontaktformular**~~ ✅ erledigt (14.11.2026) | Öffnet das E-Mail-Programm der Besucher (mailto), Telefon/Betreff zuschaltbar, Adresse verschlüsselt, Datenschutz-Hinweis. Später möglich: echter Versand per PHP beim Webhoster. |
| 3 | ~~**Videos & Karten einbetten**~~ ✅ erledigt (14.11.2026) | YouTube, Vimeo, Google Maps, OpenStreetMap und eigene Videodateien (bis 25 MB). Fremde Inhalte laden erst nach Klick (eigenes Vorschaubild), Zustimmung gilt pro Besuch und Dienst; Datenschutz-Abschnitte per Knopf in der Prüfliste. |
| 4 | ~~**Icons & Vektorformen**~~ ✅ erledigt (14.11.2026) | Rund 2.000 Icons (Lucide) + 30 Social-Media-Logos mit deutscher Suche (I), eigene SVG-Dateien (bereinigt, einfärbbar), Linie/Pfeil (L, ⇧L), Dreieck, Vieleck, Stern. Farbe, Strichstärke, Hover-Farbe, als Link nutzbar. LinkedIn-Logo fehlt in der Sammlung (eigene SVG nutzen). Freies Zeichnen mit Kurven (Zeichenstift) bewusst noch nicht. |
| 4b | ~~**Projektverwaltung**~~ ✅ erledigt (14.11.2026) | Projekt als eigener Ordner (projekt.webster, bilder/, videos/), nur manuelles Speichern (⌘S + Symbol, „Seit x Min. ungesichert“), Notfallkopie + Warnung beim Schließen, Hinweis für Safari/Firefox (Chrome/Edge nötig), Verlauf-Fenster für Rückgängig (nur pro Sitzung). |
| 5 | ~~**Farbwähler & Verläufe**~~ ✅ erledigt (14.11.2026) | Eigenes Farbfenster für alle Farbfelder: Farbfeld + Regler, Pipette, Hex/RGB/HSL, Bibliotheks- und zuletzt benutzte Farben. Verläufe linear, kreisförmig und kegelförmig für Flächen, Text und Icons/Formen (kegelförmig nicht bei Icons/Formen). Verläufe in der Bibliothek, verknüpft (auch Hover). Nebenbei: Icons erscheinen jetzt auch in den Komponenten-Vorschaubildern. |
| 6 | ~~**Lineale & Hilfslinien**~~ ✅ erledigt (14.11.2026) | Lineale oben/links (⇧R), messen ab dem Board der Auswahl. Hilfslinien aus dem Lineal ziehen, gehören zum Board und werden im Projekt gespeichert; verschieben, Doppelklick für genaue Position, aufs Lineal ziehen zum Löschen. Ein-/ausblenden (⇧H) und sperren im Menü „Ansicht“. Spaltenraster pro Board (Spalten, Abstand, Rand, Farbe; eigene Werte für Tablet/Mobil, ⇧G). Ebenen rasten beim Verschieben und Größe ändern an Hilfslinien und Spaltenkanten ein (mit ⌥ beim Ziehen einer Hilfslinie ohne Einrasten). |
| 7 | ~~**Komponenten-Varianten**~~ ✅ erledigt (14.11.2026) | „Variante hinzufügen“ in der rechten Leiste (oder ⌘D auf einer Variante). Alle Varianten liegen nebeneinander in einem gestrichelten lila Rahmen neben dem Seiten-Board. Kopien schalten die Variante über eine Auswahl um; eigener Text, Bilder und Ausblenden bleiben, das Aussehen kommt von der neuen Variante. Assets zeigt eine Karte mit Varianten-Auswahl. Wird eine Variante gelöscht, wechseln ihre Kopien auf eine andere. Bekannte Grenze: Ebenen, die direkt in einer Kopie ergänzt wurden, gehen beim Umschalten verloren. |
| 8 | ~~**Fußzeile bei Zeilen-/Raster-Layout**~~ ✅ erledigt (14.11.2026) | Hat das Seiten-Board ein Layout, kommt alles Neue (Zeichnen, Einfügen, Ziehen, Videos, Formulare, Icons, Komponenten) vor die Fußzeile. Beim Hinzufügen eines Layouts wird die Fußzeile ans Ende sortiert. Untereinander rutscht sie bei kurzem Inhalt ganz nach unten, im Raster und in einer umbrechenden Reihe geht sie über die volle Breite. Erkannt wird sie am Namen „Fußzeile“. |
| 9 | ~~**Asymmetrisches Spaltenraster**~~ ✅ erledigt (15.11.2026) | Im Spaltenraster per Knopf „Jede Spalte einzeln einstellen“: eine Zeile pro Spalte mit Breite als Anteil (fr) oder fest in Pixeln, Spalten hinzufügen/entfernen. Pixel-Spalten werden zuerst abgezogen, der Rest nach Anteilen verteilt. Rand links und rechts getrennt einstellbar. Eigene Werte für Tablet/Mobil, Einrasten an allen Spaltenkanten wie bisher. |
| 10 | ~~**Claude-Code-Anbindung (MCP)**~~ ✅ erledigt (15.11.2026) | Kleine Brücke `bridge/webster-mcp.mjs` (in `.mcp.json` angemeldet, startet mit Claude Code im Webster-Ordner). Der Editor verbindet sich nur, wenn oben der Schalter „Claude“ an ist (Punkt grau = aus, orange = wartet, grün = verbunden); nur Verbindungen von diesem Rechner. Claude kann lesen (Seiten, Ebenen, Vorschau-HTML) und ändern (Ebenen anlegen/ändern/löschen, Code-Blöcke, Code der Website, Auswahl). Jeder Auftrag = ein Rückgängig-Schritt, kurze Meldung + grüner Rahmen um das Geänderte. Grenze: nur ein Claude-Code-Fenster gleichzeitig (Anschluss 5199). |
| 11 | ~~**Abstände beim Verschieben anzeigen**~~ ✅ erledigt (15.11.2026) | Rote Linien mit Pixelzahl zu den nächsten Nachbarn (oben, unten, links, rechts), sonst zum Board-Rand: beim Verschieben, beim Größe ändern, kurz nach Pfeiltasten-Schubsen und mit ⌥ gedrückt beim Darüberfahren (Abstand zur Ebene unter der Maus bzw. zum umgebenden Board). Gleiche Abstände werden erkannt, rasten ein und sind lila markiert; ⌘ beim Ziehen schaltet das Einrasten aus. Verschieben und Größe ändern mit der Maus erfolgen in ganzen Pixeln, Abstände werden ohne Nachkommastellen angezeigt. Nicht bei Ebenen innerhalb eines Layouts (dort ordnet das Layout). |
| 12 | ~~**Vorhandenen Text bearbeiten**~~ ✅ erledigt (15.11.2026) | Ursache: Der Doppelklick kam nicht beim Text an (die Arbeitsfläche „fing“ die Maus ein). Jetzt öffnet ein Doppelklick mit dem Auswahlwerkzeug den Text, ebenso ein Klick mit dem Textwerkzeug (T) auf einen vorhandenen Text – die Schreibmarke steht jeweils an der Klickstelle. Auf leerer Fläche legt T wie bisher einen neuen Text an. Eingabetaste öffnet den ausgewählten Text mit allem markiert (zum Überschreiben). |
| 13 | ~~**Eigener Code (JavaScript/CSS)**~~ ✅ erledigt (15.11.2026) | Geprüft und umgesetzt in drei Teilen: (1) **Code-Block** als neue Ebene (Prototyp-Reiter ohne Auswahl → „Code-Block einfügen“): HTML, CSS und JavaScript, läuft abgeschottet in einem eigenen Rahmen im Editor, in der Vorschau und auf der Website. (2) **Eigenes CSS pro Ebene** im Reiter „Code“ (z. B. Animation, Filter, Mischmodus), wirkt überall und hat Vorrang vor den Reglern. (3) **Code der Website** (Prototyp-Reiter ohne Auswahl): CSS für alle Seiten (im Editor wirken davon nur @keyframes/@font-face) sowie Code im Kopf und am Ende jeder Seite (nur Vorschau/Export, mit Datenschutz-Hinweis). Bewusst nicht umgesetzt: HTML/CSS in bearbeitbare Ebenen umwandeln (groß, nur bei einfachem Aufbau sinnvoll). |
| 14 | **Webster für andere bereitstellen (Optionen klären)** | Wie können andere Webster möglichst unkompliziert nutzen? (a) **Als Paket zum Installieren/Starten:** z. B. eigene Mac-/Windows-App per Doppelklick (Tauri oder Electron), alternativ ein Ordner mit Start-Datei; ein einfaches Öffnen der index.html per Doppelklick reicht technisch nicht. (b) **Als Webseite zum Aufrufen:** Webster als feste Adresse im Netz (z. B. Netlify, Vercel, GitHub Pages oder eigener Webspace); die Projekte bleiben dabei auf dem Rechner der Nutzer, nichts wird hochgeladen. Daraus lässt sich zusätzlich eine „installierbare Web-App“ machen (eigenes Symbol im Dock, startet wie ein Programm). Mit klären: nur Chrome/Edge (Ordner-Speichern), Updates verteilen, Kosten, Impressum/Datenschutz für die Webseite. Prüfung, Aufwand danach einschätzen. |

## Noch nicht geprüft (bei Gelegenheit testen)

- Als Datei speichern → wieder öffnen (vollständiger Durchlauf)
- Komponenten und Bilder aus dem Assets-Bereich auf die Arbeitsfläche ziehen
- Links zu einem Abschnitt und E-Mail-Links in Vorschau und Export
- Einblend-Animationen in der exportierten Website (im Test war das Browserfenster ausgeblendet)
- Pipette des Farbwählers (Klick auf einen Punkt am Bildschirm, im Test nicht ausgelöst)
- Kreisförmiger Verlauf bei nicht quadratischen Icons/Formen sieht etwas anders aus als bei Flächen (Kreis statt Oval)
- Kegelförmigen Bibliotheksverlauf aus „Assets“ auf ein Icon anwenden → wird dort als linearer Verlauf gezeigt
- Lineale im hellen Design
- Hilfslinien nach Speichern und erneutem Öffnen über den echten Ordner-Dialog
- Einrasten nur an Hilfslinien des eigenen Boards (nach letzter Anpassung nicht erneut im Browser getestet)
- Varianten: Karte aus „Assets“ mit gewählter Variante auf die Arbeitsfläche ziehen (nur per Programm getestet)
- Varianten über mehrere Seiten hinweg (Komponente auf Seite A, Kopie auf Seite B umschalten)
- Fußzeile in einer Reihe ohne Umbruch (steht dann neben dem Inhalt; Umbruch einschalten)
- Abstandsanzeige: ⌥ + Darüberfahren und ⌘ beim Ziehen nur per Programm getestet, nicht mit echter Taste
- Code-Block: JavaScript, das Links öffnet oder Formulare sendet, in der exportierten Website
- Varianten-Rahmen nach Speichern und erneutem Öffnen über den echten Ordner-Dialog

## Eigene Beobachtungen

_(Hier sammeln, was beim Ausprobieren auffällt – Fehler, Umständliches, Wünsche.)_

-
