// Built-in example datasets for the surveyx tools. Larger datasets are simulated with a fixed seed so the pages, the
// Python reference (server/scripts/surveyx-reference.py) and the check script all see exactly the same numbers.
import { rng, normalRng } from './decisions-core.js';

const r2 = (x) => Math.round(x * 100) / 100;
const pick = (u, opts, w) => { let t = u() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < opts.length; i++) { t -= w[i]; if (t <= 0) return opts[i]; } return opts[opts.length - 1]; };
const logit = (x) => 1 / (1 + Math.exp(-x));
const clampI = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round(x)));

// ── Non-response ──
// Email survey of 2,068 customers of a budgeting app (AAPOR dispositions).
export const EX_DISP = { I: 412, P: 38, R: 96, NC: 231, O: 12, UH: 1180, UO: 41, NE: 58 };
// Respondents by wave (1 = first invitation, 2 and 3 = reminders), with days to respond and three answers.
export function exWaves() {
  const u = rng(11), g = normalRng(12), out = ['wave,days_to_respond,satisfaction_1to7,uses_weekly,likely_to_recommend_0to10'];
  const sizes = [210, 140, 100];
  sizes.forEach((n, w) => {
    for (let i = 0; i < n; i++) {
      const days = w === 0 ? Math.floor(u() * 7) : w === 1 ? 7 + Math.floor(u() * 7) : 14 + Math.floor(u() * 10);
      const eng = 0.6 - 0.45 * w + g();
      const sat = clampI(5.2 - 0.35 * w + 0.6 * g() + 0.4 * eng, 1, 7);
      const weekly = u() < logit(0.9 - 0.55 * w + 0.6 * eng) ? 1 : 0;
      const ltr = clampI(7.4 - 0.25 * w + 1.6 * g(), 0, 10);
      out.push([w + 1, days, sat, weekly, ltr].join(','));
    }
  });
  return out.join('\n');
}
// Sample frame of 1,200 invited customers with frame variables and whether they responded.
export function exFrame() {
  const u = rng(21), out = ['customer_id,responded,plan,tenure_months,region,platform'];
  for (let i = 0; i < 1200; i++) {
    const plan = pick(u, ['Free', 'Pro', 'Team'], [0.55, 0.3, 0.15]);
    const region = pick(u, ['UK', 'EU', 'US'], [0.4, 0.3, 0.3]);
    const platform = pick(u, ['iOS', 'Android', 'Web'], [0.35, 0.35, 0.3]);
    const tenure = 1 + Math.floor(-Math.log(1 - u()) * 18);
    const eta = -1.35 + { Free: 0, Pro: 0.55, Team: 0.85 }[plan] + 0.018 * Math.min(tenure, 60) + { UK: 0.2, EU: 0, US: -0.25 }[region] + { iOS: 0, Android: -0.2, Web: 0.15 }[platform];
    out.push([`C${String(i + 1).padStart(4, '0')}`, u() < logit(eta) ? 1 : 0, plan, tenure, region, platform].join(','));
  }
  return out.join('\n');
}

// ── Sensitive questions ──
// "How many of these have you done in the last year?" Control items: changed a streaming plan, used a VPN, left an app
// review. Sensitive item (treatment only): shared my account password with someone outside my household.
export const EX_LIST = { control: [70, 215, 190, 45], treat: [50, 182, 196, 72, 15], direct: { x: 61, n: 498 }, label: 'shared their password outside their household' };
// Forced response with a die: 1 = say yes, 6 = say no, 2–5 = answer truthfully. "Have you used a work account for a
// personal purchase in the last year?"
export const EX_RR = { design: 'forced', yes: 214, n: 640, p: 0.75, pYes: 1 / 6, pNo: 1 / 6, label: 'used a work account for personal purchases' };

// ── Paired comparisons ──
// 40 people per pair chose between six homepage hero concepts (simulated from fixed Bradley-Terry worths).
export const EX_PAIR_NAMES = ['Product screenshot', 'Customer quote', 'Illustration', 'Photo of people', 'Video loop', 'Plain headline'];
export function exPairs() {
  const u = rng(31), w = [2.4, 1.7, 1.25, 1.1, 0.8, 0.45], k = w.length, W = w.map(() => w.map(() => 0));
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    for (let t = 0; t < 40; t++) { if (u() < w[i] / (w[i] + w[j])) W[i][j]++; else W[j][i]++; }
  }
  return [['Chosen \\ over', ...EX_PAIR_NAMES].join(','), ...EX_PAIR_NAMES.map((n, i) => [n, ...W[i]].join(','))].join('\n');
}
// Guttman: which of these do you do in your banking app? 160 respondents (simulated, cumulative with noise).
export const EX_G_ITEMS = ['Check balance', 'Pay a contact', 'Pay a bill', 'Set a savings goal', 'Use budgeting tool', 'Invest via app'];
export function exGuttman() {
  const u = rng(41), g = normalRng(42), diff = [-1.9, -0.9, -0.2, 0.5, 1.1, 1.9], out = [['respondent', ...EX_G_ITEMS].join(',')];
  for (let i = 0; i < 160; i++) {
    const th = g() * 1.3;
    out.push([`P${i + 1}`, ...diff.map((d) => (u() < logit(3.2 * (th - d)) ? 1 : 0))].join(','));
  }
  return out.join('\n');
}

