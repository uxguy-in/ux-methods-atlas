"""Independent reference values for the cogia tools (IA graph, IAT D-score, mouse-tracking, correspondence analysis,
tolerance intervals). Reads cogia-reference-input.json (written by cogia-dump.js from the pages' own examples) and
writes cogia-reference.json, which server/scripts/check-cogia.js compares with the JavaScript.

Libraries: networkx (graph measures), pandas (IAT D algorithm, re-implemented from Greenwald, Nosek and Banaji 2003,
Table 4), numpy/scipy (mouse-tracking measures, bimodality coefficient, paired t), prince and numpy SVD
(correspondence analysis), the toleranceinterval package, scipy and statsmodels (tolerance factors, order-statistic
limits, percentile intervals, Clopper-Pearson limits).

Run: python3 server/scripts/cogia-reference.py
"""
import json
import math
import os

import networkx as nx
import numpy as np
import pandas as pd
import prince
import toleranceinterval as ti
from scipy import stats
from statsmodels.stats.proportion import proportion_confint

HERE = os.path.dirname(os.path.abspath(__file__))
INP = json.load(open(os.path.join(HERE, 'cogia-reference-input.json')))
OUT = {}


def clean(v):
    if isinstance(v, (np.floating, float)):
        return None if not np.isfinite(v) else float(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, np.ndarray)):
        return [clean(x) for x in v]
    return v


# ── IA graph ──
def graph_ref(g):
    n = len(g['names'])
    G = nx.DiGraph()
    G.add_nodes_from(range(n))
    G.add_edges_from([tuple(e) for e in g['edges']])
    dist = nx.single_source_shortest_path_length(G, 0)
    depth = [dist.get(i) for i in range(n)]
    maxd = max(dist.values())
    levels = [sum(1 for d in dist.values() if d == k) for k in range(maxd + 1)]
    bet = nx.betweenness_centrality(G, normalized=True)
    clo = nx.closeness_centrality(G.reverse(), wf_improved=True)  # distances out from each page
    pr = nx.pagerank(G, alpha=0.85, tol=1e-14, max_iter=10000)
    U = G.to_undirected()
    md, rra, integ = [], [], []
    for s in range(n):
        d = nx.single_source_shortest_path_length(U, s)
        k = len(d)
        if k < 3:
            md.append(None); rra.append(None); integ.append(None); continue
        m = sum(d.values()) / (k - 1)
        ra = 2 * (m - 1) / (k - 2)
        dk = 2 * (k * (math.log2((k + 2) / 3) - 1) + 1) / ((k - 1) * (k - 2))
        md.append(m); rra.append(ra / dk); integ.append(dk / ra if ra > 0 else None)
    reach = [d for d in depth if d is not None]
    return {
        'depth': depth, 'levels': levels, 'maxDepth': maxd,
        'meanDepth': sum(reach) / (len(reach) - 1),
        'unreachable': [i for i in range(n) if depth[i] is None],
        'orphans': [i for i in range(1, n) if G.in_degree(i) == 0],
        'deadEnds': [i for i in range(n) if G.out_degree(i) == 0],
        'betweenness': [bet[i] for i in range(n)], 'closeness': [clo[i] for i in range(n)],
        'pagerank': [pr[i] for i in range(n)], 'md': md, 'rra': rra, 'integration': integ,
        'nEdges': G.number_of_edges(),
    }


OUT['graph'] = graph_ref(INP['graph'])
OUT['graphNav'] = graph_ref(INP['graphNav'])
# Hillier and Hanson's diamond values, from their formula, for a few k (also printed in their Table 4).
OUT['diamond'] = {str(k): 2 * (k * (math.log2((k + 2) / 3) - 1) + 1) / ((k - 1) * (k - 2)) for k in (5, 10, 25, 100)}

# ── IAT ──
iat = pd.DataFrame(INP['iat'], columns=['p', 'block', 'lat', 'err', 'order']).astype({'lat': float})
B = [3, 4, 6, 7]


