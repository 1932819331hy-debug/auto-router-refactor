import { LayerMapper } from "../../../domain/board/LayerMapper.ts"
import type { RoutePoint } from "../../../domain/connection/RoutePoint.ts"
import type {
  CapacityMeshNode,
  CapacityMeshNodeId,
  SimpleRouteConnection,
} from "../../../domain/index.ts"
import type { SegmentPortPoint } from "../../AvailableSegmentPointSolver.ts"

const REGION_EPSILON = 1e-6

export interface HyperGraphRegion {
  regionId: CapacityMeshNodeId
  node: CapacityMeshNode
  ports: HyperGraphPort[]
}

export interface HyperGraphPortData {
  portId: string
  x: number
  y: number
  z: number
  distToCentermostPortOnZ: number
  regions: [HyperGraphRegion, HyperGraphRegion]
}

export interface HyperGraphPort {
  portId: string
  data: HyperGraphPortData
  region1: HyperGraphRegion
  region2: HyperGraphRegion
}

export interface HyperGraphConnection {
  connectionId: string
  mutuallyConnectedNetworkId: string
  startRegion: HyperGraphRegion
  endRegion: HyperGraphRegion
  simpleRouteConnection: SimpleRouteConnection
}

export interface HyperGraph {
  ports: HyperGraphPort[]
  regions: HyperGraphRegion[]
}

/**
 * Builds the hypergraph and pair-expanded connection list consumed by the
 * local port-point pathing solver.
 *
 * @param params - Hypergraph construction inputs from earlier pipeline stages.
 * @returns Graph regions/ports plus resolved connection endpoints.
 */
export function buildHyperGraph(params: {
  simpleRouteJsonConnections: ReadonlyArray<SimpleRouteConnection>
  capacityMeshNodes: ReadonlyArray<CapacityMeshNode>
  segmentPortPoints: ReadonlyArray<SegmentPortPoint>
  layerCount: number
}): { graph: HyperGraph; connections: HyperGraphConnection[] } {
  const graph: HyperGraph = {
    ports: [],
    regions: [],
  }
  const connections: HyperGraphConnection[] = []
  const layerMapper = new LayerMapper(params.layerCount)

  for (const capacityMeshNode of params.capacityMeshNodes) {
    graph.regions.push({
      regionId: capacityMeshNode.capacityMeshNodeId,
      node: capacityMeshNode,
      ports: [],
    })
  }

  const regionById = new Map(
    graph.regions.map((region) => [region.regionId, region] as const),
  )

  for (const segmentPortPoint of params.segmentPortPoints) {
    const [region1Id, region2Id] = segmentPortPoint.nodeIds
    const region1 = regionById.get(region1Id)
    const region2 = regionById.get(region2Id)

    if (!region1 || !region2) {
      throw new Error(
        `Missing hypergraph region for segment port point "${segmentPortPoint.segmentPortPointId}"`,
      )
    }

    for (const z of segmentPortPoint.availableZ) {
      const portData: HyperGraphPortData = {
        portId: `${segmentPortPoint.segmentPortPointId}::${z}`,
        x: segmentPortPoint.x,
        y: segmentPortPoint.y,
        z,
        distToCentermostPortOnZ: segmentPortPoint.distToCentermostPortOnZ,
        regions: [region1, region2],
      }
      const port: HyperGraphPort = {
        portId: portData.portId,
        data: portData,
        region1,
        region2,
      }

      graph.ports.push(port)
      region1.ports.push(port)
      region2.ports.push(port)
    }
  }

  for (const connection of params.simpleRouteJsonConnections) {
    const [startPoint, endPoint] = connection.points
    if (!startPoint || !endPoint) {
      throw new Error(
        `Connection "${connection.name}" must contain exactly two connection points after pair expansion`,
      )
    }

    const startRegion = graph.regions.find((region) =>
      checkIfConnectionPointIsInRegion({
        point: startPoint,
        region,
        layerMapper,
      }),
    )
    const endRegion = graph.regions.find((region) =>
      checkIfConnectionPointIsInRegion({
        point: endPoint,
        region,
        layerMapper,
      }),
    )

    if (!startRegion) {
      throw new Error(
        `Could not resolve a start region for connection "${connection.name}"`,
      )
    }
    if (!endRegion) {
      throw new Error(
        `Could not resolve an end region for connection "${connection.name}"`,
      )
    }

    connections.push({
      connectionId: connection.name,
      mutuallyConnectedNetworkId: connection.getRootName() ?? connection.name,
      startRegion,
      endRegion,
      simpleRouteConnection: connection,
    })
  }

  return { graph, connections }
}

function checkIfConnectionPointIsInRegion(params: {
  point: RoutePoint
  region: HyperGraphRegion
  layerMapper: LayerMapper
}): boolean {
  const { point, region, layerMapper } = params
  const pointLayers = point
    .getLayers()
    .map((layerName) => layerMapper.toZ(layerName))
  const hasSharedLayer = pointLayers.some((z) =>
    region.node.availableZ.includes(z),
  )

  if (!hasSharedLayer) {
    return false
  }

  return (
    point.x >= region.node.getLeft() - REGION_EPSILON &&
    point.x <= region.node.getRight() + REGION_EPSILON &&
    point.y >= region.node.getTop() - REGION_EPSILON &&
    point.y <= region.node.getBottom() + REGION_EPSILON
  )
}
