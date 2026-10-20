import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMeta, useMethods, useRemembered } from '../hooks.js';
import MethodCard from '../components/MethodCard.jsx';
import Loading from '../components/Loading.jsx';
import { DATA, EFFORT, GOALS, STAGES, STATUS, STATUS_ORDER, VALIDATION, slug } from '../vocab.js';

const PAGE = 60;

function matches(m, words) {
  if (!words.length) return true;
  const h = [m.name, ...(m.aka || []), m.summary, m.family, m.donor, m.origin, ...(m.keywords || [])].join(' ').toLowerCase();
  return words.every((w) => h.includes(w));
}

export default function Atlas() {
  const { data: methods, error } = useMethods();
  const { data: meta } = useMeta();
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useRemembered('limit', PAGE);

  const q = params.get('q') || '';
  const f = {
    family: params.get('family') || '',
    status: params.get('status') || '',
    goal: params.get('goal') || '',
    stage: params.get('stage') || '',
    data: params.get('data') || '',
    effort: params.get('effort') || '',
    validation: params.get('validation') || '',
  };
  const sort = params.get('sort') || 'name';

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  const list = useMemo(() => {
    if (!methods) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = methods.filter((m) =>
      matches(m, words) &&
      (!f.family || slug(m.family) === f.family) &&
      (!f.status || m.status === f.status) &&
      (!f.goal || m.facets?.goals?.includes(f.goal)) &&
      (!f.stage || m.facets?.stage?.includes(f.stage)) &&
      (!f.data || m.facets?.data === f.data) &&
      (!f.effort || m.facets?.effort === f.effort) &&
      (!f.validation || m.validation === f.validation)
    );
    const by = {
      name: (a, b) => a.name.localeCompare(b.name),
      family: (a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name),
      status: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name),
      donor: (a, b) => (a.donor || '').localeCompare(b.donor || '') || a.name.localeCompare(b.name),
    }[sort];
    return out.sort(by);
  }, [methods, q, f.family, f.status, f.goal, f.stage, f.data, f.effort, f.validation, sort]);

  if (!methods) return <Loading error={error} />;
  const active = Object.values(f).some(Boolean) || q;

  return (
    <>
      <section className="hero" style={{ paddingBottom: 40 }}>
        <div className="wrap">
          <p className="eyebrow">The atlas</p>
          <h1 className="h1">{methods.length} methods.</h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            Search by name, discipline, idea or problem. Filter by what you need to learn and how much time you have.
          </p>
        </div>
      </section>
      <div className="toolbar">
        <div className="wrap">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Try “error taxonomy”, “causal”, “Shannon”, “fintech”…"
              aria-label="Search methods"
            />
          </label>
          <div className="filters">
            <select className="select" value={f.family} onChange={(e) => set('family', e.target.value)} aria-label="Discipline">
              <option value="">All disciplines</option>
              {(meta?.families || []).map((x) => <option key={x.name} value={slug(x.name)}>{x.name}</option>)}
            </select>
            <select className="select" value={f.status} onChange={(e) => set('status', e.target.value)} aria-label="Loss type">
              <option value="">Any loss type</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}: {STATUS[s].short}</option>)}
            </select>
            {f.status === 'community' && (
              <select className="select" value={f.validation} onChange={(e) => set('validation', e.target.value)} aria-label="Tested">
                <option value="">Tested or not</option>
                {Object.entries(VALIDATION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            )}
            <select className="select" value={f.goal} onChange={(e) => set('goal', e.target.value)} aria-label="Goal">
              <option value="">Any goal</option>
              {Object.entries(GOALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="select" value={f.stage} onChange={(e) => set('stage', e.target.value)} aria-label="Stage">
              <option value="">Any stage</option>
              {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="select" value={f.data} onChange={(e) => set('data', e.target.value)} aria-label="Data">
              <option value="">Any data</option>
              {Object.entries(DATA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="select" value={f.effort} onChange={(e) => set('effort', e.target.value)} aria-label="Effort">
              <option value="">Any effort</option>
              {Object.entries(EFFORT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {active && <button className="chip" onClick={() => { setParams({}, { replace: true }); setLimit(PAGE); }}>Clear all</button>}
          </div>
        </div>
      </div>
      <div className="wrap">
        <div className="results-line">
          <span><b>{list.length}</b> methods</span>
          <label>
            Sort{' '}
            <select className="select" value={sort} onChange={(e) => set('sort', e.target.value === 'name' ? '' : e.target.value)}>
              <option value="name">A to Z</option>
              <option value="family">Discipline</option>
              <option value="status">Loss type</option>
              <option value="donor">Donor field</option>
            </select>
          </label>
        </div>
        {list.length === 0 ? (
          <div className="empty"><h3>No methods match.</h3><p>Loosen a filter or try another word.</p></div>
        ) : (
          <div className="grid">{list.slice(0, limit).map((m) => <MethodCard key={m.id} m={m} />)}</div>
        )}
        {list.length > limit && (
          <div style={{ textAlign: 'center', margin: '40px 0 88px' }}>
            <button className="btn ghost" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, list.length - limit)} more</button>
          </div>
        )}
        <div style={{ height: 88 }} />
      </div>
    </>
  );
}
