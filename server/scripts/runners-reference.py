# Reference values for server/scripts/check-runners.js (preference test, MaxDiff runner, reaction cards), from
# scipy and statsmodels. Run: node server/scripts/runners-dump.js && python3 server/scripts/runners-reference.py
# → writes server/scripts/runners-reference.json. Inputs are the built-in examples (runners-reference-input.json)
# plus small hand-made cases written out below.
import json, os
import numpy as np
import scipy
import statsmodels
import statsmodels.api as sm
from scipy import stats
from statsmodels.stats.proportion import proportion_confint
from statsmodels.discrete.conditional_models import ConditionalLogit

here = os.path.dirname(os.path.abspath(__file__))
inp = json.load(open(os.path.join(here, 'runners-reference-input.json')))
out = {'versions': {'numpy': np.__version__, 'scipy': scipy.__version__, 'statsmodels': statsmodels.__version__}}

def wilson(x, n):
    lo, hi = proportion_confint(x, n, alpha=0.05, method='wilson')
    return [float(lo), float(hi)]

# ── Preference test ──
p = inp['preference']
K, G = p['K'], p['segments']
chosen = np.array(p['chosen']); n = len(chosen)
counts = [int((chosen == i).sum()) for i in range(K)]
order = sorted(range(K), key=lambda i: (-counts[i], i))
lead, second = counts[order[0]], counts[order[1]]
gof = stats.chisquare(counts)
table = np.array([[int(((chosen == i) & (np.array(p['segment']) == g)).sum()) for i in range(K)] for g in range(G)])
chi2, pc, dof, expected = stats.chi2_contingency(table, correction=False)
first = sum(1 for c, o in zip(p['chosen'], p['order']) if o[0] == c)
out['preference'] = {
    'counts': counts, 'wilson': [wilson(c, n) for c in counts],
    'gof_stat': float(gof.statistic), 'gof_p': float(gof.pvalue),
    'head_p': float(stats.binomtest(lead, lead + second, 0.5).pvalue),
    'table': table.tolist(), 'chi2': float(chi2), 'chi2_p': float(pc), 'chi2_df': int(dof), 'cramers_v': float(np.sqrt(chi2 / (table.sum() * (min(table.shape) - 1)))),
    'first': first, 'position_p': float(stats.binomtest(first, n, 1 / K).pvalue),
    'segment_wilson': [[wilson(int(c), int(table[g].sum())) for c in table[g]] for g in range(G)],
}
# Hand-made two-design cases for the exact binomial test (asymmetric p too) and a 2 × 2 segment table.
out['binom'] = [{'k': k, 'n': nn, 'p0': p0, 'p': float(stats.binomtest(k, nn, p0).pvalue)} for k, nn, p0 in [(34, 50, 0.5), (7, 20, 0.5), (25, 25, 0.5), (12, 40, 1 / 3), (3, 30, 0.25), (19, 64, 1 / 3), (29, 40, 0.5)]]
out['gof_small'] = {'counts': [9, 4, 2], 'stat': float(stats.chisquare([9, 4, 2]).statistic), 'p': float(stats.chisquare([9, 4, 2]).pvalue)}
t22 = np.array([[18, 7], [9, 14]])
c22 = stats.chi2_contingency(t22, correction=False)
out['table22'] = {'table': t22.tolist(), 'chi2': float(c22[0]), 'p': float(c22[1]), 'fisher_p': float(stats.fisher_exact(t22).pvalue)}

# ── MaxDiff: sequential best-worst logit via statsmodels ConditionalLogit ──
m = inp['maxdiff']
J = m['J']; ref = J - 1
rows, groups, ys, resp = [], [], [], []
gid = 0
for r, items, b, w in m['tasks']:
    for sign, alts, chosen_item in [(1, items, b), (-1, [i for i in items if i != b], w)]:
        for a in alts:
            x = np.zeros(J - 1)
            if a != ref:
                x[a if a < ref else a - 1] = sign
            rows.append(x); groups.append(gid); ys.append(1 if a == chosen_item else 0)
        resp.append(r); gid += 1
X = np.array(rows); y = np.array(ys); groups = np.array(groups)
res = ConditionalLogit(y, X, groups=groups).fit(method='newton', maxiter=200, disp=0)
theta = res.params; V = res.cov_params()
# Robust sandwich clustered by respondent: per-choice scores x_c − Σ p_j x_j summed within respondent.
scores = np.zeros((gid, J - 1))
for g in range(gid):
    idx = groups == g
    v = X[idx] @ theta; pr = np.exp(v - v.max()); pr /= pr.sum()
    scores[g] = X[idx][y[idx] == 1][0] - pr @ X[idx]
resp = np.array(resp); R = len(set(resp.tolist()))
meat = np.zeros((J - 1, J - 1))
for r in set(resp.tolist()):
    s = scores[resp == r].sum(0); meat += np.outer(s, s)
