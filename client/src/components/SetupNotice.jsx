// Shown until Supabase credentials are provided via env vars.
export default function SetupNotice() {
  return (
    <div className="center">
      <div className="hero">
        <h1 className="logo">GroupGamble <span>🎲</span></h1>
        <p className="tagline">Almost there — connect your database.</p>
      </div>

      <div className="card stack">
        <p>This build talks to Supabase. Add your project credentials, then restart the dev server:</p>
        <ol className="setup-steps">
          <li>Create a free project at <b>supabase.com</b>.</li>
          <li>Open <b>SQL Editor</b> → paste <code>supabase/schema.sql</code> → <b>Run</b>.</li>
          <li>In <b>Project Settings → API</b>, copy the <b>Project URL</b> and <b>anon</b> key.</li>
          <li>Put them in <code>client/.env</code>:
            <pre>{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}</pre>
          </li>
          <li>Restart: <code>npm run dev</code>.</li>
        </ol>
        <p className="muted small">See <code>README.md</code> for the full deploy-to-GitHub-Pages steps.</p>
      </div>
    </div>
  );
}
