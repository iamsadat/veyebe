import { describe, expect, it } from 'vitest'
import { ScanSnapshotSchema } from '../shared/contracts'
import { demoSnapshot } from './demo'

describe('desktop demo contract', () => {
  it('is a valid redacted scan snapshot', () => {
    const parsed = ScanSnapshotSchema.parse(demoSnapshot)
    expect(parsed.provenance.redacted).toBe(true)
    expect(parsed.features.some(feature => feature.evidence.length > 0)).toBe(true)
  })
  it('uses explicit progress states instead of percentages', () => {
    expect(demoSnapshot.features.map(feature => feature.state)).toContain('needs_verification')
    expect(demoSnapshot.features.map(feature => feature.state)).toContain('blocked')
  })
})
