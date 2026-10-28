// Lightweight list payload for browsing; full records are fetched per method.
// Shared by the Node server and the static GitHub Pages build.
export const listFields = (m) => ({
  id: m.id,
  name: m.name,
  aka: m.aka,
  family: m.family,
  kind: m.kind,
  donor: m.donor,
  status: m.status,
  validation: m.validation,
  summary: m.summary,
  facets: m.facets,
  keywords: m.keywords,
  origin: m.origin,
  bookIds: m.bookIds,
});
