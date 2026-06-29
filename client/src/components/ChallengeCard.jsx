import { useState } from "react";
import { api } from "../api.js";
import { fmt, usd } from "../format.js";
import Social from "./Social.jsx";

export default function ChallengeCard({ challenge: c, members, me, isHost, act, onMakeBet }) {
  const canManage = me && (me.id === c.creatorId || isHost);
  const [pickMode, setPickMode] = useState(false);
  const [who, setWho] = useState(me?.id || "");

  const done = c.status === "done";
  const canceled = c.status === "canceled";

  return (
    <div className={"bet challenge" + (done ? " settled" : "")}>
      <div className="bet-head">
        <div className="question">{c.title}</div>
        {c.reward > 0 && (
          <span className="reward">
            🏆 {fmt(c.reward)}
            <span className="usd"> · {usd(c.reward)}</span>
          </span>
        )}
      </div>

      <div className="muted small">
        by {c.creatorName}
        {done && c.completedByName && (
          <span className="up"> · done by {c.completedByName} ✅</span>
        )}
        {canceled && <span> · called off</span>}
      </div>

      {canManage && c.status === "open" && (
        <div className="manage">
          {!pickMode ? (
            <>
              <button className="btn primary sm" onClick={() => setPickMode(true)}>
                Mark done
              </button>
              {onMakeBet && (
                <button className="btn ghost sm" onClick={() => onMakeBet(c)}>
                  Make it a bet
                </button>
              )}
              <button
                className="btn ghost sm"
                onClick={() => {
                  if (confirm(`Cancel "${c.title}"?`)) act(() => api.cancelChallenge(c.id));
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <div className="wager-row">
              <select
                className="amount wide"
                value={who}
                onChange={(e) => setWho(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                className="btn primary"
                disabled={!who}
                onClick={() => act(() => api.completeChallenge(c.id, who))}
              >
                Award
              </button>
            </div>
          )}
        </div>
      )}

      <Social targetType="challenge" target={c} me={me} act={act} />
    </div>
  );
}
