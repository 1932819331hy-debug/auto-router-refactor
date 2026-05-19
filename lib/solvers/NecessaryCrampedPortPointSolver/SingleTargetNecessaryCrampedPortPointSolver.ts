import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import type {
  CapacityMeshNode,
  CapacityMeshNodeId,
} from "../../model/index.ts"
import type { SegmentPortPoint } from "../AvailableSegmentPointSolver.ts"

export interface ExploredPortPoint {
  port: SegmentPortPoint
  depth: number
  parent: ExploredPortPoint | null
  countOfCrampedPortPointsInPath: number
}

/**
 * Small breadth-first search that finds exits from a target obstacle node.
 */
export class SingleTargetNecessaryCrampedPortPointSolver extends BaseSolver {
  private readonly queue: ExploredPortPoint[] = []
  private readonly resultExploredPortPoints: ExploredPortPoint[] = []
  private readonly visitedExploredPortPoints = new Map<
    SegmentPortPoint,
    ExploredPortPoint
  >()

  public constructor(
    private readonly input: {
      target: CapacityMeshNode
      mapOfCapacityMeshNodeIdToSegmentPortPoints: Map<
        CapacityMeshNodeId,
        SegmentPortPoint[]
      >
      mapOfCapacityMeshNodeIdToRef: Map<CapacityMeshNodeId, CapacityMeshNode>
      depthLimit: number
      shouldIgnoreCrampedPortPoints: boolean
    },
  ) {
    super()
    if (this.input.depthLimit < 1) {
      throw new Error("Depth limit must be at least 1")
    }
    this._setup()
  }

  public override getSolverName(): string {
    return "SingleTargetNecessaryCrampedPortPointSolver"
  }

  /**
   * Penalizes cramped points heavily so regular exits are always preferred.
   *
   * @param candidate - Candidate path segment.
   * @returns Relative path cost.
   */
  public static getCandidateCost(candidate: ExploredPortPoint): number {
    return candidate.depth + candidate.countOfCrampedPortPointsInPath * 1000
  }

  public override _setup(): void {
    const seedPorts =
      this.input.mapOfCapacityMeshNodeIdToSegmentPortPoints.get(
        this.input.target.capacityMeshNodeId,
      ) ?? []

    for (const seedPort of seedPorts) {
      if (this.input.shouldIgnoreCrampedPortPoints && seedPort.cramped) {
        continue
      }

      const initialCandidate: ExploredPortPoint = {
        port: seedPort,
        depth: 1,
        parent: null,
        countOfCrampedPortPointsInPath: seedPort.cramped ? 1 : 0,
      }
      const existingCandidate = this.visitedExploredPortPoints.get(seedPort)
      if (
        !existingCandidate ||
        SingleTargetNecessaryCrampedPortPointSolver.getCandidateCost(
          initialCandidate,
        ) <
          SingleTargetNecessaryCrampedPortPointSolver.getCandidateCost(
            existingCandidate,
          )
      ) {
        this.visitedExploredPortPoints.set(seedPort, initialCandidate)
        this.queue.push(initialCandidate)
      }
    }
  }

  public override _step(): void {
    if (this.queue.length === 0) {
      this.solved = true
      return
    }

    while (this.queue.length > 0) {
      const currentCandidate = this.queue.shift()
      if (!currentCandidate) {
        break
      }

      const bestKnownCandidate = this.visitedExploredPortPoints.get(
        currentCandidate.port,
      )
      if (bestKnownCandidate !== currentCandidate) {
        continue
      }

      if (currentCandidate.depth === this.input.depthLimit) {
        this.resultExploredPortPoints.push(currentCandidate)
        continue
      }

      const nextNodes = currentCandidate.port.nodeIds.map((nodeId) => {
        const node = this.input.mapOfCapacityMeshNodeIdToRef.get(nodeId)
        if (!node) {
          throw new Error(`Could not find capacity mesh node for id ${nodeId}`)
        }
        return node
      })

      const nextPorts = nextNodes.flatMap(
        (node) =>
          this.input.mapOfCapacityMeshNodeIdToSegmentPortPoints.get(
            node.capacityMeshNodeId,
          ) ?? [],
      )

      for (const nextPort of nextPorts) {
        if (this.input.shouldIgnoreCrampedPortPoints && nextPort.cramped) {
          continue
        }

        const nextCandidate: ExploredPortPoint = {
          port: nextPort,
          depth: currentCandidate.depth + 1,
          parent: currentCandidate,
          countOfCrampedPortPointsInPath:
            currentCandidate.countOfCrampedPortPointsInPath +
            (nextPort.cramped ? 1 : 0),
        }
        const existingCandidate = this.visitedExploredPortPoints.get(nextPort)
        if (
          existingCandidate &&
          SingleTargetNecessaryCrampedPortPointSolver.getCandidateCost(
            existingCandidate,
          ) <=
            SingleTargetNecessaryCrampedPortPointSolver.getCandidateCost(
              nextCandidate,
            )
        ) {
          continue
        }

        this.visitedExploredPortPoints.set(nextPort, nextCandidate)
        this.queue.push(nextCandidate)
      }
    }

    this.solved = true
  }

  public override getOutput(): ExploredPortPoint[] {
    return this.resultExploredPortPoints
  }

  public override visualize(): GraphicsObject {
    return {
      points: Array.from(this.visitedExploredPortPoints.keys()).map(
        (portPoint) => ({
          ...portPoint,
          color: portPoint.cramped ? "blue" : "green",
        }),
      ),
    }
  }
}
