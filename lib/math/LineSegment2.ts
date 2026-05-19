import { Point2, type Point2Like } from "./Point2.ts"

/**
 * Immutable 2D line segment with intersection and clearance helpers.
 */
export class LineSegment2 {
  public readonly start: Point2
  public readonly end: Point2

  public constructor(start: Point2Like, end: Point2Like) {
    this.start = Point2.from(start)
    this.end = Point2.from(end)
  }

  /**
   * Creates a segment from two points.
   *
   * @param start - Segment start point.
   * @param end - Segment end point.
   * @returns Segment wrapper.
   */
  public static fromPoints(start: Point2Like, end: Point2Like): LineSegment2 {
    return new LineSegment2(start, end)
  }

  /**
   * Checks whether a point lies on the segment within tolerance.
   *
   * @param point - Point to test.
   * @param tolerance - Allowed geometric tolerance.
   * @returns True when the point lies on the segment.
   */
  public containsPoint(point: Point2Like, tolerance: number): boolean {
    const point2 = Point2.from(point)
    if (Math.abs(this.start.crossTo(this.end, point2)) > tolerance) {
      return false
    }

    return (
      point2.x >= Math.min(this.start.x, this.end.x) - tolerance &&
      point2.x <= Math.max(this.start.x, this.end.x) + tolerance &&
      point2.y >= Math.min(this.start.y, this.end.y) - tolerance &&
      point2.y <= Math.max(this.start.y, this.end.y) + tolerance
    )
  }

  /**
   * Checks whether this segment intersects another segment.
   *
   * @param other - Segment to compare against.
   * @param tolerance - Allowed geometric tolerance.
   * @returns True when the segments touch or cross.
   */
  public intersects(other: LineSegment2, tolerance: number): boolean {
    const o1 = this.getOrientation(other.start, tolerance)
    const o2 = this.getOrientation(other.end, tolerance)
    const o3 = other.getOrientation(this.start, tolerance)
    const o4 = other.getOrientation(this.end, tolerance)

    if (o1 !== o2 && o3 !== o4) {
      return true
    }
    if (o1 === 0 && this.containsPoint(other.start, tolerance)) return true
    if (o2 === 0 && this.containsPoint(other.end, tolerance)) return true
    if (o3 === 0 && other.containsPoint(this.start, tolerance)) return true
    if (o4 === 0 && other.containsPoint(this.end, tolerance)) return true

    return false
  }

  /**
   * Computes the intersection point of two non-parallel infinite lines.
   *
   * The caller is expected to verify segment intersection separately when
   * segment-bounded behavior matters.
   *
   * @param other - Segment whose underlying line is intersected.
   * @param tolerance - Allowed geometric tolerance.
   * @returns Intersection point, or `null` when the lines are parallel.
   */
  public getIntersection(
    other: LineSegment2,
    tolerance: number,
  ): Point2 | null {
    const denominator =
      (this.start.x - this.end.x) * (other.start.y - other.end.y) -
      (this.start.y - this.end.y) * (other.start.x - other.end.x)

    if (Math.abs(denominator) <= tolerance) {
      return null
    }

    const numeratorX =
      (this.start.x * this.end.y - this.start.y * this.end.x) *
        (other.start.x - other.end.x) -
      (this.start.x - this.end.x) *
        (other.start.x * other.end.y - other.start.y * other.end.x)
    const numeratorY =
      (this.start.x * this.end.y - this.start.y * this.end.x) *
        (other.start.y - other.end.y) -
      (this.start.y - this.end.y) *
        (other.start.x * other.end.y - other.start.y * other.end.x)

    return new Point2(numeratorX / denominator, numeratorY / denominator)
  }

  /**
   * Computes the minimum distance from the segment to a point.
   *
   * @param point - Point to measure against.
   * @param tolerance - Allowed geometric tolerance for degenerate segments.
   * @returns Smallest point-to-segment distance.
   */
  public distanceToPoint(point: Point2Like, tolerance: number): number {
    const dx = this.end.x - this.start.x
    const dy = this.end.y - this.start.y
    const lengthSquared = dx * dx + dy * dy

    if (lengthSquared <= tolerance) {
      return this.start.distanceTo(point)
    }

    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - this.start.x) * dx + (point.y - this.start.y) * dy) /
          lengthSquared,
      ),
    )

    return Point2.from(point).distanceTo({
      x: this.start.x + dx * t,
      y: this.start.y + dy * t,
    })
  }

  /**
   * Computes the minimum distance between two segments.
   *
   * @param other - Segment to measure against.
   * @param tolerance - Allowed geometric tolerance.
   * @returns Smallest segment-to-segment distance.
   */
  public getMinimumDistanceTo(other: LineSegment2, tolerance: number): number {
    if (this.intersects(other, tolerance)) {
      return 0
    }

    return Math.min(
      this.distanceToPoint(other.start, tolerance),
      this.distanceToPoint(other.end, tolerance),
      other.distanceToPoint(this.start, tolerance),
      other.distanceToPoint(this.end, tolerance),
    )
  }

  private getOrientation(point: Point2Like, tolerance: number): number {
    const value = this.start.crossTo(this.end, point)
    if (Math.abs(value) <= tolerance) {
      return 0
    }

    return value > 0 ? 1 : -1
  }
}
