import { Link } from 'react-router-dom';
import { STATUS, VALIDATION } from '../vocab.js';

// Marker system (styles.css, "Markers"):
//   Status      coloured dot + small caps, one colour per status, used for the taxonomy of loss only.
//   Validation  tinted badge: green "Tested", amber "Not yet tested" (community-proposed frameworks).
//   Kind        outlined badge: "Design & product".
//   Flag        solid green small caps: something picked for this visitor ("Suggested", "Your level", "Your pick").
//   Reason      green tick + text: why a method matched the visitor's answers.
export function Status({ value }) {
  if (!value) return null;
  return <span className={`status ${value}`} title={STATUS[value]?.short}>{STATUS[value]?.label || value}</span>;
}

export function Validation({ value }) {
  if (!VALIDATION[value]) return null;
  return <span className={`badge ${value}`} title={VALIDATION[value].short}>{VALIDATION[value].label}</span>;
}

const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// `calcs` (optional): calculators for this method ({ id, name }); the first is linked under the card as
// "Calculator: name". The link sits outside the card's own link, since links cannot nest.
export default function MethodCard({ m, why, calcs }) {
  const reason = why?.find((w) => !w.startsWith('needs'));
  const card = (
    <Link to={`/methods/${m.id}`} className="card">
      <span className="fam">{m.family}</span>
      <h3>{m.name}</h3>
      <p>{m.summary}</p>
      <div className="meta">
        <Status value={m.status} />
        <Validation value={m.validation} />
        {m.donor && <span>from {m.donor}</span>}
      </div>
      {reason && <span className="why-tag">{sentence(reason)}</span>}
    </Link>
  );
  if (!calcs?.length) return card;
  const [first, ...rest] = calcs;
  return (
    <div className="card-stack">
      {card}
      <p className="card-calc">
        <span className="lbl">Calculator</span><Link to={`/calculators/${first.id}`}>{first.name}</Link>
        {rest.length > 0 && <> <Link to={`/methods/${m.id}`} className="card-calc-more" aria-label={`${rest.length} more calculator${rest.length > 1 ? 's' : ''} on the ${m.name} page`}>+{rest.length} more</Link></>}
      </p>
    </div>
  );
}
