"""Reference values for the sensors tools (server/scripts/check-sensors.js).

Computed independently of the JavaScript with neurokit2, scipy, numpy, pandas, astropy, factor_analyzer, networkx,
the Levenshtein package and nashpy. Run:  python3 server/scripts/sensors-reference.py  (writes sensors-reference.json).
The example datasets are read from sensors-reference-input.json (written by sensors-make-examples.py), which the check
script also compares with the examples on the pages. All example data are synthetic.
"""
import itertools
import json
import math
import os
import re
import warnings

import numpy as np
import pandas as pd
import scipy
from scipy import ndimage, optimize, signal, stats, integrate
from scipy.special import logsumexp

warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
INP = json.load(open(os.path.join(HERE, 'sensors-reference-input.json')))
OUT = {'versions': {'numpy': np.__version__, 'scipy': scipy.__version__}}


def fl(x):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else float(x)


# ── HRV ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
import neurokit2 as nk
from astropy.timeseries import LombScargle
OUT['versions']['neurokit2'] = nk.__version__

segs = {}
for line in INP['hrv'].splitlines():
    name, vals = line.split(':')
    segs.setdefault(name.strip(), []).extend(float(v) for v in vals.split())


def artefacts(rr, lo=300, hi=2000, pct=0.2, half=5):
    rr = np.asarray(rr)
    rng_bad = (rr < lo) | (rr > hi)
    bad = np.zeros(len(rr), bool)
    for i in range(len(rr)):
        if rng_bad[i]:
            bad[i] = True
            continue
        idx = [j for j in range(max(0, i - half), min(len(rr), i + half + 1)) if j != i and not rng_bad[j]]
        if idx:
            m = np.median(rr[idx])
            bad[i] = abs(rr[i] - m) > pct * m
    return bad


FREQS = np.round(0.003 + 0.001 * np.arange(398), 3)
hrv_out = {}
for name, rr in segs.items():
    rr = np.asarray(rr)
    bad = artefacts(rr)
    good = np.where(~bad)[0]
    nn = rr.copy()
    nn[bad] = np.interp(np.where(bad)[0], good, rr[good])           # linear interpolation by beat index
    t = np.cumsum(rr) / 1000
    # neurokit2 time-domain and Poincaré indices from peaks at microsecond resolution
    peaks = np.concatenate([[0], np.round(np.cumsum(nn) * 1000).astype(np.int64)])
    td = nk.hrv_time(peaks, sampling_rate=1_000_000)
    nl = nk.hrv_nonlinear(peaks, sampling_rate=1_000_000)
    d = np.diff(nn)
    y = nn - nn.mean()
    P = signal.lombscargle(t, y, 2 * np.pi * FREQS)               # classic Lomb-Scargle periodogram
    Pa = LombScargle(t, y, fit_mean=False, center_data=True, normalization='psd').power(FREQS)
    S = 2 * P * (t[-1] - t[0]) / len(t)                             # one-sided density, ms²/Hz

    def band(lo, hi, incl=False):
        m = (FREQS >= lo - 1e-12) & ((FREQS <= hi + 1e-12) if incl else (FREQS < hi - 1e-12))
        return np.trapezoid(S[m], FREQS[m])
    lf, hf = band(0.04, 0.15), band(0.15, 0.4, True)
    fd = nk.hrv_frequency(peaks, sampling_rate=1_000_000, psd_method='lomb', normalize=False)
    hrv_out[name] = {
        'bad': [int(i) for i in np.where(bad)[0]],
        'nk_MeanNN': fl(td['HRV_MeanNN'][0]), 'nk_SDNN': fl(td['HRV_SDNN'][0]), 'nk_RMSSD': fl(td['HRV_RMSSD'][0]),
        'nk_pNN50': fl(td['HRV_pNN50'][0]), 'nk_SDSD': fl(td['HRV_SDSD'][0]), 'nk_SD1': fl(nl['HRV_SD1'][0]), 'nk_SD2': fl(nl['HRV_SD2'][0]),
        'np_meanHR': fl(np.mean(60000 / nn)), 'np_rmssd': fl(np.sqrt(np.mean(d ** 2))),
        'psd_scipy_at': {str(f): fl(S[i]) for i, f in enumerate(FREQS) if i % 50 == 0},
        'psd_astropy_ratio_max_dev': fl(np.max(np.abs(Pa / P - 1))),
        'lf': fl(lf), 'hf': fl(hf), 'vlf': fl(band(0.003, 0.04)), 'lfhf': fl(lf / hf),
        'nk_LFHF': fl(fd['HRV_LFHF'][0]), 'hfPeak': fl(FREQS[(FREQS >= 0.15) & (FREQS <= 0.4)][np.argmax(S[(FREQS >= 0.15) & (FREQS <= 0.4)])]),
        'var': fl(np.var(nn)),
    }
    # The 'delete' method: drop flagged beats; successive differences only between beats that were adjacent.
    keep = ~bad
    dd = np.array([rr[i] - rr[i - 1] for i in range(1, len(rr)) if keep[i] and keep[i - 1]])
    hrv_out[name]['del_rmssd'] = fl(np.sqrt(np.mean(dd ** 2)))
    hrv_out[name]['del_sdnn'] = fl(np.std(rr[keep], ddof=1))
    Pd = signal.lombscargle(t[keep], rr[keep] - rr[keep].mean(), 2 * np.pi * FREQS) * 2 * (t[keep][-1] - t[keep][0]) / keep.sum()
    mlf = (FREQS >= 0.04 - 1e-12) & (FREQS < 0.15 - 1e-12)
    mhf = (FREQS >= 0.15 - 1e-12) & (FREQS <= 0.4 + 1e-12)
    hrv_out[name]['del_lfhf'] = fl(np.trapezoid(Pd[mlf], FREQS[mlf]) / np.trapezoid(Pd[mhf], FREQS[mhf]))
