"""Independent reference values for the human factors tools (npm run check:humanfactors).

Reads humanfactors-reference-input.json (written by humanfactors-dump.js from the pages' example data) and writes
humanfactors-reference.json. Everything here is computed without the JavaScript code:
  * fault trees by brute-force enumeration of all 2^n event states (exact top probability, Birnbaum, FV, RAW) and
    minimal cut sets by brute force over all subsets;
  * NIOSH, RULA and REBA from tables re-typed in the layout of the published worksheets;
  * normal accommodation with scipy.stats.norm and scipy.optimize.brentq; Borg intervals with scipy.stats.t;
  * SWAT part-worths with numpy least squares on dummy codes; steering-law fits with scipy.stats.linregress and
    the narrowing-tunnel index with scipy.integrate.quad; SEEV with scipy.stats.pearsonr / spearmanr;
  * the alarm log parsed with datetime and analysed with plain Python.
Run: python3 server/scripts/humanfactors-reference.py
"""
import itertools
import json
import math
import os
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np
from scipy import integrate, optimize, stats

HERE = os.path.dirname(os.path.abspath(__file__))
INP = json.load(open(os.path.join(HERE, 'humanfactors-reference-input.json')))
OUT = {}


# ── Fault trees ──
def evaluate(node, state):
    if 'e' in node:
        return state[node['e']]
    vals = [evaluate(c, state) for c in node['c']]
    if node['op'] == 'and':
        return all(vals)
    if node['op'] == 'or':
        return any(vals)
    return sum(vals) >= node['k']


def top_prob(tree, p):
    n = len(p)
    total = 0.0
    for bits in itertools.product([0, 1], repeat=n):
        if evaluate(tree['root'], bits):
            pr = 1.0
            for i, b in enumerate(bits):
                pr *= p[i] if b else 1 - p[i]
            total += pr
    return total


def min_cuts(tree):
    n = len(tree['p'])
    cuts = []
    for size in range(1, n + 1):
        for combo in itertools.combinations(range(n), size):
            s = set(combo)
            if any(c <= s for c in cuts):
                continue
            state = [1 if i in s else 0 for i in range(n)]
            if evaluate(tree['root'], state):
                cuts.append(s)
    return [sorted(c) for c in cuts]


def fault(tree):
    p = tree['p']
    Q = top_prob(tree, p)
    imp = []
    for i in range(len(p)):
        p1 = list(p); p1[i] = 1.0
        p0 = list(p); p0[i] = 0.0
        q1, q0 = top_prob(tree, p1), top_prob(tree, p0)
        imp.append({'birnbaum': q1 - q0, 'criticality': (q1 - q0) * p[i] / Q, 'fv': (Q - q0) / Q, 'raw': q1 / Q,
                    'rrw': Q / q0 if q0 > 0 else None})
    cuts = min_cuts(tree)
    cp = [math.prod(p[e] for e in c) for c in cuts]
    return {'Q': Q, 'cuts': sorted(cuts), 'rare': sum(cp), 'mcub': 1 - math.prod(1 - x for x in cp), 'importance': imp}


OUT['trees'] = {k: fault(t) for k, t in INP['trees'].items()}


# ── NIOSH revised lifting equation (Waters et al. 1993; Applications Manual 1994, Tables 5 and 7) ──
# Frequency table typed row by row as printed (lifts/min; ≤1h V<30, ≤1h V≥30, ≤2h V<30, ≤2h V≥30, ≤8h V<30, ≤8h V≥30).
FM_ROWS = {
    0.2: (1.00, 1.00, .95, .95, .85, .85), 0.5: (.97, .97, .92, .92, .81, .81), 1: (.94, .94, .88, .88, .75, .75),
    2: (.91, .91, .84, .84, .65, .65), 3: (.88, .88, .79, .79, .55, .55), 4: (.84, .84, .72, .72, .45, .45),
    5: (.80, .80, .60, .60, .35, .35), 6: (.75, .75, .50, .50, .27, .27), 7: (.70, .70, .42, .42, .22, .22),
    8: (.60, .60, .35, .35, .18, .18), 9: (.52, .52, .30, .30, .00, .15), 10: (.45, .45, .26, .26, .00, .13),
    11: (.41, .41, .00, .23, .00, .00), 12: (.37, .37, .00, .21, .00, .00), 13: (.00, .34, .00, .00, .00, .00),
    14: (.00, .31, .00, .00, .00, .00), 15: (.00, .28, .00, .00, .00, .00),
}


