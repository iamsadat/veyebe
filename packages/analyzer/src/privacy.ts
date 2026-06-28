import path from "node:path";
import type { OutboundAnalysisPayload, ScanSnapshot } from "@veyebe/domain";

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*[^\s,;]+/gi,
  /\bgh[pousr]_[a-zA-Z0-9]{20,}\b/g,
  /\bsk-[a-zA-Z0-9_-]{16,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/gi,
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, "[REDACTED]"), value);
}

function safeText(value: string): string {
  const redacted = redactSecrets(value);
  return redacted.replace(/[A-Za-z]:\\[^\s]+|\/(?:Users|home)\/[^\s]+/g, "[LOCAL_PATH]").slice(0, 500);
}

/** Explicit cloud boundary: derived summaries only, with local structure reduced to a basename. */
export function createOutboundPayloadPreview(snapshot: ScanSnapshot): OutboundAnalysisPayload {
  return {
    schemaVersion: 1,
    projectId: snapshot.projectId,
    projectName: safeText(snapshot.projectName),
    goal: safeText(snapshot.goal),
    capabilities: snapshot.capabilities.map(({ id, detected }) => ({ id, detected })),
    metrics: {
      fileCount: snapshot.metrics.fileCount,
      directoryCount: snapshot.metrics.directoryCount,
      totalLines: snapshot.metrics.totalLines,
      totalBytes: snapshot.metrics.totalBytes,
      languages: snapshot.metrics.languages,
      git: {
        available: snapshot.metrics.git.available,
        dirty: snapshot.metrics.git.dirty,
        commitsLast30Days: snapshot.metrics.git.commitsLast30Days,
      },
    },
    features: snapshot.features.map(({ id, title, intent, state, confidence }) => ({ id, title: safeText(title), intent: safeText(intent), state, confidence })),
    evidence: snapshot.evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: safeText(item.title),
      summary: safeText(item.summary),
      fileLabel: item.location?.relativePath ? path.posix.basename(item.location.relativePath.replaceAll("\\", "/")) : undefined,
      tags: item.tags,
    })),
  };
}
