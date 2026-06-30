import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Constellation, FeatureList, LensSwitch } from "./src/Constellation";
import {
  demoProject,
  projectReducer,
  type ProjectEvent,
  type ProjectPulse,
  type Recommendation,
} from "./src/model";
import { fetchProjectPulse, patchRecommendation } from "./src/sync";
import { useReducedMotion } from "./src/useReducedMotion";

const STORAGE_KEY = "veyebe.project-pulse.v1";
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const WORKSPACE_ID = process.env.EXPO_PUBLIC_WORKSPACE_ID ?? "workspace_personal";
const PROJECT_ID = process.env.EXPO_PUBLIC_PROJECT_ID ?? "project_abc123";

function ActionCard({
  item,
  dispatch,
}: {
  item: Recommendation;
  dispatch: (event: ProjectEvent) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const act = async (status: "accepted" | "dismissed" | "snoozed") => {
    setIsLoading(true);
    try {
      dispatch({ type: "act", id: item.id, status });
      if (API_URL) {
        try {
          await patchRecommendation(item.id, status);
        } catch {
          /* Local action remains queued by persisted state. */
        }
      }
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <View
      style={styles.actionCard}
      accessible
      accessibilityLabel={`${item.severity}: ${item.title}. Confidence ${Math.round(item.confidence * 100)} percent.`}
    >
      <View style={styles.actionTop}>
        <Text
          style={[
            styles.severity,
            item.severity === "critical" && styles.critical,
          ]}
        >
          {item.severity}
        </Text>
        <Text style={styles.confidence}>
          {Math.round(item.confidence * 100)}% confidence
        </Text>
      </View>
      <Text style={styles.actionTitle}>{item.title}</Text>
      <Text style={styles.rationale}>{item.rationale}</Text>
      <View style={styles.actions}>
        <Pressable
          style={[styles.primaryButton, isLoading && styles.disabledButton]}
          onPress={() => void act("accepted")}
          disabled={isLoading}
          accessibilityRole="button"
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.primaryText}>Accept</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.button, isLoading && styles.disabledButton]}
          onPress={() => void act("snoozed")}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#C7CDDA" size="small" />
          ) : (
            <Text style={styles.buttonText}>Tomorrow</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.button, isLoading && styles.disabledButton]}
          onPress={() => void act("dismissed")}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#C7CDDA" size="small" />
          ) : (
            <Text style={styles.buttonText}>Dismiss</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function AppContent() {
  const [project, dispatch] = useReducer(projectReducer, demoProject);
  const [hydrated, setHydrated] = useState(false);
  const [visual, setVisual] = useState(true);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    void (async () => {
      if (API_URL) {
        const remote = await fetchProjectPulse(WORKSPACE_ID, PROJECT_ID);
        if (remote) {
          dispatch({ type: "replace", project: remote });
        }
      }
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const restored = JSON.parse(stored) as ProjectPulse;
        for (const recommendation of restored.recommendations)
          if (recommendation.status !== "open")
            dispatch({
              type: "act",
              id: recommendation.id,
              status: recommendation.status,
            });
        for (const feature of restored.features)
          if (
            feature.approved &&
            !demoProject.features.find((item) => item.id === feature.id)
              ?.approved
          )
            dispatch({ type: "approve-feature", id: feature.id });
      }
    })().finally(() => setHydrated(true));
  }, []);
  useEffect(() => {
    if (hydrated)
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }, [hydrated, project]);
  const open = useMemo(
    () => project.recommendations.filter((item) => item.status === "open"),
    [project.recommendations],
  );
  const pendingFeatures = project.features.filter((item) => !item.approved);

  if (!hydrated)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#A98BFF" />
        <Text style={styles.muted}>Restoring your project pulse…</Text>
      </View>
    );
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.eyebrowRow}>
        <Text style={styles.brand}>VEYEBE</Text>
        <View style={styles.localBadge}>
          <View style={styles.onlineDot} />
          <Text style={styles.localText}>
            {API_URL ? "SYNC READY" : "LOCAL MODE"}
          </Text>
        </View>
      </View>
      <Text style={styles.project}>{project.name}</Text>
      <Text style={styles.goal}>{project.goal}</Text>
      <Text style={styles.updated}>{project.updatedLabel}</Text>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.kicker}>PROJECT PULSE</Text>
          <Text style={styles.heading}>Living constellation</Text>
        </View>
        <Text style={styles.count}>{project.features.length} features</Text>
      </View>
      <LensSwitch visual={visual} onChange={setVisual} />
      <View style={styles.spacer} />
      {visual ? (
        <Constellation
          features={project.features}
          reducedMotion={reducedMotion}
        />
      ) : (
        <FeatureList features={project.features} />
      )}
      <View style={styles.legend}>
        <Text style={styles.legendText}>Brightness = verification</Text>
        <Text style={styles.legendText}>
          {reducedMotion ? "Motion reduced" : "Motion = activity"}
        </Text>
      </View>

      {pendingFeatures.length > 0 && (
        <View style={styles.approval}>
          <Text style={styles.kicker}>REVIEW REQUIRED</Text>
          <Text style={styles.actionTitle}>
            AI proposed “{pendingFeatures[0]?.name}”
          </Text>
          <Text style={styles.rationale}>
            Based on {pendingFeatures[0]?.evidence} derived signals. Confirming
            moves it into planned work; no source code leaves this device.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              dispatch({ type: "approve-feature", id: pendingFeatures[0]!.id })
            }
          >
            <Text style={styles.primaryText}>Approve feature</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.kicker}>ACTION INBOX</Text>
          <Text style={styles.heading}>What needs you</Text>
        </View>
        <View style={styles.numberBadge}>
          <Text style={styles.number}>{open.length}</Text>
        </View>
      </View>
      {open.map((item) => (
        <ActionCard key={item.id} item={item} dispatch={dispatch} />
      ))}
      {open.length === 0 && (
        <Text style={styles.empty}>
          Inbox clear. The stars can mind themselves for a minute.
        </Text>
      )}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.kicker}>TIMELINE</Text>
          <Text style={styles.heading}>Milestones</Text>
        </View>
      </View>
      <View style={styles.timeline}>
        {project.milestones.map((milestone, index) => (
          <View key={milestone.id} style={styles.milestone}>
            <View
              style={[
                styles.timelineDot,
                milestone.kind === "planned" && styles.plannedDot,
              ]}
            />
            <View style={styles.grow}>
              <Text style={styles.milestoneTitle}>{milestone.title}</Text>
              <Text style={styles.meta}>
                {milestone.kind === "actual"
                  ? "Observed activity"
                  : "Planned · no fabricated date"}
              </Text>
            </View>
            <Text style={styles.date}>{milestone.date ?? "Unscheduled"}</Text>
            {index < project.milestones.length - 1 && (
              <View style={styles.line} />
            )}
          </View>
        ))}
      </View>

      <View style={styles.alert}>
        <Text style={styles.alertIcon}>!</Text>
        <View style={styles.grow}>
          <Text style={styles.alertTitle}>1 critical alert</Text>
          <Text style={styles.rationale}>
            GitHub sync is waiting for deployment configuration.
          </Text>
        </View>
      </View>
      <Text style={styles.footer}>
        Raw source stays on your desktop · Veyebe 0.1
      </Text>
    </ScrollView>
  );
}

