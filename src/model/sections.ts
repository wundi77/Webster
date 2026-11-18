// Fertige Abschnitte: Kopfbereich, Vorteile, Bild und Text, Zahlen, Stimmen, Preise, Aufruf, Kontakt.
// Farben hängen an den Farbrollen (Hauptfarbe, Akzent, Hintergrund, Fläche, Text, Text leise) – Farbschema und Dunkel-Modus wirken sofort.
// Abstände hängen an den Abstands-Stufen.
import { useEditor } from '../store';
import { BREAKPOINTS, createNode, defaultTextStyle, makeFill, makeLayout, makeShadow, makeStroke } from './factory';
import { applyEdit } from './resolve';
import { appendChild } from './commands';
import { siteRoot } from '../export/html';
import { spaceOf } from './spacing';
import { isFooter } from './css';
import type { ColorAsset, Fill, Layout, Page, SpaceToken, TextTag, WDocument, WNode } from './types';

type Role = 'Hauptfarbe' | 'Akzent' | 'Hintergrund' | 'Fläche' | 'Text' | 'Text leise';
const FALLBACK: Record<Role, string> = { Hauptfarbe: '#6A55F5', Akzent: '#FF7A59', Hintergrund: '#FFFFFF', Fläche: '#F4F2FF', Text: '#1C1B22', 'Text leise': '#5E5C6B' };

/** Bau-Umgebung: Seite, Farben, Abstände */
interface Ctx { pg: Page; colors: ColorAsset[]; space: Record<SpaceToken, number> }
let C: Ctx;

const paint = (role: Role | string, opacity = 1): Fill => {
  const c = C.colors.find(x => x.name === role);
  if (c) return { ...makeFill(c.color, c.opacity * opacity), colorRef: opacity === 1 ? c.id : null };
  return makeFill(role in FALLBACK ? FALLBACK[role as Role] : role, opacity);
};

function add(n: WNode, parent: WNode | null): WNode {
  C.pg.nodes[n.id] = n;
  if (parent) { n.parentId = parent.id; parent.children.push(n.id); }
  return n;
}

/** Board mit Layout. pad/gap als Stufe oder Zahl */
function box(parent: WNode | null, name: string, o: {
  dir?: 'row' | 'column'; grid?: number; gap?: SpaceToken | number; pad?: SpaceToken | [number, number, number, number];
  align?: Layout['align']; justify?: Layout['justify']; fill?: Fill[]; radius?: number; w?: number; sizingH?: WNode['sizingH']; maxW?: number;
  stackMobile?: boolean; stackTablet?: boolean; gridTablet?: number; extra?: Partial<WNode>;
} = {}): WNode {
  const L = makeLayout(o.grid ? 'grid' : 'flex', o.dir ?? 'column');
  const gap = typeof o.gap === 'string' ? C.space[o.gap] : o.gap ?? C.space.m;
  L.gap = gap; L.rowGap = gap;
  if (typeof o.gap === 'string') L.gapRef = o.gap;
  if (Array.isArray(o.pad)) L.padding = o.pad;
  else { const p = C.space[o.pad ?? 'l']; L.padding = [p, p, p, p]; L.padRef = o.pad ?? 'l'; }
  L.align = o.align ?? (o.grid ? 'stretch' : 'start');
  L.justify = o.justify ?? 'start';
  if (o.dir === 'row' && !o.stackMobile) L.wrap = true;
  if (o.grid) L.columns = Array.from({ length: o.grid }, () => ({ unit: 'fr' as const, value: 1 }));
  const n = add(createNode('board', {
    name, w: o.w ?? 1200, h: 200, sizingH: o.sizingH ?? (parent ? 'fill' : 'fixed'), sizingV: 'auto', maxW: o.maxW ?? null,
    fills: o.fill ?? [], radius: o.radius ?? 0, clip: false, layout: L, ...o.extra,
  }), parent);
  if (o.stackMobile || o.stackTablet) {
    for (const bp of (o.stackTablet ? ['tablet', 'mobile'] : ['mobile']) as ('tablet' | 'mobile')[]) {
      applyEdit(n, bp, e => {
        if (!e.layout) return;
        e.layout = o.grid ? { ...e.layout, columns: [{ unit: 'fr', value: 1 }] } : { ...e.layout, direction: 'column', align: e.layout.align === 'center' ? 'stretch' : e.layout.align };
      });
    }
  }
  if (o.grid && o.gridTablet) applyEdit(n, 'tablet', e => { if (e.layout) e.layout = { ...e.layout, columns: Array.from({ length: o.gridTablet! }, () => ({ unit: 'fr' as const, value: 1 })) }; });
  return n;
}

