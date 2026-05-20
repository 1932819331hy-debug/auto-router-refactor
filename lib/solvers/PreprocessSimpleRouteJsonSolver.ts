import { BaseSolver } from "@tscircuit/solver-utils"

import { Obstacle, type SimpleRouteJson } from "../model/index.ts"
import type { SerializedSimpleRouteJson } from "../types/index.ts"
import { TraceObstacleProjector } from "./PreprocessSimpleRouteJsonSolver/TraceObstacleProjector.ts"
/**
 * Preprocesses route JSON before later routing stages consume it.
 *
 * The current behavior normalizes the incoming SRJ and converts any
 * pre-supplied routed traces into blocking obstacles so later stages treat
 * those routes as fixed geometry.
 */
export class PreprocessSimpleRouteJsonSolver extends BaseSolver {
  private readonly inputSimpleRouteJson: SimpleRouteJson
  private outputSimpleRouteJsonValue?: SimpleRouteJson

  public constructor(simpleRouteJson: SimpleRouteJson) {
    super()
    this.inputSimpleRouteJson = simpleRouteJson
    this.MAX_ITERATIONS = 1
  }

  /**
   * Performs one-shot preprocessing work.
   */
  public override _step(): void {
    const traceObstacles = new TraceObstacleProjector(
      this.inputSimpleRouteJson,
    ).project()

    this.outputSimpleRouteJsonValue =
      traceObstacles.length === 0
        ? this.inputSimpleRouteJson
        : this.inputSimpleRouteJson.withObstacles([
            ...this.inputSimpleRouteJson.obstacles,
            ...traceObstacles.map((obstacle) => Obstacle.fromJson(obstacle)),
          ])

    this.solved = true
  }

  /**
   * Returns the preprocessed route document as a domain wrapper.
   *
   * @returns Updated route input wrapper.
   */
  public getOutputSimpleRouteJson(): SimpleRouteJson {
    if (!this.outputSimpleRouteJsonValue) {
      throw new Error("PreprocessSimpleRouteJsonSolver has not solved yet")
    }

    return this.outputSimpleRouteJsonValue
  }

  /**
   * Returns the preprocessed route document.
   *
   * @returns Updated route JSON with normalized configuration.
   */
  public getOutputSerializedSimpleRouteJson(): SerializedSimpleRouteJson {
    return this.getOutputSimpleRouteJson().toJson()
  }

  /**
   * Returns standardized pipeline output.
   *
   * @returns Solved route document.
   */
  public override getOutput(): SerializedSimpleRouteJson {
    return this.getOutputSerializedSimpleRouteJson()
  }

  /**
   * Returns reproducible constructor parameters for debugger downloads.
   *
   * @returns Constructor parameter tuple.
   */
  public override getConstructorParams(): [SerializedSimpleRouteJson] {
    return [this.inputSimpleRouteJson.toJson()]
  }
}
