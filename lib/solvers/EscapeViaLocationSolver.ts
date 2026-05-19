import { BaseSolver } from "@tscircuit/solver-utils"

import { type LayerMapper, Obstacle, SimpleRouteJson } from "../domain/index.ts"
import type {
  ConnectionPoint,
  SerializedObstacle,
  SerializedSimpleRouteConnection,
  SerializedSimpleRouteJson,
  SingleLayerConnectionPoint,
  TerminalViaHint,
} from "../types/index.ts"

const GEOMETRIC_TOLERANCE = 1e-6
const ESCAPE_POINT_ID_PREFIX = "escape-via:"

type Point2D = { x: number; y: number }

/**
 * Configuration for escape-via point placement.
 */
export interface EscapeViaLocationSolverOptions {
  viaDiameter?: number
  minTraceWidth?: number
  obstacleMargin?: number
}

/**
 * Constructor params for the escape-via solver.
 */
export interface EscapeViaLocationSolverParams
  extends EscapeViaLocationSolverOptions {
  simpleRouteJson: SimpleRouteJson
}

/**
 * Places explicit escape-via connection points just outside single-layer
 * terminals so downstream routing can connect to a via location instead of
 * trying to route directly from the terminal body.
 *
 * This solver supports two sources of intent:
 * 1. explicit `terminalVia` hints already attached to points
 * 2. copper pours connected to the same net on another layer
 */
export class EscapeViaLocationSolver extends BaseSolver {
  private readonly inputSimpleRouteJson: SimpleRouteJson
  private readonly normalizedInputSerializedSimpleRouteJson: SerializedSimpleRouteJson
  private readonly layerMapper: LayerMapper
  private readonly viaDiameter: number
  private readonly minTraceWidth: number
  private readonly obstacleMargin: number
  private readonly escapeOffset: number
  private readonly outputConnections: SerializedSimpleRouteConnection[]
  private readonly outputObstacles: SerializedObstacle[]
  private outputSerializedSimpleRouteJsonValue?: SerializedSimpleRouteJson

  public constructor(private readonly params: EscapeViaLocationSolverParams) {
    super()

    this.inputSimpleRouteJson = params.simpleRouteJson
    const normalizedInput = this.inputSimpleRouteJson.toJson()
    this.normalizedInputSerializedSimpleRouteJson = normalizedInput
    this.layerMapper = this.inputSimpleRouteJson.layerMapper
    this.viaDiameter =
      params.viaDiameter ??
      this.inputSimpleRouteJson.getMinViaPadDiameter() ??
      this.inputSimpleRouteJson.minTraceWidth
    this.minTraceWidth =
      params.minTraceWidth ?? this.inputSimpleRouteJson.minTraceWidth
    this.obstacleMargin =
      params.obstacleMargin ??
      this.inputSimpleRouteJson.defaultObstacleMargin ??
      0.15
    this.escapeOffset =
      this.viaDiameter / 2 +
      Math.max(this.minTraceWidth / 2, this.obstacleMargin)
    this.outputConnections = structuredClone(normalizedInput.connections)
    this.outputObstacles = structuredClone(normalizedInput.obstacles)
    this.MAX_ITERATIONS = 1
  }

