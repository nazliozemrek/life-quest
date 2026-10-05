-- Access and ledger tests for the v1 migration. Run on a plain Postgres after supabase-stub.sql + the migration:
--   npm run supabase:test
\set ON_ERROR_STOP 1
begin;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');

-- Player A, signed in.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

insert into players (handle, class, difficulty, rules_mode) values ('Kaan', 'artisan', 'normal', 'normal');
insert into calibrations (version, trigger, life_load, calibrated_mode, rules_mode, xp_mode, constraint_tags, target_effort)
values (1, 'onboarding', 14, 'normal', 'normal', 'normal', '{long commute}', 1.0);

-- Backstory, then the same quest completion sent twice (a retry): the second is a no-op.
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version)
values ('backstory', 'backstory', 1760, '{"craft": 900, "wealth": 400, "charisma": 460}', 1);
insert into xp_ledger (idempotency_key, source, title, final_xp, skill_split, curve_version)
values ('quest:2026-10-05:q2', 'quest', 'Forge 25 Minutes of Deep Work', 70, '{"craft": 49, "mindset": 21}', 1)
on conflict (player_id, idempotency_key) do nothing;
insert into xp_ledger (idempotency_key, source, title, final_xp, skill_split, curve_version)
values ('quest:2026-10-05:q2', 'quest', 'Forge 25 Minutes of Deep Work', 70, '{"craft": 49, "mindset": 21}', 1)
on conflict (player_id, idempotency_key) do nothing;

do $$ begin
  assert (select total_xp from players) = 1830, 'total_xp should be backstory + one quest';
  assert (select level from players) = 6, 'level 6 at 1830 XP (xp-engine levelFor)';
  assert (select xp from player_skills where skill = 'craft') = 949, 'craft skill xp';
  assert (select level from player_skills where skill = 'craft') = 5, 'craft level 5 at 949 XP (skill curve)';
end $$;

insert into player_explored_cells (cell, district) values ('8a1ec902e117fff', '871ec902effffff')
on conflict do nothing;
insert into daily_quest_sets (day, quests) values ('2026-10-05', '[]');

-- Goals: the app replaces the whole list (delete, then insert).
insert into player_goals (id, title, horizon, skill) values ('g1', 'Run a 5K', 'month', 'vitality'), ('g2', 'Write a novel', 'year', null);
delete from player_goals where id like '%';
insert into player_goals (id, title, horizon, skill) values ('g3', 'Learn to code', 'week', 'craft');
do $$ begin
  assert (select string_agg(title, ',') from player_goals) = 'Learn to code', 'goals replaced';
end $$;

-- Skill nodes: insert once, a resend is a no-op, and they can't be taken back or forged.
insert into player_skill_nodes (node_id) values ('craft.steady_focus') on conflict do nothing;
insert into player_skill_nodes (node_id) values ('craft.steady_focus') on conflict do nothing;
do $$ begin
  assert (select count(*) from player_skill_nodes) = 1, 'node stored once';
  begin delete from player_skill_nodes; raise exception 'nodes were deletable';
  exception when insufficient_privilege then null; end;
  begin insert into player_skill_nodes (node_id) values ('gold.infinite'); raise exception 'bad node id accepted';
  exception when check_violation then null; end;
end $$;

-- The app re-sends its profile as an upsert (PostgREST on_conflict=id): updates the editable columns only.
insert into players (handle, class, difficulty, rules_mode, timezone) values ('Kaan E', 'artisan', 'normal', 'hard', 'Europe/Istanbul')
on conflict (id) do update set handle = excluded.handle, class = excluded.class, difficulty = excluded.difficulty,
  rules_mode = excluded.rules_mode, timezone = excluded.timezone;
do $$ begin
  assert (select handle || '/' || rules_mode || '/' || total_xp from players) = 'Kaan E/hard/1830', 'profile upsert';
end $$;

-- The client can't set its own totals or rewrite history.
do $$ begin
  begin update players set total_xp = 999999; raise exception 'total_xp was writable';
  exception when insufficient_privilege then null; end;
  begin update xp_ledger set final_xp = 5000; raise exception 'ledger was updatable';
  exception when insufficient_privilege then null; end;
  begin delete from xp_ledger; raise exception 'ledger was deletable';
  exception when insufficient_privilege then null; end;
  begin insert into player_skills (player_id, skill, xp) values (auth.uid(), 'vitality', 99999); raise exception 'skills were writable';
  exception when insufficient_privilege then null; end;
  begin insert into xp_ledger (idempotency_key, source, final_xp, curve_version) values ('x', 'quest', 99999, 1);
        raise exception 'oversized award accepted';
  exception when check_violation then null; end;
end $$;

-- Player B sees none of A's rows and can't write as A.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  assert (select count(*) from players) = 0, 'B sees A';
  assert (select count(*) from xp_ledger) = 0, 'B sees A''s ledger';
  assert (select count(*) from player_explored_cells) = 0, 'B sees A''s map';
  assert (select count(*) from player_goals) = 0, 'B sees A''s goals';
  assert (select count(*) from player_skill_nodes) = 0, 'B sees A''s nodes';
  delete from player_goals where id like '%';
  begin
    insert into xp_ledger (player_id, idempotency_key, source, final_xp, curve_version)
    values ('00000000-0000-0000-0000-00000000000a', 'evil', 'quest', 10, 1);
    raise exception 'B wrote into A''s ledger';
  exception when insufficient_privilege then null; end;
end $$;

-- Signed out: nothing at all.
reset role;
set local role anon;
do $$ begin
  begin perform count(*) from players; raise exception 'anon could read players';
  exception when insufficient_privilege then null; end;
end $$;

-- B's delete above touched nothing of A's.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
set local role authenticated;
do $$ begin assert (select count(*) from player_goals) = 1, 'B deleted A''s goals'; end $$;

rollback;
\echo 'supabase rls tests passed'
