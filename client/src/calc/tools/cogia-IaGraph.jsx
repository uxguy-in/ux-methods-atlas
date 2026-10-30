import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as GR from './cogia-graph.js';
import { fmt, sig } from './cogia-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Pick, Result, Stats, Problem, About, Bars, download } from './ui.jsx';
import IaGraphBuilder from './cogia-IaGraphBuilder.jsx';
import './cogia.css';

const short = (s, k = 22) => (s.length > k ? `${s.slice(0, k - 1)}…` : s);

// The graph drawn with the chosen layout. Node area follows PageRank; colour marks home, dead ends and unreachable
// pages. Clicking a page highlights its shortest click path from home.
function GraphSvg({ r, layout, sel, onSel }) {
  const L = useMemo(() => (layout === 'tree' ? GR.treeLayout(r) : GR.forceLayout(r)), [r, layout]);
  const tree = layout === 'tree', padL = tree ? 14 : 0, padT = tree ? 16 : 0;
  const W = L.width + (tree ? 150 : 0), H = L.height + (tree ? 24 : 0);
  const P = (i) => ({ x: L.pos[i].x + padL, y: L.pos[i].y + padT });
  const maxPr = Math.max(...r.pages.map((p) => p.pagerank));
  const rad = (i) => 3.5 + 7 * Math.sqrt(r.pages[i].pagerank / maxPr);
  const onPath = new Set(); const path = sel >= 0 ? r.pages[sel].path : [];
  for (let k = 0; k + 1 < path.length; k++) onPath.add(`${path[k]}>${path[k + 1]}`);
  const edges = [];
  for (let v = 0; v < r.n; v++) for (const w of r.out[v]) edges.push([v, w, r.bfsParent[w] === v]);
  const cls = (i) => (i === r.home ? 'home' : r.pages[i].unreachable ? 'lost' : r.pages[i].deadEnd ? 'dead' : '');
  return (
    <figure className="ea-fig">
      <div className="cg-wrap" style={tree ? { maxHeight: 640, overflowY: 'auto' } : undefined}>
        <svg viewBox={`0 0 ${W} ${H}`} width={tree ? W : undefined} className={`cg-plot${tree ? '' : ' cg-force'}`} style={tree ? undefined : { width: '100%', height: 'auto', minWidth: 560 }} role="img" aria-label={`Site graph, ${tree ? 'tree' : 'force'} layout`}>
          <defs><marker id="cg-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--ink-3)' }} /></marker></defs>
          {edges.map(([v, w, isTree], k) => {
            const a = P(v), b = P(w), hl = onPath.has(`${v}>${w}`);
            if (tree && isTree) return <path key={k} d={`M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`} className={`edge${hl ? ' hl' : ''}`} />;
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, rb = rad(w) + 2;
            const bx = b.x - (dx / d) * rb, by = b.y - (dy / d) * rb;
            const mx = (a.x + bx) / 2 - (dy / d) * Math.min(40, d * 0.15), my = (a.y + by) / 2 + (dx / d) * Math.min(40, d * 0.15);
            return <path key={k} d={`M${a.x},${a.y} Q${mx},${my} ${bx},${by}`} className={`edge${tree ? ' cross' : ''}${hl ? ' hl' : ''}`} markerEnd="url(#cg-arr)" />;
          })}
          {r.pages.map((p, i) => { const q = P(i); return (
            <g key={i} onClick={() => onSel(i === sel ? -1 : i)} style={{ cursor: 'pointer' }}>
              <circle cx={q.x} cy={q.y} r={rad(i)} className={`nd ${cls(i)}${i === sel ? ' sel' : ''}`}><title>{`${p.name}: ${Number.isFinite(p.depth) ? `${p.depth} clicks` : 'unreachable'}, PageRank ${fmt(p.pagerank, 3)}`}</title></circle>
              <text x={q.x + rad(i) + 4} y={q.y + 4} className={`halo${i === sel ? ' b' : ''}`}>{short(p.name)}</text>
            </g>
          ); })}
        </svg>
      </div>
      <ul className="cg-legend">
        <li><i style={{ background: 'var(--ink)' }} />Home</li><li><i style={{ background: 'var(--c1)' }} />Page (size = PageRank)</li>
        <li><i style={{ background: 'var(--warn)' }} />Dead end</li><li><i style={{ background: 'var(--bad)' }} />Cannot be reached</li>
        {tree && <li><i className="ln" style={{ background: 'var(--c4)' }} />Cross-link</li>}
      </ul>
    </figure>
  );
}