  /**
   * Performs one-shot escape-via placement.
   */
  public override _step(): void {
    const placements = new EscapeViaPlacementPlanner({
      routeJson: this.normalizedInputSerializedSimpleRouteJson,
      viaDiameter: this.viaDiameter,
      minTraceWidth: this.minTraceWidth,
      obstacleMargin: this.obstacleMargin,
      escapeOffset: this.escapeOffset,
      layerMapper: this.layerMapper,
    })

    for (const [
      connectionIndex,
      connection,
    ] of this.normalizedInputSerializedSimpleRouteJson.connections.entries()) {
      const clonedConnection = this.outputConnections[connectionIndex]
      if (!clonedConnection) {
        continue
      }

      for (const [pointIndex, point] of connection.pointsToConnect.entries()) {
        if (!this.isSingleLayerPoint(point)) {
          continue
        }

        const placement = placements.planPlacement({
          connection,
          point,
          pointIndex,
        })
        if (!placement) {
          continue
        }

        const duplicate = clonedConnection.pointsToConnect.some(
          (candidatePoint) =>
            this.isSingleLayerPoint(candidatePoint) &&
            candidatePoint.layer === placement.sourceLayer &&
            this.pointsMatch(candidatePoint, placement.candidate),
        )
        if (duplicate) {
          continue
        }

        clonedConnection.pointsToConnect.push({
          x: placement.candidate.x,
          y: placement.candidate.y,
          layer: placement.sourceLayer,
          pointId: placement.pointId,
          terminalVia: {
            toLayer: placement.targetLayer,
            viaDiameter: placement.viaDiameter,
          },
        })
        this.outputObstacles.push(this.createEscapeViaObstacle(placement))
      }
    }

    this.outputSerializedSimpleRouteJsonValue = {
      ...this.normalizedInputSerializedSimpleRouteJson,
      connections: this.outputConnections,
      obstacles: this.outputObstacles,
    }
    this.solved = true
  }

  /**
   * Returns the updated route document with escape-via points.
   *
   * @returns Route JSON after point placement.
   */
  public getOutputSerializedSimpleRouteJson(): SerializedSimpleRouteJson {
    if (!this.outputSerializedSimpleRouteJsonValue) {
      throw new Error("EscapeViaLocationSolver has not solved yet")
    }

    return structuredClone(this.outputSerializedSimpleRouteJsonValue)
  }

  /**
   * Returns the updated route document as a domain wrapper.
   *
   * @returns Route input after point placement.
   */
  public getOutputSimpleRouteJson(): SimpleRouteJson {
    return SimpleRouteJson.fromJson(this.getOutputSerializedSimpleRouteJson())
  }

  /**
   * Returns standardized pipeline output.
   *
   * @returns Solved route document.
   */
  public override getOutput(): SerializedSimpleRouteJson {
    return this.getOutputSerializedSimpleRouteJson()
  }

  /**
   * Returns reproducible constructor parameters for debugger downloads.
   *
   * @returns Constructor parameter tuple.
   */
  public override getConstructorParams(): [EscapeViaLocationSolverParams] {
    return [
      {
        ...this.params,
        simpleRouteJson: SimpleRouteJson.fromJson(
          this.inputSimpleRouteJson.toJson(),
        ),
      },
    ]
  }

  private createEscapeViaObstacle(
    placement: EscapeViaPlacement,
  ): SerializedObstacle {
    const sourceZ = this.layerMapper.toZ(placement.sourceLayer)
    const targetZ = this.layerMapper.toZ(placement.targetLayer)
    const minZ = Math.min(sourceZ, targetZ)
    const maxZ = Math.max(sourceZ, targetZ)
    const layers: string[] = []

    for (let z = minZ; z <= maxZ; z += 1) {
      layers.push(this.layerMapper.fromZ(z))
    }

    return {
      obstacleId: `escape-via-obstacle:${placement.pointId}`,
      type: "rect",
      layers,
      center: placement.candidate,
      width: placement.viaDiameter,
      height: placement.viaDiameter,
      connectedTo: Array.from(this.getConnectionNetIds(placement.connection)),
    }
  }

  private getConnectionNetIds(
    connection: SerializedSimpleRouteConnection,
  ): Set<string> {
    return new Set(
      [
        connection.name,
        connection.rootConnectionName,
        connection.netConnectionName,
        ...(connection.mergedConnectionNames ?? []),
      ].filter((value): value is string => typeof value === "string"),
    )
  }

  private isSingleLayerPoint(
    point: ConnectionPoint,
  ): point is SingleLayerConnectionPoint {
    return "layer" in point && typeof point.layer === "string"
  }

  private pointsMatch(a: Point2D, b: Point2D): boolean {
    return (
      Math.abs(a.x - b.x) <= GEOMETRIC_TOLERANCE &&
      Math.abs(a.y - b.y) <= GEOMETRIC_TOLERANCE
    )
  }
}

