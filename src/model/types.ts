// Datenmodell von Webster. Ein Dokument besteht aus Seiten, eine Seite aus Ebenen (Nodes).
// Koordinaten (x, y) sind immer relativ zum Eltern-Element (Board) bzw. zur Arbeitsfläche.

export type NodeType = 'board' | 'rect' | 'ellipse' | 'text' | 'image' | 'vector';

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
  | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

/** axis 'x' = senkrechte Linie (Position von links), 'y' = waagerechte Linie (Position von oben) */
export interface BoardGuide { id: string; axis: 'x' | 'y'; pos: number }
export interface ColumnGrid {
  count: number; gutter: number; margin: number; color: string; opacity: number; visible: boolean;
  /** Unterschiedliche Spaltenbreiten (Anteil oder Pixel); fehlt = alle gleich breit */
  cols?: { unit: 'fr' | 'px'; value: number }[];
  /** Rand rechts, wenn er vom linken abweicht; fehlt = wie links */
  marginRight?: number;
}

export type GradientType = 'linear' | 'radial' | 'conic';
/** pos = Position 0–1 auf der Verlaufslinie */
export interface GradientStop { id: string; color: string; opacity: number; pos: number }
/** angle: Richtung (linear, 0 = nach oben, 90 = nach rechts) bzw. Startwinkel (kegelförmig) */
export interface Gradient { type: GradientType; angle: number; stops: GradientStop[] }

/**
 * colorRef = verknüpfte Farbe aus der Bibliothek (null/fehlt = eigene Farbe).
 * gradient = Farbverlauf statt einfarbig (color ist dann die erste Verlaufsfarbe als Ersatz);
 * gradientRef = verknüpfter Verlauf aus der Bibliothek.
 */
export interface Fill {
  id: string; color: string; opacity: number; visible: boolean; colorRef?: string | null;
  gradient?: Gradient | null; gradientRef?: string | null;
  /** Besondere Hintergründe: Video, Körnung (Rauschen), Glas (macht dahinter milchig) */
  kind?: FillKind;
  /** Bewegter Verlauf: Sekunden für eine Bewegung hin */
  move?: number;
  /** Video aus der Bibliothek */
  videoRef?: string | null;
  /** Körnung: 'fine' oder 'coarse' */
  grain?: 'fine' | 'coarse';
  /** Glas: Unschärfe dahinter in px */
  blur?: number;
}
export type FillKind = 'video' | 'grain' | 'glass';

export type StrokePosition = 'inside' | 'center' | 'outside';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export interface Stroke {
  id: string; color: string; opacity: number; width: number;
  position: StrokePosition; style: StrokeStyle; visible: boolean; colorRef?: string | null;
}

