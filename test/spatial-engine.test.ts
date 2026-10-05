import { describe, expect, it } from "vitest";
import { districtOf, districtProgress, fogMask, revealCells, validateFixes, type Fix } from "../src/spatial/spatial-engine.ts";

const t0 = 1_760_000_000_000;
// 20-minute walk heading east in Moda, Istanbul: a fix every 10 s at ~1.4 m/s, with small jitter.
const walk: Fix[] = Array.from({ length: 120 }, (_, i) => ({
  lat: 40.98 + (i % 3) * 1e-6, lng: 29.025 + i * 1.65e-4, t: t0 + i * 10_000,
  accuracyM: 5 + (i % 7), altitudeM: 20 + (i % 5) * 0.3,
}));

describe("validateFixes", () => {
  it("accepts a walk and rejects teleports and mock fixes", () => {
    const v = validateFixes([
      ...walk,
      { lat: 41.5, lng: 29.1, t: t0 + 1_210_000, accuracyM: 8, altitudeM: 20 },
      { lat: 40.98, lng: 29.05, t: t0 + 1_220_000, accuracyM: 8, isMock: true },
    ], null, t0 + 2_000_000);
    expect(v.accepted).toHaveLength(120);
    expect(v.rejected.map(r => r.flag)).toEqual(["teleport", "mock"]);
    expect(v.suspicion).toBeLessThan(0.1);
  });
  it("rejects a too-perfect replayed track", () => {
    const spoof = Array.from({ length: 25 }, (_, i) => ({ lat: 40.98, lng: 29.02 + i * 1e-4, t: t0 + i * 10_000, accuracyM: 5, altitudeM: 10 }));
    const v = validateFixes(spoof, null, t0 + 1_000_000);
    expect(v.accepted).toHaveLength(0);
    expect(v.suspicion).toBe(1);
  });
});

describe("fog of war", () => {
  it("reveals a contiguous corridor and builds a mask", () => {
    const cells = revealCells(validateFixes(walk, null, t0 + 2_000_000).accepted);
    expect(cells.size).toBeGreaterThan(30);
    expect(districtProgress(cells.size)).toBeGreaterThan(0.08);
    expect(districtOf([...cells][0])).toBe("871ec902effffff");
    const mask = fogMask([...cells]);
    expect(mask.geometry.coordinates[0].length).toBeGreaterThanOrEqual(2); // world ring + at least one hole
  });
  it("reveals nothing at train speed", () => {
    const train = Array.from({ length: 10 }, (_, i) => ({ lat: 40.98, lng: 29.0 + i * 0.008, t: t0 + i * 10_000, accuracyM: 10, altitudeM: i }));
    expect(revealCells(validateFixes(train, null, t0 + 1e6).accepted).size).toBe(0);
  });
});
