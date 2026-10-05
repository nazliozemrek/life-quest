-- Source of truth for this schema's design: docs/pillar-3-ai-quest-generator.md

CREATE TABLE quest_generations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mode             text NOT NULL CHECK (mode IN ('daily','on_demand','main_chain','onboarding','repair')),
  prompt_version   text NOT NULL,
  model            text NOT NULL,                 -- response.model (records fallback if one ran)
  batch_id         text,                          -- Message Batches id, nightly only
  context          jsonb NOT NULL,
  raw_output       jsonb,
  issues           jsonb NOT NULL DEFAULT '[]',
  kept_count       smallint NOT NULL DEFAULT 0,
  used_pool        boolean NOT NULL DEFAULT false,
  stop_reason      text,
  input_tokens     int, output_tokens int, cache_read_tokens int,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON quest_generations (player_id, created_at DESC);

ALTER TABLE quest_templates ADD COLUMN generation_id uuid REFERENCES quest_generations(id);
ALTER TABLE quest_templates ADD COLUMN content jsonb;  -- the full validated Quest object

CREATE TYPE quest_feedback_signal AS ENUM ('accepted','declined','completed','failed','reported');
CREATE TABLE quest_feedback (
  quest_instance_id uuid REFERENCES quest_instances(id) ON DELETE CASCADE,
  signal            quest_feedback_signal NOT NULL,
  reason            text,                         -- too_hard | not_relevant | no_time | already_doing_it | unsafe
  at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quest_instance_id, signal)
);
