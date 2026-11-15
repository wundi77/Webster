// Eigener Code: Code-Block als Ebene (abgeschotteter Rahmen) und Hilfen für Website-CSS
import type { CodeBlock } from './types';
import { createNode } from './factory';
import { useEditor } from '../store';
import { placeNew } from './embed';

/** Beispiel, damit sofort etwas zu sehen ist */
export const defaultCodeBlock = (): CodeBlock => ({
  html: '<div class="kreis"></div>',
  css: `body { display: grid; place-items: center; background: transparent; }
.kreis {
  width: 80px; height: 80px; border-radius: 50%;
  background: linear-gradient(135deg, #6A55F5, #FF3B6B);
  animation: pulsieren 2s ease-in-out infinite;
}
@keyframes pulsieren {
  50% { transform: scale(1.25); opacity: .7; }
}`,
  js: '',
});

/** Vollständiges HTML-Dokument für den Rahmen (srcdoc) */
export function codeSrcdoc(cb: CodeBlock): string {
  const js = cb.js.trim() ? `<script>${cb.js.replace(/<\/script/gi, '<\\/script')}</script>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}${cb.css.replace(/<\/style/gi, '<\\/style')}</style></head>`
    + `<body>${cb.html}${js}</body></html>`;
}

/** Erlaubnisse des Rahmens: Skripte ja, Zugriff auf die Seite/den Editor nein */
export const CODE_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';

export function insertCodeBlock(): string | null {
  const s = useEditor.getState();
  const node = createNode('rect', { name: 'Eigener Code', w: 480, h: 270, fills: [], codeBlock: defaultCodeBlock() });
  let ok = false;
  s.mutate(pg => { ok = placeNew(pg, node, s.selection); });
  if (!ok) return null;
  s.setSelection([node.id]);
  return node.id;
}

/** Nur @keyframes und @font-face aus dem Website-CSS – die dürfen auch im Editor wirken, ohne ihn zu verstellen */
export function editorSafeCss(css: string): string {
  if (!css.trim()) return '';
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return [...sheet.cssRules].filter(r => r instanceof CSSKeyframesRule || r instanceof CSSFontFaceRule).map(r => r.cssText).join('\n');
  } catch { return ''; }
}
