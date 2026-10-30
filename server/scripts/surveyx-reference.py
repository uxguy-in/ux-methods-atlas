"""Reference values for the surveyx tools (server/scripts/check-surveyx.js).

Computed independently of the JavaScript with scipy, numpy and statsmodels. Run:
  node server/scripts/surveyx-dump.js        (writes the page examples to surveyx-reference-input.json)
  python3 server/scripts/surveyx-reference.py (writes surveyx-reference.json next to this file)
"""
import json
import math
import os

import numpy as np
import statsmodels.api as sm
from scipy import stats
from statsmodels.stats.proportion import proportion_confint, confint_proportions_2indep

HERE = os.path.dirname(os.path.abspath(__file__))
INP = json.load(open(os.path.join(HERE, 'surveyx-reference-input.json')))
OUT = {}


def table(text):
    lines = [l for l in text.split('\n') if l.strip()]
    head = [c.strip() for c in lines[0].split(',')]
    return head, [[c.strip() for c in l.split(',')] for l in lines[1:]]


def welch(a, b):
    """mean(a) - mean(b) with Welch's t test and 95% CI."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    t = stats.ttest_ind(a, b, equal_var=False)
    ci = t.confidence_interval(0.95)
    return {'d': a.mean() - b.mean(), 't': float(t.statistic), 'p': float(t.pvalue), 'df': float(t.df), 'lo': float(ci.low), 'hi': float(ci.high)}


# ── AAPOR outcome rates (Standard Definitions, 10th edition, 2023) ──
d = INP['disp']
I, P, R, NC, O, U, NE = d['I'], d['P'], d['R'], d['NC'], d['O'], d['UH'] + d['UO'], d['NE']
e = (I + P + R + NC + O) / (I + P + R + NC + O + NE)
OUT['aapor'] = {
    'e': e,
    'RR1': I / (I + P + R + NC + O + U), 'RR2': (I + P) / (I + P + R + NC + O + U),
    'RR3': I / (I + P + R + NC + O + e * U), 'RR4': (I + P) / (I + P + R + NC + O + e * U),
    'RR5': I / (I + P + R + NC + O), 'RR6': (I + P) / (I + P + R + NC + O),
    'COOP1': I / (I + P + R + O), 'COOP2': (I + P) / (I + P + R + O), 'COOP3': I / (I + P + R), 'COOP4': (I + P) / (I + P + R),
    'REF1': R / (I + P + R + NC + O + U), 'REF2': R / (I + P + R + NC + O + e * U), 'REF3': R / (I + P + R + NC + O),
    'CON1': (I + P + R + O) / (I + P + R + O + NC + U), 'CON2': (I + P + R + O) / (I + P + R + O + NC + e * U), 'CON3': (I + P + R + O) / (I + P + R + O + NC),
}

# ── Early vs late and wave trends ──
head, rows = table(INP['waves'])
W = np.array([[float(c) for c in r] for r in rows])
wave = W[:, 0]
el = {}
for j in (2, 3, 4):
    y = W[:, j]
    first, last = y[wave == wave.min()], y[wave == wave.max()]
    lr = stats.linregress(wave, y)
    nW = int(wave.max())
    extrap = min(max(lr.intercept + lr.slope * (nW + 1), y.min()), y.max())
    nr = 1500
    el[head[j]] = {'welch': welch(last, first), 'slope': lr.slope, 'slopeP': lr.pvalue, 'extrap': extrap,
                   'waveMeans': [float(y[wave == w].mean()) for w in range(1, nW + 1)],
                   'adjusted1500': (y.mean() * len(y) + extrap * nr) / (len(y) + nr)}
# Median split on days to respond (numpy's default quantile).
days = W[:, 1]
m = np.quantile(days, 0.5)
el['medianSplitSatisfaction'] = welch(W[days > m, 2], W[days <= m, 2])
OUT['earlyLate'] = el

# ── R-indicator: logistic response propensities on frame variables (statsmodels) ──
head, rows = table(INP['frame'])
y = np.array([int(r[1]) for r in rows])
cols = [2, 3, 4, 5]
parts = [np.ones(len(rows))]
for j in cols:
    vals = [r[j] for r in rows]
    try:
        parts.append(np.array([float(v) for v in vals]))
    except ValueError:
        levels = sorted(set(vals), key=lambda l: (-vals.count(l), l))
        for l in levels[1:]:
            parts.append(np.array([1.0 if v == l else 0.0 for v in vals]))
X = np.column_stack(parts)
fit = sm.Logit(y, X).fit(disp=0, tol=1e-12, maxiter=100)
rho = fit.predict(X)
S = rho.std(ddof=1)
partial = {}
for j in cols:
    vals = [r[j] for r in rows]
    try:
        v = np.array([float(x) for x in vals])
        q = np.quantile(v, [0.25, 0.5, 0.75])
        g = np.array([int((x > q).sum()) for x in v])
    except ValueError:
        g = np.array(vals)
    pu2 = sum((g == k).mean() * (rho[g == k].mean() - rho.mean()) ** 2 for k in np.unique(g))
    partial[head[j]] = math.sqrt(pu2)
OUT['rindicator'] = {'R': 1 - 2 * S, 'S': S, 'mean': rho.mean(), 'cv': S / rho.mean(), 'beta': fit.params.tolist(), 'partial': partial, 'n': len(y), 'nResp': int(y.sum())}

# ── List experiment (difference in means; Blair and Imai 2012 joint proportions) ──
L = INP['list']
ctrl = np.repeat(np.arange(len(L['control'])), L['control'])
trt = np.repeat(np.arange(len(L['treat'])), L['treat'])
w = welch(trt, ctrl)
J = len(L['control']) - 1
Fc = np.cumsum(L['control']) / ctrl.size
Ft = np.cumsum(L['treat']) / trt.size
at = lambda F, k: 0.0 if k < 0 else (1.0 if k >= len(F) else F[k])
pis, ps = [], []
for k in range(J + 1):
    p1 = at(Fc, k) - at(Ft, k)
    s1 = math.sqrt(at(Fc, k) * (1 - at(Fc, k)) / ctrl.size + at(Ft, k) * (1 - at(Ft, k)) / trt.size)
    p0 = at(Ft, k) - at(Fc, k - 1)
    s0 = math.sqrt(at(Ft, k) * (1 - at(Ft, k)) / trt.size + at(Fc, k - 1) * (1 - at(Fc, k - 1)) / ctrl.size)
    pis += [p1, p0]
    ps += [stats.norm.cdf(p1 / s1), stats.norm.cdf(p0 / s0)]
OUT['list'] = {'est': w['d'], 'se': math.sqrt(trt.var(ddof=1) / trt.size + ctrl.var(ddof=1) / ctrl.size), 'df': w['df'], 'lo': w['lo'], 'hi': w['hi'], 'p': w['p'],
               'pis': pis, 'deP': min(1.0, min(ps) * len(ps))}
pd = L['direct']['x'] / L['direct']['n']
OUT['list']['directGap'] = w['d'] - pd

# ── Randomised response ──
rr = INP['rr']
lam = rr['yes'] / rr['n']
p0 = 1 - rr['pYes'] - rr['pNo']
OUT['rrForced'] = {'est': (lam - rr['pYes']) / p0, 'se': math.sqrt(lam * (1 - lam) / (rr['n'] * p0 ** 2))}
# Warner (1965) on a textbook case: p = 0.7, 380 of 1,000 say yes. Also by direct maximum likelihood.
lam_w, pw, nw = 380 / 1000, 0.7, 1000
OUT['rrWarner'] = {'est': (lam_w - (1 - pw)) / (2 * pw - 1), 'se': math.sqrt(lam_w * (1 - lam_w) / (nw * (2 * pw - 1) ** 2))}

# ── Paired comparisons ──
head, rows = table(INP['pairs'])
names = [r[0] for r in rows]
k = len(names)
Wm = np.array([[float(c) for c in r[1:]] for r in rows])
# Thurstone Case V by least squares on the normal deviates of the clipped proportions (numpy lstsq, sum-to-zero).
A, b = [], []
for i in range(k):
    for j in range(k):
        if i < j and Wm[i, j] + Wm[j, i] > 0:
            pij = Wm[i, j] / (Wm[i, j] + Wm[j, i])
            row = np.zeros(k); row[i] = 1; row[j] = -1
            A.append(row); b.append(stats.norm.ppf(min(0.98, max(0.02, pij))))
A.append(np.ones(k)); b.append(0.0)
s = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)[0]
OUT['thurstone'] = {'s': s.tolist(), 'scale': (s - s.min()).tolist()}
# Bradley-Terry as a binomial GLM on the pairs (statsmodels), item 1 as reference.
Xbt, yb = [], []
for i in range(k):
    for j in range(i + 1, k):
        n = Wm[i, j] + Wm[j, i]
        if n:
            row = np.zeros(k); row[i] = 1; row[j] = -1
            Xbt.append(row[1:]); yb.append([Wm[i, j], Wm[j, i]])
glm = sm.GLM(np.array(yb), np.array(Xbt), family=sm.families.Binomial()).fit(tol=1e-13)
betaRef = np.concatenate([[0.0], glm.params])
cov = np.zeros((k, k)); cov[1:, 1:] = glm.cov_params()
M = np.eye(k) - 1 / k
covC = M @ cov @ M.T
bc = betaRef - betaRef.mean()
OUT['bt'] = {'betaRef': betaRef.tolist(), 'seRef': [0.0] + glm.bse.tolist(), 'beta': bc.tolist(), 'se': np.sqrt(np.diag(covC)).tolist(),
             'worth': (np.exp(bc) / np.exp(bc).sum()).tolist(), 'dev': glm.deviance, 'df': int(glm.df_resid),
             'p12': 1 / (1 + math.exp(bc[1] - bc[0]))}
# Guttman: Goodenough-Edwards errors against the ideal pattern for each total score; Loevinger's H as the ratio of
# summed item covariances to their maxima given the marginals (Mokken 1971), a different route to the same value.
head, rows = table(INP['guttman'])
G = np.array([[int(c) for c in r[1:]] for r in rows])
n, kk = G.shape
p = G.mean(axis=0)
order = sorted(range(kk), key=lambda j: (-p[j], j))
errs = 0
for r in G:
    sc = r.sum()
    ideal = np.array([1 if pos < sc else 0 for pos in range(kk)])
    errs += int((r[order] != ideal).sum())
CR = 1 - errs / (n * kk)
MMR = float(np.mean(np.maximum(p, 1 - p)))
C = np.cov(G.T, ddof=0)
num = den = 0.0
hj_num, hj_den = np.zeros(kk), np.zeros(kk)
for i in range(kk):
    for j in range(i + 1, kk):
        cmax = min(p[i], p[j]) - p[i] * p[j]
        num += C[i, j]; den += cmax
        hj_num[i] += C[i, j]; hj_num[j] += C[i, j]; hj_den[i] += cmax; hj_den[j] += cmax
OUT['guttman'] = {'errors': errs, 'CR': CR, 'MMR': MMR, 'CS': (CR - MMR) / (1 - MMR), 'H': num / den, 'Hj': (hj_num / hj_den).tolist(), 'p': p.tolist()}

# ── Importance-performance ──
head, rows = table(INP['stated'])
imp = np.array([float(r[1]) for r in rows]); perf = np.array([float(r[2]) for r in rows])
def quads(ci, cp):
    return [('keep' if pf >= cp else 'concentrate') if im >= ci else ('overkill' if pf >= cp else 'low') for im, pf in zip(imp, perf)]
OUT['ipaStated'] = {'meanI': imp.mean(), 'meanP': perf.mean(), 'medI': float(np.median(imp)), 'medP': float(np.median(perf)),
                    'quadsMean': quads(imp.mean(), perf.mean()), 'quadsMedian': quads(np.median(imp), np.median(perf))}
head, rows = table(INP['derived'])
D = np.array([[float(c) for c in r] for r in rows])
out = D[:, -1]
der = []
for j in range(D.shape[1] - 1):
    pr = stats.pearsonr(D[:, j], out)
    ci = pr.confidence_interval(0.95)
    der.append({'name': head[j], 'r': pr.statistic, 'p': pr.pvalue, 'lo': ci.low, 'hi': ci.high, 'rho': stats.spearmanr(D[:, j], out).statistic, 'mean': D[:, j].mean()})
OUT['ipaDerived'] = der
head, rows = table(INP['kap'])
kap = []
for r in rows:
    nn, kn, fa, pr_ = (int(x) for x in r[1:5])
    kap.append({'name': r[0], 'know': list(proportion_confint(kn, nn, method='wilson')), 'practise': list(proportion_confint(pr_, nn, method='wilson')),
                'dropAttitude': list(proportion_confint(kn - fa, nn, method='wilson'))})
OUT['kap'] = kap
head, rows = table(INP['aware'])
aw = []
for r in rows:
    nA, a_, nU, u_ = (int(x) for x in r[1:5])
    lo, hi = confint_proportions_2indep(u_, nU, a_, nA, method='newcomb', compare='diff')
    aw.append({'name': r[0], 'gap': u_ / nU - a_ / nA, 'lo': lo, 'hi': hi, 'awareLoHi': list(proportion_confint(a_, nA, method='wilson'))})
OUT['aware'] = aw

# ── Anchoring vignettes: King et al. (2004) C, with intervals for ties and misorderings (King and Wand 2007) ──
def c_value(yv, z):
    Jv = len(z)
    ok = []
    for c in range(1, 2 * Jv + 2):
        if c % 2 == 0:
            t = yv == z[c // 2 - 1]
        else:
            mm = (c - 1) // 2
            t = (mm == 0 or yv > z[mm - 1]) and (mm == Jv or yv < z[mm])
        if t:
            ok.append(c)
    return [min(ok), max(ok)]
head, rows = table(INP['vignettes'])
vg = {}
for r in rows:
    vg.setdefault(r[0], []).append(c_value(int(r[1]), [int(x) for x in r[2:]]) + [int(r[1])])
OUT['vignettes'] = {g: {'n': len(v), 'nScalar': sum(1 for c in v if c[0] == c[1]), 'meanC': float(np.mean([c[0] for c in v if c[0] == c[1]])),
                        'meanCmid': float(np.mean([(c[0] + c[1]) / 2 for c in v])), 'meanY': float(np.mean([c[2] for c in v])),
                        'dist': [float(sum((1 / (c[1] - c[0] + 1)) if c[0] <= kq <= c[1] else 0 for c in v) / len(v)) for kq in range(1, 8)]} for g, v in vg.items()}
# King and Wand's (2007) worked cases for J = 2 (their Table 1 logic): y vs (z1, z2).
OUT['vignetteCases'] = {f'{y_}|{a}|{b}': c_value(y_, [a, b]) for y_, a, b in [(1, 2, 3), (2, 2, 3), (3, 2, 4), (3, 3, 3), (2, 3, 3), (4, 3, 3), (3, 4, 2), (2, 4, 1), (5, 4, 2)]}

# ── Norms ──
xs = np.array(INP['normSample'], float)
M, SD, nN = xs.mean(), xs.std(ddof=1), len(xs)
norms = []
for x in [float(v) for v in INP['normScores'].split()]:
    z = (x - M) / SD
    below, eq = (xs < x).sum(), (xs == x).sum()
    pr = (below + eq / 2) / nN
    wl = proportion_confint(below + eq / 2, nN, method='wilson')
    norms.append({'x': x, 'z': z, 'T': 50 + 10 * z, 'prNormal': stats.norm.cdf(z), 'prEmp': pr, 'scipyMean': stats.percentileofscore(xs, x, kind='mean') / 100,
                  'empLo': wl[0], 'empHi': wl[1], 'zNorm': stats.norm.ppf(min(max(pr, 0.5 / nN), 1 - 0.5 / nN))})
OUT['normSample'] = {'M': M, 'SD': SD, 'skew': stats.skew(xs, bias=False), 'scores': norms}
# Crawford and Garthwaite (2002) interval for a percentile, inverting scipy's non-central t.
from scipy.optimize import brentq
def cg(z, n, conf=0.95):
    obs, df, a = z * math.sqrt(n), n - 1, (1 - conf) / 2
    lo = brentq(lambda dlt: stats.nct.cdf(obs, df, dlt) - (1 - a), obs - 8, obs + 8)
    hi = brentq(lambda dlt: stats.nct.cdf(obs, df, dlt) - a, obs - 8, obs + 8)
    return [stats.norm.cdf(lo / math.sqrt(n)), stats.norm.cdf(hi / math.sqrt(n))]
P_ = INP['normParams']
OUT['normParams'] = [{'x': float(x), 'z': (float(x) - P_['M']) / P_['SD'], 'ci': cg((float(x) - P_['M']) / P_['SD'], P_['n'])} for x in INP['normScores'].split()]
# A small norm group (n = 20, score 2 SD below the mean), where the interval is wide and asymmetric.
OUT['cgSmall'] = cg(-2.0, 20)
OUT['nct'] = [stats.nct.cdf(1.5, 9, 0.8), stats.nct.cdf(-3.0, 4, -1.2), stats.nct.cdf(40.0, 599, 38.0)]

json.dump(OUT, open(os.path.join(HERE, 'surveyx-reference.json'), 'w'), indent=1, default=float)
print('wrote surveyx-reference.json')
