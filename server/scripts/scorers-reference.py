"""Reference values for the scorers tools (questionnaires, agreement, item analysis, survey weighting).

Independent of the JavaScript: pingouin 0.7 (ICC, Friedman/Kendall's W, Cronbach's alpha), scipy 1.18 (t, F, chi-square,
binomial, optimisation), statsmodels 0.15 (Wilson interval), girth 0.8 (Rasch CML), samplics 0.6 (raking, Taylor
linearisation) and ipfn 1.4 (raking), plus direct numpy implementations where no package exists (rwg, Bland-Altman,
questionnaire keys, Rasch JML and fit statistics).
Run: node server/scripts/scorers-dump.js && python3 server/scripts/scorers-reference.py
"""
import json, os, warnings
import numpy as np
import pandas as pd
from scipy import stats, optimize
import pingouin as pg
from statsmodels.stats.proportion import proportion_confint

warnings.filterwarnings('ignore')
here = os.path.dirname(os.path.abspath(__file__))
IN = json.load(open(os.path.join(here, 'scorers-input.json')))
R = {}
arr = lambda rows: np.array([[np.nan if v is None else v for v in r] for r in rows], dtype=float)

# ── ICC (pingouin.intraclass_corr) ──
def icc_ref(rows):
    m = np.array(rows, float); n, k = m.shape
    long = pd.DataFrame([(i, j, m[i, j]) for i in range(n) for j in range(k)], columns=['t', 'r', 'y'])
    o = pg.intraclass_corr(long, targets='t', raters='r', ratings='y')
    # pingouin rounds its CI95 column to 2 decimals, so the unrounded bounds are recomputed here with scipy.stats.f
    # from the mean squares of pingouin.anova, following McGraw and Wong (1996) Table 7 (pingouin's own formulas).
    aov = pg.anova(data=long, dv='y', between=['t', 'r'], ss_type=2)
    msb = aov.at[0, 'MS']; msj = aov.at[1, 'MS']; mse = aov.at[2, 'MS']
    msw = (aov.at[1, 'SS'] + aov.at[2, 'SS']) / (aov.at[1, 'DF'] + aov.at[2, 'DF'])
    icc2 = o['ICC'][1]; F = stats.f; a = 0.05
    f1 = msb / msw; f3 = msb / mse; df1 = n - 1; d1k = n * (k - 1); d2k = (n - 1) * (k - 1)
    f1l = f1 / F.ppf(1 - a / 2, df1, d1k); f1u = f1 * F.ppf(1 - a / 2, d1k, df1)
    f3l = f3 / F.ppf(1 - a / 2, df1, d2k); f3u = f3 * F.ppf(1 - a / 2, d2k, df1)
    fj = msj / mse
    v = d2k * (k * icc2 * fj + n * (1 + (k - 1) * icc2) - k * icc2) ** 2 / (df1 * k ** 2 * icc2 ** 2 * fj ** 2 + (n * (1 + (k - 1) * icc2) - k * icc2) ** 2)
    f2u = F.ppf(1 - a / 2, n - 1, v); f2l = F.ppf(1 - a / 2, v, n - 1)
    l2 = n * (msb - f2u * mse) / (f2u * (k * msj + (k * n - k - n) * mse) + n * msb)
    u2 = n * (f2l * msb - mse) / (k * msj + (k * n - k - n) * mse + n * f2l * msb)
    lo = [(f1l - 1) / (f1l + k - 1), l2, (f3l - 1) / (f3l + k - 1), 1 - 1 / f1l, l2 * k / (1 + l2 * (k - 1)), 1 - 1 / f3l]
    hi = [(f1u - 1) / (f1u + k - 1), u2, (f3u - 1) / (f3u + k - 1), 1 - 1 / f1u, u2 * k / (1 + u2 * (k - 1)), 1 - 1 / f3u]
    return {'icc': o['ICC'].tolist(), 'lo': [float(x) for x in lo], 'hi': [float(x) for x in hi], 'pgLo': [float(c[0]) for c in o['CI95']], 'pgHi': [float(c[1]) for c in o['CI95']],
            'F': o['F'].tolist(), 'df2': o['df2'].tolist(), 'p': o['pval'].tolist()}
