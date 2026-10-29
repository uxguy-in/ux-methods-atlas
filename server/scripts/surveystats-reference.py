# Reference values for server/scripts/check-surveystats.js (factor analysis, scale validity, key drivers, crosstabs).
# Reads the example data written by `node server/scripts/surveystats-dump.js` (surveystats-input.json) and writes
# surveystats-reference.json.
#
# Packages: numpy 2.5, scipy 1.18, statsmodels 0.15, factor_analyzer 0.5.1, semopy 2.3.11, pingouin 0.7, relativeImp 0.0.2.
# factor_analyzer 0.5.1 calls scikit-learn's check_array(force_all_finite=...), removed in scikit-learn 1.6, so run
# this in a virtual environment with scikit-learn pinned:
#   python3 -m venv /tmp/sv && /tmp/sv/bin/pip install factor_analyzer==0.5.1 scikit-learn==1.5.2 semopy pingouin relativeImp statsmodels
#   /tmp/sv/bin/python server/scripts/surveystats-reference.py
import json, os, itertools, warnings
import numpy as np
import pandas as pd
from scipy import stats, optimize
from scipy.stats import multivariate_normal, ncx2
import statsmodels.api as sm
from statsmodels.stats.contingency_tables import Table, StratifiedTable
from statsmodels.stats.outliers_influence import variance_inflation_factor
from statsmodels.stats.multitest import multipletests
from factor_analyzer import FactorAnalyzer
from factor_analyzer.factor_analyzer import calculate_kmo, calculate_bartlett_sphericity
from factor_analyzer.rotator import Rotator
import pingouin as pg
import semopy
from relativeImp import relativeImp

warnings.filterwarnings('ignore')
here = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(here, 'surveystats-input.json')))
out = {}
L = lambda a: np.asarray(a, dtype=float).tolist()

# ── Factor analysis ──
H = np.array(D['harman']['R']); nH = D['harman']['n']
X = np.array(D['fa']['X'], dtype=float); R = np.corrcoef(X.T); n = X.shape[0]; p = R.shape[0]

def kmo_from_R(R):
    inv = np.linalg.inv(R); Q = -inv / np.sqrt(np.outer(np.diag(inv), np.diag(inv)))
    np.fill_diagonal(Q, 0); R0 = R.copy(); np.fill_diagonal(R0, 0)
    return (R0**2).sum() / ((R0**2).sum() + (Q**2).sum()), (R0**2).sum(0) / ((R0**2).sum(0) + (Q**2).sum(0))
def bartlett_from_R(R, n):
    p = R.shape[0]; chi = -(n - 1 - (2 * p + 5) / 6) * np.log(np.linalg.det(R)); df = p * (p - 1) / 2
    return chi, df, stats.chi2.sf(chi, df)

kmo_per, kmo_all = calculate_kmo(pd.DataFrame(X))
bchi, bp = calculate_bartlett_sphericity(pd.DataFrame(X))
out['fa_kmo'] = float(kmo_all); out['fa_msa'] = L(kmo_per); out['fa_bartlett'] = [float(bchi), float(bp)]
out['fa_det'] = float(np.linalg.det(R)); out['fa_smc'] = L(1 - 1 / np.diag(np.linalg.inv(R)))
hk, hm = kmo_from_R(H); out['h_kmo'] = float(hk); out['h_msa'] = L(hm); out['h_bartlett'] = list(map(float, bartlett_from_R(H, nH)))
out['h_eig'] = L(np.sort(np.linalg.eigvalsh(H))[::-1])
out['fa_eig'] = L(np.sort(np.linalg.eigvalsh(R))[::-1])

def map_test(R):
    p = R.shape[0]; w, V = np.linalg.eigh(R); idx = np.argsort(w)[::-1]; w = w[idx]; V = V[:, idx]
    sq, q4 = [], []
    for m in range(p - 1):
        A = V[:, :m] * np.sqrt(w[:m]); C = R - A @ A.T; d = np.diag(C)
        P = C / np.sqrt(np.outer(d, d)); off = P[~np.eye(p, dtype=bool)]
        sq.append((off**2).mean()); q4.append((off**4).mean())
    return sq, q4
sq, q4 = map_test(H); out['h_map'] = [L(sq), L(q4), int(np.argmin(sq)), int(np.argmin(q4))]
sq, q4 = map_test(R); out['fa_map'] = [L(sq), L(q4), int(np.argmin(sq)), int(np.argmin(q4))]

