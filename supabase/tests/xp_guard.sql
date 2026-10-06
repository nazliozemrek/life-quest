-- The server's check on XP (20261006110000_xp_guard.sql): forged rows are refused or trimmed, honest ones pass.
--   npm run supabase:test
\set ON_ERROR_STOP 1
begin;
insert into auth.users values ('00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
insert into players (handle, class, difficulty, rules_mode) values ('Guard', 'warrior', 'normal', 'normal');

-- Honest rows go through untouched.
insert into xp_ledger (idempotency_key, source, title, final_xp, skill_split, curve_version) values
  ('creation', 'creation', 'Complete character creation', 100, '{}', 1),
  ('backstory', 'backstory', 'Backstory', 900, '{"vitality": 500, "mindset": 400}', 1);
insert into xp_ledger (idempotency_key, source, title, final_xp, skill_split, rested_consumed, curve_version)
values ('quest:' || current_date || ':q1', 'quest', 'Walk', 84, '{"vitality": 42}', 42, 1);
do $$ begin
  assert (select total_xp from players) = 1084, 'honest rows: ' || (select total_xp from players);
  assert (select count(*) from xp_ledger where multipliers ? 'server_trimmed') = 0, 'honest rows were trimmed';
end $$;

-- Rows the app never sends are refused.
do $$ begin
  begin
    insert into xp_ledger (idempotency_key, source, final_xp, curve_version) values ('free-xp', 'quest', 10, 1);
    raise exception 'unknown key accepted';
  exception when check_violation then null; end;
  begin
    insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version)
    values ('quest:' || current_date || ':x', 'quest', 10, '{"luck": 10}', 1);
    raise exception 'unknown skill accepted';
  exception when check_violation then null; end;
  begin
    insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version)
    values ('quest:' || current_date || ':y', 'quest', 10, '{"craft": -10}', 1);
    raise exception 'negative skill accepted';
  exception when check_violation then null; end;
end $$;

-- A forged quest: total above its skills, skills above the day's room, rested above the row.
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, rested_consumed, curve_version)
values ('quest:' || current_date || ':q2', 'quest', 5000, '{"craft": 4000}', 3000, 1);
do $$ declare r xp_ledger; begin
  select * into r from xp_ledger where idempotency_key like 'quest:%:q2';
  -- craft level 1: room is 2 * 275 + 800 = 1350
  assert (r.skill_split ->> 'craft')::int = 1350, 'craft trimmed to the daily room: ' || r.skill_split;
  assert r.rested_consumed = 1350 and r.final_xp = 2700, 'rested at most doubles: ' || r.final_xp;
  assert r.multipliers ? 'server_trimmed', 'trimmed row is marked';
end $$;
-- A second forged row only gets what's left of the day's craft room (the room grows with the level just reached).
create temp table room as select 2 * (250 + 25 * level) + 800 as v from player_skills where skill = 'craft';
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version)
values ('quest:' || current_date || ':q3', 'quest', 4030, '{"craft": 4000, "vitality": 30}', 1);
do $$ begin
  assert (select sum((skill_split ->> 'craft')::int) from xp_ledger where idempotency_key like 'quest:' || current_date || ':%')
    = (select v from room), 'craft held to the daily room';
  assert (select skill_split ->> 'vitality' from xp_ledger where idempotency_key like 'quest:%:q3') = '30', 'vitality untouched';
end $$;

-- Future days and long-ago days pay nothing; the row still lands so the phone's outbox moves on.
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version) values
  ('quest:' || (current_date + 5) || ':q1', 'quest', 50, '{"wealth": 50}', 1),
  ('quest:' || (current_date - 60) || ':q1', 'quest', 50, '{"wealth": 50}', 1);
do $$ begin
  assert (select sum(final_xp) from xp_ledger where skill_split ? 'wealth') = 0, 'out-of-range days paid';
end $$;

-- At most 12 quests a day.
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version)
select 'quest:' || (current_date - 1) || ':n' || i, 'quest', 10, '{"charisma": 10}', 1 from generate_series(1, 15) i;
do $$ begin
  assert (select sum(final_xp) from xp_ledger where idempotency_key like 'quest:' || (current_date - 1) || ':%') = 120,
    'twelve quests a day';
end $$;

-- Creation and backstory have fixed ceilings (a second one is a no-op through the unique key).
-- Main quests: the horizon's XP, and at most three per horizon in a short window.
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version)
select 'goal:week:w' || i, 'quest', 5000, '{"mindset": 5000}', 1 from generate_series(1, 5) i;
do $$ begin
  assert (select array_agg(final_xp order by idempotency_key) from xp_ledger where idempotency_key like 'goal:week:%')
    = '{150,150,150,0,0}', 'week goals: ' || (select array_agg(final_xp order by idempotency_key)::text from xp_ledger where idempotency_key like 'goal:week:%');
end $$;
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version)
values ('goal:year:y1', 'quest', 1200, '{"vitality": 240, "craft": 240, "wealth": 240, "charisma": 240, "mindset": 240}', 1);
do $$ begin
  assert (select final_xp from xp_ledger where idempotency_key = 'goal:year:y1') = 1200, 'honest year goal';
end $$;

rollback;
\echo 'supabase xp guard tests passed'
