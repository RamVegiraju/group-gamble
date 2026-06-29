import { useMemo, useState } from "react";
import { api } from "../api.js";
import { fmt, usd, COINS_PER_DOLLAR } from "../format.js";
import BetCard from "./BetCard.jsx";
import NewBet from "./NewBet.jsx";
import ChallengeCard from "./ChallengeCard.jsx";
import NewChallenge from "./NewChallenge.jsx";

export default function Session({ session, meId, error, refresh, onLeave, setError }) {
  const [tab, setTab] = useState("markets");
  const [showNew, setShowNew] = useState(false);
  const [betPrefill, setBetPrefill] = useState("");
  const [showNewChallenge, setShowNewChallenge] = useState(false);

  const me = session.members.find((m) => m.id === meId);
  const isHost = !!me?.is_host;
  const sessionOpen = session.status === "open";

  const openBets = session.bets.filter((b) => b.status !== "settled");
  const settledBets = session.bets.filter((b) => b.status === "settled");
  const challenges = session.challenges ?? [];
  const openChallenges = challenges.filter((c) => c.status === "open");
  const closedChallenges = challenges.filter((c) => c.status !== "open");

  const ranked = useMemo(
    () => [...session.members].sort((a, b) => b.balance - a.balance),
    [session.members]
  );

  async function act(fn) {
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  // Turn a challenge into a Yes/No market and jump to the Markets tab.
  function makeBetFromChallenge(c) {
    setBetPrefill(`Will someone complete: ${c.title}?`);
    setShowNew(true);
    setTab("markets");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="session-name">{session.name}</div>
          <div className="muted small">
            Code <span className="code-pill">{session.code}</span>
            {session.status !== "open" && (
              <span className="badge gray">{session.status}</span>
            )}
          </div>
        </div>
        <div className="balance">
          <div className="balance-num">{me ? fmt(me.balance) : "—"}</div>
          <div className="muted small">{me ? `≈ ${usd(me.balance)}` : "coins"}</div>
        </div>
      </header>

      <div className="rate-strip muted small">
        💱 {COINS_PER_DOLLAR} coins = $1 · play money only
      </div>

      {error && <div className="error bar">{error}</div>}

      <nav className="tabbar">
        <button className={tab === "markets" ? "active" : ""} onClick={() => setTab("markets")}>
          Markets
        </button>
        <button className={tab === "challenges" ? "active" : ""} onClick={() => setTab("challenges")}>
          Challenges
        </button>
        <button className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}>
          Board
        </button>
        <button className={tab === "feed" ? "active" : ""} onClick={() => setTab("feed")}>
          Feed
        </button>
      </nav>

      <main className="content">
        {tab === "markets" && (
          <>
            {sessionOpen ? (
              showNew ? (
                <NewBet
                  initialQuestion={betPrefill}
                  onCancel={() => {
                    setShowNew(false);
                    setBetPrefill("");
                  }}
                  onCreate={async (q, outcomes) => {
                    await act(() => api.createBet(session.id, q, outcomes));
                    setShowNew(false);
                    setBetPrefill("");
                  }}
                />
              ) : (
                <button className="btn primary block" onClick={() => setShowNew(true)}>
                  + New bet
                </button>
              )
            ) : (
              <div className="notice">Session is locked — no new bets.</div>
            )}

            {openBets.length === 0 && settledBets.length === 0 && (
              <div className="empty">No bets yet. Be the first to call something 👀</div>
            )}

            {openBets.map((bet) => (
              <BetCard key={bet.id} bet={bet} me={me} isHost={isHost} act={act} />
            ))}

            {settledBets.length > 0 && (
              <>
                <div className="section-label">Settled</div>
                {settledBets.map((bet) => (
                  <BetCard key={bet.id} bet={bet} me={me} isHost={isHost} act={act} />
                ))}
              </>
            )}
          </>
        )}

        {tab === "challenges" && (
          <>
            {sessionOpen ? (
              showNewChallenge ? (
                <NewChallenge
                  onCancel={() => setShowNewChallenge(false)}
                  onCreate={async (title, reward) => {
                    await act(() => api.createChallenge(session.id, title, reward));
                    setShowNewChallenge(false);
                  }}
                />
              ) : (
                <button className="btn primary block" onClick={() => setShowNewChallenge(true)}>
                  + New challenge
                </button>
              )
            ) : (
              <div className="notice">Session is locked.</div>
            )}

            {challenges.length === 0 && (
              <div className="empty">No challenges yet. Dare your friends to do something 😈</div>
            )}

            {openChallenges.map((c) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                members={session.members}
                me={me}
                isHost={isHost}
                act={act}
                onMakeBet={sessionOpen ? makeBetFromChallenge : null}
              />
            ))}

            {closedChallenges.length > 0 && (
              <>
                <div className="section-label">Done</div>
                {closedChallenges.map((c) => (
                  <ChallengeCard
                    key={c.id}
                    challenge={c}
                    members={session.members}
                    me={me}
                    isHost={isHost}
                    act={act}
                  />
                ))}
              </>
            )}
          </>
        )}

        {tab === "board" && (
          <div className="board">
            {ranked.map((m, i) => {
              const delta = m.balance - session.startingBalance;
              return (
                <div key={m.id} className={"row" + (m.id === meId ? " me" : "")}>
                  <div className="rank">{["🥇", "🥈", "🥉"][i] || i + 1}</div>
                  <div className="who">
                    {m.name}
                    {m.is_host ? <span className="badge">host</span> : null}
                  </div>
                  <div className="net">
                    <div className="balance-num">{fmt(m.balance)}</div>
                    <div className="small muted">{usd(m.balance)}</div>
                    <div className={"small " + (delta >= 0 ? "up" : "down")}>
                      {delta >= 0 ? "+" : ""}
                      {fmt(delta)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "feed" && (
          <div className="feed">
            {session.events.length === 0 && <div className="empty">Nothing yet.</div>}
            {session.events.map((e, i) => (
              <div key={i} className="event">
                <span className={"dot " + e.type} />
                <span>{e.text}</span>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="footer">
        {isHost && sessionOpen && (
          <button
            className="btn ghost"
            onClick={() => {
              if (confirm("Lock the session? No new bets can be created.")) {
                act(() => api.lockSession(session.id));
              }
            }}
          >
            Lock session
          </button>
        )}
        <button className="btn ghost" onClick={onLeave}>
          Leave
        </button>
      </footer>
    </div>
  );
}
