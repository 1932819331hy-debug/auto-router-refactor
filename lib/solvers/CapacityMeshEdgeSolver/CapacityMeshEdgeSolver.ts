import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "@tscircuit/solver-utils"

import {
  CapacityMeshEdge as CapacityMeshEdgeModel,
  CapacityMeshNode,
} from "../../model/index.ts"
import type {
  CapacityMeshEdge as CapacityMeshEdgeData,
  CapacityMeshNodeInput,
} from "../../types/index.ts"

/**
 * Builds adjacency edges between capacity mesh nodes that share a border and at
 * least one z-layer.
 */
export class CapacityMeshEdgeSolver extends BaseSolver {
  public readonly nodes: CapacityMeshNode[]
  public edges: CapacityMeshEdgeData[]
  private nodeMap?: Map<string, CapacityMeshNode>

  public constructor(nodes: CapacityMeshNodeInput[]) {
    super()
    this.nodes = nodes.map((node) => CapacityMeshNode.from(node))
    this.edges = []
  }

  /**
   * Returns a stable debug name for the solver.
   *
   * @returns Solver identifier.
   */
  public override getSolverName(): string {
    return "CapacityMeshEdgeSolver"
  }

  /**
   * Performs the full adjacency pass in one step.
   */
  public override _step(): void {
    this.edges = []

    for (let i = 0; i < this.nodes.length; i += 1) {
      for (let j = i + 1; j < this.nodes.length; j += 1) {
        const nodeA = this.nodes[i]
        const nodeB = this.nodes[j]
        if (!nodeA || !nodeB) {
          continue
        }
        if (this.shouldSkipEdge(nodeA, nodeB)) {
          continue
        }
        if (!nodeA.areNodesBordering(nodeB)) {
          continue
        }
        if (!nodeA.hasSharedLayer(nodeB)) {
          continue
        }

        this.edges.push(
          CapacityMeshEdgeModel.between({
            capacityMeshEdgeId: this.getNextCapacityMeshEdgeId(),
            nodeIds: [nodeA.capacityMeshNodeId, nodeB.capacityMeshNodeId],
          }).toJson(),
        )
      }
    }

    this.handleTargetNodes()
    this.solved = true
  }

  /**
   * Returns the solved edge list.
   *
   * @returns Mesh adjacency edges.
   */
  public override getOutput(): CapacityMeshEdgeData[] {
    return this.edges
  }

  /**
   * Returns a debug visualization of mesh nodes and solved adjacency edges.
   *
   * @returns Rectangles for nodes and lines for current edges.
   */
  public override visualize(): GraphicsObject {
    const layerFillColors: Record<string, string> = {
      "0,1": "rgba(0,0,0,0.1)",
      "0": "rgba(0,200,200,0.1)",
      "1": "rgba(0,0,200,0.1)",
    }
    const edgeCount = new Map<string, number>()

    for (const edge of this.edges) {
      for (const nodeId of edge.nodeIds) {
        edgeCount.set(nodeId, 1 + (edgeCount.get(nodeId) ?? 0))
      }
    }

    const graphics: GraphicsObject = {
      lines: [],
      points: [],
      rects: this.nodes.map((node) => {
        const lowestZ = Math.min(...node.availableZ)

        return {
          width: Math.max(node.width - 2, node.width * 0.8),
          height: Math.max(node.height - 2, node.height * 0.8),
          center: {
            x: node.center.x + lowestZ * node.width * 0.05,
            y: node.center.y - lowestZ * node.width * 0.05,
          },
          fill: node._containsObstacle
            ? "rgba(255,0,0,0.1)"
            : (layerFillColors[node.availableZ.join(",")] ??
              "rgba(0,200,200,0.1)"),
          label: [
            node.capacityMeshNodeId,
            `availableZ: ${node.availableZ.join(",")}`,
            `target? ${node._containsTarget ?? false}`,
            `obs? ${node._containsObstacle ?? false}`,
            `conn: ${edgeCount.get(node.capacityMeshNodeId) ?? 0}`,
          ].join("\n"),
          layer: `z${node.availableZ.join(",")}`,
        }
      }),
      circles: [],
    }

    if (!this.nodeMap) {
      this.nodeMap = new Map<string, CapacityMeshNode>()
      for (const node of this.nodes) {
        this.nodeMap.set(node.capacityMeshNodeId, node)
      }
    }

    for (const edge of this.edges) {
      const nodeA = this.nodeMap.get(edge.nodeIds[0])
      const nodeB = this.nodeMap.get(edge.nodeIds[1])
      if (!nodeA || !nodeB) {
        continue
      }

      const lowestZA = Math.min(...nodeA.availableZ)
      const lowestZB = Math.min(...nodeB.availableZ)
      const adjustedNodeACenter = {
        x: nodeA.center.x + lowestZA * nodeA.width * 0.05,
        y: nodeA.center.y - lowestZA * nodeA.width * 0.05,
      }
      const adjustedNodeBCenter = {
        x: nodeB.center.x + lowestZB * nodeB.width * 0.05,
        y: nodeB.center.y - lowestZB * nodeB.width * 0.05,
      }
      const availableZ = Array.from(
        new Set([...nodeA.availableZ, ...nodeB.availableZ]),
      ).sort((left, right) => left - right)

      graphics.lines?.push({
        layer: `z${availableZ.join(",")}`,
        points: [adjustedNodeACenter, adjustedNodeBCenter],
        strokeDash:
          nodeA.availableZ.join(",") === nodeB.availableZ.join(",")
            ? undefined
            : "10 5",
      })
    }

    return graphics
  }