# Parallel analysis by simulation (numpy's generator, 3000 draws): mean and 95th percentile of the eigenvalues of R and
# of R with squared multiple correlations on the diagonal.
def parallel(n, p, iters=3000, seed=1):
    rg = np.random.default_rng(seed); pc, fa = [], []
    for _ in range(iters):
        Z = rg.standard_normal((n, p)); C = np.corrcoef(Z.T)
        pc.append(np.sort(np.linalg.eigvalsh(C))[::-1])
        Cr = C.copy(); np.fill_diagonal(Cr, 1 - 1 / np.diag(np.linalg.inv(C)))
        fa.append(np.sort(np.linalg.eigvalsh(Cr))[::-1])
    pc, fa = np.array(pc), np.array(fa)
    return dict(pcaMean=L(pc.mean(0)), pca95=L(np.percentile(pc, 95, axis=0)), faMean=L(fa.mean(0)), fa95=L(np.percentile(fa, 95, axis=0)))
out['fa_parallel'] = parallel(n, p); out['h_parallel'] = parallel(nH, 8)

# Extraction: factor_analyzer as published (L-BFGS-B, default tolerances) and a tight scipy re-fit of the same
# objectives with analytic gradients, so small optimiser differences can be told apart from real ones.
def fa_fit(Rm, k, method, rotation=None, corr=True):
    fa = FactorAnalyzer(n_factors=k, method=method, rotation=rotation, is_corr_matrix=corr)
    fa.fit(Rm if corr else Rm); return fa
def uls_tight(R, k):
    p = R.shape[0]
    def fg(psi):
        Rs = R.copy(); np.fill_diagonal(Rs, 1 - psi); w, V = np.linalg.eigh(Rs); w = w[::-1]; V = V[:, ::-1]
        f = (w[k:]**2).sum() + (np.minimum(w[:k], 0)**2).sum()
        m = (V[:, :k]**2 * np.maximum(w[:k], 0)).sum(1); return f, -2 * (1 - psi - m)
    start = 1 - (1 - 1 / np.diag(np.linalg.inv(R)))
    res = optimize.minimize(fg, start, jac=True, method='L-BFGS-B', bounds=[(0.005, 1)] * p, options=dict(ftol=1e-16, gtol=1e-12, maxiter=10000))
    Rs = R.copy(); np.fill_diagonal(Rs, 1 - res.x); w, V = np.linalg.eigh(Rs); w = w[::-1][:k]; V = V[:, ::-1][:, :k]
    return V * np.sqrt(np.maximum(w, 0)), res.x
def ml_tight(R, k):
    p = R.shape[0]
    def fg(psi):
        s = 1 / np.sqrt(psi); Ss = R * np.outer(s, s); w, V = np.linalg.eigh(Ss); w = w[::-1]; V = V[:, ::-1]
        f = -(np.log(w[k:]) - w[k:]).sum() + k - p
        m = (V[:, :k]**2 * np.maximum(w[:k] - 1, 0)).sum(1) * psi; return f, (m + psi - 1) / psi**2
    start = 1 - (1 - 1 / np.diag(np.linalg.inv(R)))
    res = optimize.minimize(fg, start, jac=True, method='L-BFGS-B', bounds=[(0.005, 1)] * p, options=dict(ftol=1e-16, gtol=1e-12, maxiter=10000))
    s = 1 / np.sqrt(res.x); Ss = R * np.outer(s, s); w, V = np.linalg.eigh(Ss); w = w[::-1][:k]; V = V[:, ::-1][:, :k]
    return np.sqrt(res.x)[:, None] * V * np.sqrt(np.maximum(w - 1, 0)), res.x, res.fun
def paf_spss(R, k, max_iter=25, tol=1e-3):
    h = 1 - 1 / np.diag(np.linalg.inv(R)); it = 0
    for it in range(1, max_iter + 1):
        Rs = R.copy(); np.fill_diagonal(Rs, h); w, V = np.linalg.eigh(Rs); w = w[::-1][:k]; V = V[:, ::-1][:, :k]
        Lm = V * np.sqrt(np.maximum(w, 0)); hn = (Lm**2).sum(1); d = np.abs(hn - h).max(); h = hn
        if d < tol: break
    return Lm, it
