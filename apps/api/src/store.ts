import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ScanSyncPayload } from "@veyebe/sync";
import type { AppConfig } from "./config.js";

export interface RecommendationAction { recommendationId: string; status: "accepted" | "dismissed" | "snoozed"; snoozedUntil?: string }

export interface GitHubEvidenceInput { id: string; workspaceId: string; projectId: string; kind: string; title: string; summary: string; observedAt: string }

export interface RepoLink { workspaceId: string; projectId: string }
export interface RepoLinkInput extends RepoLink { owner: string; repository: string }

// "owner/repo" -> { owner, repo }, lowercased. Undefined if it isn't a full name.
function splitRepo(fullName: string): { owner: string; repo: string } | undefined {
  const [owner, repo] = fullName.toLowerCase().split("/");
  return owner && repo ? { owner, repo } : undefined;
}

export interface ProjectPulse {
  id: string;
  name: string;
  goal: string;
  updatedLabel: string;
  features: Array<{ id: string; name: string; state: string; evidence: number; confidence: number; approved: boolean }>;
  recommendations: Array<{ id: string; title: string; rationale: string; confidence: number; severity: string; status: string }>;
  milestones: Array<{ id: string; title: string; date?: string; kind: "actual" | "planned" }>;
}

export interface AppStore {
  saveSnapshot(payload: ScanSyncPayload): Promise<void>;
  getProjectPulse(workspaceId: string, projectId: string): Promise<ProjectPulse | undefined>;
  saveRecommendationAction(action: RecommendationAction, userId?: string): Promise<boolean>;
  canAccessWorkspace(userId: string, workspaceId: string): Promise<boolean>;
  recordGitHubEvent(deliveryId: string, eventName: string, payload: unknown, workspaceId?: string): Promise<boolean>;
  getGitHubEvent(deliveryId: string): Promise<{ event_name: string; payload: unknown; workspace_id?: string } | undefined>;
  upsertGitHubEvidence(input: GitHubEvidenceInput): Promise<void>;
  resolveProjectByRepo(fullName: string): Promise<RepoLink | undefined>;
  linkGitHubRepo(input: RepoLinkInput): Promise<void>;
}

// ponytail: deterministic keyword-free heuristics over feature state/confidence — no ML, upgrade if product wants smarter ranking
function deriveInsights(payload: ScanSyncPayload): { recommendations: ProjectPulse["recommendations"]; milestones: ProjectPulse["milestones"] } {
  const recommendations: ProjectPulse["recommendations"] = [];
  const milestones: ProjectPulse["milestones"] = [];
  for (const feature of payload.features) {
    const { id, title, state, confidence } = feature;
    if (state === "blocked") {
      recommendations.push({ id: `rec-${id}`, title: `Unblock ${title}`, rationale: `${title} is blocked and needs attention.`, confidence, severity: "critical", status: "open" });
    } else if (state === "needs_verification") {
      recommendations.push({ id: `rec-${id}`, title: `Verify ${title}`, rationale: `${title} needs verification before it can be trusted.`, confidence, severity: "attention", status: "open" });
    } else if (confidence < 0.5 && (state === "proposed" || state === "planned")) {
      recommendations.push({ id: `rec-${id}`, title: `Clarify ${title}`, rationale: `${title} has low confidence and needs clarification.`, confidence, severity: "opportunity", status: "open" });
    }

    if (state === "verified") {
      milestones.push({ id: `ms-${id}`, title, date: payload.capturedAt, kind: "actual" });
    } else if (state === "active" || state === "planned") {
      milestones.push({ id: `ms-${id}`, title, kind: "planned" });
    }
  }
  return { recommendations: recommendations.slice(0, 12), milestones: milestones.slice(0, 12) };
}

function denormalizeSnapshot(store: MemoryStore, payload: ScanSyncPayload) {
  store.projects.set(`${payload.workspaceId}:${payload.projectId}`, {
    id: payload.projectId,
    workspaceId: payload.workspaceId,
    name: payload.projectName,
    goal: payload.goal,
    updatedAt: payload.capturedAt,
  });
  for (const feature of payload.features) {
    store.features.set(feature.id, {
      ...feature,
      workspaceId: payload.workspaceId,
      projectId: payload.projectId,
      approved: feature.state !== "proposed",
    });
  }
  for (const item of payload.evidence) {
    store.evidence.set(item.id, { ...item, workspaceId: payload.workspaceId, projectId: payload.projectId });
  }
}

