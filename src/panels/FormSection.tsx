// Einstellungen für das Kontaktformular (Tab Prototyp)
import { useEditor, viewPage } from '../store';
import type { WNode } from '../model/types';
import { defaultForm, FIELDS, formGroups, formOf, insertForm, setForm, toggleField } from '../model/form';
import { siteRoot } from '../export/html';
import { Section } from '../ui/controls';
import { Icons } from '../ui/icons';

const MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function FormSection({ node }: { node: WNode }) {
  const form = useEditor(s => formOf(viewPage(s), node.id));
  const groups = useEditor(s => { const f = formOf(viewPage(s), node.id); return f ? [...formGroups(viewPage(s), f).keys()].join(',') : ''; });
  if (!form) return null;
  const cfg = { ...defaultForm(), ...form.form };
  const valid = MAIL.test(cfg.to.trim());
  const have = new Set(groups.split(','));
  return (
    <Section title="Kontaktformular">
      <div className="field">
        <div className="field-label">Nachrichten gehen an</div>
        <input className="textinput" type="email" value={cfg.to} placeholder="deine@adresse.de" spellCheck={false}
          onChange={e => setForm(form.id, { to: e.target.value.trim() })}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        {!valid && <p className="notice warn">Trage deine E-Mail-Adresse ein – sonst weiß das Formular nicht, wohin.</p>}
        <div className="field-hint">Die Adresse steht verschlüsselt in der Website, damit Spam-Programme sie nicht einsammeln.</div>
      </div>
      <div className="field">
        <div className="field-label">Betreff (wenn keiner eingegeben wird)</div>
        <input className="textinput" value={cfg.subject} onChange={e => setForm(form.id, { subject: e.target.value })} />
      </div>
      <div className="field">
        <div className="field-label">Felder</div>
        {FIELDS.map(f => (
          <label key={f.key} className="check" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={have.has(f.key)} disabled={!f.optional} onChange={e => toggleField(form.id, f.key, e.target.checked)} />
            <span>{f.label}{!f.optional && <span className="muted"> (immer dabei)</span>}</span>
          </label>
        ))}
      </div>
      <p className="proto-hint">Beim Absenden öffnet sich das E-Mail-Programm der Besucher mit der fertigen Nachricht – sie schicken sie dort ab. Aussehen der Felder und des Knopfs änderst du wie bei jedem Board im Tab Design. Ausprobieren in der Vorschau (P).</p>
    </Section>
  );
}

/** Für den Prototyp-Tab ohne Auswahl */
export function FormInsertSection() {
  const hasRoot = useEditor(s => !!siteRoot(viewPage(s)));
  return (
    <Section title="Kontaktformular">
      <p className="proto-hint">Fügt ein Formular mit Name, E-Mail und Nachricht unten auf dieser Seite ein. Danach kannst du es verschieben und gestalten.</p>
      <div className="row"><button type="button" className="btn grow" disabled={!hasRoot} onClick={() => insertForm()}><Icons.plus /> Kontaktformular einfügen</button></div>
    </Section>
  );
}
