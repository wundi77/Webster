// Fertige Abschnitte: Kopfbereich, Vorteile, Bild und Text, Zahlen, Stimmen, Preise, Aufruf, Kontakt.
// Farben hängen an den Farbrollen (Hauptfarbe, Akzent, Hintergrund, Fläche, Text, Text leise) – ein Farbschema wirkt sofort.
// Abstände hängen an den Abstands-Stufen.
import { useEditor } from '../store';
import { BREAKPOINTS, createNode, defaultTextStyle, makeFill, makeLayout, makeShadow, makeStroke } from './factory';
import { applyEdit } from './resolve';
import { appendChild } from './commands';
import { siteRoot } from '../export/html';
import { placeNew } from './embed';
import { spaceOf } from './spacing';
import { isFooter } from './css';
import { contrast } from './pageCheck';
import type { ColorAsset, Fill, Layout, Page, SpaceToken, TextTag, WDocument, WNode } from './types';
import { DAY_NAMES, dayText, defaultHours } from './hoursCore';
import { defaultEmbed } from './embedCore';
import { buildFormBoard } from './form';
import { findLegalPage, mainFont } from './legal';
import { directionsUrl } from './embed';

type Role = 'Hauptfarbe' | 'Akzent' | 'Hintergrund' | 'Fläche' | 'Text' | 'Text leise' | 'Auf Hauptfarbe';
const FALLBACK: Record<Role, string> = { Hauptfarbe: '#6A55F5', Akzent: '#FF7A59', Hintergrund: '#FFFFFF', Fläche: '#F4F2FF', Text: '#1C1B22', 'Text leise': '#5E5C6B', 'Auf Hauptfarbe': '#FFFFFF' };

/** Bau-Umgebung: Seite, Farben, Abstände */
interface Ctx { pg: Page; colors: ColorAsset[]; space: Record<SpaceToken, number>; doc: WDocument }
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
  const fill = kind === 'primary' ? [paint('Hauptfarbe')] : kind === 'light' ? [paint('Auf Hauptfarbe')] : [];
  const b = box(parent, `Knopf „${label}“`, { dir: 'row', gap: 8, pad: [14, 26, 14, 26], align: 'center', justify: 'center', fill, radius: 999, sizingH: 'auto',
    extra: { link: { type: 'url', url: '#', newTab: false }, hover: { opacity: 0.85 } } });
  if (kind === 'ghost') { const t = paint('Text'); b.strokes = [{ ...makeStroke(), color: t.color, colorRef: t.colorRef, width: 1.5 }]; }
  const t = txt(b, label, { size: 16, weight: 600, role: kind === 'primary' ? 'Auf Hauptfarbe' : kind === 'light' ? 'Hauptfarbe' : 'Text', name: label });
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
  // zweite Verlaufsfarbe: Richtung Akzent, aber nur so weit, dass weiße Schrift gut lesbar bleibt
  const mixHex = (a: string, b: string, t: number) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
  const rgb = (h: string): [number, number, number] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  let end = main;
  for (let t = 0.7; t >= 0; t -= 0.05) { const c = mixHex(main, acc, t); if (contrast(rgb(c), [255, 255, 255]) >= 4.6 && contrast(rgb(mixHex(main, c, 0.5)), [255, 255, 255]) >= 4.6) { end = c; break; } }
  const g: Fill = { ...makeFill(main), gradient: { type: 'linear', angle: 135, stops: [{ id: 'a', color: main, opacity: 1, pos: 0 }, { id: 'b', color: end, opacity: 1, pos: 1 }] }, move: 8 };
  const { outer, inner } = section('Kopfbereich farbig', [g]);
  outer.fullscreen = { offset: 0, stay: false };
  outer.layout!.justify = 'center';
  for (const bp of ['tablet', 'mobile'] as const) { const l = outer.overrides?.[bp]?.layout; if (l) outer.overrides![bp]!.layout = { ...l, justify: 'center' }; }
  const c = inner({ gap: 'm', align: 'center', maxW: 900 });
  txt(c, 'Groß, farbig, unübersehbar', { size: 72, weight: 800, tag: 'h1', align: 'center', role: '#FFFFFF', name: 'Überschrift' });
  txt(c, 'Der Hintergrund bewegt sich sanft. Er füllt beim Öffnen das ganze Fenster.', { size: 21, align: 'center', role: '#FFFFFF', name: 'Unterzeile' });
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
    const fg = hi ? 'Auf Hauptfarbe' : 'Text';
    txt(card, name, { size: 18, weight: 700, role: fg, name: 'Name' });
    txt(card, price, { size: 48, weight: 800, role: fg, name: 'Preis' });
    txt(card, 'pro Monat', { size: 14, role: hi ? 'Auf Hauptfarbe' : 'Text leise', name: 'Zeitraum' });
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
  txt(t, 'Bereit für den nächsten Schritt?', { size: 36, weight: 800, tag: 'h2', role: 'Auf Hauptfarbe', name: 'Überschrift' });
  txt(t, 'Schreib uns – wir melden uns schnell.', { size: 18, role: 'Auf Hauptfarbe', name: 'Text' });
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

