import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cameFrom, canGoBack, parentOf } from '../nav-trail.js';

// A "Back to …" link at the top of every page except Home. It goes back through this tab's history when the
// visitor came from another page of the site (so filters and scroll position return), and otherwise links to
// the page's parent, for visitors who arrived from a search result or a shared link.
export default function BackBar() {
  const loc = useLocation();
  const navigate = useNavigate();
  if (loc.pathname === '/') return null;
  const from = cameFrom(loc.key);
  const parent = parentOf(loc.pathname);
  return (
    <div className="back-bar">
      <div className="wrap">
        {from && canGoBack() ? (
          <button type="button" className="back-link" onClick={() => navigate(-1)}>
            <span aria-hidden="true">←</span> Back to {from.label}
          </button>
        ) : parent ? (
          <Link className="back-link" to={parent.path}><span aria-hidden="true">←</span> Back to {parent.label}</Link>
        ) : null}
      </div>
    </div>
  );
}