R['icc'] = icc_ref(IN['icc']); R['sf'] = icc_ref(IN['sf'])

# ── Kendall's W (pingouin.friedman: subject = judge, within = item) ──
def w_ref(rows):
    m = np.array(rows, float); n, k = m.shape
    long = pd.DataFrame([(j, i, m[i, j]) for i in range(n) for j in range(k)], columns=['judge', 'item', 'y'])
    c = pg.friedman(long, dv='y', within='item', subject='judge', method='chisq')
    f = pg.friedman(long, dv='y', within='item', subject='judge', method='f')
    sc = stats.friedmanchisquare(*[m[i, :] for i in range(n)])
    return {'W': float(c['W'].iloc[0]), 'Q': float(c['Q'].iloc[0]), 'p': float(c['p_unc'].iloc[0]), 'F': float(f['F'].iloc[0]), 'pF': float(f['p_unc'].iloc[0]), 'df1F': float(f['ddof1'].iloc[0]), 'scipyQ': float(sc.statistic), 'scipyP': float(sc.pvalue)}
R['w'] = w_ref(IN['w']); R['wTies'] = w_ref(IN['wTies'])

# ── rwg / rwg(j) and AD(M) (James, Demaree and Wolf 1984; Burke and Dunlap 2002), numpy ──
def rwg_ref(groups, A=5):
    s2e = (A * A - 1) / 12; out = []
    for g in groups:
        m = arr(g['raters'])
        v = [np.nanvar(m[:, j], ddof=1) for j in range(m.shape[1])]
        sbar = float(np.mean(v)); J = m.shape[1]
        raw = 1 - sbar / s2e if J == 1 else J * (1 - sbar / s2e) / (J * (1 - sbar / s2e) + sbar / s2e)
        val = 0.0 if sbar >= s2e else min(1.0, max(0.0, raw))
        adm = float(np.mean([np.nanmean(np.abs(m[:, j] - np.nanmean(m[:, j]))) for j in range(J)]))
        out.append({'name': g['name'], 'raw': raw, 'value': val, 'adm': adm, 'sbar': sbar})
    vals = sorted(o['value'] for o in out)
    return {'groups': out, 'median': float(np.median(vals))}
R['rwg'] = rwg_ref(IN['rwg'])

# ── Bland-Altman (formulas of pingouin.plot_blandaltman; scipy t.interval and linregress) ──
def ba_ref(pairs, percent=False, conf=0.95):
    m = arr(pairs); x, y = m[:, 0], m[:, 1]; mean = (x + y) / 2
    d = (x - y) / np.abs(mean) * 100 if percent else x - y
    n = len(d); md = d.mean(); s = d.std(ddof=1); se = s / np.sqrt(n); sel = np.sqrt(3 * s * s / n)
    hi, lo = md + 1.959963984540054 * s, md - 1.959963984540054 * s
    lr = stats.linregress(mean, d)
    return {'bias': md, 'sd': s, 'biasCI': list(stats.t.interval(conf, n - 1, loc=md, scale=se)), 'upper': hi, 'lower': lo,
            'upperCI': list(stats.t.interval(conf, n - 1, loc=hi, scale=sel)), 'lowerCI': list(stats.t.interval(conf, n - 1, loc=lo, scale=sel)),
            'slope': lr.slope, 'slopeP': lr.pvalue, 'pBias': float(stats.ttest_1samp(d, 0).pvalue)}
R['ba'] = ba_ref(IN['ba']); R['baPct'] = ba_ref(IN['ba'], percent=True)

