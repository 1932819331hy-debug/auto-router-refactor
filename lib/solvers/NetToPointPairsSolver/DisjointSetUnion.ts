/**
 * A Disjoint Set Union structure used by the point-pair solver helpers.
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

  public getGroup(id: string): string[] {
    const rootId = this.find(id)
    const group: string[] = []

    for (const memberId of this.parent.keys()) {
      if (this.find(memberId) === rootId) {
        group.push(memberId)
      }
    }

    return group
  }
}