# A pure sinusoid: the scaled periodogram integrates to its variance (A²/2).
ts = np.cumsum(np.full(600, 0.8))
ys = 30 * np.sin(2 * np.pi * 0.25 * ts)
Ss = signal.lombscargle(ts, ys - ys.mean(), 2 * np.pi * FREQS) * 2 * (ts[-1] - ts[0]) / len(ts)
hrv_out['sine'] = {'t': ts.tolist(), 'y': ys.tolist(), 'total': fl(np.trapezoid(Ss, FREQS)), 'var': fl(np.var(ys))}
OUT['hrv'] = hrv_out

# ── EDA ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
fs = INP['edaFs']
sc = np.array([float(v) for v in INP['eda'].split()])
kS = 3  # 0.75 s at 4 Hz, rounded to an odd number of samples
kM = 33  # 8 s at 4 Hz → 32, made odd
smooth = ndimage.uniform_filter1d(sc, size=kS, mode='nearest')
tonic = ndimage.median_filter(smooth, size=kM, mode='nearest')
phasic = smooth - tonic


def scrs(x, fs, thr=0.01, max_rise=5):
    W = round(max_rise * fs)
    minima = [0] if x[1] > x[0] else []
    out = []
    for i in range(1, len(x) - 1):
        if x[i] < x[i - 1] and x[i] <= x[i + 1]:
            minima.append(i)
        elif x[i] > x[i - 1] and x[i] >= x[i + 1]:
            cand = [j for j in minima if j >= i - W]
            if cand:
                on = min(cand, key=lambda j: (x[j], j))
                if x[i] - x[on] >= thr:
                    out.append([on, i, x[i] - x[on]])
                    minima = []
    res = []
    for k, (on, pk, amp) in enumerate(out):
        stop = out[k + 1][0] if k + 1 < len(out) else len(x) - 1
        half = x[pk] - amp / 2
        rec = None
        for j in range(pk + 1, stop + 1):
            if x[j] <= half:
                rec = (j - 1 + (x[j - 1] - half) / (x[j - 1] - x[j]) - pk) / fs
                break
        res.append({'onset': on, 'peak': pk, 'amp': amp, 'rise': (pk - on) / fs, 'recovery': rec})
    return res


found = scrs(phasic, fs)
fp, props = signal.find_peaks(phasic, prominence=0.01, wlen=round(10 * fs))
segdefs = [l.split(',') for l in INP['edaSegments'].splitlines()]
seg_out = []
for name, a, b in segdefs:
    a, b = float(a), float(b)
    ins = [r for r in found if a <= r['peak'] / fs < b]
    seg_out.append({'name': name.strip(), 'count': len(ins), 'rate': len(ins) / ((b - a) / 60), 'meanAmp': fl(np.mean([r['amp'] for r in ins])) if ins else None,
                     'scl': fl(np.mean(tonic[int(math.ceil(a * fs)):int(math.ceil(b * fs))]))})
OUT['eda'] = {'tonic_at': {str(i): fl(tonic[i]) for i in range(0, len(sc), 97)}, 'phasic_at': {str(i): fl(phasic[i]) for i in range(0, len(sc), 97)},
              'tonic_sum': fl(tonic.sum()), 'phasic_abs_sum': fl(np.abs(phasic).sum()), 'scrs': found, 'segments': seg_out,
              'find_peaks': [int(i) for i in fp]}

