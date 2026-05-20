import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import { RgbaColor } from "../../../math/index.ts"
import { LayerMapper } from "../../../model/board/LayerMapper.ts"
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
import { RoutedConnectionPath } from "./RoutedConnectionPath.ts"

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

const BOTTOM_LAYER_TRACE_COLOR = "rgba(52, 152, 219, 0.95)"
const BOTTOM_LAYER_TRACE_DASH = "3 2"
const TRANSITION_CROSSING_COLOR = "rgba(22, 160, 133, 0.95)"
const TRANSITION_CROSSING_DASH = "2 4 2"
const PORT_LAYER_COORDINATE_OFFSET = 0.005
const HOT_REGION_FILL = new RgbaColor(255, 64, 64, 0.72)

function createLabel(...lines: Array<string | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n")
}

function getRegionVisualizationLayer(region: HyperGraphRegion): string {
  return `z${region.node.availableZ.join(",")}`
}

/**
 * Lightweight local replacement for the larger upstream tiny-hypergraph port
 * point pathing stage. It greedily assigns one shared-edge port path per
 * pair-expanded connection while preserving the same pipeline contract.
 */
export class TinyHypergraphPortPointPathingSolver extends BaseSolver {
  private readonly inputNodeWithPortPoints: InputNodeWithPortPoints[]
  private readonly layerMapper: LayerMapper
  private readonly assignedPortPointsByNodeId = new Map<
    CapacityMeshNodeId,
    PortPoint[]
  >()
  private readonly routedConnectionPaths: RoutedConnectionPath[] = []
  private readonly occupiedPortIds = new Set<string>()
  private readonly connectionQueue: HyperGraphConnection[]
  private outputNodeWithPortPoints: NodeWithPortPoints[] = []
  private currentConnectionIndex = 0
  private currentConnection: HyperGraphConnection | null = null
  private latestPathPorts: HyperGraphPort[] = []
  private latestSearchState: {
    avoidOccupiedPorts: boolean
    visitedRegionIds: CapacityMeshNodeId[]
    frontierRegionIds: CapacityMeshNodeId[]
    candidatePortIds: string[]
    currentRegionId: CapacityMeshNodeId | null
  } | null = null