  /**
   * Returns reproducible constructor parameters for debugger downloads.
   *
   * @returns Constructor parameter tuple.
   */
  public override getConstructorParams(): [CapacityMeshNode[]] {
    return [this.nodes]
  }

  /**
   * Returns a unique edge id based on the current edge count.
   *
   * @returns Next edge identifier.
   */
  protected getNextCapacityMeshEdgeId(): string {
    return `ce${this.edges.length}`
  }

  /**
   * Prevents edges between artificial straw siblings that came from the same
   * parent node.
   *
   * @param node1 - First node.
   * @param node2 - Second node.
   * @returns Whether this edge should be ignored.
   */
  protected shouldSkipEdge(
    node1: CapacityMeshNode,
    node2: CapacityMeshNode,
  ): boolean {
    return Boolean(
      node1._strawNode &&
        node2._strawNode &&
        node1._strawParentCapacityMeshNodeId ===
          node2._strawParentCapacityMeshNodeId,
    )
  }

  /**
   * Adds fallback edges for target-containing nodes that overlap or would
   * otherwise be isolated inside pad obstacles.
   */
  protected handleTargetNodes(): void {
    const targetNodes = this.nodes.filter((node) => node._containsTarget)

    for (let i = 0; i < targetNodes.length; i += 1) {
      for (let j = i + 1; j < targetNodes.length; j += 1) {
        const nodeA = targetNodes[i]
        const nodeB = targetNodes[j]
        if (!nodeA || !nodeB) {
          continue
        }
        if (!nodeA.hasSharedLayer(nodeB)) {
          continue
        }
        if (!nodeA.touchesOrOverlaps(nodeB)) {
          continue
        }
        if (this.hasEdgeBetween(nodeA, nodeB)) {
          continue
        }

        this.edges.push(
          CapacityMeshEdgeModel.between({
            capacityMeshEdgeId: this.getNextCapacityMeshEdgeId(),
            nodeIds: [nodeA.capacityMeshNodeId, nodeB.capacityMeshNodeId],
          }).toJson(),
        )
      }
    }

    for (const targetNode of targetNodes) {
      const hasEdge = this.edges.some((edge) =>
        CapacityMeshEdgeModel.fromJson(edge).includesNodeId(
          targetNode.capacityMeshNodeId,
        ),
      )
      if (hasEdge) {
        continue
      }

      let nearestNode: CapacityMeshNode | null = null
      let nearestDistance = Number.POSITIVE_INFINITY

      for (const node of this.nodes) {
        if (node._containsObstacle || node._containsTarget) {
          continue
        }
        const distance = targetNode.distanceTo(node)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestNode = node
        }
      }

      if (nearestNode) {
        this.edges.push(
          CapacityMeshEdgeModel.between({
            capacityMeshEdgeId: this.getNextCapacityMeshEdgeId(),
            nodeIds: [
              targetNode.capacityMeshNodeId,
              nearestNode.capacityMeshNodeId,
            ],
          }).toJson(),
        )
      }
    }
  }

  private hasEdgeBetween(
    node1: CapacityMeshNode,
    node2: CapacityMeshNode,
  ): boolean {
    return this.edges.some((edge) =>
      CapacityMeshEdgeModel.fromJson(edge).connectsNodes(
        node1.capacityMeshNodeId,
        node2.capacityMeshNodeId,
      ),
    )
  }
}
