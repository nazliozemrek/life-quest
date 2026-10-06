-- Around You and Respect: what other players can see, and the Respect limits. Runs after rls.sql:
--   npm run supabase:test
\set ON_ERROR_STOP 1
begin;
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c1');

-- A: public, hard mode. Character name "Ayse Yilmaz" must never show anywhere.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
insert into players (handle, class, difficulty, rules_mode) values ('Ayse Yilmaz', 'warrior', 'hard', 'hard');
do $$ begin
  assert (select set_public_profile('ayse yilmaz', '{"seed": 7, "palette": 3}', null, true, true))->>'reason' = 'username', 'spaces refused';
  assert (select set_public_profile('Admin_1', '{"seed": 7, "palette": 3}', null, true, true))->>'reason' = 'reserved', 'reserved refused';
  assert (select set_public_profile('ironwolf', '{"seed": 7, "palette": 3}', 'vitality.titan', true, true))->>'ok' = 'true', 'profile set';
  assert (select title_id from public_profiles) is null, 'a title not unlocked is dropped';
  begin perform set_region('8a1ec902e117fff'); raise exception 'a fine cell was accepted as region';
  exception when raise_exception then null; end;
  begin insert into activity_feed (player_id, kind, event, dedupe, mode) values (auth.uid(), 'level_up', '{}', 'x', 'hard');
    raise exception 'feed was writable';
  exception when insufficient_privilege then null; end;
end $$;
select set_region('851ec903fffffff');

-- Milestones become cards: a level up, a capstone-tier node (not a small one), half a district.
insert into xp_ledger (idempotency_key, source, final_xp, skill_split, curve_version)
values ('backstory', 'backstory', 1760, '{"vitality": 1760}', 1);
insert into player_skill_nodes (node_id) values ('vitality.iron_lungs'), ('vitality.unbreakable');
insert into player_explored_cells (cell, district)
select '8a' || lpad(to_hex(i), 13, '0'), '871ec902effffff' from generate_series(1, 172) i;
insert into player_explored_cells (cell, district) values ('8a00000000000ff', '871ec902effffff');   -- 173: no second card
do $$ begin
  assert (select string_agg(kind, ',' order by id) from activity_feed) = 'level_up,skill_node,district',
    'cards: ' || (select string_agg(kind || event::text, ',' order by id) from activity_feed);
  assert (select event->>'nodeId' from activity_feed where kind = 'skill_node') = 'vitality.unbreakable', 'only the tier-3 node';
  assert (select event->>'pct' from activity_feed where kind = 'district') = '50', 'district card at 50%';
  assert (select region from activity_feed limit 1) = '851ec903fffffff', 'card carries the res-5 region';
end $$;

-- B: public on the same mode, sees A's cards with public fields only.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
insert into players (handle, class, difficulty, rules_mode) values ('Bora', 'sage', 'hard', 'hard');
do $$
declare f jsonb;
begin
  assert (select feed_around_me())->>'scope' = 'private', 'a private player gets no feed';
  assert (select give_respect(1))->>'reason' = 'private', 'a private player cannot give Respect';
  assert (select set_public_profile('ironwolf', '{"seed": 1, "palette": 1}', null, false, true))->>'reason' = 'taken', 'username taken';
  assert (select set_public_profile('bora', '{"seed": 1, "palette": 1}', null, false, true))->>'reason' = 'is_handle', 'character name refused';
  assert (select set_public_profile('quietfox', '{"seed": 1, "palette": 1}', null, false, true))->>'ok' = 'true', 'B public';
  f := feed_around_me();
  assert f->>'scope' = 'peers', 'peers: the region has under 20 players';
  assert jsonb_array_length(f->'items') = 3, 'B sees A''s three cards';
  assert f->'items'->0->'author'->>'username' = 'ironwolf', 'username shown';
  assert f->'items'->0->'author'->>'mode' = 'hard', 'A chose to show the mode';
  assert f::text not like '%Ayse%' and f::text not like '%Yilmaz%', 'character name leaked';
  assert f::text not like '%00000000-0000%', 'a player id leaked';
  assert f::text not like '%851ec903%' and f::text not like '%871ec902%', 'a location leaked';
  assert (select count(*) from activity_feed) = 0, 'B reads A''s feed rows directly';
  assert (select count(*) from public_profiles) = 1, 'B reads A''s profile row directly';
  begin perform count(*) from respect_transactions; raise exception 'respect rows readable';
  exception when insufficient_privilege then null; end;
