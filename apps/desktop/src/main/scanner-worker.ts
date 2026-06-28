import { createOutboundPayloadPreview, scanProject } from '@veyebe/analyzer'
import type { Evidence as DomainEvidence, Recommendation as DomainRecommendation, TimelineEntry } from '@veyebe/domain'
import { ScanSnapshotSchema, type Evidence, type Feature } from '../shared/contracts'

function mapEvidence(item: DomainEvidence): Evidence {
  const kind = item.kind === 'configuration' ? 'code_entity' : item.kind
  return {
    id: item.id,
    kind,
    title: item.title,
    detail: item.summary,
    location: item.location?.relativePath ?? item.location?.url,
    verified: item.confidence >= 0.9 && !item.tags.includes('todo'),
  }
}

function mapRecommendation(item: DomainRecommendation) {
  const severity = item.severity === 'critical' || item.severity === 'high'
    ? 'critical' as const
    : item.severity === 'medium'
      ? 'attention' as const
      : 'opportunity' as const
  const status = item.status === 'completed' ? 'accepted' as const : item.status
  return {
    id: item.id, title: item.title, rationale: item.rationale, severity, confidence: item.confidence, status,
    suggestedAction: { kind: item.suggestedAction.kind, label: item.suggestedAction.label },
  }
}

function mapTimeline(item: TimelineEntry) {
  if (item.kind === 'activity') return {
    id: item.id, title: item.title, detail: 'Observed from local Git history',
    date: new Date(item.occurredAt).toLocaleString(), actual: true,
  }
  return {
    id: item.id, title: item.title, detail: 'Planned milestone · no fabricated delivery date',
    date: item.targetAt ? new Date(item.targetAt).toLocaleDateString() : 'Unscheduled', actual: false,
  }
}

async function analyze(root: string) {
  const snapshot = await scanProject(root)
  const evidenceById = new Map(snapshot.evidence.map((item) => [item.id, item]))
  const features: Feature[] = snapshot.features.map((feature, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, snapshot.features.length)
    const radius = 2.1 + (index % 2) * 0.7
    return {
      id: feature.id,
      title: feature.title,
      summary: feature.intent,
      state: feature.state,
      confidence: feature.confidence,
      approved: feature.approved,
      dependencies: feature.dependencies,
      acceptanceCriteria: feature.acceptanceCriteria.map((item) => item.description),
      evidence: feature.evidenceIds.flatMap((id) => {
        const item = evidenceById.get(id)
        return item ? [mapEvidence(item)] : []
      }),
      position: [Math.cos(angle) * radius, Math.sin(angle) * radius, (index % 3 - 1) * 0.35],
    }
  })
  return ScanSnapshotSchema.parse({
    projectId: snapshot.projectId,
    projectName: snapshot.projectName,
    goal: snapshot.goal,
    analyzedAt: snapshot.provenance.scannedAt,
    analyzerVersion: snapshot.analyzerVersion,
    capabilities: snapshot.capabilities.filter((item) => item.detected).map((item) => item.id),
    metrics: {
      files: snapshot.metrics.fileCount,
      languages: snapshot.metrics.languages.length,
      commits: snapshot.metrics.git.commitsLast30Days ?? 0,
    },
    features,
    recommendations: snapshot.recommendations.map(mapRecommendation),
    timeline: snapshot.timeline.map(mapTimeline),
    privacyPreview: createOutboundPayloadPreview(snapshot),
    provenance: { source: 'local', redacted: true },
  })
}

process.parentPort?.on('message', (event) => {
  const data = event.data as { id: string; path: string }
  void analyze(data.path)
    .then((result) => process.parentPort?.postMessage({ id: data.id, result }))
    .catch((error: unknown) => process.parentPort?.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Scan failed' }))
})
