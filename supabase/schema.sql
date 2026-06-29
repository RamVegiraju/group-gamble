-- ============================================================================
-- GroupGamble — Supabase schema + RPC functions
-- ============================================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query → paste → Run).
-- Safe to re-run: it drops and recreates everything in the right order.
--
-- Security model:
--   * Clients NEVER touch tables directly. RLS is ON with no policies (deny all),
--     and table privileges are revoked from anon/authenticated.
--   * All reads/writes go through SECURITY DEFINER functions below, which run as
--     the table owner and enforce the rules (balances, payouts, permissions).
--   * "Identity" is a random uuid the browser generates and stores in
--     localStorage, passed as p_token. Same trust level as a friends-only app.
-- ============================================================================

-- ---- clean slate -----------------------------------------------------------
drop table if exists reactions  cascade;
drop table if exists comments   cascade;
drop table if exists events      cascade;
drop table if exists wagers      cascade;
drop table if exists outcomes    cascade;
drop table if exists bets        cascade;
drop table if exists challenges  cascade;
drop table if exists members     cascade;
drop table if exists sessions    cascade;

-- ---- tables ----------------------------------------------------------------
create table sessions (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  code             text not null unique,
  starting_balance int  not null default 1000,
  status           text not null default 'open',      -- open | locked | settled
  created_at       timestamptz not null default now()
);

create table members (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_token text not null,
  name       text not null,
  balance    int  not null,
  is_host    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, user_token)
);

create table bets (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references sessions(id) on delete cascade,
  question           text not null,
  status             text not null default 'open',     -- open | locked | settled
  creator_member_id  uuid not null references members(id),
  winning_outcome_id uuid,
  created_at         timestamptz not null default now()
);

create table outcomes (
  id       uuid primary key default gen_random_uuid(),
  bet_id   uuid not null references bets(id) on delete cascade,
  label    text not null,
  position int  not null default 0
);

create table wagers (
  id         uuid primary key default gen_random_uuid(),
  bet_id     uuid not null references bets(id) on delete cascade,
  outcome_id uuid not null references outcomes(id),
  member_id  uuid not null references members(id),
  amount     int  not null,
  created_at timestamptz not null default now()
);

create table challenges (
  id                     uuid primary key default gen_random_uuid(),
  session_id             uuid not null references sessions(id) on delete cascade,
  title                  text not null,
  reward                 int  not null default 0,
  status                 text not null default 'open',  -- open | done | canceled
  creator_member_id      uuid not null references members(id),
  completed_by_member_id uuid references members(id),
  created_at             timestamptz not null default now()
);

create table events (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  type       text not null,
  text       text not null,
  created_at timestamptz not null default now()
);

create table comments (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  target_type text not null,                            -- 'bet' | 'challenge'
  target_id   uuid not null,
  member_id   uuid not null references members(id),
  text        text not null,
  created_at  timestamptz not null default now()
);

create table reactions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  target_type text not null,
  target_id   uuid not null,
  member_id   uuid not null references members(id),
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, member_id, emoji)
);

create index on members(session_id);
create index on bets(session_id);
create index on outcomes(bet_id);
create index on wagers(bet_id);
create index on challenges(session_id);
create index on events(session_id);
create index on comments(target_id);
create index on reactions(target_id);

-- ---- lock the tables down (deny direct client access) ----------------------
alter table sessions   enable row level security;
alter table members    enable row level security;
alter table bets       enable row level security;
alter table outcomes   enable row level security;
alter table wagers     enable row level security;
alter table challenges enable row level security;
alter table comments   enable row level security;
alter table reactions  enable row level security;
alter table events     enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- ============================================================================
-- helpers
-- ============================================================================
create or replace function gg_make_code()
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- no 0/O/1/I
  res text := '';
  i int;
begin
  for i in 1..6 loop
    res := res || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return res;
end $$;

create or replace function comments_json(p_type text, p_target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'author', m.name,
           'text', c.text,
           'createdAt', (extract(epoch from c.created_at) * 1000)::bigint
         ) order by c.created_at asc), '[]'::jsonb)
  from comments c join members m on m.id = c.member_id
  where c.target_type = p_type and c.target_id = p_target;
$$;

