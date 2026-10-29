import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import { parseTable } from '../cluster.js';
import * as I from './info.js';
import { Area, Choice, Pick, Result, Stats, Problem, About, Bars, num, pct, pv } from './ui.jsx';

const CODE_SAMPLE = `P1: onboarding confusion, pricing worry, trust in data
P1: onboarding confusion, workaround
P1: pricing worry
P2: pricing worry, team sharing
P2: pricing worry, workaround
P3: onboarding confusion, mobile use, notifications
P3: trust in data, export needs
P3: workaround, onboarding confusion
P4: pricing worry
P4: pricing worry, team sharing
P5: export needs, trust in data, workaround, mobile use
P5: notifications, onboarding confusion
P5: integrations, team sharing
P6: pricing worry, onboarding confusion
P7: onboarding confusion, pricing worry, workaround
P7: accessibility
P8: pricing worry, team sharing, onboarding confusion
P8: trust in data`;
const CODE_TABLE = `Code\tP1\tP2\tP3\tP4\tP5\tP6
Onboarding confusion\t2\t0\t2\t0\t1\t1
Pricing worry\t2\t2\t0\t2\t0\t1
Trust in data\t1\t0\t1\t0\t1\t0
Workaround\t1\t1\t1\t0\t1\t0
Team sharing\t0\t1\t0\t1\t1\t0
Export needs\t0\t0\t1\t0\t1\t0`;
const SURVEY_SAMPLE = 'Role,Plan,Ease (1-5),Uses mobile app,Would renew,Country\nAdmin,Pro,4,Yes,Yes,UK\nMember,Pro,4,Yes,Yes,UK\nMember,Free,3,Yes,No,UK\nAdmin,Free,2,No,No,UK\nMember,Free,3,No,No,UK\nAdmin,Pro,3,Yes,No,UK\nMember,Free,2,No,No,UK\nMember,Free,3,Yes,Yes,UK\nMember,Team,4,Yes,Yes,UK\nViewer,Team,4,No,Yes,UK\nMember,Pro,3,No,Yes,UK\nAdmin,Pro,3,No,No,UK\nAdmin,Pro,4,No,Yes,Ireland\nMember,Pro,4,Yes,Yes,UK\nAdmin,Team,5,No,Yes,UK\nAdmin,Team,3,No,Yes,UK\nAdmin,Pro,3,No,Yes,UK\nMember,Pro,3,Yes,Yes,UK\nAdmin,Free,3,Yes,No,UK\nMember,Team,4,Yes,Yes,UK\nMember,Pro,4,Yes,Yes,UK\nMember,Team,3,Yes,Yes,UK\nViewer,Team,5,Yes,Yes,UK\nMember,Free,2,Yes,No,UK\nMember,Free,3,Yes,No,UK\nViewer,Free,2,No,No,UK\nMember,Free,2,No,No,UK\nViewer,Pro,5,No,No,UK\nMember,Free,4,Yes,Yes,UK\nAdmin,Free,3,No,No,UK\nMember,Free,3,Yes,Yes,UK\nAdmin,Team,4,No,No,UK\nAdmin,Free,2,No,No,UK\nMember,Team,4,Yes,Yes,UK\nAdmin,Team,4,Yes,Yes,UK\nMember,Free,2,No,No,UK\nAdmin,Team,3,No,Yes,UK\nMember,Free,4,Yes,Yes,UK\nMember,Team,3,No,Yes,UK\nAdmin,Pro,4,No,Yes,UK';

const FLAG = { none: ['Almost no information', 'fix'], low: ['Mostly consensus', 'opp'], mixed: ['Some spread', ''], spread: ['Widely spread', 'promote'] };