# ── Eye tracking ────────────────────────────────────────────────────────────────────────────────────────────────────
import Levenshtein
fx = pd.read_csv(pd.io.common.StringIO(INP['eyeFixations']), skipinitialspace=True)
aois = pd.read_csv(pd.io.common.StringIO(INP['eyeAois']), skipinitialspace=True)


def which(x, y):
    for k, a in aois.iterrows():
        if a.x <= x <= a.x + a.width and a.y <= y <= a.y + a.height:
            return k
    return -1


fx['aoi'] = [which(x, y) for x, y in zip(fx.x, fx.y)]
fx['start'] = fx.groupby('participant').duration.cumsum() - fx.duration
fx['visit'] = (fx.aoi != fx.groupby('participant').aoi.shift()).astype(int)
people = list(dict.fromkeys(fx.participant))
eye = {'aoi': []}
total = fx.duration.sum()
for k, a in aois.iterrows():
    sub = fx[fx.aoi == k]
    per = sub.groupby('participant').agg(dwell=('duration', 'sum'), count=('duration', 'size'), ttff=('start', 'min'), visits=('visit', 'sum'))
    eye['aoi'].append({'name': a['name'], 'dwellShare': fl(sub.duration.sum() / total), 'hitRatio': fl(len(per) / len(people)),
                       'ttffMean': fl(per.ttff.mean()), 'countMean': fl(per['count'].sum() / len(people)), 'revisitsMean': fl((per.visits - 1).mean()),
                       'dwellMeanSeen': fl(per.dwell.mean())})
paths = {}
T = np.zeros((len(aois), len(aois)), int)
for p in people:
    seq = [a for a in fx[fx.participant == p].aoi if a >= 0]
    col = [a for i, a in enumerate(seq) if i == 0 or a != seq[i - 1]]
    for u, v in zip(col, col[1:]):
        T[u, v] += 1
    paths[p] = ''.join(chr(65 + a) for a in col)
S = np.array([[1 - Levenshtein.distance(paths[a], paths[b]) / max(len(paths[a]), len(paths[b]), 1) for b in people] for a in people])
iu = np.triu_indices(len(people), 1)
eye.update({'paths': [paths[p] for p in people], 'T': T.tolist(), 'S': S.tolist(), 'meanSim': fl(S[iu].mean()), 'outsideShare': fl(fx[fx.aoi < 0].duration.sum() / total)})
OUT['eye'] = eye

# ── Cultural consensus ──────────────────────────────────────────────────────────────────────────────────────────────
import factor_analyzer.factor_analyzer as _fa
from factor_analyzer import FactorAnalyzer
_check = _fa.check_array
# factor_analyzer 0.5 passes a keyword that newer scikit-learn renamed; translate it.
_fa.check_array = lambda X, **kw: _check(X, **{('ensure_all_finite' if k == 'force_all_finite' else k): v for k, v in kw.items()})
cl = [r.split(',') for r in INP['consensus'].splitlines()]
ans = np.array([[c.strip() for c in r[1:]] for r in cl[1:]], dtype=object)
n, q = ans.shape
L = 2
valid = ans != '.'
M = np.ones((n, n))
for i in range(n):
    for j in range(n):
        both = valid[i] & valid[j]
        M[i, j] = np.mean(ans[i, both] == ans[j, both])
Ms = (L * M - 1) / (L - 1)
np.fill_diagonal(Ms, 1)
fa = FactorAnalyzer(n_factors=1, method='minres', rotation=None, is_corr_matrix=True)
fa.fit(Ms)
load_fa = fa.loadings_[:, 0] * np.sign(fa.loadings_[:, 0].sum())
# Unbounded least squares on the off-diagonal cells, from the factor_analyzer start.
off = ~np.eye(n, dtype=bool)
ls = optimize.least_squares(lambda l: (Ms - np.outer(l, l))[off], load_fa, xtol=1e-15, ftol=1e-15, gtol=1e-15)
load = ls.x * np.sign(ls.x.sum())
R = Ms.copy()
np.fill_diagonal(R, load ** 2)
ev = np.sort(np.linalg.eigvalsh(R))[::-1]
D = np.clip(load, 0.001, 0.999)
key, post = [], []
for j in range(q):
    opts = sorted(set(ans[valid[:, j], j]))
    lp = []
    for o in opts:
        lp.append(sum(np.log(D[i] + (1 - D[i]) / L) if ans[i, j] == o else np.log((1 - D[i]) / L) for i in range(n) if valid[i, j]))
    none = sum(np.log((1 - D[i]) / L) for i in range(n) if valid[i, j])
    allp = lp + [none] * (L - len(opts))
    pr = np.exp(np.array(lp) - logsumexp(allp))
    key.append(opts[int(np.argmax(pr))])
    post.append(fl(pr.max()))
