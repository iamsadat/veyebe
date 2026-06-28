import path from "node:path";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import type {
  CapabilityId,
  Evidence,
  FileFingerprint,
  IncrementalScanRecord,
  LanguageMetric,
  ProjectSource,
  ScanCache,
  ScanCapability,
  ScanSnapshot,
} from "@veyebe/domain";
import { detectCapabilities, detectLanguage, isLikelyText } from "./detection.js";
import { hashFile, hashText, stableId } from "./hash.js";
import { inspectGit } from "./git.js";
import { buildGraph, inferFeatures, inferRecommendations } from "./inference.js";

export const ANALYZER_VERSION = "0.1.0";

const DEFAULT_IGNORES = new Set([
  ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build", "coverage", ".next", ".nuxt",
  ".expo", ".turbo", ".cache", "target", "bin", "obj", "__pycache__", ".venv", "venv", ".idea", ".vscode",
]);
const CAPABILITY_IDS: CapabilityId[] = [
  "typescript", "javascript", "python", "java", "go", "rust", "csharp", "docker", "ci", "schema", "migrations", "tests", "git",
];

interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  size: number;
  modifiedAtMs: number;
}

export interface ScanProjectOptions {
  projectId?: string;
  projectName?: string;
  goal?: string;
  cache?: ScanCache;
  maxFiles?: number;
  maxTextFileBytes?: number;
  includeGit?: boolean;
  now?: () => Date;
}

async function discover(root: string, maxFiles: number): Promise<{ files: DiscoveredFile[]; directoryCount: number; warnings: string[]; topLevelDirectories: string[] }> {
  const files: DiscoveredFile[] = [];
  const warnings: string[] = [];
  const topLevelDirectories: string[] = [];
  let directoryCount = 0;
  const visit = async (directory: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push(`Could not read ${path.relative(root, directory) || "."}: ${error instanceof Error ? error.message : "unknown error"}`);
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (DEFAULT_IGNORES.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) {
        warnings.push(`Skipped symbolic link: ${relativePath}`);
        continue;
      }
      if (entry.isDirectory()) {
        directoryCount += 1;
        if (depth === 0) topLevelDirectories.push(entry.name);
        await visit(absolutePath, depth + 1);
      } else if (entry.isFile()) {
        const details = await stat(absolutePath);
        files.push({ absolutePath, relativePath, size: details.size, modifiedAtMs: details.mtimeMs });
      }
    }
  };
  await visit(root, 0);
  if (files.length >= maxFiles) warnings.push(`Scan stopped at the ${maxFiles.toLocaleString()} file safety limit.`);
  return { files, directoryCount, warnings, topLevelDirectories };
}

function sameFiles(files: DiscoveredFile[], cached: IncrementalScanRecord | undefined): boolean {
  if (!cached || Object.keys(cached.files).length !== files.length || cached.analyzerVersion !== ANALYZER_VERSION) return false;
  return files.every((file) => {
    const previous = cached.files[file.relativePath];
    return previous?.size === file.size && previous.modifiedAtMs === file.modifiedAtMs;
  });
}

function evidenceFor(file: DiscoveredFile, capabilities: CapabilityId[], scannedAt: string): Evidence {
  const language = detectLanguage(file.relativePath);
  const isConfig = capabilities.some((item) => ["docker", "ci", "schema", "migrations"].includes(item));
  return {
    id: stableId("evidence", file.relativePath),
    kind: isConfig ? "configuration" : /readme|docs?\//i.test(file.relativePath) ? "document" : "code_entity",
    title: path.posix.basename(file.relativePath),
    summary: isConfig ? `Detected ${capabilities.join(", ")} project configuration.` : `Detected ${language === "other" ? "project" : language} file.`,
    location: { relativePath: file.relativePath },
    observedAt: scannedAt,
    confidence: 1,
    tags: [...new Set([language !== "other" ? language : "source", ...capabilities, /(?:app|pages|components|frontend)/i.test(file.relativePath) ? "web" : "", /(?:api|routes|controllers|server)/i.test(file.relativePath) ? "api" : ""].filter(Boolean))],
  };
}

async function deriveProjectName(root: string, supplied?: string): Promise<string> {
  if (supplied?.trim()) return supplied.trim();
  try {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { name?: unknown };
    if (typeof manifest.name === "string" && manifest.name.trim()) return manifest.name.trim();
  } catch { /* manifest is optional */ }
  return path.basename(root);
}

