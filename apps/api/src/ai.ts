import { assertCloudSafe } from "@veyebe/sync";
import { z } from "zod";
import type { AppConfig } from "./config.js";

const proposalSchema = z.object({ proposals: z.array(z.object({
  name: z.string().max(120), intent: z.string().max(1200), confidence: z.number().min(0).max(1),
  evidenceLabels: z.array(z.string().max(160)).max(20), acceptanceCriteria: z.array(z.string().max(400)).max(20),
}).strict()).max(50) }).strict();
export type FeatureProposals = z.infer<typeof proposalSchema>;

export async function inferFeatures(config: AppConfig, derivedContext: unknown): Promise<FeatureProposals> {
  assertCloudSafe(derivedContext);
  if (!config.AI_BASE_URL || !config.AI_API_KEY) return { proposals: [] };
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
