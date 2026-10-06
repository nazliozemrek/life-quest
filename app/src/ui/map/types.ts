import type { Fix } from "../../../../src/spatial/spatial-engine";
import type { Waypoint } from "../../game/session";

export interface LatLng { lat: number; lng: number }

/** Everything a map renderer needs. Both renderers are dumb: they draw this and report taps. */
export interface MapViewProps {
  explored: ReadonlySet<string>;
  position: Fix;
  waypoints: Waypoint[];
  /** res-7 districts to outline: the one the player stands in, plus a quest's target district if focused. */
  districts: { id: string; highlight: boolean }[];
  focus: LatLng | null;
  /** Tap on the map: the player walks there. */
  onPress(target: LatLng): void;
}
