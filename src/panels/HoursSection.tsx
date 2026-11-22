// Öffnungszeiten einstellen (rechts, wenn die Öffnungszeiten oder etwas darin ausgewählt ist)
import { useEditor, pageOf } from '../store';
import type { WNode } from '../model/types';
import { DAY_NAMES, copyToWeekdays, hoursOf, setDay } from '../model/hours';
import { Section } from '../ui/controls';

export function HoursSection({ node }: { node: WNode }) {
  const board = useEditor(s => hoursOf(pageOf(s), node.id));
  if (!board?.hours) return null;
  const days = board.hours.days;
  return (
    <Section title="Öffnungszeiten">
      <div className="hours-grid">
        {DAY_NAMES.map((d, i) => {
          const day = days[i];
          if (!day) return null;
          const two = !!(day.from2 && day.to2);
          return (
            <div key={d} className="hours-day">
              <label className="check hours-name" title="Hat an diesem Tag geöffnet">
                <input type="checkbox" checked={!day.closed} onChange={e => setDay(board.id, i, { closed: !e.target.checked })} />
                <span>{d.slice(0, 2)}</span>
              </label>
              {day.closed ? <span className="muted hours-closed">geschlossen</span> : (
                <div className="hours-times">
                  <span className="hours-span">
                    <input type="time" className="textinput" value={day.from} aria-label={`${d} von`} onChange={e => e.target.value && setDay(board.id, i, { from: e.target.value })} />
                    <span>–</span>
                    <input type="time" className="textinput" value={day.to} aria-label={`${d} bis`} onChange={e => e.target.value && setDay(board.id, i, { to: e.target.value })} />
                  </span>
                  {two ? (
                    <span className="hours-span">
                      <input type="time" className="textinput" value={day.from2} aria-label={`${d} nachmittags von`} onChange={e => e.target.value && setDay(board.id, i, { from2: e.target.value })} />
                      <span>–</span>
                      <input type="time" className="textinput" value={day.to2} aria-label={`${d} nachmittags bis`} onChange={e => e.target.value && setDay(board.id, i, { to2: e.target.value })} />
                      <button type="button" className="link-btn" title="Zweiten Zeitraum entfernen" onClick={() => setDay(board.id, i, { from2: '', to2: '' })}>×</button>
                    </span>
                  ) : (
                    <span className="hours-more">
                      <button type="button" className="link-btn" title="Zwei Zeiträume, z. B. mit Mittagspause" onClick={() => setDay(board.id, i, { to: '12:30', from2: '14:00', to2: day.to > '14:00' ? day.to : '18:00' })}>+ Pause</button>
                      {i === 0 && <button type="button" className="link-btn" onClick={() => copyToWeekdays(board.id, i)}>auch für Di–Fr</button>}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="proto-hint keep">Die Zeilen auf der Seite passen sich automatisch an. Auf der fertigen Website steht in der Anzeige „Jetzt geöffnet“ bzw. „Gerade geschlossen“ – gerechnet in deutscher Zeit.</p>
    </Section>
  );
}
