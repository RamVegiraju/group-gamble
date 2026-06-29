# GroupGamble 🎲

A play-money prediction market for friend groups. Start a **session** (a trip,
a weekend, whatever), invite friends with a code, everyone gets fake coins, and
you bet on dumb stuff that'll happen. No real money, no payments — just bragging
rights and a leaderboard. Plus **challenges/dares** with coin bounties, and
**comments + reactions** on everything.

Betting is **parimutuel**: everyone bets into a shared pool per question, and
winners split the pool in proportion to their stake. No house, no bookie.

## Architecture (serverless)

- **client/** — React + Vite single-page app (mobile-friendly). The only thing
  that gets deployed.
- **Supabase** — hosted Postgres holds all data and the game logic. The browser
  talks straight to it via RPC; there's no server of yours to run.
- **supabase/schema.sql** — all tables + the `SECURITY DEFINER` Postgres
  functions that enforce balances, payouts, and permissions. Clients can only
  call those functions (Row Level Security denies direct table access).
- **server/** — *legacy.* The original local Node/Express + SQLite backend from
  the prototype. No longer used by the app; kept for reference.

Identity is a random uuid stored in each browser's localStorage and passed to
every function — fine for a friends-only app (no login).

## One-time setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor → New query**, paste the entire contents
   of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Go to **Project Settings → API** and copy your **Project URL** and the
   **`anon` public** key.
4. Create `client/.env` (copy from `client/.env.example`):

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```

## Run locally

```bash
cd client && npm install && npm run dev   # http://localhost:5173
```

Create a session, share the 6-char code, and have a friend join. To test on a
phone on the same Wi-Fi: `npm run dev -- --host` and open the Network URL it
prints.

## Deploy to GitHub Pages

The anon key is public by design, so it's safe to bake into the static build.

1. Build with the repo path as the base (Pages serves project sites from
   `/<repo>/`), passing your Supabase env vars:

   ```bash
   cd client
   GH_BASE="/YOUR-REPO/" \
   VITE_SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
   VITE_SUPABASE_ANON_KEY="YOUR-ANON-KEY" \
   npm run build
   ```

2. Publish `client/dist/` to the `gh-pages` branch (e.g. with the `gh-pages`
   npm package, or a GitHub Actions workflow), and enable Pages for that branch.

> Prefer **Vercel** or **Netlify**? Even simpler: point them at `client/`, set
> the two `VITE_SUPABASE_*` env vars in the dashboard, and leave `GH_BASE`
> unset (they serve from `/`). No build flags to remember.

## How the game works

- **Host** creates a session → gets a 6-char join code + starting balance.
- **Friends** join with the code and a display name.
- **Anyone** proposes bets (a question + 2+ outcomes) or challenges (a dare +
  coin bounty).
- **Members** stake coins on an outcome while a bet is `open`.
- A bet's **creator or host** locks betting, then resolves it — payouts
  distribute automatically (parimutuel). For a settled bet, each winning wager
  pays `stake / winning_pool * total_pool`; if nobody backed the winner, all
  stakes refund.
- Completing a **challenge** awards its bounty (bonus coins from the system) to
  the named member. Any challenge can be turned into a Yes/No market in one tap.
- **Comments + reactions** live on every bet and challenge.

Coins ↔ dollars is a fixed display-only rate (**100 coins = $1**), set by
`COINS_PER_DOLLAR` in `client/src/format.js`.

## Next steps

- Real-time updates (Supabase Realtime) to replace the 3s polling
- Photo proof for challenge completion
- "Majority of bettors confirm" resolution instead of creator-only
- End-of-trip recap card ("GroupGamble Wrapped")
- Optional real accounts (Supabase Auth) if it outgrows friends-only
