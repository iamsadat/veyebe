import { z } from "zod";

export const progressStates = [
  "proposed", "planned", "active", "needs_verification", "verified", "blocked", "parked",
] as const;

const idSchema = z.string().min(3).max(100).regex(/^[a-z][a-z0-9_-]*$/i, "Opaque project-scoped ID required");
const languageSchema = z.enum(["typescript", "javascript", "python", "java", "go", "rust", "csharp", "other"]);
const capabilitySchema = z.enum([...languageSchema.options, "docker", "ci", "schema", "migrations", "tests", "git"]);

export const evidenceSchema = z.object({
  id: idSchema,
  kind: z.enum(["code_entity", "configuration", "git_event", "check", "command_result", "document", "issue", "pull_request"]),
  title: z.string().min(1).max(160),
  summary: z.string().max(1000),
  fileLabel: z.string().max(160).optional(),
  tags: z.array(z.string().max(80)).max(30),
}).strict();

export const featureSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(120),
  intent: z.string().min(1).max(1200),
  state: z.enum(progressStates),
  confidence: z.number().min(0).max(1),
}).strict();

const metricsSchema = z.object({
  fileCount: z.number().int().nonnegative(),
  directoryCount: z.number().int().nonnegative(),
  totalLines: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  languages: z.array(z.object({ language: languageSchema, files: z.number().int().nonnegative(), lines: z.number().int().nonnegative(), bytes: z.number().int().nonnegative() }).strict()).max(20),
  git: z.object({ available: z.boolean(), dirty: z.boolean().optional(), commitsLast30Days: z.number().int().nonnegative().optional() }).strict(),
}).strict();

export const scanSyncSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotId: idSchema,
  workspaceId: idSchema,
  projectId: idSchema,
  analyzerVersion: z.string().min(1).max(40),
  capturedAt: z.string().datetime(),
  projectName: z.string().min(1).max(160),
  goal: z.string().max(1000),
  capabilities: z.array(z.object({ id: capabilitySchema, detected: z.boolean() }).strict()).max(30),
  metrics: metricsSchema,
  features: z.array(featureSchema).max(500),
  evidence: z.array(evidenceSchema).max(5000),
  provenance: z.object({ scanner: z.string().max(80), incremental: z.boolean(), durationMs: z.number().nonnegative() }).strict(),
}).strict();

export type ScanSyncPayload = z.infer<typeof scanSyncSchema>;

export const recommendationActionSchema = z.object({
  status: z.enum(["accepted", "dismissed", "snoozed"]),
  snoozedUntil: z.string().datetime().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.status === "snoozed" && !value.snoozedUntil) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["snoozedUntil"], message: "Required when snoozing" });
  }
});

const forbiddenKey = /(?:raw.?source|source.?code|content|absolute.?path|raw.?output|secret|token|private.?key)/i;
const pathValue = /(?:[A-Za-z]:\\|\/(?:Users|home|var|private)\/)/;
const secretValue = /(?:gh[opusr]_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----|(?:api[_-]?key|token)\s*[:=]\s*\S+)/i;

export interface PrivacyFinding { path: string; reason: "forbidden-key" | "absolute-path" | "secret-pattern" }

export function auditDerivedPayload(value: unknown): PrivacyFinding[] {
  const findings: PrivacyFinding[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) return node.forEach((item, index) => visit(item, `${path}[${index}]`));
    if (node && typeof node === "object") {
      for (const [key, item] of Object.entries(node)) {
        const next = path ? `${path}.${key}` : key;
        if (forbiddenKey.test(key)) findings.push({ path: next, reason: "forbidden-key" });
        visit(item, next);
      }
      return;
    }
    if (typeof node === "string") {
      if (pathValue.test(node)) findings.push({ path, reason: "absolute-path" });
      if (secretValue.test(node)) findings.push({ path, reason: "secret-pattern" });
    }
  };
  visit(value, "");
  return findings;
}

export function assertCloudSafe(value: unknown): void {
  const findings = auditDerivedPayload(value);
  if (findings.length) throw new Error(`Payload failed privacy audit: ${findings.map((f) => `${f.path} (${f.reason})`).join(", ")}`);
}

export interface BuildScanSyncOptions {
  workspaceId: string;
  projectId: string;
  snapshotId?: string;
  capturedAt?: string;
}

/** Maps a privacy-reviewed outbound preview into the strict cloud sync envelope. */
export function buildScanSyncPayload(
  preview: {
    schemaVersion: 1;
    projectId: string;
    projectName: string;
    goal: string;
    capabilities: Array<{ id: string; detected: boolean }>;
    metrics: ScanSyncPayload["metrics"];
    features: Array<{ id: string; title: string; intent: string; state: (typeof progressStates)[number]; confidence: number }>;
    evidence: Array<{ id: string; kind: string; title: string; summary: string; fileLabel?: string; tags: string[] }>;
  },
  options: BuildScanSyncOptions & { analyzerVersion: string; provenance: ScanSyncPayload["provenance"] },
): ScanSyncPayload {
  const payload: ScanSyncPayload = {
    schemaVersion: 1,
    snapshotId: options.snapshotId ?? `snapshot_${preview.projectId}_${Date.now()}`,
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    analyzerVersion: options.analyzerVersion,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    projectName: preview.projectName,
    goal: preview.goal,
    capabilities: preview.capabilities.map((item) => ({
      id: item.id as ScanSyncPayload["capabilities"][number]["id"],
      detected: item.detected,
    })),
    metrics: preview.metrics,
    features: preview.features.map((item) => ({
      id: item.id,
      title: item.title,
      intent: item.intent,
      state: item.state,
      confidence: item.confidence,
    })),
    evidence: preview.evidence.map((item) => ({
      id: item.id,
      kind: item.kind as ScanSyncPayload["evidence"][number]["kind"],
      title: item.title,
      summary: item.summary,
      fileLabel: item.fileLabel,
      tags: item.tags,
    })),
    provenance: options.provenance,
  };
  return scanSyncSchema.parse(payload);
}

export interface PostScanResult { accepted: true; snapshotId: string }

export async function postScan(apiUrl: string, bearerToken: string | undefined, payload: ScanSyncPayload): Promise<PostScanResult> {
  assertCloudSafe(payload);
  const response = await fetch(new URL("/v1/scans", apiUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sync failed (${response.status}): ${body}`);
  }
  return response.json() as Promise<PostScanResult>;
}
