import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import type { SimpleRouteJson } from "../../model/index.ts"
import type { CapacityMeshNode, CapacityMeshNodeId } from "../../model/index.ts"
import type {
  SegmentPortPoint,
  SharedEdgeSegment,
} from "../AvailableSegmentPointSolver.ts"
import {
  SingleTargetNecessaryCrampedPortPointSolver,
  type ExploredPortPoint,
} from "./SingleTargetNecessaryCrampedPortPointSolver.ts"

/**
 * Keeps only cramped points that are necessary to reach obstacle-contained targets.
 */
export class MultiTargetNecessaryCrampedPortPointSolver extends BaseSolver {
  private readonly nodeMap = new Map<CapacityMeshNodeId, CapacityMeshNode>()
  private readonly mapOfCapacityMeshNodeIdToSegmentPortPoints = new Map<
    CapacityMeshNodeId,
    SegmentPortPoint[]
  >()
  private readonly crampedPortPointsToKeep = new Set<SegmentPortPoint>()
  private readonly targetNodes: CapacityMeshNode[] = []
  private readonly unprocessedTargets: CapacityMeshNode[] = []
  private candidatesAtDepth: ExploredPortPoint[] = []
  private currentTarget: CapacityMeshNode | undefined
  private isRunningCrampedPass = false

  public override activeSubSolver: SingleTargetNecessaryCrampedPortPointSolver | null =
    null

  public constructor(
    private readonly input: {
      sharedEdgeSegments: SharedEdgeSegment[]
      capacityMeshNodes: CapacityMeshNode[]
      simpleRouteJson: SimpleRouteJson
      numberOfCrampedPortPointsToKeep: number
    },
  ) {
    super()
    this._setup()
  }

  public override getSolverName(): string {
    return "MultiTargetNecessaryCrampedPortPointSolver"
  }

  public override _setup(): void {
    const routePoints = this.input.simpleRouteJson
      .toJson()
      .connections.flatMap((connection) => connection.pointsToConnect)

    for (const node of this.input.capacityMeshNodes) {
      this.nodeMap.set(node.capacityMeshNodeId, node)

      if (
        node._containsObstacle &&
        routePoints.some((point) => this.isPointInsideNode(point, node))
      ) {
        this.targetNodes.push(node)
        this.unprocessedTargets.push(node)
      }
    }

    this.unprocessedTargets.sort(
      (leftNode, rightNode) => leftNode.center.x - rightNode.center.x,
    )

    for (const sharedEdgeSegment of this.input.sharedEdgeSegments) {
      for (const segmentPortPoint of sharedEdgeSegment.portPoints) {
        for (const nodeId of segmentPortPoint.nodeIds) {
          const existingPortPoints =
            this.mapOfCapacityMeshNodeIdToSegmentPortPoints.get(nodeId) ?? []
          existingPortPoints.push(segmentPortPoint)
          this.mapOfCapacityMeshNodeIdToSegmentPortPoints.set(
            nodeId,
            existingPortPoints,
          )
        }
      }
    }
  }

