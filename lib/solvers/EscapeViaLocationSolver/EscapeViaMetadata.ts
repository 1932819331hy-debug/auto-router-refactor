/**
 * Persisted metadata for a generated escape via.
 */
export interface EscapeViaMetadata {
  pointId: string
  x: number
  y: number
  connectionName: string
  rootConnectionName: string
  sourcePointIndex: number
  sourcePointId?: string
  sourceLayer: string
  targetLayer: string
  targetPourKey: string
}