OUT['consensus'] = {'M01': fl(M[0, 1]), 'Ms01': fl(Ms[0, 1]), 'Ms_sum': fl(Ms.sum()), 'loadings_fa': load_fa.tolist(), 'loadings_ls': load.tolist(),
                    'eigen': ev[:3].tolist(), 'ratio': fl(ev[0] / ev[1]), 'key': key, 'post': post, 'meanD': fl(load.mean())}

# ── Code co-occurrence ──────────────────────────────────────────────────────────────────────────────────────────────
import networkx as nx
OUT['versions']['networkx'] = nx.__version__
segcodes = []
for line in INP['codenet'].splitlines():
    sid, codes = line.split(':', 1)
    cs = []
    for c in codes.split(','):
        c = re.sub(r'\s+', ' ', c.strip()).lower()
        if c and c not in cs:
            cs.append(c)
    segcodes.append(cs)
codes = list(dict.fromkeys(c for s in segcodes for c in s))
N = len(segcodes)
freq = {c: sum(c in s for s in segcodes) for c in codes}
pairs = []
for a, b in itertools.combinations(codes, 2):
    cnt = sum(a in s and b in s for s in segcodes)
    if cnt:
        pairs.append({'a': a, 'b': b, 'c': cnt, 'jaccard': cnt / (freq[a] + freq[b] - cnt), 'ochiai': cnt / math.sqrt(freq[a] * freq[b]),
                      'lift': cnt * N / (freq[a] * freq[b]), 'p': fl(stats.hypergeom.sf(cnt - 1, N, freq[a], freq[b]))})
G = nx.Graph()
G.add_nodes_from(codes)
for p in pairs:
    if p['c'] >= 2:
        G.add_edge(p['a'], p['b'], weight=p['jaccard'])
best = max((nx.community.louvain_communities(G, weight='weight', seed=s) for s in range(20)), key=lambda c: nx.community.modularity(G, c, weight='weight'))
greedy = nx.community.greedy_modularity_communities(G, weight='weight')
OUT['codenet'] = {'N': N, 'codes': codes, 'freq': freq, 'pairs': pairs, 'louvainQ': fl(nx.community.modularity(G, best, weight='weight')),
                  'louvain': [sorted(c) for c in best], 'greedyQ': fl(nx.community.modularity(G, greedy, weight='weight'))}

# ── Bass and SIR ────────────────────────────────────────────────────────────────────────────────────────────────────
bl = [r.split(',') for r in INP['bass'].splitlines()[1:]]
tt = np.array([float(r[0]) for r in bl])
yy = np.array([float(r[1]) for r in bl])


def F(t, p, q):
    return np.where(t <= 0, 0, (1 - np.exp(-(p + q) * t)) / (1 + (q / p) * np.exp(-(p + q) * t)))


def newad(t, p, q, m):
    return m * (F(t, p, q) - F(t - 1, p, q))


cum = np.concatenate([[0], np.cumsum(yy)[:-1]])
X = np.column_stack([np.ones_like(cum), cum, cum ** 2])
a, b, c = np.linalg.lstsq(X, yy, rcond=None)[0]
m0 = (-b - math.sqrt(b * b - 4 * a * c)) / (2 * c)
popt, pcov = optimize.curve_fit(newad, tt, yy, p0=[a / m0, -c * m0, m0], maxfev=20000, xtol=1e-14, ftol=1e-14)
p_, q_, m_ = popt
res = yy - newad(tt, *popt)
OUT['bass'] = {'start': [a / m0, -c * m0, m0], 'p': p_, 'q': q_, 'm': m_, 'se': np.sqrt(np.diag(pcov)).tolist(), 'sse': fl(res @ res),
               'r2': fl(1 - (res @ res) / np.sum((yy - yy.mean()) ** 2)), 'tPeak': math.log(q_ / p_) / (p_ + q_), 'peakRate': m_ * (p_ + q_) ** 2 / (4 * q_)}


def sir_rhs(t, z, beta, gamma, N):
    S, I, R = z
    return [-beta * S * I / N, beta * S * I / N - gamma * I, gamma * I]


