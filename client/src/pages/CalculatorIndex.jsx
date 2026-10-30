// The calculators index (/calculators): search, stage tabs, "What do you have?" data chips, a guided picker, and a
// grid of compact cards. The filters live in the URL query (?stage=&data=&q=), so a filtered list can be shared; this
// works under the hash router of the static build too, where the query sits after the #.
import { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShowMoreList } from '../components/ShowMore.jsx';
import { CalcCard, TabList, tabPanelProps, useMethodNames } from '../components/CalcLearn.jsx';
import { CALC_INFO, DATA, DATA_KEYS, STAGES, STAGE_KEYS, byPopularity, matches } from '../calc/learn.js';

const SORTED = [...CALC_INFO].sort(byPopularity);
const readData = (v) => (v || '').split(',').filter((k) => DATA_KEYS.includes(k));

export default function CalculatorIndex() {
  const [params, setParams] = useSearchParams();
  const stage = STAGE_KEYS.includes(params.get('stage')) ? params.get('stage') : 'all';
  const data = readData(params.get('data'));
  const q = params.get('q') || '';
  const methodName = useMethodNames();
  const idBase = useId().replace(/:/g, '');

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v || (Array.isArray(v) && !v.length) || v === 'all') next.delete(k);
      else next.set(k, Array.isArray(v) ? v.join(',') : v);
    }
    setParams(next, { replace: true });
  };
  const toggleData = (k) => update({ data: data.includes(k) ? data.filter((d) => d !== k) : [...data, k] });

  // Everything but the stage, so the tabs can show how many calculators each stage holds under the other filters.
  const base = useMemo(() => SORTED.filter((c) => (!data.length || c.data.some((d) => data.includes(d))) && matches(c, q, methodName)), [data.join(), q, methodName]);
  const shown = stage === 'all' ? base : base.filter((c) => c.stages.includes(stage));
  const filtered = stage !== 'all' || data.length > 0 || q.trim();
  const tabs = [{ id: 'all', label: 'All', count: base.length }, ...STAGE_KEYS.map((k) => ({ id: k, label: STAGES[k].label, count: base.filter((c) => c.stages.includes(k)).length }))];

  return (
    <>
      <section className="hero compact calc-index-hero">
        <div className="wrap">
          <p className="eyebrow">UX calculators</p>
          <h1 className="h1">Do the maths properly.</h1>
          <p className="lede">{CALC_INFO.length} calculators for UX research: sample sizes, intervals, questionnaire scores, comparisons, segmentation, pricing and business cases. Find one by where you are in your study and what data you have. Everything runs in your browser; nothing you enter is sent anywhere.</p>
        </div>
      </section>
      <section className="section tight calc-index">
        <div className="wrap">
          <div className="calc-toolbar">
            <label className="search calc-search">
              <span className="sr-only">Search calculators</span>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" /><path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2.5" /></svg>
              <input type="search" value={q} placeholder="Search by name, question or method, such as “SUS” or “how many participants”" onChange={(e) => update({ q: e.target.value })} />
            </label>

            <div className="calc-filter">
              <h2 className="label" id={`${idBase}-stage-h`}>Where are you in your study?</h2>
              <TabList items={tabs} value={stage} onChange={(v) => update({ stage: v })} label="Where are you in your study?" idBase={idBase} className="stage-tabs" />
              {stage !== 'all' && <p className="calc-stage-desc">{STAGES[stage].desc}</p>}
            </div>

            <div className="calc-filter">
              <h2 className="label" id={`${idBase}-data-h`}>What do you have?</h2>
              <div className="calc-chips" role="group" aria-labelledby={`${idBase}-data-h`}>
                {DATA_KEYS.map((k) => (
                  <button key={k} type="button" className={`chip${data.includes(k) ? ' on' : ''}`} aria-pressed={data.includes(k)} onClick={() => toggleData(k)}>{DATA[k].label}</button>
                ))}
              </div>
            </div>
            {filtered && (
              <p className="calc-results-line" role="status">
                {shown.length} calculator{shown.length === 1 ? '' : 's'}
                <button type="button" className="skip-link" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</button>
              </p>
            )}
          </div>

          <GuidedPicker methodName={methodName} onApply={(st, d) => update({ stage: st, data: d ? [d] : [], q: '' })} />

          <div className="calc-results" {...tabPanelProps(idBase, stage)}>
            {!shown.length && <p className="notice">No calculator matches. Try fewer data types, another stage, or a different word.</p>}
            {filtered ? (
              <div className="calc-cards">{shown.map((c) => <CalcCard key={c.id} c={c} />)}</div>
            ) : STAGE_KEYS.map((k) => {
              const list = shown.filter((c) => c.stages.includes(k));
              return (
                <section key={k} className="calc-stage-sec" aria-labelledby={`${idBase}-sec-${k}`}>
                  <div className="calc-stage-head">
                    <h2 id={`${idBase}-sec-${k}`}><span className="n" aria-hidden="true">{STAGE_KEYS.indexOf(k) + 1}</span>{STAGES[k].label}</h2>
                    <p>{STAGES[k].desc}</p>
                  </div>
                  <ShowMoreList className="calc-cards" limit={6} noun={`${STAGES[k].short.toLowerCase()} calculators`}>
                    {list.map((c) => <CalcCard key={c.id} c={c} />)}
                  </ShowMoreList>
                </section>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

// "Not sure where to start?": stage, then data, then the matching calculators with the question each answers.
function GuidedPicker({ onApply }) {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState(null);
  const [d, setD] = useState(undefined); // undefined: not answered; null: skipped
  const id = useId().replace(/:/g, '');
  const atStage = st ? SORTED.filter((c) => c.stages.includes(st)) : [];
  const dataHere = DATA_KEYS.filter((k) => atStage.some((c) => c.data.includes(k)));
  const result = d === undefined ? [] : d ? atStage.filter((c) => c.data.includes(d)) : atStage;
  const step = !st ? 1 : d === undefined ? 2 : 3;
  const restart = () => { setSt(null); setD(undefined); };

  return (
    <section className={`calc-picker${open ? ' open' : ''}`} aria-labelledby={`${id}-h`}>
      <div className="calc-picker-head">
        <div>
          <h2 id={`${id}-h`}>Not sure where to start?</h2>
          <p>Answer two questions and see the calculators that fit. Comparing groups or testing a hunch? The <Link to="/calculators/test-selector">Statistical test selector</Link> picks the right test for you.</p>
        </div>
        <button type="button" className="btn small" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Help me choose'}</button>
      </div>
      {open && (
        <div id={`${id}-body`} className="calc-picker-body">
          <ol className="calc-picker-steps" aria-label="Progress">
            {['Your stage', 'Your data', 'Calculators'].map((label, i) => <li key={label} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''} aria-current={step === i + 1 ? 'step' : undefined}>{i + 1}. {label}</li>)}
          </ol>
          {step === 1 && (
            <fieldset className="calc-picker-q">
              <legend>Where are you in your study?</legend>
              <div className="calc-picker-opts">
                {STAGE_KEYS.map((k) => (
                  <button key={k} type="button" className="calc-opt" onClick={() => setSt(k)}>
                    <b>{STAGES[k].label}</b><span>{STAGES[k].desc}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {step === 2 && (
            <fieldset className="calc-picker-q">
              <legend>What do you have in hand?</legend>
              <div className="calc-chips">
                {dataHere.map((k) => <button key={k} type="button" className="chip" onClick={() => setD(k)}>{DATA[k].label}</button>)}
                <button type="button" className="chip" onClick={() => setD(null)}>Not sure yet</button>
              </div>
              <button type="button" className="skip-link" onClick={restart}>← Back</button>
            </fieldset>
          )}
          {step === 3 && (
            <div className="calc-picker-q">
              <p className="calc-picker-sum" role="status">
                {result.length} calculator{result.length === 1 ? '' : 's'} for <b>{STAGES[st].label.toLowerCase()}</b>{d ? <> with <b>{DATA[d].label.toLowerCase()}</b></> : ''}:
              </p>
              <ShowMoreList as="ul" className="calc-picker-list" limit={6} noun="calculators">
                {result.map((c) => (
                  <li key={c.id}><Link to={`/calculators/${c.id}`}>{c.name}</Link><span>{c.question}</span></li>
                ))}
              </ShowMoreList>
              <div className="calc-picker-actions">
                <button type="button" className="btn small accent" onClick={() => { onApply(st, d); setOpen(false); restart(); }}>Show these in the list</button>
                <button type="button" className="skip-link" onClick={() => setD(undefined)}>← Change data</button>
                <button type="button" className="skip-link" onClick={restart}>Start again</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
