/**
 * Simple disjoint set used to merge connections that already share points.
 */
export class DisjointSetUnion {
  private readonly parent = new Map<string, string>()

  public constructor(ids: ReadonlyArray<string>) {
    for (const id of ids) {
      this.parent.set(id, id)
    }
  }

  public find(id: string): string {
    const parentId = this.parent.get(id)
    if (!parentId) {
      throw new Error(`Unknown disjoint-set member "${id}"`)
    }
    if (parentId === id) {
      return id
    }

    const rootId = this.find(parentId)
    this.parent.set(id, rootId)
    return rootId
  }

  public union(leftId: string, rightId: string): boolean {
    const leftRootId = this.find(leftId)
    const rightRootId = this.find(rightId)
    if (leftRootId === rightRootId) {
      return false
    }

    this.parent.set(rightRootId, leftRootId)
    return true
  }
}