create or replace function reactions_json(p_type text, p_target uuid, p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(emoji, jsonb_build_object('count', cnt, 'mine', mine)), '{}'::jsonb)
  from (
    select r.emoji, count(*)::int as cnt, bool_or(m.user_token = p_token) as mine
    from reactions r join members m on m.id = r.member_id
    where r.target_type = p_type and r.target_id = p_target
    group by r.emoji
  ) g;
$$;

-- The single source of truth for the client view. Same JSON shape the React
-- components already consume → the UI doesn't have to change.
create or replace function session_json(p_session_id uuid, p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'meId', (select id from members where session_id = p_session_id and user_token = p_token),
    'session', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'code', s.code,
      'status', s.status,
      'startingBalance', s.starting_balance,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'name', m.name, 'balance', m.balance, 'is_host', m.is_host
               ) order by m.balance desc, m.name)
        from members m where m.session_id = s.id), '[]'::jsonb),
      'bets', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', b.id,
                 'question', b.question,
                 'status', b.status,
                 'createdAt', (extract(epoch from b.created_at) * 1000)::bigint,
                 'creatorId', b.creator_member_id,
                 'creatorName', (select name from members where id = b.creator_member_id),
                 'winningOutcomeId', b.winning_outcome_id,
                 'totalPool', (select coalesce(sum(amount), 0)::int from wagers where bet_id = b.id),
                 'bettorCount', (select count(distinct member_id)::int from wagers where bet_id = b.id),
                 'outcomes', (
                   select jsonb_agg(jsonb_build_object(
                            'id', o.id,
                            'label', o.label,
                            'pool', (select coalesce(sum(amount), 0)::int from wagers where outcome_id = o.id),
                            'share', case
                              when (select coalesce(sum(amount), 0) from wagers where bet_id = b.id) = 0 then 0
                              else round((select coalesce(sum(amount), 0) from wagers where outcome_id = o.id)::numeric
                                         / (select sum(amount) from wagers where bet_id = b.id), 4)
                            end,
                            'isWinner', (b.winning_outcome_id = o.id)
                          ) order by o.position, o.label)
                   from outcomes o where o.bet_id = b.id),
                 'myWager', (
                   select jsonb_build_object('outcomeId', w.outcome_id, 'amount', w.amount)
                   from wagers w join members me on me.id = w.member_id
                   where w.bet_id = b.id and me.user_token = p_token limit 1),
                 'comments', comments_json('bet', b.id),
                 'reactions', reactions_json('bet', b.id, p_token)
               ) order by b.created_at desc)
        from bets b where b.session_id = s.id), '[]'::jsonb),
      'challenges', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', c.id,
                 'title', c.title,
                 'reward', c.reward,
                 'status', c.status,
                 'creatorId', c.creator_member_id,
                 'creatorName', (select name from members where id = c.creator_member_id),
                 'completedById', c.completed_by_member_id,
                 'completedByName', (select name from members where id = c.completed_by_member_id),
                 'createdAt', (extract(epoch from c.created_at) * 1000)::bigint,
                 'comments', comments_json('challenge', c.id),
                 'reactions', reactions_json('challenge', c.id, p_token)
               ) order by c.created_at desc)
        from challenges c where c.session_id = s.id), '[]'::jsonb),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'type', e.type, 'text', e.text,
                 'createdAt', (extract(epoch from e.created_at) * 1000)::bigint
               ) order by e.created_at desc)
        from events e where e.session_id = s.id), '[]'::jsonb)
    )
  )
  from sessions s where s.id = p_session_id;
$$;

-- ============================================================================
-- RPC: read
-- ============================================================================
create or replace function get_session(p_code text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from sessions where code = upper(p_code);
  if v_id is null then raise exception 'No session with that code.'; end if;
  return session_json(v_id, p_token);
end $$;

-- ============================================================================
-- RPC: sessions
-- ============================================================================
create or replace function create_session(p_name text, p_host_name text, p_starting_balance int, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_sid uuid; v_bal int; i int;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_host_name), '') = '' then
    raise exception 'Session name and your name are required.';
  end if;
  v_bal := coalesce(p_starting_balance, 1000);
  if v_bal < 1 then v_bal := 1000; end if;

  for i in 1..10 loop
    v_code := gg_make_code();
    exit when not exists (select 1 from sessions where code = v_code);
  end loop;

  v_sid := gen_random_uuid();
  insert into sessions (id, name, code, starting_balance, status)
    values (v_sid, trim(p_name), v_code, v_bal, 'open');
  insert into members (session_id, user_token, name, balance, is_host)
    values (v_sid, p_token, trim(p_host_name), v_bal, true);
  insert into events (session_id, type, text)
    values (v_sid, 'session', trim(p_host_name) || ' started "' || trim(p_name) || '" 🎉');

  return session_json(v_sid, p_token);
