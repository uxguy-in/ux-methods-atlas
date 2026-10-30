"""Reference values for the causal and experiment-design tools (server/scripts/check-causal.js).

Computed independently of the JavaScript with statsmodels 0.15, scipy, numpy and pyDOE3 1.6.2
(python3 -m pip install pyDOE3). Run:
    node server/scripts/causal-dump.js          # writes causal-reference-input.json from the pages' examples
    python3 server/scripts/causal-reference.py  # writes causal-reference.json
"""
import itertools
import json
import math
import os

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf
from scipy import stats, optimize
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.proportion import confint_proportions_2indep, proportions_ztest, power_proportions_2indep
from pyDOE3 import fracfact, fracfact_aliasing, pbdesign, get_orthogonal_array

HERE = os.path.dirname(os.path.abspath(__file__))
INP = json.load(open(os.path.join(HERE, 'causal-reference-input.json')))
OUT = {}


def fl(x):
    return [float(v) for v in x]


# ── Difference-in-differences: panel ──
df = pd.DataFrame(INP['panel'])
start = INP['start']
df['post'] = (df['period'] >= start).astype(int)
groups = pd.factorize(df['unit'])[0]
m = smf.ols('y ~ treat + post + treat:post', data=df).fit(cov_type='cluster', cov_kwds={'groups': groups}, use_t=True)
ci = m.conf_int(0.05)
OUT['did_panel'] = {'b': fl(m.params), 'se': fl(m.bse), 'p': fl(m.pvalues), 'lo': fl(ci[0]), 'hi': fl(ci[1]), 'df': float(m.df_resid_inference)}

periods = sorted(df['period'].unique())
pre = [p for p in periods if p < start]
ref = pre[-1]
others = [p for p in periods if p != ref]
X = pd.DataFrame({'const': 1.0, 'treat': df['treat'].astype(float)})
for p in periods[1:]:
    X[f'per{p}'] = (df['period'] == p).astype(float)
for p in others:
    X[f'tx{p}'] = ((df['period'] == p) & (df['treat'] == 1)).astype(float)
ev = sm.OLS(df['y'], X).fit(cov_type='cluster', cov_kwds={'groups': groups}, use_t=True)
eci = ev.conf_int(0.05)
OUT['did_event'] = {'periods': [int(p) for p in others], 'b': [float(ev.params[f'tx{p}']) for p in others], 'se': [float(ev.bse[f'tx{p}']) for p in others],
                    'lo': [float(eci.loc[f'tx{p}', 0]) for p in others], 'hi': [float(eci.loc[f'tx{p}', 1]) for p in others]}
R = np.zeros((len([p for p in others if p < start]), len(ev.params)))
for i, p in enumerate([p for p in others if p < start]):
    R[i, list(ev.params.index).index(f'tx{p}')] = 1
w = ev.wald_test(R, use_f=True, scalar=True)
OUT['did_prejoint'] = {'F': float(w.statistic), 'p': float(w.pvalue), 'df_num': float(w.df_num), 'df_denom': float(w.df_denom)}
prd = df[df['period'] < start].copy()
tr = smf.ols('y ~ treat + period + treat:period', data=prd).fit(cov_type='cluster', cov_kwds={'groups': pd.factorize(prd['unit'])[0]}, use_t=True)
OUT['did_trend'] = {'b': float(tr.params['treat:period']), 'se': float(tr.bse['treat:period']), 'p': float(tr.pvalues['treat:period'])}

# ── Difference-in-differences: 2×2 from individual data (four independent samples) ──
rs = np.random.default_rng(2026)
spec = {'t0': (14.2, 5.1, 180), 't1': (11.0, 4.6, 175), 'c0': (13.8, 5.3, 210), 'c1': (13.1, 5.0, 205)}
parts = []
for key, (mu, sd, n) in spec.items():
    parts.append(pd.DataFrame({'y': rs.normal(mu, sd, n), 'treat': int(key[0] == 't'), 'post': int(key[1] == '1')}))
d2 = pd.concat(parts, ignore_index=True)
cells = {}
for key in spec:
    s = d2[(d2.treat == int(key[0] == 't')) & (d2.post == int(key[1] == '1'))]['y']
    cells[key] = {'m': float(s.mean()), 's': float(s.std(ddof=1)), 'n': int(len(s))}
