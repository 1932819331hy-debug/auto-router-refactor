import { LineSegment2, Point2, Polygon2 } from "../../math/index.ts"
import type { LayerMapper } from "../../model/index.ts"
import { Obstacle } from "../../model/index.ts"
import type {
  ConnectionPoint,
  SerializedObstacle,
  SerializedSimpleRouteConnection,
  SerializedSimpleRouteJson,
} from "../../types/index.ts"
import type { EscapeViaMetadata } from "./EscapeViaMetadata.ts"
import { GEOMETRIC_TOLERANCE } from "./constants.ts"

/**
 * Encapsulates geometric and obstacle queries used by the escape-via solver.
 */
export class EscapeViaEnvironment {
  public constructor(
    private readonly params: {
      routeJson: SerializedSimpleRouteJson
      layerMapper: LayerMapper
      viaDiameter: number
      viaRadius: number
      obstacleMargin: number
      escapeOffset: number
      requiredTraceClearance: number
      requiredViaToViaClearance: number
      createdEscapeVias: ReadonlyArray<EscapeViaMetadata>
    },
  ) {}

  public getConnectionNetIds(
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

  public obstacleMatchesConnectionNet(
    obstacle: SerializedObstacle,
    connectionNetIds: Set<string>,
  ): boolean {
    return obstacle.connectedTo.some((id) => connectionNetIds.has(id))
  }

  public createEscapeViaObstacle(params: {
    escapeVia: EscapeViaMetadata
    connectionNetIds: Set<string>
  }): SerializedObstacle {
    const { escapeVia, connectionNetIds } = params
    const { layers, zLayers } = this.getViaSpanLayers(
      escapeVia.sourceLayer,
      escapeVia.targetLayer,
    )

    return {
      obstacleId: `escape-via-obstacle:${escapeVia.pointId}`,
      type: "rect",
      layers,
      zLayers,
      center: {
        x: escapeVia.x,
        y: escapeVia.y,
      },
      width: this.params.viaDiameter,
      height: this.params.viaDiameter,
      connectedTo: Array.from(connectionNetIds),
    }
  }

  public selectSourceObstacle(params: {
    point: ConnectionPoint
    sourceLayer: string
    connectionNetIds: Set<string>
  }): SerializedObstacle | undefined {
    const { point, sourceLayer, connectionNetIds } = params
    return this.params.routeJson.obstacles
      .filter(
        (obstacle) =>
          !obstacle.isCopperPour &&
          obstacle.layers.includes(sourceLayer) &&
          Obstacle.fromJson(obstacle).containsPointObject(point),
      )
      .sort((leftObstacle, rightObstacle) => {
        const leftDirectHit =
          leftObstacle.connectedTo.includes(point.pointId ?? "") ||
          leftObstacle.connectedTo.includes(point.pcb_port_id ?? "") ||
          this.obstacleMatchesConnectionNet(leftObstacle, connectionNetIds)
        const rightDirectHit =
          rightObstacle.connectedTo.includes(point.pointId ?? "") ||
          rightObstacle.connectedTo.includes(point.pcb_port_id ?? "") ||
          this.obstacleMatchesConnectionNet(rightObstacle, connectionNetIds)
        if (leftDirectHit !== rightDirectHit) {
          return leftDirectHit ? -1 : 1
        }

        return (
          leftObstacle.width * leftObstacle.height -
          rightObstacle.width * rightObstacle.height
        )
      })[0]
  }

  public getCandidatePositions(
    point: ConnectionPoint,
    sourceObstacle?: SerializedObstacle,
  ): Point2[] {
    if (!sourceObstacle) {
      return this.dedupeCandidatePositions([
        new Point2(point.x + this.params.escapeOffset, point.y),
        new Point2(point.x - this.params.escapeOffset, point.y),
        new Point2(point.x, point.y + this.params.escapeOffset),
        new Point2(point.x, point.y - this.params.escapeOffset),
        new Point2(
          point.x + this.params.escapeOffset,
          point.y + this.params.escapeOffset,
        ),
        new Point2(
          point.x + this.params.escapeOffset,
          point.y - this.params.escapeOffset,
        ),
        new Point2(
          point.x - this.params.escapeOffset,
          point.y + this.params.escapeOffset,
        ),
        new Point2(
          point.x - this.params.escapeOffset,
          point.y - this.params.escapeOffset,
        ),
      ])
    }

    const bounds = Obstacle.fromJson(sourceObstacle).getBounds()
    const minX = bounds.minX
    const maxX = bounds.maxX
    const minY = bounds.minY
    const maxY = bounds.maxY
    const leftX = minX - this.params.escapeOffset
    const rightX = maxX + this.params.escapeOffset
    const bottomY = minY - this.params.escapeOffset
    const topY = maxY + this.params.escapeOffset
    const ySamples = this.getEdgeSamples(minY, maxY, point.y)
    const xSamples = this.getEdgeSamples(minX, maxX, point.x)
    const candidates: Point2[] = []

    for (const y of ySamples) {
      candidates.push(new Point2(leftX, y), new Point2(rightX, y))
    }
    for (const x of xSamples) {
      candidates.push(new Point2(x, bottomY), new Point2(x, topY))
    }

    return this.dedupeCandidatePositions(candidates)
  }

  public isInsideBoard(candidate: Point2): boolean {
    const withinBounds =
      candidate.x >=
        this.params.routeJson.bounds.minX + this.params.viaRadius &&
      candidate.x <=
        this.params.routeJson.bounds.maxX - this.params.viaRadius &&
      candidate.y >=
        this.params.routeJson.bounds.minY + this.params.viaRadius &&
      candidate.y <= this.params.routeJson.bounds.maxY - this.params.viaRadius
    if (!withinBounds) {
      return false
    }

    const outline = this.params.routeJson.outline
    if (outline && outline.length >= 3) {
      return Polygon2.fromPoints(outline).containsPointOrBoundary(
        candidate,
        GEOMETRIC_TOLERANCE,
      )
    }

    return true
  }

  public hasClearEscapePath(params: {
    sourcePoint: ConnectionPoint
    candidate: Point2
    sourceLayer: string
    sourceObstacle?: SerializedObstacle
  }): boolean {
    const { sourcePoint, candidate, sourceLayer, sourceObstacle } = params
    const outline = this.params.routeJson.outline
    if (outline && outline.length >= 3) {
      const crossesOutline = Polygon2.fromPoints(outline).crossesBoundary(
        new LineSegment2(sourcePoint, candidate),
        this.params.requiredTraceClearance,
        GEOMETRIC_TOLERANCE,
      )
      if (crossesOutline) {
        return false
      }
    }

    for (const obstacle of this.params.routeJson.obstacles) {
      if (obstacle === sourceObstacle) continue
      if (!obstacle.layers.includes(sourceLayer)) continue

      const obstacleModel = Obstacle.fromJson(obstacle)
      if (obstacleModel.containsPointObject(candidate)) {
        return false
      }

      const obstacleSegments = obstacleModel.getBoundarySegments()
      const minDistance = Math.min(
        ...obstacleSegments.map((segment) =>
          new LineSegment2(sourcePoint, candidate).getMinimumDistanceTo(
            segment,
            GEOMETRIC_TOLERANCE,
          ),
        ),
      )

      if (
        minDistance + GEOMETRIC_TOLERANCE <
        this.params.requiredTraceClearance
      ) {
        return false
      }
    }

    return true
  }

  public getProjectedFreeSpace(params: {
    sourcePoint: ConnectionPoint
    candidate: Point2
    sourceLayer: string
    sourceObstacle?: SerializedObstacle
  }): number {
    const { sourcePoint, candidate } = params
    const dx = candidate.x - sourcePoint.x
    const dy = candidate.y - sourcePoint.y

    if (
      Math.abs(dx) <= GEOMETRIC_TOLERANCE ||
      Math.abs(dy) <= GEOMETRIC_TOLERANCE
    ) {
      return this.getProjectedFreeSpaceAlongDirection({
        ...params,
        direction: new Point2(dx, dy),
        travelDistance: Point2.from(sourcePoint).distanceTo(candidate),
      })
    }

    return Math.min(
      this.getProjectedFreeSpaceAlongDirection({
        ...params,
        direction: new Point2(0, Math.sign(dy)),
        travelDistance: Math.abs(dy),
      }),
      this.getProjectedFreeSpaceAlongDirection({
        ...params,
        direction: new Point2(Math.sign(dx), Math.sign(dy)),
        travelDistance: Point2.from(sourcePoint).distanceTo(candidate),
      }),
      this.getProjectedFreeSpaceAlongDirection({
        ...params,
        direction: new Point2(Math.sign(dx), 0),
        travelDistance: Math.abs(dx),
      }),
    )
  }

  public getMinBlockingClearance(params: {
    candidate: Point2
    sourceZ: number
    targetZ: number
  }): number {
    const { candidate, sourceZ, targetZ } = params
    const spanMinZ = Math.min(sourceZ, targetZ)
    const spanMaxZ = Math.max(sourceZ, targetZ)
    let minClearance = Number.POSITIVE_INFINITY

    for (const obstacle of this.params.routeJson.obstacles) {
      const obstacleZs = this.getObstacleZs(obstacle)
      if (!obstacleZs.some((z) => z >= spanMinZ && z <= spanMaxZ)) {
        continue
      }

      if (obstacle.isCopperPour && !obstacleZs.includes(sourceZ)) {
        continue
      }

      const clearance =
        Obstacle.fromJson(obstacle).getPointToBoundsDistance(candidate) -
        this.params.viaRadius
      minClearance = Math.min(minClearance, clearance)

      if (minClearance + GEOMETRIC_TOLERANCE < this.params.obstacleMargin) {
        return minClearance
      }
    }

    return minClearance
  }

  public getMinPlacedEscapeViaClearance(candidate: Point2): number {
    let minClearance = Number.POSITIVE_INFINITY

    for (const existingEscapeVia of this.params.createdEscapeVias) {
      const clearance =
        candidate.distanceTo(existingEscapeVia) - this.params.viaDiameter
      minClearance = Math.min(minClearance, clearance)
      if (minClearance + GEOMETRIC_TOLERANCE < this.params.obstacleMargin) {
        return minClearance
      }
    }

    return minClearance
  }

  private getObstacleZs(obstacle: SerializedObstacle): number[] {
    if (obstacle.zLayers && obstacle.zLayers.length > 0) {
      return [...obstacle.zLayers]
    }

    return obstacle.layers.map((layer) => this.params.layerMapper.toZ(layer))
  }

  private getViaSpanLayers(
    sourceLayer: string,
    targetLayer: string,
  ): {
    layers: string[]
    zLayers: number[]
  } {
    const sourceZ = this.params.layerMapper.toZ(sourceLayer)
    const targetZ = this.params.layerMapper.toZ(targetLayer)
    const minZ = Math.min(sourceZ, targetZ)
    const maxZ = Math.max(sourceZ, targetZ)
    const zLayers = Array.from(
      { length: maxZ - minZ + 1 },
      (_, index) => minZ + index,
    )

    return {
      zLayers,
      layers: zLayers.map((z) => this.params.layerMapper.fromZ(z)),
    }
  }

  private dedupeCandidatePositions(candidates: Point2[]): Point2[] {
    const deduped: Point2[] = []

    for (const candidate of candidates) {
      if (
        deduped.some((existing) =>
          existing.matches(candidate, GEOMETRIC_TOLERANCE),
        )
      ) {
        continue
      }

      deduped.push(candidate)
    }

    return deduped
  }

  private pushEdgeSample(
    samples: number[],
    value: number,
    min: number,
    max: number,
  ): void {
    const clampedValue = Math.max(min, Math.min(max, value))
    if (
      samples.some(
        (existingValue) =>
          Math.abs(existingValue - clampedValue) <= GEOMETRIC_TOLERANCE,
      )
    ) {
      return
    }

    samples.push(clampedValue)
  }

  private getEdgeSamples(
    min: number,
    max: number,
    preferred: number,
  ): number[] {
    const samples: number[] = []
    const span = max - min
    this.pushEdgeSample(samples, preferred, min, max)

    if (span <= GEOMETRIC_TOLERANCE) {
      return samples
    }

    this.pushEdgeSample(samples, min, min, max)
    this.pushEdgeSample(samples, max, min, max)
    this.pushEdgeSample(samples, (min + max) / 2, min, max)

    const clampedPreferred = Math.max(min, Math.min(max, preferred))
    const step = Math.max(
      this.params.requiredViaToViaClearance,
      GEOMETRIC_TOLERANCE,
    )
    const stepCount = Math.ceil(span / step)

    for (let index = 1; index <= stepCount; index += 1) {
      const offset = index * step
      this.pushEdgeSample(samples, clampedPreferred + offset, min, max)
      this.pushEdgeSample(samples, clampedPreferred - offset, min, max)
    }

    return samples
  }

  private getBoardBoundarySegments(): LineSegment2[] {
    const outline = this.params.routeJson.outline
    if (outline && outline.length >= 3) {
      return Polygon2.fromPoints(outline).getSegments()
    }

    const bounds = this.params.routeJson.bounds
    return [
      new LineSegment2(
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
      ),
      new LineSegment2(
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
      ),
      new LineSegment2(
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY },
      ),
      new LineSegment2(
        { x: bounds.minX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.minY },
      ),
    ]
  }

