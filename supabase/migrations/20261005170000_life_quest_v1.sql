-- Life Quest backend v1 on Supabase.
-- The Supabase deployment of the pillar schemas in db/migrations (design: docs/pillar-1..4), cut to what the app
-- syncs today: player profile, XP ledger, today's quests, explored fog cells. Differences from db/migrations:
--   * players.id is the Supabase Auth user id (anonymous sign-in first, upgradeable to email/Apple later).
--   * Fog cells are stored as H3 strings, district computed by the client with h3-js (no h3-pg on the server yet).
--   * Row Level Security on every table: a player can only ever see and write their own rows.
--   * Totals (players.total_xp/level, player_skills) are derived from the append-only ledger by trigger;
--     the client cannot write them directly.

create type difficulty_mode as enum ('peaceful','normal','hard','hardcore');
create type skill_code      as enum ('vitality','craft','wealth','charisma','mindset');

-- ---------- Players ----------

create table players (
  id            uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  handle        text not null check (char_length(handle) between 1 and 24),
  class         text check (class in ('warrior','artisan','merchant','bard','sage')),
  difficulty    difficulty_mode not null default 'normal',   -- XP mode (pillar 4 xpMode)
  rules_mode    difficulty_mode not null default 'normal',
  total_xp      bigint not null default 0 check (total_xp >= 0),
  level         int    not null default 1,
  timezone      text   not null default 'UTC',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table player_skills (
  player_id  uuid references players (id) on delete cascade,
  skill      skill_code,
  xp         bigint not null default 0,
  level      int    not null default 1,
  primary key (player_id, skill)
);

-- Derived values only: raw health and money answers never leave the phone (pillar 4 §0.5).
create table calibrations (
  id               uuid primary key default gen_random_uuid(),
  player_id        uuid not null default auth.uid() references players (id) on delete cascade,
  version          smallint not null,
  trigger          text not null check (trigger in ('onboarding','scheduled','life_event','drift')),
  life_load        smallint not null check (life_load between 0 and 100),
  calibrated_mode  difficulty_mode not null,
  rules_mode       difficulty_mode not null,
  xp_mode          difficulty_mode not null,
  constraint_tags  text[] not null default '{}',
  target_effort    numeric(3,2) not null,
  created_at       timestamptz not null default now()
);
create index on calibrations (player_id, created_at desc);

-- ---------- XP ledger (pillar 1): append-only, idempotent ----------

create table xp_ledger (
  id               bigserial primary key,
  player_id        uuid not null default auth.uid() references players (id) on delete cascade,
  idempotency_key  text not null,                  -- 'quest:2026-10-05:q3' | 'backstory' | 'creation'
  source           text not null check (source in ('quest','backstory','creation','explore')),
  title            text,
  final_xp         int  not null check (final_xp between 0 and 5000),
  skill_split      jsonb not null default '{}',     -- {"vitality": 69, "mindset": 37}
  rested_consumed  int  not null default 0,
  multipliers      jsonb not null default '{}',
  curve_version    smallint not null,
  created_at       timestamptz not null default now(),
  unique (player_id, idempotency_key)
);
create index on xp_ledger (player_id, created_at desc);

-- Level for a total on the pillar 1 curve: XP_next(L) = round(base * L^1.1). Mirrors xp-engine.ts levelFor().
create function xp_level(total bigint, base numeric) returns int
language plpgsql immutable as $$
declare l int := 1; cum bigint := 0; step bigint;
begin
  loop
    step := round(base * power(l, 1.1));
    exit when cum + step > total;
    cum := cum + step; l := l + 1;
  end loop;
  return l;
end $$;

-- Every ledger row updates the totals. Runs as the table owner so players never need write access to totals.
create function apply_xp_ledger() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  update players set total_xp = total_xp + new.final_xp, level = xp_level(total_xp + new.final_xp, 100),
                     last_seen_at = now()
   where id = new.player_id;
  for k, v in select * from jsonb_each(new.skill_split) loop
    insert into player_skills (player_id, skill, xp, level)
    values (new.player_id, k::skill_code, (v #>> '{}')::bigint, xp_level((v #>> '{}')::bigint, 60))
    on conflict (player_id, skill) do update
      set xp = player_skills.xp + excluded.xp, level = xp_level(player_skills.xp + excluded.xp, 60);
  end loop;
  return new;
end $$;
create trigger xp_ledger_apply after insert on xp_ledger for each row execute function apply_xp_ledger();

-- ---------- Quests (pillar 3) ----------

create table quest_generations (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null default auth.uid() references players (id) on delete cascade,
  day             date not null,
  source          text not null check (source in ('ai','pool','mixed')),
  prompt_version  text not null,
  model           text,
  issues          jsonb not null default '[]',
  error           text,
  usage           jsonb,
  created_at      timestamptz not null default now()
);
create index on quest_generations (player_id, created_at desc);

-- One set per player per local day. The app shows it; completions are ledger rows keyed by its local_ids.
create table daily_quest_sets (
  player_id      uuid not null default auth.uid() references players (id) on delete cascade,
  day            date not null,
  quests         jsonb not null,                    -- validated Quest[] (quest-generator.ts contract)
  generation_id  uuid references quest_generations (id),
  created_at     timestamptz not null default now(),
  primary key (player_id, day)
);

-- ---------- Fog of war (pillar 2) ----------

create table player_explored_cells (
  player_id   uuid not null default auth.uid() references players (id) on delete cascade,
  cell        text not null check (cell ~ '^[0-9a-f]{15}$'),   -- H3 res 10
  district    text not null check (district ~ '^[0-9a-f]{15}$'),  -- H3 res 7 parent
  first_seen  timestamptz not null default now(),
  primary key (player_id, cell)
);
create index on player_explored_cells (player_id, district);

-- ---------- Access ----------

alter table players               enable row level security;
alter table player_skills         enable row level security;
alter table calibrations          enable row level security;
alter table xp_ledger             enable row level security;
alter table quest_generations     enable row level security;
alter table daily_quest_sets      enable row level security;
alter table player_explored_cells enable row level security;

create policy own on players               for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy own on player_skills         for select to authenticated using (player_id = auth.uid());
create policy own on calibrations          for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy own on xp_ledger             for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy own on quest_generations     for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy own on daily_quest_sets      for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy own on player_explored_cells for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());

-- Supabase grants every API role full table rights by default; narrow them. Signed-out (anon) gets nothing.
revoke all on players, player_skills, calibrations, xp_ledger, quest_generations, daily_quest_sets, player_explored_cells
  from anon, authenticated;

grant select on players, player_skills to authenticated;
grant insert (id, handle, class, difficulty, rules_mode, timezone) on players to authenticated;
grant update (handle, class, difficulty, rules_mode, timezone, last_seen_at) on players to authenticated;  -- never totals
grant select, insert on calibrations, xp_ledger, quest_generations to authenticated;                        -- ledger: append-only
grant usage on sequence xp_ledger_id_seq to authenticated;
grant select, insert, update on daily_quest_sets to authenticated;
grant select, insert on player_explored_cells to authenticated;