function txt(parent: WNode, t: string, o: { size?: number; weight?: number; role?: Role | string; tag?: TextTag; align?: 'left' | 'center' | 'right'; lh?: number; ls?: number; mobileSize?: number; name?: string; upper?: boolean } = {}): WNode {
  const size = o.size ?? 18;
  const n = add(createNode('text', {
    name: o.name ?? t.slice(0, 30), text: t, sizingH: 'fill', sizingV: 'auto',
    textStyle: { ...defaultTextStyle(), fontSize: size, fontWeight: o.weight ?? 400, lineHeight: o.lh ?? (size >= 36 ? 1.1 : 1.5), letterSpacing: o.ls ?? (size >= 36 ? -0.02 * size : 0), textAlign: o.align ?? 'left', transform: o.upper ? 'uppercase' : 'none' },
    fills: [paint(o.role ?? 'Text')], textTag: o.tag ?? null,
  }), parent);
  const ms = o.mobileSize ?? (size >= 40 ? Math.round(size * 0.62) : size >= 28 ? Math.round(size * 0.8) : undefined);
  if (ms) applyEdit(n, 'mobile', e => { e.textStyle = { ...n.textStyle!, fontSize: ms }; });
  if (ms && size >= 40) applyEdit(n, 'tablet', e => { e.textStyle = { ...n.textStyle!, fontSize: Math.round(size * 0.8) }; });
  return n;
}

function button(parent: WNode, label: string, kind: 'primary' | 'ghost' | 'light' = 'primary'): WNode {
  const fill = kind === 'primary' ? [paint('Hauptfarbe')] : kind === 'light' ? [makeFill('#FFFFFF')] : [];
  const b = box(parent, `Knopf „${label}“`, { dir: 'row', gap: 8, pad: [14, 26, 14, 26], align: 'center', justify: 'center', fill, radius: 999, sizingH: 'auto',
    extra: { link: { type: 'url', url: '#', newTab: false }, hover: { opacity: 0.85 } } });
  if (kind === 'ghost') { const t = paint('Text'); b.strokes = [{ ...makeStroke(), color: t.color, colorRef: t.colorRef, width: 1.5 }]; }
  const t = txt(b, label, { size: 16, weight: 600, role: kind === 'primary' ? '#FFFFFF' : kind === 'light' ? 'Hauptfarbe' : 'Text', name: label });
  t.sizingH = 'auto';
  return b;
}

function picture(parent: WNode, name: string, h: number, o: { radius?: number; fixedW?: number } = {}): WNode {
  const n = add(createNode('image', { name, w: o.fixedW ?? 560, h, sizingH: o.fixedW ? 'fixed' : 'fill', sizingV: 'fixed', radius: o.radius ?? 20, fills: [paint('Fläche')], objectFit: 'cover' }), parent);
  applyEdit(n, 'mobile', e => { e.h = Math.round(h * 0.62); });
  return n;
}

function circle(parent: WNode, role: Role, size = 48, label = ''): WNode {
  const c = box(parent, label || 'Symbol', { dir: 'row', gap: 0, pad: [0, 0, 0, 0], align: 'center', justify: 'center', fill: [paint(role, 0.14)], radius: size / 2, sizingH: 'fixed', w: size, extra: { sizingV: 'fixed', h: size } });
  if (label) { const t = txt(c, label, { size: 20, weight: 700, role, align: 'center' }); t.sizingH = 'auto'; }
  return c;
}

