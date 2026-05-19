import type { SerializedObstacle } from "../../types/index.ts"
import { RouteBounds } from "../board/RouteBounds.ts"

/**
 * Domain wrapper for a serialized obstacle.
 */
export class Obstacle {
  public constructor(private readonly obstacle: SerializedObstacle) {}

  /**
   * Rotates a world-space point into obstacle-local coordinates.
   *
   * @param x - Point x-coordinate.
   * @param y - Point y-coordinate.
   * @returns Point coordinates in the obstacle's local frame.
   */
  private toLocalPoint(x: number, y: number): { x: number; y: number } {
    const rotationRadians =
      -((this.obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
    const relativeX = x - this.obstacle.center.x
    const relativeY = y - this.obstacle.center.y
    const cosTheta = Math.cos(rotationRadians)
    const sinTheta = Math.sin(rotationRadians)

    return {
      x: relativeX * cosTheta - relativeY * sinTheta,
      y: relativeX * sinTheta + relativeY * cosTheta,
    }
  }

  /**
   * Creates a wrapper around serialized obstacle data.
   *
   * @param obstacle - Serialized obstacle.
   * @returns A wrapper with unchanged obstacle data.
   */
  public static fromJson(obstacle: SerializedObstacle): Obstacle {
    return new Obstacle(obstacle)
  }

  /**
   * Returns the original serialized obstacle.
   *
   * @returns The unchanged obstacle payload.
   */
  public toJson(): SerializedObstacle {
    return this.obstacle
  }

  /**
   * Returns the serialized obstacle identifier when present.
   */
  public get id(): string | undefined {
    return this.obstacle.obstacleId
  }

  /**
   * Returns the serialized obstacle center.
   */
  public get center(): { x: number; y: number } {
    return {
      x: this.obstacle.center.x,
      y: this.obstacle.center.y,
    }
  }

  /**
   * Returns the obstacle's axis-aligned bounding box.
   *
   * @returns Bounds enclosing the obstacle geometry.
   */
  public getBounds(): RouteBounds {
    if (this.obstacle.type === "oval") {
      return RouteBounds.fromCenteredOval(
        this.obstacle.center,
        this.obstacle.width,
        this.obstacle.height,
        this.obstacle.ccwRotationDegrees ?? 0,
      )
    }

    return RouteBounds.fromCenteredRect(
      this.obstacle.center,
      this.obstacle.width,
      this.obstacle.height,
      this.obstacle.ccwRotationDegrees ?? 0,
    )
  }

  /**
   * Checks whether a point lies inside the obstacle geometry.
   *
   * @param x - Point x-coordinate.
   * @param y - Point y-coordinate.
   * @returns True when the point lies inside or on the boundary.
   */
  public containsPoint(x: number, y: number): boolean {
    const localPoint = this.toLocalPoint(x, y)

    if (this.obstacle.type === "oval") {
      const radiusX = this.obstacle.width / 2
      const radiusY = this.obstacle.height / 2

      if (radiusX === 0 || radiusY === 0) {
        return (
          Math.abs(localPoint.x) <= radiusX && Math.abs(localPoint.y) <= radiusY
        )
      }

      return (
        (localPoint.x * localPoint.x) / (radiusX * radiusX) +
          (localPoint.y * localPoint.y) / (radiusY * radiusY) <=
        1
      )
    }

    return (
      Math.abs(localPoint.x) <= this.obstacle.width / 2 &&
      Math.abs(localPoint.y) <= this.obstacle.height / 2
    )
  }

  /**
   * Checks whether this obstacle overlaps another obstacle.
   *
   * This uses the axis-aligned obstacle bounds, which matches the low-risk
   * bounds-driven helper behavior being migrated in phase 2.
   *
   * @param other - Obstacle to compare against.
   * @returns True when the obstacles' bounds overlap.
   */
  public overlaps(other: Obstacle): boolean {
    return this.getBounds().overlaps(other.getBounds())
  }

  /**
   * Returns the serialized layer names associated with the obstacle.
   *
   * @returns Layer names.
   */
  public getLayerNames(): readonly string[] {
    return [...this.obstacle.layers]
  }
}