def canon(Lm):  # sign so each column sums positive; order by sum of squares
    Lm = Lm * np.sign(Lm.sum(0)); return Lm[:, np.argsort(-(Lm**2).sum(0))]

for tag, Rm, nn, k in (('h', H, nH, 2), ('fa', R, n, 3)):
    Lu, psi = uls_tight(Rm, k); out[f'{tag}_minres'] = L(canon(Lu)); out[f'{tag}_minres_psi'] = L(psi)
    Lm, psim, F = ml_tight(Rm, k); out[f'{tag}_ml'] = L(canon(Lm)); out[f'{tag}_ml_F'] = float(F)
    pp = Rm.shape[0]; dof = ((pp - k)**2 - (pp + k)) / 2; st = (nn - 1 - (2 * pp + 5) / 6 - 2 * k / 3) * F
    out[f'{tag}_ml_test'] = [float(st), dof, float(stats.chi2.sf(st, dof))]
    Lp, it = paf_spss(Rm, k); out[f'{tag}_paf'] = L(canon(Lp)); out[f'{tag}_paf_iter'] = it
    Lp1000, _ = paf_spss(Rm, k, 1000, 1e-10); out[f'{tag}_paf_conv'] = L(canon(Lp1000))
    # factor_analyzer end to end
    out[f'{tag}_fa_minres'] = L(canon(fa_fit(Rm, k, 'minres').loadings_))
    out[f'{tag}_fa_ml'] = L(canon(fa_fit(Rm, k, 'ml').loadings_))
    # Rotations of the tight minres solution with factor_analyzer's Rotator (tight tolerances)
    for rot in ('varimax', 'promax', 'oblimin'):
        r = Rotator(method=rot, tol=1e-12, max_iter=100000); Lr = r.fit_transform(Lu.copy())
        sgn = np.sign(Lr.sum(0)); order = np.argsort(-((Lr * sgn)**2).sum(0))
        out[f'{tag}_{rot}'] = L((Lr * sgn)[:, order])
        if r.phi_ is not None:
            Ph = np.diag(sgn) @ r.phi_ @ np.diag(sgn); out[f'{tag}_{rot}_phi'] = L(Ph[np.ix_(order, order)])
            out[f'{tag}_{rot}_structure'] = L(((Lr * sgn) @ (np.diag(sgn) @ r.phi_ @ np.diag(sgn)))[:, order])
    fa_full = FactorAnalyzer(n_factors=k, method='minres', rotation='oblimin', is_corr_matrix=True); fa_full.fit(Rm)
    out[f'{tag}_fa_oblimin_end_to_end'] = L(canon(fa_full.loadings_))
    out[f'{tag}_fa_variance'] = L(fa_fit(Rm, k, 'minres').get_factor_variance()[0])

# Cronbach's alpha (pingouin) for the example's three factors as assigned by the tool.
groups = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10]]
out['fa_alpha'] = [float(pg.cronbach_alpha(pd.DataFrame(X[:, g]))[0]) for g in groups]

# Bivariate normal CDF (scipy) and polychoric correlations (two-step ML, scipy) for three item pairs.
out['bvn'] = [float(multivariate_normal(mean=[0, 0], cov=[[1, r], [r, 1]]).cdf([h, k_])) for h, k_, r in ((0.3, -0.5, 0.4), (-1.2, 0.8, -0.7), (1.5, 1.1, 0.95), (0.2, 0.1, -0.96), (-0.4, -0.9, 0.2))]
C = np.array(D['fa']['cats'], dtype=float).T
def polychoric(a, b):
    la = np.unique(a); lb = np.unique(b); a = np.searchsorted(la, a); b = np.searchsorted(lb, b)
    def th(x, L_):
        c = np.cumsum(np.bincount(x, minlength=L_))[:-1] / len(x); return np.concatenate([[-np.inf], stats.norm.ppf(c), [np.inf]])
    ta, tb = th(a, len(la)), th(b, len(lb)); N = np.zeros((len(la), len(lb)))
    for x, y in zip(a, b): N[x, y] += 1
    def F(h, k_, r):
        if h == -np.inf or k_ == -np.inf: return 0.0
        if h == np.inf and k_ == np.inf: return 1.0
        if h == np.inf: return stats.norm.cdf(k_)
        if k_ == np.inf: return stats.norm.cdf(h)
        return multivariate_normal(mean=[0, 0], cov=[[1, r], [r, 1]]).cdf([h, k_])
    def nll(r):
        s = 0
        for i in range(len(la)):
            for j in range(len(lb)):
                if N[i, j]: s += N[i, j] * np.log(max(F(ta[i + 1], tb[j + 1], r) - F(ta[i], tb[j + 1], r) - F(ta[i + 1], tb[j], r) + F(ta[i], tb[j], r), 1e-300))
        return -s
    return optimize.minimize_scalar(nll, bounds=(-0.999, 0.999), method='bounded', options=dict(xatol=1e-9)).x
