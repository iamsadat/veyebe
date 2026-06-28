import { describe, expect, it } from "vitest";
import { auditDerivedPayload, buildScanSyncPayload, recommendationActionSchema } from "./index.js";

describe("privacy audit", () => {
  it("accepts derived project metadata", () => expect(auditDerivedPayload({ metrics: { files: 3 }, summary: "API needs tests" })).toEqual([]));
  it("finds raw data, paths and secrets", () => {
    const result = auditDerivedPayload({ sourceContent: "x", label: "C:\\Users\\me\\repo", note: "token=ghp_abcdefghijklmnopqrstuvwxyz" });
    expect(result.map((item) => item.reason)).toEqual(expect.arrayContaining(["forbidden-key", "absolute-path", "secret-pattern"]));
  });
});

describe("recommendation action", () => {
  it("requires a wake time for snooze", () => expect(recommendationActionSchema.safeParse({ status: "snoozed" }).success).toBe(false));
});

describe("buildScanSyncPayload", () => {
  it("maps preview metadata into the strict sync envelope", () => {
    const payload = buildScanSyncPayload(
      {
        schemaVersion: 1,
        projectId: "project_demo",
        projectName: "Demo",
        goal: "Ship",
        capabilities: [{ id: "typescript", detected: true }],
        metrics: {
          fileCount: 3, directoryCount: 1, totalLines: 30, totalBytes: 300,
          languages: [{ language: "typescript", files: 3, lines: 30, bytes: 300 }],
          git: { available: false },
        },
        features: [{ id: "feature_ui", title: "UI", intent: "Build UI", state: "active", confidence: 0.8 }],
        evidence: [{ id: "evidence_1", kind: "code_entity", title: "App", summary: "Entry", tags: ["typescript"] }],
      },
      {
        workspaceId: "workspace_personal",
        projectId: "project_demo",
        snapshotId: "snapshot_demo",
        analyzerVersion: "0.1.0",
        provenance: { scanner: "test", incremental: false, durationMs: 12 },
      },
    );
    expect(payload.snapshotId).toBe("snapshot_demo");
    expect(payload.features).toHaveLength(1);
  });
});