# ── Questionnaires: independent scoring with pandas, scipy intervals and pingouin alpha ──
def score(rows, subs, lo, hi, rev_items=(), how='mean', require_all=False):
    m = arr(rows); m[(m < lo) | (m > hi)] = np.nan
    out = {}
    for key, items in subs.items():
        cols = m[:, [i - 1 for i in items]].copy()
        for c, i in enumerate(items):
            if i in rev_items:
                cols[:, c] = lo + hi - cols[:, c]
        cnt = np.sum(~np.isnan(cols), axis=1)
        need = len(items) if require_all else int(np.ceil(len(items) / 2))
        sc = np.where(cnt >= need, np.nansum(cols, axis=1) if how == 'sum' else np.nanmean(cols, axis=1), np.nan)
        xs = sc[~np.isnan(sc)]
        ci = stats.t.interval(0.95, len(xs) - 1, loc=xs.mean(), scale=stats.sem(xs))
        full = pd.DataFrame(cols).dropna()
        alpha = float(pg.cronbach_alpha(full)[0]) if len(items) >= 2 and len(full) >= 3 else None
        out[key] = {'n': int(len(xs)), 'mean': float(xs.mean()), 'sd': float(xs.std(ddof=1)), 'lo': float(ci[0]), 'hi': float(ci[1]), 'alpha': alpha, 'scores': [None if np.isnan(v) else float(v) for v in sc]}
    return out
rng_ = lambda a, b: list(range(a, b + 1))
PS = {'Overall': rng_(1, 16), 'SysUse': rng_(1, 6), 'InfoQual': rng_(7, 12), 'IntQual': rng_(13, 15)}
R['pssuq'] = score(IN['q']['pssuq'], PS, 1, 7)
for k, b in {'Overall': 2.82, 'SysUse': 2.80, 'InfoQual': 3.02, 'IntQual': 2.49}.items():
    xs = np.array([v for v in R['pssuq'][k]['scores'] if v is not None])
    t = stats.ttest_1samp(xs, b); R['pssuq'][k]['t'] = float(t.statistic); R['pssuq'][k]['p'] = float(t.pvalue)
R['ues'] = score(IN['q']['ues'], {'Overall': rng_(1, 12), 'FA': [1, 2, 3], 'PU': [4, 5, 6], 'AE': [7, 8, 9], 'RW': [10, 11, 12]}, 1, 5, rev_items=(4, 5, 6))
R['tam'] = score(IN['q']['tam'], {'PU': rng_(1, 6), 'PEOU': rng_(7, 12)}, 1, 7)
R['sam'] = score(IN['q']['sam'], {'Valence': [1], 'Arousal': [2], 'Dominance': [3]}, 1, 9)
R['smeq'] = score(IN['q']['smeq'], {'SMEQ': [1]}, 0, 150)
R['asq'] = score(IN['q']['asq'], {'ASQ': [1, 2, 3]}, 1, 7)
R['geq'] = score(IN['q']['geq'], {'Competence': [2, 10, 15, 17, 21], 'Immersion': [3, 12, 18, 19, 27, 30], 'Flow': [5, 13, 25, 28, 31], 'Tension': [22, 24, 29], 'Challenge': [11, 23, 26, 32, 33], 'Negative': [7, 8, 9, 16], 'Positive': [1, 4, 6, 14, 20]}, 0, 4)
R['swls'] = score(IN['q']['swls'], {'SWLS': rng_(1, 5)}, 1, 7, how='sum', require_all=True)
R['pens'] = score(IN['q']['pens'], {g['key']: g['items'] for g in IN['pensGroups']}, 1, 7)
for k in R:
    if isinstance(R[k], dict):
        for s in R[k].values():
            if isinstance(s, dict):
                s.pop('scores', None)
# Semantic differential: reversed pairs flipped (8 − x), t intervals per group and pair, Osgood's D.
sdm = arr(IN['sd']['rows']); rev = IN['sd']['rev']; groups = IN['sd']['groups']
for j, r_ in enumerate(rev):
    if r_:
        sdm[:, j] = 8 - sdm[:, j]