// A plain-language guide to describing a site, with a tiny annotated example.
function HowToDescribe() {
  return (
    <details className="cg-howto">
      <summary>How to describe your site</summary>
      <ol className="cg-steps">
        <li><b>Start with the home page.</b> It is the first line, with nothing in front of it.</li>
        <li><b>List the main sections under it</b>, one per line, indented two spaces. Each page links to the pages listed under it.</li>
        <li><b>Go deeper the same way:</b> indent two more spaces to put a page under a section. In the form, use <b>+ Add a child page</b>, or <b>In →</b> and <b>← Out</b> to move a page.</li>
        <li><b>Add cross-links</b>: links that do not follow the sitemap, such as a "Basket" button on every product page. Write one per line as <span className="cg-mono">From page -&gt; To page</span>, or add them under Cross-links in the form.</li>
        <li><b>Already have a sitemap?</b> Switch to the text view and paste it in: an exported or copied outline with tabs, spaces, bullets (- or *) or numbers (1.2) works as it is. Names match regardless of case, so "Contact us" and "contact Us" are the same page.</li>
      </ol>
      <pre className="cg-annot">{`Home                  ← the home page
  Shop                ← a section: Home links to Shop
    Shoes             ← a page in Shop
  Help
    Contact us
# Cross-links         ← lines starting with # are notes
Shoes -> Contact us   ← an extra link from Shoes to Contact us`}</pre>
      <p className="cg-note">The options below the editor can add the links most sites have on every page: a link back to the parent page (breadcrumbs) and a link to home (the logo).</p>
    </details>
  );
}

const SORTS = [['pagerank', 'PageRank'], ['betweenness', 'Betweenness'], ['closeness', 'Closeness (out)'], ['integration', 'Integration'], ['depth', 'Clicks from home'], ['input', 'Input order']];

