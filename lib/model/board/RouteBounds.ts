/**
 * Immutable board-bounds value object.
 */
export class RouteBounds {
  public constructor(
    public readonly minX: number,
    public readonly maxX: number,
    public readonly minY: number,
    public readonly maxY: number,
  ) {}

  /**
   * Creates an empty bounds object centered at the origin.
   *
   * @returns Zero-sized bounds.
   */
  public static empty(): RouteBounds {
    return new RouteBounds(0, 0, 0, 0)
  }

  /**
   * Creates bounds from a serialized bounds object.
   *
   * @param bounds - Serialized bounds.
   * @returns Wrapped immutable bounds.
   */
  public static fromJson(bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }): RouteBounds {
    return new RouteBounds(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY)
  }

  /**
   * Creates axis-aligned bounds for a centered rectangle, including rotation.
   *
   * @param center - Rectangle center.
   * @param width - Rectangle width.
   * @param height - Rectangle height.
   * @param ccwRotationDegrees - Optional counter-clockwise rotation.
   * @returns Axis-aligned bounds enclosing the rectangle.
   */
  public static fromCenteredRect(
    center: { x: number; y: number },
    width: number,
    height: number,
    ccwRotationDegrees = 0,
  ): RouteBounds {
    const halfWidth = width / 2
    const halfHeight = height / 2
    const rotationRadians = (ccwRotationDegrees * Math.PI) / 180
    const cosTheta = Math.cos(rotationRadians)
    const sinTheta = Math.sin(rotationRadians)
    const xExtent =
      Math.abs(cosTheta) * halfWidth + Math.abs(sinTheta) * halfHeight
    const yExtent =
      Math.abs(sinTheta) * halfWidth + Math.abs(cosTheta) * halfHeight

    return new RouteBounds(
      center.x - xExtent,
      center.x + xExtent,
      center.y - yExtent,
      center.y + yExtent,
    )
  }

  /**
   * Creates axis-aligned bounds for a centered oval, including rotation.
   *
   * @param center - Oval center.
   * @param width - Oval width.
   * @param height - Oval height.
   * @param ccwRotationDegrees - Optional counter-clockwise rotation.
   * @returns Axis-aligned bounds enclosing the oval.
   */
  public static fromCenteredOval(
    center: { x: number; y: number },
    width: number,
    height: number,
    ccwRotationDegrees = 0,
  ): RouteBounds {
    const radiusX = width / 2
    const radiusY = height / 2
    const rotationRadians = (ccwRotationDegrees * Math.PI) / 180
    const cosTheta = Math.cos(rotationRadians)
    const sinTheta = Math.sin(rotationRadians)
    const xExtent = Math.sqrt(
      radiusX * radiusX * cosTheta * cosTheta +
        radiusY * radiusY * sinTheta * sinTheta,
    )
    const yExtent = Math.sqrt(
      radiusX * radiusX * sinTheta * sinTheta +
        radiusY * radiusY * cosTheta * cosTheta,
    )

    return new RouteBounds(
      center.x - xExtent,
      center.x + xExtent,
      center.y - yExtent,
      center.y + yExtent,
    )
  }

  /**
   * Expands this bounds object to include another bounds object.
   *
   * @param other - Bounds to merge in.
   * @returns Combined bounds covering both inputs.
   */
  public include(other: RouteBounds): RouteBounds {
    return new RouteBounds(
      Math.min(this.minX, other.minX),
      Math.max(this.maxX, other.maxX),
      Math.min(this.minY, other.minY),
      Math.max(this.maxY, other.maxY),
    )
  }

  /**
   * Checks whether the bounds contains a point.
   *
   * @param x - Point x-coordinate.
   * @param y - Point y-coordinate.
   * @returns True when the point lies inside or on the boundary.
   */
  public containsPoint(x: number, y: number): boolean {
    return x >= this.minX && x <= this.maxX && y >= this.minY && y <= this.maxY
  }

  /**
   * Checks whether two bounds overlap with positive area.
   *
   * @param other - Bounds to compare against.
   * @returns True when the bounds overlap.
   */
  public overlaps(other: RouteBounds): boolean {
    return (
      Math.max(this.minX, other.minX) < Math.min(this.maxX, other.maxX) &&
      Math.max(this.minY, other.minY) < Math.min(this.maxY, other.maxY)
    )
  }

  /**
   * Returns the serialized bounds shape.
   *
   * @returns Bounds suitable for transport types.
   */
  public toJson(): { minX: number; maxX: number; minY: number; maxY: number } {
    return {
      minX: this.minX,
      maxX: this.maxX,
      minY: this.minY,
      maxY: this.maxY,
    }
  }
}
