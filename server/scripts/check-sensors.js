// Checks the sensors tools (HRV, EDA/GSR peaks, eye-tracking AOIs, cultural consensus, code co-occurrence networks,
// SIR and Bass adoption, journey forecast, Nash equilibria) against neurokit2, scipy, numpy, astropy, pandas,
// factor_analyzer, networkx, the Levenshtein package and nashpy (server/scripts/sensors-reference.py →
// sensors-reference.json), and checks every "Reading your results" summary. Run with `npm run check:sensors`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as EX from '../../client/src/calc/tools/sensors-examples.js';
import * as HRV from '../../client/src/calc/tools/sensors-hrv.js';
import * as EDA from '../../client/src/calc/tools/sensors-eda.js';
import * as EYE from '../../client/src/calc/tools/sensors-eye.js';
import * as CCA from '../../client/src/calc/tools/sensors-consensus.js';
import * as NET from '../../client/src/calc/tools/sensors-codenet.js';
import * as AD from '../../client/src/calc/tools/sensors-adoption.js';
import * as JR from '../../client/src/calc/tools/sensors-journey.js';
import * as NA from '../../client/src/calc/tools/sensors-nash.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'sensors-reference.json'), 'utf8'));
const INP = JSON.parse(readFileSync(path.join(here, 'sensors-reference-input.json'), 'utf8'));
let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-9) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toPrecision(12) : got}`);
}
const nearRel = (label, got, want, rel = 1e-9) => near(label, got, want, Math.abs(want) * rel + 1e-12);
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
const LEVELS = ['high', 'medium', 'low'];
const CALC_LINKS = /^\/calculators\/(compare-means|compare-rates|shannon-information|retention-funnel|completion-rate)$/;
function summary(label, s, key, level) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && LEVELS.includes(s.confidence)
    && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20;
  same(`${label}: summary has every part`, !!ok, true);
  same(`${label}: no NaN, undefined, Infinity or empty values`, /NaN|undefined|Infinity|\bnull\b|n\/a/.test(text), false);
  // Frequentist wording rule; the journey forecast is Bayesian, where the probability statement is correct.
  same(`${label}: no "% chance the true value" wording`, /\d+% chance (that )?the true/i.test(text), false);
  for (const k of [].concat(key || [])) truthy(`${label}: headline contains "${k}"`, s.headline.includes(k));
  if (level) same(`${label}: confidence`, s.confidence, level);
  for (const m of text.matchAll(/\]\((\/[a-z0-9\-/]+)\)/g)) truthy(`${label}: link ${m[1]} is a calculator page`, CALC_LINKS.test(m[1]));
  if (process.env.SHOW) console.log(`  headline: ${s.headline}\n  report: ${s.report}`);
  return s;
}

// ── The examples on the pages are the datasets the Python reference used ──
same('HRV example = reference input', EX.EX_HRV, INP.hrv);
same('EDA example = reference input', [EX.EX_EDA, EX.EX_EDA_FS, EX.EX_EDA_SEGMENTS], [INP.eda, INP.edaFs, INP.edaSegments]);
same('Eye-tracking examples = reference input', [EX.EX_EYE_FIX, EX.EX_EYE_AOI], [INP.eyeFixations, INP.eyeAois]);
same('Consensus example = reference input', EX.EX_CONSENSUS, INP.consensus);
same('Code network example = reference input', EX.EX_CODENET, INP.codenet);
same('Bass example = reference input', EX.EX_BASS, INP.bass);
same('Journey example = reference input', EX.EX_JOURNEY, INP.journey);

// ── HRV (neurokit2 hrv_time / hrv_nonlinear, scipy.signal.lombscargle, astropy LombScargle) ──
console.log('\nHRV');
const hp = HRV.parseRR(INP.hrv);
same('HRV parser: three segments, no errors', [hp.segments.map((s) => s.name), hp.errors], [['baseline', 'task', 'recovery'], []]);
const hres = HRV.analyse(hp.segments, {});
for (const r of hres) {
  const R = REF.hrv[r.name];
  same(`${r.name}: artefact beats`, r.bad.map((b, i) => (b ? i : -1)).filter((i) => i >= 0), R.bad);
  nearRel(`${r.name}: mean NN (neurokit2)`, r.meanNN, R.nk_MeanNN);
  nearRel(`${r.name}: SDNN (neurokit2)`, r.sdnn, R.nk_SDNN);
  nearRel(`${r.name}: RMSSD (neurokit2)`, r.rmssd, R.nk_RMSSD);
  nearRel(`${r.name}: SDSD (neurokit2)`, r.sdsd, R.nk_SDSD);
  near(`${r.name}: pNN50 % (neurokit2)`, r.pnn50 * 100, R.nk_pNN50, 1e-9);
  nearRel(`${r.name}: Poincaré SD1 (neurokit2)`, r.sd1, R.nk_SD1);
  nearRel(`${r.name}: Poincaré SD2 (neurokit2)`, r.sd2, R.nk_SD2);
  nearRel(`${r.name}: mean HR (numpy)`, r.meanHR, R.np_meanHR);
  for (const [f, v] of Object.entries(R.psd_scipy_at)) nearRel(`${r.name}: Lomb-Scargle density at ${f} Hz (scipy)`, r.psd[HRV.FREQS.indexOf(+f)], v, 1e-8);
  truthy(`${r.name}: scipy and astropy periodograms agree (max relative gap ${R.psd_astropy_ratio_max_dev.toExponential(1)})`, R.psd_astropy_ratio_max_dev < 1e-8);
  nearRel(`${r.name}: VLF power`, r.vlf, R.vlf, 1e-8);
  nearRel(`${r.name}: LF power`, r.lf, R.lf, 1e-8);
  nearRel(`${r.name}: HF power`, r.hf, R.hf, 1e-8);
  nearRel(`${r.name}: LF/HF`, r.lfhf, R.lfhf, 1e-8);
  near(`${r.name}: LF/HF within 5% of neurokit2 (its own Lomb-Scargle grid and scaling: ${R.nk_LFHF.toFixed(4)})`, r.lfhf / R.nk_LFHF - 1, 0, 0.05);
  near(`${r.name}: HF peak frequency`, r.hfPeak, R.hfPeak, 1e-12);
}
const hdel = HRV.analyse(hp.segments, { method: 'delete' });
for (const r of hdel) {
  const R = REF.hrv[r.name];
  nearRel(`${r.name}, deleting artefacts: RMSSD over adjacent good beats`, r.rmssd, R.del_rmssd);
  nearRel(`${r.name}, deleting artefacts: SDNN`, r.sdnn, R.del_sdnn);
  nearRel(`${r.name}, deleting artefacts: LF/HF`, r.lfhf, R.del_lfhf, 1e-8);
}
{
  const S = REF.hrv.sine, psd = HRV.lombScargle(S.t, S.y);
  let tot = 0; for (let i = 1; i < psd.length; i++) tot += 0.5 * (psd[i] + psd[i - 1]) * (HRV.FREQS[i] - HRV.FREQS[i - 1]);
  nearRel('Sine 30 ms at 0.25 Hz: integrated density (scipy)', tot, S.total, 1e-8);
  near('Sine: integrated density within 1% of the variance A²/2 = 450', tot / S.var, 1, 0.01);
}
same('HRV parser: seconds are converted to ms; labels with commas', HRV.parseRR('rest, 0.8\nrest, 0.82').segments[0].rr, [800, 820]);
same('HRV parser rejects words', HRV.parseRR('rest: 800 eight').errors.length, 1);
same('HRV confidence: example (≈4.4 to 5 min segments, ≤ 2% corrected)', HRV.hrvConfidence(hres), 'medium');
summary('HRV example', HRV.hrvSummary(hres), ['RMSSD', '"task"'], 'medium');
summary('HRV one segment', HRV.hrvSummary(HRV.analyse([hp.segments[0]], {})), 'mean heart rate');
const longSeg = { name: 'long', rr: Array.from({ length: 420 }, (_, i) => 800 + 30 * Math.sin(i / 2.3) + 7 * Math.sin(i / 7)) };
same('HRV confidence: 5.6 minutes with no artefacts is high', HRV.hrvConfidence(HRV.analyse([longSeg], {})), 'high');
same('HRV confidence: 1 minute is low', HRV.hrvConfidence(HRV.analyse([{ name: 'x', rr: longSeg.rr.slice(0, 75) }], {})), 'low');

// ── EDA (scipy.ndimage filters, the same peak rules in numpy; scipy.signal.find_peaks as a cross-check) ──
console.log('\nEDA');
const sc = EDA.parseSignal(INP.eda), fs = INP.edaFs, eSegs = EDA.parseSegments(INP.edaSegments, sc.length / fs);
const er = EDA.analyse(sc, fs, { segments: eSegs.segments });
same('EDA: window sizes 3 and 33 samples', [er.kS, er.kM], [3, 33]);
for (const [i, v] of Object.entries(REF.eda.tonic_at)) near(`EDA tonic at sample ${i} (scipy median_filter)`, er.tonic[+i], v, 1e-12);
for (const [i, v] of Object.entries(REF.eda.phasic_at)) near(`EDA phasic at sample ${i}`, er.phasic[+i], v, 1e-12);
near('EDA: Σ tonic', er.tonic.reduce((a, b) => a + b, 0), REF.eda.tonic_sum, 1e-8);
near('EDA: Σ |phasic|', er.phasic.reduce((a, b) => a + Math.abs(b), 0), REF.eda.phasic_abs_sum, 1e-8);
same('EDA: SCR onsets and peaks', er.scrs.map((p) => [p.onset, p.peak]), REF.eda.scrs.map((p) => [p.onset, p.peak]));
near('EDA: max |amplitude difference|', Math.max(...er.scrs.map((p, k) => Math.abs(p.amp - REF.eda.scrs[k].amp))), 0, 1e-12);
near('EDA: max |rise time difference|', Math.max(...er.scrs.map((p, k) => Math.abs(p.rise - REF.eda.scrs[k].rise))), 0, 1e-12);
same('EDA: which SCRs have a half recovery', er.scrs.map((p) => Number.isFinite(p.recovery)), REF.eda.scrs.map((p) => p.recovery !== null));
near('EDA: max |half-recovery difference|', Math.max(...er.scrs.filter((p) => Number.isFinite(p.recovery)).map((p) => Math.abs(p.recovery - REF.eda.scrs[er.scrs.indexOf(p)].recovery))), 0, 1e-9);
// scipy find_peaks uses prominence rather than onset-to-peak rise, so it is a cross-check, not an identity: the same
// number of responses, each peak within 2 s.
same('EDA: same number of peaks as scipy find_peaks(prominence 0.01 µS, 10 s window)', er.scrs.length, REF.eda.find_peaks.length);
near('EDA: largest gap to the matching find_peaks peak (s, within 2)', Math.max(...er.scrs.map((p, k) => Math.abs(p.peak - REF.eda.find_peaks[k]) / fs)), 0, 2);
er.segments.forEach((s, k) => {
  const R = REF.eda.segments[k];
  same(`EDA ${s.name}: SCR count`, s.count, R.count);
  near(`EDA ${s.name}: SCRs per minute`, s.rate, R.rate, 1e-12);
  near(`EDA ${s.name}: mean amplitude`, s.meanAmp, R.meanAmp, 1e-12);
  near(`EDA ${s.name}: mean tonic level (SCL)`, s.scl, R.scl, 1e-12);
});
{ // A moving average and running median on a short series, by hand.
  same('Moving average, k = 3, edges repeated', EDA.movingAverage([1, 2, 6, 3], 3).map((v) => +v.toFixed(12)), [1.333333333333, 3, 3.666666666667, 4]);
  same('Running median, k = 3, edges repeated', EDA.runningMedian([5, 1, 4, 2, 8], 3), [5, 4, 2, 4, 8]);
}
const q = EDA.quality(sc, fs);
same('EDA confidence: example (4 Hz, 2- and 3-minute segments, no jumps)', EDA.edaConfidence(er, q), 'high');
summary('EDA example', EDA.edaSummary(er, q, 0.01), ['per minute in "task"'], 'high');
summary('EDA whole recording', EDA.edaSummary(EDA.analyse(sc, fs), q, 0.01), 'per minute');
same('EDA confidence: 2 Hz, 90 s segments is medium', EDA.edaConfidence({ fs: 2, segments: [{ minutes: 1.5 }] }, { jumps: 0, flatShare: 0 }), 'medium');

// ── Eye tracking (pandas, Levenshtein package) ──
console.log('\nEye tracking');
const fx = EYE.parseFixations(INP.eyeFixations), ao = EYE.parseAois(INP.eyeAois);
same('Eye parser: fixations and AOIs, no errors', [fx.rows.length, ao.aois.length, fx.errors, ao.errors], [fx.rows.length, 6, [], []]);
const yr = EYE.analyse(fx.rows, ao.aois);
yr.aoiStats.forEach((a, k) => {
  const R = REF.eye.aoi[k];
  nearRel(`${a.name}: dwell share`, a.dwellShare, R.dwellShare);
  nearRel(`${a.name}: hit ratio`, a.hitRatio, R.hitRatio);
  nearRel(`${a.name}: mean time to first fixation (ms)`, a.ttffMean, R.ttffMean);
  nearRel(`${a.name}: fixations per participant`, a.countMean, R.countMean);
  near(`${a.name}: mean revisits`, a.revisitsMean, R.revisitsMean, 1e-12);
  nearRel(`${a.name}: mean dwell of those who looked (ms)`, a.dwellMeanSeen, R.dwellMeanSeen);
});
same('Eye: scanpath strings', yr.people.map((p) => p.path), REF.eye.paths);
same('Eye: transition matrix', yr.T, REF.eye.T);
near('Eye: max |similarity difference| (Levenshtein package)', Math.max(...yr.S.flatMap((r, i) => r.map((v, j) => Math.abs(v - REF.eye.S[i][j])))), 0, 1e-12);
nearRel('Eye: mean pairwise similarity', yr.meanSim, REF.eye.meanSim);
nearRel('Eye: share of fixation time outside AOIs', yr.outsideShare, REF.eye.outsideShare);
same('Levenshtein kitten → sitting = 3', EYE.levenshtein('kitten', 'sitting'), 3);
same('Eye confidence: 12 participants, 2% outside → medium', EYE.eyeConfidence(yr), 'medium');
summary('Eye example', EYE.eyeSummary(yr), '"Product photo"', 'medium');
same('Eye confidence: 35 participants but 40% outside → medium', EYE.eyeConfidence({ N: 35, outsideShare: 0.4 }), 'medium');

// ── Cultural consensus (factor_analyzer minres, scipy least_squares, numpy) ──
console.log('\nCultural consensus');
const cp = CCA.parseAnswers(INP.consensus);
same('Consensus parser: 20 respondents × 30 questions', [cp.rows.length, cp.questions.length, cp.errors], [20, 30, []]);
const cr = CCA.analyse(cp, 2);
nearRel('Raw agreement A01–A02', cr.ag.M[0][1], REF.consensus.M01);
nearRel('Agreement corrected for guessing A01–A02', cr.ag.Ms[0][1], REF.consensus.Ms01);
nearRel('Σ corrected agreement matrix', cr.ag.Ms.flat().reduce((a, b) => a + b, 0), REF.consensus.Ms_sum);
near('Competence: max |difference| from the least-squares minimiser (scipy)', Math.max(...cr.D.map((v, i) => Math.abs(v - REF.consensus.loadings_ls[i]))), 0, 1e-7);
near('Competence: max |difference| from factor_analyzer minres (stops at its own tolerance)', Math.max(...cr.D.map((v, i) => Math.abs(v - REF.consensus.loadings_fa[i]))), 0, 1e-6);
REF.consensus.eigen.forEach((v, i) => nearRel(`Eigenvalue ${i + 1} of the reduced matrix`, cr.eigen[i], v, 1e-6));
nearRel('Eigenvalue ratio', cr.ratio, REF.consensus.ratio, 1e-6);
nearRel('Mean competence', cr.meanD, REF.consensus.meanD, 1e-6);
same('Answer key', cr.key.map((k) => k.answer), REF.consensus.key);
near('Answer key: max |posterior difference|', Math.max(...cr.key.map((k, i) => Math.abs(k.post - REF.consensus.post[i]))), 0, 1e-6);
same('Consensus confidence: ratio 4.9, mean competence 0.49 → low', CCA.consensusConfidence(cr), 'low');
summary('Consensus example', CCA.consensusSummary(cr, cp.rows.map((r) => r.id)), 'One shared answer key', 'low');
same('Consensus confidence rule: ratio 3.5, mean 0.6, 25 respondents → high', CCA.consensusConfidence({ ratio: 3.5, meanD: 0.6, negative: [], n: 25 }), 'high');
summary('Consensus with a low ratio', CCA.consensusSummary({ ...cr, ratio: 2.1 }, cp.rows.map((r) => r.id)), 'No single shared answer key', 'low');

// ── Code co-occurrence (networkx, scipy.stats.hypergeom) ──
console.log('\nCode network');
const np_ = NET.parseSegments(INP.codenet), co = NET.cooccurrence(np_);
same('Codes and frequencies', [co.N, np_.keys, np_.keys.map((k, i) => co.freq[i])], [REF.codenet.N, REF.codenet.codes, REF.codenet.codes.map((c) => REF.codenet.freq[c])]);
same('Number of co-occurring pairs', co.pairs.length, REF.codenet.pairs.length);
let maxD = { jaccard: 0, ochiai: 0, lift: 0, p: 0 }, cntOk = true;
for (const R of REF.codenet.pairs) {
  const i = np_.keys.indexOf(R.a), j = np_.keys.indexOf(R.b), p = co.pairs.find((x) => x.i === Math.min(i, j) && x.j === Math.max(i, j));
  if (!p || p.c !== R.c) { cntOk = false; continue; }
  for (const k of ['jaccard', 'ochiai', 'lift']) maxD[k] = Math.max(maxD[k], Math.abs(p[k] - R[k]));
  maxD.p = Math.max(maxD.p, Math.abs(p.p - R.p) / Math.max(R.p, 1e-300));
}
truthy('Every pair count matches', cntOk);
for (const k of ['jaccard', 'ochiai', 'lift']) near(`Max |${k} difference|`, maxD[k], 0, 1e-12);
near('Max relative difference of the hypergeometric p (scipy hypergeom.sf)', maxD.p, 0, 1e-9);
const net = NET.network(co, 'jaccard', 2);
nearRel('Louvain modularity (networkx, best of 20 seeds)', net.Q, REF.codenet.louvainQ, 1e-9);
same('Louvain clusters (networkx)', net.clusters.map((c) => c.members.map((i) => np_.keys[i]).sort()).sort(), REF.codenet.louvain.map((c) => [...c].sort()).sort());
same('Code network confidence: 48 segments, top pair in 9 at p < 0.001 → medium', NET.codenetConfidence(co, [...co.pairs].sort((a, b) => b.jaccard - a.jaccard)[0]), 'medium');
summary('Code network example', NET.codenetSummary(co, net, np_.codes), 'go together most', 'medium');
summary('Code network, no co-occurrence', NET.codenetSummary(NET.cooccurrence(NET.parseSegments('a: x\nb: y')), NET.network(NET.cooccurrence(NET.parseSegments('a: x\nb: y'))), ['x', 'y']), 'No two codes', 'low');

// ── Bass (scipy curve_fit) and SIR (scipy solve_ivp DOP853) ──
console.log('\nAdoption');
const bp = AD.parseCounts(INP.bass), bt = bp.rows.map((r) => r.t), by = bp.rows.map((r) => r.v);
AD.bassStart(bt, by).forEach((v, i) => nearRel(`Bass start value ${['p', 'q', 'm'][i]} (numpy lstsq)`, v, REF.bass.start[i], 1e-8));
const bf = AD.fitBass(bt, by);
nearRel('Bass p (curve_fit)', bf.p, REF.bass.p, 1e-6);
nearRel('Bass q', bf.q, REF.bass.q, 1e-6);
nearRel('Bass m', bf.m, REF.bass.m, 1e-6);
bf.se.forEach((v, i) => nearRel(`Bass standard error of ${['p', 'q', 'm'][i]} (curve_fit pcov)`, v, REF.bass.se[i], 1e-4));
nearRel('Bass SSE', bf.sse, REF.bass.sse, 1e-8);
nearRel('Bass R²', bf.r2, REF.bass.r2, 1e-9);
nearRel('Bass peak time ln(q/p)/(p+q)', bf.tPeak, REF.bass.tPeak, 1e-6);
nearRel('Bass peak rate m(p+q)²/4q', bf.peakRate, REF.bass.peakRate, 1e-6);
same('Bass cumulative input gives the same rows', AD.parseCounts('t, cum\n1, 5\n2, 12\n3, 20', true).rows.map((r) => r.v), [5, 7, 8]);
const bands = AD.bassBands(bf, 30);
truthy('Bass bands: the 95% range of m contains the estimate', bands.m.lo < bf.m && bands.m.hi > bf.m);
same('Bass confidence: data past the peak, SE of m 2% → high', AD.bassConfidence(bf, 16), 'high');
summary('Bass example', AD.bassSummary(bf, bp.rows, bands, 'week'), 'eventual adoption', 'high');
const early = AD.parseCounts(INP.bass.split('\n').slice(0, 8).join('\n')).rows, ef = AD.fitBass(early.map((r) => r.t), early.map((r) => r.v));
summary('Bass before the peak', AD.bassSummary(ef, early, AD.bassBands(ef, 30), 'week'), 'eventual adoption');
truthy('Bass before the peak is not high confidence', AD.bassConfidence(ef, 7) !== 'high');
const sr = AD.sir({ N: 10000, I0: 10, beta: 0.3, gamma: 0.1, days: 160 });
for (const [d, v] of Object.entries(REF.sir.at)) {
  const s = sr.series[+d];
  ['S', 'I', 'R'].forEach((k, i) => near(`SIR ${k} on day ${d} (solve_ivp)`, s[k], v[i], 1e-5 * 10000));
}
near('SIR peak day (0.02-day grid)', sr.peakT, REF.sir.peakT, 0.02);
nearRel('SIR peak number of spreaders', sr.peakI, REF.sir.peakI, 1e-7);
near('Final size, R0 = 3 (brentq)', AD.finalSize(3), REF.sir.finalSize3, 1e-12);
near('Final size, R0 = 1.5', AD.finalSize(1.5), REF.sir.finalSize1_5, 1e-12);
summary('SIR', AD.sirSummary(sr, 10000), 'R₀ = 3.00', 'low');
summary('SIR below threshold', AD.sirSummary(AD.sir({ N: 1000, I0: 5, beta: 0.08, gamma: 0.1, days: 100 }), 1000), 'dies out', 'low');

// ── Journey forecast (numpy Beta sampling, 2,000,000 draws; scipy beta.ppf) ──
console.log('\nJourney forecast');
const jp = JR.parseSteps(INP.journey);
same('Journey parser: five steps', [jp.steps.length, jp.errors], [5, []]);
near('z0.90 (scipy)', JR.Z90, REF.journey.z90, 1e-8);
jp.steps.forEach((s, k) => near(`${s.name}: log-normal σ`, JR.lognormal(s).sigma, REF.journey.sigma[k], 1e-8));
const em = JR.exactMoments(jp.steps.map((s) => JR.posterior(s)));
nearRel('Exact mean of Π p (product of Beta means)', em.mean, REF.journey.mean, 1e-12);
nearRel('Exact SD of Π p', em.sd, REF.journey.sd, 1e-10);
const sim = JR.simulate(jp.steps, { draws: 20000 });
near('Simulated mean completion vs exact (±0.001)', sim.completion.mean, REF.journey.mean, 0.001);
near('Simulated 2.5th percentile vs numpy (±0.003)', sim.completion.lo, REF.journey.q['0.025'], 0.003);
near('Simulated median vs numpy (±0.002)', sim.completion.median, REF.journey.q['0.5'], 0.002);
near('Simulated 97.5th percentile vs numpy (±0.003)', sim.completion.hi, REF.journey.q['0.975'], 0.003);
sim.steps.forEach((s, k) => {
  near(`${s.name}: simulated gain vs exact (±0.0005)`, s.gain, REF.journey.gain[k], 0.0005);
  nearRel(`${s.name}: exact gain formula`, JR.exactGain(jp.steps.map((x) => JR.posterior(x)), k), REF.journey.gain[k], 1e-12);
  near(`${s.name}: P(best fix) vs numpy (±0.01)`, s.pBestFix, REF.journey.pBestFix[k], 0.01);
  near(`${s.name}: 2.5% Beta quantile (scipy beta.ppf)`, s.lo, REF.journey.betaQ[k][0], 1e-9);
  near(`${s.name}: 97.5% Beta quantile`, s.hi, REF.journey.betaQ[k][1], 1e-9);
});
for (const [k, key] of [['lo', '0.1'], ['median', '0.5'], ['hi', '0.9']]) near(`End-to-end time, ${key} quantile, within 2% of numpy`, sim.time[k] / REF.journey.time[key], 1, 0.02);
same('Journey confidence: 95% interval 9 points wide → high', JR.journeyConfidence(sim), 'high');
summary('Journey example', JR.journeySummary(sim, jp.steps), 'fix "Connect bank account" first', 'high');
const simC = JR.simulate(jp.steps, { draws: 4000, cohort: 500 });
truthy('Cohort: predictive interval brackets 500 × mean completion', simC.cohort.lo < 500 * em.mean && simC.cohort.hi > 500 * em.mean);
const small = JR.parseSteps('a, 8, 10\nb, 6, 8').steps;
summary('Journey with small samples and no times', JR.journeySummary(JR.simulate(small, { draws: 4000 }), small), 'complete all 2 steps', 'low');

// ── Nash equilibria (nashpy support enumeration) ──
console.log('\nNash equilibria');
const key = (e) => `${e[0].map((v) => v.toFixed(6)).join(',')}|${e[1].map((v) => v.toFixed(6)).join(',')}`.replace(/-0\.000000/g, '0.000000');
for (const [name, g] of Object.entries(REF.nash)) {
  const got = NA.supportEnumeration(g.A, g.B).map((e) => key([e.x, e.y])).sort(), se = g.eqs.map(key).sort(), ve = new Set(g.vert.map(key));
  const extra = got.filter((k) => !se.includes(k));
  if (!extra.length) same(`${name} (${g.A.length}×${g.A[0].length}): equilibria equal nashpy support_enumeration`, got, se);
  else {
    // Degenerate games: nashpy's support enumeration can drop an equilibrium on a floating-point tie; every extra one
    // must then be an extreme equilibrium found by nashpy's vertex enumeration.
    truthy(`${name} (${g.A.length}×${g.A[0].length}): every nashpy support_enumeration equilibrium found`, se.every((k) => got.includes(k)));
    truthy(`${name}: ${extra.length} extra equilibrium (${extra.join(' ; ')}) is in nashpy vertex_enumeration`, extra.every((k) => ve.has(k)));
    truthy(`${name}: flagged as degenerate`, NA.isDegenerate(g.A, g.B, NA.supportEnumeration(g.A, g.B)));
  }
}
for (const [id, g] of Object.entries(NA.EXAMPLES)) {
  const r = NA.analyse(g);
  same(`Example "${g.name}" uses the payoffs given to nashpy`, [g.A, g.B], [REF.nash[id].A, REF.nash[id].B]);
  summary(`Nash ${g.name}`, NA.nashSummary(r, g), r.eqs.length === 1 ? 'One Nash equilibrium' : 'Nash equilibria', r.eqs.length === 1 ? 'high' : 'medium');
}
same("Prisoner's dilemma: elimination leaves Defect / Defect", (() => { const e = NA.eliminate(NA.EXAMPLES.pd.A, NA.EXAMPLES.pd.B); return [e.rows, e.cols]; })(), [[1], [1]]);
same("Prisoner's dilemma: Cooperate / Cooperate is Pareto-better than the equilibrium", NA.analyse(NA.EXAMPLES.pd).pareto[0], [[0, 0]]);
{ const b = NA.bestResponse2x2(NA.EXAMPLES.bos.A, NA.EXAMPLES.bos.B); same('Battle of the sexes: indifference points q* = 0.4, p* = 0.6', [+b.qStar.toFixed(12), +b.pStar.toFixed(12)], [0.4, 0.6]); }
const deg = { rows: ['U', 'D'], cols: ['L', 'R'], A: [[1, 1], [0, 1]], B: [[1, 1], [1, 0]] };
same('Degenerate game (payoff ties) → low confidence', NA.nashConfidence(NA.analyse(deg)), 'low');
summary('Nash degenerate game', NA.nashSummary(NA.analyse(deg), deg), 'Nash', 'low');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
