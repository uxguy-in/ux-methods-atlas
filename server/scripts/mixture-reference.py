# Reference values for the mixture-model checks in check-calc.js (npm run check:calc). Writes
# server/scripts/mixture-reference.json. Needs numpy, pandas, scikit-learn and StepMix (python3 -m pip install stepmix).
#   GMM:   sklearn.mixture.GaussianMixture with fixed means_init, weights_init and precisions_init, diag and full.
#   LCA:   StepMix categorical / categorical_nan, started from fixed responsibilities (weights 1/k, item probabilities
#          from one M-step), no smoothing; plus the Stouffer and Toby (1951) data, poLCA's `values`, with 50 random starts.
#   Mixed: StepMix with a gaussian_diag block and a categorical block, from the same kind of fixed start.
# Run with: python3 server/scripts/mixture-reference.py
import json, os, warnings
import numpy as np, pandas as pd, sklearn, stepmix
from sklearn.mixture import GaussianMixture
from stepmix.stepmix import StepMix
warnings.filterwarnings('ignore')
OUT = {}

# ── Gaussian mixture vs scikit-learn ──
rs = np.random.RandomState(7)
A = rs.multivariate_normal([0, 0, 0], [[1, .6, .2], [.6, 1, .1], [.2, .1, .5]], 20)
B = rs.multivariate_normal([4, 1, -1], [[.5, -.2, 0], [-.2, .8, .3], [0, .3, 1]], 15)
C = rs.multivariate_normal([1, 5, 2], [[1.5, .4, .4], [.4, .6, 0], [.4, 0, .7]], 15)
X = np.round(np.vstack([A, B, C]), 3)
n = len(X)
means = X[[0, 20, 35]].copy()
weights = np.array([0.3, 0.3, 0.4])
cov_full = np.array([np.eye(3) * 1.0, [[1, .3, 0], [.3, 1, 0], [0, 0, 1]], np.eye(3) * 2.0])
cov_diag = np.array([[1, 1, 1], [0.5, 1, 2], [2, 2, 2]], dtype=float)
out = OUT['gmm'] = {'X': X.tolist(), 'means': means.tolist(), 'weights': weights.tolist(), 'cov_full': cov_full.tolist(), 'cov_diag': cov_diag.tolist(), 'sklearn': sklearn.__version__}
for ct, cv in [('diag', cov_diag), ('full', cov_full)]:
    prec = 1 / cv if ct == 'diag' else np.linalg.inv(cv)
    for tag, mi, tol in [('fixed3', 3, 0.0), ('fixed25', 25, 0.0), ('conv', 2000, 1e-12)]:
        g = GaussianMixture(3, covariance_type=ct, weights_init=weights, means_init=means, precisions_init=prec, max_iter=mi, tol=tol, reg_covar=1e-6, n_init=1).fit(X)
        out[f'{ct}_{tag}'] = {'weights': g.weights_.tolist(), 'means': g.means_.tolist(), 'cov': g.covariances_.tolist(), 'll': float(g.score(X) * n), 'bic': float(g.bic(X)), 'aic': float(g.aic(X)), 'n_iter': int(g.n_iter_), 'converged': bool(g.converged_), 'nparams': int(g._n_parameters())}

# ── Latent class analysis vs StepMix ──
rs = np.random.RandomState(11)
L = [3, 2, 4, 3, 5]; K = 3; n = 300
true_w = [0.5, 0.3, 0.2]
true_th = [[rs.dirichlet(np.ones(l) * 0.7) for l in L] for _ in range(K)]
z = rs.choice(K, n, p=true_w)
Xc = np.array([[rs.choice(L[j], p=true_th[z[i]][j]) for j in range(len(L))] for i in range(n)], dtype=float)
Xm = Xc.copy(); mask = rs.rand(*Xm.shape) < 0.06; Xm[mask] = np.nan
# make sure every option is still observed in each column
for j, l in enumerate(L): assert len(set(Xm[~np.isnan(Xm[:, j]), j])) == l
R0 = rs.uniform(size=(n, K)); R0 /= R0.sum(1, keepdims=True)

def theta_from_resp(X, R):
    th = []
    for c in range(K):
        tc = []
        for j, l in enumerate(L):
            obs = ~np.isnan(X[:, j])
            tc.append([float(R[obs & (X[:, j] == v), c].sum() / R[obs, c].sum()) for v in range(l)])
        th.append(tc)
    return th

