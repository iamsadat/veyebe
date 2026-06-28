import { describe, expect, it } from "vitest";
import type { ScanSnapshot } from "@veyebe/domain";
import { createOutboundPayloadPreview, redactSecrets } from "./privacy.js";

describe("privacy boundary", () => {
  it("redacts common credentials and local paths", () => {
    const snapshot = {
      id: "snapshot",
      projectId: "project",
      projectName: "Demo password=hunter2",
      goal: "Read C:\\Users\\alice\\private\\brief.md",
      analyzerVersion: "test",
      capabilities: [],
      metrics: { fileCount: 1, directoryCount: 1, totalLines: 2, totalBytes: 10, languages: [], git: { available: true, branch: "private-branch", head: "secret-sha" } },
      features: [],
      evidence: [{
        id: "evidence",
        kind: "code_entity",
        title: "API token=ghp_abcdefghijklmnopqrstuvwxyz",
        summary: "Stored at /Users/alice/private/index.ts",
        location: { relativePath: "private/nested/index.ts" },
        observedAt: "2026-06-27T00:00:00.000Z",
        confidence: 1,
        tags: ["typescript"],
      }],
      recommendations: [], graph: { nodes: [], edges: [] }, timeline: [],
      provenance: { scanner: "test", analyzerVersion: "test", scannedAt: "2026-06-27T00:00:00.000Z", sourceKind: "local", sourceFingerprint: "hash", durationMs: 1, incremental: false, warnings: [] },
    } satisfies ScanSnapshot;

    const preview = createOutboundPayloadPreview(snapshot);
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(serialized).not.toContain("Users\\alice");
    expect(serialized).not.toContain("private/nested");
    expect(serialized).not.toContain("private-branch");
    expect(preview.evidence[0]?.fileLabel).toBe("index.ts");
    expect(redactSecrets("token=sk-abcdefghijklmnopqrstuvwxyz")).toContain("[REDACTED]");
  });
});
