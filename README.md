# Life Quest

A mobile app that turns real life into an open-world RPG: real goals become quests, your city becomes a map with fog of war, and your life's difficulty sets the game's difficulty.

This repo holds the core game engines and database schema. There's no app client yet.

## What's here

| Pillar | Spec | Code |
|---|---|---|
| 1. Data models & XP economy | [docs/pillar-1-data-models-xp.md](docs/pillar-1-data-models-xp.md) | [src/xp/xp-engine.ts](src/xp/xp-engine.ts) |
| 2. Spatial: geofencing, fog of war, anti-spoofing | [docs/pillar-2-spatial.md](docs/pillar-2-spatial.md) | [src/spatial/spatial-engine.ts](src/spatial/spatial-engine.ts) |
| 3. AI quest generator (Claude, strict JSON) | [docs/pillar-3-ai-quest-generator.md](docs/pillar-3-ai-quest-generator.md) | [src/quests/quest-generator.ts](src/quests/quest-generator.ts) |
| 4. Onboarding & difficulty calibration | [docs/pillar-4-onboarding-calibration.md](docs/pillar-4-onboarding-calibration.md) | [src/onboarding/calibration.ts](src/onboarding/calibration.ts) |

Database: PostgreSQL 16 with PostGIS and h3-pg. Migrations are in [db/migrations](db/migrations), applied in filename order.

## Running

```bash
npm ci
npm run typecheck
npm test                      # engine unit tests (vitest)

# Database smoke test: needs Postgres with the postgis and h3 extensions available.
# Creates the schema, then asserts ledger idempotency, geofence lookup, fog upserts and cascade deletes.
DATABASE_URL=postgres://localhost/lifequest_test npm run db:test
```

The quest generator calls the Claude API and reads credentials from `ANTHROPIC_API_KEY`. The unit tests don't call the API.

## Key rules

- XP is only ever granted through the append-only `xp_ledger`, with an idempotency key and a snapshot of every multiplier.
- The LLM designs quests but never assigns XP. `computeAward()` prices every quest.
- Levels never go down. Neglect lowers a skill's Form, and returning earns a comeback bonus.
