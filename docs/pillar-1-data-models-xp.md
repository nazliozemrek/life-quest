# Life Quest — Pillar 1: Core Data Models & XP Economy

Status: v1 draft · Curve version `1` · Reference implementation: [`xp-engine.ts`](../src/xp/xp-engine.ts) (pure TS, smoke-tested on Node 22)

## 0. Design principles

1. **Levels never go down.** Real life already punishes people; the game doesn't stack on top. "Decay" hits *Form* (a soft stat), and returning to a rusty skill is *rewarded*.
2. **The ledger is the truth.** Every XP grant is an append-only, idempotent row with a full multiplier snapshot. Totals are caches. Re-tuning = replay the ledger under a new `curve_version`.
3. **Diminishing returns, not hard walls.** Farming is made pointless (repeat decay, soft caps), never blocked with an error.
4. **Effort is relative to circumstances.** Difficulty mode (from onboarding, pillar 4) scales XP so a single parent on Hardcore isn't out-levelled by a student on Peaceful doing the same quest.
5. **Integers at rest.** XP is `BIGINT`. Float math happens once per award, then `floor`.

## 1. Level curve

$$XP_{next}(L) = \text{Base} \times L^{\alpha}, \qquad XP_{reach}(L) = \sum_{l=1}^{L-1} XP_{next}(l) \approx \frac{\text{Base}}{\alpha+1} L^{\alpha+1}$$

| Curve | Base | α | Notes |
|---|---|---|---|
| Player | 100 | 1.1 | Total XP across all skills |
| Skill (×5) | 60 | 1.1 | Each skill levels independently |

Why α = 1.1: I tested α ∈ {1.0, 1.1, 1.15, 1.5} against a target of ~400 XP/day for an engaged Normal player (≈5 standard quests). α = 1.5 put level 30 at 16 months, which kills motivation. α = 1.1 gives a fast hook and a long, smooth tail with no level cap:

| Level | XP to next | Cumulative | Days @ 400 XP/day |
|---|---|---|---|
| 2 | 214 | 100 | < 1 |
| 5 | 587 | 1,108 | 3 |
| 10 | 1,259 | 5,369 | 13 |
| 25 | 3,449 | 39,345 | 98 |
| 50 | 7,394 | 172,350 | 431 |
| 100 | 15,849 | 746,794 | 1,867 (~5 yrs) |

Level lookup is a lazily-extended cumulative table + binary search (`O(log L)`, table at L=1000 is 8 KB). No closed-form inverse needed.

## 2. XP award formula

$$XP = \text{TierBase} \times E \times M_{diff} \times M_{streak} \times M_{repeat} \times M_{verify}$$

then split across skills by weight, and per skill:

$$XP_s = \text{SoftCap}\big(XP \cdot w_s \cdot M_{comeback}(s)\big)$$

and finally Rested XP adds a bonus equal to the net award until the pool is empty.

### 2.1 Tier base (quest generator picks tier + effort E ∈ [0.5, 2.0])

| Tier | Base XP | Example |
|---|---|---|
| trivial | 10 | Drink water, make bed |
| minor | 25 | 20-min walk, reply to that email |
| standard | 60 | Gym session, 1h deep work |
| major | 150 | Finish a course module, hard conversation |
| epic | 400 | Ship a side project, run a 10K |
| boss | 1,500 | Job offer, move cities, marathon (one-off raids) |

### 2.2 Multipliers

| Multiplier | Formula / values | Range |
|---|---|---|
| Difficulty `M_diff` | Peaceful 0.8 · Normal 1.0 · Hard 1.2 · Hardcore 1.4 | 0.8–1.4 |
| Streak `M_streak` | `1 + 0.5·(1 − e^(−days/14))` | 1.0 → 1.5 (1.20 @ 7d, 1.32 @ 14d, 1.44 @ 30d) |
| Repeat `M_repeat` | `1 / (1 + 0.5·(k−1))`, k = nth completion of the same template in rolling 24h | 1, 0.67, 0.5, 0.4 … |
| Verify `M_verify` | self-report 0.7 · photo/peer evidence 1.0 · sensor/geofence 1.15 | 0.7–1.15 |
| Comeback `M_comeback` | `1 + 0.5·(1 − Form)` | 1.0–1.25 |

**Streak rules by difficulty** (the other half of what difficulty means):

| Mode | On a missed day |
|---|---|
| Peaceful | Streak halves, never resets. |
| Normal | Burns a grace token (earn 1 per 7-day streak, max 2), else resets. |
| Hard | 1 grace token max, else resets. |
| Hardcore | Resets. No tokens. The 1.4× is the payment for that. |

### 2.3 Decay: Skill Form

$$\text{Form}(d) = \max\left(0.5,\ 0.5^{\,d/14}\right)$$

`d` = days since last XP in that skill. Half-life 14 days, floor 0.5. Form is shown on the skill HUD (a "rust" overlay on the skill icon) and gates content (e.g., a Vitality boss raid requires Form ≥ 0.6). It **never removes XP**; it feeds `M_comeback` so the first quests back in a neglected skill pay up to +25%.

### 2.4 Anti-farming

- **Daily soft cap per skill:** `cap = 250 + 25 × skillLevel`. XP over the cap pays 20%.
- **Repeat decay** (above) kills spam-completing the same template.
- **Verification weighting** makes honest self-report viable but sensor-verified quests strictly better, which nudges toward un-spoofable evidence (GPS anti-spoofing is pillar 2).
- **Server-authoritative:** the client never sends XP amounts, only `quest_instance_id` + evidence.

### 2.5 Rested XP (re-engagement without guilt)

