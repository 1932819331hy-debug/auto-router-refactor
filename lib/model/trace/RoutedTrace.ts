import type { SimplifiedPcbTrace, TraceId } from "../../types/index.ts"
import { RoutedTraceStep } from "./RoutedTraceStep.ts"

/**
 * Skeleton domain wrapper for a serialized routed trace.
 */
export class RoutedTrace {
  public constructor(private readonly trace: SimplifiedPcbTrace) {}

  /**
   * Creates a wrapper around serialized trace data.
   *
   * @param trace - Serialized trace.
   * @returns A wrapper with unchanged trace data.
   */
  public static fromJson(trace: SimplifiedPcbTrace): RoutedTrace {
    return new RoutedTrace(trace)
  }

  /**
   * Returns the original serialized trace.
   *
   * @returns The unchanged trace payload.
   */
  public toJson(): SimplifiedPcbTrace {
    return structuredClone(this.trace)
  }

  /**
   * Returns the routed trace identifier.
   */
  public get id(): TraceId {
    return this.trace.pcb_trace_id
  }

  /**
   * Returns the owning logical connection name.
   */
  public get connectionName(): string {
    return this.trace.connection_name
  }

  /**
   * Returns wrapped route steps in stored order.
   *
   * @returns Read-only routed trace steps.
   */
  public get steps(): ReadonlyArray<RoutedTraceStep> {
    return this.trace.route.map((step) => RoutedTraceStep.fromJson(step))
  }

  /**
   * Returns the serialized wire and transition steps.
   *
   * @returns Cloned route-step payloads.
   */
  public getRoute(): SimplifiedPcbTrace["route"] {
    return structuredClone(this.trace.route)
  }
}
