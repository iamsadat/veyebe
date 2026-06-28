import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { IncrementalScanRecord, ScanCache } from "@veyebe/domain";
import { scanProject } from "./scanner.js";

const temporaryDirectories: string[] = [];

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "veyebe-analyzer-"));
  temporaryDirectories.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("scanProject", () => {
  it("detects the six baseline languages and generic project capabilities without Git", async () => {
    const root = await fixture({
      "package.json": JSON.stringify({ name: "polyglot-vibe" }),
      "src/app.ts": "export const app = true;\n",
      "src/legacy.js": "export default {};\n",
      "service/main.py": "print('local only')\n",
      "java/App.java": "class App {}\n",
      "go/main.go": "package main\n",
      "rust/lib.rs": "pub fn run() {}\n",
      "dotnet/Program.cs": "class Program {}\n",
      "Dockerfile": "FROM scratch\n",
      ".github/workflows/check.yml": "name: check\n",
      "db/schema.prisma": "model User { id Int @id }\n",
      "db/migrations/001.sql": "create table user(id int);\n",
      "tests/app.test.ts": "export {};\n",
    });

    const snapshot = await scanProject(root, { includeGit: false, now: () => new Date("2026-06-27T00:00:00.000Z") });
    for (const capability of ["typescript", "javascript", "python", "java", "go", "rust", "csharp", "docker", "ci", "schema", "migrations", "tests"]) {
      expect(snapshot.capabilities.find((item) => item.id === capability)?.detected, capability).toBe(true);
    }
    expect(snapshot.metrics.git).toEqual({ available: false });
    expect(snapshot.projectName).toBe("polyglot-vibe");
    expect(snapshot.features.length).toBeGreaterThan(0);
    expect(snapshot.graph.nodes.some((node) => node.kind === "goal")).toBe(true);
    expect(snapshot.evidence.every((item) => !path.isAbsolute(item.location?.relativePath ?? ""))).toBe(true);
  });

  it("produces evidence-backed gaps and uses metadata cache for an unchanged scan", async () => {
    const root = await fixture({ "src/index.ts": "export const hello = 'world';\n" });
    let record: IncrementalScanRecord | undefined;
    const cache: ScanCache = {
      read: async () => record,
      write: async (next) => { record = next; },
    };
    const first = await scanProject(root, { includeGit: false, cache });
    const second = await scanProject(root, { includeGit: false, cache });

    expect(first.recommendations.some((item) => item.suggestedAction.kind === "add_tests")).toBe(true);
    expect(first.recommendations.every((item) => item.evidenceIds.every((id) => first.evidence.some((evidence) => evidence.id === id)))).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.provenance.incremental).toBe(true);
  });

  it("skips generated dependency directories", async () => {
    const root = await fixture({ "src/index.ts": "export {};\n", "node_modules/pkg/index.js": "ignored\n", "dist/out.js": "ignored\n" });
    const snapshot = await scanProject(root, { includeGit: false });
    expect(snapshot.metrics.fileCount).toBe(1);
  });

  it("maps a TypeScript-only project without Git", async () => {
    const root = await fixture({
      "package.json": JSON.stringify({ name: "ts-only" }),
      "src/index.ts": "export const value = 1;\n",
    });
    const snapshot = await scanProject(root, { includeGit: false });
    expect(snapshot.capabilities.find((item) => item.id === "typescript")?.detected).toBe(true);
    expect(snapshot.features.length).toBeGreaterThan(0);
    expect(snapshot.recommendations.length).toBeGreaterThan(0);
  });

  it("maps a Python-only project without Git", async () => {
    const root = await fixture({
      "pyproject.toml": "[project]\nname = \"py-only\"\n",
      "app/main.py": "print('hello')\n",
    });
    const snapshot = await scanProject(root, { includeGit: false });
    expect(snapshot.capabilities.find((item) => item.id === "python")?.detected).toBe(true);
    expect(snapshot.features.length).toBeGreaterThan(0);
    expect(snapshot.recommendations.length).toBeGreaterThan(0);
  });

  it("builds module graph nodes for top-level directories", async () => {
    const root = await fixture({
      "src/index.ts": "export {};\n",
      "java/App.java": "class App {}\n",
      "go/main.go": "package main\n",
    });
    const snapshot = await scanProject(root, { includeGit: false });
    expect(snapshot.graph.nodes.some((node) => node.kind === "module")).toBe(true);
  });

  it("completes initial and incremental scans within budget", async () => {
    const root = await fixture({ "src/index.ts": "export const hello = 'world';\n".repeat(20) });
    const started = performance.now();
    let record: IncrementalScanRecord | undefined;
    const cache: ScanCache = {
      read: async () => record,
      write: async (next) => { record = next; },
    };
    await scanProject(root, { includeGit: false, cache });
    expect(performance.now() - started).toBeLessThan(60_000);
    const incrementalStarted = performance.now();
    await scanProject(root, { includeGit: false, cache });
    expect(performance.now() - incrementalStarted).toBeLessThan(5_000);
  });
});