def fm(F, dur, high):
    col = {'1': 0, '2': 2, '8': 4}[dur] + (1 if high else 0)
    F = max(F, 0.2)
    if F > 15:
        return 0.0
    xs = sorted(FM_ROWS)
    return float(np.interp(F, xs, [FM_ROWS[x][col] for x in xs]))


def niosh_point(c, H, V, round2=False):
    us = c['units'] == 'us'
    LC = 51 if us else 23
    rnd = (lambda x: round(x + 1e-12, 2)) if round2 else (lambda x: x)
    if us:
        HM = 1 if H <= 10 else 0 if H > 25 else 10 / H
        VM = 0 if V > 70 else 1 - 0.0075 * abs(V - 30)
        DM = 1 if c['D'] < 10 else 0 if c['D'] > 70 else 0.82 + 1.8 / c['D']
        high = V >= 30
    else:
        HM = 1 if H <= 25 else 0 if H > 63 else 25 / H
        VM = 0 if V > 175 else 1 - 0.003 * abs(V - 75)
        DM = 1 if c['D'] < 25 else 0 if c['D'] > 175 else 0.82 + 4.5 / c['D']
        high = V >= 75
    AM = 0 if c['A'] > 135 else 1 - 0.0032 * c['A']
    CM = 1.0 if c['coupling'] == 'good' else (1.0 if high else 0.95) if c['coupling'] == 'fair' else 0.90
    m = [rnd(HM), rnd(VM), rnd(DM), rnd(AM), rnd(fm(c['F'], c['duration'], high)), CM]
    rwl = LC * math.prod(m)
    return {'RWL': rwl, 'LI': c['load'] / rwl if rwl > 0 else None, 'mult': m}


NIOSH_CASES = [
    dict(INP['niosh']['example'], name='page example'),
    # Applications Manual Example 2, "Loading supply rolls" (US units, multipliers rounded to 2 dp as printed):
    # published RWL 28.0 lb at the origin and 18.1 lb at the destination; LI 1.25 and 1.9.
    dict(units='us', load=35, H=15, V=27, D=17, A=0, F=0.2, duration='1', coupling='poor', control=True, Hd=20, Vd=10, round2=True, name='NIOSH manual example 2'),
    dict(units='metric', load=20, H=30, V=60, D=40, A=20, F=4.5, duration='8', coupling='poor', control=False, name='interpolated F'),
    dict(units='metric', load=8, H=20, V=180, D=20, A=150, F=0.1, duration='1', coupling='good', control=False, name='out of range'),
    dict(units='us', load=25, H=18, V=40, D=30, A=60, F=11, duration='2', coupling='fair', control=True, Hd=12, Vd=20, name='US, F = 11 at 2 h'),
    dict(units='metric', load=10, H=63, V=0, D=175, A=135, F=15, duration='1', coupling='fair', control=False, name='range edges'),
]
OUT['niosh'] = []
for c in NIOSH_CASES:
    o = niosh_point(c, c['H'], c['V'], c.get('round2', False))
    d = niosh_point(c, c['Hd'], c['Vd'], c.get('round2', False)) if c.get('control') else None
    OUT['niosh'].append({'input': c, 'origin': o, 'destination': d})


# ── RULA (McAtamney and Corlett 1993) — tables re-typed from the NCSU RULA quick reference (2020) layout ──
RULA_A_ROWS = [  # rows: (upper arm, lower arm) = (1,1),(1,2),(1,3),(2,1)...; cols: wrist 1-4 × twist 1-2
    '1 2 2 2 2 3 3 3', '2 2 2 2 3 3 3 3', '2 3 3 3 3 3 4 4',
    '2 3 3 3 3 4 4 4', '3 3 3 3 3 4 4 4', '3 4 4 4 4 4 5 5',
    '3 3 4 4 4 4 5 5', '3 4 4 4 4 4 5 5', '4 4 4 4 4 5 5 5',
    '4 4 4 4 4 5 5 5', '4 4 4 4 4 5 5 5', '4 4 4 5 5 5 6 6',
    '5 5 5 5 5 6 6 7', '5 6 6 6 6 7 7 7', '6 6 6 7 7 7 7 8',
    '7 7 7 7 7 8 8 9', '8 8 8 8 8 9 9 9', '9 9 9 9 9 9 9 9']