function CodesMode() {
  const [fmt, setFmt] = useState('segments');
  const [text, setText] = useState(CODE_SAMPLE);
  const parsed = useMemo(() => I.parseCoded(text, fmt), [text, fmt]);
  const r = useMemo(() => (parsed.codes.length ? I.codeInformation(parsed) : null), [parsed]);
  const sum = r && r.all.N ? I.codeSummary(r) : null;
  const switchFmt = (f) => { setFmt(f); setText(f === 'table' ? CODE_TABLE : CODE_SAMPLE); };
  const maxP = r ? Math.max(...r.people.map((p) => p.N1), 1) : 1;
  return (
    <>
      <div className="calc-inputs">
        <Choice label="Your data" value={fmt} onChange={switchFmt} options={[['segments', 'Coded segments'], ['table', 'Code × participant table']]} />
        <Area label={fmt === 'table' ? 'Code × participant counts (header row, one row per code)' : 'One coded segment per line: participant, a colon, then its codes'} value={text} onChange={setText} rows={10}
          hint={fmt === 'table' ? 'Paste from a spreadsheet: first column the code, then one column per participant with how often the code was applied.' : 'Separate codes with commas. A participant can appear on many lines; every line is one coded segment (a quote, a turn or a passage).'} />
      </div>
      {parsed.bad.length > 0 && <Problem>Skipped line{parsed.bad.length > 1 ? 's' : ''} {parsed.bad.slice(0, 8).join(', ')}: {fmt === 'table' ? 'counts must be numbers of 0 or more' : 'use "participant: code, code"'}.</Problem>}
      {!r || !r.all.N ? <Problem>Enter at least one coded segment.</Problem> : (
        <>
          <Result big={`${num(r.all.N1, 1)} effective themes`} label={`From ${r.all.S} codes in ${r.all.N} coded segments by ${r.nPeople} participants`}>
            <p>Shannon entropy H = {num(r.all.H)} bits out of a possible {num(r.all.Hmax)}. In plain words: the talk is spread as if participants had used {num(r.all.N1, 1)} themes equally often. Evenness {num(r.all.J)} (1 means every code used equally).</p>
          </Result>
          <Stats rows={[
            ['Entropy H', `${num(r.all.H, 3)} bits`],
            ['Evenness (Pielou J = H / log₂ S)', num(r.all.J, 3)],
            ['Effective number of themes (2^H, Hill N₁)', num(r.all.N1, 2)],
            ['Inverse Simpson (Hill N₂)', num(r.all.N2, 2)],
            ['Simpson diversity (1 − Σp²)', num(r.all.simpson, 3)],
            ['Simpson, unbiased', num(r.all.simpsonUnbiased, 3)],
            ['Share of the top 3 codes', pct(r.all.top3)],
            ['Most frequent code (Berger-Parker)', `${r.all.items[0].label}, ${pct(r.all.bergerParker)}`],
            ['Miller-Madow corrected H', `${num(r.all.millerMadow, 3)} bits`],
          ]} />
          <h3 className="clu-h3">How concentrated the talk is</h3>
          <Bars label="Share of coded segments by code" rows={r.all.items.map((x) => [x.label, x.p / r.all.items[0].p, `${pct(x.p)} · ${r.reach.find((c) => c.code === x.label).people} ppl`])} />
          <h3 className="clu-h3">Who covered more ground</h3>
          <Bars label="Effective number of themes per participant" rows={[...r.people].sort((a, b) => b.N1 - a.N1).map((p) => [p.id, p.N1 / maxP, `${num(p.N1, 1)} (${p.codes} codes)`])} />
          <div className="clu-scroll"><table className="clu-table clu-num">
            <thead><tr><th>Participant</th><th>Segments</th><th>Codes used</th><th>Share of all codes</th><th>H (bits)</th><th>Effective themes</th><th>Evenness</th></tr></thead>
            <tbody>{r.people.map((p) => <tr key={p.id}><td>{p.id}</td><td>{p.segments}</td><td>{p.codes}</td><td>{pct(p.share)}</td><td>{num(p.H)}</td><td>{num(p.N1, 1)}</td><td>{num(p.J)}</td></tr>)}</tbody>
          </table></div>
          {sum && <StudySummary {...sum} />}
        </>
      )}
    </>
  );
}

