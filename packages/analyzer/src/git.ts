import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitMetrics, TimelineEntry } from "@veyebe/domain";
import { stableId } from "./hash.js";

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    timeout: 4_000,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 512 * 1024,
  });
  return stdout.trim();
}

export async function inspectGit(root: string): Promise<{ metrics: GitMetrics; timeline: TimelineEntry[] }> {
  try {
    const inside = await git(root, ["rev-parse", "--is-inside-work-tree"]);
    if (inside !== "true") return { metrics: { available: false }, timeline: [] };
    const [branch, head, status, count, lastCommit, log] = await Promise.all([
      git(root, ["branch", "--show-current"]),
      git(root, ["rev-parse", "HEAD"]),
      git(root, ["status", "--porcelain"]),
      git(root, ["rev-list", "--count", "--since=30 days ago", "HEAD"]),
      git(root, ["log", "-1", "--format=%cI"]),
      git(root, ["log", "-15", "--format=%H%x1f%cI%x1f%s"]),
    ]);
    const timeline: TimelineEntry[] = log.split("\n").filter(Boolean).map((line) => {
      const [commit = "", occurredAt = "", title = "Commit"] = line.split("\x1f");
      return { id: stableId("activity", commit), kind: "activity", occurredAt, title, evidenceIds: [] };
    });
    return {
      metrics: {
        available: true,
        branch: branch || undefined,
        head,
        dirty: status.length > 0,
        commitsLast30Days: Number.parseInt(count, 10) || 0,
        lastCommitAt: lastCommit || undefined,
      },
      timeline,
    };
  } catch {
    return { metrics: { available: false }, timeline: [] };
  }
}
