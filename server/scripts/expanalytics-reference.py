# Reference values for server/scripts/check-expanalytics.js (A/B health, multi-group comparisons, AHP, retention and
# funnels, meta-analysis). Independent implementations: scipy 1.18, statsmodels 0.15, pingouin 0.7, scikit-posthocs,
# numpy and PythonMeta 1.26. Run:  python3 server/scripts/expanalytics-reference.py
# It writes server/scripts/expanalytics-reference.json, which holds both the inputs and the expected outputs.
import json, warnings
from pathlib import Path
import numpy as np, pandas as pd
from scipy import stats, special, optimize
from statsmodels.stats.power import NormalIndPower
from statsmodels.stats.proportion import test_proportions_2indep, tost_proportions_2indep, proportion_confint, proportions_ztest
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.multicomp import pairwise_tukeyhsd
from statsmodels.stats.contingency_tables import cochrans_q, mcnemar
from statsmodels.stats.meta_analysis import combine_effects, effectsize_smd
import pingouin as pg
import scikit_posthocs as sp
import PythonMeta as PMA

warnings.filterwarnings('ignore')
out = {}
f = lambda x: float(x)

# ── SRM: scipy.stats.chisquare ──
srm = {'two': {'obs': [50812, 49388], 'w': [50, 50]}, 'three': {'obs': [33650, 33120, 33980], 'w': [1, 1, 1]}, 'skew': {'obs': [20410, 79590], 'w': [20, 80]}}
for k, v in srm.items():
    obs = np.array(v['obs'], float); exp = obs.sum() * np.array(v['w']) / sum(v['w'])
    r = stats.chisquare(obs, exp); v['chi2'] = f(r.statistic); v['p'] = f(r.pvalue)
out['srm'] = srm

# ── Power and MDE: statsmodels NormalIndPower ──
P = NormalIndPower()
mde = {}
# Means: sd 55, n per arm 20000, alpha .05, power .8, two-sided; with CUPED rho .5 the sd shrinks by sqrt(1 - rho^2).
# solve_power stops early (its answer has power 0.79997), so solve P.power with brentq at a tight tolerance.
solve_es = lambda alt: optimize.brentq(lambda e: P.power(effect_size=e, nobs1=20000, alpha=0.05, ratio=1, alternative=alt) - 0.8, 1e-6, 1, xtol=1e-15)
es = solve_es('two-sided')
mde['mean_two'] = {'sd': 55, 'n': 20000, 'delta': f(es * 55)}
mde['mean_cuped'] = {'sd': 55, 'n': 20000, 'rho': 0.5, 'delta': f(es * 55 * np.sqrt(1 - 0.25))}
es1 = solve_es('larger')
mde['mean_one'] = {'sd': 55, 'n': 20000, 'delta': f(es1 * 55)}
# Proportions: baseline 4.2%, n 84000 per arm; solve for delta with the unpooled SE via NormalIndPower.power.
def prop_power(delta, p1, n, alpha=0.05, alt='two-sided'):
    p2 = p1 + delta; es = delta / np.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / 2)
    return P.power(effect_size=es, nobs1=n, alpha=alpha, ratio=1, alternative=alt)
d = optimize.brentq(lambda x: prop_power(x, 0.042, 84000) - 0.8, 1e-6, 0.5, xtol=1e-14)
mde['prop_two'] = {'base': 0.042, 'n': 84000, 'delta': f(d)}
# Sample size for a 5% relative lift on 4.2% (delta = 0.0021), alpha 0.05, power 0.8, two-sided, and with alpha/2 (3 arms).
delta = 0.042 * 0.05
es = delta / np.sqrt((0.042 * 0.958 + (0.042 + delta) * (1 - 0.042 - delta)) / 2)
mde['prop_n'] = {'base': 0.042, 'delta': delta, 'n': int(np.ceil(P.solve_power(effect_size=es, alpha=0.05, power=0.8, ratio=1))), 'n3arms': int(np.ceil(P.solve_power(effect_size=es, alpha=0.025, power=0.8, ratio=1)))}
out['mde'] = mde

