// Colour contrast and colour difference: WCAG 2.x contrast ratio, APCA Lc (APCA-W3 0.1.9, constants 0.0.98G-4g),
// CIEDE2000 ΔE between colours, a palette matrix and the nearest passing colour. Pure functions; checked in
// server/scripts/check-decisions.js against Sharma, Wu and Dalal's (2005) CIEDE2000 test data, the APCA reference
// values and known WCAG pairs.
import { fmt } from './decisions-core.js';

export function parseHex(s) {
  const t = String(s || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t)) return [...t].map((c) => parseInt(c + c, 16));
  if (/^[0-9a-f]{6}$/i.test(t)) return [0, 2, 4].map((i) => parseInt(t.slice(i, i + 2), 16));
  return null;
}
export const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

// ── WCAG 2.x ──
// Relative luminance with the sRGB transfer function (WCAG 2.2 uses 0.04045 as the linear threshold; WCAG 2.0's
// 0.03928 gives identical results for 8-bit colours).
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// Pass/fail uses the unrounded ratio (WCAG has no rounding: 4.499:1 fails 4.5:1); display truncates to 2 decimals.
export const ratioText = (r) => `${(Math.floor(r * 100) / 100).toFixed(2)}:1`;
export const WCAG = [
  { id: 'aa-normal', name: 'AA, normal text', min: 4.5, sc: '1.4.3' },
  { id: 'aa-large', name: 'AA, large text (24px, or 18.66px bold)', min: 3, sc: '1.4.3' },
  { id: 'aaa-normal', name: 'AAA, normal text', min: 7, sc: '1.4.6' },
  { id: 'aaa-large', name: 'AAA, large text', min: 4.5, sc: '1.4.6' },
  { id: 'ui', name: 'AA, UI components and graphics', min: 3, sc: '1.4.11' },
];
export const wcagChecks = (r) => WCAG.map((w) => ({ ...w, pass: r >= w.min }));
export const wcagLevel = (r) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA large' : 'Fail');

// ── APCA (Accessible Perceptual Contrast Algorithm), APCA-W3 0.1.9 / 0.0.98G-4g constants ──
const A = {
  mainTRC: 2.4, sRco: 0.2126729, sGco: 0.7151522, sBco: 0.072175,
  normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65,
  blkThrs: 0.022, blkClmp: 1.414, scaleBoW: 1.14, scaleWoB: 1.14,
  loBoWoffset: 0.027, loWoBoffset: 0.027, deltaYmin: 0.0005, loClip: 0.1,
};
export const apcaY = (rgb) => A.sRco * (rgb[0] / 255) ** A.mainTRC + A.sGco * (rgb[1] / 255) ** A.mainTRC + A.sBco * (rgb[2] / 255) ** A.mainTRC;
// Lc for text colour on background colour; positive for dark text on light, negative for light text on dark.
export function apca(txt, bg) {
  let yt = apcaY(txt), yb = apcaY(bg);
  if (yt <= A.blkThrs) yt += (A.blkThrs - yt) ** A.blkClmp;
  if (yb <= A.blkThrs) yb += (A.blkThrs - yb) ** A.blkClmp;
  if (Math.abs(yb - yt) < A.deltaYmin) return 0;
  let out;
  if (yb > yt) {
    const s = (yb ** A.normBG - yt ** A.normTXT) * A.scaleBoW;
    out = s < A.loClip ? 0 : s - A.loBoWoffset;
  } else {
    const s = (yb ** A.revBG - yt ** A.revTXT) * A.scaleWoB;
    out = s > -A.loClip ? 0 : s + A.loWoBoffset;
  }
  return out * 100;
}
// APCA Readability Criterion, Bronze simple mode: minimum |Lc| by use.
export const APCA_LEVELS = [
  { min: 90, use: 'Preferred for body text and columns of text' },
  { min: 75, use: 'Minimum for body text (about 18px normal weight)' },
  { min: 60, use: 'Minimum for other readable content text (about 24px normal or 16px bold)' },
  { min: 45, use: 'Minimum for large text and headlines (36px normal or 24px bold), and for pictograms' },
  { min: 30, use: 'Absolute minimum for any text: placeholders, disabled text, copyright lines' },
  { min: 15, use: 'Minimum for non-text elements such as dividers and outlines' },
];
export const apcaUse = (lc) => APCA_LEVELS.find((l) => Math.abs(lc) >= l.min) || { min: 0, use: 'Not enough contrast for text or meaningful graphics' };

