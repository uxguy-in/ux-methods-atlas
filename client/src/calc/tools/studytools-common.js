// Helpers shared by the card sort and first-click study tools (group "studytools"): seeded random numbers, ids,
// CSV cells, localStorage sessions (every access wrapped, because storage can be blocked) and result-code parsing.
export function seeded(seed = 1) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
export function newId(rnd = Math.random) { let s = ''; const A = 'abcdefghjkmnpqrstuvwxyz23456789'; for (let i = 0; i < 8; i++) s += A[Math.floor(rnd() * A.length)]; return s; }
export function shuffle(a, rnd = Math.random) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
export const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
export const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
export const mdCell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');

// Moderated sessions, kept in this browser by tool and study id.
const KEY = (tool, id) => `uxatlas:${tool}:${id}`;
export function loadSessions(tool, id) { try { const v = JSON.parse(localStorage.getItem(KEY(tool, id)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
export function saveSession(tool, id, code) { try { const all = loadSessions(tool, id); if (!all.includes(code)) all.push(code); localStorage.setItem(KEY(tool, id), JSON.stringify(all)); return true; } catch { return false; } }
export function clearSessions(tool, id) { try { localStorage.removeItem(KEY(tool, id)); return true; } catch { return false; } }
export function readStore(key, fallback = null) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } }
export function writeStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

// Result codes pasted one per line (or separated by spaces or commas); unreadable ones are counted.
export function parseCodes(text, decode) {
  const results = [], bad = [];
  String(text || '').split(/[\s,]+/).filter(Boolean).forEach((c, i) => { try { results.push(decode(c)); } catch { bad.push(i + 1); } });
  return { results, bad };
}

// Pearson correlation of two equal-length arrays (NaN when either has no variance).
export function pearson(a, b) {
  const n = a.length; if (n < 2) return NaN;
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}