function CogiaIaGraph() {
  const [text, setText] = useState(GR.EXAMPLE);
  const [upLinks, setUpLinks] = useState(false);
  const [homeLinks, setHomeLinks] = useState(false);
  const [homeName, setHomeName] = useState('');
  const [layout, setLayout] = useState('tree');
  const [mode, setMode] = useState('form');
  const [sort, setSort] = useState('pagerank');
  const [sel, setSel] = useState(-1);
  const load = () => { setText(GR.EXAMPLE); setUpLinks(false); setHomeLinks(false); setHomeName(''); setSel(-1); };
  const g = useMemo(() => GR.parseGraph(text, { upLinks, homeLinks }), [text, upLinks, homeLinks]);
  const home = Math.max(0, g.names.indexOf(homeName));
  const r = useMemo(() => GR.analyseGraph(g, home), [g, home]);
  const ok = r && !r.error;
  const selI = ok && sel < r.n ? sel : -1;
  const rows = ok ? [...r.pages].sort((a, b) => (sort === 'input' ? a.i - b.i : sort === 'depth' ? (Number.isFinite(a.depth) ? a.depth : 1e9) - (Number.isFinite(b.depth) ? b.depth : 1e9) || a.i - b.i : (Number.isFinite(b[sort]) ? b[sort] : -1) - (Number.isFinite(a[sort]) ? a[sort] : -1))) : [];
  const flags = (p) => [p.i === r.home && <span key="h" className="cg-flag ok">home</span>, p.unreachable && <span key="u" className="cg-flag bad">unreachable</span>, p.orphan && <span key="o" className="cg-flag bad">orphan</span>, p.deadEnd && <span key="d" className="cg-flag warn">dead end</span>].filter(Boolean);

  return (
    <div className="cg-root">
      <LoadExample onClick={load} />
      <HowToDescribe />
      <Choice label="Describe your site with" value={mode} onChange={setMode} options={[['form', 'A form'], ['text', 'The text']]} />
      {mode === 'form'
        ? <IaGraphBuilder text={text} onChange={(v) => { setText(v); setSel(-1); }} />
        : <Area label="Sitemap (indent children under their parent) and/or links, one per line as From -> To" value={text} onChange={(v) => { setText(v); setSel(-1); }} rows={10} wrap="off" hint="Indent with spaces or tabs; bullets (-, *) are ignored. A line with ->, → or a tab between two names is a link. Lines starting with # are comments. Names match regardless of case. See How to describe your site above." />}
      <div className="calc-inputs">
        <label className="tl-check"><input type="checkbox" checked={upLinks} onChange={(e) => setUpLinks(e.target.checked)} /> Child pages link back to their parent (breadcrumbs)</label>
        <label className="tl-check"><input type="checkbox" checked={homeLinks} onChange={(e) => setHomeLinks(e.target.checked)} /> Every page links to home (logo)</label>
        {g.names.length > 1 && <Pick label="Home page" value={g.names[home]} onChange={(v) => { setHomeName(v); setSel(-1); }} options={g.names.map((n) => [n, n])} />}
      </div>
      {g.problems.length > 0 && <Problem>{g.problems[0]}</Problem>}
      {r.error && <Problem>{r.error}</Problem>}
      {ok && (
        <>
          <Result big={`${fmt(r.meanDepth, 2)} clicks`} tone={r.unreachable.length ? 'bad' : 'good'} label={`Average click depth from ${g.names[r.home]} over the ${r.reach - 1} reachable pages; deepest ${r.maxDepth}.`}>
            <Stats rows={[
              ['Pages and links', `${r.n} pages, ${r.nEdges} links (${g.treeLines} sitemap lines, ${g.linkLines} link lines)`],
              ['Cannot be reached from home', r.unreachable.length ? `${r.unreachable.length}: ${r.unreachable.slice(0, 4).map((i) => g.names[i]).join(', ')}${r.unreachable.length > 4 ? '…' : ''}` : 'none'],
              ['Orphans (no links in)', r.orphans.length ? r.orphans.map((i) => g.names[i]).slice(0, 4).join(', ') + (r.orphans.length > 4 ? '…' : '') : 'none'],
              ['Dead ends (no links out)', `${r.deadEnds.length}`],
              ['Breadth', `mean ${fmt(r.meanBreadth, 1)} links out per page that has any; widest ${r.maxBreadth}`],
              ['Integration (space syntax)', `mean ${fmt(r.meanIntegration, 2)}; home ${fmt(r.homeIntegration, 2)}`],
            ]} />
          </Result>
          <h3 className="clu-h3">Pages by click depth</h3>
          <Bars label="Pages at each depth" rows={[...r.levels.map((c, d) => [`${d} click${d === 1 ? '' : 's'}`, c / Math.max(...r.levels, r.unreachable.length), `${c} page${c === 1 ? '' : 's'}`]), ...(r.unreachable.length ? [['unreachable', r.unreachable.length / Math.max(...r.levels, r.unreachable.length), `${r.unreachable.length}`, 'bad']] : [])]} />
          <div className="cg-actions">
            <Choice label="Layout" value={layout} onChange={setLayout} options={[['tree', 'Tree'], ['force', 'Force']]} />
          </div>
          <GraphSvg r={r} layout={layout} sel={selI} onSel={setSel} />
          <p className="cg-note">{selI >= 0 ? (r.pages[selI].unreachable ? `${g.names[selI]} cannot be reached from home.` : <>Shortest click path to <b>{g.names[selI]}</b>: {r.pages[selI].path.map((i) => g.names[i]).join(' → ')} ({r.pages[selI].depth} clicks).</>) : 'Click a page to highlight its shortest click path from home. Scroll inside the diagram on small screens.'}</p>
          <div className="cg-actions">
            <Pick label="Sort pages by" value={sort} onChange={setSort} options={SORTS} />
            <button type="button" className="btn ghost small" onClick={() => download('ia-graph-pages.csv', GR.pagesCsv(r), 'text/csv')}>Download CSV</button>
          </div>
          <Table label="Page metrics" head={['Page', 'Clicks', 'Links in / out', 'Betweenness', 'Closeness', 'PageRank', 'Integration (RRA)', 'Flags', 'Shortest path from home']}
            rows={rows.map((p) => ({ cls: p.i === selI ? 'on' : '', cells: [p.name, Number.isFinite(p.depth) ? p.depth : '–', `${p.inDeg} / ${p.outDeg}`, fmt(p.betweenness, 3), fmt(p.closeness, 3), fmt(p.pagerank, 3), `${fmt(p.integration, 2)} (${fmt(p.rra, 2)})`, flags(p), <span key="p" className="cg-path">{p.path.length ? p.path.map((i) => g.names[i]).join(' › ') : ''}</span>] }))} />
          <p className="cg-note">Betweenness: share of shortest routes between other pages that pass through the page (normalised). Closeness: how few clicks it takes to reach the rest of the site from the page. PageRank: where a random clicker ends up most often (damping 0.85). Integration: space-syntax centrality of the undirected graph, 1/RRA; higher = more central. Values for {sig(r.n, 3)} pages.</p>
          <StudySummary {...GR.graphSummary(r)} />
        </>
      )}
      <About method="ia-graph-analysis" links={[['graph-theoretic-navigation-analysis', 'Graph-theoretic navigation analysis'], ['centrality-analysis', 'Centrality analysis'], ['space-syntax-analysis', 'Space syntax analysis'], ['dead-end-identification', 'Dead-end identification'], ['unreachable-state-detection', 'Unreachable state detection']]}>
        <p><b>The graph.</b> Every page is a node and every link a directed edge. An indented sitemap gives parent → child links; extra lines "From -&gt; To" add cross-links. Optionally, every child links back to its parent (breadcrumbs) and every page to home.</p>
        <p><b>Depth and breadth.</b> Click depth is the breadth-first shortest path length from home; the shortest click path shown is the first one found. Breadth per level counts the pages at each depth; mean breadth is the average number of links out of pages that have any. Orphans have no links in (other than home); dead ends have no links out; unreachable pages cannot be reached from home by any path.</p>
        <p><b>Centrality.</b> Betweenness (Freeman 1977; Brandes 2001) sums, over all ordered pairs of other pages, the share of shortest paths that pass through the page, divided by (n − 1)(n − 2). Out-closeness is ((r − 1)/(n − 1)) · ((r − 1)/Σd), where r counts the pages the page can reach (Wasserman and Faust's correction for pages that cannot reach everything). PageRank (Brin and Page 1998) is the stationary distribution of a random clicker who follows a random link with probability 0.85 and otherwise jumps to a random page; pages without links out send the clicker to a random page.</p>
        <p><b>Space syntax</b> (Hillier and Hanson 1984), on the undirected graph within each page's connected component of k pages: mean depth MD = Σd/(k − 1); relative asymmetry RA = 2(MD − 1)/(k − 2); real relative asymmetry RRA = RA/D_k with D_k = 2(k[log₂((k + 2)/3) − 1] + 1)/((k − 1)(k − 2)); integration = 1/RRA. Use it for screen flows, where links usually work both ways.</p>
        <p><b>Layouts.</b> Tree: the breadth-first tree from home, left to right, with cross-links dashed. Force: Fruchterman and Reingold (1991), started from a circle in input order so it is the same every time.</p>
        <p><b>Checks.</b> Depths, betweenness, closeness, PageRank and integration are checked against networkx.</p>
        <p><b>When not to use it.</b> As a measure of usability on its own: the graph shows what is possible, not what people do or understand. Pair it with tree testing, first-click tests or analytics, and include global navigation and search before judging depth.</p>
      </About>
    </div>
  );
}

export default CogiaIaGraph;
