export type ISODateTime = string;

export type FeatureState =
  | "proposed"
  | "planned"
  | "active"
  | "needs_verification"
  | "verified"
  | "blocked"
  | "parked";

export type ProjectSource =
  | { kind: "local"; rootPath: string; displayName: string }
  | {
      kind: "github";
      owner: string;
      repository: string;
      defaultBranch?: string;
      installationId?: string;
    };

export type LanguageId =
  | "typescript"
  | "javascript"
  | "python"
  | "java"
  | "go"
  | "rust"
  | "csharp"
  | "other";

export interface LanguageMetric {
  language: LanguageId;
  files: number;
  lines: number;
  bytes: number;
}

export interface GitMetrics {
  available: boolean;
  branch?: string;
  head?: string;
  dirty?: boolean;
  commitsLast30Days?: number;
  lastCommitAt?: ISODateTime;
}

export interface ProjectMetrics {
  fileCount: number;
  directoryCount: number;
  totalLines: number;
  totalBytes: number;
  languages: LanguageMetric[];
  git: GitMetrics;
}

export type CapabilityId =
  | LanguageId
  | "docker"
  | "ci"
  | "schema"
  | "migrations"
  | "tests"
  | "git";

export interface ScanCapability {
  id: CapabilityId;
  detected: boolean;
  evidenceIds: string[];
}

export type EvidenceKind =
  | "code_entity"
  | "configuration"
  | "document"
  | "git_event"
  | "check"
  | "command_result"
  | "issue"
  | "pull_request";

export interface EvidenceLocation {
  /** Always repository-relative. Never an absolute device path. */
  relativePath?: string;
  lineStart?: number;
  lineEnd?: number;
  url?: string;
}

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  title: string;
  summary: string;
  location?: EvidenceLocation;
  observedAt: ISODateTime;
  confidence: number;
  tags: string[];
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
  verified: boolean;
  evidenceIds: string[];
}

export interface Feature {
  id: string;
  title: string;
  intent: string;
  state: FeatureState;
  confidence: number;
  approved: boolean;
  dependencies: string[];
  evidenceIds: string[];
  acceptanceCriteria: AcceptanceCriterion[];
}

export type GraphNodeKind = "goal" | "feature" | "module" | "evidence";

export interface ProjectGraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  state?: FeatureState;
  confidence?: number;
  evidenceId?: string;
  relativePath?: string;
}

export type ProjectGraphEdgeKind = "contains" | "supports" | "depends_on" | "evidences";

export interface ProjectGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: ProjectGraphEdgeKind;
  strength: number;
}

export interface ProjectGraph {
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
}

export type RecommendationSeverity = "info" | "low" | "medium" | "high" | "critical";
export type RecommendationStatus = "open" | "accepted" | "dismissed" | "snoozed" | "completed";
export type SuggestedActionKind =
  | "review_feature"
  | "verify_feature"
  | "add_tests"
  | "add_ci"
  | "inspect_change"
  | "create_github_issue";

export interface SuggestedAction {
  kind: SuggestedActionKind;
  label: string;
  featureId?: string;
}

export interface Recommendation {
  id: string;
  fingerprint: string;
  title: string;
  rationale: string;
  severity: RecommendationSeverity;
  confidence: number;
  evidenceIds: string[];
  status: RecommendationStatus;
  suggestedAction: SuggestedAction;
  createdAt: ISODateTime;
  snoozedUntil?: ISODateTime;
}

export type TimelineEntry =
  | {
      id: string;
      kind: "activity";
      occurredAt: ISODateTime;
      title: string;
      evidenceIds: string[];
    }
  | {
      id: string;
      kind: "milestone";
      title: string;
      targetAt?: ISODateTime;
      state: FeatureState;
      featureIds: string[];
    };

export interface ScanProvenance {
  scanner: string;
  analyzerVersion: string;
  scannedAt: ISODateTime;
  sourceKind: ProjectSource["kind"];
  /** Hash of the local root, never the root itself. */
  sourceFingerprint: string;
  durationMs: number;
  incremental: boolean;
  warnings: string[];
}

export interface ScanSnapshot {
  id: string;
  projectId: string;
  projectName: string;
  goal: string;
  analyzerVersion: string;
  capabilities: ScanCapability[];
  metrics: ProjectMetrics;
  features: Feature[];
  evidence: Evidence[];
  recommendations: Recommendation[];
  graph: ProjectGraph;
  timeline: TimelineEntry[];
  provenance: ScanProvenance;
}

export interface CommandProfile {
  id: string;
  label: string;
  executable: string;
  arguments: string[];
  workingDirectory: string;
  timeoutMs: number;
  environmentAllowlist: string[];
}

export interface CommandProfileValidation {
  valid: boolean;
  errors: string[];
}

export interface CommandRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  succeeded: boolean;
  observedAt: ISODateTime;
}

export interface FileFingerprint {
  relativePath: string;
  size: number;
  modifiedAtMs: number;
  sha256: string;
}

export interface IncrementalScanRecord {
  projectFingerprint: string;
  analyzerVersion: string;
  files: Record<string, FileFingerprint>;
  snapshot: ScanSnapshot;
}

export interface ScanCache {
  read(projectFingerprint: string): Promise<IncrementalScanRecord | undefined>;
  write(record: IncrementalScanRecord): Promise<void>;
}

export interface OutboundEvidenceSummary {
  id: string;
  kind: EvidenceKind;
  title: string;
  summary: string;
  /** Basename only, to avoid leaking directory structure. */
  fileLabel?: string;
  tags: string[];
}

export interface OutboundAnalysisPayload {
  schemaVersion: 1;
  projectId: string;
  projectName: string;
  goal: string;
  capabilities: Array<{ id: CapabilityId; detected: boolean }>;
  metrics: Omit<ProjectMetrics, "git"> & { git: Pick<GitMetrics, "available" | "dirty" | "commitsLast30Days"> };
  features: Array<Pick<Feature, "id" | "title" | "intent" | "state" | "confidence">>;
  evidence: OutboundEvidenceSummary[];
}

export interface ScenePosition {
  x: number;
  y: number;
  z: number;
}

export interface SceneNode extends ProjectGraphNode {
  position: ScenePosition;
  radius: number;
  brightness: number;
  motion: number;
  warningHalo: boolean;
}

export interface ProjectScene {
  nodes: SceneNode[];
  edges: ProjectGraphEdge[];
}
