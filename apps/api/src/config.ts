import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4317),
  HOST: z.string().default("127.0.0.1"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(16).optional(),
  GITHUB_APP_ID: z.string().min(1).optional(),
  GITHUB_APP_SLUG: z.string().min(1).optional(),
  GITHUB_PRIVATE_KEY: z.string().min(1).optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).default("provider-default"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppConfig = z.infer<typeof configSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(env);
  if (Boolean(parsed.SUPABASE_URL) !== Boolean(parsed.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together");
  }
  if (parsed.SUPABASE_URL && !parsed.SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY is required when Supabase is configured");
  return parsed;
}
