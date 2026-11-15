// Erzeugt src/data/icons.json aus Lucide (ISC) und einer Auswahl Marken-Logos von Simple Icons (CC0).
// Aufruf: node scripts/build-icons.mjs   (nur nötig, wenn die Icon-Pakete aktualisiert werden)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as si from 'simple-icons';

const nodes = JSON.parse(readFileSync('node_modules/lucide-static/icon-nodes.json', 'utf8'));
const tags = JSON.parse(readFileSync('node_modules/lucide-static/tags.json', 'utf8'));

// Deutsche Suchbegriffe → Lucide-Icons
const DE = {
  telefon: ['phone', 'phone-call', 'smartphone'], handy: ['smartphone'], anruf: ['phone-call', 'phone'],
  mail: ['mail', 'at-sign'], 'e-mail': ['mail', 'at-sign'], brief: ['mail', 'mail-open'], nachricht: ['message-circle', 'message-square', 'mail'],
  chat: ['message-circle', 'messages-square'], adresse: ['map-pin', 'house'], ort: ['map-pin', 'map-pinned'], standort: ['map-pin', 'navigation'],
  karte: ['map', 'map-pin'], route: ['route', 'navigation', 'signpost'], haus: ['house', 'building'], startseite: ['house'], gebäude: ['building', 'building-complex'],
  firma: ['building-complex', 'briefcase'], büro: ['building-complex', 'briefcase'], pfeil: ['arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'move-right', 'chevron-right'],
  rechts: ['arrow-right', 'chevron-right'], links: ['arrow-left', 'chevron-left'], hoch: ['arrow-up', 'chevron-up'], runter: ['arrow-down', 'chevron-down'],
  weiter: ['arrow-right', 'chevron-right'], zurück: ['arrow-left', 'chevron-left', 'undo'], herz: ['heart'], liebe: ['heart'], stern: ['star', 'sparkles'],
  bewertung: ['star', 'thumbs-up'], daumen: ['thumbs-up', 'thumbs-down'], gefällt: ['thumbs-up', 'heart'], warenkorb: ['shopping-cart', 'shopping-basket'],
  einkaufen: ['shopping-bag', 'shopping-cart'], tasche: ['shopping-bag', 'briefcase'], laden: ['store', 'shopping-bag'], geschäft: ['store'],
  preis: ['tag', 'euro', 'badge-percent'], euro: ['euro'], geld: ['euro', 'banknote', 'wallet'], bezahlen: ['credit-card', 'wallet'], karte_kredit: ['credit-card'],
  kreditkarte: ['credit-card'], rabatt: ['badge-percent', 'percent', 'tag'], angebot: ['tag', 'gift', 'badge-percent'], geschenk: ['gift'],
  uhr: ['clock', 'alarm-clock', 'watch'], zeit: ['clock', 'timer', 'hourglass'], öffnungszeiten: ['clock'], kalender: ['calendar', 'calendar-days'],
  termin: ['calendar-check', 'calendar', 'calendar-clock'], datum: ['calendar'], suche: ['search'], lupe: ['search', 'zoom-in'], menü: ['menu'],
  schließen: ['x'], kreuz: ['x', 'plus'], plus: ['plus', 'circle-plus'], minus: ['minus'], haken: ['check', 'circle-check'], häkchen: ['check', 'circle-check', 'square-check'],
  erledigt: ['check', 'circle-check'], info: ['info'], hilfe: ['circle-question-mark', 'life-buoy'], frage: ['circle-question-mark', 'message-circle-question-mark'], warnung: ['triangle-exclamation-point', 'circle-exclamation-point'],
  achtung: ['triangle-exclamation-point'], fehler: ['circle-x', 'circle-exclamation-point'], person: ['user', 'circle-user'], benutzer: ['user', 'circle-user'], kunde: ['user', 'users'],
  team: ['users', 'users-round'], gruppe: ['users'], menschen: ['users'], konto: ['circle-user', 'user'], anmelden: ['log-in', 'user'], abmelden: ['log-out'],
  schloss: ['lock', 'lock-open'], sicher: ['shield-check', 'lock'], sicherheit: ['shield', 'shield-check'], schlüssel: ['key-round', 'key'], einstellungen: ['settings', 'sliders-horizontal'],
  zahnrad: ['settings', 'cog'], werkzeug: ['wrench', 'hammer'], reparatur: ['wrench', 'hammer'], handwerk: ['hammer', 'wrench', 'paintbrush'], kamera: ['camera'],
  foto: ['camera', 'image'], bild: ['image', 'images'], galerie: ['images', 'gallery-horizontal'], video: ['video', 'film', 'circle-play'], film: ['film', 'clapperboard'],
  musik: ['eighth-notes', 'headphones'], abspielen: ['play', 'circle-play'], play: ['play', 'circle-play'], pause: ['pause'], lautsprecher: ['volume-2', 'speaker'],
  mikrofon: ['mic'], download: ['download'], herunterladen: ['download'], hochladen: ['upload'], datei: ['file', 'file-text'], dokument: ['file-text', 'file'],
  pdf: ['file-text'], ordner: ['folder'], drucken: ['printer'], teilen: ['share-2', 'share'], link: ['link', 'external-link'], verknüpfung: ['link'],
  extern: ['external-link'], welt: ['globe', 'earth'], sprache: ['languages', 'globe'], internet: ['globe', 'wifi'], wlan: ['wifi'], auto: ['car'],
  fahrrad: ['bike'], bus: ['bus'], zug: ['train-front'], bahn: ['train-front', 'tram-front'], flugzeug: ['plane'], reise: ['plane', 'luggage', 'map'], parken: ['circle-letter-p', 'square-letter-p'],
  lieferung: ['truck', 'package'], versand: ['truck', 'package'], paket: ['package', 'box'], kaffee: ['coffee', 'cup-soda'], café: ['coffee'], essen: ['utensils', 'utensils-crossed', 'chef-hat'],
  restaurant: ['utensils', 'utensils-crossed'], besteck: ['utensils'], koch: ['chef-hat', 'cooking-pot'], kochen: ['chef-hat', 'cooking-pot'], wein: ['wine'], bier: ['beer'],
  getränk: ['cup-soda', 'glass-water', 'wine'], kuchen: ['cake', 'cake-slice'], torte: ['cake'], pizza: ['pizza'], brot: ['croissant', 'sandwich'], bäckerei: ['croissant', 'cake'],
  eis: ['ice-cream-cone'], obst: ['apple', 'cherry', 'citrus'], gemüse: ['carrot', 'salad'], vegan: ['leaf', 'vegan'], blatt: ['leaf'], natur: ['leaf', 'trees', 'flower'],
  baum: ['tree-deciduous', 'tree-pine', 'trees'], blume: ['flower', 'flower-2'], garten: ['flower-2', 'shovel', 'sprout'], pflanze: ['sprout', 'leaf'], sonne: ['sun'],
  mond: ['moon'], wetter: ['cloud-sun', 'sun', 'cloud'], regen: ['cloud-rain', 'umbrella'], schnee: ['snowflake'], feuer: ['flame'], wasser: ['droplet', 'waves-horizontal'],
  meer: ['waves-horizontal', 'sailboat'], berg: ['mountain', 'mountain-snow'], strand: ['tree-palm', 'umbrella'], hund: ['dog'], katze: ['cat'], tier: ['paw-print', 'dog', 'cat'],
  pfote: ['paw-print'], fisch: ['fish'], vogel: ['bird'], gesundheit: ['heart-pulse', 'stethoscope', 'activity'], arzt: ['stethoscope'], praxis: ['stethoscope', 'hospital'],
  krankenhaus: ['hospital'], medizin: ['pill', 'stethoscope', 'syringe'], zahn: ['face-slightly-smiling'], sport: ['dumbbell', 'trophy', 'bike'], fitness: ['dumbbell', 'activity'],
  pokal: ['trophy'], auszeichnung: ['award', 'trophy', 'medal'], preisgekrönt: ['award'], qualität: ['badge-check', 'award'], zertifikat: ['badge-check', 'award'],
  schule: ['school', 'graduation-cap'], bildung: ['graduation-cap', 'book-open'], buch: ['book', 'book-open'], lesen: ['book-open'], stift: ['pencil', 'pen'],
  bearbeiten: ['pencil', 'square-pen'], schreiben: ['pen-line', 'pencil'], idee: ['lightbulb'], glühbirne: ['lightbulb'], energie: ['zap', 'battery-charging'], blitz: ['zap'],
  strom: ['zap', 'plug'], computer: ['monitor', 'laptop'], laptop: ['laptop'], bildschirm: ['monitor'], code: ['code', 'code-xml'], daten: ['database', 'chart-bar'],
  diagramm: ['chart-bar', 'chart-line', 'chart-pie'], statistik: ['chart-bar', 'trending-up'], wachstum: ['trending-up', 'chart-line'], ziel: ['target', 'flag'],
  flagge: ['flag'], rakete: ['rocket'], start: ['rocket', 'play'], glocke: ['bell'], benachrichtigung: ['bell'], lesezeichen: ['bookmark'], merken: ['bookmark', 'heart'],
  auge: ['eye'], sehen: ['eye'], versteckt: ['eye-off'], filter: ['funnel', 'sliders-horizontal'], liste: ['list', 'list-checks'], raster: ['grid-3x3', 'layout-grid'],
  zitat: ['quote'], lächeln: ['face-slightly-smiling'], zufrieden: ['face-slightly-smiling', 'thumbs-up'], hand: ['hand', 'hand-heart', 'handshake'], handschlag: ['handshake'], partner: ['handshake'],
  vertrag: ['signature', 'handshake'], spende: ['hand-heart', 'heart-handshake'], hilfsbereit: ['hand-heart', 'heart-handshake'], krone: ['crown'], diamant: ['gem', 'diamond'],
  schmuck: ['gem'], mode: ['shirt'], kleidung: ['shirt'], schere: ['scissors'], friseur: ['scissors'], kosmetik: ['sparkles', 'spray-can'], wellness: ['flower-2', 'bath', 'sparkles'],
  bett: ['bed', 'bed-double'], hotel: ['bed-double', 'hotel', 'concierge-bell'], übernachtung: ['bed-double'], schlüsselübergabe: ['key-round'], tür: ['door-open', 'door-closed'],
  zuhause: ['house'], wohnung: ['building', 'house'], immobilie: ['house', 'building-complex', 'key-round'], bau: ['hard-hat', 'construction', 'hammer'], baustelle: ['construction', 'hard-hat'],
  musiknote: ['eighth-notes'], kopfhörer: ['headphones'], podcast: ['mic-vocal', 'mic'], radio: ['radio'], fernseher: ['tv'], spiel: ['gamepad-2', 'dices'], puzzle: ['puzzle'],
  kind: ['baby', 'face-slightly-smiling'], baby: ['baby'], familie: ['users', 'heart'], senioren: ['users'], barrierefrei: ['accessibility'], rollstuhl: ['accessibility'],
  wlan_frei: ['wifi'], sauber: ['sparkles'], neu: ['sparkles', 'badge'], favorit: ['star', 'heart'], beliebt: ['flame', 'star', 'trending-up'], schnell: ['zap', 'timer'],
  kostenlos: ['gift', 'badge-percent'], recycling: ['recycle'], umwelt: ['leaf', 'recycle', 'earth'], nachhaltig: ['leaf', 'recycle', 'sprout'], solar: ['sun', 'zap'],
  quadrat: ['square'], kreis: ['circle'], dreieck: ['triangle'], punkt: ['dot', 'circle'], linie: ['minus'], trenner: ['minus', 'separator-horizontal'],
};
// Marken-Logos (Simple Icons, CC0). LinkedIn ist dort auf Wunsch der Firma nicht mehr enthalten.
const BRANDS = ['siInstagram', 'siFacebook', 'siYoutube', 'siX', 'siTiktok', 'siWhatsapp', 'siPinterest', 'siXing', 'siThreads', 'siTelegram',
  'siMastodon', 'siBluesky', 'siSpotify', 'siVimeo', 'siSnapchat', 'siSignal', 'siDiscord', 'siTwitch', 'siTripadvisor', 'siAirbnb', 'siEtsy',
  'siPaypal', 'siGoogle', 'siGooglemaps', 'siApple', 'siYelp', 'siSoundcloud', 'siBehance', 'siDribbble', 'siGithub'];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ser = list => list.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('');

const extra = {};
for (const [de, names] of Object.entries(DE)) for (const n of names) {
  if (!nodes[n]) { console.warn('Fehlt:', n, '(für', de + ')'); continue; }
  (extra[n] ??= []).push(de.replace(/_.*/, ''));
}

// Ebenenname: bevorzugt ein deutsches Wort, bei dem das Icon an erster Stelle steht
const primary = {};
for (const [de, names] of Object.entries(DE)) if (nodes[names[0]] && !primary[names[0]]) primary[names[0]] = de.replace(/_.*/, '');
const LABEL = { leaf: 'Blatt', house: 'Haus', gift: 'Geschenk', plus: 'Plus', x: 'Kreuz', 'arrow-right': 'Pfeil rechts', 'arrow-left': 'Pfeil links',
  'arrow-up': 'Pfeil hoch', 'arrow-down': 'Pfeil runter', 'arrow-up-right': 'Pfeil schräg', 'chevron-right': 'Winkel rechts', 'chevron-left': 'Winkel links',
  'chevron-down': 'Winkel runter', 'chevron-up': 'Winkel hoch', 'map-pin': 'Ort', 'circle-check': 'Haken (Kreis)', 'external-link': 'Externer Link',
  'share-2': 'Teilen', 'credit-card': 'Kreditkarte', 'circle-play': 'Abspielen', 'circle-question-mark': 'Frage', 'triangle-exclamation-point': 'Warnung',
  'message-circle': 'Nachricht', 'file-text': 'Dokument', 'chart-bar': 'Diagramm', 'trending-up': 'Wachstum', 'bed-double': 'Bett', 'heart-pulse': 'Gesundheit',
  'key-round': 'Schlüssel', 'shield-check': 'Sicherheit', building: 'Gebäude', briefcase: 'Aktentasche', truck: 'Lieferung', euro: 'Euro', tag: 'Preisschild', info: 'Info',
  sparkles: 'Glitzer', mail: 'E-Mail', wifi: 'WLAN', hammer: 'Hammer', 'paw-print': 'Pfote', 'shopping-bag': 'Einkaufstasche', 'thumbs-up': 'Daumen hoch', utensils: 'Besteck', 'book-open': 'Buch', users: 'Personen' };

const out = [];
for (const name of Object.keys(nodes)) {
  const t = [...(extra[name] ?? []), ...(tags[name] ?? []).slice(0, 8)];
  const de = LABEL[name] ?? primary[name] ?? extra[name]?.[0];
  out.push(de ? [name, ser(nodes[name]), t.join(' '), de[0].toUpperCase() + de.slice(1)] : [name, ser(nodes[name]), t.join(' ')]);
}
const brands = [];
for (const k of BRANDS) {
  const b = si[k];
  if (!b) { console.warn('Marke fehlt:', k); continue; }
  brands.push([b.slug, `<path d="${b.path}"/>`, `${b.title} logo marke social media soziale netzwerke`, b.title]);
}
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/icons.json', JSON.stringify({ lucide: out, brands }));
console.log(out.length, 'Icons,', brands.length, 'Marken');
