"""Writes the built-in example datasets for the scorers tools (client/src/calc/tools/scorers-examples.js).
Simulated but realistic answers from a one-factor-per-scale model, fixed seed so the file is reproducible.
Run: python3 server/scripts/scorers-make-examples.py"""
import json, os
import numpy as np

rng = np.random.default_rng(20261030)
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', '..', 'client', 'src', 'calc', 'tools', 'scorers-examples.js')


def likert(n, groups, lo, hi, centre, spread=1.0, noise=0.8, trait=None):
    """groups: list of (n_items, shift, reversed?) blocks sharing one person trait plus a block trait."""
    t = rng.normal(0, 1, n) if trait is None else trait
    cols = []
    for k, shift, rev in groups:
        b = rng.normal(0, 0.5, n)
        for _ in range(k):
            v = centre + shift + spread * (t + b) + rng.normal(0, noise, n)
            if rev:
                v = lo + hi - v
            cols.append(np.clip(np.rint(v), lo, hi).astype(int))
    return np.array(cols).T


def lines(m, head=None, labels=None, missing=0.0):
    rows = []
    if head:
        rows.append(', '.join(head))
    for i, r in enumerate(m):
        cells = ['' if rng.random() < missing else str(int(v)) for v in r]
        cells = ['NA' if c == '' else c for c in cells]
        rows.append(', '.join(([labels[i]] if labels else []) + cells))
    return '\n'.join(rows)


ex = {}
# PSSUQ v3: 1 = strongly agree (good). 20 participants, SysUse a bit better than InfoQual.
p = likert(20, [(6, -0.2, False), (6, 0.5, False), (3, -0.4, False), (1, 0, False)], 1, 7, 2.6, 0.9, 0.7)
ex['pssuq'] = lines(p, ['P'] + [f'Q{i}' for i in range(1, 17)], [f'P{i:02d}' for i in range(1, 21)], missing=0.03)
c = likert(25, [(6, 0.1, False), (6, 0.4, False), (3, 0.0, False), (1, 0, False)], 1, 7, 3.0, 1.0, 0.8)
ex['csuq'] = lines(c, ['R'] + [f'Q{i}' for i in range(1, 17)], [f'R{i:02d}' for i in range(1, 26)])
a = likert(15, [(3, 0, False)], 1, 7, 2.4, 1.0, 0.6)
ex['asq'] = lines(a, ['P', 'Ease', 'Time', 'Support info'], [f'P{i:02d}' for i in range(1, 16)])
s = np.clip(np.rint(rng.lognormal(np.log(30), 0.6, 20)), 0, 150).astype(int)
ex['smeq'] = 'P, SMEQ\n' + '\n'.join(f'P{i + 1:02d}, {v}' for i, v in enumerate(s))
u = likert(24, [(3, -0.3, False), (3, 0.4, True), (3, 0.3, False), (3, 0.5, False)], 1, 5, 3.4, 0.7, 0.6)
ex['ues'] = lines(u, ['P', 'FA1', 'FA2', 'FA3', 'PU1', 'PU2', 'PU3', 'AE1', 'AE2', 'AE3', 'RW1', 'RW2', 'RW3'], [f'P{i:02d}' for i in range(1, 25)])
t = likert(30, [(6, 0.6, False), (6, 0.1, False)], 1, 7, 5.0, 0.9, 0.6)
ex['tam'] = lines(t, ['P'] + [f'PU{i}' for i in range(1, 7)] + [f'PEOU{i}' for i in range(1, 7)], [f'P{i:02d}' for i in range(1, 31)])
sam = np.column_stack([np.clip(np.rint(rng.normal(6.4, 1.4, 20)), 1, 9), np.clip(np.rint(rng.normal(4.6, 1.8, 20)), 1, 9), np.clip(np.rint(rng.normal(6.0, 1.5, 20)), 1, 9)]).astype(int)
ex['sam'] = lines(sam, ['P', 'Valence', 'Arousal', 'Dominance'], [f'P{i:02d}' for i in range(1, 21)])
pairs = ['Confusing|Clear', 'Slow|Fast', 'Ugly|Attractive', '*Trustworthy|Suspicious', 'Boring|Exciting', 'Complicated|Simple', 'Cold|Warm', '*Professional|Amateurish']
rev = [p.startswith('*') for p in pairs]
rowsd = ['Product, ' + ', '.join(pairs)]
for prod, shifts in (('Current app', [0.0, -0.3, 0.2, 0.3, -0.4, -0.2, 0.0, 0.4]), ('Redesign', [1.0, 0.4, 1.1, 0.5, 0.6, 1.0, 0.5, 0.6])):
    tt = rng.normal(0, 0.7, 16)
    for i in range(16):
        cells = []
        for j, sh in enumerate(shifts):
            v = np.clip(np.rint(4.3 + sh + tt[i] + rng.normal(0, 0.9)), 1, 7)
            if rev[j]:
                v = 8 - v
            cells.append(str(int(v)))
        rowsd.append(f'{prod}, ' + ', '.join(cells))
