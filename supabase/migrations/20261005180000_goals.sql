-- Player goals (pillar 4 flow E): up to three things the player is working toward. The client owns the list and
-- replaces it whole, so the ids are client-made. Places (flow F) are not here: their coordinates stay on the phone.

create table player_goals (
  player_id   uuid not null default auth.uid() references players (id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 40),
  title       text not null check (char_length(title) between 1 and 80),
  horizon     text not null check (horizon in ('week','month','year')),
  skill       skill_code,
  created_at  timestamptz not null default now(),
  primary key (player_id, id)
);

alter table player_goals enable row level security;
create policy own on player_goals for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
revoke all on player_goals from anon, authenticated;
grant select, insert, delete on player_goals to authenticated;
