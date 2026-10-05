// Local equirectangular projection for the placeholder map. Accurate to well under a pixel across a few km,
// which is all a city-scale HUD needs. Mapbox does its own projection; this is only for the SVG fallback.

export interface Projection {
  toScreen(lat: number, lng: number): { x: number; y: number };
  toLatLng(x: number, y: number): { lat: number; lng: number };
  metersPerPx: number;
}

const M_PER_DEG_LAT = 111_320;

/** center lands at (anchorX, anchorY) in screen space; y grows downward. */
export function makeProjection(
  center: { lat: number; lng: number }, metersPerPx: number, anchorX: number, anchorY: number,
): Projection {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  return {
    metersPerPx,
    toScreen(lat, lng) {
      return {
        x: anchorX + ((lng - center.lng) * mPerDegLng) / metersPerPx,
        y: anchorY - ((lat - center.lat) * M_PER_DEG_LAT) / metersPerPx,
      };
    },
    toLatLng(x, y) {
      return {
        lat: center.lat - ((y - anchorY) * metersPerPx) / M_PER_DEG_LAT,
        lng: center.lng + ((x - anchorX) * metersPerPx) / mPerDegLng,
      };
    },
  };
}
