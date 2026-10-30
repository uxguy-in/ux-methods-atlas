// Statistical test selector: a short question flow (goal, outcome type, groups, paired, sample size, shape) that
// recommends a test and links to the calculator on this site that runs it. Pure data and functions;
// `npm run check:statsbench` walks every answer path and checks each link points to a real calculator id
// (client/src/calc/catalog.js) or one being added in calculator batch 2, and every method id exists in the atlas.

// Calculator ids being built in batch 2 (calculator-batch2.md). Names are used only until they appear in the catalog.
export const BATCH2 = {
  questionnaires: 'Questionnaire scorer', agreement: 'Agreement', 'item-analysis': 'Item analysis', 'survey-weighting': 'Survey weighting',
  regression: 'Regression workbench', mediation: 'Moderation and mediation', resampling: 'Bootstrap and permutation tests',
  'distribution-check': 'Distribution check', survival: 'Time to event (Kaplan-Meier)', 'test-selector': 'Statistical test selector',
  counterbalancing: 'Counterbalancing', 'value-of-information': 'Value of information', 'decision-tree': 'Decision tree', 'forecast-calibration': 'Forecast calibration',
  'use-fmea': 'Use FMEA', 'severity-ratings': 'Severity ratings', 'human-error': 'Human error', 'colour-contrast': 'Colour contrast',
  'top-tasks': 'Top tasks', 'search-analytics': 'Search analytics', 'control-charts': 'Control charts', concentration: 'Concentration',
  'classifier-metrics': 'Classifier metrics', 'reaction-time': 'Reaction time', 'risk-harm': 'Risk and harm', queueing: 'Queueing',
  'preference-test': 'Preference test', 'maxdiff-runner': 'MaxDiff runner', 'reaction-cards': 'Reaction cards',
};

export const QUESTIONS = {
  goal: {
    label: 'What do you want to find out?',
    options: [
      ['compare', 'Whether designs or groups differ'], ['benchmark', 'Whether one result beats a target'], ['estimate', 'A value with its margin of error'],
      ['relate', 'Whether two measures go together'], ['predict', 'What predicts or explains an outcome'], ['mechanism', 'Why or for whom an effect happens'],
      ['time', 'How long until something happens'], ['equivalent', 'That a change is no worse or equivalent'], ['agree', 'Whether raters or coders agree'],
      ['shape', 'Whether my data meet test assumptions'], ['plan', 'How many participants I need'],
    ],
  },
  outcome: {
    label: 'What kind of outcome are you measuring?',
    options: [['binary', 'Success or fail, yes or no'], ['continuous', 'Times, scores, scale totals'], ['ordinal', 'A single rating item or ranks'], ['count', 'Counts (errors, clicks, tickets)'], ['nominal', 'A choice among 3+ unordered options']],
  },
  groups: { label: 'How many designs or groups?', options: [['2', 'Two'], ['3+', 'Three or more']] },
  paired: { label: 'Did the same people see every design?', options: [['no', 'No, different people (between)'], ['yes', 'Yes, the same people (within)']] },
  size: { label: 'How many people per group?', options: [['small', 'Fewer than 30'], ['large', '30 or more']] },
  shape: { label: 'Is the outcome roughly symmetric without big outliers?', options: [['yes', 'Yes'], ['skewed', 'No, skewed (task times) or outliers'], ['unsure', 'Not sure']] },
  partner: { label: 'What kind is the other measure?', options: [['continuous', 'Numeric (scores, times)'], ['ordinal', 'Ratings or ranks'], ['nominal', 'Categories']] },
  raters: { label: 'What do the raters produce?', options: [['codes', 'Codes or categories'], ['scores', 'Numeric scores or ratings']] },
};

