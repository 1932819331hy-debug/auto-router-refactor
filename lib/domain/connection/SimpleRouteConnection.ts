import type { SerializedSimpleRouteConnection } from "../../types/index.ts"
import { RoutePoint } from "./RoutePoint.ts"

/**
 * Domain wrapper for a serialized logical connection.
 */
export class SimpleRouteConnection {
  public constructor(
    private readonly connection: SerializedSimpleRouteConnection,
  ) {}

  /**
   * Creates a wrapper around serialized connection data.
   *
   * @param connection - Serialized route connection.
   * @returns A wrapper with unchanged connection data.
   */
  public static fromJson(
    connection: SerializedSimpleRouteConnection,
  ): SimpleRouteConnection {
    return new SimpleRouteConnection(connection)
  }

  /**
   * Returns the serialized connection.
   *
   * @returns A cloned connection payload.
   */
  public toJson(): SerializedSimpleRouteConnection {
    return structuredClone(this.connection)
  }

  /**
   * Returns the serialized connection name.
   */
  public get name(): string {
    return this.connection.name
  }

  /**
   * Returns wrapped connection points.
   *
   * @returns Read-only point wrappers.
   */
  public get points(): ReadonlyArray<RoutePoint> {
    return this.connection.pointsToConnect.map((point) =>
      RoutePoint.fromJson(point),
    )
  }

  /**
   * Checks whether the connection is marked as off-board.
   *
   * @returns True when the connection is explicitly off-board.
   */
  public isOffBoard(): boolean {
    return this.connection.isOffBoard === true
  }

  /**
   * Checks whether the connection has a root connection name.
   *
   * @returns True when `rootConnectionName` is present.
   */
  public hasRootConnection(): boolean {
    return typeof this.connection.rootConnectionName === "string"
  }

  /**
   * Returns the root connection name when present.
   *
   * @returns Root connection name.
   */
  public getRootName(): string | undefined {
    return this.connection.rootConnectionName
  }

  /**
   * Resolves the effective trace width for this connection.
   *
   * @param defaultWidth - Document-level default trace width.
   * @returns Connection width, falling back to the provided default.
   */
  public getEffectiveTraceWidth(defaultWidth: number): number {
    return this.connection.nominalTraceWidth ?? defaultWidth
  }

  /**
   * Returns stable point keys for all points in the connection.
   *
   * @returns Stable point keys in connection order.
   */
  public getPointKeys(): string[] {
    return this.points.map((point) => point.getKey())
  }
}
