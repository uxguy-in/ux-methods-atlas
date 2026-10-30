"""Reference values for the decision and risk tools (server/scripts/check-decisions.js).

Computed independently of the JavaScript with scipy, numpy, scikit-learn, statsmodels, pingouin and the krippendorff
package. Run:  python3 server/scripts/decisions-reference.py  (writes decisions-reference.json next to this file).
Inputs that are long datasets (the page's example forecasts, intervals and ratings) are read from
decisions-reference-input.json, which the check script also compares with the examples on the pages.
"""
import itertools
import json
import math
import os

import numpy as np
import pingouin as pg
import krippendorff
from scipy import integrate, stats, optimize
from sklearn.calibration import calibration_curve
from sklearn.metrics import brier_score_loss
from statsmodels.stats.proportion import proportion_confint

HERE = os.path.dirname(os.path.abspath(__file__))
INP = json.load(open(os.path.join(HERE, 'decisions-reference-input.json')))
OUT = {}
Z90 = stats.norm.ppf(0.95)


# ── Value of information (normal model) ──
def e_max(mu, s):
    """E[max_i X_i] for independent X_i ~ N(mu_i, s_i^2) (s_i may be 0), by numerical integration of
    E[max] = ∫ x d/dx Π F_i(x) dx, F_i the normal cdf (a step function when s_i = 0)."""
    fixed = [m for m, v in zip(mu, s) if v == 0]
    unc = [(m, v) for m, v in zip(mu, s) if v > 0]
    c = max(fixed) if fixed else -np.inf
    if not unc:
        return c
    def cdf(x):
        return np.prod([stats.norm.cdf(x, m, v) for m, v in unc])
    lo = min(m - 12 * v for m, v in unc)
    hi = max(m + 12 * v for m, v in unc)
    lo = max(lo, c) if np.isfinite(c) else lo
    # E[max] = lo + ∫_lo^∞ (1 − P(max ≤ x)) dx, with P(max ≤ x) = 0 below the fixed best c (when c > lo).
    if np.isfinite(c):
        base = c
        val, _ = integrate.quad(lambda x: 1 - cdf(x), c, hi, limit=400, epsabs=1e-10, epsrel=1e-12)
        return base + val
    val1, _ = integrate.quad(lambda x: 1 - cdf(x), 0, hi, limit=400, epsabs=1e-10, epsrel=1e-12) if hi > 0 else (0, 0)
    val2, _ = integrate.quad(lambda x: cdf(x), lo, 0, limit=400, epsabs=1e-10, epsrel=1e-12) if lo < 0 else (0, 0)
    return val1 - val2


def voi_case(options, V, n, sigma):
    mu = [V * o['mean'] - o['cost'] for o in options]
    s = [abs(V) * o['sd'] for o in options]
    def pre(o):
        if n <= 0 or o['sd'] <= 0:
            return 0.0
        v = o['sd'] ** 2
        return abs(V) * o['sd'] * math.sqrt(v / (v + sigma ** 2 / n))
    sp = [pre(o) for o in options]
    best = max(mu)
    return {'evpi': e_max(mu, s) - best, 'evsi': e_max(mu, sp) - best, 'mu': mu, 's': s, 'spre': sp}


def ex_opt(lo, hi, cost, name):
    return {'name': name, 'mean': (lo + hi) / 2, 'sd': abs(hi - lo) / (2 * Z90), 'cost': cost}


cases = {
    'checkout': {'options': [ex_opt(3.0, 3.0, 0, 'Keep'), ex_opt(2.52, 3.68, 60000, 'One-page')], 'V': 400000, 'n': 4000, 'sigma': 17.3},
    'two_uncertain': {'options': [{'name': 'A', 'mean': 10, 'sd': 3, 'cost': 0}, {'name': 'B', 'mean': 11, 'sd': 4, 'cost': 0}], 'V': 1, 'n': 20, 'sigma': 12},
    'three_one_uncertain': {'options': [{'name': 'A', 'mean': 5, 'sd': 0, 'cost': 0}, {'name': 'B', 'mean': 4, 'sd': 0, 'cost': 0}, {'name': 'C', 'mean': 4.6, 'sd': 1.5, 'cost': 0}], 'V': 1, 'n': 10, 'sigma': 5},
    'three_uncertain': {'options': [ex_opt(3.0, 3.0, 0, 'Keep'), ex_opt(2.52, 3.68, 60000, 'One-page'), {'name': 'Express', 'mean': 3.15, 'sd': 0.4, 'cost': 90000}], 'V': 400000, 'n': 4000, 'sigma': 17.3},
}
OUT['voi'] = {}
for k, c in cases.items():
    r = voi_case(c['options'], c['V'], c['n'], c['sigma'])
    OUT['voi'][k] = {'input': c, **r}
