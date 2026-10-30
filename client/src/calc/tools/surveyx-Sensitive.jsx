import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as SE from './surveyx-sensitive.js';
import * as EX from './surveyx-examples.js';
import { fmt, pct, pval } from './surveyx-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Result, Stats, Problem, About, Choice, Num, n_ } from './ui.jsx';
import { Tabs, GroupedColumns } from './surveyx-ui.jsx';

const toStr = (xs) => xs.map(String);
const resize = (xs, len) => Array.from({ length: len }, (_, i) => xs[i] ?? '0');

function ListTab({ st, set }) {
  const { J, control, treat, label, dx, dn } = st;
  const c = resize(control, J + 1).map((v) => Math.max(0, Number(v) || 0)), t = resize(treat, J + 2).map((v) => Math.max(0, Number(v) || 0));
  const direct = Number(dn) > 0 && Number(dx) >= 0 && Number(dx) <= Number(dn) ? { x: Number(dx), n: Number(dn) } : null;
  const r = useMemo(() => SE.listExperiment(c, t, { direct }), [c.join(), t.join(), dx, dn]); // eslint-disable-line react-hooks/exhaustive-deps
  const setCell = (arr, i, v) => set({ ...st, [arr]: resize(st[arr], arr === 'control' ? J + 1 : J + 2).map((x, k) => (k === i ? v : x)) });
  return (
    <>
      <div className="sx-inputs">
        <Num label="Control items (J)" value={J} min={2} max={8} onChange={(v) => { const j = Math.max(2, Math.min(8, Math.round(Number(v) || 2))); set({ ...st, J: j, control: resize(control, j + 1), treat: resize(treat, j + 2) }); }} hint="The treatment list has these plus the sensitive item" />
        <label className="calc-field wide"><span>Sensitive item (for the summary)</span><input className="sx-text" value={label} onChange={(e) => set({ ...st, label: e.target.value })} /></label>
      </div>
      <p className="sx-note">Enter how many respondents in each group said each number of items applied to them.</p>
      <div className="sx-scroll"><table className="clu-table clu-num sx-count" aria-label="Respondents by number of items">
        <thead><tr><th>Items that apply</th>{Array.from({ length: J + 2 }, (_, y) => <th key={y}>{y}</th>)}<th>n</th></tr></thead>
        <tbody>
          <tr><th scope="row">Control ({J} items)</th>{Array.from({ length: J + 2 }, (_, y) => <td key={y}>{y <= J ? <input type="number" min={0} className="sx-num" aria-label={`Control, ${y} items`} value={resize(control, J + 1)[y]} onChange={(e) => setCell('control', y, e.target.value)} /> : ''}</td>)}<td>{c.reduce((a, b) => a + b, 0)}</td></tr>
          <tr><th scope="row">Treatment ({J + 1} items)</th>{Array.from({ length: J + 2 }, (_, y) => <td key={y}><input type="number" min={0} className="sx-num" aria-label={`Treatment, ${y} items`} value={resize(treat, J + 2)[y]} onChange={(e) => setCell('treat', y, e.target.value)} /></td>)}<td>{t.reduce((a, b) => a + b, 0)}</td></tr>
        </tbody>
      </table></div>
      <div className="sx-inputs">
        <Num label="Direct question: said yes (optional)" value={dx} min={0} onChange={(v) => set({ ...st, dx: v })} />
        <Num label="Direct question: asked" value={dn} min={0} onChange={(v) => set({ ...st, dn: v })} hint="A separate random group asked the sensitive item directly" />
      </div>
      {r.error && <Problem>{r.error}</Problem>}
      {!r.error && (
        <>
          <Result big={pct(r.est, 1)} label={`estimated share with the sensitive trait (95% CI ${pct(r.lo, 1)} to ${pct(r.hi, 1)})`} tone={r.deP < 0.05 ? 'bad' : undefined}>
            <Stats rows={[['Treatment mean', fmt(r.T.m, 3)], ['Control mean', fmt(r.C.m, 3)], ['Standard error', `${fmt(r.se * 100, 2)} points`], ['Design-effect test (Bonferroni p)', pval(r.deP)], ['Control floor / ceiling', `${pct(r.floor, 1)} / ${pct(r.ceiling, 1)}`], r.direct ? ['Direct question', `${pct(r.direct.p, 1)} (gap ${fmt(r.direct.gap * 100, 1)} points)`] : null]} />
          </Result>
          <div className="sx-grid2">
            <div>
              <h3 className="clu-h3">Answers by group</h3>
              <GroupedColumns label="Share of each group giving each count" cats={Array.from({ length: J + 2 }, (_, y) => String(y))} yFmt={(v) => pct(v, 0)}
                series={[{ name: 'Control', values: [...c.map((x) => x / r.C.n), 0] }, { name: 'Treatment', values: t.map((x) => x / r.T.n) }]} />
            </div>
            <div>
              <h3 className="clu-h3">Blair-Imai design-effect check</h3>
              <Table label="Estimated joint proportions of control-item count and sensitive trait" head={['Control items', 'With trait', 'Without trait']}
                rows={Array.from({ length: J + 1 }, (_, y) => {
                  const a = r.pis.find((p) => p.y === y && p.z === 1), b = r.pis.find((p) => p.y === y && p.z === 0);
                  const cell = (p) => <span key={p.z} className={p.est < 0 ? 'sx-neg' : ''}>{pct(p.est, 1)}{p.est < 0 ? ` (p ${pval(p.p)})` : ''}</span>;
                  return [y, cell(a), cell(b)];
                })} />
              <p className="sx-note">Each cell is the estimated share of people with that many control items, with or without the trait. A clearly negative share is impossible, so it signals a design effect.</p>
            </div>
          </div>
          <StudySummary {...SE.listSummary(r, label || 'the sensitive item')} />
        </>
      )}
    </>
  );
}

