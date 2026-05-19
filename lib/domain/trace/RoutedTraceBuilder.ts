import type { SimplifiedPcbTrace } from "../../types/index.ts"
import { RoutedTrace } from "./RoutedTrace.ts"

/**
 * Construction boundary for future RoutedTrace assembly logic.
 */
export class RoutedTraceBuilder {
  /**
   * Wraps serialized trace input without mutation.
   *
   * @param trace - Serialized trace payload.
   * @returns A RoutedTrace wrapper around the provided data.
   */
  public fromJson(trace: SimplifiedPcbTrace): RoutedTrace {
    return RoutedTrace.fromJson(trace)
  }
}
