import { useView } from './model/guides';
import { flashMeasures } from './canvas/measure';
import { isColorPickerOpen } from './ui/ColorPicker';
import { useEffect } from 'react';
import { useEditor, viewPage as pageOf } from './store';
import {
  copySelection, cutSelection, deleteSelection, duplicateNodes, nudge, openImagePicker,
  paste, placeImageFile, reorder, selectAll, toggleFlexLayout, wrapInBoard,
} from './model/commands';
import { fitAll, fitSelection, setZoom100, zoomBy } from './model/viewport';
import { createComponent, detachInstances } from './model/library';
import { openPreview } from './preview/bridge';
import { useDialog } from './panels/SiteSettings';
import { openProject, saveProject, supportsFolders, useProject } from './model/project';

const isField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      // Speichern funktioniert auch beim Tippen in einem Feld
      // ⌘S / ⌘O nie an den Browser durchreichen („Seite speichern“)
      if (mod && (k === 's' || k === 'o') && (useProject.getState().dialog || useDialog.getState().open)) { e.preventDefault(); return; }
      if (mod && k === 's') {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        if (e.shiftKey && supportsFolders) useProject.getState().show('saveas'); else saveProject();
        return;
      }
      if (isField(e.target) || useDialog.getState().open || useProject.getState().dialog) return;
      // Farbwähler offen: nur Rückgängig/Wiederholen, sonst nichts (Entf soll keine Ebene löschen)
      if (isColorPickerOpen() && !(mod && (k === 'z' || k === 'y'))) return;
      const s = useEditor.getState();

      if (mod) {
        if (e.altKey && e.code === 'KeyG') { e.preventDefault(); wrapInBoard(); return; }
        switch (k) {
          case 'z': e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return;
          case 'y': e.preventDefault(); s.redo(); return;
          case 'd': e.preventDefault(); s.setSelection(duplicateNodes(s.selection, { offset: true })); return;
          case 'c': copySelection(); return;
          case 'x': cutSelection(); return;
          case 'a': e.preventDefault(); selectAll(); return;
          case 'k': e.preventDefault(); if (e.shiftKey) detachInstances(); else createComponent(); return;
          case 'o': e.preventDefault(); openProject(); return;
          case 'e': if (e.shiftKey) { e.preventDefault(); useDialog.getState().show('export'); } return;
          case 'arrowup': e.preventDefault(); reorder(e.shiftKey ? 'front' : 'forward'); return;
          case 'arrowdown': e.preventDefault(); reorder(e.shiftKey ? 'back' : 'backward'); return;
          case '+': case '=': e.preventDefault(); zoomBy(1.25); return;
          case '-': e.preventDefault(); zoomBy(0.8); return;
          case '0': e.preventDefault(); setZoom100(); return;
        }
        return;
      }

      if (e.shiftKey && e.code === 'KeyA') { e.preventDefault(); toggleFlexLayout(); return; }
      if (e.shiftKey && !e.altKey && e.code === 'KeyR') { e.preventDefault(); useView.getState().toggle('rulers'); return; }
      if (e.shiftKey && !e.altKey && e.code === 'KeyH') { e.preventDefault(); useView.getState().toggle('guides'); return; }
      if (e.shiftKey && !e.altKey && e.code === 'KeyG') { e.preventDefault(); useView.getState().toggle('grids'); return; }
      if (e.altKey && e.code === 'Digit1') { e.preventDefault(); s.setBreakpoint('desktop'); return; }
      if (e.altKey && e.code === 'Digit2') { e.preventDefault(); s.setBreakpoint('tablet'); return; }
      if (e.altKey && e.code === 'Digit3') { e.preventDefault(); s.setBreakpoint('mobile'); return; }
      if (e.shiftKey && e.code === 'Digit0') { e.preventDefault(); setZoom100(); return; }
      if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); fitAll(); return; }
      if (e.shiftKey && e.code === 'Digit2') { e.preventDefault(); fitSelection(); return; }

      const step = e.shiftKey ? 10 : 1;
      switch (k) {
        case 'v': s.setTool('move'); break;
        case 'r': s.setTool('rect'); break;
        case 'e': s.setTool('ellipse'); break;
        case 't': s.setTool('text'); break;
        case 'l': s.setTool(e.shiftKey ? 'arrow' : 'line'); break;
        case 'i': s.setTool('move'); useDialog.getState().show('icons'); break;
        case 'h': s.setTool('hand'); break;
        case 'k': openImagePicker(); break;
        case 'p': openPreview(s.pageId); break;
        case 'escape': if (s.selection.length) s.setSelection([]); s.setTool('move'); break;
        case 'delete': case 'backspace': e.preventDefault(); deleteSelection(); break;
        case 'enter': {
          const n = s.selection.length === 1 ? pageOf(s).nodes[s.selection[0]] : undefined;
          if (n?.type === 'text' && !n.locked) { e.preventDefault(); s.setEditing(n.id); }
          else if (n?.children.length) { e.preventDefault(); s.setSelection([...n.children]); }
          break;
        }
        case 'arrowleft': e.preventDefault(); nudge(-step, 0); flashMeasures(); break;
        case 'arrowright': e.preventDefault(); nudge(step, 0); flashMeasures(); break;
        case 'arrowup': e.preventDefault(); nudge(0, -step); flashMeasures(); break;
        case 'arrowdown': e.preventDefault(); nudge(0, step); flashMeasures(); break;
        case '+': zoomBy(1.25); break;
        case '-': zoomBy(0.8); break;
      }
    };

    // Einfügen: Bilder aus der Zwischenablage oder kopierte Ebenen
    const onPaste = (e: ClipboardEvent) => {
      if (isField(e.target) || useDialog.getState().open) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
      e.preventDefault();
      if (files.length) files.forEach(f => placeImageFile(f));
      else paste();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); };
  }, []);
}
