import { SimpleRouteJson } from "../domain/index.ts"
import type { ConnectionPoint } from "../types/index.ts"
import { NetToPointPairsSolver } from "./NetToPointPairsSolver.ts"

/**
 * Optimizes pair-expanded connections by allowing equivalent off-board points
 * to substitute for one another when that shortens the on-board route.
 */
export class NetToPointPairsSolver2_OffBoardConnection extends NetToPointPairsSolver {
  private readonly connectionPointDsu: {
    getGroup: (id: string) => string[]
  }
  private readonly connectionPointMap = new Map<string, ConnectionPoint>()

  public constructor(
    simpleRouteJson: SimpleRouteJson,
    colorMap: Record<string, string> = {},
  ) {
    const originalJson = simpleRouteJson.toJson()
    const allConnectionPoints = originalJson.connections.flatMap(
      (connection) => connection.pointsToConnect,
    )
    const connectionPointMap = new Map<string, ConnectionPoint>()

    for (const point of allConnectionPoints) {
      if (point.pointId) {
        connectionPointMap.set(point.pointId, point)
      }
    }

    const pointIds = allConnectionPoints
      .map((point) => point.pointId)
      .filter((pointId): pointId is string => typeof pointId === "string")

    const connectionPointDsu = new (class {
      private readonly parent = new Map<string, string>()

      public constructor(ids: ReadonlyArray<string>) {
        for (const id of ids) {
          this.parent.set(id, id)
        }
      }

      public find(id: string): string {
        const parentId = this.parent.get(id)
        if (!parentId) {
          throw new Error(`Unknown off-board point "${id}"`)
        }
        if (parentId === id) {
          return id
        }

        const rootId = this.find(parentId)
        this.parent.set(id, rootId)
        return rootId
      }

      public union(leftId: string, rightId: string): void {
        const leftRootId = this.find(leftId)
        const rightRootId = this.find(rightId)
        if (leftRootId !== rightRootId) {
          this.parent.set(rightRootId, leftRootId)
        }
      }

      public getGroup(id: string): string[] {
        const rootId = this.find(id)
        const group: string[] = []

        for (const memberId of this.parent.keys()) {
          if (this.find(memberId) === rootId) {
            group.push(memberId)
          }
        }

        return group
      }
    })(pointIds)

    const onBoardConnections = []
    for (const connection of originalJson.connections) {
      if (connection.isOffBoard) {
        const [sourcePoint, targetPoint] = connection.pointsToConnect
        if (sourcePoint?.pointId && targetPoint?.pointId) {
          connectionPointDsu.union(sourcePoint.pointId, targetPoint.pointId)
        }
      } else {
        onBoardConnections.push(connection)
      }
    }

    super(
      SimpleRouteJson.fromJson({
        ...originalJson,
        connections: onBoardConnections,
      }),
      colorMap,
    )
    this.connectionPointDsu = connectionPointDsu
    for (const [pointId, point] of connectionPointMap.entries()) {
      this.connectionPointMap.set(pointId, point)
    }
  }

  protected override mapPointPair(
    sourcePoint: ConnectionPoint,
    targetPoint: ConnectionPoint,
  ): [ConnectionPoint, ConnectionPoint] {
    if (!sourcePoint.pointId || !targetPoint.pointId) {
      return [sourcePoint, targetPoint]
    }

    const sourceCandidates = this.connectionPointDsu
      .getGroup(sourcePoint.pointId)
      .map((pointId) => this.connectionPointMap.get(pointId))
      .filter((point): point is ConnectionPoint => point !== undefined)
    const targetCandidates = this.connectionPointDsu
      .getGroup(targetPoint.pointId)
      .map((pointId) => this.connectionPointMap.get(pointId))
      .filter((point): point is ConnectionPoint => point !== undefined)

    let bestSourcePoint = sourcePoint
    let bestTargetPoint = targetPoint
    let minimumDistance = Number.POSITIVE_INFINITY

    for (const sourceCandidate of sourceCandidates) {
      for (const targetCandidate of targetCandidates) {
        const distance = Math.hypot(
          sourceCandidate.x - targetCandidate.x,
          sourceCandidate.y - targetCandidate.y,
        )
        if (distance < minimumDistance) {
          minimumDistance = distance
          bestSourcePoint = sourceCandidate
          bestTargetPoint = targetCandidate
        }
      }
    }

    return [bestSourcePoint, bestTargetPoint]
  }
}