export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <AppContent />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#090C15",
    paddingTop: Platform.OS === "android" ? 24 : 0,
  },
  page: { padding: 20, paddingBottom: 56, gap: 12 },
  loading: {
    flex: 1,
    backgroundColor: "#090C15",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  muted: { color: "#687086" },
  eyebrowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  brand: {
    color: "#A98BFF",
    letterSpacing: 4,
    fontSize: 12,
    fontWeight: "900",
  },
  localBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10221E",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: "#67E8B5",
    marginRight: 6,
  },
  localText: {
    color: "#67E8B5",
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: "800",
  },
  project: {
    color: "#FAF8FF",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 14,
  },
  goal: { color: "#C2B9D2", fontSize: 16, lineHeight: 23, maxWidth: 330 },
  updated: { color: "#687086", fontSize: 12 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 26,
    marginBottom: 2,
  },
  kicker: {
    color: "#80748F",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  heading: { color: "#F4F1FF", fontSize: 21, fontWeight: "700" },
  count: { color: "#7E869A", fontSize: 12 },
  spacer: { height: 1 },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 5,
  },
  legendText: { color: "#687086", fontSize: 10 },
  approval: {
    backgroundColor: "#17132A",
    borderWidth: 1,
    borderColor: "#332957",
    padding: 17,
    borderRadius: 18,
    gap: 9,
    marginTop: 10,
  },
  numberBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#31264F",
    alignItems: "center",
    justifyContent: "center",
  },
  number: { color: "#CDBEFF", fontWeight: "800" },
  actionCard: {
    backgroundColor: "#121728",
    borderRadius: 18,
    padding: 17,
    gap: 9,
    borderWidth: 1,
    borderColor: "#1E263A",
  },
  actionTop: { flexDirection: "row", justifyContent: "space-between" },
  severity: {
    color: "#FFBA69",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  critical: { color: "#FF7584" },
  confidence: { color: "#727B90", fontSize: 10 },
  actionTitle: {
    color: "#F3F0FA",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
  rationale: { color: "#9BA3B6", fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", gap: 8, marginTop: 5 },
  primaryButton: {
    backgroundColor: "#8267E8",
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: 10,
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  primaryText: { color: "white", fontSize: 12, fontWeight: "800" },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: "#20263A",
    justifyContent: "center",
  },
  buttonText: { color: "#C7CDDA", fontSize: 12, fontWeight: "600" },
  disabledButton: { opacity: 0.6 },
  primaryButtonActive: { opacity: 0.85 },
  buttonActive: { opacity: 0.85 },
  empty: {
    color: "#7E869A",
    backgroundColor: "#111522",
    borderRadius: 14,
    padding: 18,
  },
  timeline: {
    backgroundColor: "#111522",
    borderRadius: 18,
    padding: 17,
    gap: 22,
  },
  milestone: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 10,
    backgroundColor: "#67E8B5",
    marginRight: 13,
    zIndex: 2,
  },
  plannedDot: {
    backgroundColor: "#111522",
    borderWidth: 2,
    borderColor: "#9B7CFF",
  },
  line: {
    position: "absolute",
    left: 4,
    top: 21,
    width: 1,
    height: 31,
    backgroundColor: "#30384B",
  },
  grow: { flex: 1 },
  milestoneTitle: { color: "#E7E4EF", fontSize: 14, fontWeight: "600" },
  meta: { color: "#6F788D", fontSize: 10, marginTop: 3 },
  date: { color: "#858EA2", fontSize: 11 },
  alert: {
    flexDirection: "row",
    backgroundColor: "#25151D",
    borderRadius: 16,
    padding: 15,
    alignItems: "center",
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#4B2733",
  },
  alertIcon: {
    color: "#FF7584",
    fontWeight: "900",
    fontSize: 18,
    marginRight: 14,
  },
  alertTitle: { color: "#FFDCE1", fontWeight: "700", marginBottom: 2 },
  footer: {
    color: "#535B6D",
    fontSize: 10,
    textAlign: "center",
    marginTop: 20,
  },
});
