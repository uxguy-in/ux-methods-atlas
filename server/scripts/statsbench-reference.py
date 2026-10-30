# Reference values for server/scripts/check-statsbench.js (regression, moderation and mediation, resampling,
# distribution check, survival). Independent implementations: statsmodels 0.15 (OLS, Logit, OrderedModel, GLM Poisson,
# NegativeBinomial, OLSInfluence, VIF, Breusch-Pagan, lilliefors, normal_ad), pingouin 0.7 (mediation_analysis),
# scipy 1.18 (shapiro, anderson, skew, kurtosis, lognorm, boxcox_normmax, gaussian_kde, probplot, bootstrap,
# permutation_test) and lifelines 0.30 (KaplanMeierFitter, NelsonAalenFitter, logrank tests, RMST).
# Inputs come from statsbench-reference-input.json (written by `node server/scripts/statsbench-dump.js`).
# Run:  python3 server/scripts/statsbench-reference.py   → writes statsbench-reference.json
import json, warnings
from io import StringIO
from pathlib import Path
import numpy as np, pandas as pd
from scipy import stats
from scipy.stats._resampling import _bca_interval
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.miscmodels.ordinal_model import OrderedModel
from statsmodels.stats.outliers_influence import variance_inflation_factor, OLSInfluence
from statsmodels.stats.diagnostic import lilliefors, normal_ad, het_breuschpagan
from statsmodels.stats.stattools import durbin_watson
from statsmodels.tools.numdiff import approx_hess3
import pingouin as pg
from lifelines import KaplanMeierFitter, NelsonAalenFitter
from lifelines.statistics import logrank_test, multivariate_logrank_test, pairwise_logrank_test
from lifelines.utils import median_survival_times, restricted_mean_survival_time

warnings.filterwarnings('ignore')
here = Path(__file__).parent
inp = json.load(open(here / 'statsbench-reference-input.json'))
out = {}
L = lambda a: [float(v) for v in np.asarray(a, float).ravel()]

