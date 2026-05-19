import {
  BasePipelineSolver,
  type BaseSolver,
  definePipelineStep,
  type PipelineStep,
} from "@tscircuit/solver-utils"

import { SimpleRouteJson } from "../domain/index.ts"
import { EscapeViaLocationSolver } from "../solvers/EscapeViaLocationSolver.ts"
import { NetToPointPairsSolver2_OffBoardConnection } from "../solvers/NetToPointPairsSolver2_OffBoardConnection.ts"
import { PreprocessSimpleRouteJsonSolver } from "../solvers/PreprocessSimpleRouteJsonSolver.ts"
import { RectDiffNodeSolver } from "../solvers/RectDiffNodeSolver.ts"
import type { SerializedSimpleRouteJson } from "../types/index.ts"

type CapacityMeshNode = ReturnType<
  RectDiffNodeSolver["getOutput"]
>["meshNodes"][number]

export class Pipeline1 extends BasePipelineSolver<SerializedSimpleRouteJson> {
  public simpleRouteJson: SimpleRouteJson
  public readonly viaDiameter: number
  public readonly minTraceWidth: number
  public simpleRouteJsonWithEscapeViaLocations?: SimpleRouteJson
  public simpleRouteJsonWithPointPairs?: SimpleRouteJson
  public capacityNodes: CapacityMeshNode[] = []

  public preprocessSimpleRouteJsonSolver?: PreprocessSimpleRouteJsonSolver
  public escapeViaLocationSolver?: EscapeViaLocationSolver
  public netToPointPairsSolver?: NetToPointPairsSolver2_OffBoardConnection
  public nodeSolver?: RectDiffNodeSolver

  public pipelineDef: PipelineStep<BaseSolver>[] = [
    definePipelineStep(
      "preprocessSimpleRouteJsonSolver",
      PreprocessSimpleRouteJsonSolver,
      (pipeline: Pipeline1) => [pipeline.simpleRouteJson],
      {
        onSolved: (pipeline: Pipeline1) => {
          pipeline.setSimpleRouteJson(
            pipeline.preprocessSimpleRouteJsonSolver!.getOutputSimpleRouteJson(),
          )
        },
      },
    ),
    definePipelineStep(
      "escapeViaLocationSolver",
      EscapeViaLocationSolver,
      (pipeline: Pipeline1) => [
        {
          simpleRouteJson: pipeline.simpleRouteJson,
          viaDiameter: pipeline.viaDiameter,
          minTraceWidth: pipeline.minTraceWidth,
          obstacleMargin:
            pipeline.simpleRouteJson.defaultObstacleMargin ?? 0.15,
        },
      ],
      {
        onSolved: (pipeline: Pipeline1) => {
          const nextSimpleRouteJson =
            pipeline.escapeViaLocationSolver?.getOutputSimpleRouteJson() ??
            pipeline.simpleRouteJson
          pipeline.simpleRouteJsonWithEscapeViaLocations = nextSimpleRouteJson
          pipeline.setSimpleRouteJson(nextSimpleRouteJson)
        },
      },
    ),
    definePipelineStep(
      "netToPointPairsSolver",
      NetToPointPairsSolver2_OffBoardConnection,
      (pipeline: Pipeline1) => [pipeline.simpleRouteJson],
      {
        onSolved: (pipeline: Pipeline1) => {
          const nextSimpleRouteJson =
            pipeline.netToPointPairsSolver?.getOutputSimpleRouteJson() ??
            pipeline.simpleRouteJson
          pipeline.simpleRouteJsonWithPointPairs = nextSimpleRouteJson
          pipeline.setSimpleRouteJson(nextSimpleRouteJson)
        },
      },
    ),
    definePipelineStep(
      "nodeSolver",
      RectDiffNodeSolver,
      (pipeline: Pipeline1) => [
        {
          simpleRouteJson:
            pipeline.simpleRouteJsonWithPointPairs ?? pipeline.simpleRouteJson,
        },
      ],
      {
        onSolved: (pipeline: Pipeline1) => {
          pipeline.capacityNodes =
            pipeline.nodeSolver?.getOutput().meshNodes ?? []
        },
      },
    ),
  ]

  public constructor(inputProblem: SerializedSimpleRouteJson) {
    super(inputProblem)

    this.simpleRouteJson = SimpleRouteJson.fromJson(inputProblem)
    this.viaDiameter =
      this.simpleRouteJson.getMinViaPadDiameter() ??
      this.simpleRouteJson.minTraceWidth
    this.minTraceWidth = this.simpleRouteJson.minTraceWidth
  }

  /**
   * Updates the pipeline's current route document between stages.
   *
   * @param simpleRouteJson - Current route document.
   */
  public setSimpleRouteJson(simpleRouteJson: SimpleRouteJson): void {
    this.simpleRouteJson = simpleRouteJson
  }

  /**
   * Returns the routed document produced by the last completed stage.
   *
   * @returns Best available route document.
   */
  public override getOutput(): SerializedSimpleRouteJson {
    return this.simpleRouteJson.toJson()
  }

  /**
   * Returns reproducible constructor parameters for debugger downloads.
   *
   * @returns Constructor parameter tuple.
   */
  public override getConstructorParams(): [SerializedSimpleRouteJson] {
    return [this.inputProblem]
  }
}