export class MemoryStore implements AppStore {
  readonly snapshots = new Map<string, ScanSyncPayload>();
  readonly actions = new Map<string, RecommendationAction>();
  readonly deliveries = new Set<string>();
  readonly projects = new Map<string, { id: string; workspaceId: string; name: string; goal: string; updatedAt: string }>();
  readonly features = new Map<string, { id: string; workspaceId: string; projectId: string; title: string; intent: string; state: string; confidence: number; approved: boolean }>();
  readonly evidence = new Map<string, { id: string; workspaceId: string; projectId: string }>();
  readonly recommendations = new Map<string, { id: string; workspaceId: string; projectId: string; title: string; rationale: string; confidence: number; severity: string; status: string }>();
  readonly milestones = new Map<string, { id: string; workspaceId: string; projectId: string; title: string; date?: string; kind: "actual" | "planned" }>();
  readonly githubEvents = new Map<string, { event_name: string; payload: unknown; workspace_id?: string }>();
  readonly githubSources = new Map<string, RepoLink>();
  readonly workspaceMembers = new Map<string, Set<string>>();

  async saveSnapshot(payload: ScanSyncPayload): Promise<void> {
    this.snapshots.set(payload.snapshotId, payload);
    denormalizeSnapshot(this, payload);
    const insights = deriveInsights(payload);
    for (const rec of insights.recommendations) {
      this.recommendations.set(rec.id, { ...rec, workspaceId: payload.workspaceId, projectId: payload.projectId });
    }
    for (const ms of insights.milestones) {
      this.milestones.set(ms.id, { ...ms, workspaceId: payload.workspaceId, projectId: payload.projectId });
    }
  }

  async getProjectPulse(workspaceId: string, projectId: string): Promise<ProjectPulse | undefined> {
    const project = this.projects.get(`${workspaceId}:${projectId}`);
    const snapshot = [...this.snapshots.values()].find((item) => item.workspaceId === workspaceId && item.projectId === projectId);
    if (!project && !snapshot) return undefined;
    const evidenceCount = [...this.evidence.values()].filter((e) => e.projectId === projectId).length;
    const features = [...this.features.values()]
      .filter((item) => item.workspaceId === workspaceId && item.projectId === projectId)
      .map((item) => ({
        id: item.id,
        name: item.title,
        state: item.state,
        evidence: evidenceCount,
        confidence: item.confidence,
        approved: item.approved,
      }));
    const recommendations = [...this.recommendations.values()]
      .filter((r) => r.workspaceId === workspaceId && r.projectId === projectId && r.status !== "dismissed" && r.status !== "snoozed")
      .map(({ id, title, rationale, confidence, severity, status }) => ({ id, title, rationale, confidence, severity, status }));
    const milestones = [...this.milestones.values()]
      .filter((m) => m.workspaceId === workspaceId && m.projectId === projectId)
      .map(({ id, title, date, kind }) => ({ id, title, date, kind }));
    return {
      id: projectId,
      name: project?.name ?? snapshot?.projectName ?? projectId,
      goal: project?.goal ?? snapshot?.goal ?? "",
      updatedLabel: `Synced · ${new Date(project?.updatedAt ?? snapshot?.capturedAt ?? Date.now()).toLocaleString()}`,
      features,
      recommendations,
      milestones,
    };
  }

