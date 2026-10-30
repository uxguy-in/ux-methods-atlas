import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigationType } from 'react-router-dom';
import { noteLocation } from '../nav-trail.js';
import { useApi } from '../hooks.js';

const THEME_KEY = 'atlas-theme';

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || ''; } catch { return ''; }
  });
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    try { theme ? localStorage.setItem(THEME_KEY, theme) : localStorage.removeItem(THEME_KEY); } catch { /* storage unavailable */ }
  }, [theme]);
  const isDark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return [isDark, () => setTheme(isDark ? 'light' : 'dark')];
}

const LINKS = [
  ['/find', 'Find a method'],
  ['/methods', 'Atlas'],
  ['/lost', 'Lost methods'],
  ['/families', 'Disciplines'],
  ['/design', 'Design & product'],
  ['/library', 'Library'],
  ['/calculators', 'Calculators'],
  ['/about', 'About'],
];

const scrollKey = (loc) => `atlas-scroll:${loc.key}:${loc.pathname}${loc.search}`;

// New pages open at the top; Back and Forward return to where the visitor was on that page.
function useScrollMemory(loc, navType) {
  const lastPath = useRef(null);
  // A layout effect, so the old page stops recording before the new page's shorter height clamps the scroll.
  useLayoutEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    let frame = 0;
    const saveNow = () => { try { sessionStorage.setItem(scrollKey(loc), String(Math.round(scrollY))); } catch { /* storage unavailable */ } };
    const save = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(saveNow); };
    // Also save on click, so the position is stored even when a link is followed mid-scroll.
    addEventListener('scroll', save, { passive: true });
    addEventListener('click', saveNow, true);
    return () => { cancelAnimationFrame(frame); removeEventListener('scroll', save); removeEventListener('click', saveNow, true); };
  }, [loc.key, loc.pathname, loc.search]);
  useEffect(() => {
    const pageChanged = lastPath.current !== loc.pathname;
    lastPath.current = loc.pathname;
    if (navType !== 'POP') { if (pageChanged) scrollTo(0, 0); return undefined; }
    let y = 0;
    try { y = Number(sessionStorage.getItem(scrollKey(loc))) || 0; } catch { /* storage unavailable */ }
    if (!y) { if (pageChanged) scrollTo(0, 0); return undefined; }
    // Pages load their data after rendering, so wait until there is enough page to scroll to.
    const start = performance.now();
    let frame = requestAnimationFrame(function tryRestore() {
      const room = document.documentElement.scrollHeight - innerHeight;
      if (room >= y || performance.now() - start > 2500) { scrollTo(0, Math.min(y, room)); return; }
      frame = requestAnimationFrame(tryRestore);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.key, loc.pathname]);
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const [isDark, toggle] = useTheme();
  const loc = useLocation();
  const navType = useNavigationType();
  noteLocation(loc, navType);
  useScrollMemory(loc, navType);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  // A design & product practice opens on its /methods/ page, but belongs under "Design & product" in the nav.
  const methodId = loc.pathname.match(/^\/methods\/([^/]+)$/)?.[1];
  const { data: design } = useApi(methodId ? '/api/design' : null);
  const onDesign = Boolean(methodId && design?.some((m) => m.id === decodeURIComponent(methodId)));
  // The study planner (/plan) is the "Plan a whole study" mode of Find a method.
  const onPlan = loc.pathname === '/plan';
  const navClass = (to) => ({ isActive }) => {
    if (to === '/find') return isActive || onPlan ? 'active' : undefined;
    return (to === '/design' ? isActive || onDesign : isActive && !(to === '/methods' && onDesign)) ? 'active' : undefined;
  };

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <div className="announce">
        <div className="wrap">
          <span>A companion to UX Brighton 2026: Emerging Methods, Friday 6 November, Brighton Dome.</span>
          <a href="https://uxbri.org/" target="_blank" rel="noreferrer">Visit uxbri.org</a>
        </div>
      </div>
      <header className="site-header">
        <div className="wrap">
          <Link to="/" className="logo" aria-label="UX Methods Atlas home">
            <span className="logo-block" aria-hidden="true">UX</span>
            <span className="logo-text">Methods Atlas<small>A UX Brighton sister site</small></span>
          </Link>
          <nav className={`nav${open ? ' open' : ''}`} aria-label="Main">
            {LINKS.map(([to, label]) => <NavLink key={to} to={to} className={navClass(to)}>{label}</NavLink>)}
          </nav>
          <div className="header-cta">
            <button className="icon-btn" onClick={toggle} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {isDark ? '☀' : '☾'}
            </button>
            <Link to="/find" className="btn small accent">Start here</Link>
            <button className="icon-btn menu-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">≡</button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <div className="wrap">
          <div>
            <b>UX Methods Atlas</b>
            <p>Research is more than talking to users and reporting it.<br />Curated by Vivek Gopinath from 250+ books, papers and playbooks, with frameworks proposed by the community.</p>
            <p className="sister">A sister site to <a href="https://uxbri.org/" target="_blank" rel="noreferrer">UX Brighton</a>.</p>
            <p className="sister">Copyright © 2026 Vivek Gopinath and Danny Hope. All rights reserved.</p>
          </div>
          <nav aria-label="Footer">
            {LINKS.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
            <Link to="/biases">Research biases</Link>
            <Link to="/practice">Practice</Link>
            <Link to="/submit">Submit a method</Link>
            <Link to={loc.pathname === '/about' ? '/about?report=1' : `/about?report=1&page=${encodeURIComponent(loc.pathname)}`}>Report a problem</Link>
            {import.meta.env.VITE_REPO_URL && <a href={import.meta.env.VITE_REPO_URL}>Download the code</a>}
          </nav>
        </div>
      </footer>
    </>
  );
}
