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
    // Future: upsert evidence row from normalized GitHub metadata.
    void payload.repository?.fullName;
  }
}
