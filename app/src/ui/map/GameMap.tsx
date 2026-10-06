// Picks the map renderer: Mapbox in a dev or store build with a token, the SVG map everywhere else.
import { isRunningInExpoGo } from "expo";
import { Suspense, lazy } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { PlaceholderMap } from "./PlaceholderMap";
import type { MapViewProps } from "./types";

const MapboxMap = lazy(() => import("./MapboxMap"));
const USE_MAPBOX = !!process.env.EXPO_PUBLIC_MAPBOX_TOKEN && Platform.OS !== "web" && !isRunningInExpoGo();

export function GameMap(props: MapViewProps) {
  return USE_MAPBOX ? (
    <Suspense fallback={<View style={StyleSheet.absoluteFill} />}><MapboxMap {...props} /></Suspense>
  ) : (
    <PlaceholderMap {...props} />
  );
}