end $$;

-- Respect: B is a new account, so it counts on the card but carries no XP.
do $$
declare item bigint := ((feed_around_me())->'items'->0->>'id')::bigint;
begin
  assert (select give_respect(item))->>'restedGranted' = '0', 'new account: no XP';
  assert (select give_respect(item))->>'reason' = 'already', 'once per item';
  assert ((feed_around_me())->'items'->0->>'respectCount')::int = 1, 'count shown';
  assert ((feed_around_me())->'items'->0->>'respectedByMe')::boolean, 'marked as mine';
end $$;

-- Age B's account: now Respect carries 5 rested XP (the first one, sent while new, stays at 0).
reset role;
update players set created_at = now() - interval '10 days', level = 8 where handle = 'Bora';
delete from activity_feed where player_id = '00000000-0000-0000-0000-0000000000b1';   -- B's own level-up card
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$
declare f jsonb := feed_around_me();
begin
  assert (select give_respect((f->'items'->1->>'id')::bigint))->>'restedGranted' = '5', 'trusted: 5 XP';
  assert (select give_respect((f->'items'->2->>'id')::bigint))->>'restedGranted' = '5', 'third to the same player today: still 5';
end $$;

-- A can't respect its own card, and sees what it received.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$
declare f jsonb := feed_around_me();
begin
  assert (f->'items'->0->>'mine')::boolean, 'A sees own card as mine';
  assert (select give_respect((f->'items'->0->>'id')::bigint))->>'reason' = 'not_found', 'own card refused';
  assert (select respect_inbox(0))->>'count' = '3', 'A received three';
  assert (select respect_inbox(0))->>'restedXp' = '10', 'worth 10 rested XP';
  assert (select respect_inbox(((select respect_inbox(0))->>'lastId')::bigint))->>'count' = '0', 'nothing after the last id';
  -- Going private hides A's cards from everyone.
  perform set_public_profile('ironwolf', '{"seed": 7, "palette": 3}', null, true, false);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  assert jsonb_array_length((feed_around_me())->'items') = 0, 'a private player''s cards still show';
end $$;

-- Burst: six Respects a minute. Make seven cards from C and tap them all.
reset role;
insert into players (id, handle, class, difficulty, rules_mode) values ('00000000-0000-0000-0000-0000000000c1', 'Cem', 'bard', 'hard', 'hard');
insert into public_profiles (player_id, username, avatar) values ('00000000-0000-0000-0000-0000000000c1', 'nightowl', '{"seed": 2, "palette": 2}');
select feed_emit('00000000-0000-0000-0000-0000000000c1', 'level_up', jsonb_build_object('level', i), 'level:' || i) from generate_series(2, 9) i;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$
declare f jsonb := feed_around_me(); r jsonb; refused int := 0;
begin
  for i in 0..7 loop
    r := give_respect((f->'items'->i->>'id')::bigint);
    if r->>'reason' = 'slow_down' then refused := refused + 1; end if;
  end loop;
  -- B already sent 3 in the last minute above, so 3 more go through and the other 5 are refused.
  assert refused = 5, 'burst limit: refused ' || refused;
end $$;

-- A finished main quest makes a card with its horizon and skill, never its title.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
insert into xp_ledger (idempotency_key, source, title, final_xp, skill_split, curve_version)
values ('goal:year:g1', 'quest', 'Pay off my debt', 1200, '{"wealth": 1200}', 1),
       ('goal:week:g2', 'quest', 'Call grandma', 150, '{"vitality": 30, "craft": 30, "wealth": 30, "charisma": 30, "mindset": 30}', 1),
       ('quest:' || current_date || ':q1', 'quest', 'Not a goal', 20, '{"craft": 20}', 1);
do $$ begin
  assert (select count(*) from activity_feed where kind = 'main_quest') = 2, 'two main quest cards';
  assert (select event from activity_feed where dedupe = 'goal:year:g1') = '{"horizon": "year", "skill": "wealth"}', 'year card';
  assert (select event->>'skill' from activity_feed where dedupe = 'goal:week:g2') is null, 'no single skill';
  assert (select count(*) from activity_feed where event::text like '%debt%' or event::text like '%grandma%') = 0, 'goal title leaked';
end $$;

-- Signed out: nothing.
reset role;
set local role anon;
do $$ begin
  begin perform feed_around_me(); raise exception 'anon read the feed';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
\echo 'supabase social tests passed'
