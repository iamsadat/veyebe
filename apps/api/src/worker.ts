import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config.js";
import { processGitHubEvent } from "./jobs/github-event.js";
import { createStore } from "./store.js";

const config = loadConfig();
const MAX_ATTEMPTS = 3;

function log(level: "info" | "error", message: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...data }));
}

if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
  log("info", "Veyebe worker idle: configure Supabase to consume queued AI and GitHub jobs.");
} else {
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const store = createStore(config);

  const poll = async () => {
    const { data: jobs, error } = await client.rpc("claim_veyebe_jobs", { batch_size: 10 });
    if (error) { log("error", "Could not claim jobs", { errorCode: error.code, errorMessage: error.message }); return; }
    for (const job of jobs ?? []) {
      try {
        const payload = job.payload as { deliveryId?: string };
        if (job.kind === "github_event") {
          if (!payload.deliveryId) throw new Error("Missing deliveryId");
          await processGitHubEvent(store, payload.deliveryId);
          const [{ error: updateError }, { error: completionError }] = await Promise.all([
            client.from("github_events").update({ processed_at: new Date().toISOString() }).eq("delivery_id", payload.deliveryId),
            client.from("background_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id),
          ]);
          if (updateError) throw updateError;
          if (completionError) throw completionError;
        } else {
          throw new Error(`Unsupported job kind: ${job.kind}`);
        }
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

  log("info", "Veyebe worker ready: polling the Postgres-backed queue.");
  let pollInterval: NodeJS.Timeout | undefined;

  const shutdown = async () => {
    if (pollInterval) clearInterval(pollInterval);
    log("info", "Veyebe worker shutting down gracefully.");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  void poll();
  pollInterval = setInterval(() => void poll(), 3_000);
}
