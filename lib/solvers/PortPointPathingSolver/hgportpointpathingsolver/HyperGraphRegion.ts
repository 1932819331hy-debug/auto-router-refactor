import type {
  CapacityMeshNode,
  CapacityMeshNodeId,
} from "../../../model/index.ts"
import type { HyperGraphPort } from "./HyperGraphPort.ts"
import type { Region as BaseHyperGraphRegion } from "@tscircuit/hypergraph"

/**
 * Region node in the hypergraph.
 */
export interface HyperGraphRegion extends BaseHyperGraphRegion {
  regionId: CapacityMeshNodeId
  d: CapacityMeshNode
  node: CapacityMeshNode
  ports: HyperGraphPort[]
}