f2 = smf.ols('y ~ treat * post', data=d2).fit(cov_type='HC2')
v = {k: c['s'] ** 2 / c['n'] for k, c in cells.items()}
welch = sum(v.values()) ** 2 / sum(v[k] ** 2 / (cells[k]['n'] - 1) for k in v)
OUT['did_2x2'] = {'cells': cells, 'est': float(f2.params['treat:post']), 'se_hc2': float(f2.bse['treat:post']), 'welch_df': welch,
                  'p': float(2 * stats.t.sf(abs(f2.params['treat:post'] / f2.bse['treat:post']), welch)),
                  'lo': float(f2.params['treat:post'] - stats.t.ppf(0.975, welch) * f2.bse['treat:post'])}


# ── E-value (VanderWeele and Ding 2017), written from the paper's formulas ──
def ev_rr(rr):
    rr = 1 / rr if rr < 1 else rr
    return rr + math.sqrt(rr * (rr - 1))


def to_rr(kind, x, common):
    if kind == 'OR':
        return math.sqrt(x) if common else x
    if kind == 'HR':
        return (1 - 0.5 ** math.sqrt(x)) / (1 - 0.5 ** math.sqrt(1 / x)) if common else x
    return x


cases = []
for kind, est, lo, hi, common in [('RR', 3.9, 1.8, 8.7, False), ('RR', 0.8, 0.71, 0.91, False), ('OR', 2.5, 1.4, 4.3, True), ('OR', 1.6, 0.9, 2.8, False),
                                  ('HR', 0.68, 0.55, 0.84, True), ('HR', 1.9, 1.2, 3.0, False)]:
    r, l, h = to_rr(kind, est, common), to_rr(kind, lo, common), to_rr(kind, hi, common)
    near = l if r >= 1 else h
    inc = (near <= 1) if r >= 1 else (near >= 1)
    cases.append({'type': kind, 'est': est, 'lo': lo, 'hi': hi, 'common': common, 'rr': r, 'point': ev_rr(r), 'ci': 1.0 if inc else ev_rr(near)})
d, se = 0.45, 0.12
cases.append({'type': 'SMD', 'est': d, 'se': se, 'rr': math.exp(0.91 * d), 'point': ev_rr(math.exp(0.91 * d)), 'ci': ev_rr(math.exp(0.91 * d - 1.78 * se))})
# Non-null target (VanderWeele, Ding and Mathur 2019): RR 2.0 towards a true value of 1.2.
cases.append({'type': 'RR', 'est': 2.0, 'lo': 1.5, 'hi': 2.7, 'common': False, 'trueRR': 1.2, 'rr': 2.0, 'point': ev_rr(2.0 / 1.2), 'ci': ev_rr(1.5 / 1.2)})
OUT['evalue'] = cases
# Bias factor check: B(E, E) equals RR at the E-value.
E = ev_rr(3.9)
OUT['evalue_bias'] = {'E': E, 'B': E * E / (2 * E - 1)}


# ── Fractional factorials (pyDOE3) ──
def resolution(X):
    k = X.shape[1]
    for L in range(1, k + 1):
        for c in itertools.combinations(range(k), L):
            col = np.prod(X[:, c], axis=1)
            if np.all(col == col[0]):
                return L
    return None


des = []
for dsg in INP['designs']:
    X = fracfact(dsg['gen'])
    rows = sorted(tuple(int(v) for v in r) for r in X)
    item = {'k': dsg['k'], 'p': dsg['p'], 'rows': rows, 'resolution': resolution(X)}
    if dsg['k'] <= 8:
        amap, _ = fracfact_aliasing(X)
        item['classes'] = sorted(sorted(s.strip() for s in a.split('=')) for a in amap if '=' in a)
    des.append(item)
OUT['designs'] = des

# Orthogonal arrays as pyDOE3 stores them.
OUT['oa'] = {name: [''.join(str(int(v)) for v in r) for r in np.array(get_orthogonal_array(key))]
             for name, key in [('L18', 'L18(6^1 3^6)'), ('L32', 'L32(2^1 4^9)'), ('L36', 'L36(3^23)')]}
# Plackett-Burman from pyDOE3: X'X = N I for N = 8, 12, 16, 20, 24.
OUT['pb'] = {str(N): bool(np.allclose(pbdesign(N - 1).T @ pbdesign(N - 1), N * np.eye(N - 1))) for N in [8, 12, 16, 20, 24]}


# ── Effects and Lenth's method ──
def lenth(c, alpha=0.05):
    a = np.abs(np.asarray(c))
    m = len(a)
    s0 = 1.5 * np.median(a)
    pse = 1.5 * np.median(a[a < 2.5 * s0])
    dfl = m / 3
    gamma = (1 + (1 - alpha) ** (1 / m)) / 2
    return {'PSE': float(pse), 'ME': float(stats.t.ppf(1 - alpha / 2, dfl) * pse), 'SME': float(stats.t.ppf(gamma, dfl) * pse)}


