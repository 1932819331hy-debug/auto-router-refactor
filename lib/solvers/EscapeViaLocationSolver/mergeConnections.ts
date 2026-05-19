import { RoutePoint } from "../../model/index.ts"
import type {
  ConnectionPoint,
  SerializedSimpleRouteConnection,
} from "../../types/index.ts"
import { DisjointSetUnion } from "./DisjointSetUnion.ts"

/**
 * Merges connections that already share one or more points.
 */
export const mergeConnections = (
  connections: ReadonlyArray<SerializedSimpleRouteConnection>,
): SerializedSimpleRouteConnection[] => {
  if (connections.length === 0) {
    return []
  }

  const tempConnectionIds = connections.map((_, index) => `conn_${index}`)
  const connectionSet = new DisjointSetUnion(tempConnectionIds)
  const pointKeyToConnectionIds = new Map<string, string[]>()

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
      const connectionId = connectionIds[index]
      if (connectionId) {
        connectionSet.union(firstConnectionId, connectionId)
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
      const [connection] = connectionGroup
      if (connection) {
        mergedConnections.push(connection)
      }
      continue
    }

    const pointByKey = new Map<string, ConnectionPoint>()
    const mergedNames = new Set<string>()
    const mergedRootNames = new Set<string>()
    const mergedNetNames = new Set<string>()
    const externallyConnectedPointIds: string[][] = []
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
