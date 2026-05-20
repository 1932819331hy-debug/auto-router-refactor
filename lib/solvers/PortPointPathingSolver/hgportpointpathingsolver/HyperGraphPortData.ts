import type { PortData as BaseHyperGraphPortData } from "@tscircuit/hypergraph"
import type { CapacityMeshNodeId } from "../../../model/index.ts"
import type { HyperGraphRegion } from "./HyperGraphRegion.ts"

/**
 * Port payload connecting exactly two regions.
 */
export class HyperGraphPortData implements BaseHyperGraphPortData {
  public constructor(
    public readonly portId: string,
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly distToCentermostPortOnZ: number,
    public readonly regions: [HyperGraphRegion, HyperGraphRegion],
  ) {}

  public get id(): string {
    return this.portId
  }

  public get region1Id(): CapacityMeshNodeId {
    return this.regions[0].regionId
  }

  public get region2Id(): CapacityMeshNodeId {
    return this.regions[1].regionId
  }

  /**
   * Returns a lightly shifted point so stacked layers stay visible in debug
   * views.
   *
   * @param layerCoordinateOffset - Per-layer XY offset.
   * @returns Shifted coordinates.
   */
  public getRenderPoint(layerCoordinateOffset = 0): { x: number; y: number } {
    const offset = this.z * layerCoordinateOffset
    return {
      x: this.x + offset,
      y: this.y + offset,
    }
  }

  /**
   * Returns the debug layer label for this port.
   *
   * @returns Stable port layer label.
   */
  public getVisualizationLayer(): string {
    return `z${this.z}`
  }
}
