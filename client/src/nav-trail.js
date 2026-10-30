// Remembers where each page was opened from, so a method page can offer "Back to Library"
// instead of always pointing at the atlas. Kept per history entry so Back and Forward stay right.
const PAGES = [
  [/^\/library$/, (s) => (s.includes('view=methods') ? 'All methods' : 'Library')],
  [/^\/methods$/, () => 'Atlas'],
  [/^\/lost$/, () => 'Lost methods'],
  [/^\/families/, () => 'Disciplines'],
  [/^\/design$/, () => 'Design & product'],
  [/^\/biases$/, () => 'Research biases'],
  [/^\/demos$/, () => 'Weak vs strong'],
  [/^\/questions$/, () => 'Question library'],
  [/^\/practice$/, () => 'Practice'],
  [/^\/find$/, () => 'your results'],
  [/^\/plan$/, () => 'your study plan'],
  [/^\/methods\/.+/, () => 'previous method'],
  [/^\/calculators$/, () => 'Calculators'],
  [/^\/calculators\/.+/, () => 'previous calculator'],
  [/^\/about$/, () => 'About'],
  [/^\/submit$/, () => 'Submit a method'],
  [/^\/$/, () => 'Home'],
];

// Where to send a visitor who landed straight on a page and has nothing in this site to go back to.
export function parentOf(pathname) {
  if (/^\/methods\/.+/.test(pathname)) return { label: 'Atlas', path: '/methods' };
  if (/^\/calculators\/.+/.test(pathname)) return { label: 'Calculators', path: '/calculators' };
  if (pathname === '/plan') return { label: 'Find a method', path: '/find' };
  if (pathname === '/' ) return null;
  return { label: 'Home', path: '/' };
}

// React Router stores the position in this tab's history; above 0 means there is a page of this site to go back to.
export const canGoBack = () => { try { return (window.history.state?.idx ?? 0) > 0; } catch { return false; } };

let last = null;

export function noteLocation(loc, navType) {
  // The first page of a visit has no history key of its own ('default'), so compare the address too.
  if (last && last.key === loc.key && last.pathname === loc.pathname && last.search === loc.search) return;
  if (navType === 'PUSH' && last) {
    const hit = PAGES.find(([re]) => re.test(last.pathname));
    const from = { label: hit ? hit[1](last.search) : 'previous page', path: last.pathname + last.search };
    try { sessionStorage.setItem(`atlas-from:${loc.key}`, JSON.stringify(from)); } catch { /* storage unavailable */ }
  }
  last = { key: loc.key, pathname: loc.pathname, search: loc.search };
}

export function cameFrom(key) {
  try { return JSON.parse(sessionStorage.getItem(`atlas-from:${key}`) || 'null'); } catch { return null; }
}
