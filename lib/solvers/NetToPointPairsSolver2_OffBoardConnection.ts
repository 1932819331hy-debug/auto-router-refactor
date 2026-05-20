import type { GraphicsObject } from "graphics-debug"
import { SimpleRouteConnection, SimpleRouteJson } from "../model/index.ts"
import type { ConnectionPoint } from "../types/index.ts"
import { NetToPointPairsSolver } from "./NetToPointPairsSolver.ts"

/**
 * Optimizes pair-expanded connections by allowing equivalent off-board points
 * to substitute for one another when that shortens the on-board route.
 */
export class NetToPointPairsSolver2_OffBoardConnection extends NetToPointPairsSolver {
  private readonly originalSimpleRouteJson: SimpleRouteJson
  private readonly connectionPointDsu: {
    getGroup: (id: string) => string[]
  }
  private readonly connectionPointMap = new Map<string, ConnectionPoint>()
  private readonly unprocessedConnections

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
    this.originalSimpleRouteJson = simpleRouteJson
    this.connectionPointDsu = connectionPointDsu
    for (const [pointId, point] of connectionPointMap.entries()) {
      this.connectionPointMap.set(pointId, point)
    }
    this.unprocessedConnections = [...this.mergedConnections]
    this.MAX_ITERATIONS = Math.max(this.unprocessedConnections.length + 1, 1)
  }

  /**
   * Returns the stable solver identifier used by pipeline tooling.
   *
   * @returns Concrete solver class name.
   */
  public override getSolverName(): string {
    return "NetToPointPairsSolver2_OffBoardConnection"
  }

  /**
   * Expands on-board connections while preserving the original route wrapper.
   *
   * The base solver rebuilds output using its input wrapper. This subclass
   * intentionally solves only the on-board subset, so the final wrapper must
   * come from the original route document to avoid dropping off-board metadata.
   */
  public override _step(): void {
    if (this.unprocessedConnections.length === 0) {
      this.finalizeOutput()
      return
    }

    const currentConnection = this.unprocessedConnections.pop()
    if (!currentConnection) {
      this.finalizeOutput()
      return
    }

    this.outputConnections.push(...this.expandConnection(currentConnection))

    if (this.unprocessedConnections.length === 0) {
      this.finalizeOutput()
    }
  }

  /**
   * Serializes constructor parameters from the original route document.
   *
   * @returns Original route JSON and a cloned color map.
   */
  public override getConstructorParams(): [
    ReturnType<SimpleRouteJson["toJson"]>,
    Record<string, string>,
  ] {
    return [
      this.originalSimpleRouteJson.toJson(),
      structuredClone(this.colorMap),
    ]
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

  public override visualize(): GraphicsObject {
    let visualizationRandomState = 0
    const graphics: GraphicsObject = {
      title: "Net To Point Pairs Visualization",
      coordinateSystem: "cartesian",
      lines: [],
      points: [],
      rects: [],
      circles: [],
    }

    for (const connection of this.unprocessedConnections) {
      for (const point of connection.pointsToConnect) {
        graphics.points?.push({
          x: point.x,
          y: point.y,
          color: "red",
          label: connection.name,
        })
      }

      const pointCount = connection.pointsToConnect.length
      const edgeDrawCount = Math.max(pointCount ** 2, pointCount * 2)
      const placedEdges = new Set<string>()

      for (let edgeIndex = 0; edgeIndex < edgeDrawCount; edgeIndex += 1) {
        visualizationRandomState =
          (visualizationRandomState * 1664525 + 1013904223) >>> 0
        const fromIndex = Math.floor(
          (visualizationRandomState / 2 ** 32) * pointCount,
        )
        visualizationRandomState =
          (visualizationRandomState * 1664525 + 1013904223) >>> 0
        const toIndex = Math.floor(
          (visualizationRandomState / 2 ** 32) * pointCount,
        )
        const edgeKey = `${fromIndex}-${toIndex}`
        if (placedEdges.has(edgeKey)) {
          continue
        }

        const fromPoint = connection.pointsToConnect[fromIndex]
        const toPoint = connection.pointsToConnect[toIndex]
        if (!fromPoint || !toPoint) {
          continue
        }

        placedEdges.add(edgeKey)
        graphics.lines?.push({
          points: [fromPoint, toPoint],
          strokeColor: "rgba(255,0,0,0.25)",
        })
      }
    }

    for (const connection of this.outputConnections) {
      const color =
        this.colorMap[connection.name] ??
        (connection.rootConnectionName
          ? this.colorMap[connection.rootConnectionName]
          : undefined) ??
        "blue"

      for (const point of connection.pointsToConnect) {
        graphics.points?.push({
          x: point.x,
          y: point.y,
          color,
          label: connection.name,
        })
      }

      for (
        let sourceIndex = 0;
        sourceIndex < connection.pointsToConnect.length - 1;
        sourceIndex += 1
      ) {
        const sourcePoint = connection.pointsToConnect[sourceIndex]
        if (!sourcePoint) {
          continue
        }

        for (
          let targetIndex = sourceIndex + 1;
          targetIndex < connection.pointsToConnect.length;
          targetIndex += 1
        ) {
          const targetPoint = connection.pointsToConnect[targetIndex]
          if (!targetPoint) {
            continue
          }

          graphics.lines?.push({
            points: [sourcePoint, targetPoint],
            strokeColor: color,
          })
        }
      }
    }

    return graphics
  }

  private finalizeOutput(): void {
    this.outputSimpleRouteJsonValue =
      this.originalSimpleRouteJson.withConnections(
        this.outputConnections.map((connection) =>
          SimpleRouteConnection.fromJson(connection),
        ),
      )
    this.solved = true
  }
}