# ── Delta method: user-level clicks and sessions; numpy analytic formula and a simulation of 4,000 experiments ──
rng = np.random.default_rng(20261029)
def users(n, lift):
    act = rng.gamma(2.0, 1.5, n); sessions = 1 + rng.poisson(act)
    rate = rng.gamma(3.0, 0.45 * lift, n) * (1 + 0.15 * act)
    clicks = rng.poisson(sessions * rate)
    return clicks.astype(float), sessions.astype(float)
xc, yc = users(2000, 1.0); xt, yt = users(2000, 1.06)
def dvar(x, y):
    n = len(x); mx, my = x.mean(), y.mean(); C = np.cov(x, y, ddof=1)
    return (C[0, 0] / my**2 - 2 * mx * C[0, 1] / my**3 + mx**2 * C[1, 1] / my**4) / n
vc, vt = dvar(xc, yc), dvar(xt, yt); rc, rt = xc.sum() / yc.sum(), xt.sum() / yt.sum()
sims, ses = [], []
for _ in range(4000):
    a, b = users(2000, 1.0); sims.append(a.sum() / b.sum()); ses.append(np.sqrt(dvar(a, b)))
out['delta'] = {'xc': xc.tolist(), 'yc': yc.tolist(), 'xt': xt.tolist(), 'yt': yt.tolist(), 'rc': f(rc), 'rt': f(rt), 'seC': f(np.sqrt(vc)), 'seT': f(np.sqrt(vt)),
                'seDiff': f(np.sqrt(vc + vt)), 'lift': f(rt / rc - 1), 'seLift': f(np.sqrt(vt / rc**2 + rt**2 * vc / rc**4)), 'simSd': f(np.std(sims, ddof=1)), 'simMeanSe': f(np.mean(ses))}

# ── Non-inferiority and equivalence ──
ni = {'prop': {'c': [1210, 10000], 't': [1195, 10000], 'm': 0.01}, 'mean': {'c': [62.0, 18, 400], 't': [61.2, 19, 410], 'm': 3.0}}
x1, n1 = ni['prop']['t']; x2, n2 = ni['prop']['c']; m = ni['prop']['m']
ni['prop']['pNI'] = f(test_proportions_2indep(x1, n1, x2, n2, value=-m, method='wald', compare='diff', alternative='larger').pvalue)
ni['prop']['pEq'] = f(tost_proportions_2indep(x1, n1, x2, n2, low=-m, upp=m, method='wald', compare='diff').pvalue)
(mc, sc, nc), (mt, st, nt), m = ni['mean']['c'], ni['mean']['t'], ni['mean']['m']
ni['mean']['pNI'] = f(stats.ttest_ind_from_stats(mt + m, st, nt, mc, sc, nc, equal_var=False, alternative='greater').pvalue)
pl = stats.ttest_ind_from_stats(mt + m, st, nt, mc, sc, nc, equal_var=False, alternative='greater').pvalue
pu = stats.ttest_ind_from_stats(mt - m, st, nt, mc, sc, nc, equal_var=False, alternative='less').pvalue
ni['mean']['pEq'] = f(max(pl, pu))
out['ni'] = ni

# ── A/A check: the page's example p-values (same LCG as the JavaScript), scipy kstest exact and binomtest ──
s = 2024; ps = []
for _ in range(120):
    s = (s * 1103515245 + 12345) % 2147483648; ps.append(round(s / 2147483648, 4))
ks = stats.kstest(ps, 'uniform', method='exact')
x = sum(p < 0.05 for p in ps)
out['aa'] = {'ps': ps, 'D': f(ks.statistic), 'p': f(ks.pvalue), 'fp': int(x), 'pBinom': f(stats.binomtest(x, len(ps), 0.05, alternative='greater').pvalue),
             'small': {'ps': [0.01, 0.02, 0.04, 0.03, 0.2, 0.5, 0.008, 0.06, 0.9, 0.015, 0.33, 0.045], 'D': None, 'p': None}}
ks2 = stats.kstest(out['aa']['small']['ps'], 'uniform', method='exact'); out['aa']['small']['D'] = f(ks2.statistic); out['aa']['small']['p'] = f(ks2.pvalue)
out['studentized'] = [[q, k, df, f(stats.studentized_range.sf(q, k, df))] for q, k, df in [(3.5, 4, 20), (5.2, 3, 12), (2.1, 6, 300), (4.0, 5, 1e6)]]