gn = list(dict.fromkeys(groups)); prof = []
for g in gn:
    sub = sdm[[i for i, x in enumerate(groups) if x == g]]
    means = sub.mean(axis=0)
    cis = [stats.t.interval(0.95, len(sub) - 1, loc=sub[:, j].mean(), scale=stats.sem(sub[:, j])) for j in range(sub.shape[1])]
    prof.append({'group': g, 'means': means.tolist(), 'lo': [c[0] for c in cis], 'hi': [c[1] for c in cis]})
R['sd'] = {'prof': prof, 'D': float(np.sqrt(np.sum((np.array(prof[0]['means']) - np.array(prof[1]['means'])) ** 2)))}
c = IN['pmf']; n = c['very'] + c['somewhat'] + c['not']
lo, hi = proportion_confint(c['very'], n, alpha=0.05, method='wilson')
R['pmf'] = {'n': n, 'share': c['very'] / n, 'lo': lo, 'hi': hi, 'pTwo': stats.binomtest(c['very'], n, 0.4).pvalue, 'pGreater': stats.binomtest(c['very'], n, 0.4, alternative='greater').pvalue}
nNA = n + c['na']; lo2, hi2 = proportion_confint(c['very'], nNA, alpha=0.05, method='wilson')
R['pmfNA'] = {'n': nNA, 'lo': lo2, 'hi': hi2}

# ── Classical item analysis (pingouin alpha, scipy point-biserial, numpy) ──
X = np.array(IN['items']['rows'], float); N, L = X.shape; tot = X.sum(axis=1)
alpha = float(pg.cronbach_alpha(pd.DataFrame(X))[0])
g = int(round(0.27 * N)); order = sorted(range(N), key=lambda i: (-tot[i], i)); up, low = order[:g], order[N - g:]
items = []
for j in range(L):
    c_ = X[:, j]; mx = max(1.0, c_.max())
    items.append({'p': float(c_.mean() / mx), 'D': float((c_[up].mean() - c_[low].mean()) / mx), 'rpb': float(stats.pointbiserialr(c_, tot).statistic),
                  'rit': float(np.corrcoef(c_, tot - c_)[0, 1]), 'aid': float(pg.cronbach_alpha(pd.DataFrame(np.delete(X, j, axis=1)))[0])})
R['classical'] = {'alpha': alpha, 'sem': float(tot.std(ddof=1) * np.sqrt(1 - alpha)), 'items': items, 'g': g}
# Distractor shares for item 7 (the miskeyed one).
raw = IN['items']['raw']; opts = sorted(set(r[6] for r in raw), key=lambda o: (o == '', o))
R['distractor7'] = [{'option': o, 'all': sum(r[6] == o for r in raw) / N, 'upper': sum(raw[i][6] == o for i in up) / g, 'lower': sum(raw[i][6] == o for i in low) / g} for o in opts]

# ── Rasch ──
keep = [j for j in range(L) if 0 < X[:, j].sum() < N]; Xr = X[:, keep]; Lr = Xr.shape[1]
sc = Xr.sum(axis=1); use = Xr[(sc > 0) & (sc < Lr)]; s_i = use.sum(axis=0); r_counts = np.bincount(use.sum(axis=1).astype(int), minlength=Lr + 1)

def esf(eps):
    g_ = np.array([1.0])
    for e in eps:
        g_ = np.convolve(g_, [1.0, e])
    return g_

def cond_nll(free):
    b = np.append(free, -free.sum())
    gam = esf(np.exp(-b))
    return float(s_i @ b + sum(r_counts[r] * np.log(gam[r]) for r in range(1, Lr)))

