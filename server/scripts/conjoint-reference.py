# Independent reference values for server/scripts/check-conjoint.js (the Conjoint studio).
# Run: node server/scripts/conjoint-reference-data.js && python3 server/scripts/conjoint-reference.py
# Reads conjoint-reference-input.json (the studio's example designs and data as level indices), codes them with its
# own code, and writes conjoint-reference.json. References:
#   - OLS part-worths and R²: statsmodels OLS, respondent by respondent.
#   - Aggregate MNL and the rank-ordered (exploded) logit: statsmodels ConditionalLogit.
#   - Latent-class MNL: an independent numpy EM (full Newton M-step, many random starts).
#   - Hierarchical Bayes MNL: an independent, vectorised numpy implementation of bayesm's rhierMnlRwMixture with one
#     component (R and bayesm are not installed here), plus recovery of the known simulated truth.
#   - D-efficiency (Kuhfeld) and choice-design efficiency (Street and Burgess 2007) with numpy.
#   - ESS (Geyer initial monotone sequence), split R-hat and Geweke z with numpy.
import json, os, math
import numpy as np
import statsmodels.api as sm
from statsmodels.discrete.conditional_models import ConditionalLogit

here = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(here, 'conjoint-reference-input.json')))
out = {}

def make_coder(L, price, pv, none=False):
    pv = np.array(pv, float) if pv is not None else None
    def enc(lv):
        x = []
        for q, l in enumerate(L):
            if q == price:
                x.append(0.0 if lv is None else pv[lv[q]] - pv.mean())
            else:
                e = [0.0] * (l - 1)
                if lv is not None:
                    if lv[q] == l - 1: e = [-1.0] * (l - 1)
                    else: e[lv[q]] = 1.0
                x += e
        if none: x.append(1.0 if lv is None else 0.0)
        return np.array(x)
    return enc

# ── Ratings: per-respondent OLS (statsmodels) ──
R = D['rate']; enc = make_coder(R['L'], R['price'], R['priceValues'])
betas, r2s, hits = [], [], []
for cards in R['resp']:
    est = [c for c in cards if not c['hold']]; hold = [c for c in cards if c['hold']]
    X = sm.add_constant(np.array([enc(c['lv']) for c in est]), has_constant='add'); y = np.array([c['y'] for c in est], float)
    f = sm.OLS(y, X).fit(); betas.append(f.params[1:].tolist()); r2s.append(f.rsquared)
    pred = [enc(c['lv']) @ f.params[1:] for c in hold]; act = [c['y'] for c in hold]
    hits.append(1.0 if act[int(np.argmax(pred))] == max(act) else 0.0)
betas = np.array(betas)
out['ols'] = {'beta_first': betas[0].tolist(), 'beta_last': betas[-1].tolist(), 'mean_beta': betas.mean(0).tolist(), 'mean_r2': float(np.mean(r2s)), 'r2_first': r2s[0], 'hit_rate': float(np.mean(hits)), 'n': len(betas)}
# Importance per respondent from part-worths, then averaged.
def partworths(beta, L, price, pv):
    pw, i = [], 0
    for q, l in enumerate(L):
        if q == price:
            v = np.array(pv, float); pw.append((beta[i] * (v - v.mean())).tolist()); i += 1
        else:
            b = list(beta[i:i + l - 1]); pw.append(b + [-sum(b)]); i += l - 1
    return pw
def importance(pw):
    r = np.array([max(a) - min(a) for a in pw]); return (r / r.sum()).tolist()
out['ols']['importance'] = np.mean([importance(partworths(b, R['L'], R['price'], R['priceValues'])) for b in betas], axis=0).tolist()

