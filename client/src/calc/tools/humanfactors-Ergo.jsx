import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as E from './humanfactors-ergo.js';
import { sig, fmt } from './humanfactors-core.js';
import { Table, LoadExample, LinePlot, BarChart } from './expanalytics-charts.jsx';
import { Num, Choice, Pick, Area, Result, Stats, About, Problem, n_ } from './ui.jsx';
import './humanfactors.css';

const TABS = [['niosh', 'NIOSH lifting'], ['rula', 'RULA'], ['reba', 'REBA'], ['anthro', 'Anthropometry'], ['borg', 'Borg'], ['ch', 'Cooper-Harper'], ['swat', 'SWAT']];

// ── Ergonomics: NIOSH, RULA, REBA, anthropometry, Borg, Cooper-Harper, SWAT ──
function HfErgonomics() {
  const [tab, setTab] = useState('niosh');
  const [ex, setEx] = useState(0); // bumping this reloads the example in every sheet
  return (
    <div className="hf-root">
      <div className="calc-inputs ea-inputs hf-tabs">
        <Choice label="Sheet" value={tab} onChange={setTab} options={TABS} />
      </div>
      <LoadExample onClick={() => setEx(ex + 1)} />
      {tab === 'niosh' && <NioshSheet key={`n${ex}`} />}
      {tab === 'rula' && <RulaSheet key={`r${ex}`} />}
      {tab === 'reba' && <RebaSheet key={`b${ex}`} />}
      {tab === 'anthro' && <AnthroSheet key={`a${ex}`} />}
      {tab === 'borg' && <BorgSheet key={`g${ex}`} />}
      {tab === 'ch' && <CooperHarperSheet key={`c${ex}`} />}
      {tab === 'swat' && <SwatSheet key={`s${ex}`} />}
      <About method="manual-materials-handling-assessment-niosh-lifting-equation-acgih-tlvs-snook-tab" links={[['rula-and-reba-posture-assessment', 'RULA and REBA'], ['anthropometric-analysis', 'Anthropometric analysis'], ['anthropometric-percentile-accommodation-analysis', 'Percentile accommodation'], ['borg-rating-of-perceived-exertion-scale', 'Borg RPE'], ['cooper-harper-rating-scale', 'Cooper-Harper'], ['swat-subjective-workload-assessment-technique', 'SWAT']]}>
        <p><b>NIOSH revised lifting equation</b> (Waters, Putz-Anderson, Garg and Fine 1993, Ergonomics 36(7), 749–776; Applications Manual, Waters, Putz-Anderson and Garg 1994, DHHS (NIOSH) 94-110). RWL = LC × HM × VM × DM × AM × FM × CM and LI = load / RWL. Metric: LC = 23 kg; HM = 25/H (1 if H ≤ 25 cm, 0 if H &gt; 63); VM = 1 − 0.003|V − 75| (0 if V &gt; 175); DM = 0.82 + 4.5/D (1 if D &lt; 25, 0 if D &gt; 175); AM = 1 − 0.0032A (0 if A &gt; 135°). US: LC = 51 lb; HM = 10/H; VM = 1 − 0.0075|V − 30|; DM = 0.82 + 1.8/D; ranges 10–25, 0–70, 10–70 in. FM comes from Table 5 of the manual (lifts per minute × work duration × V below or above 75 cm / 30 in; less than once per 5 minutes uses 0.2 lifts/min); between rows it is interpolated linearly and the page says so. CM from Table 7: good 1.00; fair 0.95 below 75 cm and 1.00 above; poor 0.90. When the load must be placed with significant control, the destination is assessed too and the smaller RWL governs. The frequency-independent index FILI = load / (RWL without FM). Checked against the Applications Manual's example 2 (RWL 28.0 and 18.1 lb, LI 1.9) and an independent Python implementation.</p>
        <p><b>RULA</b> (McAtamney and Corlett 1993, Applied Ergonomics 24(2), 91–99): upper arm, lower arm, wrist and wrist twist give posture A (Table A); neck, trunk and legs give posture B (Table B); muscle use and force are added to make scores C and D, and Table C gives the grand score 1–7. Action levels: 1–2 acceptable, 3–4 investigate, 5–6 investigate and change soon, 7 change now.</p>
        <p><b>REBA</b> (Hignett and McAtamney 2000, Applied Ergonomics 31(2), 201–205): trunk, neck and legs (Table A) plus load give score A; upper arm, lower arm and wrist (Table B) plus coupling give score B; Table C plus activity gives 1–15. Risk: 1 negligible, 2–3 low, 4–7 medium, 8–10 high, 11+ very high.</p>
        <p><b>Anthropometric accommodation.</b> With a body dimension X ~ N(μ, σ), a value x is at percentile Φ((x − μ)/σ). A clearance (users must fit under or through it) accommodates P(X ≤ x); a reach (users must reach it) accommodates P(X ≥ x); an adjustable range accommodates P(lo ≤ X ≤ hi). Several user groups are mixed by their shares: P = Σ w<sub>g</sub>P<sub>g</sub>. Design values for a target share come from the mixture's quantile, found by bisection. Checked against scipy.</p>
        <p><b>Borg scales</b> (Borg 1982, Medicine and Science in Sports and Exercise 14(5), 377–381; Borg 1998, Borg's Perceived Exertion and Pain Scales): mean, median and a t-based 95% confidence interval for the mean. RPE 6–20 is roughly heart rate / 10 for healthy adults in steady work; CR10 is a category-ratio scale. <b>Cooper-Harper</b> (Cooper and Harper 1969, NASA TN D-5153): answer the three questions in order to reach a rating band, then pick the rating; report the median, as the scale is ordinal. <b>SWAT</b> (Reid and Nygren 1988): the 27 time-effort-stress combinations are sorted into workload order; a simplified additive model is fitted to the ranks by least squares and rescaled so 1-1-1 = 0 and 3-3-3 = 100 (the original uses monotone conjoint analysis).</p>
        <p><b>When not to use them.</b> The NIOSH equation does not cover one-handed, seated or kneeling lifts, carrying, pushing, unstable loads or shifts over 8 hours. RULA and REBA screen one posture and need trained observers; they do not measure exposure over a shift. Anthropometric percentiles do not add across dimensions, and the normal model is weakest in the tails. Borg and SWAT are self-reports: compare designs within the same people rather than across studies. For mental workload with finer resolution, use the <Link to="/calculators/nasa-tlx">NASA-TLX scorer</Link>.</p>
      </About>
    </div>
  );
}

// ── NIOSH sheet ──
function NioshSheet() {
  const [v, setV] = useState({ ...E.NIOSH_EXAMPLE });
  const set = (k) => (x) => setV({ ...v, [k]: x });
  const u = E.NIOSH_UNITS[v.units];
  const inp = { ...v, load: n_(v.load), H: n_(v.H), V: n_(v.V), D: n_(v.D), A: n_(v.A), F: n_(v.F), Hd: n_(v.Hd), Vd: n_(v.Vd) };
  const bad = ['load', 'H', 'V', 'D', 'A', 'F'].concat(v.control ? ['Hd', 'Vd'] : []).filter((k) => !Number.isFinite(inp[k]) || inp[k] < 0);
  const r = bad.length ? null : E.niosh(inp);
  const tone = r ? { ok: 'good', warn: undefined, bad: 'bad' }[E.liBand(r.LI)] : undefined;
  const ends = r ? [['origin', r.origin], ...(r.destination ? [['destination', r.destination]] : [])] : [];
  return (
    <>
      <div className="calc-inputs ea-inputs">
        <Choice label="Units" value={v.units} onChange={set('units')} options={[['metric', 'Metric (kg, cm)'], ['us', 'US (lb, in)']]} />
        <Num label={`Load (${u.unitW})`} value={v.load} onChange={set('load')} min={0} step={0.5} />
        <Num label={`H: hands from ankles, horizontal (${u.unitL})`} value={v.H} onChange={set('H')} min={0} hint={`${u.Hmin}–${u.Hmax} ${u.unitL}`} />
        <Num label={`V: hand height at origin (${u.unitL})`} value={v.V} onChange={set('V')} min={0} hint={`0–${u.Vmax} ${u.unitL}`} />
        <Num label={`D: vertical travel (${u.unitL})`} value={v.D} onChange={set('D')} min={0} hint={`${u.Dmin}–${u.Dmax} ${u.unitL}`} />
        <Num label="A: twist (asymmetry angle, °)" value={v.A} onChange={set('A')} min={0} max={180} hint="0–135°" />
        <Num label="F: lifts per minute" value={v.F} onChange={set('F')} min={0} step={0.1} hint="Average over the session" />
        <Pick label="Work duration" value={v.duration} onChange={set('duration')} options={E.DURATIONS} />
        <Choice label="Coupling (grip)" value={v.coupling} onChange={set('coupling')} options={[['good', 'Good'], ['fair', 'Fair'], ['poor', 'Poor']]} />
      </div>
      <label className="tl-check"><input type="checkbox" checked={!!v.control} onChange={(e) => setV({ ...v, control: e.target.checked })} /> Significant control at the destination (assess both ends)</label>
      {v.control && (
        <div className="calc-inputs ea-inputs">
          <Num label={`H at destination (${u.unitL})`} value={v.Hd} onChange={set('Hd')} min={0} />
          <Num label={`V at destination (${u.unitL})`} value={v.Vd} onChange={set('Vd')} min={0} />
        </div>
      )}
      {bad.length > 0 && <Problem>Enter a number of 0 or more for {bad.join(', ')}.</Problem>}
      {r && (
        <>
          <Result big={Number.isFinite(r.LI) ? r.LI.toFixed(2) : '∞'} tone={tone} label={`Lifting index (load ÷ RWL), ${r.governing} governs`}>
            <Stats rows={[
              ['Recommended weight limit', `${fmt(r.RWL, 1)} ${u.unitW}`],
              ['Frequency-independent LI', Number.isFinite(r.FILI) ? sig(r.FILI, 3) : '∞'],
              ['Band (Waters et al. 1994)', E.liBand(r.LI) === 'ok' ? 'LI ≤ 1: nearly all workers protected' : E.liBand(r.LI) === 'warn' ? '1 < LI ≤ 3: increased risk for some' : 'LI > 3: many workers at risk'],
            ]} />
          </Result>
          <Table label="Multipliers" head={['', 'LC', 'HM', 'VM', 'DM', 'AM', 'FM', 'CM', 'RWL', 'LI']} rows={ends.map(([k, g]) => [k[0].toUpperCase() + k.slice(1), g.LC, sig(g.HM, 3), sig(g.VM, 3), sig(g.DM, 3), sig(g.AM, 3), `${sig(g.FM, 3)}${g.interpolated ? '*' : ''}`, sig(g.CM, 3), fmt(g.RWL, 2), Number.isFinite(g.LI) ? sig(g.LI, 3) : '∞'])} />
          {ends.some(([, g]) => g.interpolated) && <p className="hf-note">* FM interpolated between rows of the NIOSH frequency table.</p>}
          <StudySummary {...E.nioshSummary(r)} />
        </>
      )}
    </>
  );
}

// ── RULA sheet ──
const RULA_OPTS = {
  upperArm: [[1, '1: 20° extension to 20° flexion'], [2, '2: over 20° extension, or 20–45° flexion'], [3, '3: 45–90° flexion'], [4, '4: over 90° flexion']],
  lowerArm: [[1, '1: 60–100° flexion'], [2, '2: under 60° or over 100°']],
  wrist: [[1, '1: neutral'], [2, '2: 0–15° flexion or extension'], [3, '3: over 15° flexion or extension']],
  wristTwist: [[1, '1: mainly mid-range'], [2, '2: at or near the end of range']],
  force: [[0, '0: under 2 kg, intermittent'], [1, '1: 2–10 kg, intermittent'], [2, '2: 2–10 kg static or repeated'], [3, '3: over 10 kg, or shocks']],
  neck: [[1, '1: 0–10° flexion'], [2, '2: 10–20° flexion'], [3, '3: over 20° flexion'], [4, '4: in extension']],
  trunk: [[1, '1: upright, or sitting well supported'], [2, '2: 0–20° flexion'], [3, '3: 20–60° flexion'], [4, '4: over 60° flexion']],
  legs: [[1, '1: supported and balanced'], [2, '2: not supported or unbalanced']],
};
const opts = (list) => list.map(([k, l]) => [String(k), l]);
function Checks({ items, v, setV }) {
  return <div className="hf-checks">{items.map(([k, l]) => <label key={k} className="tl-check"><input type="checkbox" checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} /> {l}</label>)}</div>;
}
function RulaSheet() {
  const [v, setV] = useState({ ...E.RULA_EXAMPLE });
  const num = (k) => (x) => setV({ ...v, [k]: Number(x) });
  const r = E.rula(v);
  return (
    <>
      <div className="ea-grid2">
        <section className="ea-card">
          <h4>A. Arm and wrist</h4>
          <Pick label="Upper arm" value={String(v.upperArm)} onChange={num('upperArm')} options={opts(RULA_OPTS.upperArm)} />
          <Checks v={v} setV={setV} items={[['shoulderRaised', 'Shoulder raised +1'], ['abducted', 'Arm abducted +1'], ['armSupported', 'Arm supported or leaning −1']]} />
          <Pick label="Lower arm" value={String(v.lowerArm)} onChange={num('lowerArm')} options={opts(RULA_OPTS.lowerArm)} />
          <Checks v={v} setV={setV} items={[['across', 'Working across the midline or out to the side +1']]} />
          <Pick label="Wrist" value={String(v.wrist)} onChange={num('wrist')} options={opts(RULA_OPTS.wrist)} />
          <Checks v={v} setV={setV} items={[['wristDeviated', 'Wrist bent from the midline +1']]} />
          <Pick label="Wrist twist" value={String(v.wristTwist)} onChange={num('wristTwist')} options={opts(RULA_OPTS.wristTwist)} />
          <Checks v={v} setV={setV} items={[['muscleA', 'Muscle use: static over 1 minute or repeated 4+ times a minute +1']]} />
          <Pick label="Force or load" value={String(v.forceA)} onChange={num('forceA')} options={opts(RULA_OPTS.force)} />
        </section>
        <section className="ea-card">
          <h4>B. Neck, trunk and legs</h4>
          <Pick label="Neck" value={String(v.neck)} onChange={num('neck')} options={opts(RULA_OPTS.neck)} />
          <Checks v={v} setV={setV} items={[['neckTwist', 'Neck twisted +1'], ['neckSide', 'Neck side-bending +1']]} />
          <Pick label="Trunk" value={String(v.trunk)} onChange={num('trunk')} options={opts(RULA_OPTS.trunk)} />
          <Checks v={v} setV={setV} items={[['trunkTwist', 'Trunk twisted +1'], ['trunkSide', 'Trunk side-bending +1']]} />
          <Pick label="Legs" value={String(v.legs)} onChange={num('legs')} options={opts(RULA_OPTS.legs)} />
          <Checks v={v} setV={setV} items={[['muscleB', 'Muscle use: static or repeated +1']]} />
          <Pick label="Force or load" value={String(v.forceB)} onChange={num('forceB')} options={opts(RULA_OPTS.force)} />
        </section>
      </div>
      <Result big={r.grand} tone={r.level >= 3 ? 'bad' : r.level === 1 ? 'good' : undefined} label={`RULA grand score, action level ${r.level}: ${r.text.toLowerCase()}`}>
        <Stats rows={[['Posture A (Table A)', r.postureA], ['Score C (+ muscle, force)', r.scoreC], ['Posture B (Table B)', r.postureB], ['Score D (+ muscle, force)', r.scoreD]]} />
      </Result>
      <Table label="RULA steps" head={['Body part', 'Score used']} rows={[['Upper arm', r.ua], ['Lower arm', r.la], ['Wrist', r.wr], ['Wrist twist', r.tw], ['Neck', r.neck], ['Trunk', r.trunk], ['Legs', r.legs]]} />
      <StudySummary {...E.postureSummary('rula', r)} />
    </>
  );
}

