import express from "express";
import cors from "cors";
import { customAlphabet, nanoid } from "nanoid";
import db from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const now = () => Date.now();
const id = () => nanoid();
// Unambiguous join codes (no 0/O/1/I).
const makeCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

// --- helpers ---------------------------------------------------------------

function memberFromToken(req) {
  const token = req.header("x-token");
  if (!token) return null;
  return db.prepare("SELECT * FROM members WHERE token = ?").get(token) || null;
}

function logEvent(sessionId, type, text) {
  db.prepare(
    "INSERT INTO events (id, session_id, type, text, created_at) VALUES (?,?,?,?,?)"
  ).run(id(), sessionId, type, text, now());
}

// Build the full public view of a session, computing live pools per bet.
function sessionView(session, meId = null) {
  const members = db
    .prepare(
      "SELECT id, name, balance, is_host FROM members WHERE session_id = ? ORDER BY balance DESC, name"
    )
    .all(session.id);

  // Pull all comments/reactions for the session once, then group by target.
  const allComments = db
    .prepare(
      "SELECT c.target_id, c.text, c.created_at, m.name AS author FROM comments c JOIN members m ON m.id = c.member_id WHERE c.session_id = ? ORDER BY c.created_at ASC"
    )
    .all(session.id);
  const allReactions = db
    .prepare("SELECT target_id, emoji, member_id FROM reactions WHERE session_id = ?")
    .all(session.id);

  const commentsFor = (targetId) =>
    allComments
      .filter((c) => c.target_id === targetId)
      .map((c) => ({ author: c.author, text: c.text, createdAt: c.created_at }));
  const reactionsFor = (targetId) => {
    const map = {};
    for (const r of allReactions.filter((r) => r.target_id === targetId)) {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false };
      map[r.emoji].count++;
      if (meId && r.member_id === meId) map[r.emoji].mine = true;
    }
    return map;
  };

  const bets = db
    .prepare("SELECT * FROM bets WHERE session_id = ? ORDER BY created_at DESC")
    .all(session.id)
    .map((bet) => {
      const outcomes = db
        .prepare("SELECT id, label FROM outcomes WHERE bet_id = ?")
        .all(bet.id);
      const wagers = db
        .prepare("SELECT * FROM wagers WHERE bet_id = ?")
        .all(bet.id);

      const totalPool = wagers.reduce((s, w) => s + w.amount, 0);
      const outcomeView = outcomes.map((o) => {
        const pool = wagers
          .filter((w) => w.outcome_id === o.id)
          .reduce((s, w) => s + w.amount, 0);
        return {
          ...o,
          pool,
          share: totalPool ? pool / totalPool : 0,
          isWinner: bet.winning_outcome_id === o.id,
        };
      });

      const myWager = meId
        ? wagers.find((w) => w.member_id === meId) || null
        : null;

      const creator = db
        .prepare("SELECT name FROM members WHERE id = ?")
        .get(bet.creator_member_id);

      return {
        id: bet.id,
        question: bet.question,
        status: bet.status,
        createdAt: bet.created_at,
        creatorName: creator?.name ?? "?",
        creatorId: bet.creator_member_id,
        totalPool,
        bettorCount: new Set(wagers.map((w) => w.member_id)).size,
        outcomes: outcomeView,
        winningOutcomeId: bet.winning_outcome_id,
        myWager: myWager
          ? { outcomeId: myWager.outcome_id, amount: myWager.amount }
          : null,
        comments: commentsFor(bet.id),
        reactions: reactionsFor(bet.id),
      };
    });

  const nameOf = (mid) =>
    mid ? db.prepare("SELECT name FROM members WHERE id = ?").get(mid)?.name ?? "?" : null;

  const challenges = db
    .prepare("SELECT * FROM challenges WHERE session_id = ? ORDER BY created_at DESC")
    .all(session.id)
    .map((c) => ({
      id: c.id,
      title: c.title,
      reward: c.reward,
      status: c.status,
      creatorId: c.creator_member_id,
      creatorName: nameOf(c.creator_member_id),
      completedById: c.completed_by_member_id,
      completedByName: nameOf(c.completed_by_member_id),
      createdAt: c.created_at,
      comments: commentsFor(c.id),
      reactions: reactionsFor(c.id),
    }));

  const events = db
    .prepare(
      "SELECT type, text, created_at FROM events WHERE session_id = ? ORDER BY created_at DESC LIMIT 50"
    )
    .all(session.id);

  return {
    id: session.id,
    name: session.name,
    code: session.code,
    status: session.status,
    startingBalance: session.starting_balance,
    members,
    bets,
    challenges,
    events: events.map((e) => ({ ...e, createdAt: e.created_at })),
  };
}