def d_one(df, variant, drop400):
    t = df[df.lat <= 10000]
    if drop400:
        t = t[t.lat >= 400]
    by = {b: t[t.block == b] for b in B}
    if any(len(by[b]) < 2 for b in B):
        return None, None, None
    t = t.copy()
    if variant != 'builtin':
        for b in B:
            c = by[b][by[b].err == 0].lat
            if len(c) < 2:
                return None, None, None
            rep = c.mean() + (600 if variant == 'p600' else 2 * c.std(ddof=1))
            t.loc[(t.block == b) & (t.err == 1), 'lat'] = rep
    sd36 = df_sd(by, 3, 6)
    sd47 = df_sd(by, 4, 7)
    M = t.groupby('block').lat.mean()
    d36 = (M[6] - M[3]) / sd36
    d47 = (M[7] - M[4]) / sd47
    return (d36 + d47) / 2, d36, d47


def df_sd(by, a, b):
    return pd.concat([by[a].lat, by[b].lat]).std(ddof=1)  # inclusive SD of the original latencies


def iat_ref(variant, drop400):
    res = {}
    for pid, df in iat.groupby('p', sort=False):
        fast = (df.lat < 300).mean()
        if fast > 0.1:
            res[pid] = {'excluded': True}
            continue
        D, d36, d47 = d_one(df, variant, drop400)
        halves = []
        for h in (0, 1):
            part = pd.concat([df[df.block == b].sort_values('order', kind='stable').iloc[h::2] for b in B])
            halves.append(d_one(part, variant, drop400)[0])
        res[pid] = {'excluded': False, 'D': D, 'd36': d36, 'd47': d47, 'odd': halves[0], 'even': halves[1]}
    ok = [v for v in res.values() if not v['excluded'] and v['D'] is not None]
    Ds = np.array([v['D'] for v in ok])
    tt = stats.ttest_1samp(Ds, 0)
    ci = tt.confidence_interval(0.95)
    r = np.corrcoef([v['odd'] for v in ok], [v['even'] for v in ok])[0, 1]
    rp = np.corrcoef([v['d36'] for v in ok], [v['d47'] for v in ok])[0, 1]
    return {'people': res, 'mean': Ds.mean(), 'sd': Ds.std(ddof=1), 'lo': ci.low, 'hi': ci.high, 't': tt.statistic,
            'p': tt.pvalue, 'rHalf': r, 'sbHalf': 2 * r / (1 + r), 'rParts': rp, 'nOk': len(ok),
            'excluded': [k for k, v in res.items() if v['excluded']]}


OUT['iat'] = {f'{v}{"_400" if d4 else ""}': iat_ref(v, d4) for v in ('builtin', 'p600', 'p2sd') for d4 in (False, True)}

# ── Mouse-tracking ──
mt = []
for tr in INP['mouse']:
    t, x, y = np.array(tr['t'], float), np.array(tr['x'], float), np.array(tr['y'], float)
    x = x - x[0]
    y = -(y - y[0])
    if x[-1] < 0:
        x = -x
    e = np.array([x[-1], y[-1]]) / math.hypot(x[-1], y[-1])
    a = x * e[0] + y * e[1]
    d = -x * e[1] + y * e[0]
    i = int(np.argmax(np.abs(d)))
    auc = np.trapezoid(d, a)
    s = np.sign(np.diff(x))
    s = s[s != 0]
    flips = int(np.sum(s[1:] != s[:-1]))
    tn = np.linspace(t[0], t[-1], 101)
    mt.append({'participant': tr['participant'], 'condition': tr['condition'], 'mad': d[i], 'auc': auc, 'flips': flips,
               'rt': t[-1] - t[0], 'nx': np.interp(tn, t, x), 'ny': np.interp(tn, t, y)})
mdf = pd.DataFrame(mt)
mdf['z'] = mdf.groupby('participant').auc.transform(lambda v: (v - v.mean()) / v.std(ddof=1))


def bc(v):
    n = len(v)
    g1 = stats.skew(v, bias=False)
    g2 = stats.kurtosis(v, bias=False)
    return (g1 ** 2 + 1) / (g2 + 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)))


