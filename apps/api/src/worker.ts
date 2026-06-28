import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config.js";
import { processGitHubEvent } from "./jobs/github-event.js";
import { createStore } from "./store.js";

const config = loadConfig();
const MAX_ATTEMPTS = 3;

if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
  console.info("Veyebe worker idle: configure Supabase to consume queued AI and GitHub jobs.");
} else {
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const store = createStore(config);

  const poll = async () => {
    const { data: jobs, error } = await client.rpc("claim_veyebe_jobs", { batch_size: 10 });
    if (error) { console.error("Could not claim jobs", error.message); return; }
    for (const job of jobs ?? []) {
      try {
        const payload = job.payload as { deliveryId?: string };
        if (job.kind === "github_event") {
          if (!payload.deliveryId) throw new Error("Missing deliveryId");
          await processGitHubEvent(store, payload.deliveryId);
          await client.from("github_events").update({ processed_at: new Date().toISOString() }).eq("delivery_id", payload.deliveryId);
        } else {
          throw new Error(`Unsupported job kind: ${job.kind}`);
        }
        const { error: completionError } = await client.from("background_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
        if (completionError) throw completionError;
      } catch (jobError) {
        const attempts = (job.attempts as number) ?? 1;
        const retry = attempts < MAX_ATTEMPTS;
        await client.from("background_jobs").update({
          status: retry ? "queued" : "failed",
          last_error: jobError instanceof Error ? jobError.message : "Unknown worker error",
          available_at: retry ? new Date(Date.now() + attempts * 5_000).toISOString() : undefined,
        }).eq("id", job.id);
      }
    }
  };

  console.info("Veyebe worker ready: polling the Postgres-backed queue.");
  void poll();
  setInterval(() => void poll(), 3_000);
}
