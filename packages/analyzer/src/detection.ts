import path from "node:path";
import type { CapabilityId, LanguageId } from "@veyebe/domain";

const extensions: Record<string, LanguageId> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".cs": "csharp",
};

export function detectLanguage(relativePath: string): LanguageId {
  return extensions[path.extname(relativePath).toLowerCase()] ?? "other";
}

export function detectCapabilities(relativePath: string): CapabilityId[] {
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  const name = path.posix.basename(normalized);
  const capabilities = new Set<CapabilityId>();
  const language = detectLanguage(normalized);
  if (language !== "other") capabilities.add(language);

  if (name === "dockerfile" || name.startsWith("dockerfile.") || name === "docker-compose.yml" || name === "docker-compose.yaml" || name === "compose.yml" || name === "compose.yaml") capabilities.add("docker");
  if (normalized.startsWith(".github/workflows/") || name === ".gitlab-ci.yml" || name === "jenkinsfile" || name === "azure-pipelines.yml") capabilities.add("ci");
  if (/(_test|\.test|\.spec)\.[a-z0-9]+$/.test(name) || normalized.includes("/tests/") || normalized.startsWith("tests/") || normalized.includes("/__tests__/")) capabilities.add("tests");
  if (/\.(sql|prisma)$/.test(name) || name === "schema.graphql" || name === "schema.rb") capabilities.add("schema");
  if (normalized.includes("/migrations/") || normalized.startsWith("migrations/") || normalized.includes("/migration/")) capabilities.add("migrations");
  return [...capabilities];
}

export function isLikelyText(relativePath: string): boolean {
  const extension = path.extname(relativePath).toLowerCase();
  return extensions[extension] !== undefined || [
    "", ".json", ".md", ".mdx", ".yml", ".yaml", ".toml", ".xml", ".gradle", ".properties",
    ".sql", ".prisma", ".graphql", ".dockerignore", ".gitignore", ".env.example",
  ].includes(extension);
}
