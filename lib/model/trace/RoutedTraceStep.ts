import type {
  SimplifiedPcbJumperRouteStep,
  SimplifiedPcbRouteStep,
  SimplifiedPcbThroughObstacleRouteStep,
  SimplifiedPcbViaRouteStep,
  SimplifiedPcbWireRouteStep,
} from "../../types/index.ts"

/**
 * Domain wrapper for a serialized routed-trace step.
 */
export class RoutedTraceStep {
  public constructor(private readonly step: SimplifiedPcbRouteStep) {}

  /**
   * Creates a wrapper around serialized route-step data.
   *
   * @param step - Serialized route step.
   * @returns Wrapped route-step instance.
   */
  public static fromJson(step: SimplifiedPcbRouteStep): RoutedTraceStep {
    return new RoutedTraceStep(step)
  }

  /**
   * Returns the serialized route-step payload.
   *
   * @returns Cloned route-step transport object.
   */
  public toJson(): SimplifiedPcbRouteStep {
    return structuredClone(this.step)
  }

  /**
   * Returns the serialized route-step discriminator.
   */
  public get routeType(): SimplifiedPcbRouteStep["route_type"] {
    return this.step.route_type
  }

  /**
   * Checks whether this step is a straight wire step.
   *
   * @returns True when the step is a wire.
   */
  public isWire(): boolean {
    return this.step.route_type === "wire"
  }

  /**
   * Checks whether this step is a via step.
   *
   * @returns True when the step is a via.
   */
  public isVia(): boolean {
    return this.step.route_type === "via"
  }

  /**
   * Checks whether this step is a jumper step.
   *
   * @returns True when the step is a jumper.
   */
  public isJumper(): boolean {
    return this.step.route_type === "jumper"
  }

  /**
   * Checks whether this step crosses through an obstacle span.
   *
   * @returns True when the step is a through-obstacle segment.
   */
  public isThroughObstacle(): boolean {
    return this.step.route_type === "through_obstacle"
  }

  /**
   * Returns this step as a wire step when applicable.
   *
   * @returns Serialized wire step.
   */
  public asWire(): SimplifiedPcbWireRouteStep | undefined {
    return this.step.route_type === "wire" ? this.step : undefined
  }

  /**
   * Returns this step as a via step when applicable.
   *
   * @returns Serialized via step.
   */
  public asVia(): SimplifiedPcbViaRouteStep | undefined {
    return this.step.route_type === "via" ? this.step : undefined
  }

  /**
   * Returns this step as a jumper step when applicable.
   *
   * @returns Serialized jumper step.
   */
  public asJumper(): SimplifiedPcbJumperRouteStep | undefined {
    return this.step.route_type === "jumper" ? this.step : undefined
  }

  /**
   * Returns this step as a through-obstacle step when applicable.
   *
   * @returns Serialized through-obstacle step.
   */
  public asThroughObstacle():
    | SimplifiedPcbThroughObstacleRouteStep
    | undefined {
    return this.step.route_type === "through_obstacle" ? this.step : undefined
  }
}
