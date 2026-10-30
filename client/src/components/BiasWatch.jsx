// "Watch out for" on method and calculator pages: the research biases (biases.js) a method is prone to or guards
// against, and the ones a calculator helps with, each linking to its card on the bias map.
import { Link } from 'react-router-dom';
import { biasesForCalc, biasesForMethod } from '../biases.js';
import { ShowMoreList } from './ShowMore.jsx';

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
