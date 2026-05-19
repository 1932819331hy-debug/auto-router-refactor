import type { Obstacle } from "../../types/index.ts"
import { RouteBounds } from "../board/RouteBounds.ts"

/**
 * Domain wrapper for a serialized board obstacle.
 */
export class BoardObstacle {
  public constructor(private readonly obstacle: Obstacle) {}

  /**
   * Creates a wrapper around serialized obstacle data.
   *
   * @param obstacle - Serialized obstacle.
   * @returns A wrapper with unchanged obstacle data.
   */
  public static fromJson(obstacle: Obstacle): BoardObstacle {
    return new BoardObstacle(obstacle)
  }

  /**
   * Returns the original serialized obstacle.
   *
   * @returns The unchanged obstacle payload.
   */
  public toJson(): Obstacle {
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
    return RouteBounds.fromCenteredRect(
      this.obstacle.center,
      this.obstacle.width,
      this.obstacle.height,
      this.obstacle.ccwRotationDegrees ?? 0,
    )
  }

  /**
   * Checks whether a point lies inside the obstacle rectangle.
   *
   * @param x - Point x-coordinate.
   * @param y - Point y-coordinate.
   * @returns True when the point lies inside or on the boundary.
   */
  public containsPoint(x: number, y: number): boolean {
    const rotationRadians =
      -((this.obstacle.ccwRotationDegrees ?? 0) * Math.PI) / 180
    const relativeX = x - this.obstacle.center.x
    const relativeY = y - this.obstacle.center.y
    const cosTheta = Math.cos(rotationRadians)
    const sinTheta = Math.sin(rotationRadians)
    const localX = relativeX * cosTheta - relativeY * sinTheta
    const localY = relativeX * sinTheta + relativeY * cosTheta

    return (
      Math.abs(localX) <= this.obstacle.width / 2 &&
      Math.abs(localY) <= this.obstacle.height / 2
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
  public overlaps(other: BoardObstacle): boolean {
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
