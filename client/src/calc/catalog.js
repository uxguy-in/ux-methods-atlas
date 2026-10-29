// The list of calculators: id, group, name, blurb and the atlas methods each one links to (in its
// "How this is calculated" section). Plain data with no React, so the calculators page, the method pages (the
// "Calculate it" links), the study planner on the server and the static GitHub Pages build all read the same list.
// `npm run check:calc` fails if a calculator's links in Calculators.jsx and its `methods` here disagree.
export const CATALOG = [
  { group: 'Plan', id: 'sample-size', name: 'Sample size planner', blurb: 'How many participants you need to find problems, estimate a metric or compare designs.', methods: ['problem-discovery-sample-size-model-1-1-p-n', 'sample-size-planning-for-summative-ux-studies'] },
  { group: 'Measure', id: 'completion-rate', name: 'Completion rate interval', blurb: 'Confidence interval for a task success rate from a small sample.', methods: ['adjusted-wald-confidence-interval-for-completion-rates'] },
  { group: 'Measure', id: 'task-time', name: 'Task time interval', blurb: 'Typical task time with an interval that respects skew.', methods: ['confidence-intervals-for-task-time-log-transformed-and-median'] },
  { group: 'Measure', id: 'rating', name: 'Rating scale and benchmark', blurb: 'Interval for SUS, SEQ or any rating scale, tested against a benchmark.', methods: ['testing-against-a-benchmark-one-sample-tests'] },
  { group: 'Measure', id: 'sus', name: 'SUS scorer', blurb: 'Score raw System Usability Scale answers, with grade and percentile.', methods: ['system-usability-scale-sus'] },
  { group: 'Measure', id: 'umux-lite', name: 'UMUX and UMUX-Lite scorer', blurb: 'Score the four-item UMUX or two-item UMUX-Lite on the SUS scale.', methods: ['umux-lite', 'umux-usability-metric-for-user-experience'] },
  { group: 'Measure', id: 'sum', name: 'Single Usability Metric (SUM)', blurb: 'Combine completion, time, satisfaction and errors into one task score.', methods: ['single-usability-metric-sum'] },
  { group: 'Measure', id: 'top-box', name: 'Top-box and agreement target', blurb: 'Did enough people agree? Top-box share against a target, with the mean for comparison.', methods: ['top-box-analysis-of-rating-scales'] },
  { group: 'Measure', id: 'nps', name: 'Net Promoter Score', blurb: 'NPS with a proper confidence interval.', methods: ['net-promoter-score'] },
  { group: 'Questionnaires', id: 'seq', name: 'SEQ scorer', blurb: 'Single Ease Question mean with an interval, against the average of about 5.5.', methods: ['single-ease-question-seq-benchmarking'] },
  { group: 'Questionnaires', id: 'nasa-tlx', name: 'NASA-TLX scorer', blurb: 'Raw and weighted workload scores, with the 15 pairwise comparisons.', methods: ['nasa-tlx'] },
  { group: 'Questionnaires', id: 'ueq', name: 'UEQ scorer', blurb: 'Six User Experience Questionnaire scales, against the published benchmark.', methods: ['ueq-user-experience-questionnaire'] },
  { group: 'Questionnaires', id: 'attrakdiff', name: 'AttrakDiff (short) scorer', blurb: 'Pragmatic, hedonic and attractiveness scores on the AttrakDiff portfolio.', methods: ['attrakdiff'] },
  { group: 'Compare', id: 'compare-rates', name: 'Compare two completion rates', blurb: 'N−1 two-proportion test or McNemar for the same people.', methods: ['n-1-two-proportion-test', 'mcnemar-exact-test-for-paired-proportions'] },
  { group: 'Compare', id: 'compare-means', name: 'Compare two means', blurb: 'Welch or paired t-test for ratings and task times.', methods: ['t-tests-for-comparing-designs-paired-and-two-sample', 'effect-size-calculation'] },
  { group: 'Compare', id: 'rate-benchmark', name: 'Completion rate vs benchmark', blurb: 'Did more than the target share of users succeed?', methods: ['testing-against-a-benchmark-one-sample-tests'] },
  { group: 'Compare', id: 'correlation', name: 'Correlation', blurb: 'How strongly two measures move together, with an interval.', methods: ['correlation-analysis-with-confidence-intervals'] },
  { group: 'Experiments', id: 'effect-size', name: 'Effect size', blurb: "Cohen's d and Hedges' g with an interval: how big the difference is.", methods: ['effect-size-calculation'] },
  { group: 'Experiments', id: 'nonparametric', name: 'Nonparametric comparison', blurb: 'Mann-Whitney U or Wilcoxon signed-rank for ratings and skewed data.', methods: ['mann-whitney-u-test', 'sign-test-wilcoxon-signed-rank-and-friedman-tests'] },
  { group: 'Experiments', id: 'bayes-ab', name: 'Bayesian A/B test', blurb: 'Chance that B beats A and the expected loss of each choice.', methods: ['bayesian-a-b-testing-with-expected-loss'] },
  { group: 'Experiments', id: 'sprt', name: 'Sequential test planner', blurb: 'Wald SPRT boundaries: stop or continue as conversions come in.', methods: ['sequential-testing-sprt-and-group-sequential-designs'] },
  { group: 'Survey quality', id: 'reliability', name: 'Scale reliability', blurb: "Cronbach's alpha with an interval, item diagnostics and McDonald's omega.", methods: ['reliability-analysis-cronbachs-alpha-split-half-omega', 'cronbachs-and-mcdonalds'] },
  { group: 'Survey quality', id: 'margin-of-error', name: 'Survey margin of error', blurb: 'Margin for a proportion, or the sample needed, with population size and design effect.', methods: ['probability-sampling', 'design-effects-and-design-based-analysis-of-complex-samples'] },
  { group: 'Segmentation', id: 'cluster-personas', name: 'Cluster to personas', blurb: 'Paste survey data, cluster respondents with k-medoids, k-means, DBSCAN or hierarchical methods, and draft personas from the clusters.', methods: ['cluster-analysis', 'personas', 'gowers-distance-for-mixed-data-clustering', 'dbscan-density-based-clustering', 'silhouette-scores-and-gap-statistic-validation', 'cophenetic-and-matrix-correlation-checks-for-hierarchical-clustering', 'choosing-a-resemblance-coefficient-for-clustering', 'k-means-vs-gmm-comparison', 'gaussian-mixture-models-for-user-segmentation', 'gmm-behavioural-clustering', 'latent-class-analysis-for-personas', 'factor-analytic-and-correspondence-analytic-persona-development', 'cluster-validation-with-qualitative-investigation', 'persona-validation-against-behavioural-data', 'pca', 'multidimensional-scaling-and-perceptual-mapping', 'hypersona-semi-automated-clustering-algorithm-selection'] },
  { group: 'Qualitative rigour', id: 'intercoder', name: 'Inter-coder agreement', blurb: "Percent agreement, Cohen's kappa and Krippendorff's alpha for coded data.", methods: ['cohens-kappa-and-krippendorffs-alpha-inter-rater-reliability', 'heuristic-evaluation-with-inter-evaluator-reliability', 'start-list-coding-with-a-structured-codebook-and-check-coding'] },
  { group: 'Qualitative rigour', id: 'saturation', name: 'Saturation and coverage', blurb: 'Code accumulation, Good-Turing coverage and an estimate of codes still to find.', methods: ['species-accumulation-and-good-turing-coverage-for-saturation', 'saturation-detection', 'saturation-monitoring', 'theoretical-sampling-and-saturation'] },
  { group: 'Discover', id: 'expectation', name: 'Expectation vs experience', blurb: 'Map tasks by expected and experienced ease to see what to fix first.', methods: ['expectation-ratings-expected-vs-experienced-difficulty'] },
  { group: 'Discover', id: 'discovery', name: 'Problems left to find', blurb: 'Estimate how many usability problems your test missed.', methods: ['problem-discovery-sample-size-model-1-1-p-n', 'capture-recapture-estimation-of-usability-problems'] },
  { group: 'Discover', id: 'capture-recapture', name: 'Capture-recapture estimate', blurb: 'How many problems remain, from the overlap between evaluators or sessions.', methods: ['capture-recapture-estimation-of-usability-problems', 'problem-discovery-sample-size-model-1-1-p-n'] },
  { group: 'Predictive models', id: 'klm', name: 'KLM task-time predictor', blurb: 'Predict expert task time from keystroke-level operators, with automatic M placement.', methods: ['keystroke-level-model-klm', 'goms-klm'] },
  { group: 'Predictive models', id: 'fitts', name: "Fitts' law", blurb: 'Pointing time and index of difficulty, effective width, and a touch-target mode.', methods: ['fitts-law-modelling', 'touch-target-fitts-law-calibration-for-mobile'] },
  { group: 'Predictive models', id: 'hick', name: 'Hick-Hyman law', blurb: 'Decision time for a set of choices, equally likely or weighted by use.', methods: ['hicks-law-analysis'] },
  { group: 'Pricing and prioritisation', id: 'van-westendorp', name: 'Van Westendorp price meter', blurb: 'Price curves and the acceptable range from the four price questions.', methods: ['van-westendorp-price-sensitivity-meter'] },
  { group: 'Pricing and prioritisation', id: 'gabor-granger', name: 'Gabor-Granger pricing', blurb: 'Demand and revenue at each price, and the revenue-maximising price.', methods: ['gabor-granger-pricing'] },
  { group: 'Pricing and prioritisation', id: 'kano', name: 'Kano classifier', blurb: 'Classify features from functional and dysfunctional answers, with Better and Worse scores.', methods: ['kano-analysis'] },
  { group: 'Pricing and prioritisation', id: 'maxdiff', name: 'MaxDiff counts', blurb: 'Best-minus-worst scores and preference shares from best-worst tasks.', methods: ['maxdiff-best-worst-scaling'] },
  { group: 'Pricing and prioritisation', id: 'turf', name: 'TURF reach', blurb: 'Which set of items reaches the most people, by exhaustive and greedy search.', methods: ['turf-analysis'] },
  { group: 'Business case and content', id: 'ux-roi', name: 'UX ROI and cost-benefit', blurb: 'Annual benefit, ROI, payback and net present value of a UX improvement.', methods: ['ux-roi-and-cost-benefit-calculation'] },
  { group: 'Business case and content', id: 'lostness', name: 'Lostness', blurb: "Smith's lostness score per participant from pages visited.", methods: ['lostness-metric'] },
  { group: 'Business case and content', id: 'readability', name: 'Readability', blurb: 'Flesch Reading Ease, Flesch-Kincaid grade and long sentences in pasted text.', methods: ['readability-analysis', 'readability-testing'] },
];

export const CALC_NAMES = Object.fromEntries(CATALOG.map((c) => [c.id, c.name]));

// Reverse map: atlas method id → the calculators that link to it.
export const CALCS_BY_METHOD = CATALOG.reduce((map, c) => {
  for (const m of c.methods) (map[m] ||= []).push({ id: c.id, name: c.name, group: c.group });
  return map;
}, {});
export const calculatorsFor = (methodId) => CALCS_BY_METHOD[methodId] || [];
