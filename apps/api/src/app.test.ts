import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { MemoryStore } from "./store.js";

const config: AppConfig = { PORT: 4317, HOST: "127.0.0.1", NODE_ENV: "test", AI_MODEL: "test", GITHUB_WEBHOOK_SECRET: "a-secret-long-enough" };

const samplePayload = {
  schemaVersion: 1 as const, snapshotId: "snapshot_abc123", workspaceId: "workspace_personal", projectId: "project_abc123",
  analyzerVersion: "0.1", capturedAt: new Date().toISOString(), projectName: "Demo", goal: "Ship the demo",
  capabilities: [{ id: "typescript" as const, detected: true }],
  metrics: { fileCount: 12, directoryCount: 3, totalLines: 200, totalBytes: 4000, languages: [{ language: "typescript" as const, files: 12, lines: 200, bytes: 4000 }], git: { available: false } },
  features: [{ id: "feature_ui", title: "UI", intent: "Build UI", state: "active" as const, confidence: 0.8 }],
  evidence: [{ id: "evidence_1", kind: "code_entity" as const, title: "App", summary: "Entry", tags: ["typescript"] }],
  provenance: { scanner: "local", incremental: false, durationMs: 20 },
};

describe("API", () => {
  it("reports health", async () => {
    const app = await buildApp(config, new MemoryStore());
    const result = await app.inject({ method: "GET", url: "/health" });
    expect(result.statusCode).toBe(200); expect(result.json()).toMatchObject({ status: "ok", storage: "memory" });
    await app.close();
  });

  it("accepts cloud-safe scan metadata and rejects unknown/raw keys", async () => {
    const app = await buildApp(config, new MemoryStore());
    expect((await app.inject({ method: "POST", url: "/v1/scans", payload: samplePayload })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/v1/scans", payload: { ...samplePayload, rawSource: "secret" } })).statusCode).toBe(400);
    await app.close();
  });

  it("returns project pulse after sync", async () => {
    const store = new MemoryStore();
    const app = await buildApp(config, store);
    await app.inject({ method: "POST", url: "/v1/scans", payload: samplePayload });
    const pulse = await app.inject({ method: "GET", url: "/v1/workspaces/workspace_personal/projects/project_abc123/pulse" });
    expect(pulse.statusCode).toBe(200);
    expect(pulse.json()).toMatchObject({ id: "project_abc123", features: expect.arrayContaining([expect.objectContaining({ id: "feature_ui" })]) });
    await app.close();
  });

  it("denies cross-workspace access in memory store", async () => {
    const store = new MemoryStore();
    store.workspaceMembers.set("workspace_b", new Set(["user_b"]));
    expect(await store.canAccessWorkspace("user_a", "workspace_b")).toBe(false);
    expect(await store.canAccessWorkspace("user_b", "workspace_b")).toBe(true);
  });

  it("authenticates and deduplicates GitHub deliveries", async () => {
    const app = await buildApp(config, new MemoryStore());
    const payload = { action: "opened", issue: { number: 4 } };
    const raw = JSON.stringify(payload);
    const signature = `sha256=${createHmac("sha256", config.GITHUB_WEBHOOK_SECRET!).update(raw).digest("hex")}`;
    const request = { method: "POST" as const, url: "/v1/github/webhooks", payload, headers: { "x-hub-signature-256": signature, "x-github-delivery": "delivery-1", "x-github-event": "issues" } };
    expect((await app.inject(request)).json()).toMatchObject({ accepted: true });
    expect((await app.inject(request)).json()).toMatchObject({ duplicate: true });
    await app.close();
  });

  it("attaches GitHub events as evidence for a linked repo", async () => {
    const store = new MemoryStore();
    const app = await buildApp(config, store);
    await app.inject({ method: "POST", url: "/v1/scans", payload: samplePayload });
    await store.linkGitHubRepo({ workspaceId: "workspace_personal", projectId: "project_abc123", owner: "acme", repository: "app" });
    const payload = { action: "opened", repository: { full_name: "acme/app", id: 1 }, issue: { number: 7, title: "Fix login", html_url: "https://example.com/i/7", state: "open" } };
    const signature = `sha256=${createHmac("sha256", config.GITHUB_WEBHOOK_SECRET!).update(JSON.stringify(payload)).digest("hex")}`;
    const response = await app.inject({ method: "POST", url: "/v1/github/webhooks", payload, headers: { "x-hub-signature-256": signature, "x-github-delivery": "delivery-ev-1", "x-github-event": "issues" } });
    expect(response.json()).toMatchObject({ accepted: true });
    const linked = [...store.evidence.values()].filter((item) => item.projectId === "project_abc123" && item.id.startsWith("gh-"));
    expect(linked.length).toBe(1);
    // an unlinked repo attaches nothing
    const other = { action: "opened", repository: { full_name: "someone/else", id: 2 }, issue: { number: 8, title: "No link", html_url: "https://example.com/i/8", state: "open" } };
    const sig2 = `sha256=${createHmac("sha256", config.GITHUB_WEBHOOK_SECRET!).update(JSON.stringify(other)).digest("hex")}`;
    await app.inject({ method: "POST", url: "/v1/github/webhooks", payload: other, headers: { "x-hub-signature-256": sig2, "x-github-delivery": "delivery-ev-2", "x-github-event": "issues" } });
    expect([...store.evidence.values()].filter((item) => item.id.startsWith("gh-")).length).toBe(1);
    await app.close();
  });
});
