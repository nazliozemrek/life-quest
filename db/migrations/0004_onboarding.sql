-- Source of truth for this schema's design: docs/pillar-4-onboarding-calibration.md

ALTER TABLE players ADD COLUMN rules_mode difficulty_mode NOT NULL DEFAULT 'normal';
ALTER TABLE players ADD COLUMN class text CHECK (class IN ('warrior','artisan','merchant','bard','sage'));

CREATE TABLE calibrations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id            uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  version              smallint NOT NULL,
  trigger              text NOT NULL CHECK (trigger IN ('onboarding','scheduled','life_event','drift')),
  life_load            smallint NOT NULL,
  domains              jsonb NOT NULL,          -- derived scores only, no raw answers
  calibrated_mode      difficulty_mode NOT NULL,
  rules_mode           difficulty_mode NOT NULL,
  xp_mode              difficulty_mode NOT NULL,
  constraint_tags      text[] NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON calibrations (player_id, created_at DESC);

CREATE TABLE player_goals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  title            text NOT NULL,
  horizon          text NOT NULL CHECK (horizon IN ('week','month','year')),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);