interface EscapeViaPlacement {
  pointId: string
  candidate: Point2D
  sourceLayer: string
  targetLayer: string
  viaDiameter: number
  connection: SerializedSimpleRouteConnection
}

/**
 * Owns candidate generation and validation for escape-via placement.
 */
class EscapeViaPlacementPlanner {
  private nextEscapeIndex = 0
  private readonly placedVias: EscapeViaPlacement[] = []

  public constructor(
    private readonly params: {
      routeJson: SerializedSimpleRouteJson
      viaDiameter: number
      minTraceWidth: number
      obstacleMargin: number
      escapeOffset: number
      layerMapper: LayerMapper
    },
  ) {}

  /**
   * Chooses an escape-via location for one single-layer point.
   *
   * @param params - Point placement request.
   * @returns Placement when a valid candidate exists.
   */
  public planPlacement(params: {
    connection: SerializedSimpleRouteConnection
    point: SingleLayerConnectionPoint
    pointIndex: number
  }): EscapeViaPlacement | null {
    const { connection, point, pointIndex } = params
    const targetHints = this.resolveTargetHints(connection, point)
    if (targetHints.length === 0) {
      return null
    }

    const sourceObstacle = this.findContainingObstacle(point, point.layer)
    const candidatePositions = this.getCandidatePositions(point, sourceObstacle)
    let bestPlacement: EscapeViaPlacement | null = null
    let bestScore = Number.NEGATIVE_INFINITY

    for (const targetHint of targetHints) {
      for (const candidate of candidatePositions) {
        if (!this.isInsideBoard(candidate)) {
          continue
        }
        if (!this.isCandidateInsideTargetRegion(candidate, targetHint)) {
          continue
        }
        if (!this.isPathClear(point, candidate, sourceObstacle)) {
          continue
        }
        if (!this.hasViaClearance(candidate, point.layer, targetHint.toLayer)) {
          continue
        }

        const score = this.scoreCandidate(point, candidate, targetHint)
        if (score <= bestScore) {
          continue
        }

        bestScore = score
        bestPlacement = {
          pointId: `${ESCAPE_POINT_ID_PREFIX}${connection.name}:${point.pointId ?? `p${pointIndex}`}:${targetHint.toLayer}:${this.nextEscapeIndex}`,
          candidate,
          sourceLayer: point.layer,
          targetLayer: targetHint.toLayer,
          viaDiameter: targetHint.viaDiameter ?? this.params.viaDiameter,
          connection,
        }
      }
    }

    if (bestPlacement) {
      this.nextEscapeIndex += 1
      this.placedVias.push(bestPlacement)
    }

    return bestPlacement
  }

  private resolveTargetHints(
    connection: SerializedSimpleRouteConnection,
    point: SingleLayerConnectionPoint,
  ): TerminalViaHint[] {
    const pointHint = point.terminalVia
    const hints = pointHint ? [pointHint] : []
    const connectionNetIds = this.getConnectionNetIds(connection)

    for (const obstacle of this.params.routeJson.obstacles) {
      if (!obstacle.isCopperPour) {
        continue
      }
      if (!obstacle.connectedTo.some((netId) => connectionNetIds.has(netId))) {
        continue
      }

      for (const layerName of obstacle.layers) {
        if (layerName !== point.layer) {
          hints.push({ toLayer: layerName })
        }
      }
    }

    return this.dedupeHints(hints, point.layer)
  }

  private dedupeHints(
    hints: TerminalViaHint[],
    sourceLayer: string,
  ): TerminalViaHint[] {
    const uniqueHints = new Map<string, TerminalViaHint>()

    for (const hint of hints) {
      if (hint.toLayer === sourceLayer) {
        continue
      }

      const key = `${hint.toLayer}:${hint.viaDiameter ?? "default"}`
      if (!uniqueHints.has(key)) {
        uniqueHints.set(key, hint)
      }
    }

    return Array.from(uniqueHints.values())
  }