// ---------- Für Betriebe ----------

const hoursSec = () => {
  const { outer, inner } = section('Öffnungszeiten', [paint('Hintergrund')]);
  const row = inner({ dir: 'row', gap: 'xl', align: 'start', stackMobile: true });
  const t = box(row, 'Text', { gap: 'm', pad: [0, 0, 0, 0] });
  txt(t, 'Öffnungszeiten', { size: 40, weight: 800, tag: 'h2', name: 'Überschrift' });
  txt(t, 'Wir freuen uns auf deinen Besuch. An Feiertagen kann es Abweichungen geben.', { size: 18, role: 'Text leise', name: 'Text' });
  const h = defaultHours();
  const table = box(row, 'Öffnungszeiten', { gap: 0, pad: [8, 28, 8, 28], fill: [paint('Fläche')], radius: 20, extra: { hours: h } });
  DAY_NAMES.forEach((d, i) => {
    const r = box(table, d, { dir: 'row', gap: 'm', pad: [12, 0, 12, 0], align: 'center', justify: 'space-between' });
    txt(r, d, { size: 17, weight: 600, name: 'Tag' }).sizingH = 'auto';
    const tt = txt(r, dayText(h.days[i]), { size: 17, role: 'Text leise', name: 'Zeit', align: 'right' });
    if (h.days[i].closed) tt.opacity = 0.6;
  });
  const pill = box(t, 'Geöffnet-Anzeige', { dir: 'row', gap: 0, pad: [8, 16, 8, 16], align: 'center', fill: [paint('Hauptfarbe', 0.12)], radius: 999, sizingH: 'auto' });
  const b = txt(pill, 'Jetzt geöffnet · bis 18 Uhr', { size: 15, weight: 600, role: 'Hauptfarbe', name: 'Geöffnet jetzt?' });
  b.sizingH = 'auto';
  b.openBadge = table.id;
  return outer;
};

const directions = () => {
  const { outer, inner } = section('Anfahrt', [paint('Fläche')]);
  const row = inner({ dir: 'row', gap: 'xl', align: 'stretch', stackMobile: true });
  const t = box(row, 'Text', { gap: 'm', pad: [0, 0, 0, 0], maxW: 420 });
  const address = 'Musterstraße 1, 12345 Musterstadt';
  txt(t, 'So findest du uns', { size: 40, weight: 800, tag: 'h2', name: 'Überschrift' });
  txt(t, 'Musterstraße 1\n12345 Musterstadt', { size: 20, weight: 600, name: 'Adresse' });
  txt(t, 'Mit Bus und Bahn: Haltestelle „Marktplatz“, zwei Minuten zu Fuß. Parkplätze gibt es direkt vor dem Haus.', { size: 17, role: 'Text leise', name: 'Hinweis' });
  const btn = button(t, 'Route planen');
  const map = add(createNode('rect', {
    name: 'Karte', w: 640, h: 420, sizingH: 'fill', sizingV: 'fixed', radius: 20, fills: [makeFill('#E5E3DF')],
    embed: { ...defaultEmbed('gmaps'), address },
  }), row);
  applyEdit(map, 'mobile', e => { e.h = 300; });
  btn.route = map.id;
  btn.link = { type: 'url', url: directionsUrl(address), newTab: true };
  return outer;
};