opt = optimize.minimize(cond_nll, np.zeros(Lr - 1), method='BFGS', options={'gtol': 1e-10, 'maxiter': 10000})
b_cml = np.append(opt.x, -opt.x.sum())
# Standard errors: numerical Hessian (central differences of the objective) in the sum-to-zero parametrisation.
h = 1e-4; k_ = Lr - 1; H = np.zeros((k_, k_)); x0 = opt.x
for a in range(k_):
    for b_ in range(a, k_):
        ea = np.eye(k_)[a] * h; eb = np.eye(k_)[b_] * h
        H[a, b_] = H[b_, a] = (cond_nll(x0 + ea + eb) - cond_nll(x0 + ea - eb) - cond_nll(x0 - ea + eb) + cond_nll(x0 - ea - eb)) / (4 * h * h)
Amap = np.vstack([np.eye(k_), -np.ones(k_)]); cov = Amap @ np.linalg.inv(H) @ Amap.T
se_cml = np.sqrt(np.diag(cov))
from girth import rasch_conditional
b_girth = rasch_conditional(Xr.T.astype(bool))['Difficulty']

def theta_for(r, b):
    rr = 0.3 if r == 0 else Lr - 0.3 if r == Lr else r
    th = optimize.brentq(lambda t: np.sum(1 / (1 + np.exp(-(t - b)))) - rr, -15, 15, xtol=1e-14)
    p_ = 1 / (1 + np.exp(-(th - b)))
    return th, 1 / np.sqrt(np.sum(p_ * (1 - p_)))

thetas = [theta_for(r, b_cml) for r in range(Lr + 1)]
# Fit statistics (numpy), non-extreme persons.
idx = np.where((sc > 0) & (sc < Lr))[0]; TH = np.array([thetas[int(sc[v])][0] for v in idx])
P = 1 / (1 + np.exp(-(TH[:, None] - b_cml[None, :]))); Wv = P * (1 - P); Xf = Xr[idx]
outfit = (((Xf - P) ** 2) / Wv).mean(axis=0); infit = ((Xf - P) ** 2).sum(axis=0) / Wv.sum(axis=0)
C = Wv * (1 - 3 * Wv); n_ = len(idx)
qo = np.sqrt(np.maximum(0, (C / Wv ** 2).sum(axis=0) / n_ ** 2 - 1 / n_)); qi = np.sqrt(np.maximum(0, (C - Wv ** 2).sum(axis=0) / Wv.sum(axis=0) ** 2))
outZ = (np.cbrt(outfit) - 1) * (3 / qo) + qo / 3; inZ = (np.cbrt(infit) - 1) * (3 / qi) + qi / 3
pout = (((Xf - P) ** 2) / Wv).mean(axis=1); pin = ((Xf - P) ** 2).sum(axis=1) / Wv.sum(axis=1)
se2 = np.array([thetas[int(sc[v])][1] ** 2 for v in idx]); relP = (TH.var(ddof=1) - se2.mean()) / TH.var(ddof=1)
relI = (b_cml.var(ddof=1) - np.mean(se_cml ** 2)) / b_cml.var(ddof=1)

# JML: joint likelihood over score-group abilities and item difficulties (sum-to-zero), then × (L − 1)/L.
groups_r = [r for r in range(1, Lr) if r_counts[r] > 0]
def joint_nll(par):
    th = par[:len(groups_r)]; free = par[len(groups_r):]; b = np.append(free, -free.sum())
    ll = 0.0
    for k2, r in enumerate(groups_r):
        rows = use[use.sum(axis=1) == r]; z = th[k2] - b
        ll += np.sum(rows @ z) - len(rows) * np.sum(np.log1p(np.exp(z)))
    return -ll
x0 = np.concatenate([[np.log(r / (Lr - r)) for r in groups_r], np.zeros(Lr - 1)])
oj = optimize.minimize(joint_nll, x0, method='BFGS', options={'gtol': 1e-9, 'maxiter': 20000})
b_jml_raw = np.append(oj.x[len(groups_r):], -oj.x[len(groups_r):].sum())