Per idle day, pool += 5% of current `XP_next`, capped at 150% of it. While the pool is non-zero, each award is doubled (bonus = min(pool, net)). Bonus counts toward player XP only, not skill caps. Message on return: "You're Rested. Next 2× XP is on us."

### 2.6 Worked examples (from the engine)

| Scenario | Result |
|---|---|
| Standard gym quest, Hard mode, geofence-verified, 7-day streak, 70% Vitality / 30% Mindset (Mindset idle 30 days) | **106 XP** (Vitality 69, Mindset 37 incl. comeback bonus) |
| Same template a 3rd time today, self-reported, Normal, Vitality already at its cap | **16 XP** (8 + 8 rested) |

## 3. Data model (TypeScript)

```typescript
export type DifficultyMode = "peaceful" | "normal" | "hard" | "hardcore";
export type SkillCode = "vitality" | "craft" | "wealth" | "charisma" | "mindset";
export type QuestTier = "trivial" | "minor" | "standard" | "major" | "epic" | "boss";
export type Verification = "self" | "evidence" | "sensor";
export type QuestStatus = "offered" | "active" | "completed" | "failed" | "expired" | "abandoned";

export interface Player {
  id: string;                 // uuid
  handle: string;
  difficulty: DifficultyMode; // set by onboarding (pillar 4), re-calibratable every 30d
  totalXp: number;            // cache of SUM(xp_ledger.final_xp)
  level: number;              // cache of playerLevels.levelFor(totalXp)
  restedXp: number;
  timezone: string;           // IANA; streak "days" are local days
}

export interface PlayerSkill {
  playerId: string;
  skill: SkillCode;
  xp: number;
  level: number;
  lastActiveAt: string;       // ISO; drives Form
}

export interface QuestTemplate {
  id: string;
  source: "system" | "ai" | "user";
  tier: QuestTier;
  effort: number;                                    // 0.5..2.0
  title: string;
  skillWeights: Partial<Record<SkillCode, number>>;  // sums to 1
  verification: Verification;
  repeatable: boolean;
  cooldownSeconds: number | null;
  geofenceId: string | null;                         // pillar 2
}

export interface XpLedgerEntry {
  id: number;
  playerId: string;
  questInstanceId: string | null;  // null for system grants (achievements, events)
  idempotencyKey: string;          // e.g. `quest:${instanceId}`
  baseXp: number;
  finalXp: number;
  skillSplit: Partial<Record<SkillCode, number>>;
  restedConsumed: number;
  multipliers: Record<string, number>;
  curveVersion: number;
  createdAt: string;
}
```

## 4. PostgreSQL schema

```sql
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
REVOKE UPDATE, DELETE ON xp_ledger FROM app_rw;

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
```

## 5. Redis keys (hot path; Postgres stays the source of truth)

| Key | Type | TTL | Purpose |
|---|---|---|---|
| `lq:cap:{pid}:{yyyymmdd}:{skill}` | string (INCRBY) | 48h | XP earned today per skill, for soft cap |
| `lq:rep:{pid}:{templateId}` | ZSET (score = ts) | 25h | Rolling 24h repeat count (`ZREMRANGEBYSCORE` + `ZCARD`) |
| `lq:lb:weekly:{isoWeek}` | ZSET | 8d | Weekly XP leaderboard (`ZINCRBY`) |
| `lq:lb:guild:{gid}:{isoWeek}` | ZSET | 8d | Guild leaderboard (pillar later) |
| `lq:lock:award:{pid}` | string (SET NX PX 5000) | 5s | Serializes awards per player |

If Redis is lost, caps and repeat counts are rebuilt from `xp_ledger` / `quest_instances` for the current day; worst case a player gets slightly looser caps for one day.

## 6. Award flow

```mermaid
sequenceDiagram
    participant C as Client
    participant API as Quest API
    participant R as Redis
    participant PG as Postgres
    participant Q as Event bus

    C->>API: POST /quests/{instanceId}/complete {evidence}
    API->>API: Verify evidence (photo / geofence / sensor) → verification level
    API->>R: SET lq:lock:award:{pid} NX PX 5000
    API->>R: ZADD+ZCARD lq:rep, GET lq:cap per skill
    API->>PG: BEGIN; SELECT player, skills, streak FOR UPDATE
    API->>API: computeAward() (xp-engine.ts)
    API->>PG: INSERT xp_ledger ON CONFLICT (player_id, idempotency_key) DO NOTHING
    alt inserted
        API->>PG: UPDATE players, player_skills, streaks, quest_instances; COMMIT
        API->>R: INCRBY caps, ZINCRBY leaderboards
        API->>Q: xp.awarded / level.up / skill.level.up / title.earned
    else duplicate
        API->>PG: ROLLBACK, return original ledger row
    end
    API-->>C: {xp, perSkill, levelBefore, levelAfter, newUnlocks}
```

The client gets `levelBefore/levelAfter` so the HUD can play the level-up animation and haptics without a second round trip.

## 7. Decisions I made (change any of these)

- **XP is one currency.** Player XP = sum of skill XP + rested bonus. No separate gold yet; loot comes from a loot-table pillar later.
- **Skill points = skill levels.** 1 point per skill level, spent only in that skill's tree. Keeps trees from being min-maxed across skills.
- **Difficulty re-calibration** allowed every 30 days so the multiplier can't be toggled for a quick XP spike.
- **Streak day boundary** is the player's local midnight + 3h grace (so 1am gym sessions count for "yesterday").

## 8. Next in this pillar

- Skill tree content (≈12 nodes per skill) and title catalog.
- Simulation harness: Monte Carlo of player archetypes (casual / grinder / returning) over 365 days to validate the table in §1.
- Loot tables and drop rates.