const priceList = () => {
  const { outer, inner } = section('Preisliste', [paint('Hintergrund')]);
  const c = inner({ gap: 'l', align: 'stretch', maxW: 860 });
  txt(c, 'Unsere Preise', { size: 40, weight: 800, tag: 'h2', align: 'center', name: 'Überschrift' });
  const groups: [string, [string, string, string][]][] = [
    ['Kaffee', [['Espresso', 'Kräftig, aus eigener Röstung', '2,40 €'], ['Cappuccino', 'Mit fein aufgeschäumter Milch', '3,60 €'], ['Filterkaffee', 'Frisch aufgebrüht, Nachfüllen gratis', '3,20 €']]],
    ['Kuchen', [['Käsekuchen', 'Nach Omas Rezept', '3,90 €'], ['Apfelkuchen', 'Mit Sahne', '3,80 €']]],
  ];
  for (const [g, items] of groups) {
    const grp = box(c, g, { gap: 0, pad: [0, 0, 0, 0] });
    txt(grp, g, { size: 15, weight: 700, role: 'Hauptfarbe', upper: true, ls: 1.2, tag: 'h3', name: 'Gruppe' });
    for (const [name, desc, price] of items) {
      const r = box(grp, name, { dir: 'row', gap: 'm', pad: [16, 0, 16, 0], align: 'start', justify: 'space-between' });
      const l = box(r, 'Angebot', { gap: 4, pad: [0, 0, 0, 0] });
      txt(l, name, { size: 19, weight: 600, name: 'Name' });
      txt(l, desc, { size: 15, role: 'Text leise', name: 'Beschreibung' });
      txt(r, price, { size: 19, weight: 600, name: 'Preis', align: 'right' }).sizingH = 'auto';
    }
  }
  return outer;
};

const booking = () => {
  const { outer, inner } = section('Terminanfrage', [paint('Fläche')]);
  const row = inner({ dir: 'row', gap: 'xl', align: 'start', stackMobile: true });
  const t = box(row, 'Text', { gap: 'm', pad: [0, 0, 0, 0], maxW: 420 });
  txt(t, 'Termin anfragen', { size: 40, weight: 800, tag: 'h2', name: 'Überschrift' });
  txt(t, 'Wähle einen Wunschtermin. Wir melden uns schnell und bestätigen ihn dir per E-Mail oder Telefon.', { size: 18, role: 'Text leise', name: 'Text' });
  const ds = findLegalPage(C.doc, 'datenschutz');
  const form = buildFormBoard(C.pg, mainFont(C.doc), ['name', 'email', 'telefon', 'datum', 'uhrzeit', 'nachricht'], 'Terminanfrage über die Website', ds?.id ?? null, 'Termin anfragen');
  form.parentId = row.id; row.children.push(form.id);
  form.sizingH = 'fill';
  form.fills = [paint('Hintergrund')];
  form.radius = 20;
  if (form.layout) { const p = C.space.l; form.layout = { ...form.layout, padding: [p, p, p, p] }; }
  // Knopf in der Hauptfarbe
  const btn = form.children.map(k => C.pg.nodes[k]).find(k => k?.formSubmit);
  if (btn) { btn.fills = [paint('Hauptfarbe')]; btn.radius = 999; const bt = C.pg.nodes[btn.children[0]]; if (bt) bt.fills = [paint('Auf Hauptfarbe')]; }
  return outer;
};

// ---------- Aufklappen, Reiter, Pop-up ----------

function accordionBox(parent: WNode | null, items: [string, string][]): WNode {
  const acc = box(parent, 'Akkordeon', { gap: 's', pad: [0, 0, 0, 0], w: 800, maxW: parent ? 860 : undefined, extra: { accordion: { single: true, firstOpen: false } } });
  for (const [q, a] of items) {
    const it = box(acc, q, { gap: 's', pad: [18, 22, 18, 22], fill: [paint('Fläche')], radius: 14 });
    const head = box(it, 'Kopfzeile', { dir: 'row', gap: 'm', pad: [0, 0, 0, 0], align: 'center', justify: 'space-between' });
    txt(head, q, { size: 18, weight: 600, name: 'Frage' });
    const ic = txt(head, '+', { size: 24, weight: 400, role: 'Hauptfarbe', name: 'Symbol', align: 'center' });
    ic.sizingH = 'auto';
    txt(it, a, { size: 16, role: 'Text leise', name: 'Antwort' });
  }
  return acc;
}

