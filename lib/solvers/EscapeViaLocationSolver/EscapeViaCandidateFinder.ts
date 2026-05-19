import { Point2 } from "../../math/index.ts"
import { Obstacle, RoutePoint } from "../../model/index.ts"
import type {
  ConnectionPoint,
  SerializedObstacle,
  SerializedSimpleRouteConnection,
} from "../../types/index.ts"
import { EscapeViaCandidate } from "./EscapeViaCandidate.ts"
import type { EscapeViaEnvironment } from "./EscapeViaEnvironment.ts"
import { PointOwner } from "./PointOwner.ts"
import { PointPlacementPlan } from "./PointPlacementPlan.ts"
import {
  ESCAPE_POINT_ID_PREFIX,
  GEOMETRIC_TOLERANCE,
  MAX_PROJECTED_FREE_SPACE_BONUS,
} from "./constants.ts"

/**
 * Builds ordered placement plans and selects the best escape-via candidate.
 */
export class EscapeViaCandidateFinder {
  private nextEscapeViaIndex = 0

  public constructor(
    private readonly params: {
      environment: EscapeViaEnvironment
      layerToZ: (layer: string) => number
      obstacleMargin: number
      requiredViaToViaClearance: number
    },
  ) {}

  public buildPointPlacementPlans(params: {
    mergedConnection: SerializedSimpleRouteConnection
    groupConnections: SerializedSimpleRouteConnection[]
    matchingCopperPours: SerializedObstacle[]
    connectionNetIds: Set<string>
  }): PointPlacementPlan[] {
    const {
      mergedConnection,
      groupConnections,
      matchingCopperPours,
      connectionNetIds,
    } = params

    const pointPlacementPlans: PointPlacementPlan[] = []

    for (const point of mergedConnection.pointsToConnect) {
      const pointOwner = this.selectPointOwner({
        point,
        groupConnections,
        matchingCopperPours,
      })
      if (!pointOwner) {
        continue
      }

      const sourceObstacle = RoutePoint.isSingleLayer(point)
        ? this.params.environment.selectSourceObstacle({
            point,
            sourceLayer: point.layer,
            connectionNetIds,
          })
        : undefined
      const candidateCount = RoutePoint.isSingleLayer(point)
        ? this.params.environment.getCandidatePositions(point, sourceObstacle)
            .length
        : 0

      pointPlacementPlans.push(
        new PointPlacementPlan(
          point,
          pointOwner,
          sourceObstacle,
          candidateCount,
        ),
      )
    }

    return pointPlacementPlans.sort((leftPlan, rightPlan) => {
      const priorityComparison = leftPlan.comparePriority(rightPlan)
      if (priorityComparison !== 0) {
        return priorityComparison
      }

      return leftPlan.pointOwner.pointIndex - rightPlan.pointOwner.pointIndex
    })
  }

