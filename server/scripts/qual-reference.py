"""Independent references for the interview coding workbench (npm run check:qual).

Reads qual-reference-input.json (written by qual-dump.js) and writes qual-reference.json:
  tfidf  scikit-learn TfidfVectorizer(norm=None, smooth_idf=True) on the example's tokenised interviews
  cooc   numpy segment-level co-occurrence matrix and interview x code presence counts
  lda    log p(w|z) (Griffiths and Steyvers 2004, eq. 2) recomputed with scipy's gammaln from the JS sampler's final
         assignments, plus scikit-learn's LatentDirichletAllocation on the same planted corpus (top words per topic)
  lca    the log-likelihood of the planted data under the JS fitted parameters, its BIC, and the adjusted Rand index
         of the JS classes against the planted ones
"""
import json
import os

import numpy as np
from scipy.special import gammaln, logsumexp
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.metrics import adjusted_rand_score

here = os.path.dirname(os.path.abspath(__file__))
inp = json.load(open(os.path.join(here, 'qual-reference-input.json')))
out = {}

# TF-IDF
docs = inp['tfidf']['docs']
vec = TfidfVectorizer(analyzer=lambda d: d, norm=None, smooth_idf=True, sublinear_tf=False)
X = vec.fit_transform(docs).toarray()
vocab = vec.get_feature_names_out().tolist()
out['tfidf'] = {'vocab': vocab, 'idf': vec.idf_.tolist(), 'scores': X.tolist()}

# Co-occurrence and presence
ids = inp['cooc']['codeIds']
idx = {c: i for i, c in enumerate(ids)}
S = np.zeros((len(inp['cooc']['segCodes']), len(ids)))
for r, s in enumerate(inp['cooc']['segCodes']):
    for c in set(s['codes']):
        S[r, idx[c]] = 1
out['cooc'] = {'C': (S.T @ S).astype(int).tolist()}
P = np.zeros((inp['cooc']['nInterviews'], len(ids)), dtype=int)
for r, s in enumerate(inp['cooc']['segCodes']):
    P[s['ii']] += S[r].astype(int)
out['cooc']['presence'] = P.tolist()

# LDA: log-likelihood from the JS final state
L = inp['lda']
V, K, beta = len(L['vocab']), L['K'], L['beta']
widx = {w: i for i, w in enumerate(L['vocab'])}
nkw = np.zeros((K, V))
for doc, z in zip(L['docs'], L['z']):
    for w, k in zip(doc, z):
        nkw[k, widx[w]] += 1
ll = K * (gammaln(V * beta) - V * gammaln(beta)) + np.sum(gammaln(nkw + beta)) - np.sum(gammaln(nkw.sum(1) + V * beta))
out['lda'] = {'ll': float(ll)}
cv = CountVectorizer(analyzer=lambda d: d)
M = cv.fit_transform(L['docs'])
sk = LatentDirichletAllocation(n_components=3, doc_topic_prior=0.1, topic_word_prior=0.01, learning_method='batch', max_iter=200, random_state=0).fit(M)
names = cv.get_feature_names_out()
out['lda']['sklearnTop'] = [sorted(names[np.argsort(-row)[:8]].tolist()) for row in sk.components_]

# LCA: log-likelihood of the data under the JS parameters
C = np.array(inp['lca']['C'], dtype=float)
w = np.array(inp['lca']['w'])
th = np.array(inp['lca']['theta'])
logp = np.log(w)[None, :] + C @ np.log(th).T + (1 - C) @ np.log(1 - th).T
llc = float(np.sum(logsumexp(logp, axis=1)))
n, q = C.shape
out['lca'] = {'ll': llc, 'bic': float(-2 * llc + (1 + 2 * q) * np.log(n)), 'ari': float(adjusted_rand_score(inp['lca']['truth'], inp['lca']['labels']))}

json.dump(out, open(os.path.join(here, 'qual-reference.json'), 'w'), indent=1)
print('wrote qual-reference.json')
print('LDA LL', out['lda']['ll'], 'sklearn top', out['lda']['sklearnTop'])
print('LCA', out['lca'])
