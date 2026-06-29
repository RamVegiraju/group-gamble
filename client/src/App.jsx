import { useEffect, useState, useCallback } from "react";
import { api, getCode, setCode as saveCode, clearSession } from "./api.js";
import { SUPABASE_READY } from "./supabase.js";
import Landing from "./components/Landing.jsx";
import Session from "./components/Session.jsx";
import SetupNotice from "./components/SetupNotice.jsx";

export default function App() {
  const [code, setCode] = useState(getCode());
  const [meId, setMeId] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!getCode());

  const refresh = useCallback(async (theCode) => {
    const c = theCode || getCode();
    if (!c) return;
    try {
      const data = await api.getSession(c);
      setSession(data.session);
      setMeId(data.meId);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Initial load if we already have a saved session code.
  useEffect(() => {
    if (!SUPABASE_READY || !code) return;
    (async () => {
      setLoading(true);
      await refresh(code);
      setLoading(false);
    })();
  }, []); // eslint-disable-line

  // Light polling so friends see each other's activity (no websockets yet).
  useEffect(() => {
    if (!SUPABASE_READY || !code) return;
    const t = setInterval(() => refresh(code), 3000);
    return () => clearInterval(t);
  }, [code, refresh]);

  function onEntered({ meId, session }) {
    saveCode(session.code);
    setCode(session.code);
    setMeId(meId);
    setSession(session);
    setError("");
  }

  function leave() {
    clearSession();
    setCode("");
    setMeId(null);
    setSession(null);
  }

  if (!SUPABASE_READY) return <SetupNotice />;
  if (loading) return <div className="center muted">Loading…</div>;

  // No saved session, or our token isn't a member of it (e.g. different device).
  if (!code || !session || meId == null) {
    return <Landing onEntered={onEntered} />;
  }

  return (
    <Session
      session={session}
      meId={meId}
      error={error}
      refresh={() => refresh(code)}
      onLeave={leave}
      setError={setError}
    />
  );
}
