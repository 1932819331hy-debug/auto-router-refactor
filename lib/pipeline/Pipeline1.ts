import {
  BasePipelineSolver,
  type BaseSolver,
  definePipelineStep,
  type PipelineStep,
} from "@tscircuit/solver-utils"

import {
  CapacityMeshNode,
  type CapacityMeshNodeParams,
  SimpleRouteJson,
} from "../model/index.ts"
import { AvailableSegmentPointSolver } from "../solvers/AvailableSegmentPointSolver.ts"
import { CapacityMeshEdgeSolver2_NodeTreeOptimization } from "../solvers/CapacityMeshEdgeSolver/CapacityMeshEdgeSolver2_NodeTreeOptimization.ts"
import { EscapeViaLocationSolver } from "../solvers/EscapeViaLocationSolver/EscapeViaLocationSolver.ts"
import { MultiTargetNecessaryCrampedPortPointSolver } from "../solvers/NecessaryCrampedPortPointSolver/MultiTargetNecessaryCrampedPortPointSolver.ts"
import { NetToPointPairsSolver2_OffBoardConnection } from "../solvers/NetToPointPairsSolver2_OffBoardConnection/NetToPointPairsSolver2_OffBoardConnection.ts"
import { NodeDimensionSubdivisionSolver } from "../solvers/NodeDimensionSubdivisionSolver.ts"
import { buildHyperGraph } from "../solvers/PortPointPathingSolver/hgportpointpathingsolver/index.ts"
import { TinyHypergraphPortPointPathingSolver } from "../solvers/PortPointPathingSolver/tinyhypergraph/TinyHypergraphPortPointPathingSolver.ts"
import { PreprocessSimpleRouteJsonSolver } from "../solvers/PreprocessSimpleRouteJsonSolver.ts"
import { RectDiffNodeSolver } from "../solvers/RectDiffNodeSolver.ts"
import type {
  CapacityMeshEdge,
  SerializedSimpleRouteJson,
} from "../types/index.ts"

const DEFAULT_MAX_NODE_DIMENSION = 16
const DEFAULT_MAX_NODE_RATIO = 6
const DEFAULT_MIN_NODE_AREA = 0.1 ** 2

export class Pipeline1 extends BasePipelineSolver<SerializedSimpleRouteJson> {
  public simpleRouteJson: SimpleRouteJson
  public readonly viaDiameter: number
  public readonly minTraceWidth: number
  public readonly maxNodeDimension: number
  public readonly maxNodeRatio: number
  public readonly minNodeArea: number
  public readonly colorMap: Record<string, string>
  public simpleRouteJsonWithEscapeViaLocations?: SimpleRouteJson
  public simpleRouteJsonWithPointPairs?: SimpleRouteJson
  public capacityNodes: CapacityMeshNode[] = []
  public capacityEdges: CapacityMeshEdge[] = []