# ── Multi-group comparisons ──
G = {'Current': [72, 65, 80, 77, 70, 68, 74, 79, 66, 71], 'Concept A': [82, 85, 78, 90, 88, 84, 79, 86, 91], 'Concept B': [60, 75, 58, 82, 66, 90, 55, 70, 64, 79, 61], 'Concept C': [74, 73, 77, 72, 76, 75, 71, 78]}
df = pd.DataFrame([(k, v) for k, vs in G.items() for v in vs], columns=['g', 'y'])
names = list(G)
a = pg.anova(df, dv='y', between='g', detailed=True)
w = pg.welch_anova(df, dv='y', between='g')
# statsmodels sorts the labels, so pass the group's position (0..k-1) to keep the input order.
t = pairwise_tukeyhsd(df.y, df.g.map({n: i for i, n in enumerate(names)}))
gh = pg.pairwise_gameshowell(df, dv='y', between='g')
gh_map = {(r.A, r.B): [f(r['diff']), f(r['T']), f(r['df']), f(r['pval'])] for _, r in gh.iterrows()}
dunn_raw = sp.posthoc_dunn(df, val_col='y', group_col='g', p_adjust=None)
dunn_holm = sp.posthoc_dunn(df, val_col='y', group_col='g', p_adjust='holm')
pairs = [(i, j) for i in range(4) for j in range(i + 1, 4)]
ss_b = f(a.SS[0]); ss_w = f(a.SS[1]); msw = ss_w / a.DF[1]
mc_out = {
    'groups': G, 'F': f(a.F[0]), 'p': f(a['p_unc'][0]), 'eta2': ss_b / (ss_b + ss_w), 'omega2': (ss_b - 3 * msw) / (ss_b + ss_w + msw),
    'welchF': f(w.F[0]), 'welchDf2': f(w.ddof2[0]), 'welchP': f(w['p_unc'][0]),
    'leveneMean': [f(v) for v in stats.levene(*G.values(), center='mean')], 'leveneMedian': [f(v) for v in stats.levene(*G.values(), center='median')],
    'kruskal': [f(v) for v in stats.kruskal(*G.values())],
    'tukeyDiff': [f(v) for v in t.meandiffs], 'tukeyP': [f(v) for v in t.pvalues], 'tukeyLo': [f(v[0]) for v in t.confint], 'tukeyHi': [f(v[1]) for v in t.confint],
    'gh': [gh_map.get((names[i], names[j])) or [-x if k < 2 else x for k, x in enumerate(gh_map[(names[j], names[i])])] for i, j in pairs],
    'dunnRaw': [f(dunn_raw.loc[names[i], names[j]]) for i, j in pairs], 'dunnHolm': [f(dunn_holm.loc[names[i], names[j]]) for i, j in pairs],
}
R = np.array([[5, 6, 7, 6], [4, 5, 5, 7], [6, 6, 7, 7], [3, 4, 6, 5], [5, 5, 6, 7], [4, 6, 6, 6], [6, 7, 7, 7], [2, 4, 5, 6], [5, 4, 6, 7], [4, 5, 7, 6], [3, 5, 4, 6], [5, 6, 6, 5]])
d = pd.DataFrame([(i, j, R[i, j]) for i in range(R.shape[0]) for j in range(4)], columns=['s', 'c', 'y'])
rm = pg.rm_anova(d, dv='y', within='c', subject='s', correction=True, detailed=True)
sph = pg.sphericity(d, dv='y', within='c', subject='s')
fr = stats.friedmanchisquare(*R.T)
nem = sp.posthoc_nemenyi_friedman(R); con = sp.posthoc_conover_friedman(R, p_adjust='holm')
mc_out['rm'] = {'rows': R.tolist(), 'F': f(rm.F[0]), 'p': f(rm['p_unc'][0]), 'pGG': f(rm['p_GG_corr'][0]), 'eps': f(rm.eps[0]), 'ng2': f(rm.ng2[0]), 'W': f(sph.W), 'chi2': f(sph.chi2), 'pSpher': f(sph.pval),
                'friedman': [f(fr.statistic), f(fr.pvalue)], 'nemenyi': [f(nem.iloc[i, j]) for i, j in pairs], 'conoverHolm': [f(con.iloc[i, j]) for i, j in pairs]}
