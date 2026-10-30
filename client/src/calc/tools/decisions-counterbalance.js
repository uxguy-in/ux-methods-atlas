// Counterbalancing for within-subjects studies: cyclic Latin squares, Williams designs (balanced for first-order
// carryover), all orders for small k, participant-to-order assignment, a balance check and the "Reading your results"
// summary. Pure functions; checked in server/scripts/check-decisions.js.
import { rng, toCsv, fmt } from './decisions-core.js';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Cyclic Latin square: row i is (i, i+1, …) mod k. Every condition appears once in every position, but each
// condition is always followed by the same one, so carryover is confounded with order.
export function cyclicSquare(k) {
  return Array.from({ length: k }, (_, i) => Array.from({ length: k }, (__, j) => (i + j) % k));
}

// Williams (1949) design. First row 0, 1, k−1, 2, k−2, …; row i adds i (mod k). For even k these k rows are
// balanced for first-order carryover: every condition follows every other exactly once. For odd k no single square
// can do that, so the k mirror-image rows are added (2k rows, every ordered pair exactly twice).
export function williams(k) {
  const first = [0]; let lo = 1, hi = k - 1;
  for (let j = 1; j < k; j++) first.push(j % 2 ? lo++ : hi--);
  const rows = Array.from({ length: k }, (_, i) => first.map((c) => (c + i) % k));
  return k % 2 ? [...rows, ...rows.map((r) => [...r].reverse())] : rows;
}

