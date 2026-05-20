/**
 * Tracks equivalence classes for off-board connection points.
 */
export class ConnectionPointDisjointSetUnion {
  private readonly parent = new Map<string, string>()

  public constructor(ids: ReadonlyArray<string>) {
    for (const id of ids) {
      this.parent.set(id, id)
    }
  }

  public find(id: string): string {
    const parentId = this.parent.get(id)
    if (!parentId) {
      throw new Error(`Unknown off-board point "${id}"`)
    }
    if (parentId === id) {
      return id
    }

    const rootId = this.find(parentId)
    this.parent.set(id, rootId)
    return rootId
  }

  public union(leftId: string, rightId: string): void {
    const leftRootId = this.find(leftId)
    const rightRootId = this.find(rightId)
    if (leftRootId !== rightRootId) {
      this.parent.set(rightRootId, leftRootId)
    }
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
