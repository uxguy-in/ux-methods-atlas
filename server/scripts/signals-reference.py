"""Reference values for the "signals" tools (top tasks, site search, control charts, concentration, classifier metrics,
reaction times, risk and harm, queueing). Reads signals-reference-input.json (written by signals-dump.js from the tools'
own example generators) and writes signals-reference.json, which server/scripts/check-signals.js compares against.

Independent references: statsmodels (proportion_confint, OLS with cluster and HAC covariances, Table2x2,
confint_proportions_2indep, cohens_kappa), scipy (exponnorm, linregress, chi2, gamma, zeta), scikit-learn (roc_auc_score,
average_precision_score, roc_curve, precision/recall/f1, matthews_corrcoef, cohen_kappa_score), ruptures (Binseg),
powerlaw (Alstott et al. 2014) and pyworkforce (ErlangC). Run: python3 server/scripts/signals-reference.py
"""
import json
import math
import os
import warnings

import numpy as np
import scipy
import statsmodels
import statsmodels.api as sm
from scipy import stats, special, optimize
from statsmodels.stats.proportion import proportion_confint, confint_proportions_2indep
from statsmodels.stats.contingency_tables import Table2x2
from statsmodels.stats.inter_rater import cohens_kappa
import sklearn
from sklearn import metrics
import ruptures as rpt
import powerlaw
from pyworkforce.queuing import ErlangC

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
I = json.load(open(os.path.join(HERE, "signals-reference-input.json")))
OUT = {"versions": {"numpy": np.__version__, "scipy": scipy.__version__, "statsmodels": statsmodels.__version__,
                    "sklearn": sklearn.__version__, "ruptures": rpt.__version__, "powerlaw": getattr(powerlaw, "__version__", "2.0.0")}}


def wilson(x, n):
    lo, hi = proportion_confint(x, n, alpha=0.05, method="wilson")
    return [float(lo), float(hi)]


# ── Top tasks: counts, Wilson intervals, pairwise z tests with the exact co-selection, tiers ──
ballots = [list(dict.fromkeys(b)) for b in I["ballots"]]
N = len(ballots)
tasks = sorted({t for b in ballots for t in b})
votes = {t: sum(t in b for b in ballots) for t in tasks}
order = sorted(tasks, key=lambda t: (-votes[t], t))
V = sum(votes.values())
M = np.array([[t in b for t in order] for b in ballots], dtype=float)
p = M.mean(axis=0)
both = (M.T @ M) / N


def z_pair(i, j):
    v = (p[i] * (1 - p[i]) + p[j] * (1 - p[j]) - 2 * (both[i, j] - p[i] * p[j])) / N
    return (p[i] - p[j]) / math.sqrt(v)


tier, leader, tiers = 1, 0, []
for i in range(len(order)):
    if i > 0 and 2 * stats.norm.sf(abs(z_pair(leader, i))) < 0.05:
        tier += 1
        leader = i
    tiers.append(tier)
cum = np.cumsum([votes[t] / V for t in order])
n = len(order)
OUT["toptasks"] = {
    "N": N, "V": V, "order": order[:5], "votes": [votes[t] for t in order[:5]],
    "wilson": [wilson(votes[t], N) for t in order[:5]],
    "z01": z_pair(0, 1), "z12": z_pair(1, 2), "z23": z_pair(2, 3), "tiers": tiers,
    "neck": int(np.argmax(cum >= 0.25 - 1e-12) + 1), "bottomHalf": float(sum(votes[t] for t in order[n - math.ceil(n / 2):]) / V),
}

# ── Site search: rates clustered by session (OLS on a constant with cluster-robust SEs) ──
log = I["log"]
sessions, idx = {}, []
for r in log:
    sessions.setdefault(r["session"], []).append(r)
ev = []
for s, lst in sessions.items():
    for k, r in enumerate(lst):
        nxt = lst[k + 1] if k + 1 < len(lst) else None
        ev.append({"s": s, "zero": int(r["results"] == 0), "refine": int(nxt is not None), "clicked": int(r["clicks"] > 0),
                   "exit": int(nxt is None and not r["clicks"] > 0), "repeat": int(nxt is not None and nxt["query"] == r["query"])})
groups = np.array([list(sessions).index(e["s"]) for e in ev])