  public preprocessSimpleRouteJsonSolver?: PreprocessSimpleRouteJsonSolver
  public escapeViaLocationSolver?: EscapeViaLocationSolver
  public netToPointPairsSolver?: NetToPointPairsSolver2_OffBoardConnection
  public nodeSolver?: RectDiffNodeSolver
  public nodeDimensionSubdivisionSolver?: NodeDimensionSubdivisionSolver
  public edgeSolver?: CapacityMeshEdgeSolver2_NodeTreeOptimization
  public availableSegmentPointSolver?: AvailableSegmentPointSolver
  public necessaryCrampedPortPointSolver?: MultiTargetNecessaryCrampedPortPointSolver
  public portPointPathingSolver?: TinyHypergraphPortPointPathingSolver

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
          pipeline.capacityNodes = (
            pipeline.nodeSolver?.getOutput().meshNodes ?? []
          ).map((node) => {
            const normalizedNode = node as typeof node & {
              _offBoardConnectionId?: string
            }

            // Normalize rectdiff output into our local class and explicitly
            // whitelist persisted fields so upstream shape changes do not leak
            // across this pipeline boundary silently.
            return CapacityMeshNode.from({
              capacityMeshNodeId: node.capacityMeshNodeId,
              center: node.center,
              width: node.width,
              height: node.height,
              layer: node.layer,
              availableZ: node.availableZ,
              _depth: node._depth,
              _completelyInsideObstacle: node._completelyInsideObstacle,
              _containsObstacle: node._containsObstacle,
              _containsTarget: node._containsTarget,
              _targetConnectionName: node._targetConnectionName,
              _offBoardConnectionId: normalizedNode._offBoardConnectionId,
              _strawNode: node._strawNode,
              _strawParentCapacityMeshNodeId:
                node._strawParentCapacityMeshNodeId,
              _adjacentNodeIds: node._adjacentNodeIds,
              _parent: node._parent as CapacityMeshNodeParams["_parent"],
            })
          })
        },
      },
    ),
    definePipelineStep(
      "nodeDimensionSubdivisionSolver",
      NodeDimensionSubdivisionSolver,
      (pipeline: Pipeline1) => [
        {
          nodes: pipeline.capacityNodes,
          maxNodeDimension: pipeline.maxNodeDimension,
          maxNodeRatio: pipeline.maxNodeRatio,
          minNodeArea: pipeline.minNodeArea,
        },
      ],
      {
        onSolved: (pipeline: Pipeline1) => {
          pipeline.capacityNodes =
            pipeline.nodeDimensionSubdivisionSolver?.outputNodes ?? []
        },
      },
    ),
    definePipelineStep(
      "edgeSolver",
      CapacityMeshEdgeSolver2_NodeTreeOptimization,
      (pipeline: Pipeline1) => [pipeline.capacityNodes],
      {
        onSolved: (pipeline: Pipeline1) => {
          pipeline.capacityEdges = pipeline.edgeSolver?.edges ?? []
        },
      },
    ),
    definePipelineStep(
      "availableSegmentPointSolver",
      AvailableSegmentPointSolver,
      (pipeline: Pipeline1) => [
        {
          nodes: pipeline.capacityNodes,
          edges: pipeline.capacityEdges || [],
          traceWidth: pipeline.minTraceWidth,
          colorMap: pipeline.colorMap,
          shouldReturnCrampedPortPoints: true,
        },
      ],
    ),
    definePipelineStep(
      "necessaryCrampedPortPointSolver",
      MultiTargetNecessaryCrampedPortPointSolver,
      (pipeline: Pipeline1) => [
        {
          capacityMeshNodes: pipeline.capacityNodes,
          sharedEdgeSegments: pipeline.availableSegmentPointSolver!.getOutput(),
          simpleRouteJson:
            pipeline.simpleRouteJsonWithPointPairs ?? pipeline.simpleRouteJson,
          numberOfCrampedPortPointsToKeep: 5,
        },
      ],
    ),
    definePipelineStep(
      "portPointPathingSolver",
      TinyHypergraphPortPointPathingSolver,
      (pipeline: Pipeline1) => {
        const sharedEdgeSegments =
          pipeline.necessaryCrampedPortPointSolver?.getOutput() ??
          pipeline.availableSegmentPointSolver!.getOutput()
        const { graph, connections } = buildHyperGraph({
          capacityMeshNodes: pipeline.capacityNodes,
          layerCount: pipeline.simpleRouteJson.layerCount,
          segmentPortPoints: sharedEdgeSegments.flatMap(
            (segment) => segment.portPoints,
          ),
          simpleRouteJsonConnections: (
            pipeline.simpleRouteJsonWithPointPairs ?? pipeline.simpleRouteJson
          ).connections,
        })

        return [
          {
            graph,
            connections,
          },
        ]
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
    this.maxNodeDimension = DEFAULT_MAX_NODE_DIMENSION
    this.maxNodeRatio = DEFAULT_MAX_NODE_RATIO
    this.minNodeArea = DEFAULT_MIN_NODE_AREA
    this.colorMap = {}
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