ex['sd'] = '\n'.join(rowsd)
ex['pmf'] = '# One answer per line, or "answer, count"\nVery disappointed, 46\nSomewhat disappointed, 51\nNot disappointed, 21\nN/A - I no longer use it, 7'
geq_blocks = {'Competence': [2, 10, 15, 17, 21], 'Immersion': [3, 12, 18, 19, 27, 30], 'Flow': [5, 13, 25, 28, 31], 'Tension': [22, 24, 29], 'Challenge': [11, 23, 26, 32, 33], 'Negative': [7, 8, 9, 16], 'Positive': [1, 4, 6, 14, 20]}
centres = {'Competence': 2.5, 'Immersion': 2.2, 'Flow': 2.0, 'Tension': 0.9, 'Challenge': 1.8, 'Negative': 0.7, 'Positive': 2.7}
n = 18
g = np.zeros((n, 33), dtype=int)
tr = rng.normal(0, 0.6, n)
for name, its in geq_blocks.items():
    b = rng.normal(0, 0.5, n)
    sign = -1 if name in ('Tension', 'Negative') else 1
    for it in its:
        g[:, it - 1] = np.clip(np.rint(centres[name] + sign * tr + b + rng.normal(0, 0.55, n)), 0, 4)
ex['geq'] = lines(g, ['P'] + [f'GEQ{i}' for i in range(1, 34)], [f'P{i:02d}' for i in range(1, n + 1)])
pe = likert(15, [(3, 0.4, False), (3, 0.0, False), (3, -0.6, False)], 1, 7, 4.6, 0.9, 0.7)
ex['pens'] = lines(pe, ['P'] + [f'C{i}' for i in range(1, 10)], [f'P{i:02d}' for i in range(1, 16)])
ex['pensGroups'] = 'Competence: 1-3; Autonomy: 4-6; Relatedness: 7-9'
w = likert(40, [(5, 0, False)], 1, 7, 4.9, 1.1, 0.8)
ex['swls'] = lines(w, ['P', 'S1', 'S2', 'S3', 'S4', 'S5'], [f'P{i:02d}' for i in range(1, 41)])

# Item analysis: a 20-question multiple-choice quiz on the design system, 160 staff, options A-D.
# Answers follow a Rasch model; item 7's key is wrong on purpose (the correct option is C, the key says B),
# item 15 has a distractor that tempts strong people, item 3 is very easy.
n, L = 160, 20
theta = rng.normal(0.3, 1.1, n)
bq = np.array([-1.6, -0.9, -2.8, -0.4, 0.0, 0.6, -0.2, 1.1, -1.2, 0.3, 0.8, -0.6, 1.5, 0.2, 0.4, -1.0, 1.9, -0.1, 0.9, -0.3])
keys = list('BCADCABDACBDCABDBCAD')
true_keys = keys.copy(); true_keys[6] = 'C'
qrows = []
for v in range(n):
    ans = []
    for i in range(L):
        p = 1 / (1 + np.exp(-(theta[v] - bq[i])))
        if i == 14:
            p = 1 / (1 + np.exp(-(0.25 * (theta[v] - bq[i]))))
        if rng.random() < p:
            a = true_keys[i]
        else:
            opts = [o for o in 'ABCD' if o != true_keys[i]]
            if i == 14:
                a = 'D' if rng.random() < 0.5 + 0.15 * np.tanh(theta[v]) else str(rng.choice(opts))
            else:
                a = str(rng.choice(opts))
        if rng.random() < 0.01:
            a = ''
        ans.append(a)
    qrows.append(ans)
ex_items = 'key: ' + ' '.join(keys) + '\nID, ' + ', '.join(f'Q{i}' for i in range(1, L + 1)) + '\n' + '\n'.join(f'S{v + 1:03d}, ' + ', '.join(r) for v, r in enumerate(qrows))

# Survey weighting: 400 respondents to a SaaS user survey; Enterprise customers and North America over-respond.
n = 400
plan = rng.choice(['Free', 'Pro', 'Enterprise'], n, p=[0.38, 0.34, 0.28])
region = rng.choice(['NA', 'EU', 'APAC'], n, p=[0.58, 0.30, 0.12])
ten = rng.choice(['<1y', '1-3y', '3y+'], n, p=[0.28, 0.37, 0.35])
base = {'Free': 3.2, 'Pro': 3.7, 'Enterprise': 4.1}
adj = {'NA': 0.1, 'EU': 0.0, 'APAC': -0.2}
tadj = {'<1y': -0.2, '1-3y': 0.0, '3y+': 0.25}
sat = np.clip(np.rint(np.array([base[a] + adj[b] + tadj[c] for a, b, c in zip(plan, region, ten)]) + rng.normal(0, 0.9, n)), 1, 5).astype(int)
renew_p = 1 / (1 + np.exp(-(sat - 3.3) * 1.3))
renew = np.where(rng.random(n) < renew_p, 'Yes', 'No')
wrows = ['id, plan, region, tenure, satisfaction, will_renew'] + [f'R{i + 1:03d}, {a}, {b}, {c}, {d}, {e}' for i, (a, b, c, d, e) in enumerate(zip(plan, region, ten, sat, renew))]
ex_weight = '\n'.join(wrows)
ex_targets = 'plan: Free=60, Pro=30, Enterprise=10\nregion: NA=45, EU=35, APAC=20\ntenure: <1y=40, 1-3y=35, 3y+=25'

with open(out, 'w') as f:
    f.write('// Built-in example datasets for the questionnaire scorer (simulated answers; written by\n')
    f.write('// server/scripts/scorers-make-examples.py with a fixed seed).\n')
    f.write('export const QUESTIONNAIRE_EXAMPLES = ' + json.dumps(ex, indent=1) + ';\n')
    f.write('export const ITEM_EXAMPLE = ' + json.dumps(ex_items) + ';\n')
    f.write('export const WEIGHT_EXAMPLE = ' + json.dumps(ex_weight) + ';\n')
    f.write('export const WEIGHT_TARGETS = ' + json.dumps(ex_targets) + ';\n')
print('wrote', out)
