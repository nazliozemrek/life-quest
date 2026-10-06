-- Around You and Respect (design: "Life Quest: Around You and Respect, design spec").
-- Opt-in public profiles, a feed of other players' milestones, and one-tap Respect worth +5 rested XP.
-- Privacy rules this file enforces:
--   * The public username is separate from players.handle (the character name, often a real first name).
--   * Location is an H3 resolution-5 cell (~250 km²) and nothing finer; "nearby" needs 20+ public players in it.
--   * No free text: feed events are fixed shapes rendered on the phone, Respect carries no message.
--   * Players never read each other's rows. Cross-player reads go through the definer functions below, which
--     return public fields only; the tables keep own-rows-only RLS like every other table.

-- ---------- Public profiles ----------

create table public_profiles (
  player_id   uuid primary key default auth.uid() references players (id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  avatar      jsonb not null check (jsonb_typeof(avatar->'seed') = 'number' and jsonb_typeof(avatar->'palette') = 'number'
                                    and pg_column_size(avatar) < 256),
  title_id    text check (title_id ~ '^(vitality|craft|wealth|charisma|mindset)\.[a-z0-9_]{1,40}$'),
  show_mode   boolean not null default false,
  region      text check (region ~ '^85[0-9a-f]{13}$'),          -- H3 res 5 only
  region_at   timestamptz,
  visible     boolean not null default true,                     -- false = went private: hides every past item too
  created_at  timestamptz not null default now()
);
create index on public_profiles (region) where visible;

-- ---------- Feed ----------

create table activity_feed (
  id             bigserial primary key,
  player_id      uuid not null references players (id) on delete cascade,
  kind           text not null check (kind in ('level_up','skill_node','district','main_quest','streak')),
  event          jsonb not null check (pg_column_size(event) < 256),
  dedupe         text not null,                                  -- one card per milestone, ever; never returned
  region         text,                                           -- the author's region when it happened
  mode           difficulty_mode not null,                       -- for peer matching; shown only with show_mode
  respect_count  int not null default 0,
  created_at     timestamptz not null default date_trunc('hour', now()),   -- hour only, never the minute
  unique (player_id, dedupe)
);
create index on activity_feed (region, id desc);
create index on activity_feed (mode, id desc);

-- Writes a card if the player is public. Called only from the triggers below.
create function feed_emit(p_player uuid, p_kind text, p_event jsonb, p_dedupe text) returns void
language sql security definer set search_path = public as $$
  insert into activity_feed (player_id, kind, event, dedupe, region, mode)
  select pp.player_id, p_kind, p_event, p_dedupe, pp.region, p.rules_mode
    from public_profiles pp join players p on p.id = pp.player_id
   where pp.player_id = p_player and pp.visible
  on conflict (player_id, dedupe) do nothing;
$$;
revoke all on function feed_emit(uuid, text, jsonb, text) from public, anon, authenticated;

-- Level ups, from the totals the ledger trigger keeps.
create function feed_on_level() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.level > old.level then
    perform feed_emit(new.id, 'level_up', jsonb_build_object('level', new.level), 'level:' || new.level);
  end if;
  return new;
end $$;
create trigger feed_level after update of level on players for each row execute function feed_on_level();

-- Big skill tree unlocks only: the three tier-3 nodes and the capstone of each tree. Small unlocks would flood the
-- feed. Mirrors app/src/game/skilltree.ts (tested in app/test/social.test.ts).
create function feed_on_node() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.node_id in (
    'vitality.unbreakable', 'vitality.marathoner', 'vitality.ironheart', 'vitality.titan',
    'craft.flow_state', 'craft.masterwork', 'craft.forgemaster', 'craft.grand_artisan',
    'wealth.golden_touch', 'wealth.treasurer', 'wealth.goldwarden', 'wealth.merchant_prince',
    'charisma.beloved', 'charisma.guildheart', 'charisma.voice_of_the_hall', 'charisma.legend_of_the_tavern',
    'mindset.inner_citadel', 'mindset.sage_s_path', 'mindset.keeper_of_lore', 'mindset.enlightened'
  ) then
    perform feed_emit(new.player_id, 'skill_node', jsonb_build_object('nodeId', new.node_id), 'node:' || new.node_id);
  end if;
  return new;
end $$;
create trigger feed_node after insert on player_skill_nodes for each row execute function feed_on_node();

-- District milestones at 50% and 75% (DISTRICT_MILESTONES; a district has 343 fog cells). The card never names
-- the district, and the dedupe key holds only its hash.
create function feed_on_cells() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record; n int;
begin
  for d in select distinct district from new_cells loop
    select count(*) into n from player_explored_cells
     where player_id = (select player_id from new_cells limit 1) and district = d.district;
    if n >= 258 then
      perform feed_emit((select player_id from new_cells limit 1), 'district', '{"pct": 75}', 'district:' || md5(d.district) || ':75');
    elsif n >= 172 then
      perform feed_emit((select player_id from new_cells limit 1), 'district', '{"pct": 50}', 'district:' || md5(d.district) || ':50');
    end if;
  end loop;
  return null;
end $$;
create trigger feed_cells after insert on player_explored_cells
  referencing new table as new_cells for each statement execute function feed_on_cells();

-- ---------- Respect ----------

create table respect_transactions (
  id            bigserial primary key,
  item_id       bigint not null references activity_feed (id) on delete cascade,
  sender_id     uuid not null default auth.uid() references players (id) on delete cascade,
  recipient_id  uuid not null references players (id) on delete cascade,
  rested_xp     smallint not null check (rested_xp between 0 and 5),   -- 0 once a limit below says so
  created_at    timestamptz not null default now(),
  check (sender_id <> recipient_id),
  unique (sender_id, item_id)
);
create index on respect_transactions (sender_id, created_at desc);
create index on respect_transactions (recipient_id, id);

-- ---------- Access ----------

alter table public_profiles      enable row level security;
alter table activity_feed        enable row level security;
alter table respect_transactions enable row level security;
create policy own on public_profiles for select to authenticated using (player_id = auth.uid());
create policy own on activity_feed   for select to authenticated using (player_id = auth.uid());
-- respect_transactions: no policy, so no direct access at all (rows name the sender).
revoke all on public_profiles, activity_feed, respect_transactions from anon, authenticated;
grant select on public_profiles, activity_feed to authenticated;
-- Every write goes through the functions below.

-- ---------- Functions ----------

-- Create or change my public profile. Titles must be ones I have unlocked. Returns {ok} or {ok:false, reason}.
create function set_public_profile(p_username text, p_avatar jsonb, p_title_id text, p_show_mode boolean, p_visible boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); name text := lower(trim(p_username));
begin
  if me is null or not exists (select 1 from players where id = me) then
    return jsonb_build_object('ok', false, 'reason', 'no_player');
  end if;
  if name !~ '^[a-z0-9_]{3,20}$' then return jsonb_build_object('ok', false, 'reason', 'username'); end if;
  if name ~ '(admin|support|moderator|official|lifequest|life_quest|anthropic|claude)' then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  if exists (select 1 from players where id = me and lower(handle) = name) then
    return jsonb_build_object('ok', false, 'reason', 'is_handle');   -- the character name stays private
  end if;
  if p_title_id is not null and not exists (select 1 from player_skill_nodes where player_id = me and node_id = p_title_id) then
    p_title_id := null;
  end if;
  insert into public_profiles (player_id, username, avatar, title_id, show_mode, visible)
  values (me, name, jsonb_build_object('style', 'pixel', 'seed', (p_avatar->>'seed')::bigint % 2147483648,
                                       'palette', (p_avatar->>'palette')::int % 12),
          p_title_id, coalesce(p_show_mode, false), coalesce(p_visible, true))
  on conflict (player_id) do update set username = excluded.username, avatar = excluded.avatar,
    title_id = excluded.title_id, show_mode = excluded.show_mode, visible = excluded.visible;
  return jsonb_build_object('ok', true);
exception
  when unique_violation then return jsonb_build_object('ok', false, 'reason', 'taken');
  when invalid_text_representation or numeric_value_out_of_range or check_violation or null_value_not_allowed then return jsonb_build_object('ok', false, 'reason', 'avatar');
end $$;

-- My region, from the phone. Only resolution 5 is accepted, so a buggy client can't leak a finer cell.
create function set_region(p_cell text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_cell !~ '^85[0-9a-f]{13}$' then raise exception 'region must be an H3 resolution 5 cell'; end if;
  update public_profiles set region = p_cell, region_at = now() where player_id = auth.uid();
end $$;

-- The feed: my region when 20+ public players share it, else players on my difficulty mode. My own cards are
-- included (marked mine). Public fields only; ids are feed ids, never player ids.
create function feed_around_me(p_before bigint default null, p_after bigint default null, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mine public_profiles;
  my_mode difficulty_mode;
  scope text := 'peers';
  items jsonb;
begin
  select * into mine from public_profiles where player_id = me and visible;
  if not found then return jsonb_build_object('scope', 'private', 'items', '[]'::jsonb); end if;
  select rules_mode into my_mode from players where id = me;
  if mine.region is not null
     and (select count(*) from public_profiles where region = mine.region and visible) >= 20 then
    scope := 'nearby';
  end if;
  select coalesce(jsonb_agg(row order by (row->>'id')::bigint desc), '[]'::jsonb) into items from (
    select jsonb_build_object(
      'id', f.id::text, 'kind', f.kind, 'event', f.event, 'respectCount', f.respect_count,
      'createdAt', f.created_at, 'mine', f.player_id = me,
      'respectedByMe', exists (select 1 from respect_transactions r where r.item_id = f.id and r.sender_id = me),
      'author', jsonb_build_object(
        'username', pp.username, 'avatar', pp.avatar, 'level', p.level, 'classCode', p.class,
        'titleId', pp.title_id, 'mode', case when pp.show_mode then p.rules_mode::text end)) as row
      from activity_feed f
      join public_profiles pp on pp.player_id = f.player_id and pp.visible
      join players p on p.id = f.player_id
     where (case when scope = 'nearby' then f.region = mine.region else f.mode = my_mode end)
       and f.created_at > now() - interval '14 days'
       and (p_before is null or f.id < p_before)
       and (p_after is null or f.id > p_after)
     order by f.id desc
     limit least(greatest(coalesce(p_limit, 30), 1), 50)
  ) q;
  return jsonb_build_object('scope', scope, 'items', items);
end $$;

-- One Respect. Every limit lives here, in one transaction, so it holds even when the API is called directly.
create function give_respect(p_item bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  it activity_feed;
  sent_today int; sent_minute int; to_same int; got_today int; mutual int;
  trusted boolean;
  xp smallint := 5;
  today timestamptz := date_trunc('day', now());
begin
  if me is null or not exists (select 1 from public_profiles where player_id = me and visible) then
    return jsonb_build_object('ok', false, 'reason', 'private');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));   -- one sender's taps run one at a time

  select * into it from activity_feed where id = p_item;
  if not found or it.player_id = me
     or not exists (select 1 from public_profiles where player_id = it.player_id and visible) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if it.created_at < now() - interval '7 days' then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if exists (select 1 from respect_transactions where sender_id = me and item_id = p_item) then
    return jsonb_build_object('ok', true, 'reason', 'already', 'restedGranted', 0);
  end if;

  select count(*) filter (where created_at >= today),
         count(*) filter (where created_at >= now() - interval '60 seconds'),
         count(*) filter (where created_at >= today and recipient_id = it.player_id)
    into sent_today, sent_minute, to_same
    from respect_transactions where sender_id = me and created_at >= least(today, now() - interval '60 seconds');
  if sent_today >= 30 then return jsonb_build_object('ok', false, 'reason', 'daily_cap'); end if;
  if sent_minute >= 6 then return jsonb_build_object('ok', false, 'reason', 'slow_down'); end if;

  select coalesce(sum(rested_xp), 0) into got_today from respect_transactions
   where recipient_id = it.player_id and created_at >= today;
  select count(*) into mutual from respect_transactions
   where created_at >= now() - interval '7 days'
     and ((sender_id = me and recipient_id = it.player_id) or (sender_id = it.player_id and recipient_id = me));
  select p.created_at < now() - interval '3 days' and p.level >= 3 into trusted from players p where p.id = me;

  -- Throwaway accounts, the same pair over and over, or a recipient already at 25 today: the Respect still
  -- counts on the card, it just carries no XP.
  if not coalesce(trusted, false) or to_same >= 3 or mutual >= 10 then xp := 0; end if;
  xp := least(xp, greatest(0, 25 - got_today));

  insert into respect_transactions (item_id, sender_id, recipient_id, rested_xp) values (p_item, me, it.player_id, xp);
  update activity_feed set respect_count = respect_count + 1 where id = p_item;
  return jsonb_build_object('ok', true, 'restedGranted', xp);
end $$;

-- Respect I received after a given id: how many, and the rested XP they carry. Never says who sent them.
create function respect_inbox(p_after bigint default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('lastId', coalesce(max(id), p_after), 'count', count(*), 'restedXp', coalesce(sum(rested_xp), 0))
    from respect_transactions where recipient_id = auth.uid() and id > coalesce(p_after, 0);
$$;

revoke all on function set_public_profile(text, jsonb, text, boolean, boolean), set_region(text),
  feed_around_me(bigint, bigint, int), give_respect(bigint), respect_inbox(bigint) from public, anon;
grant execute on function set_public_profile(text, jsonb, text, boolean, boolean), set_region(text),
  feed_around_me(bigint, bigint, int), give_respect(bigint), respect_inbox(bigint) to authenticated;
-- Trigger functions run only as triggers.
revoke all on function feed_on_level(), feed_on_node(), feed_on_cells() from public, anon, authenticated;
