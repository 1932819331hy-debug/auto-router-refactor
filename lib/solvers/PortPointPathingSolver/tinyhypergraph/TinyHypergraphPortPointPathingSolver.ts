import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import type {
  CapacityMeshNode,
  CapacityMeshNodeId,
} from "../../../model/index.ts"
import type {
  HyperGraph,
  HyperGraphConnection,
  HyperGraphPort,
  HyperGraphRegion,
} from "../hgportpointpathingsolver/index.ts"

export interface InputPortPoint {
  portPointId: string
  x: number
  y: number
  z: number
  connectionNodeIds: [CapacityMeshNodeId, CapacityMeshNodeId]
  distToCentermostPortOnZ: number
  connectsToOffBoardNode: boolean
}

export interface PortPoint {
  portPointId: string
  x: number
  y: number
  z: number
  connectionName: string
  rootConnectionName?: string
}

export interface InputNodeWithPortPoints {
  capacityMeshNodeId: CapacityMeshNodeId
  center: { x: number; y: number }
  width: number
  height: number
  availableZ: number[]
  portPoints: InputPortPoint[]
  _containsObstacle?: boolean
  _containsTarget?: boolean
  _offBoardConnectionId?: string
}

export interface NodeWithPortPoints {
  capacityMeshNodeId: CapacityMeshNodeId
  center: { x: number; y: number }
  width: number
  height: number
  availableZ: number[]
  portPoints: PortPoint[]
  _containsObstacle?: boolean
  _containsTarget?: boolean
  _offBoardConnectionId?: string
}

export interface TinyHypergraphPortPointPathingSolverParams {
  graph: HyperGraph
  connections: HyperGraphConnection[]
}

/**
 * Lightweight local replacement for the larger upstream tiny-hypergraph port
 * point pathing stage. It greedily assigns one shared-edge port path per
 * pair-expanded connection while preserving the same pipeline contract.
 */
export class TinyHypergraphPortPointPathingSolver extends BaseSolver {
  private readonly inputNodeWithPortPoints: InputNodeWithPortPoints[]
  private readonly occupiedPortIds = new Set<string>()
  private outputNodeWithPortPoints: NodeWithPortPoints[] = []

  public constructor(
    private readonly params: TinyHypergraphPortPointPathingSolverParams,
  ) {
    super()
    this.MAX_ITERATIONS = 1
    this.inputNodeWithPortPoints = params.graph.regions.map((region) =>
      this.createInputNode(region),
    )
  }

  /**
   * Returns the stable solver name used by debug tooling.
   *
   * @returns Solver display name.
   */
  public override getSolverName(): string {
    return "TinyHypergraphPortPointPathingSolver"
  }

  /**
   * Computes one routing pass across the region hypergraph.
   */
  public override _step(): void {
    this.routeAllConnections()
    this.solved = true
  }

  /**
   * Returns assigned and candidate node port-point views for downstream stages.
   *
   * @returns Assigned node port points plus original candidate nodes.
   */
  public override getOutput(): {
    nodesWithPortPoints: NodeWithPortPoints[]
    inputNodeWithPortPoints: InputNodeWithPortPoints[]
  } {
    return {
      nodesWithPortPoints: this.outputNodeWithPortPoints,
      inputNodeWithPortPoints: this.inputNodeWithPortPoints,
    }
  }

  /**
   * Returns a coarse per-node congestion score based on assigned ports.
   *
   * @param node - Input node to inspect.
   * @returns Assigned port count for the node, or null when unknown.
   */
  public computeNodePf(node: InputNodeWithPortPoints): number | null {
    const routedNode = this.outputNodeWithPortPoints.find(
      (candidate) => candidate.capacityMeshNodeId === node.capacityMeshNodeId,
    )
    return routedNode ? routedNode.portPoints.length : null
  }

  public override visualize(): GraphicsObject {
    return {
      circles: this.outputNodeWithPortPoints.flatMap((node) =>
        node.portPoints.map((portPoint) => ({
          center: { x: portPoint.x, y: portPoint.y },
          radius: 0.08,
          fill: "rgba(0, 120, 255, 0.75)",
          layer: `z${portPoint.z}`,
          label: `${portPoint.connectionName}\n${portPoint.portPointId}`,
        })),
      ),
      rects: [],
      lines: [],
    }
  }