/** Äußerer Abschnitt: volle Breite, Hintergrund, Innenabstand; darin ein Inhalt mit Höchstbreite */
function section(name: string, bg: Fill[], pad: SpaceToken = 'xl'): { outer: WNode; inner: (o?: Parameters<typeof box>[2]) => WNode } {
  const p = C.space[pad] * 1.5;
  const outer = box(null, name, { dir: 'column', gap: 0, pad: [p, C.space.l, p, C.space.l], align: 'center', fill: bg, w: 1440 });
  applyEdit(outer, 'mobile', e => { if (e.layout) e.layout = { ...e.layout, padding: [Math.round(p * 0.6), 20, Math.round(p * 0.6), 20] }; });
  return { outer, inner: o => box(outer, 'Inhalt', { pad: [0, 0, 0, 0], maxW: 1200, ...o }) };
}

// ---------- Abschnitte ----------

export interface SectionDef { id: string; group: string; label: string; tip: string; build: () => WNode }

const heroCenter = () => {
  const { outer, inner } = section('Kopfbereich', [paint('Hintergrund')]);
  const c = inner({ gap: 'm', align: 'center', maxW: 860 });
  txt(c, 'Neu: Jetzt entdecken', { size: 14, weight: 600, role: 'Hauptfarbe', align: 'center', upper: true, ls: 1.2, name: 'Hinweis' });
  txt(c, 'Eine Überschrift, die sofort sagt, worum es geht', { size: 64, weight: 800, tag: 'h1', align: 'center', name: 'Überschrift' });
  txt(c, 'Ein, zwei Sätze, die erklären, was du anbietest und warum es sich lohnt, weiterzulesen.', { size: 20, role: 'Text leise', align: 'center', name: 'Unterzeile' });
  const r = box(c, 'Knöpfe', { dir: 'row', gap: 'm', pad: [16, 0, 0, 0], justify: 'center', align: 'center', sizingH: 'auto' });
  button(r, 'Jetzt starten'); button(r, 'Mehr erfahren', 'ghost');
  return outer;
};

const heroSplit = () => {
  const { outer, inner } = section('Kopfbereich mit Bild', [paint('Hintergrund')]);
  const row = inner({ dir: 'row', gap: 'xl', align: 'center', stackMobile: true });
  const t = box(row, 'Text', { gap: 'm', pad: [0, 0, 0, 0] });
  txt(t, 'Willkommen', { size: 14, weight: 600, role: 'Hauptfarbe', upper: true, ls: 1.2, name: 'Hinweis' });
  txt(t, 'Schön, dass du da bist', { size: 56, weight: 800, tag: 'h1', name: 'Überschrift' });
  txt(t, 'Beschreibe hier in wenigen Worten, was Besucher bei dir finden. Rechts kommt ein großes Bild hin.', { size: 19, role: 'Text leise', name: 'Unterzeile' });
  const r = box(t, 'Knöpfe', { dir: 'row', gap: 'm', pad: [16, 0, 0, 0], align: 'center', sizingH: 'auto' });
  button(r, 'Kontakt aufnehmen'); button(r, 'Angebot ansehen', 'ghost');
  picture(row, 'Bild', 520, { radius: 28 });
  return outer;
};

