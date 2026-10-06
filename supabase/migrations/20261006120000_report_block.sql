-- Report and block for Around You. Usernames and avatars are things players make, so the App Store wants a way to
-- report them and to block whoever made them, and the owner has to be able to act on reports.
--
--   * block_author(item): hides everything from that card's author, both ways, from then on. The blocker never
--     learns who the author is beyond the username they already saw; the author is never told.
--   * report_item(item, reason): hides that one card for the reporter and files a report for the owner to read in
--     the Supabase table editor (content_reports, newest first). A report also blocks unless the reason is
--     'cheating', where the card is the problem, not the person.
--   * unblock_all(): the way back, from the Around You settings.
-- Reports and blocks are never readable through the API: they name the reporter.

create table player_blocks (
  blocker_id  uuid not null references players (id) on delete cascade,
  blocked_id  uuid not null references players (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index on player_blocks (blocked_id);

create table content_reports (
  id           bigserial primary key,
  reporter_id  uuid not null references players (id) on delete cascade,
  reported_id  uuid not null references players (id) on delete cascade,
  item_id      bigint references activity_feed (id) on delete set null,
  reason       text not null check (reason in ('name', 'avatar', 'cheating', 'other')),
  -- What the reporter saw, kept so the report still makes sense after a rename.
  username     text not null,
  created_at   timestamptz not null default now(),
  unique (reporter_id, item_id)
);
create index on content_reports (reported_id, created_at desc);

alter table player_blocks   enable row level security;
alter table content_reports enable row level security;
revoke all on player_blocks, content_reports from anon, authenticated;
-- No policies: only the functions below touch these tables.

create function block_author(p_item bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); author uuid;
begin
  select player_id into author from activity_feed where id = p_item;
  if me is null or author is null or author = me then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  insert into player_blocks (blocker_id, blocked_id) values (me, author) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

create function report_item(p_item bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); author uuid; name text;
begin
  if p_reason not in ('name', 'avatar', 'cheating', 'other') then return jsonb_build_object('ok', false, 'reason', 'reason'); end if;
  select f.player_id, pp.username into author, name
    from activity_feed f join public_profiles pp on pp.player_id = f.player_id where f.id = p_item;
  if me is null or author is null or author = me then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  -- Twenty a day is plenty for an honest player and keeps one account from flooding the table.
  if (select count(*) from content_reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap');
  end if;
  insert into content_reports (reporter_id, reported_id, item_id, reason, username)
  values (me, author, p_item, p_reason, name) on conflict do nothing;
  if p_reason <> 'cheating' then
    insert into player_blocks (blocker_id, blocked_id) values (me, author) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create function unblock_all() returns int
language sql security definer set search_path = public as $$
  with gone as (delete from player_blocks where blocker_id = auth.uid() returning 1) select count(*)::int from gone;
$$;

create function blocked_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from player_blocks where blocker_id = auth.uid();
$$;

-- Respect can't cross a block either way, even when the API is called directly.
create function respect_not_blocked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from player_blocks
              where (blocker_id = new.sender_id and blocked_id = new.recipient_id)
                 or (blocker_id = new.recipient_id and blocked_id = new.sender_id)) then
    raise exception 'blocked' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger respect_blocks before insert on respect_transactions for each row execute function respect_not_blocked();

-- The feed, as before, minus blocked players (either way) and cards I reported.
create or replace function feed_around_me(p_before bigint default null, p_after bigint default null, p_limit int default 30)
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
       and not exists (select 1 from player_blocks b
                        where (b.blocker_id = me and b.blocked_id = f.player_id) or (b.blocker_id = f.player_id and b.blocked_id = me))
       and not exists (select 1 from content_reports r where r.reporter_id = me and r.item_id = f.id)
     order by f.id desc
     limit least(greatest(coalesce(p_limit, 30), 1), 50)
  ) q;
  return jsonb_build_object('scope', scope, 'items', items);
end $$;

revoke all on function block_author(bigint), report_item(bigint, text), unblock_all(), blocked_count() from public, anon;
grant execute on function block_author(bigint), report_item(bigint, text), unblock_all(), blocked_count() to authenticated;
revoke all on function respect_not_blocked() from public, anon, authenticated;
