import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import type { CapacityMeshNode, CapacityMeshNodeId } from "../domain/index.ts"
import type { CapacityMeshEdge } from "../types/index.ts"

export interface SegmentPortPoint {
  segmentPortPointId: string
  x: number
  y: number
  availableZ: number[]
  nodeIds: [CapacityMeshNodeId, CapacityMeshNodeId]
  edgeId: string
  connectionName: string | null
  rootConnectionName?: string
  distToCentermostPortOnZ: number
  cramped: boolean
}

export interface SharedEdgeSegment {
  edgeId: string
  nodeIds: [CapacityMeshNodeId, CapacityMeshNodeId]
  start: { x: number; y: number }
  end: { x: number; y: number }
  availableZ: number[]
  portPoints: SegmentPortPoint[]
}

/**
 * Computes candidate port points on the shared border of adjacent mesh nodes.
 */
export class AvailableSegmentPointSolver extends BaseSolver {
  public readonly nodes: CapacityMeshNode[]
  public readonly edges: CapacityMeshEdge[]
  public readonly traceWidth: number
  public readonly obstacleMargin: number
  public readonly minPortSpacing: number
  public readonly nodeMap: Map<CapacityMeshNodeId, CapacityMeshNode>
  public readonly nodeEdgeMap: Map<CapacityMeshNodeId, CapacityMeshEdge[]>
  public readonly colorMap: Record<string, string>
  public readonly shouldReturnCrampedPortPoints: boolean
  public readonly sharedEdgeSegments: SharedEdgeSegment[] = []
  public readonly edgeSegmentMap = new Map<string, SharedEdgeSegment>()
  public readonly portPointMap = new Map<string, SegmentPortPoint>()

  public constructor({
    nodes,
    edges,
    traceWidth,
    obstacleMargin,
    colorMap,
    shouldReturnCrampedPortPoints,
  }: {
    nodes: CapacityMeshNode[]
    edges: CapacityMeshEdge[]
    traceWidth: number
    obstacleMargin?: number
    colorMap?: Record<string, string>
    shouldReturnCrampedPortPoints: boolean
  }) {
    super()
    this.nodes = nodes
    this.edges = edges
    this.traceWidth = traceWidth
    this.obstacleMargin = obstacleMargin ?? 0.15
    this.shouldReturnCrampedPortPoints = shouldReturnCrampedPortPoints
    this.minPortSpacing = this.traceWidth + this.obstacleMargin
    this.colorMap = colorMap ?? {}
    this.nodeMap = new Map(nodes.map((node) => [node.capacityMeshNodeId, node]))
    this.nodeEdgeMap = this.createNodeEdgeMap(edges)
    this.MAX_ITERATIONS = 1
  }

  public override getSolverName(): string {
    return "AvailableSegmentPointSolver"
  }

  public override _step(): void {
    this.computeAllSharedEdgeSegments()
    this.solved = true
  }

  /**
   * Returns all shared-edge segments with their computed port points.
   *
   * @returns Computed shared-edge segments.
   */
  public override getOutput(): SharedEdgeSegment[] {
    return this.sharedEdgeSegments
  }

  public getAvailablePortPointsBetweenNodes(
    nodeId1: CapacityMeshNodeId,
    nodeId2: CapacityMeshNodeId,
  ): SegmentPortPoint[] {
    const edge = this.edges.find(
      (candidate) =>
        (candidate.nodeIds[0] === nodeId1 &&
          candidate.nodeIds[1] === nodeId2) ||
        (candidate.nodeIds[0] === nodeId2 && candidate.nodeIds[1] === nodeId1),
    )
    if (!edge) {
      return []
    }

    const segment = this.edgeSegmentMap.get(edge.capacityMeshEdgeId)
    if (!segment) {
      return []
    }

    return segment.portPoints.filter(
      (portPoint) => portPoint.connectionName === null,
    )
  }

