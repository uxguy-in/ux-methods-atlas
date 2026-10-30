// Learning guides for the calculators: when to use each one, where it sits in a study, what it needs, how to do it
// step by step and how to get better at it. Plain data with no React, keyed by calculator id (calc/catalog.js).
// The schema is described in docs and checked by `npm run check:guides`. Every page that reads a guide falls back to
// the catalog's blurb and group when a calculator has none yet.

// Where in a study a calculator is used. Order matters: it is the order of the stage tabs and the study strip.
export const STAGES = {
  plan: { label: 'Planning the study', short: 'Plan', desc: 'Before fieldwork: choose a design, work out how many people you need, build the study.' },
  collect: { label: 'Running it', short: 'Run', desc: 'During fieldwork: tools that run the study, collect answers or check data as it comes in.' },
  analyse: { label: 'Analysing results', short: 'Analyse', desc: 'After the data is in: intervals, scores, comparisons and patterns.' },
  decide: { label: 'Deciding and reporting', short: 'Decide', desc: 'Prioritise, make the business case, and report what the numbers mean.' },
};

// What the researcher has in hand.
export const DATA = {
  'task-success': { label: 'Task success counts' },
  'task-time': { label: 'Times on task' },
  ratings: { label: 'Ratings and questionnaires' },
  survey: { label: 'Survey responses' },
  choices: { label: 'Choices, rankings and preferences' },
  'ab-test': { label: 'A/B test results' },
  analytics: { label: 'Analytics and logs' },
  qual: { label: 'Qualitative codes and findings' },
  navigation: { label: 'Tree tests, clicks and paths' },
  physiology: { label: 'Sensor and reaction data' },
  estimates: { label: 'Estimates and assumptions' },
  'design-specs': { label: 'Design properties' },
};