  async saveRecommendationAction(action: RecommendationAction, userId?: string): Promise<boolean> {
    this.actions.set(action.recommendationId, action);
    const rec = this.recommendations.get(action.recommendationId);
    if (rec) rec.status = action.status;
    return true;
  }
  async canAccessWorkspace(userId: string, workspaceId: string): Promise<boolean> {
    const members = this.workspaceMembers.get(workspaceId);
    return !members || members.has(userId);
  }
  async recordGitHubEvent(deliveryId: string, eventName: string, payload: unknown, workspaceId?: string): Promise<boolean> {
    if (this.deliveries.has(deliveryId)) return false;
    this.deliveries.add(deliveryId);
    this.githubEvents.set(deliveryId, { event_name: eventName, payload, workspace_id: workspaceId });
    return true;
  }
  async getGitHubEvent(deliveryId: string): Promise<{ event_name: string; payload: unknown; workspace_id?: string } | undefined> {
    return this.githubEvents.get(deliveryId);
  }
  async upsertGitHubEvidence(input: GitHubEvidenceInput): Promise<void> {
    this.evidence.set(input.id, { id: input.id, workspaceId: input.workspaceId, projectId: input.projectId });
  }
  async resolveProjectByRepo(fullName: string): Promise<RepoLink | undefined> {
    const parts = splitRepo(fullName);
    return parts ? this.githubSources.get(`${parts.owner}/${parts.repo}`) : undefined;
  }
  async linkGitHubRepo(input: RepoLinkInput): Promise<void> {
    this.githubSources.set(`${input.owner}/${input.repository}`.toLowerCase(), { workspaceId: input.workspaceId, projectId: input.projectId });
  }
}

class SupabaseStore implements AppStore {
  constructor(private readonly client: SupabaseClient) {}

  async saveSnapshot(payload: ScanSyncPayload): Promise<void> {
    const { error } = await this.client.from("scan_snapshots").upsert({
      id: payload.snapshotId, workspace_id: payload.workspaceId, project_id: payload.projectId, schema_version: payload.schemaVersion,
      analyzer_version: payload.analyzerVersion, captured_at: payload.capturedAt,
      capabilities: payload.capabilities, metrics: payload.metrics, provenance: payload.provenance,
      project_name: payload.projectName, goal: payload.goal, features: payload.features, evidence: payload.evidence,
    });
    if (error) throw error;

    await this.client.from("projects").upsert({
      id: payload.projectId, workspace_id: payload.workspaceId, name: payload.projectName, goal: payload.goal, updated_at: payload.capturedAt,
    });

    if (payload.features.length) {
      const { error: featureError } = await this.client.from("features").upsert(
        payload.features.map((feature) => ({
          id: feature.id, workspace_id: payload.workspaceId, project_id: payload.projectId,
          title: feature.title, intent: feature.intent, state: feature.state, confidence: feature.confidence,
          approved: feature.state !== "proposed", acceptance_criteria: [], dependency_ids: [],
        })),
      );
      if (featureError) throw featureError;
    }

    if (payload.evidence.length) {
      const { error: evidenceError } = await this.client.from("evidence").upsert(
        payload.evidence.map((item) => ({
          id: item.id, workspace_id: payload.workspaceId, project_id: payload.projectId,
          kind: item.kind, title: item.title, summary: item.summary,
          locator: item.fileLabel ? { fileLabel: item.fileLabel } : null,
          observed_at: payload.capturedAt, confidence: 1, tags: item.tags,
        })),
      );
      if (evidenceError) throw evidenceError;
    }

    const insights = deriveInsights(payload);
    if (insights.recommendations.length) {
      const { error: recError } = await this.client.from("recommendations").upsert(
        insights.recommendations.map((rec) => ({
          id: rec.id, workspace_id: payload.workspaceId, project_id: payload.projectId,
          title: rec.title, rationale: rec.rationale, confidence: rec.confidence, severity: rec.severity, status: rec.status,
        })),
      );
      if (recError) throw recError;
    }
    if (insights.milestones.length) {
      const { error: milestoneError } = await this.client.from("milestones").upsert(
        insights.milestones.map((ms) => ({
          id: ms.id, workspace_id: payload.workspaceId, project_id: payload.projectId,
          title: ms.title, target_at: ms.date ?? null, state: ms.kind === "actual" ? "verified" : "planned",
        })),
      );
      if (milestoneError) throw milestoneError;
    }

    await this.client.from("privacy_audit_log").insert({
      workspace_id: payload.workspaceId, project_id: payload.projectId, scan_id: payload.snapshotId,
      categories: ["scan_sync"], schema_version: payload.schemaVersion,
      byte_count: JSON.stringify(payload).length,
    });
  }

