import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMeta, useMethods } from '../hooks.js';
import Loading from '../components/Loading.jsx';
import { slug } from '../vocab.js';

export default function Families() {
  const { data: meta, error } = useMeta();
  const { data: methods } = useMethods();
  const counts = useMemo(() => {
    const c = {};
    for (const m of methods || []) {
      c[m.family] ||= { total: 0, lost: 0 };
      c[m.family].total++;
      if (!['active', 'community'].includes(m.status)) c[m.family].lost++;
    }
    return c;
  }, [methods]);
  if (!meta) return <Loading error={error} />;
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">Disciplines</p>
          <h1 className="h1">Borrowed from everywhere.</h1>
          <p className="lede">Most of UX research's best methods were invented somewhere else. These are the fields they came from.</p>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="grid">
            {meta.families.map((f) => (
              <Link key={f.name} to={`/methods?family=${slug(f.name)}`} className="family-tile">
                <b>{counts[f.name]?.total || 0}</b>
                <span>{f.name}</span>
                <small>{f.blurb}</small>
                {counts[f.name]?.lost > 0 && <small style={{ color: 'var(--accent)', fontWeight: 700 }}>{counts[f.name].lost} lost or borrowed</small>}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
