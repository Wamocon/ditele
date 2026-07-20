export default function Loading() {
  return (
    <main className="container content-section" aria-busy="true" aria-live="polite">
      <div className="state-panel">
        <h1>DiTeLe</h1>
        <p className="muted">Loading…</p>
      </div>
    </main>
  );
}
