import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { post, STATIC } from '../api.js';
import { useMethods } from '../hooks.js';
import { ShowMoreList } from '../components/ShowMore.jsx';
import { Status } from '../components/MethodCard.jsx';
import { StageBadges } from '../components/CalcLearn.jsx';
import { STAGES, STAGE_KEYS, calcInfo } from '../calc/learn.js';
import ModeSwitch, { PLAN_STORE as STORE, findLink } from '../components/ModeSwitch.jsx';
import { QUESTIONS as FINDER } from './Finder.jsx';
import { ACCESS, APPROACH, BUDGET, COLLECT, EXPERTISE, FRAMEWORKS, LIMITS, TIME, draftQuestion, planMarkdown, suggestFramework } from '../../../server/lib/plan.js';

// The answers live in the URL (?a=...&step=...), so a plan can be bookmarked, shared and revisited.
// The last plan is also kept for this browser session, for visitors who come back through the nav.
// This is the "Plan a whole study" mode of Find a method; ModeSwitch carries answers to and from the finder.
const GOAL_Q = FINDER.find((q) => q.id === 'goal');
const MATERIAL_Q = FINDER.find((q) => q.id === 'material');
const STEPS = ['Your question', 'Constraints', 'Approach', 'Material and goals'];
const FRAMING_IDS = ['research-question-prioritisation-matrix', 'objective-question-method-chain'];

const parse = (raw) => {
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : null; } catch { return null; }
};
// Drops empty values so the shared link stays short.
const compact = (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length) && !(v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)));
const toGoals = (sel = []) => [...new Set(sel.flatMap((v) => GOAL_Q.options.find((o) => o.v === v)?.goals || []))];
// Only the structured answers go to the planner; the question text stays in the browser.
const plannerInput = (s) => ({
  hasRQ: s.hasRQ, approach: s.approach, collect: s.collect, time: s.time, budget: s.budget, participants: s.participants,
  sampleSize: s.sampleSize, limits: s.limits, expertise: s.expertise, material: s.material, goals: toGoals(s.goal), picks: s.picks,
});