  public findBestEscapeViaCandidate(params: {
    connection: SerializedSimpleRouteConnection
    point: ConnectionPoint
    pointIndex: number
    matchingCopperPours: SerializedObstacle[]
    connectionNetIds: Set<string>
    sourceObstacle?: SerializedObstacle
  }): EscapeViaCandidate | null {
    const {
      connection,
      point,
      pointIndex,
      matchingCopperPours,
      sourceObstacle: sourceObstacleOverride,
    } = params

    if (!RoutePoint.isSingleLayer(point)) {
      return null
    }

    const sourceLayer = point.layer
    const sourceZ = this.params.layerToZ(sourceLayer)
    const sourceObstacle =
      sourceObstacleOverride ??
      this.params.environment.selectSourceObstacle({
        point,
        sourceLayer,
        connectionNetIds: params.connectionNetIds,
      })
    const candidates = this.params.environment.getCandidatePositions(
      point,
      sourceObstacle,
    )

    let bestCandidate: EscapeViaCandidate | null = null

    for (const copperPour of matchingCopperPours) {
      const targetLayer = copperPour.layers[0]
      if (!targetLayer || targetLayer === sourceLayer) {
        continue
      }

      const targetZ = this.params.layerToZ(targetLayer)
      const targetPourKey = Obstacle.fromJson(copperPour).getKey()

      for (const candidate of candidates) {
        if (!this.params.environment.isInsideBoard(candidate)) continue
        if (!Obstacle.fromJson(copperPour).containsPointObject(candidate)) {
          continue
        }
        if (
          !this.params.environment.hasClearEscapePath({
            sourcePoint: point,
            candidate,
            sourceLayer,
            sourceObstacle,
          })
        ) {
          continue
        }

        const minClearance = this.params.environment.getMinBlockingClearance({
          candidate,
          sourceZ,
          targetZ,
        })
        if (minClearance + GEOMETRIC_TOLERANCE < this.params.obstacleMargin) {
          continue
        }

        const minPlacedEscapeViaClearance =
          this.params.environment.getMinPlacedEscapeViaClearance(candidate)
        if (
          minPlacedEscapeViaClearance + GEOMETRIC_TOLERANCE <
          this.params.obstacleMargin
        ) {
          continue
        }

        const projectedFreeSpace =
          this.params.environment.getProjectedFreeSpace({
            sourcePoint: point,
            candidate,
            sourceLayer,
            sourceObstacle,
          })
        const cappedProjectedFreeSpace = Math.min(
          projectedFreeSpace,
          MAX_PROJECTED_FREE_SPACE_BONUS,
        )
        const distanceToCandidate = Point2.from(point).distanceTo(candidate)
        const score =
          minClearance * 100 -
          distanceToCandidate -
          Math.abs(targetZ - sourceZ) * 0.5 +
          cappedProjectedFreeSpace * 2 +
          (Number.isFinite(minPlacedEscapeViaClearance)
            ? Math.min(
                minPlacedEscapeViaClearance,
                this.params.requiredViaToViaClearance,
              ) * 10
            : 0)

        const escapeViaCandidate = new EscapeViaCandidate(
          `${ESCAPE_POINT_ID_PREFIX}${connection.name}:${point.pointId ?? `p${pointIndex}`}:${targetLayer}:${this.nextEscapeViaIndex++}`,
          candidate.x,
          candidate.y,
          connection.name,
          connection.rootConnectionName ?? connection.name,
          pointIndex,
          point.pointId,
          sourceLayer,
          targetLayer,
          targetPourKey,
          score,
        )

        if (escapeViaCandidate.isBetterThan(bestCandidate)) {
          bestCandidate = escapeViaCandidate
        }
      }
    }

    return bestCandidate
  }

  private selectPointOwner(params: {
    point: ConnectionPoint
    groupConnections: SerializedSimpleRouteConnection[]
    matchingCopperPours: SerializedObstacle[]
  }): PointOwner | null {
    const { point, groupConnections, matchingCopperPours } = params
    const pointKey = RoutePoint.getKeyFromJson(point)

    const owners = groupConnections
      .map(
        (connection) =>
          new PointOwner(
            connection,
            connection.pointsToConnect.findIndex(
              (candidatePoint) =>
                RoutePoint.getKeyFromJson(candidatePoint) === pointKey,
            ),
          ),
      )
      .filter(
        (candidate): candidate is PointOwner => candidate.pointIndex !== -1,
      )

    if (owners.length === 0) {
      return null
    }

    owners.sort((leftOwner, rightOwner) => {
      const leftDirectMatch = matchingCopperPours.some((obstacle) =>
        this.params.environment.obstacleMatchesConnectionNet(
          obstacle,
          this.params.environment.getConnectionNetIds(leftOwner.connection),
        ),
      )
      const rightDirectMatch = matchingCopperPours.some((obstacle) =>
        this.params.environment.obstacleMatchesConnectionNet(
          obstacle,
          this.params.environment.getConnectionNetIds(rightOwner.connection),
        ),
      )
      if (leftDirectMatch !== rightDirectMatch) {
        return leftDirectMatch ? -1 : 1
      }

      return leftOwner.pointIndex - rightOwner.pointIndex
    })

    return owners[0]!
  }
}