RULA_B_ROWS = ['1 3 2 3 3 4 5 5 6 6 7 7', '2 3 2 3 4 5 5 5 6 7 7 7', '3 3 3 4 4 5 5 6 6 7 7 7',
               '5 5 5 6 6 7 7 7 7 7 8 8', '7 7 7 7 7 8 8 8 8 8 8 8', '8 8 8 8 8 8 8 9 9 9 9 9']
RULA_C_ROWS = ['1 2 3 3 4 5 5', '2 2 3 4 4 5 5', '3 3 3 4 4 5 6', '3 3 3 4 5 6 6',
               '4 4 4 5 6 7 7', '4 4 5 6 6 7 7', '5 5 6 6 7 7 7', '5 5 6 7 7 7 7']
ra = [[int(v) for v in r.split()] for r in RULA_A_ROWS]
rb = [[int(v) for v in r.split()] for r in RULA_B_ROWS]
rc = [[int(v) for v in r.split()] for r in RULA_C_ROWS]
OUT['rulaTables'] = {'A': [[ra[u * 3 + l] for l in range(3)] for u in range(6)], 'B': rb, 'C': rc}

# ── REBA (Hignett and McAtamney 2000) — tables re-typed in the worksheet layout ──
# Table A as printed: for each neck score, rows = legs 1-4, columns = trunk 1-5.
REBA_A_PRINTED = {1: ['1 2 2 3 4', '2 3 4 5 6', '3 4 5 6 7', '4 5 6 7 8'],
                  2: ['1 3 4 5 6', '2 4 5 6 7', '3 5 6 7 8', '4 6 7 8 9'],
                  3: ['3 4 5 6 7', '3 5 6 7 8', '5 6 7 8 9', '6 7 8 9 9']}
# Table B as printed: for each lower-arm score, rows = wrist 1-3, columns = upper arm 1-6.
REBA_B_PRINTED = {1: ['1 1 3 4 6 7', '2 2 4 5 7 8', '2 3 5 5 8 8'],
                  2: ['1 2 4 5 7 8', '2 3 5 6 8 9', '3 4 5 7 8 9']}
# Table C as printed: rows = score B 1-12, columns = score A 1-12.
REBA_C_PRINTED = ['1 1 2 3 4 6 7 8 9 10 11 12', '1 2 3 4 4 6 7 8 9 10 11 12', '1 2 3 4 4 6 7 8 9 10 11 12',
                  '2 3 3 4 5 7 8 9 10 11 11 12', '3 4 4 5 6 8 9 10 10 11 12 12', '3 4 5 6 7 8 9 10 10 11 12 12',
                  '4 5 6 7 8 9 9 10 11 11 12 12', '5 6 7 8 8 9 10 10 11 12 12 12', '6 6 7 8 9 10 10 10 11 12 12 12',
                  '7 7 8 9 9 10 11 11 12 12 12 12', '7 7 8 9 9 10 11 11 12 12 12 12', '7 8 8 9 9 10 11 11 12 12 12 12']
pa = {n: [[int(v) for v in r.split()] for r in rows] for n, rows in REBA_A_PRINTED.items()}
pb = {n: [[int(v) for v in r.split()] for r in rows] for n, rows in REBA_B_PRINTED.items()}
pc = [[int(v) for v in r.split()] for r in REBA_C_PRINTED]
OUT['rebaTables'] = {
    'A': [[[pa[n][lg][t] for lg in range(4)] for t in range(5)] for n in (1, 2, 3)],
    'B': [[[pb[la][w][u] for w in range(3)] for u in range(6)] for la in (1, 2)],
    'C': [[pc[b][a] for b in range(12)] for a in range(12)],
}


