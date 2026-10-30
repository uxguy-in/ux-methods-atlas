# Builds the synthetic example datasets for the sensors tools (HRV, EDA/GSR peaks, eye-tracking AOIs, cultural
# consensus, code co-occurrence networks, Bass adoption, journey forecast). Every dataset is simulated from a seeded
# random generator: none of it comes from real participants. Writes
#   client/src/calc/tools/sensors-examples.js   (the "Load example" data on the pages)
#   server/scripts/sensors-reference-input.json (the same data, read by sensors-reference.py and check-sensors.js)
# Run with: python3 server/scripts/sensors-make-examples.py
import json, math, os
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '..', '..')
rng = np.random.default_rng(20261030)


def chunk(label, vals, per=20):
    return '\n'.join(f"{label}: {' '.join(str(v) for v in vals[i:i + per])}" for i in range(0, len(vals), per))


# ── HRV: RR intervals (ms) for three segments with respiratory sinus arrhythmia (0.25 Hz) and Mayer waves (0.1 Hz).
def rr_segment(n, base, rsa, mayer, noise, t0=0.0):
    out, t, e = [], t0, 0.0
    ph = rng.uniform(0, 2 * math.pi)
    for _ in range(n):
        e = 0.6 * e + rng.normal(0, noise)
        rr = base + rsa * math.sin(2 * math.pi * 0.25 * t) + mayer * math.sin(2 * math.pi * 0.1 * t + ph) + e
        rr = int(round(rr))
        out.append(rr)
        t += rr / 1000
    return out


base = rr_segment(360, 840, 38, 22, 9)
task = rr_segment(420, 715, 12, 24, 7)
recov = rr_segment(330, 805, 30, 20, 9)
base[150] = base[150] + base[151]; del base[151]          # a missed beat (two intervals merged)
task[200] = 430; task[201] = task[201] + (715 - 430)       # an extra (ectopic) beat and its compensatory pause
recov[90] = 1650                                            # a spike from a movement artefact
hrv = '\n'.join([chunk('baseline', base), chunk('task', task), chunk('recovery', recov)])

# ── EDA: 4 Hz skin conductance (µS) for 5 minutes, baseline 0–120 s and task 120–300 s.
fs = 4
n = 300 * fs
t = np.arange(n) / fs
tonic = 2.0 + 0.0015 * t + 0.25 / (1 + np.exp(-(t - 150) / 12))
phasic = np.zeros(n)
onsets = []
tt = 6.0
while tt < 295:
    rate = 1.4 if tt < 120 else 5.0  # SCRs per minute
    onsets.append(tt)
    tt += rng.exponential(60 / rate) + 3.0
for o in onsets:
    a = rng.uniform(0.04, 0.35)
    s = np.clip(t - o, 0, None)
    shape = np.where(t >= o, np.exp(-s / 3.2) - np.exp(-s / 0.7), 0)
    phasic += a * shape / 0.6
sc = tonic + phasic + rng.normal(0, 0.002, n)
eda_vals = [f'{v:.3f}' for v in sc]
eda = '\n'.join(' '.join(eda_vals[i:i + 16]) for i in range(0, n, 16))
eda_segments = 'baseline, 0, 120\ntask, 120, 300'

# ── Eye tracking: fixations on a 1280 × 800 product page, 12 simulated participants.
aois = [('Navigation', 0, 0, 1280, 80), ('Product photo', 40, 100, 700, 520), ('Title and price', 780, 100, 460, 180),
        ('Add to basket', 780, 300, 300, 80), ('Reviews', 780, 420, 460, 240), ('Delivery info', 40, 640, 700, 120)]
P = np.array([  # Markov chain between AOIs (index 6 = outside)
    [.20, .30, .30, .05, .05, .05, .05], [.05, .45, .25, .07, .08, .05, .05], [.03, .20, .30, .22, .15, .05, .05],
    [.03, .10, .25, .30, .20, .07, .05], [.03, .10, .20, .20, .40, .02, .05], [.05, .20, .20, .20, .10, .20, .05],
    [.10, .30, .30, .10, .10, .05, .05]])
start = np.array([.15, .45, .30, .02, .03, .02, .03])
fix_lines = ['participant, x, y, duration']
for p in range(12):
    pid = f'P{p + 1:02d}'
    k = rng.integers(14, 28)
    s = rng.choice(7, p=start)
    for _ in range(k):
        if s < 6:
            _, x, y, w, h = aois[s]
            fx, fy = rng.uniform(x + 8, x + w - 8), rng.uniform(y + 8, y + h - 8)
        else:
            fx, fy = rng.uniform(0, 1280), rng.uniform(560, 640) if rng.random() < 0.5 else rng.uniform(380, 420)
            if 780 <= fx <= 1240 and 380 <= fy <= 420: fx = rng.uniform(1100, 1270)
        d = int(round(np.exp(rng.normal(math.log(230), 0.4))))
        fix_lines.append(f'{pid}, {int(fx)}, {int(fy)}, {d}')
        s = rng.choice(7, p=P[s])
