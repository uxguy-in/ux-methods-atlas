import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

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
      <header className="site-header">
        <div className="wrap">
          <Link to="/" className="logo" aria-label="UX Methods Atlas home">
            <span className="logo-mark" aria-hidden="true" />
            UX Methods Atlas
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
            <p>Research is more than talking to users and reporting it.<br />Curated by Vivek Gopinath from 260+ books, papers and playbooks.</p>
          </div>
          <nav aria-label="Footer">
            {LINKS.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
            {import.meta.env.VITE_REPO_URL && <a href={import.meta.env.VITE_REPO_URL}>Download the code</a>}
          </nav>
        </div>
      </footer>
    </>
  );
}
