// Leiste über der Fläche, solange eine Komponente (ihr eigenes Board) bearbeitet wird
import { useEditor, pageOf } from '../store';
import { closeComponent, isComponentPage, instanceCount, listComponents } from '../model/library';
import { Icons } from '../ui/icons';
import { animRootOf } from '../model/animCore';

export function ComponentBar() {
  const info = useEditor(s => {
    if (!isComponentPage(s.doc, s.pageId)) return null;
    const pg = pageOf(s);
    const root = pg.nodes[pg.rootIds[0]];
    if (!root || animRootOf(pg)) return null;
    const c = listComponents(s.doc).find(x => x.id === root.id);
    return `${c?.name ?? root.name}|${instanceCount(s.doc, root.id)}`;
  });
  if (!info) return null;
  const [name, count] = info.split('|');
  const n = Number(count);
  return (
    <div className="component-bar" role="status">
      <Icons.instance />
      <span>Komponente <b>{name}</b> bearbeiten · {n === 0 ? 'noch keine Kopien auf den Seiten' : `Änderungen gelten für ${n === 1 ? 'die Kopie' : `alle ${n} Kopien`}`}</span>
      <button type="button" className="btn primary small" onClick={closeComponent}>Fertig</button>
    </div>
  );
}
