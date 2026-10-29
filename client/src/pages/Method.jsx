import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { cameFrom } from '../nav-trail.js';
import { useApi } from '../hooks.js';
import Loading from '../components/Loading.jsx';
import { Status, Validation } from '../components/MethodCard.jsx';
import { DATA, DESIGN_KIND, EFFORT, EXPERTISE, GOALS, PARTICIPANTS, STAGES, STATUS, SUBMIT_URL, VALIDATION, slug } from '../vocab.js';

const paras = (t) => (t || '').split(/\n{2,}/).filter(Boolean);

export default function Method() {
  const { id } = useParams();
  const { data: m, error } = useApi(`/api/methods/${id}`);
  const { key } = useLocation();
  const navigate = useNavigate();
  const from = cameFrom(key);
  if (!m) return <Loading error={error} />;
  const f = m.facets || {};
  // Design & product practices sit outside the research atlas, so they skip its filters and the finder.
  const design = m.kind === 'design';
  const lostLabel = m.status === 'active' ? 'Why it survived' : m.status === 'community' ? 'Why it was proposed' : `Why it was lost (${STATUS[m.status]?.label.toLowerCase()})`;

  return (
    <>
      <section className="method-hero">
        <div className="wrap">
          {from && (
            <button type="button" className="back-link" onClick={() => navigate(-1)}>
              <span aria-hidden="true">←</span> Back to {from.label}
            </button>
          )}
          <div className="crumbs">
            {design ? (
              <Link to="/design">Design & product</Link>
            ) : (
              <><Link to="/methods">Atlas</Link><span>/</span><Link to={`/methods?family=${slug(m.family)}`}>{m.family}</Link></>
            )}
          </div>
          <div className="method-markers">
            {design && <Link to="/design" className="badge kind">{DESIGN_KIND}</Link>}
            <Status value={m.status} />
            <Validation value={m.validation} />
            {m.proposedBy && <span className="hero-note">Proposed by {m.proposedBy}</span>}
            {m.donor && <span className="hero-note">Borrowed from {m.donor}</span>}
          </div>
          <h1 className="h1" style={{ maxWidth: '20ch' }}>{m.name}</h1>
          {m.aka?.length > 0 && <p className="muted aka">Also known as {m.aka.join(', ')}</p>}
          <p className="lede">{m.summary}</p>
          <dl className="kv">
            {m.origin && <div><dt>Origin</dt><dd>{m.origin}</dd></div>}
            {f.data && <div><dt>Data</dt><dd>{DATA[f.data]}</dd></div>}
            {f.participants && <div><dt>Needs</dt><dd>{PARTICIPANTS[f.participants]}</dd></div>}
            {f.effort && <div><dt>Effort</dt><dd>{EFFORT[f.effort]}</dd></div>}
            {f.expertise && <div><dt>Level</dt><dd>{EXPERTISE[f.expertise]}</dd></div>}
          </dl>
        </div>
      </section>

      <div className="wrap method-body">
        <article>
          <section className="block">
            <h2>What it is</h2>
            {paras(m.description).map((p, i) => <p key={i}>{p}</p>)}
          </section>

          {m.steps?.length > 0 && (
            <section className="block">
              <h2>How to do it</h2>
              <ol className="steps">{m.steps.map((s, i) => <li key={i}><span>{s}</span></li>)}</ol>
            </section>
          )}

          {m.outputs && (
            <section className="block">
              <h2>What you get</h2>
              <p>{m.outputs}</p>
            </section>
          )}

          <section className="block split">
            {m.useWhen && <div className="panel good"><h3>Use it when</h3><p>{m.useWhen}</p></div>}
            {m.avoidWhen && <div className="panel bad"><h3>Avoid it when</h3><p>{m.avoidWhen}</p></div>}
          </section>

          {m.whyLost && (
            <section className="block">
              <div className="panel lost"><h3>{lostLabel}</h3><p>{m.whyLost}</p></div>
            </section>
          )}

          {m.whereToUse && (
            <section className="block">
              <h2>Where to use it now</h2>
              <p>{m.whereToUse}</p>
            </section>
          )}

          {m.example && (
            <section className="block">
              <h2>Example</h2>
              <p>{m.example}</p>
            </section>
          )}

          {m.extra && Object.keys(m.extra).length > 0 && (
            <section className="block">
              <h2>Notes from the compendium</h2>
              {Object.entries(m.extra).map(([k, v]) => <p key={k}><b>{k}.</b> {v}</p>)}
            </section>
          )}
        </article>

        <aside>
          {(f.goals?.length > 0 || f.stage?.length > 0) && (
            <div className="aside-box">
              <h3>Good for</h3>
              <div className="tags">
                {design ? (
                  <>
                    {(f.goals || []).map((g) => <span key={g} className="tag">{GOALS[g] || g}</span>)}
                    {(f.stage || []).map((s) => <span key={s} className="tag">{STAGES[s] || s}</span>)}
                  </>
                ) : (
                  <>
                    {(f.goals || []).map((g) => <Link key={g} className="tag" to={`/methods?goal=${g}`}>{GOALS[g] || g}</Link>)}
                    {(f.stage || []).map((s) => <Link key={s} className="tag" to={`/methods?stage=${s}`}>{STAGES[s] || s}</Link>)}
                  </>
                )}
              </div>
            </div>
          )}
          {m.status === 'community' && (
            <div className="aside-box">
              <h3>{VALIDATION[m.validation === 'tested' ? 'tested' : 'untested'].label}</h3>
              <p style={{ margin: 0 }}>
                {m.validation === 'tested'
                  ? (m.validationNote || 'There is published evidence of this framework being used beyond the person who proposed it.')
                  : 'This framework has been proposed but has no published evidence yet of use beyond the person who proposed it. Treat it as an idea to try, and share what happens.'}
              </p>
              <p style={{ margin: '10px 0 0' }}><a href={SUBMIT_URL} target="_blank" rel="noreferrer">Report a test or submit a method</a></p>
            </div>
          )}
          {m.reference && (
            <div className="aside-box">
              <h3>Key reference</h3>
              <p className="ref" style={{ margin: 0 }}>{m.reference}</p>
            </div>
          )}
          {m.sourceBooks?.length > 0 && (
            <div className="aside-box">
              <h3>In your library</h3>
              <ul>{m.sourceBooks.map((b) => <li key={b.id}><Link to={`/library?q=${encodeURIComponent(b.title)}`}>{b.title}</Link>{b.author ? `, ${b.author}` : ''}</li>)}</ul>
            </div>
          )}
          {m.sources?.length > 0 && (
            <div className="aside-box">
              <h3>Found in</h3>
              <ul>{m.sources.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {m.related?.length > 0 && (
            <div className="aside-box">
              <h3>Related methods</h3>
              <div className="related-list">
                {m.related.map((r) => (
                  <Link key={r.id} to={`/methods/${r.id}`}><span>{r.name}</span>{r.kind === 'design' ? <span className="badge kind">{DESIGN_KIND}</span> : <Status value={r.status} />}</Link>
                ))}
              </div>
            </div>
          )}
          {design
            ? <Link to="/design" className="btn ghost" style={{ width: '100%' }}>More design & product methods</Link>
            : <Link to="/find" className="btn accent" style={{ width: '100%' }}>Is this right for my problem?</Link>}
        </aside>
      </div>
    </>
  );
}
