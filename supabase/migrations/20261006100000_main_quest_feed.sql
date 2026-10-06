-- Finished main quests make a feed card. The app records them as ledger rows keyed 'goal:<horizon>:<goal id>'
-- (one per goal, ever). The card carries the horizon and the goal's skill, never the goal's title, which is
-- free text the player wrote ("Pay off my debt").

create function feed_on_goal() returns trigger
language plpgsql security definer set search_path = public as $$
declare horizon text; skills text[];
begin
  if new.idempotency_key !~ '^goal:(week|month|year):' then return new; end if;
  horizon := split_part(new.idempotency_key, ':', 2);
  select array_agg(k) into skills from jsonb_object_keys(new.skill_split) k;
  perform feed_emit(new.player_id, 'main_quest',
    jsonb_build_object('horizon', horizon, 'skill', case when cardinality(skills) = 1 then skills[1] end),
    new.idempotency_key);
  return new;
end $$;
create trigger feed_goal after insert on xp_ledger for each row execute function feed_on_goal();
revoke all on function feed_on_goal() from public, anon, authenticated;
