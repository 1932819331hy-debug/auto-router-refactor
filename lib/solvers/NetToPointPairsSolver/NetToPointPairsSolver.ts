import { BaseSolver } from "@tscircuit/solver-utils"

import {
  RoutePoint,
  SimpleRouteConnection,
  type SimpleRouteJson,
} from "../../model/index.ts"
import type {
  ConnectionPoint,
  PointId,
  PointKey,
  SerializedSimpleRouteConnection,
  SerializedSimpleRouteJson,
} from "../../types/index.ts"
import { DisjointSetUnion } from "./DisjointSetUnion.ts"

type WeightedEdge<TPoint extends ConnectionPoint> = {
  from: TPoint
  to: TPoint
  weight: number
}

type ExternalConnectionState = {
  pointIdToGroup: Map<string, number>
  zeroWeightEdges: WeightedEdge<ConnectionPoint>[]
}

const getPointDistance = (
  leftPoint: Pick<ConnectionPoint, "x" | "y">,
  rightPoint: Pick<ConnectionPoint, "x" | "y">,
): number => Math.hypot(leftPoint.x - rightPoint.x, leftPoint.y - rightPoint.y)

const buildMinimumSpanningTree = <TPoint extends ConnectionPoint>(
  points: ReadonlyArray<TPoint>,
  extraEdges: ReadonlyArray<WeightedEdge<TPoint>> = [],
): Array<WeightedEdge<TPoint>> => {
  if (points.length <= 1) {
    return []
  }

  const allEdges: Array<WeightedEdge<TPoint>> = [...extraEdges]
  for (let leftIndex = 0; leftIndex < points.length - 1; leftIndex += 1) {
    const leftPoint = points[leftIndex]
    if (!leftPoint) {
      continue
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < points.length;
      rightIndex += 1
    ) {
      const rightPoint = points[rightIndex]
      if (!rightPoint) {
        continue
      }

      allEdges.push({
        from: leftPoint,
        to: rightPoint,
        weight: getPointDistance(leftPoint, rightPoint),
      })
    }
  }

  allEdges.sort((leftEdge, rightEdge) => leftEdge.weight - rightEdge.weight)

  const pointSet = new DisjointSetUnion(
    points.map((point) => RoutePoint.getKeyFromJson(point)),
  )
  const minimumSpanningTree: Array<WeightedEdge<TPoint>> = []

  for (const edge of allEdges) {
    if (
      pointSet.union(
        RoutePoint.getKeyFromJson(edge.from),
        RoutePoint.getKeyFromJson(edge.to),
      )
    ) {
      minimumSpanningTree.push(edge)
    }
    if (minimumSpanningTree.length === points.length - 1) {
      break
    }
  }

  return minimumSpanningTree
}

