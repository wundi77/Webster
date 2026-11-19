// Fenster „Tastenkürzel“ (Menü „Webster“)
import { useEffect } from 'react';
import { create } from 'zustand';
import { ALT, MOD, SHIFT } from './controls';
import { Icons } from './icons';

export const useShortcutsDialog = create<{ open: boolean }>(() => ({ open: false }));

const SHORTCUTS: [string, string][] = [
  ['V', 'Verschieben'], ['R', 'Rechteck'], ['E', 'Ellipse'], ['T', 'Text'], ['L', 'Linie'], [`${SHIFT}L`, 'Pfeil'], ['I', 'Icon einfügen'], ['K', 'Bild einfügen'], [`${SHIFT}R`, 'Lineale ein/aus'], [`${SHIFT}H`, 'Hilfslinien ein/aus'], [`${SHIFT}G`, 'Spaltenraster ein/aus'],
  ['H / Leertaste', 'Ansicht verschieben'], ['P', 'Live-Vorschau öffnen'], [`${SHIFT}A`, 'Flex-Layout hinzufügen'],
  [`${ALT}1 / 2 / 3`, 'Desktop / Tablet / Mobil'],
  [`${MOD}Z`, 'Rückgängig'], [`${SHIFT}${MOD}Z`, 'Wiederholen'],
  [`${MOD}C / ${MOD}V`, 'Kopieren / Einfügen'], [`${MOD}D`, 'Duplizieren'], [`${MOD}A`, 'Alles auswählen'],
  [`${ALT}${MOD}G`, 'In Board packen'], [`${MOD}K`, 'Komponente erstellen'], [`${SHIFT}${MOD}K`, 'Von Komponente lösen'], [`${SHIFT}${MOD}E`, 'Website exportieren'], [`${MOD}↑ / ↓`, 'Ebene nach vorne / hinten'],
  ['Pfeiltasten', '1 px verschieben (mit ⇧ 10 px)'], [`${SHIFT}0 / 1 / 2`, '100 % / Alles / Auswahl einpassen'],
  [`${MOD} + Mausrad`, 'Zoomen'], ['Doppelklick', 'Text bearbeiten'], ['Enter', 'Inhalt eines Boards auswählen'],
  [`${ALT} beim Ziehen`, 'Kopie ziehen'], ['⇧ beim Ziehen', 'Achse / Seitenverhältnis halten'],
];

export function ShortcutsDialog() {
  const open = useShortcutsDialog(s => s.open);
  const close = () => useShortcutsDialog.setState({ open: false });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog kb-dialog" role="dialog" aria-modal="true" aria-labelledby="kb-title">
        <header className="dialog-head">
          <h2 id="kb-title">Tastenkürzel</h2>
          <button type="button" className="ibtn" aria-label="Schließen" title="Schließen (Esc)" onClick={close}><Icons.close /></button>
        </header>
        <div className="dialog-body">
          <dl className="kb-list">
            {SHORTCUTS.map(([k, l]) => <div key={k}><dt>{l}</dt><dd><kbd>{k}</kbd></dd></div>)}
          </dl>
        </div>
      </div>
    </div>
  );
}