// ── Importance-performance ──
// Stated: mean importance and performance (1–7) of a banking app's attributes, n = 312.
export const EX_STATED = `Attribute,Importance,Performance
Login speed,6.4,5.9
Payment reliability,6.7,6.3
Clear fees,6.2,4.6
Customer support,5.9,4.4
Spending insights,4.8,5.1
Savings tools,4.9,4.3
Card controls,5.6,5.8
App design,4.6,6.0
Notifications,4.4,5.4
Statements export,4.1,3.9`;
export const EX_STATED_N = 312;
// Derived: 260 respondents rated seven attributes (1–7) and overall satisfaction (0–10), simulated with a halo.
export const EX_D_ATTRS = ['Login_speed', 'Payment_reliability', 'Clear_fees', 'Customer_support', 'Spending_insights', 'Card_controls', 'App_design'];
export function exDerived() {
  const g = normalRng(51), w = [0.25, 0.55, 0.6, 0.45, 0.1, 0.2, 0.05], mu = [5.6, 6.0, 4.4, 4.3, 5.0, 5.6, 5.9], out = [[...EX_D_ATTRS, 'Overall_satisfaction'].join(',')];
  for (let i = 0; i < 260; i++) {
    const halo = g() * 0.7, x = mu.map((m) => m + halo + g() * 1.0);
    const sat = 7 + x.reduce((s, v, j) => s + w[j] * (v - mu[j]), 0) + g() * 0.9;
    out.push([...x.map((v) => clampI(v, 1, 7)), clampI(sat, 0, 10)].join(','));
  }
  return out.join('\n');
}
// KAP: security behaviours in a password manager survey.
export const EX_KAP = `Behaviour,Respondents,Know,Favour,Practise
Two-factor authentication,600,512,431,138
Password health check,600,402,330,151
Saved recovery codes,600,288,240,66
Login alerts,600,455,410,352`;
// Awareness-usefulness: features of an email client (aware asked before showing; useful = top-2-box after a trial).
export const EX_AWARE = `Feature,Asked awareness,Aware,Rated usefulness,Useful (top-2-box)
Scheduled send,120,30,120,98
Snooze,120,71,120,80
Templates,120,22,120,54
Undo send,120,96,120,101
Smart filters,120,41,120,49
Read receipts,120,88,120,39`;

// ── Anchoring vignettes ──
// Self-rating of "how easy is it to get help from support" (1 very hard … 5 very easy) and three vignettes describing
// support experiences at low, middle and high levels, in three markets (simulated: Japan rates harshly, Brazil leniently).
export function exVignettes() {
  const g = normalRng(61), out = ['market,self,vignette_low,vignette_mid,vignette_high'];
  const markets = [['UK', 0, 0], ['Japan', 0.35, 0.8], ['Brazil', -0.25, -0.6]];
  const cuts = [-1.5, -0.5, 0.5, 1.5];
  const rate = (v, shift) => 1 + cuts.filter((c) => v - shift > c).length;
  for (const [m, th, shift] of markets) for (let i = 0; i < 120; i++) {
    const t = th + g() * 0.9, s = shift + g() * 0.25;
    out.push([m, rate(t + g() * 0.3, s), rate(-1.3 + g() * 0.45, s), rate(0 + g() * 0.45, s), rate(1.3 + g() * 0.45, s)].join(','));
  }
  return out.join('\n');
}

// ── Norms ──
// An in-house 8-item usability scale (0–100) from 600 users across 12 products; slightly left-skewed.
export function exNormSample() {
  const g = normalRng(71), xs = [];
  for (let i = 0; i < 600; i++) { const v = 100 - Math.exp(3.2 + 0.33 * g()); xs.push(Math.max(0, Math.min(100, Math.round(v * 2) / 2))); }
  return xs;
}
export const EX_NORM_SCORES = '62 74 88';
export const EX_NORM_PARAMS = { M: 71.2, SD: 14.6, n: 380 };
export { r2 };
