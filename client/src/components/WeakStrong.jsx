// Weak vs strong: one demo with a Weak / Strong switch, the "what changed" notes highlighted on the strong version,
// and a "Try it yourself" prompt. Also the strip that shows the relevant demos on method and calculator pages,
// and the "See it" link on bias cards. Data: demos.js.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BIAS_BY_ID } from '../biases.js';
import { calcInfo } from '../calc/learn.js';
import { demosForBias, demosForCalc, demosForMethod, kindOf, versionText } from '../demos.js';
import { useMethodNames } from './CalcLearn.jsx';

// ---------------------------------------------------------------- highlighting the marked phrases

function segments(text, marks) {
  if (!marks.length) return [{ text }];
  const hits = [];
  for (const m of marks) {
    let i = text.indexOf(m.mark);
    while (i !== -1) { hits.push({ start: i, end: i + m.mark.length, n: m.n }); i = text.indexOf(m.mark, i + m.mark.length); }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = []; let pos = 0;
  for (const h of hits) {
    if (h.start < pos) continue;
    if (h.start > pos) out.push({ text: text.slice(pos, h.start) });
    out.push({ text: text.slice(h.start, h.end), n: h.n });
    pos = h.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

function Hl({ text, ctx }) {
  return segments(text, ctx.marks).map((s, i) => (s.n
    ? <mark key={i} className={`ws-mk${ctx.active === s.n ? ' is-active' : ''}`}><span className="ws-mk-n" aria-hidden="true">{s.n}</span>{s.text}</mark>
    : <span key={i}>{s.text}</span>));
}

function SvgHl({ text, ctx }) {
  return segments(text, ctx.marks).map((s, i) => (s.n
    ? <tspan key={i} className={`ws-mk-svg${ctx.active === s.n ? ' is-active' : ''}`}>{s.text}</tspan>
    : <tspan key={i}>{s.text}</tspan>));
}

// ---------------------------------------------------------------- the small charts

const fmt = (v) => (Math.abs(v) < 1 && v !== 0 ? String(v) : v.toLocaleString('en-GB'));

function Bars({ b, ctx }) {
  const W = 320; const H = 190; const L = 40; const R = 10; const T = 12; const B = b.bars.some((x) => x.sub) ? 46 : 30;
  const y = (v) => T + (H - T - B) * (1 - (v - b.min) / (b.max - b.min));
  const slot = (W - L - R) / b.bars.length;
  const bw = Math.min(56, slot * 0.55);
  const desc = b.bars.map((x) => `${x.label}${x.sub ? ` (${x.sub})` : ''}: ${x.value}${b.unit || ''}${x.lo !== undefined ? `, interval ${x.lo} to ${x.hi}` : ''}`).join('; ');
  return (
    <figure className="ws-fig">
      <figcaption className="ws-fig-title"><Hl text={b.title} ctx={ctx} /></figcaption>
      <svg className="ws-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${b.title}. Axis from ${b.min} to ${b.max}${b.unit || ''}. ${desc}.`}>
        {b.ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="ws-grid" />
            <text x={L - 6} y={y(t)} dy="0.32em" textAnchor="end" className="ws-tick">{fmt(t)}{b.unit || ''}</text>
          </g>
        ))}
        {b.bars.map((x, i) => {
          const cx = L + slot * (i + 0.5);
          return (
            <g key={x.label}>
              <rect x={cx - bw / 2} y={y(x.value)} width={bw} height={Math.max(0, y(b.min) - y(x.value))} className="ws-bar" />
              {x.lo !== undefined && (
                <g className="ws-whisker">
                  <line x1={cx} x2={cx} y1={y(x.hi)} y2={y(x.lo)} />
                  <line x1={cx - 7} x2={cx + 7} y1={y(x.hi)} y2={y(x.hi)} />
                  <line x1={cx - 7} x2={cx + 7} y1={y(x.lo)} y2={y(x.lo)} />
                </g>
              )}
              <text x={cx} y={H - B + 17} textAnchor="middle" className="ws-xlab"><SvgHl text={x.label} ctx={ctx} /></text>
              {x.sub && <text x={cx} y={H - B + 35} textAnchor="middle" className="ws-xsub"><SvgHl text={x.sub} ctx={ctx} /></text>}
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(b.min)} y2={y(b.min)} className="ws-axis" />
      </svg>
      {b.note && <p className="ws-fig-note"><Hl text={b.note} ctx={ctx} /></p>}
    </figure>
  );
}

function LineChart({ b, ctx }) {
  const W = 320; const H = 180; const L = 44; const R = 14; const T = 12; const B = 28;
  const n = b.values.length;
  const x = (i) => L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - b.min) / (b.max - b.min));
  const pts = b.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const desc = b.values.map((v, i) => `${b.labels[i] || i + 1}: ${fmt(v)}`).join(', ');
  return (
    <figure className="ws-fig">
      <figcaption className="ws-fig-title"><Hl text={b.title} ctx={ctx} /></figcaption>
      <svg className="ws-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${b.title}. ${desc}${b.threshold ? `. Dashed line at ${b.threshold.label}` : ''}.`}>
        {b.ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="ws-grid" />
            <text x={L - 6} y={y(t)} dy="0.32em" textAnchor="end" className="ws-tick">{fmt(t)}</text>
          </g>
        ))}
        {b.threshold && (
          <g className="ws-threshold">
            <line x1={L} x2={W - R} y1={y(b.threshold.value)} y2={y(b.threshold.value)} />
            <text x={W - R} y={y(b.threshold.value) - 5} textAnchor="end">{b.threshold.label}</text>
          </g>
        )}
        <polyline points={pts} className="ws-line" />
        {b.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === b.mark ? 5.5 : 2.5} className={i === b.mark ? 'ws-pt is-mark' : 'ws-pt'} />)}
        {b.labels.map((lab, i) => lab && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="ws-tick">{lab}</text>)}
        <line x1={L} x2={W - R} y1={y(b.min)} y2={y(b.min)} className="ws-axis" />
      </svg>
      {b.note && <p className="ws-fig-note"><Hl text={b.note} ctx={ctx} /></p>}
    </figure>
  );
}