out['polychoric'] = [float(polychoric(C[:, i], C[:, j])) for i, j in ((0, 1), (0, 4), (8, 11))]

# ── Scale validity ──
SX = np.array(D['sv']['X'], dtype=float); SR = np.corrcoef(SX.T); ns = SX.shape[0]
sg = [g['items'] for g in D['sv']['groups']]; names = [g['name'] for g in D['sv']['groups']]
cols = [f'x{i}' for i in range(SX.shape[1])]; df = pd.DataFrame(SX, columns=cols)
desc = '\n'.join(f'F{c} =~ ' + ' + '.join(cols[i] for i in g) for c, g in enumerate(sg))
m = semopy.Model(desc); m.fit(df, obj='MLW')
est = m.inspect(std_est=True)
load = est[est['op'] == '~'].copy()
std = np.zeros(SX.shape[1])
for _, row in load.iterrows(): std[cols.index(row['lval'])] = row['Est. Std']
cov = est[(est['op'] == '~~') & (est['lval'].str.startswith('F')) & (est['rval'].str.startswith('F')) & (est['lval'] != est['rval'])]
Phi = np.eye(len(sg))
for _, row in cov.iterrows(): a, b = int(row['lval'][1:]), int(row['rval'][1:]); Phi[a, b] = Phi[b, a] = row['Est. Std']
st = semopy.calc_stats(m).T
out['sv_semopy'] = dict(std=L(std), phi=L(Phi), chi2=float(st.loc['chi2'].iloc[0]), dof=float(st.loc['DoF'].iloc[0]), chi2_base=float(st.loc['chi2 Baseline'].iloc[0]), dof_base=float(st.loc['DoF Baseline'].iloc[0]),
                        cfi=float(st.loc['CFI'].iloc[0]), tli=float(st.loc['TLI'].iloc[0]), rmsea=float(st.loc['RMSEA'].iloc[0]), n=ns, fun=float(m.last_result.fun))
lam = [std[g] for g in sg]
out['sv_cr'] = [float(l.sum()**2 / (l.sum()**2 + (1 - l**2).sum())) for l in lam]
out['sv_ave'] = [float((l**2).mean()) for l in lam]
out['sv_h'] = [float(1 / (1 + 1 / (l**2 / (1 - l**2)).sum())) for l in lam]
def htmt(R, groups):
    k = len(groups); M = np.eye(k)
    w = [R[np.ix_(g, g)][np.triu_indices(len(g), 1)].mean() for g in groups]
    for a in range(k):
        for b in range(a + 1, k): M[a, b] = M[b, a] = R[np.ix_(groups[a], groups[b])].mean() / np.sqrt(w[a] * w[b])
    return M
out['sv_htmt'] = L(htmt(SR, sg))
# Hand-typed loadings (mode a): CR, AVE, H by numpy
la = [np.array([0.84, 0.81, 0.77, 0.70]), np.array([0.82, 0.79, 0.74, 0.66]), np.array([0.80, 0.76, 0.69]), np.array([0.88, 0.85, 0.80])]
out['sv_typed'] = [[float(l.sum()**2 / (l.sum()**2 + (1 - l**2).sum())), float((l**2).mean()), float(1 / (1 + 1 / (l**2 / (1 - l**2)).sum()))] for l in la]
# RMSEA 90% CI from scipy's noncentral chi-square (root finding), CFI, TLI, p-close: two textbook cases.
def fit(chi2, df_, n_, chi2b, dfb):
    f = lambda lam, q: ncx2.cdf(chi2, df_, lam) - q if lam > 0 else stats.chi2.cdf(chi2, df_) - q
    lo = optimize.brentq(lambda l: f(l, 0.95), 1e-12, 10 * chi2 + 100) if stats.chi2.cdf(chi2, df_) > 0.95 else 0.0
    hi = optimize.brentq(lambda l: f(l, 0.05), 1e-12, 10 * chi2 + 100) if stats.chi2.cdf(chi2, df_) > 0.05 else 0.0
    rm = np.sqrt(max(chi2 - df_, 0) / (df_ * (n_ - 1)))
    return dict(rmsea=rm, lo=np.sqrt(lo / (df_ * (n_ - 1))), hi=np.sqrt(hi / (df_ * (n_ - 1))), pclose=1 - ncx2.cdf(chi2, df_, 0.0025 * df_ * (n_ - 1)),
                cfi=1 - max(chi2 - df_, 0) / max(chi2b - dfb, chi2 - df_, 0), tli=(chi2b / dfb - chi2 / df_) / (chi2b / dfb - 1), p=stats.chi2.sf(chi2, df_))
