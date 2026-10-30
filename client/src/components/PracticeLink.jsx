// "Test yourself" on method and calculator pages: shown only when Practice questions (quiz.js) link to this id.
import { Link } from 'react-router-dom';
import { QUESTIONS, hasQuestionsAbout } from '../quiz.js';

export function TestYourself({ kind, id }) {
  if (!id || !hasQuestionsAbout(id, kind)) return null;
  const n = QUESTIONS.filter((q) => q.links.includes(`${kind}:${id}`)).length;
  const to = `/practice?about=${encodeURIComponent(id)}`;
  const noun = n === 1 ? 'scenario question' : 'scenario questions';
  if (kind === 'calc') {
    return (
      <p className="pq-strip">
        <span className="label">Test yourself</span>
        <span>{n} short {noun} on when to use this calculator.</span>
        <Link className="more" to={to}>Practise →</Link>
      </p>
    );
  }
  return (
    <div className="aside-box pq-aside">
      <h3>Test yourself</h3>
      <p>{n} short {noun} on when this method fits and when something else fits better.</p>
      <Link className="more" to={to}>Practise →</Link>
    </div>
  );
}