// ── REBA sheet ──
const REBA_OPTS = {
  trunk: [[1, '1: upright'], [2, '2: 0–20° flexion or extension'], [3, '3: 20–60° flexion, or over 20° extension'], [4, '4: over 60° flexion']],
  neck: [[1, '1: 0–20° flexion'], [2, '2: over 20° flexion or in extension']],
  legs: [[1, '1: both feet, walking or sitting'], [2, '2: one foot, or unstable']],
  knees: [[0, '+0: knees straight'], [1, '+1: knees bent 30–60°'], [2, '+2: knees bent over 60° (not sitting)']],
  load: [[0, '0: under 5 kg'], [1, '1: 5–10 kg'], [2, '2: over 10 kg']],
  upperArm: [[1, '1: 20° extension to 20° flexion'], [2, '2: over 20° extension, or 20–45° flexion'], [3, '3: 45–90° flexion'], [4, '4: over 90° flexion']],
  lowerArm: [[1, '1: 60–100° flexion'], [2, '2: under 60° or over 100°']],
  wrist: [[1, '1: 0–15° flexion or extension'], [2, '2: over 15°']],
  coupling: [[0, '0 good: well-fitting handle'], [1, '1 fair: acceptable hand hold'], [2, '2 poor: not acceptable'], [3, '3 unacceptable: awkward, unsafe']],
};
function RebaSheet() {
  const [v, setV] = useState({ ...E.REBA_EXAMPLE });
  const num = (k) => (x) => setV({ ...v, [k]: Number(x) });
  const r = E.reba(v);
  const tone = r.score >= 8 ? 'bad' : r.score <= 3 ? 'good' : undefined;
  return (
    <>
      <div className="ea-grid2">
        <section className="ea-card">
          <h4>A. Trunk, neck, legs and load</h4>
          <Pick label="Trunk" value={String(v.trunk)} onChange={num('trunk')} options={opts(REBA_OPTS.trunk)} />
          <Checks v={v} setV={setV} items={[['trunkTwist', 'Trunk twisted or side-bent +1']]} />
          <Pick label="Neck" value={String(v.neck)} onChange={num('neck')} options={opts(REBA_OPTS.neck)} />
          <Checks v={v} setV={setV} items={[['neckTwist', 'Neck twisted or side-bent +1']]} />
          <Pick label="Legs" value={String(v.legs)} onChange={num('legs')} options={opts(REBA_OPTS.legs)} />
          <Pick label="Knees" value={String(v.knees)} onChange={num('knees')} options={opts(REBA_OPTS.knees)} />
          <Pick label="Load or force" value={String(v.load)} onChange={num('load')} options={opts(REBA_OPTS.load)} />
          <Checks v={v} setV={setV} items={[['shock', 'Shock or rapid build-up of force +1']]} />
        </section>
        <section className="ea-card">
          <h4>B. Arms, wrists and grip</h4>
          <Pick label="Upper arm" value={String(v.upperArm)} onChange={num('upperArm')} options={opts(REBA_OPTS.upperArm)} />
          <Checks v={v} setV={setV} items={[['abducted', 'Abducted or rotated +1'], ['shoulderRaised', 'Shoulder raised +1'], ['armSupported', 'Arm supported or person leaning −1']]} />
          <Pick label="Lower arm" value={String(v.lowerArm)} onChange={num('lowerArm')} options={opts(REBA_OPTS.lowerArm)} />
          <Pick label="Wrist" value={String(v.wrist)} onChange={num('wrist')} options={opts(REBA_OPTS.wrist)} />
          <Checks v={v} setV={setV} items={[['wristTwist', 'Wrist deviated or twisted +1']]} />
          <Pick label="Coupling" value={String(v.coupling)} onChange={num('coupling')} options={opts(REBA_OPTS.coupling)} />
          <h4>Activity</h4>
          <Checks v={v} setV={setV} items={[['static', 'A body part held static over 1 minute +1'], ['repeated', 'Small-range actions repeated 4+ times a minute +1'], ['rapid', 'Rapid large changes in posture or unstable base +1']]} />
        </section>
      </div>
      <Result big={r.score} tone={tone} label={`REBA score: ${r.risk} risk, action ${r.action.toLowerCase()}`}>
        <Stats rows={[['Table A posture', r.postureA], ['Score A (+ load)', r.scoreA], ['Table B posture', r.postureB], ['Score B (+ coupling)', r.scoreB], ['Table C', r.tableC], ['Activity', `+${r.activity}`]]} />
      </Result>
      <StudySummary {...E.postureSummary('reba', r)} />
    </>
  );
}

