import { useState } from "react";
import { usd } from "../format.js";

export default function NewChallenge({ onCreate, onCancel }) {
  const [title, setTitle] = useState("");
  const [reward, setReward] = useState(200);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onCreate(title.trim(), Number(reward) || 0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card newbet" onSubmit={submit}>
      <label className="field">
        <span>The challenge / dare</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Polar plunge at the lake 🥶"
          autoFocus
          maxLength={120}
        />
      </label>

      <label className="field">
        <span>Bounty (bonus coins for whoever does it)</span>
        <input
          type="number"
          min={0}
          step={50}
          value={reward}
          onChange={(e) => setReward(e.target.value)}
        />
        <small className="muted">≈ {usd(Number(reward) || 0)}</small>
      </label>

      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy}>
          {busy ? "…" : "Add challenge"}
        </button>
      </div>
    </form>
  );
}
