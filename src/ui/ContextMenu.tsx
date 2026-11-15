import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor, viewPage as pageOf } from '../store';
import {
  copySelection, cutSelection, deleteSelection, duplicateNodes, hasClipboard, paste, reorder, toggleFlexLayout, updateNodes, wrapInBoard,
} from '../model/commands';
import { MOD, ALT, SHIFT } from './controls';
import { createComponent, detachInstances, resetInstances, showMain } from '../model/library';
import { instanceRootOf } from '../model/components';

type Item = { label: string; shortcut?: string; action: () => void; disabled?: boolean } | 'sep';

export function ContextMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const selection = useEditor(s => s.selection);
  const page = useEditor(pageOf);
  const nodes = selection.map(id => page.nodes[id]).filter(Boolean);
  const has = nodes.length > 0;
  const allHidden = has && nodes.every(n => !n.visible);
  const allLocked = has && nodes.every(n => n.locked);
  const instRoot = nodes.length === 1 ? instanceRootOf(page, nodes[0].id) : null;
  const compId = instRoot ? page.nodes[instRoot].componentId! : nodes.length === 1 && nodes[0].isMain ? nodes[0].id : null;
  const anyComp = nodes.some(n => n.isMain || n.mainId);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.min(x, window.innerWidth - r.width - 8), top: Math.min(y, window.innerHeight - r.height - 8) });
  }, [x, y]);

  useEffect(() => {
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', h, true);
    window.addEventListener('keydown', k);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', h, true);
      window.removeEventListener('keydown', k);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const items: Item[] = [
    { label: 'Kopieren', shortcut: `${MOD}C`, action: copySelection, disabled: !has },
    { label: 'Ausschneiden', shortcut: `${MOD}X`, action: cutSelection, disabled: !has },
    { label: 'Einfügen', shortcut: `${MOD}V`, action: paste, disabled: !hasClipboard() },
    { label: 'Duplizieren', shortcut: `${MOD}D`, action: () => useEditor.getState().setSelection(duplicateNodes(selection, { offset: true })), disabled: !has },
    'sep',
    { label: 'Ganz nach vorne', shortcut: `${SHIFT}${MOD}↑`, action: () => reorder('front'), disabled: !has },
    { label: 'Eine Ebene nach vorne', shortcut: `${MOD}↑`, action: () => reorder('forward'), disabled: !has },
    { label: 'Eine Ebene nach hinten', shortcut: `${MOD}↓`, action: () => reorder('backward'), disabled: !has },
    { label: 'Ganz nach hinten', shortcut: `${SHIFT}${MOD}↓`, action: () => reorder('back'), disabled: !has },
    'sep',
    { label: 'In Board packen', shortcut: `${ALT}${MOD}G`, action: wrapInBoard, disabled: !has },
    {
      label: nodes.length === 1 && nodes[0].type === 'board' && nodes[0].layout ? 'Layout entfernen' : 'Flex-Layout hinzufügen',
      shortcut: `${SHIFT}A`, action: toggleFlexLayout, disabled: !has,
    },
    'sep',
    ...(instRoot ? [
      { label: 'Original anzeigen', action: () => showMain(compId!) },
      { label: 'Abweichungen zurücksetzen', action: () => resetInstances() },
      { label: 'Von Komponente lösen', shortcut: `${SHIFT}${MOD}K`, action: () => detachInstances() },
    ] as Item[] : compId ? [] : [
      { label: 'Komponente erstellen', shortcut: `${MOD}K`, action: createComponent, disabled: !has || anyComp },
    ] as Item[]),
    'sep',
    { label: allHidden ? 'Einblenden' : 'Ausblenden', action: () => updateNodes(selection, n => { n.visible = allHidden; }), disabled: !has },
    { label: allLocked ? 'Entsperren' : 'Sperren', action: () => updateNodes(selection, n => { n.locked = !allLocked; }), disabled: !has },
    'sep',
    { label: 'Löschen', shortcut: '⌫', action: deleteSelection, disabled: !has },
  ];

  // doppelte Trennlinien entfernen
  const shown = items.filter((it, i) => it !== 'sep' || (i > 0 && items[i - 1] !== 'sep' && i < items.length - 1));
  return (
    <div ref={ref} className="ctx" style={pos} onContextMenu={e => e.preventDefault()}>
      {shown.map((it, i) => it === 'sep'
        ? <div key={i} className="menu-sep" />
        : (
          <button key={i} type="button" className="menu-item" disabled={it.disabled} onClick={() => { onClose(); it.action(); }}>
            <span>{it.label}</span>{it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        ))}
    </div>
  );
}
