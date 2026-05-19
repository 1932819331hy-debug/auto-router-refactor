import type { CapacityMeshNodeInput } from "../types/index.ts"
import type { CapacityMeshNode } from "../model/index.ts"
import { CapacityMeshEdgeSolver } from "./CapacityMeshEdgeSolver.ts"

/**
 * Faster edge generation pass that limits adjacency checks to nearby nodes.
 */
export class CapacityMeshEdgeSolver2_NodeTreeOptimization extends CapacityMeshEdgeSolver {
  private readonly edgeSet: Set<string>
  private currentNodeIndex: number

  public constructor(nodes: CapacityMeshNodeInput[]) {
    super(nodes)
    this.MAX_ITERATIONS = 10e6
    this.edgeSet = new Set<string>()
    this.currentNodeIndex = 0
  }

  /**
   * Returns a stable debug name for the solver.
   *
   * @returns Solver identifier.
   */
  public override getSolverName(): string {
    return "CapacityMeshEdgeSolver2_NodeTreeOptimization"
  }

  /**
   * Incrementally emits edges by checking each node against nearby candidates.
   */
  public override _step(): void {
    if (this.currentNodeIndex >= this.nodes.length) {
      this.handleTargetNodes()
      this.solved = true
      return
    }

    const nodeA = this.nodes[this.currentNodeIndex]
    if (!nodeA) {
      this.currentNodeIndex += 1
      return
    }

    const nearbyNodes = this.getNearbyNodes(nodeA)
    for (const nodeB of nearbyNodes) {
      if (nodeA.capacityMeshNodeId === nodeB.capacityMeshNodeId) {
        continue
      }
      if (this.shouldSkipEdge(nodeA, nodeB)) {
        continue
      }
      if (!nodeA.hasSharedLayer(nodeB)) {
        continue
      }
      if (!nodeA.areNodesBordering(nodeB)) {
        continue
      }

      const edgeKey = `${nodeA.capacityMeshNodeId}-${nodeB.capacityMeshNodeId}`
      if (this.edgeSet.has(edgeKey)) {
        continue
      }

      this.edgeSet.add(edgeKey)
      this.edgeSet.add(
        `${nodeB.capacityMeshNodeId}-${nodeA.capacityMeshNodeId}`,
      )
      this.edges.push({
        capacityMeshEdgeId: this.getNextCapacityMeshEdgeId(),
        nodeIds: [nodeA.capacityMeshNodeId, nodeB.capacityMeshNodeId],
      })
    }

    this.currentNodeIndex += 1
  }

  private getNearbyNodes(node: CapacityMeshNode): CapacityMeshNode[] {
    const searchWidth = node.width * 2
    const searchHeight = node.height * 2
    const minX = node.center.x - searchWidth / 2
    const maxX = node.center.x + searchWidth / 2
    const minY = node.center.y - searchHeight / 2
    const maxY = node.center.y + searchHeight / 2

    return this.nodes.filter((candidate) => {
      const candidateMinX = candidate.center.x - candidate.width / 2
      const candidateMaxX = candidate.center.x + candidate.width / 2
      const candidateMinY = candidate.center.y - candidate.height / 2
      const candidateMaxY = candidate.center.y + candidate.height / 2

      return (
        candidateMaxX >= minX &&
        candidateMinX <= maxX &&
        candidateMaxY >= minY &&
        candidateMinY <= maxY
      )
    })
  }
}