// ---------------------------------------------------------------- one version's blocks

function Block({ b, ctx }) {
  const label = b.label && <span className="ws-label"><Hl text={b.label} ctx={ctx} /></span>;
  switch (b.t) {
    case 'p':
      return <div className="ws-p">{label}<p><Hl text={b.text} ctx={ctx} /></p></div>;
    case 'q':
      return (
        <div className="ws-q">
          <p className="ws-q-text"><Hl text={b.text} ctx={ctx} /></p>
          <ul className={`ws-opts${b.multi ? ' is-multi' : ''}`} aria-label="Answer options">
            {b.options.map((o) => <li key={o}><span className="ws-box" aria-hidden="true" /><span><Hl text={o} ctx={ctx} /></span></li>)}
          </ul>
          {b.note && <p className="ws-q-note"><Hl text={b.note} ctx={ctx} /></p>}
        </div>
      );
    case 'list': {
      const Tag = b.ordered ? 'ol' : 'ul';
      return <div className="ws-p">{label}<Tag className="ws-list">{b.items.map((it) => <li key={it}><Hl text={it} ctx={ctx} /></li>)}</Tag></div>;
    }
    case 'quote':
      return (
        <figure className="ws-quote">
          <blockquote><p>“<Hl text={b.text} ctx={ctx} />”</p></blockquote>
          <figcaption>
            <span className="ws-who">{b.who}</span>
            <span className="ws-codes"><span className="ws-codes-l">Codes</span>{b.codes.length ? b.codes.map((c) => <span key={c} className="ws-code"><Hl text={c} ctx={ctx} /></span>) : <span className="muted">none</span>}</span>
          </figcaption>
        </figure>
      );
    case 'table':
      return (
        <div className="ws-table-wrap">
          <table className="ws-table">
            {b.caption && <caption><Hl text={b.caption} ctx={ctx} /></caption>}
            <thead><tr>{b.head.map((h) => <th key={h} scope="col"><Hl text={h} ctx={ctx} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r) => <tr key={r.join('|')}>{r.map((c, i) => (i === 0 ? <th key={i} scope="row"><Hl text={c} ctx={ctx} /></th> : <td key={i}><Hl text={c} ctx={ctx} /></td>))}</tr>)}</tbody>
          </table>
        </div>
      );
    case 'bars': return <Bars b={b} ctx={ctx} />;
    case 'line': return <LineChart b={b} ctx={ctx} />;
    default: return null;
  }
}