function requireMember(req, res) {
  const me = memberFromToken(req);
  if (!me) {
    res.status(401).json({ error: "Not a member of any session." });
    return null;
  }
  return me;
}

// --- routes ----------------------------------------------------------------

// Create a session; the creator becomes the host member.
app.post("/api/sessions", (req, res) => {
  const { name, hostName, startingBalance } = req.body ?? {};
  if (!name?.trim() || !hostName?.trim()) {
    return res.status(400).json({ error: "Session name and your name are required." });
  }
  const balance = Number.isFinite(startingBalance) ? Math.floor(startingBalance) : 1000;

  let code;
  for (let i = 0; i < 5; i++) {
    code = makeCode();
    const exists = db.prepare("SELECT 1 FROM sessions WHERE code = ?").get(code);
    if (!exists) break;
  }

  const sessionId = id();
  const memberId = id();
  const token = nanoid(32);
  const t = now();

  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO sessions (id, name, code, starting_balance, status, created_at) VALUES (?,?,?,?,?,?)"
    ).run(sessionId, name.trim(), code, balance, "open", t);
    db.prepare(
      "INSERT INTO members (id, session_id, name, token, balance, is_host, created_at) VALUES (?,?,?,?,?,?,?)"
    ).run(memberId, sessionId, hostName.trim(), token, balance, 1, t);
    logEvent(sessionId, "session", `${hostName.trim()} started "${name.trim()}" 🎉`);
  });
  tx();

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  res.json({ token, meId: memberId, session: sessionView(session, memberId) });
});

// Join an existing session by code.
app.post("/api/sessions/:code/join", (req, res) => {
  const { name } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: "Your name is required." });

  const session = db
    .prepare("SELECT * FROM sessions WHERE code = ?")
    .get((req.params.code || "").toUpperCase());
  if (!session) return res.status(404).json({ error: "No session with that code." });
  if (session.status === "settled")
    return res.status(409).json({ error: "This session has ended." });

  const memberId = id();
  const token = nanoid(32);
  db.prepare(
    "INSERT INTO members (id, session_id, name, token, balance, is_host, created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(memberId, session.id, name.trim(), token, session.starting_balance, 0, now());
  logEvent(session.id, "join", `${name.trim()} joined 👋`);

  res.json({ token, meId: memberId, session: sessionView(session, memberId) });
});

// Fetch a session (by code). Identifies "me" via x-token if present.
app.get("/api/sessions/:code", (req, res) => {
  const session = db
    .prepare("SELECT * FROM sessions WHERE code = ?")
    .get((req.params.code || "").toUpperCase());
  if (!session) return res.status(404).json({ error: "No session with that code." });

  const me = memberFromToken(req);
  const meId = me && me.session_id === session.id ? me.id : null;
  res.json({ meId, session: sessionView(session, meId) });
});

