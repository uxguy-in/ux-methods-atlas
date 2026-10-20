import { Link } from 'react-router-dom';
import { SUBMIT_URL } from '../vocab.js';
import { useMeta } from '../hooks.js';

export default function About() {
  const { data: meta } = useMeta();
  return (
    <section className="section">
      <div className="wrap prose">
        <p className="eyebrow">About</p>
        <h1 className="h1">Why this exists.</h1>
        <p className="lede" style={{ marginTop: 24 }}>
          People treat UX research as talking to users and reporting it. That is journalism, not research. Research goes
          deeper, past the obvious.
        </p>
        <p>
          UX research was never really taught; it was adapted. Its methods came from human factors, cognitive psychology,
          ethnography, statistics, epidemiology, linguistics, economics and engineering, and many of the most rigorous
          ones were forgotten along the way. Error taxonomy, CPM-GOMS, use failure modes and effects analysis,
          Miles and Huberman matrices, Bradford Hill's criteria for causation: all still exist, all still work, and
          almost nobody uses them.
        </p>
        <p>
          This atlas collects {meta?.counts?.methods ?? 'hundreds of'} methods from more than {meta?.counts?.books ?? 260} books, papers,
          treatises and playbooks, records why each one was lost or survived, and helps you choose the right one for the
          problem in front of you.
        </p>
        <h2>How the recommendations work</h2>
        <p>
          The finder scores every method against your goal, product stage, access to participants, time, evidence needs
          and expertise. When you write a brief, Claude reads it alongside the best-matching slice of the atlas and
          proposes a sequenced plan using only methods that exist here, so every suggestion links to a full write-up.
        </p>
        <h2>The loss taxonomy</h2>
        <p>
          Methods are tagged active, vestigial, siloed, renamed, latent, extinct or unmigrated, following the taxonomy in
          <em> Lost Methods in UX</em>. New frameworks put forward by practitioners are marked community-proposed, and each
          one says whether it has been tested (published evidence of use beyond the person who proposed it) or not yet tested.
          Anyone can <a href={SUBMIT_URL} target="_blank" rel="noreferrer">submit a method</a>.
        </p>
        <p style={{ marginTop: 32 }}><Link to="/find" className="btn accent">Find a method</Link></p>
      </div>
    </section>
  );
}
