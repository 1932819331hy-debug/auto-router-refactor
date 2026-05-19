import type { EscapeViaMetadata } from "./EscapeViaMetadata.ts"

/**
 * Scored placement option for an escape via.
 */
export class EscapeViaCandidate implements EscapeViaMetadata {
  public constructor(
    public readonly pointId: string,
    public readonly x: number,
    public readonly y: number,
    public readonly connectionName: string,
    public readonly rootConnectionName: string,
    public readonly sourcePointIndex: number,
    public readonly sourcePointId: string | undefined,
    public readonly sourceLayer: string,
    public readonly targetLayer: string,
    public readonly targetPourKey: string,
    public readonly score: number,
  ) {}

  public isBetterThan(other: EscapeViaCandidate | null): boolean {
    return other === null || this.score > other.score
  }
}
