/**
 * Lightweight 2D point wrapper used by geometry-heavy solvers.
 */
export interface Point2Like {
  x: number
  y: number
}

/**
 * Immutable 2D point with common geometric operations.
 */
export class Point2 implements Point2Like {
  public constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  /**
   * Creates a point from any `{ x, y }` payload.
   *
   * @param point - Source coordinates.
   * @returns A point wrapper with copied coordinates.
   */
  public static from(point: Point2Like): Point2 {
    return new Point2(point.x, point.y)
  }

  /**
   * Returns the Euclidean distance to another point.
   *
   * @param point - Point to measure against.
   * @returns Distance between the two points.
   */
  public distanceTo(point: Point2Like): number {
    return Math.hypot(this.x - point.x, this.y - point.y)
  }

  /**
   * Checks whether another point matches within a tolerance.
   *
   * @param point - Point to compare against.
   * @param tolerance - Allowed distance delta.
   * @returns True when the two points are effectively the same location.
   */
  public matches(point: Point2Like, tolerance: number): boolean {
    return this.distanceTo(point) <= tolerance
  }

  /**
   * Computes the signed cross product of vectors `(this -> a)` and `(this -> b)`.
   *
   * @param a - First point defining the first vector.
   * @param b - Second point defining the second vector.
   * @returns Signed cross-product value.
   */
  public crossTo(a: Point2Like, b: Point2Like): number {
    return (a.x - this.x) * (b.y - this.y) - (a.y - this.y) * (b.x - this.x)
  }

  /**
   * Returns a plain `{ x, y }` object for downstream serialization.
   *
   * @returns Serializable coordinates.
   */
  public toPointLike(): Point2Like {
    return { x: this.x, y: this.y }
  }
}
