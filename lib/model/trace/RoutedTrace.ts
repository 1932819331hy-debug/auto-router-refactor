import type { SimplifiedPcbTrace } from "../../types/index.ts"

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
    return this.trace
  }
}