B = np.array([[1, 1, 0], [1, 0, 0], [1, 1, 1], [0, 1, 0], [1, 1, 0], [1, 0, 0], [1, 1, 1], [0, 0, 0], [1, 1, 0], [1, 0, 1], [1, 1, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1], [0, 0, 0], [1, 1, 0], [1, 0, 0], [1, 1, 0], [1, 1, 0], [1, 0, 1]])
q = cochrans_q(B)
mcn = []
for i, j in [(0, 1), (0, 2), (1, 2)]:
    tab = [[int(((B[:, i] == 1) & (B[:, j] == 1)).sum()), int(((B[:, i] == 1) & (B[:, j] == 0)).sum())], [int(((B[:, i] == 0) & (B[:, j] == 1)).sum()), int(((B[:, i] == 0) & (B[:, j] == 0)).sum())]]
    mcn.append(f(mcnemar(tab, exact=True).pvalue))
mc_out['cochran'] = {'rows': B.tolist(), 'Q': f(q.statistic), 'p': f(q.pvalue), 'mcnemar': mcn, 'mcnemarHolm': [f(v) for v in multipletests(mcn, method='holm')[1]]}
pv = [0.003, 0.041, 0.018, 0.29, 0.012, 0.6, 0.049, 0.008, 0.11, 0.0004]
mc_out['adjust'] = {'p': pv, **{m: [f(v) for v in multipletests(pv, method=m)[1]] for m in ['bonferroni', 'holm', 'simes-hochberg', 'fdr_bh']}}
out['multi'] = mc_out

# ── AHP: numpy eigenvector. Saaty (1990, EJOR 48: 9-26) school selection criteria matrix, published priorities
# .32 .14 .03 .13 .24 .14; and the page's example (two judges, geometric mean). ──
def eig(A):
    A = np.array(A, float); vals, vecs = np.linalg.eig(A); i = np.argmax(vals.real); w = np.abs(vecs[:, i].real); w /= w.sum()
    n = len(A); lam = vals[i].real; ri = [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49][n]
    return {'w': w.tolist(), 'lambda': f(lam), 'cr': f((lam - n) / (n - 1) / ri)}
school = [[1, 4, 3, 1, 3, 4], [1/4, 1, 7, 3, 1/5, 1], [1/3, 1/7, 1, 1/5, 1/5, 1/6], [1, 1/3, 5, 1, 1, 1/3], [1/3, 5, 5, 1, 1, 3], [1/4, 1, 6, 3, 1/3, 1]]
def from_steps(n, steps):
    A = np.ones((n, n)); x = 0
    for i in range(n):
        for j in range(i + 1, n):
            s = steps[x]; x += 1; r = s + 1 if s >= 0 else 1 / (1 - s); A[i, j] = r; A[j, i] = 1 / r
    return A
j1 = from_steps(4, [2, 4, 3, 2, 2, 0]); j2 = from_steps(4, [1, 3, 4, 2, 3, 1])
gm = np.exp((np.log(j1) + np.log(j2)) / 2)
out['ahp'] = {'school': {'A': school, **eig(school)}, 'judge1': eig(j1), 'geo': {'A': gm.tolist(), **eig(gm)}}

# ── Retention: sBG MLE on Fader and Hardie (2007) example data (years 0-7), and DEL via hyp2f1 ──
def sbg_fit(sv):
    sv = np.array(sv, float); T = len(sv) - 1
    def nll(p):
        al, be = np.exp(p); t = np.arange(1, T + 1)
        Pt = np.exp(special.betaln(al + 1, be + t - 1) - special.betaln(al, be)); S = np.exp(special.betaln(al, be + T) - special.betaln(al, be))
        return -(np.sum((sv[:-1] - sv[1:]) * np.log(Pt)) + sv[-1] * np.log(S))
    r = optimize.minimize(nll, [0, 0], method='Nelder-Mead', options=dict(xatol=1e-12, fatol=1e-13, maxiter=20000))
    return [f(v) for v in np.exp(r.x)] + [f(-r.fun)]
