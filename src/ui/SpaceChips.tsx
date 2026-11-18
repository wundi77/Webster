// Kleine Knöpfe S · M · L · XL für Abstände (Stufen der Website)
import { useEditor } from '../store';
import { applySpace, SPACE_NAMES, SPACE_TOKENS, spaceOf } from '../model/spacing';
import type { SpaceToken } from '../model/types';

export function SpaceChips({ ids, kind, active }: { ids: string[]; kind: 'gap' | 'pad'; active: SpaceToken | null | undefined }) {
  const space = useEditor(s => JSON.stringify(spaceOf(s.doc)));
  const sc = JSON.parse(space) as Record<SpaceToken, number>;
  return (
    <div className="space-chips" role="group" aria-label={kind === 'gap' ? 'Abstand als Stufe' : 'Innenabstand als Stufe'}>
      {SPACE_TOKENS.map(t => (
        <button key={t} type="button" className={active === t ? 'on' : ''} aria-pressed={active === t}
          title={`Stufe ${SPACE_NAMES[t]} (${sc[t]} px) – ändert sich mit, wenn du die Stufe unter „Webseite“ anpasst`}
          onClick={() => applySpace(ids, kind, t)}>{SPACE_NAMES[t]}</button>
      ))}
    </div>
  );
}