  private getRayProbeDistance(): number {
    const bounds = this.params.routeJson.bounds
    return (
      Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 2 +
      this.params.viaDiameter
    )
  }

  private getRayIntersectionDistance(params: {
    ray: LineSegment2
    segment: LineSegment2
  }): number | null {
    const { ray, segment } = params
    if (!ray.intersects(segment, GEOMETRIC_TOLERANCE)) {
      return null
    }

    const intersection = ray.getIntersection(segment, GEOMETRIC_TOLERANCE)
    if (!intersection) {
      return null
    }

    const hitDistance = ray.start.distanceTo(intersection)
    if (hitDistance <= GEOMETRIC_TOLERANCE) {
      return null
    }

    return hitDistance
  }

  private getProjectedFreeSpaceAlongDirection(params: {
    sourcePoint: ConnectionPoint
    candidate: Point2
    sourceLayer: string
    sourceObstacle?: SerializedObstacle
    direction: Point2
    travelDistance: number
  }): number {
    const {
      sourcePoint,
      sourceLayer,
      sourceObstacle,
      direction,
      travelDistance,
    } = params
    const directionLength = Math.hypot(direction.x, direction.y)
    if (
      directionLength <= GEOMETRIC_TOLERANCE ||
      travelDistance <= GEOMETRIC_TOLERANCE
    ) {
      return 0
    }

    const probeDistance = this.getRayProbeDistance()
    const directionX = direction.x / directionLength
    const directionY = direction.y / directionLength
    const ray = new LineSegment2(sourcePoint, {
      x: sourcePoint.x + directionX * probeDistance,
      y: sourcePoint.y + directionY * probeDistance,
    })

    let firstHitDistance = Number.POSITIVE_INFINITY

    for (const obstacle of this.params.routeJson.obstacles) {
      if (obstacle === sourceObstacle) continue
      if (!obstacle.layers.includes(sourceLayer)) continue

      for (const segment of Obstacle.fromJson(obstacle).getBoundarySegments()) {
        const hitDistance = this.getRayIntersectionDistance({
          ray,
          segment,
        })
        if (hitDistance !== null) {
          firstHitDistance = Math.min(firstHitDistance, hitDistance)
        }
      }
    }

    for (const segment of this.getBoardBoundarySegments()) {
      const hitDistance = this.getRayIntersectionDistance({
        ray,
        segment,
      })
      if (hitDistance !== null) {
        firstHitDistance = Math.min(firstHitDistance, hitDistance)
      }
    }

    if (!Number.isFinite(firstHitDistance)) {
      return 0
    }

    return Math.max(0, firstHitDistance - travelDistance)
  }
}