const heroColor = () => {
  const main = C.colors.find(c => c.name === 'Hauptfarbe')?.color ?? FALLBACK.Hauptfarbe;
  const acc = C.colors.find(c => c.name === 'Akzent')?.color ?? FALLBACK.Akzent;
  const g: Fill = { ...makeFill(main), gradient: { type: 'linear', angle: 135, stops: [{ id: 'a', color: main, opacity: 1, pos: 0 }, { id: 'b', color: acc, opacity: 1, pos: 1 }] }, move: 8 };
  const { outer, inner } = section('Kopfbereich farbig', [g]);
  outer.fullscreen = { offset: 0, stay: false };
  outer.layout!.justify = 'center';
  for (const bp of ['tablet', 'mobile'] as const) { const l = outer.overrides?.[bp]?.layout; if (l) outer.overrides![bp]!.layout = { ...l, justify: 'center' }; }
  const c = inner({ gap: 'm', align: 'center', maxW: 900 });
  txt(c, 'Groß, farbig, unübersehbar', { size: 72, weight: 800, tag: 'h1', align: 'center', role: '#FFFFFF', name: 'Überschrift' });
  txt(c, 'Der Hintergrund bewegt sich sanft. Er füllt beim Öffnen das ganze Fenster.', { size: 21, align: 'center', role: '#FFFFFF', name: 'Unterzeile' }).opacity = 0.88;
  const r = box(c, 'Knöpfe', { dir: 'row', gap: 'm', pad: [16, 0, 0, 0], justify: 'center', align: 'center', sizingH: 'auto' });
  button(r, 'Los geht’s', 'light');
  return outer;
};

const heroDepth = () => {
  const { outer, inner } = section('Kopfbereich mit Tiefe', [paint('Hintergrund')]);
  outer.clip = true;
  outer.fullscreen = { offset: 0, stay: false };
  outer.layout!.justify = 'center';
  for (const bp of ['tablet', 'mobile'] as const) { const l = outer.overrides?.[bp]?.layout; if (l) outer.overrides![bp]!.layout = { ...l, justify: 'center' }; }
  // schwebende, weiche Farbflächen: hinten langsam, vorne schneller
  const orbs: [Role, number, number, number, number, number, number, number][] = [
    // Rolle, x, y, Größe, Tiefe, Deckkraft, x Tablet, x Handy
    ['Hauptfarbe', -120, -80, 520, -60, 0.35, -160, -200],
    ['Akzent', 980, 60, 420, -40, 0.35, 480, 180],
    ['Hauptfarbe', 760, 520, 300, -20, 0.25, 420, 160],
    ['Akzent', 140, 560, 220, 0, 0.3, 40, -40],
  ];
  orbs.forEach(([role, x, y, size, depth, op, xt, xm], i) => {
    const o = add(createNode('ellipse', { name: `Farbfläche ${i + 1}`, x, y, w: size, h: size, absolute: true, fills: [paint(role)], opacity: op, blur: 50 }), outer);
    o.motion = { scroll: depth ? { kind: 'depth', amount: depth } : null };
    o.overrides = { tablet: { x: xt }, mobile: { x: xm, w: Math.round(size * 0.6), h: Math.round(size * 0.6) } };
  });
  // Inhalt zuletzt = vorn, über den Flächen
  const c = inner({ gap: 'm', align: 'center', maxW: 860 });
  txt(c, 'Mit Tiefe', { size: 14, weight: 600, role: 'Hauptfarbe', align: 'center', upper: true, ls: 1.2, name: 'Hinweis' });
  const h = txt(c, 'Beim Scrollen bewegt sich alles verschieden schnell', { size: 64, weight: 800, tag: 'h1', align: 'center', name: 'Überschrift' });
  h.motion = { scroll: { kind: 'depth', amount: 10 } };
  txt(c, 'Die weichen Farbflächen im Hintergrund schweben in unterschiedlicher Tiefe – das wirkt räumlich.', { size: 20, role: 'Text leise', align: 'center', name: 'Unterzeile' });
  const r = box(c, 'Knöpfe', { dir: 'row', gap: 'm', pad: [16, 0, 0, 0], justify: 'center', align: 'center', sizingH: 'auto' });
  button(r, 'Jetzt starten'); button(r, 'Mehr erfahren', 'ghost');
  return outer;
};