# ── mulberry32, the generator used for every bootstrap in the browser ──
M32 = 0xFFFFFFFF
def imul(a, b): return (a * b) & M32
def mulberry32(seed):
    a = seed & M32
    def nxt():
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = a
        t = imul(t ^ (t >> 15), t | 1)
        t = (t ^ ((t + imul(t ^ (t >> 7), t | 61)) & M32)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return nxt
r = mulberry32(1)
assert np.allclose([r() for _ in range(6)], inp['mulberry1'], atol=0, rtol=0), 'mulberry32 port differs'
out['mulberry_ok'] = True

# ── Regression ──
df = pd.read_csv(StringIO(inp['regression']))
cols = ['plan', 'tenure_months', 'ease', 'tasks_per_week']
rhs = 'C(plan) + tenure_months + ease + tasks_per_week'
d = df.dropna(subset=cols + ['satisfaction']).copy()
ols = smf.ols('satisfaction ~ ' + rhs, d).fit()
infl = OLSInfluence(ols)
exog = ols.model.exog
vif = [variance_inflation_factor(exog, j) for j in range(1, exog.shape[1])]
bp = het_breuschpagan(ols.resid, exog)
# Standardised betas from an OLS on z-scored columns (dummies z-scored too, as SPSS does).
Z = pd.DataFrame(exog[:, 1:], columns=ols.model.exog_names[1:])
Zs = (Z - Z.mean()) / Z.std(ddof=1)
ys = (d['satisfaction'] - d['satisfaction'].mean()) / d['satisfaction'].std(ddof=1)
betas = sm.OLS(ys.values, sm.add_constant(Zs.values)).fit().params[1:]
ci = ols.conf_int(0.05)
out['ols'] = {
    'names': ols.model.exog_names, 'b': L(ols.params), 'se': L(ols.bse), 't': L(ols.tvalues), 'p': L(ols.pvalues), 'lo': L(ci[0]), 'hi': L(ci[1]),
    'beta': L(betas), 'r2': ols.rsquared, 'adj': ols.rsquared_adj, 'F': ols.fvalue, 'pF': ols.f_pvalue, 'llf': ols.llf, 'aic': ols.aic, 'bic': ols.bic, 'n': int(ols.nobs),
    'lev': L(infl.hat_matrix_diag[:5]), 'stud': L(infl.resid_studentized_internal[:5]), 'cooks': L(infl.cooks_distance[0][:5]), 'cooksMax': float(infl.cooks_distance[0].max()),
    'vif': L(vif), 'bp': float(bp[0]), 'bpP': float(bp[1]), 'dw': float(durbin_watson(ols.resid)),
}
d['renew'] = (d['renewed'] == 'Yes').astype(int)
lg = smf.logit('renew ~ ' + rhs, d).fit(disp=0, tol=1e-12, maxiter=200)
ci = lg.conf_int(0.05)
pt = lg.pred_table(0.5)
out['logit'] = {
    'b': L(lg.params), 'se': L(lg.bse), 'p': L(lg.pvalues), 'lo': L(ci[0]), 'hi': L(ci[1]), 'llf': lg.llf, 'llnull': lg.llnull, 'llr': lg.llr, 'llrP': lg.llr_pvalue,
    'prsq': lg.prsquared, 'aic': lg.aic, 'bic': lg.bic, 'coxSnell': 1 - np.exp(2 * (lg.llnull - lg.llf) / lg.nobs),
    'nagelkerke': (1 - np.exp(2 * (lg.llnull - lg.llf) / lg.nobs)) / (1 - np.exp(2 * lg.llnull / lg.nobs)), 'table': L(pt),  # rows actual 0/1, cols predicted 0/1
}
# Ordinal: OrderedModel with treatment dummies (no constant).
X = pd.get_dummies(d['plan'], drop_first=True, dtype=float).join(d[['tenure_months', 'ease', 'tasks_per_week']].astype(float))
yo = pd.Series(pd.Categorical(d['recommend'], categories=['Detractor', 'Passive', 'Promoter'], ordered=True), index=X.index)
om = OrderedModel(yo, X, distr='logit')
orf = om.fit(method='bfgs', maxiter=10000, gtol=1e-10, disp=0)
k = X.shape[1]
cuts = om.transform_threshold_params(orf.params)[1:-1]
# Cut-point standard errors: numerical Hessian of statsmodels' log-likelihood in (β, θ) with θ the actual cut points.
def ll_direct(pd_):
    th = pd_[k:]
    par = np.concatenate([pd_[:k], [th[0]], np.log(np.diff(th))])
    return om.loglike(par)
direct = np.concatenate([orf.params[:k], cuts])
cov = np.linalg.inv(-approx_hess3(direct, ll_direct))
counts = pd.Series(yo).value_counts().reindex(['Detractor', 'Passive', 'Promoter']).values
ll0 = float((counts * np.log(counts / counts.sum())).sum())
out['ordinal'] = {
    'names': list(X.columns), 'b': L(orf.params[:k]), 'se': L(orf.bse[:k]), 'p': L(orf.pvalues[:k]), 'cuts': L(cuts), 'cutSe': L(np.sqrt(np.diag(cov))[k:]),
    'llf': orf.llf, 'll0': ll0, 'aic': orf.aic, 'bic': orf.bic,
}
po = smf.glm('support_tickets ~ ' + rhs, d, family=sm.families.Poisson()).fit(tol=1e-12)
ci = po.conf_int(0.05)
out['poisson'] = {'b': L(po.params), 'se': L(po.bse), 'p': L(po.pvalues), 'lo': L(ci[0]), 'hi': L(ci[1]), 'llf': po.llf, 'deviance': po.deviance, 'pearson': po.pearson_chi2, 'aic': po.aic}
po0 = smf.glm('support_tickets ~ 1', d, family=sm.families.Poisson()).fit()
out['poisson']['llnull'] = po0.llf
nb = smf.negativebinomial('support_tickets ~ ' + rhs, d, loglike_method='nb2').fit(disp=0, maxiter=500, method='newton', tol=1e-12)
out['negbin'] = {'b': L(nb.params[:-1]), 'se': L(nb.bse[:-1]), 'p': L(nb.pvalues[:-1]), 'alpha': float(nb.params.iloc[-1]), 'alphaSe': float(nb.bse.iloc[-1]), 'llf': nb.llf, 'llnull': nb.llnull, 'prsq': nb.prsquared, 'aic': nb.aic, 'bic': nb.bic}

# ── Moderation (PROCESS model 1) ──
md = pd.read_csv(StringIO(inp['mediation']))
mo = md.copy()
mo['x'] = mo['ease'] - mo['ease'].mean(); mo['w'] = mo['experience_years'] - mo['experience_years'].mean()
mf = smf.ols('intent ~ x * w', mo).fit()
V = mf.cov_params().values; b = mf.params.values
tc = stats.t.ppf(0.975, mf.df_resid)
wsd = mo['experience_years'].std(ddof=1)
probe = [-wsd, 0.0, wsd]
slopes = []
for w in probe:
    tt = mf.t_test(np.array([[0, 1, 0, w]]))
    slopes.append({'est': float(tt.effect[0]), 'se': float(tt.sd[0][0]), 'p': float(tt.pvalue)})
roots = np.roots([b[3] ** 2 - tc ** 2 * V[3, 3], 2 * (b[1] * b[3] - tc ** 2 * V[1, 3]), b[1] ** 2 - tc ** 2 * V[1, 1]])
roots = np.sort(np.real(roots[np.isreal(roots)])) + mo['experience_years'].mean()
jn_t = [float(mf.t_test(np.array([[0, 1, 0, r - mo['experience_years'].mean()]])).tvalue[0][0]) for r in roots]
r2_main = smf.ols('intent ~ x + w', mo).fit().rsquared
out['moderation'] = {'b': L(b), 'se': L(mf.bse), 'p': L(mf.pvalues), 'r2': mf.rsquared, 'dR2': mf.rsquared - r2_main, 'slopes': slopes, 'jn': L(roots), 'jnT': jn_t, 'tcrit': float(tc),
                     'pct': L(np.percentile(mo['experience_years'], [16, 50, 84]))}

# ── Mediation (PROCESS model 4): pingouin, statsmodels, and a replay of the browser's bootstrap ──
med, dist = pg.mediation_analysis(data=md, x='tutorial', m='confidence', y='intent', n_boot=2000, seed=42, return_dist=True)
med = med.set_index('path')
fa = smf.ols('confidence ~ tutorial', md).fit(); fb = smf.ols('intent ~ tutorial + confidence', md).fit()
sob_se = np.sqrt(fb.params['confidence'] ** 2 * fa.bse['tutorial'] ** 2 + fa.params['tutorial'] ** 2 * fb.bse['confidence'] ** 2)
arr = md[['tutorial', 'confidence', 'intent']].to_numpy(float)
def ab_of(rows):
    a = np.linalg.lstsq(np.c_[np.ones(len(rows)), rows[:, 0]], rows[:, 1], rcond=None)[0][1]
    bb = np.linalg.lstsq(np.c_[np.ones(len(rows)), rows[:, 0], rows[:, 1]], rows[:, 2], rcond=None)[0][2]
    return a * bb
rr = mulberry32(1); n = len(arr); B = 2000
boot = np.array([ab_of(arr[[int(rr() * n) for _ in range(n)]]) for _ in range(B)])
est = ab_of(arr)
out['mediation'] = {
    'a': float(med.loc['confidence ~ X', 'coef']), 'aSe': float(med.loc['confidence ~ X', 'se']), 'b': float(fb.params['confidence']), 'bSe': float(fb.bse['confidence']),
    'direct': float(med.loc['Direct', 'coef']), 'directSe': float(med.loc['Direct', 'se']), 'directP': float(med.loc['Direct', 'pval']), 'total': float(med.loc['Total', 'coef']), 'totalP': float(med.loc['Total', 'pval']),
    'indirect': float(med.loc['Indirect', 'coef']), 'pgCI': [float(med.loc['Indirect', 'CI2.5']), float(med.loc['Indirect', 'CI97.5'])], 'pgSe': float(med.loc['Indirect', 'se']),
    'pgP': float(med.loc['Indirect', 'pval']), 'pgDist': L(dist), 'sobelSe': float(sob_se), 'sobelZ': float(est / sob_se),
    'replayB': B, 'replayPct': L(np.percentile(boot, [2.5, 97.5])), 'replaySe': float(boot.std(ddof=1)), 'replayFirst': L(boot[:3]),
}

# ── Resampling: replay the browser's bootstrap in numpy, then scipy's own BCa code on those replicates ──
A = np.array(inp['timesA']); Bv = np.array(inp['timesB']); P = np.array(inp['pairs'], float); S01 = np.array(inp['successes'], float)
def boot_rep(kind, data, B, seed, fn):
    rr = mulberry32(seed); reps = np.empty(B)
    for b in range(B):
        if kind == 'one': reps[b] = fn(data[0][[int(rr() * len(data[0])) for _ in range(len(data[0]))]])
        elif kind == 'two':
            ia = [int(rr() * len(data[0])) for _ in range(len(data[0]))]; ib = [int(rr() * len(data[1])) for _ in range(len(data[1]))]
            reps[b] = fn(data[0][ia], data[1][ib])
        else:
            ii = [int(rr() * len(data[0])) for _ in range(len(data[0]))]; reps[b] = fn(data[0][ii], data[1][ii])
    return reps
cases = {
    'mean': ('one', (A,), lambda x, axis=-1: np.mean(x, axis=axis)),
    'median': ('one', (A,), lambda x, axis=-1: np.median(x, axis=axis)),
    'prop': ('one', (S01,), lambda x, axis=-1: np.mean(x, axis=axis)),
    'diffmean': ('two', (A, Bv), lambda x, y, axis=-1: np.mean(x, axis=axis) - np.mean(y, axis=axis)),
    'diffmedian': ('two', (A, Bv), lambda x, y, axis=-1: np.median(x, axis=axis) - np.median(y, axis=axis)),
    'corr': ('paired', (P[:, 0], P[:, 1]), None),
}
def pear(x, y, axis=-1):
    xm = x - x.mean(axis=axis, keepdims=True); ym = y - y.mean(axis=axis, keepdims=True)
    return (xm * ym).sum(axis=axis) / np.sqrt((xm ** 2).sum(axis=axis) * (ym ** 2).sum(axis=axis))
res = {}
for key, (kind, data, fn) in cases.items():
    fn = fn or pear
    reps = boot_rep(kind, data, 3000, 7, lambda *a: fn(*a))
    if kind == 'paired':  # scipy jackknifes pairs: the statistic is evaluated on resampled pair indices
        x0, y0 = data; bdata, bfn = (np.arange(len(x0)),), (lambda i, axis=-1: pear(x0[i], y0[i], axis=axis))
    else:
        bdata, bfn = data, fn
    a1, a2, ahat = _bca_interval(bdata, bfn, axis=-1, alpha=0.025, theta_hat_b=reps, batch=None, xp=np)
    bca = [float(np.percentile(reps, float(a1) * 100)), float(np.percentile(reps, float(a2) * 100))]
    sb = stats.bootstrap(data, fn, paired=(kind == 'paired'), vectorized=True, n_resamples=30000, method='BCa', rng=np.random.default_rng(0))
    res[key] = {'est': float(fn(*data)), 'pct': L(np.percentile(reps, [2.5, 97.5])), 'bca': bca, 'a': float(ahat), 'se': float(reps.std(ddof=1)),
                'scipyBca': [float(sb.confidence_interval.low), float(sb.confidence_interval.high)], 'scipySe': float(sb.standard_error)}
out['bootstrap'] = res
# Permutation tests: exact cases (all arrangements) match scipy exactly; large cases are Monte Carlo.
g1 = np.array([12.1, 15.3, 9.8, 20.4, 17.2, 14.0]); g2 = np.array([22.5, 19.1, 17.8, 25.2, 14.9, 21.0])
one = np.array([0.8, -0.3, 1.9, 2.4, 0.2, 1.1, -0.6, 1.5, 0.9, 2.2])
px = np.array([3.1, 4.5, 2.2, 5.0, 4.1, 3.8, 2.9]); py = np.array([60, 72, 51, 80, 70, 62, 58.0])
perm = {
    'two': {'a': L(g1), 'b': L(g2), 'p': float(stats.permutation_test((g1, g2), lambda x, y, axis=-1: np.mean(x, axis=axis) - np.mean(y, axis=axis), vectorized=True, n_resamples=9999, permutation_type='independent').pvalue)},
    'twoMedian': {'p': float(stats.permutation_test((g1, g2), lambda x, y, axis=-1: np.median(x, axis=axis) - np.median(y, axis=axis), vectorized=True, n_resamples=9999, permutation_type='independent').pvalue)},
    'one': {'x': L(one), 'p': float(stats.permutation_test((one,), lambda x, axis=-1: np.mean(x, axis=axis), vectorized=True, n_resamples=9999, permutation_type='samples').pvalue)},
    'corr': {'x': L(px), 'y': L(py), 'p': float(stats.permutation_test((px,), lambda x: stats.pearsonr(x, py).statistic, n_resamples=9999, permutation_type='pairings').pvalue)},
    'bigTwo': {'p': float(stats.permutation_test((A, Bv), lambda x, y, axis=-1: np.mean(x, axis=axis) - np.mean(y, axis=axis), vectorized=True, n_resamples=200000, permutation_type='independent', rng=np.random.default_rng(1)).pvalue)},
}
out['permutation'] = perm

# ── Distribution check ──
x = np.array(inp['distribution'], float)
rg = np.random.default_rng(5)
sw_sets = {'example': x, 'n3': np.array([1.2, 3.4, 2.0]), 'n4': np.array([1, 2, 2.5, 9.0]), 'n5': np.array([3.1, 2.2, 5.6, 4.0, 3.3]), 'n7': np.round(rg.normal(10, 2, 7), 2),
           'n11': np.round(rg.exponential(5, 11), 2), 'n12': np.round(rg.normal(0, 1, 12), 3), 'n25': np.round(rg.lognormal(3, 0.6, 25), 2), 'n100u': np.round(rg.uniform(0, 1, 100), 4),
           'n500': np.round(rg.normal(50, 10, 500), 3), 'logs': np.log(x)}
out['shapiro'] = {k: {'x': L(v), 'W': float(stats.shapiro(v).statistic), 'p': float(stats.shapiro(v).pvalue)} for k, v in sw_sets.items()}
lf = lilliefors(x, dist='norm', pvalmethod='table')
out['lillie'] = {k: [float(v) for v in lilliefors(sw_sets[k], dist='norm', pvalmethod='table')] for k in ['n12', 'n25', 'n100u', 'logs', 'n500']}
adn = normal_ad(x)
s_, loc_, scale_ = stats.lognorm.fit(x, floc=0)
lx = np.log(x); tci = stats.t.interval(0.95, len(x) - 1, loc=lx.mean(), scale=stats.sem(lx))
grid = np.linspace(x.min(), x.max(), 7)
pp = stats.probplot(x)
out['distribution'] = {
    'mean': float(x.mean()), 'sd': float(x.std(ddof=1)), 'q': L(np.percentile(x, [25, 50, 75])), 'g1': float(stats.skew(x)), 'G1': float(stats.skew(x, bias=False)),
    'g2': float(stats.kurtosis(x)), 'G2': float(stats.kurtosis(x, bias=False)), 'ksD': float(lf[0]), 'ksP': float(lf[1]), 'adA2': float(stats.anderson(x).statistic),
    'adA2sm': float(adn[0]), 'adP': float(adn[1]), 'lnS': float(s_), 'lnScale': float(scale_), 'gm': float(stats.gmean(x)), 'gmCI': L(np.exp(tci)),
    'llNorm': float(stats.norm.logpdf(x, x.mean(), x.std()).sum()), 'llLog': float(stats.lognorm.logpdf(x, s_, 0, scale_).sum()),
    'boxcox': float(stats.boxcox_normmax(x, method='mle')), 'grid': L(grid), 'kdeScott': L(stats.gaussian_kde(x)(grid)), 'kdeSilverman': L(stats.gaussian_kde(x, bw_method='silverman')(grid)),
    'ppSlope': float(pp[1][0]), 'ppIntercept': float(pp[1][1]), 'ppR': float(pp[1][2]), 'ppOsm': L(pp[0][0][:3]), 'histEdges': len(np.histogram_bin_edges(x, bins='auto')) - 1,
    'sqrtSkew': float(stats.skew(np.sqrt(x), bias=False)), 'sqrtW': float(stats.shapiro(np.sqrt(x)).statistic), 'invW': float(stats.shapiro(-1 / x).statistic),
}
for k_, v in [('skewed', np.array(sw_sets['n25'])), ('uniform', sw_sets['n100u'])]:
    a2, pv = normal_ad(v); out['distribution'][f'ad_{k_}'] = [float(a2), float(pv)]

# ── Survival ──
sv = pd.read_csv(StringIO(inp['survival']))
def km_dict(t, e):
    km = KaplanMeierFitter().fit(t, e)
    sf = km.survival_function_.iloc[:, 0]; ci = km.confidence_interval_
    evt = km.event_table
    times = [float(tt) for tt in evt.index if evt.loc[tt, 'observed'] > 0]
    mci = median_survival_times(km.confidence_interval_)
    return {'times': times, 'S': [float(sf.loc[tt]) for tt in times], 'lo': [float(ci.iloc[:, 0].loc[tt]) for tt in times], 'hi': [float(ci.iloc[:, 1].loc[tt]) for tt in times],
            'median': float(km.median_survival_time_), 'medianCI': [float(mci.iloc[0, 0]), float(mci.iloc[0, 1])], 'rmst60': float(restricted_mean_survival_time(km, t=60)),
            'rmst30': float(restricted_mean_survival_time(km, t=30))}
out['survival'] = {g: km_dict(sv.loc[sv.onboarding == g, 'days'], sv.loc[sv.onboarding == g, 'adopted']) for g in ['Old flow', 'New flow']}
out['survival']['all'] = km_dict(sv['days'], sv['adopted'])
na = NelsonAalenFitter(nelson_aalen_smoothing=False).fit(sv['days'], sv['adopted'])
ch = na.cumulative_hazard_.iloc[:, 0]
out['survival']['naTimes'] = out['survival']['all']['times'][:8]; out['survival']['naH'] = [float(ch.loc[t]) for t in out['survival']['naTimes']]
o, nw = sv.onboarding == 'Old flow', sv.onboarding == 'New flow'
lr = logrank_test(sv.days[o], sv.days[nw], sv.adopted[o], sv.adopted[nw])
out['survival']['logrank'] = {'chi2': float(lr.test_statistic), 'p': float(lr.p_value)}
# Three groups (a small published-style example: the lifelines waltons-like layout, simulated here with a seed).
rg = np.random.default_rng(9)
t3 = np.ceil(np.concatenate([rg.exponential(20, 25), rg.exponential(30, 25), rg.exponential(45, 25)]))
e3 = (t3 <= 50).astype(int); t3 = np.minimum(t3, 50)
g3 = np.repeat(['A', 'B', 'C'], 25)
ml = multivariate_logrank_test(t3, g3, e3)
pw = pairwise_logrank_test(t3, g3, e3)
out['survival3'] = {'t': L(t3), 'e': [int(v) for v in e3], 'g': list(g3), 'chi2': float(ml.test_statistic), 'p': float(ml.p_value),
                    'pairs': [[a, b_, float(pw.summary.loc[(a, b_), 'test_statistic']), float(pw.summary.loc[(a, b_), 'p'])] for a, b_ in [('A', 'B'), ('A', 'C'), ('B', 'C')]]}

(here / 'statsbench-reference.json').write_text(json.dumps(out, indent=1) + '\n')
print('wrote statsbench-reference.json')
