/**
 * Shape accepted anywhere an RGBA color is needed.
 */
export interface RgbaColorLike {
  r: number
  g: number
  b: number
  a: number
}

/**
 * Immutable RGBA color with light blending helpers for debug rendering.
 */
export class RgbaColor implements RgbaColorLike {
  public constructor(
    public readonly r: number,
    public readonly g: number,
    public readonly b: number,
    public readonly a: number,
  ) {}

  /**
   * Copies any RGBA-like payload into a color instance.
   *
   * @param color - Source color.
   * @returns Immutable color instance.
   */
  public static from(color: RgbaColorLike): RgbaColor {
    return new RgbaColor(color.r, color.g, color.b, color.a)
  }

  /**
   * Clamps a numeric value to the closed unit interval.
   *
   * @param value - Value to clamp.
   * @returns Clamped value.
   */
  public static clampUnit(value: number): number {
    return Math.min(1, Math.max(0, value))
  }

  /**
   * Blends this color toward another color.
   *
   * @param overlay - Target color.
   * @param amount - Blend amount in the range `[0, 1]`.
   * @returns Mixed color.
   */
  public mix(overlay: RgbaColorLike, amount: number): RgbaColor {
    return new RgbaColor(
      this.mixChannel(this.r, overlay.r, amount),
      this.mixChannel(this.g, overlay.g, amount),
      this.mixChannel(this.b, overlay.b, amount),
      Number((this.a + (overlay.a - this.a) * amount).toFixed(3)),
    )
  }

  /**
   * Serializes the color into a CSS `rgba(...)` string.
   *
   * @returns CSS color string.
   */
  public toCssString(): string {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`
  }

  /**
   * Blends one integer channel toward another channel.
   *
   * @param from - Start channel value.
   * @param to - End channel value.
   * @param amount - Blend amount in the range `[0, 1]`.
   * @returns Rounded blended channel value.
   */
  private mixChannel(from: number, to: number, amount: number): number {
    return Math.round(from + (to - from) * amount)
  }
}