# Two-option closed forms for the checkout case: P(study changes the decision) = Φ(−|M|/S_pre).
r = OUT['voi']['checkout']
M = r['mu'][0] - r['mu'][1]
OUT['voi']['checkout']['pChange'] = stats.norm.cdf(-abs(M) / math.hypot(*r['spre']))
# numpy Monte Carlo of the three-uncertain case (a third, simulation-based check).
rng = np.random.default_rng(2026)
r3 = OUT['voi']['three_uncertain']
Z = rng.standard_normal((2_000_000, 3))
OUT['voi']['three_uncertain']['evpi_mc'] = float(np.mean(np.max(np.array(r3['mu']) + Z * np.array(r3['s']), axis=1)) - max(r3['mu']))

# Discrete scenarios: Hillier and Lieberman's Goferbroke example and the page's example (numpy).
def voi_discrete(p, U, L):
    p = np.array(p, float); U = np.array(U, float); L = np.array(L, float)
    eu = U @ p
    ev_perfect = float(np.sum(p * U.max(axis=0)))
    joint = L * p  # results × scenarios
    pr = joint.sum(axis=1)
    post = joint / pr[:, None]
    ev_sample = float(np.sum(pr * (post @ U.T).max(axis=1)))
    return {'evpi': ev_perfect - eu.max(), 'evsi': ev_sample - eu.max(), 'evNo': float(eu.max()), 'pr': pr.tolist()}

OUT['discrete'] = {
    'goferbroke': voi_discrete([0.25, 0.75], [[700, -100], [90, 90]], [[0.6, 0.2], [0.4, 0.8]]),
    'onboarding': voi_discrete([0.3, 0.4, 0.3], [[500, 150, -250], [200, 120, -40], [0, 0, 0]], [[0.7, 0.25, 0.1], [0.2, 0.5, 0.3], [0.1, 0.25, 0.6]]),
}


# ── Decision tree: the page's example rolled back independently ──
def tree_values(P):
    big, small, build, p_big, p_fix, test = P['big'], P['small'], P['build'], P['p_big'], P['p_fix'], P['test']
    full = p_big * big + 0.45 * small + (1 - p_big - 0.45) * 0 - build
    quick = p_fix * small * 0.6 - 30
    strong = max(0.55 * big + 0.35 * small - build, small * 0.6 * 0.7 - 30)
    weak = max(0.13 * big + 0.52 * small - build, small * 0.6 * 0.55 - 30, 0)
    testv = 0.4 * strong + 0.6 * weak - test
    return {'Full redesign': full, 'Quick fixes': quick, 'Test first, then decide': testv, 'Do nothing': 0.0}

base = {'p_big': 0.3, 'big': 600, 'small': 180, 'build': 150, 'p_fix': 0.6, 'test': 25}
ranges = {'p_big': (0.15, 0.45), 'big': (400, 900), 'small': (100, 260), 'build': (110, 220), 'p_fix': (0.4, 0.8), 'test': (15, 40)}
tv = tree_values(base)
torn = {}
for k, (lo, hi) in ranges.items():
    torn[k] = [max(tree_values({**base, k: lo}).values()), max(tree_values({**base, k: hi}).values())]
def gap(k):
    def f(x):
        v = tree_values({**base, k: x})
        return v['Full redesign'] - v['Test first, then decide']
    return f
OUT['tree'] = {
    'root': tv, 'tornado': torn,
    'breakEven': {'p_big': optimize.brentq(gap('p_big'), *ranges['p_big'], xtol=1e-12), 'build': optimize.brentq(gap('build'), *ranges['build'], xtol=1e-12)},
    'goferbroke': {'survey': 0.3 * max(0.5 * 700 - 0.5 * 100, 90) + 0.7 * max(700 / 7 - 600 / 7, 90) - 30, 'noSurvey': max(0.25 * 700 - 0.75 * 100, 90)},
}


# ── Forecast calibration (scikit-learn and numpy) ──
def parse_forecasts(text):
    rows = []
    for line in text.strip().split('\n')[1:]:
        w, p, o = [x.strip() for x in line.split(',')]
        rows.append((w, float(p), int(o)))
    return rows

fr = parse_forecasts(INP['forecasts'])
y = np.array([o for _, _, o in fr]); p = np.array([q for _, q, _ in fr])
def murphy(y, p):
    N = len(y); base = y.mean()
    rel = res = 0.0
    for v in np.unique(p):
        m = p == v
        rel += m.sum() * (v - y[m].mean()) ** 2
        res += m.sum() * (y[m].mean() - base) ** 2
    return {'bs': float(brier_score_loss(y, p)), 'rel': rel / N, 'res': res / N, 'unc': base * (1 - base)}
prob_true, prob_pred = calibration_curve(y, p, n_bins=10, strategy='uniform')
OUT['forecast'] = {
    'all': murphy(y, p),
    'per': {w: murphy(np.array([o for ww, _, o in fr if ww == w]), np.array([q for ww, q, _ in fr if ww == w])) for w in sorted({w for w, _, _ in fr})},
    'curve10': {'prob_true': prob_true.tolist(), 'prob_pred': prob_pred.tolist()},
}
iv = [line.split(',') for line in INP['intervals'].strip().split('\n')[1:]]
hits = sum(1 for r in iv if float(r[1]) <= float(r[3]) <= float(r[2]))
lo, hi = proportion_confint(hits, len(iv), alpha=0.05, method='beta')
OUT['intervals'] = {'n': len(iv), 'hits': hits, 'p': stats.binomtest(hits, len(iv), 0.9, alternative='less').pvalue, 'lo': lo, 'hi': hi,
                    'p_3_of_20': stats.binomtest(3, 20, 0.9, alternative='less').pvalue}


