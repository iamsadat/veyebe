import type { AppStore } from "../store.js";

export async function processGitHubEvent(store: AppStore, deliveryId: string): Promise<void> {
  const event = await store.getGitHubEvent(deliveryId);
  if (!event) throw new Error(`GitHub event not found: ${deliveryId}`);

  const payload = event.payload as {
    repository?: { fullName?: string };
    subject?: { title?: string; url?: string; state?: string };
    action?: string;
  };

  // Normalized events become timeline evidence when a workspace is linked.
  if (event.workspace_id && payload.subject?.title) {
    // ponytail: repo->workspace/project linkage is a parked follow-up. Webhooks don't
    // set workspace_id today, so this path is dormant until that linkage exists — expected.
    const projectId = (payload.repository?.fullName ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "unlinked";
    await store.upsertGitHubEvidence({
      id: `gh-${deliveryId.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`,
      workspaceId: event.workspace_id,
      projectId,
      kind: `github_${event.event_name}`,
      title: payload.subject.title,
      summary: `${payload.subject.state ?? ""} ${payload.subject.url ?? ""}`.trim(),
      observedAt: new Date().toISOString(),
    });
  }
}
