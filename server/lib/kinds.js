// Research methods and design & product practices share one data file but are listed apart.
// Records with "kind": "design" are making and product practices; a missing kind means research.
// Shared by the Node server and the static GitHub Pages build, so both answer the same way.
import { listFields } from './fields.js';

export const DESIGN_FAMILY = 'Design & Product Practice';
export const isDesign = (m) => m.kind === 'design';

export function splitKinds(methods) {
  const research = [];
  const design = [];
  for (const m of methods) (isDesign(m) ? design : research).push(m);
  return { research, design, byId: new Map(methods.map((m) => [m.id, m])), researchById: new Map(research.map((m) => [m.id, m])) };
}

// Families and counts describe the research atlas; design practices are counted on their own.
export const metaPayload = (meta, kinds, books) => ({
  ...meta,
  families: (meta.families || []).filter((f) => f.name !== DESIGN_FAMILY),
  counts: { methods: kinds.research.length, design: kinds.design.length, books: books.length },
});

// The source spreadsheet's personal reading status stays out of everything the site serves.
export const publicBook = ({ readingStatus, ...b }) => b;

// Books may source both kinds; each listed method says which it is.
export const booksPayload = (books, byId) => books.map(publicBook).map((b) => (b.methods?.length
  ? { ...b, methods: b.methods.map((x) => (isDesign(byId.get(x.id) || {}) ? { ...x, kind: 'design' } : x)) }
  : b));

export function methodPayload(rec, byId, books) {
  const related = (rec.relatedIds || []).map((id) => byId.get(id)).filter(Boolean).map(listFields);
  const sourceBooks = (rec.bookIds || []).map((id) => books.find((b) => b.id === id)).filter(Boolean).map(publicBook);
  return { ...rec, related, sourceBooks };
}
