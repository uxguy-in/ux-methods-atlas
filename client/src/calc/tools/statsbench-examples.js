// Built-in example datasets for the statistics workbench tools. They are simulated once from a fixed seed, so every
// visitor sees the same numbers and server/scripts/statsbench-dump.js can hand exactly the same text to the Python
// reference script. The stories are realistic UX research set-ups; the data are synthetic.
import { rng, randNorm } from './statsbench-core.js';

function gamma(r, k) {
  // Marsaglia and Tsang (2000); boost for shape < 1.
  if (k < 1) return gamma(r, k + 1) * r() ** (1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v; do { x = randNorm(r); v = 1 + c * x; } while (v <= 0);
    v = v ** 3; const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function poisson(r, mu) { const L = Math.exp(-mu); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
const clip = (x, a, b) => Math.min(b, Math.max(a, x));
const logit = (x) => 1 / (1 + Math.exp(-x));

// Customer survey after a quarter of use (n = 160): satisfaction (1–7), renewal, recommend group and support tickets.
export const REGRESSION_EXAMPLE = (() => {
  const r = rng(20261030), rows = ['respondent,plan,tenure_months,ease,tasks_per_week,satisfaction,renewed,recommend,support_tickets'];
  for (let i = 1; i <= 160; i++) {
    const u = r(), plan = u < 0.45 ? 'Free' : u < 0.8 ? 'Pro' : 'Team';
    const tenure = 1 + Math.floor(r() * 36);
    const ease = +clip(5 + 1.05 * randNorm(r), 1, 7).toFixed(1);
    const tasks = poisson(r, 6 + (plan === 'Team' ? 4 : plan === 'Pro' ? 2 : 0));
    const pl = plan === 'Pro' ? 1 : plan === 'Team' ? 2 : 0;
    const sat = +clip(1.3 + 0.48 * ease + 0.018 * tenure + 0.25 * (pl > 0) + 0.2 * (pl === 2) + 0.03 * tasks + 0.7 * randNorm(r), 1, 7).toFixed(1);
    const renewed = r() < logit(-5.2 + 0.85 * ease + 0.035 * tenure + 0.5 * (pl > 0) + 0.4 * (pl === 2)) ? 'Yes' : 'No';
    const lat = 0.95 * ease + 0.02 * tenure + 0.35 * (pl > 0) + Math.log(1 / r() - 1);
    const rec = lat < 4.4 ? 'Detractor' : lat < 5.9 ? 'Passive' : 'Promoter';
    const mu = Math.exp(1.55 - 0.28 * ease + 0.25 * (pl === 2) + 0.012 * tenure), a = 0.55;
    const tickets = poisson(r, gamma(r, 1 / a) * a * mu);
    const easeTxt = i === 37 || i === 118 ? '' : ease;
    rows.push([`R${String(i).padStart(3, '0')}`, plan, tenure, easeTxt, tasks, sat, renewed, rec, tickets].join(','));
  }
  return rows.join('\n');
})();

// Onboarding study (n = 140): did the interactive tutorial raise confidence, and did confidence raise intention to
// keep using the product? Ease of the first task and prior experience are there for the moderation question.
export const MEDIATION_EXAMPLE = (() => {
  const r = rng(7031), rows = ['participant,tutorial,experience_years,ease,confidence,intent'];
  for (let i = 1; i <= 140; i++) {
    const tut = i % 2;
    const exp = +clip(4 + 2.6 * randNorm(r), 0, 12).toFixed(1);
    const ease = +clip(4.6 + 0.3 * tut + 1.1 * randNorm(r), 1, 7).toFixed(1);
    const conf = +clip(3.2 + 0.75 * tut + 0.25 * ease + 0.08 * exp + 0.9 * randNorm(r), 1, 7).toFixed(1);
    const intent = +clip(0.9 + 0.12 * tut + 0.42 * conf + 0.55 * ease + 0.13 * exp - 0.075 * ease * exp + 0.85 * randNorm(r), 1, 7).toFixed(1);
    rows.push([`P${String(i).padStart(3, '0')}`, tut, exp, ease, conf, intent].join(','));
  }
  return rows.join('\n');
})();

// Task times (seconds) for the same checkout task on two designs, plus paired and binary examples.
const lognormals = (seed, n, mu, s) => { const r = rng(seed); return Array.from({ length: n }, () => +Math.exp(mu + s * randNorm(r)).toFixed(1)); };
export const TIMES_A = lognormals(101, 15, Math.log(62), 0.48);
export const TIMES_B = lognormals(202, 14, Math.log(46), 0.55);
export const PAIRS = (() => {
  const r = rng(303), out = [];
  for (let i = 0; i < 22; i++) { const ease = +clip(5 + 1.2 * randNorm(r), 1, 7).toFixed(1); out.push([ease, Math.round(clip(30 + 8.5 * ease + 11 * randNorm(r), 0, 100))]); }
  return out;
})();
export const SUCCESSES = (() => { const r = rng(404); return Array.from({ length: 25 }, () => (r() < 0.72 ? 1 : 0)); })();

// Time on task for 40 participants (seconds), right-skewed as task times usually are.
export const DISTRIBUTION_EXAMPLE = lognormals(505, 40, Math.log(74), 0.52);

// Days from sign-up to first use of a new reporting feature, for two onboarding flows. The study stopped at day 60
// (people who had not adopted by then are censored), and some accounts closed earlier (censored at closing).
export const SURVIVAL_EXAMPLE = (() => {
  const rows = ['account,days,adopted,onboarding'];
  const r = rng(6060);
  for (const [g, scale, shape, n] of [['Old flow', 52, 1.1, 48], ['New flow', 30, 1.15, 46]]) {
    for (let i = 0; i < n; i++) {
      const t = scale * (-Math.log(1 - r())) ** (1 / shape);
      const close = r() < 0.15 ? 5 + r() * 50 : Infinity;
      const end = Math.min(60, close);
      const days = Math.max(1, Math.ceil(Math.min(t, end)));
      rows.push([`${g === 'Old flow' ? 'O' : 'N'}${String(i + 1).padStart(2, '0')}`, days, t <= end ? 1 : 0, g].join(','));
    }
  }
  return rows.join('\n');
})();