  public constructor(
    private readonly params: TinyHypergraphPortPointPathingSolverParams,
  ) {
    super()
    this.MAX_ITERATIONS = Math.max(params.connections.length + 1, 1)
    this.layerMapper = new LayerMapper(this.params.graph.getLayerCount())
    this.inputNodeWithPortPoints = params.graph.regions.map((region) =>
      this.createInputNode(region),
    )
    this.connectionQueue = [...params.connections]
    this.initializeAssignedPortPoints()
    this.refreshOutputNodes()
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
   * Computes one routing pass for a single connection at a time.
   */
  public override _step(): void {
    const connection = this.connectionQueue.shift()
    if (!connection) {
      this.currentConnection = null
      this.solved = true
      return
    }

    this.currentConnection = connection
    this.routeConnection(connection)
    this.currentConnectionIndex += 1
    this.refreshOutputNodes()
    this.stats = {
      currentConnectionId: connection.connectionId,
      processedConnectionCount: this.currentConnectionIndex,
      totalConnectionCount: this.params.connections.length,
      latestPathPortCount: this.latestPathPorts.length,
      occupiedPortCount: this.occupiedPortIds.size,
    }
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
    const latestPathPortIds = new Set(
      this.latestPathPorts.map((port) => port.portId),
    )
    const visitedRegionIds = new Set(
      this.latestSearchState?.visitedRegionIds ?? [],
    )
    const frontierRegionIds = new Set(
      this.latestSearchState?.frontierRegionIds ?? [],
    )
    const candidatePortIds = new Set(
      this.latestSearchState?.candidatePortIds ?? [],
    )
    const graphics: Required<GraphicsObject> = {
      arrows: [],
      circles: [],
      infiniteLines: [],
      lines: [],
      points: [],
      polygons: [],
      rects: [],
      texts: [],
      title: "Tiny HyperGraph",
      coordinateSystem: "cartesian",
    }

    for (const region of this.params.graph.regions) {
      graphics.rects.push({
        center: region.node.center,
        width: Math.max(region.node.width - 0.05, 0.05),
        height: Math.max(region.node.height - 0.05, 0.05),
        layer: getRegionVisualizationLayer(region),
        fill: this.getRegionRectFill(region),
        stroke:
          this.iterations === 0
            ? "rgba(128, 128, 128, 0.5)"
            : frontierRegionIds.has(region.regionId)
              ? "rgba(245, 158, 11, 0.95)"
              : visitedRegionIds.has(region.regionId)
                ? "rgba(34, 197, 94, 0.9)"
                : "rgba(128, 128, 128, 0.2)",
        label: createLabel(
          `region: ${region.regionId}`,
          `assigned: ${
            this.assignedPortPointsByNodeId.get(region.regionId)?.length ?? 0
          }`,
          this.currentConnection?.startRegion.regionId === region.regionId
            ? "endpoint: start"
            : undefined,
          this.currentConnection?.endRegion.regionId === region.regionId
            ? "endpoint: end"
            : undefined,
        ),
      })
    }

    for (const routedPath of this.routedConnectionPaths) {
      this.pushConnectionVisualization(graphics, routedPath.connection, {
        pathPorts: routedPath.pathPorts,
      })
    }

    if (this.iterations === 0) {
      for (const port of this.params.graph.ports) {
        graphics.circles.push({
          center: port.getRenderPoint(PORT_LAYER_COORDINATE_OFFSET),
          radius: 0.05,
          fill:
            port.data.z > 0
              ? "rgba(52, 152, 219, 0.55)"
              : "rgba(128, 128, 128, 0.5)",
          layer: port.getVisualizationLayer(),
          label: createLabel(
            `port: ${port.data.portId}`,
            `connects: ${port.region1.regionId} <-> ${port.region2.regionId}`,
            `z: ${port.data.z}`,
          ),
        })
      }
    } else {
      for (const port of this.params.graph.ports) {
        if (
          this.occupiedPortIds.has(port.portId) ||
          latestPathPortIds.has(port.portId)
        ) {
          continue
        }

        const isCandidatePort = candidatePortIds.has(port.portId)
        graphics.circles.push({
          center: port.getRenderPoint(PORT_LAYER_COORDINATE_OFFSET),
          radius: isCandidatePort ? 0.06 : 0.04,
          fill:
            port.data.z > 0
              ? "rgba(52, 152, 219, 0.2)"
              : "rgba(128, 128, 128, 0.2)",
          stroke: isCandidatePort ? "rgba(245, 158, 11, 0.95)" : undefined,
          layer: port.getVisualizationLayer(),
          label: createLabel(
            `port: ${port.data.portId}`,
            `connects: ${port.region1.regionId} <-> ${port.region2.regionId}`,
            `z: ${port.data.z}`,
            isCandidatePort ? "candidate" : "state: unassigned",
          ),
        })
      }
    }

    if (this.currentConnection && !this.solved) {
      graphics.lines.push({
        points: [
          this.currentConnection.getEndpointPoint(0),
          this.currentConnection.getEndpointPoint(1),
        ],
        strokeColor: this.currentConnection.getDebugColor(0.8),
        strokeDash: "10 5",
        label: createLabel(
          this.currentConnection.connectionId,
          `root: ${this.currentConnection.mutuallyConnectedNetworkId}`,
        ),
      })
    }

    graphics.texts = this.currentConnection
      ? [
          {
            x: this.currentConnection.startRegion.node.center.x,
            y: this.currentConnection.startRegion.node.center.y,
            text: createLabel(
              this.currentConnection.connectionId,
              `${this.currentConnectionIndex}/${this.params.connections.length}`,
              this.latestSearchState
                ? `mode: ${
                    this.latestSearchState.avoidOccupiedPorts
                      ? "avoid-occupied"
                      : "allow-occupied"
                  }`
                : undefined,
            ),
          },
        ]
      : []

    graphics.title = [
      "Tiny HyperGraph",
      `iter=${this.iterations}`,
      `${this.currentConnectionIndex}/${this.params.connections.length}`,
      this.solved ? "solved" : "running",
    ].join(" | ")

    return graphics
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

  private initializeAssignedPortPoints(): void {
    for (const region of this.params.graph.regions) {
      this.assignedPortPointsByNodeId.set(region.regionId, [])
    }
  }

  /**
   * Routes one connection and stores any assigned path ports into the current
   * node-to-port-point output map.
   *
   * @param connection - Pair-expanded connection currently being processed.
   */
  private routeConnection(connection: HyperGraphConnection): void {
    const pathPorts =
      this.findPath(connection, true) ?? this.findPath(connection, false) ?? []

    this.latestPathPorts = pathPorts
    this.routedConnectionPaths.push(
      new RoutedConnectionPath(connection, pathPorts),
    )

    for (const port of pathPorts) {
      this.occupiedPortIds.add(port.portId)
    }

    for (const port of pathPorts) {
      for (const region of [port.region1, port.region2]) {
        const portPoints = this.assignedPortPointsByNodeId.get(region.regionId)
        if (!portPoints) {
          continue
        }

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

  private refreshOutputNodes(): void {
    this.outputNodeWithPortPoints = this.params.graph.regions.map((region) =>
      this.createOutputNode(
        region.node,
        this.assignedPortPointsByNodeId.get(region.regionId) ?? [],
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

  /**
   * Returns the base fill for a region using the same palette family as the
   * upstream tiny-hypergraph visualizer.
   *
   * @param region - Region to color.
   * @returns RGBA color data.
   */
  private getBaseRegionFillColor(region: HyperGraphRegion): RgbaColor {
    if (region.node._offBoardConnectionId) {
      return new RgbaColor(255, 100, 255, 0.6)
    }

    if (region.node._containsObstacle) {
      return new RgbaColor(255, 200, 100, 0.5)
    }

    if (region.node.availableZ.every((z) => z > 0)) {
      return new RgbaColor(52, 152, 219, 0.08)
    }

    return new RgbaColor(200, 200, 255, 0.1)
  }

  /**
   * Returns the final region fill including a congestion tint.
   *
   * @param region - Region to color.
   * @returns RGBA string.
   */
  private getRegionRectFill(region: HyperGraphRegion): string {
    const baseFill = this.getBaseRegionFillColor(region)
    const assignedCount =
      this.assignedPortPointsByNodeId.get(region.regionId)?.length ?? 0
    const heat = RgbaColor.clampUnit(assignedCount / 6)
    return baseFill.mix(HOT_REGION_FILL, heat ** 0.8).toCssString()
  }

  /**
   * Returns the line style for one rendered segment.
   *
   * @param connection - Route owner.
   * @param startZ - Segment start z.
   * @param endZ - Segment end z.
   * @returns Stroke style.
   */
  private getSegmentStyle(
    connection: HyperGraphConnection,
    startZ: number,
    endZ: number,
  ): { strokeColor: string; strokeDash?: string } {
    if (startZ !== endZ) {
      return {
        strokeColor: TRANSITION_CROSSING_COLOR,
        strokeDash: TRANSITION_CROSSING_DASH,
      }
    }

    if (startZ > 0) {
      return {
        strokeColor: BOTTOM_LAYER_TRACE_COLOR,
        strokeDash: BOTTOM_LAYER_TRACE_DASH,
      }
    }

    return {
      strokeColor: connection.getDebugColor(),
    }
  }

  /**
   * Pushes the full rendered connection path into the graphics object.
   *
   * @param graphics - Visualization object being assembled.
   * @param connection - Connection to draw.
   * @param params - Routed path ports for the connection.
   */
  private pushConnectionVisualization(
    graphics: Required<GraphicsObject>,
    connection: HyperGraphConnection,
    params: { pathPorts: HyperGraphPort[] },
  ): void {
    const connectionColor = connection.getDebugColor()
    const points = [
      connection.getEndpointPoint(0),
      ...params.pathPorts.map((port) =>
        port.getRenderPoint(PORT_LAYER_COORDINATE_OFFSET),
      ),
      connection.getEndpointPoint(1),
    ]
    const zValues = [
      connection.getEndpointZ(0, this.layerMapper),
      ...params.pathPorts.map((port) => port.data.z),
      connection.getEndpointZ(1, this.layerMapper),
    ]

    for (let index = 0; index < points.length - 1; index++) {
      graphics.lines.push({
        points: [points[index]!, points[index + 1]!],
        layer: `z${zValues[index]}`,
        label: createLabel(
          `route: ${connection.connectionId}`,
          `root: ${connection.mutuallyConnectedNetworkId}`,
          zValues[index] === zValues[index + 1]
            ? `z: ${zValues[index]}`
            : `z: ${zValues[index]} -> ${zValues[index + 1]}`,
        ),
        ...this.getSegmentStyle(
          connection,
          zValues[index]!,
          zValues[index + 1]!,
        ),
      })
    }

    graphics.points.push({
      x: points[0]!.x,
      y: points[0]!.y,
      color: connectionColor,
      label: createLabel(
        `route: ${connection.connectionId}`,
        `root: ${connection.mutuallyConnectedNetworkId}`,
        "endpoint: start",
      ),
    })
    graphics.points.push({
      x: points[points.length - 1]!.x,
      y: points[points.length - 1]!.y,
      color: connectionColor,
      label: createLabel(
        `route: ${connection.connectionId}`,
        `root: ${connection.mutuallyConnectedNetworkId}`,
        "endpoint: end",
      ),
    })

    for (const port of params.pathPorts) {
      const point = port.getRenderPoint(PORT_LAYER_COORDINATE_OFFSET)
      graphics.points.push({
        x: point.x,
        y: point.y,
        color: connectionColor,
        layer: port.getVisualizationLayer(),
        label: createLabel(
          `route: ${connection.connectionId}`,
          `root: ${connection.mutuallyConnectedNetworkId}`,
          `port: ${port.data.portId}`,
          `connects: ${port.region1.regionId} <-> ${port.region2.regionId}`,
          `z: ${port.data.z}`,
        ),
      })
    }
  }

  private findPath(
    connection: HyperGraphConnection,
    avoidOccupiedPorts: boolean,
  ): HyperGraphPort[] | null {
    if (connection.startRegion.regionId === connection.endRegion.regionId) {
      this.latestSearchState = {
        avoidOccupiedPorts,
        visitedRegionIds: [connection.startRegion.regionId],
        frontierRegionIds: [],
        candidatePortIds: [],
        currentRegionId: connection.startRegion.regionId,
      }
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
      this.latestSearchState = {
        avoidOccupiedPorts,
        visitedRegionIds: Array.from(visited),
        frontierRegionIds: queue.map((region) => region.regionId),
        candidatePortIds: candidatePorts.map((port) => port.portId),
        currentRegionId: currentRegion.regionId,
      }

      for (const port of candidatePorts) {
        if (avoidOccupiedPorts && this.occupiedPortIds.has(port.portId)) {
          continue
        }

        const nextRegion = port.getOtherRegion(currentRegion.regionId)

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
      this.latestSearchState = {
        avoidOccupiedPorts,
        visitedRegionIds: Array.from(visited),
        frontierRegionIds: queue.map((region) => region.regionId),
        candidatePortIds: [],
        currentRegionId: null,
      }
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

    const resolvedPath = pathPorts.reverse()
    this.latestSearchState = {
      avoidOccupiedPorts,
      visitedRegionIds: Array.from(visited),
      frontierRegionIds: [],
      candidatePortIds: resolvedPath.map((port) => port.portId),
      currentRegionId: connection.endRegion.regionId,
    }
    return resolvedPath
  }
}
