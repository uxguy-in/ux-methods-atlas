// Web Worker for the voice tool: runs OpenAI's Whisper speech model inside the browser with transformers.js, so the
// audio never leaves the visitor's device. The model downloads from Hugging Face the first time and the browser
// caches it. Messages in: { type: 'transcribe', audio (16 kHz mono Float32Array), model, language, task, chunks }.
// Messages out: { status: 'loading', progress } while the model downloads, { status: 'partial', text, done } while it
// transcribes, then { status: 'result', text, chunks } or { status: 'error', error }.
import { pipeline, WhisperTextStreamer } from '@huggingface/transformers';

let current = { model: null, asr: null };

async function load(model) {
  if (current.model === model) return current.asr;
  await current.asr?.dispose?.();
  current = { model: null, asr: null };
  const asr = await pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p) => { if (p.status === 'progress_total') self.postMessage({ status: 'loading', progress: p.progress / 100 }); },
  });
  current = { model, asr };
  return asr;
}

self.onmessage = async ({ data }) => {
  if (data.type !== 'transcribe') return;
  try {
    self.postMessage({ status: 'loading', progress: 0 });
    const asr = await load(data.model);
    self.postMessage({ status: 'ready' });
    let text = '', done = 0;
    const streamer = new WhisperTextStreamer(asr.tokenizer, {
      callback_function: (t) => { text += t; self.postMessage({ status: 'partial', text, done: done / data.chunks }); },
      on_finalize: () => { done += 1; text += ' '; self.postMessage({ status: 'partial', text, done: Math.min(1, done / data.chunks) }); },
    });
    const out = await asr(data.audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      language: data.language || null,
      task: data.task || 'transcribe',
      streamer,
    });
    self.postMessage({ status: 'result', text: out.text, chunks: (out.chunks || []).map((c) => ({ start: c.timestamp[0], end: c.timestamp[1], text: c.text })) });
  } catch (e) {
    self.postMessage({ status: 'error', error: e?.message || String(e) });
  }
};