conds = list(dict.fromkeys(mdf.condition))
OUT['mouse'] = {
    'trials': [{'mad': r['mad'], 'auc': r['auc'], 'flips': r['flips'], 'rt': r['rt'], 'x50': r['nx'][50], 'y50': r['ny'][50], 'x25': r['nx'][25]} for r in mt],
    'per': {c: {'n': int((mdf.condition == c).sum()), 'auc': mdf[mdf.condition == c].auc.mean(), 'mad': mdf[mdf.condition == c].mad.mean(),
                'flips': mdf[mdf.condition == c].flips.mean(), 'bc': bc(mdf[mdf.condition == c].z.values), 'bcRaw': bc(mdf[mdf.condition == c].auc.values),
                'avgX50': float(np.mean([r['nx'][50] for r in mt if r['condition'] == c])),
                'avgY75': float(np.mean([r['ny'][75] for r in mt if r['condition'] == c]))} for c in conds},
    'all': bc(mdf.z.values), 'conds': conds,
}
pm = mdf.groupby(['participant', 'condition'])[['auc', 'mad', 'rt']].mean().unstack()
for key in ('auc', 'mad', 'rt'):
    a, b = pm[key][conds[1]], pm[key][conds[0]]
    tt = stats.ttest_rel(a, b)
    ci = tt.confidence_interval(0.95)
    OUT['mouse'][f'cmp_{key}'] = {'diff': (a - b).mean(), 't': tt.statistic, 'df': tt.df, 'p': tt.pvalue, 'lo': ci.low, 'hi': ci.high}
# Published check of the bimodality coefficient: a symmetric two-point (0/1, equal halves) sample of n = 100.
OUT['bcTwoPoint'] = bc(np.array([0.0] * 50 + [1.0] * 50))
OUT['bcUniform'] = bc(np.linspace(0, 1, 1001))

# ── Correspondence analysis ──
c = INP['ca']
df = pd.DataFrame(c['N'], index=c['rows'], columns=c['cols'])
N = df.values.astype(float)
n = N.sum()
P = N / n
r, cm = P.sum(1), P.sum(0)
S = (P - np.outer(r, cm)) / np.sqrt(np.outer(r, cm))
U, sv, Vt = np.linalg.svd(S, full_matrices=False)
K = min(N.shape) - 1
lam = sv[:K] ** 2
F = (U[:, :K] / np.sqrt(r)[:, None]) * sv[:K]
G = (Vt.T[:, :K] / np.sqrt(cm)[:, None]) * sv[:K]
ca = prince.CA(n_components=K, n_iter=30, random_state=1, engine='scipy').fit(df)
pF = ca.row_coordinates(df).values
pG = ca.column_coordinates(df).values
chi = stats.chi2_contingency(N, correction=False)
OUT['ca'] = {
    'total': float((S ** 2).sum()), 'lam': lam, 'princeEig': np.asarray(ca.eigenvalues_), 'chi2': chi.statistic, 'p': chi.pvalue, 'df': chi.dof,
    # Signs are arbitrary: compare absolute coordinates.
    'rowPr': np.abs(F), 'colPr': np.abs(G), 'princeRow': np.abs(pF), 'princeCol': np.abs(pG),
    'rowStd': np.abs(U[:, :K] / np.sqrt(r)[:, None]), 'colStd': np.abs(Vt.T[:, :K] / np.sqrt(cm)[:, None]),
    'rowCtr': np.asarray(ca.row_contributions_.values), 'colCtr': np.asarray(ca.column_contributions_.values),
    'rowCos2': np.asarray(ca.row_cosine_similarities(df).values), 'colCos2': np.asarray(ca.column_cosine_similarities(df).values),
}

# ── Tolerance intervals ──
x = np.array(INP['tolerance'], float)
cases = []
for (nn, p, g) in [(32, 0.9, 0.95), (10, 0.9, 0.95), (20, 0.95, 0.99), (50, 0.99, 0.95), (100, 0.9, 0.9), (5, 0.75, 0.9)]:
    zp = stats.norm.ppf(p)
    cases.append({'n': nn, 'p': p, 'g': g,
                  'howe': ti.twoside.normal_factor(nn, p, g, method='howe'),
                  'guenther': ti.twoside.normal_factor(nn, p, g, method='guenther'),
                  'exact': ti.twoside.normal_factor(nn, p, g, method='exact'),
                  'one': stats.nct.ppf(g, nn - 1, zp * math.sqrt(nn)) / math.sqrt(nn)})