export interface Shadow {
  id: string; kind: 'drop' | 'inner'; x: number; y: number; blur: number; spread: number;
  color: string; opacity: number; visible: boolean; colorRef?: string | null;
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export interface TextStyle {
  fontFamily: string; fontSize: number; fontWeight: number;
  lineHeight: number; letterSpacing: number; textAlign: TextAlign;
  italic: boolean; decoration: 'none' | 'underline' | 'line-through';
  transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export type Radii = [number, number, number, number];
export type Padding = [number, number, number, number]; // oben, rechts, unten, links

/** fixed = feste Größe, fill = Platz im Layout ausfüllen, auto = an Inhalt anpassen */
export type Sizing = 'fixed' | 'fill' | 'auto';

export interface Track { unit: 'fr' | 'px' | 'auto'; value: number }

export type Justify = 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
export type AlignItems = 'start' | 'center' | 'end' | 'stretch';

export interface Layout {
  type: 'flex' | 'grid';
  direction: 'row' | 'column';   // Flex
  wrap: boolean;                  // Flex
  gap: number;                    // Spaltenabstand (bzw. Abstand in Hauptrichtung)
  rowGap: number;                 // Zeilenabstand
  padding: Padding;
  /** Abstands-Stufe (folgt den Stufen der Website), fehlt = eigener Wert */
  gapRef?: SpaceToken | null;
  padRef?: SpaceToken | null;
  justify: Justify;               // Flex: Verteilung in Hauptrichtung
  align: AlignItems;              // Ausrichtung quer bzw. vertikal (Grid)
  justifyItems: AlignItems;       // Grid: horizontale Ausrichtung in der Zelle
  columns: Track[];               // Grid
  rows: Track[];                  // Grid
  /** Grid: Spalten automatisch – so viele, wie bei dieser Mindestbreite (px) hineinpassen */
  colMin?: number | null;
  /** Grid: Mauerwerk – unterschiedlich hohe Kacheln laufen spaltenweise ineinander */
  masonry?: boolean;
}

export interface GridPlacement { col: number; row: number; colSpan: number; rowSpan: number } // 0 = automatisch

export type Breakpoint = 'desktop' | 'tablet' | 'mobile';

/** Klick-Ziel einer Ebene */
export type Link =
  | { type: 'page'; pageId: string }
  | { type: 'anchor'; nodeId: string }
  | { type: 'url'; url: string; newTab: boolean }
  | { type: 'email'; email: string }
  /** Startet eine eigene Animation auf der Seite */
  | { type: 'play'; nodeId: string }
  /** Öffnet ein Pop-up */
  | { type: 'popup'; nodeId: string };

/** Eigenschaften, die sich beim Überfahren mit der Maus ändern dürfen */
export const HOVER_KEYS = ['fills', 'strokes', 'shadows', 'opacity', 'blur', 'radius', 'radii', 'rotation', 'textStyle', 'lift', 'scale'] as const;
export type HoverKey = typeof HOVER_KEYS[number];

export type RevealType = 'fade' | 'up' | 'left' | 'zoom' | 'words' | 'count' | 'draw';
/** Erscheinen beim Scrollen. stagger: Elemente darin erscheinen nacheinander (Abstand in ms) */
export interface Reveal { type: RevealType; duration: number; delay: number; stagger?: number }

/** Bewegung beim Scrollen: amount je nach Art (Tiefe −100…100, Drehen in Grad, Wachsen in %) */
export type ScrollFxKind = 'depth' | 'rotate' | 'grow' | 'focus' | 'stack' | 'sideways';
/** Bewegung mit der Maus: amount = Stärke (Kippen in Grad, Magnet/Folgen in %) */
export type MouseFxKind = 'tilt' | 'magnet' | 'follow';
/** Dauernde Bewegung: speed = Sekunden pro Durchlauf, amount = Stärke */
export type LoopFxKind = 'marquee' | 'float' | 'pulse';
export interface Motion {
  scroll?: { kind: ScrollFxKind; amount: number } | null;
  mouse?: { kind: MouseFxKind; amount: number } | null;
  loop?: { kind: LoopFxKind; speed: number; amount: number; reverse?: boolean } | null;
}

/** Eigenschaften, die sich nach dem Scrollen ändern dürfen (z. B. kleinere Kopfzeile, anderes Logo) */
export const SCROLL_KEYS = [...HOVER_KEYS, 'w', 'h', 'layout', 'visible'] as const;
export type ScrollKey = typeof SCROLL_KEYS[number];

export type InteractionState = 'normal' | 'hover' | 'scrolled';

/**
 * Fixieren beim Scrollen.
 * sticky = läuft oben mit (nimmt weiter Platz ein, nur im Layout möglich),
 * fixed = bleibt an der Stelle im Fenster stehen und schwebt über dem Inhalt.
 * h/v = an welchem Fensterrand die Position gemessen wird; bottom = Abstand vom unteren Rand (bei v = 'bottom').
 */
export interface Pin { mode: 'sticky' | 'fixed'; h: 'left' | 'right'; v: 'top' | 'bottom'; bottom: number }

export interface WNode {
  id: string;
  type: NodeType;
  name: string;
  parentId: string | null;
  children: string[];
  x: number; y: number; w: number; h: number;
  sizingH: Sizing;
  sizingV: Sizing;
  minW: number | null; maxW: number | null; minH: number | null; maxH: number | null;
  rotation: number;
  opacity: number;
  blendMode: BlendMode;
  visible: boolean;
  locked: boolean;
  radius: number;
  radii: Radii | null;
  fills: Fill[];      // Index 0 = oberste Füllung
  strokes: Stroke[];
  shadows: Shadow[];
  blur: number;
  clip: boolean;      // Boards: Inhalt beschneiden
  /** Hilfslinien des Boards (nur im Editor; pos = Abstand vom linken bzw. oberen Rand des Boards in px) */
  guides?: BoardGuide[];
  /** Spaltenraster des Boards (nur im Editor, pro Breakpoint änderbar) */
  colGrid?: ColumnGrid | null;
  layout: Layout | null;            // Boards: Flex- oder Grid-Layout
  absolute: boolean;                // Im Layout: frei positioniert
  alignSelf: AlignItems | 'auto';   // Im Layout: eigene Ausrichtung
  grid: GridPlacement | null;       // Im Grid: Zellenposition
  site: boolean;                    // Oberstes Board: Webseite, folgt den Breakpoints
  text?: string;
  textStyle?: TextStyle;
  src?: string;
  /** Bild aus der Bibliothek */
  imageRef?: string;
  /** Verknüpfter Textstil aus der Bibliothek (null = gelöst) */
  textStyleRef?: string | null;
  /** HTML-Art des Textes beim Export (Überschrift 1–4, Absatz, normaler Text). Leer = automatisch (vom Textstil) */
  textTag?: TextTag | null;
  /** Hauptkomponente: dieses Board/diese Ebene ist das Original einer Komponente (Komponenten-ID = eigene ID) */
  isMain?: boolean;
  /** Varianten-Rahmen: Board, das mehrere Hauptkomponenten als Varianten einer Komponente enthält (Name = Komponentenname) */
  variantSet?: boolean;
  /** Hauptkomponente in einem Varianten-Rahmen: Name der Variante (z. B. „Primär“) */
  variantName?: string;
  /** Ebene in einer Variante: Kennung der entsprechenden Ebene in der ersten Variante (für den Wechsel an Kopien) */
  vkey?: string;
  /** Kopie (Instanz): oberste Ebene trägt die Komponenten-ID */
  componentId?: string;
  /** Kopie (Instanz): entsprechende Ebene im Original */
  mainId?: string;
  /** Kopie (Instanz): Eigenschaften, die bewusst vom Original abweichen (z. B. "text", "mobile.w") */
  touched?: string[];
  objectFit?: 'cover' | 'contain' | 'fill';
  /** Bildbeschreibung für Screenreader und Suchmaschinen ('' = reiner Schmuck, fehlt = Ebenenname) */
  alt?: string;
  /** Fokuspunkt beim Zuschneiden (0…1), Standard Mitte */
  focus?: { x: number; y: number } | null;
  /** Anheben in px (nur im Hover-Aussehen sinnvoll) */
  lift?: number;
  /** Vergrößern (1 = normal; nur im Hover-Aussehen sinnvoll) */
  scale?: number;
  /** Fährt die Maus über dieses Board, zeigen auch die Ebenen darin ihr Hover-Aussehen */
  hoverGroup?: boolean;
  /** Beim Klick groß zeigen (mehrere solche Bilder nebeneinander: Galerie zum Blättern) */
  zoom?: boolean;
  /** Klick führt zu Seite, Abschnitt, Webadresse oder E-Mail */
  link?: Link | null;
  /** Abweichungen beim Überfahren mit der Maus */
  hover?: Partial<Pick<WNode, HoverKey>> | null;
  /** Dauer des Übergangs in ms */
  hoverDuration?: number;
  /** Einblenden beim Scrollen */
  reveal?: Reveal | null;
  /** Bewegung beim Scrollen, mit der Maus und dauerhaft */
  motion?: Motion | null;
  /** Karussell: die Elemente darin sind Folien zum Durchblättern (auto = Sekunden bis zur nächsten, null = aus) */
  carousel?: { auto: number | null; arrows: boolean; dots: boolean } | null;
  /** Akkordeon: Kinder sind Einträge; im Eintrag ist das erste Kind die Kopfzeile, der Rest klappt auf. single = immer nur einer offen */
  accordion?: { single: boolean; firstOpen: boolean } | null;
  /** Reiter: erstes Kind = Reiter-Leiste (Knöpfe), danach je Reiter ein Inhalt */
  tabs?: { } | null;
  /** Pop-up: auf der Website versteckt, öffnet sich per Link oder nach einer Wartezeit */
  popup?: { open: 'link' | 'delay'; delay: number; once: boolean } | null;
  /** Hinweis-Text, der beim Darüberfahren erscheint */
  tooltip?: string;
  /** Vorher-Nachher: zwei Ebenen übereinander, ein Schieberegler zeigt mehr von der einen oder anderen (pos in %) */
  compare?: { pos: number } | null;
  /** Die obere Ebene eines Vorher-Nachher-Vergleichs (wird ab der Reglerstelle gezeigt) */
  compareAfter?: boolean;
  /** Fertige Animation (Lottie) aus der Bibliothek */
  lottie?: { ref: string; loop: boolean; play: 'auto' | 'view' | 'hover' } | null;
  /** Eigene Animation: Schlüsselbilder je Eigenschaft (Zeit in Sekunden) */
  anim?: AnimTracks | null;
  /** Oberstes Board einer eigenen Animation: Zustände, Wiederholen, Start */
  animation?: AnimSettings | null;
  /** Beim Scrollen fixieren */
  pin?: Pin | null;
  /** Abweichungen nach dem Scrollen (gelten für alle Breakpoints) */
  scrolled?: Partial<Pick<WNode, ScrollKey>> | null;
  /** Ab wie vielen Pixeln Scrollen umgeschaltet wird */
  scrollAt?: number;
  /** Dauer des Übergangs in ms */
  scrollDuration?: number;
  /** Nur Webseiten-Board: Inhalt in breiten Fenstern höchstens so breit (px) und mittig; Flächen laufen weiter bis zum Rand */
  contentWidth?: number | null;
  /** Füllt beim Öffnen der Seite das ganze Browserfenster (z. B. Hero) */
  fullscreen?: { offset: number; stay: boolean } | null;
  /** Wohin der begrenzte Inhalt rückt (Standard: mittig) */
  contentAlign?: 'left' | 'center' | 'right';
  /** Diese Komponente ist die Kopfzeile bzw. Fußzeile der Website */
  role?: 'header' | 'footer' | null;
  /** Diese Ebene ist eine Kopfleiste mit Menü */
  nav?: NavSettings | null;
  /** Dieses Board enthält die Menüpunkte (wird auf kleinen Bildschirmen zum ☰-Menü) */
  navLinks?: boolean;
  /** Dieses Board ist ein Kontaktformular */
  form?: FormSettings | null;
  /** Eingabefeld eines Formulars */
  formField?: FormFieldKey;
  /** Beschriftung eines Formularfelds */
  formLabel?: boolean;
  /** Absende-Knopf eines Formulars */
  formSubmit?: boolean;
  /** Eingebettetes Video oder Karte */
  embed?: Embed | null;
  /** Eigener Code (HTML, CSS, JavaScript) – läuft abgeschottet in einem eigenen Rahmen */
  codeBlock?: CodeBlock | null;
  /** Zusätzliche CSS-Angaben für diese Ebene, z. B. „animation: drehen 4s infinite;“ */
  customCss?: string;
  /** Icon, eigene SVG-Grafik oder Form (Linie, Pfeil, Vieleck, Stern) */
  vector?: VectorSpec;
  /** Abweichungen für kleinere Bildschirme (Tablet erbt Desktop, Mobil erbt Tablet) */
  overrides?: Partial<Record<Exclude<Breakpoint, 'desktop'>, Partial<WNode>>>;
}

/** Eigenschaften, die sich in einer eigenen Animation ändern können */
export type AnimProp = 'x' | 'y' | 'w' | 'h' | 'rotation' | 'opacity' | 'color' | 'gradient' | 'radius' | 'shape';
/** Wie der Übergang zum nächsten Schlüsselbild verläuft */
export type AnimEase = 'linear' | 'smooth' | 'in' | 'out' | 'back' | 'bounce';
/** Schlüsselbild: Zeit (s), Wert, Verlauf bis zum nächsten Schlüsselbild */
export interface AnimKey { t: number; v: number | string; ease?: AnimEase }
export type AnimTracks = Partial<Record<AnimProp, AnimKey[]>>;
/** Benannter Zeitpunkt (Zustand) mit dem Übergang zum nächsten */
export interface AnimState { id: string; name: string; t: number; ease: AnimEase }
export interface AnimSettings {
  states: AnimState[];
  /** einmal, immer wieder oder hin und zurück */
  repeat: 'once' | 'loop' | 'alternate';
  /** Start: sofort, wenn sie ins Bild kommt, bei Maus darüber, beim Klick */
  play: 'auto' | 'view' | 'hover' | 'click' | 'scroll' | 'button';
}

/** Ab welcher Größe wird das Menü zum ☰-Symbol? */
export type NavCollapse = 'never' | 'tablet' | 'mobile';
export interface NavSettings {
  collapse: NavCollapse;
  /** Farbe des ☰-Symbols */
  iconColor: string;
  /** Hintergrund des geöffneten Menüs (ganzer Bildschirm) */
  overlayBg: string;
  /** Schriftfarbe im geöffneten Menü */
  overlayText: string;
  /** Wie sich das Menü öffnet: über den ganzen Bildschirm oder unter der Kopfzeile herunterklappend */
  open?: 'full' | 'drop';
}

export interface CodeBlock { html: string; css: string; js: string }

export type EmbedKind = 'youtube' | 'vimeo' | 'gmaps' | 'osm' | 'video';
export interface Embed {
  kind: EmbedKind;
  /** Video-Link (YouTube/Vimeo) */
  url: string;
  /** Adresse (Karten) */
  address: string;
  /** Koordinaten (OpenStreetMap) */
  lat: number | null;
  lon: number | null;
  /** Zoomstufe der Karte (3–19) */
  zoom: number;
  /** Vorschaubild aus der Bibliothek */
  poster: string | null;
  /** Eigenes Video aus der Bibliothek */
  videoRef: string | null;
  controls: boolean;
  autoplay: boolean;
  loop: boolean;
}

/** icon = aus der Sammlung, svg = eigene Datei, line/arrow = Linie, polygon = Vieleck (3 = Dreieck), star = Stern */
export type VectorKind = 'icon' | 'svg' | 'line' | 'polygon' | 'star';
export interface VectorSpec {
  kind: VectorKind;
  /** Icon/SVG: innerer SVG-Inhalt (bereinigt) und Koordinatensystem */
  markup?: string;
  viewBox?: string;
  /** Icon: Name in der Sammlung (für „Anderes Icon“) */
  iconName?: string;
  /** line = Linien-Icon mit Strichstärke, fill = flächig (Logos), original = Originalfarben einer eigenen SVG */
  paint?: 'line' | 'fill' | 'original';
  /** Eigene SVG: lässt sich einfärben (Originalfarben werden ersetzt) */
  recolorable?: boolean;
  /** Linien-Icon und Linie: Strichstärke */
  strokeWidth: number;
  /** Vieleck: Ecken · Stern: Zacken */
  sides: number;
  /** Stern: Innenradius (0.1–0.95) */
  innerRatio: number;
  /** Nur zur Anzeige während einer Animation (Form im Übergang), wird nicht gespeichert */
  path?: string;
  /** Linie: Pfeilspitzen */
  arrowStart: boolean;
  arrowEnd: boolean;
}

export type FormFieldKey = 'name' | 'email' | 'telefon' | 'betreff' | 'nachricht';
export interface FormSettings {
  /** Empfänger-Adresse */
  to: string;
  /** Betreff, falls die Besucher keinen eingeben */
  subject: string;
}

/** Suchmaschinen- und Teilen-Angaben einer Seite */
export interface PageSeo { title: string; description: string; ogImage: string | null }

/** Angaben für die ganze Website */
export interface SiteSettings {
  name: string; lang: string; url: string; favicon: string | null; selfHostFonts: boolean;
  /** Eigenes CSS für alle Seiten (z. B. @keyframes für Animationen) */
  css?: string;
  /** Eigener Code im <head> bzw. am Ende von <body> jeder Seite (nur Vorschau & Export) */
  headCode?: string;
  bodyCode?: string;
  /** Grundschrift in px: Größe für neue Texte und für Text ohne eigene Größe */
  baseFont?: number;
  /** Übergang beim Wechsel zwischen den Seiten */
  pageTransition?: 'none' | 'fade' | 'slide';
  /** Bewegungs-Stil der ganzen Seite: macht alle Bewegungen ruhiger oder lebhafter */
  motionStyle?: 'calm' | 'normal' | 'lively';
  /** früherer Dunkel-Modus der Website – wird nicht mehr benutzt, nur noch toleriert */
  darkMode?: 'off' | 'auto';
  /** Besucher-Statistik mit Plausible (ohne Cookies): Domain wie bei Plausible eingetragen, optional eigener Server */
  analytics?: { domain: string; host?: string } | null;
  /** Abstands-Stufen in px (S, M, L, XL) */
  space?: SpaceScale;
}

export type SpaceToken = 's' | 'm' | 'l' | 'xl';
export type SpaceScale = Record<SpaceToken, number>;

export interface Page {
  id: string;
  name: string;
  seo?: PageSeo;
  background: string;
  rootIds: string[];
  nodes: Record<string, WNode>;
}

export interface ColorAsset { id: string; name: string; color: string; opacity: number; /** früher: Farbe im Dunkel-Modus – wird nicht mehr benutzt */ dark?: { color: string; opacity: number } | null }

/** Typografie eines Textstils (ohne Ausrichtung und Unterstreichung) */
export type TypoKey = 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing' | 'italic' | 'transform';
export const TYPO_KEYS: TypoKey[] = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'italic', 'transform'];
export type TextTag = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'div';

export interface TextStyleAsset { id: string; name: string; style: Pick<TextStyle, TypoKey>; /** Art des Textes für alle Texte mit diesem Stil */ tag?: TextTag }

export interface ImageAsset { id: string; name: string; src: string; w: number; h: number }

export interface VideoAsset { id: string; name: string; src: string; w: number; h: number; size: number; type: string }

export interface GradientAsset { id: string; name: string; gradient: Gradient }

/** Fertige Animation (Lottie-Datei als Text) */
export interface AnimationAsset { id: string; name: string; data: string; w: number; h: number; size: number }

export interface Library { colors: ColorAsset[]; gradients: GradientAsset[]; textStyles: TextStyleAsset[]; images: ImageAsset[]; videos: VideoAsset[]; animations?: AnimationAsset[] }

export interface WDocument {
  version: 1; name: string; pages: Page[]; library: Library; site?: SiteSettings;
  /** Eine Seite pro Komponente mit deren eigenem Board (nicht Teil der Website) */
  componentPages?: Page[];
  /** Vorlagen-Seiten: Muster zum Anlegen neuer Seiten (ohne Verknüpfung, nicht Teil der Website) */
  templatePages?: Page[];
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
