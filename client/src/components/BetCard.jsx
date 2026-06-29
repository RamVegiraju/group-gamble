import { useState } from "react";
import { api } from "../api.js";
import Social from "./Social.jsx";

const fmt = (n) => n.toLocaleString();
const COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444"];

export default function BetCard({ bet, me, isHost, act }) {
  const canManage = me && (me.id === bet.creatorId || isHost);
  const [amount, setAmount] = useState(50);
  const [picked, setPicked] = useState(bet.myWager?.outcomeId || null);
  const [resolveMode, setResolveMode] = useState(false);

  const open = bet.status === "open";
  const settled = bet.status === "settled";

  return (
    <div className={"bet" + (settled ? " settled" : "")}>
      <div className="bet-head">
        <div className="question">{bet.question}</div>
        <StatusBadge status={bet.status} />
      </div>
      <div className="muted small">
        by {bet.creatorName} · pool {fmt(bet.totalPool)} · {bet.bettorCount} in
      </div>

      {/* Pool split bar */}
      {bet.totalPool > 0 && (
        <div className="poolbar">
          {bet.outcomes.map((o, i) =>
            o.pool > 0 ? (
              <div
                key={o.id}
                className="seg"
                style={{ width: `${o.share * 100}%`, background: COLORS[i % COLORS.length] }}
                title={`${o.label}: ${fmt(o.pool)}`}
              />
            ) : null
          )}
        </div>
      )}

      <div className="outcomes">
        {bet.outcomes.map((o, i) => {
          const mine = bet.myWager?.outcomeId === o.id;
          const selectable = open;
          const cls =
            "outcome" +
            (picked === o.id && open ? " picked" : "") +
            (o.isWinner ? " winner" : "") +
            (mine ? " mine" : "");
          return (
            <button
              key={o.id}
              className={cls}
              disabled={!selectable && !resolveMode}
              onClick={() => {
                if (resolveMode) {
                  if (confirm(`Resolve "${bet.question}" as "${o.label}"?`)) {
                    act(() => api.resolveBet(bet.id, o.id));
                  }
                } else if (open) {
                  setPicked(o.id);
                }
              }}
            >
              <span className="dot-color" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="o-label">{o.label}</span>
              <span className="o-meta">
                {o.isWinner && "✅ "}
                {Math.round(o.share * 100)}%
              </span>
              {mine && <span className="o-mine">you: {fmt(bet.myWager.amount)}</span>}
            </button>
          );
        })}
      </div>

      {open && me && (
        <>
          {!picked && (
            <div className="hint">👆 Tap an outcome above to pick your side</div>
          )}
          <div className="wager-row">
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="amount"
            />
            <button
              className="btn primary"
              disabled={!picked}
              onClick={() => act(() => api.wager(bet.id, picked, Number(amount)))}
            >
              {!picked ? "Pick a side first" : bet.myWager ? "Update bet" : "Place bet"}
            </button>
          </div>
        </>
      )}

      {canManage && !settled && (
        <div className="manage">
          {open && (
            <button className="btn ghost sm" onClick={() => act(() => api.lockBet(bet.id))}>
              Close betting
            </button>
          )}
          <button
            className={"btn sm " + (resolveMode ? "primary" : "ghost")}
            onClick={() => setResolveMode((v) => !v)}
            type="button"
          >
            {resolveMode ? "Pick the winner above…" : "Resolve"}
          </button>
        </div>
      )}

      <Social targetType="bet" target={bet} me={me} act={act} />
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    open: { t: "open", c: "green" },
    locked: { t: "closed", c: "amber" },
    settled: { t: "settled", c: "gray" },
  };
  const s = map[status] || map.open;
  return <span className={"badge " + s.c}>{s.t}</span>;
}