  public getPortPointsForEdge(
    nodeId1: CapacityMeshNodeId,
    nodeId2: CapacityMeshNodeId,
  ): SegmentPortPoint[] {
    const edge = this.edges.find(
      (candidate) =>
        (candidate.nodeIds[0] === nodeId1 &&
          candidate.nodeIds[1] === nodeId2) ||
        (candidate.nodeIds[0] === nodeId2 && candidate.nodeIds[1] === nodeId1),
    )
    if (!edge) {
      return []
    }

    return this.edgeSegmentMap.get(edge.capacityMeshEdgeId)?.portPoints ?? []
  }

  public assignPortPoint(
    segmentPortPointId: string,
    connectionName: string,
    rootConnectionName?: string,
  ): boolean {
    const portPoint = this.portPointMap.get(segmentPortPointId)
    if (!portPoint || portPoint.connectionName !== null) {
      return false
    }

    portPoint.connectionName = connectionName
    portPoint.rootConnectionName = rootConnectionName
    return true
  }

  public releasePortPoint(segmentPortPointId: string): boolean {
    const portPoint = this.portPointMap.get(segmentPortPointId)
    if (!portPoint) {
      return false
    }

    portPoint.connectionName = null
    portPoint.rootConnectionName = undefined
    return true
  }

  public getAvailablePortCountForEdge(
    nodeId1: CapacityMeshNodeId,
    nodeId2: CapacityMeshNodeId,
  ): number {
    return this.getAvailablePortPointsBetweenNodes(nodeId1, nodeId2).length
  }

  public override visualize(): GraphicsObject {
    const graphics: GraphicsObject = {
      lines: [],
      rects: [],
      circles: [],
    }

    for (const segment of this.sharedEdgeSegments) {
      graphics.lines?.push({
        points: [segment.start, segment.end],
        strokeColor: "rgba(100, 100, 100, 0.5)",
      })

      for (const portPoint of segment.portPoints) {
        const fill = portPoint.connectionName
          ? (this.colorMap[portPoint.connectionName] ?? "blue")
          : "rgba(0, 200, 0, 0.7)"

        if (portPoint.cramped) {
          graphics.rects?.push({
            center: { x: portPoint.x, y: portPoint.y },
            width: 0.1,
            height: 0.1,
            fill,
            layer: `z${portPoint.availableZ.join(",")}`,
            label: `cramped ${portPoint.segmentPortPointId}`,
          })
          continue
        }

        graphics.circles?.push({
          center: { x: portPoint.x, y: portPoint.y },
          radius: this.traceWidth / 2,
          fill,
          layer: `z${portPoint.availableZ.join(",")}`,
          label: [
            portPoint.segmentPortPointId,
            portPoint.connectionName,
            portPoint.availableZ.join(","),
            `cd: ${portPoint.distToCentermostPortOnZ}`,
            `connects: ${portPoint.nodeIds.join(",")}`,
          ]
            .filter(Boolean)
            .join("\n"),
        })
      }
    }

    return graphics
  }

  private computeAllSharedEdgeSegments(): void {
    for (const edge of this.edges) {
      const [nodeId1, nodeId2] = edge.nodeIds
      const node1 = this.nodeMap.get(nodeId1)
      const node2 = this.nodeMap.get(nodeId2)
      if (!node1 || !node2) {
        continue
      }

      const segment = this.computeSharedEdgeSegment(edge, node1, node2)
      if (!segment) {
        continue
      }

      this.sharedEdgeSegments.push(segment)
      this.edgeSegmentMap.set(edge.capacityMeshEdgeId, segment)
      for (const portPoint of segment.portPoints) {
        this.portPointMap.set(portPoint.segmentPortPointId, portPoint)
      }
    }
  }

