-- Source of truth for this schema's design: docs/pillar-1-data-models-xp.md

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid on older Postgres

CREATE TYPE difficulty_mode AS ENUM ('peaceful','normal','hard','hardcore');
CREATE TYPE skill_code      AS ENUM ('vitality','craft','wealth','charisma','mindset');
CREATE TYPE quest_tier      AS ENUM ('trivial','minor','standard','major','epic','boss');
CREATE TYPE verification    AS ENUM ('self','evidence','sensor');
CREATE TYPE quest_status    AS ENUM ('offered','active','completed','failed','expired','abandoned');

CREATE TABLE players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle        citext UNIQUE NOT NULL,
  difficulty    difficulty_mode NOT NULL DEFAULT 'normal',
  total_xp      bigint NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  level         int    NOT NULL DEFAULT 1,
  rested_xp     bigint NOT NULL DEFAULT 0,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  timezone      text NOT NULL DEFAULT 'UTC',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_skills (
  player_id      uuid REFERENCES players(id) ON DELETE CASCADE,
  skill          skill_code,
  xp             bigint NOT NULL DEFAULT 0,
  level          int    NOT NULL DEFAULT 1,
  last_active_at timestamptz,
  PRIMARY KEY (player_id, skill)
);

-- Skill tree: nodes unlock perks/titles at skill levels.
CREATE TABLE skill_nodes (
  id                 text PRIMARY KEY,            -- 'vitality.iron_lungs'
  skill              skill_code NOT NULL,
  parent_id          text REFERENCES skill_nodes(id),
  name               text NOT NULL,
  required_level     int  NOT NULL,
  cost_points        int  NOT NULL DEFAULT 1,     -- 1 point per skill level
  effects            jsonb NOT NULL DEFAULT '{}'  -- {"xp_mult":{"vitality":0.05}}
);
CREATE TABLE player_skill_nodes (
  player_id   uuid REFERENCES players(id) ON DELETE CASCADE,
  node_id     text REFERENCES skill_nodes(id),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, node_id)
);

CREATE TABLE quest_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           text NOT NULL CHECK (source IN ('system','ai','user')),
  owner_id         uuid REFERENCES players(id),   -- null for system
  tier             quest_tier NOT NULL,
  effort           numeric(3,2) NOT NULL DEFAULT 1 CHECK (effort BETWEEN 0.5 AND 2.0),
  title            text NOT NULL,
  skill_weights    jsonb NOT NULL,                -- validated in app: keys ⊂ skill_code, sum = 1
  verification     verification NOT NULL DEFAULT 'self',
  repeatable       boolean NOT NULL DEFAULT false,
  cooldown         interval,
  geofence_id      uuid,                          -- FK added in pillar 2
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quest_instances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  template_id   uuid NOT NULL REFERENCES quest_templates(id),
  status        quest_status NOT NULL DEFAULT 'offered',
  due_at        timestamptz,
  completed_at  timestamptz,
  evidence      jsonb,                            -- photo key, sensor payload, peer id
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON quest_instances (player_id, status);
CREATE INDEX ON quest_instances (player_id, template_id, completed_at DESC);

-- Append-only. Partition monthly once volume warrants it.
CREATE TABLE xp_ledger (
  id                bigserial PRIMARY KEY,
  player_id         uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_instance_id uuid REFERENCES quest_instances(id),
  idempotency_key   text NOT NULL,
  base_xp           int NOT NULL,
  final_xp          int NOT NULL CHECK (final_xp >= 0),
  skill_split       jsonb NOT NULL,
  rested_consumed   int NOT NULL DEFAULT 0,
  multipliers       jsonb NOT NULL,
  curve_version     smallint NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, idempotency_key)
);
CREATE INDEX ON xp_ledger (player_id, created_at DESC);
-- The app role may append to the ledger but never rewrite it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    REVOKE UPDATE, DELETE ON xp_ledger FROM app_rw;
  END IF;
END $$;

CREATE TABLE streaks (
  player_id     uuid REFERENCES players(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'daily',   -- 'daily' | 'skill:vitality' ...
  current_days  int  NOT NULL DEFAULT 0,
  best_days     int  NOT NULL DEFAULT 0,
  last_day      date,                            -- player-local date
  grace_tokens  smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, kind)
);

CREATE TABLE titles (
  id        text PRIMARY KEY,                    -- 'the_unbroken'
  name      text NOT NULL,
  rule      jsonb NOT NULL                       -- {"streak_days":100} | {"skill":"craft","level":25}
);
CREATE TABLE player_titles (
  player_id  uuid REFERENCES players(id) ON DELETE CASCADE,
  title_id   text REFERENCES titles(id),
  earned_at  timestamptz NOT NULL DEFAULT now(),
  equipped   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (player_id, title_id)
);
