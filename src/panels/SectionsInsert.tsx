// Fertige Abschnitte einfügen – mit kleinen Skizzen
import { useEditor } from '../store';
import { SECTIONS, insertSection } from '../model/sections';
import { currentPageHasRoot } from '../model/embed';
import { Section } from '../ui/controls';

const P = 'var(--accent)', T = 'currentColor', F = 'var(--text-3)';
/** Skizzen 60×40 */
const SKETCH: Record<string, React.ReactNode> = {
  'hero-center': <><rect x="14" y="10" width="32" height="5" rx="1" fill={T} /><rect x="18" y="18" width="24" height="2" rx="1" fill={F} /><rect x="20" y="25" width="9" height="5" rx="2.5" fill={P} /><rect x="31" y="25" width="9" height="5" rx="2.5" fill="none" stroke={F} /></>,
  'hero-split': <><rect x="6" y="11" width="22" height="4" rx="1" fill={T} /><rect x="6" y="18" width="18" height="2" rx="1" fill={F} /><rect x="6" y="24" width="9" height="4" rx="2" fill={P} /><rect x="33" y="7" width="21" height="26" rx="3" fill={F} opacity=".5" /></>,
  'hero-color': <><rect x="2" y="2" width="56" height="36" rx="3" fill={P} opacity=".85" /><rect x="14" y="13" width="32" height="5" rx="1" fill="#fff" /><rect x="24" y="23" width="12" height="5" rx="2.5" fill="#fff" /></>,
  'hero-depth': <><circle cx="12" cy="10" r="12" fill={P} opacity=".3" /><circle cx="50" cy="30" r="9" fill="var(--warn, #f5a623)" opacity=".35" /><rect x="14" y="13" width="32" height="5" rx="1" fill={T} /><rect x="18" y="21" width="24" height="2" rx="1" fill={F} /><rect x="24" y="27" width="12" height="5" rx="2.5" fill={P} /></>,
  features: <>{[6, 23, 40].map(x => <g key={x}><rect x={x} y="9" width="14" height="22" rx="2" fill={F} opacity=".35" /><circle cx={x + 4} cy="14" r="2" fill={P} /><rect x={x + 2} y="19" width="9" height="2" rx="1" fill={T} /><rect x={x + 2} y="24" width="10" height="1.5" rx=".75" fill={F} /></g>)}</>,
  media: <><rect x="6" y="8" width="22" height="24" rx="3" fill={F} opacity=".5" /><rect x="33" y="13" width="20" height="4" rx="1" fill={T} /><rect x="33" y="20" width="18" height="2" rx="1" fill={F} /><rect x="33" y="24" width="15" height="2" rx="1" fill={F} /></>,
  'media-flip': <><rect x="2" y="2" width="56" height="36" rx="3" fill={F} opacity=".2" /><rect x="7" y="13" width="20" height="4" rx="1" fill={T} /><rect x="7" y="20" width="18" height="2" rx="1" fill={F} /><rect x="7" y="24" width="15" height="2" rx="1" fill={F} /><rect x="32" y="8" width="22" height="24" rx="3" fill={F} opacity=".5" /></>,
  numbers: <>{[5, 19, 33, 47].map(x => <g key={x}><rect x={x} y="13" width="9" height="7" rx="1" fill={P} /><rect x={x} y="23" width="9" height="2" rx="1" fill={F} /></g>)}</>,
  quote: <><text x="30" y="16" fontSize="14" textAnchor="middle" fill={P} fontWeight="800">“</text><rect x="10" y="18" width="40" height="3" rx="1" fill={T} /><rect x="14" y="23" width="32" height="3" rx="1" fill={T} /><circle cx="25" cy="32" r="2.5" fill={F} /><rect x="29" y="31" width="9" height="2" rx="1" fill={F} /></>,
  quotes: <>{[6, 23, 40].map(x => <g key={x}><rect x={x} y="9" width="14" height="22" rx="2" fill={F} opacity=".35" /><rect x={x + 2} y="12" width="8" height="1.5" fill="var(--warn, #f5a623)" /><rect x={x + 2} y="17" width="10" height="1.5" rx=".75" fill={T} /><rect x={x + 2} y="21" width="9" height="1.5" rx=".75" fill={T} /><rect x={x + 2} y="26" width="6" height="1.5" rx=".75" fill={F} /></g>)}</>,
  pricing: <>{[6, 23, 40].map((x, i) => <g key={x}><rect x={x} y={i === 1 ? 6 : 9} width="14" height={i === 1 ? 28 : 24} rx="2" fill={i === 1 ? P : F} opacity={i === 1 ? 1 : 0.35} /><rect x={x + 2} y="14" width="8" height="4" rx="1" fill={i === 1 ? '#fff' : T} /><rect x={x + 2} y="26" width="10" height="3" rx="1.5" fill={i === 1 ? '#fff' : P} /></g>)}</>,
  cta: <><rect x="4" y="10" width="52" height="20" rx="4" fill={P} /><rect x="9" y="16" width="24" height="3" rx="1" fill="#fff" /><rect x="9" y="22" width="16" height="2" rx="1" fill="#fff" opacity=".7" /><rect x="40" y="16" width="12" height="7" rx="3.5" fill="#fff" /></>,
  contact: <><rect x="6" y="11" width="18" height="4" rx="1" fill={T} /><rect x="6" y="18" width="20" height="2" rx="1" fill={F} /><rect x="32" y="8" width="22" height="24" rx="3" fill={F} opacity=".35" />{[13, 20, 27].map(y => <rect key={y} x="35" y={y} width="15" height="2" rx="1" fill={T} />)}</>,
};

export function SectionsInsertSection() {
  const hasRoot = useEditor(s => { void s.pageId; return currentPageHasRoot(); });
  const hasPalette = useEditor(s => s.doc.library.colors.some(c => c.name === 'Hauptfarbe'));
  const groups = [...new Set(SECTIONS.map(s => s.group))];
  return (
    <Section title="Fertige Abschnitte">
      {groups.map(g => (
        <div key={g}>
          <div className="fx-group">{g}</div>
          <div className="sec-tiles">
            {SECTIONS.filter(s => s.group === g).map(s => (
              <button key={s.id} type="button" className="sec-tile" title={s.tip} disabled={!hasRoot} onClick={() => insertSection(s.id)}>
                <svg viewBox="0 0 60 40" aria-hidden="true">{SKETCH[s.id]}</svg>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="proto-hint">
        Klick fügt den Abschnitt am Ende der Seite ein (vor der Fußzeile). Ist ein Abschnitt ausgewählt, kommt der neue direkt darunter. Alle Abschnitte passen sich an Tablet und Handy an.
        {!hasPalette && ' Tipp: Lege vorher links in der „Bibliothek“ unter „Farben“ ein Farbschema an – dann übernehmen die Abschnitte deine Farben.'}
      </p>
    </Section>
  );
}