reg = [1000, 631, 468, 382, 326, 289, 262, 241]; high = [1000, 869, 743, 653, 593, 551, 517, 491]
out['sbg'] = {'regular': {'s': reg, 'fit': sbg_fit(reg), 'published': [0.704, 1.182]}, 'highEnd': {'s': high, 'fit': sbg_fit(high), 'published': [0.668, 3.806]},
              'del': [[0.668, 3.806, 0.1, f(special.hyp2f1(1, 3.806, 0.668 + 3.806, 1 / 1.1))], [1.3, 4.0, 0.01, f(special.hyp2f1(1, 4.0, 5.3, 1 / 1.01))]]}
# Funnel: Wilson intervals, pooled z-tests, Holm.
A = [18400, 3120, 1610, 1020, 832]; Bf = [9600, 1980, 1240, 905, 771]
out['funnel'] = {'a': A, 'b': Bf,
                 'wilson': [[f(v) for v in proportion_confint(A[i], A[i - 1], method='wilson')] for i in range(1, 5)],
                 'z': [[f(v) for v in proportions_ztest([A[i], Bf[i]], [A[i - 1], Bf[i - 1]])] for i in range(1, 5)]}
out['funnel']['holm'] = [f(v) for v in multipletests([z[1] for z in out['funnel']['z']], method='holm')[1]]
# Markov absorption with numpy: the page's example journeys.
paths = [('Home>Search>Product>Cart>Buy', 310), ('Home>Search>Product', 520), ('Home>Category>Product>Cart>Buy', 240), ('Home>Category>Product>Cart', 180), ('Home>Category', 400), ('Ad>Product>Cart>Buy', 260), ('Ad>Product', 610), ('Email>Product>Cart>Buy', 150), ('Email>Cart>Buy', 90), ('Home>Search>Search>Product>Cart>Buy', 70), ('Home>Search', 450), ('Ad>Home>Search>Product>Cart>Buy', 60)]
def markov(paths, removed=None):
    seqs = []
    for p, n in paths:
        st = p.split('>'); conv = st[-1] == 'Buy'; st = st[:-1] if conv else st
        seqs.append((['S'] + st, conv, n))
    states = ['S'] + sorted({s for q, _, _ in seqs for s in q[1:]}); ix = {s: i for i, s in enumerate(states)}; m = len(states)
    C = np.zeros((m, m + 2))
    for q, conv, n in seqs:
        for i, s in enumerate(q):
            to = ix[q[i + 1]] if i + 1 < len(q) else (m if conv else m + 1); C[ix[s], to] += n
    Pm = C / C.sum(1, keepdims=True)
    if removed is not None:
        r = ix[removed]; Pm[:, m + 1] += Pm[:, r]; Pm[:, r] = 0
    Q = Pm[:, :m]; Rm = Pm[:, m:]; Bm = np.linalg.solve(np.eye(m) - Q, Rm)
    return states, Bm
states, Bm = markov(paths)
out['markov'] = {'paths': paths, 'pConv': f(Bm[0, 0]), 'removal': {s: f(1 - markov(paths, s)[1][0, 0] / Bm[0, 0]) for s in states[1:]}}

# ── Meta-analysis ──
bcg = [[4, 119, 11, 128], [6, 300, 29, 274], [3, 228, 11, 209], [62, 13536, 248, 12619], [33, 5036, 47, 5761], [180, 1361, 372, 1079], [8, 2537, 10, 619], [505, 87886, 499, 87892], [29, 7470, 45, 7232], [17, 1699, 65, 1600], [186, 50448, 141, 27197], [5, 2493, 3, 2338], [27, 16886, 29, 17825]]
yi = np.array([np.log((a / (a + b)) / (c / (c + d))) for a, b, c, d in bcg]); vi = np.array([1 / a - 1 / (a + b) + 1 / c - 1 / (c + d) for a, b, c, d in bcg])
dl = combine_effects(yi, vi, method_re='chi2'); pm = combine_effects(yi, vi, method_re='iterated')
sfd = dl.summary_frame(); sfp = pm.summary_frame()
sfh = combine_effects(yi, vi, method_re='chi2', use_t=True).summary_frame()
out['meta'] = {'bcg': bcg,
               'dl': {'est': f(sfd.loc['random effect', 'eff']), 'se': f(sfd.loc['random effect', 'sd_eff']), 'tau2': f(dl.tau2), 'Q': f(dl.q), 'i2': f(dl.i2), 'fe': f(sfd.loc['fixed effect', 'eff']), 'feSe': f(sfd.loc['fixed effect', 'sd_eff'])},
               'pm': {'est': f(sfp.loc['random effect', 'eff']), 'tau2': f(pm.tau2)},
               'hk': {'est': f(sfh.loc['random effect wls', 'eff']), 'se': f(sfh.loc['random effect wls', 'sd_eff']), 'lo': f(sfh.loc['random effect wls', 'ci_low']), 'hi': f(sfh.loc['random effect wls', 'ci_upp'])}}
