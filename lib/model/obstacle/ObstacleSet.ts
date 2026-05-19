import type { SerializedObstacle } from "../../types/index.ts"
import { RouteBounds } from "../board/RouteBounds.ts"
import { Obstacle } from "./Obstacle.ts"

/**
 * Collection owner for obstacle queries and aggregation.
 */
export class ObstacleSet {
  public constructor(private readonly obstacles: ReadonlyArray<Obstacle>) {}

  /**
   * Creates a collection wrapper around serialized obstacles.
   *
   * @param obstacles - Serialized obstacles.
   * @returns Wrapped obstacle collection.
   */
  public static fromJson(
    obstacles: ReadonlyArray<SerializedObstacle>,
  ): ObstacleSet {
    return new ObstacleSet(
      obstacles.map((obstacle) => Obstacle.fromJson(obstacle)),
    )
  }

  /**
   * Returns the wrapped collection as serialized obstacles.
   *
   * @returns Serialized obstacle array.
   */
  public toJson(): SerializedObstacle[] {
    return this.obstacles.map((obstacle) => obstacle.toJson())
  }

  /**
   * Returns the wrapped obstacle collection.
   *
   * @returns Read-only obstacle wrappers.
   */
  public toArray(): ReadonlyArray<Obstacle> {
    return [...this.obstacles]
  }

  /**
   * Returns aggregate bounds for the obstacle collection.
   *
   * Empty collections preserve the older helper behavior and return zero-sized
   * bounds at the origin.
   *
   * @returns Bounds covering all obstacles.
   */
  public getBounds(): RouteBounds {
    if (this.obstacles.length === 0) {
      return RouteBounds.empty()
    }

    let bounds = this.obstacles[0]!.getBounds()
    for (const obstacle of this.obstacles.slice(1)) {
      bounds = bounds.include(obstacle.getBounds())
    }

    return bounds
  }
}