const mergeConnections = (
  connections: ReadonlyArray<SerializedSimpleRouteConnection>,
): SerializedSimpleRouteConnection[] => {
  if (connections.length === 0) {
    return []
  }

  const tempConnectionIds = connections.map((_, index) => `conn_${index}`)
  const connectionSet = new DisjointSetUnion(tempConnectionIds)
  const pointKeyToConnectionIds = new Map<PointKey, string[]>()

  for (const [connectionIndex, connection] of connections.entries()) {
    const connectionId = tempConnectionIds[connectionIndex]
    if (!connectionId) {
      continue
    }

    for (const point of connection.pointsToConnect) {
      const pointKey = RoutePoint.getKeyFromJson(point)
      const existingIds = pointKeyToConnectionIds.get(pointKey) ?? []
      existingIds.push(connectionId)
      pointKeyToConnectionIds.set(pointKey, existingIds)
    }
  }

  for (const connectionIds of pointKeyToConnectionIds.values()) {
    const firstConnectionId = connectionIds[0]
    if (!firstConnectionId) {
      continue
    }

    for (let index = 1; index < connectionIds.length; index += 1) {
      const otherConnectionId = connectionIds[index]
      if (otherConnectionId) {
        connectionSet.union(firstConnectionId, otherConnectionId)
      }
    }
  }

  const rootConnectionGroups = new Map<
    string,
    SerializedSimpleRouteConnection[]
  >()
  for (const [connectionIndex, connection] of connections.entries()) {
    const connectionId = tempConnectionIds[connectionIndex]
    if (!connectionId) {
      continue
    }

    const rootConnectionId = connectionSet.find(connectionId)
    const rootGroup = rootConnectionGroups.get(rootConnectionId) ?? []
    rootGroup.push(connection)
    rootConnectionGroups.set(rootConnectionId, rootGroup)
  }

  const mergedConnections: SerializedSimpleRouteConnection[] = []
  for (const connectionGroup of rootConnectionGroups.values()) {
    if (connectionGroup.length === 1) {
      const [onlyConnection] = connectionGroup
      if (onlyConnection) {
        mergedConnections.push(onlyConnection)
      }
      continue
    }

    const pointByKey = new Map<PointKey, ConnectionPoint>()
    const mergedNames = new Set<string>()
    const mergedRootNames = new Set<string>()
    const mergedNetNames = new Set<string>()
    const externallyConnectedPointIds: PointId[][] = []
    let nominalTraceWidth: number | undefined
    let isOffBoard = false

    for (const connection of connectionGroup) {
      for (const point of connection.pointsToConnect) {
        pointByKey.set(RoutePoint.getKeyFromJson(point), point)
      }

      mergedNames.add(connection.name)
      if (connection.rootConnectionName) {
        mergedRootNames.add(connection.rootConnectionName)
      }
      if (connection.netConnectionName) {
        mergedNetNames.add(connection.netConnectionName)
      }
      if (connection.externallyConnectedPointIds) {
        externallyConnectedPointIds.push(
          ...connection.externallyConnectedPointIds,
        )
      }
      if (connection.isOffBoard) {
        isOffBoard = true
      }
      if (
        nominalTraceWidth === undefined &&
        connection.nominalTraceWidth !== undefined
      ) {
        nominalTraceWidth = connection.nominalTraceWidth
      }
    }

    mergedConnections.push({
      name: Array.from(mergedNames).join("__"),
      mergedConnectionNames: Array.from(mergedNames),
      rootConnectionName:
        mergedRootNames.size === 1 ? Array.from(mergedRootNames)[0] : undefined,
      netConnectionName:
        mergedNetNames.size > 0
          ? Array.from(mergedNetNames).join("__")
          : undefined,
      isOffBoard,
      nominalTraceWidth,
      externallyConnectedPointIds:
        externallyConnectedPointIds.length > 0
          ? externallyConnectedPointIds
          : undefined,
      pointsToConnect: Array.from(pointByKey.values()),
    })
  }

  return mergedConnections
}

const getExternalConnectionState = (
  connection: SerializedSimpleRouteConnection,
): ExternalConnectionState => {
  const pointIdToGroup = new Map<string, number>()
  const pointById = new Map<string, ConnectionPoint>()

  for (const point of connection.pointsToConnect) {
    if (point.pointId) {
      pointById.set(point.pointId, point)
    }
  }

  const zeroWeightEdges: WeightedEdge<ConnectionPoint>[] = []
  for (const [groupIndex, externalGroup] of (
    connection.externallyConnectedPointIds ?? []
  ).entries()) {
    const groupPoints = externalGroup
      .map((pointId) => pointById.get(pointId))
      .filter((point): point is ConnectionPoint => point !== undefined)

    const representativePoint = groupPoints[0]
    if (!representativePoint) {
      continue
    }

    for (const point of groupPoints) {
      if (point.pointId) {
        pointIdToGroup.set(point.pointId, groupIndex)
      }
    }

    for (let index = 1; index < groupPoints.length; index += 1) {
      const groupPoint = groupPoints[index]
      if (!groupPoint) {
        continue
      }

      zeroWeightEdges.push({
        from: representativePoint,
        to: groupPoint,
        weight: 0,
      })
    }
  }

  return { pointIdToGroup, zeroWeightEdges }
}

const areExternallyConnected = (
  pointIdToGroup: ReadonlyMap<string, number>,
  leftPoint: { pointId?: string },
  rightPoint: { pointId?: string },
): boolean => {
  if (!leftPoint.pointId || !rightPoint.pointId) {
    return false
  }

  const leftGroupId = pointIdToGroup.get(leftPoint.pointId)
  const rightGroupId = pointIdToGroup.get(rightPoint.pointId)
  return leftGroupId !== undefined && leftGroupId === rightGroupId
}

