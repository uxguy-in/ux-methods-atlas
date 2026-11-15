// Passes text from one page to the next in memory only, so a transcript is never written to storage or put in a URL.
// The receiving page takes it once; a reload loses it, which is the point.
const box = new Map();
export const giveHandoff = (key, value) => { box.set(key, value); };
export function takeHandoff(key) { const v = box.get(key); box.delete(key); return v; }
