import { BaseSolver } from "@tscircuit/solver-utils"

import { CapacityMeshNode } from "../domain/index.ts"
import type { CapacityMeshNodeInput } from "../types/index.ts"

const DEFAULT_MIN_NODE_AREA = 0.1 ** 2

/**
 * Constructor shape for node subdivision.
 */
export interface NodeDimensionSubdivisionSolverParams {
  nodes: CapacityMeshNodeInput[]
  maxNodeDimension: number
  maxNodeRatio?: number
  minNodeArea?: number
}

/**
 * Splits large or skinny capacity mesh nodes into a regular grid so later
 * routing stages operate on more uniform geometry.
 */
export class NodeDimensionSubdivisionSolver extends BaseSolver {
  public readonly nodes: CapacityMeshNode[]
  public readonly maxNodeDimension: number
  public readonly maxNodeRatio: number
  public readonly minNodeArea: number
  public readonly outputNodes: CapacityMeshNode[]

  public constructor(params: NodeDimensionSubdivisionSolverParams) {
    super()
    this.nodes = params.nodes.map((node) => CapacityMeshNode.from(node))
    this.maxNodeDimension = params.maxNodeDimension
    this.maxNodeRatio = params.maxNodeRatio ?? Number.POSITIVE_INFINITY
    this.minNodeArea = params.minNodeArea ?? DEFAULT_MIN_NODE_AREA
    this.outputNodes = []
  }

  /**
   * Returns a stable debug name for the solver.
   *
   * @returns Solver identifier.
   */
  public override getSolverName(): string {
    return "NodeDimensionSubdivisionSolver"
  }

  /**
   * Performs the subdivision pass in one step.
   */
  public override _step(): void {
    let subdividedNodeCount = 0
    let removedSmallNodeCount = 0

    for (const node of this.nodes) {
      const subdividedNodes = this.subdivideNode(node)
      if (subdividedNodes.length === 0) {
        removedSmallNodeCount += 1
        continue
      }
      if (subdividedNodes.length > 1) {
        subdividedNodeCount += 1
      }
      this.outputNodes.push(...subdividedNodes)
    }

    this.stats = {
      inputNodeCount: this.nodes.length,
      outputNodeCount: this.outputNodes.length,
      subdividedNodeCount,
      removedSmallNodeCount,
      maxNodeDimension: this.maxNodeDimension,
      maxNodeRatio: this.maxNodeRatio,
      minNodeArea: this.minNodeArea,
    }
    this.solved = true
  }

  /**
   * Returns the solved node list.
   *
   * @returns Subdivided mesh nodes.
   */
  public override getOutput(): CapacityMeshNode[] {
    return this.outputNodes
  }

  /**
   * Returns reproducible constructor parameters for debugger downloads.
   *
   * @returns Constructor parameter tuple.
   */
  public override getConstructorParams(): [
    NodeDimensionSubdivisionSolverParams,
  ] {
    return [
      {
        nodes: this.nodes,
        maxNodeDimension: this.maxNodeDimension,
        maxNodeRatio: this.maxNodeRatio,
        minNodeArea: this.minNodeArea,
      },
    ]
  }

  private subdivideNode(node: CapacityMeshNode): CapacityMeshNode[] {
    if (this.shouldRemoveNode(node)) {
      return []
    }

    const { cols, rows } = this.getSubdivisionGrid(node)
    if (cols === 1 && rows === 1) {
      return [node]
    }

    const childWidth = node.width / cols
    const childHeight = node.height / rows
    const minX = node.center.x - node.width / 2
    const minY = node.center.y - node.height / 2
    const childNodes: CapacityMeshNode[] = []

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        childNodes.push(node.clone({
          capacityMeshNodeId: `${node.capacityMeshNodeId}__sub_${row}_${col}`,
          center: {
            x: minX + childWidth * (col + 0.5),
            y: minY + childHeight * (row + 0.5),
          },
          width: childWidth,
          height: childHeight,
          availableZ: node.availableZ,
        }))
      }
    }

    return childNodes
  }

  private getSubdivisionGrid(node: CapacityMeshNode): {
    cols: number
    rows: number
  } {
    const hasDimensionLimit =
      Number.isFinite(this.maxNodeDimension) && this.maxNodeDimension > 0
    const hasRatioLimit =
      Number.isFinite(this.maxNodeRatio) && this.maxNodeRatio > 0

    let cols = hasDimensionLimit
      ? Math.max(1, Math.ceil(node.width / this.maxNodeDimension))
      : 1
    let rows = hasDimensionLimit
      ? Math.max(1, Math.ceil(node.height / this.maxNodeDimension))
      : 1

    if (hasRatioLimit && node.width > 0 && node.height > 0) {
      while (true) {
        const childWidth = node.width / cols
        const childHeight = node.height / rows
        const childRatio =
          childWidth >= childHeight
            ? childWidth / childHeight
            : childHeight / childWidth

        if (childRatio <= this.maxNodeRatio) {
          break
        }

        if (childWidth >= childHeight) {
          cols += 1
        } else {
          rows += 1
        }
      }
    }

    return { cols, rows }
  }

  private shouldRemoveNode(node: CapacityMeshNode): boolean {
    const hasMinAreaLimit =
      Number.isFinite(this.minNodeArea) && this.minNodeArea > 0

    return hasMinAreaLimit && node.width * node.height < this.minNodeArea
  }
}
