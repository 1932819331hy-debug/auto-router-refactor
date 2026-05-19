import type { SimpleRouteJson } from "../../types/index.ts"
import { RouteInput } from "./RouteInput.ts"

/**
 * Construction boundary for future RouteInput assembly logic.
 */
export class RouteInputBuilder {
  /**
   * Wraps serialized route input without mutation.
   *
   * @param json - Serialized route document.
   * @returns A RouteInput wrapper around the provided JSON.
   */
  public fromJson(json: SimpleRouteJson): RouteInput {
    return RouteInput.fromJson(json)
  }
}
