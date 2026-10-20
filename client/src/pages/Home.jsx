import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMeta, useMethods } from '../hooks.js';
import MethodCard, { Status } from '../components/MethodCard.jsx';
import { STATUS, STATUS_ORDER, slug } from '../vocab.js';

export default function Home() {
  const { data: meta } = useMeta();
  const { data: methods } = useMethods();

  const counts = useMemo(() => {
    const c = { status: {}, family: {}, donors: new Set() };
    for (const m of methods || []) {
      c.status[m.status] = (c.status[m.status] || 0) + 1;
      c.family[m.family] = (c.family[m.family] || 0) + 1;
      if (m.donor) c.donors.add(m.donor.split(/[,/;(]/)[0].trim().toLowerCase());
    }
    return c;
  }, [methods]);

  const featured = useMemo(() => {
    const ids = meta?.featured || [];
    const picked = ids.map((id) => methods?.find((m) => m.id === id)).filter(Boolean);
    return picked.length ? picked : (methods || []).filter((m) => m.status === 'unmigrated' || m.status === 'extinct').slice(0, 6);
  }, [meta, methods]);

  const lost = methods ? methods.filter((m) => !['active', 'original'].includes(m.status)).length : null;

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
          <p className="eyebrow">The UX research methods atlas</p>
          <h1 className="display">Research is not <em>journalism.</em></h1>
          <p className="lede">
            Every UX research method in one place, including the rigorous ones the field forgot and the ones it never
            borrowed from epidemiology, econometrics, human factors and physics. Answer a few questions, describe your
            problem, and get a direction.
          </p>
          <div className="hero-actions">
            <Link to="/find" className="btn accent">Find the right method</Link>
            <Link to="/methods" className="btn ghost">Browse the atlas</Link>
          </div>
          <div className="stats">
            <div className="stat"><b>{methods ? methods.length : '—'}</b><span>methods</span></div>
            <div className="stat"><b>{lost ?? '—'}</b><span>lost, siloed or borrowed</span></div>
            <div className="stat"><b>{meta?.families?.length ?? '—'}</b><span>disciplines</span></div>
            <div className="stat"><b>{meta?.counts?.books ?? '—'}</b><span>source books</span></div>
          </div>
          </div>
          <aside className="unearthed" aria-label="Unearthed methods">
            <p className="eyebrow">Unearthed</p>
            {featured.slice(0, 6).map((m) => (
              <Link key={m.id} to={`/methods/${m.id}`} className="unearthed-row">
                <span>{m.name}</span>
                <Status value={m.status} />
              </Link>
            ))}
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <p className="eyebrow">How it works</p>
              <h2 className="h2">From a vague problem to a research plan.</h2>
            </div>
          </div>
          <div className="grid">
            {[
              ['01', 'Answer six questions', 'What you need to learn, where you are, who you can reach, how long you have and how rigorous you want to be.'],
              ['02', 'Describe the problem', 'Write a short brief in your own words. The AI reads it against the whole atlas, not just the methods everyone already knows.'],
              ['03', 'Get a direction', 'A reframed problem, sharp research questions, a sequenced plan, and the lost or borrowed methods that add the rigour.'],
            ].map(([n, t, d]) => (
              <div key={n} className="card">
                <span className="eyebrow" style={{ margin: 0 }}>{n}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="wrap">
          <div className="section-head">
            <div>
              <p className="eyebrow">The taxonomy of loss</p>
              <h2 className="h2">Methods don't die. They get forgotten.</h2>
            </div>
            <Link to="/lost" className="btn ghost small">Why methods get lost</Link>
          </div>
          <div className="tax">
            {STATUS_ORDER.map((s) => (
              <Link key={s} to={`/methods?status=${s}`} className="tax-card" style={{ '--sc': `var(--s-${s})` }}>
                <b>{counts.status[s] ?? '—'}</b>
                <h3>{STATUS[s].label}</h3>
                <p>{STATUS[s].short}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <p className="eyebrow">Worth reviving</p>
              <h2 className="h2">Start with these.</h2>
            </div>
            <Link to="/methods?status=unmigrated" className="btn ghost small">All unmigrated methods</Link>
          </div>
          <div className="grid">{featured.map((m) => <MethodCard key={m.id} m={m} />)}</div>
        </div>
      </section>

      <section className="section ink">
        <div className="wrap">
          <div className="section-head">
            <div>
              <p className="eyebrow">Borrowed from everywhere</p>
              <h2 className="h2">{meta?.families?.length ?? ''} disciplines, one toolkit.</h2>
            </div>
          </div>
          <div className="ticker">
            {(meta?.families || []).map((f) => (
              <Link key={f.name} to={`/methods?family=${slug(f.name)}`} className="chip" style={{ background: 'transparent', color: 'inherit', borderColor: 'color-mix(in srgb, currentColor 30%, transparent)' }}>
                {f.name} <span className="n">{counts.family[f.name] || 0}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
