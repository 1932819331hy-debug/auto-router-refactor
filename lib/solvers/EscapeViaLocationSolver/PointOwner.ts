import type { SerializedSimpleRouteConnection } from "../../types/index.ts"

/**
 * Associates a merged point with the original owning connection.
 */
export class PointOwner {
  public constructor(
    public readonly connection: SerializedSimpleRouteConnection,
    public readonly pointIndex: number,
  ) {}
}