const features = () => {
  const { outer, inner } = section('Vorteile', [paint('Hintergrund')]);
  const c = inner({ gap: 'xl', align: 'center' });
  const head = box(c, 'Kopf', { gap: 's', pad: [0, 0, 0, 0], align: 'center', maxW: 720 });
  txt(head, 'Was dich erwartet', { size: 40, weight: 800, tag: 'h2', align: 'center', name: 'Überschrift' });
  txt(head, 'Drei gute Gründe, kurz und klar.', { size: 18, role: 'Text leise', align: 'center', name: 'Unterzeile' });
  const grid = box(c, 'Karten', { grid: 3, gap: 'l', pad: [0, 0, 0, 0], stackMobile: true, gridTablet: 1 });
  const items = [['1', 'Einfach', 'Beschreibe hier den ersten Vorteil in ein, zwei Sätzen.'], ['2', 'Schnell', 'Und hier den zweiten – was macht dein Angebot besonders?'], ['3', 'Persönlich', 'Der dritte Grund, warum man sich für dich entscheidet.']];
  for (const [n, h, p] of items) {
    const card = box(grid, `Karte ${h}`, { gap: 's', pad: 'l', fill: [paint('Fläche')], radius: 20, extra: { hover: { shadows: [{ ...makeShadow(), y: 12, blur: 32, opacity: 0.12 }] } } });
    circle(card, 'Hauptfarbe', 48, n);
    txt(card, h, { size: 22, weight: 700, tag: 'h3', name: 'Titel' });
    txt(card, p, { size: 16, role: 'Text leise', name: 'Text' });
  }
  return outer;
};

const mediaText = (flip: boolean) => () => {
  const { outer, inner } = section(flip ? 'Text und Bild' : 'Bild und Text', [paint(flip ? 'Fläche' : 'Hintergrund')]);
  const row = inner({ dir: 'row', gap: 'xl', align: 'center', stackMobile: true });
  const make = () => picture(row, 'Bild', 440);
  if (!flip) make();
  const t = box(row, 'Text', { gap: 'm', pad: [0, 0, 0, 0] });
  txt(t, 'Über uns', { size: 14, weight: 600, role: 'Hauptfarbe', upper: true, ls: 1.2, name: 'Hinweis' });
  txt(t, 'Erzähle deine Geschichte', { size: 40, weight: 800, tag: 'h2', name: 'Überschrift' });
  txt(t, 'Hier ist Platz für ein paar Sätze über dich, dein Team oder dein Angebot. Ein persönliches Bild daneben macht den Abschnitt lebendig.', { size: 18, role: 'Text leise', name: 'Text' });
  const r = box(t, 'Knöpfe', { dir: 'row', gap: 'm', pad: [8, 0, 0, 0], align: 'center', sizingH: 'auto' });
  button(r, 'Mehr über uns', 'ghost');
  if (flip) make();
  return outer;
};

const numbers = () => {
  const { outer, inner } = section('Zahlen', [paint('Fläche')], 'l');
  const grid = inner({ grid: 4, gap: 'l', gridTablet: 2 });
  applyEdit(grid, 'mobile', e => { if (e.layout) e.layout = { ...e.layout, columns: [{ unit: 'fr', value: 1 }, { unit: 'fr', value: 1 }] }; });
  for (const [z, l] of [['120+', 'Zufriedene Kunden'], ['15', 'Jahre Erfahrung'], ['98 %', 'Weiterempfehlung'], ['24 h', 'Antwortzeit']]) {
    const b = box(grid, l, { gap: 's', pad: [0, 0, 0, 0], align: 'center' });
    const t = txt(b, z, { size: 52, weight: 800, align: 'center', role: 'Hauptfarbe', name: 'Zahl' });
    t.reveal = { type: 'count', duration: 1200, delay: 0 };
    txt(b, l, { size: 16, role: 'Text leise', align: 'center', name: 'Beschriftung' });
  }
  return outer;
};

