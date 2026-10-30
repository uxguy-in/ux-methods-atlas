import { useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as HR from './decisions-hra.js';
import { sig } from './decisions-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Choice, Pick, Result, Stats, About, Bars } from './ui.jsx';
import './decisions.css';

// HEART example: the worked example reproduced in many HRA texts (task type F; EPCs 15, 9, 12, 18, 31), HEP 0.27.
const EX_HEART = { gtt: 'F', epcs: [{ id: 15, apoa: 0.4 }, { id: 9, apoa: 1 }, { id: 12, apoa: 0.8 }, { id: 18, apoa: 0.8 }, { id: 31, apoa: 0.6 }] };
// SPAR-H example: a nurse programming a dose on an infusion pump (action only) under high stress, with a
// moderately complex entry sequence, a poor quick-reference card and a poor interface.
const nom = (part) => HR.PSF.map((p) => HR.nominalIndex(p, part));
const lvl = (part, picks) => HR.PSF.map((p, i) => (p.id in picks ? p[part].findIndex(([l]) => l.startsWith(picks[p.id])) : nom(part)[i]));
const EX_SPAR = { parts: 'action', diagnosis: nom('diagnosis'), action: lvl('action', { stress: 'High', complexity: 'Moderately', procedures: 'Available, but poor', ergonomics: 'Poor' }), dep: 'zero' };

// ── Human error probability: HEART and SPAR-H ──
function DecHumanError() {
  const [method, setMethod] = useState('heart');
  const [gtt, setGtt] = useState(EX_HEART.gtt);
  const [epcs, setEpcs] = useState(EX_HEART.epcs);
  const [addId, setAddId] = useState('2');
  const [sp, setSp] = useState(EX_SPAR);
  const loadExample = () => { setGtt(EX_HEART.gtt); setEpcs(EX_HEART.epcs); setSp(EX_SPAR); };

  const h = HR.heart(gtt, epcs);
  const avail = HR.EPC.filter((x) => !epcs.some((e) => e.id === x.id));
  const addSel = avail.some((x) => String(x.id) === addId) ? addId : String(avail[0]?.id ?? '');
  const parts = sp.parts === 'both' ? ['diagnosis', 'action'] : [sp.parts];
  const pr = parts.map((p) => HR.sparhPart(p, sp[p]));
  const total = pr.length === 2 ? HR.combine(pr[0].hep, pr[1].hep) : pr[0].hep;
  const dep = HR.withDependence(total, sp.dep);
  const maxLog = Math.max(...h.rows.map((r) => Math.log10(r.effect)), 0.01);

  return (
    <div className="dc-root">
      <LoadExample onClick={loadExample} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Method" value={method} onChange={setMethod} options={[['heart', 'HEART'], ['sparh', 'SPAR-H']]} />
      </div>
      {method === 'heart' ? (
        <>
          <section className="ea-card">
            <h4>1. Generic task type</h4>
            <Pick label="Which description fits the task best?" value={gtt} onChange={setGtt} options={HR.GTT.map((g) => [g.id, `${g.id}: ${g.text.length > 90 ? `${g.text.slice(0, 89)}…` : g.text} (${g.hep})`])} />
            <p className="dc-note">{h.gtt.text}. Nominal {h.gtt.hep}, 5th–95th percentile {h.gtt.lo} to {h.gtt.hi}.</p>
          </section>
          <section className="ea-card">
            <h4>2. Error-producing conditions</h4>
            <p className="dc-note">For each condition that applies, set the assessed proportion of affect (APOA): 0 = not at all, 1 = the full effect.</p>
            {epcs.map((e, i) => {
              const row = h.rows[i];
              return (
                <div key={e.id} className="dc-epc">
                  <span className="nm"><b>EPC {e.id}</b> {row.text} <span className="dc-note">(max ×{row.max})</span></span>
                  <input type="range" min={0} max={1} step={0.05} value={e.apoa} aria-label={`Proportion of affect for EPC ${e.id}`} onChange={(ev) => setEpcs(epcs.map((x, j) => (j === i ? { ...x, apoa: Number(ev.target.value) } : x)))} />
                  <span className="v">{e.apoa.toFixed(2)} → ×{sig(row.effect, 3)}</span>
                  <button type="button" className="btn ghost small" aria-label={`Remove EPC ${e.id}`} onClick={() => setEpcs(epcs.filter((_, j) => j !== i))}>×</button>
                </div>
              );
            })}
            <div className="dc-actions">
              <Pick label="Add a condition" value={addSel} onChange={setAddId} options={avail.map((x) => [String(x.id), `${x.id}. ${x.text.length > 70 ? `${x.text.slice(0, 69)}…` : x.text} (×${x.max})`])} />
              <button type="button" className="btn ghost small" disabled={!avail.length} onClick={() => { const id = Number(addSel); if (avail.some((x) => x.id === id)) setEpcs([...epcs, { id, apoa: 0.5 }]); }}>+ Add</button>
            </div>
          </section>
          <Result big={sig(h.hep, 2)} tone={h.hep > 0.1 ? 'bad' : h.hep > 0.01 ? undefined : 'good'} label={`Human error probability (${HR.oneIn(h.hep)})${h.capped ? ', capped at 1' : ''}`}>
            <Stats rows={[
              ['Nominal (task type ' + h.gtt.id + ')', sig(h.gtt.hep, 3)],
              ['Product of assessed effects', `×${sig(h.product, 4)}`],
              ['Range from task-type bounds', `${sig(h.lo, 2)} to ${sig(h.hi, 2)}`],
            ]} />
          </Result>
          {h.rows.length > 0 && (
            <>
              <Table label="Calculation" head={['EPC', 'Max effect', 'APOA', 'Assessed effect = (max − 1) × APOA + 1']} rows={[...h.rows.map((r) => [`${r.id}. ${r.text}`, `×${r.max}`, r.apoa.toFixed(2), `×${sig(r.effect, 4)}`]), [<b key="t">HEP = {h.gtt.hep} × {h.rows.map((r) => sig(r.effect, 3)).join(' × ')}</b>, '', '', <b key="v">{sig(h.raw, 3)}</b>]]} />
              <h3 className="clu-h3">What drives the error probability</h3>
              <Bars label="Assessed effect of each condition, log scale" rows={[...h.rows].sort((a, b) => b.effect - a.effect).map((r) => [`EPC ${r.id}: ${r.text}`, Math.log10(r.effect) / maxLog, `×${sig(r.effect, 3)}`, r.effect > 5 ? 'bad' : r.effect > 2 ? 'warn' : undefined])} />
            </>
          )}
          <StudySummary {...HR.heartSummary(h)} />
        </>
      ) : (
        <>
          <div className="calc-inputs ea-inputs">
            <Choice label="Task contains" value={sp.parts} onChange={(v) => setSp({ ...sp, parts: v })} options={[['diagnosis', 'Diagnosis only'], ['action', 'Action only'], ['both', 'Diagnosis and action']]} />
            <Pick label="Dependence on a preceding failure" value={sp.dep} onChange={(v) => setSp({ ...sp, dep: v })} options={HR.DEPENDENCE.map(([k, l]) => [k, l])} />
          </div>
          <div className="ea-grid2">
            {parts.map((part, pi) => (
              <section key={part} className="ea-card">
                <h4>{part === 'diagnosis' ? 'Diagnosis' : 'Action'} (nominal {HR.NHEP[part]})</h4>
                {HR.PSF.map((p, i) => (
                  <Pick key={p.id} label={p.name} value={String(sp[part][i])} onChange={(v) => setSp({ ...sp, [part]: sp[part].map((x, j) => (j === i ? Number(v) : x)) })}
                    options={p[part].map(([l, m], k) => [String(k), `${l} (${m === 'fail' ? 'P = 1' : `×${m}`})`])} />
                ))}
                <p className="dc-note">Composite PSF ×{pr[pi].fail ? '∞' : sig(pr[pi].composite, 4)}; {pr[pi].negative} negative factor{pr[pi].negative === 1 ? '' : 's'}{pr[pi].adjusted ? ', so the adjustment formula applies' : ''}. HEP {sig(pr[pi].hep, 3)}.</p>
              </section>
            ))}
          </div>
          <Result big={sig(sp.dep !== 'zero' ? dep : total, 2)} tone={total > 0.1 ? 'bad' : total > 0.01 ? undefined : 'good'} label={`Human error probability (${HR.oneIn(sp.dep !== 'zero' ? dep : total)})`}>
            <Stats rows={[
              ...pr.map((p) => [`${p.part === 'diagnosis' ? 'Diagnosis' : 'Action'} HEP`, `${sig(p.hep, 3)}${p.adjusted ? ` (unadjusted ${sig(p.unadjusted, 3)})` : ''}`]),
              pr.length === 2 ? ['Combined, Pd + Pa − Pd·Pa', sig(total, 3)] : null,
              sp.dep !== 'zero' ? [`With ${sp.dep} dependence`, sig(dep, 3)] : null,
            ]} />
          </Result>
          <StudySummary {...HR.sparhSummary({ parts: pr, total, dep, depLevel: sp.dep })} />
        </>
      )}
      <About method="heart-human-reliability-assessment-with-nara-and-cara" links={[['spar-h-human-reliability-analysis', 'SPAR-H'], ['therp-technique-for-human-error-rate-prediction', 'THERP'], ['sherpa-systematic-human-error-reduction-and-prediction-approach', 'SHERPA'], ['predictive-human-error-analysis-phea', 'PHEA']]}>
        <p><b>HEART</b> (Williams 1986, "HEART: a proposed method for assessing and reducing human error", 9th Advances in Reliability Technology Symposium; error-producing conditions from Williams 1988, IEEE Conference on Human Factors and Power Plants). Choose the generic task type (nominal human unreliability with 5th–95th percentile bounds); for each error-producing condition (EPC) that applies, judge the assessed proportion of affect (APOA, 0–1). Assessed effect = (max multiplier − 1) × APOA + 1, and HEP = nominal × Π assessed effects, capped at 1. Checked against the published worked example: task type F (0.003) with inexperience ×3 at 0.4, opposite technique ×6 at 1.0, risk misperception ×4 at 0.8, conflict of objectives ×2.5 at 0.8 and low morale ×1.2 at 0.6 gives 0.003 × 1.8 × 6 × 3.4 × 2.2 × 1.12 = 0.27.</p>
        <p><b>SPAR-H</b> (Gertman, Blackman, Marble, Byers and Smith 2005, NUREG/CR-6883, US Nuclear Regulatory Commission). Nominal HEP 0.01 for diagnosis and 0.001 for action, multiplied by eight performance shaping factors (PSFs) from the SPAR-H worksheets: available time, stress, complexity, experience/training, procedures, ergonomics/HMI, fitness for duty and work processes. With three or more negative PSFs (multiplier above 1), HEP = NHEP × PSF / (NHEP × (PSF − 1) + 1), which keeps the probability below 1; otherwise HEP = NHEP × PSF. Inadequate time or an unfit operator sets P = 1. A task with both parts combines as Pd + Pa − Pd × Pa. Dependence on a preceding failure uses the THERP equations adopted in SPAR-H: low (1 + 19P)/20, moderate (1 + 6P)/7, high (1 + P)/2, complete 1. NUREG/CR-6883 suggests not reporting values below 1E-5.</p>
        <p><b>When not to use it.</b> Both methods were developed for trained operators in high-hazard industries. For consumer interfaces they are best used comparatively (which design, which condition matters most) rather than as absolute rates. Neither replaces observing real users: validate the predicted errors in usability testing.</p>
      </About>
    </div>
  );
}

export default DecHumanError;
