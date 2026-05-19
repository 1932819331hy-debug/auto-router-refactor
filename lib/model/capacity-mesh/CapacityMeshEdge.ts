import type { CapacityMeshEdge as SerializedCapacityMeshEdge } from "../../types/capacity-mesh.ts"
import type { CapacityMeshNodeId } from "../../types/ids.ts"

/**
 * Domain wrapper for a serialized capacity mesh edge.
 */
export class CapacityMeshEdge {
  public constructor(private readonly edge: SerializedCapacityMeshEdge) {}

  /**
   * Creates a wrapper around serialized edge data.
   *
   * @param edge - Serialized capacity mesh edge.
   * @returns Wrapped edge instance.
   */
  public static fromJson(edge: SerializedCapacityMeshEdge): CapacityMeshEdge {
    return new CapacityMeshEdge(edge)
  }

  /**
   * Builds a new serialized edge wrapper from two node ids.
   *
   * @param params - Edge identifier and endpoint node ids.
   * @returns Wrapped edge instance.
   */
  public static between(params: {
    capacityMeshEdgeId: string
    nodeIds: [CapacityMeshNodeId, CapacityMeshNodeId]
  }): CapacityMeshEdge {
    return new CapacityMeshEdge({
      capacityMeshEdgeId: params.capacityMeshEdgeId,
      nodeIds: [...params.nodeIds],
    })
  }

  /**
   * Returns the serialized edge payload.
   *
   * @returns Cloned edge transport object.
   */
  public toJson(): SerializedCapacityMeshEdge {
    return {
      capacityMeshEdgeId: this.edge.capacityMeshEdgeId,
      nodeIds: [...this.edge.nodeIds],
    }
  }

  /**
   * Returns the stable edge identifier.
   */
  public get id(): string {
    return this.edge.capacityMeshEdgeId
  }

  /**
   * Returns the edge endpoint node ids in stored order.
   *
   * @returns Two endpoint node ids.
   */
  public get nodeIds(): [CapacityMeshNodeId, CapacityMeshNodeId] {
    return [...this.edge.nodeIds]
  }

  /**
   * Checks whether the edge touches the provided node id.
   *
   * @param nodeId - Node id to test.
   * @returns True when the node is an endpoint of this edge.
   */
  public includesNodeId(nodeId: CapacityMeshNodeId): boolean {
    return this.edge.nodeIds.includes(nodeId)
  }

  /**
   * Checks whether the edge connects the provided node pair in either order.
   *
   * @param leftNodeId - First node id.
   * @param rightNodeId - Second node id.
   * @returns True when the edge connects the two node ids.
   */
  public connectsNodes(
    leftNodeId: CapacityMeshNodeId,
    rightNodeId: CapacityMeshNodeId,
  ): boolean {
    return (
      (this.edge.nodeIds[0] === leftNodeId &&
        this.edge.nodeIds[1] === rightNodeId) ||
      (this.edge.nodeIds[0] === rightNodeId &&
        this.edge.nodeIds[1] === leftNodeId)
    )
  }

  /**
   * Returns the opposite endpoint when the provided node id belongs to the
   * edge.
   *
   * @param nodeId - Known endpoint node id.
   * @returns The opposite endpoint node id, if any.
   */
  public getOtherNodeId(
    nodeId: CapacityMeshNodeId,
  ): CapacityMeshNodeId | undefined {
    if (this.edge.nodeIds[0] === nodeId) {
      return this.edge.nodeIds[1]
    }
    if (this.edge.nodeIds[1] === nodeId) {
      return this.edge.nodeIds[0]
    }

    return undefined
  }
}
