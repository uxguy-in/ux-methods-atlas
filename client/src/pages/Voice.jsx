// Say it out loud: speak a research question, or upload an interview recording, and get text back from Whisper running
// inside the browser (voice/voice.worker.js). A spoken question is matched to the question library and the atlas's
// methods; a recording becomes a timed transcript for the interview coding workbench. Audio and transcripts stay in
// this tab: nothing is uploaded, stored or put in a URL, apart from what the visitor chooses to carry into a study plan.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../api.js';
import MethodCard from '../components/MethodCard.jsx';
import { calcsForMethod } from '../calc/learn.js';
import { LibraryQuestionPanel, goalsForQuestion, similarQuestions } from '../components/QuestionLinks.jsx';
import { QUESTION_BY_ID, themeOf } from '../questions.js';
import { toAnswers } from './Finder.jsx';
import { giveHandoff } from '../voice/handoff.js';
import { LANGUAGES, MODELS, chunkCount, cleanSpeech, mergeUp, modelId, stamp, toMono, toParagraphs, transcriptText } from '../voice/voice-core.js';
import '../voice/voice.css';

const SETTINGS = 'atlas-voice-settings';
const readSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS)) || {}; } catch { return {}; } };

// Decodes any audio the browser can play into 16 kHz mono samples.
async function decode(blob) {
  const buf = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx;
  try { ctx = new AC({ sampleRate: 16000 }); } catch { ctx = new AC(); }
  try {
    let audio = await ctx.decodeAudioData(buf);
    if (audio.sampleRate !== 16000) {
      const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
      const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
      audio = await off.startRendering();
    }
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    return { samples: toMono(channels), seconds: audio.duration };
  } finally { ctx.close?.(); }
}

// Microphone recording with a live level meter.
function useRecorder() {
  const [rec, setRec] = useState({ on: false, seconds: 0, level: 0, error: '' });
  const r = useRef({});
  const stopAll = () => {
    const x = r.current;
    cancelAnimationFrame(x.raf); clearInterval(x.timer);
    x.stream?.getTracks().forEach((t) => t.stop());
    if (x.ctx && x.ctx.state !== 'closed') x.ctx.close().catch(() => {});
    r.current = {};
  };
  useEffect(() => () => stopAll(), []);
  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setRec((s) => ({ ...s, error: 'This browser cannot record audio. Upload a recording instead.' })); return false; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream);
      const parts = [];
      mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC(); const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.fftSize);
      const t0 = Date.now();
      const tick = () => {
        an.getByteTimeDomainData(data);
        let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setRec((s) => ({ ...s, level: peak / 128 }));
        r.current.raf = requestAnimationFrame(tick);
      };
      r.current = { stream, mr, parts, ctx, raf: requestAnimationFrame(tick), timer: setInterval(() => setRec((s) => ({ ...s, seconds: (Date.now() - t0) / 1000 })), 250) };
      mr.start(1000);
      setRec({ on: true, seconds: 0, level: 0, error: '' });
      return true;
    } catch (e) {
      setRec((s) => ({ ...s, on: false, error: e.name === 'NotAllowedError' ? 'The browser was not allowed to use the microphone. Allow it in the address bar and try again, or upload a recording.' : `Could not start the microphone: ${e.message}` }));
      return false;
    }
  };
  const stop = () => new Promise((resolve) => {
    const { mr, parts } = r.current;
    if (!mr) { resolve(null); return; }
    mr.onstop = () => { stopAll(); setRec((s) => ({ ...s, on: false, level: 0 })); resolve(new Blob(parts, { type: mr.mimeType || 'audio/webm' })); };
    mr.stop();
  });
  return [rec, start, stop];
}

const friendly = (e) => (/fetch|network|load/i.test(e)
  ? 'The speech model could not be downloaded. The first use needs an internet connection to Hugging Face; after that it works from the copy in your browser.'
  : /memory|allocation/i.test(e) ? 'The browser ran out of memory. Try the Quick setting or a shorter recording.' : e);