def clustered(key):
    y = np.array([e[key] for e in ev], dtype=float)
    fit = sm.OLS(y, np.ones((len(y), 1))).fit(cov_type="cluster", cov_kwds={"groups": groups})
    return {"rate": float(fit.params[0]), "se": float(fit.bse[0])}


freq = {}
for r in log:
    freq[r["query"]] = freq.get(r["query"], 0) + 1
f = np.sort(np.array(list(freq.values()), dtype=float))
nq = len(f)
gini_q = float(np.sum((2 * np.arange(1, nq + 1) - nq - 1) * f) / (nq * f.sum()))
fs = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))
cum, head = 0.0, 0
for q, c in fs:
    if cum < 0.5 - 1e-12:
        head += 1
    cum += c / len(log)
sess_zero = sum(any(r["results"] == 0 for r in l) for l in sessions.values())
OUT["search"] = {"zero": clustered("zero"), "refine": clustered("refine"), "exit": clustered("exit"), "click": clustered("clicked"),
                 "repeat": clustered("repeat"), "gini": gini_q, "distinct": nq, "head": head, "sessions": len(sessions),
                 "sessZero": [sess_zero, wilson(sess_zero, len(sessions))]}

# ── Control charts ──
x = np.array(I["x"], dtype=float)
base = 26
xb = x[:base]
mr = np.abs(np.diff(xb))
mrbar = mr.mean()
OUT["spc_x"] = {"center": float(xb.mean()), "mrbar": float(mrbar), "ucl": float(xb.mean() + 2.66 * mrbar), "lcl": float(xb.mean() - 2.66 * mrbar),
                "mrUcl": float(3.267 * mrbar)}
sig = mrbar / 1.128
z = (x - xb.mean()) / sig
cp, cm, first = 0.0, 0.0, -1
cps = []
for i, v in enumerate(z):
    cp = max(0.0, v - 0.5 + cp)
    cm = max(0.0, -v - 0.5 + cm)
    cps.append([cp, cm])
    if first < 0 and (cp > 5 or cm > 5):
        first = i
OUT["spc_x"]["cusumFirst"] = first
OUT["spc_x"]["cusumEnd"] = cps[-1]
# Binary segmentation with ruptures on the full series, penalty 2σ² ln n with σ from all moving ranges.
sig_all = np.abs(np.diff(x)).mean() / 1.128
pen = 2 * sig_all ** 2 * math.log(len(x))
OUT["spc_x"]["binsegPen"] = pen
OUT["spc_x"]["binseg"] = [int(b) for b in rpt.Binseg(model="l2", min_size=2, jump=1).fit(x.reshape(-1, 1)).predict(pen=pen)[:-1]]
# p-chart
pc = np.array(I["pS"], dtype=float)
pbar = pc[:, 0].sum() / pc[:, 1].sum()
OUT["spc_p"] = {"center": float(pbar), "ucl0": float(pbar + 3 * math.sqrt(pbar * (1 - pbar) / pc[0, 1])), "lcl0": float(max(0, pbar - 3 * math.sqrt(pbar * (1 - pbar) / pc[0, 1])))}
pr = pc[:, 0] / pc[:, 1]
s2p = float(np.mean(pbar * (1 - pbar) / pc[:, 1]))
penp = 2 * s2p * math.log(len(pr))
OUT["spc_p"]["binseg"] = [int(b) for b in rpt.Binseg(model="l2", min_size=2, jump=1).fit(pr.reshape(-1, 1)).predict(pen=penp)[:-1]]
uc = np.array(I["uS"], dtype=float)
ubar = uc[:, 0].sum() / uc[:, 1].sum()
OUT["spc_u"] = {"center": float(ubar), "ucl0": float(ubar + 3 * math.sqrt(ubar / uc[0, 1]))}


def its(y, T0):
    n = len(y)
    t = np.arange(1, n + 1)
    D = (t >= T0).astype(float)
    X = np.column_stack([np.ones(n), t, D, D * (t - T0)])
    ols = sm.OLS(y, X).fit()
    L = int(math.floor(4 * (n / 100) ** (2 / 9)))
    hac = sm.OLS(y, X).fit(cov_type="HAC", cov_kwds={"maxlags": L})
    return {"b": ols.params.tolist(), "se": ols.bse.tolist(), "p": ols.pvalues.tolist(), "nwSe": hac.bse.tolist(), "nwP": hac.pvalues.tolist(), "L": L,
            "dw": float(sm.stats.durbin_watson(ols.resid))}


