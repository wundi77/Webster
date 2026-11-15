export interface FontInfo { family: string; weights: number[]; italic: boolean; system?: boolean }

const range = (a: number, b: number) => Array.from({ length: (b - a) / 100 + 1 }, (_, i) => a + i * 100);

export const FONTS: FontInfo[] = [
  { family: 'Inter', weights: range(100, 900), italic: false },
  { family: 'Roboto', weights: [100, 300, 400, 500, 700, 900], italic: true },
  { family: 'Open Sans', weights: range(300, 800), italic: true },
  { family: 'Lato', weights: [100, 300, 400, 700, 900], italic: true },
  { family: 'Montserrat', weights: range(100, 900), italic: true },
  { family: 'Poppins', weights: range(100, 900), italic: true },
  { family: 'Raleway', weights: range(100, 900), italic: true },
  { family: 'Nunito', weights: range(200, 900), italic: true },
  { family: 'Work Sans', weights: range(100, 900), italic: true },
  { family: 'DM Sans', weights: range(100, 900), italic: false },
  { family: 'Manrope', weights: range(200, 800), italic: false },
  { family: 'Outfit', weights: range(100, 900), italic: false },
  { family: 'Space Grotesk', weights: range(300, 700), italic: false },
  { family: 'IBM Plex Sans', weights: range(100, 700), italic: true },
  { family: 'Source Sans 3', weights: range(200, 900), italic: true },
  { family: 'Oswald', weights: range(200, 700), italic: false },
  { family: 'Playfair Display', weights: range(400, 900), italic: true },
  { family: 'Merriweather', weights: [300, 400, 700, 900], italic: true },
  { family: 'Lora', weights: range(400, 700), italic: true },
  { family: 'Libre Baskerville', weights: [400, 700], italic: false },
  { family: 'Fira Code', weights: range(300, 700), italic: false },
  { family: 'Arial', weights: [400, 700], italic: true, system: true },
  { family: 'Helvetica', weights: [400, 700], italic: true, system: true },
  { family: 'Georgia', weights: [400, 700], italic: true, system: true },
  { family: 'Times New Roman', weights: [400, 700], italic: true, system: true },
  { family: 'Verdana', weights: [400, 700], italic: true, system: true },
];

export const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
};

export const fontInfo = (family: string) => FONTS.find(f => f.family === family);

const loaded = new Set<string>();

/** Lädt eine Google-Schrift nach, sobald sie verwendet wird. */
export function ensureFont(family: string) {
  const f = fontInfo(family);
  if (!f || f.system || loaded.has(family)) return;
  loaded.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = fontHref(family)!;
  document.head.appendChild(link);
}

/** Google-Fonts-Adresse einer Schrift (null bei Systemschriften) */
export function fontHref(family: string): string | null {
  const f = fontInfo(family);
  if (!f || f.system) return null;
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  const axis = f.italic
    ? `ital,wght@${[...f.weights.map(w => `0,${w}`), ...f.weights.map(w => `1,${w}`)].join(';')}`
    : `wght@${f.weights.join(';')}`;
  return `https://fonts.googleapis.com/css2?family=${name}:${axis}&display=swap`;
}

export interface FontUse { family: string; weight: number; italic: boolean }

/** Google-Fonts-Adresse nur mit den tatsächlich verwendeten Schnitten */
export function fontHrefFor(family: string, uses: FontUse[]): string | null {
  const f = fontInfo(family);
  if (!f || f.system) return null;
  const near = (w: number) => f.weights.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
  const set = new Set<string>();
  for (const u of uses) set.add(`${f.italic && u.italic ? 1 : 0},${near(u.weight)}`);
  if (!set.size) set.add(`0,${near(400)}`);
  const tuples = [...set].map(t => t.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  const axis = tuples.some(t => t[0] === 1)
    ? `ital,wght@${tuples.map(t => t.join(',')).join(';')}`
    : `wght@${[...new Set(tuples.map(t => t[1]))].join(';')}`;
  return `https://fonts.googleapis.com/css2?family=${name}:${axis}&display=swap`;
}
