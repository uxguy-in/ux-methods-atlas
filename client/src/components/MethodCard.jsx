import { Link } from 'react-router-dom';
import { STATUS } from '../vocab.js';

export function Status({ value }) {
  if (!value) return null;
  return <span className={`status ${value}`} title={STATUS[value]?.short}>{STATUS[value]?.label || value}</span>;
}

export default function MethodCard({ m, why }) {
  return (
    <Link to={`/methods/${m.id}`} className="card">
      <span className="fam">{m.family}</span>
      <h3>{m.name}</h3>
      <p>{m.summary}</p>
      <div className="meta">
        <Status value={m.status} />
        {m.donor && <span>from {m.donor}</span>}
        {why?.filter((w) => !w.startsWith('needs')).slice(0, 1).map((w) => <span key={w} className="why-tag">{w}</span>)}
      </div>
    </Link>
  );
}