function RrTab({ st, set }) {
  const r = useMemo(() => SE.randomisedResponse({ design: st.design, yes: n_(st.yes), n: n_(st.n), p: n_(st.p), pYes: n_(st.pYes), pNo: n_(st.pNo) }), [st]);
  return (
    <>
      <Choice label="Design" value={st.design} onChange={(v) => set({ ...st, design: v })} options={[['forced', 'Forced response (Boruch)'], ['warner', 'Warner (mirrored question)']]} />
      <div className="sx-inputs">
        <Num label='"Yes" answers' value={st.yes} min={0} onChange={(v) => set({ ...st, yes: v })} />
        <Num label="Respondents" value={st.n} min={1} onChange={(v) => set({ ...st, n: v })} />
        {st.design === 'warner'
          ? <Num label="p: chance of getting the sensitive statement" value={st.p} min={0} max={1} step={0.05} onChange={(v) => set({ ...st, p: v })} hint='The other statement is "I do not …"' />
          : <>
            <Num label="Chance told to say yes" value={st.pYes} min={0} max={1} step={0.01} onChange={(v) => set({ ...st, pYes: v })} hint="A die showing 1: 1/6 = 0.1667" />
            <Num label="Chance told to say no" value={st.pNo} min={0} max={1} step={0.01} onChange={(v) => set({ ...st, pNo: v })} hint="A die showing 6: 1/6" />
          </>}
        <label className="calc-field wide"><span>Sensitive trait (for the summary)</span><input className="sx-text" value={st.label} onChange={(e) => set({ ...st, label: e.target.value })} /></label>
      </div>
      {r.error && <Problem>{r.error}</Problem>}
      {!r.error && (
        <>
          <Result big={pct(r.est, 1)} label={`estimated prevalence (95% CI ${pct(r.lo, 1)} to ${pct(r.hi, 1)})`} tone={r.outside ? 'bad' : undefined}>
            <Stats rows={[['Observed "yes"', pct(r.lam, 1)], ['Standard error', `${fmt(r.se * 100, 2)} points`], ['Same-size direct question SE', `${fmt(r.seDirect * 100, 2)} points`], ['Equivalent direct sample', Number.isFinite(r.effN) ? Math.round(r.effN) : '—'], ['P(trait | yes)', pct(r.givenYes, 0)], ['P(trait | no)', pct(r.givenNo, 0)]]} />
          </Result>
          {r.outside && <Problem>The estimate is outside 0–100% ({pct(r.est, 1)}); the interval has been cut at the bounds.</Problem>}
          <StudySummary {...SE.rrSummary(r, st.label || 'the sensitive trait')} />
        </>
      )}
    </>
  );
}