def rula(x):
    cl = lambda v, lo, hi: max(lo, min(hi, v))
    ua = cl(x['upperArm'] + x['shoulderRaised'] + x['abducted'] - x['armSupported'], 1, 6)
    la = cl(x['lowerArm'] + x['across'], 1, 3)
    wr = cl(x['wrist'] + x['wristDeviated'], 1, 4)
    A = ra[(ua - 1) * 3 + la - 1][(wr - 1) * 2 + x['wristTwist'] - 1]
    C = A + x['muscleA'] + x['forceA']
    neck = cl(x['neck'] + x['neckTwist'] + x['neckSide'], 1, 6)
    trunk = cl(x['trunk'] + x['trunkTwist'] + x['trunkSide'], 1, 6)
    B = rb[neck - 1][(trunk - 1) * 2 + x['legs'] - 1]
    D = B + x['muscleB'] + x['forceB']
    return {'scoreC': C, 'scoreD': D, 'grand': rc[min(C, 8) - 1][min(D, 7) - 1]}


def reba(x):
    cl = lambda v, lo, hi: max(lo, min(hi, v))
    trunk = cl(x['trunk'] + x['trunkTwist'], 1, 5)
    neck = cl(x['neck'] + x['neckTwist'], 1, 3)
    legs = cl(x['legs'] + x['knees'], 1, 4)
    A = pa[neck][legs - 1][trunk - 1] + x['load'] + x['shock']
    ua = cl(x['upperArm'] + x['abducted'] + x['shoulderRaised'] - x['armSupported'], 1, 6)
    wr = cl(x['wrist'] + x['wristTwist'], 1, 3)
    B = pb[x['lowerArm']][wr - 1][ua - 1] + x['coupling']
    return {'scoreA': A, 'scoreB': B, 'score': pc[min(B, 12) - 1][min(A, 12) - 1] + x['static'] + x['repeated'] + x['rapid']}


rs = np.random.default_rng(20261030)
def b(): return bool(rs.integers(0, 2))
rula_cases = [INP['rula']] + [dict(upperArm=int(rs.integers(1, 5)), shoulderRaised=b(), abducted=b(), armSupported=b(), lowerArm=int(rs.integers(1, 3)), across=b(),
                                   wrist=int(rs.integers(1, 4)), wristDeviated=b(), wristTwist=int(rs.integers(1, 3)), muscleA=b(), forceA=int(rs.integers(0, 4)),
                                   neck=int(rs.integers(1, 5)), neckTwist=b(), neckSide=b(), trunk=int(rs.integers(1, 5)), trunkTwist=b(), trunkSide=b(),
                                   legs=int(rs.integers(1, 3)), muscleB=b(), forceB=int(rs.integers(0, 4))) for _ in range(60)]
reba_cases = [INP['reba']] + [dict(trunk=int(rs.integers(1, 5)), trunkTwist=b(), neck=int(rs.integers(1, 3)), neckTwist=b(), legs=int(rs.integers(1, 3)), knees=int(rs.integers(0, 3)),
                                   load=int(rs.integers(0, 3)), shock=b(), upperArm=int(rs.integers(1, 5)), abducted=b(), shoulderRaised=b(), armSupported=b(),
                                   lowerArm=int(rs.integers(1, 3)), wrist=int(rs.integers(1, 3)), wristTwist=b(), coupling=int(rs.integers(0, 4)),
                                   static=b(), repeated=b(), rapid=b()) for _ in range(60)]
OUT['rula'] = [{'input': c, 'out': rula(c)} for c in rula_cases]
OUT['reba'] = [{'input': c, 'out': reba(c)} for c in reba_cases]

# ── Anthropometry ──
an = INP['anthro']
gs = an['groups']
W = sum(g['w'] for g in gs)
def mix_cdf(v): return sum(g['w'] / W * stats.norm.cdf(v, g['mean'], g['sd']) for g in gs)
def mix_q(q): return optimize.brentq(lambda v: mix_cdf(v) - q, 0, 1000, xtol=1e-12)
OUT['anthro'] = {
    'min': {'per': [float(stats.norm.sf(an['x'], g['mean'], g['sd'])) for g in gs], 'total': float(1 - mix_cdf(an['x'])), 'pct': [float(stats.norm.cdf(an['x'], g['mean'], g['sd'])) for g in gs]},
    'max': {'total': float(mix_cdf(an['x']))},
    'range': {'total': float(mix_cdf(an['hi']) - mix_cdf(an['lo']))},
    'designMin': mix_q(1 - an['target']), 'designMax': mix_q(an['target']),
    'designRange': [mix_q((1 - an['target']) / 2), mix_q(1 - (1 - an['target']) / 2)],
    'p5': [float(stats.norm.ppf(0.05, g['mean'], g['sd'])) for g in gs], 'p95': [float(stats.norm.ppf(0.95, g['mean'], g['sd'])) for g in gs],
}

