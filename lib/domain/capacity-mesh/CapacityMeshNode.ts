import type { CapacityMeshNodeId } from "../../types"

/**
 * Numeric tolerance used by geometry comparisons on capacity mesh nodes.
 */
const BORDER_EPSILON = 0.001

/**
 * Serializable constructor shape for a capacity mesh node.
 */
export interface SerializableCapacityMeshNodeParams {
  capacityMeshNodeId: CapacityMeshNodeId
  center: { x: number; y: number }
  width: number
  height: number
  layer: string
  availableZ: number[]
  _depth?: number
  _completelyInsideObstacle?: boolean
  _containsObstacle?: boolean
  _containsTarget?: boolean
  _targetConnectionName?: string
  _offBoardConnectionId?: string
  _strawNode?: boolean
  _strawParentCapacityMeshNodeId?: CapacityMeshNodeId
  _adjacentNodeIds?: CapacityMeshNodeId[]
  _parent?: CapacityMeshNode
}

export type CapacityMeshNodeParams = SerializableCapacityMeshNodeParams

/**
 * Accepted node input shape at API boundaries during class migration.
 */
export type CapacityMeshNodeInput =
  | CapacityMeshNode
  | SerializableCapacityMeshNodeParams

/**
 * A rectangular free-space region produced by rectdiff and consumed by later
 * routing stages.
 */
export class CapacityMeshNode {
  public capacityMeshNodeId: CapacityMeshNodeId
  public center: { x: number; y: number }
  public width: number
  public height: number
  public layer: string
  public availableZ: number[]
  public _depth?: number
  public _completelyInsideObstacle?: boolean
  public _containsObstacle?: boolean
  public _containsTarget?: boolean
  public _targetConnectionName?: string
  public _offBoardConnectionId?: string
  public _strawNode?: boolean
  public _strawParentCapacityMeshNodeId?: CapacityMeshNodeId
  public _adjacentNodeIds?: CapacityMeshNodeId[]
  public _parent?: CapacityMeshNode

  public constructor(params: SerializableCapacityMeshNodeParams) {
    this.capacityMeshNodeId = params.capacityMeshNodeId
    this.center = { ...params.center }
    this.width = params.width
    this.height = params.height
    this.layer = params.layer
    this.availableZ = [...params.availableZ]
    this._depth = params._depth
    this._completelyInsideObstacle = params._completelyInsideObstacle
    this._containsObstacle = params._containsObstacle
    this._containsTarget = params._containsTarget
    this._targetConnectionName = params._targetConnectionName
    this._offBoardConnectionId = params._offBoardConnectionId
    this._strawNode = params._strawNode
    this._strawParentCapacityMeshNodeId = params._strawParentCapacityMeshNodeId
    this._adjacentNodeIds = params._adjacentNodeIds
      ? [...params._adjacentNodeIds]
      : undefined
    this._parent = params._parent
  }

  /**
   * Returns a real class instance from either a serialized node shape or an
   * existing node instance.
   *
   * @param node - Raw or already-instantiated node.
   * @returns Capacity mesh node instance.
   */
  public static from(node: CapacityMeshNodeInput): CapacityMeshNode {
    return node instanceof CapacityMeshNode ? node : new CapacityMeshNode(node)
  }

  /**
   * Creates a copy of the node with optional field overrides.
   *
   * @param overrides - Replacement fields for the cloned node.
   * @returns New node instance.
   */
  public clone(
    overrides: Partial<SerializableCapacityMeshNodeParams> = {},
  ): CapacityMeshNode {
    return new CapacityMeshNode({
      ...this.toJSON(),
      ...overrides,
    })
  }

  /**
   * Returns the node's left x-coordinate.
   *
   * @returns Left boundary.
   */
  public getLeft(): number {
    return this.center.x - this.width / 2
  }

  /**
   * Returns the node's right x-coordinate.
   *
   * @returns Right boundary.
   */
  public getRight(): number {
    return this.center.x + this.width / 2
  }

