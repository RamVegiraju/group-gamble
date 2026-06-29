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

  const total = bet.totalPool;
  // Current parimutuel odds for an outcome = total pool / that outcome's pool.
  const oddsFor = (o) => (total > 0 && o.pool > 0 ? total / o.pool : null);

  // Live payout estimate for the picked outcome at the entered stake. Parimutuel
  // includes your own stake in the pool, and re-betting replaces your old stake —
  // so strip any existing wager first, then add the new one.
  const stake = Math.floor(Number(amount)) || 0;
  const pickedOutcome = bet.outcomes.find((o) => o.id === picked);
  let preview = null;
  if (open && me && pickedOutcome && stake > 0) {
    const myOld = bet.myWager;
    const baseTotal = total - (myOld ? myOld.amount : 0);
    const basePool =
      pickedOutcome.pool - (myOld && myOld.outcomeId === pickedOutcome.id ? myOld.amount : 0);
    const newPool = basePool + stake;
    const newTotal = baseTotal + stake;
    const payout = newPool > 0 ? (stake / newPool) * newTotal : stake;
    preview = {
      label: pickedOutcome.label,
      payout: Math.round(payout),
      net: Math.round(payout - stake),
      mult: payout / stake,
    };
  }

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
                {oddsFor(o) ? (
                  <span className="odds">{oddsFor(o).toFixed(2)}×</span>
                ) : (
                  <span className="odds muted">—</span>
                )}
                <span className="o-share">{Math.round(o.share * 100)}%</span>
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
          {preview && (
            <div className="payout-preview">
              If <b>{preview.label}</b> wins → <b>{fmt(preview.payout)}</b> coins
              <span className="net"> (+{fmt(preview.net)})</span>
              <span className="muted"> · {preview.mult.toFixed(2)}× your stake</span>
            </div>
          )}
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
