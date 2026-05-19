/**
 * Owner for serialized layer-name and z-index mapping behavior.
 */
export class LayerMapper {
  public constructor(public readonly layerCount: number) {}

  /**
   * Converts a serialized layer name into its z-index.
   *
   * This preserves the older autorouter behavior where `top` is always `0`,
   * `bottom` is always `layerCount - 1`, and `innerN` maps to `N`.
   *
   * @param layerName - Serialized layer name.
   * @returns Z-index used by solver internals.
   */
  public toZ(layerName: string): number {
    if (layerName === "top") return 0
    if (layerName === "bottom") return this.layerCount - 1
    if (!/^inner\d+$/.test(layerName)) {
      throw new Error(`Invalid layer name "${layerName}"`)
    }

    return Number.parseInt(layerName.slice(5), 10)
  }

  /**
   * Converts a z-index into its serialized layer name.
   *
   * @param z - Z-index used by solver internals.
   * @returns Serialized layer name.
   */
  public fromZ(z: number): string {
    if (z === 1 && this.layerCount === 1) return "inner1"
    if (z < 0 || z >= this.layerCount) {
      throw new Error(`Invalid z "${z}" for layer count: ${this.layerCount}`)
    }
    if (z === 0) return "top"
    if (z === this.layerCount - 1) return "bottom"

    return `inner${z}`
  }
}