# ── Severity ratings: pingouin ICC, krippendorff alpha, exact evaluator curve ──
def ratings_matrix(text):
    lines = text.strip().split('\n')[1:]
    return [[int(v) for v in l.split(',')[1:]] for l in lines]

R = np.array(ratings_matrix(INP['severity']))
long = [{'p': i, 'r': j, 'v': R[i, j]} for i in range(R.shape[0]) for j in range(R.shape[1])]
import pandas as pd
icc = pg.intraclass_corr(data=pd.DataFrame(long), targets='p', raters='r', ratings='v').set_index('Type')
ifp = [[np.prod([int(x) for x in c.strip().split('/')]) for c in l.split(',')[1:]] for l in INP['severityIfp'].strip().split('\n')[1:]]
OUT['severity'] = {
    'icc21': float(icc.loc['ICC(A,1)', 'ICC']), 'icc2k': float(icc.loc['ICC(A,k)', 'ICC']),
    'alpha_ordinal': float(krippendorff.alpha(reliability_data=R.T.astype(float), level_of_measurement='ordinal')),
    'means': R.mean(axis=1).tolist(),
    'ifp_alpha_ordinal': float(krippendorff.alpha(reliability_data=np.array(ifp, float).T, level_of_measurement='ordinal')),
    'ifp_means': np.array(ifp, float).mean(axis=1).tolist(),
}
# Krippendorff (2011) reference data with missing values (published nominal 0.743, ordinal 0.815).
kd = [[1, 1, None, 1], [2, 2, 3, 2], [3, 3, 3, 3], [3, 3, 3, 3], [2, 2, 2, 2], [1, 2, 3, 4], [4, 4, 4, 4], [1, 1, 2, 1], [2, 2, 2, 2], [None, 5, 5, 5], [None, None, 1, 1], [None, 3, None, None]]
OUT['severity']['kripp2011_ordinal'] = float(krippendorff.alpha(reliability_data=np.array([[np.nan if v is None else v for v in r] for r in kd], float).T, level_of_measurement='ordinal'))

D = np.array([[int(v) for v in l.split(',')[1:]] for l in INP['detection'].strip().split('\n')[1:]])
D = D[D.sum(axis=1) > 0]
m = D.shape[1]
curve = []
for i in range(1, m + 1):
    vals = [D[:, list(g)].max(axis=1).mean() for g in itertools.combinations(range(m), i)]
    curve.append(float(np.mean(vals)))
OUT['evaluators'] = {'lambda': float(D.mean()), 'curve': curve, 'P': int(D.shape[0]), 'm': int(m), 'once': int((D.sum(axis=1) == 1).sum())}


# ── Human reliability: hand arithmetic ──
heart = 0.003
for mx, apoa in [(3, 0.4), (6, 1.0), (4, 0.8), (2.5, 0.8), (1.2, 0.6)]:
    heart *= (mx - 1) * apoa + 1
def spar(nhep, mults):
    comp = float(np.prod(mults)); neg = sum(1 for x in mults if x > 1)
    return nhep * comp / (nhep * (comp - 1) + 1) if neg >= 3 else min(1.0, nhep * comp)
pump = spar(0.001, [1, 2, 2, 1, 5, 10, 1, 1])
diag2 = spar(0.01, [10, 2, 1, 1, 1, 1, 1, 1])
diag3 = spar(0.01, [10, 2, 2, 1, 1, 1, 1, 1])
OUT['hra'] = {'heart_example': heart, 'sparh_pump_action': pump, 'sparh_diag_two_negative': diag2, 'sparh_diag_three_negative': diag3,
              'combined': diag3 + pump - diag3 * pump, 'dep': {'low': (1 + 19 * pump) / 20, 'moderate': (1 + 6 * pump) / 7, 'high': (1 + pump) / 2}}


# ── Colour: WCAG ratios and CIELAB from an independent implementation ──
def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lum(h):
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
pairs = [('#777777', '#ffffff'), ('#767676', '#ffffff'), ('#000000', '#ffffff'), ('#2a6fdb', '#ffffff'), ('#12a594', '#1b1f24'), ('#f5a524', '#ffffff'), ('#d93025', '#eef2f6'), ('#595959', '#ffffff')]
OUT['wcag'] = [[a, b, ratio(a, b)] for a, b in pairs]
def lab(h):
    rgb = [lin(int(h[i:i + 2], 16)) for i in (1, 3, 5)]
    Mx = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]])
    xyz = Mx @ np.array(rgb) / np.array([0.95047, 1, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])]
OUT['lab'] = {h: lab(h) for h in ['#2a6fdb', '#12a594', '#f5a524', '#d93025', '#777777']}

json.dump(OUT, open(os.path.join(HERE, 'decisions-reference.json'), 'w'), indent=1, default=float)
print('wrote decisions-reference.json')
