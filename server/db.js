import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, "sidebet.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    code             TEXT NOT NULL UNIQUE,
    starting_balance INTEGER NOT NULL DEFAULT 1000,
    status           TEXT NOT NULL DEFAULT 'open',   -- open | locked | settled
    created_at       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    token       TEXT NOT NULL UNIQUE,
    balance     INTEGER NOT NULL,
    is_host     INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bets (
    id                 TEXT PRIMARY KEY,
    session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question           TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'open',  -- open | locked | settled
    creator_member_id  TEXT NOT NULL REFERENCES members(id),
    winning_outcome_id TEXT,
    created_at         INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS outcomes (
    id      TEXT PRIMARY KEY,
    bet_id  TEXT NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
    label   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wagers (
    id          TEXT PRIMARY KEY,
    bet_id      TEXT NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
    outcome_id  TEXT NOT NULL REFERENCES outcomes(id),
    member_id   TEXT NOT NULL REFERENCES members(id),
    amount      INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id                     TEXT PRIMARY KEY,
    session_id             TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    title                  TEXT NOT NULL,
    reward                 INTEGER NOT NULL DEFAULT 0,
    status                 TEXT NOT NULL DEFAULT 'open',  -- open | done | canceled
    creator_member_id      TEXT NOT NULL REFERENCES members(id),
    completed_by_member_id TEXT REFERENCES members(id),
    created_at             INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,                       -- 'bet' | 'challenge'
    target_id   TEXT NOT NULL,
    member_id   TEXT NOT NULL REFERENCES members(id),
    text        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    member_id   TEXT NOT NULL REFERENCES members(id),
    emoji       TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    UNIQUE(target_type, target_id, member_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_members_session ON members(session_id);
  CREATE INDEX IF NOT EXISTS idx_bets_session    ON bets(session_id);
  CREATE INDEX IF NOT EXISTS idx_outcomes_bet    ON outcomes(bet_id);
  CREATE INDEX IF NOT EXISTS idx_wagers_bet      ON wagers(bet_id);
  CREATE INDEX IF NOT EXISTS idx_events_session  ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_challenges_session ON challenges(session_id);
  CREATE INDEX IF NOT EXISTS idx_comments_session  ON comments(session_id);
  CREATE INDEX IF NOT EXISTS idx_reactions_session ON reactions(session_id);
`);

export default db;