// ── Anthropometry sheet ──
const groupsToText = (gs) => gs.map((g) => `${g.name}, ${g.mean}, ${g.sd}, ${g.w}${g.n ? `, ${g.n}` : ''}`).join('\n');
function parseGroups(text) {
  const out = [], errors = [];
  for (const line of String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))) {
    const c = line.split(/\s*[,;\t]\s*/);
    const [m, s, w, n] = c.slice(1).map(Number);
    if (c.length < 3 || !Number.isFinite(m) || !(s > 0)) { errors.push(`"${line}": give a name, mean and SD (and optionally a share and n).`); continue; }
    out.push({ name: c[0], mean: m, sd: s, w: Number.isFinite(w) && w > 0 ? w : 1, n: Number.isFinite(n) ? n : 0 });
  }
  return { groups: out, errors };
}
function AnthroSheet() {
  const A = E.ANTHRO_EXAMPLE;
  const [dim, setDim] = useState(A.dimension), [unit, setUnit] = useState(A.unit), [type, setType] = useState(A.type);
  const [x, setX] = useState(A.x), [lo, setLo] = useState(A.lo), [hi, setHi] = useState(A.hi), [target, setTarget] = useState(A.target * 100);
  const [gText, setGText] = useState(groupsToText(A.groups));
  const { groups, errors } = parseGroups(gText);
  const ok = groups.length && (type === 'range' ? Number.isFinite(n_(lo)) && Number.isFinite(n_(hi)) && n_(hi) > n_(lo) : Number.isFinite(n_(x))) && n_(target) > 0 && n_(target) < 100;
  const r = ok ? E.accommodation({ groups, type, x: n_(x), lo: n_(lo), hi: n_(hi) }) : null;
  const design = ok ? E.designFor({ groups, type, target: n_(target) / 100 }) : null;
  const plot = useMemo(() => {
    if (!r) return null;
    const a = Math.min(...groups.map((g) => g.mean - 3.5 * g.sd)), b = Math.max(...groups.map((g) => g.mean + 3.5 * g.sd));
    return groups.map((g) => ({ name: g.name, pts: Array.from({ length: 121 }, (_, i) => { const v = a + ((b - a) * i) / 120; return [v, Math.exp(-0.5 * ((v - g.mean) / g.sd) ** 2) / (g.sd * Math.sqrt(2 * Math.PI))]; }) }));
  }, [gText, r === null]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="calc-inputs ea-inputs">
        <label className="calc-field"><span>Body dimension</span><input className="hf-text" value={dim} onChange={(e) => setDim(e.target.value)} /></label>
        <label className="calc-field"><span>Unit</span><input className="hf-text short" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
        <Choice label="Design for" value={type} onChange={setType} options={[['max', 'Clearance (fit up to x)'], ['min', 'Reach (reach x or more)'], ['range', 'Adjustable range']]} />
        {type === 'range' ? <><Num label={`From (${unit})`} value={lo} onChange={setLo} /><Num label={`To (${unit})`} value={hi} onChange={setHi} /></> : <Num label={`Design value x (${unit})`} value={x} onChange={setX} />}
        <Num label="Target share accommodated" value={target} onChange={setTarget} min={50} max={99.9} step={0.5} suffix="%" />
      </div>
      <Area label="User groups: name, mean, SD, share of users, n (optional)" rows={3} value={gText} onChange={setGText} hint="The share is a weight (50 and 50 is a half each). Add n, the survey sample size behind the mean and SD, if you know it." />
      {errors.length > 0 && <Problem>{errors[0]}</Problem>}
      {r && (
        <>
          <Result big={`${sig(r.total * 100, 3)}%`} tone={r.total >= n_(target) / 100 ? 'good' : 'bad'} label={`of users accommodated by ${type === 'range' ? `${lo}–${hi}` : x} ${unit}`}>
            <Stats rows={[type === 'range' ? [`Range for ${target}%`, `${fmt(design.lo, 1)} to ${fmt(design.hi, 1)} ${unit}`] : [`Design value for ${target}%`, `${fmt(design.x, 1)} ${unit}`], ...groups.map((g) => [`${g.name}: 5th / 50th / 95th`, `${fmt(E.groupQuantile(g, 0.05), 1)} / ${fmt(g.mean, 1)} / ${fmt(E.groupQuantile(g, 0.95), 1)}`])]} />
          </Result>
          <Table label="Accommodation by group" head={['Group', 'Mean', 'SD', 'Share of users', type === 'range' ? 'Range as percentiles' : 'x as a percentile', 'Accommodated']} rows={r.per.map((g) => [g.name, fmt(g.mean, 1), fmt(g.sd, 1), `${Math.round(g.share * 100)}%`, g.pctile.map((q) => `${sig(q * 100, 3)}th`).join(' to '), `${sig(g.acc * 100, 3)}%`])} />
          {plot && <LinePlot series={plot} label={`Distribution of ${dim} by group`} xLabel={`${dim} (${unit})`} yLabel="Density" yFmt={() => ''} xFmt={(v) => fmt(v, 0)} vlines={type === 'range' ? [{ x: n_(lo), label: 'from' }, { x: n_(hi), label: 'to' }] : [{ x: n_(x), label: 'x' }]} />}
          <StudySummary {...E.anthroSummary({ r, design, type, x: n_(x), lo: n_(lo), hi: n_(hi), unit, dimension: dim, target: n_(target) / 100, groups })} />
        </>
      )}
      <p className="hf-note">The example uses illustrative means and SDs, not survey data: replace them with measurements for your users.</p>
    </>
  );
}