export default function Plan() {
  const [params, setParams] = useSearchParams();
  const { state: navState } = useLocation();
  const fromUrl = parse(params.get('a'));
  const [stored, setStored] = useState(() => { try { return parse(sessionStorage.getItem(STORE)); } catch { return null; } });
  const s = fromUrl || stored || {};
  const step = Math.min(Math.max(Number(params.get('step')) || 0, 0), STEPS.length);
  const done = step >= STEPS.length;
  // Material and goals are the finder's own questions: once answered there (or here), the steps go straight past them.
  const hasMaterial = Boolean(s.material && s.goal?.length);
  const last = hasMaterial && step < STEPS.length - 1 ? STEPS.length - 2 : STEPS.length - 1;

  const write = (next, nextStep = step, push = false) => {
    const c = compact(next);
    try { sessionStorage.setItem(STORE, JSON.stringify(c)); } catch { /* storage unavailable */ }
    const p = {};
    if (Object.keys(c).length) p.a = JSON.stringify(c);
    if (nextStep) p.step = String(nextStep);
    setParams(p, { replace: !push, state: navState }); // keeps the note on answers brought over from the finder
  };
  const set = (patch) => write({ ...s, ...patch });
  const go = (to) => { write(s, to, true); scrollTo(0, 0); };
  const reset = () => { try { sessionStorage.removeItem(STORE); } catch { /* storage unavailable */ } setStored(null); setParams({}, { replace: false }); };

  return (
    <div className="wrap finder plan-page">
      <h1 className="sr-only">Find a method: plan a whole study</h1>
      <ModeSwitch mode="study" link={findLink(s)} />
      <div className="progress no-print" aria-hidden="true">
        {[...STEPS, 'Plan'].map((_, i) => <span key={i} className={i <= step || (i === 3 && hasMaterial) ? 'done' : ''} />)}
      </div>
      {done ? <Roadmap s={s} set={set} go={go} reset={reset} /> : (
        <>
          <p className="eyebrow">Plan a whole study · Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
          {step === 0 && navState?.carried > 0 && (
            <p className="carry-note">
              {navState.carried === 1 ? 'One answer' : `${navState.carried} answers`} came over from One method and {navState.carried === 1 ? 'is' : 'are'} filled in below.
              {hasMaterial && ' What you have and what you need to find out are already answered, so that step is skipped.'}
            </p>
          )}
          {step === 0 && <QuestionStep s={s} set={set} />}
          {step === 1 && <ConstraintsStep s={s} set={set} />}
          {step === 2 && <ApproachStep s={s} set={set} />}
          {step === 3 && <MaterialStep s={s} set={set} />}
          {step === last && last < STEPS.length - 1 && (
            <p className="carry-note carry-after">
              Already answered: {[MATERIAL_Q.options.find((o) => o.v === s.material)?.label, ...s.goal.map((g) => GOAL_Q.options.find((o) => o.v === g)?.label)].filter(Boolean).join(' · ')}.{' '}
              <button type="button" className="linklike" onClick={() => go(STEPS.length - 1)}>Change</button>
            </p>
          )}
          <div className="finder-nav question-nav">
            <button className="btn ghost" onClick={() => go(step - 1)} disabled={step === 0}>Back</button>
            <div className="question-nav-end">
              {step === 0 && Object.keys(s).length > 0 && <button type="button" className="skip-link" onClick={reset}>Start over</button>}
              <button className="btn accent" onClick={() => go(step === last ? STEPS.length : step + 1)}>{step === last ? 'Build my plan' : 'Next'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// A row of option buttons, single or multiple choice.
function Choice({ label, help, options, value, onChange, multi, compact: small }) {
  const vals = multi ? value || [] : value;
  const toggle = (v) => {
    if (!multi) return onChange(vals === v ? undefined : v);
    const next = vals.includes(v) ? vals.filter((x) => x !== v) : [...vals, v];
    return onChange(typeof multi === 'number' ? next.slice(-multi) : next);
  };
  return (
    <fieldset className="plan-group">
      <legend>{label}</legend>
      {help && <p className="help">{help}</p>}
      <div className={`options${small ? ' compact' : ''}`} role={multi ? 'group' : 'radiogroup'} aria-label={label}>
        {options.map((o) => {
          const on = multi ? vals.includes(o.v) : vals === o.v;
          return (
            <button key={o.v} type="button" className={`option${on ? ' on' : ''}`} onClick={() => toggle(o.v)} aria-pressed={on}>
              <b>{o.label}</b>
              {o.hint && <small>{o.hint}</small>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const opts = (obj, hints = {}) => Object.entries(obj).map(([v, label]) => ({ v, label, hint: hints[v] }));

function QuestionStep({ s, set }) {
  const { data: methods } = useMethods();
  const framing = FRAMING_IDS.map((id) => methods?.find((m) => m.id === id)).filter(Boolean);
  const suggested = suggestFramework({ approach: s.approach, goals: toGoals(s.goal) });
  const fwKey = s.framework || suggested;
  const fw = FRAMEWORKS[fwKey];
  const vals = (s.fw || {})[fwKey] || {};
  const draft = draftQuestion({ ...s, framework: fwKey });
  return (
    <div className="question">
      <h2>Do you have a research question?</h2>
      <p className="help">A clear question decides everything after it. If you do not have one yet, we will help you get to one.</p>
      <Choice label="Research question" options={[{ v: 'yes', label: 'Yes, I have one', hint: 'Write it down and sharpen it' }, { v: 'no', label: 'Not yet', hint: 'Start from the decision it should inform' }]} value={s.hasRQ} onChange={(v) => set({ hasRQ: v })} />

      {s.hasRQ === 'yes' && (
        <div className="plan-sub">
          <label className="field">
            <span>Your question as it stands</span>
            <textarea rows={3} value={s.rq || ''} onChange={(e) => set({ rq: e.target.value })} placeholder="e.g. Why do new investors abandon the first order?" />
          </label>
          <fieldset className="plan-group">
            <legend>Sharpen it with a framework</legend>
            <p className="help">Each framework breaks a question into parts. Fill in the parts, and we assemble a draft.</p>
            <div className="options compact" role="radiogroup" aria-label="Framework">
              {Object.entries(FRAMEWORKS).map(([k, f]) => (
                <button key={k} type="button" className={`option${fwKey === k ? ' on' : ''}`} aria-pressed={fwKey === k} onClick={() => set({ framework: k })}>
                  <b>{f.name}{k === suggested && <span className="flag">Suggested</span>}</b>
                  <small>{f.suits}</small>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="fw-fields">
            {fw.fields.map(([k, label, hint]) => (
              <label key={k} className="field">
                <span>{label}</span>
                <input value={vals[k] || ''} placeholder={hint} onChange={(e) => set({ fw: { ...(s.fw || {}), [fwKey]: { ...vals, [k]: e.target.value } } })} />
              </label>
            ))}
          </div>
          {draft && (
            <div className="draft-q">
              <span className="label">Draft question ({fw.name})</span>
              <p>{draft}</p>
              {draft !== s.rq && !draft.includes('[') && <button type="button" className="btn ghost small" onClick={() => set({ rq: draft })}>Use this as my question</button>}
            </div>
          )}
        </div>
      )}

      {s.hasRQ === 'no' && (
        <div className="plan-sub">
          <div className="fw-fields">
            <label className="field"><span>What decision will this research inform?</span><input value={s.decision || ''} onChange={(e) => set({ decision: e.target.value })} placeholder="e.g. whether to rebuild onboarding this quarter" /></label>
            <label className="field"><span>Who is it about?</span><input value={s.who || ''} onChange={(e) => set({ who: e.target.value })} placeholder="e.g. first-time investors on mobile" /></label>
            <label className="field"><span>What do you need to know that you do not know now?</span><input value={s.needToKnow || ''} onChange={(e) => set({ needToKnow: e.target.value })} placeholder="e.g. where and why they give up" /></label>
          </div>
          {draft && <div className="draft-q"><span className="label">A starting question</span><p>{draft}</p></div>}
          {framing.length > 0 && (
            <p className="muted plan-note">
              Two methods help here: {framing.map((m, i) => <span key={m.id}>{i > 0 && ' and '}<Link to={`/methods/${m.id}`}>{m.name}</Link></span>)}. Your plan starts with one of them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ConstraintsStep({ s, set }) {
  return (
    <div className="question">
      <h2>What are you working with?</h2>
      <p className="help">Constraints shape the plan as much as the question does. Skip anything that does not apply.</p>
      <Choice compact label="Time available" options={opts(TIME, { hours: 'Today', days: 'This sprint', weeks: 'A proper study', months: 'A programme' })} value={s.time} onChange={(v) => set({ time: v })} />
      <Choice compact label="Budget" options={opts(BUDGET, { none: 'Nothing to spend', low: 'Incentives for a few people', moderate: 'Panel or agency for some of it', high: 'Whatever the study needs' })} value={s.budget} onChange={(v) => set({ budget: v })} />
      <Choice compact label="Access to participants" options={opts(ACCESS)} value={s.participants} onChange={(v) => set({ participants: v })} />
      <div className="plan-group">
        <label className="field plan-number">
          <span>Expected sample size <em>optional</em></span>
          <input type="number" min="1" inputMode="numeric" value={s.sampleSize || ''} onChange={(e) => set({ sampleSize: e.target.value ? Math.max(0, Math.round(Number(e.target.value))) || undefined : undefined })} placeholder="e.g. 12" />
        </label>
      </div>
      <fieldset className="plan-group">
        <legend>Ethics, approval and restrictions</legend>
        <div className="plan-checks">
          {Object.entries(LIMITS).map(([k, label]) => (
            <label key={k} className="radio">
              <input type="checkbox" checked={(s.limits || []).includes(k)} onChange={(e) => set({ limits: e.target.checked ? [...(s.limits || []), k] : (s.limits || []).filter((x) => x !== k) })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Choice compact label="Who will run it" options={opts(EXPERTISE, { newcomer: 'A designer, PM or junior researcher', mid: 'Comfortable with structured methods', expert: 'Statistics and theory welcome' })} value={s.expertise} onChange={(v) => set({ expertise: v })} />
    </div>
  );
}

function ApproachStep({ s, set }) {
  return (
    <div className="question">
      <h2>How will you study it?</h2>
      <p className="help">Pick the overall approach, then the ways you expect to collect data. Not sure? Pick the approach and we suggest the rest.</p>
      <Choice compact label="Approach" options={opts(APPROACH, { qualitative: 'Depth: reasons, meanings, experiences', quantitative: 'Numbers: how many, how much, how sure', mixed: 'Both, on purpose, and integrated' })} value={s.approach} onChange={(v) => set({ approach: v })} />
      <Choice compact multi label="Main data collection" help="Choose any that apply. The plan covers the first three." options={opts(COLLECT)} value={s.collect} onChange={(v) => set({ collect: v })} />
    </div>
  );
}

function MaterialStep({ s, set }) {
  return (
    <div className="question">
      <h2>What do you have, and what do you need to find out?</h2>
      <p className="help">The same choices as the method finder.</p>
      <Choice compact label={MATERIAL_Q.title} options={MATERIAL_Q.options} value={s.material} onChange={(v) => set({ material: v })} />
      <Choice compact multi={2} label={GOAL_Q.title} help="Pick up to two." options={GOAL_Q.options} value={s.goal} onChange={(v) => set({ goal: v })} />
    </div>
  );
}

function Roadmap({ s, set, go, reset }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const input = useMemo(() => plannerInput(s), [JSON.stringify(s)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    post('/api/plan', { input }).then((p) => live && setPlan(p)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [input]);

  const question = draftQuestion(s) || (s.rq || '').trim();
  const swap = (key, id) => set({ picks: { ...(s.picks || {}), [key]: id } });
  const unswap = (key) => { const { [key]: _, ...rest } = s.picks || {}; set({ picks: rest }); };

  const chips = [
    [0, s.hasRQ === 'yes' ? 'Has a question' : s.hasRQ === 'no' ? 'No question yet' : ''],
    [1, [TIME[s.time], BUDGET[s.budget], ACCESS[s.participants], s.sampleSize && `n = ${s.sampleSize}`, EXPERTISE[s.expertise], ...(s.limits || []).map((x) => LIMITS[x])].filter(Boolean).join(' · ')],
    [2, [APPROACH[s.approach], ...(s.collect || []).map((c) => COLLECT[c])].filter(Boolean).join(' · ')],
    [3, [MATERIAL_Q.options.find((o) => o.v === s.material)?.label, ...(s.goal || []).map((g) => GOAL_Q.options.find((o) => o.v === g)?.label)].filter(Boolean).join(' · ')],
  ];

  function download() {
    const site = STATIC ? `${location.origin}${location.pathname}#` : location.origin;
    const md = planMarkdown(s, plan, {
      methodUrl: (id) => `${site}/methods/${id}`,
      calcUrl: (id) => `${site}/calculators/${id}`,
      goalText: (s.goal || []).map((v) => GOAL_Q.options.find((o) => o.v === v)?.label).filter(Boolean).join(', '),
      materialText: MATERIAL_Q.options.find((o) => o.v === s.material)?.label || '',
      calcInfo: (id) => { const c = calcInfo(id); return c && { question: c.question, stage: STAGES[c.stages[0]].label, stageKey: c.stages[0] }; },
      stageOrder: STAGE_KEYS.map((k) => STAGES[k].label),
    });
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'study-plan.md' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }

  return (
    <div className="plan-result">
      <p className="eyebrow">Your study plan</p>
      <h1 className="h1 plan-title">{question || 'A research roadmap for your study'}</h1>
      <section className="answers-bar no-print" aria-label="Your answers">
        <span className="answers-bar-label">Your answers</span>
        <ul className="answers-chips">
          {chips.map(([i, text]) => (
            <li key={i}>
              <button type="button" className={`answer-chip${text ? '' : ' skipped'}`} onClick={() => go(i)} title={`Change: ${STEPS[i]}`}>
                {text || `${STEPS[i]}: any`}<span className="answer-chip-edit" aria-hidden="true">Change</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="plan-actions no-print">
        <button type="button" className="btn accent small" onClick={() => print()}>Print</button>
        <button type="button" className="btn ghost small" onClick={download} disabled={!plan}>Download as Markdown</button>
        <button type="button" className="btn ghost small" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
        <button type="button" className="skip-link" onClick={reset}>Start over</button>
      </div>

      {error && <div className="notice error">{error}</div>}
      {!plan && !error && <p className="muted"><span className="spinner" /> Building your plan…</p>}
      {plan && (
        <>
          {plan.warnings.length > 0 && (
            <div className="panel bad plan-warn"><h3>Watch out</h3><ul>{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
          )}
          <h2 className="h2 plan-h">Roadmap</h2>
          <ol className="phases">
            {plan.phases.map((ph, i) => (
              <li key={ph.key} className="phase">
                <span className="num" aria-hidden="true">{i + 1}</span>
                <div className="phase-body">
                  <h3>{ph.title}</h3>
                  <p className="phase-blurb">{ph.blurb}</p>
                  {ph.items.map((it) => <PhaseItem key={it.key} it={it} onSwap={(id) => swap(it.key, id)} onReset={() => unswap(it.key)} />)}
                </div>
              </li>
            ))}
          </ol>
          {plan.guidance.map((g) => (
            <section key={g.key} className="guide-block">
              <h2>{g.title}</h2>
              <p className="guide-intro">{g.intro}</p>
              <ShowMoreList className="guide-grid" limit={4} keep={(i) => g.options[i].recommended} noun="options">
                {g.options.map((o) => (
                  <div key={o.head} className={`guide-opt${o.recommended ? ' rec' : ''}`}>
                    <h3>{o.head}{o.recommended && <span className="flag">Suggested</span>}</h3>
                    <p>{o.text}</p>
                    {(o.ids.length > 0 || o.calcs?.length > 0) && (
                      <p className="guide-links">
                        {o.ids.map((m) => <Link key={m.id} to={`/methods/${m.id}`}>{m.name}</Link>)}
                        {(o.calcs || []).map((c) => <Link key={c.id} className="calc-link" to={`/calculators/${c.id}`}>{c.name}</Link>)}
                      </p>
                    )}
                  </div>
                ))}
              </ShowMoreList>
            </section>
          ))}
          <PlanCalculators plan={plan} />
          <p className="muted plan-foot no-print">
            This plan is a starting point built from rules, not a substitute for judgement. For a direction written for your exact problem, switch to <Link {...findLink(s)}>One method</Link> and describe it there.
          </p>
        </>
      )}
    </div>
  );
}

function PhaseItem({ it, onSwap, onReset }) {
  return (
    <div className="phase-item">
      {it.label && <span className="phase-label">{it.label}</span>}
      <h4>
        <Link to={`/methods/${it.method.id}`}>{it.method.name}</Link> <Status value={it.method.status} />
        {it.picked && <span className="flag">Your pick</span>}
      </h4>
      <p className="phase-reason">{it.reason}</p>
      {it.calcs.length > 0 && (
        <div className="phase-calcs-block">
          <span className="lbl">Calculators</span>
          <ul className="phase-calc-list">
            {it.calcs.map((c) => {
              const info = calcInfo(c.id);
              return (
                <li key={c.id}>
                  <span className="top"><Link to={`/calculators/${c.id}`}>{c.name}</Link>{info && <StageBadges stages={info.stages.slice(0, 1)} short={false} />}</span>
                  {info && <span className="q">{info.question}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {it.alternatives.length > 0 && (
        <div className="swap">
          <span className="lbl">Swap for a similar method</span>
          <div className="swap-list">
            {it.alternatives.map((a) => (
              <span key={a.id} className="swap-opt">
                <button type="button" className="chip" onClick={() => (a.original ? onReset() : onSwap(a.id))} title={a.summary}>
                  {a.original ? `Back to ${a.name}` : a.name}
                </button>
                <Link to={`/methods/${a.id}`} className="swap-read" aria-label={`Read about ${a.name}`}>Read</Link>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Every calculator the plan mentions, grouped by the stage of the study where it is used first.
function PlanCalculators({ plan }) {
  const seen = new Map();
  const add = (c, where) => {
    const info = calcInfo(c.id);
    if (!info) return;
    if (!seen.has(c.id)) seen.set(c.id, { info, where: [] });
    if (where && !seen.get(c.id).where.includes(where)) seen.get(c.id).where.push(where);
  };
  plan.phases.forEach((ph) => ph.items.forEach((it) => it.calcs.forEach((c) => add(c, ph.title))));
  plan.guidance.forEach((g) => g.options.forEach((o) => (o.calcs || []).forEach((c) => add(c, g.title))));
  if (!seen.size) return null;
  const groups = STAGE_KEYS.map((k) => [k, [...seen.values()].filter((v) => v.info.stages[0] === k)]).filter(([, list]) => list.length);
  return (
    <section className="plan-calcs" aria-labelledby="plan-calcs-h">
      <h2 id="plan-calcs-h">Calculators for this plan</h2>
      <p>The numbers work this plan calls for, in the order you will meet it. Each calculator explains when to use it and walks you through it.</p>
      <div className="plan-calcs-grid">
        {groups.map(([k, list]) => (
          <div key={k} className="plan-calcs-stage">
            <h3><span className="n" aria-hidden="true">{STAGE_KEYS.indexOf(k) + 1}</span>{STAGES[k].label}</h3>
            <ul>
              {list.map(({ info, where }) => (
                <li key={info.id}>
                  <Link to={`/calculators/${info.id}`}>{info.name}</Link>
                  <span className="q">{info.question}</span>
                  {where.length > 0 && <span className="for">For: {where.join(', ')}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
