// Öffnungszeiten – reine Hilfsfunktionen (auch für Export und Vorschau)
import type { DayHours, OpeningHours } from './types';

export const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export const defaultHours = (): OpeningHours => ({
  days: DAY_NAMES.map((_, i) => (i < 5 ? { closed: false, from: '09:00', to: '18:00' } : i === 5 ? { closed: false, from: '10:00', to: '14:00' } : { closed: true, from: '09:00', to: '18:00' })),
});

/** „09:00“ → „9:00“ */
const short = (t: string) => t.replace(/^0(\d)/, '$1');

/** Sichtbarer Text für einen Tag */
export function dayText(d: DayHours, closedLabel = 'geschlossen', clock = 'Uhr', and = 'und'): string {
  if (d.closed) return closedLabel;
  const a = `${short(d.from)} – ${short(d.to)}`;
  const b = d.from2 && d.to2 ? ` ${and} ${short(d.from2)} – ${short(d.to2)}` : '';
  return `${a}${b} ${clock}`.trim();
}

/**
 * Website: Text mit data-open-hours zeigt, ob gerade geöffnet ist. Gerechnet wird in deutscher Zeit
 * (Europe/Berlin), nicht in der Zeit der Besucher. Texte stehen in data-open-t (für andere Sprachen).
 */
export const HOURS_JS = `(function(){function now(){try{var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());var o={};p.forEach(function(x){o[x.type]=x.value});return{d:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(o.weekday),m:(+o.hour)*60+(+o.minute)}}catch(e){var d=new Date();return{d:(d.getDay()+6)%7,m:d.getHours()*60+d.getMinutes()}}}function mins(t){var a=(t||'').split(':');return(+a[0])*60+(+a[1]||0)}function spans(x){if(!x||x.closed)return[];var r=[[mins(x.from),mins(x.to)]];if(x.from2&&x.to2)r.push([mins(x.from2),mins(x.to2)]);return r}function hm(t){return t.replace(/^0(\\d)/,'$1')}function run(){var n=now();document.querySelectorAll('[data-open-hours]').forEach(function(el){var h,t;try{h=JSON.parse(el.getAttribute('data-open-hours'));t=JSON.parse(el.getAttribute('data-open-t'))}catch(e){return}var days=h.days||[];var today=spans(days[n.d]);for(var i=0;i<today.length;i++){if(n.m>=today[i][0]&&n.m<today[i][1]){var to=i===0?days[n.d].to:days[n.d].to2;el.textContent=t.open.replace('{t}',hm(to));el.setAttribute('data-open','1');return}}el.setAttribute('data-open','0');for(var k=0;k<8;k++){var di=(n.d+k)%7;var s=spans(days[di]);for(var j=0;j<s.length;j++){if(k===0&&s[j][0]<=n.m)continue;var from=j===0?days[di].from:days[di].from2;var when=k===0?t.today:k===1?t.tomorrow:t.days[di];el.textContent=t.closed.replace('{w}',when).replace('{t}',hm(from));return}}el.textContent=t.closedPlain})}run();setInterval(run,60000)})();`;

/** Texte für die Anzeige auf der Website */
export const HOURS_TEXTS_DE = {
  open: 'Jetzt geöffnet · bis {t} Uhr', closed: 'Gerade geschlossen · öffnet {w} um {t} Uhr', closedPlain: 'Gerade geschlossen',
  today: 'heute', tomorrow: 'morgen', days: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
};
