import { BaseSolver } from "@tscircuit/solver-utils"

import { CapacityMeshNode } from "../domain/index.ts"
import type { CapacityMeshEdge, CapacityMeshNodeInput } from "../types/index.ts"

/**
 * Builds adjacency edges between capacity mesh nodes that share a border and at
 * least one z-layer.
 */
export class CapacityMeshEdgeSolver extends BaseSolver {
  public readonly nodes: CapacityMeshNode[]
  public edges: CapacityMeshEdge[]

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

        this.edges.push({
          capacityMeshEdgeId: this.getNextCapacityMeshEdgeId(),
          nodeIds: [nodeA.capacityMeshNodeId, nodeB.capacityMeshNodeId],
        })
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
  public override getOutput(): CapacityMeshEdge[] {
    return this.edges
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

        this.edges.push({
          capacityMeshEdgeId: this.getNextCapacityMeshEdgeId(),
          nodeIds: [nodeA.capacityMeshNodeId, nodeB.capacityMeshNodeId],
        })
      }
    }

    for (const targetNode of targetNodes) {
      const hasEdge = this.edges.some((edge) =>
        edge.nodeIds.includes(targetNode.capacityMeshNodeId),
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
        this.edges.push({
          capacityMeshEdgeId: this.getNextCapacityMeshEdgeId(),
          nodeIds: [
            targetNode.capacityMeshNodeId,
            nearestNode.capacityMeshNodeId,
          ],
        })
      }
    }
  }

  private hasEdgeBetween(
    node1: CapacityMeshNode,
    node2: CapacityMeshNode,
  ): boolean {
    return this.edges.some(
      (edge) =>
        edge.nodeIds.includes(node1.capacityMeshNodeId) &&
        edge.nodeIds.includes(node2.capacityMeshNodeId),
    )
  }
}