const quote = () => {
  const { outer, inner } = section('Stimme', [paint('Hintergrund')]);
  const c = inner({ gap: 'l', align: 'center', maxW: 860 });
  txt(c, '„', { size: 96, weight: 800, role: 'Hauptfarbe', align: 'center', lh: 0.6, name: 'Anführungszeichen' });
  txt(c, 'Ein Satz von einem zufriedenen Kunden wirkt mehr als jede Werbung. Schreib hier, was jemand Schönes über dich gesagt hat.', { size: 28, weight: 500, align: 'center', lh: 1.4, name: 'Zitat' });
  const who = box(c, 'Person', { dir: 'row', gap: 'm', pad: [0, 0, 0, 0], align: 'center', sizingH: 'auto' });
  add(createNode('image', { name: 'Foto', w: 56, h: 56, radius: 28, fills: [paint('Fläche')], objectFit: 'cover' }), who);
  const n = box(who, 'Name', { gap: 0, pad: [0, 0, 0, 0], sizingH: 'auto' });
  txt(n, 'Maria Beispiel', { size: 16, weight: 700, name: 'Name' }).sizingH = 'auto';
  txt(n, 'Kundin seit 2021', { size: 14, role: 'Text leise', name: 'Rolle' }).sizingH = 'auto';
  return outer;
};

const quotes3 = () => {
  const { outer, inner } = section('Stimmen', [paint('Fläche')]);
  const c = inner({ gap: 'xl', align: 'center' });
  txt(c, 'Das sagen andere', { size: 40, weight: 800, tag: 'h2', align: 'center', name: 'Überschrift' });
  const grid = box(c, 'Karten', { grid: 3, gap: 'l', pad: [0, 0, 0, 0], stackMobile: true, gridTablet: 1 });
  for (const [q, w] of [['Schnell, freundlich und genau das, was ich gesucht habe.', 'Anna K.'], ['Ich komme gerne wieder – absolute Empfehlung!', 'Tom R.'], ['Hat alles super geklappt, vielen Dank für die Hilfe.', 'Lea S.']]) {
    const card = box(grid, `Stimme ${w}`, { gap: 'm', pad: 'l', fill: [paint('Hintergrund')], radius: 20 });
    txt(card, '★★★★★', { size: 18, role: 'Akzent', ls: 2, name: 'Sterne' });
    txt(card, `„${q}“`, { size: 18, lh: 1.5, name: 'Zitat' });
    txt(card, w, { size: 15, weight: 700, role: 'Text leise', name: 'Name' });
  }
  return outer;
};

const pricing = () => {
  const { outer, inner } = section('Preise', [paint('Hintergrund')]);
  const c = inner({ gap: 'xl', align: 'center' });
  const head = box(c, 'Kopf', { gap: 's', pad: [0, 0, 0, 0], align: 'center', maxW: 720 });
  txt(head, 'Preise', { size: 40, weight: 800, tag: 'h2', align: 'center', name: 'Überschrift' });
  txt(head, 'Klar und ohne Kleingedrucktes.', { size: 18, role: 'Text leise', align: 'center', name: 'Unterzeile' });
  const grid = box(c, 'Pakete', { grid: 3, gap: 'l', pad: [0, 0, 0, 0], align: 'stretch', stackMobile: true, gridTablet: 1 });
  const plans: [string, string, string[], boolean][] = [
    ['Start', '19 €', ['Punkt eins', 'Punkt zwei', 'Punkt drei'], false],
    ['Beliebt', '49 €', ['Alles aus Start', 'Punkt vier', 'Punkt fünf'], true],
    ['Groß', '99 €', ['Alles aus Beliebt', 'Punkt sechs', 'Persönliche Hilfe'], false],
  ];
  for (const [name, price, pts, hi] of plans) {
    const card = box(grid, `Paket ${name}`, { gap: 'm', pad: 'l', fill: [hi ? paint('Hauptfarbe') : paint('Fläche')], radius: 24 });
    const fg = hi ? '#FFFFFF' : 'Text';
    txt(card, name, { size: 18, weight: 700, role: fg, name: 'Name' });
    txt(card, price, { size: 48, weight: 800, role: fg, name: 'Preis' });
    txt(card, 'pro Monat', { size: 14, role: hi ? '#FFFFFF' : 'Text leise', name: 'Zeitraum' }).opacity = hi ? 0.8 : 1;
    for (const p of pts) txt(card, `✓  ${p}`, { size: 16, role: fg, name: p });
    const b = button(card, 'Auswählen', hi ? 'light' : 'primary');
    b.sizingH = 'fill';
  }
  return outer;
};

