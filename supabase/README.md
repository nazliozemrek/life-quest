# Life Quest backend (Supabase)

| Path | What |
|---|---|
| `migrations/20261005170000_life_quest_v1.sql` | Players, calibration, XP ledger with derived totals, daily quest sets, explored fog cells. Row Level Security on every table. |
| `functions/daily-quests/` | Today's quests for the signed-in player: AI-generated with `ANTHROPIC_API_KEY` set, otherwise from the curated pool (`src/quests/quest-pool.ts`). |
| `tests/` | `supabase-stub.sql` stands in for Supabase's auth schema so `rls.sql` runs on plain Postgres (`npm run supabase:test`, also in CI). |

## How the app uses it

The app is offline-first. It signs in anonymously on first launch, queues every change (profile, starting XP, quest completions) in an on-device outbox, and flushes it whenever it's online. Writes are idempotent, so retries are safe. Explored cells sync after the queue. Totals (`players.total_xp`, `level`, `player_skills`) are computed by a trigger from `xp_ledger`; the app can't write them.

Not yet: the server re-pricing quests with `computeAward()` (it trusts the client's award, capped at 5,000 XP a row), restoring a game from the server on a new phone, and upgrading the anonymous account to email or Apple sign-in.

## Set up a project

```bash
npx supabase login                                   # approve in the browser
npx supabase link --project-ref <ref>                # ref = the subdomain of your project URL
npx supabase db push                                 # applies migrations/ (asks for the database password)
npx supabase functions deploy daily-quests
npx supabase secrets set ANTHROPIC_API_KEY=...       # optional: switches quests from the pool to AI
```

Instead of `db push` you can paste the migration into the dashboard's SQL Editor and run it. Also turn on **Authentication → Sign In / Providers → Allow anonymous sign-ins**.

The app reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `app/.env.local`. Without them it runs fully offline.
