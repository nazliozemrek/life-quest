-- Source of truth for this schema's design: docs/pillar-2-spatial.md

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS h3;            -- h3-pg
CREATE EXTENSION IF NOT EXISTS h3_postgis CASCADE;

CREATE TYPE waypoint_kind AS ENUM ('home','work','gym','third_place','quest','boss_arena','poi');

-- Player-defined and system waypoints. Geofence = polygon, or point + radius.
CREATE TABLE waypoints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid REFERENCES players(id) ON DELETE CASCADE,  -- null = public/system
  kind           waypoint_kind NOT NULL,
  name           text NOT NULL,
  center         geography(Point, 4326) NOT NULL,
  radius_m       int CHECK (radius_m BETWEEN 30 AND 2000),
  area           geography(Polygon, 4326),                       -- overrides radius when set
  dwell_seconds  int NOT NULL DEFAULT 0,                          -- e.g. gym: 1800
  is_private     boolean NOT NULL DEFAULT true,                   -- home/work forced true
  h3_res9        h3index GENERATED ALWAYS AS (h3_lat_lng_to_cell(center::geometry, 9)) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (radius_m IS NOT NULL OR area IS NOT NULL)
);
CREATE INDEX ON waypoints USING gist (center);
CREATE INDEX ON waypoints USING gist (area);
CREATE INDEX ON waypoints (owner_id, kind);

ALTER TABLE quest_templates
  ADD CONSTRAINT quest_templates_geofence_fk FOREIGN KEY (geofence_id) REFERENCES waypoints(id);

-- Geofence events. Source of truth for location-verified quest completion.
CREATE TABLE geofence_events (
  id            bigserial PRIMARY KEY,
  player_id     uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  waypoint_id   uuid NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('enter','exit','dwell')),
  at            timestamptz NOT NULL,
  source        text NOT NULL CHECK (source IN ('os_region','server_fix')),
  trust         real NOT NULL
);
CREATE INDEX ON geofence_events (player_id, waypoint_id, at DESC);

-- Raw fixes: short retention, monthly partitions dropped after 30 days.
CREATE TABLE location_fixes (
  player_id    uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  at           timestamptz NOT NULL,
  pos          geography(Point, 4326) NOT NULL,
  accuracy_m   real NOT NULL,
  speed_mps    real,
  accepted     boolean NOT NULL,
  flag         text
) PARTITION BY RANGE (at);
-- Monthly partitions are created and dropped by a scheduled job (30-day retention).
-- The default partition only catches rows that arrive before their month's partition exists.
CREATE TABLE location_fixes_default PARTITION OF location_fixes DEFAULT;

CREATE SEQUENCE explore_seq;  -- drives delta sync for player_explored_cells

-- Fog of war. One row per explored res-10 cell per player (~10–50k rows for a heavy user).
CREATE TABLE player_explored_cells (
  player_id    uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cell         h3index NOT NULL,
  district     h3index GENERATED ALWAYS AS (h3_cell_to_parent(cell, 7)) STORED,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  visits       int NOT NULL DEFAULT 1,
  sync_seq     bigint NOT NULL,              -- monotonic per player, drives delta sync
  PRIMARY KEY (player_id, cell)
);
CREATE INDEX ON player_explored_cells (player_id, sync_seq);
CREATE INDEX ON player_explored_cells (player_id, district);

CREATE TABLE player_trust (
  player_id    uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  trust        real NOT NULL DEFAULT 0.8,
  attest_ok_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
