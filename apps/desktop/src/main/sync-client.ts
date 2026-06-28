import { buildScanSyncPayload, postScan, type ScanSyncPayload } from '@veyebe/sync'
import type { ScanSnapshot } from '../shared/contracts'

function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

function mapMetrics(snapshot: ScanSnapshot): ScanSyncPayload['metrics'] {
  return {
    fileCount: snapshot.metrics.files,
    directoryCount: Math.max(1, Math.ceil(snapshot.metrics.files / 10)),
    totalLines: snapshot.metrics.files * 50,
    totalBytes: snapshot.metrics.files * 1024,
    languages: [{ language: 'typescript', files: snapshot.metrics.files, lines: snapshot.metrics.files * 50, bytes: snapshot.metrics.files * 1024 }],
    git: { available: snapshot.metrics.commits > 0, commitsLast30Days: snapshot.metrics.commits },
  }
}

function mapPreview(snapshot: ScanSnapshot) {
  const preview = snapshot.privacyPreview as Record<string, unknown> | undefined
  const projectId = snapshot.projectId ?? `project_${snapshot.projectName.toLowerCase().replace(/\W+/g, '_').slice(0, 40)}`
  if (preview && preview.schemaVersion === 1) {
    return {
      preview: preview as Parameters<typeof buildScanSyncPayload>[0],
      projectId: (preview.projectId as string) ?? projectId,
    }
  }
  return {
    projectId,
    preview: {
      schemaVersion: 1 as const,
      projectId,
      projectName: snapshot.projectName,
      goal: snapshot.goal,
      capabilities: snapshot.capabilities.map((id) => ({ id, detected: true })),
      metrics: mapMetrics(snapshot),
      features: snapshot.features.map((f) => ({
        id: f.id,
        title: f.title,
        intent: f.summary,
        state: f.state,
        confidence: f.confidence,
      })),
      evidence: snapshot.features.flatMap((f) =>
        f.evidence.map((e) => ({
          id: e.id,
          kind: e.kind,
          title: e.title,
          summary: e.detail,
          fileLabel: e.location?.split('/').pop(),
          tags: [],
        })),
      ),
    },
  }
}

export async function syncSnapshot(snapshot: ScanSnapshot, bearerToken?: string) {
  const apiUrl = env('VEYEBE_API_URL') ?? 'http://127.0.0.1:4317'
  const workspaceId = env('VEYEBE_WORKSPACE_ID') ?? 'workspace_personal'
  const { preview, projectId } = mapPreview(snapshot)
  const payload = buildScanSyncPayload(preview, {
    workspaceId,
    projectId,
    snapshotId: `snapshot_${projectId}_${Date.now()}`,
    capturedAt: snapshot.analyzedAt,
    analyzerVersion: snapshot.analyzerVersion,
    provenance: { scanner: 'desktop', incremental: false, durationMs: 0 },
  })
  const token = bearerToken ?? env('VEYEBE_BEARER_TOKEN')
  return postScan(apiUrl, token, payload)
}

export async function createGitHubIssue(input: {
  title: string
  body: string
  installationId?: number
  owner?: string
  repository?: string
}) {
  const apiUrl = env('VEYEBE_API_URL') ?? 'http://127.0.0.1:4317'
  const installationId = input.installationId ?? Number(env('GITHUB_INSTALLATION_ID'))
  const owner = input.owner ?? env('GITHUB_OWNER')
  const repository = input.repository ?? env('GITHUB_REPOSITORY')
  if (!installationId || !owner || !repository) {
    const install = await fetch(new URL('/v1/github/install-url', apiUrl))
    if (install.ok) {
      const data = await install.json() as { url: string }
      return { installUrl: data.url }
    }
    throw new Error('GitHub is not configured. Set GITHUB_INSTALLATION_ID, GITHUB_OWNER, and GITHUB_REPOSITORY.')
  }
  const response = await fetch(new URL('/v1/github/issues', apiUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installationId, owner, repository, title: input.title, body: input.body }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub issue failed (${response.status}): ${body}`)
  }
  const result = await response.json() as { html_url?: string }
  return { url: result.html_url }
}

export async function getGitHubInstallUrl() {
  const apiUrl = env('VEYEBE_API_URL') ?? 'http://127.0.0.1:4317'
  const response = await fetch(new URL('/v1/github/install-url', apiUrl))
  if (!response.ok) return { error: 'github_not_configured' as const }
  return response.json() as Promise<{ url: string }>
}
