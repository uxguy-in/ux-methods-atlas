// Compact, URL-safe codes for studies and results: JSON → UTF-8 → LZW with growing code widths → base64url.
// No packages, synchronous, and the same in the browser and in Node. The first character says how the rest is
// stored ('1' LZW, '0' plain base64url), so a code that would not shrink is kept as it is.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64I = Object.fromEntries([...B64].map((c, i) => [c, i]));

export function toBase64url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? '' : B64[(n >> 6) & 63]) + (c === undefined ? '' : B64[n & 63]);
  }
  return out;
}
export function fromBase64url(s) {
  const clean = String(s).replace(/[^A-Za-z0-9\-_]/g, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => B64I[clean[i + k]]);
    const n = (v[0] << 18) | (v[1] << 12) | ((v[2] ?? 0) << 6) | (v[3] ?? 0);
    out.push((n >> 16) & 255);
    if (v[2] !== undefined) out.push((n >> 8) & 255);
    if (v[3] !== undefined) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

const bitlen = (x) => (x <= 0 ? 1 : 32 - Math.clz32(x));
const MAX = 65536;

export function lzwEncode(bytes) {
  const dict = new Map(); let size = 256, w = -1, k = 0;
  const out = []; let acc = 0, nacc = 0;
  const emit = (code) => {
    k++;
    const width = Math.max(8, bitlen(Math.min(256 + k - 1, MAX) - 1));
    for (let b = width - 1; b >= 0; b--) { acc = (acc << 1) | ((code >> b) & 1); nacc++; if (nacc === 8) { out.push(acc); acc = 0; nacc = 0; } }
  };
  for (const c of bytes) {
    if (w < 0) { w = c; continue; }
    const key = w * 256 + c;
    const hit = dict.get(key);
    if (hit !== undefined) { w = hit; continue; }
    emit(w);
    if (size < MAX) dict.set(key, size++);
    w = c;
  }
  if (w >= 0) emit(w);
  if (nacc) out.push(acc << (8 - nacc));
  return Uint8Array.from(out);
}
export function lzwDecode(data, nBytesHint = Infinity) {
  let pos = 0;
  const read = (width) => { let v = 0; for (let i = 0; i < width; i++) { const byte = data[pos >> 3]; if (byte === undefined) return -1; v = (v << 1) | ((byte >> (7 - (pos & 7))) & 1); pos++; } return v; };
  const dict = []; for (let i = 0; i < 256; i++) dict.push([i]);
  const out = []; let prev = null, k = 0;
  while (out.length < nBytesHint) {
    k++;
    const width = Math.max(8, bitlen(Math.min(256 + k - 1, MAX) - 1));
    if (pos + width > data.length * 8) break;
    const code = read(width); if (code < 0) break;
    let entry;
    if (code < dict.length) entry = dict[code];
    else if (code === dict.length && prev) entry = [...prev, prev[0]];
    else throw new Error('Corrupt code');
    out.push(...entry);
    if (prev && dict.length < MAX) dict.push([...prev, entry[0]]);
    prev = entry;
  }
  return Uint8Array.from(out);
}

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

// Length of the original is stored so trailing padding bits are never read as an extra code.
export function encodeCode(obj) {
  const raw = enc(JSON.stringify(obj));
  const lz = lzwEncode(raw);
  const lzCode = `1${raw.length.toString(36)}.${toBase64url(lz)}`;
  const plain = `0${toBase64url(raw)}`;
  return lzCode.length < plain.length ? lzCode : plain;
}
export function decodeCode(code) {
  const s = String(code || '').trim().replace(/^.*[?&#]study=/, '').replace(/&.*$/, '');
  if (!s) throw new Error('Empty code');
  if (s[0] === '0') return JSON.parse(dec(fromBase64url(s.slice(1))));
  if (s[0] === '1') {
    const dot = s.indexOf('.'); const n = parseInt(s.slice(1, dot), 36);
    return JSON.parse(dec(lzwDecode(fromBase64url(s.slice(dot + 1)), n)));
  }
  throw new Error('Not a study or result code');
}