out['fit_cases'] = [dict(args=[85.3, 48, 250, 1450.2, 66], **{k: float(v) for k, v in fit(85.3, 48, 250, 1450.2, 66).items()}),
                    dict(args=[312.7, 101, 180, 2210.0, 120], **{k: float(v) for k, v in fit(312.7, 101, 180, 2210.0, 120).items()})]
out['ncx2'] = [float(ncx2.cdf(60, 40, 12.5)), float(ncx2.cdf(5, 3, 0.7)), float(ncx2.cdf(300, 250, 80))]

# ── Key drivers ──
KX = np.array(D['kd']['X'], dtype=float); y = KX[:, 0]; Xd = KX[:, 2:]; kn = D['kd']['names'][2:]
ols = sm.OLS(y, sm.add_constant(Xd)).fit()
ci = ols.conf_int(0.05)
out['kd_ols'] = dict(b=L(ols.params), se=L(ols.bse), p=L(ols.pvalues), lo=L(ci[:, 0]), hi=L(ci[:, 1]), r2=float(ols.rsquared), adj=float(ols.rsquared_adj), F=float(ols.fvalue), Fp=float(ols.f_pvalue))
ex = sm.add_constant(Xd); out['kd_vif'] = [float(variance_inflation_factor(ex, j)) for j in range(1, ex.shape[1])]
out['kd_beta'] = L(ols.params[1:] * Xd.std(0, ddof=1) / y.std(ddof=1))
Rall = np.corrcoef(np.column_stack([y, Xd]).T); Rxx = Rall[1:, 1:]; rxy = Rall[1:, 0]
rel = relativeImp(pd.DataFrame(np.column_stack([y, Xd]), columns=['y'] + kn), 'y', kn)
out['kd_rw'] = L(rel['rawRelaImpt'].values)
def r2s(idx): return 0.0 if not idx else float(rxy[idx] @ np.linalg.solve(Rxx[np.ix_(idx, idx)], rxy[idx]))
def shapley(pn, fn):
    gd = np.zeros(pn); from math import factorial as fa
    for j in range(pn):
        others = [i for i in range(pn) if i != j]
        for s in range(pn):
            for S in itertools.combinations(others, s): gd[j] += fa(s) * fa(pn - s - 1) / fa(pn) * (fn(list(S) + [j]) - fn(list(S)))
    return gd
out['kd_dom'] = L(shapley(Xd.shape[1], r2s))
yb = (y >= 9).astype(float)
lg = sm.Logit(yb, sm.add_constant(Xd)).fit(disp=0, tol=1e-12, maxiter=200)
out['kd_logit'] = dict(b=L(lg.params), se=L(lg.bse), p=L(lg.pvalues), mcf=float(lg.prsquared), llf=float(lg.llf), llnull=float(lg.llnull))
Xs = Xd[:, :4]
def mcf(idx):
    if not idx: return 0.0
    f_ = sm.Logit(yb, sm.add_constant(Xs[:, idx])).fit(disp=0, tol=1e-12, maxiter=200); return float(f_.prsquared)
out['kd_logit_dom4'] = L(shapley(4, mcf))

