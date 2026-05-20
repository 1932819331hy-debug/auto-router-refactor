import type { HyperGraph as BaseHyperGraph } from "@tscircuit/hypergraph"
import type {
  CapacityMeshNode,
  CapacityMeshNodeId,
} from "../../../model/index.ts"
import type { HyperGraphPort } from "./HyperGraphPort.ts"
import type { HyperGraphRegion } from "./HyperGraphRegion.ts"

/**
 * Mutable hypergraph built from capacity-mesh regions and segment port points.
 */
export class HyperGraph implements BaseHyperGraph {
  public readonly ports: HyperGraphPort[] = []
  public readonly regions: HyperGraphRegion[] = []

  /**
   * Adds one region to the graph.
   *
   * @param node - Backing capacity mesh node.
   * @returns Created hypergraph region.
   */
  public addRegion(node: CapacityMeshNode): HyperGraphRegion {
    const region: HyperGraphRegion = {
      regionId: node.capacityMeshNodeId,
      d: node,
      node,
      ports: [],
    }
    this.regions.push(region)
    return region
  }

  /**
   * Adds one port to the graph and both endpoint regions.
   *
   * @param port - Port to register.
   */
  public addPort(port: HyperGraphPort): void {
    this.ports.push(port)
    port.region1.ports.push(port)
    port.region2.ports.push(port)
  }

  /**
   * Finds a region by id.
   *
   * @param regionId - Region id to look up.
   * @returns Matching region when present.
   */
  public getRegion(regionId: CapacityMeshNodeId): HyperGraphRegion | undefined {
    return this.regions.find((region) => region.regionId === regionId)
  }

  /**
   * Derives the layer count from the graph regions.
   *
   * @returns Total number of layers represented by the graph.
   */
  public getLayerCount(): number {
    let maxZ = 0

    for (const region of this.regions) {
      for (const z of region.node.availableZ) {
        maxZ = Math.max(maxZ, z)
      }
    }

    return maxZ + 1
  }
}