OUT["its_x"] = its(x, 27)
OUT["its_p"] = its(pr, 24)

# ── Concentration: Gini, top shares, power law (powerlaw package and an independent scipy implementation) ──
conc = np.array(I["conc"], dtype=float)
s = np.sort(conc)
nn = len(s)
G = float(np.sum((2 * np.arange(1, nn + 1) - nn - 1) * s) / (nn * s.sum()))
desc = s[::-1]
OUT["conc"] = {"gini": G, "top20": float(desc[:math.ceil(0.2 * nn)].sum() / s.sum()), "top1": float(desc[:math.ceil(0.01 * nn)].sum() / s.sum()),
               "for80": float((np.argmax(np.cumsum(desc) >= 0.8 * s.sum() - 1e-12) + 1) / nn)}
rng = np.random.default_rng(1)
boots = [None] * 4000
for b in range(4000):
    xs = np.sort(rng.choice(conc, nn))
    boots[b] = np.sum((2 * np.arange(1, nn + 1) - nn - 1) * xs) / (nn * xs.sum())
OUT["conc"]["bootSe"] = float(np.std(boots, ddof=1))


def own_fit(data, discrete):
    """Independent CSN fit: scipy zeta / closed form, every distinct value but the largest as xmin, minimum KS D."""
    data = np.sort(data[data > 0])
    uniq = np.unique(data)
    best = None
    for xmin in uniq[:-1]:
        tail = data[data >= xmin]
        nt = len(tail)
        if nt < 2:
            break
        if discrete:
            Ls = np.log(tail).sum()
            res = optimize.minimize_scalar(lambda a: nt * math.log(special.zeta(a, xmin)) + a * Ls, bounds=(1.0001, 8), method="bounded", options={"xatol": 1e-10})
            a = res.x
            u, first = np.unique(tail, return_index=True)
            emp = first / nt
            th = 1 - special.zeta(a, u) / special.zeta(a, xmin)
        else:
            a = 1 + nt / np.log(tail / xmin).sum()
            u, first = np.unique(tail, return_index=True)
            emp = first / nt
            th = 1 - (u / xmin) ** (1 - a)
        D = float(np.max(np.abs(emp - th)))
        if best is None or D < best[2]:
            best = (float(xmin), float(a), D, nt)
    return best


def pl_fixed(data, xmin, discrete):
    fit = powerlaw.Fit(data, xmin=xmin, discrete=discrete, estimate_discrete=False, verbose=0)
    R, pv = fit.distribution_compare("power_law", "exponential", normalized_ratio=True)
    # powerlaw fits the exponential's λ numerically; the same Vuong test with the closed-form MLE of λ
    # (continuous 1/(mean − xmin), discrete ln(1 + 1/(mean − xmin))) and powerlaw's power-law log-likelihoods:
    tail = data[data >= xmin]
    m = tail.mean() - xmin
    if discrete:
        lam = math.log(1 + 1 / m)
        lexp = np.log(1 - math.exp(-lam)) - lam * (tail - xmin)
    else:
        lam = 1 / m
        lexp = math.log(lam) - lam * (tail - xmin)
    dd = fit.power_law.loglikelihoods(tail) - lexp
    Rn = dd.sum() / (math.sqrt(len(tail)) * dd.std())
    return {"alpha": float(fit.power_law.alpha), "D": float(fit.power_law.D), "sigma": float(fit.power_law.sigma), "R": float(R), "p": float(pv),
            "RnExact": float(Rn), "pExact": float(special.erfc(abs(Rn) / math.sqrt(2)))}


for key, data, disc in (("pl_disc", conc, True), ("pl_cont", np.array(I["cont"], dtype=float), False)):
    o = own_fit(data, disc)
    ref = pl_fixed(data, o[0], disc)
    default = powerlaw.Fit(data, discrete=disc, verbose=0)
    OUT[key] = {"own": {"xmin": o[0], "alpha": o[1], "D": o[2], "ntail": o[3]}, "powerlaw_at_xmin": ref,
                "powerlaw_default": {"xmin": float(default.xmin), "alpha": float(default.power_law.alpha), "D": float(default.power_law.D)}}
    # Two more fixed xmins, to check α and D away from the optimum.
    others = sorted(set(np.unique(data[data > 0])[[1, 3]].tolist()))
    OUT[key]["fixed"] = [[float(xm), pl_fixed(data, xm, disc)] for xm in others]

