-- Smoke test for the migrations: exercises the hot paths described in docs/. Runs in a transaction and rolls back.
\set ON_ERROR_STOP 1
BEGIN;

INSERT INTO players (id, handle, difficulty) VALUES ('00000000-0000-0000-0000-000000000001', 'Kaan', 'hard');
INSERT INTO player_skills (player_id, skill)
SELECT '00000000-0000-0000-0000-000000000001', s FROM unnest(enum_range(NULL::skill_code)) s;

-- Ledger idempotency: the second insert with the same key is a no-op.
INSERT INTO xp_ledger (player_id, idempotency_key, base_xp, final_xp, skill_split, multipliers, curve_version)
VALUES ('00000000-0000-0000-0000-000000000001', 'quest:abc', 60, 106, '{"vitality":69,"mindset":37}', '{"difficulty":1.2}', 1);
INSERT INTO xp_ledger (player_id, idempotency_key, base_xp, final_xp, skill_split, multipliers, curve_version)
VALUES ('00000000-0000-0000-0000-000000000001', 'quest:abc', 60, 106, '{}', '{}', 1)
ON CONFLICT (player_id, idempotency_key) DO NOTHING;
DO $$ BEGIN ASSERT (SELECT count(*) FROM xp_ledger) = 1, 'ledger idempotency failed'; END $$;

-- Waypoint with a generated H3 column, then a containment lookup (Moda, Istanbul).
INSERT INTO waypoints (id, owner_id, kind, name, center, radius_m, dwell_seconds)
VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'gym', 'Gym',
        ST_MakePoint(29.0250, 40.9800)::geography, 80, 1800);
DO $$ BEGIN ASSERT (SELECT h3_res9 IS NOT NULL FROM waypoints LIMIT 1), 'h3_res9 not generated'; END $$;

DO $$ DECLARE hits int; BEGIN
  SELECT count(*) INTO hits FROM waypoints
  WHERE (owner_id = '00000000-0000-0000-0000-000000000001' OR NOT is_private)
    AND ST_DWithin(center, ST_MakePoint(29.0255, 40.9801)::geography, coalesce(radius_m, 2000))
    AND (area IS NULL OR ST_Covers(area, ST_MakePoint(29.0255, 40.9801)::geography));
  ASSERT hits = 1, 'point ~45 m from the gym should be inside its 80 m geofence';
END $$;

-- Explored cells upsert returns which cells are new.
CREATE TEMP TABLE r1 AS
WITH ins AS (
  INSERT INTO player_explored_cells (player_id, cell, sync_seq)
  SELECT '00000000-0000-0000-0000-000000000001', c::h3index, nextval('explore_seq')
  FROM unnest(ARRAY['8a1ec902e117fff','8a1ec902e107fff']) c
  ON CONFLICT (player_id, cell) DO UPDATE SET visits = player_explored_cells.visits + 1
  RETURNING cell, (xmax = 0) AS is_new)
SELECT * FROM ins;
CREATE TEMP TABLE r2 AS
WITH ins AS (
  INSERT INTO player_explored_cells (player_id, cell, sync_seq)
  SELECT '00000000-0000-0000-0000-000000000001', c::h3index, nextval('explore_seq')
  FROM unnest(ARRAY['8a1ec902e117fff','8a1ec902e10ffff']) c
  ON CONFLICT (player_id, cell) DO UPDATE SET visits = player_explored_cells.visits + 1
  RETURNING cell, (xmax = 0) AS is_new)
SELECT * FROM ins;
DO $$ BEGIN
  ASSERT (SELECT count(*) FILTER (WHERE is_new) FROM r1) = 2, 'first upsert: both new';
  ASSERT (SELECT count(*) FILTER (WHERE is_new) FROM r2) = 1, 'second upsert: one new, one revisit';
  ASSERT (SELECT district::text FROM player_explored_cells LIMIT 1) = '871ec902effffff', 'district parent wrong';
END $$;

-- Raw fixes land in the default partition.
INSERT INTO location_fixes (player_id, at, pos, accuracy_m, accepted)
VALUES ('00000000-0000-0000-0000-000000000001', now(), ST_MakePoint(29.025, 40.98)::geography, 8, true);

-- Onboarding + quest generation tables.
INSERT INTO calibrations (player_id, version, trigger, life_load, domains, calibrated_mode, rules_mode, xp_mode, constraint_tags)
VALUES ('00000000-0000-0000-0000-000000000001', 1, 'onboarding', 58, '{}', 'hardcore', 'hardcore', 'hardcore', ARRAY['short on sleep']);
INSERT INTO quest_generations (player_id, mode, prompt_version, model, context)
VALUES ('00000000-0000-0000-0000-000000000001', 'daily', 'qg-2026-10-05.1', 'claude-opus-5-5', '{}');

-- Account deletion cascades through every table.
DELETE FROM players;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM xp_ledger) + (SELECT count(*) FROM player_explored_cells)
       + (SELECT count(*) FROM waypoints) + (SELECT count(*) FROM calibrations)
       + (SELECT count(*) FROM quest_generations) + (SELECT count(*) FROM location_fixes) = 0, 'cascade delete left rows behind';
END $$;

ROLLBACK;
\echo 'smoke.sql: all assertions passed'