y = np.array(INP['montgomery'], float)
base = np.array([[1 if (r >> j) & 1 else -1 for j in range(4)] for r in range(16)])
names, cols = [], []
for L in range(1, 5):
    for c in itertools.combinations(range(4), L):
        names.append(''.join('ABCD'[j] for j in c))
        cols.append(np.prod(base[:, c], axis=1))
Xm = np.column_stack([np.ones(16)] + cols)
coef = np.linalg.lstsq(Xm, y, rcond=None)[0]
eff = 2 * coef[1:]
OUT['montgomery'] = {'names': names, 'effects': fl(eff), 'lenth': lenth(eff)}

ux = pd.DataFrame(INP['ux']['rows'], columns=INP['ux']['names'])
fac = INP['ux']['names'][:-1]
code = np.column_stack([np.where(ux[f] == ux[f].iloc[0], -1, 1) for f in fac])
LET = 'ABCDE'
un, uc = [], []
for L in (1, 2):
    for c in itertools.combinations(range(5), L):
        un.append(''.join(LET[j] for j in c))
        uc.append(np.prod(code[:, c], axis=1))
fit = sm.OLS(ux[INP['ux']['names'][-1]].astype(float), sm.add_constant(np.column_stack(uc))).fit()
ue = 2 * np.asarray(fit.params)[1:]
OUT['ux_effects'] = {'names': un, 'effects': fl(ue), 'lenth': lenth(ue)}


# ── Bandit simulation (independent numpy implementation, exact Beta posterior draws) ──
def bandit(policy, p, T, batch, eps, sims, seed):
    g = np.random.default_rng(seed)
    p = np.asarray(p)
    K, best = len(p), p.max()
    nb = T // batch
    s = np.zeros((sims, K))
    n = np.zeros((sims, K))
    reg = np.zeros(sims)
    for b in range(nb):
        if policy == 'fixed':
            w = np.full((sims, K), 1 / K)
        else:
            w = np.zeros((sims, K))
            empty = (n == 0)
            has_empty = empty.any(axis=1)
            rate = np.where(n > 0, s / np.maximum(n, 1), 0)
            if policy == 'thompson':
                dr = g.beta(1 + s[:, None, :], 1 + n[:, None, :] - s[:, None, :], size=(sims, 64, K))
                am = dr.argmax(axis=2)
                for k in range(K):
                    w[:, k] = (am == k).mean(axis=1)
            elif policy == 'egreedy':
                noise = g.random((sims, K)) * 1e-12
                bk = (rate + noise).argmax(axis=1)
                w[:] = eps / K
                w[np.arange(sims), bk] += 1 - eps
            elif policy == 'ucb':
                t = b * batch
                ucb = rate + np.sqrt(2 * np.log(max(t, 1)) / np.maximum(n, 1))
                bk = (ucb + g.random((sims, K)) * 1e-12).argmax(axis=1)
                w[np.arange(sims), bk] = 1
            ew = empty / np.maximum(empty.sum(axis=1, keepdims=True), 1)
            w = np.where(has_empty[:, None], ew, w)
        c = g.multinomial(batch, w / w.sum(axis=1, keepdims=True))
        x = g.binomial(c, p)
        s += x
        n += c
        reg += (c * (best - p)).sum(axis=1)
    est = (1 + s) / (2 + n) if policy == 'thompson' else s / np.maximum(n, 1)
    pick = (est + g.random((sims, K)) * 1e-12).argmax(axis=1)
    correct = (p[pick] == best)
    share = n[:, p == best].sum(axis=1) / T
    return {'regret': float(reg.mean()), 'regretSe': float(reg.std(ddof=1) / math.sqrt(sims)), 'bestShare': float(share.mean()),
            'pCorrect': float(correct.mean()), 'pCorrectSe': float(math.sqrt(correct.mean() * (1 - correct.mean()) / sims))}


B = INP['bandit']
OUT['bandit'] = {pol: bandit(pol, B['p'], B['T'], B['batch'], B['eps'], 4000, 11 + i) for i, pol in enumerate(['fixed', 'thompson', 'egreedy', 'ucb'])}
OUT['bandit']['fixed_exact_regret'] = float(B['T'] * (max(B['p']) - np.mean(B['p'])))

# ── Brand lift (statsmodels) ──
bl = []
for q in INP['brand']:
    x1, n1, x0, n0 = q['x1'], q['n1'], q['x0'], q['n0']
    lo, hi = confint_proportions_2indep(x1, n1, x0, n0, method='newcomb', compare='diff', alpha=0.05)
    rlo, rhi = confint_proportions_2indep(x1, n1, x0, n0, method='log', compare='ratio', alpha=0.05)
    z, p = proportions_ztest([x1, x0], [n1, n0])
    bl.append({'name': q['name'], 'd': x1 / n1 - x0 / n0, 'lo': float(lo), 'hi': float(hi), 'rlo': float(rlo - 1), 'rhi': float(rhi - 1), 'z': float(z), 'p': float(p)})