# ── Classifier metrics ──
sc = np.array([r["s"] for r in I["scores"]])
y = np.array([r["y"] for r in I["scores"]])
pred = (sc >= 0.5).astype(int)
tn, fp, fn, tp = metrics.confusion_matrix(y, pred).ravel()
fpr, tpr, thr = metrics.roc_curve(y, sc, drop_intermediate=False)
kap = cohens_kappa(np.array([[tp, fn], [fp, tn]]))
pos, neg = sc[y == 1], sc[y == 0]
psi = (pos[:, None] > neg[None, :]).astype(float) + 0.5 * (pos[:, None] == neg[None, :])
v10, v01 = psi.mean(axis=1), psi.mean(axis=0)
auc = psi.mean()
se_delong = math.sqrt(v10.var(ddof=1) / len(pos) + v01.var(ddof=1) / len(neg))


def f1f(c):
    a, b, cc, d = c
    return 2 * a / (2 * a + b + cc)


def mccf(c):
    a, b, cc, d = c
    return (a * d - b * cc) / math.sqrt((a + b) * (a + cc) * (d + b) * (d + cc))


cells = np.array([tp, fp, fn, tn], dtype=float)
Ntot = cells.sum()


def delta_se(fn_, cells):
    pp = cells / cells.sum()
    g = optimize.approx_fprime(pp, lambda q: fn_(q), 1e-7)
    return math.sqrt((pp @ g ** 2 - (pp @ g) ** 2) / cells.sum())


rngc = np.random.default_rng(5)
bs = rngc.multinomial(int(Ntot), cells / Ntot, size=20000).astype(float)
OUT["classifier"] = {
    "cells": [int(tp), int(fp), int(fn), int(tn)],
    "precision": float(metrics.precision_score(y, pred)), "recall": float(metrics.recall_score(y, pred)), "f1": float(metrics.f1_score(y, pred)),
    "accuracy": float(metrics.accuracy_score(y, pred)), "mcc": float(metrics.matthews_corrcoef(y, pred)), "kappa": float(metrics.cohen_kappa_score(y, pred)),
    "balanced": float(metrics.balanced_accuracy_score(y, pred)), "kappaSe": float(kap.std_kappa),
    "auc": float(metrics.roc_auc_score(y, sc)), "ap": float(metrics.average_precision_score(y, sc)), "rocPoints": len(fpr),
    "delongAuc": float(auc), "delongSe": se_delong,
    "f1DeltaSe": delta_se(f1f, cells), "mccDeltaSe": delta_se(mccf, cells),
    "f1BootSe": float(np.std([f1f(c) for c in bs], ddof=1)), "mccBootSe": float(np.std([mccf(c) for c in bs], ddof=1)),
    "precisionWilson": wilson(tp, tp + fp), "recallWilson": wilson(tp, tp + fn),
}

# ── Reaction times ──
rt = np.array(I["rtKept"], dtype=float)
cands = []
for start in (stats.exponnorm.fit(rt), stats.exponnorm.fit(rt, 1.5, loc=rt.mean() - 0.6 * rt.std(), scale=0.4 * rt.std())):
    K, loc, scale = start
    ll = float(np.sum(stats.exponnorm.logpdf(rt, K, loc, scale)))
    cands.append((ll, K, loc, scale))
ll, K, loc, scale = max(cands)
res = optimize.minimize(lambda q: -np.sum(stats.exponnorm.logpdf(rt, q[0] / q[1], q[2], q[1])) if q[0] > 0 and q[1] > 0 else 1e300,
                        [K * scale, scale, loc], method="Nelder-Mead", options={"xatol": 1e-9, "fatol": 1e-12, "maxiter": 20000})
tau, sigma, mu = res.x
OUT["rt"] = {"mu": float(mu), "sigma": float(sigma), "tau": float(tau), "logLik": float(-res.fun), "scipyFitLogLik": ll}
raw = np.array(I["rtDist"], dtype=float)
med = np.median(raw)
mad = 1.4826 * np.median(np.abs(raw - med))
OUT["trim"] = {"absolute": int(np.sum((raw < 200) | (raw > 2500))), "sd25": int(np.sum(np.abs(raw - raw.mean()) > 2.5 * raw.std(ddof=1))),
               "mad25": int(np.sum(np.abs(raw - med) > 2.5 * mad)), "n": len(raw)}
