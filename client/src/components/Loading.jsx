export default function Loading({ error }) {
  if (error) return <div className="wrap section"><div className="notice error">{error.message}</div></div>;
  return <div className="wrap section muted" role="status">Loading…</div>;
}