  /**
   * Returns the node's top y-coordinate.
   *
   * @returns Top boundary.
   */
  public getTop(): number {
    return this.center.y - this.height / 2
  }

  /**
   * Returns the node's bottom y-coordinate.
   *
   * @returns Bottom boundary.
   */
  public getBottom(): number {
    return this.center.y + this.height / 2
  }

  /**
   * Returns true when two mesh nodes share a real border segment.
   *
   * @param otherNode - Neighbor candidate.
   * @returns Whether the rectangles are edge-adjacent.
   */
  public areNodesBordering(otherNode: CapacityMeshNode): boolean {
    const shareVerticalBorder =
      (Math.abs(this.getRight() - otherNode.getLeft()) < BORDER_EPSILON ||
        Math.abs(this.getLeft() - otherNode.getRight()) < BORDER_EPSILON) &&
      Math.min(this.getBottom(), otherNode.getBottom()) -
        Math.max(this.getTop(), otherNode.getTop()) >=
        BORDER_EPSILON

    const shareHorizontalBorder =
      (Math.abs(this.getBottom() - otherNode.getTop()) < BORDER_EPSILON ||
        Math.abs(this.getTop() - otherNode.getBottom()) < BORDER_EPSILON) &&
      Math.min(this.getRight(), otherNode.getRight()) -
        Math.max(this.getLeft(), otherNode.getLeft()) >=
        BORDER_EPSILON

    return shareVerticalBorder || shareHorizontalBorder
  }

  /**
   * Returns true when the nodes overlap or touch, including corner contact
   * within the provided epsilon.
   *
   * @param otherNode - Neighbor candidate.
   * @param epsilon - Contact tolerance.
   * @returns Whether the rectangles touch or overlap.
   */
  public touchesOrOverlaps(
    otherNode: CapacityMeshNode,
    epsilon = BORDER_EPSILON,
  ): boolean {
    return (
      this.getLeft() <= otherNode.getRight() + epsilon &&
      this.getRight() + epsilon >= otherNode.getLeft() &&
      this.getTop() <= otherNode.getBottom() + epsilon &&
      this.getBottom() + epsilon >= otherNode.getTop()
    )
  }

  /**
   * Returns true when the nodes share at least one available z-layer.
   *
   * @param otherNode - Neighbor candidate.
   * @returns Whether the nodes can connect on some layer.
   */
  public hasSharedLayer(otherNode: CapacityMeshNode): boolean {
    return this.availableZ.some((z) => otherNode.availableZ.includes(z))
  }

  /**
   * Returns the Euclidean distance between node centers.
   *
   * @param otherNode - Node to compare against.
   * @returns Center-to-center distance.
   */
  public distanceTo(otherNode: CapacityMeshNode): number {
    return Math.hypot(
      this.center.x - otherNode.center.x,
      this.center.y - otherNode.center.y,
    )
  }

  /**
   * Converts the node back into a plain serializable object.
   *
   * @returns JSON-safe node params.
   */
  public toJSON(): SerializableCapacityMeshNodeParams {
    return {
      capacityMeshNodeId: this.capacityMeshNodeId,
      center: { ...this.center },
      width: this.width,
      height: this.height,
      layer: this.layer,
      availableZ: [...this.availableZ],
      _depth: this._depth,
      _completelyInsideObstacle: this._completelyInsideObstacle,
      _containsObstacle: this._containsObstacle,
      _containsTarget: this._containsTarget,
      _targetConnectionName: this._targetConnectionName,
      _offBoardConnectionId: this._offBoardConnectionId,
      _strawNode: this._strawNode,
      _strawParentCapacityMeshNodeId: this._strawParentCapacityMeshNodeId,
      _adjacentNodeIds: this._adjacentNodeIds
        ? [...this._adjacentNodeIds]
        : undefined,
      _parent: this._parent,
    }
  }
}
