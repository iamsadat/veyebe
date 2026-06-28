import type {
  Evidence,
  Feature,
  ProjectGraph,
  Recommendation,
  ScanCapability,
} from "@veyebe/domain";
import { stableId } from "./hash.js";

interface InferenceInput {
  projectId: string;
  projectName: string;
  scannedAt: string;
  capabilities: ScanCapability[];
  evidence: Evidence[];
  topLevelDirectories: string[];
  gitDirty?: boolean;
}

function relevantEvidence(evidence: Evidence[], tags: string[]): Evidence[] {
  return evidence.filter((item) => item.tags.some((tag) => tags.includes(tag))).slice(0, 12);
}

export function inferFeatures(input: InferenceInput): Feature[] {
  const proposals: Array<{ key: string; title: string; intent: string; tags: string[] }> = [];
  const has = (id: string) => input.capabilities.some((capability) => capability.id === id && capability.detected);
  const hasWeb = input.evidence.some((item) => item.tags.includes("web") || /(?:app|pages|components|frontend)/i.test(item.location?.relativePath ?? ""));
  const hasApi = input.evidence.some((item) => /(?:api|routes|controllers|server)/i.test(item.location?.relativePath ?? ""));

  if (hasWeb) proposals.push({ key: "ui", title: "Application experience", intent: "Deliver the user-facing application and its primary interaction flows.", tags: ["web", "source"] });
  if (hasApi) proposals.push({ key: "api", title: "Service API", intent: "Provide application services and stable request boundaries.", tags: ["api", "source"] });
  if (has("schema") || has("migrations")) proposals.push({ key: "data", title: "Data foundation", intent: "Maintain the project's persisted data model and its evolution.", tags: ["schema", "migrations"] });
  if (has("tests")) proposals.push({ key: "quality", title: "Quality verification", intent: "Continuously verify important project behavior.", tags: ["tests"] });
  if (has("docker") || has("ci")) proposals.push({ key: "delivery", title: "Delivery pipeline", intent: "Build and deliver the project through repeatable automation.", tags: ["docker", "ci"] });
  if (proposals.length === 0) proposals.push({ key: "core", title: "Core application", intent: `Deliver the central capabilities of ${input.projectName}.`, tags: ["source"] });

  return proposals.map((proposal) => {
    const matches = relevantEvidence(input.evidence, proposal.tags);
    const id = stableId("feature", `${input.projectId}:${proposal.key}`);
    return {
      id,
      title: proposal.title,
      intent: proposal.intent,
      state: matches.length > 0 ? "needs_verification" : "proposed",
      confidence: Math.min(0.92, 0.55 + matches.length * 0.04),
      approved: false,
      dependencies: [],
      evidenceIds: matches.map((item) => item.id),
      acceptanceCriteria: [{
        id: stableId("criterion", `${id}:review`),
        description: "Review the detected evidence and confirm this feature intent.",
        verified: false,
        evidenceIds: matches.map((item) => item.id),
      }],
    } satisfies Feature;
  });
}

export function inferRecommendations(input: InferenceInput, features: Feature[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const has = (id: string) => input.capabilities.some((capability) => capability.id === id && capability.detected);
  const push = (key: string, value: Omit<Recommendation, "id" | "fingerprint" | "createdAt" | "status">) => {
    const fingerprint = stableId("recommendation", `${input.projectId}:${key}`);
    recommendations.push({ ...value, id: fingerprint, fingerprint, status: "open", createdAt: input.scannedAt });
  };

  if (!has("tests")) push("missing-tests", {
    title: "Add a verification baseline",
    rationale: "No test files or test directories were detected, so feature behavior cannot yet be verified from repository evidence.",
    severity: "high",
    confidence: 0.9,
    evidenceIds: input.evidence.slice(0, 3).map((item) => item.id),
    suggestedAction: { kind: "add_tests", label: "Plan a first verification path" },
  });
  if (!has("ci")) push("missing-ci", {
    title: "Automate project checks",
    rationale: "No supported continuous-integration configuration was detected.",
    severity: "medium",
    confidence: 0.94,
    evidenceIds: [],
    suggestedAction: { kind: "add_ci", label: "Create a CI follow-up" },
  });
  if (input.gitDirty) push("dirty-worktree", {
    title: "Review uncommitted project changes",
    rationale: "The local Git worktree contains changes that are not represented in the activity timeline.",
    severity: "low",
    confidence: 1,
    evidenceIds: [],
    suggestedAction: { kind: "inspect_change", label: "Inspect local changes" },
  });
  for (const feature of features.filter((item) => !item.approved)) push(`review:${feature.id}`, {
    title: `Confirm “${feature.title}”`,
    rationale: "Veyebe inferred this feature from repository structure. Confirm its intent before it contributes to project state.",
    severity: "info",
    confidence: feature.confidence,
    evidenceIds: feature.evidenceIds,
    suggestedAction: { kind: "review_feature", label: "Review feature proposal", featureId: feature.id },
  });
  return recommendations;
}

export function buildGraph(projectId: string, projectName: string, features: Feature[], evidence: Evidence[], topLevelDirectories: string[] = []): ProjectGraph {
  const goalId = stableId("goal", projectId);
  const nodes: ProjectGraph["nodes"] = [{ id: goalId, kind: "goal", label: projectName }];
  const edges: ProjectGraph["edges"] = [];
  for (const directory of topLevelDirectories.slice(0, 12)) {
    const moduleId = stableId("module", `${projectId}:${directory}`);
    nodes.push({ id: moduleId, kind: "module", label: directory, relativePath: directory });
    edges.push({ id: stableId("edge", `${goalId}:${moduleId}`), source: goalId, target: moduleId, kind: "contains", strength: 0.6 });
  }
  for (const feature of features) {
    nodes.push({ id: feature.id, kind: "feature", label: feature.title, state: feature.state, confidence: feature.confidence });
    edges.push({ id: stableId("edge", `${goalId}:${feature.id}`), source: goalId, target: feature.id, kind: "contains", strength: 1 });
    for (const evidenceId of feature.evidenceIds.slice(0, 8)) {
      const item = evidence.find((candidate) => candidate.id === evidenceId);
      if (!item) continue;
      const nodeId = stableId("node", item.id);
      if (!nodes.some((node) => node.id === nodeId)) nodes.push({ id: nodeId, kind: "evidence", label: item.title, evidenceId: item.id, relativePath: item.location?.relativePath });
      edges.push({ id: stableId("edge", `${feature.id}:${nodeId}`), source: feature.id, target: nodeId, kind: "evidences", strength: item.confidence });
    }
  }
  return { nodes, edges };
}