# ── Rankings: reversed-rank OLS and the exploded logit (ConditionalLogit on exploded sets) ──
K_ = D['rank']; enc = make_coder(K_['L'], K_['price'], K_['priceValues'])
rows, grp, ys = [], [], []; g = 0; rb = []
for cards in K_['resp']:
    est = sorted([c for c in cards if not c['hold']], key=lambda c: c['y'])
    n = len(est)
    X = sm.add_constant(np.array([enc(c['lv']) for c in est]), has_constant='add'); y = np.array([n + 1 - (k + 1) for k in range(n)], float)
    rb.append(sm.OLS(y, X).fit().params[1:])
    for k in range(n - 1):
        for j, c in enumerate(est[k:]):
            rows.append(enc(c['lv'])); grp.append(g); ys.append(1 if j == 0 else 0)
        g += 1
f = ConditionalLogit(np.array(ys), np.array(rows), groups=np.array(grp)).fit(disp=0, method='newton', maxiter=100)
out['rol'] = {'beta': f.params.tolist(), 'se': f.bse.tolist(), 'll': float(f.llf), 'rankols_mean': np.mean(rb, axis=0).tolist()}

# ── CBC: aggregate MNL (ConditionalLogit) ──
C = D['cbc']; enc = make_coder(C['L'], C['price'], C['priceValues'], none=True)
def sets_of(resp, enc, none):
    out = []
    for tasks in resp:
        ss = []
        for t in tasks:
            X = [enc(lv) for lv in t['alts']]
            if none: X.append(enc(None))
            ss.append((np.array(X), t['y']))
        out.append(ss)
    return out
S = sets_of(C['resp'], enc, True)
rows, grp, ys = [], [], []; g = 0
for ss in S:
    for X, y in ss:
        for j in range(len(X)): rows.append(X[j]); grp.append(g); ys.append(1 if j == y else 0)
        g += 1
f = ConditionalLogit(np.array(ys), np.array(rows), groups=np.array(grp)).fit(disp=0, method='newton', maxiter=100)
beta = f.params; cov = f.cov_params()
ll0 = sum(math.log(1 / len(X)) for ss in S for X, _ in ss)
hits, nsets, none_pred, none_obs = 0, 0, 0.0, 0
for ss in S:
    for X, y in ss:
        u = X @ beta; p = np.exp(u - u.max()); p /= p.sum()
        hits += int(np.argmax(u) == y); nsets += 1; none_pred += p[-1]; none_obs += int(y == len(X) - 1)
out['mnl'] = {'beta': beta.tolist(), 'se': f.bse.tolist(), 'll': float(f.llf), 'll0': ll0, 'rho2': 1 - f.llf / ll0, 'hit': hits / nsets, 'rlh': math.exp(f.llf / nsets), 'none_obs': none_obs / nsets, 'none_pred': none_pred / nsets}
# WTP by the delta method with a numerical gradient: storage level 3 vs level 1 and AI level 3 vs 1.
L = C['L']; pv = np.array(C['priceValues'], float)
def pw_vec(b):
    return partworths(b, L, C['price'], C['priceValues'])
def wtp(b, q, l):
    pw = pw_vec(b); return -(pw[q][l] - pw[q][0]) / b[0]
def delta(q, l):
    w0 = wtp(beta, q, l); gr = np.zeros(len(beta)); h = 1e-6
    for k in range(len(beta)):
        bp = beta.copy(); bp[k] += h; bm = beta.copy(); bm[k] -= h; gr[k] = (wtp(bp, q, l) - wtp(bm, q, l)) / (2 * h)
    return w0, math.sqrt(gr @ cov @ gr)
out['wtp'] = {'storage_unlimited': delta(1, 2), 'ai_advanced': delta(3, 2), 'offline_yes': delta(2, 1)}
out['mnl_importance'] = importance(pw_vec(beta))

# ── Latent-class MNL: numpy EM ──
def flat(S):
    # Pad every set to the same number of alternatives (all sets here have the same size).
    Xs = np.array([[X for X, _ in ss] for ss in S]); ys = np.array([[y for _, y in ss] for ss in S]); return Xs, ys
