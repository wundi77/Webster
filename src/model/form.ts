// Kontaktformular: wird auf der Website zu einem echten Formular. Beim Absenden öffnet sich
// das E-Mail-Programm der Besucher mit vorausgefüllter Nachricht (mailto) – ohne Server.
import type { FormFieldKey, FormSettings, Page, WDocument, WNode } from './types';
import { createNode, defaultTextStyle, makeFill, makeLayout, makeStroke } from './factory';
import { siteRoot } from '../export/html';
import { isFooter, isHeader } from './css';
import { appendChild } from './commands';
import { findLegalPage, mainFont } from './legal';
import { useEditor, viewPage } from '../store';

export const FORM_NAME = 'Kontaktformular';

export const FIELDS: { key: FormFieldKey; label: string; placeholder: string; required: boolean; optional: boolean }[] = [
  { key: 'name', label: 'Name', placeholder: 'Vor- und Nachname', required: true, optional: false },
  { key: 'email', label: 'E-Mail', placeholder: 'name@beispiel.de', required: true, optional: false },
  { key: 'telefon', label: 'Telefon', placeholder: 'Optional', required: false, optional: true },
  { key: 'datum', label: 'Wunschtermin', placeholder: 'TT.MM.JJJJ', required: false, optional: true },
  { key: 'uhrzeit', label: 'Uhrzeit', placeholder: 'z. B. 10:00', required: false, optional: true },
  { key: 'betreff', label: 'Betreff', placeholder: 'Worum geht es?', required: false, optional: true },
  { key: 'nachricht', label: 'Nachricht', placeholder: 'Ihre Nachricht …', required: true, optional: false },
];
export const fieldInfo = (k: FormFieldKey) => FIELDS.find(f => f.key === k)!;

export const defaultForm = (): FormSettings => ({ to: '', subject: 'Anfrage über die Website' });

/** Formular, zu dem eine Ebene gehört */
export function formOf(page: Page, id: string): WNode | undefined {
  let n: WNode | undefined = page.nodes[id];
  while (n) { if (n.form) return n; n = page.nodes[n.parentId ?? '']; }
  return undefined;
}

/** Feldgruppen eines Formulars (Board mit Beschriftung + Eingabefeld) */
export function formGroups(page: Page, form: WNode): Map<FormFieldKey, string> {
  const m = new Map<FormFieldKey, string>();
  const walk = (id: string, group: string | null) => {
    const n = page.nodes[id];
    if (!n) return;
    if (n.formField) { m.set(n.formField, group ?? n.id); return; }
    n.children.forEach(c => walk(c, id === form.id ? c : group));
  };
  form.children.forEach(c => walk(c, c));
  return m;
}

function addTo(pg: Page, n: WNode, parent: WNode, index?: number) {
  pg.nodes[n.id] = n;
  n.parentId = parent.id;
  if (index === undefined || index < 0) parent.children.push(n.id); else parent.children.splice(index, 0, n.id);
  return n;
}

const txt = (font: string, t: string, size: number, weight: number, color: string, extra: Partial<WNode> = {}) => createNode('text', {
  name: t, text: t, sizingH: 'fill', sizingV: 'auto', fills: [makeFill(color)],
  textStyle: { ...defaultTextStyle(), fontFamily: font, fontSize: size, fontWeight: weight, lineHeight: 1.4 }, ...extra,
});

/** Eine Feldgruppe in das Formular einsetzen */
function buildGroup(pg: Page, form: WNode, key: FormFieldKey, font: string, index?: number) {
  const f = fieldInfo(key);
  const group = addTo(pg, createNode('board', {
    name: `Feld ${f.label}`, sizingH: 'fill', sizingV: 'auto', fills: [], clip: false,
    layout: { ...makeLayout('flex', 'column'), gap: 6, padding: [0, 0, 0, 0], align: 'stretch' },
  }), form, index);
  addTo(pg, txt(font, f.required ? `${f.label} *` : f.label, 14, 600, '#222222', { name: 'Beschriftung', formLabel: true }), group);
  const stroke = { ...makeStroke(), color: '#CCCCCC', width: 1 };
  const box = addTo(pg, createNode('board', {
    name: `Eingabe ${f.label}`, formField: key, sizingH: 'fill', sizingV: 'fixed', h: key === 'nachricht' ? 140 : 46,
    fills: [makeFill('#FFFFFF')], strokes: [stroke], radius: 8, clip: true,
    layout: { ...makeLayout('flex', 'row'), padding: [11, 14, 11, 14], gap: 0, align: key === 'nachricht' ? 'start' : 'center' },
  }), group);
  addTo(pg, txt(font, f.placeholder, 16, 400, '#222222', { name: 'Platzhalter', opacity: 0.5 }), box);
}