# ── Borg ──
bv = np.array(INP['borg']['values'], float)
ci = stats.t.interval(0.95, len(bv) - 1, loc=bv.mean(), scale=stats.sem(bv))
OUT['borg'] = {'mean': float(bv.mean()), 'sd': float(bv.std(ddof=1)), 'median': float(np.median(bv)), 'lo': float(ci[0]), 'hi': float(ci[1]), 'high': int((bv >= 15).sum())}


# ── SWAT: additive model on ranks by least squares with dummy codes ──
def swat(order):
    combos = [tuple(c) for c in order]
    y = np.arange(1, 28, dtype=float)
    X = np.array([[1] + [1 if c[d] == lv else 0 for d in range(3) for lv in (2, 3)] for c in combos], float)
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    def f(t, e, s): return beta[0] + (beta[1] if t == 2 else beta[2] if t == 3 else 0) + (beta[3] if e == 2 else beta[4] if e == 3 else 0) + (beta[5] if s == 2 else beta[6] if s == 3 else 0)
    f0, f1 = f(1, 1, 1), f(3, 3, 3)
    yh = X @ beta
    r2 = 1 - ((y - yh) ** 2).sum() / ((y - y.mean()) ** 2).sum()
    ranges = [max(0, beta[1], beta[2]) - min(0, beta[1], beta[2]), max(0, beta[3], beta[4]) - min(0, beta[3], beta[4]), max(0, beta[5], beta[6]) - min(0, beta[5], beta[6])]
    scores = {f'{t}{e}{s}': 100 * (f(t, e, s) - f0) / (f1 - f0) for t in (1, 2, 3) for e in (1, 2, 3) for s in (1, 2, 3)}
    return {'r2': float(r2), 'importance': [r / sum(ranges) for r in ranges], 'scores': scores}
OUT['swat'] = {'example': swat(INP['swat']['order']), 'custom': swat(INP['swat']['custom'])}


# ── Steering law ──
def rows_from(text):
    out = []
    for line in text.splitlines():
        cells = [c.strip() for c in line.split(',')]
        try:
            nums = [float(c) for c in cells]
        except ValueError:
            continue
        out.append(nums)
    return out
sr = rows_from(INP['steering'])
x = np.array([r[0] / r[1] for r in sr]); y = np.array([r[2] for r in sr])
lr = stats.linregress(x, y)
tc = stats.t.ppf(0.975, len(x) - 2)
OUT['steering'] = {'a': lr.intercept, 'b': lr.slope, 'r2': lr.rvalue ** 2, 'seA': lr.intercept_stderr, 'seB': lr.stderr, 'bLo': lr.slope - tc * lr.stderr, 'bHi': lr.slope + tc * lr.stderr,
                   'aLo': lr.intercept - tc * lr.intercept_stderr, 'aHi': lr.intercept + tc * lr.intercept_stderr, 'p': lr.pvalue,
                   'designs': [lr.intercept + lr.slope * float(l.split(',')[-2]) / float(l.split(',')[-1]) for l in INP['designs'].splitlines() if l.strip()]}
# Index of difficulty by numerical integration of ds / W(s): narrowing tunnel 300 px from W 40 to 10; circle R 100, W 20.
OUT['steeringId'] = {'narrowing': integrate.quad(lambda s: 1 / (40 + (10 - 40) * s / 300), 0, 300, epsabs=1e-13)[0],
                     'widening': integrate.quad(lambda s: 1 / (12 + (36 - 12) * s / 250), 0, 250, epsabs=1e-13)[0],
                     'circle': integrate.quad(lambda th: 100 / 20, 0, 2 * math.pi)[0]}