// ── CIELAB and CIEDE2000 ──
const M = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]];
const MI = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
const WHITE = [0.95047, 1, 1.08883];
const d3 = 6 / 29;
const f = (t) => (t > d3 ** 3 ? Math.cbrt(t) : t / (3 * d3 * d3) + 4 / 29);
const fi = (t) => (t > d3 ? t ** 3 : 3 * d3 * d3 * (t - 4 / 29));
export function toLab(rgb) {
  const l = rgb.map(lin);
  const xyz = M.map((r) => r[0] * l[0] + r[1] * l[1] + r[2] * l[2]);
  const [fx, fy, fz] = xyz.map((v, i) => f(v / WHITE[i]));
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const gam = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
export function fromLab([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const xyz = [fi(fx) * WHITE[0], fi(fy) * WHITE[1], fi(fz) * WHITE[2]];
  const lr = MI.map((r) => r[0] * xyz[0] + r[1] * xyz[1] + r[2] * xyz[2]);
  return lr.map((v) => Math.round(255 * Math.min(1, Math.max(0, gam(Math.max(0, v))))));
}
// CIEDE2000 (CIE 142-2001), implemented as in Sharma, Wu and Dalal (2005), with kL = kC = kH = 1.
export function deltaE2000(lab1, lab2, kL = 1, kC = 1, kH = 1) {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (b, a) => { if (b === 0 && a === 0) return 0; const h = Math.atan2(b, a) * deg; return h < 0 ? h + 360 : h; };
  const h1p = hp(b1, a1p), h2p = hp(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / (kL * Sl)) ** 2 + (dCp / (kC * Sc)) ** 2 + (dHp / (kH * Sh)) ** 2 + Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh)));
}
export const deltaE = (rgb1, rgb2) => deltaE2000(toLab(rgb1), toLab(rgb2));
export function deBand(d) {
  return d < 1 ? 'Not perceptible' : d < 2 ? 'Barely perceptible side by side' : d < 5 ? 'Noticeable side by side' : d < 10 ? 'Clearly different' : 'Very different';
}

// Nearest colour to `fg` (same CIELAB a* and b*, changed lightness) reaching `target` contrast against `bg`.
// Searches lightness both darker and lighter and returns the passing colour with the smallest ΔE2000 change.
export function nearestPassing(fg, bg, target = 4.5) {
  if (contrast(fg, bg) >= target) return { rgb: fg, de: 0, ratio: contrast(fg, bg) };
  const [, a, b] = toLab(fg), L0 = toLab(fg)[0];
  let best = null;
  for (let L = 0; L <= 100; L += 0.25) {
    const rgb = fromLab([L, a, b]), r = contrast(rgb, bg);
    if (r >= target) { const de = deltaE(fg, rgb); if (!best || de < best.de || (de === best.de && Math.abs(L - L0) < Math.abs(best.L - L0))) best = { rgb, de, ratio: r, L }; }
  }
  if (!best) { const bw = [[0, 0, 0], [255, 255, 255]].map((rgb) => ({ rgb, ratio: contrast(rgb, bg), de: deltaE(fg, rgb) })).filter((x) => x.ratio >= target).sort((x, y) => x.de - y.de)[0]; return bw || null; }
  return best;
}