Np, I0, beta, gamma = 10000, 10, 0.3, 0.1
sol = solve = integrate.solve_ivp(sir_rhs, [0, 160], [Np - I0, I0, 0], args=(beta, gamma, Np), method='DOP853', rtol=1e-12, atol=1e-9, dense_output=True)
days = [10, 38, 60, 160]
pk = optimize.minimize_scalar(lambda t: -sol.sol(t)[1], bounds=(20, 60), method='bounded', options={'xatol': 1e-10})
OUT['sir'] = {'at': {str(d): sol.sol(d).tolist() for d in days}, 'peakT': fl(pk.x), 'peakI': fl(-pk.fun),
              'finalSize3': optimize.brentq(lambda z: z - 1 + math.exp(-3 * z), 1e-6, 1), 'finalSize1_5': optimize.brentq(lambda z: z - 1 + math.exp(-1.5 * z), 1e-6, 1)}

# ── Journey forecast ────────────────────────────────────────────────────────────────────────────────────────────────
jl = [r.split(',') for r in INP['journey'].splitlines()[1:]]
steps = [{'s': int(r[1]), 'n': int(r[2]), 'median': float(r[3]), 'p90': float(r[4])} for r in jl]
z90 = stats.norm.ppf(0.9)
A = np.array([s['s'] + 1 for s in steps], float)
B = np.array([s['n'] - s['s'] + 1 for s in steps], float)
m1 = np.prod(A / (A + B))
m2 = np.prod(A * (A + 1) / ((A + B) * (A + B + 1)))
gen = np.random.default_rng(1)
D_ = 2_000_000
P = gen.beta(A, B, size=(D_, len(steps)))
prod = P.prod(1)
gains = prod[:, None] / P * (1 - P) / 2
mu = np.log([s['median'] for s in steps])
sg = (np.log([s['p90'] for s in steps]) - mu) / z90
tim = np.exp(mu + sg * gen.standard_normal((D_, len(steps)))).sum(1)
OUT['journey'] = {'z90': z90, 'mean': m1, 'sd': math.sqrt(m2 - m1 * m1), 'q': {str(x): fl(np.quantile(prod, x)) for x in (0.025, 0.5, 0.975)},
                  'gain': [fl(np.prod(np.delete(A / (A + B), k)) * (B[k] / (A[k] + B[k])) / 2) for k in range(len(steps))],
                  'pBestFix': np.bincount(gains.argmax(1), minlength=len(steps)) / D_,
                  'time': {str(x): fl(np.quantile(tim, x)) for x in (0.1, 0.5, 0.9)},
                  'betaQ': [[fl(stats.beta.ppf(0.025, a, b)), fl(stats.beta.ppf(0.975, a, b))] for a, b in zip(A, B)],
                  'sigma': sg.tolist()}
OUT['journey']['pBestFix'] = OUT['journey']['pBestFix'].tolist()

# ── Nash equilibria ─────────────────────────────────────────────────────────────────────────────────────────────────
import nashpy
OUT['versions']['nashpy'] = nashpy.__version__
games = {
    'pd': ([[3, 0], [5, 1]], [[3, 5], [0, 1]]), 'stag': ([[4, 0], [3, 3]], [[4, 3], [0, 3]]), 'bos': ([[3, 0], [0, 2]], [[2, 0], [0, 3]]),
    'pennies': ([[1, -1], [-1, 1]], [[-1, 1], [1, -1]]), 'chicken': ([[2, 1], [3, 0]], [[2, 3], [1, 0]]),
    'rps': ([[0, -1, 1], [1, 0, -1], [-1, 1, 0]], [[0, 1, -1], [-1, 0, 1], [1, -1, 0]]),
}
g = np.random.default_rng(7)
for name, (mm, nn_) in {'rand3x3': (3, 3), 'rand3x4': (3, 4), 'rand4x4': (4, 4), 'rand2x5': (2, 5)}.items():
    games[name] = (g.integers(-5, 10, (mm, nn_)).tolist(), g.integers(-5, 10, (mm, nn_)).tolist())
nash = {}
for name, (Am, Bm) in games.items():
    G_ = nashpy.Game(np.array(Am, float), np.array(Bm, float))
    eqs = list(G_.support_enumeration())
    # Vertex enumeration lists the extreme equilibria too, including ones in degenerate games that support
    # enumeration's floating-point best-response test can miss.
    vert = list(G_.vertex_enumeration())
    nash[name] = {'A': Am, 'B': Bm, 'eqs': [[e[0].tolist(), e[1].tolist()] for e in eqs], 'vert': [[e[0].tolist(), e[1].tolist()] for e in vert]}
OUT['nash'] = nash

with open(os.path.join(HERE, 'sensors-reference.json'), 'w') as f:
    json.dump(OUT, f, indent=1, default=lambda o: o.tolist() if hasattr(o, 'tolist') else float(o))
print('wrote sensors-reference.json')