const faq = () => {
  const { outer, inner } = section('Fragen und Antworten', [paint('Hintergrund')]);
  const c = inner({ gap: 'l', align: 'center', maxW: 860 });
  txt(c, 'Häufige Fragen', { size: 40, weight: 800, tag: 'h2', align: 'center', name: 'Überschrift' });
  accordionBox(c, [
    ['Wie lange dauert es?', 'Meist nur wenige Tage. Schreib uns, dann sagen wir dir genau, wann es losgehen kann.'],
    ['Was kostet das?', 'Das hängt vom Umfang ab. Die Preise oben geben dir einen guten Anhaltspunkt.'],
    ['Kann ich später noch etwas ändern?', 'Ja, jederzeit. Sag einfach Bescheid.'],
    ['Wie erreiche ich euch?', 'Per E-Mail oder Telefon – die Angaben findest du unten bei „Kontakt“.'],
  ]);
  return outer;
};

function tabsBox(): WNode {
  const t = box(null, 'Reiter', { gap: 'l', pad: [0, 0, 0, 0], w: 900, extra: { tabs: {} } });
  const bar = box(t, 'Reiter-Leiste', { dir: 'row', gap: 's', pad: [0, 0, 0, 0], align: 'center' });
  const names = ['Erster Reiter', 'Zweiter Reiter', 'Dritter Reiter'];
  for (const n of names) {
    const b = box(bar, n, { dir: 'row', gap: 0, pad: [10, 18, 10, 18], align: 'center', fill: [paint('Fläche')], radius: 999, sizingH: 'auto' });
    txt(b, n, { size: 15, weight: 600, name: n }).sizingH = 'auto';
  }
  names.forEach((n, i) => {
    const pnl = box(t, `Inhalt ${i + 1}`, { gap: 's', pad: 'l', fill: [paint('Fläche')], radius: 20 });
    txt(pnl, n, { size: 24, weight: 700, tag: 'h3', name: 'Titel' });
    txt(pnl, `Hier steht der Inhalt zum ${n.split(' ')[0].toLowerCase()} Reiter. Ersetze ihn durch Text, Bilder oder ganze Abschnitte.`, { size: 16, role: 'Text leise', name: 'Text' });
  });
  return t;
}

function popupBox(): WNode {
  const p = box(null, 'Pop-up', { gap: 'm', pad: 'xl', w: 480, align: 'center', fill: [paint('Hintergrund')], radius: 24,
    extra: { popup: { open: 'link', delay: 5, once: true }, shadows: [{ ...makeShadow(), y: 24, blur: 60, opacity: 0.25 }] } });
  txt(p, 'Schön, dass du da bist!', { size: 28, weight: 800, tag: 'h2', align: 'center', name: 'Überschrift' });
  txt(p, 'Hier ist Platz für eine Nachricht, ein Angebot oder einen Hinweis.', { size: 16, role: 'Text leise', align: 'center', name: 'Text' });
  button(p, 'Alles klar');
  return p;
}

/** Baustein bauen und einfügen: in das ausgewählte Board (mit Layout) bzw. auf die Seite */
function insertBuilt(build: () => WNode, opts: { free?: boolean; section?: string } = {}): string | null {
  const s = useEditor.getState();
  let made: string | null = null;
  s.mutate((pg, d: WDocument) => {
    C = { pg, colors: d.library.colors, space: spaceOf(d), doc: d };
    const sel = s.selection.length === 1 ? pg.nodes[s.selection[0]] : undefined;
    const intoBoard = sel?.type === 'board' && !sel.embed && !sel.nav;
    let n = build();
    // Direkt auf die Seite: in einen eigenen Abschnitt mit Rand und Höchstbreite
    if (opts.section && !intoBoard) {
      const inner0 = n;
      const { outer, inner } = section(opts.section, [paint('Hintergrund')], 'l');
      const c = inner({ gap: 0, align: 'center', maxW: 960 });
      inner0.parentId = c.id; c.children.push(inner0.id); inner0.sizingH = 'fill';
      const root = siteRoot(pg);
      if (!root) return;
      placeSection(pg, root, outer, s.selection);
      made = outer.id;
      return;
    }
    delete pg.nodes[n.id];
    if (opts.free) {
      const root = siteRoot(pg);
      if (!root) return;
      pg.nodes[n.id] = n; n.parentId = root.id; n.absolute = true;
      n.x = Math.round((root.w - n.w) / 2); n.y = 160;
      n.overrides = { ...n.overrides, mobile: { ...n.overrides?.mobile, x: 20, w: 350 }, tablet: { ...n.overrides?.tablet, x: Math.round((768 - n.w) / 2) } };
      root.children.push(n.id);
      made = n.id;
      return;
    }
    if (placeNew(pg, n, s.selection)) made = n.id;
  }, { key: 'block-add' });
  if (made) s.setSelection([made]);
  return made;
}