// The questions to ask, in order, given the answers so far.
export function flow(a) {
  const q = ['goal'];
  const g = a.goal;
  if (!g) return q;
  if (['compare', 'benchmark', 'estimate', 'relate', 'predict', 'equivalent'].includes(g)) q.push('outcome');
  if (g === 'agree') q.push('raters');
  if (g === 'compare' && a.outcome) { q.push('groups'); if (a.groups) q.push('paired'); }
  if (g === 'relate' && a.outcome) q.push('partner');
  const numericish = a.outcome === 'continuous';
  if (['compare', 'benchmark', 'estimate'].includes(g) && numericish) { q.push('size'); if (a.size === 'small') q.push('shape'); }
  if (g === 'compare' && ['binary', 'ordinal', 'count', 'nominal'].includes(a.outcome) && a.paired) q.push('size');
  return q;
}
export const complete = (a) => flow(a).every((k) => a[k]);

const R = (test, calc, why, extra = {}) => ({ test, calc, why, alts: [], methods: [], checks: [], ...extra });

// Recommendation for a complete set of answers.
export function recommend(a) {
  const { goal, outcome, groups, paired, size, shape, partner, raters } = a;
  const small = size === 'small', skew = shape === 'skewed', unsure = shape === 'unsure';
  if (goal === 'plan') return R('Sample size planning', 'sample-size', 'Pick the sample from the precision you need or the difference you want to detect, before you collect data.', { methods: ['sample-size-planning-for-summative-ux-studies', 'statistical-power-analysis'] });
  if (goal === 'shape') return R('Distribution check (Shapiro-Wilk, QQ plot, skewness)', 'distribution-check', 'Look at the shape before choosing between a t-test and a rank or resampling test; for task times, check whether logs make it normal.', { methods: ['examine-for-distributional-assumptions', 'right-skew-detection'] });
  if (goal === 'time') return R('Kaplan-Meier curves with the log-rank test', 'survival', 'Time-to-event data have people who have not had the event yet (censored); Kaplan-Meier uses them correctly, where an average of observed times would not.', { methods: ['kaplan-meier-curves-for-time-to-adoption', 'cox-proportional-hazards-survival-analysis'], alts: [['Cox proportional hazards (several predictors)', null]] });
  if (goal === 'mechanism') return R('Moderation (PROCESS model 1) or mediation (model 4) with a bootstrap', 'mediation', 'Moderation asks for whom or when an effect is larger; mediation asks whether it runs through a middle variable. Both need a clear causal order.', { methods: ['moderation-interaction-effects', 'mediation-analysis', 'process-macro-hayes-for-moderation-and-mediation'] });
  if (goal === 'agree') return raters === 'scores'
    ? R('Intraclass correlation (ICC) or Bland-Altman limits', 'agreement', 'Numeric ratings need an agreement measure that sees size of disagreement, not just whether codes match.', { alts: [["Krippendorff's alpha (interval level)", 'intercoder']], methods: ['cohens-kappa-and-krippendorffs-alpha-inter-rater-reliability'] })
    : R("Cohen's kappa or Krippendorff's alpha", 'intercoder', 'Corrects raw percent agreement for the agreement expected by chance.', { methods: ['cohens-kappa-and-krippendorffs-alpha-inter-rater-reliability'] });
  if (goal === 'equivalent') return R('Equivalence (TOST) or non-inferiority test', 'ab-health', 'A non-significant difference does not show two designs are the same; TOST tests that the difference is inside a margin you set in advance.', { methods: ['equivalence-testing-tost', 'non-inferiority-and-equivalence-trials-for-design-changes'] });

  if (goal === 'predict') {
    const m = { continuous: ['Multiple linear regression', 'Coefficients with intervals, standardised betas and diagnostics.', 'multiple-regression'], binary: ['Binary logistic regression', 'Odds ratios for a yes/no outcome.', 'logistic-regression-for-binary-outcomes'], ordinal: ['Ordinal (proportional odds) logistic regression', 'Keeps the order of a rating without treating it as equal-interval.', 'ordinal-regression'], count: ['Poisson or negative binomial regression', 'Rate ratios for counts; negative binomial when counts vary more than Poisson allows.', 'poisson-and-negative-binomial-regression-for-counts-and-rates'], nominal: ['Logistic regression for each option against a reference', 'Fit one binary logistic model per option (multinomial logit is not built in yet).', 'logistic-regression-for-binary-outcomes'] }[outcome];
    return R(m[0], 'regression', m[1], { alts: [['Key driver analysis (relative importance)', 'key-drivers']], methods: [m[2], 'regression-diagnostics'] });
  }
  if (goal === 'relate') {
    if (outcome === 'nominal' || partner === 'nominal') return outcome === 'binary' && partner === 'continuous'
      ? R('Logistic regression (or point-biserial correlation)', 'regression', 'A yes/no outcome against a numeric measure.', { methods: ['logistic-regression-for-binary-outcomes'] })
      : R("Chi-square test with Cramér's V", 'crosstab', 'Two categorical questions: cross-tabulate them and test the association.', { methods: ['chi-square-and-fishers-exact-tests', 'cross-tabulation-of-ux-metrics'] });
    if (outcome === 'binary' && partner !== 'nominal') return R('Logistic regression (or point-biserial correlation)', 'regression', 'A yes/no outcome against a numeric or rating measure.', { alts: [['Correlation of the 0/1 values (point-biserial)', 'correlation']], methods: ['logistic-regression-for-binary-outcomes'] });
    if (outcome === 'continuous' && partner === 'continuous') return R('Pearson correlation', 'correlation', 'Two numeric measures; check the scatter plot for curves and outliers.', { alts: [['Bootstrap interval for r', 'resampling']], methods: ['correlation-analysis-with-confidence-intervals'] });
    return R('Spearman rank correlation', 'correlation', 'Ratings, ranks or skewed measures: correlate the ranks.', { alts: [['Bootstrap interval for r', 'resampling']], methods: ['correlation-analysis-with-confidence-intervals', 'ordinal-vs-interval-distinction'] });
  }
  if (goal === 'estimate') {
    if (outcome === 'binary') return R('Adjusted-Wald interval for a proportion', 'completion-rate', 'The best-behaved interval for completion rates from small samples (Sauro and Lewis).', { methods: ['adjusted-wald-confidence-interval-for-completion-rates'] });
    if (outcome === 'continuous' && (skew || unsure)) return R('Geometric mean (log-transformed) interval', 'task-time', 'Task times are skewed; the geometric mean is a better typical value than the arithmetic mean in small samples.', { alts: [['Bootstrap interval for the median', 'resampling'], ['Check the shape first', 'distribution-check']], methods: ['confidence-intervals-for-task-time-log-transformed-and-median', 'geometric-mean-reporting'] });
    if (outcome === 'continuous' || outcome === 'ordinal') return R('t interval for the mean', 'rating', 'A mean rating or score with its interval.', { alts: [['Bootstrap interval', 'resampling']], methods: ['testing-against-a-benchmark-one-sample-tests'] });
    if (outcome === 'count') return R('Bootstrap interval for the mean count', 'resampling', 'Counts are skewed and bounded at zero; the bootstrap avoids a normal assumption.', { methods: ['bootstrap-methods-for-confidence-intervals'] });
    return R('Proportions with intervals per option', 'crosstab', 'Tabulate the choices and give each share an interval.', { methods: ['cross-tabulation-of-ux-metrics'] });
  }
  if (goal === 'benchmark') {
    if (outcome === 'binary') return R('Exact binomial test against the benchmark', 'rate-benchmark', 'Did more than the target share succeed? Uses the exact binomial for small samples.', { methods: ['testing-against-a-benchmark-one-sample-tests'] });
    if (outcome === 'continuous' && (skew || unsure)) return R('One-sample t-test on log times', 'task-time', 'Compare the geometric mean time with the target time on the log scale.', { alts: [['Sign-flip permutation test', 'resampling']], methods: ['confidence-intervals-for-task-time-log-transformed-and-median', 'testing-against-a-benchmark-one-sample-tests'] });
    if (outcome === 'continuous' || outcome === 'ordinal') return R('One-sample t-test against the benchmark', 'rating', 'Is the mean score above the target (for example SUS 68)?', { methods: ['testing-against-a-benchmark-one-sample-tests'] });
    if (outcome === 'count') return R('Bootstrap interval for the mean count, compared with the target', 'resampling', 'If the target lies outside the interval, the data are inconsistent with it.', { methods: ['bootstrap-methods-for-confidence-intervals'] });
    return R('Chi-square goodness of fit', 'crosstab', 'Compare the observed shares of each option with the expected shares.', { methods: ['chi-square-and-fishers-exact-tests'] });
  }
  // compare
  const within = paired === 'yes', two = groups === '2';
  if (outcome === 'binary') {
    if (two && !within) return R(small ? 'N−1 two-proportion test (Fisher exact for tiny counts)' : 'N−1 two-proportion test', 'compare-rates', 'Compares two completion or conversion rates; the N−1 chi-square works well even for small samples (Campbell 2007).', { alts: [['Bayesian A/B test', 'bayes-ab'], ["Fisher's exact test", 'crosstab']], methods: ['n-1-two-proportion-test', 'chi-square-and-fishers-exact-tests'] });
    if (two && within) return R('McNemar exact test', 'compare-rates', 'The same people tried both designs: only those who succeeded on one but not the other carry information.', { methods: ['mcnemar-exact-test-for-paired-proportions'] });
    if (!two && within) return R("Cochran's Q test", 'multi-compare', 'Three or more yes/no outcomes from the same people.', { methods: ['cochrans-q-test-for-related-dichotomous-outcomes'] });
    return R('Chi-square test of independence', 'crosstab', 'Success rates across three or more groups of different people.', { methods: ['chi-square-and-fishers-exact-tests'] });
  }
  if (outcome === 'nominal') return within ? R('McNemar-Bowker or Cochran\'s Q per option', 'multi-compare', 'Choices from the same people under each condition; test each option as yes/no.', { methods: ['cochrans-q-test-for-related-dichotomous-outcomes'] })
    : R(small ? "Fisher's exact test" : 'Chi-square test of independence', 'crosstab', 'Which option people chose, compared across groups.', { methods: ['chi-square-and-fishers-exact-tests'] });
  if (outcome === 'count') return R('Poisson or negative binomial regression with group as a predictor', 'regression', 'Counts are skewed and bounded at zero; the model gives a rate ratio between groups.', { alts: [['Permutation test on the difference in means', 'resampling'], ['Rank test', 'nonparametric']], methods: ['poisson-and-negative-binomial-regression-for-counts-and-rates'], checks: within ? ['Counts from the same people need a mixed or GEE model; as a quick check use a Wilcoxon signed-rank test on the differences.'] : [] });
  if (outcome === 'ordinal') {
    if (two) return within ? R('Wilcoxon signed-rank test', 'nonparametric', 'Paired ratings: ranks the differences, no interval assumption.', { methods: ['sign-test-wilcoxon-signed-rank-and-friedman-tests'] })
      : R('Mann-Whitney U test', 'nonparametric', 'Ratings from two groups of different people.', { alts: [['Ordinal logistic regression', 'regression']], methods: ['mann-whitney-u-test', 'ordinal-regression'] });
    return within ? R('Friedman test with Wilcoxon or Nemenyi follow-ups', 'multi-compare', 'Ratings from the same people on three or more designs.', { methods: ['sign-test-wilcoxon-signed-rank-and-friedman-tests'] })
      : R('Kruskal-Wallis test with Dunn follow-ups', 'multi-compare', 'Ratings from three or more groups of different people.', { methods: ['multiple-comparisons-correction'] });
  }
  // continuous
  const rough = small && (skew || unsure);
  const checks = unsure ? ['Not sure about the shape? Run the [distribution check](/calculators/distribution-check) first.'] : [];
  if (two) {
    if (within) return rough
      ? R('Paired t-test on log values, or Wilcoxon signed-rank', 'nonparametric', 'Skewed paired data from a small sample: rank the differences, or log-transform times first.', { alts: [['Paired t-test', 'compare-means'], ['Sign-flip permutation test', 'resampling']], methods: ['sign-test-wilcoxon-signed-rank-and-friedman-tests', 'log-transformation-of-task-completion-times'], checks })
      : R('Paired t-test', 'compare-means', 'The same people on both designs: test the mean of the differences.', { alts: [['Wilcoxon signed-rank', 'nonparametric']], methods: ['t-tests-for-comparing-designs-paired-and-two-sample', 'effect-size-calculation'], checks });
    return rough
      ? R("Welch's t-test on log times, or a permutation test", 'resampling', 'Skewed data in small groups: a permutation test or bootstrap of the difference makes no normality assumption.', { alts: [['Mann-Whitney U', 'nonparametric'], ['Welch t-test (log times)', 'compare-means']], methods: ['permutation-test-resampling-significance-test', 'mann-whitney-u-test', 'log-transformation-of-task-completion-times'], checks })
      : R("Welch's two-sample t-test", 'compare-means', 'Two groups of different people; Welch does not assume equal variances.', { alts: [['Bootstrap interval for the difference', 'resampling']], methods: ['t-tests-for-comparing-designs-paired-and-two-sample', 'effect-size-calculation'], checks });
  }
  if (within) return rough
    ? R('Friedman test', 'multi-compare', 'Skewed scores from the same people on three or more designs.', { methods: ['sign-test-wilcoxon-signed-rank-and-friedman-tests'], checks })
    : R('Repeated-measures ANOVA with Holm-corrected follow-ups', 'multi-compare', 'Scores from the same people on three or more designs.', { methods: ['repeated-measures-and-mixed-split-plot-anova', 'multiple-comparisons-correction'], checks });
  return rough
    ? R('Kruskal-Wallis test (or Welch ANOVA on log times)', 'multi-compare', 'Skewed scores in three or more small groups.', { methods: ['multiple-comparisons-correction'], checks })
    : R("Welch's ANOVA with Games-Howell follow-ups", 'multi-compare', 'Means of three or more groups of different people, without assuming equal variances.', { methods: ['anova-for-multi-design-comparisons-one-way-and-two-way', 'multiple-comparisons-correction'], checks });
}