  /**
   * Builds a lookup from node id to all incident capacity mesh edges.
   *
   * @param edges - Capacity mesh edges to index.
   * @returns Incident edge list per node id.
   */
  private createNodeEdgeMap(
    edges: ReadonlyArray<CapacityMeshEdge>,
  ): Map<CapacityMeshNodeId, CapacityMeshEdge[]> {
    const nodeEdgeMap = new Map<CapacityMeshNodeId, CapacityMeshEdge[]>()

    for (const edge of edges) {
      for (const nodeId of edge.nodeIds) {
        const existingEdges = nodeEdgeMap.get(nodeId) ?? []
        existingEdges.push(edge)
        nodeEdgeMap.set(nodeId, existingEdges)
      }
    }

    return nodeEdgeMap
  }

  private computeSharedEdgeSegment(
    edge: CapacityMeshEdge,
    node1: CapacityMeshNode,
    node2: CapacityMeshNode,
  ): SharedEdgeSegment | null {
    const overlap = this.findOverlappingSegment(node1, node2)
    if (!overlap) {
      return null
    }

    const availableZ = node1.availableZ.filter((z) =>
      node2.availableZ.includes(z),
    )
    if (availableZ.length === 0) {
      return null
    }

    const segmentLength = Math.hypot(
      overlap.end.x - overlap.start.x,
      overlap.end.y - overlap.start.y,
    )
    const edgeMargin = (this.minPortSpacing * 3) / 4
    const effectiveLength = Math.max(0, segmentLength - edgeMargin * 2)

    if (
      effectiveLength <= 0 &&
      !node1._containsTarget &&
      !node2._containsTarget
    ) {
      if (!this.shouldReturnCrampedPortPoints) {
        return null
      }

      return {
        edgeId: edge.capacityMeshEdgeId,
        nodeIds: [node1.capacityMeshNodeId, node2.capacityMeshNodeId],
        start: overlap.start,
        end: overlap.end,
        availableZ,
        portPoints: availableZ.map((z) => ({
          segmentPortPointId: `${edge.capacityMeshEdgeId}_pp0_z${z}_cramped`,
          x: (overlap.start.x + overlap.end.x) / 2,
          y: (overlap.start.y + overlap.end.y) / 2,
          availableZ: [z],
          nodeIds: [node1.capacityMeshNodeId, node2.capacityMeshNodeId],
          edgeId: edge.capacityMeshEdgeId,
          connectionName: null,
          distToCentermostPortOnZ: 0,
          cramped: true,
        })),
      }
    }

    let maxPortPoints = Math.max(
      1,
      Math.floor(effectiveLength / this.minPortSpacing) + 1,
    )

    if (node1._offBoardConnectionId || node2._offBoardConnectionId) {
      if (
        node1._offBoardConnectionId &&
        !node2._offBoardConnectionId &&
        this.shouldSkipOffBoardPortPoint(node1, node2)
      ) {
        return null
      }
      if (
        node2._offBoardConnectionId &&
        !node1._offBoardConnectionId &&
        this.shouldSkipOffBoardPortPoint(node2, node1)
      ) {
        return null
      }
      maxPortPoints = 1
    }

    if (maxPortPoints > 5) {
      maxPortPoints = 5 + Math.floor(maxPortPoints / 4)
    }

    const dx = overlap.end.x - overlap.start.x
    const dy = overlap.end.y - overlap.start.y
    const centerX = (overlap.start.x + overlap.end.x) / 2
    const centerY = (overlap.start.y + overlap.end.y) / 2

    const xyPositions = Array.from({ length: maxPortPoints }, (_, index) => {
      const fraction =
        segmentLength === 0 || maxPortPoints === 1
          ? 0.5
          : (edgeMargin + (effectiveLength * index) / (maxPortPoints - 1)) /
            segmentLength
      const x = overlap.start.x + dx * fraction
      const y = overlap.start.y + dy * fraction
      return {
        x,
        y,
        distToCenter: Math.hypot(x - centerX, y - centerY),
      }
    })

    const centermostPosition = xyPositions.reduce((best, position) =>
      position.distToCenter < best.distToCenter ? position : best,
    )

    const portPoints: SegmentPortPoint[] = []
    for (let index = 0; index < maxPortPoints; index += 1) {
      const position = xyPositions[index]
      if (!position) {
        continue
      }

      const distToCentermostPortOnZ = Math.hypot(
        position.x - centermostPosition.x,
        position.y - centermostPosition.y,
      )

      for (const z of availableZ) {
        portPoints.push({
          segmentPortPointId: `${edge.capacityMeshEdgeId}_pp${index}_z${z}`,
          x: position.x,
          y: position.y,
          availableZ: [z],
          nodeIds: [node1.capacityMeshNodeId, node2.capacityMeshNodeId],
          edgeId: edge.capacityMeshEdgeId,
          connectionName: null,
          distToCentermostPortOnZ,
          cramped: false,
        })
      }
    }

    return {
      edgeId: edge.capacityMeshEdgeId,
      nodeIds: [node1.capacityMeshNodeId, node2.capacityMeshNodeId],
      start: overlap.start,
      end: overlap.end,
      availableZ,
      portPoints,
    }
  }