export const insertAccordion = () => insertBuilt(() => accordionBox(null, [
  ['Erste Frage', 'Die Antwort erscheint, wenn man auf die Frage klickt.'],
  ['Zweite Frage', 'Jeder Eintrag hat eine Kopfzeile und einen Inhalt zum Aufklappen.'],
  ['Dritte Frage', 'Weitere Einträge legst du rechts mit „Eintrag hinzufügen“ an.'],
]), { section: 'Akkordeon-Abschnitt' });
export const insertTabs = () => insertBuilt(tabsBox, { section: 'Reiter-Abschnitt' });
export const insertPopup = () => insertBuilt(popupBox, { free: true });

/** Neuer Eintrag im Akkordeon bzw. neuer Reiter (Kopie des letzten) */
export function addPart(id: string) {
  useEditor.getState().mutate(pg => {
    const n = pg.nodes[id];
    if (!n) return;
    const src = n.tabs ? [pg.nodes[n.children[0]]?.children.at(-1), n.children.at(-1)] : [n.children.at(-1)];
    for (const sid of src) {
      if (!sid) continue;
      const orig = pg.nodes[sid];
      const copy = (nid: string, parent: string): string => {
        const o = pg.nodes[nid];
        const c: WNode = { ...JSON.parse(JSON.stringify(o)), id: Math.random().toString(36).slice(2, 10), parentId: parent, children: [] };
        pg.nodes[c.id] = c;
        c.children = o.children.map(k => copy(k, c.id));
        return c.id;
      };
      const cid = copy(sid, orig.parentId!);
      const par = pg.nodes[orig.parentId!];
      par.children.splice(par.children.indexOf(sid) + 1, 0, cid);
      const cn = pg.nodes[cid];
      const num = par.children.length - (par.tabs ? 1 : 0);
      if (n.tabs) { cn.name = par.id === n.id ? `Inhalt ${num}` : `Reiter ${num}`; const t = cn.children.map(k => pg.nodes[k]).find(k => k?.type === 'text'); if (t && par.id !== n.id) { t.text = `Reiter ${num}`; t.name = t.text; } }
      else { cn.name = `Eintrag ${num}`; }
    }
  }, { key: 'part-add' });
}

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
  { id: 'faq', group: 'Abschluss', label: 'Fragen', tip: 'Häufige Fragen zum Aufklappen (Akkordeon)', build: faq },
  { id: 'cta', group: 'Abschluss', label: 'Aufruf', tip: 'Farbiges Band mit Satz und Knopf', build: cta },
  { id: 'contact', group: 'Abschluss', label: 'Kontakt', tip: 'Text und Kontaktangaben', build: contact },
  { id: 'hours', group: 'Für Betriebe', label: 'Öffnungszeiten', tip: 'Öffnungszeiten je Wochentag – auf der Website steht dazu „Jetzt geöffnet“ oder „Gerade geschlossen“', build: hoursSec },
  { id: 'directions', group: 'Für Betriebe', label: 'Anfahrt', tip: 'Adresse, Karte und ein Knopf „Route planen“', build: directions },
  { id: 'prices', group: 'Für Betriebe', label: 'Preisliste', tip: 'Speisekarte oder Preisliste: Name, kurze Beschreibung, Preis', build: priceList },
  { id: 'booking', group: 'Für Betriebe', label: 'Termin', tip: 'Terminanfrage mit Wunschdatum und Uhrzeit – kommt bei dir als E-Mail an', build: booking },
];

/** Abschnitt auf der Seite einsetzen: leere Seite → „Untereinander“, sonst nach der Auswahl bzw. am Ende (vor der Fußzeile) */
function placeSection(pg: Page, root: WNode, sec: WNode, selection: string[]) {
  const s = { selection };
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
}

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
    C = { pg, colors: d.library.colors, space: spaceOf(d), doc: d };
    const sec = def.build();
    placeSection(pg, root, sec, s.selection);
    made = sec.id;
  }, { key: 'section-add' });
  if (made) s.setSelection([made]);
  return made;
}
