import type { CapacityMeshNode } from "../model"
import type { CapacityMeshNodeId } from "./ids"

/**
 * Undirected adjacency edge between two capacity mesh nodes.
 */
export interface CapacityMeshEdge {
  capacityMeshEdgeId: string
  nodeIds: [CapacityMeshNodeId, CapacityMeshNodeId]
}

/**
 * Convenience aggregate used by higher-level solvers.
 */
export interface CapacityMesh {
  nodes: CapacityMeshNode[]
  edges: CapacityMeshEdge[]
}
