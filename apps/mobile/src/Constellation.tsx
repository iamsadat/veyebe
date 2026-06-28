import { Canvas, useFrame } from "@react-three/fiber/native";
import { Component, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Group } from "three";
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

function Scene({
  features,
  reducedMotion,
}: {
  features: Feature[];
  reducedMotion: boolean;
}) {
  const group = useRef<Group>(null);
  useFrame((_state, delta) => {
    if (!reducedMotion && group.current)
      group.current.rotation.z += delta * 0.04;
  });
  return (
    <group ref={group}>
      <ambientLight intensity={1.6} />
      <pointLight position={[0, 0, 4]} intensity={25} color="#A98BFF" />
      <mesh>
        <sphereGeometry args={[0.52, 32, 32]} />
        <meshStandardMaterial
          color="#D6CCFF"
          emissive="#6D52D9"
          emissiveIntensity={1.8}
        />
      </mesh>
      {features.map((feature, index) => {
        const angle = (Math.PI * 2 * index) / features.length;
        const radius = 1.25 + (index % 2) * 0.3;
        return (
          <mesh
            key={feature.id}
            position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}
          >
            <sphereGeometry args={[0.16 + feature.evidence / 350, 20, 20]} />
            <meshStandardMaterial
              color={colors[feature.state]}
              emissive={colors[feature.state]}
              emissiveIntensity={feature.state === "verified" ? 1.5 : 0.65}
            />
          </mesh>
        );
      })}
    </group>
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
  const fallback = <FeatureList features={features} />;
  return (
    <SceneBoundary fallback={fallback}>
      <View
        style={styles.canvas}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Canvas
          camera={{ position: [0, 0, 4], fov: 50 }}
          frameloop={reducedMotion ? "demand" : "always"}
        >
          <Scene features={features} reducedMotion={reducedMotion} />
        </Canvas>
      </View>
    </SceneBoundary>
  );
}

export function LensSwitch({
  visual,
  onChange,
}: {
  visual: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switch}>
      <Pressable
        onPress={() => onChange(true)}
        style={[styles.switchItem, visual && styles.switchActive]}
        accessibilityRole="button"
      >
        <Text style={styles.switchText}>Constellation</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange(false)}
        style={[styles.switchItem, !visual && styles.switchActive]}
        accessibilityRole="button"
      >
        <Text style={styles.switchText}>Feature list</Text>
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
  switchItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 9,
  },
  switchActive: { backgroundColor: "#27213C" },
  switchText: { color: "#D9D2E8", fontSize: 12, fontWeight: "600" },
});