// Every possible order (k!), lexicographic. Only sensible for k ≤ 6 (720 orders).
export function permutations(k) {
  const out = [];
  const go = (pre, rest) => {
    if (!rest.length) { out.push(pre); return; }
    rest.forEach((c, i) => go([...pre, c], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  go([], Array.from({ length: k }, (_, i) => i));
  return out;
}
const fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));
export const designSize = (k, design) => (design === 'full' ? fact(k) : design === 'williams' ? (k % 2 ? 2 * k : k) : k);

export function makeDesign(k, design) {
  if (design === 'full') return permutations(k);
  if (design === 'williams') return williams(k);
  return cyclicSquare(k);
}

// Shuffle with a seed (Fisher-Yates).
export function shuffle(arr, seed) {
  const r = rng(seed), a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Assign participants to orders. Orders are used in turn (participant p gets order p mod R) so every complete block of R
// participants is balanced. With randomise on, the order of the rows and which condition gets which letter are
// shuffled with the seed, which keeps the balance but removes any systematic link between letters and conditions.
export function assign({ k, design, n, randomise = true, seed = 1 }) {
  const base = makeDesign(k, design);
  const relabel = randomise ? shuffle([...Array(k).keys()], seed) : [...Array(k).keys()];
  const rows = (randomise ? shuffle(base, seed + 7919) : base).map((r) => r.map((c) => relabel[c]));
  const list = Array.from({ length: n }, (_, p) => ({ p: p + 1, row: p % rows.length, order: rows[p % rows.length] }));
  return { rows, list, R: rows.length, relabel };
}

// Balance of a set of orders (as used by the participants): how often each condition sits in each position, and how
// often each condition immediately follows each other one.
export function balance(orders, k) {
  const pos = Array.from({ length: k }, () => new Array(k).fill(0));
  const carry = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const o of orders) {
    o.forEach((c, j) => { pos[c][j]++; });
    for (let j = 1; j < o.length; j++) carry[o[j - 1]][o[j]]++;
  }
  const posVals = pos.flat();
  const carryVals = carry.flatMap((r, i) => r.filter((_, j) => j !== i));
  const spread = (v) => (v.length ? Math.max(...v) - Math.min(...v) : 0);
  return {
    pos, carry,
    posSpread: spread(posVals), carrySpread: spread(carryVals),
    posBalanced: spread(posVals) === 0, carryBalanced: spread(carryVals) === 0,
    carryMissing: carryVals.filter((v) => v === 0).length,
    selfFollow: carry.some((r, i) => r[i] > 0),
  };
}

export const orderText = (o, names) => o.map((c) => names[c] ?? LETTERS[c]).join(' → ');

export function assignmentCsv(list, names) {
  const k = list[0]?.order.length || 0;
  const head = ['participant', 'order_number', ...Array.from({ length: k }, (_, j) => `position_${j + 1}`)];
  return toCsv([head, ...list.map((r) => [r.p, r.row + 1, ...r.order.map((c) => names[c] ?? LETTERS[c])])]);
}

// "Reading your results" summary.
// Confidence rule (how well the plan protects against order effects):
//   high   — every condition appears equally often in every position AND (for Williams or full designs) every
//            condition follows every other equally often, i.e. the participant count is a whole multiple of the orders;
//   medium — participants cover every order at least once but not a whole number of times, so balance is close but not exact;
//   low    — fewer participants than orders, or a cyclic square whose carryover is confounded with order.
export function counterbalanceSummary({ k, design, n, R, bal, names }) {
  const full = n > 0 && n % R === 0;
  const designName = design === 'williams' ? 'Williams design' : design === 'full' ? 'full set of orders' : 'cyclic Latin square';
  const confidence = n < R || (design === 'latin' && k > 2) ? 'low' : full && bal.posBalanced && (design === 'latin' || bal.carryBalanced) ? 'high' : 'medium';
  const blocks = Math.floor(n / R), extra = n % R;
  const headline = full
    ? `${n} participants fill the ${R} orders of a ${designName} exactly ${blocks === 1 ? 'once' : `${blocks} times`}, so every condition appears equally often in every position.`
    : n < R
      ? `${n} participants are not enough for the ${R} orders of a ${designName}: at least ${R} are needed for every order to be used once.`
      : `${n} participants cover the ${R} orders of a ${designName} ${blocks} time${blocks === 1 ? '' : 's'} with ${extra} left over, so balance is close but not exact.`;
  const meaning = [
    `Each of the ${k} conditions (${names.slice(0, k).join(', ')}) is tried by every participant, in one of ${R} different orders.`,
    bal.posBalanced ? 'Position balance: each condition is first, second, … equally often, so practice and fatigue effects cancel out in the condition means.' : `Position balance is off by up to ${bal.posSpread} participant${bal.posSpread === 1 ? '' : 's'} in a cell; add ${R - extra} more participant${R - extra === 1 ? '' : 's'} to complete the block.`,
    design === 'latin' && k > 2
      ? 'A cyclic square does not balance carryover: each condition is always followed by the same one, so a lasting effect of one condition is mixed up with the next.'
      : bal.carryBalanced ? 'Carryover balance: each condition comes straight after every other condition equally often, so first-order carryover cancels out too (Williams 1949).' : `Carryover is not fully balanced: some condition pairs follow each other up to ${bal.carrySpread} more times than others.`,
  ];
  const caveats = [
    'Counterbalancing evens out order effects; it does not remove them. If one condition changes how people do the next (asymmetric transfer), analyse the first position separately or switch to a between-subjects design.',
    k % 2 && design === 'williams' ? 'With an odd number of conditions a Williams design needs twice as many orders (each square plus its mirror image), so recruit in multiples of the doubled count.' : 'Assign orders before the sessions and keep to them; swapping participants between orders on the day breaks the balance.',
  ];
  const next = [
    full ? 'Export the assignment table and give each participant ID its order in your session plan.' : `Recruit ${n < R ? R - n : R - extra} more participant${(n < R ? R - n : R - extra) === 1 ? '' : 's'} (to ${n < R ? R : n + R - extra}) so every order is used equally often.`,
    'Record each participant\'s order with their data so you can check for an order or position effect in the analysis (position as a factor).',
  ];
  const report = n < R ? `A ${designName} for ${k} conditions needs ${R} orders; with ${n} participants only ${n} of them are used, so the design is not balanced.` : `We used a ${designName} for ${k} conditions (${R} orders) with ${n} participants${full ? `, each order used ${blocks === 1 ? 'once' : `${blocks} times`}` : `; ${extra} participants were added beyond ${blocks} complete block${blocks === 1 ? '' : 's'}`}. ${bal.posBalanced ? 'Each condition appeared equally often in each position' : 'Position counts differed by at most ' + fmt(bal.posSpread)}${design !== 'latin' || k <= 2 ? (bal.carryBalanced ? ' and each condition followed every other equally often.' : '.') : '.'}`;
  return {
    headline, meaning, confidence,
    confidenceNote: 'High when the participant count is a whole multiple of the orders and both position and (for Williams or full designs) carryover counts are exactly equal; medium when every order is used but not equally often; low with fewer participants than orders or a cyclic square, which confounds carryover.',
    caveats, next, report,
  };
}