function TableMode({ mode }) {
  const [text, setText] = useState(SURVEY_SAMPLE);
  const table = useMemo(() => parseTable(text), [text]);
  const [x, setX] = useState('1'); const [y, setY] = useState('4');
  const ok = table.headers.length >= (mode === 'survey' ? 1 : 2) && table.rows.length >= 2;
  const items = useMemo(() => (ok ? I.surveyInformation(table) : []), [table, ok]);
  const xi = Math.min(Number(x), table.headers.length - 1), yi = Math.min(Number(y), table.headers.length - 1);
  const ct = useMemo(() => (ok && mode === 'mi' ? I.contingency(table.rows.map((r) => r[xi]), table.rows.map((r) => r[yi])) : null), [table, xi, yi, ok, mode]);
  const mi = ct ? I.mutualInformation(ct.table) : null;
  const ig = useMemo(() => (ok && mode === 'gain' ? I.informationGain(table, yi) : []), [table, yi, ok, mode]);
  const cols = table.headers.map((h, i) => [String(i), h]);
  const sum = !ok ? null : mode === 'survey' ? I.surveySummary(items) : mode === 'mi' ? (xi !== yi ? I.miSummary(mi, table.headers[xi], table.headers[yi]) : null) : I.igSummary(ig, table.headers[yi]);
  return (
    <>
      <div className="calc-inputs">
        <Area label="Survey answers: a header row, then one row per respondent" value={text} onChange={setText} rows={8} hint="Paste from a spreadsheet or CSV. Each column is a question; blank cells are skipped. Free-text columns work too, but every different answer counts as a separate option." />
        {mode === 'mi' && <><Pick label="Question X" value={String(xi)} onChange={setX} options={cols} /><Pick label="Question Y" value={String(yi)} onChange={setY} options={cols} /></>}
        {mode === 'gain' && <Pick label="Outcome or segment to explain" value={String(yi)} onChange={setY} options={cols} />}
      </div>
      {!ok ? <Problem>Paste a table with a header row and at least two respondents.</Problem> : mode === 'survey' ? (
        <>
          <Result big={`${items.filter((i) => i.flag === 'none' || i.flag === 'low').length} of ${items.length}`} label="questions where most people gave the same answer">
            <p>Normalised entropy runs from 0 (everyone gave the same answer) to 1 (answers spread evenly over all options). The effective number of options, 2^H, says how many equally popular answers would give the same spread.</p>
          </Result>
          <div className="clu-scroll"><table className="clu-table clu-num">
            <thead><tr><th>Question</th><th>Answers</th><th>Options (k)</th><th>H (bits)</th><th>Normalised H</th><th>As if choosing evenly among</th><th>Most common</th><th>Reading</th></tr></thead>
            <tbody>{items.map((it) => <tr key={it.index}><td>{it.name}</td><td>{it.n}</td><td>{it.k}</td><td>{num(it.H)}</td><td>{num(it.Hnorm)}</td><td>{num(it.N1, 1)} options</td><td>{it.mode} ({pct(it.modeShare)})</td><td><span className={`qtag ${FLAG[it.flag][1]}`}>{FLAG[it.flag][0]}</span></td></tr>)}</tbody>
          </table></div>
          <Bars label="Normalised entropy by question" rows={items.map((it) => [it.name, it.Hnorm, num(it.Hnorm), it.flag === 'none' ? 'bad' : it.flag === 'low' ? 'warn' : ''])} />
        </>
      ) : mode === 'mi' ? (xi === yi ? <Problem>Choose two different questions.</Problem> : (
        <>
          <Result big={`${num(mi.mi, 3)} bits`} label={`Mutual information between "${table.headers[xi]}" and "${table.headers[yi]}"`} tone={mi.p < 0.05 ? 'good' : ''}>
            <p>Knowing the answer to "{table.headers[xi]}" removes {pct(mi.uxy)} of the uncertainty about "{table.headers[yi]}". Normalised mutual information {num(mi.nmi, 3)}; G-test G = {num(mi.G)}, df {mi.df}, p {pv(mi.p)}.</p>
          </Result>
          <Stats rows={[
            ['I(X;Y)', `${num(mi.mi, 4)} bits (${num(mi.miNats, 4)} nats)`],
            ['Normalised MI (arithmetic mean)', num(mi.nmi, 4)],
            ['H(X), H(Y)', `${num(mi.hx, 3)}, ${num(mi.hy, 3)} bits`],
            ['Uncertainty coefficient U(Y|X)', num(mi.uxy, 3)],
            ['G = 2N · MI · ln 2', `${num(mi.G, 3)} on ${mi.df} df`],
            ['p (chi-square)', pv(mi.p)],
            ["Cramér's V (from G)", num(mi.cramerV, 3)],
            ['Pairs used', mi.n],
          ]} />
          <div className="clu-scroll"><table className="clu-table clu-num">
            <thead><tr><th>{table.headers[xi]} \ {table.headers[yi]}</th>{ct.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{ct.rows.map((rl, i) => <tr key={rl}><td>{rl}</td>{ct.table[i].map((v, j) => { const e = ct.table[i].reduce((a, b) => a + b, 0) * ct.table.reduce((a, r) => a + r[j], 0) / mi.n; return <td key={j} className={v > e * 1.3 && v >= 2 ? 'tl-cell-ok' : ''}>{v} <span className="muted">({num(e, 1)})</span></td>; })}</tr>)}</tbody>
          </table></div>
          <p className="tl-note">Cells show counts with the count expected if the questions were unrelated in brackets; highlighted cells are clearly above expectation.</p>
        </>
      )) : (
        <>
          <Result big={ig[0] ? `"${ig[0].name}"` : '—'} label={`Best single question for splitting "${table.headers[yi]}"`}>
            <p>Information gain is how many bits of uncertainty about "{table.headers[yi]}" ({num(ig[0]?.hy)} bits in all) disappear once you know the answer to a question.</p>
          </Result>
          <Bars label="Information gain by question" rows={ig.map((g) => [g.name, ig[0].ig > 0 ? g.ig / ig[0].ig : 0, `${num(g.ig, 3)} bits`, g.p < 0.05 ? 'ok' : ''])} />
          <div className="clu-scroll"><table className="clu-table clu-num">
            <thead><tr><th>Question</th><th>Gain (bits)</th><th>Share of H(outcome)</th><th>Gain ratio</th><th>Options</th><th>G-test p</th></tr></thead>
            <tbody>{ig.map((g) => <tr key={g.index}><td>{g.name}</td><td>{num(g.ig, 4)}</td><td>{pct(g.share)}</td><td>{num(g.ratio, 3)}</td><td>{g.levels}</td><td>{pv(g.p)}</td></tr>)}</tbody>
          </table></div>
        </>
      )}
      {sum && <StudySummary {...sum} />}
    </>
  );
}

// ── Shannon information ──
function ShannonInfo() {
  const [mode, setMode] = useState('codes');
  return (
    <>
      <div className="calc-inputs">
        <Choice label="What to measure" value={mode} onChange={setMode} options={[['codes', 'Themes in interviews'], ['survey', 'Survey answers'], ['mi', 'Two questions'], ['gain', 'Information gain']]} />
      </div>
      {mode === 'codes' ? <CodesMode /> : <TableMode key={mode} mode={mode} />}
      <About method="shannon-entropy-audit" links={[['interaction-entropy-shannon', 'Interaction entropy'], ['mutual-information-between-two-variables', 'Mutual information'], ['polarising-item-feedback-analysis-with-entropy', 'Polarising items with entropy'], ['thematic-analysis', 'Thematic analysis'], ['content-analysis', 'Content analysis'], ['species-accumulation-and-good-turing-coverage-for-saturation', 'Saturation and coverage'], ['channel-capacity-analysis', 'Channel capacity']]}>
        <p><b>Entropy</b> measures how unpredictable a choice is: H = −Σ p log₂ p bits, where p is the share of each code or answer. One bit is the uncertainty of a fair coin toss. If all S options were equally common, H would be log₂ S; so 2^H is the <b>effective number</b> of options (Hill's number of order 1): answers with H = 1.68 bits are spread as if people chose evenly among 2^1.68 = 3.2 options. <b>Evenness</b> J = H / log₂ S (Pielou) runs from 0 to 1. <b>Simpson diversity</b> 1 − Σp² is the chance that two randomly chosen segments carry different codes; 1/Σp² is Hill's number of order 2, which gives more weight to common codes. Entropy from small samples is biased low; the Miller-Madow correction adds (S − 1)/(2N) nats.</p>
        <p><b>Survey answers.</b> For each question, normalised entropy H / log₂ k, where k is the number of answer options (the observed options, or the whole range for short numeric scales such as 1–5). Near 0 means consensus: the question tells you little about how respondents differ. Near 1 means answers are spread evenly.</p>
        <p><b>Mutual information</b> I(X;Y) = Σ p(x,y) log₂ [p(x,y) / (p(x) p(y))] is how many bits knowing one answer tells you about the other; 0 means unrelated. Normalised mutual information divides by the mean of H(X) and H(Y) (scikit-learn's default). The <b>G-test</b> uses G = 2N · I in nats = 2N · I(bits) · ln 2, compared with a chi-square distribution on (r − 1)(c − 1) degrees of freedom. <b>Information gain</b> of a question about an outcome is the same quantity, H(outcome) − H(outcome | question); the gain ratio divides by H(question) to stop questions with many options winning by chance (Quinlan 1986). Values match scipy.stats.entropy, scikit-learn's mutual_info_score and normalized_mutual_info_score, and scipy's G-test (<code>npm run check:tools</code>).</p>
      </About>
    </>
  );
}

export default ShannonInfo;
