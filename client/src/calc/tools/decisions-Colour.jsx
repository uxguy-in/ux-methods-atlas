import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as CC from './decisions-colour.js';
import { fmt } from './decisions-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Result, Stats, Problem, About } from './ui.jsx';
import './decisions.css';

// Example: a brand palette with a mid-grey caption colour that narrowly fails AA on white.
const EX = { fg: '#777777', bg: '#ffffff', palette: 'Ink #1b1f24\nBrand blue #2a6fdb\nBrand teal #12a594\nWarning amber #f5a524\nError red #d93025\nCaption grey #777777\nPaper #ffffff\nMist #eef2f6' };

function ColourField({ label, value, onChange }) {
  const rgb = CC.parseHex(value);
  return (
    <div className="dc-colour">
      <span>{label}</span>
      <div className="row">
        <input type="color" value={rgb ? CC.toHex(rgb) : '#000000'} aria-label={`${label} picker`} onChange={(e) => onChange(e.target.value)} />
        <input type="text" value={value} aria-label={`${label} hex`} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

// ── Colour contrast and difference ──
function DecColourContrast() {
  const [fgS, setFg] = useState(EX.fg);
  const [bgS, setBg] = useState(EX.bg);
  const [pal, setPal] = useState(EX.palette);
  const [view, setView] = useState('wcag');
  const fg = CC.parseHex(fgS), bg = CC.parseHex(bgS);
  const ok = fg && bg;
  const r = ok ? CC.contrast(fg, bg) : NaN, lc = ok ? CC.apca(fg, bg) : NaN, de = ok ? CC.deltaE(fg, bg) : NaN;
  const fix = ok && r < 4.5 ? CC.nearestPassing(fg, bg, 4.5) : null;
  const fix7 = ok && r < 7 ? CC.nearestPassing(fg, bg, 7) : null;
  const p = useMemo(() => CC.parsePalette(pal), [pal]);
  const mx = useMemo(() => CC.paletteMatrix(p.colours), [p]);
  const close = [];
  p.colours.forEach((a, i) => p.colours.forEach((b, j) => { if (j > i && mx[i][j].de < 5) close.push([a, b, mx[i][j].de]); }));
  const fgHex = ok ? CC.toHex(fg) : '', bgHex = ok ? CC.toHex(bg) : '';

  return (
    <div className="dc-root">
      <LoadExample onClick={() => { setFg(EX.fg); setBg(EX.bg); setPal(EX.palette); }} />
      <div className="dc-colours">
        <ColourField label="Text / foreground" value={fgS} onChange={setFg} />
        <ColourField label="Background" value={bgS} onChange={setBg} />
        <button type="button" className="btn ghost small" onClick={() => { setFg(bgS); setBg(fgS); }}>Swap</button>
      </div>
      {!ok ? <Problem>Enter both colours as hex, like #1b1f24 or #fff.</Problem> : (
        <>
          <div className="dc-swatch" style={{ background: bgHex, color: fgHex }} aria-label="Preview of the text on the background">
            <span className="lg">Large heading text</span>
            <span className="md">Body text at 16px. The quick brown fox jumps over the lazy dog, then checks the contrast.</span>
            <span className="sm">Small caption text at 13px</span>
          </div>
          <Result big={CC.ratioText(r)} tone={r >= 4.5 ? 'good' : 'bad'} label={`WCAG 2 contrast ratio: ${CC.wcagLevel(r) === 'Fail' ? 'fails every text level' : `${CC.wcagLevel(r)}${CC.wcagLevel(r) === 'AA large' ? ' only (large text and UI)' : ''}`}`}>
            <Stats rows={[
              ['APCA Lc', `${fmt(lc, 1)} (${CC.apcaUse(lc).min ? `≥ ${CC.apcaUse(lc).min}` : 'below 15'})`],
              ['CIEDE2000 ΔE', `${fmt(de, 2)}, ${CC.deBand(de).toLowerCase()}`],
              ['Relative luminance', `${fmt(CC.luminance(fg), 4)} / ${fmt(CC.luminance(bg), 4)}`],
            ]} />
          </Result>
          <Table num={false} label="WCAG 2 checks" head={['Criterion', 'Needs', 'Result']} rows={CC.wcagChecks(r).map((w) => [`${w.name} (SC ${w.sc})`, `${w.min}:1`, <span key="t" className={`qtag ${w.pass ? 'promote' : 'fix'}`}>{w.pass ? 'Pass' : 'Fail'}</span>])} />
          <Table num={false} label="APCA guidance" head={['APCA level (Bronze simple mode)', '|Lc| needed', 'This pair']} rows={CC.APCA_LEVELS.map((l) => [l.use, l.min, <span key="t" className={`qtag ${Math.abs(lc) >= l.min ? 'promote' : 'fix'}`}>{Math.abs(lc) >= l.min ? 'Meets' : 'Below'}</span>])} />
          {(fix || fix7) && (
            <section className="ea-card">
              <h4>Nearest passing text colour (same hue, adjusted lightness)</h4>
              <div className="dc-actions">
                {[[fix, 'AA 4.5:1'], [fix7, 'AAA 7:1']].filter(([x]) => x).map(([x, t]) => (
                  <button key={t} type="button" className="btn ghost small" onClick={() => setFg(CC.toHex(x.rgb))}>
                    <span className="dc-chip" style={{ background: CC.toHex(x.rgb) }} />{t}: {CC.toHex(x.rgb)} ({CC.ratioText(x.ratio)}, ΔE {fmt(x.de, 1)})
                  </button>
                ))}
              </div>
            </section>
          )}
          <StudySummary {...CC.colourSummary({ fg, bg, fgHex, bgHex, ratio: r, lc, de })} />
        </>
      )}
      <h3 className="clu-h3">Palette matrix</h3>
      <Area label="Palette: one colour per line, optionally with a name (up to 12)" value={pal} onChange={setPal} rows={6} />
      {p.errors.length > 0 && <Problem>{p.errors.slice(0, 3).join(' · ')}</Problem>}
      {p.colours.length >= 2 && (
        <>
          <div className="dc-tabs" role="group" aria-label="Matrix values">
            {[['wcag', 'WCAG ratio'], ['apca', 'APCA Lc'], ['de', 'ΔE2000']].map(([k, l]) => <button key={k} type="button" className={`btn small ${view === k ? '' : 'ghost'}`} onClick={() => setView(k)}>{l}</button>)}
          </div>
          <div className="clu-scroll ea-contain"><table className="clu-table dc-pm" aria-label="Palette matrix: text colour in rows on background colour in columns">
            <thead><tr><th>Text \ background</th>{p.colours.map((c, j) => <th key={j}><span className="dc-chip" style={{ background: c.hex }} />{c.name}</th>)}</tr></thead>
            <tbody>{p.colours.map((a, i) => (
              <tr key={i}><th scope="row"><span className="dc-chip" style={{ background: a.hex }} />{a.name}</th>{p.colours.map((b, j) => {
                const v = mx[i][j];
                if (i === j) return <td key={j} className="cell same">·</td>;
                if (view === 'wcag') { const lv = CC.wcagLevel(v.ratio); return <td key={j} className="cell">{CC.ratioText(v.ratio).replace(':1', '')}<span className={`s ${lv === 'Fail' ? 'fail' : lv === 'AA large' ? 'large' : 'aa'}`}>{lv}</span></td>; }
                if (view === 'apca') return <td key={j} className="cell">{fmt(v.lc, 0)}<span className={`s ${Math.abs(v.lc) >= 75 ? 'aa' : Math.abs(v.lc) >= 45 ? 'large' : 'fail'}`}>{Math.abs(v.lc) >= 75 ? 'Body' : Math.abs(v.lc) >= 60 ? 'Content' : Math.abs(v.lc) >= 45 ? 'Large' : 'Low'}</span></td>;
                return <td key={j} className="cell">{fmt(v.de, 1)}<span className={`s ${v.de < 2 ? 'fail' : v.de < 5 ? 'large' : 'aa'}`}>{v.de < 2 ? 'Same?' : v.de < 5 ? 'Close' : 'Distinct'}</span></td>;
              })}</tr>
            ))}</tbody>
          </table></div>
          <p className="dc-note">{view === 'wcag' ? 'AAA ≥ 7, AA ≥ 4.5, AA large ≥ 3 (large text and UI components only).' : view === 'apca' ? 'Rows are text, columns background; Body ≥ 75, Content ≥ 60, Large ≥ 45 (APCA Bronze simple mode).' : 'Below 2: easily confused side by side; below 5: close. Watch pairs used for different meanings, such as chart series or status colours.'}</p>
          {close.length > 0 && <p className="dc-note">Pairs closer than ΔE 5: {close.map(([a, b, d]) => `${a.name} / ${b.name} (${fmt(d, 1)})`).join(', ')}.</p>}
        </>
      )}
      <About method="perceptual-colour-difference-check-in-a-uniform-colour-space" links={[['accessibility-evaluation', 'Accessibility evaluation'], ['just-noticeable-difference-and-weber-fraction-testing', 'Just noticeable difference']]}>
        <p><b>WCAG 2 contrast ratio</b> (WCAG 2.2, "contrast ratio" and "relative luminance" definitions): each sRGB channel is linearised (c/12.92 at or below 0.04045, else ((c + 0.055)/1.055)^2.4), L = 0.2126 R + 0.7152 G + 0.0722 B, and the ratio is (L_lighter + 0.05)/(L_darker + 0.05), from 1:1 to 21:1. Thresholds: 4.5:1 for normal text and 3:1 for large text (24px, or 18.66px bold) at AA (SC 1.4.3); 7:1 and 4.5:1 at AAA (SC 1.4.6); 3:1 for UI components and graphics (SC 1.4.11). The ratio is not rounded before comparing: 4.48:1 (#777 on white) fails, 4.54:1 (#767676) passes.</p>
        <p><b>APCA</b> (Accessible Perceptual Contrast Algorithm, Myndex), as implemented in APCA-W3 version 0.1.9 with the 0.0.98G-4g constants: Y = 0.2126729 R^2.4 + 0.7151522 G^2.4 + 0.072175 B^2.4 (simple exponent, no linear segment), a soft clamp near black (Y + (0.022 − Y)^1.414 below 0.022), then Lc = 100 × 1.14 × (Ybg^0.56 − Ytxt^0.57) − 2.7 for dark text on light, or 100 × 1.14 × (Ybg^0.65 − Ytxt^0.62) + 2.7 for light text on dark, with values under 10 clipped to 0. Checked against the reference values: #888 on #fff Lc 63.06, #fff on #888 −68.54, #000 on #aaa 58.15, #aaa on #000 −56.24, black on white 106.04, white on black −107.88. Use levels follow the APCA Readability Criterion's Bronze simple mode.</p>
        <p><b>CIEDE2000</b> (CIE 142-2001) between colours converted to CIELAB with the D65 white point, implemented following Sharma, Wu and Dalal (2005), "The CIEDE2000 color-difference formula: implementation notes, supplementary test data, and mathematical observations", Color Research and Application 30(1). All 34 of their test pairs are reproduced to 4 decimal places, in both directions. As a rule of thumb ΔE2000 near 1 is about one just-noticeable difference for colours side by side.</p>
        <p><b>Nearest passing colour</b> keeps the text colour's CIELAB a* and b* and searches lightness L* in steps of 0.25 for the passing colour with the smallest ΔE2000 change (clipped to the sRGB gamut).</p>
        <p><b>When not to use it.</b> Contrast checks assume solid colours; text on images, gradients or semi-transparent layers must be measured at the worst point. Neither formula accounts for font weight and size beyond the thresholds, or for colour vision deficiencies: check those separately.</p>
      </About>
    </div>
  );
}

export default DecColourContrast;