eye_fix = '\n'.join(fix_lines)
eye_aoi = '\n'.join(['name, x, y, width, height'] + [f'{a[0]}, {a[1]}, {a[2]}, {a[3]}, {a[4]}' for a in aois])

# ── Cultural consensus: 20 simulated support agents answer 30 true/false statements about customer behaviour.
nq, nr = 30, 20
key = rng.integers(0, 2, nq)
comp = np.concatenate([rng.uniform(0.3, 0.75, nr - 2), [0.55, 0.02]])
qnames = [f'Q{j + 1}' for j in range(nq)]
cc_lines = ['respondent, ' + ', '.join(qnames)]
for i in range(nr):
    row = []
    for j in range(nq):
        if rng.random() < 0.02:
            row.append('.')
            continue
        know = rng.random() < comp[i]
        ans = key[j] if know else rng.integers(0, 2)
        row.append('T' if ans == 1 else 'F')
    cc_lines.append(f'A{i + 1:02d}, ' + ', '.join(row))
consensus = '\n'.join(cc_lines)

# ── Code co-occurrence: 48 simulated coded interview segments drawn from three latent themes.
themes = [['pricing worry', 'plan limits', 'budget approval'], ['onboarding confusion', 'setup help', 'documentation gaps'],
          ['team sharing', 'permissions', 'notifications']]
cross = ['workaround', 'trust in data']
seg_lines = []
for s in range(48):
    th = themes[rng.integers(0, 3)]
    k = rng.integers(1, 4)
    codes = list(rng.choice(th, size=k, replace=False))
    if rng.random() < 0.25: codes.append(themes[rng.integers(0, 3)][rng.integers(0, 3)])
    if rng.random() < 0.3: codes.append(cross[rng.integers(0, 2)])
    seen = []
    for c in codes:
        if c not in seen: seen.append(c)
    seg_lines.append(f'S{s + 1:02d}: ' + ', '.join(seen))
codenet = '\n'.join(seg_lines)

# ── Bass diffusion: weekly new adopters of a feature, simulated from p = 0.01, q = 0.38, m = 4200 with Poisson noise.
m_, p_, q_ = 4200, 0.01, 0.38
F = lambda x: (1 - math.exp(-(p_ + q_) * x)) / (1 + (q_ / p_) * math.exp(-(p_ + q_) * x))
weeks = 16
bass = '\n'.join(['week, new adopters'] + [f'{w}, {int(rng.poisson(m_ * (F(w) - F(w - 1))))}' for w in range(1, weeks + 1)])

# ── Journey forecast: step counts from a simulated sign-up funnel, with median and 90th-percentile step times (s).
journey = '\n'.join(['step, successes, attempts, median s, p90 s', 'Start sign-up, 412, 460, 8, 20', 'Enter details, 371, 412, 45, 110',
                     'Verify email, 290, 371, 60, 600', 'Connect bank account, 205, 290, 90, 240', 'Confirm and finish, 198, 205, 10, 25'])

data = {'hrv': hrv, 'eda': eda, 'edaFs': fs, 'edaSegments': eda_segments, 'eyeFixations': eye_fix, 'eyeAois': eye_aoi,
        'consensus': consensus, 'codenet': codenet, 'bass': bass, 'journey': journey}
with open(os.path.join(here, 'sensors-reference-input.json'), 'w') as f:
    json.dump(data, f, indent=1)
js = ['// Synthetic example datasets for the sensors tools, written by server/scripts/sensors-make-examples.py from a seeded',
      '// random generator. None of this is real participant data. check-sensors.js checks it equals sensors-reference-input.json.']
names = {'hrv': 'EX_HRV', 'eda': 'EX_EDA', 'edaFs': 'EX_EDA_FS', 'edaSegments': 'EX_EDA_SEGMENTS', 'eyeFixations': 'EX_EYE_FIX',
         'eyeAois': 'EX_EYE_AOI', 'consensus': 'EX_CONSENSUS', 'codenet': 'EX_CODENET', 'bass': 'EX_BASS', 'journey': 'EX_JOURNEY'}
for k, v in data.items():
    js.append(f'export const {names[k]} = {json.dumps(v)};')
with open(os.path.join(root, 'client', 'src', 'calc', 'tools', 'sensors-examples.js'), 'w') as f:
    f.write('\n'.join(js) + '\n')
print('wrote examples', {k: len(str(v)) for k, v in data.items()})
