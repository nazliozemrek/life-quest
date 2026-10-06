-- Skill tree nodes the player has bought (pillar 1 player_skill_nodes). The tree itself (costs, levels, effects)
-- lives in the app's code for now (app/src/game/skilltree.ts), so node_id is not a foreign key yet; the class root
-- node is implied by the calibration and never stored.

create table player_skill_nodes (
  player_id    uuid not null default auth.uid() references players (id) on delete cascade,
  node_id      text not null check (node_id ~ '^(vitality|craft|wealth|charisma|mindset)\.[a-z0-9_]{1,40}$'),
  unlocked_at  timestamptz not null default now(),
  primary key (player_id, node_id)
);

alter table player_skill_nodes enable row level security;
create policy own on player_skill_nodes for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
revoke all on player_skill_nodes from anon, authenticated;
grant select, insert on player_skill_nodes to authenticated;   -- unlocks are permanent: no update, no delete
