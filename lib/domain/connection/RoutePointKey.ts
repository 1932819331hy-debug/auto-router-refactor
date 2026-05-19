import type { PointKey } from "../../types/index.ts"

/**
 * Placeholder owner for future point-key domain behavior.
 */
export class RoutePointKey {
  public constructor(private readonly value: PointKey) {}

  /**
   * Returns the serialized point-key value.
   *
   * @returns The unchanged point key.
   */
  public toString(): PointKey {
    return this.value
  }
}
