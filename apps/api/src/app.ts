import cors from "@fastify/cors";
import compress from "@fastify/compress";
import Fastify, { type FastifyInstance } from "fastify";
import { assertCloudSafe, auditDerivedPayload, recommendationActionSchema, scanSyncSchema } from "@veyebe/sync";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { inferFeatures } from "./ai.js";
import { githubInstallationRequest, normalizeGitHubEvent, supportedGitHubEvents, verifyGitHubSignature } from "./github.js";
import type { AppStore } from "./store.js";

const idParam = z.object({ id: z.string().min(3).max(100).regex(/^[a-z][a-z0-9_-]*$/i) });
const pulseParams = z.object({
  workspaceId: z.string().min(3).max(100).regex(/^[a-z][a-z0-9_-]*$/i),
  projectId: z.string().min(3).max(100).regex(/^[a-z][a-z0-9_-]*$/i),
});
const installationParam = z.object({ installationId: z.coerce.number().int().positive() });
const issueRequest = z.object({
  installationId: z.number().int().positive(), owner: z.string().min(1).max(100), repository: z.string().min(1).max(100),
  title: z.string().min(1).max(240), body: z.string().max(5000),
}).strict();

export async function buildApp(config: AppConfig, store: AppStore): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });
  const rawBodies = new WeakMap<object, Buffer>();
  const authenticatedUsers = new WeakMap<object, string>();
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    try {
      rawBodies.set(request, body as Buffer);
      done(null, JSON.parse((body as Buffer).toString("utf8")));
    } catch (error) { done(error as Error, undefined); }
  });
  await app.register(cors, { origin: ["http://localhost", "http://127.0.0.1", "http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"] });
  await app.register(compress, { threshold: 1024 });
  app.addHook("onRequest", async (request, reply) => {
    const url = request.url;
    if (url === "/health" || url.startsWith("/v1/github/webhooks") || url === "/v1/privacy/audit" || url === "/v1/ai/features" || url.startsWith("/v1/github/installations") || url === "/v1/github/install-url" || url.startsWith("/v1/github/issues")) return;
    if (!config.SUPABASE_URL) return reply.code(503).send({ error: "authentication_not_configured" });
    const token = request.headers.authorization;
    if (!token?.startsWith("Bearer ")) return reply.code(401).send({ error: "authentication_required" });
    const response = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, { headers: { authorization: token, apikey: config.SUPABASE_ANON_KEY! } });
    if (!response.ok) return reply.code(401).send({ error: "invalid_session" });
    const user = await response.json() as { id?: string };
    if (!user.id) return reply.code(401).send({ error: "invalid_session" });
    authenticatedUsers.set(request, user.id);
  });

  app.get("/health", async () => ({ status: "ok", storage: config.SUPABASE_URL ? "supabase" : "memory", version: 1 }));

  app.post("/v1/privacy/audit", async (request) => {
    const findings = auditDerivedPayload(request.body);
    return { safe: findings.length === 0, findings };
  });

  app.post("/v1/ai/features", async (request, reply) => {
    try {
      assertCloudSafe(request.body);
      return await inferFeatures(config, request.body);
    } catch (error) {
      return reply.code(422).send({ error: "unsafe_or_invalid_context", message: (error as Error).message });
    }
  });

  app.get("/v1/github/install-url", async (_request, reply) => {
    if (!config.GITHUB_APP_SLUG) return reply.code(503).send({ error: "github_not_configured" });
    return { url: `https://github.com/apps/${config.GITHUB_APP_SLUG}/installations/new` };
  });

  app.get("/v1/github/installations/:installationId/repositories", async (request, reply) => {
    const params = installationParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_installation" });
    return githubInstallationRequest(config, params.data.installationId, "/installation/repositories");
  });

  app.post("/v1/github/issues", async (request, reply) => {
    const parsed = issueRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_issue", issues: parsed.error.flatten() });
    assertCloudSafe(parsed.data);
    const { installationId, owner, repository, title, body } = parsed.data;
    const result = await githubInstallationRequest(config, installationId, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, body }),
    });
    return reply.code(201).send(result);
  });

  app.get("/v1/workspaces/:workspaceId/projects/:projectId/pulse", async (request, reply) => {
    const params = pulseParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_pulse_request" });
    const userId = authenticatedUsers.get(request);
    if (!userId) return reply.code(401).send({ error: "authentication_required" });
    if (!await store.canAccessWorkspace(userId, params.data.workspaceId)) return reply.code(403).send({ error: "workspace_forbidden" });
    const pulse = await store.getProjectPulse(params.data.workspaceId, params.data.projectId);
    if (!pulse) return reply.code(404).send({ error: "project_not_found" });
    return pulse;
  });

  app.post("/v1/scans", async (request, reply) => {
    const parsed = scanSyncSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_scan", issues: parsed.error.flatten() });
    try { assertCloudSafe(parsed.data); } catch (error) {
      return reply.code(422).send({ error: "privacy_audit_failed", message: (error as Error).message });
    }
    const userId = authenticatedUsers.get(request);
    if (!userId) return reply.code(401).send({ error: "authentication_required" });
    if (!await store.canAccessWorkspace(userId, parsed.data.workspaceId)) return reply.code(403).send({ error: "workspace_forbidden" });
    await store.saveSnapshot(parsed.data);
    return reply.code(202).send({ accepted: true, snapshotId: parsed.data.snapshotId });
  });

  app.patch("/v1/recommendations/:id", async (request, reply) => {
    const params = idParam.safeParse(request.params);
    const body = recommendationActionSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_action" });
    const userId = authenticatedUsers.get(request);
    if (!userId) return reply.code(401).send({ error: "authentication_required" });
    const updated = await store.saveRecommendationAction({ recommendationId: params.data.id, ...body.data }, userId);
    if (!updated) return reply.code(403).send({ error: "recommendation_forbidden" });
    return { updated: true };
  });

  app.post("/v1/github/webhooks", async (request, reply) => {
    if (!config.GITHUB_WEBHOOK_SECRET) return reply.code(503).send({ error: "github_not_configured" });
    const body = rawBodies.get(request) ?? Buffer.from(JSON.stringify(request.body));
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    if (!verifyGitHubSignature(body, signature, config.GITHUB_WEBHOOK_SECRET)) return reply.code(401).send({ error: "invalid_signature" });
    const deliveryId = request.headers["x-github-delivery"] as string | undefined;
    const eventName = request.headers["x-github-event"] as string | undefined;
    if (!deliveryId || !eventName) return reply.code(400).send({ error: "missing_headers" });
    if (!supportedGitHubEvents.has(eventName)) return reply.code(202).send({ accepted: false, reason: "unsupported_event" });
    const normalized = normalizeGitHubEvent(eventName, request.body);
    assertCloudSafe(normalized);
    const accepted = await store.recordGitHubEvent(deliveryId, eventName, normalized);
    return reply.code(accepted ? 202 : 200).send({ accepted, duplicate: !accepted });
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.code(500).send({ error: "internal_error" });
  });
  return app;
}
