import { Link } from 'react-router-dom';
import { questionsForMethod } from '../questions.js';

// One line on a method page: up to two library questions this method helps answer, linked to the question library.
export function MethodQuestionsLine({ methodId }) {
  const list = questionsForMethod(methodId, 2);
  if (!list.length) return null;
  return (
    <p className="ql-method-line">
      <span className="label">Answers questions like</span>{' '}
      {list.map((q, i) => (
        <span key={q.id}>{i > 0 && ' · '}<Link to={`/questions?id=${q.id}`}>{q.question}</Link></span>
      ))}
    </p>
  );
}
