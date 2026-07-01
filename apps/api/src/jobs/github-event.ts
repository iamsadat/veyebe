import type { AppStore } from "../store.js";

export async function processGitHubEvent(store: AppStore, deliveryId: string): Promise<void> {
  const event = await store.getGitHubEvent(deliveryId);
  if (!event) throw new Error(`GitHub event not found: ${deliveryId}`);

  const payload = event.payload as {
    repository?: { fullName?: string };
    subject?: { title?: string; name?: string; url?: string; state?: string };
    action?: string;
  };

  // Resolve the repo to a linked project (project_sources). Only linked repos
  // produce evidence — an unlinked repo's events are recorded but attach to nothing.
  const fullName = payload.repository?.fullName;
  const title = payload.subject?.title ?? payload.subject?.name;
  if (!fullName || !title) return;
  const link = await store.resolveProjectByRepo(fullName);
  if (!link) return;

  await store.upsertGitHubEvidence({
    id: `gh-${deliveryId.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`,
    workspaceId: link.workspaceId,
    projectId: link.projectId,
    kind: `github_${event.event_name}`,
    title,
    summary: `${payload.subject?.state ?? ""} ${payload.subject?.url ?? ""}`.trim(),
    observedAt: new Date().toISOString(),
  });
}