// ── Borg sheet ──
function BorgSheet() {
  const [scale, setScale] = useState(E.BORG_EXAMPLE.scale), [text, setText] = useState(E.BORG_EXAMPLE.text);
  const B = E.BORG[scale];
  const vals = E.parseRatings(text);
  const outOf = vals.filter((x) => x < B.min || x > B.max);
  const r = vals.length >= 2 && !outOf.length ? E.borg(scale, vals) : null;
  const cats = scale === 'rpe' ? Array.from({ length: 15 }, (_, i) => i + 6) : Array.from({ length: 12 }, (_, i) => i);
  return (
    <>
      <div className="calc-inputs ea-inputs">
        <Choice label="Scale" value={scale} onChange={setScale} options={[['rpe', 'RPE 6–20'], ['cr10', 'CR10 0–10']]} />
      </div>
      <Area label="Ratings (one per person, separated by spaces or commas)" rows={3} value={text} onChange={setText} />
      {outOf.length > 0 && <Problem>{outOf.length} rating{outOf.length > 1 ? 's are' : ' is'} outside {B.min}–{B.max}.</Problem>}
      {vals.length < 2 && <Problem>Enter at least two ratings.</Problem>}
      {r && (
        <>
          <Result big={sig(r.mean, 3)} label={`Mean ${B.name} rating: "${E.borgAnchor(scale, r.mean).toLowerCase()}"`}>
            <Stats rows={[['95% CI for the mean', `${sig(r.lo, 3)} to ${sig(r.hi, 3)}`], ['Median', sig(r.median, 3)], ['SD', sig(r.sd, 3)], [`Rated ${B.high} or more`, `${r.high} of ${r.n}`]]} />
          </Result>
          <BarChart label="Distribution of ratings" bars={cats.map((c) => ({ label: String(c), value: vals.filter((x) => Math.round(x) === c).length, tone: c >= B.high ? 'warn' : undefined }))} />
          <Table label="Verbal anchors" num={false} head={['Rating', 'Anchor']} rows={B.anchors.map(([k, l]) => [k, l])} />
          <StudySummary {...E.borgSummary(scale, r)} />
        </>
      )}
    </>
  );
}