Vrob = V @ meat @ V * R / (R - 1)
Mmap = np.vstack([np.eye(J - 1), np.zeros((1, J - 1))])        # θ → u (reference item last, fixed at 0)
T = (np.eye(J) - np.ones((J, J)) / J) @ Mmap                    # → centred utilities
u = Mmap @ theta; uc = u - u.mean()
sh = np.exp(u - u.max()); sh /= sh.sum()
Js = (np.diag(sh) - np.outer(sh, sh)) @ Mmap
ll0 = -sum(np.log(len(items)) + np.log(len(items) - 1) for _, items, _, _ in m['tasks'])
cnt = {'shown': [0] * J, 'best': [0] * J, 'worst': [0] * J}
for _, items, b, w in m['tasks']:
    for i in items: cnt['shown'][i] += 1
    cnt['best'][b] += 1; cnt['worst'][w] += 1
out['maxdiff'] = {
    'theta': theta.tolist(), 'se_model': np.sqrt(np.diag(V)).tolist(), 'se_robust': np.sqrt(np.diag(Vrob)).tolist(),
    'llf': float(res.llf), 'll0': float(ll0), 'lr': float(2 * (res.llf - ll0)), 'lr_p': float(stats.chi2.sf(2 * (res.llf - ll0), J - 1)),
    'u_centred': uc.tolist(), 'se_centred_robust': np.sqrt(np.diag(T @ Vrob @ T.T)).tolist(), 'se_centred_model': np.sqrt(np.diag(T @ V @ T.T)).tolist(),
    'share': sh.tolist(), 'share_se_robust': np.sqrt(np.diag(Js @ Vrob @ Js.T)).tolist(), 'counts': cnt,
}

# ── Reaction cards: positive share with cluster-robust OLS (statsmodels, use_t=True) ──
c = inp['cards']
val = c['valence']
word_rows = []
for pid, d, ws in zip(c['people'], c['design'], c['words']):
    for wi in ws: word_rows.append((pid, d, 1.0 if val[wi] == 'p' else 0.0))
pids = sorted(set(r[0] for r in word_rows)); gmap = {p_: i for i, p_ in enumerate(pids)}
base = sum(1 for v in val if v == 'p') / len(val)
designs = []
for d in sorted(set(c['design'])):
    sub = [r for r in word_rows if r[1] == d]
    yy = np.array([r[2] for r in sub]); gg = np.array([gmap[r[0]] for r in sub])
    f = sm.OLS(yy, np.ones((len(yy), 1))).fit(cov_type='cluster', cov_kwds={'groups': gg}, use_t=True)
    ci = f.conf_int()[0]
    G_ = len(set(gg.tolist())); t_ = (f.params[0] - base) / f.bse[0]
    people_d = [i for i, dd in enumerate(c['design']) if dd == d]
    wc = {}
    for i in people_d:
        for wi in c['words'][i]: wc[wi] = wc.get(wi, 0) + 1
    top_words = sorted(wc.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
    designs.append({'share': float(f.params[0]), 'se': float(f.bse[0]), 'lo': float(ci[0]), 'hi': float(ci[1]), 'df': int(G_ - 1),
                    't_vs_base': float(t_), 'p_vs_base': float(2 * stats.t.sf(abs(t_), G_ - 1)),
                    'top_words': [[int(k), int(v), wilson(v, len(people_d))] for k, v in top_words]})
yy = np.array([r[2] for r in word_rows]); dd = np.array([r[1] for r in word_rows], dtype=float); gg = np.array([gmap[r[0]] for r in word_rows])
f = sm.OLS(yy, sm.add_constant(dd)).fit(cov_type='cluster', cov_kwds={'groups': gg}, use_t=True)
ci = f.conf_int()[1]
out['cards'] = {'base': base, 'designs': designs, 'diff': float(f.params[1]), 'diff_se': float(f.bse[1]), 'diff_lo': float(ci[0]), 'diff_hi': float(ci[1]), 'diff_p': float(f.pvalues[1])}
# Within-participant case: the same 6 people describe both designs (hand-made), so pairing enters through the clusters.
within = [('a', 0, [1, 1, 0, 1]), ('a', 1, [1, 1, 1]), ('b', 0, [0, 0, 1]), ('b', 1, [1, 0, 1, 1]), ('c', 0, [1, 0]), ('c', 1, [1, 1, 1, 1, 0]),
          ('d', 0, [0, 0, 0, 1]), ('d', 1, [1, 1]), ('e', 0, [1, 1, 1]), ('e', 1, [1, 1, 1, 0]), ('f', 0, [0, 1, 0]), ('f', 1, [1, 1, 1])]
wr = [(p_, d_, v_) for p_, d_, vs in within for v_ in vs]
yy = np.array([r[2] for r in wr], dtype=float); dd = np.array([r[1] for r in wr], dtype=float); gg = np.array(['abcdef'.index(r[0]) for r in wr])
f = sm.OLS(yy, sm.add_constant(dd)).fit(cov_type='cluster', cov_kwds={'groups': gg}, use_t=True)
out['cards_within'] = {'data': within, 'diff': float(f.params[1]), 'se': float(f.bse[1]), 'p': float(f.pvalues[1]), 'lo': float(f.conf_int()[1][0]), 'hi': float(f.conf_int()[1][1])}

json.dump(out, open(os.path.join(here, 'runners-reference.json'), 'w'), indent=1)
print('Wrote server/scripts/runners-reference.json')