  public override _step(): void {
    if (this.activeSubSolver) {
      this.activeSubSolver._step()
      if (!this.activeSubSolver.solved) {
        return
      }
      if (this.activeSubSolver.failed) {
        this.failed = true
        this.error = this.activeSubSolver.error
        return
      }

      this.candidatesAtDepth = this.activeSubSolver.getOutput()
      this.activeSubSolver = null

      if (!this.currentTarget) {
        this.failed = true
        this.error = "Missing current capacity mesh node while finishing BFS"
        return
      }

      if (!this.isRunningCrampedPass) {
        const areAllCandidatesBlocked =
          this.candidatesAtDepth.length === 0 ||
          this.isAllCandidatesBlockedByObstacles(this.candidatesAtDepth)

        if (areAllCandidatesBlocked) {
          this.isRunningCrampedPass = true
          this.activeSubSolver =
            new SingleTargetNecessaryCrampedPortPointSolver({
              target: this.currentTarget,
              depthLimit: 2,
              shouldIgnoreCrampedPortPoints: false,
              mapOfCapacityMeshNodeIdToSegmentPortPoints:
                this.mapOfCapacityMeshNodeIdToSegmentPortPoints,
              mapOfCapacityMeshNodeIdToRef: this.nodeMap,
            })
          return
        }

        this.currentTarget = undefined
        return
      }

      const crampedCandidates = this.candidatesAtDepth
        .filter((candidate) => {
          if (!candidate.port.cramped) {
            return false
          }

          const nodes = candidate.port.nodeIds.map((nodeId) => {
            const node = this.nodeMap.get(nodeId)
            if (!node) {
              throw new Error(
                `Could not find capacity mesh node for id ${nodeId}`,
              )
            }
            return node
          })

          return nodes.every((node) => !node._containsObstacle)
        })
        .sort(
          (leftCandidate, rightCandidate) =>
            SingleTargetNecessaryCrampedPortPointSolver.getCandidateCost(
              leftCandidate,
            ) -
            SingleTargetNecessaryCrampedPortPointSolver.getCandidateCost(
              rightCandidate,
            ),
        )

      if (
        crampedCandidates.length === 0 ||
        this.isAllCandidatesBlockedByObstacles(crampedCandidates)
      ) {
        this.error = `All candidates are blocked by obstacles even after including cramped port points for capacity mesh node ${this.currentTarget.capacityMeshNodeId}`
      } else {
        for (const candidate of crampedCandidates.slice(
          0,
          this.input.numberOfCrampedPortPointsToKeep,
        )) {
          this.crampedPortPointsToKeep.add(candidate.port)
          let parentCandidate = candidate.parent
          while (parentCandidate) {
            this.crampedPortPointsToKeep.add(parentCandidate.port)
            parentCandidate = parentCandidate.parent
          }
        }
      }

      this.isRunningCrampedPass = false
      this.currentTarget = undefined
      return
    }

    this.currentTarget = this.unprocessedTargets.shift()
    if (!this.currentTarget) {
      this.solved = true
      return
    }

    this.isRunningCrampedPass = false
    this.candidatesAtDepth = []
    this.activeSubSolver = new SingleTargetNecessaryCrampedPortPointSolver({
      target: this.currentTarget,
      depthLimit: 2,
      shouldIgnoreCrampedPortPoints: true,
      mapOfCapacityMeshNodeIdToSegmentPortPoints:
        this.mapOfCapacityMeshNodeIdToSegmentPortPoints,
      mapOfCapacityMeshNodeIdToRef: this.nodeMap,
    })
  }

  public override getOutput(): SharedEdgeSegment[] {
    return this.input.sharedEdgeSegments.map((segment) => ({
      ...segment,
      portPoints: segment.portPoints.filter(
        (portPoint) =>
          !portPoint.cramped || this.crampedPortPointsToKeep.has(portPoint),
      ),
    }))
  }

  /**
   * Returns true when the point falls inside the node rectangle.
   *
   * @param point - Route point to test.
   * @param node - Capacity mesh node bounds.
   * @returns Whether the point lies inside the node.
   */
  private isPointInsideNode(
    point: { x: number; y: number },
    node: CapacityMeshNode,
  ): boolean {
    return (
      point.x >= node.center.x - node.width / 2 &&
      point.x <= node.center.x + node.width / 2 &&
      point.y >= node.center.y - node.height / 2 &&
      point.y <= node.center.y + node.height / 2
    )
  }

  /**
   * Returns true when every candidate still touches an obstacle node.
   *
   * @param candidates - Candidate list to inspect.
   * @returns Whether all candidates are blocked.
   */
  private isAllCandidatesBlockedByObstacles(
    candidates: ReadonlyArray<ExploredPortPoint>,
  ): boolean {
    for (const candidate of candidates) {
      const isBlocked = candidate.port.nodeIds.some((nodeId) => {
        const node = this.nodeMap.get(nodeId)
        if (!node) {
          throw new Error(`Could not find capacity mesh node for id ${nodeId}`)
        }
        return node._containsObstacle === true
      })

      if (!isBlocked) {
        return false
      }
    }

    return true
  }

  public override visualize(): GraphicsObject {
    return {
      rects: this.targetNodes.map((node) => ({
        ...node,
        fill:
          this.currentTarget?.capacityMeshNodeId === node.capacityMeshNodeId
            ? "rgba(255, 0, 0, 0.5)"
            : "rgba(255, 0, 0, 0.2)",
      })),
      points: [
        ...this.candidatesAtDepth.map((candidate) => ({
          ...candidate.port,
          color: candidate.port.cramped ? "blue" : "green",
        })),
        ...Array.from(this.crampedPortPointsToKeep).map((portPoint) => ({
          ...portPoint,
          color: "blue",
        })),
      ],
    }
  }
}
