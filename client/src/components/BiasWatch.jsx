// "Watch out for" on method and calculator pages: the research biases (biases.js) a method is prone to or guards
// against, and the ones a calculator helps with, each linking to its card on the bias map.
import { Link } from 'react-router-dom';
import { BIASES, CHECK_METHODS, biasesForCalc, biasesForMethod, biasesForMethods, groupOf, mentionsBias, searchBiases } from '../biases.js';
import { ShowMoreList } from './ShowMore.jsx';
import { useMethodNames } from './CalcLearn.jsx';

const tag = (b) => <Link key={b.id} className="tag" to={`/biases?b=${b.id}`}>{b.name}</Link>;

export function MethodBiasBox({ methodId }) {
  const { guards, prone } = biasesForMethod(methodId);
  if (!guards.length && !prone.length) return null;
  return (
    <div className="aside-box bias-watch">
      <h3>Watch out for</h3>
      {prone.length > 0 && <><h4>Biases that can creep into it</h4><ShowMoreList className="tags" limit={8} noun="biases">{prone.map(tag)}</ShowMoreList></>}
      {guards.length > 0 && <><h4>Biases it helps guard against</h4><ShowMoreList className="tags" limit={8} noun="biases">{guards.map(tag)}</ShowMoreList></>}
      <Link className="more" to="/biases">The research bias map →</Link>
    </div>
  );
}

export function CalcBiasStrip({ calcId }) {
  const list = biasesForCalc(calcId);
  if (!list.length) return null;
  return (
    <aside className="bias-strip bias-watch" aria-label="Research biases this calculator helps with">
      <span className="label">Helps you watch out for</span>
      <span className="tags">{list.map(tag)}</span>
      <Link className="more" to="/biases">Research bias map →</Link>
    </aside>
  );
}

// Research biases matching a search box on another page (the atlas, library, questions, calculators), so a search
// for "leading questions" or "confirmation bias" lands on the bias map too.
export function BiasSearchHits({ q }) {
  const hits = searchBiases(q, 4);
  if (!hits.length && !mentionsBias(q)) return null;
  return (
    <aside className="bias-hits" aria-label="Research biases matching your search">
      <span className="label">Research biases</span>
      {hits.length > 0 ? (
        <ul>
          {hits.map((b) => (
            <li key={b.id}><Link to={`/biases?b=${b.id}`}><b>{b.name}</b></Link> <span>{b.what}</span></li>
          ))}
        </ul>
      ) : <p>The atlas has a map of {BIASES.length} biases that distort research itself: who you ask, how you ask, how you run it, how you read it and how you decide.</p>}
      <Link className="more" to={hits.length ? `/biases?q=${encodeURIComponent(q.trim())}` : '/biases'}>{hits.length ? 'See them on the bias map →' : 'Open the research bias map →'}</Link>
    </aside>
  );
}

// "Biases to watch in this study": what the methods a plan or a set of recommendations uses are prone to, with the
// first thing to do about each. Used by Plan a study, Find a method and the voice assistant.
export function StudyBiasWatch({ methodIds, title = 'Biases to watch for', intro, limit = 6 }) {
  const methodName = useMethodNames();
  const list = biasesForMethods(methodIds);
  const checkM = methodIds.filter((m) => CHECK_METHODS.includes(m));
  if (!list.length) return null;
  return (
    <section className="study-bias" aria-label={title}>
      <p className="eyebrow">Research biases</p>
      <h2>{title}</h2>
      <p className="study-bias-intro">{intro || 'These methods are especially prone to the biases below. Each comes with the first thing to do about it.'}</p>
      <ShowMoreList className="study-bias-list" limit={limit} noun="biases">
        {list.map(({ b, via }) => (
          <div key={b.id} className="study-bias-item">
            <h3><Link to={`/biases?b=${b.id}`}>{b.name}</Link> <span className="study-bias-group">{groupOf(b.group).name}</span></h3>
            <p className="study-bias-via">Affects {via.slice(0, 3).map(methodName).join(', ')}{via.length > 3 ? ` and ${via.length - 3} more` : ''}</p>
            <p><b>Do this:</b> {b.counter[0]}</p>
          </div>
        ))}
      </ShowMoreList>
      <p className="study-bias-foot"><Link to={`/biases?check=1${checkM.length ? `&m=${checkM.join(',')}` : ''}`}>Check your whole study on the bias map →</Link></p>
    </section>
  );
}