srch = I["search"]
OUT["search_slopes"] = {}
for cond in dict.fromkeys(r["cond"] for r in srch):
    rows = [r for r in srch if r["cond"] == cond and r["correct"] == 1]
    lr = stats.linregress([r["size"] for r in rows], [r["rt"] for r in rows])
    OUT["search_slopes"][cond] = {"slope": lr.slope, "intercept": lr.intercept, "se": lr.stderr, "p": lr.pvalue, "n": len(rows)}

# ── Risk and harm ──
a, b, c, d = 46, 354, 21, 379
t22 = Table2x2(np.array([[a, b], [c, d]]))
OUT["risk"] = {
    "rr": float(t22.riskratio), "rrCI": [float(v) for v in t22.riskratio_confint()], "or": float(t22.oddsratio), "orCI": [float(v) for v in t22.oddsratio_confint()],
    "rdWald": [float(v) for v in confint_proportions_2indep(a, a + b, c, c + d, method="wald", compare="diff")],
    "rdNewcombe": [float(v) for v in confint_proportions_2indep(a, a + b, c, c + d, method="newcomb", compare="diff")],
    "chi2": float(stats.chi2_contingency([[a, b], [c, d]], correction=False)[0]), "p": float(stats.chi2_contingency([[a, b], [c, d]], correction=False)[1]),
}
a2, b2, c2, d2 = 8, 92, 6, 94
OUT["risk"]["smallNewcombe"] = [float(v) for v in confint_proportions_2indep(a2, a2 + b2, c2, c2 + d2, method="newcomb", compare="diff")]
OUT["poisson48"] = [float(stats.chi2.ppf(0.025, 96) / 2), float(stats.chi2.ppf(0.975, 98) / 2)]
OUT["prev90"] = wilson(90, 1600)
st = I["strata"]
std = np.array([r["std"] for r in st], dtype=float)
w = std / std.sum()


def dsr(xk, nk):
    xv = np.array([r[xk] for r in st], dtype=float)
    nv = np.array([r[nk] for r in st], dtype=float)
    y_ = float(np.sum(w * xv / nv))
    v = float(np.sum(w ** 2 * xv / nv ** 2))
    wm = float(np.max(w / nv))
    lo = stats.gamma.ppf(0.025, a=y_ ** 2 / v, scale=v / y_)
    hi = stats.gamma.ppf(0.975, a=(y_ + wm) ** 2 / (v + wm ** 2), scale=(v + wm ** 2) / (y_ + wm))
    return [y_, float(lo), float(hi)]


O = sum(r["xa"] for r in st)
E = sum(r["na"] * r["xb"] / r["nb"] for r in st)
OUT["std"] = {"A": dsr("xa", "na"), "B": dsr("xb", "nb"), "smr": [O / E, float(stats.chi2.ppf(0.025, 2 * O) / 2 / E), float(stats.chi2.ppf(0.975, 2 * O + 2) / 2 / E)]}

# ── Queueing ──
e = ErlangC(transactions=100, aht=3, asa=20 / 60, interval=30, shrinkage=0.3)
req = e.required_positions(service_level=0.8, max_occupancy=1.0)
A = 100 * 180 / 1800
OUT["erlang"] = {"required": req, "table": [[nag, float(e.waiting_probability(nag)), float(e.service_level(nag, scale_positions=False)),
                                             float(e.waiting_probability(nag) * 180 / (nag - A))] for nag in range(11, 19)]}
e2 = ErlangC(transactions=350, aht=4.5, asa=30 / 60, interval=60, shrinkage=0.25)
OUT["erlang2"] = e2.required_positions(service_level=0.9, max_occupancy=0.85)
lam, mu_ = 8.0, 10.0
rho = lam / mu_
OUT["mm1"] = {"L": rho / (1 - rho), "Lq": rho ** 2 / (1 - rho), "W": 1 / (mu_ - lam), "Wq": rho / (mu_ - lam), "pOver05": rho * math.exp(-(mu_ - lam) * 0.5)}

json.dump(OUT, open(os.path.join(HERE, "signals-reference.json"), "w"), indent=1, default=float)
print("wrote signals-reference.json")
