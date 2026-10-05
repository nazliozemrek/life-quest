// Mapbox renderer for development and store builds. Loaded lazily by MapHud only when a token is set and the
// app is not running in Expo Go, because @rnmapbox/maps is a native module Expo Go doesn't ship.
import Mapbox, { Camera, CircleLayer, FillLayer, LineLayer, MapView, ShapeSource, SymbolLayer } from "@rnmapbox/maps";
import { cellToBoundary } from "h3-js";
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { fogMask } from "../../../../src/spatial/spatial-engine";
import { color } from "../theme";
import type { MapViewProps } from "./types";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? null);

export default function MapboxMap({ explored, position, waypoints, districts, focus, onPress }: MapViewProps) {
  const fog = useMemo(() => fogMask([...explored]), [explored]);
  const center = focus ?? position;

  const pois = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: waypoints.map(w => ({
      type: "Feature", properties: { name: w.name }, geometry: { type: "Point", coordinates: [w.lng, w.lat] },
    })),
  }), [waypoints]);

  const districtShapes = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: districts.map(d => ({
      type: "Feature",
      properties: { highlight: d.highlight },
      geometry: { type: "Polygon", coordinates: [cellToBoundary(d.id, true)] },
    })),
  }), [districts]);

  const me: GeoJSON.Feature = {
    type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [position.lng, position.lat] },
  };

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      styleURL="mapbox://styles/mapbox/dark-v11"
      scaleBarEnabled={false}
      logoPosition={{ bottom: 8, left: 8 }}
      attributionPosition={{ bottom: 8, right: 8 }}
      onPress={f => {
        const [lng, lat] = f.geometry.coordinates;
        onPress({ lat, lng });
      }}
    >
      <Camera centerCoordinate={[center.lng, center.lat]} zoomLevel={15.5} animationMode="easeTo" animationDuration={300} />

      <ShapeSource id="fog" shape={fog}>
        {/* dark-v11 is already near-black, so the fog has to be almost opaque to read, and the explored edge
            gets a faint gold line so the frontier is visible at a glance. */}
        <FillLayer id="fog-fill" style={{ fillColor: "#03050A", fillOpacity: 0.93, fillAntialias: true }} />
        <LineLayer id="fog-edge" style={{ lineColor: color.district, lineWidth: 1.2, lineOpacity: 0.6, lineBlur: 1 }} />
      </ShapeSource>

      <ShapeSource id="districts" shape={districtShapes}>
        <LineLayer
          id="district-line"
          style={{
            lineColor: color.district,
            lineWidth: ["case", ["get", "highlight"], 2.5, 1.5],
            lineDasharray: [3, 3],
          }}
        />
      </ShapeSource>

      <ShapeSource id="waypoints" shape={pois}>
        <CircleLayer id="waypoint-dot" style={{ circleRadius: 5, circleColor: color.xp }} />
        <SymbolLayer
          id="waypoint-label"
          style={{ textField: ["get", "name"], textSize: 11, textColor: color.text, textOffset: [0, -1.4], textHaloColor: color.bg, textHaloWidth: 1 }}
        />
      </ShapeSource>

      <ShapeSource id="me" shape={me}>
        <CircleLayer id="me-halo" style={{ circleRadius: 18, circleColor: color.player, circleOpacity: 0.15 }} />
        <CircleLayer id="me-dot" style={{ circleRadius: 7, circleColor: color.player, circleStrokeColor: "#fff", circleStrokeWidth: 2 }} />
      </ShapeSource>
    </MapView>
  );
}