// Every complete answer set, for the check script.
export function allPaths() {
  const out = [];
  const walk = (a) => {
    const next = flow(a).find((k) => !a[k]);
    if (!next) { out.push(a); return; }
    for (const [v] of QUESTIONS[next].options) walk({ ...a, [next]: v });
  };
  walk({});
  return out;
}

// ── Summary ──
// Confidence rule (in how well the recommendation fits): high when every question was answered without "not sure";
// medium when the shape is unsure; low when the goal has no single standard test (agreement on numeric scores, nominal
// outcomes with the same people), where the recommendation is only a starting point.
export function selectorSummary(a, rec, name) {
  const loose = (a.goal === 'agree' && a.raters === 'scores') || (a.goal === 'compare' && a.outcome === 'nominal' && a.paired === 'yes') || (a.goal === 'predict' && a.outcome === 'nominal');
  const confidence = loose ? 'low' : a.shape === 'unsure' ? 'medium' : 'high';
  const answered = flow(a).map((k) => QUESTIONS[k].options.find(([v]) => v === a[k])?.[1]).filter(Boolean);
  return {
    headline: `Recommended: ${rec.test}, in the [${name}](/calculators/${rec.calc}) calculator.`,
    meaning: [rec.why, `Based on your answers: ${answered.join('; ')}.`, ...(rec.alts.length ? [`Alternatives: ${rec.alts.map(([t, id]) => (id ? `${t} ([open](/calculators/${id}))` : t)).join('; ')}.`] : [])],
    confidence,
    confidenceNote: 'Rule: a strong fit when every question was answered without "not sure"; some when the shape of the data is unsure (check it first); weak when there is no single standard test for this design, so treat the suggestion as a starting point and ask a statistician.',
    caveats: ['Choose the test before you look at the results; switching tests until one is significant inflates false positives.', 'A test tells you whether a difference is detectable, not whether it matters: always report the effect size with its interval.'],
    next: [`Open the [${name}](/calculators/${rec.calc}) calculator and load or paste your data.`, ...(rec.checks || [])].slice(0, 3),
    report: `Analysis plan: ${rec.test} (${rec.why.replace(/\.$/, '')}).`,
  };
}
