// Writes server/scripts/qual-reference-input.json for qual-reference.py: the example's tokenised interviews (TF-IDF),
// its coded segments (co-occurrence and presence), a synthetic corpus with three planted topics and the JS sampler's
// final topic assignments on it (LDA), and a planted two-class yes/no data set with the JS latent class fit (LCA).
// Run: node server/scripts/qual-dump.js && python3 server/scripts/qual-reference.py
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Q from '../../client/src/calc/tools/qual-core.js';
import { exampleProject } from '../../client/src/calc/tools/qual-example.js';
import { buildCorpus, lda } from '../../client/src/calc/tools/qual-lda.js';
import { runLCA } from '../../client/src/calc/tools/qual-lca.js';
import { rng } from '../../client/src/calc/cluster.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Synthetic LDA corpus: three topics of 8 words each (no overlap), 90 documents of 30 words, each document drawn
// mostly (90%) from one topic, the rest from the others.
export function plantedCorpus(seed = 7) {
  const r = rng(seed);
  const topics = [
    ['password', 'login', 'code', 'verify', 'account', 'locked', 'reset', 'email'],
    ['pharmacy', 'prescription', 'collect', 'medication', 'repeat', 'ready', 'inhaler', 'request'],
    ['appointment', 'queue', 'phone', 'receptionist', 'morning', 'slot', 'urgent', 'doctor'],
  ];
  const docs = [], truth = [];
  for (let d = 0; d < 90; d++) {
    const main = d % 3; truth.push(main); const doc = [];
    for (let i = 0; i < 30; i++) { const t = r() < 0.9 ? main : (main + 1 + Math.floor(r() * 2)) % 3; doc.push(topics[t][Math.floor(r() * 8)]); }
    docs.push(doc);
  }
  return { topics, docs, truth };
}
// Planted LCA data: 40 cases, 6 yes/no items, two classes with opposite patterns (θ = 0.9 or 0.1).
export function plantedLca(seed = 11) {
  const r = rng(seed); const C = [], truth = [];
  for (let i = 0; i < 40; i++) {
    const c = i < 24 ? 0 : 1; truth.push(c);
    C.push([0, 1, 2, 3, 4, 5].map((j) => (r() < ((j < 3) === (c === 0) ? 0.9 : 0.1) ? 1 : 0)));
  }
  return { C, truth };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const p = exampleProject(Q.emptyProject());
  const segs = Q.analysable(p.interviews);
  const tfDocs = p.interviews.map((_, i) => segs.filter((s) => s.ii === i).flatMap((s) => Q.contentTokens(s.text)));
  const codeIds = p.codes.map((c) => c.id);
  const segCodes = segs.map((s) => ({ ii: s.ii, codes: Q.codesOf(p.coding, s.id) }));
  const pc = plantedCorpus();
  const corpus = buildCorpus(pc.docs, { minDf: 1, maxDfShare: 1 });
  const fit = lda(corpus, { K: 3, iters: 300, seed: 3 });
  const pl = plantedLca();
  const lc = runLCA(pl.C, { seed: 1 });
  const f2 = lc.fits.find((f) => f.k === 2);
  const out = {
    tfidf: { docs: tfDocs },
    cooc: { codeIds, nInterviews: p.interviews.length, segCodes },
    lda: { docs: pc.docs, topics: pc.topics, vocab: corpus.vocab, z: fit.z.map((z) => Array.from(z)), K: 3, alpha: fit.alpha, beta: fit.beta, jsLL: fit.trace.at(-1).ll },
    lca: { C: pl.C, truth: pl.truth, w: f2.w, theta: f2.theta, ll: f2.ll, labels: f2.labels, fits: lc.fits.map((f) => ({ k: f.k, ll: f.ll, bic: f.bic, nParams: f.nParams })) },
  };
  writeFileSync(path.join(here, 'qual-reference-input.json'), JSON.stringify(out));
  console.log('wrote qual-reference-input.json');
}
