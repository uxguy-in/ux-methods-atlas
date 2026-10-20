import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMeta, useMethods } from '../hooks.js';
import MethodCard from '../components/MethodCard.jsx';
import Loading from '../components/Loading.jsx';
import { STATUS, STATUS_ORDER } from '../vocab.js';

const LOST = STATUS_ORDER.filter((s) => s !== 'active' && s !== 'original');

export default function Lost() {
  const { data: meta, error } = useMeta();
  const { data: methods } = useMethods();
  const byStatus = useMemo(() => {
    const g = {};
    for (const m of methods || []) (g[m.status] ||= []).push(m);
    return g;
  }, [methods]);
  if (!meta) return <Loading error={error} />;
  const defs = Object.fromEntries((meta.lossTaxonomy || []).map((t) => [t.status, t]));

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">Lost methods</p>
          <h1 className="display" style={{ fontSize: 'clamp(40px, 7vw, 88px)' }}>UX research has a <em>memory</em> problem.</h1>
          <p className="lede">
            Each generation of practitioners rediscovers, renames or quietly drops the methods that gave the field its rigour.
            Here is how methods get lost, and every one we have found.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head"><div><p className="eyebrow">The taxonomy of loss</p><h2 className="h2">Six ways a method disappears.</h2></div></div>
          <div className="tax">
            {LOST.map((s) => (
              <a key={s} href={`#${s}`} className="tax-card" style={{ '--sc': `var(--s-${s})` }}>
                <b>{byStatus[s]?.length ?? 0}</b>
                <h3>{STATUS[s].label}</h3>
                <p>{defs[s]?.definition || STATUS[s].short}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {meta.causesOfDeath?.length > 0 && (
        <section className="section ink">
          <div className="wrap">
            <div className="section-head"><div><p className="eyebrow">Why methods die</p><h2 className="h2">The causes of method death.</h2></div></div>
            <div className="causes">
              {meta.causesOfDeath.map((c) => <div key={c.name}><h3>{c.name}</h3><p>{c.explanation}</p></div>)}
            </div>
          </div>
        </section>
      )}

      {LOST.map((s) => (byStatus[s]?.length ? (
        <section key={s} id={s} className="section tight" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="wrap">
            <div className="section-head">
              <div>
                <p className="eyebrow" style={{ color: `var(--s-${s})` }}>{byStatus[s].length} methods</p>
                <h2 className="h2">{STATUS[s].label}</h2>
                <p className="muted" style={{ maxWidth: '60ch', marginTop: 10 }}>{defs[s]?.definition || STATUS[s].short}</p>
              </div>
              <Link className="btn ghost small" to={`/methods?status=${s}`}>Filter in the atlas</Link>
            </div>
            <div className="grid">{byStatus[s].slice(0, 9).map((m) => <MethodCard key={m.id} m={m} />)}</div>
          </div>
        </section>
      ) : null))}

      {meta.epidemiologyGlossary?.length > 0 && (
        <section className="section soft">
          <div className="wrap">
            <div className="section-head"><div><p className="eyebrow">A new discipline</p><h2 className="h2">The vocabulary of UX epidemiology.</h2></div></div>
            <div className="grid">
              {meta.epidemiologyGlossary.map((g) => <div key={g.term} className="card"><h3>{g.term}</h3><p>{g.definition}</p></div>)}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