// Keeps one worker, so a model loaded once stays loaded for the next recording.
function useWhisper() {
  const [st, setSt] = useState({ phase: 'idle', progress: 0, partial: '', error: '' });
  const w = useRef(null);
  useEffect(() => () => w.current?.terminate(), []);
  const run = (audio, opts) => new Promise((resolve) => {
    if (!w.current) w.current = new Worker(new URL('../voice/voice.worker.js', import.meta.url), { type: 'module' });
    setSt({ phase: 'loading', progress: 0, partial: '', error: '' });
    w.current.onmessage = ({ data }) => {
      if (data.status === 'loading') setSt((s) => ({ ...s, phase: 'loading', progress: data.progress }));
      else if (data.status === 'ready') setSt((s) => ({ ...s, phase: 'transcribing', progress: 0 }));
      else if (data.status === 'partial') setSt((s) => ({ ...s, phase: 'transcribing', partial: data.text, progress: data.done }));
      else if (data.status === 'result') { setSt({ phase: 'done', progress: 1, partial: '', error: '' }); resolve(data); }
      else if (data.status === 'error') { setSt({ phase: 'error', progress: 0, partial: '', error: friendly(data.error) }); resolve(null); }
    };
    w.current.onerror = (e) => { setSt({ phase: 'error', progress: 0, partial: '', error: e.message || 'The speech model could not start in this browser.' }); w.current?.terminate(); w.current = null; resolve(null); };
    w.current.postMessage({ type: 'transcribe', audio, ...opts }, [audio.buffer]);
  });
  const cancel = () => { w.current?.terminate(); w.current = null; setSt({ phase: 'idle', progress: 0, partial: '', error: '' }); };
  return [st, run, cancel];
}