def fit(X, meas, max_iter, tol, R=R0):
    m = StepMix(n_components=K, measurement=meas, max_iter=max_iter, abs_tol=tol, rel_tol=0.0, n_init=1, progress_bar=0, random_state=1)
    def init(self, X_, random_state):
        self.log_resp_ = np.log(np.clip(R, 1e-15, 1 - 1e-15))
        self.weights_ = np.ones(K) / K
        self._initialize_parameters_measurement(X_, random_state)
    m._initialize_parameters = init.__get__(m)
    m.fit(X)
    pis = m.get_parameters()['measurement']['pis']  # K × (features × max outcomes)
    M = max(L)
    th = [[pis[c, j * M:j * M + L[j]].tolist() for j in range(len(L))] for c in range(K)]
    return {'w': m.weights_.tolist(), 'theta': th, 'll': float(m.score(X) * n), 'bic': float(m.bic(X)), 'aic': float(m.aic(X)), 'entropyR2': float(m.relative_entropy(X)), 'nparams': int(m.n_parameters), 'n_iter': int(m.n_iter_), 'sizes': np.bincount(m.predict(X), minlength=K).tolist()}

out = OUT['lca'] = {'X': Xc.astype(int).tolist(), 'Xm': np.where(np.isnan(Xm), -1, Xm).astype(int).tolist(), 'L': L, 'theta0': theta_from_resp(Xc, R0), 'theta0m': theta_from_resp(Xm, R0), 'stepmix': getattr(stepmix, '__version__', 'unknown')}
for tag, it, tol in [('fixed5', 5, 0.0), ('conv', 5000, 1e-12)]:
    out['complete_' + tag] = fit(Xc, 'categorical', it, tol)
    out['missing_' + tag] = fit(Xm, 'categorical_nan', it, tol)

# Stouffer and Toby (1951) role-conflict data, as in poLCA's `values` (n = 216): 2 classes, many random starts.
pat = ['1111','1112','1121','1122','1211','1212','1221','1222','2111','2112','2121','2122','2211','2212','2221','2222']
cnt = [42, 23, 6, 25, 6, 24, 7, 38, 1, 4, 1, 6, 2, 9, 2, 20]
V = np.array([[int(ch) - 1 for ch in p] for p, c in zip(pat, cnt) for _ in range(c)], dtype=float)
m = StepMix(n_components=2, measurement='categorical', max_iter=5000, abs_tol=1e-12, rel_tol=0, n_init=50, progress_bar=0, random_state=3).fit(V)
pis = m.get_parameters()['measurement']['pis']
out['values'] = {'counts': cnt, 'patterns': pat, 'll': float(m.score(V) * len(V)), 'bic': float(m.bic(V)), 'aic': float(m.aic(V)), 'w': m.weights_.tolist(), 'p_first': [[float(pis[c, 2 * j]) for j in range(4)] for c in range(2)]}

# ── Mixed model vs StepMix (gaussian_diag + categorical) ──
rs = np.random.RandomState(5)
K, n = 3, 240
z = rs.choice(K, n, p=[0.45, 0.35, 0.2])
mus = np.array([[0, 0], [2.5, 1], [-1, 3]]); sds = np.array([[1, .7], [.6, 1.2], [.8, .5]])
Xn = np.round(mus[z] + sds[z] * rs.randn(n, 2), 3)
L = [3, 4, 2]
th = [[rs.dirichlet(np.ones(l)) for l in L] for _ in range(K)]
Xc = np.array([[rs.choice(L[j], p=th[z[i]][j]) for j in range(3)] for i in range(n)])
R0 = rs.uniform(size=(n, K)); R0 /= R0.sum(1, keepdims=True)
df = pd.DataFrame(np.hstack([Xn, Xc]), columns=['a', 'b', 'c1', 'c2', 'c3'])
desc = {'cont': {'model': 'gaussian_diag', 'n_columns': 2}, 'cat': {'model': 'categorical', 'n_columns': 3}}
out = OUT['mixed'] = {'Xn': Xn.tolist(), 'Xc': Xc.tolist(), 'L': L, 'R0': R0.tolist()}
for tag, it, tol in [('fixed5', 5, 0.0), ('conv', 5000, 1e-12)]:
    m = StepMix(n_components=K, measurement=desc, max_iter=it, abs_tol=tol, rel_tol=0.0, n_init=1, progress_bar=0, random_state=1)
    def init(self, X_, random_state):
        self.log_resp_ = np.log(np.clip(R0, 1e-15, 1 - 1e-15)); self.weights_ = np.ones(K) / K
        self._initialize_parameters_measurement(X_, random_state)
    m._initialize_parameters = init.__get__(m)
    m.fit(df)
    P = m.get_parameters()['measurement']
    M = max(L)
    out[tag] = {'ll': float(m.score(df) * n), 'bic': float(m.bic(df)), 'nparams': int(m.n_parameters), 'w': m.weights_.tolist(), 'means': P['cont']['means'].tolist(), 'cov': P['cont']['covariances'].tolist(), 'theta': [[P['cat']['pis'][c, j * M:j * M + L[j]].tolist() for j in range(3)] for c in range(K)], 'n_iter': int(m.n_iter_)}

json.dump(OUT, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mixture-reference.json'), 'w'), separators=(',', ':'))
print('wrote mixture-reference.json')
