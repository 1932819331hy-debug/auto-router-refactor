import { BaseSolver } from "@tscircuit/solver-utils"

import {
  LayerMapper,
  Obstacle,
  RoutedTrace,
  type SimpleRouteJson,
} from "../model/index.ts"
import type {
  SerializedObstacle,
  SerializedSimpleRouteJson,
  SimplifiedPcbViaRouteStep,
} from "../types/index.ts"

const MIN_OBSTACLE_DIMENSION = 0.001
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

/**
 * Converts serialized routed traces into obstacle geometry owned by the
 * preprocessing solver.
 */
class TraceObstacleProjector {
  private readonly layerMapper: LayerMapper
  private readonly viaDiameter: number

  public constructor(private readonly simpleRouteJson: SimpleRouteJson) {
    this.layerMapper = new LayerMapper(simpleRouteJson.layerCount)
    this.viaDiameter =
      simpleRouteJson.getMinViaPadDiameter() ?? simpleRouteJson.minTraceWidth
  }

  /**
   * Projects all trace geometry into blocking obstacles.
   *
   * @returns Obstacles representing fixed routed geometry.
   */
  public project(): SerializedObstacle[] {
    const obstacles: SerializedObstacle[] = []

    for (const [
      traceIndex,
      traceJson,
    ] of this.simpleRouteJson.traces.entries()) {
      const trace = RoutedTrace.fromJson(traceJson)
      obstacles.push(...this.projectTraceVias(trace, traceIndex))
      obstacles.push(...this.projectTraceSegments(trace, traceIndex))
    }

    return obstacles
  }

  private projectTraceVias(
    trace: RoutedTrace,
    traceIndex: number,
  ): SerializedObstacle[] {
    const obstacles: SerializedObstacle[] = []

    for (const [stepIndex, routedStep] of trace.steps.entries()) {
      const viaStep = routedStep.asVia()
      if (viaStep) {
        obstacles.push(
          this.createViaObstacle({
            trace,
            traceIndex,
            stepIndex,
            step: viaStep,
          }),
        )
      }

      const throughObstacleStep = routedStep.asThroughObstacle()
      if (throughObstacleStep) {
        const obstacle = this.createSegmentObstacle({
          obstacleId: this.getObstacleId(
            trace,
            traceIndex,
            stepIndex,
            "through",
          ),
          start: throughObstacleStep.start,
          end: throughObstacleStep.end,
          width: throughObstacleStep.width,
          layers: this.getLayerSpan(
            throughObstacleStep.from_layer,
            throughObstacleStep.to_layer,
          ),
        })
        if (obstacle) {
          obstacles.push(obstacle)
        }
      }
    }

    return obstacles
  }

  private projectTraceSegments(
    trace: RoutedTrace,
    traceIndex: number,
  ): SerializedObstacle[] {
    const obstacles: SerializedObstacle[] = []
    const steps = trace.steps

    for (let stepIndex = 0; stepIndex < steps.length - 1; stepIndex += 1) {
      const currentStep = steps[stepIndex]?.asWire()
      const nextStep = steps[stepIndex + 1]?.asWire()
      if (!currentStep || !nextStep) {
        continue
      }
      if (currentStep.layer !== nextStep.layer) {
        continue
      }

      const obstacle = this.createSegmentObstacle({
        obstacleId: this.getObstacleId(trace, traceIndex, stepIndex, "wire"),
        start: currentStep,
        end: nextStep,
        width: currentStep.width,
        layers: [currentStep.layer],
      })
      if (obstacle) {
        obstacles.push(obstacle)
      }
    }

    return obstacles
  }

  private createViaObstacle(params: {
    trace: RoutedTrace
    traceIndex: number
    stepIndex: number
    step: SimplifiedPcbViaRouteStep
  }): SerializedObstacle {
    const { trace, traceIndex, stepIndex, step } = params
    const viaDiameter = step.via_diameter ?? this.viaDiameter

    return {
      obstacleId: this.getObstacleId(trace, traceIndex, stepIndex, "via"),
      type: "rect",
      layers: this.getLayerSpan(step.from_layer, step.to_layer),
      center: { x: step.x, y: step.y },
      width: Math.max(viaDiameter, MIN_OBSTACLE_DIMENSION),
      height: Math.max(viaDiameter, MIN_OBSTACLE_DIMENSION),
      connectedTo: [],
    }
  }

  private createSegmentObstacle(params: {
    obstacleId: string
    start: { x: number; y: number }
    end: { x: number; y: number }
    width: number
    layers: string[]
  }): SerializedObstacle | null {
    const { obstacleId, start, end, width, layers } = params
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (length <= MIN_OBSTACLE_DIMENSION) {
      return null
    }

    return {
      obstacleId,
      type: "rect",
      layers,
      center: {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      },
      width: length,
      height: Math.max(width, MIN_OBSTACLE_DIMENSION),
      ccwRotationDegrees: (Math.atan2(dy, dx) * 180) / Math.PI,
      connectedTo: [],
    }
  }

  private getLayerSpan(fromLayer: string, toLayer: string): string[] {
    const fromZ = this.layerMapper.toZ(fromLayer)
    const toZ = this.layerMapper.toZ(toLayer)
    const minZ = Math.min(fromZ, toZ)
    const maxZ = Math.max(fromZ, toZ)
    const layers: string[] = []

    for (let z = minZ; z <= maxZ; z += 1) {
      layers.push(this.layerMapper.fromZ(z))
    }

    return layers
  }

  private getObstacleId(
    trace: RoutedTrace,
    traceIndex: number,
    stepIndex: number,
    suffix: string,
  ): string {
    return `trace_obstacle_${trace.id}_${traceIndex}_${stepIndex}_${suffix}`
  }
}
