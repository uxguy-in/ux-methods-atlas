# Reference values for server/scripts/check-tools.js, from scipy, scikit-learn and statsmodels.
# Run: python3 server/scripts/tools-reference.py   (prints the numbers pasted into check-tools.js)
import numpy as np
from scipy import stats, special, optimize
from sklearn.metrics import mutual_info_score, normalized_mutual_info_score
import statsmodels.api as sm

np.set_printoptions(precision=17)
out = {}

# Entropy of code counts
counts = [10, 7, 5, 3, 1]
out['entropy_bits'] = stats.entropy(counts, base=2)
out['entropy_nats'] = stats.entropy(counts)

# Mutual information: Plan × Would renew from the survey example
plan = 'Pro Pro Free Free Free Pro Free Free Team Team Pro Pro Pro Pro Team Team Pro Pro Free Team Pro Team Team Free Free Free Free Pro Free Free Free Team Free Team Team Free Team Free Team Pro'.split()
renew = 'Yes Yes No No No No No Yes Yes Yes Yes No Yes Yes Yes Yes Yes Yes No Yes Yes Yes Yes No No No No No Yes No Yes No No Yes Yes No Yes Yes Yes Yes'.split()
out['mi_nats'] = mutual_info_score(plan, renew)
out['nmi'] = normalized_mutual_info_score(plan, renew)
labels_p = sorted(set(plan)); labels_r = sorted(set(renew))
table = np.array([[sum(1 for a, b in zip(plan, renew) if a == x and b == y) for y in labels_r] for x in labels_p])
g, p, dof, _ = stats.chi2_contingency(table, correction=False, lambda_='log-likelihood')
out['G'] = g; out['G_p'] = p; out['G_df'] = dof
out['chi2_sf_7_3'] = stats.chi2.sf(7.0, 3)
out['chi2_sf_0_5_1'] = stats.chi2.sf(0.5, 1)

# Signal detection: z via norm.ppf, log-linear correction for 18 hits, 2 misses, 6 false alarms, 14 correct rejections
H = (18 + 0.5) / 21; F = (6 + 0.5) / 21
out['sdt_d'] = stats.norm.ppf(H) - stats.norm.ppf(F)
out['sdt_c'] = -(stats.norm.ppf(H) + stats.norm.ppf(F)) / 2

# Charnov optimum for g(t) = G(1 - exp(-t/tau)), Tb = 15, tau = 25: t* = tau(-W_-1(-e^-(1+Tb/tau)) - 1) - Tb
tau, Tb = 25.0, 15.0
out['charnov_t'] = float(tau * (-special.lambertw(-np.exp(-(1 + Tb / tau)), k=-1).real - 1) - Tb)

# Hyperbolic and exponential fits to indifference points
D = np.array([1, 7, 30, 90, 180, 365.0]); V = np.array([0.95, 0.82, 0.6, 0.38, 0.27, 0.16])
kh, _ = optimize.curve_fit(lambda d, k: 1 / (1 + k * d), D, V, p0=[0.01])
ke, _ = optimize.curve_fit(lambda d, k: np.exp(-k * d), D, V, p0=[0.01])
out['k_hyp'] = kh[0]; out['k_exp'] = ke[0]

# Loss aversion: logistic regression on gain, loss (statsmodels Logit, unpenalised)
gains = [4, 6, 8, 10, 12, 4, 6, 8, 10, 12, 4, 6, 8, 10, 12, 16, 20, 4, 6, 8, 10, 12, 16, 20]
losses = [2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 8]
acc = [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1]
X = sm.add_constant(np.column_stack([gains, losses]))
fit = sm.Logit(acc, X).fit(disp=0, tol=1e-12, maxiter=200)
out['logit_b'] = list(fit.params); out['lambda'] = -fit.params[2] / fit.params[1]

# Probit psychometric function (method of constant stimuli)
x = np.array([200, 220, 240, 260, 280, 300, 320.0]); k = np.array([2, 6, 13, 22, 29, 35, 38]); n = np.full(7, 40)
glm = sm.GLM(np.column_stack([k, n - k]), sm.add_constant(x), family=sm.families.Binomial(link=sm.families.links.Probit())).fit(tol=1e-14)
a, b = glm.params
out['probit_a'] = a; out['probit_b'] = b; out['pse'] = -a / b; out['jnd'] = stats.norm.ppf(0.75) / b

for key, v in out.items():
    print(key, repr(v))
