import { useState } from "react";

export default function NewBet({ onCreate, onCancel, initialQuestion = "" }) {
  const [question, setQuestion] = useState(initialQuestion);
  const [outcomes, setOutcomes] = useState(["Yes", "No"]);
  const [busy, setBusy] = useState(false);

  function setOutcome(i, val) {
    setOutcomes((o) => o.map((x, idx) => (idx === i ? val : x)));
  }
  function addOutcome() {
    setOutcomes((o) => [...o, ""]);
  }
  function removeOutcome(i) {
    setOutcomes((o) => o.filter((_, idx) => idx !== i));
  }

  async function submit(e) {
    e.preventDefault();
    const clean = outcomes.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || clean.length < 2) return;
    setBusy(true);
    try {
      await onCreate(question.trim(), clean);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card newbet" onSubmit={submit}>
      <label className="field">
        <span>What's the bet?</span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Will Maya oversleep the sunrise hike?"
          autoFocus
          maxLength={120}
        />
      </label>

      <div className="field">
        <span>Outcomes</span>
        {outcomes.map((o, i) => (
          <div className="outcome-edit" key={i}>
            <input
              value={o}
              onChange={(e) => setOutcome(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              maxLength={40}
            />
            {outcomes.length > 2 && (
              <button type="button" className="x" onClick={() => removeOutcome(i)}>
                ✕
              </button>
            )}
          </div>
        ))}
        {outcomes.length < 6 && (
          <button type="button" className="btn ghost sm" onClick={addOutcome}>
            + Add outcome
          </button>
        )}
      </div>

      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy}>
          {busy ? "…" : "Open bet"}
        </button>
      </div>
    </form>
  );
}