// ── Cooper-Harper sheet ──
function CooperHarperSheet() {
  const [ans, setAns] = useState({});
  const [text, setText] = useState(E.CH_EXAMPLE);
  const options = E.chOptions(ans);
  const ratings = E.parseRatings(text).filter((x) => Number.isInteger(x) && x >= 1 && x <= 10);
  const r = ratings.length ? E.cooperHarper(ratings) : null;
  const yn = (k, label, show) => show && (
    <div className="q"><span>{label}</span><div className="seg" role="radiogroup" aria-label={label}>
      {[[true, 'Yes'], [false, 'No']].map(([b, l]) => <button key={l} type="button" role="radio" aria-checked={ans[k] === b} className={ans[k] === b ? 'on' : ''} onClick={() => setAns(k === 'controllable' ? { controllable: b } : k === 'adequate' ? { controllable: true, adequate: b } : { ...ans, satisfactory: b })}>{l}</button>)}
    </div></div>
  );
  return (
    <>
      <section className="ea-card hf-ch">
        <h4>Rate one pilot or operator with the decision tree</h4>
        {yn('controllable', '1. Is it controllable?', true)}
        {yn('adequate', '2. Is adequate performance attainable with a tolerable workload?', ans.controllable === true)}
        {yn('satisfactory', '3. Is it satisfactory without improvement?', ans.adequate === true)}
        {options.length > 0 && (
          <div className="hf-ratings">
            <p className="hf-note">Choose the rating that fits, then it is added to the list below.</p>
            {options.map((k) => { const [, a, b] = E.CH[k - 1]; return <button key={k} type="button" className="btn ghost small" onClick={() => { setText(`${text.trim()} ${k}`.trim()); setAns({}); }}><b>{k}</b>: {a}. {b}.</button>; })}
          </div>
        )}
      </section>
      <Area label="Ratings collected (1–10)" rows={2} value={text} onChange={setText} />
      {r && (
        <>
          <Result big={sig(r.median, 2)} label={`Median Cooper-Harper rating from ${r.n} rater${r.n === 1 ? '' : 's'}`}>
            <Stats rows={[['Level 1 (1–3)', r.levels[0]], ['Level 2 (4–6)', r.levels[1]], ['Level 3 (7–9)', r.levels[2]], ['Uncontrollable (10)', r.levels[3]]]} />
          </Result>
          <BarChart label="Ratings" bars={r.counts.map((c, i) => ({ label: String(i + 1), value: c, tone: i < 3 ? 'ok' : i < 6 ? 'warn' : 'bad' }))} />
          <StudySummary {...E.chSummary(r)} />
        </>
      )}
    </>
  );
}

