// Remembers where each page was opened from, so a method page can offer "Back to Library"
// instead of always pointing at the atlas. Kept per history entry so Back and Forward stay right.
const PAGES = [
  [/^\/library$/, (s) => (s.includes('view=methods') ? 'All methods' : 'Library')],
  [/^\/methods$/, () => 'Atlas'],
  [/^\/lost$/, () => 'Lost methods'],
  [/^\/families/, () => 'Disciplines'],
  [/^\/design$/, () => 'Design & product'],
  [/^\/find$/, () => 'your results'],
  [/^\/methods\/.+/, () => 'previous method'],
  [/^\/$/, () => 'Home'],
];

let last = null;

export function noteLocation(loc, navType) {
  // The first page of a visit has no history key of its own ('default'), so compare the address too.
  if (last && last.key === loc.key && last.pathname === loc.pathname && last.search === loc.search) return;
  if (navType === 'PUSH' && last) {
    const hit = PAGES.find(([re]) => re.test(last.pathname));
    const from = hit ? { label: hit[1](last.search), path: last.pathname + last.search } : null;
    try { sessionStorage.setItem(`atlas-from:${loc.key}`, JSON.stringify(from)); } catch { /* storage unavailable */ }
  }
  last = { key: loc.key, pathname: loc.pathname, search: loc.search };
}

export function cameFrom(key) {
  try { return JSON.parse(sessionStorage.getItem(`atlas-from:${key}`) || 'null'); } catch { return null; }
}
