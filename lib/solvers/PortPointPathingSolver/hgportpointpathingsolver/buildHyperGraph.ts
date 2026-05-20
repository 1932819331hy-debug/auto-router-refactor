import { LayerMapper } from "../../../model/board/LayerMapper.ts"
import type { RoutePoint } from "../../../model/connection/RoutePoint.ts"
import type {
  CapacityMeshNode,
  SimpleRouteConnection,
} from "../../../model/index.ts"
import type { SegmentPortPoint } from "../../AvailableSegmentPointSolver.ts"
import { HyperGraph } from "./HyperGraph.ts"
import { HyperGraphConnection } from "./HyperGraphConnection.ts"
import { HyperGraphPort } from "./HyperGraphPort.ts"
import { HyperGraphPortData } from "./HyperGraphPortData.ts"
import type { HyperGraphRegion } from "./HyperGraphRegion.ts"

const REGION_EPSILON = 1e-6

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
  const graph = new HyperGraph()
  const connections: HyperGraphConnection[] = []
  const layerMapper = new LayerMapper(params.layerCount)

  for (const capacityMeshNode of params.capacityMeshNodes) {
    graph.addRegion(capacityMeshNode)
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
      const portData = new HyperGraphPortData(
        `${segmentPortPoint.segmentPortPointId}::${z}`,
        segmentPortPoint.x,
        segmentPortPoint.y,
        z,
        segmentPortPoint.distToCentermostPortOnZ,
        [region1, region2],
      )
      const port = new HyperGraphPort(portData, region1, region2)
      graph.addPort(port)
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

    connections.push(
      new HyperGraphConnection(
        connection.name,
        connection.getRootName() ?? connection.name,
        startRegion,
        endRegion,
        connection,
      ),
    )
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
