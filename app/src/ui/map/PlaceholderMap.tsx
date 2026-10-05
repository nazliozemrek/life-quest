// SVG map used when no Mapbox token is configured, in Expo Go, and on web. It draws the real fog geometry from
// spatial-engine's fogMask() and the real H3 cells, so everything except the basemap tiles is production behavior.
import { cellToBoundary } from "h3-js";
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Path, Polygon, Text as SvgText } from "react-native-svg";
import { fogMask } from "../../../../src/spatial/spatial-engine";
import { makeProjection, type Projection } from "../../game/projection";
import { useT } from "../settings";
import { color } from "../theme";
import type { MapViewProps } from "./types";

const METERS_PER_PX = 4;
/** The camera centers the player in the band between the HUD header and the quest sheet. */
const CAMERA_Y = 0.36;

export function PlaceholderMap({ explored, position, waypoints, districts, focus, onPress }: MapViewProps) {
  const t = useT();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const root = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
    root.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
  };

  const proj = useMemo(
    () => makeProjection(focus ?? position, METERS_PER_PX, size.w / 2, size.h * CAMERA_Y),
    [focus, position, size],
  );

  // Fog rings in lng/lat only change when cells are revealed; re-projecting them per camera move is cheap.
  const fogRings = useMemo(() => {
    const coords = fogMask([...explored]).geometry.coordinates;
    const [[_world, ...islands], ...pockets] = coords;
    return [...islands, ...pockets.map(p => p[0])];
  }, [explored]);
  const cellRings = useMemo(() => [...explored].map(c => cellToBoundary(c, true)), [explored]);

  const ring = (pts: number[][]) => pts.map(([lng, lat]) => {
    const { x, y } = proj.toScreen(lat, lng);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const fogPath = size.w === 0 ? "" :
    `M-50,-50H${size.w + 50}V${size.h + 50}H-50Z ` + fogRings.map(r => `M${ring(r).join("L")}Z`).join(" ");

  const me = proj.toScreen(position.lat, position.lng);

  return (
    <View ref={root} style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={e => {
          // react-native-web leaves locationX/Y undefined; fall back to page coordinates minus the map's origin.
          const { locationX, locationY, pageX, pageY } = e.nativeEvent;
          onPress(proj.toLatLng(locationX ?? pageX - origin.current.x, locationY ?? pageY - origin.current.y));
        }}
        accessibilityLabel={t("map.a11y")}
      >
        {size.w > 0 && (
          <Svg width={size.w} height={size.h}>
            <Grid w={size.w} h={size.h} proj={proj} />
            <G>
              {cellRings.map((r, i) => (
                <Polygon key={i} points={ring(r).join(" ")} fill={color.explored} stroke={color.grid} strokeWidth={1} />
              ))}
            </G>
            <Path d={fogPath} fill={color.fog} fillRule="evenodd" />
            {districts.map(d => (
              <Polygon
                key={d.id}
                points={ring(cellToBoundary(d.id, true)).join(" ")}
                fill="none"
                stroke={color.district}
                strokeWidth={d.highlight ? 2.5 : 1.5}
                strokeDasharray={d.highlight ? undefined : "6 6"}
              />
            ))}
            {waypoints.map(w => {
              const p = proj.toScreen(w.lat, w.lng);
              return (
                <G key={w.id}>
                  <Circle cx={p.x} cy={p.y} r={w.radiusM / METERS_PER_PX} fill="rgba(245,196,81,0.10)" stroke={color.district} strokeWidth={1} />
                  <Circle cx={p.x} cy={p.y} r={5} fill={color.xp} />
                  <SvgText x={p.x} y={p.y - 12} fill={color.text} fontSize={11} fontWeight="600" textAnchor="middle">{w.name}</SvgText>
                </G>
              );
            })}
            <Circle cx={me.x} cy={me.y} r={18} fill="rgba(76,195,255,0.15)" />
            <Circle cx={me.x} cy={me.y} r={7} fill={color.player} stroke="#fff" strokeWidth={2} />
          </Svg>
        )}
      </Pressable>
    </View>
  );
}

/** Faint 100 m grid so movement reads even inside solid fog. Anchored to the world, not the screen. */
function Grid({ w, h, proj }: { w: number; h: number; proj: Projection }) {
  const step = 100 / proj.metersPerPx;
  const origin = proj.toScreen(0, 0);
  const ox = ((origin.x % step) + step) % step;
  const oy = ((origin.y % step) + step) % step;
  let d = "";
  for (let x = ox; x < w; x += step) d += `M${x.toFixed(1)},0V${h}`;
  for (let y = oy; y < h; y += step) d += `M0,${y.toFixed(1)}H${w}`;
  return <Path d={d} stroke={color.grid} strokeWidth={1} />;
}