  async getProjectPulse(workspaceId: string, projectId: string): Promise<ProjectPulse | undefined> {
    const { data: project, error: projectError } = await this.client.from("projects").select("*").eq("workspace_id", workspaceId).eq("id", projectId).maybeSingle();
    if (projectError) throw projectError;
    if (!project) return undefined;

    const [{ data: features, error: featureError }, { data: recommendations, error: recError }, { data: milestones, error: milestoneError }] = await Promise.all([
      this.client.from("features").select("*").eq("workspace_id", workspaceId).eq("project_id", projectId),
      this.client.from("recommendations").select("*").eq("workspace_id", workspaceId).eq("project_id", projectId).eq("status", "open"),
      this.client.from("milestones").select("*").eq("workspace_id", workspaceId).eq("project_id", projectId),
    ]);
    if (featureError) throw featureError;
    if (recError) throw recError;
    if (milestoneError) throw milestoneError;

    return {
      id: projectId,
      name: project.name as string,
      goal: project.goal as string,
      updatedLabel: `Synced · ${new Date(project.updated_at as string).toLocaleString()}`,
      features: (features ?? []).map((item) => ({
        id: item.id as string,
        name: item.title as string,
        state: item.state as string,
        evidence: 0,
        confidence: item.confidence as number,
        approved: item.approved as boolean,
      })),
      recommendations: (recommendations ?? []).map((item) => ({
        id: item.id as string,
        title: item.title as string,
        rationale: item.rationale as string,
        confidence: item.confidence as number,
        severity: item.severity as string,
        status: item.status as string,
      })),
      milestones: (milestones ?? []).map((item) => ({
        id: item.id as string,
        title: item.title as string,
        date: item.target_at ? new Date(item.target_at as string).toLocaleDateString() : undefined,
        kind: item.state === "verified" ? "actual" as const : "planned" as const,
      })),
    };
  }

  async canAccessWorkspace(userId: string, workspaceId: string): Promise<boolean> {
    const { data, error } = await this.client.from("workspace_members").select("workspace_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async saveRecommendationAction(action: RecommendationAction, userId?: string): Promise<boolean> {
    if (userId) {
      const { data: recommendation, error: lookupError } = await this.client.from("recommendations").select("workspace_id").eq("id", action.recommendationId).maybeSingle();
      if (lookupError) throw lookupError;
      if (!recommendation || !await this.canAccessWorkspace(userId, recommendation.workspace_id as string)) return false;
    }
    const { error } = await this.client.from("recommendations").update({
      status: action.status, snoozed_until: action.snoozedUntil ?? null, acted_at: new Date().toISOString(),
    }).eq("id", action.recommendationId);
    if (error) throw error;
    return true;
  }

  async recordGitHubEvent(deliveryId: string, eventName: string, payload: unknown, workspaceId?: string): Promise<boolean> {
    const { error } = await this.client.from("github_events").insert({
      delivery_id: deliveryId, event_name: eventName, payload, workspace_id: workspaceId ?? null,
    });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw error;
  }

  async getGitHubEvent(deliveryId: string) {
    const { data, error } = await this.client.from("github_events").select("event_name,payload,workspace_id").eq("delivery_id", deliveryId).maybeSingle();
    if (error) throw error;
    return data ?? undefined;
  }

  async upsertGitHubEvidence(input: GitHubEvidenceInput): Promise<void> {
    const { error } = await this.client.from("evidence").upsert({
      id: input.id, workspace_id: input.workspaceId, project_id: input.projectId,
      kind: input.kind, title: input.title, summary: input.summary,
      observed_at: input.observedAt, confidence: 1, tags: [],
    });
    if (error) throw error;
  }

  async resolveProjectByRepo(fullName: string): Promise<RepoLink | undefined> {
    const parts = splitRepo(fullName);
    if (!parts) return undefined;
    const { data, error } = await this.client.from("project_sources")
      .select("workspace_id, project_id")
      .eq("kind", "github").eq("github_owner", parts.owner).eq("github_repository", parts.repo)
      .maybeSingle();
    if (error) throw error;
    return data ? { workspaceId: data.workspace_id as string, projectId: data.project_id as string } : undefined;
  }

  async linkGitHubRepo(input: RepoLinkInput): Promise<void> {
    const { error } = await this.client.from("project_sources").upsert({
      project_id: input.projectId, workspace_id: input.workspaceId, kind: "github",
      github_owner: input.owner.toLowerCase(), github_repository: input.repository.toLowerCase(),
    }, { onConflict: "project_id,kind" });
    if (error) throw error;
  }
}

export function createStore(config: AppConfig): AppStore {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) return new MemoryStore();
  return new SupabaseStore(createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }));
}