export const GUIDES = {
  'completion-rate': {
    question: 'How many people could do the task, and how sure can I be?',
    stages: ['analyse'],
    data: ['task-success'],
    studies: ['Usability test', 'Benchmark study', 'Unmoderated task test'],
    needs: 'For each task, the number of participants who attempted it and how many of them succeeded. These come from your session notes or the unmoderated testing tool.',
    when: [
      'After a moderated or unmoderated usability test with 5 to 30 people.',
      'When stakeholders ask "what share of users can do this?" and you only tested a handful.',
      'When you need a baseline to compare a redesign against later.',
    ],
    notFor: 'Comparing two designs (use [Compare two completion rates](/calculators/compare-rates)) or checking a target (use [Completion rate vs benchmark](/calculators/rate-benchmark)).',
    steps: [
      'Before the sessions, write down what counts as success for each task, including whether assisted completions count (usually they do not).',
      'After the sessions, count the participants who attempted the task (attempts).',
      'Count those who met your success rule (successes).',
      'Enter both numbers and keep 95% confidence unless you have a reason to change it.',
      'Report the interval and the best estimate together, for example "between 45% and 94% of users".',
    ],
    example: 'Seven of nine participants booked a meeting room unaided. The observed rate is 78%, but the 95% adjusted-Wald interval runs from about 45% to 94%. You can say "most users can probably do this, but a sizeable minority may struggle", not "78% of users can".',
    learn: 'The share of your participants who succeeded is only a guess at the share of all users who would. The confidence interval shows the range of rates that are consistent with your data. With small samples the interval is wide; that is honest, not a failure of the study.',
    deeper: 'The adjusted-Wald interval adds z²/2 successes and z² attempts before applying the usual normal formula, which keeps its coverage close to the stated level even with very small samples, where the plain Wald interval fails badly. The best point estimate switches between Wilson, the observed rate and Laplace depending on how high the rate is (Lewis and Sauro 2006; Sauro and Lewis, Quantifying the User Experience).',
    mistakes: [
      'Reporting "78% success" with no interval from nine people.',
      'Counting completions where the moderator helped as successes.',
      'Deciding what counts as success after seeing the sessions.',
      'Using the plain Wald interval, which can run below 0% or above 100% at small n.',
    ],
    next: ['rate-benchmark', 'compare-rates', 'sample-size'],
  },

  sus: {
    question: 'How usable do people find this product overall, and how does it compare?',
    stages: ['analyse', 'decide'],
    data: ['ratings'],
    studies: ['Usability test', 'Benchmark study', 'Post-release survey'],
    needs: 'Each participant\'s ten answers to the standard System Usability Scale, on the 1 to 5 scale, in the original item order. Collect them right after the tasks, before any discussion.',
    when: [
      'At the end of a usability test, to give one overall usability score per participant.',
      'When you benchmark a product release by release, or against a competitor.',
      'When you need a number that can be compared with published norms (an average of about 68).',
    ],
    notFor: 'Finding out what to fix: the score tells you how usable the product feels, not why. Pair it with observed problems from the [usability test](/methods/usability-testing).',
    steps: [
      'Use the ten standard SUS items word for word, with the positive and negative items alternating as published.',
      'Ask participants to complete it straight after the tasks.',
      'Paste one participant per line, ten answers each, in questionnaire order. The calculator reverses the even items for you.',
      'Read the mean score, its grade and percentile against the norm of 68.',
      'Report the mean with the number of participants, and compare it with your earlier releases or the norm.',
    ],
    example: 'Twelve participants completed SUS after testing a new expenses app. Their mean score is 74, which sits above the norm of 68, at roughly the 70th percentile on the curved grading scale. You can report "above average usability" and track whether the next release moves the score.',
    learn: 'SUS turns ten agree-disagree answers into one score from 0 to 100. The score is not a percentage: 68 is about average across hundreds of products, so it is the comparison with that norm, or with your own earlier score, that gives the number meaning.',
    deeper: 'Odd items contribute their answer minus 1 and even items 5 minus their answer; the sum is multiplied by 2.5. Grades follow the Sauro-Lewis curved grading scale, the percentile assumes scores are roughly normal with a mean of 68 and a standard deviation of 12.5, and the adjectives follow Bangor, Kortum and Miller (2009). To put an interval on the mean, use the [rating scale calculator](/calculators/rating).',
    mistakes: [
      'Rewording items or making them all positive, which breaks the comparison with the norms.',
      'Reading a score of 70 as "70% usable".',
      'Comparing two small groups by eye instead of with a test.',
    ],
    next: ['rating', 'compare-means', 'umux-lite'],
  },

  'compare-means': {
    question: 'Is design B really better than design A on ratings or task time?',
    stages: ['analyse'],
    data: ['ratings', 'task-time', 'ab-test'],
    studies: ['Comparative usability test', 'A/B test', 'Benchmark study'],
    needs: 'Either each design\'s mean, standard deviation and number of participants (different people), or each participant\'s score on both designs (the same people).',
    when: [
      'When two groups of people each tried a different design and you want to compare their ratings or times.',
      'When the same participants tried both designs in a within-subjects test.',
      'When you want to know how big the difference is, not only whether there is one.',
    ],
    notFor: 'Success rates (use [Compare two completion rates](/calculators/compare-rates)) or three or more designs (use [Compare three or more designs](/calculators/multi-compare)).',
    steps: [
      'Decide before the test whether the same people will try both designs or different people will try one each.',
      'Choose "Different people" or "The same people" to match how you ran it.',
      'For different people, enter each design\'s mean, SD and n; for the same people, paste one line per participant with both scores.',
      'For task times, choose "Task times" so they are compared on the log scale.',
      'Read the p-value together with the difference, its interval and the effect size, and report all three.',
    ],
    example: 'Twenty people rated an old checkout and twenty others a new one on the Single Ease Question. The new design averages 5.9 against 5.2. If the Welch test gives p below 0.05 and the interval for the difference stays above zero, you can say the new design is rated easier, and the effect size tells you whether the gain is small or large.',
    learn: 'Two groups will almost never have the same average, even if the designs are equally good, because people differ. The t-test asks how likely a difference this big would be if the designs were really the same. The effect size and the interval say how big the difference is, which matters more for a design decision than the p-value alone.',
    deeper: 'For different people the calculator uses Welch\'s t-test, which does not assume equal variances. For the same people it tests each person\'s difference, which removes the variation between people and needs fewer participants. Task times are compared on the log scale because times are skewed. Cohen\'s d and Hedges\' g express the difference in standard deviations (Sauro and Lewis, Quantifying the User Experience). Read more in [t-tests for comparing designs](/methods/t-tests-for-comparing-designs-paired-and-two-sample).',
    mistakes: [
      'Treating the same people as two independent groups, which throws away power.',
      'Reading p > 0.05 as proof that the designs are the same.',
      'Comparing raw task times without a log transformation.',
      'Reporting only the p-value without the size of the difference.',
    ],
    next: ['effect-size', 'nonparametric', 'sample-size'],
  },

  'cluster-personas': {
    question: 'Are there distinct groups of users in my survey data, and what are they like?',
    stages: ['analyse', 'decide'],
    data: ['survey'],
    studies: ['Segmentation survey', 'Persona research', 'Behavioural analytics'],
    needs: 'A table with one row per respondent and one column per question or behaviour, with a header row. Numbers, rating answers and categories can be mixed; usually an export from your survey tool or analytics.',
    when: [
      'When you have survey or behavioural data from roughly 100 or more people and suspect they fall into different groups.',
      'When you want to ground personas in data rather than only in workshops.',
      'When you need to check whether segments you already use show up in the data.',
    ],
    notFor: 'Writing personas on its own: clusters are a starting point, and you still need [interviews](/methods/personas) to learn the goals and stories behind them.',
    steps: [
      'Choose the columns that describe what makes users different (behaviours, needs, attitudes), not every column you have.',
      'Paste the data with a header row and check how each column was read (number, ordered, category).',
      'Start with k-medoids or a Gaussian mixture, and try a few numbers of clusters.',
      'Check the silhouette, stability or BIC to see whether the groups are real or forced.',
      'Read the draft persona cards, then interview a few people from each cluster before you name and write the personas.',
    ],
    example: 'A survey of 240 people who use a budgeting app asked how often they log in, how many accounts they link and how confident they feel with money. Three clusters come out with a reasonable silhouette: frequent planners, occasional checkers and anxious avoiders. The draft cards show what sets each group apart; six follow-up interviews per group turn them into personas.',
    learn: 'Clustering puts respondents who answered alike into the same group. It always returns groups, even when the data has none, so the checks matter as much as the clusters. The groups reflect the questions you asked: ask only about attitudes and you get attitudinal segments.',
    deeper: 'Distance-based methods (k-means, k-medoids with Gower distance for mixed data, hierarchical clustering, DBSCAN) group people by how close their answers are. Model-based methods (Gaussian mixtures, latent class analysis) assume hidden classes, give each person a probability of belonging to each, and choose the number of classes with BIC; they need more data, roughly 10 respondents per parameter. See [cluster analysis](/methods/cluster-analysis) and [validating clusters with qualitative research](/methods/cluster-validation-with-qualitative-investigation).',
    mistakes: [
      'Clustering on every column, so that demographics swamp the behaviours that matter.',
      'Believing the clusters without checking silhouette or stability.',
      'Publishing data-driven personas without talking to anyone in them.',
      'Running it on 30 respondents, where clusters are fragile.',
    ],
    next: ['factor-analysis', 'crosstab', 'key-drivers'],
  },
};