export async function scanProject(rootPath: string, options: ScanProjectOptions = {}): Promise<ScanSnapshot> {
  const startedAt = performance.now();
  const root = path.resolve(rootPath);
  const rootStats = await lstat(root);
  if (!rootStats.isDirectory()) throw new Error("Project root must be a directory.");
  if (rootStats.isSymbolicLink()) throw new Error("Project root cannot be a symbolic link.");

  const projectFingerprint = hashText(root.toLowerCase());
  const cached = await options.cache?.read(projectFingerprint);
  const discovered = await discover(root, options.maxFiles ?? 25_000);
  if (sameFiles(discovered.files, cached)) {
    const scannedAt = (options.now?.() ?? new Date()).toISOString();
    const snapshot: ScanSnapshot = {
      ...cached!.snapshot,
      provenance: {
        ...cached!.snapshot.provenance,
        scannedAt,
        durationMs: Math.round(performance.now() - startedAt),
        incremental: true,
        warnings: discovered.warnings,
      },
    };
    return snapshot;
  }

  const scannedAt = (options.now?.() ?? new Date()).toISOString();
  const projectName = await deriveProjectName(root, options.projectName);
  const projectId = options.projectId ?? stableId("project", projectFingerprint);
  const languageMap = new Map<string, LanguageMetric>();
  const detected = new Map<CapabilityId, string[]>();
  const evidence: Evidence[] = [];
  const fingerprints: Record<string, FileFingerprint> = {};
  let totalLines = 0;
  let totalBytes = 0;

  for (const file of discovered.files) {
    totalBytes += file.size;
    const capabilities = detectCapabilities(file.relativePath);
    for (const capability of capabilities) {
      const evidenceId = stableId("evidence", file.relativePath);
      detected.set(capability, [...(detected.get(capability) ?? []), evidenceId]);
    }
    const language = detectLanguage(file.relativePath);
    let lines = 0;
    if (file.size <= (options.maxTextFileBytes ?? 2_000_000) && isLikelyText(file.relativePath)) {
      const content = await readFile(file.absolutePath, "utf8");
      lines = content.length === 0 ? 0 : content.split(/\r?\n/).length;
      totalLines += lines;
    }
    if (language !== "other") {
      const metric = languageMap.get(language) ?? { language, files: 0, lines: 0, bytes: 0 };
      metric.files += 1;
      metric.lines += lines;
      metric.bytes += file.size;
      languageMap.set(language, metric);
    }
    if (capabilities.length > 0 || (language !== "other" && evidence.length < 500)) evidence.push(evidenceFor(file, capabilities, scannedAt));
    fingerprints[file.relativePath] = {
      relativePath: file.relativePath,
      size: file.size,
      modifiedAtMs: file.modifiedAtMs,
      sha256: await hashFile(file.absolutePath),
    };
  }

  const git = options.includeGit === false ? { metrics: { available: false as const }, timeline: [] } : await inspectGit(root);
  if (git.metrics.available) detected.set("git", []);
  const capabilities: ScanCapability[] = CAPABILITY_IDS.map((id) => ({ id, detected: detected.has(id), evidenceIds: detected.get(id) ?? [] }));
  const inferenceInput = { projectId, projectName, scannedAt, capabilities, evidence, topLevelDirectories: discovered.topLevelDirectories, gitDirty: git.metrics.dirty };
  const features = inferFeatures(inferenceInput);
  const recommendations = inferRecommendations(inferenceInput, features);
  const snapshotId = stableId("snapshot", `${projectId}:${Object.values(fingerprints).map((file) => file.sha256).join(":")}`);
  const source: ProjectSource = { kind: "local", rootPath: root, displayName: projectName };
  const snapshot: ScanSnapshot = {
    id: snapshotId,
    projectId,
    projectName,
    goal: options.goal ?? `Build and evolve ${projectName}.`,
    analyzerVersion: ANALYZER_VERSION,
    capabilities,
    metrics: {
      fileCount: discovered.files.length,
      directoryCount: discovered.directoryCount,
      totalLines,
      totalBytes,
      languages: [...languageMap.values()].sort((left, right) => right.bytes - left.bytes),
      git: git.metrics,
    },
    features,
    evidence,
    recommendations,
    graph: buildGraph(projectId, projectName, features, evidence, discovered.topLevelDirectories),
    timeline: git.timeline,
    provenance: {
      scanner: "veyebe-local-filesystem",
      analyzerVersion: ANALYZER_VERSION,
      scannedAt,
      sourceKind: source.kind,
      sourceFingerprint: projectFingerprint,
      durationMs: Math.round(performance.now() - startedAt),
      incremental: false,
      warnings: discovered.warnings,
    },
  };
  await options.cache?.write({ projectFingerprint, analyzerVersion: ANALYZER_VERSION, files: fingerprints, snapshot });
  return snapshot;
}
