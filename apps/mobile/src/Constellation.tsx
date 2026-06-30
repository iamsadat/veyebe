import { Canvas, useFrame, useThree } from "@react-three/fiber/native";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as THREE from "three";
import type { Feature } from "./model";

const colors: Record<Feature["state"], string> = {
  proposed: "#8C94A8",
  planned: "#7D8BFF",
  active: "#9B7CFF",
  needs_verification: "#FFBA69",
  verified: "#67E8B5",
  blocked: "#FF6B7A",
  parked: "#667085",
};

// Shared mutable orbit state driven by the RN pan gesture, read in useFrame.
type OrbitRef = { current: { rx: number; ry: number; px: number; py: number } };

function Scene({
  features,
  reducedMotion,
  selectedId,
  onSelect,
  orbit,
}: {
  features: Feature[];
  reducedMotion: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  orbit: OrbitRef;
}) {
  const mainGroup = useRef<THREE.Group>(null);
  const stars = useRef<THREE.Points>(null);
  const core = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const coreGlow = useRef<THREE.Mesh>(null);
  const lineMat = useRef<THREE.LineBasicMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const nodeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const { camera } = useThree();

  // Fixed ring layout (with a little z-depth). Lines + halo reuse these.
  const positions = useMemo(
    () =>
      features.map((_f, i) => {
        const angle = (Math.PI * 2 * i) / features.length;
        const radius = 1.3 + (i % 2) * 0.32;
        const z = ((i % 3) - 1) * 0.22;
        return [
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          z,
        ] as [number, number, number];
      }),
    [features],
  );

  // Core -> node dependency links as one LineSegments buffer (single draw call).
  const linePositions = useMemo(() => {
    const arr = new Float32Array(positions.length * 6);
    positions.forEach((p, i) => arr.set([0, 0, 0, p[0], p[1], p[2]], i * 6));
    return arr;
  }, [positions]);

  // Modest star field for depth/parallax. ponytail: 140 points, bump only if it reads sparse.
  const starPositions = useMemo(() => {
    const count = 140;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);

  const selectedIndex = features.findIndex((f) => f.id === selectedId);
  const selectedColor =
    selectedIndex >= 0 ? colors[features[selectedIndex]!.state] : "#FFFFFF";

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const g = mainGroup.current;
    if (g) {
      g.rotation.y = orbit.current.ry + (reducedMotion ? 0 : t * 0.04);
      g.rotation.x = orbit.current.rx;
      g.position.y = reducedMotion ? 0 : Math.sin(t * 0.6) * 0.05;
    }
    if (stars.current) stars.current.rotation.y = reducedMotion ? 0 : -t * 0.02;

    const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 1.6) * 0.06;
    if (core.current) core.current.scale.setScalar(pulse);
    if (coreMat.current)
      coreMat.current.emissiveIntensity = reducedMotion
        ? 1.8
        : 1.6 + Math.sin(t * 1.6) * 0.5;
    if (coreGlow.current) {
      const m = coreGlow.current.material as THREE.MeshBasicMaterial;
      m.opacity = reducedMotion ? 0.18 : 0.12 + Math.abs(Math.sin(t * 1.6)) * 0.12;
      coreGlow.current.scale.setScalar(pulse * 1.05);
    }
    if (lineMat.current)
      lineMat.current.opacity = reducedMotion
        ? 0.3
        : 0.18 + Math.abs(Math.sin(t * 0.8)) * 0.28;

    for (let i = 0; i < features.length; i++) {
      const m = nodeRefs.current[i];
      if (!m) continue;
      const target = features[i]!.id === selectedId ? 1.45 : 1;
      m.scale.setScalar(
        reducedMotion ? target : THREE.MathUtils.lerp(m.scale.x, target, 0.16),
      );
    }

    if (halo.current) {
      if (selectedIndex >= 0) {
        const p = positions[selectedIndex]!;
        halo.current.visible = true;
        halo.current.position.set(p[0], p[1], p[2]);
        if (!reducedMotion) halo.current.rotation.z += delta * 1.2;
        halo.current.scale.setScalar(
          reducedMotion ? 1 : 1 + Math.sin(t * 4) * 0.08,
        );
      } else {
        halo.current.visible = false;
      }
    }

    // Gentle dolly toward the scene when a node is selected.
    const camZ = selectedIndex >= 0 ? 3.5 : 4.2;
    camera.position.z = reducedMotion
      ? camZ
      : THREE.MathUtils.lerp(camera.position.z, camZ, 0.08);
  });

  return (
    <>
      <fog attach="fog" args={["#0D1020", 5, 12]} />
      <ambientLight intensity={1.6} />
      <pointLight position={[0, 0, 4]} intensity={25} color="#A98BFF" />

      <points ref={stars}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.045}
          color="#9B8CFF"
          transparent
          opacity={0.55}
          sizeAttenuation
          depthWrite={false}
        />
      </points>

      <group ref={mainGroup}>
        <mesh ref={core}>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshStandardMaterial
            ref={coreMat}
            color="#D6CCFF"
            emissive="#6D52D9"
            emissiveIntensity={1.8}
          />
        </mesh>
        <mesh ref={coreGlow}>
          <sphereGeometry args={[0.62, 24, 24]} />
          <meshBasicMaterial
            color="#8267E8"
            transparent
            opacity={0.15}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
          />
        </mesh>

        {positions.length > 0 && (
          <lineSegments>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[linePositions, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial
              ref={lineMat}
              color="#6D52D9"
              transparent
              opacity={0.3}
              depthWrite={false}
            />
          </lineSegments>
        )}

        {features.map((feature, i) => (
          <mesh
            key={feature.id}
            ref={(el) => {
              nodeRefs.current[i] = el;
            }}
            position={positions[i]!}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(feature.id === selectedId ? null : feature.id);
            }}
          >
            <sphereGeometry args={[0.16 + feature.evidence / 350, 20, 20]} />
            <meshStandardMaterial
              color={colors[feature.state]}
              emissive={colors[feature.state]}
              emissiveIntensity={
                feature.id === selectedId
                  ? 2.2
                  : feature.state === "verified"
                    ? 1.5
                    : 0.7
              }
            />
          </mesh>
        ))}

        <mesh ref={halo} visible={false}>
          <torusGeometry args={[0.34, 0.018, 8, 32]} />
          <meshBasicMaterial
            color={selectedColor}
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  );
}

class SceneBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function FeatureList({ features }: { features: Feature[] }) {
  return (
    <View style={styles.list} accessible accessibilityLabel="Project features">
      {features.map((feature) => (
        <View key={feature.id} style={styles.row}>
          <View
            style={[styles.dot, { backgroundColor: colors[feature.state] }]}
          />
          <View style={styles.grow}>
            <Text style={styles.name}>{feature.name}</Text>
            <Text style={styles.meta}>
              {feature.state.replace("_", " ")} · {feature.evidence} signals
            </Text>
          </View>
          <Text style={styles.confidence}>
            {Math.round(feature.confidence * 100)}%
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Constellation({
  features,
  reducedMotion,
}: {
  features: Feature[];
  reducedMotion: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const orbit = useRef({ rx: 0, ry: 0, px: 0, py: 0 });
  const selOpacity = useRef(new Animated.Value(0)).current;
  const selected = features.find((f) => f.id === selectedId) ?? null;

  useEffect(() => {
    if (reducedMotion) {
      selOpacity.setValue(selectedId ? 1 : 0);
      return;
    }
    Animated.timing(selOpacity, {
      toValue: selectedId ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [selectedId, reducedMotion, selOpacity]);

  // Drag to orbit. Capture only after a real move so taps still reach R3F
  // (mesh onClick) for selection. Disabled under reduced motion.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_e, gesture) =>
          !reducedMotion &&
          (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6),
        onPanResponderGrant: () => {
          orbit.current.px = 0;
          orbit.current.py = 0;
        },
        onPanResponderMove: (_e, gesture) => {
          const dx = gesture.dx - orbit.current.px;
          const dy = gesture.dy - orbit.current.py;
          orbit.current.px = gesture.dx;
          orbit.current.py = gesture.dy;
          orbit.current.ry += dx * 0.006;
          orbit.current.rx = Math.max(
            -0.6,
            Math.min(0.6, orbit.current.rx + dy * 0.006),
          );
        },
      }),
    [reducedMotion],
  );

  const fallback = <FeatureList features={features} />;
  return (
    <SceneBoundary fallback={fallback}>
      <View
        style={styles.canvas}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...pan.panHandlers}
      >
        <Canvas
          camera={{ position: [0, 0, 4.2], fov: 50 }}
          frameloop={reducedMotion ? "demand" : "always"}
          onPointerMissed={() => setSelectedId(null)}
        >
          <Scene
            features={features}
            reducedMotion={reducedMotion}
            selectedId={selectedId}
            onSelect={setSelectedId}
            orbit={orbit}
          />
        </Canvas>
        <Animated.View
          pointerEvents="none"
          style={[styles.caption, { opacity: selOpacity }]}
        >
          {selected && (
            <>
              <View
                style={[
                  styles.captionDot,
                  { backgroundColor: colors[selected.state] },
                ]}
              />
              <Text style={styles.captionText} numberOfLines={1}>
                {selected.name} · {selected.state.replace("_", " ")} ·{" "}
                {Math.round(selected.confidence * 100)}%
              </Text>
            </>
          )}
        </Animated.View>
      </View>
    </SceneBoundary>
  );
}

export function LensSwitch({
  visual,
  onChange,
  reducedMotion = false,
}: {
  visual: boolean;
  onChange: (value: boolean) => void;
  reducedMotion?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const pos = useRef(new Animated.Value(visual ? 0 : 1)).current;
  useEffect(() => {
    if (reducedMotion) {
      pos.setValue(visual ? 0 : 1);
      return;
    }
    Animated.spring(pos, {
      toValue: visual ? 0 : 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
    }).start();
  }, [visual, reducedMotion, pos]);

  const thumbWidth = width > 0 ? (width - 6) / 2 : 0;
  const translateX = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [0, thumbWidth],
  });

  return (
    <View
      style={styles.switch}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {thumbWidth > 0 && (
        <Animated.View
          style={[styles.switchThumb, { width: thumbWidth, transform: [{ translateX }] }]}
        />
      )}
      <Pressable
        onPress={() => onChange(true)}
        style={styles.switchItem}
        accessibilityRole="button"
      >
        <Text style={[styles.switchText, visual && styles.switchTextActive]}>
          Constellation
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange(false)}
        style={styles.switchItem}
        accessibilityRole="button"
      >
        <Text style={[styles.switchText, !visual && styles.switchTextActive]}>
          Feature list
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    height: 280,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#0D1020",
  },
  caption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(8,10,20,0.72)",
  },
  captionDot: { width: 8, height: 8, borderRadius: 8 },
  captionText: { color: "#E7E4EF", fontSize: 12, fontWeight: "600", flexShrink: 1 },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#121728",
    padding: 14,
    borderRadius: 14,
  },
  dot: { width: 9, height: 9, borderRadius: 9, marginRight: 12 },
  grow: { flex: 1 },
  name: { color: "#F4F1FF", fontSize: 14, fontWeight: "700" },
  meta: {
    color: "#919AAF",
    fontSize: 12,
    marginTop: 3,
    textTransform: "capitalize",
  },
  confidence: { color: "#C7BDD9", fontVariant: ["tabular-nums"] },
  switch: {
    flexDirection: "row",
    backgroundColor: "#101421",
    borderRadius: 12,
    padding: 3,
  },
  switchThumb: {
    position: "absolute",
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 9,
    backgroundColor: "#27213C",
  },
  switchItem: {
    flex: 1,
    paddingVertical: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  switchText: { color: "#9A93AC", fontSize: 12, fontWeight: "600" },
  switchTextActive: { color: "#FFFFFF" },
});