holm = multipletests([b['p'] for b in bl], method='holm')[1]
for b, h in zip(bl, holm):
    b['pHolm'] = float(h)
OUT['brand'] = bl


def n_fleiss(p0, delta, alpha, power, k):
    p1 = p0 + delta
    za, zb = stats.norm.ppf(1 - alpha / 2), stats.norm.ppf(power)
    pb = (p1 + k * p0) / (1 + k)
    return (za * math.sqrt(pb * (1 - pb) * (1 + 1 / k)) + zb * math.sqrt(p1 * (1 - p1) + p0 * (1 - p0) / k)) ** 2 / delta ** 2


ss = []
for p0, delta, alpha, power, k, mq in [(0.25, 0.03, 0.05, 0.8, 1, 5), (0.10, 0.02, 0.05, 0.9, 2, 1), (0.6, 0.05, 0.10, 0.8, 0.5, 3)]:
    raw = n_fleiss(p0, delta, alpha / mq, power, k)
    n1 = math.ceil(raw - 1e-9)
    pw = power_proportions_2indep(delta, p0, n1, ratio=k, alpha=alpha / mq).power
    ss.append({'p0': p0, 'delta': delta, 'alpha': alpha, 'power': power, 'k': k, 'm': mq, 'raw': raw, 'n1': n1, 'achieved': float(pw)})
OUT['brand_n'] = ss


# ── Market sizing ──
Z95 = stats.norm.ppf(0.95)


def tri_params(lo, c, hi):
    """Min a and max b of a triangular distribution with mode c and 5th/95th percentiles lo and hi (scipy triang)."""
    def resid(v):
        a, b = v
        dist = stats.triang((c - a) / (b - a), loc=a, scale=b - a)
        return [dist.ppf(0.05) - lo, dist.ppf(0.95) - hi]
    w = hi - lo
    a, b = optimize.fsolve(resid, [lo - 0.3 * w, hi + 0.3 * w], xtol=1e-13)
    return float(a), float(b)


def sample(item, g, n):
    lo, hi = item['lo'], item['hi']
    cap = 1.0 if item['kind'] == 'share' else np.inf
    if item['dist'] == 'triangular':
        c = item['mode'] if item['mode'] is not None else (lo + hi) / 2
        a, b = tri_params(lo, c, hi)
        x = stats.triang((c - a) / (b - a), loc=a, scale=b - a).rvs(size=n, random_state=g)
        return np.clip(x, 1e-9 * hi, cap), (a, b)
    mu, sg = (math.log(lo) + math.log(hi)) / 2, (math.log(hi) - math.log(lo)) / (2 * Z95)
    return np.minimum(cap, np.exp(g.normal(mu, sg, n))), None


g = np.random.default_rng(99)
mk = []
tri = []
N = 2_000_000
for ch in INP['market']:
    acc = {'TAM': np.ones(N), 'SAM': np.ones(N), 'SOM': np.ones(N)}
    order = ['TAM', 'SAM', 'SOM']
    for it in ch['items']:
        x, ab = sample(it, g, N)
        if ab:
            tri.append({'lo': it['lo'], 'mode': it['mode'], 'hi': it['hi'], 'a': ab[0], 'b': ab[1]})
        for s in order[order.index(it['stage']):]:
            acc[s] *= x
    mk.append({'name': ch['name'], **{s: {'p05': float(np.quantile(acc[s], 0.05)), 'p50': float(np.quantile(acc[s], 0.5)), 'p95': float(np.quantile(acc[s], 0.95)), 'mean': float(acc[s].mean())} for s in order}})
OUT['market'] = mk
OUT['triangular'] = tri
# All-log-normal chain: the product is exactly log-normal.
ln = [(1000, 5000), (20, 80), (0.1, 0.3)]
mu = sum((math.log(a) + math.log(b)) / 2 for a, b in ln)
sg = math.sqrt(sum(((math.log(b) - math.log(a)) / (2 * Z95)) ** 2 for a, b in ln))
OUT['lognormal_chain'] = {'inputs': ln, 'p05': math.exp(mu - Z95 * sg), 'p50': math.exp(mu), 'p95': math.exp(mu + Z95 * sg), 'mean': math.exp(mu + sg * sg / 2)}

json.dump(OUT, open(os.path.join(HERE, 'causal-reference.json'), 'w'), indent=1)
print('wrote causal-reference.json')