// Palette: "name #hex" or "#hex" per line.
export function parsePalette(text) {
  const out = [], errors = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim(); if (!t) return;
    const m = /(#?[0-9a-f]{6}|#[0-9a-f]{3})\b/i.exec(t);
    const rgb = m && parseHex(m[1]);
    if (!rgb) { errors.push(`Line ${i + 1}: no hex colour found`); return; }
    const name = t.replace(m[0], '').replace(/[,:;=]/g, ' ').trim() || toHex(rgb);
    out.push({ name, rgb, hex: toHex(rgb) });
  });
  return { colours: out.slice(0, 12), errors };
}
export function paletteMatrix(colours) {
  return colours.map((a) => colours.map((b) => ({ ratio: contrast(a.rgb, b.rgb), lc: apca(a.rgb, b.rgb), de: deltaE(a.rgb, b.rgb) })));
}

// "Reading your results" summary.
// Confidence rule (how safely the verdict holds on real screens):
//   low    — WCAG 2 and APCA disagree about body text (WCAG AA passes but |Lc| < 75, or WCAG fails but |Lc| ≥ 75);
//   medium — they agree, but the ratio is within 0.5 of a WCAG threshold (3, 4.5 or 7), where font weight,
//            anti-aliasing and display settings can tip the real-world result;
//   high   — they agree and the ratio is at least 0.5 away from every threshold.
export function colourSummary({ fg, bg, fgHex, bgHex, ratio, lc, de }) {
  const aa = ratio >= 4.5, apcaBody = Math.abs(lc) >= 75;
  const near = [3, 4.5, 7].some((t) => Math.abs(ratio - t) < 0.5);
  const confidence = aa !== apcaBody ? 'low' : near ? 'medium' : 'high';
  const r = ratioText(ratio);
  const headline = `${fgHex} on ${bgHex} has a contrast ratio of ${r}: it ${aa ? 'passes' : 'fails'} WCAG AA for normal text${aa ? (ratio >= 7 ? ' and AAA' : ', but not AAA (7:1)') : ratio >= 3 ? ', but passes for large text and UI components (3:1)' : ' and for large text'}.`;
  const meaning = [
    `APCA gives Lc ${fmt(lc, 1)} (${lc >= 0 ? 'dark text on a light background' : 'light text on a dark background'}): ${apcaUse(lc).use.toLowerCase()}.`,
    aa !== apcaBody ? (aa ? 'WCAG 2 passes this pair but APCA rates it below body-text level; WCAG 2\'s formula is known to overrate light text on dark colours and mid-tone pairs.' : 'APCA rates this pair as readable for body text even though WCAG 2 fails it; for conformance, WCAG 2 is still the standard that applies.') : `WCAG 2 and APCA agree on this pair for body text.`,
    `The two colours are ${fmt(de, 1)} ΔE2000 apart: ${deBand(de).toLowerCase()} as colours (ΔE measures hue and chroma too, so a large ΔE does not mean enough contrast).`,
  ];
  const caveats = [
    'Contrast is not the only readability factor: thin or small fonts need more contrast than the minimum, and text over images or gradients needs checking at its worst point.',
    'APCA is the candidate method for WCAG 3, still in draft; legal and procurement requirements today refer to WCAG 2 ratios.',
  ];
  const next = [
    aa ? 'Check the other colour pairs in your palette with the matrix below, including hover, disabled and focus states.' : 'Use the suggested nearest passing colour, or darken the text / lighten the background until the ratio reaches 4.5:1.',
    'Do not rely on colour alone to carry meaning; add text, icons or patterns (WCAG 1.4.1).',
  ];
  const report = `Text ${fgHex} on background ${bgHex}: WCAG 2 contrast ratio ${r} (${aa ? 'passes' : 'fails'} AA for normal text; ${ratio >= 3 ? 'passes' : 'fails'} 3:1 for large text and UI), APCA Lc ${fmt(lc, 1)}, CIEDE2000 ΔE ${fmt(de, 1)}.`;
  return {
    headline, meaning, confidence,
    confidenceNote: 'High when WCAG 2 and APCA agree on body text and the ratio is at least 0.5 away from the 3, 4.5 and 7 thresholds; medium when they agree but the ratio is close to a threshold; low when the two methods disagree. The formulas are exact; this is about how safely the verdict holds for real readers and screens.',
    caveats, next, report,
  };
}