/** Formular-Board mit Feldern, Knopf und Datenschutz-Hinweis bauen (noch ohne Eltern-Element) */
export function buildFormBoard(pg: Page, font: string, keys: FormFieldKey[], subject: string, dsPageId: string | null, button = 'Nachricht senden'): WNode {
  const form = createNode('board', {
    name: FORM_NAME, w: 560, h: 600, sizingV: 'auto', fills: [], clip: false,
    layout: { ...makeLayout('flex', 'column'), gap: 18, padding: [0, 0, 0, 0], align: 'stretch' },
    form: { ...defaultForm(), subject },
  });
  pg.nodes[form.id] = form;
  for (const f of FIELDS.filter(f => keys.includes(f.key))) buildGroup(pg, form, f.key, font);
  const btn = addTo(pg, createNode('board', {
    name: 'Senden-Knopf', formSubmit: true, sizingH: 'auto', sizingV: 'auto', fills: [makeFill('#111111')], radius: 8, clip: false,
    layout: { ...makeLayout('flex', 'row'), padding: [13, 26, 13, 26], gap: 0, align: 'center', justify: 'center' },
    alignSelf: 'start', hover: { opacity: 0.85 }, hoverDuration: 150,
  }), form);
  addTo(pg, txt(font, button, 16, 600, '#FFFFFF', { sizingH: 'auto' }), btn);
  addTo(pg, txt(font, dsPageId ? 'Beim Senden öffnet sich Ihr E-Mail-Programm. Hinweise zum Datenschutz finden Sie in unserer Datenschutzerklärung.' : 'Beim Senden öffnet sich Ihr E-Mail-Programm.', 13, 400, '#666666',
    { name: 'Datenschutz-Hinweis', link: dsPageId ? { type: 'page', pageId: dsPageId } : null }), form);
  return form;
}

/** Kontaktformular auf der aktuellen Seite einfügen */
export function insertForm(): string | null {
  const s = useEditor.getState();
  const page = viewPage(s);
  const root = siteRoot(page);
  if (!root) return null;
  const doc = s.doc;
  const font = mainFont(doc);
  const ds = findLegalPage(doc, 'datenschutz');
  let formId = '';
  s.mutate(pg => {
    const r = pg.nodes[root.id];
    const form = buildFormBoard(pg, font, FIELDS.filter(f => !f.optional).map(f => f.key), defaultForm().subject, ds?.id ?? null);
    form.parentId = r.id;

    if (r.layout) {
      appendChild(pg, r.id, form.id);
      form.alignSelf = 'auto';
    } else {
      // Ohne Layout: unter den bisherigen Inhalt setzen und das Board verlängern
      const bottom = Math.max(0, ...r.children.map(c => pg.nodes[c]).filter(n => n && !isHeader(n) && !isFooter(n)).map(n => n.y + n.h));
      const foot = r.children.map(c => pg.nodes[c]).find(n => isFooter(n));
      form.x = 120; form.y = bottom + 80;
      form.overrides = { mobile: { x: 20, w: 350 }, tablet: { x: 40, w: 560 } };
      const grow = 640;
      if (foot) { foot.y += grow; for (const bp of ['tablet', 'mobile'] as const) if (foot.overrides?.[bp]?.y !== undefined) (foot.overrides[bp] as { y: number }).y += grow; }
      r.h += grow;
      for (const bp of ['tablet', 'mobile'] as const) if (r.overrides?.[bp]?.h !== undefined) r.overrides[bp]!.h = (r.overrides[bp]!.h as number) + grow;
      const fi = foot ? r.children.indexOf(foot.id) : -1;
      if (fi >= 0) r.children.splice(fi, 0, form.id); else r.children.push(form.id);
    }
    formId = form.id;
  });
  s.setSelection([formId]);
  return formId;
}

/** Optionales Feld ein- oder ausschalten */
export function toggleField(formId: string, key: FormFieldKey, on: boolean) {
  const s = useEditor.getState();
  const font = mainFont(s.doc);
  s.mutate(pg => {
    const form = pg.nodes[formId];
    if (!form) return;
    const groups = formGroups(pg, form);
    const existing = groups.get(key);
    if (!on && existing) {
      const kill = (id: string) => { pg.nodes[id]?.children.forEach(kill); delete pg.nodes[id]; };
      const parent = pg.nodes[pg.nodes[existing]?.parentId ?? ''];
      if (parent) parent.children = parent.children.filter(c => c !== existing);
      kill(existing);
    } else if (on && !existing) {
      // vor dem nächsten vorhandenen Feld (Reihenfolge wie in FIELDS) bzw. vor dem Knopf einfügen
      const order = FIELDS.map(f => f.key);
      const next = order.slice(order.indexOf(key) + 1).map(k => groups.get(k)).find(Boolean);
      const btn = form.children.find(c => pg.nodes[c]?.formSubmit);
      const idx = next && form.children.includes(next) ? form.children.indexOf(next) : btn ? form.children.indexOf(btn) : -1;
      buildGroup(pg, form, key, font, idx);
    }
  }, { key: `form-${key}` });
}

export function setForm(formId: string, patch: Partial<FormSettings>) {
  useEditor.getState().mutate(pg => {
    const f = pg.nodes[formId];
    if (f) f.form = { ...defaultForm(), ...f.form, ...patch };
  }, { key: 'form-settings' });
}

/** Formulare ohne Empfänger-Adresse (für die Prüfliste) */
export function formsWithoutRecipient(doc: WDocument): { page: Page; id: string }[] {
  const out: { page: Page; id: string }[] = [];
  for (const p of doc.pages) for (const id in p.nodes) { const f = p.nodes[id].form; if (f && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.to.trim())) out.push({ page: p, id }); }
  return out;
}
