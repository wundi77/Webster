// Wo soll die Schreibmarke beim Öffnen eines Textes stehen? (Klickstelle; ohne = ganzen Text markieren)
let caret: { x: number; y: number } | null = null;
export const setEditCaret = (p: { x: number; y: number } | null) => { caret = p; };
export function takeEditCaret() { const c = caret; caret = null; return c; }