Xs, Ys = flat(S)  # (n, T, J, K)
n, T, J, K = Xs.shape
def resp_ll(b):
    u = Xs @ b; u = u - u.max(-1, keepdims=True); lp = u - np.log(np.exp(u).sum(-1, keepdims=True))
    return np.take_along_axis(lp, Ys[..., None], -1)[..., 0].sum(-1)
def wmnl(b, w, iters=50):
    for _ in range(iters):
        u = Xs @ b; u = u - u.max(-1, keepdims=True); p = np.exp(u); p /= p.sum(-1, keepdims=True)
        xb = (p[..., None] * Xs).sum(-2); xy = np.take_along_axis(Xs, Ys[..., None, None].repeat(K, -1), -2)[..., 0, :]
        gr = (w[:, None, None] * (xy - xb)).sum((0, 1))
        d = Xs - xb[..., None, :]
        H = np.einsum('n,ntj,ntjk,ntjl->kl', w, p, d, d)
        step = np.linalg.solve(H + 1e-9 * np.eye(K), gr)
        b = b + step
        if np.abs(step).max() < 1e-10: break
    return b
def lc_em(k, seed, starts=12):
    rng = np.random.default_rng(seed); best = None
    for s in range(starts):
        grp = rng.integers(0, k, n)
        bs = [wmnl(np.zeros(K), (grp == c).astype(float), 5) for c in range(k)]; pi = np.full(k, 1 / k)
        prev = -np.inf
        for it in range(3000):
            Lc = np.stack([resp_ll(b) for b in bs], 1) + np.log(pi)
            m = Lc.max(1, keepdims=True); ll = float((m[:, 0] + np.log(np.exp(Lc - m).sum(1))).sum())
            tau = np.exp(Lc - m); tau /= tau.sum(1, keepdims=True)
            pi = tau.mean(0); bs = [wmnl(bs[c], tau[:, c], 30) for c in range(k)]
            if abs(ll - prev) < 1e-9: break
            prev = ll
        Lc = np.stack([resp_ll(b) for b in bs], 1) + np.log(pi); m = Lc.max(1, keepdims=True); ll = float((m[:, 0] + np.log(np.exp(Lc - m).sum(1))).sum())
        if best is None or ll > best[0]: best = (ll, pi.copy(), [b.copy() for b in bs])
    ll, pi, bs = best; order = np.argsort(-pi)
    P = k * K + k - 1
    return {'ll': ll, 'pi': pi[order].tolist(), 'betas': [bs[i].tolist() for i in order], 'bic': -2 * ll + P * math.log(n)}
out['lc'] = {str(k): lc_em(k, 100 + k) for k in (2, 3)}
out['lc']['1'] = {'ll': out['mnl']['ll'], 'bic': -2 * out['mnl']['ll'] + K * math.log(n)}