const LIST0 = () => ({ J: EX.EX_LIST.control.length - 1, control: toStr(EX.EX_LIST.control), treat: toStr(EX.EX_LIST.treat), label: EX.EX_LIST.label, dx: String(EX.EX_LIST.direct.x), dn: String(EX.EX_LIST.direct.n) });
const RR0 = () => ({ design: EX.EX_RR.design, yes: String(EX.EX_RR.yes), n: String(EX.EX_RR.n), p: String(EX.EX_RR.p), pYes: '0.1667', pNo: '0.1667', label: EX.EX_RR.label });

// ── Sensitive questions ──
function SxSensitive() {
  const [tab, setTab] = useState('list');
  const [list, setList] = useState(LIST0);
  const [rr, setRr] = useState(RR0);
  return (
    <div className="sx-root">
      <LoadExample onClick={() => { setList(LIST0()); setRr(RR0()); }}>Load example (password sharing and work-account purchases)</LoadExample>
      <Tabs label="Technique" value={tab} onChange={setTab} options={[['list', 'List experiment'], ['rr', 'Randomised response']]} />
      {tab === 'list' ? <ListTab st={list} set={setList} /> : <RrTab st={rr} set={setRr} />}
      <About method="list-experiment-item-count-technique" links={[['randomised-response-technique', 'Randomised response technique']]}>
        <p><b>List experiment.</b> A random half (control) see J innocuous items and report only how many apply; the other half (treatment) see the same items plus the sensitive one. The prevalence estimate is the difference in means, τ̂ = Ȳ<sub>T</sub> − Ȳ<sub>C</sub>, with SE = √(s²<sub>T</sub>/n<sub>T</sub> + s²<sub>C</sub>/n<sub>C</sub>) and a Welch t interval.</p>
        <p><b>Design-effect check</b> (Blair and Imai 2012). With F<sub>C</sub> and F<sub>T</sub> the cumulative shares answering y or fewer, the joint proportions are π̂<sub>y,1</sub> = F<sub>C</sub>(y) − F<sub>T</sub>(y) and π̂<sub>y,0</sub> = F<sub>T</sub>(y) − F<sub>C</sub>(y − 1) for y = 0 … J. All must be non-negative if adding the sensitive item did not change answers to the control items. Each negative estimate is tested one-sided with SE from the two independent cumulative proportions; the reported p is the smallest one-sided p times the number of estimates (Bonferroni), a simplified version of Blair and Imai's test. Floor and ceiling shares are the proportions of the control group answering 0 and J: people at the ceiling reveal themselves by answering J + 1, so they tend to under-report.</p>
        <p><b>Randomised response.</b> Warner (1965): each person answers "I have the trait" with probability p or "I do not have the trait" with 1 − p, so P(yes) = λ = pπ + (1 − p)(1 − π) and π̂ = (λ̂ − (1 − p)) ÷ (2p − 1), Var = λ̂(1 − λ̂) ÷ (n(2p − 1)²). Forced response (Boruch 1971): with probability p<sub>yes</sub> answer yes, p<sub>no</sub> answer no, otherwise truthfully: π̂ = (λ̂ − p<sub>yes</sub>) ÷ p<sub>0</sub> with p<sub>0</sub> = 1 − p<sub>yes</sub> − p<sub>no</sub>, Var = λ̂(1 − λ̂) ÷ (n p<sub>0</sub>²). Intervals are Wald 95% intervals cut at 0 and 1. Respondent jeopardy (Lanke 1976) is P(trait | yes) and P(trait | no) at the estimated prevalence; the equivalent direct sample is π̂(1 − π̂) ÷ Var.</p>
        <p><b>When not to use it.</b> Both techniques trade a lot of precision for privacy, so they need several hundred respondents; for small usability studies ask in private or use self-administered questions instead. Do not use them when the question is not actually sensitive (the extra noise buys nothing) or when respondents cannot follow the instructions (low literacy, rushed intercepts).</p>
      </About>
    </div>
  );
}

export default SxSensitive;
