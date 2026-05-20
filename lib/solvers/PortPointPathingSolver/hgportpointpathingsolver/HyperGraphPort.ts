import type { RegionPort as BaseHyperGraphPort } from "@tscircuit/hypergraph"
import type { CapacityMeshNodeId } from "../../../model/index.ts"
import type { HyperGraphPortData } from "./HyperGraphPortData.ts"
import type { HyperGraphRegion } from "./HyperGraphRegion.ts"

/**
 * Undirected connection point shared by two hypergraph regions.
 */
export class HyperGraphPort implements BaseHyperGraphPort {
  public constructor(
    public readonly d: HyperGraphPortData,
    public readonly region1: HyperGraphRegion,
    public readonly region2: HyperGraphRegion,
  ) {}

  public get data(): HyperGraphPortData {
    return this.d
  }

  /**
   * Stable port identifier.
   *
   * @returns Port id.
   */
  public get portId(): string {
    return this.d.portId
  }

  /**
   * Returns the opposite region from the current region.
   *
   * @param regionId - Current region id.
   * @returns Neighboring region.
   */
  public getOtherRegion(regionId: CapacityMeshNodeId): HyperGraphRegion {
    return this.region1.regionId === regionId ? this.region2 : this.region1
  }

  /**
   * Returns the debug render point for this port.
   *
   * @param layerCoordinateOffset - Per-layer XY offset.
   * @returns Shifted coordinates.
   */
  public getRenderPoint(layerCoordinateOffset = 0): { x: number; y: number } {
    return this.d.getRenderPoint(layerCoordinateOffset)
  }

  /**
   * Returns the debug layer label for this port.
   *
   * @returns Stable port layer label.
   */
  public getVisualizationLayer(): string {
    return this.d.getVisualizationLayer()
  }
}