// ---------------------------------------------------------------- the demo

const SIDES = ['weak', 'strong'];
const SIDE_LABEL = { weak: 'Weak', strong: 'Strong' };

export function WeakStrong({ demo: d, headingLevel = 2, compact = false, footer = null }) {
  const [side, setSide] = useState('weak');
  const [active, setActive] = useState(null);
  const [animate, setAnimate] = useState(false);
  const methodName = useMethodNames();
  const uid = useId();
  const btns = useRef({});
  const H = `h${headingLevel}`;
  const kind = kindOf(d.kind);

  const choose = (s, focus = false) => {
    if (s === side) return;
    setAnimate(true);
    setSide(s);
    setActive(null);
    if (focus) btns.current[s]?.focus();
  };
  const flip = () => choose(side === 'weak' ? 'strong' : 'weak');
  const onKey = (e) => {
    const keys = { ArrowLeft: 'weak', ArrowUp: 'weak', ArrowRight: 'strong', ArrowDown: 'strong', Home: 'weak', End: 'strong' };
    if (keys[e.key]) { e.preventDefault(); choose(keys[e.key], true); }
  };

  const strong = side === 'strong';
  // Number the notes in the order their phrases appear in the strong version.
  const anns = useMemo(() => {
    const all = versionText(d.strong).join('\n');
    return [...d.annotations].sort((a, b) => all.indexOf(a.mark) - all.indexOf(b.mark));
  }, [d]);
  const ctx = { marks: strong ? anns.map((a, i) => ({ mark: a.mark, n: i + 1 })) : [], active };
  const calcs = d.calcs.map(calcInfo).filter(Boolean);

  return (
    <article className={`ws-demo${compact ? ' is-compact' : ''}`} aria-labelledby={`${uid}-h`}>
      <div className="ws-head">
        <p className="ws-kind">{kind?.name}</p>
        <H className="ws-title" id={`${uid}-h`}>{d.title}</H>
      </div>

      <div className="ws-controls">
        <div className={`ws-switch is-${side}`} role="radiogroup" aria-label={`Version of “${d.title}”`} onKeyDown={onKey}>
          {SIDES.map((s) => (
            <button
              key={s} type="button" role="radio" aria-checked={side === s} tabIndex={side === s ? 0 : -1}
              ref={(el) => { btns.current[s] = el; }} className={`ws-switch-btn ws-${s}`} onClick={() => choose(s)}
            >{SIDE_LABEL[s]}</button>
          ))}
        </div>
        <button type="button" className="btn small ghost ws-flip" onClick={flip}><span aria-hidden="true">⇄</span> Flip</button>
      </div>

      <p className="sr-only" role="status">{animate ? `Showing the ${side} version` : ''}</p>
      <div className={`ws-stage is-${side}`}>
        <div key={side} className={`ws-version${animate ? ' ws-anim' : ''}`} id={`${uid}-v`}>
          <p className={`ws-side ws-side-${side}`}>{strong ? 'Strong version' : 'Weak version'}</p>
          {(strong ? d.strong : d.weak).blocks.map((b, i) => <Block key={i} b={b} ctx={ctx} />)}
        </div>
      </div>

      {strong ? (
        <div className="ws-notes">
          <h3 className="label">What changed</h3>
          <ol className="ws-anns">
            {anns.map((a, i) => (
              <li key={a.mark}>
                <button
                  type="button" className={`ws-ann${active === i + 1 ? ' is-active' : ''}`} aria-pressed={active === i + 1}
                  onClick={() => setActive(active === i + 1 ? null : i + 1)}
                  onMouseEnter={() => setActive(i + 1)} onMouseLeave={() => setActive(null)}
                >
                  <span className="ws-ann-n" aria-hidden="true">{i + 1}</span>
                  <span><b className="ws-ann-mark">“{a.mark}”</b> {a.note}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="ws-notes ws-problem">
          <h3 className="label">What goes wrong</h3>
          <p>{d.problem}</p>
          <p className="ws-hint muted">Switch to <button type="button" className="ws-linkbtn" onClick={() => choose('strong')}>Strong</button> to see what changed.</p>
        </div>
      )}

      <div className="ws-try">
        <h3 className="label">Try it yourself</h3>
        <p>{d.tryIt}</p>
      </div>

      <div className="ws-meta">
        {d.biases.length > 0 && (
          <div><span className="label">Biases it addresses</span><span className="tags">{d.biases.map((b) => BIAS_BY_ID.get(b)).filter(Boolean).map((b) => <Link key={b.id} className="tag" to={`/biases?b=${b.id}`}>{b.name}</Link>)}</span></div>
        )}
        {!compact && d.methods.length > 0 && (
          <div><span className="label">Methods</span><span className="tags">{d.methods.map((m) => <Link key={m} className="tag" to={`/methods/${m}`}>{methodName(m)}</Link>)}</span></div>
        )}
        {!compact && calcs.length > 0 && (
          <div><span className="label">Calculators</span><span className="tags">{calcs.map((c) => <Link key={c.id} className="tag" to={`/calculators/${c.id}`}>{c.name}</Link>)}</span></div>
        )}
      </div>
      {footer}
    </article>
  );
}

// ---------------------------------------------------------------- the strip on method and calculator pages

export function DemoStrip({ methodId, calcId }) {
  const list = methodId ? demosForMethod(methodId) : demosForCalc(calcId);
  const [pick, setPick] = useState(0);
  const uid = useId();
  useEffect(() => { setPick(0); }, [methodId, calcId]);
  if (!list.length) return null;
  const d = list[Math.min(pick, list.length - 1)];
  const onMethod = Boolean(methodId);
  return (
    <section className={`ws-strip${onMethod ? ' block' : ''}`} aria-labelledby={`${uid}-h`}>
      <div className="ws-strip-head">
        {onMethod ? <h2 id={`${uid}-h`}>Weak vs strong</h2> : <h2 id={`${uid}-h`} className="label">Weak vs strong</h2>}
        <p className="ws-strip-lede">{list.length === 1 ? 'An example' : `${list.length} examples`} of doing this badly and doing it well. Flip between them to see what changes.</p>
      </div>
      {list.length > 1 && (
        <div className="ws-strip-pick" role="group" aria-label="Choose an example">
          {list.map((x, i) => <button key={x.id} type="button" className={`chip${x.id === d.id ? ' on' : ''}`} aria-pressed={x.id === d.id} onClick={() => setPick(i)}>{x.title}</button>)}
        </div>
      )}
      <WeakStrong key={d.id} demo={d} compact headingLevel={3} />
      <Link className="ws-more" to={`/demos?d=${d.id}`}>Open in Weak vs strong →</Link>
    </section>
  );
}

// ---------------------------------------------------------------- "See it" on a bias card

export function SeeItLink({ biasId }) {
  const list = demosForBias(biasId);
  if (!list.length) return null;
  const to = list.length === 1 ? `/demos?d=${list[0].id}` : `/demos?bias=${biasId}`;
  return <Link className="ws-see" to={to}>See it: {list.length === 1 ? 'a weak vs strong example' : `${list.length} weak vs strong examples`} →</Link>;
}
