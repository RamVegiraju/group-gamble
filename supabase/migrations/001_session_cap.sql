-- Migration: cap total sessions at 100 to stay under free-tier DB limits.
-- Non-destructive (CREATE OR REPLACE) — safe to run on a live database.
create or replace function create_session(p_name text, p_host_name text, p_starting_balance int, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_sid uuid; v_bal int; i int;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_host_name), '') = '' then
    raise exception 'Session name and your name are required.';
  end if;

  -- Cap total sessions to stay well under free-tier DB limits.
  if (select count(*) from sessions) >= 100 then
    raise exception 'GroupGamble is at capacity (100 sessions). Ask a host to wrap one up and try again.';
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