  private getCandidatePositions(
    point: SingleLayerConnectionPoint,
    containingObstacle: Obstacle | undefined,
  ): Point2D[] {
    if (!containingObstacle) {
      return this.dedupePoints([
        { x: point.x + this.params.escapeOffset, y: point.y },
        { x: point.x - this.params.escapeOffset, y: point.y },
        { x: point.x, y: point.y + this.params.escapeOffset },
        { x: point.x, y: point.y - this.params.escapeOffset },
        {
          x: point.x + this.params.escapeOffset,
          y: point.y + this.params.escapeOffset,
        },
        {
          x: point.x + this.params.escapeOffset,
          y: point.y - this.params.escapeOffset,
        },
        {
          x: point.x - this.params.escapeOffset,
          y: point.y + this.params.escapeOffset,
        },
        {
          x: point.x - this.params.escapeOffset,
          y: point.y - this.params.escapeOffset,
        },
      ])
    }

    const obstacleBounds = containingObstacle.getBounds()
    const minX = obstacleBounds.minX
    const maxX = obstacleBounds.maxX
    const minY = obstacleBounds.minY
    const maxY = obstacleBounds.maxY
    const offset = this.params.escapeOffset

    return this.dedupePoints([
      { x: minX - offset, y: point.y },
      { x: maxX + offset, y: point.y },
      { x: point.x, y: minY - offset },
      { x: point.x, y: maxY + offset },
      { x: minX - offset, y: minY - offset },
      { x: minX - offset, y: maxY + offset },
      { x: maxX + offset, y: minY - offset },
      { x: maxX + offset, y: maxY + offset },
    ])
  }

  private dedupePoints(points: Point2D[]): Point2D[] {
    const deduped: Point2D[] = []

    for (const point of points) {
      if (
        deduped.some(
          (existingPoint) =>
            Math.abs(existingPoint.x - point.x) <= GEOMETRIC_TOLERANCE &&
            Math.abs(existingPoint.y - point.y) <= GEOMETRIC_TOLERANCE,
        )
      ) {
        continue
      }

      deduped.push(point)
    }

    return deduped
  }

  private isInsideBoard(point: Point2D): boolean {
    const radius = this.params.viaDiameter / 2
    const bounds = this.params.routeJson.bounds

    return (
      point.x >= bounds.minX + radius &&
      point.x <= bounds.maxX - radius &&
      point.y >= bounds.minY + radius &&
      point.y <= bounds.maxY - radius
    )
  }

  private isCandidateInsideTargetRegion(
    candidate: Point2D,
    targetHint: TerminalViaHint,
  ): boolean {
    const targetCopperPours = this.params.routeJson.obstacles
      .filter((obstacle) => obstacle.isCopperPour)
      .filter((obstacle) => obstacle.layers.includes(targetHint.toLayer))

    if (targetCopperPours.length === 0) {
      return true
    }

    return targetCopperPours.some((obstacle) =>
      Obstacle.fromJson(obstacle).containsPoint(candidate.x, candidate.y),
    )
  }

  private isPathClear(
    point: SingleLayerConnectionPoint,
    candidate: Point2D,
    sourceObstacle: Obstacle | undefined,
  ): boolean {
    for (const obstacle of this.params.routeJson.obstacles) {
      if (!obstacle.layers.includes(point.layer)) {
        continue
      }

      const wrappedObstacle = Obstacle.fromJson(obstacle)
      if (sourceObstacle && wrappedObstacle.id === sourceObstacle.id) {
        continue
      }

      if (this.segmentIntersectsObstacle(point, candidate, wrappedObstacle)) {
        return false
      }
    }

    return true
  }

  private segmentIntersectsObstacle(
    start: Point2D,
    end: Point2D,
    obstacle: Obstacle,
  ): boolean {
    const sampleCount = 12

    for (let step = 1; step <= sampleCount; step += 1) {
      const ratio = step / sampleCount
      const sampleX = start.x + (end.x - start.x) * ratio
      const sampleY = start.y + (end.y - start.y) * ratio
      if (obstacle.containsPoint(sampleX, sampleY)) {
        return true
      }
    }

    return false
  }