# ── SEEV ──
lines = [l for l in INP['seev'].splitlines() if l.strip()][1:]
aoi = [[c.strip() for c in l.split(',')] for l in lines]
S, EF, EX, V, OBS = (np.array([float(r[i]) for r in aoi]) for i in range(1, 6))
def seev(form):
    raw = S - EF + (EX * V if form == 'mult' else EX + V)
    pos = np.clip(raw, 0, None)
    pred = 100 * pos / pos.sum()
    obs = 100 * OBS / OBS.sum()
    r, p = stats.pearsonr(pred, obs)
    z, se = np.arctanh(r), 1 / math.sqrt(len(obs) - 3)
    return {'pred': pred.tolist(), 'r': float(r), 'p': float(p), 'lo': float(np.tanh(z - 1.959963984540054 * se)), 'hi': float(np.tanh(z + 1.959963984540054 * se)),
            'rho': float(stats.spearmanr(pred, obs).statistic), 'mad': float(np.abs(pred - obs).mean())}
OUT['seev'] = {'add': seev('add'), 'mult': seev('mult')}


# ── Alarm log ──
def ts(s):
    s = s.strip()
    return datetime.strptime(s, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc).timestamp()
ev = []
for line in INP['alarmLog'].splitlines()[1:]:
    t, tag, prio, state = [c.strip() for c in line.split(',')]
    ev.append((ts(t), tag, prio.lower(), state))
ev.sort(key=lambda e: e[0])
alm = [e for e in ev if e[3] == 'ALM']
bin_s = 600
t0 = math.floor(ev[0][0] / bin_s) * bin_s
t_end = ev[-1][0]
nb = int((t_end - t0) // bin_s) + 1
bins = [0] * nb
for e in alm:
    bins[int((e[0] - t0) // bin_s)] += 1
hours = nb * 10 / 60
flood, floods, cur = [False] * nb, [], None
for i, c in enumerate(bins):
    if cur is None and c > 10:
        cur = [i, i, 0]
    elif cur is not None and c < 5:
        floods.append(cur); cur = None
    if cur is not None:
        cur[1] = i; cur[2] += c; flood[i] = True
if cur is not None:
    floods.append(cur)
times = [e[0] for e in alm]
peak = 0
for i, t in enumerate(times):
    j = next(k for k in range(len(times)) if t - times[k] < bin_s)
    peak = max(peak, i - j + 1)
counts = defaultdict(int)
tag_times = defaultdict(list)
for e in alm:
    counts[e[1]] += 1; tag_times[e[1]].append(e[0])
chatter = sorted(tag for tag, tl in tag_times.items() if any(sum(1 for u in tl if 0 <= u - tl[i] <= 60) >= 3 for i in range(len(tl))))
active, longest = {}, defaultdict(float)
for t, tag, prio, state in ev:
    if state == 'ALM' and tag not in active:
        active[tag] = t
    elif state == 'RTN' and tag in active:
        longest[tag] = max(longest[tag], t - active.pop(tag))
stale = sorted(tag for tag in counts if max(longest[tag], t_end - active[tag] if tag in active else 0) > 24 * 3600)
top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
prio_counts = defaultdict(int)
for e in alm:
    prio_counts[e[2]] += 1
hb0 = math.floor(t0 / 3600) * 3600
nh = int((t_end - hb0) // 3600) + 1
hb = [0] * nh
for e in alm:
    hb[int((e[0] - hb0) // 3600)] += 1
OUT['alarm'] = {'total': len(alm), 'nb': nb, 'perHour': len(alm) / hours, 'per10': len(alm) / (hours * 6), 'perDay': len(alm) / hours * 24,
                'over': sum(1 for c in bins if c > 10), 'floodBins': sum(flood), 'floods': [[f[0], f[1], f[2]] for f in floods], 'max10': max(bins), 'peakRolling': peak,
                'top10Count': sum(c for _, c in top), 'topTags': [t for t, _ in top], 'chatter': chatter, 'stale': stale,
                'prio': {k: prio_counts[k] for k in ('high', 'medium', 'low')}, 'over30h': sum(1 for h in hb if h > 30) / nh, 'nTags': len(counts)}

json.dump(OUT, open(os.path.join(HERE, 'humanfactors-reference.json'), 'w'), indent=1, default=float)
print('wrote humanfactors-reference.json')