  private createInputNode(region: HyperGraphRegion): InputNodeWithPortPoints {
    return {
      capacityMeshNodeId: region.node.capacityMeshNodeId,
      center: { ...region.node.center },
      width: region.node.width,
      height: region.node.height,
      availableZ: [...region.node.availableZ],
      portPoints: region.ports.map((port) => ({
        portPointId: port.data.portId,
        x: port.data.x,
        y: port.data.y,
        z: port.data.z,
        connectionNodeIds: [port.region1.regionId, port.region2.regionId] as [
          CapacityMeshNodeId,
          CapacityMeshNodeId,
        ],
        distToCentermostPortOnZ: port.data.distToCentermostPortOnZ,
        connectsToOffBoardNode: port.data.regions.some((candidateRegion) =>
          Boolean(candidateRegion.node._offBoardConnectionId),
        ),
      })),
      _containsObstacle: region.node._containsObstacle,
      _containsTarget: region.node._containsTarget,
      _offBoardConnectionId: region.node._offBoardConnectionId,
    }
  }

  private routeAllConnections(): void {
    const assignedPortPointsByNodeId = new Map<
      CapacityMeshNodeId,
      PortPoint[]
    >()

    for (const region of this.params.graph.regions) {
      assignedPortPointsByNodeId.set(region.regionId, [])
    }

    for (const connection of this.params.connections) {
      const pathPorts =
        this.findPath(connection, true) ??
        this.findPath(connection, false) ??
        []

      for (const port of pathPorts) {
        this.occupiedPortIds.add(port.portId)
      }

      for (const port of pathPorts) {
        for (const region of [port.region1, port.region2]) {
          const portPoints = assignedPortPointsByNodeId.get(region.regionId)
          if (!portPoints) continue

          const alreadyAssigned = portPoints.some(
            (existingPortPoint) =>
              existingPortPoint.portPointId === port.data.portId &&
              existingPortPoint.connectionName === connection.connectionId,
          )
          if (alreadyAssigned) {
            continue
          }

          portPoints.push({
            portPointId: port.data.portId,
            x: port.data.x,
            y: port.data.y,
            z: port.data.z,
            connectionName: connection.connectionId,
            rootConnectionName: connection.simpleRouteConnection.getRootName(),
          })
        }
      }
    }

    this.outputNodeWithPortPoints = this.params.graph.regions.map((region) =>
      this.createOutputNode(
        region.node,
        assignedPortPointsByNodeId.get(region.regionId) ?? [],
      ),
    )
  }

  private createOutputNode(
    node: CapacityMeshNode,
    portPoints: PortPoint[],
  ): NodeWithPortPoints {
    return {
      capacityMeshNodeId: node.capacityMeshNodeId,
      center: { ...node.center },
      width: node.width,
      height: node.height,
      availableZ: [...node.availableZ],
      portPoints: [...portPoints],
      _containsObstacle: node._containsObstacle,
      _containsTarget: node._containsTarget,
      _offBoardConnectionId: node._offBoardConnectionId,
    }
  }

  private findPath(
    connection: HyperGraphConnection,
    avoidOccupiedPorts: boolean,
  ): HyperGraphPort[] | null {
    if (connection.startRegion.regionId === connection.endRegion.regionId) {
      return []
    }

    const queue: HyperGraphRegion[] = [connection.startRegion]
    const visited = new Set<CapacityMeshNodeId>([
      connection.startRegion.regionId,
    ])
    const previousStep = new Map<
      CapacityMeshNodeId,
      {
        previousRegionId: CapacityMeshNodeId
        throughPort: HyperGraphPort
      }
    >()

    while (queue.length > 0) {
      const currentRegion = queue.shift()
      if (!currentRegion) {
        continue
      }
      if (currentRegion.regionId === connection.endRegion.regionId) {
        break
      }

      const candidatePorts = [...currentRegion.ports].sort(
        (portA, portB) =>
          portA.data.distToCentermostPortOnZ -
          portB.data.distToCentermostPortOnZ,
      )

      for (const port of candidatePorts) {
        if (avoidOccupiedPorts && this.occupiedPortIds.has(port.portId)) {
          continue
        }

        const nextRegion =
          port.region1.regionId === currentRegion.regionId
            ? port.region2
            : port.region1

        if (visited.has(nextRegion.regionId)) {
          continue
        }

        visited.add(nextRegion.regionId)
        previousStep.set(nextRegion.regionId, {
          previousRegionId: currentRegion.regionId,
          throughPort: port,
        })
        queue.push(nextRegion)
      }
    }

    if (!visited.has(connection.endRegion.regionId)) {
      return null
    }

    const pathPorts: HyperGraphPort[] = []
    let regionId = connection.endRegion.regionId

    while (regionId !== connection.startRegion.regionId) {
      const step = previousStep.get(regionId)
      if (!step) {
        return null
      }

      pathPorts.push(step.throughPort)
      regionId = step.previousRegionId
    }

    return pathPorts.reverse()
  }
}
