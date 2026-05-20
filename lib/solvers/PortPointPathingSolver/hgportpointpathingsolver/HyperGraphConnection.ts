import type { Connection as BaseHyperGraphConnection } from "@tscircuit/hypergraph"
import { LayerMapper } from "../../../model/board/LayerMapper.ts"
import type { SimpleRouteConnection } from "../../../model/index.ts"
import type { HyperGraphRegion } from "./HyperGraphRegion.ts"

/**
 * Pair-expanded route request between two hypergraph regions.
 */
export class HyperGraphConnection implements BaseHyperGraphConnection {
  public constructor(
    public readonly connectionId: string,
    public readonly mutuallyConnectedNetworkId: string,
    public readonly startRegion: HyperGraphRegion,
    public readonly endRegion: HyperGraphRegion,
    public readonly simpleRouteConnection: SimpleRouteConnection,
  ) {}

  /**
   * Returns the routed endpoint point when available, falling back to the
   * region center.
   *
   * @param endpointIndex - Endpoint index, start or end.
   * @returns Endpoint coordinates.
   */
  public getEndpointPoint(endpointIndex: 0 | 1): { x: number; y: number } {
    const routePoint = this.simpleRouteConnection.points[endpointIndex]
    if (routePoint) {
      return { x: routePoint.x, y: routePoint.y }
    }

    return this.getEndpointRegion(endpointIndex).node.center
  }

  /**
   * Returns the endpoint z using the route point layer intersection when
   * possible.
   *
   * @param endpointIndex - Endpoint index, start or end.
   * @param layerMapper - Board layer mapper.
   * @returns Shared layer z.
   */
  public getEndpointZ(endpointIndex: 0 | 1, layerMapper: LayerMapper): number {
    const routePoint = this.simpleRouteConnection.points[endpointIndex]
    const region = this.getEndpointRegion(endpointIndex)

    if (!routePoint) {
      return region.node.availableZ[0] ?? 0
    }

    const routePointLayers = routePoint
      .getLayers()
      .map((layerName) => layerMapper.toZ(layerName))
    const sharedZ = region.node.availableZ.find((z) =>
      routePointLayers.includes(z),
    )

    return sharedZ ?? region.node.availableZ[0] ?? 0
  }

  /**
   * Returns a deterministic debug color derived from the connection ids.
   *
   * @param alpha - Desired alpha channel.
   * @returns CSS hsla color string.
   */
  public getDebugColor(alpha = 0.8): string {
    const hashSource = `${this.mutuallyConnectedNetworkId}:${this.connectionId}`
    let hash = 0

    for (let index = 0; index < hashSource.length; index++) {
      hash = hashSource.charCodeAt(index) * 17777 + ((hash << 5) - hash)
    }

    const hue = Math.abs(hash) % 360
    return `hsla(${hue}, 70%, 50%, ${alpha})`
  }

  private getEndpointRegion(endpointIndex: 0 | 1): HyperGraphRegion {
    return endpointIndex === 0 ? this.startRegion : this.endRegion
  }
}