export default function Voice() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('ask');
  const [settings, setSettings] = useState(() => ({ size: 'balanced', language: 'english', translate: false, ...readSettings() }));
  const setS = (patch) => setSettings((s) => { const n = { ...s, ...patch }; try { localStorage.setItem(SETTINGS, JSON.stringify(n)); } catch { /* storage unavailable */ } return n; });
  const [rec, startRec, stopRec] = useRecorder();
  const [asr, transcribe, cancel] = useWhisper();
  const [err, setErr] = useState('');
  const [heard, setHeard] = useState(''); // ask mode: the spoken question, editable
  const [paras, setParas] = useState([]); // transcribe mode: timed paragraphs
  const [name, setName] = useState('');
  const [stamps, setStamps] = useState(true);
  const fileRef = useRef(null);
  const busy = rec.on || asr.phase === 'loading' || asr.phase === 'transcribing';

  // A recording or transcript lives only in this tab: warn before it is lost.
  useEffect(() => {
    if (!paras.length) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [paras.length]);

  async function handle(blob, fileName = '') {
    setErr('');
    let audio;
    try { audio = await decode(blob); } catch { setErr('This file could not be read as audio. Try MP3, M4A, WAV, OGG or WebM.'); return; }
    if (audio.seconds < 0.5) { setErr('That recording is too short to hear anything. Try again and speak for a few seconds.'); return; }
    const english = settings.language === 'english';
    const out = await transcribe(audio.samples, {
      model: modelId(settings.size, settings.language),
      language: english ? 'english' : settings.language || null,
      task: !english && settings.translate ? 'translate' : 'transcribe',
      chunks: chunkCount(audio.seconds),
    });
    if (!out) return;
    if (mode === 'ask') setHeard(cleanSpeech(out.text));
    else {
      setParas(toParagraphs(out.chunks.length ? out.chunks : [{ start: 0, end: audio.seconds, text: out.text }]));
      if (fileName && !name) setName(fileName.replace(/\.[^.]+$/, '').slice(0, 40));
    }
  }

  const toggleRec = async () => {
    if (rec.on) { const blob = await stopRec(); if (blob) handle(blob); } else { setErr(''); await startRec(); }
  };
  const onFile = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handle(f, f.name); };
  const switchMode = (m) => { if (busy) return; setMode(m); setErr(''); };

  return (
    <div className="voice">
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">Voice</p>
          <h1 className="h1">Say it out loud.</h1>
          <p className="lede">
            Speak a research question and get the methods, calculators and reading that answer it. Or turn an interview
            recording into a transcript you can code.
          </p>
          <p className="voice-private"><b>Private by design.</b> The speech model runs in this browser, so your audio never leaves your device. The first time, the browser downloads the model from Hugging Face ({MODELS[settings.size].size}) and keeps it for next time.</p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="options compact voice-modes" role="radiogroup" aria-label="What do you want to do?">
            {[['ask', 'Ask a question', 'Speak for a few seconds and get an answer'], ['transcribe', 'Transcribe a recording', 'Upload or record an interview and get a transcript']].map(([v, l, h]) => (
              <button key={v} type="button" role="radio" className={`option${mode === v ? ' on' : ''}`} aria-checked={mode === v} onClick={() => switchMode(v)} disabled={busy && mode !== v}>
                <b>{l}</b><small>{h}</small>
              </button>
            ))}
          </div>

          <details className="voice-settings">
            <summary>Language and accuracy: {LANGUAGES.find(([v]) => v === settings.language)?.[1] || 'English'}, {MODELS[settings.size].name.toLowerCase()}</summary>
            <div className="voice-settings-grid">
              <label className="field"><span>Language spoken</span>
                <select className="select" value={settings.language} onChange={(e) => setS({ language: e.target.value })} disabled={busy}>
                  {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="field"><span>Accuracy</span>
                <select className="select" value={settings.size} onChange={(e) => setS({ size: e.target.value })} disabled={busy}>
                  {Object.entries(MODELS).map(([k, m]) => <option key={k} value={k}>{m.name} ({m.size})</option>)}
                </select>
                <small className="muted">{MODELS[settings.size].note}</small>
              </label>
              {settings.language !== 'english' && (
                <label className="voice-check"><input type="checkbox" checked={settings.translate} onChange={(e) => setS({ translate: e.target.checked })} disabled={busy} /> Translate into English as it transcribes</label>
              )}
            </div>
          </details>

          <div className="voice-input">
            <button type="button" className={`voice-mic${rec.on ? ' on' : ''}`} onClick={toggleRec} disabled={busy && !rec.on} aria-pressed={rec.on}
              style={{ '--level': rec.level }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" width="34" height="34"><path fill="currentColor" d={rec.on ? 'M7 7h10v10H7z' : 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z'} /></svg>
              <span>{rec.on ? `Stop · ${stamp(rec.seconds)}` : mode === 'ask' ? 'Tap and speak your question' : 'Record'}</span>
            </button>
            <div className="voice-or">
              <span>or</span>
              <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()} disabled={busy}>Upload an audio file</button>
              <input ref={fileRef} type="file" accept="audio/*,video/webm,video/mp4,.m4a,.mp3,.wav,.ogg,.webm,.flac,.aac" onChange={onFile} hidden />
            </div>
          </div>
          {mode === 'ask' && !rec.on && !heard && asr.phase === 'idle' && (
            <p className="voice-tip">Try: “We redesigned checkout and conversions dropped. How do we find out why?”</p>
          )}
          {mode === 'transcribe' && !paras.length && asr.phase === 'idle' && (
            <p className="voice-tip">Only record or upload people who agreed to it. Long recordings take a while: about as long as the recording on the Balanced setting, depending on your computer. Keep this tab open while it works.</p>
          )}

          {(rec.error || err || asr.error) && <div className="notice error" role="alert">{rec.error || err || asr.error}</div>}
          {(asr.phase === 'loading' || asr.phase === 'transcribing') && (
            <div className="voice-progress" aria-live="polite">
              <div className="voice-bar"><span style={{ width: `${Math.round((asr.progress || 0) * 100)}%` }} /></div>
              <p>
                {asr.phase === 'loading' ? `Loading the speech model… ${Math.round((asr.progress || 0) * 100)}%` : `Transcribing… ${Math.round((asr.progress || 0) * 100)}%`}
                {' '}<button type="button" className="skip-link" onClick={cancel}>Cancel</button>
              </p>
              {asr.partial && <p className="voice-partial">{asr.partial.slice(-400)}</p>}
            </div>
          )}

          {mode === 'ask' && heard && <AskResult heard={heard} setHeard={setHeard} navigate={navigate} />}
          {mode === 'transcribe' && paras.length > 0 && (
            <TranscriptResult paras={paras} setParas={setParas} name={name} setName={setName} stamps={stamps} setStamps={setStamps} navigate={navigate} />
          )}
        </div>
      </section>
    </div>
  );
}

