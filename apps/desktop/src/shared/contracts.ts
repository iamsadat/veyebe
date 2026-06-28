import { z } from "zod";

export const FeatureStateSchema = z.enum([
  "proposed",
  "planned",
  "active",
  "needs_verification",
  "verified",
  "blocked",
  "parked",
]);
export type FeatureState = z.infer<typeof FeatureStateSchema>;

export const EvidenceSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "code_entity",
    "git_event",
    "check",
    "command_result",
    "document",
    "issue",
    "pull_request",
  ]),
  title: z.string(),
  detail: z.string(),
  location: z.string().optional(),
  verified: z.boolean(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FeatureSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  state: FeatureStateSchema,
  confidence: z.number().min(0).max(1),
  approved: z.boolean().default(false),
  dependencies: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  evidence: z.array(EvidenceSchema),
  position: z.tuple([z.number(), z.number(), z.number()]),
});
export type Feature = z.infer<typeof FeatureSchema>;

export const RecommendationSchema = z.object({
  id: z.string(),
  title: z.string(),
  rationale: z.string(),
  severity: z.enum(["critical", "attention", "opportunity"]),
  confidence: z.number().min(0).max(1),
  status: z.enum(["open", "accepted", "dismissed", "snoozed"]),
  suggestedAction: z.object({
    kind: z.string(),
    label: z.string(),
  }).optional(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const TimelineItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  date: z.string(),
  actual: z.boolean(),
});

export const ScanSnapshotSchema = z.object({
  projectId: z.string().optional(),
  projectName: z.string(),
  goal: z.string(),
  analyzedAt: z.string(),
  analyzerVersion: z.string(),
  capabilities: z.array(z.string()),
  metrics: z.object({
    files: z.number(),
    languages: z.number(),
    commits: z.number(),
  }),
  features: z.array(FeatureSchema),
  recommendations: z.array(RecommendationSchema).default([]),
  timeline: z.array(TimelineItemSchema).default([]),
  privacyPreview: z.unknown().optional(),
  provenance: z.object({
    source: z.enum(["demo", "local"]),
    redacted: z.boolean(),
  }),
});
export type ScanSnapshot = z.infer<typeof ScanSnapshotSchema>;

export const PickFolderResultSchema = z.object({
  canceled: z.boolean(),
  path: z.string().optional(),
});
export const ScanRequestSchema = z.object({
  path: z.string().min(1).max(4096),
});
export const ApproveFeatureSchema = z.object({ featureId: z.string().min(1) });
export const SyncPayloadSchema = z.object({
  bearerToken: z.string().optional(),
});
export const GitHubIssueSchema = z.object({
  recommendationId: z.string(),
  title: z.string().min(1).max(240),
  body: z.string().max(5000),
  installationId: z.number().int().positive().optional(),
  owner: z.string().optional(),
  repository: z.string().optional(),
});
export const DesktopApiSchema = z.object({ version: z.literal(1) });

export interface VeyebeDesktopApi {
  version: 1;
  pickFolder(): Promise<z.infer<typeof PickFolderResultSchema>>;
  scanFolder(path: string): Promise<ScanSnapshot>;
  approveFeature(featureId: string): Promise<ScanSnapshot>;
  syncApprovedPayload(bearerToken?: string): Promise<{ accepted: true; snapshotId: string }>;
  createGitHubIssue(input: z.infer<typeof GitHubIssueSchema>): Promise<{ url?: string; installUrl?: string }>;
  getGitHubInstallUrl(): Promise<{ url: string } | { error: string }>;
}
