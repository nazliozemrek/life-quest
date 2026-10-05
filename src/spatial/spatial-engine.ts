// Life Quest — spatial engine (pillar 2). Fix validation, fog-of-war reveal, fog mask geometry.
// Depends on h3-js v4. Runs on the server (authoritative) and on the client (optimistic reveal).
import {
  latLngToCell, gridDisk, gridPathCells, cellToParent, cellToChildrenSize,
  cellsToMultiPolygon, greatCircleDistance,
} from "h3-js";

export const FOG_RES = 10;      // ~76 m edge, ~1.5 ha per cell
export const DISTRICT_RES = 7;  // ~1.4 km edge, 343 fog cells per district

export interface Fix {
  lat: number; lng: number;
  t: number;                    // epoch ms (device clock; server re-checks skew)
  accuracyM: number;            // horizontal accuracy
  altitudeM?: number;
  isMock?: boolean;             // Android Location.isMock() / iOS sourceInformation.isSimulatedBySoftware
}

export type FixFlag = "mock" | "low_accuracy" | "teleport" | "clock_skew" | "too_perfect";

export interface ValidationResult {
  accepted: (Fix & { speedMps: number })[];
  rejected: { fix: Fix; flag: FixFlag }[];
  suspicion: number;            // 0..1, feeds the player trust score
}

const MAX_ACCURACY_M = 50;
const TELEPORT_MPS = 85;        // ~300 km/h; flights are handled as a gap, not a path
const MAX_FUTURE_SKEW_MS = 60_000;

/** Validate a batch of fixes (sorted by t) against the last accepted fix. */
export function validateFixes(batch: Fix[], last: Fix | null, serverNow = Date.now()): ValidationResult {
  const accepted: ValidationResult["accepted"] = [];
  const rejected: ValidationResult["rejected"] = [];
  let prev = last;

  for (const f of batch) {
    if (f.isMock) { rejected.push({ fix: f, flag: "mock" }); continue; }
    if (f.t > serverNow + MAX_FUTURE_SKEW_MS || (prev && f.t <= prev.t)) {
      rejected.push({ fix: f, flag: "clock_skew" }); continue;
    }
    if (f.accuracyM > MAX_ACCURACY_M) { rejected.push({ fix: f, flag: "low_accuracy" }); continue; }

    let speedMps = 0;
    if (prev) {
      const d = greatCircleDistance([prev.lat, prev.lng], [f.lat, f.lng], "m");
      const dt = (f.t - prev.t) / 1000;
      speedMps = d / dt;
      // A long gap at airliner speed is a flight: accept the fix, reveal nothing en route.
      if (speedMps > TELEPORT_MPS && !(dt > 1800 && speedMps < 280)) {
        rejected.push({ fix: f, flag: "teleport" }); continue;
      }
    }
    accepted.push({ ...f, speedMps });
    prev = f;
  }

  // With no previous fix the first speed is unknown: borrow the next fix's, so a batch that starts on a train
  // doesn't reveal fog around its first point.
  if (!last && accepted.length > 1) accepted[0].speedMps = accepted[1].speedMps;

  // Spoofing apps replay suspiciously clean signals: identical accuracy and altitude on every fix.
  if (batch.length >= 20) {
    const accs = new Set(batch.map(f => f.accuracyM));
    const alts = new Set(batch.map(f => f.altitudeM ?? NaN));
    if (accs.size === 1 && alts.size === 1) {
      for (const a of accepted.splice(0)) rejected.push({ fix: a, flag: "too_perfect" });
    }
  }

  const weights: Record<FixFlag, number> = { mock: 1, teleport: 0.6, too_perfect: 0.8, clock_skew: 0.3, low_accuracy: 0 };
  const suspicion = batch.length
    ? Math.min(1, rejected.reduce((s, r) => s + weights[r.flag], 0) / batch.length * 3)
    : 0;
  return { accepted, rejected, suspicion };
}

/** Reveal radius by movement mode: on foot sees around you, in a car sees the road, faster sees nothing. */
function revealRing(speedMps: number): number | null {
  if (speedMps <= 8) return 1;     // walk / run / bike: 7 cells, ~130 m radius
  if (speedMps <= 40) return 0;    // vehicle: the cell you're in
  return null;                     // train / plane: no reveal
}

/** Cells revealed by a validated track. Interpolates between consecutive fixes so a fast jog leaves no holes. */
export function revealCells(track: ValidationResult["accepted"]): Set<string> {
  const out = new Set<string>();
  let prevCell: string | null = null;
  for (const f of track) {
    const ring = revealRing(f.speedMps);
    const cell = latLngToCell(f.lat, f.lng, FOG_RES);
    if (ring === null) { prevCell = null; continue; }
    const path = prevCell && prevCell !== cell ? safePath(prevCell, cell) : [cell];
    for (const c of path) for (const n of gridDisk(c, ring)) out.add(n);
    prevCell = cell;
  }
  return out;
}

function safePath(a: string, b: string): string[] {
  try {
    const p = gridPathCells(a, b);
    return p.length <= 30 ? p : [b];   // > ~2 km between fixes: don't paint a straight line
  } catch { return [b]; }              // pentagon / distortion edge cases
}

/** District completion milestones (fraction of a res-7 district's fog cells explored). */
export const DISTRICT_MILESTONES = [
  { pct: 0.25, xp: 50,  title: null },
  { pct: 0.50, xp: 150, title: null },
  { pct: 0.75, xp: 400, title: "Local Legend" },
] as const;

export function districtProgress(exploredInDistrict: number) {
  const total = cellToChildrenSize(latLngToCell(0, 0, DISTRICT_RES), FOG_RES); // 343
  return exploredInDistrict / total;
}

export function districtOf(cell: string): string { return cellToParent(cell, DISTRICT_RES); }

/**
 * Fog mask for the viewport as a MultiPolygon: the world with explored islands cut out as holes,
 * plus any unexplored pockets inside those islands as fog polygons of their own.
 * Pass same-resolution cells only (cellsToMultiPolygon requires it); the client caches the result per
 * res-5 tile and rebuilds only tiles that gained cells.
 */
export function fogMask(exploredInViewport: string[]) {
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  const islands = cellsToMultiPolygon(exploredInViewport, true);
  const pockets = islands.flatMap(poly => poly.slice(1).map(ring => [ring]));
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "MultiPolygon" as const, coordinates: [[world, ...islands.map(p => p[0])], ...pockets] },
  };
}