# ── Hierarchical Bayes MNL: numpy rhierMnlRwMixture, one component ──
def hb(Xs, Ys, R=20000, burn=10000, thin=10, seed=1, w=0.1):
    n, T, J, K = Xs.shape; rng = np.random.default_rng(seed)
    def ll_all(B):  # B: (n, K) → per-respondent log-likelihood
        u = np.einsum('ntjk,nk->ntj', Xs, B); u = u - u.max(-1, keepdims=True); lp = u - np.log(np.exp(u).sum(-1, keepdims=True))
        return np.take_along_axis(lp, Ys[..., None], -1)[..., 0].sum(-1)
    def grad_hess(b, idx=None):
        X = Xs if idx is None else Xs[idx:idx + 1]; Y = Ys if idx is None else Ys[idx:idx + 1]
        u = X @ b; u = u - u.max(-1, keepdims=True); p = np.exp(u); p /= p.sum(-1, keepdims=True)
        xb = (p[..., None] * X).sum(-2); xy = np.take_along_axis(X, Y[..., None, None].repeat(K, -1), -2)[..., 0, :]
        d = X - xb[..., None, :]
        return (xy - xb).sum((0, 1)), np.einsum('ntj,ntjk,ntjl->kl', p, d, d)
    bp = np.zeros(K)
    for _ in range(50):
        g, H = grad_hess(bp); st = np.linalg.solve(H, g); bp += st
        if np.abs(st).max() < 1e-12: break
    _, Hp = grad_hess(bp)
    Hs = np.zeros((n, K, K)); Ntot = n * T
    for i in range(n):
        b = bp.copy(); wg = T / Ntot
        for _ in range(100):
            g, H = grad_hess(b, i); g = (1 - w) * g - w * wg * Hp @ (b - bp); H = (1 - w) * H + w * wg * Hp
            st = np.linalg.solve(H, g); b = b + st
            if np.abs(st).max() < 1e-10: break
        Hs[i] = grad_hess(b, i)[1]
    s = 2.93 / math.sqrt(K); nu = K + 3; A = 0.01; V0 = nu * np.eye(K)
    B = np.zeros((n, K)); llc = ll_all(B); kept = []; acc = []
    for rep in range(R):
        Bt = B.sum(0) / (n + A); E = B - Bt; Sm = E.T @ E + A * np.outer(Bt, Bt) + V0
        # V ~ IW(nu + n, Sm): Bartlett draw of W ~ Wishart(nu + n, Sm^-1), V = W^-1
        Lw = np.linalg.cholesky(np.linalg.inv(Sm)); Aw = np.zeros((K, K))
        for i in range(K): Aw[i, i] = math.sqrt(rng.chisquare(nu + n - i)); Aw[i, :i] = rng.standard_normal(i)
        LA = Lw @ Aw; V = np.linalg.inv(LA @ LA.T)
        bbar = Bt + np.linalg.cholesky(V) @ rng.standard_normal(K) / math.sqrt(n + A)
        Vi = np.linalg.inv(V)
        Lp = np.linalg.cholesky(Hs + Vi)  # (n, K, K) lower
        z = rng.standard_normal((n, K))
        inc = np.linalg.solve(np.transpose(Lp, (0, 2, 1)), z[..., None])[..., 0]
        C = B + s * inc; llC = ll_all(C)
        dC = C - bbar; dO = B - bbar
        lpC = llC - 0.5 * np.einsum('nk,kl,nl->n', dC, Vi, dC); lpO = llc - 0.5 * np.einsum('nk,kl,nl->n', dO, Vi, dO)
        ok = np.log(rng.random(n)) < lpC - lpO
        B[ok] = C[ok]; llc[ok] = llC[ok]; acc.append(ok.mean())
        if rep >= burn and (rep - burn + 1) % thin == 0: kept.append(bbar.copy())
    kept = np.array(kept)
    return {'bbar_mean': kept.mean(0).tolist(), 'bbar_sd': kept.std(0).tolist(), 'lo': np.quantile(kept, 0.025, axis=0).tolist(), 'hi': np.quantile(kept, 0.975, axis=0).tolist(), 'acceptance': float(np.mean(acc[burn:]))}
H = D['hbSim']; encH = make_coder(H['L'], H['price'], H['priceValues'])
SH = sets_of(H['resp'], encH, False); XH, YH = flat(SH)
out['hb_sim'] = hb(XH, YH, R=20000, burn=10000, thin=10, seed=7)
out['hb_sim']['truth_mu'] = H['mu']
out['hb_cbc'] = hb(Xs, Ys, R=20000, burn=10000, thin=10, seed=8)

# ── Diagnostics on the AR(1) series ──
x = np.array(D['ar'])
def autocorr(x):
    d = x - x.mean(); n = len(x); g0 = (d * d).sum()
    return np.array([(d[:n - t] * d[t:]).sum() / g0 for t in range(n)])