  private shouldSkipOffBoardPortPoint(
    offBoardNode: CapacityMeshNode,
    middleNode: CapacityMeshNode,
  ): boolean {
    const middleNodeEdges =
      this.nodeEdgeMap.get(middleNode.capacityMeshNodeId) ?? []
    for (const edge of middleNodeEdges) {
      const otherNodeId =
        edge.nodeIds[0] === middleNode.capacityMeshNodeId
          ? edge.nodeIds[1]
          : edge.nodeIds[0]
      if (otherNodeId === offBoardNode.capacityMeshNodeId) {
        continue
      }

      const otherNode = this.nodeMap.get(otherNodeId)
      if (!otherNode) {
        continue
      }
      if (
        otherNode._offBoardConnectionId !== offBoardNode._offBoardConnectionId
      ) {
        continue
      }

      const nodesWithSameOffBoardId = this.nodes.filter(
        (node) =>
          node._offBoardConnectionId === offBoardNode._offBoardConnectionId,
      )
      if (nodesWithSameOffBoardId.length !== 2) {
        continue
      }

      const midpoint = {
        x: (offBoardNode.center.x + otherNode.center.x) / 2,
        y: (offBoardNode.center.y + otherNode.center.y) / 2,
      }
      const insideMiddleNode =
        midpoint.x >= middleNode.center.x - middleNode.width / 2 &&
        midpoint.x <= middleNode.center.x + middleNode.width / 2 &&
        midpoint.y >= middleNode.center.y - middleNode.height / 2 &&
        midpoint.y <= middleNode.center.y + middleNode.height / 2
      if (insideMiddleNode) {
        return true
      }
    }

    return false
  }

  private findOverlappingSegment(
    node: CapacityMeshNode,
    adjacentNode: CapacityMeshNode,
  ): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
    const xOverlap = {
      start: Math.max(
        node.center.x - node.width / 2,
        adjacentNode.center.x - adjacentNode.width / 2,
      ),
      end: Math.min(
        node.center.x + node.width / 2,
        adjacentNode.center.x + adjacentNode.width / 2,
      ),
    }
    const yOverlap = {
      start: Math.max(
        node.center.y - node.height / 2,
        adjacentNode.center.y - adjacentNode.height / 2,
      ),
      end: Math.min(
        node.center.y + node.height / 2,
        adjacentNode.center.y + adjacentNode.height / 2,
      ),
    }

    const xRange = xOverlap.end - xOverlap.start
    const yRange = yOverlap.end - yOverlap.start
    const epsilon = 0.0001
    if (xRange < -epsilon || yRange < -epsilon) {
      return null
    }

    if (xRange < yRange) {
      const x = (xOverlap.start + xOverlap.end) / 2
      return {
        start: { x, y: yOverlap.start },
        end: { x, y: yOverlap.end },
      }
    }

    const y = (yOverlap.start + yOverlap.end) / 2
    return {
      start: { x: xOverlap.start, y },
      end: { x: xOverlap.end, y },
    }
  }
}