R['rasch'] = {'keep': keep, 'b': b_cml.tolist(), 'se': se_cml.tolist(), 'girth': b_girth.tolist(), 'theta': [t[0] for t in thetas], 'thetaSe': [t[1] for t in thetas],
              'infit': infit.tolist(), 'outfit': outfit.tolist(), 'inZ': inZ.tolist(), 'outZ': outZ.tolist(), 'personInfit': pin[:10].tolist(), 'personOutfit': pout[:10].tolist(),
              'relP': float(relP), 'relI': float(relI), 'jmlRaw': b_jml_raw.tolist(), 'jml': (b_jml_raw * (Lr - 1) / Lr).tolist(), 'nUsed': int(len(use))}

# ── Survey weighting: samplics and ipfn raking, samplics Taylor linearisation ──
from samplics.weighting import SampleWeight
from samplics.estimation import TaylorEstimator
from samplics.utils.types import PopParam
from ipfn.ipfn import ipfn as IPFN
df = pd.DataFrame(IN['survey']['rows']); n = len(df)
control = {t['variable']: {l['level']: l['share'] * n for l in t['levels']} for t in IN['targets']}
margins = {v: df[v].to_numpy() for v in control}
w_s = SampleWeight().rake(samp_weight=np.ones(n), margins=margins, control=control, tol=1e-13, ctrl_tol=1e-13, max_iter=5000)
df2 = df.copy(); df2['total'] = 1.0
aggs = [pd.Series(control[v]).rename_axis(v) for v in control]
ip = IPFN(df2, aggs, [[v] for v in control], weight_col='total', convergence_rate=1e-14, max_iteration=5000, rate_tolerance=0)
w_i = ip.iteration()['total'].to_numpy()
w = w_s * n / w_s.sum()
deff = n * np.sum(w ** 2) / np.sum(w) ** 2
est = {}
sat = df['satisfaction'].astype(float).to_numpy()
for name, y in (('satisfaction', sat), ('renewYes', (df['will_renew'] == 'Yes').astype(float).to_numpy())):
    for lab, ww in (('w', w), ('u', np.ones(n))):
        te = TaylorEstimator(param=PopParam.mean); te.estimate(y=y, samp_weight=ww)
        est[f'{name}_{lab}'] = {'mean': float(te.point_est), 'se': float(te.stderror), 'lo': float(te.lower_ci), 'hi': float(te.upper_ci)}
# Trimming at [0.3, 3] × mean with re-raking until the caps hold (same algorithm as the tool, written independently).
def rake_np(w0, tol=1e-10):
    w_ = w0.copy()
    for _ in range(5000):
        for v, lv in control.items():
            tot_ = w_.sum()
            for level, target in lv.items():
                msk = (df[v] == level).to_numpy(); w_[msk] *= (target / n) * tot_ / w_[msk].sum()
        gap = max(abs(w_[(df[v] == level).to_numpy()].sum() / w_.sum() - target / n) for v, lv in control.items() for level, target in lv.items())
        if gap < tol:
            break
    return w_
wt = rake_np(np.ones(n))
for _ in range(200):
    m_ = wt.mean(); capped = np.clip(wt, 0.3 * m_, 3 * m_)
    if np.all(np.abs(capped - wt) <= 1e-9 * np.maximum(1, wt)):
        break
    wt = rake_np(capped)
wt = wt * n / wt.sum()
R['weight'] = {'samplics': w.tolist()[:20], 'ipfn': (w_i * n / w_i.sum()).tolist()[:20], 'maxAbsSamplicsIpfn': float(np.max(np.abs(w - w_i * n / w_i.sum()))),
               'deff': float(deff), 'nEff': float(np.sum(w) ** 2 / np.sum(w ** 2)), 'min': float(w.min()), 'max': float(w.max()), 'est': est,
               'trim': {'first20': wt.tolist()[:20], 'max': float(wt.max()), 'min': float(wt.min()), 'deff': float(n * np.sum(wt ** 2) / np.sum(wt) ** 2)}}

json.dump(R, open(os.path.join(here, 'scorers-reference.json'), 'w'), indent=1)
print('wrote scorers-reference.json')