function speak(text, onEnd) {
  const synth = window.speechSynthesis;
  if (!synth) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB'; u.rate = 1;
  u.onend = onEnd; u.onerror = onEnd;
  synth.speak(u);
  return true;
}

function AskResult({ heard, setHeard, navigate }) {
  const matches = useMemo(() => similarQuestions(heard, 5), [heard]);
  const [pick, setPick] = useState('');
  const chosen = QUESTION_BY_ID.get(pick) || matches[0];
  useEffect(() => { setPick(''); }, [heard]);
  const [recs, setRecs] = useState(null);
  useEffect(() => {
    let live = true;
    if (chosen) { setRecs(null); return undefined; } // the library's own methods are better than a word match
    const t = setTimeout(() => {
      post('/api/recommend', { answers: toAnswers({ goal: goalsForQuestion(chosen) }), brief: heard, seed: 1 })
        .then((r) => { if (live) setRecs(r); }).catch(() => {});
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [heard, chosen?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = useMemo(() => {
    if (!recs) return [];
    const seen = new Set(), out = [];
    for (const list of Object.values(recs)) if (Array.isArray(list)) for (const m of list) if (m?.id && !seen.has(m.id)) { seen.add(m.id); out.push(m); }
    return out.slice(0, 6);
  }, [recs]);
  const [talking, setTalking] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  const readAloud = () => {
    if (talking) { window.speechSynthesis?.cancel(); setTalking(false); return; }
    const text = chosen
      ? `The closest question in the library is: ${chosen.question} ${chosen.answer} ${chosen.methods[0] ? `A good place to start is ${chosen.methods[0].why}` : ''}`
      : 'Nothing in the question library is close to that. Try saying it another way, or open Find a method.';
    if (speak(text, () => setTalking(false))) setTalking(true);
  };
  const toFinder = () => {
    giveHandoff('brief', heard);
    if (chosen) giveHandoff('qid', chosen.id);
    navigate('/find', { state: chosen ? { carry: { goal: goalsForQuestion(chosen) } } : undefined });
  };
  const toPlan = () => {
    const a = { hasRQ: 'yes', rq: heard, ...(chosen ? { qid: chosen.id, goal: goalsForQuestion(chosen) } : {}) };
    navigate(`/plan?a=${encodeURIComponent(JSON.stringify(a))}`);
  };
  return (
    <div className="voice-result">
      <label className="field voice-heard">
        <span>What we heard. Fix any words it got wrong.</span>
        <textarea rows={2} value={heard} onChange={(e) => setHeard(e.target.value)} />
      </label>
      <div className="voice-actions">
        <button type="button" className="btn accent" onClick={readAloud} disabled={!window.speechSynthesis}>{talking ? 'Stop reading' : 'Read the answer aloud'}</button>
        <button type="button" className="btn ghost" onClick={toFinder}>Find methods for this</button>
        <button type="button" className="btn ghost" onClick={toPlan}>Plan a study around it</button>
      </div>
      {matches.length > 1 && (
        <div className="voice-alts">
          <span className="label">Closest questions in the library</span>
          <ul>
            {matches.map((q) => (
              <li key={q.id}>
                <button type="button" className={q.id === chosen?.id ? 'on' : ''} aria-pressed={q.id === chosen?.id} onClick={() => setPick(q.id)}>
                  {q.question} <small>{themeOf(q.theme).name}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {chosen
        ? <LibraryQuestionPanel id={chosen.id} />
        : <p className="notice">Nothing in the <Link to="/questions">question library</Link> is close to that. The methods below match the words you used; for a fuller answer, use Find methods for this.</p>}
      {!chosen && top.length > 0 && (
        <section className="voice-methods">
          <h2 className="h2">Methods that fit what you said</h2>
          <div className="grid">{top.map((m) => <MethodCard key={m.id} m={m} why={m.why} calcs={calcsForMethod(m.id)} />)}</div>
          <p className="muted">Matched on your words alone. Find methods for this asks about your time, access and skills to narrow them down, and can write a research direction with Claude.</p>
        </section>
      )}
    </div>
  );
}

const SPEAKERS = [['', 'No label'], ['Interviewer', 'Interviewer'], ['Participant', 'Participant']];

function TranscriptResult({ paras, setParas, name, setName, stamps, setStamps, navigate }) {
  const [copied, setCopied] = useState(false);
  const text = transcriptText(paras, { name, stamps });
  const words = (text.match(/\S+/g) || []).length;
  const edit = (i, patch) => setParas(paras.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  // Setting one speaker fills in the other for the paragraphs that follow, alternating, until a label is already set.
  const setSpeaker = (i, sp) => {
    const next = paras.map((p) => ({ ...p }));
    next[i].speaker = sp;
    if (sp && next.slice(i + 1).every((p) => !p.speaker)) {
      const other = sp === 'Interviewer' ? 'Participant' : 'Interviewer';
      for (let j = i + 1; j < next.length; j++) next[j].speaker = (j - i) % 2 ? other : sp;
    }
    setParas(next);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } };
  const save = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `${(name || 'transcript').replace(/[^\w.-]+/g, '-')}.txt`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const toCoding = () => { giveHandoff('qual', transcriptText(paras, { name: name || 'Interview 1', stamps: false })); navigate('/calculators/qual-coding'); };
  return (
    <div className="voice-result">
      <div className="voice-tx-head">
        <label className="field"><span>Name for this interview</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. P3" /></label>
        <label className="voice-check"><input type="checkbox" checked={stamps} onChange={(e) => setStamps(e.target.checked)} /> Show times</label>
        <span className="muted">{paras.length} paragraphs · {words.toLocaleString()} words</span>
      </div>
      <p className="voice-tip">The model does not tell voices apart. Set the speaker on the first paragraph and the rest alternate; change any that are wrong. Join paragraphs it split in the wrong place.</p>
      <ol className="voice-paras">
        {paras.map((p, i) => (
          <li key={i}>
            <div className="voice-para-meta">
              <span className="voice-time">{stamp(p.start)}</span>
              <select className="select" value={p.speaker} onChange={(e) => setSpeaker(i, e.target.value)} aria-label={`Speaker of paragraph ${i + 1}`}>
                {SPEAKERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {i > 0 && <button type="button" className="skip-link" onClick={() => setParas(mergeUp(paras, i))}>Join with the one above</button>}
            </div>
            <textarea value={p.text} onChange={(e) => edit(i, { text: e.target.value })} rows={Math.min(8, Math.max(2, Math.ceil(p.text.length / 90)))} aria-label={`Paragraph ${i + 1}`} />
          </li>
        ))}
      </ol>
      <div className="voice-actions">
        <button type="button" className="btn accent" onClick={toCoding}>Code it in the interview workbench</button>
        <button type="button" className="btn ghost" onClick={copy}>{copied ? 'Copied' : 'Copy the transcript'}</button>
        <button type="button" className="btn ghost" onClick={save}>Download as text</button>
      </div>
      <p className="muted">Nothing here is saved. Download the transcript or carry it into the workbench before you close the tab. Check it against the recording before you quote anyone: speech models mishear names and jargon.</p>
    </div>
  );
}
