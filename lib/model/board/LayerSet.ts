/**
 * Immutable wrapper around a board layer-name collection.
 */
export class LayerSet {
  public constructor(public readonly layers: ReadonlyArray<string>) {}
}
