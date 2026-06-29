import { useState } from "react";
import { api } from "../api.js";

const FEATURES = [
  {
    icon: "🎲",
    title: "Make markets",
    desc: "Bet on anything — “Will Maya oversleep the hike?” Pooled, parimutuel-style: winners split the pot.",
  },
  {
    icon: "🏆",
    title: "Challenges & dares",
    desc: "Throw down a dare with a coin bounty. Polar plunge for 300? Turn any dare into a bet in one tap.",
  },
  {
    icon: "💬",
    title: "Talk trash",
    desc: "React and comment on every bet and dare. The feed is half the fun.",
  },
  {
    icon: "📈",
    title: "Climb the board",
    desc: "Live net worth on the leaderboard. Crown the trip’s biggest degen at the end.",
  },
];

const STEPS = [
  { n: 1, t: "Start a session", d: "Name your trip, set the starting coins, get a join code." },
  { n: 2, t: "Invite the crew", d: "Friends hop in with the code — no accounts, no installs." },
  { n: 3, t: "Bet, dare, settle", d: "Make markets, resolve them, watch the leaderboard move." },
];

export default function Landing({ onEntered }) {
  const [mode, setMode] = useState("join"); // join | create
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [balance, setBalance] = useState(1000);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "create") {
        const data = await api.createSession(sessionName, name, Number(balance));
        onEntered(data);
      } else {
        const data = await api.joinSession(code.trim().toUpperCase(), name);
        onEntered(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <div className="glow" />

      <header className="hero">
        <div className="pill">🎲 play-money prediction market</div>
        <h1 className="logo grad">GroupGamble</h1>
        <p className="tagline">Bet fake money on dumb stuff with your friends.</p>
        <p className="subtag">
          Start a session for your trip, hand everyone a stack of coins, and let the
          chaos begin. No real money — just bragging rights and a leaderboard.
        </p>
      </header>

      <div className="card glassy">
        <div className="tabs">
          <button
            className={mode === "join" ? "tab active" : "tab"}
            onClick={() => setMode("join")}
          >
            Join
          </button>
          <button
            className={mode === "create" ? "tab active" : "tab"}
            onClick={() => setMode("create")}
          >
            Start a session
          </button>
        </div>

        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ram"
              maxLength={24}
              required
            />
          </label>

          {mode === "join" ? (
            <label className="field">
              <span>Join code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="6-character code"
                className="code-input"
                maxLength={6}
                required
              />
            </label>
          ) : (
            <>
              <label className="field">
                <span>Session name</span>
                <input
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. Tahoe Trip 🏔️"
                  maxLength={40}
                  required
                />
              </label>
              <label className="field">
                <span>Starting coins per person</span>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </label>
            </>
          )}

          {error && <div className="error">{error}</div>}

          <button className="btn primary" disabled={busy}>
            {busy ? "…" : mode === "create" ? "Create session 🚀" : "Join session"}
          </button>
        </form>
      </div>

      <section className="features">
        {FEATURES.map((f) => (
          <div className="feature" key={f.title}>
            <div className="feature-icon">{f.icon}</div>
            <div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="how">
        <h3 className="how-title">How it works</h3>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="step-n">{s.n}</div>
              <div>
                <div className="step-t">{s.t}</div>
                <div className="step-d">{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="fineprint">
        No real money. No accounts. Just vibes. <span className="muted">100 coins = $1 (pretend).</span>
      </p>
    </div>
  );
}
