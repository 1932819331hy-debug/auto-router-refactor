import type {
  ConnectionPoint,
  MultiLayerConnectionPoint,
  PointId,
  PointKey,
  SingleLayerConnectionPoint,
} from "../../types/index.ts"

function isSingleLayerPoint(
  point: ConnectionPoint,
): point is SingleLayerConnectionPoint {
  return "layer" in point && typeof point.layer === "string"
}

function isMultiLayerPoint(
  point: ConnectionPoint,
): point is MultiLayerConnectionPoint {
  return "layers" in point && Array.isArray(point.layers)
}

/**
 * Domain wrapper for a serialized connection point.
 */
export class RoutePoint {
  public constructor(private readonly point: ConnectionPoint) {}

  /**
   * Creates a wrapper around serialized point data.
   *
   * @param point - Serialized connection point.
   * @returns A wrapper with unchanged point data.
   */
  public static fromJson(point: ConnectionPoint): RoutePoint {
    return new RoutePoint(point)
  }

  /**
   * Returns the original serialized point.
   *
   * @returns The unchanged point payload.
   */
  public toJson(): ConnectionPoint {
    return this.point
  }

  /**
   * Returns the serialized x-coordinate.
   */
  public get x(): number {
    return this.point.x
  }

  /**
   * Returns the serialized y-coordinate.
   */
  public get y(): number {
    return this.point.y
  }

  /**
   * Returns the serialized point identifier when present.
   */
  public get pointId(): PointId | undefined {
    return this.point.pointId
  }

  /**
   * Checks whether this point uses the single-layer transport shape.
   *
   * @returns True when the point has a single `layer`.
   */
  public isSingleLayer(): boolean {
    return isSingleLayerPoint(this.point)
  }

  /**
   * Checks whether this point uses the multi-layer transport shape.
   *
   * @returns True when the point has a `layers` array.
   */
  public isMultiLayer(): boolean {
    return isMultiLayerPoint(this.point)
  }

  /**
   * Returns the primary layer used by older helper callsites.
   *
   * For multi-layer points this preserves the prior behavior of returning the
   * first layer in the list.
   *
   * @returns Primary layer name.
   */
  public getPrimaryLayer(): string {
    const primaryLayer = this.getLayers()[0]
    if (!primaryLayer) {
      throw new Error("Connection point does not define any layers")
    }

    return primaryLayer
  }

  /**
   * Returns all serialized layer names for the point.
   *
   * @returns Point layer names.
   */
  public getLayers(): readonly string[] {
    const point = this.point
    if (isMultiLayerPoint(point)) {
      return [...point.layers]
    }

    return [point.layer]
  }

  /**
   * Builds a stable point key for indexing and deduplication.
   *
   * This preserves the older behavior of preferring `pointId`, otherwise using
   * rounded coordinates plus a sorted layer key.
   *
   * @returns Stable point key string.
   */
  public getKey(): PointKey {
    const point = this.point
    if (point.pointId) {
      return point.pointId
    }

    const layerKey = isSingleLayerPoint(point)
      ? point.layer
      : [...point.layers].sort().join("-")

    return `${point.x.toFixed(4)},${point.y.toFixed(4)},${layerKey}`
  }

  /**
   * Checks whether the serialized point is associated with a PCB port.
   *
   * @returns True when `pcb_port_id` is present.
   */
  public hasPortId(): boolean {
    return typeof this.point.pcb_port_id === "string"
  }
}