const cta = () => {
  const { outer, inner } = section('Aufruf', [paint('Hintergrund')], 'l');
  const band = inner({ dir: 'row', gap: 'l', pad: 'xl', align: 'center', justify: 'space-between', fill: [paint('Hauptfarbe')], radius: 28, stackMobile: true });
  const t = box(band, 'Text', { gap: 's', pad: [0, 0, 0, 0] });
  txt(t, 'Bereit für den nächsten Schritt?', { size: 36, weight: 800, tag: 'h2', role: '#FFFFFF', name: 'Überschrift' });
  txt(t, 'Schreib uns – wir melden uns schnell.', { size: 18, role: '#FFFFFF', name: 'Text' }).opacity = 0.85;
  button(band, 'Jetzt anfragen', 'light');
  return outer;
};

const contact = () => {
  const { outer, inner } = section('Kontakt', [paint('Fläche')]);
  const row = inner({ dir: 'row', gap: 'xl', align: 'start', stackMobile: true });
  const t = box(row, 'Text', { gap: 'm', pad: [0, 0, 0, 0] });
  txt(t, 'Kontakt', { size: 40, weight: 800, tag: 'h2', name: 'Überschrift' });
  txt(t, 'Fragen, Wünsche, Ideen? Wir freuen uns auf deine Nachricht.', { size: 18, role: 'Text leise', name: 'Text' });
  const info = box(row, 'Angaben', { gap: 'm', pad: 'l', fill: [paint('Hintergrund')], radius: 20 });
  for (const [k, v] of [['E-Mail', 'hallo@beispiel.de'], ['Telefon', '0123 456789'], ['Adresse', 'Musterstraße 1, 12345 Musterstadt']]) {
    const line = box(info, k, { gap: 4, pad: [0, 0, 0, 0] });
    txt(line, k, { size: 13, weight: 600, role: 'Text leise', upper: true, ls: 1, name: 'Bezeichnung' });
    const vv = txt(line, v, { size: 18, weight: 500, name: 'Wert' });
    if (k === 'E-Mail') vv.link = { type: 'email', email: v };
  }
  return outer;
};

export const SECTIONS: SectionDef[] = [
  { id: 'hero-center', group: 'Kopfbereich', label: 'Mittig', tip: 'Große Überschrift in der Mitte, darunter zwei Knöpfe', build: heroCenter },
  { id: 'hero-split', group: 'Kopfbereich', label: 'Mit Bild', tip: 'Text links, großes Bild rechts – auf dem Handy untereinander', build: heroSplit },
  { id: 'hero-color', group: 'Kopfbereich', label: 'Farbig', tip: 'Bewegter Farbverlauf, füllt das ganze Fenster', build: heroColor },
  { id: 'hero-depth', group: 'Kopfbereich', label: 'Mit Tiefe', tip: 'Weiche Farbflächen schweben beim Scrollen in verschiedener Tiefe (Parallax)', build: heroDepth },
  { id: 'features', group: 'Inhalt', label: 'Drei Vorteile', tip: 'Drei Karten nebeneinander – auf dem Handy untereinander', build: features },
  { id: 'media', group: 'Inhalt', label: 'Bild und Text', tip: 'Bild links, Text rechts', build: mediaText(false) },
  { id: 'media-flip', group: 'Inhalt', label: 'Text und Bild', tip: 'Text links, Bild rechts, farbiger Hintergrund', build: mediaText(true) },
  { id: 'numbers', group: 'Inhalt', label: 'Zahlen', tip: 'Vier große Zahlen, die beim Erscheinen hochzählen', build: numbers },
  { id: 'quote', group: 'Vertrauen', label: 'Eine Stimme', tip: 'Ein großes Zitat mit Foto und Name', build: quote },
  { id: 'quotes', group: 'Vertrauen', label: 'Drei Stimmen', tip: 'Drei kurze Kundenstimmen mit Sternen', build: quotes3 },
  { id: 'pricing', group: 'Vertrauen', label: 'Preise', tip: 'Drei Pakete, das mittlere hervorgehoben', build: pricing },
  { id: 'cta', group: 'Abschluss', label: 'Aufruf', tip: 'Farbiges Band mit Satz und Knopf', build: cta },
  { id: 'contact', group: 'Abschluss', label: 'Kontakt', tip: 'Text und Kontaktangaben', build: contact },
];