// ── SWAT sheet ──
function SwatSheet() {
  const [proto, setProto] = useState(E.SWAT_EXAMPLE.proto);
  const [custom, setCustom] = useState('');
  const [events, setEvents] = useState(E.SWAT_EXAMPLE.events);
  const parsed = proto === 'custom' ? E.parseSwatOrder(custom) : { order: E.prototypeOrder(proto), errors: [] };
  const sc = parsed.errors.length ? null : E.swatScale(parsed.order);
  const ev = E.parseSwatEvents(events);
  return (
    <>
      <div className="calc-inputs ea-inputs">
        <Pick label="Card sort (scale development)" value={proto} onChange={(v) => { setProto(v); if (v === 'custom' && !custom) setCustom(E.prototypeOrder('TES').map((c) => c.join('')).join(' ')); }} options={[...E.SWAT_PROTOTYPES.map(([k, l]) => [k, `Prototype ${k}: ${l}`]), ['custom', 'My own card order']]} />
      </div>
      {proto === 'custom' && <Area label="Card order, lowest workload first: 27 codes of time-effort-stress levels (e.g. 111 112 …)" rows={3} value={custom} onChange={setCustom} />}
      {parsed.errors.length > 0 && <Problem>{parsed.errors[0]}</Problem>}
      <Area label="Tasks to score: label, time load (1–3), mental effort (1–3), stress (1–3)" rows={4} value={events} onChange={setEvents} />
      {sc && (
        <>
          <Result big={`${Math.round(sc.importance[0] * 100)} / ${Math.round(sc.importance[1] * 100)} / ${Math.round(sc.importance[2] * 100)}`} label="Importance of time / effort / stress (%)">
            <Stats rows={[['Additive model R²', sig(sc.r2, 3)], ...ev.map((e) => [e.label, `${sig(sc.score([e.t, e.e, e.s]), 3)} of 100`])]} />
          </Result>
          <Table label="SWAT scale values" head={['T-E-S', 'Card rank', 'Scale value']} rows={[...sc.table].sort((a, b) => a.score - b.score).map((t) => [t.c.join('-'), t.rank, sig(t.score, 3)])} />
          <StudySummary {...E.swatSummary(sc, ev)} />
        </>
      )}
    </>
  );
}

export default HfErgonomics;