// Create a bet (any member of an open session).
app.post("/api/bets", (req, res) => {
  const me = requireMember(req, res);
  if (!me) return;
  const { question, outcomes } = req.body ?? {};
  const labels = (outcomes ?? []).map((o) => String(o).trim()).filter(Boolean);
  if (!question?.trim()) return res.status(400).json({ error: "A question is required." });
  if (labels.length < 2)
    return res.status(400).json({ error: "Add at least two outcomes." });

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(me.session_id);
  if (session.status !== "open")
    return res.status(409).json({ error: "This session is locked." });

  const betId = id();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO bets (id, session_id, question, status, creator_member_id, created_at) VALUES (?,?,?,?,?,?)"
    ).run(betId, me.session_id, question.trim(), "open", me.id, now());
    for (const label of labels) {
      db.prepare("INSERT INTO outcomes (id, bet_id, label) VALUES (?,?,?)").run(
        id(),
        betId,
        label
      );
    }
    logEvent(me.session_id, "bet", `${me.name} opened a bet: "${question.trim()}"`);
  });
  tx();

  res.json(sessionView(session, me.id));
});

// Place (or replace) a wager on an outcome while the bet is open.
app.post("/api/bets/:betId/wager", (req, res) => {
  const me = requireMember(req, res);
  if (!me) return;
  const { outcomeId, amount } = req.body ?? {};
  const stake = Math.floor(Number(amount));
  if (!Number.isFinite(stake) || stake <= 0)
    return res.status(400).json({ error: "Enter a positive amount." });

  const bet = db.prepare("SELECT * FROM bets WHERE id = ?").get(req.params.betId);
  if (!bet || bet.session_id !== me.session_id)
    return res.status(404).json({ error: "Bet not found." });
  if (bet.status !== "open")
    return res.status(409).json({ error: "Betting is closed on this one." });

  const outcome = db
    .prepare("SELECT * FROM outcomes WHERE id = ? AND bet_id = ?")
    .get(outcomeId, bet.id);
  if (!outcome) return res.status(400).json({ error: "Unknown outcome." });

  const existing = db
    .prepare("SELECT * FROM wagers WHERE bet_id = ? AND member_id = ?")
    .get(bet.id, me.id);

  // One position per member per bet: replacing refunds the old stake first.
  const refunded = existing ? existing.amount : 0;
  const available = me.balance + refunded;
  if (stake > available)
    return res.status(400).json({ error: `Not enough coins (you have ${available}).` });

  const tx = db.transaction(() => {
    if (existing) {
      db.prepare("DELETE FROM wagers WHERE id = ?").run(existing.id);
    }
    db.prepare(
      "INSERT INTO wagers (id, bet_id, outcome_id, member_id, amount, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id(), bet.id, outcome.id, me.id, stake, now());
    db.prepare("UPDATE members SET balance = ? WHERE id = ?").run(
      available - stake,
      me.id
    );
    logEvent(
      me.session_id,
      "wager",
      `${me.name} put ${stake} on "${outcome.label}" — ${bet.question}`
    );
  });
  tx();

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(me.session_id);
  res.json(sessionView(session, me.id));
});

function canManageBet(me, bet) {
  if (me.id === bet.creator_member_id) return true;
  return !!me.is_host;
}

// Lock a bet so no more wagers can be placed.
app.post("/api/bets/:betId/lock", (req, res) => {
  const me = requireMember(req, res);
  if (!me) return;
  const bet = db.prepare("SELECT * FROM bets WHERE id = ?").get(req.params.betId);
  if (!bet || bet.session_id !== me.session_id)
    return res.status(404).json({ error: "Bet not found." });
  if (!canManageBet(me, bet))
    return res.status(403).json({ error: "Only the bet's creator or the host can lock it." });
  if (bet.status === "settled")
    return res.status(409).json({ error: "Already settled." });

  db.prepare("UPDATE bets SET status = 'locked' WHERE id = ?").run(bet.id);
  logEvent(me.session_id, "lock", `Betting closed on "${bet.question}"`);
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(me.session_id);
  res.json(sessionView(session, me.id));
});

// Resolve a bet: pick the winning outcome and pay out the pool (parimutuel).
app.post("/api/bets/:betId/resolve", (req, res) => {
  const me = requireMember(req, res);
  if (!me) return;
  const { winningOutcomeId } = req.body ?? {};
  const bet = db.prepare("SELECT * FROM bets WHERE id = ?").get(req.params.betId);
  if (!bet || bet.session_id !== me.session_id)
    return res.status(404).json({ error: "Bet not found." });
  if (!canManageBet(me, bet))
    return res.status(403).json({ error: "Only the bet's creator or the host can resolve it." });
  if (bet.status === "settled")
    return res.status(409).json({ error: "Already settled." });

  const winning = db
    .prepare("SELECT * FROM outcomes WHERE id = ? AND bet_id = ?")
    .get(winningOutcomeId, bet.id);
  if (!winning) return res.status(400).json({ error: "Pick a valid winning outcome." });

  const wagers = db.prepare("SELECT * FROM wagers WHERE bet_id = ?").all(bet.id);
  const totalPool = wagers.reduce((s, w) => s + w.amount, 0);
  const winningWagers = wagers.filter((w) => w.outcome_id === winning.id);
  const winningPool = winningWagers.reduce((s, w) => s + w.amount, 0);

  const tx = db.transaction(() => {
    if (winningPool === 0) {
      // Nobody backed the winner — refund every stake.
      for (const w of wagers) {
        db.prepare("UPDATE members SET balance = balance + ? WHERE id = ?").run(
          w.amount,
          w.member_id
        );
      }
      logEvent(
        me.session_id,
        "settle",
        `"${bet.question}" → ${winning.label}. Nobody called it; stakes refunded.`
      );
    } else {
      // Winners split the whole pool proportional to their stake.
      for (const w of winningWagers) {
        const payout = Math.round((w.amount / winningPool) * totalPool);
        db.prepare("UPDATE members SET balance = balance + ? WHERE id = ?").run(
          payout,
          w.member_id
        );
      }
      const names = winningWagers
        .map((w) => db.prepare("SELECT name FROM members WHERE id = ?").get(w.member_id)?.name)
        .filter(Boolean);
      logEvent(
        me.session_id,
        "settle",
        `"${bet.question}" → ${winning.label}. Pool of ${totalPool} paid to ${
          names.join(", ") || "nobody"
        } 💰`
      );
    }
    db.prepare(
      "UPDATE bets SET status = 'settled', winning_outcome_id = ? WHERE id = ?"
    ).run(winning.id, bet.id);
  });
  tx();

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(me.session_id);
  res.json(sessionView(session, me.id));
});

// --- challenges ------------------------------------------------------------

// Propose a challenge/dare with a coin bounty (any member, open session).
app.post("/api/challenges", (req, res) => {
  const me = requireMember(req, res);
  if (!me) return;
  const { title, reward } = req.body ?? {};
  const bounty = Math.max(0, Math.floor(Number(reward) || 0));
  if (!title?.trim()) return res.status(400).json({ error: "A challenge needs a title." });

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(me.session_id);
  if (session.status !== "open")
    return res.status(409).json({ error: "This session is locked." });

  db.prepare(
    "INSERT INTO challenges (id, session_id, title, reward, status, creator_member_id, created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(id(), me.session_id, title.trim(), bounty, "open", me.id, now());
  logEvent(
    me.session_id,
    "challenge",
    `${me.name} added a challenge: "${title.trim()}"${bounty ? ` (${bounty} coins)` : ""}`
  );
  res.json(sessionView(session, me.id));
});

// Mark a challenge done — the named member collects the bounty (bonus coins).
app.post("/api/challenges/:id/complete", (req, res) => {
  const me = requireMember(req, res);
  if (!me) return;
  const { memberId } = req.body ?? {};
  const ch = db.prepare("SELECT * FROM challenges WHERE id = ?").get(req.params.id);
  if (!ch || ch.session_id !== me.session_id)
    return res.status(404).json({ error: "Challenge not found." });
  if (me.id !== ch.creator_member_id && !me.is_host)
    return res.status(403).json({ error: "Only the creator or host can mark it done." });
  if (ch.status !== "open")
    return res.status(409).json({ error: "Challenge is already closed." });

  const winner = db
    .prepare("SELECT * FROM members WHERE id = ? AND session_id = ?")
    .get(memberId, me.session_id);
  if (!winner) return res.status(400).json({ error: "Pick who completed it." });

  const tx = db.transaction(() => {
    if (ch.reward > 0) {
      db.prepare("UPDATE members SET balance = balance + ? WHERE id = ?").run(
        ch.reward,
        winner.id
      );
    }
    db.prepare(
      "UPDATE challenges SET status = 'done', completed_by_member_id = ? WHERE id = ?"
    ).run(winner.id, ch.id);
    logEvent(
      me.session_id,
      "challenge",
      `${winner.name} completed "${ch.title}"${ch.reward ? ` and earned ${ch.reward} coins 🏆` : " 🏆"}`
    );
  });
  tx();

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(me.session_id);
  res.json(sessionView(session, me.id));
});

// Cancel a challenge (creator or host).
app.post("/api/challenges/:id/cancel", (req, res) => {
  const me = requireMember(req, res);
  if (!me) return;
  const ch = db.prepare("SELECT * FROM challenges WHERE id = ?").get(req.params.id);
  if (!ch || ch.session_id !== me.session_id)
    return res.status(404).json({ error: "Challenge not found." });
  if (me.id !== ch.creator_member_id && !me.is_host)
    return res.status(403).json({ error: "Only the creator or host can cancel it." });
  if (ch.status !== "open")
    return res.status(409).json({ error: "Challenge is already closed." });

  db.prepare("UPDATE challenges SET status = 'canceled' WHERE id = ?").run(ch.id);
  logEvent(me.session_id, "challenge", `"${ch.title}" was called off.`);
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(me.session_id);
  res.json(sessionView(session, me.id));
});

// --- comments & reactions --------------------------------------------------

const TARGET_TYPES = new Set(["bet", "challenge"]);

// Post a comment on a bet or challenge.
app.post("/api/comments", (req, res) => {
  const me = requireMember(req, res);
  if (!me) return;
  const { targetType, targetId, text } = req.body ?? {};
  if (!TARGET_TYPES.has(targetType))
    return res.status(400).json({ error: "Bad target." });
  if (!text?.trim()) return res.status(400).json({ error: "Say something first." });

  db.prepare(
    "INSERT INTO comments (id, session_id, target_type, target_id, member_id, text, created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(id(), me.session_id, targetType, targetId, me.id, text.trim().slice(0, 280), now());

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(me.session_id);
  res.json(sessionView(session, me.id));
});

// Toggle an emoji reaction on a bet or challenge.
app.post("/api/reactions/toggle", (req, res) => {
  const me = requireMember(req, res);
  if (!me) return;
  const { targetType, targetId, emoji } = req.body ?? {};
  if (!TARGET_TYPES.has(targetType) || !emoji)
    return res.status(400).json({ error: "Bad reaction." });

  const existing = db
    .prepare(
      "SELECT id FROM reactions WHERE target_type = ? AND target_id = ? AND member_id = ? AND emoji = ?"
    )
    .get(targetType, targetId, me.id, emoji);

  if (existing) {
    db.prepare("DELETE FROM reactions WHERE id = ?").run(existing.id);
  } else {
    db.prepare(
      "INSERT INTO reactions (id, session_id, target_type, target_id, member_id, emoji, created_at) VALUES (?,?,?,?,?,?,?)"
    ).run(id(), me.session_id, targetType, targetId, me.id, emoji, now());
  }

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(me.session_id);
  res.json(sessionView(session, me.id));
});

// Host locks/ends the whole session (no new bets).
app.post("/api/sessions/:code/lock", (req, res) => {
  const me = requireMember(req, res);
  if (!me) return;
  if (!me.is_host) return res.status(403).json({ error: "Only the host can lock the session." });
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(me.session_id);
  db.prepare("UPDATE sessions SET status = 'locked' WHERE id = ?").run(session.id);
  logEvent(session.id, "session", `${me.name} locked the session — no new bets.`);
  const updated = db.prepare("SELECT * FROM sessions WHERE id = ?").get(session.id);
  res.json(sessionView(updated, me.id));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Sidebet API on http://localhost:${PORT}`));
