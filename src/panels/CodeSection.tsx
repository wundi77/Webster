// Eigener Code: Code-Block-Ebene, eigenes CSS pro Ebene, Code für die ganze Website
import { useEffect, useState } from 'react';
import { useEditor } from '../store';
import type { CodeBlock, SiteSettings, WNode } from '../model/types';
import { updateNodes } from '../model/commands';
import { currentPageHasRoot } from '../model/embed';
import { insertCodeBlock } from '../model/code';
import { defaultSite } from '../model/factory';
import { Section } from '../ui/controls';
import { Icons } from '../ui/icons';

/** Mehrzeiliges Code-Feld; übernimmt beim Verlassen des Feldes (und mit ⌘↩) */
export function CodeArea({ value, onCommit, label, placeholder, rows = 6 }: {
  value: string; onCommit: (v: string) => void; label: string; placeholder?: string; rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return (
    <label className="code-field">
      <span className="field-label">{label}</span>
      <textarea className="code-area" value={draft} rows={rows} placeholder={placeholder} spellCheck={false}
        autoCapitalize="off" autoCorrect="off" aria-label={label}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation(); // keine Tastenkürzel des Editors beim Tippen
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
          if (e.key === 'Tab') { // Tab rückt ein statt das Feld zu verlassen
            e.preventDefault();
            const t = e.currentTarget, s = t.selectionStart, en = t.selectionEnd;
            const v = draft.slice(0, s) + '  ' + draft.slice(en);
            setDraft(v);
            requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; });
          }
        }} />
    </label>
  );
}

/** Design-Reiter: Inhalt eines Code-Blocks */
export function CodeBlockSection({ node }: { node: WNode }) {
  const cb = node.codeBlock!;
  const set = (patch: Partial<CodeBlock>, key: string) =>
    updateNodes([node.id], n => { n.codeBlock = { ...n.codeBlock!, ...patch }; }, 'code-' + key);
  return (
    <Section title="Eigener Code">
      <CodeArea label="HTML" value={cb.html} onCommit={v => set({ html: v }, 'html')} placeholder={'<div class="box">Hallo</div>'} rows={5} />
      <CodeArea label="CSS" value={cb.css} onCommit={v => set({ css: v }, 'css')} placeholder=".box { color: hotpink; }" rows={8} />
      <CodeArea label="JavaScript" value={cb.js} onCommit={v => set({ js: v }, 'js')} placeholder="// optional" rows={5} />
      <p className="hint">
        Übernommen wird beim Verlassen eines Feldes (oder mit {'⌘↩'}). Der Code läuft in einem eigenen, abgeschotteten Rahmen
        in Größe dieser Ebene – im Editor, in der Vorschau und auf der Website. Er kann die übrige Seite nicht verändern.
        Größe und Position stellst du wie bei jeder Ebene ein.
      </p>
    </Section>
  );
}

/** Prototyp-Reiter ohne Auswahl: Code-Block einfügen */
export function CodeInsertSection() {
  const hasRoot = useEditor(s => { void s.pageId; return currentPageHasRoot(); });
  return (
    <Section title="Eigener Code">
      <p className="proto-hint">Fertigen Code (HTML, CSS, JavaScript) einfügen, z. B. eine Animation. Läuft abgeschottet in einem eigenen Rahmen.</p>
      <div className="row">
        <button type="button" className="btn grow" disabled={!hasRoot} onClick={() => insertCodeBlock()}><Icons.edit /> Code-Block einfügen</button>
      </div>
    </Section>
  );
}

/** Code-Reiter: eigenes CSS für die ausgewählte(n) Ebene(n) */
export function CustomCssField({ nodes }: { nodes: WNode[] }) {
  const vals = nodes.map(n => n.customCss ?? '');
  const same = vals.every(v => v === vals[0]);
  return (
    <section className="section">
      <div className="section-head"><span>Eigenes CSS</span></div>
      <CodeArea label={nodes.length > 1 ? `Für ${nodes.length} Ebenen` : 'Zusätzliche Angaben für diese Ebene'} rows={5}
        value={same ? vals[0] : ''} placeholder={same ? 'z. B.\nmix-blend-mode: multiply;\nanimation: drehen 4s linear infinite;' : 'Unterschiedlich – Eingabe ersetzt alle'}
        onCommit={v => updateNodes(nodes.map(n => n.id), n => { n.customCss = v.trim() ? v : undefined; }, 'custom-css')} />
      <p className="hint">
        Eine Angabe pro Zeile, z. B. <code>filter: grayscale(1);</code>. Sie gilt im Editor, in der Vorschau und auf der Website
        und hat Vorrang vor den Reglern. Animationen (<code>@keyframes</code>) legst du im Reiter „Gestalten“ (ohne Auswahl) unter „Code der Website“ an.
      </p>
    </section>
  );
}

const setSite = (patch: Partial<SiteSettings>, key: string) =>
  useEditor.getState().mutate((_, d) => { d.site = { ...defaultSite(), ...d.site, ...patch }; }, { key: `site-${key}`, system: true });

/** Prototyp-Reiter ohne Auswahl: Code für alle Seiten */
export function SiteCodeSection() {
  const site = useEditor(s => s.doc.site);
  const [open, setOpen] = useState(!!(site?.css || site?.headCode || site?.bodyCode));
  return (
    <Section title="Code der Website">
      {!open ? (
        <>
          <p className="proto-hint">Eigenes CSS und eigener Code für alle Seiten, z. B. Animationen oder ein Besucherzähler.</p>
          <div className="row"><button type="button" className="btn grow" onClick={() => setOpen(true)}>Code-Felder anzeigen</button></div>
        </>
      ) : (
        <>
          <CodeArea label="CSS für alle Seiten" rows={7} value={site?.css ?? ''} onCommit={v => setSite({ css: v }, 'css')}
            placeholder={'@keyframes drehen {\n  to { transform: rotate(360deg); }\n}'} />
          <p className="hint">Wirkt in Vorschau und Export. Im Editor werden davon nur <code>@keyframes</code> und <code>@font-face</code> angewendet, damit die Arbeitsfläche unverändert bleibt.</p>
          <CodeArea label="Code im Kopf (<head>)" rows={4} value={site?.headCode ?? ''} onCommit={v => setSite({ headCode: v }, 'head')}
            placeholder={'<link rel="stylesheet" href="…">'} />
          <CodeArea label="Code am Ende (vor </body>)" rows={4} value={site?.bodyCode ?? ''} onCommit={v => setSite({ bodyCode: v }, 'body')}
            placeholder={'<script>…</script>'} />
          <p className="hint">
            Nur in Vorschau und Export aktiv, nicht im Editor. Achtung Datenschutz: Lädt der Code etwas von fremden Servern
            (z. B. Statistik, Schriften, Chat), musst du das in der Datenschutzerklärung nennen und ggf. vorher um Zustimmung fragen.
          </p>
        </>
      )}
    </Section>
  );
}