/** Hat die Seite außer Kopf-/Fußzeile noch frei platzierte Inhalte? */
function freeContent(pg: Page, root: WNode) {
  return root.children.map(id => pg.nodes[id]).some(n => n && !n.nav && !isFooter(n) && !n.pin);
}

/** Abschnitt einfügen: ans Ende der Seite (vor die Fußzeile) bzw. nach dem ausgewählten Abschnitt */
export function insertSection(id: string): string | null {
  const def = SECTIONS.find(s => s.id === id);
  const s = useEditor.getState();
  if (!def) return null;
  let made: string | null = null;
  s.mutate((pg, d: WDocument) => {
    const root = siteRoot(pg);
    if (!root) return;
    C = { pg, colors: d.library.colors, space: spaceOf(d) };
    // Leere Seite ohne Anordnung: auf „Untereinander“ stellen, dann stapeln sich Abschnitte von selbst
    if (!root.layout && !freeContent(pg, root)) {
      const L = makeLayout('flex', 'column');
      L.gap = 0; L.rowGap = 0; L.padding = [0, 0, 0, 0]; L.align = 'stretch';
      root.layout = L;
      const kids = root.children.map(k => pg.nodes[k]).filter(Boolean);
      root.children = [...kids.filter(k => !isFooter(k)).sort((a, b) => a.y - b.y), ...kids.filter(k => isFooter(k))].map(k => k.id);
      for (const k of kids) if (!k.pin) k.sizingH = 'fill';
      root.sizingV = 'auto';
    }
    const sec = def.build();
    sec.parentId = root.id;
    if (root.layout) {
      sec.sizingH = 'fill';
      // nach dem ausgewählten Abschnitt einfügen, sonst ans Ende (vor die Fußzeile)
      const sel = s.selection.length === 1 ? s.selection[0] : null;
      let top = sel ? pg.nodes[sel] : undefined;
      while (top && top.parentId && top.parentId !== root.id) top = pg.nodes[top.parentId];
      const at = top && top.parentId === root.id && !isFooter(top) ? root.children.indexOf(top.id) + 1 : -1;
      if (at > 0) root.children.splice(at, 0, sec.id); else appendChild(pg, root.id, sec.id);
    } else {
      // Frei angeordnete Seite: volle Breite unter dem untersten Element, Fußzeile rückt nach unten
      const bottom = Math.max(0, ...root.children.map(c => pg.nodes[c]).filter(c => c && !c.nav && !isFooter(c)).map(c => c.y + c.h));
      sec.x = 0; sec.y = bottom; sec.w = root.w; sec.h = 640; sec.sizingV = 'fixed';
      sec.overrides = { ...sec.overrides };
      for (const b of BREAKPOINTS) if (b.id !== 'desktop' && b.width) sec.overrides[b.id] = { ...sec.overrides[b.id], x: 0, w: b.width };
      const foot = root.children.map(c => pg.nodes[c]).find(c => c && isFooter(c));
      if (foot) foot.y += sec.h;
      root.h = Math.max(root.h, bottom + sec.h + (foot ? foot.h : 0));
      const fi = foot ? root.children.indexOf(foot.id) : -1;
      if (fi >= 0) root.children.splice(fi, 0, sec.id); else root.children.push(sec.id);
    }
    made = sec.id;
  }, { key: 'section-add' });
  if (made) s.setSelection([made]);
  return made;
}
