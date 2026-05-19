import type { ConnectionPoint, SerializedObstacle } from "../../types/index.ts"
import type { PointOwner } from "./PointOwner.ts"

/**
 * Placement context for a point considered for escape-via insertion.
 */
export class PointPlacementPlan {
  public constructor(
    public readonly point: ConnectionPoint,
    public readonly pointOwner: PointOwner,
    public readonly sourceObstacle: SerializedObstacle | undefined,
    public readonly candidateCount: number,
  ) {}

  public getSourceObstacleArea(): number {
    return (
      (this.sourceObstacle?.width ?? 0) * (this.sourceObstacle?.height ?? 0)
    )
  }

  public comparePriority(other: PointPlacementPlan): number {
    if (this.candidateCount !== other.candidateCount) {
      return this.candidateCount - other.candidateCount
    }

    return this.getSourceObstacleArea() - other.getSourceObstacleArea()
  }
}