# Prediction interval by hand (Higgins et al. 2009): mu ± t_{k-2} sqrt(tau2 + se^2), DL.
k = len(yi); out['meta']['dl']['pi'] = [f(out['meta']['dl']['est'] + s * stats.t.ppf(0.975, k - 2) * np.sqrt(dl.tau2 + out['meta']['dl']['se'] ** 2)) for s in (-1, 1)]
# Q-profile CI for tau^2 (Viechtbauer 2007) solved exactly with brentq; metafor's confint stops at uniroot's default tolerance.
def genQ(t2):
    w = 1 / (vi + t2); mu = (w * yi).sum() / w.sum(); return (w * (yi - mu) ** 2).sum()
qlo = optimize.brentq(lambda t: genQ(t) - stats.chi2.ppf(0.975, k - 1), 0, 10, xtol=1e-14)
qhi = optimize.brentq(lambda t: genQ(t) - stats.chi2.ppf(0.025, k - 1), 0, 10, xtol=1e-14)
wi = 1 / vi; s2 = (k - 1) * wi.sum() / (wi.sum() ** 2 - (wi ** 2).sum())
out['meta']['qprofile'] = {'tau2': [f(qlo), f(qhi)], 'i2': [f(qlo / (qlo + s2)), f(qhi / (qhi + s2))]}
# SMD: statsmodels effectsize_smd and PythonMeta (random effects, IV, SMD) on the UX example's means rows; PythonMeta's Egger test.
rows = ["Ali 2019, 62.4, 18.1, 24, 71.0, 20.3, 24", "Brooks 2019, 55.1, 15.2, 30, 60.8, 16.9, 31", "Chen 2020, 48.9, 21.5, 120, 53.2, 22.4, 118", "Evans 2021, 70.2, 25.0, 45, 74.9, 24.1, 44", "Gupta 2022, 39.8, 12.9, 210, 41.1, 13.4, 205", "Ito 2023, 66.0, 19.5, 18, 75.3, 21.0, 18", "Jones 2023, 51.7, 17.8, 160, 53.0, 18.2, 158", "Lee 2024, 58.3, 20.0, 12, 70.1, 19.4, 12"]
v = np.array([[float(x) for x in r.split(',')[1:]] for r in rows])
g, vg = effectsize_smd(v[:, 0], v[:, 1], v[:, 2], v[:, 3], v[:, 4], v[:, 5])
dd = PMA.Data(); dd.datatype = 'CONT'; mm = PMA.Meta(); mm.datatype = 'CONT'; mm.models = 'Random'; mm.algorithm = 'IV'; mm.effect = 'SMD'
res = mm.meta(dd.getdata(rows)); eg = mm.Eggers_test(res)
out['meta']['smd'] = {'rows': rows, 'g': [f(x) for x in g], 'v': [f(x) for x in vg], 'pooled': f(res[0][1]), 'se': f(res[0][6]), 'lo': f(res[0][3]), 'hi': f(res[0][4]), 'Q': f(res[0][7]), 'i2': f(res[0][9]), 'eggerIntercept': f(eg[0]), 'eggerT': f(eg[1])}

Path(__file__).with_name('expanalytics-reference.json').write_text(json.dumps(out, indent=1))
print('wrote expanalytics-reference.json:', ', '.join(out))