  private hasViaClearance(
    candidate: Point2D,
    sourceLayer: string,
    targetLayer: string,
  ): boolean {
    const sourceZ = this.params.layerMapper.toZ(sourceLayer)
    const targetZ = this.params.layerMapper.toZ(targetLayer)
    const minZ = Math.min(sourceZ, targetZ)
    const maxZ = Math.max(sourceZ, targetZ)
    const requiredRadius =
      this.params.viaDiameter / 2 + this.params.obstacleMargin / 2

    for (const obstacle of this.params.routeJson.obstacles) {
      const obstacleZs = this.getObstacleZs(obstacle)
      const overlapsViaSpan = obstacleZs.some((z) => z >= minZ && z <= maxZ)
      if (!overlapsViaSpan) {
        continue
      }

      const obstacleBounds = Obstacle.fromJson(obstacle).getBounds()
      const dx = Math.max(
        obstacleBounds.minX - candidate.x,
        0,
        candidate.x - obstacleBounds.maxX,
      )
      const dy = Math.max(
        obstacleBounds.minY - candidate.y,
        0,
        candidate.y - obstacleBounds.maxY,
      )
      const clearance = Math.hypot(dx, dy)

      if (clearance + GEOMETRIC_TOLERANCE < requiredRadius) {
        return false
      }
    }

    for (const placement of this.placedVias) {
      const dx = placement.candidate.x - candidate.x
      const dy = placement.candidate.y - candidate.y
      if (
        Math.hypot(dx, dy) + GEOMETRIC_TOLERANCE <
        this.params.viaDiameter + this.params.obstacleMargin
      ) {
        return false
      }
    }

    return true
  }

  private getObstacleZs(obstacle: SerializedObstacle): number[] {
    if (Array.isArray(obstacle.zLayers) && obstacle.zLayers.length > 0) {
      return [...obstacle.zLayers]
    }

    return obstacle.layers.map((layerName) =>
      this.params.layerMapper.toZ(layerName),
    )
  }

  private scoreCandidate(
    point: SingleLayerConnectionPoint,
    candidate: Point2D,
    targetHint: TerminalViaHint,
  ): number {
    const targetLayerPenalty =
      Math.abs(
        this.params.layerMapper.toZ(point.layer) -
          this.params.layerMapper.toZ(targetHint.toLayer),
      ) * 0.5
    const distancePenalty = Math.hypot(
      candidate.x - point.x,
      candidate.y - point.y,
    )

    return -(distancePenalty + targetLayerPenalty)
  }

  private findContainingObstacle(
    point: SingleLayerConnectionPoint,
    layerName: string,
  ): Obstacle | undefined {
    const connectionObstacles = this.params.routeJson.obstacles
      .filter((obstacle) => obstacle.layers.includes(layerName))
      .map((obstacle) => Obstacle.fromJson(obstacle))
      .filter((obstacle) => obstacle.containsPoint(point.x, point.y))
      .sort((leftObstacle, rightObstacle) => {
        const leftBounds = leftObstacle.getBounds()
        const rightBounds = rightObstacle.getBounds()
        const leftArea =
          (leftBounds.maxX - leftBounds.minX) *
          (leftBounds.maxY - leftBounds.minY)
        const rightArea =
          (rightBounds.maxX - rightBounds.minX) *
          (rightBounds.maxY - rightBounds.minY)
        return leftArea - rightArea
      })

    return connectionObstacles[0]
  }

  private getConnectionNetIds(
    connection: SerializedSimpleRouteConnection,
  ): Set<string> {
    return new Set(
      [
        connection.name,
        connection.rootConnectionName,
        connection.netConnectionName,
        ...(connection.mergedConnectionNames ?? []),
      ].filter((value): value is string => typeof value === "string"),
    )
  }
}