end $$;

create or replace function join_session(p_code text, p_name text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s sessions;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Your name is required.'; end if;
  select * into v_s from sessions where code = upper(p_code);
  if not found then raise exception 'No session with that code.'; end if;
  if v_s.status = 'settled' then raise exception 'This session has ended.'; end if;

  if not exists (select 1 from members where session_id = v_s.id and user_token = p_token) then
    insert into members (session_id, user_token, name, balance, is_host)
      values (v_s.id, p_token, trim(p_name), v_s.starting_balance, false);
    insert into events (session_id, type, text)
      values (v_s.id, 'join', trim(p_name) || ' joined 👋');
  end if;

  return session_json(v_s.id, p_token);
end $$;

create or replace function lock_session(p_session_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me members;
begin
  select * into v_me from members where session_id = p_session_id and user_token = p_token;
  if not found then raise exception 'Not a member of this session.'; end if;
  if not v_me.is_host then raise exception 'Only the host can lock the session.'; end if;
  update sessions set status = 'locked' where id = p_session_id;
  insert into events (session_id, type, text)
    values (p_session_id, 'session', v_me.name || ' locked the session — no new bets.');
  return session_json(p_session_id, p_token);
end $$;

-- ============================================================================
-- RPC: bets
-- ============================================================================
create or replace function create_bet(p_session_id uuid, p_question text, p_outcomes text[], p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me members; v_s sessions; v_bid uuid; v_count int;
begin
  select * into v_s from sessions where id = p_session_id;
  if not found then raise exception 'Session not found.'; end if;
  select * into v_me from members where session_id = p_session_id and user_token = p_token;
  if not found then raise exception 'Not a member of this session.'; end if;
  if v_s.status <> 'open' then raise exception 'This session is locked.'; end if;
  if coalesce(trim(p_question), '') = '' then raise exception 'A question is required.'; end if;

  select count(*) into v_count from unnest(p_outcomes) x where trim(x) <> '';
  if v_count < 2 then raise exception 'Add at least two outcomes.'; end if;

  v_bid := gen_random_uuid();
  insert into bets (id, session_id, question, status, creator_member_id)
    values (v_bid, p_session_id, trim(p_question), 'open', v_me.id);
  insert into outcomes (bet_id, label, position)
    select v_bid, trim(o.val), o.ord
    from unnest(p_outcomes) with ordinality as o(val, ord)
    where trim(o.val) <> '';
  insert into events (session_id, type, text)
    values (p_session_id, 'bet', v_me.name || ' opened a bet: "' || trim(p_question) || '"');

  return session_json(p_session_id, p_token);
end $$;

create or replace function place_wager(p_bet_id uuid, p_outcome_id uuid, p_amount int, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bet bets; v_me members; v_outcome outcomes; v_existing wagers;
  v_refund int := 0; v_available int;
begin
  select * into v_bet from bets where id = p_bet_id;
  if not found then raise exception 'Bet not found.'; end if;
  select * into v_me from members where session_id = v_bet.session_id and user_token = p_token;
  if not found then raise exception 'Not a member of this session.'; end if;
  if v_bet.status <> 'open' then raise exception 'Betting is closed on this one.'; end if;
  select * into v_outcome from outcomes where id = p_outcome_id and bet_id = p_bet_id;
  if not found then raise exception 'Unknown outcome.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a positive amount.'; end if;

  select * into v_existing from wagers where bet_id = p_bet_id and member_id = v_me.id;
  if found then v_refund := v_existing.amount; end if;
  v_available := v_me.balance + v_refund;
  if p_amount > v_available then
    raise exception 'Not enough coins (you have %).', v_available;
  end if;

  delete from wagers where bet_id = p_bet_id and member_id = v_me.id;
  insert into wagers (bet_id, outcome_id, member_id, amount)
    values (p_bet_id, p_outcome_id, v_me.id, p_amount);
  update members set balance = v_available - p_amount where id = v_me.id;
  insert into events (session_id, type, text)
    values (v_bet.session_id, 'wager',
            v_me.name || ' put ' || p_amount || ' on "' || v_outcome.label || '" — ' || v_bet.question);

  return session_json(v_bet.session_id, p_token);
end $$;

create or replace function lock_bet(p_bet_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_bet bets; v_me members;
begin
  select * into v_bet from bets where id = p_bet_id;
  if not found then raise exception 'Bet not found.'; end if;
  select * into v_me from members where session_id = v_bet.session_id and user_token = p_token;
  if not found then raise exception 'Not a member of this session.'; end if;
  if not (v_me.id = v_bet.creator_member_id or v_me.is_host) then
    raise exception 'Only the bet''s creator or the host can lock it.';
  end if;
  if v_bet.status = 'settled' then raise exception 'Already settled.'; end if;

  update bets set status = 'locked' where id = p_bet_id;
  insert into events (session_id, type, text)
    values (v_bet.session_id, 'lock', 'Betting closed on "' || v_bet.question || '"');
  return session_json(v_bet.session_id, p_token);
end $$;

create or replace function resolve_bet(p_bet_id uuid, p_winning_outcome_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bet bets; v_me members; v_win outcomes;
  v_total int; v_winpool int; v_names text;
begin
  select * into v_bet from bets where id = p_bet_id;
  if not found then raise exception 'Bet not found.'; end if;
  select * into v_me from members where session_id = v_bet.session_id and user_token = p_token;
  if not found then raise exception 'Not a member of this session.'; end if;
  if not (v_me.id = v_bet.creator_member_id or v_me.is_host) then
    raise exception 'Only the bet''s creator or the host can resolve it.';
  end if;
  if v_bet.status = 'settled' then raise exception 'Already settled.'; end if;
  select * into v_win from outcomes where id = p_winning_outcome_id and bet_id = p_bet_id;
  if not found then raise exception 'Pick a valid winning outcome.'; end if;

  select coalesce(sum(amount), 0) into v_total   from wagers where bet_id = p_bet_id;
  select coalesce(sum(amount), 0) into v_winpool from wagers where bet_id = p_bet_id and outcome_id = p_winning_outcome_id;

  if v_winpool = 0 then
    -- Nobody backed the winner → refund every stake.
    update members m set balance = m.balance + agg.amt
    from (select member_id, sum(amount) as amt from wagers where bet_id = p_bet_id group by member_id) agg
    where m.id = agg.member_id;
    insert into events (session_id, type, text)
      values (v_bet.session_id, 'settle',
              '"' || v_bet.question || '" → ' || v_win.label || '. Nobody called it; stakes refunded.');
  else
    -- Winners split the whole pool proportional to their stake.
    update members m set balance = m.balance + round(agg.amt::numeric / v_winpool * v_total)
    from (select member_id, sum(amount) as amt from wagers
          where bet_id = p_bet_id and outcome_id = p_winning_outcome_id group by member_id) agg
    where m.id = agg.member_id;
    select string_agg(m.name, ', ') into v_names
    from (select distinct member_id from wagers where bet_id = p_bet_id and outcome_id = p_winning_outcome_id) w
    join members m on m.id = w.member_id;
    insert into events (session_id, type, text)
      values (v_bet.session_id, 'settle',
              '"' || v_bet.question || '" → ' || v_win.label || '. Pool of ' || v_total
              || ' paid to ' || coalesce(v_names, 'nobody') || ' 💰');
  end if;

  update bets set status = 'settled', winning_outcome_id = p_winning_outcome_id where id = p_bet_id;
  return session_json(v_bet.session_id, p_token);
end $$;

-- ============================================================================
-- RPC: challenges
-- ============================================================================
create or replace function create_challenge(p_session_id uuid, p_title text, p_reward int, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me members; v_s sessions; v_bounty int;
begin
  select * into v_s from sessions where id = p_session_id;
  if not found then raise exception 'Session not found.'; end if;
  select * into v_me from members where session_id = p_session_id and user_token = p_token;
  if not found then raise exception 'Not a member of this session.'; end if;
  if v_s.status <> 'open' then raise exception 'This session is locked.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'A challenge needs a title.'; end if;
  v_bounty := greatest(0, coalesce(p_reward, 0));

  insert into challenges (session_id, title, reward, status, creator_member_id)
    values (p_session_id, trim(p_title), v_bounty, 'open', v_me.id);
  insert into events (session_id, type, text)
    values (p_session_id, 'challenge',
            v_me.name || ' added a challenge: "' || trim(p_title) || '"'
            || case when v_bounty > 0 then ' (' || v_bounty || ' coins)' else '' end);

  return session_json(p_session_id, p_token);
end $$;

create or replace function complete_challenge(p_challenge_id uuid, p_member_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ch challenges; v_me members; v_winner members;
begin
  select * into v_ch from challenges where id = p_challenge_id;
  if not found then raise exception 'Challenge not found.'; end if;
  select * into v_me from members where session_id = v_ch.session_id and user_token = p_token;
  if not found then raise exception 'Not a member of this session.'; end if;
  if not (v_me.id = v_ch.creator_member_id or v_me.is_host) then
    raise exception 'Only the creator or host can mark it done.';
  end if;
  if v_ch.status <> 'open' then raise exception 'Challenge is already closed.'; end if;
  select * into v_winner from members where id = p_member_id and session_id = v_ch.session_id;
  if not found then raise exception 'Pick who completed it.'; end if;

  if v_ch.reward > 0 then
    update members set balance = balance + v_ch.reward where id = v_winner.id;
  end if;
  update challenges set status = 'done', completed_by_member_id = v_winner.id where id = v_ch.id;
  insert into events (session_id, type, text)
    values (v_ch.session_id, 'challenge',
            v_winner.name || ' completed "' || v_ch.title || '"'
            || case when v_ch.reward > 0 then ' and earned ' || v_ch.reward || ' coins 🏆' else ' 🏆' end);

  return session_json(v_ch.session_id, p_token);
end $$;

create or replace function cancel_challenge(p_challenge_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ch challenges; v_me members;
begin
  select * into v_ch from challenges where id = p_challenge_id;
  if not found then raise exception 'Challenge not found.'; end if;
  select * into v_me from members where session_id = v_ch.session_id and user_token = p_token;
  if not found then raise exception 'Not a member of this session.'; end if;
  if not (v_me.id = v_ch.creator_member_id or v_me.is_host) then
    raise exception 'Only the creator or host can cancel it.';
  end if;
  if v_ch.status <> 'open' then raise exception 'Challenge is already closed.'; end if;

  update challenges set status = 'canceled' where id = v_ch.id;
  insert into events (session_id, type, text)
    values (v_ch.session_id, 'challenge', '"' || v_ch.title || '" was called off.');
  return session_json(v_ch.session_id, p_token);
end $$;

-- ============================================================================
-- RPC: comments & reactions
-- ============================================================================
create or replace function add_comment(p_target_type text, p_target_id uuid, p_text text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_me members;
begin
  if coalesce(trim(p_text), '') = '' then raise exception 'Say something first.'; end if;
  if    p_target_type = 'bet'       then select session_id into v_session from bets       where id = p_target_id;
  elsif p_target_type = 'challenge' then select session_id into v_session from challenges where id = p_target_id;
  else raise exception 'Bad target.'; end if;
  if v_session is null then raise exception 'Target not found.'; end if;
  select * into v_me from members where session_id = v_session and user_token = p_token;
  if not found then raise exception 'Not a member of this session.'; end if;

  insert into comments (session_id, target_type, target_id, member_id, text)
    values (v_session, p_target_type, p_target_id, v_me.id, left(trim(p_text), 280));
  return session_json(v_session, p_token);
end $$;

create or replace function toggle_reaction(p_target_type text, p_target_id uuid, p_emoji text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_me members; v_existing uuid;
begin
  if coalesce(p_emoji, '') = '' then raise exception 'Bad reaction.'; end if;
  if    p_target_type = 'bet'       then select session_id into v_session from bets       where id = p_target_id;
  elsif p_target_type = 'challenge' then select session_id into v_session from challenges where id = p_target_id;
  else raise exception 'Bad target.'; end if;
  if v_session is null then raise exception 'Target not found.'; end if;
  select * into v_me from members where session_id = v_session and user_token = p_token;
  if not found then raise exception 'Not a member of this session.'; end if;

  select id into v_existing from reactions
   where target_type = p_target_type and target_id = p_target_id and member_id = v_me.id and emoji = p_emoji;
  if v_existing is not null then
    delete from reactions where id = v_existing;
  else
    insert into reactions (session_id, target_type, target_id, member_id, emoji)
      values (v_session, p_target_type, p_target_id, v_me.id, p_emoji);
  end if;

  return session_json(v_session, p_token);
end $$;

-- ============================================================================
-- grants — clients may only EXECUTE the functions above
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