/**
 * Converts multi-point logical nets into two-point routing tasks.
 *
 * The solver keeps the wrapper boundary at `SimpleRouteJson` while internally
 * applying the same MST-based point-pair expansion used by the legacy
 * autorouter pipeline.
 */
export class NetToPointPairsSolver extends BaseSolver {
  protected readonly inputSimpleRouteJson: SimpleRouteJson
  protected readonly mergedConnections: ReadonlyArray<SerializedSimpleRouteConnection>
  protected readonly outputConnections: SerializedSimpleRouteConnection[] = []
  protected outputSimpleRouteJsonValue?: SimpleRouteJson

  public constructor(
    simpleRouteJson: SimpleRouteJson,
    protected readonly colorMap: Record<string, string> = {},
  ) {
    super()
    this.inputSimpleRouteJson = simpleRouteJson
    this.mergedConnections = mergeConnections(
      simpleRouteJson.toJson().connections,
    )
    this.MAX_ITERATIONS = 1
  }

  public override _step(): void {
    for (const connection of this.mergedConnections) {
      this.outputConnections.push(...this.expandConnection(connection))
    }

    this.outputSimpleRouteJsonValue = this.inputSimpleRouteJson.withConnections(
      this.outputConnections.map((connection) =>
        SimpleRouteConnection.fromJson(connection),
      ),
    )
    this.solved = true
  }

  /**
   * Returns the new route document as a wrapper.
   *
   * @returns Route input with pair-expanded connections.
   */
  public getOutputSimpleRouteJson(): SimpleRouteJson {
    if (!this.outputSimpleRouteJsonValue) {
      throw new Error("NetToPointPairsSolver has not solved yet")
    }

    return this.outputSimpleRouteJsonValue
  }

  /**
   * Returns the route document after point-pair expansion.
   *
   * @returns Pair-expanded serialized route document.
   */
  public getNewSerializedSimpleRouteJson(): SerializedSimpleRouteJson {
    return this.getOutputSimpleRouteJson().toJson()
  }

  public override getOutput(): SerializedSimpleRouteJson {
    return this.getNewSerializedSimpleRouteJson()
  }

  public override getConstructorParams(): [
    SerializedSimpleRouteJson,
    Record<string, string>,
  ] {
    return [this.inputSimpleRouteJson.toJson(), structuredClone(this.colorMap)]
  }

  protected mapPointPair(
    sourcePoint: ConnectionPoint,
    targetPoint: ConnectionPoint,
  ): [ConnectionPoint, ConnectionPoint] {
    return [sourcePoint, targetPoint]
  }

  protected expandConnection(
    connection: SerializedSimpleRouteConnection,
  ): SerializedSimpleRouteConnection[] {
    const { pointIdToGroup, zeroWeightEdges } =
      getExternalConnectionState(connection)

    if (connection.pointsToConnect.length === 2) {
      const [sourcePoint, targetPoint] = connection.pointsToConnect
      if (!sourcePoint || !targetPoint) {
        return []
      }
      if (areExternallyConnected(pointIdToGroup, sourcePoint, targetPoint)) {
        return []
      }

      return [
        {
          ...connection,
          pointsToConnect: this.mapPointPair(sourcePoint, targetPoint),
          rootConnectionName: connection.rootConnectionName ?? connection.name,
        },
      ]
    }

    const treeEdges = buildMinimumSpanningTree(
      connection.pointsToConnect,
      zeroWeightEdges,
    )
    let mstEdgeIndex = 0

    return treeEdges.flatMap((edge) => {
      if (areExternallyConnected(pointIdToGroup, edge.from, edge.to)) {
        return []
      }

      return [
        {
          name: `${connection.name}_mst${mstEdgeIndex++}`,
          rootConnectionName: connection.rootConnectionName ?? connection.name,
          mergedConnectionNames: connection.mergedConnectionNames,
          netConnectionName: connection.netConnectionName,
          nominalTraceWidth: connection.nominalTraceWidth,
          pointsToConnect: this.mapPointPair(edge.from, edge.to),
        },
      ]
    })
  }
}
