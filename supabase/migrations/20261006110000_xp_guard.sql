-- The server's check on XP. The phone prices quests (xp-engine.ts) and sends ledger rows; until now the server
-- took any amount up to 5000 a row, which was fine for one player and isn't once levels show up in Around You.
--
-- Every row is checked before it lands. Rows an honest app never sends (unknown keys, skills, sources) are
-- refused. Amounts over what the game can pay are trimmed, not refused: a refused row would stall the phone's
-- outbox for good, while a trimmed one still syncs and only the excess is lost. Trimmed rows say so in
-- multipliers.server_trimmed, so a tuning change that starts trimming honest players shows up in a query.
--
-- Ceilings, from the engine (deliberately loose: they stop forged rows, not a lucky streak):
--   creation   100 XP, no skills (CREATION_QUEST)
--   backstory  3263 XP = xpToReach(8) (BACKSTORY_CAP)
--   goal       150 / 400 / 1200 by horizon (MAIN_QUEST_XP), at most 3 (MAX_GOALS) per horizon in any
--              2 / 9 / 44 days (MIN_DAYS - 1)
--   quest      12 a day; per skill per day 2 x dailySkillCap(level) + 800, which is above what eight maxed
--              quests pay after the soft cap; the day in the key can't be in the future or more than 30 days
--              before the account was created
-- Rested XP doubles a row at most (restedConsumed <= the row's skill XP), as in computeAward.

create function guard_xp_ledger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kind text;
  horizon text;
  qday date;
  k text;
  v jsonb;
  amount int;
  room int;
  lvl int;
  skills_sum int := 0;
  split jsonb := '{}';
  trimmed boolean := false;
  cap int;
begin
  -- One player's rows are checked one at a time, so two at once can't both fit under the same daily room.
  perform pg_advisory_xact_lock(hashtext('xp_ledger:' || new.player_id::text));

  kind := case
    when new.idempotency_key = 'creation' and new.source = 'creation' then 'creation'
    when new.idempotency_key = 'backstory' and new.source = 'backstory' then 'backstory'
    when new.idempotency_key ~ '^goal:(week|month|year):.{1,80}$' and new.source = 'quest' then 'goal'
    when new.idempotency_key ~ '^quest:\d{4}-\d{2}-\d{2}:.{1,80}$' and new.source = 'quest' then 'quest'
  end;
  if kind is null then
    raise exception 'xp_ledger: unknown key % for source %', new.idempotency_key, new.source using errcode = 'check_violation';
  end if;
  if jsonb_typeof(new.skill_split) <> 'object' then
    raise exception 'xp_ledger: skill_split must be an object' using errcode = 'check_violation';
  end if;

  -- Skills: known names, whole non-negative numbers.
  for k, v in select * from jsonb_each(new.skill_split) loop
    if k not in ('vitality','craft','wealth','charisma','mindset') or jsonb_typeof(v) <> 'number'
       or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then
      raise exception 'xp_ledger: bad skill_split entry %', k using errcode = 'check_violation';
    end if;
  end loop;

  if kind = 'creation' then
    if new.skill_split <> '{}' then trimmed := true; end if;
    new.skill_split := '{}';
    new.rested_consumed := 0;
    if new.final_xp > 100 then new.final_xp := 100; trimmed := true; end if;
  else
    if kind = 'quest' then
      qday := split_part(new.idempotency_key, ':', 2)::date;
      if qday > current_date + 1
         or qday < (select created_at::date from players where id = new.player_id) - 30
         or (select count(*) from xp_ledger
              where player_id = new.player_id and idempotency_key like 'quest:' || qday || ':%') >= 12 then
        cap := 0;                                            -- the whole row is trimmed
      end if;
    elsif kind = 'goal' then
      horizon := split_part(new.idempotency_key, ':', 2);
      if (select count(*) from xp_ledger
           where player_id = new.player_id and idempotency_key like 'goal:' || horizon || ':%'
             and created_at > now() - make_interval(days => case horizon when 'week' then 2 when 'month' then 9 else 44 end)) >= 3 then
        cap := 0;
      else
        cap := case horizon when 'week' then 150 when 'month' then 400 else 1200 end;
      end if;
    else
      cap := 3263;                                           -- backstory
    end if;

    -- Trim each skill to what's left: the row's ceiling for goals and backstory, the day's room for quests.
    for k, v in select * from jsonb_each(new.skill_split) order by 1 loop
      amount := (v #>> '{}')::int;
      if kind = 'quest' then
        if cap = 0 then
          room := 0;
        else
          select coalesce(max(level), 1) into lvl from player_skills where player_id = new.player_id and skill = k::skill_code;
          select 2 * (250 + 25 * lvl) + 800 - coalesce(sum((l.skill_split ->> k)::int), 0) into room
            from xp_ledger l
           where l.player_id = new.player_id and l.idempotency_key like 'quest:' || qday || ':%';
        end if;
      else
        room := cap - skills_sum;
      end if;
      if amount > greatest(room, 0) then amount := greatest(room, 0); trimmed := true; end if;
      split := split || jsonb_build_object(k, amount);
      skills_sum := skills_sum + amount;
    end loop;

    new.skill_split := split;
    new.rested_consumed := least(greatest(new.rested_consumed, 0), skills_sum);
    if kind <> 'quest' then new.rested_consumed := 0; end if;
    if new.final_xp > skills_sum + new.rested_consumed then
      new.final_xp := skills_sum + new.rested_consumed;
      trimmed := true;
    end if;
  end if;

  if trimmed then new.multipliers := coalesce(new.multipliers, '{}') || '{"server_trimmed": true}'; end if;
  return new;
end $$;

create trigger xp_ledger_guard before insert on xp_ledger for each row execute function guard_xp_ledger();