# ── Crosstabs ──
lay = [np.array(t) for t in D['ct']['onboardingByDevice']]
pooled = sum(lay)
c2 = stats.chi2_contingency(pooled, correction=False); c2y = stats.chi2_contingency(pooled, correction=True)
out['ct_pooled'] = dict(chi2=float(c2[0]), p=float(c2[1]), yates=float(c2y[0]), yatesP=float(c2y[1]), fisher=float(stats.fisher_exact(pooled)[1]), resid=L(Table(pooled).standardized_resids))
for name, T in (('tenure', np.array(D['ct']['tenureSat']['N'])), ('plan', np.array(D['ct']['planSat']['N']))):
    c = stats.chi2_contingency(T, correction=False); g = stats.chi2_contingency(T, correction=False, lambda_='log-likelihood')
    tab = Table(T); oa = tab.test_ordinal_association()
    pz = 2 * stats.norm.sf(np.abs(np.asarray(tab.standardized_resids).ravel()))
    out[f'ct_{name}'] = dict(chi2=float(c[0]), p=float(c[1]), df=int(c[2]), E=L(c[3]), g2=float(g[0]), gp=float(g[1]), resid=L(tab.standardized_resids),
                             holm=L(multipletests(pz, method='holm')[1]), cramer=float(stats.contingency.association(T, method='cramer')),
                             lbl_z=float(oa.zscore), lbl_p=float(oa.pvalue))
    nn = T.sum(); mm = min(T.shape) - 1; dfc = (T.shape[0] - 1) * (T.shape[1] - 1); x2 = c[0]
    lo = optimize.brentq(lambda l: ncx2.cdf(x2, dfc, l) - 0.975, 1e-9, 10 * x2 + 100) if stats.chi2.cdf(x2, dfc) > 0.975 else 0
    hi = optimize.brentq(lambda l: ncx2.cdf(x2, dfc, l) - 0.025, 1e-9, 10 * x2 + 100)
    out[f'ct_{name}']['v_ci'] = [float(np.sqrt((lo + dfc) / (nn * mm))) if lo > 0 else 0.0, float(np.sqrt((hi + dfc) / (nn * mm)))]
st_ = StratifiedTable(lay)
out['ct_cmh'] = dict(or_=float(st_.oddsratio_pooled), se=float(st_.logodds_pooled_se), ci=L(st_.oddsratio_pooled_confint()),
                     chi2=float(st_.test_null_odds(correction=False).statistic), p=float(st_.test_null_odds(correction=False).pvalue),
                     chi2c=float(st_.test_null_odds(correction=True).statistic), bd=float(st_.test_equal_odds(adjust=False).statistic), bdp=float(st_.test_equal_odds(adjust=False).pvalue),
                     tarone=float(st_.test_equal_odds(adjust=True).statistic), taronep=float(st_.test_equal_odds(adjust=True).pvalue))
# A small 3-stratum case with unequal odds ratios, for Breslow-Day.
lay3 = [np.array([[12, 5], [6, 14]]), np.array([[4, 9], [10, 8]]), np.array([[20, 6], [7, 9]])]
s3 = StratifiedTable(lay3)
out['ct_cmh3'] = dict(or_=float(s3.oddsratio_pooled), ci=L(s3.oddsratio_pooled_confint()), chi2=float(s3.test_null_odds().statistic), bd=float(s3.test_equal_odds().statistic), tarone=float(s3.test_equal_odds(adjust=True).statistic))
# Freeman-Halton exact p for a sparse 2 × 4 table by full enumeration (scipy hypergeometric probabilities).
T24 = np.array([[3, 1, 0, 4], [1, 5, 6, 1]])
def fh(T):
    cs = T.sum(0); r1 = T[0].sum(); n_ = T.sum()
    from math import lgamma
    lf = lambda k: lgamma(k + 1)
    def lp(row): return sum(lf(c) - lf(x) - lf(c - x) for x, c in zip(row, cs)) - (lf(n_) - lf(r1) - lf(n_ - r1))
    obs = lp(T[0]); tot = 0.0
    for row in itertools.product(*[range(c + 1) for c in cs]):
        if sum(row) != r1 or any(c - x > n_ - r1 for x, c in zip(row, cs)): continue
        v = lp(row)
        if v <= obs + 1e-7 * abs(obs): tot += np.exp(v)
    return tot
out['ct_fh24'] = float(fh(T24)); out['ct_fisher22'] = float(stats.fisher_exact([[3, 9], [7, 2]])[1])

json.dump(out, open(os.path.join(here, 'surveystats-reference.json'), 'w'), indent=1)
print('wrote surveystats-reference.json with', len(out), 'entries')
