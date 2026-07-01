import { assertCloudSafe } from "@veyebe/sync";
import { z } from "zod";
import type { AppConfig } from "./config.js";

const proposalSchema = z.object({ proposals: z.array(z.object({
  name: z.string().max(120), intent: z.string().max(1200), confidence: z.number().min(0).max(1),
  evidenceLabels: z.array(z.string().max(160)).max(20), acceptanceCriteria: z.array(z.string().max(400)).max(20),
}).strict()).max(50) }).strict();
export type FeatureProposals = z.infer<typeof proposalSchema>;

const truncate = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

// ponytail: heuristic stand-in for a real model call. Derives proposals from whatever
// shape the derived context happens to carry — never invents facts not present in it.
function heuristicProposals(derivedContext: unknown): FeatureProposals {
  const ctx = (derivedContext ?? {}) as Record<string, unknown>;
  const features = Array.isArray(ctx.features) ? (ctx.features as Array<Record<string, unknown>>) : [];
  const evidence = Array.isArray(ctx.evidence) ? (ctx.evidence as Array<Record<string, unknown>>) : [];
  const evidenceLabels = evidence
    .map((item) => (typeof item.title === "string" ? item.title : undefined))
    .filter((label): label is string => !!label)
    .slice(0, 20)
    .map((label) => truncate(label, 160));

  const proposals: FeatureProposals["proposals"] = features
    .filter((item): item is Record<string, unknown> & { title: string } => typeof item.title === "string")
    .slice(0, 3)
    .map((item) => ({
      name: truncate(item.title, 120),
      intent: truncate(typeof item.intent === "string" && item.intent ? item.intent : `Confirm and harden "${item.title}".`, 1200),
      confidence: Math.max(0, Math.min(0.6, typeof item.confidence === "number" ? item.confidence : 0.3)),
      evidenceLabels,
      acceptanceCriteria: [truncate(`Review "${item.title}" against current evidence and confirm intent.`, 400)],
    }));

  if (proposals.length === 0) {
    const metrics = ctx.metrics && typeof ctx.metrics === "object" ? (ctx.metrics as Record<string, unknown>) : undefined;
    const metricKeys = metrics ? Object.keys(metrics).slice(0, 5) : [];
    proposals.push({
      name: metricKeys.length ? "Address surfaced metrics" : "Establish project baseline",
      intent: metricKeys.length
        ? truncate(`Review project metrics (${metricKeys.join(", ")}) and turn them into a concrete feature.`, 1200)
        : "No specific derived signals were available; capture a baseline feature to seed future proposals.",
      confidence: 0.15,
      evidenceLabels,
      acceptanceCriteria: ["Gather more project evidence to sharpen this proposal."],
    });
  }

  return proposalSchema.parse({ proposals });
}

export async function inferFeatures(config: AppConfig, derivedContext: unknown): Promise<FeatureProposals> {
  assertCloudSafe(derivedContext);
  if (!config.AI_BASE_URL || !config.AI_API_KEY) return heuristicProposals(derivedContext);
  const response = await fetch(new URL("chat/completions", config.AI_BASE_URL), {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.AI_API_KEY}` },
    body: JSON.stringify({ model: config.AI_MODEL, response_format: { type: "json_object" }, messages: [
      { role: "system", content: "Propose product features only from supplied derived metadata. Return JSON {proposals:[{name,intent,confidence,evidenceLabels,acceptanceCriteria}]}. Never claim unsupported facts." },
      { role: "user", content: JSON.stringify(derivedContext) },
    ] }),
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const wire = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return proposalSchema.parse(JSON.parse(wire.choices?.[0]?.message?.content ?? "{}"));
}
