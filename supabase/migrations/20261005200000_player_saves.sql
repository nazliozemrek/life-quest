-- Cloud copy of the game save, so a player who backed up with an email can restore on a new phone.
-- The app strips what must stay on the device before uploading: raw onboarding answers (health, money),
-- pinned places, the current position and the fog (fog cells sync separately to player_explored_cells).

create table player_saves (
  player_id   uuid primary key default auth.uid() references players (id) on delete cascade,
  save        jsonb not null check (pg_column_size(save) < 262144),
  updated_at  timestamptz not null default now()
);

alter table player_saves enable row level security;
create policy own on player_saves for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
revoke all on player_saves from anon, authenticated;
grant select, insert, update (save, updated_at) on player_saves to authenticated;
