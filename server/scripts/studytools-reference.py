# Reference values for server/scripts/check-studytools.js (card sort and first-click tools), from numpy and scipy.
# Run: python3 server/scripts/studytools-reference.py  → writes server/scripts/studytools-reference.json
# Inputs: a small hand-made card sort written out below, and the built-in examples' placements and clicks in
# studytools-reference-input.json (check-studytools.js checks that the examples still produce that file's data).
import json, os
import numpy as np
from scipy.cluster.hierarchy import linkage, fcluster, leaves_list, cophenet, dendrogram
from scipy.spatial.distance import squareform
from scipy.stats import gaussian_kde

here = os.path.dirname(os.path.abspath(__file__))
inp = json.load(open(os.path.join(here, 'studytools-reference-input.json')))
out = {'versions': {'numpy': np.__version__, 'scipy': __import__('scipy').__version__}}

def similarity(group_of, C):
    """S[i, j] = participants with i and j in the same group / participants who sorted both (−1 = not sorted)."""
    T = np.zeros((C, C)); N = np.zeros((C, C))
    for g in group_of:
        g = np.asarray(g)
        for i in range(C):
            for j in range(C):
                if i != j and g[i] >= 0 and g[j] >= 0:
                    N[i, j] += 1
                    T[i, j] += g[i] == g[j]
    S = np.divide(T, N, out=np.zeros_like(T), where=N > 0)
    np.fill_diagonal(S, 1.0)
    return S

def card_sort(group_of, C, cuts):
    S = similarity(group_of, C)
    D = 1 - S
    np.fill_diagonal(D, 0)
    Z = linkage(squareform(D, checks=False), method='average')
    res = {'S': S.tolist(), 'Z': Z.tolist(), 'leaves': leaves_list(Z).tolist(),
           'dendrogram_leaves': dendrogram(Z, no_plot=True)['leaves'],
           'cophenetic': squareform(cophenet(Z)).tolist()}
    res['fcluster'] = {str(h): fcluster(Z, t=h, criterion='distance').tolist() for h in cuts}
    return res

# Small hand-made open sort: 6 cards A–F, 5 participants (group numbers per card; −1 = unsure).
small = [
    [0, 0, 0, 1, 1, 2],     # P1: ABC | DE | F
    [0, 0, 1, 1, 2, 2],     # P2: AB | CD | EF
    [0, 0, 0, 0, 1, 1],     # P3: ABCD | EF
    [0, 1, 0, 2, 2, 2],     # P4: AC | B | DEF
    [0, 0, 1, 2, 2, -1],    # P5: AB | C | DE, F unsure
]
out['small'] = card_sort(small, 6, [0.3, 0.5, 0.7])
out['example'] = card_sort(inp['cardsort']['groupOf'], inp['cardsort']['C'], [0.3, 0.5, 0.7])

# Kernel density of the example's task 1 clicks (pixels on a 1200 × 800 image).
pts = np.array(inp['clicks']).T
kde = gaussian_kde(pts)  # Scott's rule
grid = [[600, 40], [690, 45], [400, 400], [1000, 60], [100, 700]]
out['kde_scott'] = {'points': grid, 'density': kde(np.array(grid).T).tolist(), 'covariance': kde.covariance.tolist(), 'factor': kde.factor}
# Fixed isotropic bandwidth h = 36 px, by the formula: f(x) = 1/(n 2π h²) Σ exp(−|x − x_i|² / 2h²).
h = 36.0
P = pts.T
fixed = [float(np.sum(np.exp(-np.sum((P - np.array(g)) ** 2, axis=1) / (2 * h * h))) / (len(P) * 2 * np.pi * h * h)) for g in grid]
out['kde_fixed'] = {'h': h, 'points': grid, 'density': fixed}
# Three points by hand at h = 1: f(0, 0) for points (0, 0), (1, 0), (0, 2) = (1 + e^-0.5 + e^-2) / (3·2π).
out['kde_hand'] = (1 + np.exp(-0.5) + np.exp(-2)) / (3 * 2 * np.pi)

json.dump(out, open(os.path.join(here, 'studytools-reference.json'), 'w'), indent=1)
print('small Z', np.array(out['small']['Z']))
print('example Z heights', np.round(np.array(out['example']['Z'])[:, 2], 4))
print('kde scott', out['kde_scott']['density'])
