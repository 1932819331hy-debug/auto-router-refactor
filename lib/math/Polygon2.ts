import { LineSegment2 } from "./LineSegment2.ts"
import { Point2, type Point2Like } from "./Point2.ts"

/**
 * Immutable polygon wrapper with containment and boundary helpers.
 */
export class Polygon2 {
  public readonly vertices: Point2[]

  public constructor(points: ReadonlyArray<Point2Like>) {
    this.vertices = points.map((point) => Point2.from(point))
  }

  /**
   * Creates a polygon from a vertex list.
   *
   * @param points - Ordered polygon vertices.
   * @returns Polygon wrapper.
   */
  public static fromPoints(points: ReadonlyArray<Point2Like>): Polygon2 {
    return new Polygon2(points)
  }

  /**
   * Returns the boundary segments in winding order.
   *
   * @returns Polygon boundary segments.
   */
  public getSegments(): LineSegment2[] {
    return this.vertices.map(
      (start, index) =>
        new LineSegment2(
          start,
          this.vertices[(index + 1) % this.vertices.length]!,
        ),
    )
  }

  /**
   * Checks whether a point is inside the polygon or on its boundary.
   *
   * @param point - Point to test.
   * @param tolerance - Allowed geometric tolerance for boundary hits.
   * @returns True when the point is inside or on an edge.
   */
  public containsPointOrBoundary(
    point: Point2Like,
    tolerance: number,
  ): boolean {
    const point2 = Point2.from(point)
    let inside = false

    for (const segment of this.getSegments()) {
      if (segment.containsPoint(point2, tolerance)) {
        return true
      }

      const start = segment.start
      const end = segment.end
      const intersects =
        start.y > point2.y !== end.y > point2.y &&
        point2.x <
          ((end.x - start.x) * (point2.y - start.y)) / (end.y - start.y) +
            start.x

      if (intersects) {
        inside = !inside
      }
    }

    return inside
  }

  /**
   * Checks whether a segment crosses or comes too close to the polygon boundary.
   *
   * Intersections only count as a crossing when they happen away from shared
   * endpoints. Distances below `margin` are also treated as blocked.
   *
   * @param segment - Candidate path segment.
   * @param margin - Required clearance from the boundary.
   * @param tolerance - Allowed geometric tolerance.
   * @returns True when the segment violates the boundary clearance.
   */
  public crossesBoundary(
    segment: LineSegment2,
    margin: number,
    tolerance: number,
  ): boolean {
    for (const boundarySegment of this.getSegments()) {
      if (segment.intersects(boundarySegment, tolerance)) {
        const hit = segment.getIntersection(boundarySegment, tolerance)
        if (
          hit &&
          !hit.matches(segment.start, tolerance) &&
          !hit.matches(segment.end, tolerance) &&
          !hit.matches(boundarySegment.start, tolerance) &&
          !hit.matches(boundarySegment.end, tolerance)
        ) {
          return true
        }
      }

      if (
        segment.getMinimumDistanceTo(boundarySegment, tolerance) + tolerance <
        margin
      ) {
        return true
      }
    }

    return false
  }
}
