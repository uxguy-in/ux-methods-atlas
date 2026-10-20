import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { REPO_URL } from '../vocab.js';

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
  ['/library', 'Library'],
  ['/calculators', 'Calculators'],
  ['/about', 'About'],
];

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const [isDark, toggle] = useTheme();
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);

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
            {LINKS.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
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
            <p className="sister">Code under <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT</a>, method write-ups under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.</p>
          </div>
          <nav aria-label="Footer">
            {LINKS.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
            <Link to="/submit">Submit a method</Link>
            {import.meta.env.VITE_REPO_URL && <a href={import.meta.env.VITE_REPO_URL}>Download the code</a>}
          </nav>
        </div>
      </footer>
    </>
  );
}
