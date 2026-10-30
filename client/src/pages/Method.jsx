import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { cameFrom } from '../nav-trail.js';
import { calcsForMethod, firstWhen, plainText } from '../calc/learn.js';
import { StageBadges } from '../components/CalcLearn.jsx';
import { MethodBiasBox } from '../components/BiasWatch.jsx';
import { DemoStrip } from '../components/WeakStrong.jsx';
import { MethodQuestionsLine } from '../components/QuestionLinks.jsx';
import { TestYourself } from '../components/PracticeLink.jsx';
import { useApi } from '../hooks.js';
import Loading from '../components/Loading.jsx';
import { Status, Validation } from '../components/MethodCard.jsx';
import { ShowMoreList, ShowMoreText } from '../components/ShowMore.jsx';
import { mergeSources } from '../sources.js';
import { DATA, DESIGN_KIND, EFFORT, EXPERTISE, GOALS, PARTICIPANTS, STAGES, STATUS, SUBMIT_URL, VALIDATION, slug } from '../vocab.js';

const paras = (t) => (t || '').split(/\n{2,}/).filter(Boolean);

// Text longer than this is cut to a few lines behind "Show more".
const LONG_EXAMPLE = 600;
const LONG_NOTES = 300;

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
  // Calculators whose "How this is calculated" section links to this method (calc/catalog.js), with their guides.
  const calcs = calcsForMethod(m.id || id);
  const sources = mergeSources(m.sourceBooks, m.sources);
  // A plain anchor (#put-numbers) would be read as a route under the static build's hash router, so scroll instead.
  const jumpToCalcs = () => {
    const el = document.getElementById('put-numbers');
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };
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
          <div className="method-actions">
            {design
              ? <Link to="/design" className="btn ghost">More design & product methods</Link>
              : <Link to="/find" className="btn accent">Is this right for my problem?</Link>}
            {calcs.length > 0 && (
              <button type="button" className="method-calc-jump" onClick={jumpToCalcs}>
                Calculate it <span aria-hidden="true">↓</span><span className="sr-only">: {calcs.length} calculator{calcs.length === 1 ? '' : 's'} below</span>
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="wrap method-body" key={m.id}>
        <article>
          <MethodQuestionsLine methodId={m.id || id} />
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

          {calcs.length > 0 && (
            <section className="block" id="put-numbers" tabIndex={-1} aria-labelledby="put-numbers-h">
              <h2 id="put-numbers-h">Put numbers on it</h2>
              <p>{calcs.length === 1 ? 'This calculator works' : 'These calculators work'} with {m.name}. Each says the question it answers and where it fits in your study.</p>
              <ShowMoreList as="ul" className="calc-uses" limit={4} noun="calculators">
                {calcs.map((c) => (
                  <li key={c.id}>
                    <div className="top"><Link to={`/calculators/${c.id}`}>{c.name}</Link><StageBadges stages={c.stages} short={false} /></div>
                    <p className="q">{c.question}</p>
                    {firstWhen(c) && <p className="when"><b>Use it when</b>{plainText(firstWhen(c))}</p>}
                  </li>
                ))}
              </ShowMoreList>
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
          <DemoStrip methodId={m.id || id} />

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
              <ShowMoreText long={m.example.length > LONG_EXAMPLE}>
                {paras(m.example).map((p, i) => <p key={i}>{p}</p>)}
              </ShowMoreText>
            </section>
          )}

          {m.extra && Object.keys(m.extra).length > 0 && (
            <section className="block">
              <h2>Notes from the compendium</h2>
              <ShowMoreText long={Object.entries(m.extra).reduce((n, [k, v]) => n + k.length + String(v).length, 0) > LONG_NOTES}>
                {Object.entries(m.extra).map(([k, v]) => <p key={k}><b>{k}.</b> {v}</p>)}
              </ShowMoreText>
            </section>
          )}
        </article>

        <aside>
          {(f.goals?.length > 0 || f.stage?.length > 0) && (
            <div className="aside-box">
              <h3>Good for</h3>
              <ShowMoreList className="tags" noun="tags">
                {design ? [
                  ...(f.goals || []).map((g) => <span key={`g:${g}`} className="tag">{GOALS[g] || g}</span>),
                  ...(f.stage || []).map((st) => <span key={`s:${st}`} className="tag">{STAGES[st] || st}</span>),
                ] : [
                  ...(f.goals || []).map((g) => <Link key={`g:${g}`} className="tag" to={`/methods?goal=${g}`}>{GOALS[g] || g}</Link>),
                  ...(f.stage || []).map((st) => <Link key={`s:${st}`} className="tag" to={`/methods?stage=${st}`}>{STAGES[st] || st}</Link>),
                ]}
              </ShowMoreList>
            </div>
          )}
          <MethodBiasBox methodId={m.id || id} />
          <TestYourself kind="method" id={m.id || id} />
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
          {sources.length > 0 && (
            <div className="aside-box">
              <h3>Sources</h3>
              <ShowMoreList as="ul" className="source-list" noun="sources">
                {sources.map((s) => (s.book
                  ? <li key={s.key}><Link to={`/library?q=${encodeURIComponent(s.book.title)}`}>{s.book.title}</Link>{s.book.author ? `, ${s.book.author}` : ''}</li>
                  : <li key={s.key}>{s.text}</li>))}
              </ShowMoreList>
            </div>
          )}
          {m.related?.length > 0 && (
            <div className="aside-box">
              <h3>Related methods</h3>
              <ShowMoreList className="related-list" noun="related methods">
                {m.related.map((r) => (
                  <Link key={r.id} to={`/methods/${r.id}`}><span>{r.name}</span>{r.kind === 'design' ? <span className="badge kind">{DESIGN_KIND}</span> : <Status value={r.status} />}</Link>
                ))}
              </ShowMoreList>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
