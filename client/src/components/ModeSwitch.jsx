import { Link } from 'react-router-dom';

// "Find a method" has two modes: the finder (/find) and the study planner (/plan).
// Both ask what you need to find out, what you have, who you can reach, how long you have and
// who will run it, so switching modes hands those answers across and neither asks them again.

// The planner keeps its last plan here for the browser session (see Plan.jsx).
export const PLAN_STORE = 'atlas-study-plan';
// The finder's answers as last handed to the planner, so a round trip keeps the finder-only ones.
const FINDER_STORE = 'atlas-finder-carry';

const read = (key) => {
  try { const v = JSON.parse(sessionStorage.getItem(key) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '');
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => filled(v)));

// Finder answers in the planner's terms.
export function finderToPlan(sel = {}) {
  return defined({
    goal: sel.goal?.length ? sel.goal : undefined,
    material: sel.material,
    participants: sel.participants !== 'any' ? sel.participants : undefined,
    time: sel.time,
    approach: ['qualitative', 'quantitative', 'mixed'].includes(sel.data) ? sel.data : undefined,
    expertise: sel.level,
  });
}

// Planner answers in the finder's terms.
export function planToFinder(s = {}) {
  return defined({ goal: s.goal, material: s.material, participants: s.participants, time: s.time, data: s.approach, level: s.expertise });
}

// Where "Plan a whole study" goes from the finder: the planner's own answers, updated with the finder's.
export function planLink(sel) {
  const carried = finderToPlan(sel);
  const merged = { ...read(PLAN_STORE), ...carried };
  const n = Object.keys(carried).length;
  return {
    to: Object.keys(merged).length ? `/plan?a=${encodeURIComponent(JSON.stringify(merged))}` : '/plan',
    state: n ? { carried: n } : undefined,
    onClick: () => { try { sessionStorage.setItem(FINDER_STORE, JSON.stringify(defined(sel))); } catch { /* storage unavailable */ } },
  };
}

// Where "One method" goes from the planner: the finder, already answered as far as the plan goes.
export function findLink(s) {
  const carried = planToFinder(s);
  // Keep only the finder answers the planner cannot hold: how adventurous, and "not a constraint" or "whatever is right".
  const own = Object.fromEntries(Object.entries(read(FINDER_STORE)).filter(([k, v]) => k === 'appetite' || v === 'any'));
  const sel = { ...own, ...carried };
  return { to: '/find', state: Object.keys(sel).length ? { carry: sel } : undefined };
}

export default function ModeSwitch({ mode, link }) {
  const items = [
    ['one', 'One method', 'Seven questions, matched methods'],
    ['study', 'Plan a whole study', 'Your question to a phased roadmap'],
  ];
  return (
    <nav className="mode-switch no-print" aria-label="Find a method">
      {items.map(([key, label, hint]) => (key === mode
        ? <span key={key} className="mode-opt on" aria-current="page"><b>{label}</b><small>{hint}</small></span>
        : <Link key={key} className="mode-opt" to={link.to} state={link.state} onClick={link.onClick}><b>{label}</b><small>{hint}</small></Link>
      ))}
    </nav>
  );
}