def ess(x):
    rho = autocorr(x); n = len(x); s = 0.0; prev = np.inf; k = 0
    while 2 * k + 1 < n:
        G = rho[2 * k] + rho[2 * k + 1]
        if not G > 0: break
        G = min(G, prev); prev = G; s += G; k += 1
    tau = -1 + 2 * s
    return n / max(tau, 1 / math.log10(max(n, 10)))
def rhat(x):
    n = len(x) // 2; h = [x[:n], x[len(x) - n:]]
    m = np.array([c.mean() for c in h]); W = np.mean([c.var(ddof=1) for c in h]); B = n * ((m - m.mean()) ** 2).sum()
    return math.sqrt(((n - 1) / n * W + B / n) / W)
def geweke(x):
    n = len(x); a = x[:int(0.1 * n)]; b = x[n - int(0.5 * n):]
    vm = lambda y: y.var(ddof=1) / ess(y)
    return (a.mean() - b.mean()) / math.sqrt(vm(a) + vm(b))
out['diag'] = {'ess': ess(x), 'rhat': rhat(x), 'geweke': geweke(x), 'ess_theory': len(x) * (1 - 0.6) / (1 + 0.6)}

# ── Design efficiency ──
def ortho(L):
    C = np.zeros((L, L - 1))
    for j in range(1, L):
        nrm = math.sqrt(j * (j + 1)); C[:j, j - 1] = 1 / nrm; C[j, j - 1] = -j / nrm
    return C
def kuhfeld(rows, L):
    X = []
    for r in rows:
        x = [1.0]
        for q, v in enumerate(r): x += list(ortho(L[q])[v] * math.sqrt(L[q]))
        X.append(x)
    X = np.array(X); N, p = X.shape
    return 100 / (N * np.linalg.det(np.linalg.inv(X.T @ X)) ** (1 / p))
def sq(l, m):
    if l == 2: return (m * m - 1) / 4 if m % 2 else m * m / 4
    if l >= m: return m * (m - 1) / 2
    x = m // l; y = m - l * x; return (m * m - (l * x * x + 2 * x * y + y)) / 2
def street_burgess(tasks, L):
    m = len(tasks[0]); Lp = float(np.prod(L)); p = sum(l - 1 for l in L)
    def code(prof): return np.concatenate([ortho(L[q])[v] * math.sqrt(L[q] / Lp) for q, v in enumerate(prof)])
    Cm = np.zeros((p, p))
    for t in tasks:
        Bm = np.array([code(a) for a in t]); d = Bm - Bm.mean(0); Cm += d.T @ d / (m * len(tasks))
    det_opt = np.prod([(2 * sq(l, m) * l / (m * m * (l - 1) * Lp)) ** (l - 1) for l in L])
    return 100 * (np.linalg.det(Cm) / det_opt) ** (1 / p)
out['eff'] = {
    'rate_cards': kuhfeld(D['rate']['cards'], D['rate']['L']),
    'dopt': kuhfeld(D['dopt']['rows'], D['dopt']['L']),
    'cbc_sb': street_burgess([t for v in D['cbc']['versions'] for t in v], D['cbc']['L']),
    'rnd_sb': street_burgess(D['rndCbc']['tasks'], D['rndCbc']['L']),
}
# Expected standard errors at n = 200 for the example CBC design (β = 0, model coding with "none").
I = np.zeros((K, K)); V_ = D['cbc']['versions']
for v in V_:
    for t in v:
        X = np.array([enc(a) for a in t] + [enc(None)]); d = X - X.mean(0); I += d.T @ d / (len(X) * len(V_))
out['expected_se_200'] = np.sqrt(np.diag(np.linalg.inv(200 * I))).tolist()

json.dump(out, open(os.path.join(here, 'conjoint-reference.json'), 'w'), indent=1)
print(json.dumps({k: (v if k not in ('lc',) else {kk: vv.get('ll') for kk, vv in v.items()}) for k, v in out.items() if k not in ('hb_cbc',)}, indent=0)[:4000])
print('hb_cbc', out['hb_cbc']['bbar_mean'])