OUT['kCases'] = cases
lx = np.log(x)
OUT['tol'] = {
    'n': len(x), 'mean': x.mean(), 'sd': x.std(ddof=1),
    'upperLog90_95': float(np.exp(ti.oneside.normal(lx, 0.9, 0.95)[0])),
    'lowerLog90_95': float(np.exp(ti.oneside.normal(lx, 0.1, 0.95)[0])),
    'twoHowe90_95': ti.twoside.normal(x, 0.9, 0.95, method='howe')[0], 'twoExact90_95': ti.twoside.normal(x, 0.9, 0.95, method='exact')[0],
    'npUpper80_90': float(ti.oneside.non_parametric(x, 0.8, 0.9)[0]), 'npLower20_90': float(ti.oneside.non_parametric(x, 0.2, 0.9)[0]),
    'npUpper90_95': float(ti.oneside.non_parametric(x, 0.9, 0.95)[0]),
    'skew': stats.skew(x, bias=False), 'skewLog': stats.skew(lx, bias=False),
}
# Two-sided order-statistic tolerance confidence, 1 − I_p(n − 2r + 1, 2r), and Wilks' minimum sample sizes.
OUT['npTwo'] = [{'n': nn, 'r': rr, 'p': p, 'conf': 1 - stats.beta.cdf(p, nn - 2 * rr + 1, 2 * rr)} for nn, rr, p in [(32, 1, 0.9), (93, 1, 0.95), (100, 2, 0.9), (59, 1, 0.95)]]
OUT['wilks'] = {'two_95_95': 93, 'one_95_95': 59, 'two_90_90': 38, 'one_90_90': 22, 'two_99_95': 473, 'one_99_95': 299}
# Distribution-free percentile intervals: scipy's quantile_test (exact binomial) for the sample.
pcs = []
for q, conf in [(0.9, 0.95), (0.5, 0.95), (0.75, 0.9)]:
    xs = np.sort(x)
    nn = len(xs)
    F = lambda k: stats.binom.cdf(k - 1, nn, q)
    a = (1 - conf) / 2
    l = max([k for k in range(1, nn + 1) if F(k) <= a], default=0)
    u = min([k for k in range(1, nn + 1) if F(k) >= 1 - a], default=0)
    pcs.append({'q': q, 'conf': conf, 'l': l, 'u': u, 'lo': xs[l - 1] if l else None, 'hi': xs[u - 1] if u else None,
                'cover': (F(u) - F(l)) if l and u else None, 'est': np.quantile(xs, q)})
OUT['pcs'] = pcs
# Zero / few events: Clopper-Pearson (statsmodels) and 1 − α^(1/n).
OUT['zero'] = [{'x': xx, 'n': nn, 'upper1': proportion_confint(xx, nn, alpha=0.10, method='beta')[1] if xx < nn else 1.0,
                'lo2': proportion_confint(xx, nn, alpha=0.05, method='beta')[0], 'hi2': proportion_confint(xx, nn, alpha=0.05, method='beta')[1],
                'exact0': 1 - 0.05 ** (1 / nn)} for xx, nn in [(0, 40), (0, 300), (2, 60), (5, 20)]]
OUT['nForZero'] = {'0.01': math.ceil(math.log(0.05) / math.log(0.99)), '0.05': math.ceil(math.log(0.05) / math.log(0.95))}
OUT['poisson'] = [{'c': cc, 'lo': stats.chi2.ppf(0.025, 2 * cc) / 2 if cc else 0.0, 'hi': stats.chi2.ppf(0.975, 2 * cc + 2) / 2} for cc in (0, 3, 25)]

json.dump(clean(OUT), open(os.path.join(HERE, 'cogia-reference.json'), 'w'), indent=1)
print('wrote cogia-reference.json')
