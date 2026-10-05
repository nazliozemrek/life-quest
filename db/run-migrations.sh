#!/usr/bin/env bash
# Applies every migration in order against $DATABASE_URL. Needs PostGIS and h3-pg installed on the server.
set -euo pipefail
for f in "$(dirname "$0")"/migrations/*.sql; do
  echo "applying $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
