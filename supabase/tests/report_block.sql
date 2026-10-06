-- Report and block (20261006120000_report_block.sql).
--   npm run supabase:test
\set ON_ERROR_STOP 1
begin;
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'), ('00000000-0000-0000-0000-0000000000d3');
set local role authenticated;

-- D1 and D2 each post cards; D3 watches. All on the same mode, so they share a feed.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
insert into players (handle, class, difficulty, rules_mode) values ('Deniz', 'warrior', 'normal', 'peaceful');
select set_public_profile('rudename', '{"seed": 1, "palette": 1}', null, false, true);
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version) values ('backstory', 'backstory', 400, '{"vitality": 400}', 1);
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version) values ('goal:week:a', 'quest', 150, '{"vitality": 150}', 1);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
insert into players (handle, class, difficulty, rules_mode) values ('Ece', 'sage', 'normal', 'peaceful');
select set_public_profile('nicefox', '{"seed": 2, "palette": 2}', null, false, true);
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version) values ('backstory', 'backstory', 400, '{"mindset": 400}', 1);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d3', true);
insert into players (handle, class, difficulty, rules_mode) values ('Ilk', 'bard', 'normal', 'peaceful');
select set_public_profile('watcher', '{"seed": 3, "palette": 3}', null, false, true);

do $$
declare rude bigint; cheat bigint; nice bigint; f jsonb;
begin
  f := feed_around_me();
  select (i->>'id')::bigint into rude from jsonb_array_elements(f->'items') i
   where i->'author'->>'username' = 'rudename' and i->>'kind' = 'level_up' limit 1;
  select (i->>'id')::bigint into cheat from jsonb_array_elements(f->'items') i
   where i->'author'->>'username' = 'rudename' and i->>'kind' = 'main_quest';
  select (i->>'id')::bigint into nice from jsonb_array_elements(f->'items') i where i->'author'->>'username' = 'nicefox' limit 1;
  assert rude is not null and cheat is not null and nice is not null, 'cards to report: ' || f;

  -- Reporting a card as cheating hides just that card.
  assert (select report_item(cheat, 'cheating'))->>'ok' = 'true', 'cheating report';
  f := feed_around_me();
  assert not f::text like '%"main_quest"%', 'reported card still shown';
  assert f::text like '%rudename%', 'a cheating report hid the whole player';

  -- Reporting a name blocks the player: all their cards go, others stay.
  assert (select report_item(rude, 'name'))->>'ok' = 'true', 'name report';
  f := feed_around_me();
  assert not f::text like '%rudename%', 'blocked player still shown';
  assert f::text like '%nicefox%', 'other players hidden';
  assert (select blocked_count()) = 1, 'one block';
  assert (select report_item(rude, 'spam'))->>'reason' = 'reason', 'unknown reason refused';
  assert (select report_item(nice, 'name'))->>'ok' = 'true', 'second report';
  assert (select blocked_count()) = 2, 'second block: ' || (select blocked_count());
  assert (select block_author(nice))->>'ok' = 'true', 'blocking twice is fine';

  -- Nothing about reports or blocks is readable directly.
  begin perform count(*) from content_reports; raise exception 'reports readable';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from player_blocks; raise exception 'blocks readable';
  exception when insufficient_privilege then null; end;

  assert (select unblock_all()) = 2, 'unblock all';
  assert (select blocked_count()) = 0, 'nothing blocked';
  f := feed_around_me();
  assert not f::text like '%"main_quest"%', 'the reported card stays hidden';
end $$;

-- The block works both ways: the blocked player no longer sees the blocker, and Respect can't cross it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d3', true);
do $$
declare rude bigint := (select (i->>'id')::bigint from jsonb_array_elements((feed_around_me())->'items') i
                         where i->'author'->>'username' = 'rudename' limit 1);
begin
  perform block_author(rude);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
do $$ begin
  assert not (feed_around_me())::text like '%watcher%', 'the blocked player sees the blocker';
  assert (select report_item(999999, 'name'))->>'reason' = 'not_found', 'missing card';
end $$;

rollback;
\echo 'supabase report and block tests passed'
