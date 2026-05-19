import type {
  CapacityMesh as SerializedCapacityMesh,
  CapacityMeshEdge as SerializedCapacityMeshEdge,
} from "../../types/capacity-mesh.ts"
import type { CapacityMeshNodeId } from "../../types/ids.ts"
import { CapacityMeshEdge } from "./CapacityMeshEdge.ts"
import {
  CapacityMeshNode,
  type CapacityMeshNodeInput,
} from "./CapacityMeshNode.ts"

/**
 * Collection owner for capacity mesh nodes and adjacency edges.
 */
export class CapacityMesh {
  public constructor(
    private readonly nodesValue: ReadonlyArray<CapacityMeshNode>,
    private readonly edgesValue: ReadonlyArray<CapacityMeshEdge>,
  ) {}

  /**
   * Creates a wrapped capacity mesh from serialized transport data.
   *
   * @param mesh - Serialized capacity mesh aggregate.
   * @returns Wrapped mesh.
   */
  public static fromJson(mesh: SerializedCapacityMesh): CapacityMesh {
    return new CapacityMesh(
      mesh.nodes.map((node) => CapacityMeshNode.from(node)),
      mesh.edges.map((edge) => CapacityMeshEdge.fromJson(edge)),
    )
  }

  /**
   * Creates a wrapped mesh from node and edge inputs that may already be
   * wrapped.
   *
   * @param params - Mesh constituents.
   * @returns Wrapped mesh.
   */
  public static from(params: {
    nodes: ReadonlyArray<CapacityMeshNodeInput>
    edges: ReadonlyArray<CapacityMeshEdge | SerializedCapacityMeshEdge>
  }): CapacityMesh {
    return new CapacityMesh(
      params.nodes.map((node) => CapacityMeshNode.from(node)),
      params.edges.map((edge) =>
        edge instanceof CapacityMeshEdge
          ? edge
          : CapacityMeshEdge.fromJson(edge),
      ),
    )
  }

  /**
   * Returns the mesh as transport-safe plain data.
   *
   * @returns Serialized mesh payload.
   */
  public toJson(): SerializedCapacityMesh {
    return {
      nodes: this.nodesValue.map((node) => node.clone()),
      edges: this.edgesValue.map((edge) => edge.toJson()),
    }
  }

  /**
   * Returns all wrapped mesh nodes.
   *
   * @returns Read-only node list.
   */
  public get nodes(): ReadonlyArray<CapacityMeshNode> {
    return [...this.nodesValue]
  }

  /**
   * Returns all wrapped mesh edges.
   *
   * @returns Read-only edge list.
   */
  public get edges(): ReadonlyArray<CapacityMeshEdge> {
    return [...this.edgesValue]
  }

  /**
   * Finds an edge between two node ids, if present.
   *
   * @param leftNodeId - First node id.
   * @param rightNodeId - Second node id.
   * @returns Matching edge wrapper, if any.
   */
  public findEdgeBetween(
    leftNodeId: CapacityMeshNodeId,
    rightNodeId: CapacityMeshNodeId,
  ): CapacityMeshEdge | undefined {
    return this.edgesValue.find((edge) =>
      edge.connectsNodes(leftNodeId, rightNodeId),
    )
  }

  /**
   * Returns all edges incident to the provided node id.
   *
   * @param nodeId - Node id to query.
   * @returns Incident edge wrappers.
   */
  public getEdgesForNode(nodeId: CapacityMeshNodeId): CapacityMeshEdge[] {
    return this.edgesValue.filter((edge) => edge.includesNodeId(nodeId))
  }
}
