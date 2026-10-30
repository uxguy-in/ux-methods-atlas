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
  "sample-size": {
    "question": "How many participants do I need for this study?",
    "stages": [
      "plan"
    ],
    "data": [
      "estimates"
    ],
    "studies": [
      "Usability test",
      "Benchmark study",
      "Comparative test",
      "Unmoderated test"
    ],
    "needs": "What the study is for (finding problems, estimating a rate or score, or comparing two designs) and your best guesses: how common the problems you care about are, the margin you can live with, or the smallest difference worth detecting and the usual standard deviation.",
    "when": [
      "Before recruiting for a formative usability test, to choose between 5, 8 or 15 people",
      "When planning a benchmark that must report a completion rate or score to within a set margin",
      "When stakeholders want to know whether two designs differ and you need enough people per group to see it"
    ],
    "notFor": "Large surveys where population size or a design effect matters (use [Survey margin of error](/calculators/margin-of-error)).",
    "steps": [
      "Decide what the study is for: finding problems, estimating one number, or comparing two designs.",
      "Choose the matching goal in the planner.",
      "Fill in your assumptions: problem frequency and the chance of seeing it, or the margin and expected rate or standard deviation, and for comparisons the smallest difference worth finding and the power.",
      "Read the number of participants; for comparisons between different people it is per group.",
      "Add 10 to 20% for no-shows and unusable sessions, especially in unmoderated studies."
    ],
    "example": "You want an 85% chance of seeing any problem that affects at least 15% of users. The planner says 12 participants. If you only cared about problems that hit 31% of users, five people would give about an 84% chance, which is where the famous \"five users\" comes from.",
    "learn": "How many people you need depends on what you want to learn. Finding problems needs fewer people than measuring a number precisely, and spotting a small difference between two designs needs the most. Every answer rests on assumptions, so write them down and treat the result as a planning figure, not a rule.",
    "deeper": "Finding problems uses n = ln(1 − goal)/ln(1 − p), from the 1 − (1 − p)^n discovery model. Estimating a rate uses the adjusted-Wald form n = z²p(1−p)/d² − z²; estimating or comparing means repeats n = ((t_α + t_β)s/d)² until n stops changing, because the t values depend on n. Comparing rates uses the standard normal-approximation formula. The formulas follow Sauro and Lewis, Quantifying the User Experience.",
    "mistakes": [
      "Using p = 31% for every study, which assumes problems are common and misses the rarer ones.",
      "Forgetting that a comparison between different people gives the number per group, so the total is double.",
      "Guessing the standard deviation; take it from an earlier study of the same measure.",
      "Not adding a buffer for drop-outs and unusable sessions."
    ],
    "next": [
      "completion-rate",
      "discovery",
      "margin-of-error"
    ]
  },
  "completion-rate": {
    "question": "What share of users can complete this task, and how sure can I be?",
    "stages": [
      "analyse"
    ],
    "data": [
      "task-success"
    ],
    "studies": [
      "Usability test",
      "Benchmark study",
      "Unmoderated test"
    ],
    "needs": "The number of participants who attempted the task and how many succeeded, from your session notes or test platform.",
    "when": [
      "After a moderated or unmoderated usability test with 5 to 30 people",
      "When stakeholders ask \"what share of users can do this?\"",
      "When you want an honest range to put next to a success rate in a report"
    ],
    "notFor": "Comparing two designs (use [Compare two completion rates](/calculators/compare-rates)) or checking a target (use [Completion rate vs benchmark](/calculators/rate-benchmark)).",
    "steps": [
      "Decide in advance what counts as success for the task.",
      "Count the participants who attempted the task (attempts).",
      "Count the successes.",
      "Enter both, choose the confidence level and read the adjusted-Wald interval.",
      "Report the interval alongside the rate, not the percentage on its own."
    ],
    "example": "Eight of ten participants changed their delivery address unaided. The observed rate is 80%, but the 95% adjusted-Wald interval runs from 48% to 95%. You can say most users can probably do this; you cannot say 80% will.",
    "learn": "The rate in your sample is an estimate of the rate for all users. The interval shows the range of rates that fit your data reasonably well. Small samples give wide intervals; that is honest, not a failure.",
    "deeper": "The adjusted-Wald interval adds z²/2 successes and z² attempts (about two and four at 95%) before applying the usual formula, which keeps it accurate even at very small sample sizes; Sauro and Lewis found it has the best coverage for usability-test samples. The exact (Clopper-Pearson) interval is shown as a conservative comparison and the plain Wald interval only to show how badly it behaves at small n. The best single estimate follows Lewis and Sauro (2006): Wilson below 50%, the observed rate from 50% to 90%, and Laplace (x + 1)/(n + 2) above 90%.",
    "mistakes": [
      "Reporting 80% without the interval.",
      "Counting assisted or partial completions as successes without saying so.",
      "Using the plain Wald interval from a spreadsheet, which behaves badly with small samples.",
      "Including people who never reached the task in the attempts."
    ],
    "next": [
      "rate-benchmark",
      "compare-rates",
      "sum"
    ]
  },
  "task-time": {
    "question": "How long does this task typically take, and how precise is that figure?",
    "stages": [
      "analyse"
    ],
    "data": [
      "task-time"
    ],
    "studies": [
      "Usability test",
      "Benchmark study",
      "Unmoderated test"
    ],
    "needs": "The time each participant took on one task, in seconds, from recordings or the test platform. Leave out failed attempts.",
    "when": [
      "When you need a typical task time for a benchmark or a before-and-after report",
      "When a few slow participants make the average look worse than most people's experience",
      "When you want to check a typical time against a target, such as \"under two minutes\""
    ],
    "notFor": "Comparing the times of two designs (use [Compare two means](/calculators/compare-means), which works on log times).",
    "steps": [
      "Decide when the clock starts and stops, and use the same rule for everyone.",
      "Export the times for successful attempts only.",
      "Paste them in and, if you have one, enter a target time.",
      "Read the interval for the geometric mean (under 25 times) or the median (25 or more).",
      "Report the typical time with its interval, not the arithmetic mean."
    ],
    "example": "Ten participants took between 94 and 298 seconds to download an invoice. The arithmetic mean is 159 s, pulled up by two slow people, but the geometric mean is 146 s with a 95% interval of 107 to 198 s. Against a target of 120 s, the interval overlaps, so you cannot yet claim either way.",
    "learn": "Task times are skewed: most people finish in a similar time, but a few take much longer and drag the ordinary average up. The geometric mean or the median describes a typical user better. The interval shows how precisely your sample pins down that typical time.",
    "deeper": "For fewer than 25 times the calculator takes natural logs, builds a t interval on the log scale and converts it back, giving the geometric mean with an asymmetric interval. For 25 or more it reports the median with an interval from binomial order statistics (ranks n/2 ± z√(n/4)). This follows Sauro and Lewis (2010).",
    "mistakes": [
      "Reporting the arithmetic mean of skewed times.",
      "Including failed or abandoned attempts.",
      "Mixing timing rules, such as starting the clock before some people finished reading the task.",
      "Calling the target met when the interval still overlaps it."
    ],
    "next": [
      "compare-means",
      "sum",
      "klm"
    ]
  },
  "rating": {
    "question": "What is our average score, and is it above the benchmark?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings"
    ],
    "studies": [
      "Benchmark study",
      "Usability test",
      "Survey"
    ],
    "needs": "Either each participant's score, or the mean, standard deviation and sample size of a rating such as SUS, SEQ or UMUX-Lite, plus a benchmark to test against.",
    "when": [
      "After a benchmark study, to report a SUS or SEQ score with an interval",
      "When you need to say whether a score beats a known average such as 68 for SUS",
      "When you only have summary figures (mean, SD, n) from a tool or an earlier report"
    ],
    "notFor": "Scoring raw SUS answers (use the [SUS scorer](/calculators/sus) first) or comparing two designs (use [Compare two means](/calculators/compare-means)).",
    "steps": [
      "Score the questionnaire first so you have one score per participant.",
      "Pick the scale preset (SUS, SEQ, UMUX-Lite or other); this fills in a common benchmark.",
      "Enter raw scores, or the mean, standard deviation and sample size.",
      "Check the benchmark and choose the confidence level.",
      "Read the interval and the one-sided p-value for \"higher than the benchmark\"."
    ],
    "example": "Twenty participants gave a new booking flow a mean SUS of 75 (SD 12). The 95% interval runs from 69.4 to 80.6, entirely above the average of 68, and the one-sided p-value is 0.009. You can report that the flow scores above average.",
    "learn": "The mean of your sample is an estimate. The confidence interval gives the range of averages consistent with your data. If the whole interval sits above the benchmark you have good evidence you beat it; if it straddles the benchmark you cannot yet tell.",
    "deeper": "The interval is mean ± t × SD/√n with n − 1 degrees of freedom, and the benchmark test is a one-sample t-test whose one-sided p-value answers \"is the true mean higher than the benchmark?\". Sauro and Lewis show that t-based methods work well for rating scales, even with small samples. For SUS the calculator also gives the Sauro-Lewis grade and percentile.",
    "mistakes": [
      "Testing against a benchmark measured with a different version or wording of the questionnaire.",
      "Reading a non-significant result as \"we are at the benchmark\" rather than \"not yet shown\".",
      "Using the two-sided p-value when the question was only whether you are higher."
    ],
    "next": [
      "compare-means",
      "top-box",
      "effect-size"
    ]
  },
  "sus": {
    "question": "What is our SUS score, and is it good?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings"
    ],
    "studies": [
      "Usability test",
      "Benchmark study",
      "Survey"
    ],
    "needs": "Each participant's ten System Usability Scale answers (1 to 5) in questionnaire order, one person per line, from your test platform or a spreadsheet.",
    "when": [
      "At the end of a usability test, to summarise perceived usability in one score",
      "In a benchmark you will repeat after a redesign",
      "When you need a grade or percentile that stakeholders can understand"
    ],
    "notFor": "Rating single tasks (use the [SEQ scorer](/calculators/seq)) or comparing two designs (use [Compare two means](/calculators/compare-means)).",
    "steps": [
      "Give the standard ten-item SUS after participants have used the product.",
      "Export the raw answers, keeping the original item order.",
      "Paste one participant per line; do not reverse any items yourself.",
      "Read the mean score, its interval, the grade and the percentile.",
      "Report the mean with its interval and grade, for example \"74 (66 to 82), B−\"."
    ],
    "example": "Fifteen participants rated a travel app. The mean SUS is 74 (SD 14) with a 95% interval of 66 to 82. That is a B− on the Sauro-Lewis scale, around the 68th percentile, so above average but with room to improve.",
    "learn": "SUS turns ten agree-disagree answers into one score from 0 to 100. It is not a percentage: 68 is average, so a 68 is a middling score, not a fail. The grade and percentile put your score in the context of hundreds of other studies.",
    "deeper": "Odd items contribute their answer minus 1 and even items 5 minus their answer; the sum is multiplied by 2.5. Grades use the Sauro-Lewis curved grading scale from Quantifying the User Experience (2nd ed.), and the percentile assumes a normal distribution with mean 68 and SD 12.5 from Sauro's database. Adjectives follow Bangor, Kortum and Miller (2009).",
    "mistakes": [
      "Reading the score as a percentage, so that 68 looks like a poor mark.",
      "Reversing the even items yourself and then again in the calculator.",
      "Changing the wording or the 5-point format and still comparing with 68.",
      "Reporting a mean from five people without its interval."
    ],
    "next": [
      "rating",
      "compare-means",
      "reliability"
    ]
  },
  "umux-lite": {
    "question": "What is our UMUX-Lite score, and what does it mean on the SUS scale?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings"
    ],
    "studies": [
      "Survey",
      "Usability test",
      "Benchmark study"
    ],
    "needs": "Each participant's answers to the two UMUX-Lite items, or the four UMUX items, on 1-to-7 scales, one person per line.",
    "when": [
      "When a short questionnaire suits better than the ten-item SUS, such as in an in-product survey",
      "When you want to compare a UMUX-Lite score with SUS norms",
      "When tracking perceived usability over releases with minimal burden on users"
    ],
    "notFor": "Raw SUS answers (use the [SUS scorer](/calculators/sus)).",
    "steps": [
      "Ask the items on a 7-point scale with the standard wording.",
      "Choose UMUX-Lite (2 items) or UMUX (4 items).",
      "Paste one participant per line; the calculator reverses UMUX items 2 and 4 for you.",
      "Read the mean, its interval and the SUS-equivalent grade."
    ],
    "example": "An in-app survey of 120 users gives a mean UMUX-Lite of 75. Using the regression conversion that is about 71.7 on the SUS scale, a C+: slightly above the SUS average of 68.",
    "learn": "UMUX-Lite asks only two questions (does it meet my needs, is it easy to use) and puts the answers on a 0 to 100 scale. Because many teams know SUS norms, the calculator converts the score to its SUS equivalent so you can read it against them.",
    "deeper": "UMUX-Lite = ((item 1 − 1) + (item 2 − 1))/12 × 100, and the SUS-equivalent uses Lewis, Utesch and Maher's (2013) regression, 0.65 × UMUX-Lite + 22.9. The four-item UMUX (Finstad 2010) recodes items 1 and 3 as response − 1 and items 2 and 4 as 7 − response, sums them, divides by 24 and multiplies by 100; it tracks SUS closely, so it is read against SUS norms directly.",
    "mistakes": [
      "Comparing the raw UMUX-Lite score with 68 instead of using the SUS-equivalent.",
      "Using a 5-point version of the items.",
      "Reversing UMUX items 2 and 4 before entering them, so they are reversed twice."
    ],
    "next": [
      "rating",
      "compare-means",
      "sus"
    ]
  },
  "sum": {
    "question": "How usable is this task overall, in one number?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "task-success",
      "task-time",
      "ratings"
    ],
    "studies": [
      "Usability test",
      "Benchmark study"
    ],
    "needs": "For one task: successes and attempts, the times of successful attempts with a target time, post-task ratings with a target rating, and optionally the number of errors and error opportunities per attempt.",
    "when": [
      "When a dashboard or scorecard needs one number per task",
      "When comparing many tasks to decide which to work on first",
      "When you collected completion, time and satisfaction in a benchmark and want them combined"
    ],
    "notFor": "Explaining why a task is hard: look at the components and your observations, not only the combined score.",
    "steps": [
      "Set the target time and target rating before you look at the data.",
      "Enter successes and attempts.",
      "Paste the times of successful attempts and the post-task ratings.",
      "Add total errors and error opportunities if you logged them; otherwise leave opportunities at 0.",
      "Read the SUM and the share for each component."
    ],
    "example": "For \"renew a parking permit\", 8 of 10 succeeded (80%), 61% are predicted to finish under the 100-second target, 75% to rate the task above 5 on the SEQ, and 92% of error opportunities were error-free. The SUM is 77%, with time the weakest component.",
    "learn": "The Single Usability Metric turns each measure into the share of users who meet a target, then averages those shares. That gives one score per task that is easy to compare and track. The components show which part of the experience pulls the score down.",
    "deeper": "Following Sauro and Kindlund (2005), completion is the success rate; time is the share predicted to finish under the target from a normal fit to log times; satisfaction is the share predicted to rate above the target from a normal fit to the ratings; errors are the share of error opportunities without an error. The shares are averaged, and components you leave out are skipped.",
    "mistakes": [
      "Setting targets after seeing the results.",
      "Reporting only the SUM and hiding the components.",
      "Comparing SUMs built from different targets or different components.",
      "Including the times of failed attempts."
    ],
    "next": [
      "completion-rate",
      "task-time",
      "seq"
    ]
  },
  "top-box": {
    "question": "Did enough people agree, and does that meet our target?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings",
      "survey"
    ],
    "studies": [
      "Survey",
      "Benchmark study",
      "Usability test"
    ],
    "needs": "One rating per participant on a 5, 7 or 10-point scale, the point from which an answer counts as agreeing (such as 4 on a 5-point scale), and the target share.",
    "when": [
      "When stakeholders set a goal such as \"75% should agree it is easy\"",
      "When a share of people agreeing is easier to explain than a mean rating",
      "When checking a single survey statement against a target"
    ],
    "notFor": "Detecting small changes in ratings; the mean is more sensitive (use [Rating scale and benchmark](/calculators/rating)).",
    "steps": [
      "Decide the cut-off (top box or top two boxes) and the target before collecting data.",
      "Paste one rating per participant and choose the scale length.",
      "Enter the cut-off and the target share.",
      "Read the top-box share, its interval and the p-value against the target.",
      "Compare with the mean-based result shown alongside."
    ],
    "example": "Ten of twelve participants chose 4 or 5 for \"the checkout was easy\" (83%). The target was 75%: the 80% interval runs from 65% to 93% and the one-sided mid-p is 0.27, so the target is not yet shown, even though the observed share is above it.",
    "learn": "Top-box analysis turns each rating into a yes or no: agreed or did not. That is easy to explain, but it throws away detail, so tests on top-box shares need more people than tests on the mean. The calculator shows both so you can see the difference.",
    "deeper": "Ratings at or above the cut-off become 1 and the rest 0. The share is tested against the target with the one-sided binomial mid-p test for small samples or the normal approximation for large ones, and given an adjusted-Wald interval, exactly as for completion rates. The comparison with a one-sample t-test on the raw ratings follows Sauro and Lewis's worked example.",
    "mistakes": [
      "Choosing the cut-off after seeing which gives the best number.",
      "Comparing top-two-box shares from a 5-point and a 7-point scale.",
      "Reporting the share without its interval."
    ],
    "next": [
      "rating",
      "compare-rates",
      "margin-of-error"
    ]
  },
  "nps": {
    "question": "What is our Net Promoter Score, and how precise is it?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings",
      "survey"
    ],
    "studies": [
      "Survey",
      "Customer feedback programme",
      "Benchmark study"
    ],
    "needs": "Answers to the 0-to-10 \"how likely are you to recommend\" question, either raw or as counts of promoters (9 to 10), passives (7 to 8) and detractors (0 to 6).",
    "when": [
      "When reporting NPS from a survey and you want an honest range around it",
      "When deciding whether a change from last quarter could just be noise",
      "When the sample is small and the score swings a lot"
    ],
    "notFor": "Measuring the usability of a specific task or product (use the [SEQ scorer](/calculators/seq) or the [SUS scorer](/calculators/sus)).",
    "steps": [
      "Export the 0-to-10 answers, or count promoters, passives and detractors.",
      "Enter raw ratings or counts.",
      "Choose the confidence level (90% is common for NPS).",
      "Read the score and its interval, and report both."
    ],
    "example": "Of 100 respondents, 50 are promoters, 30 passives and 20 detractors. The NPS is 30, and the 90% interval runs from about 16 to 42. A rise to 35 next quarter on a similar sample would be well within that range.",
    "learn": "NPS is the percentage of promoters minus the percentage of detractors, so it runs from −100 to +100. Because it subtracts two percentages from the same sample, it is noisier than either one, and small samples give wide intervals.",
    "deeper": "The interval uses the adjusted-Wald method recommended by Rocks (2016) and MeasuringU: add 3/4 to the promoter and detractor counts and 3 to the total, then use the variance of a difference of two proportions from the same sample, (p + d − (p − d)²)/n.",
    "mistakes": [
      "Reporting a change of a few points as real without checking the intervals.",
      "Comparing NPS gathered with different wording or scales.",
      "Treating NPS as a measure of usability."
    ],
    "next": [
      "margin-of-error",
      "top-box",
      "sus"
    ]
  },
  "seq": {
    "question": "How easy did people find this task, compared with a typical task?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings"
    ],
    "studies": [
      "Usability test",
      "Benchmark study",
      "Unmoderated test"
    ],
    "needs": "The Single Ease Question rating (1 very difficult to 7 very easy) each participant gave straight after one task.",
    "when": [
      "After each task in a usability test, to see which tasks felt hard",
      "When you want to compare a task's ease with the average of about 5.5",
      "When tracking the same task across releases"
    ],
    "notFor": "Comparing two tasks or designs (use [Compare two means](/calculators/compare-means)).",
    "steps": [
      "Ask \"Overall, how difficult or easy was the task to complete?\" on a 7-point scale right after the task.",
      "Paste the ratings for one task.",
      "Keep the benchmark at 5.5 unless you have your own norm.",
      "Read the mean, its interval and the test against the benchmark.",
      "Pair low scores with what you observed to explain them."
    ],
    "example": "Twelve participants rated \"set up a direct debit\": the mean is 5.33 with a 95% interval of 4.55 to 6.12. The interval contains 5.5 (p = 0.65), so you cannot say the task is harder or easier than a typical task; more participants would narrow it.",
    "learn": "The SEQ is one quick question asked after each task. Its average across many tasks is about 5.5, so a mean clearly below that marks a harder-than-usual task. The interval tells you whether the difference from 5.5 is clear or still uncertain.",
    "deeper": "The calculator gives a t-based interval for the mean and a one-sample t-test against the benchmark. Sauro's database of several hundred tasks puts the average at about 5.5. Use the same wording and the 7-point version if you compare with that figure.",
    "mistakes": [
      "Changing the wording or using a 5-point scale and still comparing with 5.5.",
      "Asking the SEQ at the end of the session instead of after each task.",
      "Treating the score as a replacement for observing where people struggled."
    ],
    "next": [
      "compare-means",
      "expectation",
      "sum"
    ]
  },
  "nasa-tlx": {
    "question": "How much workload did this task put on people?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings"
    ],
    "studies": [
      "Usability test",
      "Lab experiment",
      "Safety-critical evaluation"
    ],
    "needs": "Each participant's six NASA-TLX ratings from 0 to 100 (mental, physical, temporal, performance, effort, frustration), and optionally the weights from the 15 pairwise choices.",
    "when": [
      "When evaluating complex or safety-critical tasks where mental load matters",
      "When comparing the workload of two designs or two versions of a task",
      "When you want to know which kind of demand (time pressure, effort, frustration) drives the load"
    ],
    "notFor": "Judging a design against a fixed pass mark: TLX has none, so compare designs or tasks measured the same way.",
    "steps": [
      "After the task, ask the six ratings on 0 to 100 scales; performance runs from perfect (0) to failure (100).",
      "Optionally run the 15 pairwise comparisons to get weights.",
      "Enter one participant per line (ratings, then weights if you have them), or one participant with the pairs.",
      "Read the mean raw or weighted TLX, its interval and the profile across the six dimensions."
    ],
    "example": "Five participants used a new dispatch screen. The mean raw TLX is 48, with a 95% interval of 36 to 60. Effort (64) and mental demand (63) are the highest dimensions, physical demand the lowest (15), which points to cognitive rather than physical load.",
    "learn": "Workload has several sides: thinking, time pressure, effort, frustration and so on. NASA-TLX rates each one and combines them. The raw TLX is a simple average; the weighted version counts each dimension by how much participants said it contributed.",
    "deeper": "Raw TLX is the mean of the six ratings. The weighted TLX (Hart and Staveland 1988) asks people to choose, in each of the 15 pairs of dimensions, the one that contributed more; each weight is the number of times it was chosen (0 to 5) and the score is Σ rating × weight / 15. Raw and weighted scores correlate highly, and many teams skip the pairs.",
    "mistakes": [
      "Comparing your score with another study's numbers.",
      "Forgetting that the performance scale is reversed (0 is perfect).",
      "Entering weights that do not add up to 15.",
      "Asking the ratings long after the task, when people have forgotten how it felt."
    ],
    "next": [
      "compare-means",
      "nonparametric",
      "sample-size"
    ]
  },
  "ueq": {
    "question": "How do users rate the experience on the six UEQ scales, against other products?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings",
      "survey"
    ],
    "studies": [
      "Benchmark study",
      "Survey",
      "Usability test"
    ],
    "needs": "Each participant's 26 User Experience Questionnaire answers, as ticked from 1 (left word) to 7 (right word), in the standard English item order.",
    "when": [
      "When you want both practical and emotional sides of the experience measured",
      "When you want to place your product against the published UEQ benchmark",
      "When comparing a redesign with the current version on the same scales"
    ],
    "notFor": "A quick measure of usability alone (use the [SUS scorer](/calculators/sus) or [UMUX and UMUX-Lite scorer](/calculators/umux-lite)).",
    "steps": [
      "Use the official 26 items in the standard order and an official translation.",
      "Export the boxes ticked, 1 to 7, without recoding them.",
      "Paste one participant per line; the calculator reverses the mixed-direction items.",
      "Read each scale's mean, interval, reliability (alpha) and benchmark band.",
      "Look at pragmatic and hedonic quality to see which side needs work."
    ],
    "example": "Forty users rated a banking app. Attractiveness is 1.6, which the benchmark calls \"good\"; efficiency is 0.9, \"below average\"; novelty is 0.2, \"bad\". The app is liked but feels slow and dated, which tells you where to focus.",
    "learn": "The UEQ measures six things: attractiveness, three practical qualities (perspicuity, efficiency, dependability) and two hedonic ones (stimulation, novelty), each from −3 to +3. The benchmark tells you how your scores compare with hundreds of other products.",
    "deeper": "Answers are recoded to −3 to +3, reversing items with the positive term on the left, then averaged per person within each scale; intervals are t-based and alpha is shown per scale. Benchmark bands are from Schrepp, Hinderks and Thomaschewski (2017), 452 product evaluations: excellent is the top 10%, good the next 15%, above and below average the middle quarters, bad the bottom 25%. Later editions of the official analysis tool use an updated benchmark, so bands may differ slightly.",
    "mistakes": [
      "Entering answers already recoded to −3 to +3.",
      "Changing items, order or language and still comparing with the benchmark.",
      "Ignoring a low alpha for a scale, which suggests people read its items differently.",
      "Treating a band as exact when the interval crosses into the next one."
    ],
    "next": [
      "attrakdiff",
      "reliability",
      "compare-means"
    ]
  },
  "attrakdiff": {
    "question": "Is our product seen as practical, appealing, or both?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings"
    ],
    "studies": [
      "Usability test",
      "Survey",
      "Comparative test"
    ],
    "needs": "Each participant's ten answers to the short AttrakDiff (four pragmatic, four hedonic and two attractiveness items), coded 1 to 7 or −3 to +3 with higher meaning the positive word.",
    "when": [
      "When you want to see whether a product is useful but dull, or exciting but awkward",
      "When comparing your product with a competitor or an earlier version measured the same way",
      "When a short questionnaire is needed at the end of a session"
    ],
    "notFor": "Comparing with a published norm: there is none for the short form, so compare products measured the same way.",
    "steps": [
      "Give the ten-item AttrakDiff after use.",
      "Flip items printed with the positive word on the left so that higher always means positive.",
      "Paste one participant per line in the order PQ1 to PQ4, HQ1 to HQ4, ATT1 to ATT2 and choose the coding.",
      "Read the pragmatic, hedonic and attractiveness scores with their intervals.",
      "Look at the portfolio position, then check the intervals before drawing conclusions."
    ],
    "example": "Twenty users of an expenses app give pragmatic quality 1.4 and hedonic quality 0.6. The portfolio places it as \"task-oriented\": people find it useful but not engaging, so visual and interaction polish might move it towards \"desired\".",
    "learn": "AttrakDiff separates pragmatic quality (is it useful and easy?) from hedonic quality (is it stimulating and does it say something about me?). Plotting both on a portfolio shows the character of a product at a glance.",
    "deeper": "The ten-item AttrakDiff (Hassenzahl and Monk 2010) has four pragmatic items, four hedonic items (two identity, two stimulation) and two attractiveness items. Answers are recoded to −3 to +3, averaged per person within each scale and given t-based 95% intervals. The portfolio splits each axis into thirds at ±1; its regions are a reading aid, not a test.",
    "mistakes": [
      "Forgetting to flip items printed with the positive word on the left.",
      "Saying two products sit in different regions when their intervals overlap.",
      "Comparing with another study that used a different version of the questionnaire."
    ],
    "next": [
      "ueq",
      "compare-means",
      "reliability"
    ]
  },
  "compare-rates": {
    "question": "Did more people succeed with design B than with design A?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "task-success",
      "ab-test"
    ],
    "studies": [
      "Comparative test",
      "Usability test",
      "A/B test"
    ],
    "needs": "Successes and attempts for each design if different people tried each; if the same people tried both, how many succeeded on both, on A only, on B only and on neither.",
    "when": [
      "After a comparative usability test of two designs or prototypes",
      "When the same participants tried both versions of a task",
      "When a small A/B test reports yes-or-no outcomes for each group"
    ],
    "notFor": "Ratings or times (use [Compare two means](/calculators/compare-means)) or large online experiments where you want a probability of B being better (use [Bayesian A/B test](/calculators/bayes-ab)).",
    "steps": [
      "Say whether different people or the same people tried each design.",
      "For different people, enter successes and attempts for A and B.",
      "For the same people, enter the four counts: both, A only, B only, neither.",
      "Choose the confidence level and read the p-value and the interval for the difference.",
      "Report the difference with its interval, not just whether p is small."
    ],
    "example": "With different people, 11 of 20 completed the task on design A (55%) and 18 of 21 on design B (86%). The N−1 test gives p = 0.03, and the 90% interval for B minus A runs from 7 to 51 points: B is better, by somewhere between a little and a lot.",
    "learn": "A difference between two small groups can happen by chance. The p-value tells you how surprising your difference would be if the designs really performed the same; the interval gives the range of differences that fit your data. When the same people try both designs, only those who succeeded on one and failed on the other carry information.",
    "deeper": "For different people, the N−1 two-proportion test multiplies the usual z statistic by √((N−1)/N), which Campbell (2007) showed keeps error rates accurate at small sizes when every expected count is at least 1; below that, use the Fisher exact p-value shown. For the same people, McNemar's test uses only the discordant pairs, with the mid-p version Sauro and Lewis recommend, and an Agresti-Min interval.",
    "mistakes": [
      "Using the different-people test when the same people tried both designs.",
      "Concluding \"no difference\" from a non-significant result with a small sample.",
      "Testing many tasks and reporting only the one that came out significant."
    ],
    "next": [
      "effect-size",
      "sample-size",
      "bayes-ab"
    ]
  },
  "compare-means": {
    "question": "Is design B rated higher, or faster, than design A?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "ratings",
      "task-time"
    ],
    "studies": [
      "Comparative test",
      "Benchmark study",
      "Lab experiment"
    ],
    "needs": "For different people: the mean, standard deviation and number of people for each design. For the same people: each person's score or time on A and on B, one pair per line.",
    "when": [
      "When comparing SUS, SEQ or other ratings between two designs",
      "When comparing task times before and after a redesign",
      "When the same participants tried both designs and you want a paired test"
    ],
    "notFor": "Ordinal ratings or skewed data that worry you (use [Nonparametric comparison](/calculators/nonparametric)) or yes-or-no outcomes (use [Compare two completion rates](/calculators/compare-rates)).",
    "steps": [
      "Say whether different people or the same people tried each design.",
      "For different people, enter each group's mean, SD and n; log-transform task times first.",
      "For the same people, paste each person's A and B values and say whether they are scores or times.",
      "Read the p-value, the interval for the difference and the effect size.",
      "Report the size of the difference with its interval."
    ],
    "example": "Twenty-two people rated design A (mean SUS 70, SD 18) and twenty others design B (80, SD 15). Welch's test gives p = 0.057 and a 95% interval for B minus A of −0.3 to 20.3 points, with Cohen's d of 0.60. B looks better, but the data cannot rule out no difference; more participants would settle it.",
    "learn": "A t-test compares the gap between two averages with how much the scores vary. A paired design, where each person tries both, is more sensitive because each person acts as their own comparison. The interval for the difference is more informative than the p-value alone.",
    "deeper": "For different people the calculator uses Welch's t-test, which does not assume equal variances, with Welch-Satterthwaite degrees of freedom. For the same people it runs a one-sample t-test on each person's difference. Task times are compared on the log scale, as Sauro and Lewis recommend, and reported as a percentage change. Effect sizes are Cohen's d and Hedges' g for different people and d_z for the same people, which is not comparable with a between-groups d.",
    "mistakes": [
      "Entering raw time means in the different-people mode instead of log-transformed ones.",
      "Reading p = 0.06 as proof that the designs are the same.",
      "Using the different-people test when the same people tried both.",
      "Comparing a paired d_z with a between-groups d."
    ],
    "next": [
      "effect-size",
      "nonparametric",
      "sample-size"
    ]
  },
  "rate-benchmark": {
    "question": "Can we show that more than our target share of users succeed?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "task-success"
    ],
    "studies": [
      "Benchmark study",
      "Usability test",
      "Release acceptance test"
    ],
    "needs": "Successes and attempts for one task and the completion rate you need to beat, such as 78% (the average across tasks) or a target the team agreed.",
    "when": [
      "When a release must meet a success target, such as \"at least 80% can sign up\"",
      "When comparing a task with the cross-task average of about 78%",
      "When stakeholders want a yes or no on a target rather than a range"
    ],
    "notFor": "Just describing a success rate (use [Completion rate interval](/calculators/completion-rate)).",
    "steps": [
      "Agree the benchmark before the study.",
      "Enter successes and attempts.",
      "Enter the benchmark and the confidence level.",
      "Read the verdict, the one-sided p-value and the lower bound.",
      "If the benchmark is not yet shown, say so rather than \"failed\"."
    ],
    "example": "Twenty-two of twenty-five participants completed sign-up (88%). Against an 80% target the one-sided mid-p is 0.17 and the 90% lower bound is 77%, so the target is not yet shown, though the result is promising.",
    "learn": "Beating a target means showing that the true rate, not just your sample's rate, is above it. The test asks how likely your result would be if the true rate were exactly at the target. If that is unlikely, you have shown the target is beaten.",
    "deeper": "With fewer than 15 expected successes or failures the calculator uses the exact binomial probability with the mid-p adjustment (Sauro and Lewis's recommendation, less conservative than the exact test); otherwise the normal approximation. The lower bound is the adjusted-Wald interval at the matching two-sided level.",
    "mistakes": [
      "Setting the benchmark after seeing the results.",
      "Reading \"not yet shown\" as \"below target\".",
      "Using a two-sided test when the question was only \"above the target?\"."
    ],
    "next": [
      "completion-rate",
      "sample-size",
      "compare-rates"
    ]
  },
  "correlation": {
    "question": "Do these two measures go up and down together, and how strongly?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings",
      "task-time",
      "analytics"
    ],
    "studies": [
      "Benchmark study",
      "Survey",
      "Analytics review"
    ],
    "needs": "Pairs of values measured on the same participants, tasks or products, one pair per line, such as each person's SUS score and their completion rate.",
    "when": [
      "When checking whether perceived ease tracks actual success",
      "When exploring which survey measure relates to a behaviour in analytics",
      "When validating a new metric against an established one"
    ],
    "notFor": "Showing that one thing causes another, or predicting from several measures at once (use [Regression workbench](/calculators/regression)).",
    "steps": [
      "Line up the two measures for the same people or tasks.",
      "Paste one pair per line.",
      "Choose Pearson for roughly normal numbers, Spearman for ranks, ratings or skewed data.",
      "Read r, its interval and r² (shared variance).",
      "Look at a scatter plot before believing the number."
    ],
    "example": "For ten participants, SUS score and share of tasks completed give r = 0.95, with a 95% interval of 0.79 to 0.99. People who succeeded more also rated the product higher, but this does not show which causes which.",
    "learn": "A correlation runs from −1 to +1: near 0 means no straight-line link, near ±1 a strong one. It says nothing about cause. With few pairs the interval is wide, so a high r from ten people is less certain than it looks.",
    "deeper": "Pearson's r measures linear association; Spearman's version runs the same calculation on ranks, so it suits skewed or ordinal data. Significance uses t = r√((n−2)/(1−r²)) with n − 2 degrees of freedom. The interval uses the Fisher z transformation, atanh(r) ± z/√(n−3), converted back with tanh.",
    "mistakes": [
      "Reading correlation as cause.",
      "Using Pearson with strong outliers or a curved relationship.",
      "Mixing levels, such as per-task means against per-person scores."
    ],
    "next": [
      "regression",
      "key-drivers",
      "reliability"
    ]
  },
  "effect-size": {
    "question": "How big is the difference between the two designs, not just whether it exists?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "ratings",
      "task-time"
    ],
    "studies": [
      "Comparative test",
      "Lab experiment",
      "Benchmark study"
    ],
    "needs": "For two groups of different people: each group's mean, standard deviation and size, or the raw scores.",
    "when": [
      "When you need to say how much better a design is, in a way that does not depend on sample size",
      "When planning the next study and you need an expected effect",
      "When combining results across studies"
    ],
    "notFor": "The same people trying both designs (use the paired option in [Compare two means](/calculators/compare-means)).",
    "steps": [
      "Enter the mean, SD and n for each design, or paste the raw scores.",
      "For task times, enter log-transformed values.",
      "Read Hedges' g with its interval, plus Cohen's d and the probability of superiority.",
      "Judge the size against what matters for the product, not only against the generic labels."
    ],
    "example": "Design A has a mean SUS of 70 (SD 18, n 22) and design B 80 (SD 15, n 20). Hedges' g is 0.59, with a 95% interval of −0.03 to 1.21, and a randomly chosen B user has about a 66% chance of scoring higher than an A user. The effect is likely medium, but the data cannot rule out none.",
    "learn": "A p-value depends on how many people you tested; an effect size does not. It expresses the difference in standard deviations, so you can compare results across studies and plan sample sizes. Labels like small, medium and large are rough guides, not judgements of importance.",
    "deeper": "Cohen's d is the difference in means divided by the pooled standard deviation. Hedges' g multiplies d by 1 − 3/(4(n_A + n_B) − 9) to remove its upward bias in small samples. Intervals use the Hedges and Olkin standard error. The probability of superiority is Φ(d/√2), assuming normal data with equal spread.",
    "mistakes": [
      "Treating 0.2 as unimportant: a small effect on checkout can matter more than a large one on a rare setting.",
      "Using it for paired data.",
      "Computing it on raw, skewed task times."
    ],
    "next": [
      "sample-size",
      "compare-means",
      "meta-analysis"
    ]
  },
  "nonparametric": {
    "question": "Do people tend to score higher on one design, without assuming normal data?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings",
      "task-time"
    ],
    "studies": [
      "Comparative test",
      "Survey",
      "Lab experiment"
    ],
    "needs": "Values for each design (different people), or one pair of values per participant (same people): ratings, rankings or skewed measures such as task times.",
    "when": [
      "When comparing ordinal ratings, such as single 5 or 7-point items",
      "When data are very skewed or have outliers",
      "As a check on a t-test whose assumptions look shaky"
    ],
    "notFor": "Very small samples, where the normal approximation used here is rough (an exact test is better), or yes-or-no outcomes (use [Compare two completion rates](/calculators/compare-rates)).",
    "steps": [
      "Say whether different people or the same people tried each design.",
      "Paste the values for A and B, or one pair per line.",
      "Read the p-value and the effect size r.",
      "Report medians and the effect size alongside the p-value."
    ],
    "example": "Twelve people rated design A and eleven rated design B on a 7-point ease item: medians 3 and 5. The Mann-Whitney test gives p = 0.001 and an effect size r of 0.67, so ratings tend to be clearly higher for B.",
    "learn": "These tests work on ranks rather than raw values, so they do not need normal data. They ask whether values tend to be higher in one condition, not whether the means differ. They lose a little power when the data are in fact normal.",
    "deeper": "Mann-Whitney ranks all values together and compares the rank sums, with tie and continuity corrections; Wilcoxon signed-rank drops zero differences, ranks the absolute differences and sums the positive ranks. Both use a normal approximation and match scipy's mannwhitneyu and wilcoxon with their approximate methods. For very small samples an exact test is better.",
    "mistakes": [
      "Saying the test compares means or medians; it compares the tendency for values to be higher.",
      "Trusting the p-value with fewer than about eight per group or ten non-zero differences.",
      "Using the different-people test for paired data."
    ],
    "next": [
      "effect-size",
      "compare-means",
      "sample-size"
    ]
  },
  "bayes-ab": {
    "question": "How likely is it that B converts better than A, and what do I risk by choosing?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "ab-test"
    ],
    "studies": [
      "A/B test",
      "Landing page test",
      "Feature experiment"
    ],
    "needs": "Visitors and conversions for each version, from your experiment platform, and the loss in conversion rate you are willing to accept if you pick the wrong one.",
    "when": [
      "When stakeholders ask \"what is the chance B is better?\"",
      "When you want to stop a test once the remaining risk is too small to matter",
      "When a fixed-sample test is not yet significant and you need a decision"
    ],
    "notFor": "Metrics that are not yes-or-no conversions, such as revenue or time on page.",
    "steps": [
      "Before starting, set the loss you can accept, in percentage points.",
      "Enter conversions and visitors for A and B.",
      "Read P(B > A) and the expected loss of choosing each version.",
      "Choose the version whose expected loss is below your threshold, or keep the test running.",
      "Check for sample ratio mismatch and novelty effects before acting."
    ],
    "example": "A converted 40 of 1,000 visitors (4.0%) and B 55 of 1,000 (5.5%). The probability that B has the higher rate is 94%. Choosing B risks an expected loss of 0.02 points, against 1.5 points for A, so with an acceptable loss of 0.1 points you can choose B.",
    "learn": "A Bayesian test gives a direct probability that one version is better, given the data and a starting assumption. Expected loss is how much conversion you would give up, on average, if you picked a version and it turned out worse. Stopping when that is tiny avoids agonising over differences too small to matter.",
    "deeper": "With a uniform Beta(1, 1) prior, each version's rate has a Beta(1 + conversions, 1 + non-conversions) posterior. P(B > A) uses Evan Miller's exact sum, and expected losses are integrated numerically; the stopping rule follows Stucchio (2015). It does not control false positives the way a fixed-sample test does.",
    "mistakes": [
      "Setting the acceptable loss after seeing the data.",
      "Reading 94% as certainty.",
      "Using it for continuous metrics.",
      "Ignoring sample ratio mismatch or novelty effects."
    ],
    "next": [
      "sprt",
      "ab-health",
      "compare-rates"
    ]
  },
  "sprt": {
    "question": "Can I stop this test yet, or do I need more data?",
    "stages": [
      "plan",
      "collect"
    ],
    "data": [
      "ab-test",
      "analytics"
    ],
    "studies": [
      "A/B test",
      "Feature rollout",
      "Conversion test"
    ],
    "needs": "A baseline conversion rate, the higher rate worth detecting, your false positive and false negative risks, then the running count of trials and conversions.",
    "when": [
      "When you want to check results as they come in without inflating false positives",
      "When traffic is expensive and stopping early saves money",
      "When testing one new flow's conversion against a known baseline"
    ],
    "notFor": "A randomised two-arm A/B test (use a two-sample sequential design or the [Bayesian A/B test](/calculators/bayes-ab)).",
    "steps": [
      "Before starting, set the baseline (H0), the rate worth detecting (H1), α and β.",
      "Note the boundaries the planner gives for different numbers of trials.",
      "As data come in, enter conversions and trials so far.",
      "Stop only when you cross a boundary; otherwise keep going.",
      "Never change the settings once the test has started."
    ],
    "example": "Baseline 10%, worth detecting 15%, α 5%, β 20%. After 100 trials you stop for a lift at 19 conversions or more and for no lift at 8 or fewer. You have 20, so you stop: the evidence favours 15% over 10% at the error rates you set.",
    "learn": "A normal test is planned for one look at the data; peeking repeatedly raises the chance of a false alarm. A sequential test sets boundaries so that you can look after every visitor and still keep the error rates you chose, as long as you stop only at a boundary.",
    "deeper": "Wald's sequential probability ratio test compares H0: p = p0 with H1: p = p1 after every trial, using the log-likelihood ratio s·ln(p1/p0) + (n − s)·ln((1 − p1)/(1 − p0)). It stops for H1 at ln((1 − β)/α) and for H0 at ln(β/(1 − α)); in conversions these are two parallel lines. Average sample numbers use Wald's approximations.",
    "mistakes": [
      "Changing p0, p1, α or β after the test has started.",
      "Stopping because results look good before a boundary is crossed.",
      "Using it for a two-arm comparison."
    ],
    "next": [
      "bayes-ab",
      "ab-health",
      "sample-size"
    ]
  },
  "reliability": {
    "question": "Do the items in my scale measure consistently together?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "survey",
      "ratings"
    ],
    "studies": [
      "Survey",
      "Questionnaire pilot",
      "Benchmark study"
    ],
    "needs": "Each respondent's answers to every item of one multi-item scale, one respondent per line, plus which items are reverse-worded and the scale's minimum and maximum.",
    "when": [
      "When piloting a new questionnaire scale",
      "When checking that a translated or adapted scale still hangs together",
      "Before averaging several items into one score"
    ],
    "notFor": "Single-item measures, or indexes whose items need not correlate, such as a checklist of features used.",
    "steps": [
      "Collect responses to all items of the scale.",
      "Paste one respondent per line, one answer per item.",
      "List reverse-worded items and set the scale minimum and maximum.",
      "Read alpha with its interval, and omega if shown.",
      "Review items flagged for a low item-total correlation or for raising alpha when removed."
    ],
    "example": "Fourteen respondents answered a five-item trust scale, with item 4 reversed. Alpha is 0.72 (95% interval 0.40 to 0.90) and omega 0.74. Item 5 has an item-total correlation of 0.27 and alpha would rise to 0.75 without it, so it is flagged for review; the wide interval says to collect more responses.",
    "learn": "If several items measure the same thing, people who score high on one should tend to score high on the others. Cronbach's alpha summarises that consistency from 0 to 1; about 0.7 is a common minimum. A high alpha does not prove the items measure one thing.",
    "deeper": "Alpha = k/(k − 1) × (1 − Σ item variances / variance of the total), with an interval from Feldt (1965). The corrected item-total correlation compares each item with the sum of the others. Omega comes from a one-factor solution fitted by iterated principal-axis factoring and is withheld if the fit is unsound. Alpha is not evidence of a single factor; a long scale can have high alpha with several.",
    "mistakes": [
      "Forgetting to reverse negatively worded items.",
      "Treating a high alpha as proof the scale measures one thing.",
      "Relying on alpha from fewer than about 30 respondents.",
      "Dropping items just to push alpha up without checking their content."
    ],
    "next": [
      "factor-analysis",
      "scale-validity",
      "item-analysis"
    ]
  },
  "margin-of-error": {
    "question": "How precise is my survey percentage, or how many responses do I need?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "survey"
    ],
    "studies": [
      "Survey",
      "Intercept survey",
      "Customer panel"
    ],
    "needs": "Either the number of completed responses or the margin you want, plus the expected proportion (50% if unsure), the population size if it is small, and the design effect if the sample is clustered or weighted.",
    "when": [
      "When planning how many survey responses to aim for",
      "When reporting a survey percentage and you need its margin",
      "When surveying a known, small population such as all customers of one product"
    ],
    "notFor": "Small usability samples (use [Completion rate interval](/calculators/completion-rate)) or opt-in panels, where a margin of error overstates precision.",
    "steps": [
      "Choose whether to work out the margin or the sample size.",
      "Enter the responses or target margin, and the expected proportion.",
      "Add the population size if you are surveying a large share of a small group.",
      "Set the design effect above 1 for clustered or weighted samples.",
      "Read the margin or the number of completed responses needed."
    ],
    "example": "A survey of 400 customers finds 50% use the app weekly. The 95% margin is ±4.9 points, or ±6.0 with a design effect of 1.5 from weighting. For ±5 points you need 385 responses, or 278 if the whole population is 1,000.",
    "learn": "The margin of error tells you how far a percentage from a random sample could be from the true population value because of chance alone. It does not cover people who did not respond, an unrepresentative sample or badly worded questions.",
    "deeper": "The margin is z × √(p(1 − p)/n_eff) × √((N − n)/(N − 1)), where n_eff = n / design effect and the last term is the finite population correction. The reverse uses Cochran's n₀ = z²p(1 − p)/e², corrects it for the population with n₀/(1 + (n₀ − 1)/N), then multiplies by the design effect.",
    "mistakes": [
      "Quoting a margin for an opt-in sample as if it were random.",
      "Applying the overall margin to small subgroups.",
      "Ignoring the design effect after weighting.",
      "Planning for completed responses but forgetting the response rate when sending invitations."
    ],
    "next": [
      "survey-weighting",
      "nonresponse",
      "sample-size"
    ]
  },
  "cluster-personas": {
    "question": "Are there distinct groups of users in my data, and what are they like?",
    "stages": [
      "analyse"
    ],
    "data": [
      "survey",
      "analytics"
    ],
    "studies": [
      "Segmentation survey",
      "Persona research",
      "Behavioural analytics"
    ],
    "needs": "A table with a header row and one respondent per row, copied from a spreadsheet or CSV, containing the answers or behaviours to segment on. You mark each column as continuous, ordinal, nominal or ignore.",
    "when": [
      "When you have a survey of at least about 50 respondents (200 or more for latent class analysis) and want data-backed personas",
      "When stakeholders argue about segments and you want to see whether groups really exist",
      "When combining attitude questions with usage data to segment users"
    ],
    "notFor": "Small qualitative samples; build personas from interviews instead (see [Personas](/methods/personas)).",
    "steps": [
      "Paste the data and check each column's type; set IDs and free text to Ignore.",
      "Choose how to handle missing values.",
      "Pick an algorithm: k-medoids on Gower distance is a safe start for mixed data; Gaussian mixture or latent class analysis if you have many respondents and want membership probabilities.",
      "Let the tool suggest the number of clusters, then check the silhouette, elbow and stability (or BIC and entropy for mixtures).",
      "Name the draft personas and check them against interviews before sharing."
    ],
    "example": "A survey of 240 banking app users clusters into three groups with an average silhouette of 0.41, weak but usable structure, and good stability. One group is high on mobile use and low on branch visits; you name it \"app-first\" and test the description in follow-up interviews.",
    "learn": "Clustering groups respondents who answered alike. It always returns clusters, even from data with no real groups, so the quality figures matter: the silhouette says how well separated the groups are, and stability says whether they come back when the data are resampled. Treat the personas as drafts to validate.",
    "deeper": "Gower distance (Gower 1971) handles mixed data by averaging per-column dissimilarities. k-medoids uses PAM (Kaufman and Rousseeuw); the silhouette (Rousseeuw 1987) above 0.7 is strong, 0.5 to 0.7 reasonable, 0.25 to 0.5 weak. Stability reclusters ten 80% subsamples and compares them with the adjusted Rand index. Mixture models are fitted by expectation-maximisation, with k chosen by BIC and classification quality shown by entropy R².",
    "mistakes": [
      "Believing clusters without checking silhouette and stability.",
      "Leaving ID or free-text columns in the analysis.",
      "Clustering too few respondents or many more columns than respondents.",
      "Calling segments behavioural when the survey only asked about attitudes."
    ],
    "next": [
      "factor-analysis",
      "crosstab",
      "correspondence-analysis"
    ]
  },
  "intercoder": {
    "question": "Do our coders apply the codebook the same way?",
    "stages": [
      "analyse"
    ],
    "data": [
      "qual"
    ],
    "studies": [
      "Interview study",
      "Content analysis",
      "Heuristic evaluation"
    ],
    "needs": "The code each coder gave to the same set of segments, one segment per line and one coder per column, copied from a spreadsheet. Missing codes are marked with a dot, a dash or NA.",
    "when": [
      "When several researchers apply a shared codebook to interview or support data",
      "When you need to show that coding is reliable before counting codes",
      "When training a new coder against an experienced one"
    ],
    "notFor": "Reflexive [thematic analysis](/methods/thematic-analysis), where codes are the analyst's interpretation and are not meant to be reproducible.",
    "steps": [
      "Pick a sample of segments and have each coder code them independently.",
      "Paste one segment per line, one coder per column.",
      "Choose whether codes are categories, ordered numbers or scores.",
      "Read Krippendorff's alpha, and Cohen's kappa for two coders.",
      "If agreement is low, refine the codebook and code a fresh sample."
    ],
    "example": "Two researchers coded 20 interview segments as price, trust, speed or support. They agree on 84% of the 19 segments both coded, but kappa is 0.79 (95% interval 0.57 to 1.00) and alpha 0.79, just under the 0.8 often used for reliable coding. Clarifying the line between \"support\" and \"trust\" is the next step.",
    "learn": "Percent agreement looks reassuring, but coders would agree some of the time by chance. Kappa and alpha subtract that chance agreement. Alpha works for any number of coders and copes with missing codes.",
    "deeper": "Cohen's kappa corrects for chance using each coder's code frequencies, κ = (p_o − p_e)/(1 − p_e), with the large-sample standard error of Fleiss, Cohen and Everitt (1969). Krippendorff's alpha builds a coincidence matrix of all pairable values, α = 1 − D_o/D_e, and weights disagreements by distance for ordered codes or squared difference for scores.",
    "mistakes": [
      "Reporting only percent agreement.",
      "Recoding the same segments after discussing them and reporting the improved figure.",
      "Using agreement statistics on interpretive, reflexive coding."
    ],
    "next": [
      "saturation",
      "agreement",
      "code-network"
    ]
  },
  "saturation": {
    "question": "Have I done enough interviews, or are new themes still turning up?",
    "stages": [
      "collect",
      "analyse"
    ],
    "data": [
      "qual"
    ],
    "studies": [
      "Interview study",
      "Diary study",
      "Field research"
    ],
    "needs": "For each interview, in the order you ran them, the list of codes it produced. A code counts once per interview, however often it came up.",
    "when": [
      "During fieldwork, to decide whether to book more interviews",
      "When you need to justify the number of interviews in a report",
      "When checking whether a particular user group is covered well"
    ],
    "notFor": "Judging whether you understand each theme in depth; these figures measure code saturation, not meaning saturation.",
    "steps": [
      "Code each interview soon after you run it.",
      "Paste one interview per line, in order, with its codes.",
      "Set how many recent interviews to look back over.",
      "Read the accumulation curve, the coverage and the estimated total number of codes.",
      "Keep going if new codes still appear or a group you care about is missing."
    ],
    "example": "After ten interviews about online shopping, seven distinct codes have appeared and none is new in the last three. Coverage is 97% and Chao's estimate of the total is 7.2, so further interviews with this group are unlikely to add new codes.",
    "learn": "Early interviews produce lots of new codes; later ones mostly repeat them, so the accumulation curve flattens. Coverage estimates how much of the pool of codes your interviews have reached, and the Chao estimate guesses how many codes exist in total.",
    "deeper": "Sample coverage borrows Good and Turing's estimate, 1 − f1/N, where f1 is the number of codes seen in only one interview and N the total number of code mentions. The total uses Chao's estimator for presence-or-absence data, S + ((T − 1)/T) f1²/(2f2). These assume interviews come from one population and codes are applied consistently.",
    "mistakes": [
      "Pooling different user groups into one curve.",
      "Stopping because coverage is high when a key group has not been interviewed.",
      "Naming the same code inconsistently, so it counts as two.",
      "Treating code saturation as meaning saturation."
    ],
    "next": [
      "intercoder",
      "code-network",
      "discovery"
    ]
  },
  "expectation": {
    "question": "Which tasks disappoint users most, and which should we fix first?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "ratings"
    ],
    "studies": [
      "Usability test",
      "Benchmark study"
    ],
    "needs": "For each task, the mean expected ease (rated before any tasks) and the mean experienced ease (rated after doing it), both on the same 7-point scale.",
    "when": [
      "When you have many tasks and need to prioritise fixes",
      "When you want to separate tasks that are hard but expected to be from those that surprise users",
      "When presenting usability priorities to stakeholders visually"
    ],
    "notFor": "Testing whether one task is significantly easier than another (use [Compare two means](/calculators/compare-means)).",
    "steps": [
      "Before any tasks, ask participants how easy they expect each task to be.",
      "After each task, ask how easy it was, on the same 7-point scale.",
      "Average both ratings per task and paste one task per line.",
      "Set the quadrant split (the midpoint, 4, or your average rating).",
      "Read the quadrant for each task and start with \"Fix it fast\"."
    ],
    "example": "\"Change delivery address\" was expected to be easy (6.2) but felt hard (3.4), so it lands in \"Fix it fast\". \"Compare two plans\" was expected to be hard (3.1) but felt easy (5.6): \"Promote it\".",
    "learn": "A task that people expect to be easy but find hard does the most damage, because it breaks their trust. Plotting expected against experienced ease sorts tasks into four groups that suggest what to do with each.",
    "deeper": "Participants rate expected ease before any tasks and experienced ease after each task on the same 7-point scale (Albert and Dixon 2003). Plotting the two means per task gives four quadrants (Tullis and Albert 2008): expected easy but experienced hard is \"fix it fast\"; expected hard but experienced easy is \"promote it\".",
    "mistakes": [
      "Asking for expectations after people have seen the product.",
      "Using different scales for the two ratings.",
      "Ignoring how few ratings sit behind each mean."
    ],
    "next": [
      "seq",
      "compare-means",
      "severity-ratings"
    ]
  },
  "discovery": {
    "question": "How many usability problems did my test probably miss?",
    "stages": [
      "analyse",
      "plan"
    ],
    "data": [
      "qual"
    ],
    "studies": [
      "Usability test",
      "Formative evaluation"
    ],
    "needs": "The number of participants, and for each problem found, how many participants ran into it, from your problem-by-participant list.",
    "when": [
      "After a formative test, to judge whether to run more sessions",
      "When stakeholders ask \"did we find everything?\"",
      "When planning the next round of a test-fix-retest cycle"
    ],
    "notFor": "Several evaluators whose separate finds you can compare (use [Capture-recapture estimate](/calculators/capture-recapture)).",
    "steps": [
      "List each distinct problem and merge duplicates.",
      "For each problem, count how many participants hit it.",
      "Enter the number of participants and the counts.",
      "Read the estimated share of problems found and the estimated total.",
      "If the share is low, add participants or another round."
    ],
    "example": "Six participants found ten problems, hit by 6, 4, 3, 3, 2, 2, 1, 1, 1 and 1 people. The raw problem frequency is 40%, but adjusted it is 24%. The test probably found about 81% of the problems, from an estimated total of 12, so about two remain.",
    "learn": "Problems that nobody hit are missing from your list, so the raw average frequency of problems overstates how easy they are to find. Correcting it gives a more realistic estimate of what share you have found and how many are left.",
    "deeper": "Lewis (2001) averages two corrections to the raw p: normalisation, (p − 1/n)(1 − 1/n), and Good-Turing, p/(1 + share of problems seen once). The share found is 1 − (1 − p_adj)^n, and the total is the number found divided by that share.",
    "mistakes": [
      "Using the raw frequency, which makes the test look more complete than it is.",
      "Counting one problem twice under different names.",
      "Forgetting that problems in tasks you did not test cannot be estimated."
    ],
    "next": [
      "capture-recapture",
      "sample-size",
      "severity-ratings"
    ]
  },
  "capture-recapture": {
    "question": "How many problems are there in total, judging by how much evaluators overlap?",
    "stages": [
      "analyse"
    ],
    "data": [
      "qual"
    ],
    "studies": [
      "Heuristic evaluation",
      "Expert review",
      "Usability test"
    ],
    "needs": "For two evaluators or sessions, how many problems each found and how many both found. For several, a problem-by-evaluator table of 1s and 0s, with duplicate reports merged.",
    "when": [
      "After a heuristic evaluation with two or more independent evaluators",
      "When two test sessions or teams covered the same product",
      "When deciding whether another evaluator would be worth it"
    ],
    "notFor": "Problem counts per participant from one usability test (use [Problems left to find](/calculators/discovery)).",
    "steps": [
      "Have evaluators work independently on the same parts of the product.",
      "Merge duplicate reports into one list.",
      "Enter the counts for two evaluators, or the 1/0 table for several.",
      "Read the estimated total, its interval and how many are not yet found.",
      "Read the estimate as \"at least this many\"."
    ],
    "example": "Evaluator A found 10 problems, B found 15, and 5 were found by both. Chapman's estimate of the total is about 28 (95% interval 22 to 49), against 20 found so far, so roughly 8 or more are still hidden.",
    "learn": "If two independent searches find mostly the same problems, there is probably little left to find; if they barely overlap, many problems remain. This is the same trick ecologists use to count animals.",
    "deeper": "For two evaluators, Lincoln-Petersen estimates n1n2/m and Chapman's less biased version (n1 + 1)(n2 + 1)/(m + 1) − 1, with Seber's variance. For several evaluators the calculator uses Chao's estimator for incidence data with a log-normal interval, plus jackknife estimates as a cross-check. Because problems differ in how easy they are to find, all these estimates tend to be too low.",
    "mistakes": [
      "Letting evaluators discuss findings before they are counted.",
      "Not merging duplicate reports.",
      "Pooling evaluators who looked at different tasks or parts of the product.",
      "Treating the estimate as exact; read it as a lower bound."
    ],
    "next": [
      "discovery",
      "severity-ratings",
      "intercoder"
    ]
  },
  "klm": {
    "question": "How long will a skilled user take to do this task with this design?",
    "stages": [
      "plan",
      "decide"
    ],
    "data": [
      "design-specs"
    ],
    "studies": [
      "Design comparison",
      "Expert review",
      "Efficiency analysis"
    ],
    "needs": "The exact sequence of steps an expert would take in the design, written as operators: keystrokes, pointing, mouse button presses, hand moves between mouse and keyboard, and any system waits.",
    "when": [
      "When comparing two designs of a routine, repeated task before building them",
      "When estimating time savings for a business case",
      "When a task is too frequent for small delays to be ignored, such as data entry"
    ],
    "notFor": "Predicting novice times, errors or whether people will find the method; pair it with a [usability test](/methods/usability-testing).",
    "steps": [
      "Write down the error-free method an expert would use.",
      "Translate each step into operators: K, P, B, H, R(seconds), with \"text\" for typing.",
      "Choose the typing speed of your users.",
      "Let the calculator place mental operators, or place your own.",
      "Read the predicted time and which operators take the most of it."
    ],
    "example": "Saving a file under a new name (hand to mouse, two menu clicks, hand to keyboard, type \"Q3 report\", Enter, wait 0.5 s) predicts 12.1 seconds for an average non-secretary typist, with four mental operators placed automatically.",
    "learn": "The Keystroke-Level Model adds up standard times for each physical and mental step a skilled user takes. It lets you compare designs before testing, and shows where the time goes: often in thinking (M) and pointing (P) rather than typing.",
    "deeper": "The model comes from Card, Moran and Newell (1980): K 0.12 to 1.2 s depending on typing skill, P 1.1 s, B 0.1 s (Kieras's refinement), H 0.4 s, M 1.35 s, and R as you supply it. Automatic M placement applies the first three placement rules; rules 3 and 4 need judgement, so place those Ms yourself if they apply.",
    "mistakes": [
      "Using it to predict how long novices will take.",
      "Leaving out mental operators, which underestimates time.",
      "Choosing a typing speed that does not match your users.",
      "Forgetting system response times."
    ],
    "next": [
      "fitts",
      "hick",
      "task-time"
    ]
  },
  "fitts": {
    "question": "How long will it take to point at or tap this target, and is it big enough?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "design-specs",
      "task-time"
    ],
    "studies": [
      "Design review",
      "Touch target audit",
      "Pointing experiment"
    ],
    "needs": "The distance from the starting point to the target and the target's width along the direction of movement, taken from the layout. Optionally, your own timed trials (distance, width, mean time) and the spread of click or tap positions.",
    "when": [
      "Comparing two layouts to see which puts frequent buttons closer or makes them bigger",
      "Checking whether a touch target is large enough for most taps to land on it",
      "Working out throughput (bits per second) from your own pointing trials"
    ],
    "notFor": "Targets people have to search for, dragging along a path or cascading menus (use [Steering law and MHP](/calculators/steering-law) for paths).",
    "steps": [
      "Choose mouse or trackpad, or finger on a touch screen.",
      "Measure the distance to the target (D) and its width in the direction of movement (W).",
      "Keep the illustrative constants to compare layouts with each other, or choose “Fit from data” and paste at least three timed conditions for absolute times.",
      "If you have click or tap positions, enter their spread to get the effective width and throughput.",
      "For touch, read the tap-accuracy table and the size needed for 95% of taps.",
      "Compare designs by their index of difficulty and predicted time, not by one number alone."
    ],
    "example": "A Save button 256 px from where the pointer usually rests and 16 px wide has an index of difficulty of log₂(256/16 + 1) ≈ 4.09 bits. Doubling its width to 32 px brings it to 3.17 bits. With b = 0.2 s per bit that is about 0.18 s faster per click: a fair way to rank the two layouts, but not a time to promise anyone.",
    "learn": "Pointing gets slower as targets get further away and faster as they get bigger, and only the ratio of distance to width matters. That ratio is turned into an index of difficulty measured in bits. The constants that turn bits into seconds depend on the device and the person, so the built-in ones are only for comparing layouts.",
    "deeper": "The tool uses MacKenzie's Shannon form, MT = a + b·log₂(D/W + 1). The effective width, 4.133 × the SD of the end points (ISO 9241-411), replaces the drawn width with the spread people actually produce, and throughput is the effective index divided by the observed time. For fingers, Bi, Li and Zhai's FFitts law first removes the finger's own imprecision (about 1.5 mm).",
    "mistakes": [
      "Quoting absolute times from the illustrative constants.",
      "Measuring the width across the movement rather than along it.",
      "Using it for targets people must first find, or for drags and cascading menus.",
      "Reusing constants measured on one device to judge another."
    ],
    "next": [
      "klm",
      "hick",
      "steering-law"
    ]
  },
  "hick": {
    "question": "How much longer will people take to decide if I add more options?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "design-specs",
      "analytics"
    ],
    "studies": [
      "Menu design review",
      "Navigation redesign",
      "Predictive task modelling"
    ],
    "needs": "The number of options people choose from, or how often each one is picked (counts or percentages from analytics). Optionally your own constants a and b.",
    "when": [
      "Deciding whether merging or splitting the options of a familiar menu changes decision time",
      "Seeing how much a skewed pattern of use (a few options picked most of the time) reduces decision time",
      "Adding a decision step to a keystroke-level estimate of task time"
    ],
    "notFor": "Unfamiliar lists that people must read and scan, where time grows roughly in step with the number of items; test those with users instead.",
    "steps": [
      "Decide whether the options are equally likely or used with different frequencies.",
      "Enter the number of options, or paste how often each is picked.",
      "Keep b = 0.15 s per bit unless you have measured your own; treat a as illustrative.",
      "Read the predicted decision time and the table for 2 to 64 options.",
      "Use the result to compare menu structures, then check the winner with users."
    ],
    "example": "A toolbar menu has 8 options. If all were equally likely, H = log₂(9) = 3.17 bits and decision time is about 0.2 + 0.15 × 3.17 ≈ 0.68 s. Analytics show use is skewed (40, 25, 15, 10, 5, 3, 1, 1), which carries only 2.60 bits, so the estimate drops to about 0.59 s.",
    "learn": "Decision time grows with the information in a choice, measured in bits, not with the raw number of options. Doubling the number of equally likely options adds a fixed amount of time rather than doubling it. When a few options are used most of the time, the choice carries less information and is faster.",
    "deeper": "The Hick-Hyman law is RT = a + b·H, with H = log₂(n + 1) for n equally likely options and H = Σ pᵢ·log₂(1/pᵢ + 1) when use differs (Card, Moran and Newell 1983); the +1 allows for not responding. It holds for choices people recognise, such as familiar menus or keys, not for reading and searching an unfamiliar list or for decisions that are hard in themselves.",
    "mistakes": [
      "Using it to argue for or against long menus without testing them.",
      "Treating the illustrative intercept a as a measured value.",
      "Applying it to lists people have never seen before."
    ],
    "next": [
      "fitts",
      "klm"
    ]
  },
  "van-westendorp": {
    "question": "What price range do people find acceptable for this product?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "survey"
    ],
    "studies": [
      "Pricing survey",
      "Concept test",
      "New product research"
    ],
    "needs": "Four prices from each respondent: too cheap to trust, a bargain, getting expensive, and too expensive to consider. These come from four survey questions asked in that order.",
    "when": [
      "Setting a first price range for a new product or plan before running a demand study",
      "Checking whether a planned price sits inside the range people find acceptable",
      "Comparing how different segments see the price of the same offer"
    ],
    "notFor": "Estimating how many people would buy at each price (use [Gabor-Granger pricing](/calculators/gabor-granger) or [Conjoint studio](/calculators/conjoint)).",
    "steps": [
      "Ask the four price questions to people who understand the product and its alternatives.",
      "Paste one respondent per line: too cheap, cheap, expensive, too expensive.",
      "Check how many respondents were left out because their prices were not in rising order.",
      "Read the acceptable range (PMC to PME) and the optimal price point on the curves.",
      "Follow up with a demand-based method before setting the final price."
    ],
    "example": "Two hundred trial users of a note-taking app answered the four questions. The curves cross to give an acceptable range of £4 to £9 a month, with the optimal price point at £6. The team's planned £12 sits above the range, so they test £6, £8 and £10 next with Gabor-Granger.",
    "learn": "The method plots, for every price, the share of people who call it too cheap, cheap, expensive or too expensive. Where those curves cross marks the edges of what people say is acceptable. It measures attitudes to price, not buying behaviour.",
    "deeper": "Intersections are found by straight-line interpolation between the prices people gave: PMC where too cheap meets not cheap, PME where too expensive meets not expensive, OPP where too cheap meets too expensive, IPP where cheap meets expensive. Some practitioners define PMC and PME with other pairs of curves, which shifts the range. The method says nothing about demand, so check it against real purchase data where you can.",
    "mistakes": [
      "Treating the optimal price point as the price to charge.",
      "Asking people who do not know the product or its alternatives.",
      "Ignoring respondents dropped for answers out of order (often a sign of a confusing questionnaire).",
      "Reading the range as a forecast of sales."
    ],
    "next": [
      "gabor-granger",
      "conjoint"
    ]
  },
  "gabor-granger": {
    "question": "Which of the prices I tested would bring in the most revenue?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "survey"
    ],
    "studies": [
      "Pricing survey",
      "Plan and packaging research",
      "Concept test"
    ],
    "needs": "For each price tested, how many people said they would buy and how many were asked (or the percentage who would buy). Optionally a unit cost for a profit view.",
    "when": [
      "Choosing between a handful of candidate prices for a plan or product",
      "Seeing where demand starts to fall quickly as the price rises",
      "Following up a Van Westendorp range with a demand curve"
    ],
    "notFor": "Prices you did not test, or trade-offs between price and features (use [Conjoint studio](/calculators/conjoint)).",
    "steps": [
      "Pick 4 to 6 realistic prices and ask whether people would buy at each, ideally one price per respondent or in random order.",
      "Paste one price per line: price, number who would buy, number asked.",
      "Add a unit cost if you want the profit-maximising price as well.",
      "Read the revenue-maximising price and the elasticity between neighbouring prices.",
      "Look at the shape of the curve rather than the exact levels."
    ],
    "example": "Eighty people were asked at each of five prices. At £5, 72 would buy; at £10, 46; at £15, 18. Revenue per person asked is highest at £10 (£5.75), just ahead of £7.50 (£5.63), so £10 is the best of the prices tested, but the two are close enough to test both in market.",
    "learn": "Demand at a price is the share who said yes. Multiplying price by demand gives revenue per person asked, and the best price is the tested price where that product peaks. Elasticity says how sharply demand reacts to a price change.",
    "deeper": "Arc elasticity between neighbouring prices is the percentage change in demand over the percentage change in price, each measured against the midpoint; below −1 demand is elastic and raising the price loses revenue. Stated purchase intent overstates real buying, often by a lot, and asking several prices of one person anchors their answers, so randomise the starting price or show one price per respondent.",
    "mistakes": [
      "Reading the stated levels as a sales forecast.",
      "Assuming the true best price lies between two tested prices.",
      "Asking every respondent the prices in the same rising order.",
      "Maximising revenue when costs make profit the better target."
    ],
    "next": [
      "van-westendorp",
      "conjoint",
      "ux-roi"
    ]
  },
  "kano": {
    "question": "Which features will delight people, and which do they simply expect?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "survey"
    ],
    "studies": [
      "Feature prioritisation survey",
      "Roadmap research",
      "Concept test"
    ],
    "needs": "For each feature, every respondent's pair of answers from 1 to 5: how they feel if the product has it (functional) and if it does not (dysfunctional). These come from a Kano questionnaire.",
    "when": [
      "Sorting a long feature list into must-haves, performance features and delighters",
      "Checking whether a planned feature is something people would even notice",
      "Comparing how two segments see the same features"
    ],
    "notFor": "Ranking features on one scale of importance (use [MaxDiff counts](/calculators/maxdiff)) or estimating what people would pay for them.",
    "steps": [
      "Write a functional and a dysfunctional question for each feature, with the five standard answers.",
      "Survey one segment at a time.",
      "Paste one feature per line: the name, a colon, then each respondent's two answers separated by commas.",
      "Read each feature's category and its Better and Worse scores on the plot.",
      "Look again at features with many questionable or reverse answers: the question may be unclear."
    ],
    "example": "Ten customers rated “Export to PDF”. Five gave “I like it” if present and “I dislike it” if absent (one-dimensional), four expected it, and one would like it. The feature is one-dimensional, with Better 0.6 and Worse −0.9: leaving it out would cost more satisfaction than adding it gains.",
    "learn": "Each respondent's two answers are looked up in a table that puts the feature into a category: must-be, one-dimensional, attractive, indifferent, reverse or questionable. The feature takes its most common category. Better shows how much satisfaction rises if it is there; Worse how much it falls if it is missing.",
    "deeper": "The tool uses the standard Kano evaluation table (Berger et al. 1993), with ties going to must-be, then one-dimensional, attractive and indifferent (Matzler and Hinterhuber 1998). Better = (A + O)/(A + O + M + I) and Worse = −(O + M)/(A + O + M + I). Categories drift over time, as delighters become expected, and differ between segments.",
    "mistakes": [
      "Pooling segments who want different things into one result.",
      "Reading only the category and ignoring Better and Worse.",
      "Ignoring many questionable answers, which point to a confusing question.",
      "Describing features so vaguely that people cannot imagine them."
    ],
    "next": [
      "maxdiff",
      "decision-matrix",
      "turf"
    ]
  },
  "maxdiff": {
    "question": "Which of these items do people value most, on a clear scale?",
    "stages": [
      "analyse"
    ],
    "data": [
      "choices"
    ],
    "studies": [
      "MaxDiff survey",
      "Feature prioritisation",
      "Message testing"
    ],
    "needs": "Every task each respondent answered: the items shown, the one picked as best and the one picked as worst. One line per task, all respondents stacked, usually exported from a survey tool.",
    "when": [
      "Ranking 10 to 30 features, benefits or messages when rating scales give everything a 4 or 5",
      "Getting a quick count-based reading of MaxDiff data before modelling",
      "Comparing how strongly the top items beat the rest"
    ],
    "notFor": "Building and fielding the survey (use [MaxDiff survey runner](/calculators/maxdiff-runner)), or unbalanced designs and individual scores, which need a logit or hierarchical Bayes model.",
    "steps": [
      "Use a balanced design: each item shown equally often and with every other item.",
      "Paste one task per line: the items shown, then | best | worst.",
      "Check that no lines were skipped for typing errors.",
      "Read the best-minus-worst scores (−1 to +1) and the preference shares.",
      "Report the order and the gaps, not only the top item."
    ],
    "example": "A hundred and twenty customers each answered eight tasks of four features. Security was picked as best far more often than worst and scores +0.48; Design scores −0.41. Security takes about 30% of the preference share, so it would win most choices among these features.",
    "learn": "Each item's score is how often it was picked as best minus how often as worst, divided by how often it was shown. That gives a scale from −1 (always worst) to +1 (always best) that is fair even if some items appeared more often. Forcing a best and a worst choice stops people rating everything as important.",
    "deeper": "The preference share uses the square root of best over worst counts, √(B/W), which Marley and Louviere (2005) showed approximates a ratio scale; 0.5 is added to both counts so items never or always chosen stay finite, and shares are scaled to add to 100. Counts agree well with model-based scores when the design is balanced.",
    "mistakes": [
      "Analysing an unbalanced design with counts.",
      "Reading preference shares as willingness to pay.",
      "Mixing items of very different kinds or sizes in one list.",
      "Showing too many items per task, which makes the choices careless."
    ],
    "next": [
      "turf",
      "maxdiff-runner",
      "conjoint"
    ]
  },
  "turf": {
    "question": "Which small set of options would appeal to the most people?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "choices",
      "survey"
    ],
    "studies": [
      "Product line survey",
      "Feature bundle research",
      "Content or menu planning"
    ],
    "needs": "For each respondent, the list of items they would choose, like or buy, from a survey (for example a top-box rating or a MaxDiff cut-off). People who would choose none are kept as a dash.",
    "when": [
      "Choosing which three add-ons, plans or topics to offer so that most people find at least one they want",
      "Checking whether the most popular items on their own also make the best set",
      "Seeing how much reach each extra item adds"
    ],
    "notFor": "Situations where people need several items to be satisfied, or ranking items by preference (use [MaxDiff counts](/calculators/maxdiff)).",
    "steps": [
      "Decide in advance what counts as “would choose” and apply it to everyone.",
      "Paste one respondent per line with their chosen items separated by commas.",
      "Set the largest set size to consider (up to 8).",
      "Read the best set and its reach at each size, from the exhaustive search where shown.",
      "Look at near-equal alternatives before picking a set."
    ],
    "example": "Three hundred newsletter subscribers ticked the topics they would read. The three most popular topics together reach 71% of people, but a set swapping one popular topic for a niche one reaches 80%, because the popular topics appeal to the same readers.",
    "learn": "Reach is the share of people who would find at least one item in the set worth choosing. The best set is often not the most popular items, because popular items tend to appeal to the same people. Frequency, the average number of items each reached person wants, breaks ties.",
    "deeper": "TURF stands for total unduplicated reach and frequency. The exhaustive search scores every combination of each size when that is quick enough; the greedy search adds the item that adds most reach one at a time, which is fast but can miss the best set. TURF assumes one wanted item is enough and is sensitive to how “would choose” was asked.",
    "mistakes": [
      "Picking the top individual items instead of the best set.",
      "Changing the cut-off for “would choose” between analyses.",
      "Using it where people need several items, not just one.",
      "Ignoring sets with almost the same reach that are cheaper to deliver."
    ],
    "next": [
      "maxdiff",
      "decision-matrix"
    ]
  },
  "ux-roi": {
    "question": "Is this UX improvement worth the money, and how soon does it pay back?",
    "stages": [
      "decide"
    ],
    "data": [
      "estimates",
      "analytics"
    ],
    "studies": [
      "Business case",
      "Post-launch evaluation",
      "Research prioritisation"
    ],
    "needs": "Estimates of users, tasks, time saved, hourly cost, errors avoided and their cost, visitors, conversion and uplift, support contacts avoided, one-off and running costs, years to count and a discount rate. Leave a benefit at zero if it does not apply.",
    "when": [
      "Writing a business case for a redesign or a research programme",
      "Comparing the payback of two improvements competing for the same budget",
      "Checking after launch whether measured gains paid for the work"
    ],
    "notFor": "Proving that a change caused the gains; the result is only as good as the inputs.",
    "steps": [
      "Collect measured figures where you can: task time from testing, errors and contacts from logs, conversion from analytics.",
      "Enter only the benefits that apply and that do not count the same thing twice.",
      "Add the one-off cost, running cost, years and discount rate.",
      "Read ROI, net present value and payback.",
      "Repeat with a low and a high case and report the range."
    ],
    "example": "Two thousand staff each do a task 250 times a year; a redesign saves 20 s each time at £45 an hour, worth £125,000. With fewer errors, extra conversions and fewer support calls the benefit is £186,200 a year. Against £120,000 up front and £15,000 a year to run, it pays back in about 8 months, with a 3-year net present value of about £321,000 at 8%.",
    "learn": "The calculator adds up four kinds of yearly benefit and sets them against what the work costs. ROI compares total benefit with total cost; net present value counts money in later years as worth less; payback says how long until the up-front cost is covered.",
    "deeper": "Time saved = users × tasks × seconds ÷ 3,600 × hourly cost; conversions = visitors × rate × relative uplift × value. ROI = (total benefit − total cost) ÷ total cost, undiscounted. NPV = − one-off cost + Σ (annual benefit − running cost) ÷ (1 + r)ᵗ. Time saved is only money if people use it for something else of value.",
    "mistakes": [
      "Counting the same gain twice, such as fewer errors and fewer support calls caused by those errors.",
      "Presenting a single optimistic case.",
      "Treating every second saved as cash.",
      "Forgetting running costs."
    ],
    "next": [
      "value-of-information",
      "decision-matrix",
      "market-sizing"
    ]
  },
  "lostness": {
    "question": "Did people wander or go back and forth on the way to the answer?",
    "stages": [
      "analyse"
    ],
    "data": [
      "navigation"
    ],
    "studies": [
      "Usability test",
      "Tree test",
      "Analytics path review"
    ],
    "needs": "For each participant: the number of different pages visited, the total pages visited including revisits, and the minimum number needed. You can paste the path itself, with pages separated by >.",
    "when": [
      "Measuring how efficiently people navigated in a usability test, alongside success and time",
      "Comparing two navigation designs on the same task",
      "Spotting which participants got lost when success alone looks fine"
    ],
    "notFor": "Tasks without a known shortest route, or judging whether people ended up in the right place (use [Completion rate interval](/calculators/completion-rate)).",
    "steps": [
      "Work out the shortest route for the task and count its pages (R), including the start page.",
      "Decide how to count pages (for example whether a filter change is a page) and apply it to everyone.",
      "Paste one participant per line: different pages, total pages, or the path.",
      "Read each participant's score and the mean; below 0.4 is not lost, above 0.5 is lost.",
      "Report it next to success rate and time."
    ],
    "example": "The shortest route to a returns form takes 4 pages. One participant visited 6 different pages and 11 in all: lostness = √((6/11 − 1)² + (4/6 − 1)²) ≈ 0.56, above Smith's 0.5 line, although they did find the form.",
    "learn": "A perfect path visits only the pages needed, once each, and scores 0. Going back to pages already seen and visiting pages that were not needed both raise the score. It shows the struggle that a success rate hides.",
    "deeper": "Lostness (Smith 1996) is L = √((N/S − 1)² + (R/N − 1)²), with N different pages, S total pages and R the minimum. Smith found that people below 0.4 showed no signs of being lost and those above 0.5 did. It needs a known shortest route and consistent counting, and is best used for successful attempts or attempts treated the same way.",
    "mistakes": [
      "Counting pages differently for different participants.",
      "Mixing failed and successful attempts without saying so.",
      "Using it for exploratory tasks with no single best route.",
      "Reporting it on its own without success and time."
    ],
    "next": [
      "tree-test",
      "completion-rate",
      "ia-graph"
    ]
  },
  "readability": {
    "question": "Is this text too dense for the people who will read it?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "design-specs"
    ],
    "studies": [
      "Content audit",
      "Content design review",
      "Help and error message review"
    ],
    "needs": "Plain English text pasted in: a help article, an email, onboarding copy or a long error message. Headings and list items on their own lines count as sentences.",
    "when": [
      "Finding the densest passages in a help centre or policy before rewriting",
      "Flagging long sentences in onboarding or transactional emails",
      "Comparing a draft before and after a plain-language rewrite"
    ],
    "notFor": "Interface labels, bullet fragments or languages other than English, and judging whether text is clear or correct; test that with real readers.",
    "steps": [
      "Paste the text as plain prose.",
      "Set the length above which sentences are flagged (25 words by default).",
      "Read Flesch Reading Ease (higher is easier, 60 or more is plain English) and the Flesch-Kincaid grade.",
      "Rewrite the flagged sentences first.",
      "Check the rewrite with readers, for example with a comprehension or cloze test."
    ],
    "example": "A sign-up confirmation page scores 36 on Flesch Reading Ease, mostly because of one 42-word sentence about email filters. Splitting it into three short sentences (“No email after an hour? Your organisation's spam filter may have stopped it. Ask your administrator to check, then register again.”) raises the score to 74.",
    "learn": "Readability formulas count only sentence length and word length. Long sentences and long words make text harder, so the scores are good at spotting dense passages. They cannot tell whether text makes sense, is in the right order or suits its readers.",
    "deeper": "Flesch Reading Ease = 206.835 − 1.015 × words per sentence − 84.6 × syllables per word; the Flesch-Kincaid grade is roughly the US school grade needed. Syllables are counted by a rule of thumb that agrees with the CMU Pronouncing Dictionary for about 98% of English words, so scores can differ by a few points from other tools.",
    "mistakes": [
      "Writing to the formula with short words in a confusing order.",
      "Treating a good score as proof that people understand the text.",
      "Scoring button labels, lists of fragments or non-English text.",
      "Expecting the exact same score as another tool."
    ],
    "next": [
      "first-click",
      "completion-rate"
    ]
  },
  "shannon-information": {
    "question": "Are answers or themes spread out or concentrated, and do two questions overlap?",
    "stages": [
      "analyse"
    ],
    "data": [
      "qual",
      "survey"
    ],
    "studies": [
      "Interview study",
      "Thematic analysis",
      "Survey analysis"
    ],
    "needs": "Either coded interview data (the code of each segment, or a code × participant table), or survey answers with a header row and one row per respondent, from which you pick two questions or an outcome.",
    "when": [
      "Checking whether a few themes dominate your interviews or the talk is spread evenly",
      "Finding survey questions where nearly everyone gave the same answer",
      "Seeing how much one question tells you about another, or about a segment"
    ],
    "notFor": "Checking whether coders agree (use [Inter-coder agreement](/calculators/intercoder)) or whether you have done enough interviews (use [Saturation and coverage](/calculators/saturation)).",
    "steps": [
      "Choose what to measure: themes in interviews, survey answers, two questions, or information gain.",
      "Paste your coded segments, code table or survey table.",
      "For themes, read entropy, evenness and the effective number of themes.",
      "For survey answers, look for questions with normalised entropy near 0 (everyone agrees).",
      "For two questions, read mutual information and the G-test, and remember it shows association, not cause."
    ],
    "example": "Twelve interviews were coded into six themes. Entropy is 1.68 bits, so 2^1.68 ≈ 3.2: the talk was spread as if people discussed about three equally common themes, even though six were coded. Two themes carry most of the weight.",
    "learn": "Entropy measures how unpredictable an answer is, in bits; one bit is a fair coin toss. Turning it back into an effective number of options tells you how many equally common themes or answers would give the same spread. Mutual information measures how much knowing one answer tells you about another.",
    "deeper": "H = −Σ p log₂ p; evenness J = H / log₂ S (Pielou); Simpson diversity 1 − Σp². Entropy from small samples is biased low, and the Miller-Madow correction adds (S − 1)/(2N) nats. The G-test uses G = 2N · I in nats, and the gain ratio divides information gain by the question's own entropy so questions with many options do not win by chance (Quinlan 1986).",
    "mistakes": [
      "Comparing entropy between code sets of different sizes without using evenness.",
      "Reading entropy from a handful of segments as exact.",
      "Leaving free-text columns in, where every different answer counts as a new option.",
      "Reading mutual information as one question causing the other."
    ],
    "next": [
      "saturation",
      "code-network",
      "crosstab"
    ]
  },
  "information-foraging": {
    "question": "When do people give up on a page, and do my labels point them the right way?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "navigation",
      "estimates",
      "qual"
    ],
    "studies": [
      "Tree test",
      "First-click test",
      "Search behaviour study",
      "Sensemaking study"
    ],
    "needs": "For leaving a page: the total value, how fast it is found and the time to move on, or measured gains over time. For scent: at each step, the links shown and how many people chose each, with the correct one marked. For sources: each source's value, handling time and how often it is met.",
    "when": [
      "Explaining why people skim results pages and leave before reading everything",
      "Finding the step in a navigation path where labels mislead or look alike",
      "Deciding which information sources are worth pointing people to"
    ],
    "notFor": "Measuring task success itself (use [Tree test](/calculators/tree-test) or [First-click and 5-second test](/calculators/first-click) to collect it).",
    "steps": [
      "Choose the model: when to leave a patch, information scent, or which sources to use.",
      "For scent, paste each step with the links shown and their counts, putting * on the correct link.",
      "Read the scent and entropy per step and the predicted success along the path.",
      "For a patch, enter the gain curve and travel time and read the best time to leave.",
      "Use the weak step or the poor source as the focus of the next design change."
    ],
    "example": "In a tree test, 68% of people chose the right top-level label and 75% of those chose the right label at the second level. Predicted success along the path is 0.68 × 0.75 ≈ 51%. High entropy at step 2 shows two labels looked equally good, so that is the label to rewrite.",
    "learn": "Information foraging treats people like animals looking for food: they try to get the most value per unit of time. They leave a page when what they are finding there slows to below what they could get elsewhere. Labels give off “scent”, and strong scent on the right link keeps people on track.",
    "deeper": "The patch model applies Charnov's marginal value theorem (Pirolli and Card 1999): leave when the gain rate in the patch falls to the best overall rate. Path success is the product of the step scents, which assumes no backtracking and independent steps. The diet model ranks sources by value per handling time and adds them while each beats the rate of those already chosen.",
    "mistakes": [
      "Treating predicted path success as a measured success rate.",
      "Mixing units of value between sources.",
      "Reading high entropy as failure when two correct routes exist.",
      "Forgetting that faster moving on makes people leave each page sooner."
    ],
    "next": [
      "tree-test",
      "first-click",
      "search-analytics"
    ]
  },
  "signal-detection": {
    "question": "Do people really notice this, or do they just tend to say yes?",
    "stages": [
      "analyse"
    ],
    "data": [
      "task-success"
    ],
    "studies": [
      "Recognition or memory test",
      "Warning and alert study",
      "Phishing awareness test",
      "Inspection or review task"
    ],
    "needs": "For each participant or condition: hits, misses, false alarms and correct rejections. The test must include trials where the signal is present and trials where it is not.",
    "when": [
      "Testing whether people notice a warning, badge or change, separately from how often they say yes",
      "Scoring a phishing or fraud awareness test",
      "Comparing reviewers who flag defects at different rates"
    ],
    "notFor": "Tests with no signal-absent trials, where false alarms cannot be counted; a plain [Completion rate interval](/calculators/completion-rate) is all you can report then.",
    "steps": [
      "Design the test with a mix of signal and no-signal trials.",
      "Count hits, misses, false alarms and correct rejections for each person or condition.",
      "Paste one line each, optionally starting with a label.",
      "Keep the log-linear correction so rates of 0% or 100% still give a value.",
      "Read d′ for sensitivity and c for bias, and compare groups on each."
    ],
    "example": "Staff screened 40 phishing and 40 genuine emails. They flagged 34 phishing emails (hits) and 10 genuine ones (false alarms). With the log-linear correction d′ is about 1.7, a fair ability to tell them apart, and c is about −0.17, a slight lean towards flagging.",
    "learn": "A plain error rate mixes two things: how well people can tell a signal from noise, and how willing they are to say yes. d′ measures the first and c the second. Someone who flags everything catches every threat but has no real skill.",
    "deeper": "d′ = z(H) − z(F) and c = −(z(H) + z(F))/2, with A′ and B″ as nonparametric versions (Green and Swets 1966; Stanislaw and Todorov 1999). The log-linear correction (Hautus 1995) adds 0.5 to every count. d′ assumes normal signal and noise distributions with equal variance; if that fails, collect confidence ratings and fit an ROC curve.",
    "mistakes": [
      "Reporting percent correct only.",
      "Running a test with no signal-absent trials.",
      "Dropping people with 0% or 100% rates instead of correcting.",
      "Comparing d′ values computed with different corrections."
    ],
    "next": [
      "weber-jnd",
      "classifier-metrics",
      "compare-means"
    ]
  },
  "discounting": {
    "question": "How quickly do people lose interest in a benefit they have to wait for?",
    "stages": [
      "analyse"
    ],
    "data": [
      "choices"
    ],
    "studies": [
      "Behavioural economics survey",
      "Plan and pricing research",
      "Onboarding research"
    ],
    "needs": "Either sooner-or-later choices (amount now, amount later, delay in days, which was chosen), optionally with a participant id, or indifference points (a delay and what the delayed amount is worth today).",
    "when": [
      "Judging how strongly people will resist effort now for a payoff later, as in onboarding or setup",
      "Comparing annual and monthly plan framing for different segments",
      "Scoring a standard delay-discounting questionnaire"
    ],
    "notFor": "Choices involving risk rather than delay (use [Loss aversion (λ)](/calculators/loss-aversion) for gambles).",
    "steps": [
      "Ask a set of choices between a smaller amount now and a larger amount later, covering a wide range of delays.",
      "Paste one choice per line, starting with a participant id if you have several people.",
      "Read each person's k, its consistency, and the median across people.",
      "If you have indifference points, compare the hyperbolic and exponential fits and the area under the curve.",
      "Use 1/k, the delay at which a reward is worth half, to explain the result."
    ],
    "example": "A choice between £20 now and £30 in 30 days is a tie for k = (30/20 − 1)/30 ≈ 0.017 per day. A user who takes the £20 has a higher k: to them a reward 60 days away is worth less than half its face value, so a benefit promised “after two months of use” will feel small.",
    "learn": "Delay discounting describes how much a reward loses value the longer people have to wait. The rate k summarises it: the higher k, the faster value drains away. People differ a lot, so the median is the usual summary.",
    "deeper": "Mazur's hyperbola V = A / (1 + kD) fits human choices better than exponential discounting. Each person's k from choices follows Kirby, Petry and Bickel (1999), using geometric midpoints between the questions' k values. The area under the curve (Myerson, Green and Warusawitharana 2001) gives a summary that needs no model.",
    "mistakes": [
      "Averaging k with the mean when it is spread on a log scale.",
      "Using too narrow a range of delays to place everyone.",
      "Ignoring people whose choices are inconsistent.",
      "Treating hypothetical choices as real behaviour without checking."
    ],
    "next": [
      "loss-aversion",
      "nonparametric"
    ]
  },
  "loss-aversion": {
    "question": "How much more does losing something weigh with people than gaining the same?",
    "stages": [
      "analyse"
    ],
    "data": [
      "choices"
    ],
    "studies": [
      "Behavioural economics survey",
      "Pricing and framing research",
      "Lab experiment"
    ],
    "needs": "A series of 50/50 gambles for each person: the possible gain, the possible loss (as a positive amount) and whether they accepted. Optionally a participant id at the start of each line.",
    "when": [
      "Gauging how strongly people will react to removing a feature, discount or default",
      "Comparing loss aversion between segments before choosing a framing",
      "Scoring a standard mixed-gamble task"
    ],
    "notFor": "Deciding which framing works better in the product; compare framings directly with an A/B test (see [Compare two completion rates](/calculators/compare-rates)).",
    "steps": [
      "Offer gambles covering a wide range of gain-to-loss ratios, for example from 1:1 to 4:1.",
      "Paste one gamble per line: gain, loss, accept or reject.",
      "Read λ from the logistic fit and from the switch point.",
      "If choices are perfectly consistent, rely on the switch point.",
      "Compare λ between groups or framings rather than treating it as a fixed trait."
    ],
    "example": "A participant accepts a 50/50 gamble to win £20 or lose £10 but rejects win £15 or lose £10. Their switch point lies between ratios of 1.5 and 2, so λ ≈ 1.7: a loss weighs about 1.7 times as much as an equal gain.",
    "learn": "People feel losses more strongly than gains of the same size. λ says how many times more: with λ = 2, losing £10 is only offset by gaining £20. That matters whenever a design takes something away or frames a choice as avoiding a loss.",
    "deeper": "Following Tom, Fox, Trepel and Poldrack (2007), a logistic regression of accepting on gain and loss is fitted and λ = −b_L / b_G. When choices are perfectly consistent the estimates run off to infinity, so the switch point (the gain-to-loss ratio that best separates accepts from rejects) is used. λ also reflects risk attitude and depends on stakes and the reference point (Kahneman and Tversky 1979).",
    "mistakes": [
      "Entering losses as negative numbers.",
      "Offering too narrow a range of ratios to find the switch point.",
      "Treating λ as a fixed personality trait.",
      "Designing on λ alone without testing the framing in the product."
    ],
    "next": [
      "discounting",
      "compare-rates"
    ]
  },
  "weber-jnd": {
    "question": "How big does a change need to be before people notice it?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "choices"
    ],
    "studies": [
      "Perception experiment",
      "Perceived performance study",
      "Price perception test"
    ],
    "needs": "For one standard: each comparison level, how many times it was judged greater than the standard, and how many trials. For several standards: each standard and its measured just noticeable difference.",
    "when": [
      "Deciding how much faster a page must load before users feel the difference",
      "Checking that an unwanted change (a price rise, a smaller image) stays below notice",
      "Testing whether the noticeable change stays a constant fraction across levels"
    ],
    "notFor": "Deciding whether a change is valuable or liked; noticing is not the same as caring.",
    "steps": [
      "Pick a standard and a set of comparison levels above and below it.",
      "Show each comparison with the standard many times and record how often it is judged greater.",
      "Paste one level per line: level, times judged greater, trials.",
      "Read the point of subjective equality, the JND and the Weber fraction.",
      "Repeat at other standards to see whether the fraction holds."
    ],
    "example": "People compared loading times with a 2.0 s standard, at levels from 1.6 to 2.4 s, 20 trials each. The fit gives a JND of about 0.2 s, a Weber fraction of 0.10: a speed-up has to cut about 10% before most people notice it.",
    "learn": "The just noticeable difference is the smallest change people reliably detect. Weber's law says it is a fixed fraction of the starting level, so a small change is easy to notice on a small base and hard to notice on a large one.",
    "deeper": "With the method of constant stimuli the tool fits a cumulative normal by maximum likelihood (a probit model). The point of subjective equality is where P = 50%, and the JND is half the distance between the 25% and 75% points, 0.6745σ. Across several standards, k is fitted through the origin. Weber's law usually holds in the middle of a range and fails near the extremes.",
    "mistakes": [
      "Too few trials per level for a stable curve.",
      "Choosing levels that are all obviously different.",
      "Extending the Weber fraction far beyond the levels tested.",
      "Equating noticeable with valued."
    ],
    "next": [
      "signal-detection",
      "reaction-time"
    ]
  },
  "tree-test": {
    "question": "Can people find things in my navigation, and where do they go wrong?",
    "stages": [
      "plan",
      "collect",
      "analyse"
    ],
    "data": [
      "navigation",
      "task-success"
    ],
    "studies": [
      "Tree test",
      "Information architecture redesign",
      "Navigation benchmark"
    ],
    "needs": "Your navigation tree as labels, and tasks with their correct destinations. Participants take the test through a shared link and send back result codes, which you paste in to analyse.",
    "when": [
      "Checking a proposed menu structure before any visual design exists",
      "Comparing a new tree against the current one on the same tasks",
      "Finding which labels or top-level groups cause wrong turns"
    ],
    "notFor": "Discovering how people would group content in the first place (use [Card sort](/calculators/card-sort)).",
    "steps": [
      "Build the tree and write tasks that do not reuse the words of the target label.",
      "Mark the correct destination or destinations for each task.",
      "Share the participant link and aim for about 50 participants.",
      "Paste the result codes and read success, direct success, first-click accuracy and time.",
      "Use the error types and diagnosis to decide what to fix, then retest."
    ],
    "example": "Fifty-two people looked for where to change a delivery address. Success was 62%, with an interval from about 48% to 74%, but only 40% first clicked “Account”; most went to “Orders” first. That points to a top-level grouping problem, not a wording one.",
    "learn": "A tree test strips away visual design and search to test the structure alone. Success says whether people got there; directness and first clicks say how. People whose first click is right are far more likely to succeed, so wrong first clicks show where to look.",
    "deeper": "Success uses the adjusted-Wald interval (Sauro and Lewis), time the geometric mean of successful attempts, and lostness Smith's (1996) formula. Error types adapt Norman's (1981) and Reason's (1990) slips, lapses and mistakes to click paths: many mistakes point to grouping, near misses to ambiguous final labels, give-ups to unfamiliar words.",
    "mistakes": [
      "Writing tasks that give away the answer by using the label's words.",
      "Testing with too few people for stable success rates.",
      "Reporting success only and ignoring first clicks and paths.",
      "Testing a tree with placeholder labels instead of the real ones."
    ],
    "next": [
      "card-sort",
      "first-click",
      "lostness"
    ]
  },
  "hta": {
    "question": "What are the steps of this task, how long will it take, and where could it go wrong?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "design-specs",
      "qual"
    ],
    "studies": [
      "Task analysis",
      "Safety-critical design review",
      "Expert review"
    ],
    "needs": "An indented outline of the goal, its subgoals and operations, with plans saying how they fit together. Optionally a time or KLM operators for each operation, and probability and criticality ratings for errors.",
    "when": [
      "Mapping a complex or safety-critical task before redesigning it",
      "Estimating total task time and the critical path from operation times",
      "Ranking the steps where errors are most likely and most costly"
    ],
    "notFor": "Measuring what real users do; an HTA is an analyst's model and needs checking against observation.",
    "steps": [
      "Write the main goal, then indent its subgoals and their operations beneath it.",
      "Add a plan to each goal, such as “do 1 then 2” or “if … do 3”.",
      "Add times or KLM operators to the operations if you need task time.",
      "Rate each operation's probability and criticality of error as low, medium or high.",
      "Read the diagram, the total and critical-path times, and the steps with P × C of 6 or more.",
      "Check the model by watching people do the task, and have a second analyst rate P and C."
    ],
    "example": "A nurse's “give a scheduled dose” task breaks into checking the chart, preparing the dose, checking identity and recording it. Selecting the dose from a dropdown is rated high probability and high criticality, P × C = 9, so it heads the list for redesign ahead of steps that take longer but matter less.",
    "learn": "Hierarchical task analysis breaks a goal into subgoals and operations, and says in a plan how they are put together. You stop breaking a step down once it is clear enough for your purpose. The result shows where time goes and where errors would hurt most.",
    "deeper": "HTA follows Annett and Duncan (1967) and Stanton (2006); Annett's P × C rule stops redescription when probability of failure times its cost is acceptable. Times use the same KLM operator values as the KLM calculator; the critical path counts only required steps and parallel steps once. Risk follows SHERPA (Embrey 1986), with its five error classes.",
    "mistakes": [
      "Breaking steps down further than the purpose needs.",
      "Leaving out plans, so the order and conditions are lost.",
      "Relying on one analyst's ratings.",
      "Never checking the model against what people really do."
    ],
    "next": [
      "klm",
      "use-fmea",
      "human-error"
    ]
  },
  "card-sort": {
    "question": "How do people group my content, and which groups do they agree on?",
    "stages": [
      "plan",
      "collect",
      "analyse"
    ],
    "data": [
      "choices",
      "navigation"
    ],
    "studies": [
      "Card sort",
      "Information architecture redesign",
      "Content inventory"
    ],
    "needs": "A list of cards (pages, features or content) and, for closed or hybrid sorts, the categories. Participants sort through a shared link and send back result codes, which you paste in to analyse.",
    "when": [
      "Learning how people expect content to be grouped before designing navigation",
      "Testing whether fixed categories work for every card (closed sort)",
      "Finding cards that have no clear home"
    ],
    "notFor": "Checking whether people can find things in a structure (use [Tree test](/calculators/tree-test)).",
    "steps": [
      "Choose open, closed or hybrid and write the cards (ideally no more than about 60).",
      "Share the participant link and aim for at least 15 to 20 people.",
      "Paste the result codes and read the similarity matrix and dendrogram.",
      "For open sorts, standardise category names by merging synonyms.",
      "Use actual agreement and the stability curve to judge how firm the groups are, then test them with a tree test."
    ],
    "example": "Twenty-two people openly sorted 40 help articles. “Refunds” and “Returns” were grouped together by 86% of them. Cutting the dendrogram at 0.5 gives six groups, and the stability curve reaches about r = 0.93 by 20 participants, so more sorting would change little.",
    "learn": "The core result is how often each pair of cards was put together. Clustering turns those pairs into groups, and actual agreement checks which groups people really made. The groups show people's mental model, not a finished navigation.",
    "deeper": "Similarity is the share who put two cards together; clustering uses average linkage on 1 − similarity. Actual agreement and the best-merge method follow Righi et al. (2013), name standardisation follows Spencer (2009), and the stability curve repeats Tullis and Wood's (2004) finding that 15 participants reach about r = 0.90 and 20 to 30 reach 0.93 to 0.95.",
    "mistakes": [
      "Running it with fewer than about 15 participants.",
      "Using so many cards that people sort carelessly towards the end.",
      "Taking the dendrogram groups as a final navigation without a tree test.",
      "Skipping name standardisation in open sorts."
    ],
    "next": [
      "tree-test",
      "ia-graph"
    ]
  },
  "first-click": {
    "question": "Do people click the right place first, and what do they remember after five seconds?",
    "stages": [
      "plan",
      "collect",
      "analyse"
    ],
    "data": [
      "navigation",
      "task-success"
    ],
    "studies": [
      "First-click test",
      "5-second test",
      "Landing page test",
      "Icon recognition test"
    ],
    "needs": "Screenshots of the screens, a task for each with the correct target areas drawn, and participants' clicks collected through a shared link or in a moderated session. For a 5-second test, the questions to ask afterwards.",
    "when": [
      "Checking whether people know where to start a task on a new screen",
      "Comparing two versions of a page by where people click first",
      "Testing whether a landing page communicates its purpose at a glance"
    ],
    "notFor": "Whole journeys, content quality or anything that needs scrolling, hovering or typing (use a [Tree test](/calculators/tree-test) or a full usability test).",
    "steps": [
      "Upload a screenshot for each task and drag to draw the correct target areas.",
      "Choose first click or 5-second test, and add a second version if you are comparing.",
      "Share the participant link and aim for 20 to 40 people per version.",
      "Paste the result codes and read success, time, heatmap and hotspots.",
      "For 5-second tests, read word counts and keyword mentions."
    ],
    "example": "On version A, 14 of 30 people clicked the right place first; on version B, 23 of 30. The N−1 two-proportion test gives p ≈ 0.02, and the heatmap shows version A's clicks split between two similar-looking buttons.",
    "learn": "Where people click first strongly predicts whether they will finish the task. A 5-second test checks whether the main message lands before people start reading. Both are quick tests of one screen, not of a whole journey.",
    "deeper": "Bailey and Wolfson (2009) found people with a right first click completed the task about 87% of the time, against about 46% otherwise: an association, not a guarantee. Success uses the adjusted-Wald interval, time the geometric mean, the heatmap a Gaussian kernel density, and hotspots DBSCAN.",
    "mistakes": [
      "Drawing target areas too generously.",
      "Reading a heatmap without the success rate.",
      "Testing with a dozen people and trusting small differences.",
      "Using a 5-second test on pages people are meant to study."
    ],
    "next": [
      "tree-test",
      "compare-rates",
      "completion-rate"
    ]
  },
  "factor-analysis": {
    "question": "Which survey items belong together, and how many underlying factors are there?",
    "stages": [
      "analyse"
    ],
    "data": [
      "survey",
      "ratings"
    ],
    "studies": [
      "Questionnaire development",
      "Attitude survey",
      "Scale validation"
    ],
    "needs": "Survey responses with one row per respondent and one rating item per column, or a correlation matrix of the items with the number of respondents.",
    "when": [
      "Building a new questionnaire and deciding which items to keep",
      "Checking whether a long survey measures a few broad themes",
      "Exploring the structure of items before confirming it on new data"
    ],
    "notFor": "Testing a structure you already have (use [Scale validity](/calculators/scale-validity) for a confirmatory check) or formative indices such as checklists.",
    "steps": [
      "Paste the item responses and pick Pearson or polychoric correlations for rating items.",
      "Check KMO and Bartlett's test to see whether the items suit factor analysis.",
      "Take the number of factors suggested by parallel analysis.",
      "Choose an oblique rotation (oblimin) unless you expect unrelated factors.",
      "Read the loadings, flag items that fail the .40/.30/.20 rule and check alpha per factor."
    ],
    "example": "Two hundred and forty people answered 12 attitude items. KMO is 0.84, and parallel analysis suggests three factors. After oblimin rotation, item 7 loads .42 on one factor and .35 on another, so it is flagged as a cross-loader and rewritten.",
    "learn": "Factor analysis looks for groups of items that rise and fall together, as if driven by a hidden factor. Loadings show how strongly each item belongs to each factor. Choosing how many factors to keep is the key decision.",
    "deeper": "Parallel analysis (Horn 1965) keeps factors whose eigenvalues beat the 95th percentile of random data; the Kaiser rule is shown only because SPSS uses it by default. Extraction is minimum residual, principal axis or maximum likelihood; oblimin and promax let factors correlate. The .40/.30/.20 rule follows Howard (2016), and solutions are unstable with fewer than about 100 respondents unless communalities are high (MacCallum et al. 1999).",
    "mistakes": [
      "Choosing the number of factors by eigenvalues above 1.",
      "Running it with too few respondents.",
      "Forcing uncorrelated factors with varimax when they are related.",
      "Confirming a structure on the same data that suggested it."
    ],
    "next": [
      "scale-validity",
      "reliability",
      "item-analysis"
    ]
  },
  "scale-validity": {
    "question": "Does each scale measure its own construct, separate from the others?",
    "stages": [
      "analyse"
    ],
    "data": [
      "survey",
      "ratings"
    ],
    "studies": [
      "Scale validation",
      "Questionnaire development",
      "Survey model research"
    ],
    "needs": "Raw item data with a list of which items measure which construct; or standardised loadings from a paper or CFA (with construct correlations if you have them); or χ², degrees of freedom and sample size for fit indices.",
    "when": [
      "Checking that a new questionnaire's scales are reliable and distinct",
      "Re-checking a published scale in your own population",
      "Judging the fit of a confirmatory factor analysis reported elsewhere"
    ],
    "notFor": "Formative indices, where items define the construct rather than reflect it, or exploring an unknown structure (use [Factor analysis](/calculators/factor-analysis)).",
    "steps": [
      "Choose what you have: raw items, loadings, or fit statistics.",
      "List each construct and its items.",
      "Read composite reliability (aim for .70) and AVE (aim for .50) for each construct.",
      "Check discriminant validity with HTMT (below .85 or .90) and Fornell-Larcker.",
      "With raw data, read the CFA fit indices and treat cut-offs as guides."
    ],
    "example": "A four-item trust scale has loadings .78, .81, .74 and .69: composite reliability is .84 and AVE .57, so it converges. But HTMT between trust and satisfaction is .91, so the two scales may be measuring the same thing.",
    "learn": "Convergent validity asks whether a scale's items measure one thing well; discriminant validity asks whether two scales measure different things. Both are worked out from how strongly items load on their own construct and how strongly constructs correlate.",
    "deeper": "CR (Jöreskog 1971), AVE (Fornell and Larcker 1981) and coefficient H (Hancock and Mueller 2001) come from the standardised loadings. HTMT (Henseler, Ringle and Sarstedt 2015) catches overlap that Fornell-Larcker often misses. Hu and Bentler's (1999) fit cut-offs are suggestions, not golden rules (Marsh, Hau and Wen 2004), and the CFA is unstable below about 200 respondents.",
    "mistakes": [
      "Applying CR, AVE and HTMT to formative indices.",
      "Treating fit cut-offs as pass or fail rules.",
      "Testing a structure on the data that suggested it.",
      "Using two-item constructs and trusting the results."
    ],
    "next": [
      "factor-analysis",
      "reliability"
    ]
  },
  "key-drivers": {
    "question": "Which parts of the experience go most with overall satisfaction or NPS?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "survey",
      "ratings"
    ],
    "studies": [
      "Satisfaction survey",
      "NPS survey",
      "Relationship tracking survey"
    ],
    "needs": "A survey table with an outcome column (overall satisfaction, likelihood to recommend, or a yes or no answer) and two or more columns of attribute ratings, one row per respondent.",
    "when": [
      "Deciding which attribute to improve first after a satisfaction survey",
      "Explaining which aspects of the experience go with promoters and detractors",
      "Building an importance-performance grid from derived importance"
    ],
    "notFor": "Proving what would change satisfaction; derived importance is correlational, so test changes with an experiment.",
    "steps": [
      "Paste the data with the outcome and the attribute ratings as columns.",
      "Pick linear regression for a rating outcome or logistic for yes or no.",
      "Check VIFs: above 5 the regression coefficients become unstable.",
      "Read relative weights or dominance shares as each driver's share of R².",
      "Use the grid: high importance with a low rating means fix first."
    ],
    "example": "Four hundred customers rated six attributes and overall satisfaction (R² = .52). Speed's regression coefficient was small because it overlaps with reliability, but relative weights give it 31% of the explained variance. Its mean rating is low, so it lands in “Fix first”.",
    "learn": "Ratings of different attributes usually move together, so raw regression coefficients can hide important drivers or even flip their sign. Relative weights and dominance analysis share out the explained variance fairly among correlated drivers.",
    "deeper": "Johnson's (2000) relative weights use the closest uncorrelated version of the drivers; dominance analysis (Budescu 1993) averages each driver's gain in R² over all subsets, which is the Shapley value. The grid follows Martilla and James (1977). Plan for roughly 10 to 20 respondents per driver.",
    "mistakes": [
      "Reading derived importance as cause.",
      "Including an overall item among its own components.",
      "Trusting coefficients when VIFs are high.",
      "Running it with too few respondents per driver."
    ],
    "next": [
      "importance-performance",
      "regression",
      "correlation"
    ]
  },
  "crosstab": {
    "question": "Do answers to one question differ between groups, and by how much?",
    "stages": [
      "analyse"
    ],
    "data": [
      "survey"
    ],
    "studies": [
      "Survey analysis",
      "Segment comparison",
      "Benchmark survey"
    ],
    "needs": "A survey table with at least two category columns (2 to 15 different answers each), one row per respondent. Optionally a third column to split the table into layers.",
    "when": [
      "Comparing an answer across plans, regions or user types",
      "Finding which cells of a table stand out",
      "Checking whether a difference holds within each segment or comes from the mix of segments"
    ],
    "notFor": "Before-and-after answers from the same people (use McNemar's test in [Compare two completion rates](/calculators/compare-rates)).",
    "steps": [
      "Paste the survey data and choose the row and column questions.",
      "Read the percentages that answer your question (row or column).",
      "Check the χ² or exact test, then the adjusted residuals to see which cells differ.",
      "Read Cramér's V for how strong the association is.",
      "Add a third variable as a layer to check for Simpson's paradox."
    ],
    "example": "Six hundred respondents gave their plan (Free, Pro, Team) and whether they would recommend the product. The χ² test is significant but Cramér's V is 0.14, a small association. The adjusted residuals show the difference comes from Team users saying no more often than expected.",
    "learn": "A crosstab compares percentages across groups. The χ² test asks whether the pattern could come from chance, residuals point to the cells that stand out, and Cramér's V says how strong the link is. Association is not cause.",
    "deeper": "When expected counts fall below 5 the tool uses Fisher's or a Monte Carlo exact test (Cochran 1954). Adjusted residuals follow Haberman (1973) with Holm correction, and the V interval follows Smithson (2003). The Mantel-Haenszel analysis and Simpson's paradox check follow Lazarsfeld's elaboration model.",
    "mistakes": [
      "Counting the same person in more than one cell.",
      "Treating significance as importance in large samples.",
      "Reading an association as cause.",
      "Ignoring a third variable that could explain the pattern."
    ],
    "next": [
      "correspondence-analysis",
      "survey-weighting",
      "brand-lift"
    ]
  },
  "conjoint": {
    "question": "Which features and prices do people trade off, and what would they choose?",
    "stages": [
      "plan",
      "collect",
      "analyse",
      "decide"
    ],
    "data": [
      "choices"
    ],
    "studies": [
      "Choice-based conjoint survey",
      "Pricing study",
      "Product configuration research"
    ],
    "needs": "Attributes and their levels (with price if you want willingness to pay). The tool builds the design; respondents answer through a shared link, and you paste the result codes or a table of answers to analyse.",
    "when": [
      "Deciding which combination of features and price to launch",
      "Estimating what a feature is worth in money",
      "Simulating market shares against competitors"
    ],
    "notFor": "Ranking a list of features without trade-offs (use [MaxDiff counts](/calculators/maxdiff)) or more than about six attributes at once.",
    "steps": [
      "List attributes and levels; mark price as numeric and add any banned combinations.",
      "Generate the design and check its efficiency and expected errors.",
      "Field the survey through the respondent link.",
      "Analyse with logit, latent class or hierarchical Bayes and read importance and part-worths.",
      "Use the simulator to compare product options against competitors."
    ],
    "example": "Three hundred people completed 12 choice tasks about a subscription with four attributes. Hierarchical Bayes part-worths suggest offline mode is worth about £3 a month. In the simulator, adding it at £2 extra raises share against two competitors from 34% to 41%.",
    "learn": "Conjoint infers how much each feature is worth from choices between whole products. Part-worths are the value of each level, importance is how much an attribute's range matters, and the simulator turns part-worths into predicted choices.",
    "deeper": "The tool uses effects coding, orthogonal or D-optimal designs, and multinomial logit, latent class (Kamakura and Russell 1989) or hierarchical Bayes models (Allenby and Rossi). Willingness to pay is the part-worth difference over the price coefficient; randomised first choice follows Huber, Orme and Miller (1999). Stated choices usually overstate real buying.",
    "mistakes": [
      "Using attributes that always go together.",
      "Reading simulated shares as sales forecasts.",
      "Forgetting that importance depends on the levels chosen.",
      "Fielding with fewer respondents than Orme's minimum."
    ],
    "next": [
      "maxdiff",
      "van-westendorp",
      "gabor-granger"
    ]
  },
  "ab-health": {
    "question": "Can I trust this A/B test, and is it big enough to detect what I care about?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "ab-test",
      "analytics"
    ],
    "studies": [
      "A/B test",
      "Online experiment",
      "A/A test"
    ],
    "needs": "Depends on the check: users per arm with planned share; baseline rate or mean, SD and daily traffic; per-user numerators and denominators; successes and users per arm with a margin; or a list of A/A p-values.",
    "when": [
      "Checking for a sample ratio mismatch before reading any results",
      "Planning how long a test must run to detect a given effect",
      "Showing that a redesign is no worse than the current version"
    ],
    "notFor": "Cluster- or switchback-randomised tests, or reading the final result (use [Bayesian A/B test](/calculators/bayes-ab) or [Compare two completion rates](/calculators/compare-rates)).",
    "steps": [
      "Run the sample ratio check first; stop if it flags a mismatch.",
      "Plan the minimum detectable effect and duration before launch, using CUPED if you have pre-period data.",
      "For per-session metrics, use the delta method.",
      "For non-inferiority, fix the margin in advance and test against it.",
      "Use A/A p-values to check your pipeline."
    ],
    "example": "A 50/50 test assigned 50,912 users to A and 49,088 to B. χ² = 33.3, p far below 0.001, so there is a sample ratio mismatch. The team investigated and found a redirect dropping users from B.",
    "learn": "Before reading the lift, check that the test is sound. A split that drifts from the plan signals a bug, a test that is too small cannot detect what matters, and a non-inferiority test shows a change is not worse.",
    "deeper": "SRM uses χ² at p < 0.001 (Kohavi, Tang and Xu 2020). CUPED (Deng et al. 2013) cuts variance by 1 − ρ². Ratio metrics use the delta method (Deng, Knoblich and Lu 2018). Non-inferiority uses one-sided tests and equivalence TOST (Schuirmann 1987).",
    "mistakes": [
      "Reading results despite a sample ratio mismatch.",
      "Using the MDE planner to justify stopping early.",
      "Choosing a non-inferiority margin after seeing the data.",
      "Treating sessions as independent when users were randomised."
    ],
    "next": [
      "bayes-ab",
      "sprt",
      "compare-rates"
    ]
  },
  "multi-compare": {
    "question": "Do three or more designs really differ, and which ones from which?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings",
      "task-time",
      "task-success"
    ],
    "studies": [
      "Comparative usability test",
      "Design concept test",
      "Benchmark across versions"
    ],
    "needs": "Ratings, times or success (1 or 0) for each design, from different people per design or the same people on every design. Or a list of p-values to correct.",
    "when": [
      "Comparing three or more prototypes in one test",
      "Benchmarking several versions on the same tasks",
      "Correcting p-values from many comparisons"
    ],
    "notFor": "Only two designs (use [Compare two means](/calculators/compare-means)) or designs crossing several factors.",
    "steps": [
      "Choose your layout: different people, same people, or same people with success or failure.",
      "Paste the data, one column per design or in long format.",
      "Read the overall test, such as ANOVA, Welch or Kruskal-Wallis.",
      "Read the post hoc pairs and letters: designs sharing a letter are not shown to differ.",
      "Report effect sizes, not just p-values."
    ],
    "example": "Three checkout designs were each rated by 20 different people. The ANOVA is significant, and Tukey's letters show design C differs from A and B, while A and B share a letter and are not shown to differ.",
    "learn": "With three or more designs, first test whether any differ, then compare pairs while correcting for the extra comparisons. Without correction, false alarms grow with each pair.",
    "deeper": "The tool includes one-way and Welch ANOVA, Kruskal-Wallis, repeated measures with Greenhouse-Geisser correction, Friedman and Cochran's Q. Post hoc tests are Tukey, Games-Howell, Dunn, Nemenyi and Conover; corrections are Bonferroni, Holm, Hochberg and Benjamini-Hochberg.",
    "mistakes": [
      "Running many t-tests without correcting.",
      "Using a between-groups test for same-people data.",
      "Reporting only p-values.",
      "Testing all pairs when one comparison was planned."
    ],
    "next": [
      "effect-size",
      "compare-means",
      "nonparametric"
    ]
  },
  "decision-matrix": {
    "question": "Which option should we pick when several criteria matter?",
    "stages": [
      "decide"
    ],
    "data": [
      "estimates"
    ],
    "studies": [
      "Design option review",
      "Prioritisation workshop",
      "Tool or vendor selection"
    ],
    "needs": "Two to eight criteria and options. For AHP, pairwise judgements on Saaty's 1 to 9 scale from one or more judges; for SMART, weights and scores. Optionally an effort estimate from 1 to 10 per option.",
    "when": [
      "Choosing between design concepts with a team",
      "Making the weights behind a prioritisation explicit",
      "Checking how sensitive the choice is to the weights"
    ],
    "notFor": "More than about 9 items or replacing evidence on the criteria; for long lists use [MaxDiff counts](/calculators/maxdiff).",
    "steps": [
      "List criteria and options.",
      "Choose AHP or SMART and enter judgements or weights and scores.",
      "For AHP, check the consistency ratio is at or below 0.10.",
      "Read the overall scores and the break-even weights.",
      "Use the effort × impact view to discuss trade-offs."
    ],
    "example": "A team compared three navigation concepts on four criteria. AHP weights put user value at 0.45, with a consistency ratio of 0.06. Concept B leads, and the break-even analysis shows it stays ahead unless the weight on build effort rises above 0.38.",
    "learn": "A decision matrix makes the reasoning visible: weight each criterion, score each option, and add up. AHP derives weights from pairwise judgements; SMART uses weights directly. Sensitivity shows how much the weights matter.",
    "deeper": "AHP (Saaty 1980) uses the principal eigenvector; CR above 0.10 flags inconsistent judgements. Judges are combined with the geometric mean (Aczél and Saaty 1983). SMART follows Edwards and Barron (1994). AHP rankings can reverse when options are added or removed.",
    "mistakes": [
      "Ignoring a high consistency ratio.",
      "Comparing too many items pairwise.",
      "Treating team scores as evidence.",
      "Counting the same benefit under two criteria."
    ],
    "next": [
      "value-of-information",
      "ux-roi",
      "maxdiff"
    ]
  },
  "retention-funnel": {
    "question": "How well do we keep users, and where do they drop out?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "analytics"
    ],
    "studies": [
      "Product analytics review",
      "Cohort analysis",
      "Funnel analysis",
      "Subscription research"
    ],
    "needs": "From analytics: a cohort table or event list; daily, weekly and monthly active users; revenue, margin, churn and acquisition cost; step counts for a funnel; journey paths; or invite numbers.",
    "when": [
      "Tracking retention of signup cohorts and projecting it",
      "Finding the funnel step that loses the most people",
      "Estimating lifetime value and acquisition payback"
    ],
    "notFor": "Proving what caused a change in retention or conversion; test changes with an experiment (see [A/B test health checks](/calculators/ab-health)).",
    "steps": [
      "Choose the analysis: cohort, stickiness, unit economics, funnel, Markov journeys or viral growth.",
      "Paste data from your analytics, counting people rather than sessions.",
      "Read the cohort triangle, curves and projections.",
      "For funnels, read conversion per step with intervals.",
      "Treat projections as assumptions about the future."
    ],
    "example": "A sign-up funnel has 10,000 visitors, 3,200 sign-ups and 1,100 activations. Overall conversion is 11.0%, with a Wilson interval from about 10.4% to 11.6%. The biggest drop is from visit to sign-up.",
    "learn": "Retention shows how many people stay at each age; funnels show where people drop out. Cohorts keep groups that started at the same time together, so changes over time are visible.",
    "deeper": "Retention projection uses the shifted-beta-geometric model (Fader and Hardie 2007), CLV follows Gupta and Lehmann (2003), funnels use Wilson intervals, and Markov attribution uses removal effects (Anderl et al. 2016).",
    "mistakes": [
      "Counting sessions instead of people.",
      "Using the sBG projection for usage that lapses and returns.",
      "Crediting a change without a test.",
      "Mixing cohorts of different ages in one average."
    ],
    "next": [
      "survival",
      "control-charts",
      "journey-forecast"
    ]
  },
  "meta-analysis": {
    "question": "What do several studies say together, and do they agree?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "ratings",
      "task-success",
      "ab-test"
    ],
    "studies": [
      "Research synthesis",
      "Repeated A/B tests",
      "Systematic review"
    ],
    "needs": "For each study: means, SDs and sizes for two groups; event counts; d or g with sizes; r with n; or an effect and its standard error. Optionally a moderator such as lab or remote.",
    "when": [
      "Combining several usability studies of the same design change",
      "Summarising a series of A/B tests on one idea",
      "Checking whether results differ by setting"
    ],
    "notFor": "Studies that measure different things or use incompatible designs.",
    "steps": [
      "Collect comparable results from each study.",
      "Paste one study per line, with its type and numbers.",
      "Choose the common metric and the random-effects estimator.",
      "Read the pooled effect, I² and the prediction interval on the forest plot.",
      "Check the funnel plot, Egger's test and trim-and-fill for publication bias."
    ],
    "example": "Eight usability studies compared a step-by-step wizard with a single long form. The pooled Hedges' g is 0.42, with an interval from 0.21 to 0.63, and I² is 35%. The prediction interval runs from −0.1 to 0.9, so the wizard usually helps but may not in every setting.",
    "learn": "A meta-analysis weights each study by its precision and combines them. Random effects allow true effects to vary between studies, and the prediction interval shows the range of effects a new study might see.",
    "deeper": "Effects follow Borenstein, Hedges, Higgins and Rothstein (2009). τ² is estimated by DerSimonian-Laird, REML or Paule-Mandel; the prediction interval follows Higgins, Thompson and Spiegelhalter (2009). Egger's test (Egger et al. 1997) and trim-and-fill (Duval and Tweedie 2000) check for publication bias.",
    "mistakes": [
      "Pooling studies that measure different things.",
      "Counting significant studies instead of pooling effects.",
      "Trusting τ² from fewer than 5 studies.",
      "Ignoring publication bias."
    ],
    "next": [
      "effect-size",
      "compare-means"
    ]
  },
  "preference-test": {
    "question": "Which of these designs do people prefer, and is the lead real or just noise?",
    "stages": [
      "collect",
      "analyse"
    ],
    "data": [
      "choices"
    ],
    "studies": [
      "Preference test",
      "5-second test",
      "Concept test",
      "Unmoderated survey"
    ],
    "needs": "Two to four designs as hosted image addresses or short text. Participants answer through a shareable link and send back a result code, which you paste into the analysis step.",
    "when": [
      "Choosing between two to four visual directions, headlines or messages early in design",
      "When stakeholders ask which option people like more, and you want more than a show of hands",
      "When you want to see whether preference differs between segments, such as current users and newcomers"
    ],
    "notFor": "Deciding which design works better; preference is a first impression, so pair it with task-based tests such as a [first-click test](/calculators/first-click).",
    "steps": [
      "Build the study: name it, write one neutral question, add two to four designs and keep 'Randomise the order' on.",
      "Optionally add a segment question and ask participants why they chose.",
      "Preview the link, then share it; each participant gets a code at the end to copy or email to you.",
      "Paste the codes into '2. Analyse results' and read the shares with their intervals.",
      "Check the head-to-head test (three or four designs), the position check and the reasons before you report."
    ],
    "example": "Fifty people compared two checkout headers and 34 chose Design B. B's share is 68% with a Wilson interval of roughly 54% to 79%, and the exact binomial test against a 50/50 split gives p = 0.015, so B is genuinely preferred by this kind of audience. The reasons mostly mention the clearer price.",
    "learn": "A share from 50 people is an estimate of the share you would see in everyone like them. The interval shows the range of shares that fit your answers. The test asks whether a split this uneven is likely if people had no real preference.",
    "deeper": "Shares use 95% Wilson intervals, which stay inside 0 to 100% and behave well in small samples. Two designs get an exact binomial test against 50%; three or four get a chi-square goodness-of-fit test against equal shares, then an exact binomial head-to-head test of the leader against the runner-up, because a significant overall test can come from one weak design. Segments use a chi-square test of independence with Cramér's V, and Fisher's exact test for 2 × 2 tables. For a 60/40 split between two designs, plan for about 200 participants.",
    "mistakes": [
      "Reading preference as proof that a design is easier to use.",
      "Comparing designs that differ in many ways at once, so you cannot tell what drove the choice.",
      "Switching off order randomisation, which lets the first or left position win.",
      "Declaring a winner among four designs from the overall test without the head-to-head test."
    ],
    "next": [
      "first-click",
      "compare-rates",
      "sample-size"
    ]
  },
  "maxdiff-runner": {
    "question": "Which features or messages matter most to people, ranked against each other?",
    "stages": [
      "plan",
      "collect",
      "analyse"
    ],
    "data": [
      "choices"
    ],
    "studies": [
      "MaxDiff survey",
      "Feature prioritisation survey",
      "Message testing"
    ],
    "needs": "A list of comparable items (features, benefits, messages), usually 8 to 30. The tool builds the sets, participants answer through a shareable link and return a result code, and you paste the codes back in.",
    "when": [
      "Prioritising a feature backlog when a rating scale would show everything as 'important'",
      "Testing which value propositions or messages resonate most",
      "When you need a ranked list with a sense of how far apart the items are"
    ],
    "notFor": "Measuring absolute importance or mixing items of different kinds (features against prices); for price use [Van Westendorp](/calculators/van-westendorp) or [conjoint](/calculators/conjoint).",
    "steps": [
      "Write the items in the same style and at the same level of detail.",
      "Choose items per set (often 4 or 5) and sets per respondent so each item is seen about three times per person.",
      "Check the design balance, preview the link and share it.",
      "Paste the result codes and read count scores and the share of preference with intervals.",
      "Report the ranking and which items have overlapping intervals; export to the MaxDiff counts calculator if needed."
    ],
    "example": "A team ranks 12 onboarding features with 4 per set and 9 sets per person, so each feature is seen three times. After 150 respondents, 'Import from spreadsheet' has the highest share of preference and its interval does not overlap the third item's, while items 2 and 3 overlap, so treat them as tied.",
    "learn": "Instead of rating each item, people pick the best and worst in small sets. Because they must trade items off, the results spread out and show relative importance. Count scores are simple (best minus worst, divided by times shown); the logit model turns the same choices into utilities and shares.",
    "deeper": "The design aims for a balanced incomplete block design: items appear equally often and pairs appear together equally often; when no exact design exists the tool uses simulated annealing to get as close as possible. The sequential best-worst logit treats each set as a best choice then a worst choice, with standard errors clustered by respondent by default. Sawtooth Software suggests each item be seen at least three times per respondent, and 100 to 200 respondents is common (Finn and Louviere 1992).",
    "mistakes": [
      "Mixing items of different kinds or levels of detail in one list.",
      "Using more than about 40 items per person.",
      "Reading a top rank as 'people want this' rather than 'more than the others'.",
      "Expecting segment or individual scores from these aggregate results."
    ],
    "next": [
      "maxdiff",
      "turf",
      "kano"
    ]
  },
  "reaction-cards": {
    "question": "Which words do people choose to describe our product, and is the mix positive?",
    "stages": [
      "collect",
      "analyse"
    ],
    "data": [
      "choices",
      "qual"
    ],
    "studies": [
      "Usability test",
      "Desirability study",
      "Brand perception study"
    ],
    "needs": "Participants who have just used the product (or seen a design). They pick words from the 118 Microsoft reaction cards through a shareable link, and you paste their result codes back in.",
    "when": [
      "At the end of a usability session, to open a conversation about how the product feels",
      "Comparing the emotional response to two designs or versions",
      "Checking whether a redesign shifts perception towards intended brand words"
    ],
    "notFor": "A stand-alone score of how good a design is; use a standardised questionnaire such as the [SUS scorer](/calculators/sus) for that.",
    "steps": [
      "Set up the study: name, optional prompt and image, word limits, and one design or two.",
      "Share the link after participants use the product; ask them to pick words, then their top five.",
      "Talk through the chosen words with each participant: the explanation is the main data.",
      "Paste the codes and read word shares, the positive share against the 61.9% base rate and the word cloud.",
      "For two designs, read the difference in positive share; treat word-by-word differences as exploratory."
    ],
    "example": "Fourteen of 20 participants chose 'Easy to use' (70%, Wilson interval about 48% to 85%). Their positive share of all words chosen was well above the 61.9% you would get by picking at random, but three people chose 'Overwhelming', which the follow-up talk tied to the settings page.",
    "learn": "The word list is about 60% positive, so random picking would already look fairly positive. The tool compares your positive share with that base rate. Each person picks several words, so the interval accounts for words from the same person being linked.",
    "deeper": "Word shares use Wilson intervals. The positive share uses a standard error clustered by participant (an intercept-only regression with cluster-robust variance and a t interval on G − 1 degrees of freedom), and the two-design comparison adds a design indicator, which works for both between- and within-subjects setups (Benedek and Miner 2002). Valence labels are the tool's reading of the published split; words like 'Predictable' can go either way.",
    "mistakes": [
      "Skipping the follow-up conversation and reporting only counts.",
      "Using it with participants who are not fluent in the language of the words.",
      "Treating every word difference between designs as meaningful.",
      "Assuming 'Familiar' or 'Predictable' are always positive."
    ],
    "next": [
      "questionnaires",
      "ueq",
      "attrakdiff"
    ]
  },
  "questionnaires": {
    "question": "How do I score this standard questionnaire and compare it with published norms?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings",
      "survey"
    ],
    "studies": [
      "Usability test",
      "Post-study survey",
      "Game or engagement study",
      "Product/market fit survey"
    ],
    "needs": "One row per respondent with their answers to a supported questionnaire (PSSUQ/CSUQ, ASQ, SMEQ, UES-SF, TAM, SAM, GEQ, SWLS, a semantic differential or the Sean Ellis question), in the published item order.",
    "when": [
      "After a usability study that used PSSUQ, ASQ or SMEQ",
      "Scoring engagement (UES-SF), acceptance (TAM) or game experience (GEQ) questionnaires",
      "Running the Sean Ellis 'how disappointed would you be' test for product/market fit",
      "Comparing semantic differential profiles between groups"
    ],
    "notFor": "SUS, UMUX-Lite, SEQ, NASA-TLX, UEQ, AttrakDiff and NPS, which have their own calculators such as the [SUS scorer](/calculators/sus).",
    "steps": [
      "Pick the questionnaire and check its answer scale and item polarity match your form.",
      "Paste one respondent per row in the published item order.",
      "Read each scale's mean with its interval, its reliability (alpha) and the comparison with the norm.",
      "Report group results; do not interpret single-person scores."
    ],
    "example": "In a product/market fit survey, 52 of 120 active users said they would be 'very disappointed' without the product: 43%, with an interval of about 35% to 52%. It sits just above the 40% line, but the interval includes values below it, so the honest summary is 'around the threshold'.",
    "learn": "Each questionnaire has a key: which items form each scale, which are reversed, and how to combine them. The tool applies the key, then gives a group mean with an interval so you can see how precise it is. Comparing with a published norm tells you whether your score is typical.",
    "deeper": "Scale scores are the mean of answered items (the sum for SWLS), with reversed items scored as min + max − x and at least half the items required. Intervals are t intervals; the benchmark test is a one-sample t test; Cronbach's alpha uses complete responders. Keys and norms follow the sources the tool cites, such as Lewis (2002) for PSSUQ v3 and Sauro and Lewis (2016) for its norms; the Sean Ellis share uses a Wilson interval and an exact binomial test against 40% (Ellis 2009; Vohra 2018).",
    "mistakes": [
      "Getting polarity wrong: on PSSUQ and ASQ, lower is better.",
      "Comparing a score with a norm from a different version, such as the 19-item PSSUQ v2.",
      "Mixing item orders or answer formats across respondents.",
      "Reporting one person's score as if it were reliable."
    ],
    "next": [
      "reliability",
      "norms",
      "compare-means"
    ]
  },
  "agreement": {
    "question": "Do our raters or measurement methods agree closely enough to trust them?",
    "stages": [
      "analyse"
    ],
    "data": [
      "ratings",
      "estimates"
    ],
    "studies": [
      "Expert review",
      "Rater training check",
      "Method comparison",
      "Team survey"
    ],
    "needs": "A table of numeric scores: targets by raters for ICC, items by judges for Kendall's W, raters' answers within groups for rwg, or paired measurements from two methods for Bland-Altman.",
    "when": [
      "Checking whether several researchers give the same numeric scores to the same designs",
      "Seeing whether judges rank a set of items in a similar order",
      "Testing whether team members agree enough to report a team-level average",
      "Comparing a quick measurement method with an established one"
    ],
    "notFor": "Category codes such as thematic tags; use [Inter-coder agreement](/calculators/intercoder) for kappa or Krippendorff's alpha.",
    "steps": [
      "Choose the index that matches your data: ICC, Kendall's W, rwg or Bland-Altman.",
      "For ICC, answer the three questions (same raters, same scores or ranking, one rater or the mean).",
      "Paste the table in the layout shown.",
      "Read the value with its interval against the bands, judging by the interval, not just the point.",
      "Report which form you used and why."
    ],
    "example": "Four researchers scored 15 prototypes on a 1-10 polish scale. The single-rater absolute-agreement ICC came out at about 0.6 with an interval reaching below 0.5, so one researcher's score alone is not dependable, while the average of all four fell in the 'good' band.",
    "learn": "Agreement is about whether people give the same answers, not just whether their answers move together. Different questions need different indices: ICC for scores, Kendall's W for rankings, rwg for consensus within a group, and Bland-Altman for comparing two ways of measuring.",
    "deeper": "ICC forms come from a two-way ANOVA (Shrout and Fleiss 1979; McGraw and Wong 1996) with F-based intervals, banded as poor, moderate, good or excellent (Koo and Li 2016). Kendall's W comes from rank sums with a chi-square and F test (Kendall and Babington Smith 1939). rwg compares observed variance with that of random answers (James, Demaree and Wolf 1984; LeBreton and Senter 2008). Bland-Altman gives the bias and 95% limits of agreement with their intervals (Bland and Altman 1986).",
    "mistakes": [
      "Using ICC on targets that hardly differ, which gives low values even with careful raters.",
      "Reading a high correlation as agreement between two methods.",
      "Picking the ICC form that gives the highest number instead of the one that fits the design.",
      "Using ICC for category codes."
    ],
    "next": [
      "intercoder",
      "severity-ratings",
      "reliability"
    ]
  },
  "item-analysis": {
    "question": "Which questions in my test or quiz work well, and which should I fix or drop?",
    "stages": [
      "analyse"
    ],
    "data": [
      "survey",
      "ratings"
    ],
    "studies": [
      "Knowledge test",
      "Learnability quiz",
      "Certification or training assessment"
    ],
    "needs": "One person per row with scored answers (0/1 or points per item), or letter answers plus an answer key, from a test or quiz given to at least 30 people.",
    "when": [
      "Checking a knowledge quiz used to measure how well people understood an interface or help content",
      "Refining a training assessment before using it widely",
      "Finding items that are too easy, too hard or that strong performers get wrong"
    ],
    "notFor": "Rating scales such as attitude questionnaires; use [Scale reliability](/calculators/reliability) or [Factor analysis](/calculators/factor-analysis) instead.",
    "steps": [
      "Score each answer (or paste letters with a key line).",
      "Read the classical table: difficulty, discrimination, item-total correlations and alpha if deleted.",
      "Look at distractors for multiple-choice items to see which wrong answers attract strong performers.",
      "Optionally fit the Rasch model and check infit and outfit and the Wright map.",
      "Revise or remove weak items and test again with a new group."
    ],
    "example": "On a 20-question help-centre quiz taken by 120 staff, one item had a discrimination of 0.08 and a negative corrected item-total correlation; the distractor table showed high scorers choosing option C. The wording was ambiguous, and alpha rose when the item was removed.",
    "learn": "A good test question is answered correctly more often by people who know more overall. Difficulty tells you how many got it right; discrimination tells you whether it separates stronger from weaker performers. The Rasch model places people and questions on the same scale.",
    "deeper": "Discrimination compares the top and bottom 27% (Kelley 1939), banded following Ebel and Frisbie (1991); alpha is KR-20 for 0/1 items. The Rasch model is fitted by conditional or joint maximum likelihood (Andersen 1972; Wright and Masters 1982), with infit and outfit mean-squares of 0.5 to 1.5 seen as productive (Linacre 2002). Classical values depend on who took the test; Rasch assumes one dimension and equal discrimination.",
    "mistakes": [
      "Trusting item difficulties from fewer than 30 people.",
      "Dropping items on statistics alone without reading them.",
      "Fitting the Rasch model to a test that mixes very different skills."
    ],
    "next": [
      "reliability",
      "scale-validity",
      "factor-analysis"
    ]
  },
  "survey-weighting": {
    "question": "My survey sample is skewed; how do I weight it to match the population?",
    "stages": [
      "analyse"
    ],
    "data": [
      "survey"
    ],
    "studies": [
      "Customer survey",
      "Panel or intercept survey",
      "Market research survey"
    ],
    "needs": "Survey responses with the demographic or account variables you will weight on, plus trusted population shares for each of those variables (for example from your customer database or census).",
    "when": [
      "When some groups (such as new users or a region) answered far more or less than their real share",
      "Before reporting survey percentages to stand for the whole user base",
      "Checking how much weighting costs you in precision (effective sample size)"
    ],
    "notFor": "Fixing groups that barely responded or variables you did not measure; check bias with [Non-response checks](/calculators/nonresponse).",
    "steps": [
      "Paste the responses with a header row.",
      "Enter target shares for each variable, such as plan: free=0.7, paid=0.3.",
      "Optionally trim extreme weights.",
      "Check the raking margins, the weight histogram, the design effect and the effective n.",
      "Report weighted estimates with their intervals and say what you weighted on."
    ],
    "example": "A survey of 500 users over-represents paid plans (50% of answers against 30% of users). Raking on plan and region gives a design effect of 1.6, so the effective sample is about 313. The weighted satisfaction share drops a few points because free users are less satisfied.",
    "learn": "Weighting gives under-represented people more say and over-represented people less, so the sample matches the population on chosen variables. The price is precision: unequal weights make results less certain, which the effective sample size shows.",
    "deeper": "Raking (iterative proportional fitting; Deming and Stephan 1940) adjusts weights to match each margin in turn until all are met; trimming caps extreme weights and rakes again (Battaglia et al. 2009). The design effect from weighting is 1 + CV² of the weights (Kish 1965). Weighted estimates use a linearisation variance treating respondents as independent, which is slightly conservative.",
    "mistakes": [
      "Weighting on a variable that is itself an outcome.",
      "Using targets measured differently from your survey question.",
      "Ignoring very large weights (above about 5 times the mean).",
      "Assuming weighting fixes bias on variables you did not weight on."
    ],
    "next": [
      "margin-of-error",
      "nonresponse",
      "crosstab"
    ]
  },
  "top-tasks": {
    "question": "Which few tasks matter most to our users out of a long list?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "survey",
      "choices"
    ],
    "studies": [
      "Top task survey",
      "Website or intranet redesign research",
      "Content prioritisation"
    ],
    "needs": "Results from a top task survey: either vote totals per task, or each respondent's chosen tasks (up to five each) from a long randomised list, often 50 to 100 tasks.",
    "when": [
      "Deciding what a website, intranet or app should focus on",
      "Finding the 'long neck' of tasks that deserve most design effort",
      "Grouping tasks to see which areas of the service carry the most demand"
    ],
    "notFor": "Measuring how well tasks work today; follow up with task measures such as the [Completion rate interval](/calculators/completion-rate).",
    "steps": [
      "Build a long, consistent list of tasks and run the vote with a large sample.",
      "Paste vote totals per task, or one respondent's choices per line (more accurate).",
      "Read vote share with intervals, the long neck and cumulative share.",
      "Use the tiers to see where differences are real, and optional groups for areas of the service.",
      "Pick the top tasks to measure and design for."
    ],
    "example": "A council website survey with 1,200 respondents and 70 tasks found that 4 tasks took 25% of all votes: paying council tax, bin collection days, reporting a problem and parking permits. The tiers showed the first two were clearly ahead of the rest.",
    "learn": "When people can vote for only a few tasks from a long list, their votes concentrate on what matters most. The intervals show which differences between tasks are bigger than chance, and the long neck shows how few tasks carry a quarter of the demand.",
    "deeper": "Following McGovern (2018), pick rates get Wilson intervals and vote shares rescale them. Tiers compare tasks on the same respondents with a z test that accounts for people picking both; with totals only, picks are assumed independent. Tiers are a guide, not a formal multiple-comparison procedure.",
    "mistakes": [
      "Using a short list (under about 20 tasks) or tasks written at different levels of detail.",
      "Comparing vote shares between surveys with different task lists.",
      "Reading high importance as evidence that the task currently works badly."
    ],
    "next": [
      "completion-rate",
      "tree-test",
      "card-sort"
    ]
  },
  "search-analytics": {
    "question": "What is our site search log telling us about failed and repeated searches?",
    "stages": [
      "analyse"
    ],
    "data": [
      "analytics"
    ],
    "studies": [
      "Site search audit",
      "Content gap analysis",
      "Analytics review"
    ],
    "needs": "A query log with one search per line in time order: session, query, number of results and number of clicks. Remove bots and internal staff first.",
    "when": [
      "Finding content that people search for but cannot find (zero results)",
      "Spotting searches people keep rephrasing",
      "Seeing whether a few queries dominate, which suggests navigation shortcuts"
    ],
    "notFor": "Understanding why people searched; pair it with interviews or a [tree test](/calculators/tree-test).",
    "steps": [
      "Export a session-aware search log and clean out bots and staff.",
      "Paste it in the format session, query, results, clicks.",
      "Read the zero-result, refinement, click-through and search-exit rates with intervals.",
      "Check the head, torso and tail split and the top and zero-result queries.",
      "Turn zero-result queries and frequent reformulations into content and labelling fixes."
    ],
    "example": "In a week of 8,000 searches, the zero-result rate was 12% and 'returns label' was the most common zero-result query. A quarter of searches were followed by another search in the same session, mostly reformulations of shipping questions.",
    "learn": "Each search is an attempt to find something. Searches with no results, quick refinements and exits without a click are signs that something failed. Searches from the same session are linked, so the intervals treat sessions, not single searches, as the unit.",
    "deeper": "Rates are ratio estimates over sessions with a cluster-robust variance, the same as OLS with errors clustered by session. Queries are split into head, torso and tail by cumulative share (Rosenfeld 2011), and a Gini coefficient shows how concentrated searches are. Exits and refinements are inferred from search order, so the log must be in time order.",
    "mistakes": [
      "Using a log with bots or staff still in it.",
      "Using a log not in time order within sessions.",
      "Assuming the simple query normalisation merges spelling variants; merge them yourself."
    ],
    "next": [
      "concentration",
      "control-charts",
      "retention-funnel"
    ]
  },
  "control-charts": {
    "question": "Is this change in a metric a real shift or just normal week-to-week noise?",
    "stages": [
      "analyse"
    ],
    "data": [
      "analytics"
    ],
    "studies": [
      "Product analytics review",
      "Release monitoring",
      "Support or error-rate tracking"
    ],
    "needs": "A time series of one metric: individual values, or counts with their totals per period (such as errors out of sessions per week), ideally with a stable baseline period.",
    "when": [
      "Monitoring a weekly metric and deciding whether a dip needs action",
      "Checking whether a release shifted a rate",
      "Estimating the immediate and gradual effect of a change with an interrupted time series"
    ],
    "notFor": "Strongly seasonal series such as daily traffic with weekly cycles, unless the seasonality is removed first; for randomised changes use the [A/B test health checks](/calculators/ab-health).",
    "steps": [
      "Choose the chart: XmR for single values, p-chart for proportions, u-chart for rates.",
      "Paste the series and set how many early points form the baseline.",
      "Read points outside the limits and the run-rule signals.",
      "Check CUSUM and change points for gradual or sustained shifts.",
      "For a known change, set the first point after it and read the level and slope changes."
    ],
    "example": "A weekly checkout error rate averaged 4.2% for 20 weeks with an average moving range of 0.5 points, giving limits of about 2.9% to 5.5%. After a release it sat above the centre line for 8 weeks in a row, a Western Electric signal of a real shift even though no single week crossed the upper limit.",
    "learn": "Every process wobbles. Control limits show how far it normally wobbles, so you can tell ordinary noise from a signal. Run rules catch smaller, sustained shifts that never cross the limits.",
    "deeper": "The XmR chart sets limits at the mean ± 2.66 times the average moving range (Wheeler 2000); p- and u-charts have limits that vary with each period's size. Run rules follow Western Electric (1956) or Nelson (1984). CUSUM uses k = 0.5 and h = 5; change points use binary segmentation with a BIC-style penalty (Killick et al. 2012); the interrupted time series is segmented regression with Newey-West errors (Wagner et al. 2002).",
    "mistakes": [
      "Reacting to every point that moves rather than to signals.",
      "Computing limits from a baseline that already contains the shift.",
      "Running an interrupted time series with fewer than about 8 points each side.",
      "Treating a change at release time as caused by the release without a control series."
    ],
    "next": [
      "retention-funnel",
      "diff-in-diff",
      "ab-health"
    ]
  },
  "concentration": {
    "question": "How unevenly is usage spread across our users, pages or creators?",
    "stages": [
      "analyse"
    ],
    "data": [
      "analytics"
    ],
    "studies": [
      "Engagement analysis",
      "Content audit",
      "Product analytics review"
    ],
    "needs": "One value per unit, such as sessions per user, views per page or posts per creator, over a fixed time window.",
    "when": [
      "Checking whether a small group of power users drives most activity",
      "Testing the '80/20' claim about pages or features",
      "Seeing whether engagement follows a heavy-tailed pattern"
    ],
    "notFor": "Comparing groups defined differently (with or without inactive users, different time windows), which makes Gini values incomparable.",
    "steps": [
      "Decide the unit and time window, and whether inactive units are included.",
      "Paste one value per unit.",
      "Read the Lorenz curve, the Gini with its bootstrap interval and the top shares.",
      "Check the 'units holding 80%' figure against the 80/20 rule.",
      "Optionally run the power-law fit and read the goodness-of-fit and the comparison with an exponential."
    ],
    "example": "Monthly sessions for 5,000 users gave a Gini of about 0.78, and the top 20% of users held 85% of sessions. The power-law fit was not rejected, but a lognormal tail could fit as well, so the team reported 'highly concentrated' rather than 'power law'.",
    "learn": "The Lorenz curve shows what share of the total the bottom x% hold. A straight diagonal means everyone is equal; the more the curve sags, the more concentrated usage is. The Gini coefficient sums that up from 0 (equal) to 1 (one unit holds everything).",
    "deeper": "Gini is twice the area between the Lorenz curve and the line of equality, with a percentile bootstrap interval. The power-law fit follows Clauset, Shalizi and Newman (2009): it picks the cut-off that best fits, estimates the exponent by maximum likelihood, and tests fit with a semi-parametric bootstrap, checked against the powerlaw package (Alstott et al. 2014).",
    "mistakes": [
      "Comparing Gini values across different populations or windows.",
      "Claiming a power law from fewer than about 50 tail values.",
      "Treating a fitted power law as proof of a mechanism."
    ],
    "next": [
      "search-analytics",
      "retention-funnel",
      "sir-adoption"
    ]
  },
  "classifier-metrics": {
    "question": "How good is this classifier or alert at flagging the right cases?",
    "stages": [
      "analyse"
    ],
    "data": [
      "analytics",
      "estimates"
    ],
    "studies": [
      "Alert or notification evaluation",
      "AI feature evaluation",
      "Screening question validation"
    ],
    "needs": "Either the four counts of a confusion matrix (true and false positives and negatives), or one score and true label per case.",
    "when": [
      "Evaluating a spam, fraud or moderation flag that affects what users see",
      "Checking an AI feature's suggestions against labelled examples",
      "Choosing a threshold for an alert by trading recall against precision"
    ],
    "notFor": "Agreement between two human coders; use [Inter-coder agreement](/calculators/intercoder) for that.",
    "steps": [
      "Collect labelled cases where you know the true answer.",
      "Enter the confusion matrix, or paste scores and labels and set a threshold.",
      "Read precision, recall, F1, MCC and the others with their intervals.",
      "With scores, read the ROC and precision-recall curves and the AUC interval.",
      "Report the threshold you chose and how you chose it."
    ],
    "example": "An abuse filter tested on 1,000 messages had 40 true positives, 10 false positives, 20 false negatives and 930 true negatives. Accuracy is 97%, but recall is only 67%: a third of abusive messages get through. Precision is 80%.",
    "learn": "Accuracy can look great when positives are rare. Precision asks how many flagged cases were right; recall asks how many real cases were caught. Raising the threshold usually improves one and worsens the other.",
    "deeper": "Proportions use Wilson intervals; F1, MCC, kappa and balanced accuracy use delta-method intervals; likelihood ratios use the log method (Simel et al. 1991). AUC equals the chance a random positive scores above a random negative, with a DeLong (1988) interval. When positives are rare the precision-recall curve is more informative than ROC.",
    "mistakes": [
      "Judging an imbalanced classifier on accuracy.",
      "Choosing the threshold and reporting its metrics on the same data without saying so.",
      "Relying on ROC alone when positives are rare."
    ],
    "next": [
      "signal-detection",
      "risk-harm",
      "decision-tree"
    ]
  },
  "reaction-time": {
    "question": "What do these reaction times say about speed, decisions and visual search?",
    "stages": [
      "analyse"
    ],
    "data": [
      "physiology"
    ],
    "studies": [
      "Lab experiment",
      "Visual search study",
      "Perception or recognition test"
    ],
    "needs": "Trial-level reaction times in milliseconds, with correctness, and a condition or display set size where relevant; ideally around 100 trials per person and condition for model fits.",
    "when": [
      "Cleaning reaction-time data from an online or lab experiment",
      "Comparing how fast and carefully people decide between icon or layout conditions",
      "Measuring how search time grows with the number of items on screen"
    ],
    "notFor": "Task times from usability tests, which are minutes not milliseconds; use the [Task time interval](/calculators/task-time).",
    "steps": [
      "Decide a trimming rule before looking at results (absolute, SD or MAD).",
      "Paste trials and choose the analysis: distribution, EZ-diffusion or visual search.",
      "Read the ex-Gaussian parameters, or drift, boundary and non-decision time, or slopes per condition.",
      "Check trial counts; with 10 to 20 trials per condition, report medians instead."
    ],
    "example": "In a visual search test of icon sets, search time rose by about 35 ms per extra icon for the outline set and 8 ms per icon for the filled set. The filled icons support efficient search, while the outline set behaves like an inefficient search.",
    "learn": "Reaction times are skewed: most are fast, a few are slow. Trimming removes anticipations and lapses; the ex-Gaussian splits typical speed from the slow tail. EZ-diffusion separates how quickly evidence builds up from how cautious people are.",
    "deeper": "MAD trimming with k = 2.5 is robust (Leys et al. 2013), but every rule trades power against bias (Ratcliff 1993). The ex-Gaussian is fitted by maximum likelihood; EZ-diffusion follows Wagenmakers, van der Maas and Grasman (2007) and reproduces their worked example. Slopes under about 10 ms per item suggest efficient search (Wolfe 1998).",
    "mistakes": [
      "Choosing a trimming rule after seeing which gives the best result.",
      "Fitting the ex-Gaussian or EZ with few trials.",
      "Using EZ for multi-step tasks or 100% accuracy.",
      "Fitting a search slope from only two set sizes."
    ],
    "next": [
      "distribution-check",
      "signal-detection",
      "hick"
    ]
  },
  "risk-harm": {
    "question": "How much more likely is a bad outcome for people exposed to this design?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "ab-test",
      "analytics"
    ],
    "studies": [
      "A/B test with a harm metric",
      "Cohort analysis",
      "Case-control study",
      "Incident review"
    ],
    "needs": "Counts of people with and without an outcome in exposed and unexposed groups, or new cases with person-time, or rates by stratum for standardisation.",
    "when": [
      "Reporting how much a dark pattern or confusing flow raises a harm such as accidental purchases",
      "Turning a risk difference into 'one extra harm per N users'",
      "Comparing complaint or error rates between groups with different make-up"
    ],
    "notFor": "Risk ratios or NNT from case-control data, where the outcome share is fixed by the design; use the odds ratio there.",
    "steps": [
      "Pick the measure: risk table, incidence and prevalence, or standardisation.",
      "Choose the design (cohort/A/B or case-control) and enter the counts.",
      "Read the risk ratio, odds ratio and risk difference with intervals.",
      "Read NNT or NNH and, if relevant, the attributable fraction.",
      "Report the absolute numbers alongside the ratios."
    ],
    "example": "In an A/B test, 30 of 200 users in the new flow and 15 of 200 in the old one made an accidental purchase. The risk ratio is 2.0 and the risk difference 7.5 points, so roughly one extra accidental purchase for every 13 to 14 users exposed (NNH).",
    "learn": "Ratios say how many times more likely an outcome is; differences say how many more people are affected. 'Twice as likely' can mean 1 in a million or 1 in 10, so always report the absolute risk too. NNT and NNH turn differences into people.",
    "deeper": "Risk ratios use the Katz interval, odds ratios Woolf's, and risk differences Wald and Newcombe intervals; NNT inverts the risk difference interval (Altman 1998). Attributable fractions follow Levin (1953) and Miettinen, and assume a causal, unconfounded association. Incidence uses exact Poisson intervals; standardisation follows Fay and Feuer (1997) (Rothman, Greenland and Lash, Modern Epidemiology).",
    "mistakes": [
      "Reporting only relative risk.",
      "Computing NNT from case-control data.",
      "Reading an attributable fraction as harm you could definitely prevent.",
      "Using these intervals with cells under 5."
    ],
    "next": [
      "compare-rates",
      "e-value",
      "use-fmea"
    ]
  },
  "queueing": {
    "question": "How many support agents do we need so people do not wait too long?",
    "stages": [
      "plan",
      "decide"
    ],
    "data": [
      "analytics",
      "estimates"
    ],
    "studies": [
      "Service design",
      "Support staffing plan",
      "Service blueprint analysis"
    ],
    "needs": "Contacts per interval, average handling time, a service-level target (such as 80% answered in 20 seconds), and optionally shrinkage and an occupancy cap.",
    "when": [
      "Sizing a support or chat team for a launch",
      "Explaining why waits explode when staff are nearly fully busy",
      "Checking a service journey step with Little's law (items in system = arrival rate × time in system)"
    ],
    "notFor": "Services with lots of abandonment, several skills or chat concurrency; simulate those instead.",
    "steps": [
      "Choose the model: staffing (Erlang C), single server (M/M/1) or Little's law.",
      "Enter arrivals per interval and average handling time.",
      "Set the service-level target and shrinkage.",
      "Read the agents needed, the chance of waiting, speed of answer and occupancy.",
      "Run it for each busy interval; the model gives long-run averages."
    ],
    "example": "A support line gets 100 calls in 30 minutes with 180 seconds handling time. With 11 agents, 68% of callers would wait; meeting 80% answered within 20 seconds needs 14 agents on the phones, before adding shrinkage for breaks and training.",
    "learn": "Queues grow slowly at first and then very quickly as staff approach full use. Adding one agent near capacity can cut waits dramatically. Little's law links how many are waiting, how fast they arrive and how long they stay.",
    "deeper": "Erlang C assumes random arrivals, no abandonment and agents who handle every contact type; the tool computes it through the Erlang B recursion and checks it against pyworkforce and a published worked example. M/M/1 assumes one server with exponential service. Little's law holds for any stable system (Little 1961).",
    "mistakes": [
      "Staffing to the daily average instead of the busiest intervals.",
      "Forgetting shrinkage.",
      "Using Erlang C when many people hang up."
    ],
    "next": [
      "ux-roi",
      "journey-forecast",
      "decision-tree"
    ]
  },
  "test-selector": {
    "question": "Which statistical test should I use for my study and data?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "task-success",
      "task-time",
      "ratings",
      "ab-test"
    ],
    "studies": [
      "Usability test",
      "A/B test",
      "Survey",
      "Benchmark study"
    ],
    "needs": "Knowing your goal, the type of outcome you measure, how many groups you compare, whether the same people saw each design, and roughly your sample size.",
    "when": [
      "Planning analysis before collecting data",
      "When you have data and are unsure which calculator to open",
      "Checking that a colleague's chosen test fits the design"
    ],
    "notFor": "Mixed designs with several factors, clustered or multilevel data; get a statistician involved before collecting data for those.",
    "steps": [
      "Pick what you want to find out.",
      "Say what kind of outcome you measure (yes/no, numeric, rating, count, category).",
      "Answer the design questions: groups, same or different people, sample size, shape.",
      "Read the recommended test, the reasons and alternatives.",
      "Follow the link to the calculator that runs it, and choose the test before seeing results."
    ],
    "example": "A researcher compares task times between two designs with 12 different people per design, and the times are skewed. The selector recommends Welch's t-test on log times or a permutation test, and links to the calculator to run it.",
    "learn": "The right test depends on what you ask and what you measured. Yes/no outcomes, times, ratings and counts each behave differently, and the same people seeing both designs changes the maths. Choosing the test first protects you from picking the one that gives the answer you hoped for.",
    "deeper": "Rules follow Sauro and Lewis (2016, Quantifying the User Experience, ch. 5 to 10) and standard textbooks: paired designs use within-person tests, skewed small samples use logs, ranks or resampling, and counts use Poisson or negative binomial models. Every recommendation links to a real calculator on the site.",
    "mistakes": [
      "Choosing a test after looking at results.",
      "Answering 'different people' when the same people saw both designs.",
      "Using it for designs with several factors or nested data."
    ],
    "next": [
      "distribution-check",
      "sample-size",
      "compare-means"
    ]
  },
  "regression": {
    "question": "Which factors go with this outcome, holding the others constant?",
    "stages": [
      "analyse"
    ],
    "data": [
      "survey",
      "ratings",
      "analytics"
    ],
    "studies": [
      "Survey analysis",
      "Product analytics study",
      "Benchmark study"
    ],
    "needs": "A table with one row per person: an outcome column and one or more predictor columns (numbers or categories). Roughly 10 to 20 people per predictor.",
    "when": [
      "Explaining satisfaction from several experience ratings and user traits",
      "Predicting a yes/no outcome such as renewal (logistic)",
      "Modelling a rating item (ordinal) or counts such as support tickets (Poisson or negative binomial)"
    ],
    "notFor": "Proving cause: coefficients are associations adjusted only for the predictors you include; for 'how much each driver matters' see [Key driver analysis](/calculators/key-drivers).",
    "steps": [
      "Pick the model to suit the outcome: linear, logistic, ordinal, Poisson or negative binomial.",
      "Paste the table, choose the outcome and predictors, and set reference levels for categories.",
      "Read coefficients (or odds or rate ratios) with intervals.",
      "Check diagnostics: residual and QQ plots, VIF and Cook's distance.",
      "Report effects with intervals, not just p-values."
    ],
    "example": "In a survey of 300 users, a logistic regression of renewal on onboarding rating, plan and tenure gives an odds ratio of about 1.4 per point of onboarding rating, with an interval above 1, after accounting for plan and tenure.",
    "learn": "Regression estimates how the outcome changes when one predictor changes and the others stay the same. Different outcomes need different types: linear for continuous scores, logistic for yes/no, ordinal for a single rating item, and count models for counts.",
    "deeper": "Linear regression uses ordinary least squares with standardised betas and diagnostics (leverage, Cook's D, VIF, Breusch-Pagan, Durbin-Watson). Logistic, ordinal (proportional odds) and count models are fitted by maximum likelihood; every number is checked against statsmodels. Overdispersed counts need negative binomial rather than Poisson.",
    "mistakes": [
      "Reading coefficients as causal effects.",
      "Using linear regression for yes/no or single rating items.",
      "Using too many predictors for the sample.",
      "Picking predictors by stepwise selection on the data you report."
    ],
    "next": [
      "key-drivers",
      "mediation",
      "correlation"
    ]
  },
  "mediation": {
    "question": "Why does this effect happen, and for whom is it stronger?",
    "stages": [
      "analyse"
    ],
    "data": [
      "survey",
      "ratings",
      "ab-test"
    ],
    "studies": [
      "Experiment with a follow-up survey",
      "Survey analysis",
      "A/B test"
    ],
    "needs": "A table with one row per person: X (the condition or predictor), Y (the outcome), and either a moderator W or a mediator M, plus optional covariates.",
    "when": [
      "Checking whether a new design raises purchases because it raises trust (mediation)",
      "Testing whether a change helps novices more than experts (moderation)",
      "Exploring how an effect varies along a continuous user trait"
    ],
    "notFor": "Data where the causal order is unclear, such as X, M and Y all from one survey; with several mediators use structural equation modelling.",
    "steps": [
      "Choose the question: moderation (for whom) or mediation (through what).",
      "Paste the table and pick X, Y and W or M.",
      "For moderation, read the interaction and the simple slopes and Johnson-Neyman region.",
      "For mediation, read paths a, b, the direct effect and the indirect effect's bootstrap interval.",
      "State the causal assumptions in your report."
    ],
    "example": "In an experiment with 240 participants, a redesigned checkout raised purchase intent. The indirect effect through perceived trust had a bootstrap interval that excluded 0, while the direct effect was small, suggesting much of the effect runs through trust.",
    "learn": "Moderation asks whether an effect is bigger for some people or situations. Mediation asks whether it travels through a middle step. Both are only as convincing as the order of events: X must come before M, which must come before Y.",
    "deeper": "These are Hayes's PROCESS models 1 and 4, fitted by OLS. Simple slopes are probed at the mean ± 1 SD or percentiles, and Johnson-Neyman points show where the effect becomes significant. The indirect effect a·b gets a percentile or bias-corrected bootstrap interval because it is rarely normal (Hayes 2018); results are checked against statsmodels and pingouin.",
    "mistakes": [
      "Claiming mediation from one cross-sectional survey.",
      "Relying on the Sobel test instead of the bootstrap interval.",
      "Testing moderation with fewer than about 100 people and concluding 'no difference'."
    ],
    "next": [
      "regression",
      "factorial-designs",
      "e-value"
    ]
  },
  "resampling": {
    "question": "How can I get an interval or p-value without assuming my data are normal?",
    "stages": [
      "analyse"
    ],
    "data": [
      "task-time",
      "ratings",
      "ab-test"
    ],
    "studies": [
      "Usability test",
      "Benchmark study",
      "A/B test",
      "Survey analysis"
    ],
    "needs": "One or two groups of values (such as task times or scores per person), or pairs of values for a correlation, with one value per person.",
    "when": [
      "Getting an interval for a median task time",
      "Comparing two small groups with skewed data",
      "Testing a correlation or difference without normality assumptions"
    ],
    "notFor": "Tiny samples (fewer than about 10 to 15 per group) or several values per person; for equivalence use the [A/B test health checks](/calculators/ab-health).",
    "steps": [
      "Pick bootstrap interval or permutation test.",
      "Choose the statistic: mean, median, difference, correlation or proportion.",
      "Paste the values, one per person.",
      "Read the interval (percentile or BCa) or the p-value, with the distribution plot.",
      "Report the method and the number of resamples."
    ],
    "example": "Two designs were tested with 15 people each and task times were skewed. A bootstrap BCa interval for the difference in medians ran from about 8 to 41 seconds faster for the new design, and a permutation test agreed the difference was unlikely to be chance.",
    "learn": "The bootstrap reuses your sample to see how much a statistic would vary from sample to sample. A permutation test shuffles group labels to see how big a difference chance alone produces. Neither assumes a bell-shaped distribution.",
    "deeper": "BCa intervals adjust for bias and skew (Efron 1987) and follow scipy.stats.bootstrap exactly. Permutation tests are exact when all arrangements can be listed, otherwise Monte Carlo with p = (k + 1)/(B + 1). A two-group permutation test assumes the groups share a shape under the null, so a difference in spread alone can make it significant.",
    "mistakes": [
      "Using it to rescue a very small sample.",
      "Treating several tasks per person as independent values.",
      "Bootstrapping minimums or maximums."
    ],
    "next": [
      "distribution-check",
      "compare-means",
      "nonparametric"
    ]
  },
  "distribution-check": {
    "question": "Are my data skewed or full of outliers, and what should I do about it?",
    "stages": [
      "analyse"
    ],
    "data": [
      "task-time",
      "ratings",
      "analytics"
    ],
    "studies": [
      "Usability test",
      "Benchmark study",
      "Survey analysis"
    ],
    "needs": "A single column of numeric values, such as task times, scores or counts.",
    "when": [
      "Before choosing between a t-test and a rank or resampling test",
      "Checking whether task times are skewed and whether logs help",
      "Getting a geometric mean as the typical task time"
    ],
    "notFor": "A pass/fail gate before every test; normality tests miss skew in small samples and flag trivial bumps in large ones.",
    "steps": [
      "Paste the values.",
      "Look at the histogram, density and QQ plot first.",
      "Read skewness, kurtosis and the normality tests as supporting evidence.",
      "For task times, check the log-normal fit and the geometric mean.",
      "Use the ladder of powers to find a transformation if needed."
    ],
    "example": "Task times for 18 participants were right-skewed, with two people taking over four minutes. On the log scale the QQ plot was close to a straight line, so the team reported a geometric mean of 72 seconds with its interval instead of the arithmetic mean.",
    "learn": "Many tests assume roughly symmetric data. Task times usually have a long right tail. Plots tell you more than a single test, and a log transformation often makes task times well behaved.",
    "deeper": "Shapiro-Wilk uses Royston's (1995) algorithm; Anderson-Darling and Lilliefors follow standard corrections. The geometric mean is recommended as the typical task time for samples under about 25 (Sauro and Lewis 2016). The ladder of powers follows Tukey (1977), with Box-Cox λ; everything is checked against scipy and statsmodels.",
    "mistakes": [
      "Treating a non-significant normality test as proof of normality.",
      "Removing outliers just because they fall outside the fences.",
      "Reporting the arithmetic mean of skewed task times."
    ],
    "next": [
      "task-time",
      "resampling",
      "test-selector"
    ]
  },
  "survival": {
    "question": "How long until people adopt, abandon or churn, including those still waiting?",
    "stages": [
      "analyse"
    ],
    "data": [
      "analytics"
    ],
    "studies": [
      "Feature adoption study",
      "Churn analysis",
      "Diary or longitudinal study"
    ],
    "needs": "One row per person or account: the time observed, whether the event happened (or the person was censored, still without the event when tracking stopped), and an optional group.",
    "when": [
      "Measuring time to first use of a new feature",
      "Comparing churn between onboarding versions",
      "When some people have not yet had the event by the end of the study"
    ],
    "notFor": "Several predictors at once (use a Cox model) or competing events.",
    "steps": [
      "Define the event and the start time clearly.",
      "Paste the table and choose the time, event and group columns.",
      "Read the Kaplan-Meier curves with intervals and the median time.",
      "Compare groups with the log-rank test.",
      "If the median is not reached, report restricted mean time up to a cut-off."
    ],
    "example": "Of 400 new accounts, those with guided onboarding reached their first report with a median of 9 days, while for the old flow fewer than half had done so by day 30 (median not reached). The log-rank test showed the curves differed clearly.",
    "learn": "Some people have not had the event when you stop watching. Leaving them out or treating their time as the event time both bias results. Kaplan-Meier uses them correctly, counting them as 'still at risk' until they leave the data.",
    "deeper": "Kaplan-Meier multiplies the share surviving each event time, with Greenwood's variance and a log(−log) interval. The log-rank test compares observed and expected events per group, with Holm-corrected pairwise tests. Nelson-Aalen cumulative hazard and restricted mean survival time are also shown; values match lifelines.",
    "mistakes": [
      "Averaging observed times while ignoring censoring.",
      "Assuming censoring is unrelated to the outcome when people stop being tracked because they are about to churn.",
      "Calling the median 'not reached' a failure; report restricted mean time instead."
    ],
    "next": [
      "retention-funnel",
      "sir-adoption",
      "regression"
    ]
  },
  "counterbalancing": {
    "question": "In what order should each participant see the designs so order effects cancel?",
    "stages": [
      "plan"
    ],
    "data": [
      "design-specs"
    ],
    "studies": [
      "Within-subjects usability test",
      "Design bake-off",
      "Lab experiment"
    ],
    "needs": "The list of conditions (2 to 12 designs or tasks) and the number of participants you plan to run.",
    "when": [
      "Planning a test where every participant tries several designs",
      "When practice or fatigue could favour whatever comes first or last",
      "When you need an assignment table to hand to moderators"
    ],
    "notFor": "Studies where doing one condition changes the next for good (people learn the answer); use a between-subjects design instead.",
    "steps": [
      "List the conditions.",
      "Choose a design: Williams (balances what follows what), Latin square or all orders.",
      "Optionally shuffle with a seed.",
      "Enter the number of participants and export the assignment table as CSV.",
      "Recruit in complete blocks and check the balance table at the end."
    ],
    "example": "With four prototypes (A to D), a Williams design gives four orders: ABDC, BCAD, CDBA and DACB. Running 12 participants gives three complete blocks, so each prototype appears three times in each position and follows each other prototype equally often.",
    "learn": "When the same people try several designs, earlier ones can affect later ones through practice, fatigue or comparison. Counterbalancing varies the order so these effects are spread evenly across designs instead of favouring one.",
    "deeper": "A cyclic Latin square balances position only. A Williams design (Williams 1949) also balances first-order carryover; for odd numbers of conditions it needs a square plus its mirror image (2k orders). All orders balance everything but need k! participants per block. Counterbalancing assumes carryover is symmetric.",
    "mistakes": [
      "Running incomplete blocks, which breaks the balance.",
      "Using a plain Latin square when carryover matters.",
      "Counterbalancing tasks that teach people the answer."
    ],
    "next": [
      "sample-size",
      "compare-means",
      "multi-compare"
    ]
  },
  "value-of-information": {
    "question": "Is it worth running this research before we decide, and how big should it be?",
    "stages": [
      "plan",
      "decide"
    ],
    "data": [
      "estimates"
    ],
    "studies": [
      "Research planning",
      "Business case",
      "Go/no-go decision"
    ],
    "needs": "The options you are choosing between, your best guess and a 90% range for each option's key metric, the value of one unit of that metric and the cost of research; or a payoff table by scenario with how accurate the study would be.",
    "when": [
      "Arguing for or against a study before a big decision",
      "Choosing how many participants a study needs from a business point of view",
      "When the decision is genuinely open and outcomes can be put in money or another common unit"
    ],
    "notFor": "Decisions already made, or outcomes you cannot express in one common unit.",
    "steps": [
      "List the options and the metric that decides between them.",
      "Give a best guess and a 90% low-high range for each, ideally from several people.",
      "Set the value per unit and the study costs.",
      "Read EVPI (the most any research could be worth) and EVSI against participants.",
      "Run the study only if EVSI exceeds its cost; use the best sample size shown."
    ],
    "example": "Two pricing page designs are expected to differ by £10,000 a year in favour of A, but the team's uncertainty about the difference has a spread (SD) of £30,000. Perfect information would be worth about £7,600, so a £20,000 study cannot pay off, while a cheap unmoderated test might.",
    "learn": "Research is valuable only if it might change what you do. If one option is clearly best, or the stakes are small, more research is not worth much. Value of information puts a price on reducing uncertainty before a decision.",
    "deeper": "EVPI is the expected value of choosing with perfect knowledge minus the value of choosing now; EVSI does the same with a study's noisy result (Raiffa and Schlaifer 1961; Howard 1966). The normal model uses the unit normal loss integral for two options and Monte Carlo for three or more; the scenario model applies Bayes' rule, checked against Hillier and Lieberman's Goferbroke example.",
    "mistakes": [
      "Setting prior ranges after seeing results.",
      "Using it for decisions that will be made on other grounds anyway.",
      "Giving ranges that are too narrow, which undervalues research."
    ],
    "next": [
      "decision-tree",
      "sample-size",
      "ux-roi"
    ]
  },
  "decision-tree": {
    "question": "Which choice gives the best expected outcome, and which assumptions matter most?",
    "stages": [
      "decide"
    ],
    "data": [
      "estimates"
    ],
    "studies": [
      "Business case",
      "Roadmap decision",
      "Risk assessment"
    ],
    "needs": "A written outline of the decision: the choices, the chance events that follow, their probabilities, and the payoff or cost of each path. Optional parameters with low and high values for sensitivity analysis.",
    "when": [
      "Deciding whether to test first, launch now or drop an idea",
      "Laying out a decision with uncertain outcomes for stakeholders",
      "Finding which estimate would change the decision if it were wrong"
    ],
    "notFor": "Decisions that repeat over time with feedback, or outcomes that cannot be put on one scale.",
    "steps": [
      "Write the tree outline, indenting two spaces per level.",
      "Add probabilities to chance branches (use p=rest for the last one) and payoffs or costs.",
      "Define parameters with ranges for uncertain inputs.",
      "Read the expected values, best policy and risk profile.",
      "Use the tornado chart and break-even values to see what matters."
    ],
    "example": "A team weighs launching a redesign now against running a usability test first. The rollback shows testing first has the higher expected value, and the tornado chart shows the decision hinges on the chance the redesign has a serious problem: below about 15%, launching now wins.",
    "learn": "A decision tree maps choices and chance. Rolling back multiplies outcomes by probabilities to get expected values and picks the best branch at each decision. Sensitivity analysis shows which uncertain inputs could change the answer.",
    "deeper": "Rollback follows Raiffa (1968) and Hunink et al. (Decision Making in Health and Medicine), checked against Hillier and Lieberman's Goferbroke example. The tornado varies one parameter at a time; break-even values are found by scanning and bisecting. Expected value ignores risk attitude.",
    "mistakes": [
      "Probabilities under a chance node that do not add to 1.",
      "Treating guessed probabilities as facts without sensitivity analysis.",
      "Ignoring a small chance of a very bad outcome because the expected value looks fine."
    ],
    "next": [
      "value-of-information",
      "decision-matrix",
      "ux-roi"
    ]
  },
  "forecast-calibration": {
    "question": "When our team says '70% likely', does it happen about 70% of the time?",
    "stages": [
      "decide"
    ],
    "data": [
      "estimates"
    ],
    "studies": [
      "Team forecasting exercise",
      "Research retrospective",
      "Calibration training"
    ],
    "needs": "A list of probability forecasts for yes/no events that have since been resolved, each with its outcome and optionally the forecaster; or answers to the built-in 90% interval quiz.",
    "when": [
      "Reviewing how well a team predicted A/B test winners or launch outcomes",
      "Training researchers and stakeholders to notice overconfidence",
      "Comparing forecasters on the same questions"
    ],
    "notFor": "Vague questions that cannot be resolved as yes or no, such as 'will users like it?'.",
    "steps": [
      "Collect forecasts as probabilities before outcomes are known.",
      "Record each outcome (1 happened, 0 did not) once resolved.",
      "Paste them and read the Brier score, its decomposition and the calibration curve.",
      "Or take the quiz: give 90% ranges and see how many contain the true value.",
      "Discuss where forecasts were too confident and adjust."
    ],
    "example": "On the built-in quiz, a researcher's 90% intervals contained the true value only 5 times out of 10. If the intervals were really 90% wide, a result that low would be very unlikely (p ≈ 0.002), a classic sign of overconfidence.",
    "learn": "Good forecasters are calibrated: things they call 70% likely happen about 70% of the time. The Brier score measures the error of probability forecasts, where 0 is perfect and always saying 50% scores 0.25. Most people's 90% ranges are far too narrow.",
    "deeper": "The Brier score (Brier 1950) splits into reliability, resolution and uncertainty (Murphy 1973), with a small within-bin term shown when forecasts in a bin differ. The calibration curve uses Wilson intervals. The interval exercise follows Alpert and Raiffa (1982) with an exact binomial test for overconfidence.",
    "mistakes": [
      "Scoring forecasts written after the outcome was known.",
      "Comparing forecasters on different questions.",
      "Judging calibration at each level from only a few dozen forecasts."
    ],
    "next": [
      "decision-tree",
      "value-of-information",
      "bayes-ab"
    ]
  },
  "use-fmea": {
    "question": "Which use errors are riskiest, and what should we fix first?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "qual",
      "estimates"
    ],
    "studies": [
      "Use-related risk analysis",
      "Medical device usability engineering",
      "Safety-critical design review"
    ],
    "needs": "A list of task steps and possible use errors, with their effects and causes, rated by the team for severity, occurrence and detection on 1 to 10 scales; optionally ratings after the planned action.",
    "when": [
      "Preparing a use-related risk analysis for a medical device or safety-critical product",
      "Prioritising fixes after a usability study found many errors",
      "Showing how much a design change reduces risk"
    ],
    "notFor": "Combinations of failures or problems arising from system interactions; use a [fault tree](/calculators/fault-tree) for those.",
    "steps": [
      "Agree written anchors for each rating level with the team.",
      "List task steps, use errors, effects, causes and current controls.",
      "Rate severity, occurrence and detection for each.",
      "Read the list sorted by action priority, with RPN only breaking ties.",
      "Add recommended actions and expected ratings after, then export to CSV."
    ],
    "example": "Rating an insulin pen's use errors, 'dial set to wrong dose' scored S 9, O 4, D 7, which is High action priority. 'Cap left off' had a similar RPN but scored Low priority because its severity was low, so the team fixed the dose display first.",
    "learn": "FMEA works through each possible failure, asks how bad, how likely and how hard to catch it is, and ranks them. Severity should dominate: a rare but catastrophic error deserves more attention than a common annoyance.",
    "deeper": "RPN = S × O × D is traditional but multiplies ordinal ratings and can hide severe failures behind low occurrence. Action priority follows the AIAG & VDA FMEA Handbook (2019) table, which looks up severity first. For medical devices it supports but does not replace the IEC 62366-1 process.",
    "mistakes": [
      "Ranking by RPN alone.",
      "Rating without agreed anchors.",
      "Lowering severity after a design change when only occurrence or detection really changed."
    ],
    "next": [
      "fault-tree",
      "human-error",
      "severity-ratings"
    ]
  },
  "severity-ratings": {
    "question": "How severe is each problem when several evaluators rate it, and do they agree?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "qual",
      "ratings"
    ],
    "studies": [
      "Heuristic evaluation",
      "Expert review",
      "Usability test debrief"
    ],
    "needs": "A merged problem list rated by each evaluator, on Nielsen's 0 to 4 scale or impact, frequency and persistence (1 to 5 each); optionally a found/missed matrix showing which evaluator found each problem.",
    "when": [
      "After a heuristic evaluation with three or more evaluators",
      "Prioritising usability problems for a report",
      "Deciding how many evaluators a future review needs"
    ],
    "notFor": "Agreement on category codes; use [Inter-coder agreement](/calculators/intercoder).",
    "steps": [
      "Merge all evaluators' problems into one list.",
      "Have each evaluator rate every problem independently.",
      "Paste the ratings and read the mean severity, flagged disagreements and agreement statistics.",
      "Discuss flagged problems.",
      "Paste the found/missed matrix to see how many evaluators are enough."
    ],
    "example": "Four evaluators rated 22 problems on the 0 to 4 scale. Krippendorff's alpha was about 0.7, above the 0.667 level for tentative conclusions, and three problems were flagged because ratings differed by 2 or more. With λ = 0.31, five evaluators would find about 84% of known problems.",
    "learn": "One evaluator's severity ratings are unreliable, so average at least three. Agreement statistics show whether evaluators see severity the same way. The evaluator curve shows how adding evaluators finds more problems, with diminishing returns.",
    "deeper": "Nielsen (1994) recommended averaging at least three evaluators. Agreement uses ordinal Krippendorff's alpha (Krippendorff 2011) and ICC(2,1) and ICC(2,k) (Shrout and Fleiss 1979). The coverage model 1 − (1 − λ)^i follows Nielsen and Landauer (1993), with Lewis's (2001) adjustment for small samples.",
    "mistakes": [
      "Relying on one evaluator's ratings.",
      "Computing agreement with fewer than ten problems or all ratings the same.",
      "Assuming the curve shows coverage of all problems; it counts only those someone found."
    ],
    "next": [
      "discovery",
      "capture-recapture",
      "use-fmea"
    ]
  },
  "human-error": {
    "question": "How likely is a person to get this task step wrong, and what drives it?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "design-specs",
      "estimates"
    ],
    "studies": [
      "Safety-critical task analysis",
      "Medical device risk analysis",
      "Control room or operations review"
    ],
    "needs": "A task step to assess, its generic task type (HEART) or whether it involves diagnosis or action (SPAR-H), and judgements about which conditions apply and how strongly.",
    "when": [
      "Estimating error likelihood in a high-hazard task",
      "Comparing design options by how much they reduce error-producing conditions",
      "Finding which condition (time pressure, poor feedback) matters most"
    ],
    "notFor": "Absolute error rates for consumer interfaces; use it comparatively and validate predictions in usability testing.",
    "steps": [
      "Break the task into steps with a task analysis.",
      "Choose HEART or SPAR-H.",
      "Pick the task type or nominal rate and the conditions or shaping factors that apply.",
      "Judge the proportion of effect for each condition.",
      "Read the error probability and the chart of which condition matters most; compare design options."
    ],
    "example": "In the published HEART worked example, a task of type F (nominal 0.003) with five error-producing conditions, including an opposite technique and inexperience, reaches an error probability of about 0.27. Removing the opposite-technique condition alone cuts it sharply, showing where design should focus.",
    "learn": "Human reliability methods start from a typical error rate for the kind of task, then raise it for each condition that makes errors more likely. The output is best used to compare designs and find the conditions to remove.",
    "deeper": "HEART (Williams 1986, 1988) multiplies a nominal rate by assessed effects of error-producing conditions. SPAR-H (NUREG/CR-6883) multiplies nominal rates for diagnosis and action by eight performance shaping factors, with an adjustment when three or more are negative, and THERP dependence equations. Both were developed for trained operators in high-hazard industries.",
    "mistakes": [
      "Treating outputs as precise absolute probabilities.",
      "Applying many conditions with full effect without justification.",
      "Skipping validation with real users."
    ],
    "next": [
      "use-fmea",
      "fault-tree",
      "hta"
    ]
  },
  "colour-contrast": {
    "question": "Is this text and background colour pair readable and does it meet WCAG?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "design-specs"
    ],
    "studies": [
      "Accessibility review",
      "Design system audit",
      "Visual design QA"
    ],
    "needs": "A text (foreground) colour and a background colour as hex values, or a palette of up to 12 colours to check every pair.",
    "when": [
      "Checking text, buttons and icons against WCAG AA or AAA",
      "Auditing a design system palette",
      "Finding the nearest passing colour when a brand colour fails"
    ],
    "notFor": "Text on images, gradients or semi-transparent layers without measuring the worst point; it also does not check colour vision deficiencies.",
    "steps": [
      "Enter the text and background colours.",
      "Read the WCAG 2 contrast ratio against AA and AAA for normal and large text and UI components.",
      "Read the APCA Lc and its guidance.",
      "If it fails, try the suggested nearest passing colour.",
      "For a palette, paste it and use the matrix."
    ],
    "example": "Grey #777777 on white gives 4.48:1, which fails AA for normal text (4.5:1). Darkening it to #767676 gives 4.54:1, which passes, with almost no visible change.",
    "learn": "Contrast ratio compares the brightness of two colours, from 1:1 (same) to 21:1 (black on white). WCAG sets minimum ratios by text size. APCA is a newer measure that better reflects how people perceive contrast, especially for light text on dark backgrounds.",
    "deeper": "WCAG 2 contrast uses relative luminance from linearised sRGB, without rounding before comparing. APCA follows APCA-W3 0.1.9. CIEDE2000 colour difference follows Sharma, Wu and Dalal (2005), where ΔE near 1 is about one just-noticeable difference; the nearest passing colour keeps hue and changes lightness.",
    "mistakes": [
      "Rounding 4.48:1 up to a pass.",
      "Checking only text and not UI components or icons (3:1).",
      "Assuming passing contrast covers colour vision deficiencies."
    ],
    "next": [
      "weber-jnd",
      "readability",
      "ergonomics"
    ]
  },
  "ia-graph": {
    "question": "How deep and well connected is our site structure, and where are the dead ends?",
    "stages": [
      "analyse"
    ],
    "data": [
      "navigation",
      "design-specs"
    ],
    "studies": [
      "IA audit",
      "Sitemap review",
      "Navigation redesign",
      "Screen flow review"
    ],
    "needs": "A sitemap with children indented under parents, and optionally extra links as 'From -> To' lines, plus which page is home.",
    "when": [
      "Auditing how many clicks key pages are from home",
      "Finding orphan pages, dead ends and unreachable pages",
      "Spotting bottleneck pages that many paths go through"
    ],
    "notFor": "Measuring usability on its own: the graph shows what is possible, not what people do; pair it with a [tree test](/calculators/tree-test).",
    "steps": [
      "Paste the sitemap and any cross-links, and set the home page.",
      "Choose whether children link back to parents and every page links home.",
      "Read click depth, breadth per level, orphans and dead ends.",
      "Sort pages by betweenness, closeness or PageRank to find key hubs.",
      "Compare a proposed structure with the current one."
    ],
    "example": "A help centre with 140 pages had a maximum click depth of 6 from home, and 9 pages were unreachable because they were linked only from retired pages. One 'Account' page had the highest betweenness, so most paths depended on its labels.",
    "learn": "A site can be seen as a network of pages linked to each other. Click depth shows how far pages are from home; centrality measures show which pages hold the structure together. Problems like orphans and dead ends show up immediately.",
    "deeper": "Depth uses breadth-first shortest paths; betweenness follows Freeman (1977) and Brandes (2001); PageRank follows Brin and Page (1998) with damping 0.85; space-syntax integration follows Hillier and Hanson (1984). Values are checked against networkx. Include global navigation and search before judging depth.",
    "mistakes": [
      "Judging depth without including global navigation and search.",
      "Treating a shallow structure as proof that labels are clear.",
      "Forgetting cross-links, which makes the site look deeper than it is."
    ],
    "next": [
      "tree-test",
      "card-sort",
      "lostness"
    ]
  },
  "iat-dscore": {
    "question": "Do people implicitly link my brand or concept with one idea more than another?",
    "stages": [
      "analyse"
    ],
    "data": [
      "physiology"
    ],
    "studies": [
      "Implicit Association Test",
      "Brand perception study",
      "Implicit vs explicit attitude comparison"
    ],
    "needs": "Trial-level data from a standard 7-block IAT: participant, block, trial, response time in milliseconds and whether the first response was an error. Most IAT software (Inquisit, PsyToolkit, jsPsych) exports this.",
    "when": [
      "After running an IAT with 30 or more participants and you need the standard D-score for each person and the group",
      "When you want to compare what people say in a survey with what their reaction times suggest",
      "When a reviewer asks whether your IAT scores are reliable enough to interpret"
    ],
    "notFor": "Diagnosing one individual: single IAT scores are noisy. For plain response-time comparisons use [Reaction-time analysis](/calculators/reaction-time).",
    "steps": [
      "Run a standard 7-block IAT and counterbalance which pairing comes first across participants.",
      "Export trial data with participant, block, trial, latency in ms and an error flag.",
      "Paste it in and choose how error trials were handled (corrected on screen, or replaced with a penalty).",
      "Check the participant table for people excluded for too many very fast responses.",
      "Read the mean D with its interval and the split-half reliability before drawing conclusions."
    ],
    "example": "Forty participants paired \"our app\" and \"rival app\" with \"trustworthy\" and \"risky\". The mean D is 0.32 with a 95% interval of 0.20 to 0.44, a \"slight\" association favouring our app, and split-half reliability is 0.71, so the group result is usable even though single scores are not.",
    "learn": "The IAT measures how much faster people sort words when two concepts share a response key. D is that speed difference divided by each person's own variability, so fast and slow responders can be compared. Positive and negative D show which pairing was easier; bands of 0.15, 0.35 and 0.65 mark slight, moderate and strong associations.",
    "deeper": "The tool follows the improved D algorithm of Greenwald, Nosek and Banaji (2003): it uses blocks 3, 4, 6 and 7, drops trials over 10 s, excludes people with more than 10% of trials under 300 ms and divides block differences by inclusive SDs. Reliability is split-half (odd vs even trials) stepped up with Spearman-Brown. Order of the pairings can bias D, which is why counterbalancing matters.",
    "mistakes": [
      "Reading one person's D as a diagnosis of their attitude.",
      "Always presenting the same pairing first, so order effects mix into D.",
      "Ignoring participants flagged for many errors or very fast responses.",
      "Treating an implicit association as proof of future behaviour."
    ],
    "next": [
      "reaction-time",
      "correlation",
      "effect-size"
    ]
  },
  "mouse-tracking": {
    "question": "Did people hesitate between options, judging by how their cursor curved?",
    "stages": [
      "analyse"
    ],
    "data": [
      "physiology"
    ],
    "studies": [
      "Choice experiment with mouse tracking",
      "Decision conflict study",
      "Label or wording comparison"
    ],
    "needs": "Cursor samples with participant, trial, condition, time, x and y, one row per sample. Tools such as MouseTracker, jsPsych or a custom logger produce them.",
    "when": [
      "When participants chose between two on-screen options and you logged the cursor path",
      "When you want to show that one wording or layout caused more doubt than another, beyond response time",
      "When you suspect some trials contain changes of mind"
    ],
    "notFor": "Touch screens, very low sampling rates or layouts that differ between conditions. For response times alone use [Reaction-time analysis](/calculators/reaction-time).",
    "steps": [
      "Design trials where the cursor starts in the same place and the two options sit in the top corners.",
      "Log x, y and time stamps for every trial and label each trial with its condition.",
      "Paste the samples; the tool aligns, flips and mirrors every path so they can be compared.",
      "Compare area under the curve (AUC) and maximum deviation between conditions.",
      "Check the bimodality coefficient to see whether a few trials with a change of mind drive the result."
    ],
    "example": "In a consent screen study, 30 participants chose \"Accept\" or \"Decline\" under neutral and nudging wording. Mean AUC was 0.42 with nudging and 0.18 with neutral wording (paired t test, p = 0.003), so people were drawn towards the other button more often under the nudge. The bimodality coefficient was 0.48, below 0.555, so the effect looks like general pull rather than a few changes of mind.",
    "learn": "When people are torn between two options, their cursor curves towards the one they did not choose. The more it curves, the stronger the pull. Area under the curve and maximum deviation measure that curve against a straight line from start to finish.",
    "deeper": "Preparation follows the mousetrap package (Kieslich et al. 2019): paths are moved to start at (0, 0), flipped and mirrored. AUC follows Freeman and Ambady (2010), and paths are time-normalised to 101 steps for averaging. The bimodality coefficient (Freeman and Dale 2013; Pfister et al. 2013) above 0.555 hints at a mix of straight trials and changes of mind. Comparisons are paired t tests on participant means when a participant column is given.",
    "mistakes": [
      "Letting people start moving before the options are visible.",
      "Comparing curvature across different screen layouts or devices.",
      "Analysing trials instead of participant means when the same people did every condition."
    ],
    "next": [
      "reaction-time",
      "compare-means",
      "iat-dscore"
    ]
  },
  "correspondence-analysis": {
    "question": "Which brands go with which attributes, shown as a map?",
    "stages": [
      "analyse"
    ],
    "data": [
      "survey",
      "choices"
    ],
    "studies": [
      "Brand perception survey",
      "Competitive positioning study",
      "Persona or segment profiling"
    ],
    "needs": "A table of counts, such as how many respondents ticked each attribute for each brand. Rows and columns have labels; cells are counts, not ratings.",
    "when": [
      "After a \"which of these words describe each brand?\" survey question",
      "When a crosstab is too big to read and you want to see the main patterns at a glance",
      "When you want to show stakeholders where competitors sit relative to your product"
    ],
    "notFor": "Ratings or times rather than counts, or testing whether an association is real. For the test use the [Crosstab explorer](/calculators/crosstab).",
    "steps": [
      "Collect pick-any or choose-one answers that can be counted for every row and column pair.",
      "Build the count table: brands as rows, attributes as columns.",
      "Paste it and look at how much inertia (variation) the first two dimensions explain.",
      "Read the symmetric map: rows close together have similar profiles; a row and column in the same direction from the centre go together.",
      "Check contributions and cos² before naming an axis or a point's position."
    ],
    "example": "Five banking apps were rated by 400 people on eight words. The first two dimensions hold 84% of the inertia. Our app sits in the same direction as \"simple\" and \"friendly\", while two rivals sit towards \"secure\" and \"professional\", which suggests a positioning gap to explore in interviews.",
    "learn": "Correspondence analysis turns a count table into a picture. Brands that people describe in similar ways land near each other, and the axes show the biggest contrasts in how they are described. It describes patterns in your sample; it does not prove them.",
    "deeper": "The tool takes the singular value decomposition of the standardised residuals of the table (Benzécri 1973; Greenacre 2017). Principal inertias add up to χ²/n. Contributions show which points define an axis; cos² shows how well a point is represented on it. Distances between a row point and a column point have no exact meaning in the symmetric map; the asymmetric maps make row-column relations exact.",
    "mistakes": [
      "Reading the distance between a brand and an attribute as a precise measure.",
      "Interpreting a dimension that rests on one or two small counts.",
      "Feeding in mean ratings instead of counts."
    ],
    "next": [
      "crosstab",
      "cluster-personas",
      "factor-analysis"
    ]
  },
  "tolerance-intervals": {
    "question": "What range will most individual users fall in, not just the average?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "task-time",
      "task-success"
    ],
    "studies": [
      "Benchmark study",
      "Usability test",
      "Ergonomic or accessibility check"
    ],
    "needs": "A list of individual values, such as task times or reach distances, or the number of events in a set of trials when none or few occurred.",
    "when": [
      "When you need to say \"90% of users finish within X seconds\" with stated confidence",
      "When setting a timeout, a design limit or a service level that must suit most people",
      "When you saw zero failures in your sample and need an honest upper limit on the failure rate"
    ],
    "notFor": "Comparing two designs on average (use [Compare two means](/calculators/compare-means)) or a single mean's interval (use [Task time interval](/calculators/task-time)).",
    "steps": [
      "Collect one value per person, for example each participant's time on task.",
      "Choose the share of users to cover (such as 90%) and the confidence (such as 95%).",
      "Turn on the log scale for task times, which are usually skewed.",
      "Read the normal limits, and compare with the distribution-free limits if the data look odd.",
      "For zero events, enter the trials and read the exact upper limit (close to 3 ÷ n)."
    ],
    "example": "Twenty participants took a mean of 48 s (SD 12 s) to set up an alarm. With 90% coverage and 95% confidence the factor k is 2.31, so the limits run from about 20 s to 76 s: a timeout of 80 s should suit at least 90% of users. Separately, 0 of 30 people failed a checkout task; the exact 95% upper limit on the failure rate is 9.5%, close to the rule of three (3 ÷ 30 = 10%).",
    "learn": "A confidence interval for the mean tells you where the average user is. A tolerance interval tells you where most individual users are, which is what you need for limits and timeouts. It stays wide even with large samples, because people differ.",
    "deeper": "Two-sided normal factors use Howe (1969), Guenther (1977) or the exact Odeh and Owen (1980) method; one-sided factors use the noncentral t distribution. Distribution-free limits (Wilks 1941) use order statistics and need about 59 people (one-sided) or 93 (two-sided) for 95% coverage at 95% confidence. Zero-event limits are exact binomial (Hanley and Lippman-Hand 1983).",
    "mistakes": [
      "Using a confidence interval for the mean as if it covered most users.",
      "Applying normal limits to skewed task times without the log scale.",
      "Reporting 0% failure from a small sample instead of an upper limit."
    ],
    "next": [
      "task-time",
      "completion-rate",
      "ergonomics"
    ]
  },
  "diff-in-diff": {
    "question": "Did my change cause the shift, compared with a group that did not get it?",
    "stages": [
      "analyse"
    ],
    "data": [
      "analytics",
      "ab-test"
    ],
    "studies": [
      "Staged feature rollout",
      "Pre-post release comparison",
      "Pilot in some teams or regions"
    ],
    "needs": "Either the mean, SD and size of a metric for treated and comparison groups before and after the change, or panel data with one row per unit (such as a workspace) and period.",
    "when": [
      "When a feature went to some customers or regions first and you could not run an A/B test",
      "When a metric changed after a release and you need to separate the release from a general trend",
      "When you have several periods before the change and want to check the groups moved in parallel"
    ],
    "notFor": "Changes where the groups were already moving apart before the change, or units that adopted at different dates (use a staggered design; see [Control charts and change points](/calculators/control-charts) for a single series).",
    "steps": [
      "Pick a comparison group that did not get the change but is similar and exposed to the same seasons.",
      "Gather the metric for both groups before and after, ideally for several periods.",
      "Enter the 2×2 means or paste the panel and name the unit, period, treated and outcome columns.",
      "Check the event-study plot: pre-period coefficients should sit near zero.",
      "Report the DiD estimate with its interval and say how many units it rests on."
    ],
    "example": "A new report builder went to 40 workspaces; 40 others kept the old one. Average report time fell from 42 to 30 minutes in the treated group and from 41 to 37 minutes in the comparison group. The DiD estimate is −12 − (−4) = −8 minutes, so about 8 minutes of the drop can be credited to the new builder, provided the groups were on parallel paths beforehand.",
    "learn": "A simple before-after comparison mixes your change with everything else that happened at the same time. DiD subtracts the change seen in a comparison group, which stands in for \"what would have happened anyway\". The key assumption is that both groups would have moved in parallel without the change.",
    "deeper": "The 2×2 standard error equals the HC2 robust error of the interaction in OLS. In panel mode, standard errors are cluster-robust by unit (CR1), because repeated measurements of the same unit are correlated (Bertrand, Duflo and Mullainathan 2004). The event study and a pre-period slope test check parallel trends. With fewer than about 20 units, cluster-robust errors are too small, so p-values are optimistic. See [difference-in-differences](/methods/difference-in-differences-did).",
    "mistakes": [
      "Choosing a treated group because it was doing badly, so it would have bounced back anyway.",
      "Skipping the pre-trend check.",
      "Ignoring clustering and treating every row as independent.",
      "Using it when another change hit only one group at the same time."
    ],
    "next": [
      "control-charts",
      "e-value",
      "regression"
    ]
  },
  "e-value": {
    "question": "How strong would a hidden factor have to be to explain away my observational result?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "analytics"
    ],
    "studies": [
      "Observational analytics study",
      "Feature adoption analysis",
      "Research report review"
    ],
    "needs": "An effect estimate with its 95% confidence limits from a non-randomised comparison: a risk ratio, odds ratio, hazard ratio or standardised mean difference.",
    "when": [
      "When you found that users of a feature retain better but could not randomise who used it",
      "When a stakeholder asks \"could this just be because power users adopt it?\"",
      "When reviewing a report that makes a causal claim from observational data"
    ],
    "notFor": "Randomised experiments, where randomisation already handles confounding, or bias from drop-out and measurement error. To estimate effects, use the [Regression workbench](/calculators/regression).",
    "steps": [
      "Estimate the effect with the best adjustment you can (for example regression with known covariates).",
      "Choose the measure and enter the estimate and its 95% limits.",
      "For odds or hazard ratios, say whether the outcome is rare or common.",
      "Read the E-value for the estimate and for the confidence limit closer to 1.",
      "Compare those numbers with the strength of the confounders you did measure."
    ],
    "example": "Users who turned on reminders were 1.6 times as likely to still be active after 90 days (95% CI 1.2 to 2.1). The E-value is 2.58: an unmeasured factor would need to be linked to both reminder use and retention by a risk ratio of about 2.6 each to explain the result away. For the lower limit it is 1.69, so a fairly modest confounder could pull the interval down to include no effect.",
    "learn": "Observational comparisons can be fooled by things you did not measure, such as motivation. The E-value turns that worry into a number: how strong such a factor would need to be. A large E-value means only a strong hidden factor could explain the result; a value near 1 means a weak one could.",
    "deeper": "For a risk ratio above 1, E = RR + √(RR × (RR − 1)) (VanderWeele and Ding 2017). Odds ratios, hazard ratios and SMDs are first converted to approximate risk ratios. The bias plot shows every pair of confounder strengths that would be enough (Ding and VanderWeele 2016). There is no universal threshold: judge the E-value against known confounders. See [sensitivity analysis with the E-value](/methods/sensitivity-analysis-with-the-e-value).",
    "mistakes": [
      "Treating a high E-value as proof of causation.",
      "Reporting only the E-value for the estimate and not for the confidence limit.",
      "Using it on randomised A/B tests."
    ],
    "next": [
      "regression",
      "diff-in-diff",
      "mediation"
    ]
  },
  "factorial-designs": {
    "question": "How do I test many design factors at once without testing every combination?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "design-specs",
      "ab-test"
    ],
    "studies": [
      "Multivariate test",
      "Screening experiment",
      "Factorial survey"
    ],
    "needs": "To plan: the number of factors and levels you want to test. To analyse: one row per run with the factor settings and a response such as conversion rate or task time.",
    "when": [
      "When you have five or more design factors (copy, colour, layout, price display) and too little traffic for a full factorial",
      "When you want to screen which factors matter before a focused follow-up test",
      "When you ran an unreplicated factorial and need to tell real effects from noise"
    ],
    "notFor": "Situations with many large interactions expected or factors that cannot be varied independently. For comparing a few whole designs use [Compare three or more designs](/calculators/multi-compare).",
    "steps": [
      "List the factors and two levels for each (or more levels for an orthogonal array).",
      "Choose a fraction and check the resolution: III aliases main effects with two-way interactions, IV keeps main effects clear.",
      "Download the randomised run sheet and run each combination.",
      "Paste the results and read the half-normal plot: effects that fall off the line are active.",
      "Confirm the important factors in a smaller follow-up test."
    ],
    "example": "A team wanted to test six landing-page factors. A full factorial needs 64 versions; a 2^(6−2) resolution IV design needs 16. After the test, the half-normal plot and Lenth's method flagged headline and price display as active, while the other four factors sat on the line, so the next test focused on those two.",
    "learn": "A full factorial tests every combination, which grows fast. A fractional factorial tests a carefully chosen subset so main effects can still be estimated, at the cost of mixing (aliasing) some effects together. The resolution tells you which effects are mixed.",
    "deeper": "Default generators are minimum-aberration designs from Montgomery (2017); Plackett-Burman screens and orthogonal arrays are also offered. Analysis uses Lenth's (1989) pseudo standard error, which assumes most effects are negligible, and a half-normal plot. With replicated runs, ANOVA with pure error is better. See [fractional factorial experiments](/methods/fractional-factorial-experiments).",
    "mistakes": [
      "Choosing a resolution III design and then interpreting two-way interactions.",
      "Running the combinations in a fixed order instead of the randomised run sheet.",
      "Giving each cell too little traffic to estimate effects."
    ],
    "next": [
      "multi-compare",
      "regression",
      "counterbalancing"
    ]
  },
  "bandit-simulator": {
    "question": "Should I run a fixed A/B split or a bandit, and what would each cost?",
    "stages": [
      "plan",
      "decide"
    ],
    "data": [
      "ab-test",
      "estimates"
    ],
    "studies": [
      "A/B test planning",
      "Multivariate headline test",
      "Adaptive experiment"
    ],
    "needs": "Your best guess of each version's conversion rate, the number of visitors in the test and how often traffic can be reallocated.",
    "when": [
      "Before choosing between a classic A/B test and an adaptive one",
      "When the cost of showing a weak version during the test matters (short campaigns, promotions)",
      "When stakeholders ask what a bandit would gain over a fixed split"
    ],
    "notFor": "Analysing a finished test (use [Bayesian A/B test](/calculators/bayes-ab)) or cases where conversions arrive days after the visit.",
    "steps": [
      "List the versions (arms) and a realistic conversion rate for each.",
      "Enter the number of visitors and the batch size between updates.",
      "Run the simulation and compare conversions lost (regret) across policies.",
      "Check \"picks the right winner\": bandits lose fewer conversions but can learn less.",
      "Choose the policy that fits your goal: earning during the test or learning for later."
    ],
    "example": "Three headlines at 3.0%, 3.3% and 3.6% over 30,000 visitors: a fixed split loses about 90 conversions against always showing the best one, Thompson sampling about 45, and it sends 62% of traffic to the best headline. But the fixed split picks the right winner 88% of the time against 86% for Thompson sampling, so if the goal is a reliable answer the fixed split is still reasonable.",
    "learn": "A fixed split shares traffic equally until the end. A bandit shifts traffic to versions that are doing well while the test runs, so fewer people see weak versions, but it learns less about those versions. Simulating both with your expected rates shows the trade-off before you commit.",
    "deeper": "Policies are Thompson sampling (Thompson 1933), epsilon-greedy and UCB1 (Auer, Cesa-Bianchi and Fischer 2002), updated in batches. Regret is the expected conversions lost against always showing the best arm. The ± values are Monte Carlo margins, not uncertainty about your real rates. See [multi-armed bandit testing](/methods/multi-armed-bandit-testing-for-adaptive-ux).",
    "mistakes": [
      "Using a bandit when you need an unbiased estimate of each version's effect.",
      "Using bandits when conversion rates drift over the test.",
      "Reading the Monte Carlo ± as a confidence interval for real rates."
    ],
    "next": [
      "bayes-ab",
      "sprt",
      "ab-health"
    ]
  },
  "brand-lift": {
    "question": "Did people who saw the campaign think differently from those who did not?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "survey",
      "ab-test"
    ],
    "studies": [
      "Brand lift study",
      "Awareness, attitude and usage survey",
      "Campaign evaluation"
    ],
    "needs": "For each survey question, the number of \"yes\" or top-box answers and the number asked, in an exposed group and a control group.",
    "when": [
      "After an ad or content campaign with a randomised or matched control group",
      "When you tested several brand questions and need to guard against false lifts",
      "When planning how many respondents the next lift study needs"
    ],
    "notFor": "Behaviour such as sign-ups or sales (use [Compare two completion rates](/calculators/compare-rates) on a conversion holdout) or control groups that were not randomised or matched.",
    "steps": [
      "Survey exposed and control people with the same questions at the same time.",
      "Count top-box or \"yes\" answers for each question in each group.",
      "Paste one line per question and optionally the campaign reach.",
      "Read lifts with intervals and look at the Holm-corrected p-values across questions.",
      "Use the planner to size the next study for the smallest lift worth detecting."
    ],
    "example": "Awareness was 31.2% among 1,000 exposed respondents and 26.8% among 1,000 controls: a lift of 4.4 points (95% CI 0.4 to 8.4), or 16% relative. Alone p = 0.03, but with a second question tested, Holm's correction gives 0.06, so the lift does not hold up once both questions are counted.",
    "learn": "Lift is the difference between the exposed and control groups for each question. Testing many questions raises the chance that one shows a lift by luck, so the p-values are corrected. The control group must be comparable, or the lift mixes in who was targeted.",
    "deeper": "Absolute lift uses Newcombe's hybrid score interval (1998); relative lift uses the log risk-ratio interval. Holm's (1979) step-down method controls the family-wise error across questions. The planner uses the standard two-proportion sample-size formula with a Bonferroni-adjusted alpha. See [brand lift measurement](/methods/brand-lift-and-drag-measurement).",
    "mistakes": [
      "Surveying exposed and control groups at different times.",
      "Reporting the one significant question out of many without correction.",
      "Using an unmatched control group of people who were simply not targeted."
    ],
    "next": [
      "compare-rates",
      "margin-of-error",
      "survey-weighting"
    ]
  },
  "market-sizing": {
    "question": "How big is the market for this product, with honest uncertainty?",
    "stages": [
      "decide"
    ],
    "data": [
      "estimates"
    ],
    "studies": [
      "Business case",
      "Opportunity assessment",
      "Product strategy review"
    ],
    "needs": "A chain of inputs that multiply into the market size (number of customers, price, share you can serve and win), each as a 90% range from desk research or expert judgement.",
    "when": [
      "When building a business case for a new product or feature",
      "When stakeholders ask for TAM, SAM and SOM and the inputs are uncertain",
      "When you want to know which assumption to research first"
    ],
    "notFor": "A revenue forecast or inputs that are strongly linked, such as price and share won. For the value of a UX change use [UX ROI and cost-benefit](/calculators/ux-roi).",
    "steps": [
      "Write a top-down chain (whole market × shares) and, if possible, a bottom-up chain (customers × price).",
      "Give each input a low and high value you would be surprised to see exceeded (a 90% range).",
      "Mark each input as TAM, SAM or SOM and run the simulation.",
      "Read the median and 90% range for each stage and compare the two chains.",
      "Use the tornado chart to pick the input whose range matters most and research it."
    ],
    "example": "A bottom-up chain for team planning software: 200,000 to 800,000 small teams × £300 to £900 a year each. The TAM median is about £208 million (√(200k × 800k) × √(300 × 900)), with a wide 90% range. The tornado chart shows the number of teams drives most of the uncertainty, so that is the figure to research first.",
    "learn": "Market sizes are chains of multiplied guesses. Giving each guess a range and simulating many combinations shows how uncertain the total really is. When two independent chains land in the same area, the estimate is more credible.",
    "deeper": "Each 90% range becomes a log-normal (or triangular) distribution; a Monte Carlo simulation of 100,000 draws multiplies them. The tornado chart is a one-way sensitivity analysis showing each input's share of the variance of log size. People's 90% ranges are usually too narrow. See [target market sizing](/methods/target-market-sizing) and [Fermi estimation](/methods/fermi-estimation).",
    "mistakes": [
      "Treating SOM as a sales forecast.",
      "Giving narrow ranges to look precise.",
      "Picking ranges to reach a target number."
    ],
    "next": [
      "ux-roi",
      "value-of-information",
      "decision-tree"
    ]
  },
  "nonresponse": {
    "question": "How many people answered my survey, and could those who did not change the result?",
    "stages": [
      "collect",
      "analyse"
    ],
    "data": [
      "survey"
    ],
    "studies": [
      "Customer survey",
      "Panel survey",
      "Probability sample survey"
    ],
    "needs": "Final dispositions of every sampled case (completes, partials, refusals, non-contacts, unknown eligibility); for deeper checks, respondents' answers with a wave or timing column, or a file of everyone sampled with a response flag and frame variables.",
    "when": [
      "When writing up a survey and you need a standard response rate",
      "During fieldwork, to see whether late respondents differ from early ones",
      "When you have customer data for everyone invited and want to know if respondents are representative"
    ],
    "notFor": "Opt-in panels without a known sample frame, where AAPOR rates do not apply. To correct for known differences, use [Survey weighting (raking)](/calculators/survey-weighting).",
    "steps": [
      "Record a final disposition for every invited case.",
      "Enter the counts to get AAPOR response, cooperation and contact rates.",
      "Compare early and late respondents on key answers across waves or reminders.",
      "If you know frame variables for everyone, compute the R-indicator and its partial indicators.",
      "Report the rates and checks, and say which variables could not be checked."
    ],
    "example": "Of 2,000 invited customers, 420 completed, 30 partly completed, 310 refused, 540 were never reached, 20 were other non-interviews, 480 had unknown eligibility and 200 were ineligible. RR1 is 23.3%; with e estimated at 0.87, RR3 is 24.2%. Late respondents were 8 points less satisfied than early ones, a warning that non-respondents may be less satisfied still.",
    "learn": "A low response rate is not bias in itself; bias happens when people who answer differ from those who do not. Late respondents are a rough stand-in for non-respondents, and the R-indicator checks how evenly response is spread across groups you know about.",
    "deeper": "Rates follow the AAPOR Standard Definitions (10th edition, 2023). The early-late comparison follows the continuum-of-resistance model (Armstrong and Overton 1977). The R-indicator (Schouten, Cobben and Bethlehem 2009) is 1 − 2 × SD of response propensities from a logistic model; partial indicators show which variables drive imbalance. See [non-response bias assessment](/methods/non-response-bias-assessment).",
    "mistakes": [
      "Reporting completes ÷ invitations without defining the rate.",
      "Assuming a high response rate means no bias.",
      "Treating the checks as proof that bias is absent."
    ],
    "next": [
      "survey-weighting",
      "margin-of-error"
    ]
  },
  "sensitive-questions": {
    "question": "How many people do something they would not admit to if asked directly?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "survey"
    ],
    "studies": [
      "Survey with sensitive behaviour questions",
      "List experiment",
      "Randomised response survey"
    ],
    "needs": "For a list experiment: counts of how many items each respondent in control and treatment groups said applied. For randomised response: the number of \"yes\" answers, respondents and the design probabilities.",
    "when": [
      "When asking about behaviour people may hide, such as sharing passwords or breaking a policy",
      "When a direct question gives suspiciously low rates",
      "When you have several hundred respondents and can randomise question versions"
    ],
    "notFor": "Small usability studies (ask in private instead) or questions that are not actually sensitive. For an ordinary proportion use [Survey margin of error](/calculators/margin-of-error).",
    "steps": [
      "Choose a technique: a list experiment (count of items) or randomised response (a chance device).",
      "Randomise respondents into control and treatment, or give each a private random device.",
      "Enter the answer counts and design settings.",
      "Read the prevalence estimate and its interval, and compare with the direct question if asked.",
      "Check the design-effect test and floor and ceiling shares for list experiments."
    ],
    "example": "In a list experiment on password sharing, 600 control respondents reported an average of 1.84 of four innocuous items and 600 treatment respondents 2.02 of five items. The estimated share who share passwords is 18%, with a 95% interval of roughly 7% to 29%, against 6% who admitted it when asked directly.",
    "learn": "These techniques hide each person's answer so they can be honest, while the group rate can still be worked out. The price is precision: intervals are much wider than for a direct question, so you need large samples.",
    "deeper": "The list estimate is the difference in mean item counts with a Welch interval; Blair and Imai's (2012) design-effect check tests whether adding the sensitive item changed answers to the others. Randomised response uses Warner's (1965) or the forced-response design (Boruch 1971), with respondent jeopardy (Lanke 1976). See [list experiment](/methods/list-experiment-item-count-technique) and [randomised response](/methods/randomised-response-technique).",
    "mistakes": [
      "Running it with too few respondents for a useful interval.",
      "Choosing control items that most people answer all yes or all no (ceiling and floor).",
      "Using instructions too complex for rushed respondents."
    ],
    "next": [
      "margin-of-error",
      "survey-weighting"
    ]
  },
  "paired-scaling": {
    "question": "How do I turn \"which of these two do you prefer?\" answers into a scale?",
    "stages": [
      "analyse"
    ],
    "data": [
      "choices",
      "survey"
    ],
    "studies": [
      "Paired preference test",
      "Icon or visual design comparison",
      "Cumulative behaviour scale"
    ],
    "needs": "A win matrix or \"winner, loser\" lines from paired comparisons, or for Guttman scaling a table of yes/no answers with one row per respondent.",
    "when": [
      "When participants compared designs or items two at a time",
      "When you want to know not just the order of items but how far apart they are",
      "When checking whether yes/no items form a cumulative ladder (for example skill levels)"
    ],
    "notFor": "More than about 10 items, where pairs grow too fast (use [MaxDiff counts](/calculators/maxdiff)) or attitudes that can be agreed with in any combination.",
    "steps": [
      "Collect paired choices, ideally with every pair compared by several people.",
      "Paste the win matrix or one \"winner, loser\" line per comparison.",
      "Read Bradley-Terry worths (share of preference) and Thurstone scale values.",
      "Check the fit statistics: poor fit can mean segments disagree.",
      "For Guttman scaling, paste 0/1 items and check reproducibility and Loevinger's H."
    ],
    "example": "Forty participants compared six icon sets in all 15 pairs. Bradley-Terry worths gave the outline set 31%, the filled set 24% and the rest under 15% each, and the outline set beats the filled set in about 56% of comparisons. Thurstone values put the bottom two sets close together, so either could be dropped.",
    "learn": "Paired comparisons are easy for people: just pick one. Scaling models turn many such choices into a single score for each item, showing how strongly each is preferred, not just its rank. Guttman scaling checks whether yes/no items line up like steps of a ladder.",
    "deeper": "Bradley-Terry estimates log-worths by maximum likelihood with intervals; it needs every item to both win and lose at least once (Ford 1957). Thurstone Case V uses normal deviates of choice shares with Mosteller's (1951) fit test. Guttman scaling reports reproducibility (benchmark 0.90), scalability (0.60) and Loevinger's H (Mokken 1971). See [Bradley-Terry scaling](/methods/bradley-terry-paired-comparison-scaling).",
    "mistakes": [
      "Pooling segments with opposite preferences into one scale.",
      "Comparing too many items, so each pair has too few judgements.",
      "Using Guttman scaling on attitudes rather than cumulative behaviours."
    ],
    "next": [
      "maxdiff",
      "preference-test",
      "item-analysis"
    ]
  },
  "importance-performance": {
    "question": "Which attributes matter most but perform worst, so I fix them first?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "ratings",
      "survey"
    ],
    "studies": [
      "Satisfaction survey",
      "KAP survey",
      "Feature awareness survey"
    ],
    "needs": "Mean importance and performance ratings per attribute, or respondent-level ratings plus an overall outcome; for the gap tabs, counts of people who know, favour and practise a behaviour, or who were aware of and found a feature useful.",
    "when": [
      "After a survey that rated attributes on importance and satisfaction",
      "When you need a simple priority grid for a roadmap discussion",
      "When people know about a behaviour or feature but do not use it"
    ],
    "notFor": "Judging whether performance is good enough in absolute terms (pair it with a benchmark) or attributes that overlap heavily (use [Key driver analysis](/calculators/key-drivers)).",
    "steps": [
      "Ask importance and performance on the same scale, or ask performance plus an overall outcome.",
      "Paste the means, or the raw ratings to derive importance from correlations.",
      "Choose where the crosshairs sit (means, medians or a fixed value such as the scale midpoint).",
      "Start with attributes in \"Concentrate here\": high importance, low performance.",
      "Use the KAP or awareness tab when the problem is uptake rather than quality."
    ],
    "example": "A banking app survey rated eight attributes. \"Speed of transfers\" scored 4.6 for importance but 3.4 for performance, well into \"Concentrate here\", while \"Card designs\" scored 4.1 for performance and 2.8 for importance (\"Possible overkill\"). The team moved effort from visual options to transfer speed.",
    "learn": "The grid places each attribute by how important it is and how well it performs. The top-left box, important but weak, is where to act first. It ranks attributes against each other; it does not say whether any is good enough.",
    "deeper": "The grid follows Martilla and James (1977). Derived importance uses Pearson or Spearman correlations with the outcome and Fisher-z intervals. KAP gaps (Rogers 2003) and awareness-usefulness gaps (Albert and Tullis) use Wilson and Newcombe intervals. Correlation-based importance is distorted by halo effects. See [importance-performance analysis](/methods/importance-performance-analysis).",
    "mistakes": [
      "Computing a gap between importance and performance measured on different scales.",
      "Treating the crosshairs as absolute targets.",
      "Asking awareness after showing the feature."
    ],
    "next": [
      "key-drivers",
      "top-tasks",
      "kano"
    ]
  },
  "anchoring-vignettes": {
    "question": "Do groups really differ, or do they just use the rating scale differently?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "ratings",
      "survey"
    ],
    "studies": [
      "Cross-cultural survey",
      "Multi-market satisfaction study",
      "International benchmark"
    ],
    "needs": "One row per respondent with their self-rating and their ratings of the same short vignettes (described scenarios) on the same scale, plus an optional group column such as country.",
    "when": [
      "When comparing satisfaction or ease ratings across countries or cultures",
      "When one group seems to rate everything higher or lower",
      "When you can add two to four short vignettes to a survey"
    ],
    "notFor": "Tracking one stable group over time, or measuring scale reliability (use [Item analysis and Rasch](/calculators/item-analysis)).",
    "steps": [
      "Write vignettes describing low, medium and high levels of the thing you measure.",
      "Ask each respondent to rate the vignettes and themselves on the same scale.",
      "Paste the data and pick the group, self-rating and vignette columns in order from lowest to highest.",
      "Compare raw self-ratings and anchored C scores between groups.",
      "Check how many respondents rated the vignettes in the intended order."
    ],
    "example": "Customers in three markets rated how easy it was to get support. Market A's raw mean was 3.9 against market B's 3.2, but after anchoring to three vignettes the C scores were almost the same. Market A respondents also rated the vignettes higher, so most of the raw gap was scale use, not service quality.",
    "learn": "People in different groups can use the same scale differently: one group's \"4\" may be another's \"3\". Vignettes describe fixed situations everyone rates, so they show how each person uses the scale. Each self-rating is then placed relative to that person's own vignette ratings.",
    "deeper": "The tool uses King, Murray, Salomon and Tandon's (2004) nonparametric C scores, with ties and misordered vignettes handled as intervals (King and Wand 2007). It assumes people rate vignettes as they rate themselves and read each vignette the same way; test both in pilots. For covariates, fit the parametric CHOPIT model. See [anchoring vignettes](/methods/anchoring-vignettes).",
    "mistakes": [
      "Using only one vignette, which gives very coarse C scores.",
      "Writing vignettes that different cultures read differently.",
      "Ignoring a large share of misordered vignettes."
    ],
    "next": [
      "item-analysis",
      "scale-validity",
      "nonparametric"
    ]
  },
  "norms": {
    "question": "How does this score compare with a reference group of users?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "ratings"
    ],
    "studies": [
      "Benchmark study",
      "Questionnaire development",
      "Competitive UX benchmarking"
    ],
    "needs": "Scores from a norm (reference) group, or its mean, SD and size, plus the scores you want to convert.",
    "when": [
      "When you built an in-house scale and want percentile ranks for new results",
      "When reporting a score as \"better than X% of products or users\"",
      "When stakeholders need z, T or stanine scores for a dashboard"
    ],
    "notFor": "Small or unrepresentative norm groups, or setting targets. For SUS percentiles use the [SUS scorer](/calculators/sus).",
    "steps": [
      "Collect scores from a large, relevant norm group on the same questionnaire version.",
      "Paste the norm scores, or enter their mean, SD and size.",
      "Enter the scores you want to convert.",
      "Read z, T, stanine, sten and percentile, with intervals for the percentile.",
      "Use the empirical or normalised columns if the norm group is skewed."
    ],
    "example": "An in-house usability scale has a norm group of 600 users with mean 70 and SD 10. A new release scored 82: z = 1.2, T = 62, stanine 7, sten 8, and about the 88th percentile under a normal model, so it sits in the top eighth of the norm group.",
    "learn": "A raw score means little alone. Standard scores say how far it is from the norm group's average in SDs, and a percentile says what share of the norm group scored lower. They are only as good as the norm group behind them.",
    "deeper": "z = (x − M) ÷ SD; T = 50 + 10z (McCall 1922); stanines and stens are half-SD bands. Empirical percentiles use mid-ranks with Wilson intervals; normal percentile intervals follow Crawford and Garthwaite (2002), allowing for the norm mean and SD being estimates. See [norm development](/methods/norm-development-and-standard-score-transformation).",
    "mistakes": [
      "Using a norm group from a different user population or questionnaire version.",
      "Treating the 50th percentile as a target.",
      "Using normal percentiles when the norm group is skewed."
    ],
    "next": [
      "rating",
      "tolerance-intervals",
      "sus"
    ]
  },
  "fault-tree": {
    "question": "How likely is this failure, and which causes contribute most?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "estimates"
    ],
    "studies": [
      "Safety-critical design review",
      "Medical device use-error analysis",
      "Risk assessment"
    ],
    "needs": "A tree of the ways a top failure can happen, joined by AND, OR and k-of-n gates, with a probability for each basic event from incident data, THERP or expert estimates.",
    "when": [
      "When a design must show that a serious failure is very unlikely",
      "When you want to know which safeguard or step matters most to the overall risk",
      "When several failure routes share the same event"
    ],
    "notFor": "Dependent events or failures where timing and order matter. To rank failure modes use [Use FMEA](/calculators/use-fmea).",
    "steps": [
      "Name the top event (the failure you want to avoid).",
      "Break it down into causes with gates: OR if any cause is enough, AND if all are needed.",
      "Give each basic event a probability, estimated with the [Human error probability](/calculators/human-error) calculator where people are involved.",
      "Read the exact top-event probability and the minimal cut sets.",
      "Use Fussell-Vesely and Birnbaum importance to decide which event to reduce first."
    ],
    "example": "A wrong dose is given if a nurse misreads the label (0.003) and the barcode check is skipped (0.05), or if the pump is programmed wrongly (0.0005). The exact probability is 0.00065, about 1 in 1,540 doses. The pump event has a Fussell-Vesely importance of 0.77, so it involves most of the risk and is the place to add a safeguard.",
    "learn": "A fault tree breaks a serious failure into the combinations of smaller events that cause it. AND gates multiply small probabilities, which is why layered safeguards work; OR gates add routes. Cut sets list the smallest combinations that cause the failure.",
    "deeper": "The tool computes the exact probability with a binary decision diagram (Bryant 1986; Rauzy 1993), finds minimal cut sets with MOCUS (Fussell and Vesely 1972), and gives the rare-event approximation. Importance measures include Birnbaum, criticality, Fussell-Vesely, RAW and RRW. It assumes basic events are independent. See [fault tree analysis](/methods/fault-tree-analysis).",
    "mistakes": [
      "Treating events with a common cause (same tired person) as independent.",
      "Presenting guessed probabilities as precise.",
      "Using the rare-event approximation when probabilities are large."
    ],
    "next": [
      "human-error",
      "use-fmea",
      "risk-harm"
    ]
  },
  "ergonomics": {
    "question": "Is this lift, posture, fit or workload acceptable for the people doing it?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "design-specs",
      "ratings"
    ],
    "studies": [
      "Workplace assessment",
      "Physical product design",
      "Cockpit or vehicle evaluation"
    ],
    "needs": "Depending on the sheet: lift measurements (load, distances, frequency), observed body postures, body dimension means and SDs for your users, or ratings from Borg, Cooper-Harper or SWAT.",
    "when": [
      "When assessing a manual handling task such as lifting boxes in a warehouse",
      "When screening a work posture with RULA or REBA",
      "When choosing a dimension or adjustment range that fits a target share of users",
      "When collecting exertion, handling-quality or workload ratings"
    ],
    "notFor": "One-handed, seated or carrying tasks (outside the NIOSH equation) or detailed mental workload, where the [NASA-TLX scorer](/calculators/nasa-tlx) is finer.",
    "steps": [
      "Pick the sheet for your question: NIOSH, RULA, REBA, anthropometry, Borg, Cooper-Harper or SWAT.",
      "Measure or observe the inputs (distances, angles, postures, user body data).",
      "Enter them and read the result: lifting index, action level, share accommodated or rating summary.",
      "Change the design inputs to see what would bring the result into the acceptable range."
    ],
    "example": "A 12 kg box is lifted from 30 cm to 90 cm high, held 40 cm in front of the ankles, with a 30° twist, twice a minute for 1 to 2 hours and a fair grip. The recommended weight limit is 8.0 kg and the lifting index 1.49, so the task needs redesign, for example raising the start height.",
    "learn": "Each sheet turns a standard ergonomic method into numbers. The NIOSH lifting index compares the load with a recommended limit (above 1 means more risk), RULA and REBA score postures, and anthropometry shows what share of users a dimension suits.",
    "deeper": "NIOSH follows Waters et al. (1993) and the Applications Manual (1994); RULA follows McAtamney and Corlett (1993); REBA Hignett and McAtamney (2000); Borg scales Borg (1982, 1998); Cooper-Harper (1969); SWAT Reid and Nygren (1988), with a simplified additive scaling. Anthropometric percentiles do not add across body dimensions. See [RULA and REBA](/methods/rula-and-reba-posture-assessment).",
    "mistakes": [
      "Designing for the \"average user\", which suits few people.",
      "Adding percentiles across body dimensions.",
      "Scoring one posture and treating it as exposure over a whole shift."
    ],
    "next": [
      "nasa-tlx",
      "tolerance-intervals",
      "questionnaires"
    ]
  },
  "steering-law": {
    "question": "How long will it take to move the pointer along a menu, slider or path?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "design-specs",
      "task-time"
    ],
    "studies": [
      "Menu or navigation design",
      "Interaction technique comparison",
      "Predictive modelling"
    ],
    "needs": "For the steering law: trials with path length, path width and time (or index of difficulty and time). For the Model Human Processor: a sequence of perceptual, cognitive and motor steps.",
    "when": [
      "When designing cascading menus, sliders or swipe paths where leaving the path is an error",
      "When you measured steering times and want a model to predict new designs",
      "When comparing designs by the number of processing steps they demand"
    ],
    "notFor": "Free pointing to a target (use [Fitts' law](/calculators/fitts)) or whole tasks (use the [KLM task-time predictor](/calculators/klm)).",
    "steps": [
      "Measure path length A and width W for several tunnels and time participants moving through them.",
      "Paste the trials or condition means to fit T = a + b·A/W.",
      "Check the fit and intervals for a and b.",
      "Enter candidate designs (label, A, W) to predict their times.",
      "For MHP, build the sequence of cycles and read the typical, fastest and slowest times."
    ],
    "example": "A cascading menu item 300 px long and 20 px high has an index of difficulty of 15. If the fit gives a = 100 ms and b = 40 ms per unit, the predicted time is 700 ms; making the item 30 px high cuts the index to 10 and the time to 500 ms.",
    "learn": "The steering law says that moving through a narrow tunnel takes longer the longer and narrower it is. Doubling the width roughly halves the steering part of the time. The Model Human Processor adds up typical durations for perceiving, thinking and moving.",
    "deeper": "The steering law comes from Accot and Zhai (1997), with ID = A/W for a straight tunnel; a and b are fitted by least squares. The Model Human Processor uses Card, Moran and Newell's (1983) cycle times with Fastman and Slowman ranges. See [steering law](/methods/steering-law).",
    "mistakes": [
      "Applying it to free movements without a constrained path.",
      "Using constants a and b from a different device or user group.",
      "Treating MHP sums as exact times rather than comparisons."
    ],
    "next": [
      "fitts",
      "klm",
      "hick"
    ]
  },
  "seev-attention": {
    "question": "Where will operators look on this display, and how will a redesign change it?",
    "stages": [
      "plan",
      "analyse"
    ],
    "data": [
      "design-specs",
      "estimates",
      "physiology"
    ],
    "studies": [
      "Control room or cockpit display design",
      "Dashboard evaluation",
      "Eye-tracking study"
    ],
    "needs": "A list of areas of interest, each rated for salience, effort, expectancy and value by people who know the task; optionally the observed share of dwell time from eye tracking.",
    "when": [
      "When designing a display for practised operators such as pilots, drivers or control-room staff",
      "When you want to predict attention before you can run an eye-tracking study",
      "When you have eye-tracking data and want to see whether attention matches task needs"
    ],
    "notFor": "Predicting where first-time website visitors look first. For measured gaze data use [Eye-tracking AOI metrics](/calculators/eye-tracking).",
    "steps": [
      "List the display areas that carry information.",
      "Rate each for salience, effort to look at, expectancy (how often it changes) and value to the task.",
      "Read the predicted share of dwell time for each area.",
      "If you have eye-tracking data, enter observed dwell and compare.",
      "Change ratings to try redesigns, such as moving an area closer or making it less salient."
    ],
    "example": "Six areas of a monitoring dashboard were rated by three experienced operators. SEEV predicted 34% of dwell on the alarm list and 4% on a decorative logo. Eye tracking showed 29% and 11%; the logo drew more attention than its value justified, so its salience was reduced.",
    "learn": "SEEV says attention goes where things are salient, easy to reach, change often and matter to the task. Effort pushes attention away; the other three pull it in. Comparing predictions with eye tracking shows whether attention is being wasted on low-value areas.",
    "deeper": "The model follows Wickens et al. (2001, 2003) and Wickens and McCarley (2008). Predicted dwell share is each area's positive score divided by the total. Comparisons with eye tracking report Pearson's r with a Fisher-z interval, Spearman's ρ and the mean gap. With fewer than about six areas, a high correlation can arise by chance. See [SEEV model](/methods/seev-model-of-visual-attention-allocation).",
    "mistakes": [
      "Using it to predict novice browsing on web pages.",
      "Having different people rate the designs you compare.",
      "Trusting absolute shares before checking against real dwell data."
    ],
    "next": [
      "eye-tracking",
      "hta",
      "human-error"
    ]
  },
  "alarm-flood": {
    "question": "Are operators getting more alarms than they can handle, and which alarms cause it?",
    "stages": [
      "analyse"
    ],
    "data": [
      "analytics"
    ],
    "studies": [
      "Control room alarm review",
      "Alarm rationalisation project",
      "Operator workload study"
    ],
    "needs": "An alarm log with a time stamp and tag for each alarm, and optionally priority and ALM/RTN state, exported from the control system.",
    "when": [
      "When operators complain of alarm overload",
      "When preparing an alarm rationalisation and you need the worst offenders",
      "When checking a system against ISA-18.2 and EEMUA 191 targets"
    ],
    "notFor": "Clinical alarms or IT paging without adapting the targets. For trends in a single rate over time use [Control charts and change points](/calculators/control-charts).",
    "steps": [
      "Export at least a week of alarm events.",
      "Paste the log and set how many operators share it.",
      "Read alarms per operator per day, peak 10-minute rate and time in flood.",
      "Look at the top 10 tags, chattering alarms and stale alarms.",
      "Fix the top contributors first and repeat the analysis on a new log."
    ],
    "example": "A week-long log for one operator held 2,940 alarms, 420 a day, above the 300 that standards call the most manageable. Floods covered 6% of the time against a target under 1%, and the top 10 tags produced 58% of all alarms, two of them chattering. Fixing those tags would remove more than half the load.",
    "learn": "Too many alarms make operators miss the important ones. Counting alarms per 10 minutes shows floods; a few noisy tags usually cause most of the problem. Fixing those gives the biggest relief.",
    "deeper": "Floods follow EEMUA 191 (3rd edition 2013) and ANSI/ISA-18.2-2016: they start above 10 alarms in 10 minutes and end below 5. Chattering is 3 or more activations within 60 seconds; stale alarms are active over 24 hours. Targets come from the ISA-18.2 table of recommended performance metrics. See [alarm flood analysis](/methods/alarm-flood-analysis-eemua-191-isa-18-2).",
    "mistakes": [
      "Analysing a short log dominated by one upset.",
      "Applying process-industry targets to other domains without thought.",
      "Suppressing alarms without checking they are truly unneeded."
    ],
    "next": [
      "control-charts",
      "signal-detection",
      "queueing"
    ]
  },
  "hrv": {
    "question": "Did heart rate variability drop during the task, suggesting more stress or effort?",
    "stages": [
      "analyse"
    ],
    "data": [
      "physiology"
    ],
    "studies": [
      "Physiological usability study",
      "Cognitive load study",
      "Biometric storyboard"
    ],
    "needs": "Beat-to-beat (RR) intervals in milliseconds from an ECG or chest strap, labelled by segment such as baseline and task.",
    "when": [
      "When you recorded heart data during a usability or workload study",
      "When comparing a resting baseline with demanding tasks for the same person",
      "When you want physiological support for self-reported workload"
    ],
    "notFor": "Wrist optical sensors that smooth or miss beats, or segments under 2 minutes for LF/HF. For skin conductance use [GSR / EDA peaks](/calculators/gsr-peaks).",
    "steps": [
      "Record a resting baseline of several minutes before the tasks.",
      "Export RR intervals and label each segment (baseline, task 1, task 2).",
      "Choose artefact correction and check flagged beats on the plot.",
      "Compare RMSSD, SDNN and heart rate between baseline and tasks.",
      "Use segments of similar length and interpret within each person."
    ],
    "example": "A participant's RMSSD was 42 ms during a 5-minute baseline and 28 ms during a 5-minute complex form task, with heart rate up from 68 to 79 beats per minute. That drop fits higher effort or stress; across 12 participants the same pattern would support a claim about the form.",
    "learn": "A healthy heart does not beat like a metronome; the time between beats varies. Under stress or effort that variation usually shrinks. RMSSD captures fast beat-to-beat changes and is the most robust measure for short recordings.",
    "deeper": "Time-domain measures follow the Task Force of the ESC and NASPE (1996); Poincaré SD1 and SD2 follow Brennan et al. (2001); frequency bands use a Lomb-Scargle periodogram (Lomb 1976; Scargle 1982), which needs no resampling. SDNN and LF grow with recording length, so compare segments of similar duration. See [heart rate variability measurement](/methods/heart-rate-and-heart-rate-variability-measurement).",
    "mistakes": [
      "Comparing segments of very different length.",
      "Letting people talk or move in only one segment.",
      "Reading one person's change as a population effect."
    ],
    "next": [
      "gsr-peaks",
      "nasa-tlx",
      "compare-means"
    ]
  },
  "gsr-peaks": {
    "question": "When did people react with arousal, and how often per minute in each part of the task?",
    "stages": [
      "analyse"
    ],
    "data": [
      "physiology"
    ],
    "studies": [
      "Physiological usability study",
      "Emotional response test",
      "Biometric storyboard"
    ],
    "needs": "Skin conductance samples in microsiemens at a known sampling rate, plus start and end times of segments such as baseline and each task.",
    "when": [
      "When you recorded skin conductance during a test and want to find responses",
      "When comparing arousal between tasks or screens",
      "When building a biometric storyboard of a journey"
    ],
    "notFor": "Telling positive from negative feelings, or events closer together than a few seconds. For heart data use [Heart rate variability](/calculators/hrv).",
    "steps": [
      "Record a calm baseline before the tasks.",
      "Paste the samples, set the sampling rate and define segments.",
      "Check the tonic and phasic plots and adjust the minimum response amplitude if noise is detected.",
      "Compare response rates per minute between segments.",
      "Link responses to moments in the session recording."
    ],
    "example": "In a 20-minute session sampled at 4 Hz, a participant showed 1.2 responses per minute at baseline, 1.5 during browsing and 4.1 during payment, with several large responses when an error message appeared. The payment step is the place to look in the video.",
    "learn": "Skin conductance rises a second or so after something arousing happens. The slow baseline level is the tonic part; the quick peaks are responses. Counting peaks per minute compares how often people reacted in different parts of a session.",
    "deeper": "The signal is smoothed, the tonic level is a running median, and phasic is the remainder; responses must rise above a minimum amplitude within a rise time. This median-filter split is simpler than model-based methods such as cvxEDA. EDA shows arousal, not valence. See [galvanic skin response](/methods/galvanic-skin-response).",
    "mistakes": [
      "Calling a response \"frustration\" without other evidence.",
      "Using very short segments or low sampling rates.",
      "Attributing a response to an event less than a few seconds earlier."
    ],
    "next": [
      "hrv",
      "eye-tracking"
    ]
  },
  "eye-tracking": {
    "question": "Where did people look, for how long, and in what order?",
    "stages": [
      "analyse"
    ],
    "data": [
      "physiology"
    ],
    "studies": [
      "Eye-tracking usability test",
      "Ad or page layout evaluation",
      "Scanpath comparison"
    ],
    "needs": "Fixations with participant, x, y and duration (and optionally start time) in viewing order, plus rectangles for each area of interest in the same pixel coordinates.",
    "when": [
      "After an eye-tracking session on a static page or screen",
      "When you need dwell share and time to first fixation for key elements",
      "When you want to compare viewing order between participants"
    ],
    "notFor": "Raw gaze samples, moving or scrolling content without mapping, or predicting attention before testing (use [SEEV attention model](/calculators/seev-attention)).",
    "steps": [
      "Export fixations, not raw gaze samples, from your tracker software.",
      "Define areas of interest as rectangles larger than the tracker's accuracy.",
      "Paste fixations and AOIs and check the plot that they line up.",
      "Read dwell share, hit ratio, time to first fixation and revisits per AOI.",
      "Use the transition matrix and scanpath similarity to compare viewing order."
    ],
    "example": "On a pricing page viewed by 15 participants, the plan table took 46% of fixation time and the \"Compare all features\" link 2%; only 5 of 15 looked at the link at all, after 9 seconds on average. The link is easy to miss, which explains why people asked about features the table did not show.",
    "learn": "Eye trackers record where people's eyes rest (fixations). Grouping fixations by areas of interest shows what drew attention, how quickly and how often people came back. Looking is not the same as understanding, so pair it with task results.",
    "deeper": "Each fixation goes to the first AOI that contains it. Visits are runs of fixations in the same AOI. Scanpath similarity uses Levenshtein edit distance between AOI strings (Privitera and Stark 2000; Josephson and Holmes 2002), which ignores how long people looked. See [eye tracking](/methods/eye-tracking) and [scanpath analysis](/methods/eye-movement-scanpath-analysis).",
    "mistakes": [
      "Drawing AOIs smaller than the tracker's accuracy (about 1°).",
      "Treating long dwell as liking rather than possible confusion.",
      "Using fixed AOIs on content that moves."
    ],
    "next": [
      "seev-attention",
      "first-click",
      "gsr-peaks"
    ]
  },
  "cultural-consensus": {
    "question": "Do my participants share one body of knowledge, and what are the agreed answers?",
    "stages": [
      "analyse"
    ],
    "data": [
      "qual",
      "survey"
    ],
    "studies": [
      "Domain knowledge study",
      "Expert interviews",
      "Free listing follow-up"
    ],
    "needs": "A table with one row per respondent and one column per question, holding each person's answer (true/false, yes/no or multiple choice).",
    "when": [
      "When you asked a group the same factual or domain questions and want to know if they agree",
      "When you need the \"correct\" answers for a domain with no answer key",
      "When choosing which informants are most knowledgeable"
    ],
    "notFor": "Opinions or preferences with no shared right answer. For coder agreement use [Inter-coder agreement](/calculators/intercoder).",
    "steps": [
      "Write questions about shared knowledge, for example \"Is this step required before payroll is approved?\".",
      "Ask at least 10 respondents from the group.",
      "Paste the answers and set the number of answer options.",
      "Check the eigenvalue ratio (3 or more suggests one shared culture) and that competences are positive.",
      "Read the answer key and each person's competence."
    ],
    "example": "Twenty-four payroll staff answered 30 true/false questions about their process. The eigenvalue ratio was 4.2 and mean competence 0.62, so they share one model of the work. The answer key differed from the simple majority on two questions where the most competent staff disagreed with the rest, both worth checking in the redesign.",
    "learn": "Cultural consensus treats agreement as evidence of shared knowledge. People who agree with others a lot are likely to know the answers well. The model works out each person's competence and the most likely correct answers, even when no answer key exists.",
    "deeper": "The model follows Romney, Weller and Batchelder (1986): agreement is corrected for guessing, then a one-factor minimum residual solution gives competences. A first-to-second eigenvalue ratio of at least 3 supports one shared culture (Weller 2007). The answer key weights answers by competence. Agreement does not prove correctness. See [cultural consensus analysis](/methods/cultural-consensus-analysis).",
    "mistakes": [
      "Using it for opinions.",
      "Running it with fewer than about 10 respondents.",
      "Reading high agreement as proof the group is right."
    ],
    "next": [
      "intercoder",
      "saturation",
      "agreement"
    ]
  },
  "code-network": {
    "question": "Which qualitative codes tend to appear together in my data?",
    "stages": [
      "analyse"
    ],
    "data": [
      "qual"
    ],
    "studies": [
      "Interview study",
      "Thematic analysis",
      "Diary study"
    ],
    "needs": "Coded segments: one line per segment with its id and the codes applied to it, exported from your coding tool or a spreadsheet.",
    "when": [
      "After coding interviews or diary entries, to look for links between themes",
      "When building a theme map for a report",
      "When checking whether two codes are so linked they should be merged"
    ],
    "notFor": "Showing why codes are linked, or very small data sets. To check coding consistency use [Inter-coder agreement](/calculators/intercoder).",
    "steps": [
      "Code segments of similar length (for example one answer or one paragraph).",
      "Export one line per segment with its codes.",
      "Choose a link strength (count, Jaccard, Ochiai or lift) and a minimum number of shared segments.",
      "Read the top pairs and the network; check lift and its p-value for chance.",
      "Return to the segments behind strong links to understand them."
    ],
    "example": "In 120 coded interview segments, \"fees\" and \"trust\" appeared together in 14 segments, a lift of 2.3 (2.3 times more often than chance). The network grouped them with \"hidden costs\" into one cluster, which became a report theme on pricing transparency.",
    "learn": "Counting how often codes share a segment shows which ideas travel together. Lift compares that count with what chance would give, so common codes do not dominate. The network is a map for exploring, not a finding in itself.",
    "deeper": "Jaccard (the ATLAS.ti c-coefficient; Friese 2019), Ochiai and lift measure link strength. The p-value is a one-sided hypergeometric test, not corrected for many pairs. Clusters come from the Louvain method (Blondel et al. 2008). See [co-occurrence networks](/methods/entity-co-occurrence-networks-and-trend-graphs).",
    "mistakes": [
      "Mixing very long and very short segments.",
      "Linking parent and child codes that always co-occur.",
      "Treating uncorrected p-values across many pairs as confirmed findings."
    ],
    "next": [
      "intercoder",
      "saturation",
      "cluster-personas"
    ]
  },
  "sir-adoption": {
    "question": "How fast will adoption grow, when will it peak and how far will it spread?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "analytics",
      "estimates"
    ],
    "studies": [
      "Feature adoption tracking",
      "Product launch review",
      "Viral growth planning"
    ],
    "needs": "For Bass: counts of new (first-time) adopters per period, ideally up to or past the peak. For SIR: your assumptions about population, spread rate and drop-off.",
    "when": [
      "When a feature or product has been live for several periods and you want to project adoption",
      "When separating adoption driven by marketing from word of mouth",
      "When exploring what spread rate a referral feature would need"
    ],
    "notFor": "Counts of active users rather than first-time adopters. For retention curves use [Retention and funnel analytics](/calculators/retention-funnel).",
    "steps": [
      "Collect new adopters per week or month since launch.",
      "Fit the Bass model and read p (outside influence), q (word of mouth) and m (eventual adopters).",
      "Check the peak timing and the projection range.",
      "For what-if questions, switch to SIR and set population, spread and stop rates.",
      "Treat projections as scenarios and update them as data arrive."
    ],
    "example": "A sharing feature gained new adopters weekly for 20 weeks. The fit gave p = 0.03 and q = 0.38, so word of mouth dominates, with peak adoption at about week 6. In a separate SIR what-if, 0.3 people reached per spreader per day and 10% of spreaders stopping each day gives R₀ = 3, which would eventually reach about 94% of the population.",
    "learn": "Bass diffusion says people adopt either because of outside influence (p) or because others did (q). The balance sets the S-shaped curve and when growth peaks. SIR models spread like an epidemic: if each spreader reaches more than one new person before stopping (R₀ above 1), it grows.",
    "deeper": "Bass (1969) is fitted by Levenberg-Marquardt (Srinivasan and Mason 1986); the 95% range reflects parameter uncertainty only. SIR follows Kermack and McKendrick (1927), solved numerically; R₀ = β/γ. SIR here is a thought experiment, not fitted to data. See [epidemic models for adoption](/methods/epidemic-models-sir-seir-for-adoption-and-virality) and [innovation diffusion](/methods/innovation-diffusion-analysis).",
    "mistakes": [
      "Forecasting from the first few periods before the peak.",
      "Fitting active users instead of new adopters.",
      "Treating SIR assumptions as measured facts."
    ],
    "next": [
      "retention-funnel",
      "survival",
      "forecast-calibration"
    ]
  },
  "journey-forecast": {
    "question": "What share of people will finish the whole journey, and which step should I fix first?",
    "stages": [
      "analyse",
      "decide"
    ],
    "data": [
      "task-success",
      "analytics",
      "task-time"
    ],
    "studies": [
      "Funnel analysis",
      "Multi-step usability test",
      "Service journey review"
    ],
    "needs": "For each step: successes and attempts, from analytics or test sessions, and optionally the median and 90th percentile time in seconds.",
    "when": [
      "When you know step-by-step success but need an end-to-end rate with uncertainty",
      "When choosing which step to improve first",
      "When forecasting completions for a cohort of new users"
    ],
    "notFor": "Optional or repeated steps, or people counted at steps they never reached. For one task's rate use [Completion rate interval](/calculators/completion-rate).",
    "steps": [
      "Count attempts and successes at each step in order.",
      "Add median and 90th percentile times if you have them.",
      "Run the simulation and read the end-to-end completion with its credible interval.",
      "Check \"best fix in\": the share of draws where halving a step's failures helps most.",
      "Use the cohort forecast to translate rates into people."
    ],
    "example": "An account opening journey: find plan 46/48, enter details 41/46, verify identity 30/41, pay 28/30. Forecast end-to-end completion is 54% (95% credible interval 40% to 67%). Halving failures at identity verification would add about 10 points and is the best fix in 96% of simulated draws.",
    "learn": "End-to-end completion is the product of each step's success rate, so small losses add up. Simulation carries each step's uncertainty through to the total and shows which step offers the biggest gain.",
    "deeper": "Each step gets a Beta posterior (uniform or Jeffreys prior); draws are multiplied to give the end-to-end rate and a 95% credible interval. Times are log-normal per step. The gain from halving failures is a yardstick, not a forecast of a redesign. See [Monte Carlo journey simulation](/methods/monte-carlo-journey-simulation) and [funnel analysis](/methods/funnel-analysis).",
    "mistakes": [
      "Counting people at steps they never reached.",
      "Assuming step failures are unrelated when the same people struggle throughout.",
      "Treating \"halve failures\" as a promised result."
    ],
    "next": [
      "retention-funnel",
      "completion-rate",
      "value-of-information"
    ]
  },
  "nash-games": {
    "question": "When several parties act in their own interest, where will things settle?",
    "stages": [
      "plan",
      "decide"
    ],
    "data": [
      "estimates"
    ],
    "studies": [
      "Multi-user or marketplace design",
      "Strategy workshop",
      "Economic game study"
    ],
    "needs": "A payoff table: the strategies each party can choose and what each gets for every combination, from research, data or careful judgement.",
    "when": [
      "When designing a system where users, sellers or teams react to each other",
      "When explaining why people defect from a cooperative feature",
      "When planning an economic game study"
    ],
    "notFor": "Sequential moves, hidden information or predicting real behaviour exactly. For a decision under uncertainty use [Decision tree](/calculators/decision-tree).",
    "steps": [
      "Name the players and the strategies each can choose.",
      "Fill in the payoff for each player in every combination.",
      "Read the pure and mixed equilibria and any dominated strategies.",
      "For 2×2 games, look at the best-response plot.",
      "Ask what design change would move the equilibrium to the outcome you want."
    ],
    "example": "Two product teams decide whether to move to a new design system (stag hunt: 4 each if both move, 3 if both stay, 0 for moving alone). There are two pure equilibria, both move or both stay, and a mixed one where each moves with probability 3/4. Because staying is safe, the team removed the risk of moving alone by funding shared migration support.",
    "learn": "A Nash equilibrium is a set of choices where no one can do better by changing their own choice alone. It shows where self-interested parties may settle, which may not be the best outcome for all. Changing the payoffs is how design moves the equilibrium.",
    "deeper": "Equilibria are found by support enumeration (von Stengel 2007), which lists every equilibrium in nondegenerate games; dominated strategies are removed iteratively. Lab studies show people cooperate and trust more than one-shot equilibria predict. See [Nash equilibrium analysis](/methods/nash-equilibrium-analysis) and [economic games](/methods/economic-games-prisoners-dilemma-public-goods-trust-and-ultimatum).",
    "mistakes": [
      "Treating guessed payoffs as facts.",
      "Expecting real people to play the equilibrium exactly.",
      "Using a simultaneous-move table for a sequential situation."
    ],
    "next": [
      "decision-tree",
      "decision-matrix"
    ]
  }
};
